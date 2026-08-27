//! The signed release manifest, and the `box.json` that must agree with it.
//!
//! These types are the runtime shape check. Node and Python validate the same documents against the
//! canonical JSON schemas at runtime; this crate encodes those schemas as types instead, because the
//! schemas set `additionalProperties: false` almost everywhere and a typed `deny_unknown_fields`
//! parse says exactly that — while a JSON Schema evaluator for the eighteen keywords these schemas
//! actually use would be six hundred lines of validation logic whose failure mode is validating
//! *less* than it claims.
//!
//! *Almost* everywhere: [`Compatibility`] is the one object the schemas leave open, and the types
//! leave it open too. A typed parse is a faithful stand-in for a schema only where the schema is
//! closed, and reading `deny_unknown_fields` as the house style rather than as a per-object
//! statement is exactly how this crate once came to refuse releases the format defines as valid.
//!
//! The equivalence is not assumed. `tests/schema.rs` validates the same documents against the
//! bundled canonical schemas and asserts the two agree, so a type that drifts from its schema is a
//! red test rather than a silent divergence between implementations.
//!
//! What the types cannot express — patterns, non-empty strings, positive integers, and the
//! `weights`/`assets` co-requirement — is checked explicitly in [`ReleaseManifest::validate`].

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::contract::documents::{parse_document_kind, DocumentType, BOX_SCHEMA_VERSION};
use crate::contract::runtimes::RuntimeExecution;
use crate::contract::targets::BoxTarget;
use crate::error::{fail, Result};
use crate::path::safe_relative_path;

/// Host requirements a caller may enforce. Scrollcase records them; it does not decide policy.
///
/// This is the one object the canonical schemas declare `additionalProperties: true`. A publishing
/// project may state constraints of its own beside the defined ones, and the builder copies them
/// through verbatim without interpreting any of them, so a parse that refused an unrecognised key
/// would make this crate stricter than the schema it ships — and would refuse boxes the schema, the
/// builder, and the Node and Python consumers all accept. Unknown constraints therefore land in
/// [`Compatibility::additional`], carried rather than dropped or rejected.
///
/// Carrying them costs no safety, because the schema puts the obligation on the application, not on
/// the parser: *a consumer that cannot evaluate a constraint must refuse the box rather than assume
/// it passes.* That decision needs the constraint in hand to be made at all, which is precisely what
/// refusing the document took away.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    /// Minimum version of the consuming application.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_host_app_version: Option<String>,
    /// First version of the consuming application this box no longer supports.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_host_app_version_exclusive: Option<String>,
    /// Minimum macOS version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_macos_version: Option<String>,
    /// Minimum installed memory, in decimal gigabytes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_ram_gb: Option<f64>,
    /// Minimum NVIDIA driver version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_nvidia_driver_version: Option<String>,
    /// Execution environments this payload was validated for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_environments: Option<Vec<String>>,
    /// Constraints this format does not define, in the publishing project's own vocabulary.
    ///
    /// Empty for a box that declares only the fields above. Scrollcase never evaluates an entry
    /// here; an application that finds one it does not understand must refuse the box.
    #[serde(flatten)]
    pub additional: BTreeMap<String, Value>,
}

/// Where the archive lives and what it must hash and weigh.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Archive {
    /// Always `zip`.
    pub format: String,
    /// Where the archive was published. This crate never fetches it.
    pub url: String,
    /// Lowercase hex SHA-256 of the archive bytes.
    pub sha256: String,
    /// Exact archive size.
    pub size_bytes: u64,
}

/// What a release commits to about its own extracted tree.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PayloadDigestCommitment {
    /// Always `sha256-path-list-v1`.
    pub format: String,
    /// Lowercase hex SHA-256 of the canonical entry list.
    pub sha256: String,
}

/// One invocation of the box's declared execution, and the status it must exit with.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelfTestCommand {
    /// Arguments appended to the box's declared execution.
    pub args: Vec<String>,
    /// Status the invocation must produce.
    pub expect_exit_code: u8,
}

/// What a box proves about itself, in whichever shapes its runtime supports.
///
/// `imports` asks the runtime's loader a question and only means something to a runtime that has
/// one; `commands` asks the box's own execution a question, which is the only shape a runtime with
/// no module system can answer. At least one must be present.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelfTestProbe {
    /// Modules the runtime must be able to load.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imports: Option<Vec<String>>,
    /// Invocations of the box's declared execution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<SelfTestCommand>>,
}

