"""Clean Architecture, as a test.

The contracts live in pyproject.toml under [tool.importlinter]: layers point
inward (presentation → application → domain), the domain imports no framework,
application code depends on ports rather than adapters, infrastructure never
reaches up, and routes get adapters only through the composition root
(presentation/dependencies.py). CI also runs `lint-imports` directly; this
test makes a local `pytest` catch the same break before a push.
"""

from pathlib import Path

import pytest
from importlinter.cli import lint_imports

PYPROJECT = Path(__file__).resolve().parents[2] / "pyproject.toml"


@pytest.mark.unit
def test_import_contracts_hold() -> None:
    exit_code = lint_imports(
        config_filename=str(PYPROJECT), no_cache=True, no_logo=True
    )
    assert exit_code == 0, (
        "An import contract is broken; run `lint-imports` for details."
    )
