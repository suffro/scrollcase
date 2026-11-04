# Native Windows verification follow-up

Completed: 2026-11-04. Source: `feat/archive-member-executables` at `5158b43`, plus the
code-signing fixture correction described below. Native link-dependent suites remain blocked by
the local account's Windows symlink privilege; they are not reported green.

The prior executable-member verification used WSL even though native Windows Node, Python and
Rust are available. Correct that omission without changing the user's original working copies
or pushing the branch. The existing CI workflow already covers Node 20/22/24 and Rust on Linux,
macOS and Windows; Python 3.10/3.14 runs on Ubuntu. It triggers for pull requests and pushes to main,
so the unpublished local branch has no CI result. No hosted workflow is authorized here.

- [x] Export the exact committed branch as a Git bundle; clone it into the new native Windows
  directory `C:/Users/loren/Documents/GitHub/scrollcase-executables-windows`. Keep its dependencies
  separate from WSL. Verify the source SHA and clean checkout before testing.
- [x] Run native `npm ci`, `npm test`, types and Action drift checks. Capture actual failures and
  applicable platform skips, including link-creation privileges, without weakening tests.
- [x] Run the Python consumer in an isolated Windows venv and the Rust consumer with its native
  toolchain; run relevant copy and lint checks. Local compiler prerequisites must be checked,
  not assumed absent.
- [x] Review failures in the main WSL branch, with failing coverage
  observed first. Preserve unrelated pre-existing failures as such only after comparing the
  affected path with the upstream baseline. Do not bypass any native-host or safety guard.
- [x] Record final native results in the tracked implementation report and current context;
  rerun affected checks, commit changes locally and verify the branch is clean.

Logs and the bundle belong in the new sibling directory
`C:/Users/loren/Documents/GitHub/scrollcase-executables-evidence`. Native tests are reversible local
work already authorized by the requested cross-platform validation. No push, tag, publication,
real box/toolchain installation or paid CI run is part of this follow-up.

Observed first native run: Node **576 passed, 57 failed, 13 skipped**. The untouched upstream
baseline at `e512f00`, run in its own new Windows worktree, has **534 passed, 46 failed, 9 skipped**.
Both expose the same missing Windows symlink privilege (EPERM), plus an existing code-signing
refusal test that changes its target to Linux but retains Windows' `venv/python.exe` declaration.
The branch's 11 additional failures are archive/link and build cases stopped by the same privilege.
Do not disable those tests or change machine-wide Developer Mode. Correct the contradictory
code-signing fixture by letting the declared target derive its interpreter path, and rerun it
on Windows and Linux. Its Windows failure is already observed, on both baseline and branch.

Python native: 68 run, **62 passed, 6 platform skips**; mypy (9 source files) and copied schemas
pass. Native Node generated types and Action drift pass. Rust builds successfully with the
installed MSVC Build Tools; the first archive test binary exposes missing symlink privilege
(OS error 1314). Run remaining Rust binaries with no-fail-fast, compare the unchanged failing
archive case with baseline, and record exact outcomes.

Add a separate native Windows signed build/extract/run smoke using a tiny locally compiled EXE
inside a TAR.GZ and a link-free stub for only the environment installer, as Windows prefixes
normally are. Keep actual staging, declaration validation, self-test, ZIP/signing, verification,
extraction and process execution real. This exercises the new field without changing existing
link guards or requiring a machine-wide permission change. The earlier WSL smoke retains the
real pixi/conda-pack environment check. No new npm test dependency or runtime fallback is needed.

## Final outcomes

Native Windows (NT 10.0.26200), Node 22.14.0, CPython 3.13.3, Rust/Cargo 1.95.0 with the existing
Visual Studio 2022 Build Tools. No machine-wide setting or privilege was changed.