/// The check a box must pass, and how long it may take.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelfTest {
    /// What the box proves about itself.
    pub probe: SelfTestProbe,
    /// How long the check may take.
    pub timeout_seconds: u64,
}

/// What runs inside the box.
///
/// A target says which machine a box is for; this says what executes on it. Version 2 had no such
/// field: a box recorded a Python entry point and Python execution kinds and nothing that said
/// "Python", so a reader had to infer the runtime from the shape of a path.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BoxRuntime {
    /// The runtime this box carries: `python`, `node` or `native`.
    pub id: String,
    /// Its own version. Absent for a runtime that has none to record.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Its own executable, relative to the box root. Absent for a runtime with no separate one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_point: Option<String>,
}

/// The optional, shell-free application entry point.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Execution {
    /// Run one regular payload file with the box's own Python interpreter.
    #[serde(rename_all = "camelCase")]
    PythonScript {
        /// Safe path to a regular Python file inside the box.
        script: String,
        /// Arguments always passed before a caller's own.
        default_args: Vec<String>,
    },
    /// Run one dotted Python module.
    #[serde(rename_all = "camelCase")]
    PythonModule {
        /// Strict dotted-module name, with no command-line or shell syntax.
        module: String,
        /// Arguments always passed before a caller's own.
        default_args: Vec<String>,
    },
    /// Run one regular payload file with the box's own Node runtime.
    ///
    /// Named by the format so that implementing the runtime is code rather than another wire
    /// break. No adapter in this crate answers for it yet, so a box declaring it is refused.
    #[serde(rename_all = "camelCase")]
    NodeScript {
        /// Safe path to a regular JavaScript file inside the box.
        script: String,
        /// Arguments always passed before a caller's own.
        default_args: Vec<String>,
    },
    /// Run a compiled executable the box carries, with no interpreter in front of it.
    #[serde(rename_all = "camelCase")]
    NativeBinary {
        /// Safe path to the executable inside the box.
        binary: String,
        /// Arguments always passed before a caller's own.
        default_args: Vec<String>,
    },
}

impl Execution {
    /// Borrows this declaration in the terms the runtime rules read.
    ///
    /// The conversion lives here rather than in the contract mirror so that
    /// [`crate::contract::runtimes`] never has to know the document model — it states rules about
    /// names, and this is the document handing it the names.
    #[must_use]
    pub fn as_runtime(&self) -> RuntimeExecution<'_> {
        match self {
            // Both script kinds carry the same shape: which runtime runs it is the box's
            // declaration, not something the shape can say.
            Execution::PythonScript {
                script,
                default_args,
            }
            | Execution::NodeScript {
                script,
                default_args,
            } => RuntimeExecution::Script {
                script,
                default_args,
            },
            Execution::PythonModule {
                module,
                default_args,
            } => RuntimeExecution::Module {
                module,
                default_args,
            },
            Execution::NativeBinary {
                binary,
                default_args,
            } => RuntimeExecution::Binary {
                binary,
                default_args,
            },
        }
    }
}

/// How the box was produced. Recorded, signed, and never fabricated.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    /// Identity of the scroll that produced this box.
    pub scroll_id: String,
    /// Version declared by that scroll.
    pub scroll_version: String,
    /// Commit of Scrollcase itself.
    pub builder_revision: String,
    /// Whether the source tree was dirty at build time. Never quietly downgraded.
    pub source_tree_dirty: bool,
    /// Commit the box was built from.
    pub source_revision: String,
    /// The runtime version the environment was solved with. Absent exactly when the runtime has
    /// none: provenance records what was observed and never invents a value to fill a field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_version: Option<String>,
    /// SHA-256 of the dependency lock.
    pub dependency_lock_sha256: String,
    /// When the box was built.
    pub built_at: String,
    /// pixi version that solved the environment.
    pub pixi_version: String,
}

/// One deferred asset a caller must materialise before execution.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetDescriptor {
    /// Where the asset was published. This crate never fetches it.
    pub url: String,
    /// Where it must be placed, relative to the box root.
    pub relative_path: String,
    /// Exact size the placed file must have.
    pub size_bytes: u64,
    /// Lowercase hex SHA-256 the placed file must have.
    pub sha256: String,
    /// Present and true when the scroll declared the file executable. Whoever materialises it owns
    /// setting the bit: the file never passes through the archive, so nothing here carries a mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<bool>,
}

