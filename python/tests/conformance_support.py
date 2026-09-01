from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import signal
import stat
from pathlib import Path
from collections.abc import Mapping
from typing import IO, Any, cast

from scrollcase_consumer import (
    BoxRunResult,
    attach_extracted_box,
    parse_trusted_keys,
    run_box,
    run_extracted_box,
    verify_and_extract_box,
    verify_extracted_payload,
)
from scrollcase_consumer._contract import (
    PAYLOAD_DIGEST_FILE,
    PAYLOAD_DIGEST_FORMAT,
    PayloadDigestEntry,
    payload_digest_stream,
)

from .support import ArchiveEntry, ConsumerFixture, create_fixture, native_target

ASSET_BYTES = b"trusted on-demand bytes"
TARGETS: dict[str, dict[str, str]] = {
    "macos-aarch64-cpu": {
        "platform": "macos",
        "arch": "aarch64",
        "accelerator": "cpu",
    },
    "linux-x86_64-cpu": {
        "platform": "linux",
        "arch": "x86_64",
        "accelerator": "cpu",
    },
    "windows-x86_64-cpu": {
        "platform": "windows",
        "arch": "x86_64",
        "accelerator": "cpu",
    },
}

POST_EXTRACTION_MUTATIONS = {
    "attach-missing-root",
    "attach-file-root",
    "attach-symlink-root",
    "add-root-files",
    "chmod-script",
    "touch-script",
    "tamper-script",
    "remove-interpreter",
    "remove-script",
    "retarget-interpreter-link",
    "remove-payload-digest-list",
    "tamper-payload-digest-list",
}


class FakeProcess:
    def __init__(
        self,
        return_code: int,
        signal_to_raise: signal.Signals | None,
    ) -> None:
        self.returncode = return_code
        self.signal_to_raise = signal_to_raise
        self.forwarded_signal: str | None = None

    def wait(self) -> int:
        if self.signal_to_raise is not None:
            handler = signal.getsignal(self.signal_to_raise)
            if callable(handler):
                handler(self.signal_to_raise, None)
            self.returncode = -int(self.signal_to_raise)
        return self.returncode

    def send_signal(self, signal_number: int) -> None:
        self.forwarded_signal = signal.Signals(signal_number).name


class FakePopen:
    def __init__(self, runtime: dict[str, Any]) -> None:
        self.runtime = runtime
        self.calls: list[tuple[list[str], dict[str, Any]]] = []
        self.children: list[FakeProcess] = []

    def __call__(self, argv: list[str], **options: Any) -> FakeProcess:
        if self.runtime.get("spawnError"):
            raise OSError("fixture spawn failed")
        signal_name = self.runtime.get("signal")
        child = FakeProcess(
            int(self.runtime.get("exitCode", 0)),
            signal.Signals[signal_name] if isinstance(signal_name, str) else None,
        )
        self.calls.append((argv, options))
        self.children.append(child)
        return child


def load_consumer_conformance_suite() -> dict[str, Any]:
    path = (
        Path(__file__).resolve().parents[2]
        / "src"
        / "contract"
        / "fixtures"
        / "consumer-conformance.json"
    )
    return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))


