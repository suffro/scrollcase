//! The mirror, proved against the shared fixtures.
//!
//! These are the cases that define what "the implementations agree" means. They are language-neutral
//! on purpose: the Node builder and the Python consumer drive the same files, so a divergence here is
//! a divergence in the format, not a difference of opinion between test suites.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use scrollcase_consumer::contract::payload_digest::{
    payload_digest_stream, PayloadDigestEntry, PayloadDigestKind,
};
use scrollcase_consumer::contract::runtimes::{
    is_implemented_runtime, runtime_adapter, runtime_adapters, unsupported_self_test_probe_message,
    RuntimeArgument, RuntimeExecution, SelfTestCommand, SelfTestProbe, RUNTIME_IDS,
};
use scrollcase_consumer::contract::targets::{box_target_id, BoxTarget};

const TARGET_ID_CONTRACT: &str = include_str!("../fixtures/target-id-contract.json");
const PAYLOAD_DIGEST_CONTRACT: &str = include_str!("../fixtures/payload-digest-contract.json");
const RUNTIME_CONTRACT: &str = include_str!("../fixtures/runtime-contract.json");

fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    Sha256::digest(bytes).iter().fold(
        String::with_capacity(64),
        |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        },
    )
}

#[derive(Deserialize)]
struct TargetIdContract {
    valid: Vec<ValidTargetCase>,
    invalid: Vec<InvalidTargetCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidTargetCase {
    name: String,
    target: BoxTarget,
    target_id: String,
}

#[derive(Deserialize)]
struct InvalidTargetCase {
    name: String,
    target: serde_json::Value,
}

#[test]
fn matches_the_shared_target_id_contract() {
    let contract: TargetIdContract = serde_json::from_str(TARGET_ID_CONTRACT).unwrap();
    assert!(!contract.valid.is_empty() && !contract.invalid.is_empty());

    for case in &contract.valid {
        let produced = box_target_id(&case.target)
            .unwrap_or_else(|error| panic!("{} was refused: {error}", case.name));
        assert_eq!(produced, case.target_id, "{}", case.name);
    }

    for case in &contract.invalid {
        // An invalid target may fail either by shape — a field the target schema forbids — or by
        // rule. Both are refusals, and the contract only asserts that no slug is produced.
        let refused = match serde_json::from_value::<BoxTarget>(case.target.clone()) {
            Ok(target) => box_target_id(&target).is_err(),
            Err(_) => true,
        };
        assert!(refused, "{} produced a target id", case.name);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeContract {
    runtime_ids: Vec<String>,
    runtimes: Vec<RuntimeCase>,
    executable_matches: Vec<ExecutableMatchCase>,
    execution_discovery: Vec<ExecutionDiscoveryCase>,
    invalid_runtime_versions: Vec<String>,
    argv: Vec<ArgvCase>,
    self_test: Vec<SelfTestCase>,
    unsupported_probes: Vec<UnsupportedProbeCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnsupportedProbeCase {
    name: String,
    runtime: String,
    probe_kind: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCase {
    id: String,
    execution_kinds: Vec<String>,
    execution_environment_variables: Vec<String>,
    self_test_probe_kinds: Vec<String>,
    layouts: Vec<LayoutCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayoutCase {
    platform: String,
    layout: LayoutFields,
    executable_payload_paths: ExecutablePathsFields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayoutFields {
    root: String,
    entry_point: Option<String>,
    scripts_directory: String,
    standard_library: Option<String>,
    executable_suffix: String,
    launcher_kind: String,
}

#[derive(Deserialize)]
struct ExecutablePathsFields {
    files: Vec<String>,
    directories: Vec<String>,
}

#[derive(Deserialize)]
struct ExecutableMatchCase {
    name: String,
    runtime: String,
    platform: String,
    path: String,
    executable: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionDiscoveryCase {
    name: String,
    runtime: String,
    platform: String,
    runtime_version: String,
    execution: ExecutionFields,
    candidates: Vec<String>,
}

#[derive(Deserialize)]
struct ArgvCase {
    name: String,
    runtime: String,
    platform: String,
    execution: ExecutionFields,
    command: ArgumentFields,
    args: Vec<ArgumentFields>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelfTestCase {
    name: String,
    runtime: String,
    platform: String,
    probe: ProbeFields,
    #[serde(default)]
    execution: Option<ExecutionFields>,
    invocations: Vec<InvocationFields>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeFields {
    #[serde(default)]
    imports: Vec<String>,
    #[serde(default)]
    commands: Vec<CommandFields>,
    #[serde(default)]
    code: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandFields {
    args: Vec<String>,
    expect_exit_code: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InvocationFields {
    command: ArgumentFields,
    args: Vec<ArgumentFields>,
    expect_exit_code: u8,
}

/// The execution declaration as the fixture spells it, so the vectors are read exactly as the other
/// implementations read them rather than through this crate's own release model.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionFields {
    kind: String,
    #[serde(default)]
    script: Option<String>,
    #[serde(default)]
    module: Option<String>,
    #[serde(default)]
    binary: Option<String>,
    default_args: Vec<String>,
}

impl ExecutionFields {
    fn as_runtime(&self) -> RuntimeExecution<'_> {
        match self.kind.as_str() {
            "python-script" | "node-script" => RuntimeExecution::Script {
                script: self.script.as_deref().expect("a script case declares a script"),
                default_args: &self.default_args,
            },
            "python-module" => RuntimeExecution::Module {
                module: self.module.as_deref().expect("a module case declares a module"),
                default_args: &self.default_args,
            },
            "native-binary" => RuntimeExecution::Binary {
                binary: self.binary.as_deref().expect("a binary case declares a binary"),
                default_args: &self.default_args,
            },
            other => panic!("the fixture declares an execution kind this mirror has no shape for: {other}"),
        }
    }
}

#[derive(Deserialize)]
struct ArgumentFields {
    kind: String,
    value: String,
}

impl ArgumentFields {
    fn matches(&self, argument: &RuntimeArgument) -> bool {
        match (self.kind.as_str(), argument) {
            ("literal", RuntimeArgument::Literal(value))
            | ("payload-path", RuntimeArgument::PayloadPath(value)) => value == &self.value,
            _ => false,
        }
    }
}

/// The Rust half of the shared runtime vectors.
///
/// One runtime's own answers: its kinds, its variables, its probe shapes and its per-platform
/// layout. Extracted so the case that drives it stays readable at a glance.
fn assert_runtime_case(case: &RuntimeCase) {
    let runtime = runtime_adapter(&case.id).unwrap();
    assert_eq!(runtime.execution_kinds, case.execution_kinds, "{}", case.id);
    assert_eq!(
        runtime.execution_environment_variables, case.execution_environment_variables,
        "{}",
        case.id
    );
    assert_eq!(
        runtime.self_test_probe_kinds(), case.self_test_probe_kinds,
        "{}",
        case.id
    );
    for platform in &case.layouts {
        let layout = runtime.layout(&platform.platform).unwrap();
        let expected = &platform.layout;
        assert_eq!(layout.root, expected.root, "{}", platform.platform);
        assert_eq!(
            layout.entry_point,
            expected.entry_point.as_deref(),
            "{}",
            platform.platform
        );
        assert_eq!(
            layout.scripts_directory, expected.scripts_directory,
            "{}",
            platform.platform
        );
        assert_eq!(
            layout.standard_library,
            expected.standard_library.as_deref(),
            "{}",
            platform.platform
        );
        assert_eq!(
            layout.executable_suffix, expected.executable_suffix,
            "{}",
            platform.platform
        );
        assert_eq!(layout.launcher_kind, expected.launcher_kind, "{}", platform.platform);

        let rule = runtime.executable_payload_paths(&platform.platform).unwrap();
        assert_eq!(rule.files, platform.executable_payload_paths.files, "{}", platform.platform);
        assert_eq!(
            rule.directories, platform.executable_payload_paths.directories,
            "{}",
            platform.platform
        );
    }
}

/// Everything the runtime model states about a box — where the interpreter sits, which paths need
/// the executable bit, what a declaration could resolve to, and the command line that runs it — is
/// asserted here against the same file the Node and Python implementations read.
#[test]
fn matches_the_shared_runtime_contract() {
    let contract: RuntimeContract = serde_json::from_str(RUNTIME_CONTRACT).unwrap();

    // Two lists on purpose: the vocabulary the format defines, and what this crate can run.
    let ids: Vec<&str> = contract.runtime_ids.iter().map(String::as_str).collect();
    assert_eq!(RUNTIME_IDS, ids.as_slice());
    for id in RUNTIME_IDS {
        assert_eq!(
            is_implemented_runtime(id),
            runtime_adapters().iter().any(|runtime| runtime.id == *id),
            "{id}"
        );
    }
    let mirrored: Vec<&str> = runtime_adapters().iter().map(|runtime| runtime.id).collect();
    let declared: Vec<&str> = contract.runtimes.iter().map(|case| case.id.as_str()).collect();
    assert_eq!(mirrored, declared);

    for case in &contract.runtimes {
        assert_runtime_case(case);
    }

    for case in &contract.unsupported_probes {
        assert_eq!(
            unsupported_self_test_probe_message(&case.runtime, &case.probe_kind),
            case.message,
            "{}",
            case.name
        );
    }

    for case in &contract.executable_matches {
        let rule = runtime_adapter(&case.runtime)
            .unwrap()
            .executable_payload_paths(&case.platform)
            .unwrap();
        assert_eq!(rule.matches(&case.path), case.executable, "{}", case.name);
    }

    for case in &contract.execution_discovery {
        let resolved = runtime_adapter(&case.runtime)
            .unwrap()
            .resolve_execution_files(
                &case.execution.as_runtime(),
                &case.platform,
                &case.runtime_version,
            )
            .unwrap_or_else(|error| panic!("{} was refused: {error}", case.name));
        assert_eq!(resolved.candidates, case.candidates, "{}", case.name);
    }

    let python = runtime_adapter("python").unwrap();
    let module = ExecutionFields {
        kind: "python-module".to_string(),
        script: None,
        module: Some("pkg".to_string()),
        binary: None,
        default_args: vec![],
    };
    for invalid in &contract.invalid_runtime_versions {
        assert!(
            python
                .resolve_execution_files(&module.as_runtime(), "linux", invalid)
                .is_err(),
            "{invalid:?} was accepted"
        );
    }

    for case in &contract.argv {
        let invocation = runtime_adapter(&case.runtime)
            .unwrap()
            .build_argv(&case.execution.as_runtime(), &case.platform)
            .unwrap();
        assert!(case.command.matches(&invocation.command), "{}", case.name);
        assert_eq!(invocation.args.len(), case.args.len(), "{}", case.name);
        for (expected, produced) in case.args.iter().zip(invocation.args.iter()) {
            assert!(expected.matches(produced), "{}", case.name);
        }
    }

    assert_self_test_invocations(&contract);
}


/// The self-test half, lifted out of the main vector test: a probe may now imply several commands,
/// each with its own required exit status, and asserting that inline made one function long enough
/// for clippy to object.
fn assert_self_test_invocations(contract: &RuntimeContract) {
    for case in &contract.self_test {
        let commands: Vec<SelfTestCommand<'_>> = case
            .probe
            .commands
            .iter()
            .map(|command| SelfTestCommand {
                args: &command.args,
                expect_exit_code: command.expect_exit_code,
            })
            .collect();
        let execution = case.execution.as_ref().map(ExecutionFields::as_runtime);
        let invocations = runtime_adapter(&case.runtime)
            .unwrap()
            .self_test_invocations(
                &SelfTestProbe {
                    imports: &case.probe.imports,
                    commands: &commands,
                    code: case.probe.code.as_deref(),
                },
                execution.as_ref(),
                &case.platform,
            )
            .unwrap_or_else(|error| panic!("{} was refused: {error}", case.name));
        assert_eq!(invocations.len(), case.invocations.len(), "{}", case.name);
        for (expected, produced) in case.invocations.iter().zip(invocations.iter()) {
            assert!(expected.command.matches(&produced.command), "{}", case.name);
            assert_eq!(produced.expect_exit_code, expected.expect_exit_code, "{}", case.name);
            assert_eq!(produced.args.len(), expected.args.len(), "{}", case.name);
            for (want, got) in expected.args.iter().zip(produced.args.iter()) {
                assert!(want.matches(got), "{}", case.name);
            }
        }
    }
}

#[derive(Deserialize)]
struct PayloadDigestContract {
    format: String,
    cases: Vec<PayloadDigestCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PayloadDigestCase {
    name: String,
    entries: Vec<PayloadDigestFixtureEntry>,
    stream_base64: String,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PayloadDigestFixtureEntry {
    path: String,
    kind: String,
    #[serde(default)]
    content_base64: Option<String>,
    #[serde(default)]
    link_target: Option<String>,
}

#[test]
fn matches_the_shared_payload_digest_contract() {
    let contract: PayloadDigestContract = serde_json::from_str(PAYLOAD_DIGEST_CONTRACT).unwrap();
    assert_eq!(
        contract.format,
        scrollcase_consumer::contract::payload_digest::PAYLOAD_DIGEST_FORMAT
    );

    for case in &contract.cases {
        let entries: Vec<PayloadDigestEntry> = case
            .entries
            .iter()
            .map(|entry| {
                // A link is hashed over the UTF-8 bytes of its target and never opened: hashing what
                // it points at would make a link indistinguishable from a copy.
                let (kind, content) = match entry.kind.as_str() {
                    "file" => (
                        PayloadDigestKind::File,
                        BASE64
                            .decode(entry.content_base64.as_deref().unwrap())
                            .unwrap(),
                    ),
                    "link" => (
                        PayloadDigestKind::Link,
                        entry.link_target.as_deref().unwrap().as_bytes().to_vec(),
                    ),
                    other => panic!("unknown fixture entry kind {other}"),
                };
                PayloadDigestEntry {
                    path: entry.path.clone(),
                    kind,
                    content_sha256: sha256_hex(&content),
                }
            })
            .collect();

        let stream = payload_digest_stream(&entries).unwrap();
        assert_eq!(BASE64.encode(&stream), case.stream_base64, "{}", case.name);
        assert_eq!(sha256_hex(&stream), case.sha256, "{}", case.name);
    }
}

/// The bundled copies are what `include_str!` reads and what ships in the published crate. They are
/// only trustworthy while they match the canonical files, so drift is a test failure rather than
/// something a reviewer has to notice.
#[test]
fn bundled_assets_match_the_canonical_sources() {
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let canonical_root = repo_root.join("src/contract");
    if !canonical_root.is_dir() {
        // The crate was consumed outside this repository; there is nothing to compare against.
        return;
    }

    let assets = [
        ("fixtures/target-id-contract.json", "fixtures/target-id-contract.json"),
        ("fixtures/runtime-contract.json", "fixtures/runtime-contract.json"),
        ("fixtures/payload-digest-contract.json", "fixtures/payload-digest-contract.json"),
        ("fixtures/consumer-conformance.json", "fixtures/consumer-conformance.json"),
        ("schema/signed-document.schema.json", "src/contract/schema/signed-document.schema.json"),
        ("schema/release-manifest.schema.json", "src/contract/schema/release-manifest.schema.json"),
        ("schema/box-manifest.schema.json", "src/contract/schema/box-manifest.schema.json"),
        ("schema/target.schema.json", "src/contract/schema/target.schema.json"),
        ("schema/execution.schema.json", "src/contract/schema/execution.schema.json"),
        ("fixtures/examples/release-manifest.example.json", "fixtures/examples/release-manifest.example.json"),
        ("fixtures/examples/box-manifest.example.json", "fixtures/examples/box-manifest.example.json"),
        ("fixtures/examples/signed-release.example.json", "fixtures/examples/signed-release.example.json"),
    ];
    let crate_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    for (canonical, bundled) in assets {
        let canonical_bytes = std::fs::read(canonical_root.join(canonical)).unwrap();
        let bundled_bytes = std::fs::read(crate_root.join(bundled)).unwrap();
        assert_eq!(
            canonical_bytes, bundled_bytes,
            "{bundled} is stale; run node rust/scripts/sync-assets.mjs"
        );
    }
}
