import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from reporter import Reporter


def test_record_pass_appends_result():
    r = Reporter("Suite", "dev")
    r.record("auth works", True)
    assert r.results == [("auth works", True, "")]


def test_record_fail_stores_detail():
    r = Reporter("Suite", "dev")
    r.record("status check", False, "expected 200, got 404")
    assert r.results[0] == ("status check", False, "expected 200, got 404")


def test_write_summary_returns_true_when_all_pass(capsys):
    r = Reporter("Suite", "dev")
    r.record("check 1", True)
    r.record("check 2", True)
    result = r.write_summary()
    assert result is True


def test_write_summary_returns_false_when_any_fail(capsys):
    r = Reporter("Suite", "dev")
    r.record("check 1", True)
    r.record("check 2", False, "wrong value")
    result = r.write_summary()
    assert result is False


def test_write_summary_output_contains_pass_and_fail_counts(capsys):
    r = Reporter("Suite", "dev")
    r.record("a", True)
    r.record("b", False, "oops")
    r.write_summary()
    out = capsys.readouterr().out
    assert "1 passed" in out
    assert "1 failed" in out


def test_write_summary_writes_to_github_step_summary(tmp_path):
    summary_file = tmp_path / "summary.md"
    os.environ["GITHUB_STEP_SUMMARY"] = str(summary_file)
    r = Reporter("Suite", "dev")
    r.record("a", True)
    r.write_summary()
    del os.environ["GITHUB_STEP_SUMMARY"]
    content = summary_file.read_text()
    assert "Suite" in content
    assert "✓ PASS" in content