def _fixture_options(spec: dict[str, Any]) -> dict[str, Any]:
    target_name = spec.get("target")
    if target_name == "foreign":
        native = native_target()
        native_id = "-".join(
            (native["platform"], native["arch"], native["accelerator"])
        )
        target = next(target for name, target in TARGETS.items() if name != native_id)
    elif isinstance(target_name, str):
        target = TARGETS[target_name]
    else:
        target = native_target()
    options: dict[str, Any] = {
        "target": target,
        "payload_digest": spec.get("payloadDigest", True),
    }
    if spec.get("execution") == "module":
        options["execution"] = {
            "kind": "python-module",
            "module": "example.application",
            "defaultArgs": ["--default"],
        }
    if spec.get("requiredAsset"):
        options["required_asset"] = {
            "url": "https://assets.example.org/data.bin",
            "relativePath": "cache/consumer-fixture/data.bin",
            "sizeBytes": len(ASSET_BYTES),
            "sha256": hashlib.sha256(ASSET_BYTES).hexdigest(),
        }
    if spec.get("executableAsset"):
        # The mode is synthesised from the scroll's declaration, and extraction has to hand it back
        # whatever umask the process is running under.
        options["extra_files"] = {"bin/tool": (b"#!/bin/sh\nexit 0\n", 0o755)}
    if "environment" in spec:
        options["environment"] = spec["environment"]
    if "labels" in spec:
        options["labels"] = spec["labels"]
    # A consumer cannot observe key custody. The external-signer case therefore uses the same
    # signed-envelope wire contract with an independently generated caller trust anchor.
    return options


def _refresh_payload_digest(
    fixture: ConsumerFixture,
    entries: list[ArchiveEntry],
) -> list[ArchiveEntry]:
    payload_entries = [
        entry for entry in entries if entry.path != PAYLOAD_DIGEST_FILE
    ]
    stream = payload_digest_stream(
        PayloadDigestEntry(
            path=entry.path,
            kind="link" if entry.file_type == stat.S_IFLNK else "file",
            content_sha256=hashlib.sha256(entry.data).hexdigest(),
        )
        for entry in payload_entries
    )
    fixture.release["payloadDigest"] = {
        "format": PAYLOAD_DIGEST_FORMAT,
        "sha256": hashlib.sha256(stream).hexdigest(),
    }
    return [*payload_entries, ArchiveEntry(PAYLOAD_DIGEST_FILE, stream)]


