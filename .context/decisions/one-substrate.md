# One substrate: pixi + conda-pack + conda-forge

**Decided at the start of the project, and restated every time a second backend has been proposed.**

Scrollcase solves dependencies with `pixi` against a committed `pixi.lock`, relocates the resulting
prefix with `conda-pack`, and extracts the tree into the box's `venv`. Packages come from
conda-forge. There is no second dependency backend, and adding one is a change to what the product
*is*, not a feature.

**Why.** Every guarantee Scrollcase makes — a byte-identical rebuild, a lock-derived licence
inventory, a self-test run by the box's own interpreter, a relocatable prefix on three operating
systems — has to hold for each backend separately, and each has to be proven separately on all three
targets. Two backends means proving everything twice, and the guarantees are the product.

**Rejected:** a pip/PyPI path "for packages conda-forge does not carry", and, later, a generic
"bring your own environment" mode. Both trade the thing that makes a box worth signing for
convenience that the scroll's author can get by asking conda-forge for the package instead.

**What this does not close.** The *runtime* seam is orthogonal: `python`, `node` and `native` all
come out of the same conda-forge solve, which is exactly why three runtimes cost one substrate. See
[`version-3-is-a-clean-break.md`](version-3-is-a-clean-break.md).
