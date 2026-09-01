"""Every third-party module the package imports must be a declared dependency.

`referencing` was imported for the schema registry and never declared: it arrived only because
`jsonschema` happens to depend on it today. That works until the day it does not, and a conda-forge
submission — where the declared run requirements are what the solver builds an environment from —
makes the omission a packaging bug rather than a latent one. This walks the shipped source instead
of trusting the list to stay correct by hand.
"""

from __future__ import annotations

import ast
import re
import sys
import unittest
from importlib.metadata import packages_distributions
from pathlib import Path

PACKAGE = "scrollcase_consumer"


def normalize(name: str) -> str:
    """PEP 503 name normalization, so `types-jsonschema` and `types_jsonschema` are one name."""

    return re.sub(r"[-_.]+", "-", name).lower()


def declared_dependencies(pyproject: str) -> set[str]:
    """The normalized names in `[project] dependencies`, read as text.

    The runtime list is a flat array of literals, and reading it this way keeps the test free of a
    TOML parser the package itself does not need on Python 3.10.
    """

    lines = iter(pyproject.splitlines())
    for line in lines:
        if line.startswith("dependencies = ["):
            break
    else:  # pragma: no cover - the array is what this module exists to read.
        raise AssertionError("pyproject.toml declares no [project] dependencies array")

    names: set[str] = set()
    for line in lines:
        if line.startswith("]"):
            return names
        requirement = line.strip().strip(",").strip('"')
        if requirement:
            # Split on the first character that can follow a name in a PEP 508 requirement.
            names.add(normalize(re.split(r"[<>=!~;\[ ]", requirement, maxsplit=1)[0]))
    raise AssertionError("the dependencies array is unterminated")


def imported_roots(source: Path) -> set[str]:
    """The absolute top-level modules one file imports, relative imports excluded."""

    roots: set[str] = set()
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            roots.add(node.module.split(".")[0])
    return roots


class DeclaredDependencyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.python_root = Path(__file__).resolve().parents[1]
        self.declared = declared_dependencies(
            (self.python_root / "pyproject.toml").read_text(encoding="utf-8")
        )
        self.sources = sorted((self.python_root / "src" / PACKAGE).rglob("*.py"))

    def third_party_imports(self) -> dict[str, set[Path]]:
        """Third-party module roots the package imports, each with the files that import it."""

        # An installed distribution can publish a module under a different name; ask the metadata
        # rather than assume `import x` means a distribution called `x`.
        distributions = packages_distributions()
        found: dict[str, set[Path]] = {}
        for source in self.sources:
            for root in imported_roots(source):
                if root in sys.stdlib_module_names or root in {"__future__", PACKAGE}:
                    continue
                for distribution in distributions.get(root, [root]):
                    found.setdefault(normalize(distribution), set()).add(source)
        return found

    def test_finds_the_modules_it_is_meant_to_check(self) -> None:
        # Guard the guard: a walk that silently found nothing would pass every assertion below.
        self.assertGreater(len(self.sources), 1)
        self.assertIn("jsonschema", self.third_party_imports())

    def test_every_third_party_import_is_declared(self) -> None:
        for distribution, sources in sorted(self.third_party_imports().items()):
            with self.subTest(distribution=distribution):
                where = ", ".join(
                    sorted(str(source.relative_to(self.python_root)) for source in sources)
                )
                self.assertIn(
                    distribution,
                    self.declared,
                    f"{distribution} is imported by {where} but not in [project] dependencies",
                )

    def test_declares_referencing_rather_than_inheriting_it(self) -> None:
        # The specific omission the conda-forge review caught, named so a future edit that drops
        # it again fails with the reason attached.
        self.assertIn("referencing", self.declared)


if __name__ == "__main__":
    unittest.main()