def _mutate_fixture(
    fixture: ConsumerFixture,
    mutation: str | None,
    destination: Path,
) -> None:
    if mutation is None:
        return
    if mutation in ("alter-signature", "alter-payload"):
        signed = json.loads(fixture.release_path.read_text(encoding="utf-8"))
        if mutation == "alter-signature":
            signed["signatures"][0]["signatureBase64"] = "AA=="
        else:
            import base64

            signed["payloadBase64"] = base64.b64encode(b"altered payload").decode()
        fixture.release_path.write_text(
            json.dumps(signed, indent=2) + "\n",
            encoding="utf-8",
        )
        return
    if mutation == "downgrade-envelope-version":
        # The envelope's own version is outside the signed payload, so this is what a genuine v1
        # document looks like to a v2 consumer: refusable by name before any signature is checked.
        signed = json.loads(fixture.release_path.read_text(encoding="utf-8"))
        signed["schemaVersion"] = 1
        fixture.release_path.write_text(
            json.dumps(signed, indent=2) + "\n",
            encoding="utf-8",
        )
        return
    if mutation == "alter-archive-bytes":
        data = bytearray(fixture.archive_path.read_bytes())
        data[-1] ^= 0x01
        fixture.archive_path.write_bytes(data)
        return
    if mutation == "alter-archive-size":
        fixture.release["archive"]["sizeBytes"] += 1
        fixture.sign()
        return
    if mutation == "alter-release-labels":
        fixture.release["labels"] = {"model": "altered-model"}
        fixture.sign()
        return
    if mutation == "alter-release-runtime-version":
        fixture.release["runtime"] = {**fixture.release["runtime"], "version": "3.99.0"}
        fixture.sign()
        return
    if mutation == "alter-release-runtime-id":
        # A Python box relabelled as native after it was built. Everything about the payload
        # still says Python, so the consumer must refuse it rather than read the declaration as
        # the truth about a box that disagrees with it.
        fixture.release["runtime"] = {**fixture.release["runtime"], "id": "native"}
        fixture.sign()
        return
    if mutation == "alter-release-execution":
        fixture.release["execution"] = {
            **fixture.release["execution"],
            "defaultArgs": ["--altered"],
        }
        fixture.sign()
        return
    if mutation == "alter-release-environment":
        fixture.release["environment"] = {"SCROLLCASE_CHANGED_AFTER_BUILD": "1"}
        fixture.sign()
        return
    if mutation == "strip-release-archive-url":
        # A box built without a publish base URL: it was never published, so its release names no
        # address for the archive. Every consumer must prepare it exactly as it prepares any other, because
        # the URL was never part of the trust chain — the archive is found beside the release document and
        # identified by its sha256.
        archive = dict(fixture.release["archive"])
        archive.pop("url", None)
        fixture.release["archive"] = archive
        fixture.sign()
        return
    if mutation == "alter-release-bundled-licenses":
        # A licence inventory added to the signed release after the box was built. It is signed, so
        # the signature still verifies; what refuses it is that box.json says something else, which
        # is the whole reason the inventory is compared field by field rather than merely carried.
        fixture.release["bundledLicenses"] = [{"name": "zlib", "version": "1.3.1", "declaredLicense": "Zlib", "linkedInto": ["box.json"]}]
        fixture.sign()
        return
    if mutation == "add-unknown-compatibility-constraint":
        # Not a tamper: a signed constraint in a publishing project's own vocabulary, which the
        # schema allows and the builder copies through. The consumer must carry it, not refuse the
        # document — refusing it takes the decision away from the application that has to make it.
        fixture.release["compatibility"] = {
            **fixture.release.get("compatibility", {}),
            "org.example.minVramGb": 24,
        }
        fixture.sign()
        return
    if mutation == "create-destination":
        destination.mkdir()
        return
    remove_path = {
        "remove-interpreter": fixture.release["runtime"]["entryPoint"],
        "remove-script": fixture.release.get("execution", {}).get("script"),
        "remove-module": (
            fixture.release.get("execution", {}).get("module", "").replace(".", "/")
            + ".py"
        ),
    }.get(mutation)
    if remove_path:
        fixture.write_archive(
            [entry for entry in fixture.entries if entry.path != remove_path]
        )
        return
    # The other side of the link rule. A real box reaches its interpreter through exactly this
    # shape — `venv/bin/python` is a link to the versioned binary beside it — so a consumer that
    # only accepts regular files here rejects every box the builder produces on macOS and Linux.
    if mutation == "link-interpreter":
        entry_point = cast(str, fixture.release["runtime"]["entryPoint"])
        directory, _, name = entry_point.rpartition("/")
        link_target = f"{name}-real"
        renamed = f"{directory}/{link_target}" if directory else link_target
        entries = [
            ArchiveEntry(renamed, entry.data, entry.mode, entry.file_type)
            if entry.path == entry_point
            else entry
            for entry in fixture.entries
        ]
        entries.append(
            ArchiveEntry(
                entry_point,
                link_target.encode(),
                file_type=stat.S_IFLNK,
            )
        )
        entries = _refresh_payload_digest(fixture, entries)
        # A link is sized by its target string once extracted, which is exactly the entry's own
        # bytes here. Stated rather than copied from the result, so the signed size is still earned.
        fixture.release["installedSizeBytes"] = sum(
            len(entry.data) for entry in entries
        )
        fixture.entries = entries
        fixture.write_archive(entries)
        return
    hostile: dict[str, ArchiveEntry] = {
        "add-traversal-entry": ArchiveEntry("../x", b"hostile"),
        "add-absolute-entry": ArchiveEntry("/abs", b"hostile"),
        # A link whose target climbs out of the payload: the escape the rule exists to stop.
        "add-link-entry": ArchiveEntry(
            "link",
            b"../../../../etc/passwd",
            file_type=stat.S_IFLNK,
        ),
        "add-special-entry": ArchiveEntry(
            "fifo",
            b"",
            file_type=stat.S_IFIFO,
        ),
        "duplicate-entry": ArchiveEntry("box.json", b"{}"),
        "file-directory-collision": ArchiveEntry("venv", b"collision"),
    }
    if mutation in hostile:
        fixture.write_archive([*fixture.entries, hostile[mutation]])
        return
    if mutation == "encrypt-entry":
        fixture.write_archive(encrypted=True)
        return
    raise AssertionError(f"Unknown conformance mutation: {mutation}")


