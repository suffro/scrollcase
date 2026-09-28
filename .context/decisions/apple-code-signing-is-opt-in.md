# Apple code signing is opt-in, because it costs determinism

**Decided 2026-09-28, by the maintainer, for 1.3.0.**

`build --codesign <identity>` signs every Mach-O file in a macOS payload with the caller's Apple
identity, the hardened runtime and a secure timestamp, and verifies each one, before the self-test.

**Why.** A box embedded in a macOS application is unpacked by Apple's notary service, which rejects
every Mach-O file without a Developer ID signature, a secure timestamp and, for executables, the
hardened runtime. A conda prefix carries hundreds. The first downstream notarization of an
application embedding a box failed on 562 of them. They cannot be signed after the build, because
the signed release already commits to the archive hash; and nothing rewrites a payload file on
extraction, so signing the payload is enough.

**Why opt-in.** The timestamp Apple issues differs per signature, so a code-signed box is not
byte-identical across rebuilds. A flag keeps the determinism promise intact for every box that is
not going inside a notarized application.

**Evidence.** On 2026-09-28 the `hello-box` example for `macos-aarch64-metal` was built with
`--codesign` and a Developer ID identity: 197 Mach-O files signed, the self-test passed with them
signed, `verify --self-test` and `run` passed, every signature still verified after extracting the
archive, and Apple's notary service accepted the archive with no issues.

**Amended 2026-09-28, for 1.4.0: entitlements.** The first real downstream box built with
`--codesign` failed its self-test: its tools find their libraries through `DYLD_LIBRARY_PATH`, which
the hardened runtime ignores. `--codesign-entitlements <plist>` applies the caller's entitlements to
executables; `com.apple.security.cs.allow-dyld-environment-variables` fixed it. Not a default,
because an entitlement is a security decision about the caller's programs.

**Rejected:** signing without a timestamp (notarization refuses it), and signing in the consumer
after extraction (notarization inspects the application before anything is extracted). The public
reasoning is in `docs/concepts/design-decisions.md`.