/// The immutable description of one built box.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReleaseManifest {
    /// Format version; always 3.
    pub schema_version: u32,
    /// `<namespace>.release`, in the publishing project's own namespace.
    pub kind: String,
    /// Box identity.
    pub box_id: String,
    /// Free-form annotations the publisher signed. This crate attaches no meaning to any key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<BTreeMap<String, String>>,
    /// Box version.
    pub version: String,
    /// The target this box was built for.
    pub target: BoxTarget,
    /// Host requirements.
    pub compatibility: Compatibility,
    /// The archive this release commits to.
    pub archive: Archive,
    /// Logical payload size before anything is written into the installed tree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_size_bytes: Option<u64>,
    /// Commitment to the extracted tree, absent on boxes built before it existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_digest: Option<PayloadDigestCommitment>,
    /// What runs inside the box.
    pub runtime: BoxRuntime,
    /// Where the box's own large files belong inside it.
    pub cache_subdir: String,
    /// Signed environment applied whenever Scrollcase runs the box.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<BTreeMap<String, String>>,
    /// The check a consumer can repeat.
    pub self_test: SelfTest,
    /// The optional application entry point.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<Execution>,
    /// How the box was produced.
    pub provenance: Provenance,
    /// Descriptors of the assets a caller must materialise, and only those. Absent when the box is
    /// self-contained; there is no separate mode field, because the list itself is the statement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assets: Option<Vec<AssetDescriptor>>,
}

/// The box's self-description, carried inside the archive.
///
/// Every field it holds also appears in the release, and all of them must agree: without that, a
/// correctly hashed archive could be paired with a signed manifest describing something else.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BoxManifest {
    /// Format version; always 3.
    pub schema_version: u32,
    /// Box identity.
    pub box_id: String,
    /// Free-form annotations the publisher signed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<BTreeMap<String, String>>,
    /// Box version.
    pub version: String,
    /// The target this box was built for.
    pub target: BoxTarget,
    /// What runs inside the box.
    pub runtime: BoxRuntime,
    /// Where the box's own large files belong inside it.
    pub cache_subdir: String,
    /// Signed environment applied whenever Scrollcase runs the box.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<BTreeMap<String, String>>,
    /// The check a consumer can repeat.
    pub self_test: SelfTest,
    /// The optional application entry point.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<Execution>,
    /// How the box was produced.
    pub provenance: Provenance,
    /// Descriptors of the assets a caller must materialise, and only those.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assets: Option<Vec<AssetDescriptor>>,
}

impl BoxRuntime {
    /// The runtime block's own constraints, which the types cannot state.
    ///
    /// The id is checked against the format's closed vocabulary rather than against what this crate
    /// implements: a box naming `native` is a well-formed v3 box that this build cannot run, and
    /// saying so is `run`'s job, not the manifest reader's.
    fn validate(&self) -> Result<()> {
        if !crate::contract::runtimes::RUNTIME_IDS.contains(&self.id.as_str()) {
            fail!(
                "Invalid release manifest: unknown runtime {}. The box format defines {}.",
                self.id,
                crate::contract::runtimes::RUNTIME_IDS.join(", ")
            );
        }
        for (label, value) in [("version", &self.version), ("entryPoint", &self.entry_point)] {
            if value.as_ref().is_some_and(std::string::String::is_empty) {
                fail!("Invalid release manifest: runtime {label} must not be empty.");
            }
        }
        Ok(())
    }
}

impl SelfTest {
    /// The probe's own constraints. At least one shape must be present: a box that proves nothing
    /// about itself is not a box worth signing.
    fn validate(&self) -> Result<()> {
        let imports = self.probe.imports.as_deref().unwrap_or_default();
        let commands = self.probe.commands.as_deref().unwrap_or_default();
        if imports.is_empty() && commands.is_empty() {
            fail!("Invalid release manifest: selfTest probe must declare imports or commands.");
        }
        if self.probe.imports.is_some()
            && (imports.is_empty() || imports.iter().any(std::string::String::is_empty))
        {
            fail!("Invalid release manifest: selfTest probe imports must be non-empty.");
        }
        if self.probe.commands.is_some() && commands.is_empty() {
            fail!("Invalid release manifest: selfTest probe commands must be non-empty.");
        }
        if self.timeout_seconds == 0 {
            fail!("Invalid release manifest: selfTest timeoutSeconds must be positive.");
        }
        Ok(())
    }
}

