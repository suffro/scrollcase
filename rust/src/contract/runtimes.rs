//! Mirror of the Scrollcase box-format runtime model.
//!
//! A target says which machine a box runs on; a runtime says what runs *inside* it — where the
//! interpreter sits, which execution kinds exist, how a declared entry point becomes a command
//! line, and which inherited environment variables can change what that command loads. Keeping
//! those facts in [`super::targets`] made every target adapter a statement that a box is a Python
//! box; they live here instead, and `fixtures/runtime-contract.json` is what proves this mirror
//! agrees with the reference implementation.
//!
//! Nothing here touches a filesystem or a process. [`BoxRuntimeAdapter::build_argv`] in particular
//! returns payload-*relative* paths tagged as paths rather than a joined command line: a box root
//! is a real path on this host, and each language joins one in its own terms.

use crate::error::{fail, Result};

/// Where a runtime lives inside an extracted box.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeLayout {
    /// Directory the packed prefix was relocated into.
    pub root: &'static str,
    /// The runtime's own executable, relative to the box root.
    pub entry_point: &'static str,
    /// Directory holding generated console scripts.
    pub scripts_directory: &'static str,
    /// Directory holding the runtime's bundled library.
    pub standard_library: &'static str,
    /// Suffix an executable carries on this platform.
    pub executable_suffix: &'static str,
    /// Frozen wire string naming how launchers were repaired.
    pub launcher_kind: &'static str,
}

/// Payload paths a runtime requires the executable bit on, as a rule rather than a list: a conda
/// prefix carries hundreds of console scripts and no scroll could name them by hand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExecutablePayloadPaths {
    /// Paths that match exactly.
    pub files: &'static [&'static str],
    /// Directories every path beneath which matches.
    pub directories: &'static [&'static str],
}

impl ExecutablePayloadPaths {
    /// Whether a payload path is one the runtime requires the executable bit on.
    #[must_use]
    pub fn matches(&self, relative_path: &str) -> bool {
        self.files.contains(&relative_path)
            || self
                .directories
                .iter()
                .any(|directory| relative_path.starts_with(&format!("{directory}/")))
    }
}

/// A declared execution, in the terms the runtime rules need.
///
/// Borrowed from whatever document carried it, so this mirror never has to own a document model —
/// the release manifest's own `Execution` converts into it and the contract stays a statement about
/// names.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeExecution<'a> {
    /// One regular payload file, run by the runtime's own entry point.
    Script {
        /// Payload-relative path to the file.
        script: &'a str,
        /// Arguments always passed before a caller's own.
        default_args: &'a [String],
    },
    /// One importable unit, resolved by the runtime rather than named as a path.
    Module {
        /// Dotted module name.
        module: &'a str,
        /// Arguments always passed before a caller's own.
        default_args: &'a [String],
    },
}

impl RuntimeExecution<'_> {
    /// The wire `kind` this declaration carries.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            RuntimeExecution::Script { .. } => "python-script",
            RuntimeExecution::Module { .. } => "python-module",
        }
    }

    fn default_args(&self) -> &[String] {
        match self {
            RuntimeExecution::Script { default_args, .. }
            | RuntimeExecution::Module { default_args, .. } => default_args,
        }
    }
}

/// Every payload path a declaration could resolve to, and what to say when none of them does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedExecutionFiles {
    /// Payload paths, any one of which resolving satisfies the declaration.
    pub candidates: Vec<String>,
    /// The message for a box where none of them do.
    pub missing: String,
}

/// One element of a shell-free command line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeArgument {
    /// Passed through exactly as written.
    Literal(String),
    /// A payload-relative path the caller resolves against the box root.
    PayloadPath(String),
}

/// A shell-free command line, before the caller's own arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeInvocation {
    /// The runtime's own entry point.
    pub command: RuntimeArgument,
    /// Everything the box declared.
    pub args: Vec<RuntimeArgument>,
}

/// What a self-test asks the runtime to prove, plus the builder-only extension a scroll may add.
#[derive(Debug, Clone, Copy)]
pub struct SelfTestProbe<'a> {
    /// Modules the box must be able to import.
    pub imports: &'a [String],
    /// Extra source the builder appends; never part of the signed subset.
    pub code: Option<&'a str>,
}