def _mutate_extracted_root(
    fixture: ConsumerFixture,
    mutation: str | None,
    root: Path,
) -> Path:
    if mutation is None:
        return root
    if mutation == "attach-missing-root":
        return fixture.root / "missing-root"
    if mutation == "attach-file-root":
        return fixture.archive_path
    if mutation == "attach-symlink-root":
        linked_root = fixture.root / "linked-root"
        linked_root.symlink_to(root, target_is_directory=True)
        return linked_root
    if mutation == "add-root-files":
        (root / "output.log").write_bytes(b"application output")
        (root / "__pycache__").mkdir()
        (root / "__pycache__" / "cached.pyc").write_bytes(b"compiled")
        return root
    script = root / "app" / "main.py"
    if mutation == "chmod-script":
        script.chmod(0o600)
        return root
    if mutation == "touch-script":
        os.utime(script, (0, 0))
        return root
    if mutation == "tamper-script":
        script.write_bytes(script.read_bytes() + b" ")
        return root
    if mutation == "remove-interpreter":
        (root / fixture.release["runtime"]["entryPoint"]).unlink()
        return root
    if mutation == "remove-script":
        (root / fixture.release["execution"]["script"]).unlink()
        return root
    if mutation == "retarget-interpreter-link":
        interpreter = root / fixture.release["runtime"]["entryPoint"]
        target = os.readlink(interpreter)
        interpreter.unlink()
        interpreter.symlink_to(f"{target}-retargeted")
        return root
    list_path = root / PAYLOAD_DIGEST_FILE
    if mutation == "remove-payload-digest-list":
        list_path.unlink()
        return root
    if mutation == "tamper-payload-digest-list":
        data = bytearray(list_path.read_bytes())
        data[-2] ^= 0x01
        list_path.write_bytes(data)
        return root
    raise AssertionError(f"Unknown extracted-root mutation: {mutation}")


def _replace_tokens(value: Any, root: str | None = None) -> Any:
    if isinstance(value, str):
        target = native_target()
        native_python = (
            "venv/python.exe"
            if target["platform"] == "windows"
            else "venv/bin/python"
        )
        native_id = "-".join(
            (target["platform"], target["arch"], target["accelerator"])
        )
        return (
            value.replace("$NATIVE_ENTRY_POINT", native_python)
            .replace("$NATIVE_TARGET", native_id)
            .replace("$BOX", root or "$BOX")
        )
    if isinstance(value, list):
        return [_replace_tokens(item, root) for item in value]
    if isinstance(value, dict):
        return {key: _replace_tokens(item, root) for key, item in value.items()}
    return value


def _classify_error(message: str, patterns: dict[str, str]) -> str:
    import re

    for code, pattern in patterns.items():
        if re.search(pattern, message, re.IGNORECASE):
            return code
    return f"unclassified: {message}"


def _normalize_path(root: Path, value: str) -> str:
    path = Path(value)
    if not path.is_absolute() or not path.is_relative_to(root):
        return value
    relative = path.relative_to(root).as_posix()
    return f"$BOX/{relative}" if relative not in ("", ".") else "$BOX"


def _materialize_asset(prepared: Any, state: str | None) -> None:
    if state in (None, "missing"):
        return
    asset = prepared.required_assets[0]
    path = Path(prepared.root) / asset.relative_path
    path.parent.mkdir(parents=True)
    if state == "wrong-size":
        path.write_bytes(ASSET_BYTES[1:])
    elif state == "wrong-hash":
        path.write_bytes(b"x" * len(ASSET_BYTES))
    else:
        path.write_bytes(ASSET_BYTES)