| Check | Observed result |
| --- | --- |
| Untouched main `npm test` | 534 passed, 46 failed, 9 skipped |
| Feature branch before fixture correction | 576 passed, 57 failed, 13 skipped |
| Feature branch after correction | **577 passed, 56 failed, 13 skipped** |
| Corrected code-signing refusal case | Pass on native Windows and in the full Linux suite |
| Node types, Action drift and language-copy checks | Pass |
| Python unit suite | **62 passed, 6 platform skips** out of 68 |
| Python mypy, schema check, wheel/sdist and distribution inspection | Pass |
| Rust suite with `--no-fail-fast` | **98 passed, 1 failed**; all test binaries attempted |
| Rust clippy with warnings denied | Pass |
| Windows signed archive/consumer smoke | Pass, including two byte-identical builds |
| Linux suite after the fixture correction | **645 passed, 1 macOS-only skip**, 38 files |

The 56 remaining Node failures all stop at Windows denying symlink creation (EPERM), either
directly or through an assertion expecting a later validation error. Main already has 45 failures
with this cause; the 11 additional feature cases encounter the same limitation before their
intended assertions. The separate existing fixture failure is now fixed: a Linux target must
derive its own interpreter, rather than inherit Windows' `venv/python.exe` from the host fixture.
No runtime implementation or executable-field guarantee was changed to make these results pass.

The one Rust failure is `a_link_the_contract_permits_survives_listing_and_extraction`: Windows
reports OS error 1314, a required privilege is not held. Its test and the entire Rust runtime
are byte-unchanged from main (verified with `git diff --exit-code e512f00 -- rust/src
rust/tests/archive.rs`). All other Rust binaries, including applicable shared conformance cases,
pass. POSIX-only cases are excluded by the repository's existing platform rules.

The full native Node/Rust suites therefore remain **not green on this Windows account**. Running
them with Windows symlink creation enabled, or on the configured CI runners, is still needed to
close that environment-specific gap. Do not hide it by skipping tests or declaring the feature
perfect. GitHub CI is already configured, but there is no result for this unpublished branch;
the original no-push/no-paid-workflow constraint was preserved.

## Native Windows execution evidence

The scratch script compiles a tiny Rust EXE locally, puts it in a real TAR.GZ, commits the scroll
and input, and calls the real builder. Only pixi installation/conda-pack are represented by a
link-free prefix stub; staging, member validation, native self-test, deterministic ZIP creation,
signing, consumer preparation, payload verification and process launch are the real code.

- Scratch: `C:/Users/loren/Documents/GitHub/scrollcase-executables-evidence/native-smoke-o11GMn`.
- Declared member: `executables: ["bin/tool.exe"]`, destination `tools`, stripping one wrapper.
- Both build self-tests print `native-archive-member-ok`.
- The Windows ZIP mode is **0644**, as documented; the `.exe` runs after consumer extraction.
- Installed-payload verification succeeds and execution exits **0** with
  `native-archive-member-ok`.
- Both builds have SHA-256
  `1604650631e936cee1b6af9d7e84cd8299fbe4788340f60e5b5eca40d31523b1`.

Exact command in the sibling evidence directory: `node native-smoke.mjs`. Native suite logs,
baseline comparison, build artifacts and `windows-smoke-result.json` are kept there. This native
execution check supplements the earlier WSL smoke that used real pixi and conda-pack.

## Existing GitHub Actions coverage

`.github/workflows/ci.yml` already defines:

- Node 20, 22 and 24 on Ubuntu, macOS and Windows: nine suite jobs, with Action drift checks;
- the Action bundle smoke on all three operating systems;
- Rust tests, clippy and copied-assets checks on all three operating systems;
- Python 3.10 and 3.14 on Ubuntu;
- package-surface and documentation checks.

Its triggers are pull requests and pushes to main. It does not run merely because local commits
exist, and it defines no manual dispatch for uploading an unpublished local checkout. No workflow
was modified or run, and no branch or tag was pushed. The maintainer's original release authority
and the prohibition on paid CI remain intact.