/// What a runtime implies for a box, independent of the machine it runs on.
///
/// The per-runtime rules are function pointers rather than a `match` on [`Self::id`]: a second
/// runtime is then one more entry in [`RUNTIME_ADAPTERS`], which is the whole point of splitting
/// the model in the first place.
#[derive(Debug, Clone, Copy)]
pub struct BoxRuntimeAdapter {
    /// Canonical runtime id, for example `python`.
    pub id: &'static str,
    /// The `execution.kind` values this runtime defines.
    pub execution_kinds: &'static [&'static str],
    /// Inherited variables whose presence can change which code this runtime loads — the runtime
    /// half of the diagnostic list, to which the target adapter adds the operating system's own.
    pub execution_environment_variables: &'static [&'static str],
    layouts: &'static [(&'static str, RuntimeLayout)],
    platform_assertions: &'static [(&'static str, &'static str)],
    resolve: fn(&RuntimeExecution<'_>, &str, &RuntimeLayout, &str) -> Result<ResolvedExecutionFiles>,
}

const PYTHON_EXECUTION_ENVIRONMENT: &[&str] = &[
    "PYTHONPATH",
    "PYTHONHOME",
    "PYTHONSTARTUP",
    "PYTHONBREAKPOINT",
];

const POSIX_PYTHON_LAYOUT: RuntimeLayout = RuntimeLayout {
    root: "venv",
    entry_point: "venv/bin/python",
    scripts_directory: "venv/bin",
    standard_library: "venv/lib",
    executable_suffix: "",
    launcher_kind: "posix-polyglot",
};

const WINDOWS_PYTHON_LAYOUT: RuntimeLayout = RuntimeLayout {
    root: "venv",
    entry_point: "venv/python.exe",
    scripts_directory: "venv/Scripts",
    standard_library: "venv/Lib",
    executable_suffix: ".exe",
    // Reads like a stale reference to a tool this project does not use. It is a frozen wire string
    // under the published format; it is not a typo and must not be "cleaned".
    launcher_kind: "uv-windows-pe",
};

const RUNTIME_ADAPTERS: &[BoxRuntimeAdapter] = &[BoxRuntimeAdapter {
    id: "python",
    execution_kinds: &["python-script", "python-module"],
    execution_environment_variables: PYTHON_EXECUTION_ENVIRONMENT,
    layouts: &[
        ("macos", POSIX_PYTHON_LAYOUT),
        ("linux", POSIX_PYTHON_LAYOUT),
        ("windows", WINDOWS_PYTHON_LAYOUT),
    ],
    platform_assertions: &[
        ("macos", "import sys; assert sys.platform == 'darwin'"),
        ("linux", "import sys; assert sys.platform.startswith('linux')"),
        ("windows", "import sys; assert sys.platform == 'win32'"),
    ],
    resolve: resolve_python_execution_files,
}];

/// The `major.minor` prefix naming the standard-library directory a packed prefix carries.
///
/// A patch component is dropped rather than rejected: a scroll may pin `3.14.2`, and the directory
/// conda-forge writes is `python3.14` either way.
fn python_major_minor(version: &str) -> Result<String> {
    let mut parts = version.split('.');
    let (Some(major), Some(minor)) = (parts.next(), parts.next()) else {
        fail!("Invalid Python version for execution discovery: {version}.");
    };
    if major.is_empty()
        || minor.is_empty()
        || !major.bytes().all(|byte| byte.is_ascii_digit())
        || !minor.bytes().all(|byte| byte.is_ascii_digit())
    {
        fail!("Invalid Python version for execution discovery: {version}.");
    }
    Ok(format!("{major}.{minor}"))
}

fn resolve_python_execution_files(
    execution: &RuntimeExecution<'_>,
    platform: &str,
    layout: &RuntimeLayout,
    runtime_version: &str,
) -> Result<ResolvedExecutionFiles> {
    let module = match execution {
        RuntimeExecution::Script { script, .. } => {
            return Ok(ResolvedExecutionFiles {
                candidates: vec![(*script).to_string()],
                missing: format!("Execution script is missing from the box: {script}."),
            })
        }
        RuntimeExecution::Module { module, .. } => module,
    };
    let module_path = module.replace('.', "/");
    let relative = [
        format!("{module_path}.py"),
        format!("{module_path}/__main__.py"),
    ];
    // Windows names its standard library once, with no interpreter version in the path; every
    // other platform carries `python<major>.<minor>` under it.
    let standard_library = if platform == "windows" {
        layout.standard_library.to_string()
    } else {
        format!(
            "{}/python{}",
            layout.standard_library,
            python_major_minor(runtime_version)?
        )
    };
    let roots = [
        String::new(),
        standard_library.clone(),
        format!("{standard_library}/site-packages"),
    ];
    let candidates = roots
        .iter()
        .flat_map(|root| {
            relative.iter().map(move |candidate| {
                if root.is_empty() {
                    candidate.clone()
                } else {
                    format!("{root}/{candidate}")
                }
            })
        })
        .collect();
    Ok(ResolvedExecutionFiles {
        candidates,
        missing: format!("Execution module is not discoverable in the box: {module}."),
    })
}

