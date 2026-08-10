"""Make the successful box run obvious before showing its small runtime proof.

The demo stays standard-library only: reaching this script already proves that the packed
interpreter was verified, relocated, and started. The output leads with that outcome instead of
making a newcomer interpret temporary paths to discover it.
"""

import platform
import sys


def main() -> int:
    system = platform.system()
    host = {"Darwin": "macOS"}.get(system, system or "unknown")

    print("Hello from inside a Scrollcase box!")
    print()
    print("  signed -> verified -> relocated -> running")
    print()
    print("Success: the box's own Python runtime executed this program.")
    print("No dependencies were resolved or installed to make this run.")
    print()
    print(f"  Runtime  Python {sys.version.split()[0]}")
    print(f"  Host     {host} / {platform.machine() or 'unknown'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