/// Whether a value is lowercase hex of the given length.
fn is_lowercase_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Whether a value is the format's dotted-lowercase identifier.
fn is_identifier(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut group_is_empty = true;
    for character in value.chars() {
        match character {
            'a'..='z' | '0'..='9' => group_is_empty = false,
            '-' | '.' if !group_is_empty => group_is_empty = true,
            _ => return false,
        }
    }
    !group_is_empty
}

/// Whether a value is a strict Python dotted-module name.
fn is_python_module(value: &str) -> bool {
    !value.is_empty()
        && value.split('.').all(|segment| {
            let mut characters = segment.chars();
            characters
                .next()
                .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
                && characters.all(|rest| rest.is_ascii_alphanumeric() || rest == '_')
        })
}

impl Execution {
    /// Checks the constraints the type cannot express.
    ///
    /// # Errors
    ///
    /// When the script path is unsafe or the module name is not a strict dotted name.
    pub fn validate(&self) -> Result<()> {
        match self {
            Self::PythonScript { script, .. }
            | Self::NodeScript { script, .. } => {
                safe_relative_path(script)?;
            }
            Self::NativeBinary { binary, .. } => {
                safe_relative_path(binary)?;
            }
            Self::PythonModule { module, .. } => {
                if !is_python_module(module) {
                    fail!("Invalid release manifest: execution module {module} is not a dotted Python module name.");
                }
            }
        }
        Ok(())
    }
}

impl ReleaseManifest {
    /// Checks every constraint the schema states that the types cannot.
    ///
    /// # Errors
    ///
    /// When any pattern, bound, or co-requirement the schema states is violated.
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != BOX_SCHEMA_VERSION {
            fail!(
                "Unsupported schemaVersion {}; expected {BOX_SCHEMA_VERSION}.",
                self.schema_version
            );
        }
        if parse_document_kind(&self.kind).map(|parsed| parsed.document_type)
            != Some(DocumentType::Release)
        {
            fail!("Document is not a box release.");
        }
        // The target model is a contract rule rather than a field check: this rejects a triple
        // outside the supported matrix, a CUDA target without a version, and a version on a target
        // that may not carry one, all in the same call the slug is derived from.
        crate::contract::targets::box_target_id(&self.target)?;
        if !is_identifier(&self.box_id) {
            fail!("Invalid release manifest: boxId is not a valid identifier.");
        }
        for key in self.labels.iter().flat_map(std::collections::BTreeMap::keys) {
            if !is_identifier(key) {
                fail!("Invalid release manifest: label {key} is not a valid identifier.");
            }
        }
        self.runtime.validate()?;
        for (label, value) in [
            ("version", &self.version),
            ("cacheSubdir", &self.cache_subdir),
            ("archive.url", &self.archive.url),
        ] {
            if value.is_empty() {
                fail!("Invalid release manifest: {label} must not be empty.");
            }
        }
        if self.archive.format != "zip" {
            fail!("Invalid release manifest: archive format must be zip.");
        }
        if !is_lowercase_hex(&self.archive.sha256, 64) {
            fail!("Invalid release manifest: archive sha256 is not a SHA-256 digest.");
        }
        if self.archive.size_bytes == 0 {
            fail!("Invalid release manifest: archive sizeBytes must be positive.");
        }
        if self.installed_size_bytes == Some(0) {
            fail!("Invalid installed size.");
        }
        if let Some(digest) = &self.payload_digest {
            if digest.format != crate::contract::payload_digest::PAYLOAD_DIGEST_FORMAT
                || !is_lowercase_hex(&digest.sha256, 64)
            {
                fail!("Invalid release manifest: payloadDigest is not a supported commitment.");
            }
        }
        self.self_test.validate()?;
        validate_environment(self.environment.as_ref())?;
        if let Some(execution) = &self.execution {
            execution.validate()?;
        }
        validate_provenance(&self.provenance)?;
        validate_compatibility(&self.compatibility)?;
        self.validate_assets()?;
        Ok(())
    }

    /// The deferred-asset descriptors, which are the whole statement in version 3: there is no
    /// second field they have to agree with.
    fn validate_assets(&self) -> Result<()> {
        let Some(assets) = self.assets.as_deref() else {
            return Ok(());
        };
        if assets.is_empty() {
            fail!("Invalid release manifest: assets must not be empty.");
        }
        for asset in assets {
            // Screened before anything is joined onto a caller's directory.
            safe_relative_path(&asset.relative_path)?;
            if asset.url.is_empty() {
                fail!("Invalid release manifest: asset url must not be empty.");
            }
            if asset.size_bytes == 0 {
                fail!("Invalid release manifest: asset sizeBytes must be positive.");
            }
            if !is_lowercase_hex(&asset.sha256, 64) {
                fail!("Invalid release manifest: asset sha256 is not a SHA-256 digest.");
            }
        }
        Ok(())
    }
}

