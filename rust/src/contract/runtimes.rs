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
    /// A compiled executable the box carries, run with no interpreter in front of it.
    ///
    /// Named by the format so implementing the runtime is code rather than another wire break. No
    /// adapter answers for it yet, so a box declaring it is refused by name.
    Binary {
        /// Payload-relative path to the executable.
        binary: &'a str,
        /// Arguments always passed before a caller's own.
        default_args: &'a [String],
    },
}

impl RuntimeExecution<'_> {
    /// The wire `kind` this declaration carries, for the runtime that owns it.
    ///
    /// The kind is `<runtime>-<shape>`, so the shape alone does not name it: a script belongs to
    /// `python` or to `node` depending on the box, and the caller says which.
    #[must_use]
    pub fn kind(&self, runtime_id: &str) -> String {
        let shape = match self {
            RuntimeExecution::Script { .. } => "script",
            RuntimeExecution::Module { .. } => "module",
            RuntimeExecution::Binary { .. } => "binary",
        };
        format!("{runtime_id}-{shape}")
    }

    fn default_args(&self) -> &[String] {
        match self {
            RuntimeExecution::Script { default_args, .. }
            | RuntimeExecution::Module { default_args, .. }
            | RuntimeExecution::Binary { default_args, .. } => default_args,
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

/// One invocation a self-test probe asks for, borrowed from whatever document carried it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SelfTestCommand<'a> {
    /// Arguments appended to the box's declared execution.
    pub args: &'a [String],
    /// The status the invocation must exit with.
    pub expect_exit_code: u8,
}

/// What a self-test asks the box to prove, plus the builder-only extension a scroll may add.
///
/// `imports` asks the runtime's loader a question and only means something to a runtime that has
/// one. `commands` asks the box's declared execution a question, which every runtime can answer and
/// a native one can answer *only* that way. `code` never travels on the wire.
#[derive(Debug, Clone, Copy)]
pub struct SelfTestProbe<'a> {
    /// Modules the box must be able to import.
    pub imports: &'a [String],
    /// Invocations of the box's declared execution.
    pub commands: &'a [SelfTestCommand<'a>],
    /// Extra source the builder appends; never part of the signed probe.
    pub code: Option<&'a str>,
}

