"""
Safety tests — catch infinite loops, runaway requests, and resource exhaustion.

These tests exist because of a real incident: a reactive effect caused infinite
API requests when the DB was empty, pegging the CPU and consuming all available
memory. Every test here guards against a specific failure mode.

See: docs/guides/frontend-safety.md

CUSTOMIZE: Replace skip reasons, URLs, selectors, and API patterns with your
project's specifics, then remove the @pytest.mark.skip decorators.
"""

import pytest
from playwright.sync_api import Page


MAX_REQUESTS_THRESHOLD = 5


@pytest.mark.skip(reason="CUSTOMIZE: Set page_url fixture and API pattern")
class TestReactiveLoopSafety:
    """Verify that no tab/filter combination causes unbounded API requests.

    Pattern: Intercept routes, count API calls, assert below threshold.
    Adapt the URL pattern and tab/filter selectors to your UI.
    """

    def test_tab_switch_empty_db_no_infinite_requests(self, page: Page):
        """Switching tabs with 0 data must not cause an infinite fetch loop."""
        request_count = 0

        def count_api_calls(route):
            nonlocal request_count
            if "/api/" in route.request.url:
                request_count += 1
            route.continue_()

        page.route("**/*", count_api_calls)
        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        request_count = 0  # Reset after initial page load

        # CUSTOMIZE: Click your tab/navigation element
        page.click("text=Your Tab Name")
        page.wait_for_timeout(3000)

        assert request_count <= MAX_REQUESTS_THRESHOLD, (
            f"Detected {request_count} API calls after tab switch with empty DB. "
            f"Max allowed: {MAX_REQUESTS_THRESHOLD}. Likely infinite loop."
        )

    def test_filter_buttons_empty_db_no_infinite_requests(self, page: Page):
        """Clicking filter buttons with empty DB must not loop."""
        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")

        # CUSTOMIZE: List your filter button labels
        filters = ["Filter A", "Filter B", "Filter C"]
        for label in filters:
            btn = page.locator(f"text={label}")
            if not btn.is_visible():
                continue

            request_count = 0

            def count_api_calls(route):
                nonlocal request_count
                if "/api/" in route.request.url:
                    request_count += 1
                route.continue_()

            page.route("**/*", count_api_calls)
            btn.click()
            page.wait_for_timeout(2000)
            page.unroute("**/*")

            assert request_count <= MAX_REQUESTS_THRESHOLD, (
                f"Filter '{label}' triggered {request_count} API calls with empty DB. "
                f"Max allowed: {MAX_REQUESTS_THRESHOLD}."
            )

    def test_rapid_tab_switching_no_request_explosion(self, page: Page):
        """Rapidly switching tabs must not accumulate unbounded requests."""
        request_count = 0

        def count_api_calls(route):
            nonlocal request_count
            if "/api/" in route.request.url:
                request_count += 1
            route.continue_()

        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")

        page.route("**/*", count_api_calls)

        # CUSTOMIZE: Replace with your tab selectors
        for _ in range(10):
            page.click("text=Tab A")
            page.wait_for_timeout(100)
            page.click("text=Tab B")
            page.wait_for_timeout(100)

        page.wait_for_timeout(2000)

        assert request_count <= 15, (
            f"Rapid tab switching caused {request_count} API calls. "
            f"Expected deduplication or caching to limit requests."
        )


@pytest.mark.skip(reason="CUSTOMIZE: Set page_url fixture and selectors")
class TestConsoleErrors:
    """Verify no JavaScript errors in any UI state."""

    def test_no_console_errors_loaded_state(self, page: Page):
        """Normal page load with data should produce zero JS errors."""
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        assert len(errors) == 0, f"Console errors on loaded page: {errors}"

    def test_no_console_errors_empty_state(self, page: Page):
        """Empty DB state should produce zero JS errors."""
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        assert len(errors) == 0, f"Console errors on empty page: {errors}"

    def test_no_object_object_in_dom(self, page: Page):
        """[object Object] in the DOM means an unserialized error leaked to the UI."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        body_text = page.locator("body").inner_text()
        assert "[object Object]" not in body_text, (
            "Found '[object Object]' rendered in the DOM — "
            "an error object is being displayed as a string."
        )
