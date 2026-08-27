//! Static execution prerequisites.
//!
//! Execution metadata is not a command string: it names either one regular payload file or one
//! importable unit of the box's runtime. Checking the file set proves those names can resolve
//! without importing a package, running an `__init__.py`, or starting the application — so the
//! check itself cannot be the thing that executes box code before the trust chain has finished.
//!
//! Which paths a declaration could resolve to is a runtime question, asked of
//! [`crate::contract::runtimes`] rather than answered here. What stays is the path-safety rule
//! every candidate goes through.

use std::collections::BTreeSet;

use crate::contract::runtimes::runtime_adapter;
use crate::contract::targets::BoxTargetAdapter;
use crate::error::{Error, Result};
use crate::path::safe_relative_path;
use crate::release::Execution;

/// Confirms optional execution metadata names something runnable in a payload or archive.
///
/// `files` must hold only regular entries: a link resolves, but the thing that finally runs has to
/// be a file, and the caller decides which of the two questions it is asking.
///
/// # Errors
///
/// When the script is missing, or the module resolves to nothing.
pub fn assert_execution_files(
    execution: Option<&Execution>,
    adapter: &BoxTargetAdapter,
    runtime_id: &str,
    runtime_version: &str,
    files: &BTreeSet<String>,
) -> Result<()> {
    let Some(execution) = execution else {
        return Ok(());
    };
    let runtime = runtime_adapter(runtime_id)?;
    let resolved = runtime.resolve_execution_files(
        &execution.as_runtime(),
        adapter.platform,
        runtime_version,
    )?;
    // Every candidate goes through the traversal rule, not just the one a scroll wrote by hand: a
    // path the format derived is still a path this process is about to look for.
    for candidate in &resolved.candidates {
        if files.contains(&safe_relative_path(candidate)?) {
            return Ok(());
        }
    }
    Err(Error::new(resolved.missing))
}

#[cfg(test)]
mod tests {
    use super::assert_execution_files;
    use crate::contract::targets::{box_target_adapter, BoxTarget};
    use crate::release::Execution;
    use std::collections::BTreeSet;

    fn adapter(
        platform: &str,
        arch: &str,
        accelerator: &str,
    ) -> &'static crate::contract::targets::BoxTargetAdapter {
        box_target_adapter(&BoxTarget {
            platform: platform.to_string(),
            arch: arch.to_string(),
            accelerator: accelerator.to_string(),
            cuda_version: None,
        })
        .unwrap()
    }

    fn files(paths: &[&str]) -> BTreeSet<String> {
        paths.iter().map(|path| (*path).to_string()).collect()
    }

    #[test]
    fn a_script_must_exist_as_a_regular_entry() {
        let adapter = adapter("linux", "x86_64", "cpu");
        let execution = Execution::PythonScript {
            script: "app/main.py".to_string(),
            default_args: vec![],
        };
        assert!(
            assert_execution_files(Some(&execution), adapter, "python", "3.11.9", &files(&["app/main.py"]))
                .is_ok()
        );
        let error =
            assert_execution_files(Some(&execution), adapter, "python", "3.11.9", &files(&["app/other.py"]))
                .unwrap_err();
        assert!(error.message().contains("Execution script is missing"), "{error}");
    }

    #[test]
    fn a_module_resolves_through_any_of_its_legitimate_locations() {
        let adapter = adapter("linux", "x86_64", "cpu");
        let execution = Execution::PythonModule {
            module: "example_model.main".to_string(),
            default_args: vec![],
        };
        for location in [
            "example_model/main.py",
            "example_model/main/__main__.py",
            "venv/lib/python3.11/example_model/main.py",
            "venv/lib/python3.11/site-packages/example_model/main.py",
            "venv/lib/python3.11/site-packages/example_model/main/__main__.py",
        ] {
            assert!(
                assert_execution_files(Some(&execution), adapter, "python", "3.11.9", &files(&[location]))
                    .is_ok(),
                "{location} did not resolve"
            );
        }
        let error =
            assert_execution_files(Some(&execution), adapter, "python", "3.11.9", &files(&["elsewhere.py"]))
                .unwrap_err();
        assert!(
            error.message().contains("Execution module is not discoverable"),
            "{error}"
        );
    }

    #[test]
    fn windows_looks_in_its_own_standard_library() {
        let windows = adapter("windows", "x86_64", "cpu");
        let execution = Execution::PythonModule {
            module: "pkg".to_string(),
            default_args: vec![],
        };
        assert!(assert_execution_files(
            Some(&execution),
            windows,
            "python",
            "3.11.9",
            &files(&["venv/Lib/site-packages/pkg/__main__.py"])
        )
        .is_ok());
        // The POSIX layout must not resolve on a Windows target.
        assert!(assert_execution_files(
            Some(&execution),
            windows,
            "python",
            "3.11.9",
            &files(&["venv/lib/python3.11/site-packages/pkg/__main__.py"])
        )
        .is_err());
    }

    #[test]
    fn a_runtime_version_that_cannot_locate_a_standard_library_is_refused() {
        let adapter = adapter("linux", "x86_64", "cpu");
        let execution = Execution::PythonModule {
            module: "pkg".to_string(),
            default_args: vec![],
        };
        for invalid in ["", "3", "3.x", "x.1", "3."] {
            assert!(
                assert_execution_files(Some(&execution), adapter, "python", invalid, &files(&[])).is_err(),
                "{invalid} was accepted"
            );
        }
    }

    #[test]
    fn a_library_only_box_declares_no_execution() {
        let adapter = adapter("macos", "aarch64", "metal");
        assert!(assert_execution_files(None, adapter, "python", "3.11.9", &files(&[])).is_ok());
    }
}