/// One command a self-test runs, and the status it must exit with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfTestInvocation {
    /// The command to run.
    pub command: RuntimeArgument,
    /// Everything before the caller's own arguments.
    pub args: Vec<RuntimeArgument>,
    /// The status it must produce.
    pub expect_exit_code: u8,
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
        // Unreachable: `resolve_execution_files` refuses a kind that is not this runtime's before
        // it gets here, and `python` defines only the two above.
        RuntimeExecution::Binary { .. } => fail!("Unsupported execution kind: {}.", execution.kind("python")),
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
        self.assert_own_kind(execution)?;
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
        self.assert_own_kind(execution)?;
        let layout = self.layout(platform)?;
        let mut args = match execution {
            RuntimeExecution::Script { script, .. } => {
                vec![RuntimeArgument::PayloadPath((*script).to_string())]
            }
            RuntimeExecution::Module { module, .. } => vec![
                RuntimeArgument::Literal("-m".to_string()),
                RuntimeArgument::Literal((*module).to_string()),
            ],
            RuntimeExecution::Binary { binary, .. } => {
                vec![RuntimeArgument::PayloadPath((*binary).to_string())]
            }
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

    /// Refuses an execution kind belonging to another runtime.
    fn assert_own_kind(&self, execution: &RuntimeExecution<'_>) -> Result<()> {
        let kind = execution.kind(self.id);
        if !self.execution_kinds.contains(&kind.as_str()) {
            fail!("Unsupported execution kind: {kind}.");
        }
        Ok(())
    }

    /// Every command a self-test probe implies, in declaration order.
    ///
    /// # Errors
    ///
    /// When the runtime has no platform assertion for that platform, or a command probe arrives
    /// with no declared execution to invoke.
    pub fn self_test_invocations(
        &self,
        probe: &SelfTestProbe<'_>,
        execution: Option<&RuntimeExecution<'_>>,
        platform: &str,
    ) -> Result<Vec<SelfTestInvocation>> {
        let mut invocations = Vec::new();
        if !probe.imports.is_empty() {
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
            invocations.push(SelfTestInvocation {
                command: RuntimeArgument::PayloadPath(
                    self.layout(platform)?.entry_point.to_string(),
                ),
                args: vec![
                    RuntimeArgument::Literal("-c".to_string()),
                    RuntimeArgument::Literal(code),
                ],
                expect_exit_code: 0,
            });
        }
        for command in probe.commands {
            // A command probe appends arguments to the box's own declared execution. With none
            // declared there is nothing to append them to, which is a contradiction in the
            // declaration rather than a property of the box.
            let Some(execution) = execution else {
                fail!("A self-test command needs a declared execution to invoke");
            };
            let invocation = self.build_argv(execution, platform)?;
            let mut args = invocation.args;
            args.extend(
                command
                    .args
                    .iter()
                    .map(|value| RuntimeArgument::Literal(value.clone())),
            );
            invocations.push(SelfTestInvocation {
                command: invocation.command,
                args,
                expect_exit_code: command.expect_exit_code,
            });
        }
        Ok(invocations)
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

/// Every runtime id the box format admits, in the order the schema lists them.
///
/// The wire enum and the implemented set are deliberately two different things: schema version 3
/// fixes the vocabulary once, so a later release can implement `node` without another wire break.
/// A box naming a runtime this crate has no adapter for is refused by name, not misread.
pub const RUNTIME_IDS: &[&str] = &["python", "node", "native"];

/// Whether this build carries an adapter for a runtime id — the question every caller asks before
/// [`runtime_adapter`], which fails rather than returning nothing.
#[must_use]
pub fn is_implemented_runtime(runtime_id: &str) -> bool {
    RUNTIME_ADAPTERS
        .iter()
        .any(|adapter| adapter.id == runtime_id)
}

/// The message for a box declaring a runtime this build has no adapter for.
///
/// The wire vocabulary is fixed and the implemented set is not, so this case is expected rather
/// than exceptional, and the wording says which of the two the box fell foul of.
#[must_use]
pub fn unimplemented_runtime_message(runtime_id: &str) -> String {
    let implemented: Vec<&str> = RUNTIME_ADAPTERS.iter().map(|adapter| adapter.id).collect();
    if RUNTIME_IDS.contains(&runtime_id) {
        format!(
            "Runtime {runtime_id} is not implemented by this version of Scrollcase; it implements {}.",
            implemented.join(", ")
        )
    } else {
        format!(
            "Unknown runtime: {runtime_id}. The box format defines {}.",
            RUNTIME_IDS.join(", ")
        )
    }
}

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
    let runtime = runtime_adapter(runtime_id)?;
    let expected = runtime.layout(adapter.platform)?.entry_point;
    if entry_point != expected {
        fail!(
            "{} boxes with the {} runtime must use entry point {expected}",
            adapter.id,
            runtime.id
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        is_implemented_runtime, python_major_minor, runtime_adapter, unimplemented_runtime_message,
        RuntimeArgument, RuntimeExecution, SelfTestCommand, SelfTestProbe, RUNTIME_IDS,
    };

    const PYTHON: &str = "python";

    #[test]
    fn a_runtime_this_build_has_no_adapter_for_is_refused_by_name() {
        // The wire vocabulary is wider than the implemented set on purpose, and the two refusals
        // say which of the two the box fell foul of.
        assert!(RUNTIME_IDS.contains(&"native"));
        assert!(runtime_adapter("native").is_err());
        assert!(!is_implemented_runtime("native"));
        assert!(unimplemented_runtime_message("native").contains("not implemented by this version"));
        assert!(unimplemented_runtime_message("ruby").contains("Unknown runtime"));
        assert!(runtime_adapter("").is_err());
        assert!(runtime_adapter(PYTHON).is_ok());
        assert!(is_implemented_runtime(PYTHON));
    }

    #[test]
    fn a_platform_with_no_layout_is_refused_rather_than_guessed() {
        let python = runtime_adapter(PYTHON).unwrap();
        assert!(python.layout("plan9").is_err());
        assert!(python.layout("linux").is_ok());
    }

    #[test]
    fn a_module_never_becomes_a_payload_path() {
        let python = runtime_adapter(PYTHON).unwrap();
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
        let python = runtime_adapter(PYTHON).unwrap();
        let imports = vec!["json".to_string()];
        let probe = SelfTestProbe { imports: &imports, commands: &[], code: None };
        let invocations = python.self_test_invocations(&probe, None, "macos").unwrap();
        assert_eq!(invocations.len(), 1);
        assert_eq!(
            invocations[0].args[0],
            RuntimeArgument::Literal("-c".to_string())
        );
        let RuntimeArgument::Literal(code) = &invocations[0].args[1] else {
            panic!("self-test source is not a literal");
        };
        assert!(code.starts_with("import sys; assert sys.platform == 'darwin'"));
        assert!(python.self_test_invocations(&probe, None, "plan9").is_err());
    }

    #[test]
    fn a_command_probe_needs_an_execution_to_invoke() {
        let python = runtime_adapter(PYTHON).unwrap();
        let args = vec!["--version".to_string()];
        let commands = [SelfTestCommand { args: &args, expect_exit_code: 2 }];
        let probe = SelfTestProbe { imports: &[], commands: &commands, code: None };
        let error = python
            .self_test_invocations(&probe, None, "linux")
            .unwrap_err();
        assert!(error.message().contains("needs a declared execution"), "{error}");

        let default_args = vec![];
        let execution = RuntimeExecution::Script { script: "app/main.py", default_args: &default_args };
        let invocations = python
            .self_test_invocations(&probe, Some(&execution), "linux")
            .unwrap();
        assert_eq!(invocations.len(), 1);
        assert_eq!(invocations[0].expect_exit_code, 2);
        assert_eq!(
            invocations[0].args,
            vec![
                RuntimeArgument::PayloadPath("app/main.py".to_string()),
                RuntimeArgument::Literal("--version".to_string()),
            ]
        );
    }
}