/// Environment names and values, as the schema constrains them.
fn validate_environment(environment: Option<&BTreeMap<String, String>>) -> Result<()> {
    let Some(environment) = environment else {
        return Ok(());
    };
    for (name, value) in environment {
        if name.is_empty() || name.contains('=') || name.contains('\0') || value.contains('\0') {
            fail!("Invalid release manifest: environment variable {name} is not a valid name.");
        }
    }
    Ok(())
}

fn validate_provenance(provenance: &Provenance) -> Result<()> {
    if provenance
        .runtime_version
        .as_ref()
        .is_some_and(std::string::String::is_empty)
    {
        fail!("Invalid release manifest: provenance runtimeVersion must not be empty.");
    }
    if !is_lowercase_hex(&provenance.builder_revision, 40) {
        fail!("Invalid release manifest: provenance builderRevision is not a commit.");
    }
    if !is_lowercase_hex(&provenance.dependency_lock_sha256, 64) {
        fail!("Invalid release manifest: provenance dependencyLockSha256 is not a SHA-256 digest.");
    }
    for (label, value) in [
        ("scrollId", &provenance.scroll_id),
        ("scrollVersion", &provenance.scroll_version),
        ("sourceRevision", &provenance.source_revision),
        ("builtAt", &provenance.built_at),
        ("pixiVersion", &provenance.pixi_version),
    ] {
        if value.is_empty() {
            fail!("Invalid release manifest: provenance {label} must not be empty.");
        }
    }
    Ok(())
}

fn validate_compatibility(compatibility: &Compatibility) -> Result<()> {
    if compatibility.min_ram_gb.is_some_and(|value| value <= 0.0) {
        fail!("Invalid release manifest: minRamGb must be positive.");
    }
    if let Some(environments) = &compatibility.host_environments {
        if environments.is_empty() {
            fail!("Invalid release manifest: hostEnvironments must not be empty.");
        }
        for environment in environments {
            if environment != "native" && environment != "windows-wsl2" {
                fail!("Invalid release manifest: unsupported host environment {environment}.");
            }
        }
    }
    for (label, value) in [
        ("minHostAppVersion", &compatibility.min_host_app_version),
        (
            "maxHostAppVersionExclusive",
            &compatibility.max_host_app_version_exclusive,
        ),
        ("minMacosVersion", &compatibility.min_macos_version),
        (
            "minNvidiaDriverVersion",
            &compatibility.min_nvidia_driver_version,
        ),
    ] {
        if value.as_deref().is_some_and(str::is_empty) {
            fail!("Invalid release manifest: compatibility {label} must not be empty.");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_identifier, is_python_module, Execution};

    #[test]
    fn identifiers_follow_the_shared_pattern() {
        for valid in ["hello-box", "a", "example.model-1", "b0x"] {
            assert!(is_identifier(valid), "{valid} was refused");
        }
        for invalid in ["", "-a", "a-", "a..b", "A", "a_b", "a b", ".a"] {
            assert!(!is_identifier(invalid), "{invalid} was accepted");
        }
    }

    #[test]
    fn module_names_carry_no_command_line_syntax() {
        for valid in ["main", "_pkg.main", "example_model.cli.main"] {
            assert!(is_python_module(valid), "{valid} was refused");
        }
        // The name is passed to `python -m`, so anything that is not a dotted identifier — a space,
        // a semicolon, a flag, a path — must never reach the argument list.
        for invalid in ["", "a b", "a;b", "-c", "a/b", "1abc", "a..b", "a."] {
            assert!(!is_python_module(invalid), "{invalid} was accepted");
        }
    }

    #[test]
    fn execution_paths_are_screened_before_they_are_joined() {
        let escape = Execution::PythonScript {
            script: "../outside.py".to_string(),
            default_args: vec![],
        };
        assert!(escape.validate().is_err());

        let ok = Execution::PythonScript {
            script: "app/main.py".to_string(),
            default_args: vec![],
        };
        assert!(ok.validate().is_ok());
    }
}
