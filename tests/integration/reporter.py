import os
from datetime import datetime, timezone


class Reporter:
    def __init__(self, suite_name: str, environment: str):
        self.suite_name = suite_name
        self.environment = environment
        self.results: list[tuple[str, bool, str]] = []

    def record(self, label: str, passed: bool, detail: str = "") -> None:
        self.results.append((label, passed, detail))
        mark = "✓ PASS" if passed else "✗ FAIL"
        line = f"  {mark}  {label}"
        if not passed and detail:
            line += f" [{detail}]"
        print(line)

    def write_summary(self) -> bool:
        passed = sum(1 for _, ok, _ in self.results if ok)
        failed = len(self.results) - passed
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        width = 64

        lines = [
            f"FOLIO {self.suite_name.upper()} — {now} ({self.environment})",
            "─" * width,
        ]
        for label, ok, detail in self.results:
            mark = "✓ PASS" if ok else "✗ FAIL"
            row = f"{mark}  {label}"
            if not ok and detail:
                row += f" [{detail}]"
            lines.append(row)
        lines += ["─" * width, f"{passed} passed, {failed} failed"]

        report = "\n".join(lines)
        print(f"\n{report}")

        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            with open(summary_path, "a") as f:
                f.write(f"\n### {self.suite_name} Results\n\n```\n{report}\n```\n")

        return failed == 0