def _environment_report(report: Any, names: list[str]) -> dict[str, Any]:
    selected = set(names)
    return {
        "mode": report.mode,
        "hostValuesRevealed": report.host_values_revealed,
        "releaseVariableCount": report.release_variable_count,
        "conflictCount": report.conflict_count,
        "variables": [
            {
                "name": variable.name,
                "source": variable.source,
                "value": variable.value,
                "executionAffecting": variable.execution_affecting,
                "conflict": variable.conflict,
                "sources": [
                    {
                        "source": source.source,
                        "name": source.name,
                        "value": source.value,
                    }
                    for source in variable.sources
                ],
            }
            for variable in report.variables
            if variable.name in selected
        ],
    }


def _trust_options(
    fixture: ConsumerFixture,
    spec: dict[str, str],
) -> dict[str, Any]:
    source = spec.get("source", "file")
    shape = spec.get("shape", "single")
    key = json.loads(fixture.public_key_path.read_text(encoding="utf-8"))
    if shape == "missing-file":
        if source != "file":
            raise AssertionError("A missing trust file is only a file-source case.")
        fixture.public_key_path.unlink()
        return {"public_key_path": fixture.public_key_path}
    if shape == "single":
        raw = json.dumps(key)
    elif shape == "bundle":
        raw = json.dumps({"keys": [key]})
    elif shape == "empty-bundle":
        raw = json.dumps({"keys": []})
    elif shape == "non-array-bundle":
        raw = json.dumps({"keys": key})
    elif shape == "invalid-bundle-entry":
        raw = json.dumps({"keys": [None]})
    elif shape == "malformed-json":
        raw = "{"
    elif shape == "malformed-pem":
        raw = json.dumps({**key, "publicKeyPem": "not a PEM key"})
    else:
        raise AssertionError(f"Unknown conformance trust shape: {shape}")

    if source == "file":
        fixture.public_key_path.write_text(raw, encoding="utf-8")
        return {"public_key_path": fixture.public_key_path}
    if source == "memory":
        return {"trusted_keys": parse_trusted_keys(raw)}
    raise AssertionError(f"Unknown conformance trust source: {source}")


