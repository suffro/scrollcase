# Self-tests use the modes the consumer will receive

**Decided 2026-11-04, alongside executable archive members.**

Before optional Apple signing and the build self-test, `applyArchiveFileModes()` applies the
archive writer's own `archiveFileMode` rule to every collected regular payload file. It never
chmods a link. Runtime entry points and script directories, executable assets/local files and
declared archive members receive 0755; every other POSIX regular file receives 0644. Windows
skips chmod and retains its existing extension-based semantics. Parity sees the same tree.
The entry-point executable guard now runs before the self-test. Self-test failures retain the
original error and explain which declaration can give a helper its missing executable bit.

Modes are reapplied after the probes and the final digest write, so generated output has the
same final mode in the build directory and the ZIP. The writer still synthesizes modes itself;
normalization is a check of what will ship, never permission to trust the build filesystem.
This makes two cheap metadata walks rather than reading or copying a second multi-GB payload.

**Rejected:** archive-then-extract validation (candidate b). It reproduces more than modes but
costs another full write, read and temporary payload, and changes pipeline order. The defect is
the permission rule, which is already centralized. Consumer conformance and the packed-package
end-to-end check still exercise real extraction. **Rejected:** chmodding only declared files,
which would leave undeclared upstream executables runnable during self-testing.

This deliberately changes build behavior: boxes that passed only because their build directory
inherited upstream executable bits now fail where installed consumers already failed. Rebuilding
with the appropriate declaration repairs them without changing the signed format. No dependency
versions or runtime rules are silently broadened to conceal a failure.

Evidence: the new real-subprocess regression first failed because the undeclared build wrongly
succeeded; it passes after normalization by observing an OS permission failure, before archiving.
The declared counterpart runs. A separate test proves that a link under the runtime scripts
directory cannot chmod its data-file target back to executable.