impl BoxRuntimeAdapter {
    /// Where this runtime sits inside a box built for `platform`.
    ///
    /// # Errors
    ///
    /// When the runtime has no layout for that platform.
    pub fn layout(&self, platform: &str) -> Result<&'static RuntimeLayout> {
        let Some((_, layout)) = self.layouts.iter().find(|(name, _)| *name == platform) else {
            fail!("No {} runtime layout exists for platform {platform}", self.id);
        };
        Ok(layout)
    }

    /// Payload paths this runtime requires the executable bit on.
    ///
    /// # Errors
    ///
    /// When the runtime has no layout for that platform.
    pub fn executable_payload_paths(&self, platform: &str) -> Result<ExecutablePayloadPaths> {
        let layout = self.layout(platform)?;
        // The interpreter by name, and the console-script directory wholesale. A conda prefix
        // generates that directory's contents at solve time and nothing declares them, so the rule
        // is the only way they can carry the bit at all.
        Ok(ExecutablePayloadPaths {
            files: std::slice::from_ref(&layout.entry_point),
            directories: std::slice::from_ref(&layout.scripts_directory),
        })
    }

    /// Every payload path a declaration could resolve to, and what to say when none of them does.
    ///
    /// # Errors
    ///
    /// When the execution kind is not this runtime's, the platform is unknown, or the runtime
    /// version cannot name a standard library.
    pub fn resolve_execution_files(
        &self,
        execution: &RuntimeExecution<'_>,
        platform: &str,
        runtime_version: &str,
    ) -> Result<ResolvedExecutionFiles> {
        if !self.execution_kinds.contains(&execution.kind()) {
            fail!("Unsupported execution kind: {}.", execution.kind());
        }
        let layout = self.layout(platform)?;
        (self.resolve)(execution, platform, layout, runtime_version)
    }

    /// The shell-free command line that runs a declaration, in payload-relative terms.
    ///
    /// # Errors
    ///
    /// When the execution kind is not this runtime's, or the platform is unknown.
    pub fn build_argv(
        &self,
        execution: &RuntimeExecution<'_>,
        platform: &str,
    ) -> Result<RuntimeInvocation> {
        if !self.execution_kinds.contains(&execution.kind()) {
            fail!("Unsupported execution kind: {}.", execution.kind());
        }
        let layout = self.layout(platform)?;
        let mut args = match execution {
            RuntimeExecution::Script { script, .. } => {
                vec![RuntimeArgument::PayloadPath((*script).to_string())]
            }
            RuntimeExecution::Module { module, .. } => vec![
                RuntimeArgument::Literal("-m".to_string()),
                RuntimeArgument::Literal((*module).to_string()),
            ],
        };
        args.extend(
            execution
                .default_args()
                .iter()
                .map(|value| RuntimeArgument::Literal(value.clone())),
        );
        Ok(RuntimeInvocation {
            command: RuntimeArgument::PayloadPath(layout.entry_point.to_string()),
            args,
        })
    }

    /// The arguments that follow this runtime's entry point when it runs a self-test probe.
    ///
    /// # Errors
    ///
    /// When the runtime has no platform assertion for that platform.
    pub fn self_test_argv(&self, probe: &SelfTestProbe<'_>, platform: &str) -> Result<Vec<String>> {
        let Some((_, assertion)) = self
            .platform_assertions
            .iter()
            .find(|(name, _)| *name == platform)
        else {
            fail!(
                "No {} self-test assertion exists for platform {platform}",
                self.id
            );
        };
        let imports = format!("import {}", probe.imports.join(", "));
        let code = match probe.code {
            Some(extra) => format!("{assertion}\n{imports}\n{extra}"),
            None => format!("{assertion}\n{imports}"),
        };
        Ok(vec!["-c".to_string(), code])
    }
}

/// Returns the runtime adapter for a runtime id.
///
/// # Errors
///
/// When no runtime with that id exists.
pub fn runtime_adapter(runtime_id: &str) -> Result<&'static BoxRuntimeAdapter> {
    let Some(adapter) = RUNTIME_ADAPTERS
        .iter()
        .find(|candidate| candidate.id == runtime_id)
    else {
        fail!("No box runtime adapter exists for {runtime_id}");
    };
    Ok(adapter)
}