def run_python_conformance_case(
    test_case: dict[str, Any],
    suite: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], Path]:
    fixture = create_fixture(**_fixture_options(test_case.get("fixture", {})))
    destination = fixture.root / "prepared"
    temporary_directory = fixture.root / "temporary"
    expected = _replace_tokens(test_case["expected"])
    fake: FakePopen | None = None
    prepared: Any = None
    streams: dict[str, IO[Any]] | None = None
    actual: dict[str, Any]
    runtime = test_case.get("runtime", {})
    previous_host_environment = {
        name: os.environ.get(name)
        for name in runtime.get("hostEnvironment", {})
    }
    os.environ.update(runtime.get("hostEnvironment", {}))
    # A restrictive umask is the condition under which the three consumers used to disagree: two
    # applied the archive's mode through open(2) and lost it, one chmod'd and kept it.
    previous_umask = (
        os.umask(int(runtime["umask"], 8)) if "umask" in runtime else None
    )
    try:
        action = test_case["action"]
        mutation = test_case.get("mutation")
        if test_case.get("fixture", {}).get("linkedInterpreter"):
            _mutate_fixture(fixture, "link-interpreter", destination)
        post_extraction_mutation = (
            action in ("attach", "verify-payload")
            and mutation in POST_EXTRACTION_MUTATIONS
        )
        if not post_extraction_mutation:
            _mutate_fixture(fixture, mutation, destination)
        trust = _trust_options(fixture, test_case.get("trust", {}))
        if test_case["action"] == "prepare":
            prepared = verify_and_extract_box(
                fixture.release_path,
                **trust,
                archive=fixture.archive_path,
                destination=destination,
                env_report=bool(runtime.get("envReport")),
                env_report_values=bool(runtime.get("envReportValues")),
            )
            execution = prepared.execution
            receipt = {
                "status": prepared.status,
                "boxId": prepared.box_id,
                "executionKind": execution.kind if execution is not None else None,
                "requiredAssetCount": len(prepared.required_assets),
                "runtimeId": prepared.runtime.id,
                "entryPoint": prepared.runtime.entry_point or "",
                "targetId": prepared.target_id,
            }
            if test_case["expected"].get("receipt", {}).get("environmentReport"):
                receipt["environmentReport"] = _environment_report(
                    prepared.environment_report,
                    runtime.get("reportVariables", []),
                )
            declared_modes = test_case["expected"].get("receipt", {}).get(
                "executableModes"
            )
            if declared_modes:
                receipt["executableModes"] = _executable_modes(
                    Path(prepared.root), declared_modes
                )
            actual = {
                "outcome": "prepared",
                "receipt": receipt,
            }
            return actual, expected, fixture.root

        if action in ("attach", "verify-payload"):
            prepared = verify_and_extract_box(
                fixture.release_path,
                **trust,
                archive=fixture.archive_path,
                destination=destination,
                env_report=bool(runtime.get("envReport")),
                env_report_values=bool(runtime.get("envReportValues")),
            )
            _materialize_asset(prepared, runtime.get("assetState"))
            root = _mutate_extracted_root(
                fixture,
                mutation if post_extraction_mutation else None,
                Path(prepared.root),
            )
            if action == "attach":
                attached = attach_extracted_box(
                    fixture.release_path,
                    **trust,
                    root=root,
                    env_report=bool(runtime.get("envReport")),
                    env_report_values=bool(runtime.get("envReportValues")),
                )
                execution = attached.execution
                receipt = {
                    "status": attached.status,
                    "boxId": attached.box_id,
                    "executionKind": (
                        execution.kind if execution is not None else None
                    ),
                    "requiredAssetCount": len(attached.required_assets),
                    "runtimeId": attached.runtime.id,
                    "entryPoint": attached.runtime.entry_point or "",
                    "targetId": attached.target_id,
                }
                if test_case["expected"].get("receipt", {}).get("environmentReport"):
                    receipt["environmentReport"] = _environment_report(
                        attached.environment_report,
                        runtime.get("reportVariables", []),
                    )
                actual = {
                    "outcome": "attached",
                    "receipt": receipt,
                }
                return actual, expected, fixture.root
            verified = verify_extracted_payload(
                fixture.release_path,
                **trust,
                root=root,
                env_report=bool(runtime.get("envReport")),
                env_report_values=bool(runtime.get("envReportValues")),
            )
            verification_result = {
                "status": verified.status,
                "boxId": verified.box_id,
                "targetId": verified.target_id,
                "entryCount": verified.entry_count,
            }
            if test_case["expected"].get("result", {}).get("environmentReport"):
                verification_result["environmentReport"] = _environment_report(
                    verified.environment_report,
                    runtime.get("reportVariables", []),
                )
            actual = {
                "outcome": "verified",
                "result": verification_result,
            }
            return actual, expected, fixture.root

        fake = FakePopen(runtime)
        if runtime.get("streams"):
            streams = {
                "stdin": io.BytesIO(),
                "stdout": io.BytesIO(),
                "stderr": io.BytesIO(),
            }
        stdin = streams["stdin"] if streams is not None else None
        stdout = streams["stdout"] if streams is not None else None
        stderr = streams["stderr"] if streams is not None else None
        if action == "run-prepared":
            prepared = verify_and_extract_box(
                fixture.release_path,
                **trust,
                archive=fixture.archive_path,
                destination=destination,
            )
            _materialize_asset(prepared, runtime.get("assetState"))
            if runtime.get("attach"):
                prepared = attach_extracted_box(
                    fixture.release_path,
                    **trust,
                    root=prepared.root,
                )
            result = run_extracted_box(
                prepared,
                args=runtime.get("args", ()),
                env=runtime.get("env"),
                env_report=bool(runtime.get("envReport")),
                env_report_values=bool(runtime.get("envReportValues")),
                stdin=stdin,
                stdout=stdout,
                stderr=stderr,
                popen_factory=cast(Any, fake),
            )
        elif action == "run-box":
            temporary_directory.mkdir()
            result = run_box(
                fixture.release_path,
                **trust,
                archive=fixture.archive_path,
                temporary_directory=temporary_directory,
                args=runtime.get("args", ()),
                env=runtime.get("env"),
                env_report=bool(runtime.get("envReport")),
                env_report_values=bool(runtime.get("envReportValues")),
                stdin=stdin,
                stdout=stdout,
                stderr=stderr,
                popen_factory=cast(Any, fake),
            )
        else:
            raise AssertionError(f"Unknown conformance action: {action}")
        actual = {
            "outcome": "completed",
            "result": {
                "exitCode": result.exit_code,
                "signal": result.signal,
            },
        }
        if expected.get("result", {}).get("environmentReport"):
            actual["result"]["environmentReport"] = _environment_report(
                result.environment_report,
                runtime.get("reportVariables", []),
            )
        if "effectiveEnvironment" in expected:
            actual["effectiveEnvironment"] = {
                name: fake.calls[0][1]["env"].get(name)
                for name in expected["effectiveEnvironment"]
            }
        if "persistentRootExists" in expected:
            actual["persistentRootExists"] = Path(prepared.root).exists()
        if "spawned" in expected:
            actual["spawned"] = bool(fake.calls)
        if "temporaryDirectoryEmpty" in expected:
            actual["temporaryDirectoryEmpty"] = not any(
                temporary_directory.iterdir()
            )
        if "forwardedSignal" in expected:
            actual["forwardedSignal"] = fake.children[0].forwarded_signal
        if "streamsPreserved" in expected:
            options = fake.calls[0][1]
            assert streams is not None
            actual["streamsPreserved"] = all(
                options[name] is streams[name]
                for name in ("stdin", "stdout", "stderr")
            )
        if "argv" in expected:
            argv, options = fake.calls[0]
            root = Path(prepared.root)
            actual["argv"] = [_normalize_path(root, value) for value in argv]
            actual["cwd"] = _normalize_path(root, options["cwd"])
            actual["shell"] = options["shell"]
        return actual, expected, fixture.root
    except Exception as error:
        message = str(error)
        actual = {
            "outcome": "rejected",
            "error": _classify_error(message, suite["errorPatterns"]),
        }
        if "message" in expected:
            actual["message"] = message
        if "destinationExists" in expected:
            actual["destinationExists"] = destination.exists()
        if "spawned" in expected:
            actual["spawned"] = bool(fake and fake.calls)
        if "temporaryDirectoryEmpty" in expected:
            actual["temporaryDirectoryEmpty"] = (
                temporary_directory.exists()
                and not any(temporary_directory.iterdir())
            )
        return actual, expected, fixture.root
    finally:
        if previous_umask is not None:
            os.umask(previous_umask)
        for name, value in previous_host_environment.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def _executable_modes(root: Path, paths: Mapping[str, object]) -> dict[str, str | None]:
    """The permission bits an extracted box actually carries, for the paths a case names.

    Windows has no bit to read, so every path reports ``None`` there and the fixture says so rather
    than the driver quietly skipping the case.
    """

    return {
        path: (
            None
            if os.name == "nt"
            else oct((root / path).stat().st_mode & 0o777)[2:]
        )
        for path in paths
    }


def remove_conformance_root(root: Path) -> None:
    shutil.rmtree(root, ignore_errors=True)