/// Lists every runtime adapter, for contract tests and for callers enumerating what a box may be.
#[must_use]
pub fn runtime_adapters() -> &'static [BoxRuntimeAdapter] {
    RUNTIME_ADAPTERS
}

/// The runtime every box built by this schema version implicitly declares.
///
/// The wire format has no runtime field: a box records a Python entry point and Python execution
/// kinds and nothing that says "Python". So a reader that must name a runtime names this one, from
/// one place.
pub const IMPLICIT_RUNTIME_ID: &str = "python";

/// The complete list of inherited variables that can change what a box executes.
///
/// Two halves, because they have two owners: the runtime contributes the variables its own loader
/// reads, and the target contributes the operating system's dynamic-linker controls. The order is
/// what a diagnostic report is printed in, so it is part of the answer.
///
/// # Errors
///
/// When no runtime with that id exists.
pub fn execution_affecting_variables(
    runtime_id: &str,
    adapter: &super::targets::BoxTargetAdapter,
) -> Result<Vec<&'static str>> {
    let runtime = runtime_adapter(runtime_id)?;
    Ok(runtime
        .execution_environment_variables
        .iter()
        .chain(adapter.execution_affecting_environment_variables.iter())
        .copied()
        .collect())
}

/// Ensures a declared entry point agrees with where the runtime actually sits in the payload.
///
/// # Errors
///
/// When the entry point is not the one the runtime defines for this target.
pub fn assert_runtime_entry_point(
    runtime_id: &str,
    adapter: &super::targets::BoxTargetAdapter,
    entry_point: &str,
) -> Result<()> {
    let expected = runtime_adapter(runtime_id)?.layout(adapter.platform)?.entry_point;
    if entry_point != expected {
        // The wording still names Python because the wire format still does: a release declares
        // `pythonEntryPoint`, and an error that called it something else would name a field nobody
        // can find.
        fail!("{} boxes must use Python entry point {expected}", adapter.id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        python_major_minor, runtime_adapter, RuntimeArgument, RuntimeExecution, SelfTestProbe,
        IMPLICIT_RUNTIME_ID,
    };

    #[test]
    fn a_runtime_the_format_does_not_define_is_refused() {
        assert!(runtime_adapter("node").is_err());
        assert!(runtime_adapter("").is_err());
        assert!(runtime_adapter(IMPLICIT_RUNTIME_ID).is_ok());
    }

    #[test]
    fn a_platform_with_no_layout_is_refused_rather_than_guessed() {
        let python = runtime_adapter(IMPLICIT_RUNTIME_ID).unwrap();
        assert!(python.layout("plan9").is_err());
        assert!(python.layout("linux").is_ok());
    }

    #[test]
    fn a_module_never_becomes_a_payload_path() {
        let python = runtime_adapter(IMPLICIT_RUNTIME_ID).unwrap();
        let default_args = vec![];
        let invocation = python
            .build_argv(
                &RuntimeExecution::Module {
                    module: "example_model.main",
                    default_args: &default_args,
                },
                "linux",
            )
            .unwrap();
        assert_eq!(
            invocation.command,
            RuntimeArgument::PayloadPath("venv/bin/python".to_string())
        );
        assert!(invocation
            .args
            .iter()
            .all(|argument| matches!(argument, RuntimeArgument::Literal(_))));
    }

    #[test]
    fn a_python_version_that_cannot_locate_a_standard_library_is_refused() {
        assert_eq!(python_major_minor("3.11.9").unwrap(), "3.11");
        assert_eq!(python_major_minor("3.12").unwrap(), "3.12");
        for invalid in ["", "3", "3.x", "x.1", "3."] {
            assert!(python_major_minor(invalid).is_err(), "{invalid} was accepted");
        }
    }

    #[test]
    fn a_self_test_opens_with_the_platform_it_was_built_for() {
        let python = runtime_adapter(IMPLICIT_RUNTIME_ID).unwrap();
        let imports = vec!["json".to_string()];
        let argv = python
            .self_test_argv(&SelfTestProbe { imports: &imports, code: None }, "macos")
            .unwrap();
        assert_eq!(argv[0], "-c");
        assert!(argv[1].starts_with("import sys; assert sys.platform == 'darwin'"));
        assert!(python
            .self_test_argv(&SelfTestProbe { imports: &imports, code: None }, "plan9")
            .is_err());
    }
}
