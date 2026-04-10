"""
Behavioral tests — verify UI interactions produce correct outcomes.

Tests common user flows: tab switching, filtering, empty states,
and data display integrity.

CUSTOMIZE: Replace skip reasons, URLs, selectors, and assertions with your
project's specifics, then remove the @pytest.mark.skip decorators.
"""

import re
import pytest
from playwright.sync_api import Page, expect


@pytest.mark.skip(reason="CUSTOMIZE: Set empty_page_url fixture and selectors")
class TestEmptyState:
    """UI must handle zero data gracefully."""

    def test_default_view_shows_empty_message(self, page: Page):
        """Default view with empty DB should show a helpful message."""
        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        body = page.locator("body").inner_text()
        # CUSTOMIZE: Replace with your expected empty-state phrases
        assert any(phrase in body.lower() for phrase in [
            "no results", "no data", "get started", "empty"
        ]), "Default view with empty DB should show a helpful empty-state message"

    def test_secondary_view_shows_empty_message(self, page: Page):
        """Secondary tab/view with empty DB should also show empty state."""
        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")

        # CUSTOMIZE: Click your secondary tab
        page.click("text=Your Secondary Tab")
        page.wait_for_timeout(2000)

        body = page.locator("body").inner_text()
        assert any(phrase in body.lower() for phrase in [
            "no results", "no data", "empty"
        ]), "Secondary view with empty DB should show an empty-state message"

    def test_no_nan_or_undefined_in_dom(self, page: Page):
        """Empty state must not leak NaN, undefined, or [object Object]."""
        # CUSTOMIZE: Use your empty_page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        body = page.locator("body").inner_text()
        assert "[object Object]" not in body
        assert "NaN" not in body
        assert "undefined" not in body


@pytest.mark.skip(reason="CUSTOMIZE: Set page_url fixture and tab selectors")
class TestTabSwitching:
    """Tabs load correct content and maintain state."""

    def test_default_tab_is_active(self, page: Page):
        """First tab should be active on page load."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # CUSTOMIZE: Replace with your default tab selector and active class
        default_tab = page.locator("button:has-text('Your Default Tab')")
        expect(default_tab).to_have_class(re.compile(r"active|selected|border-"))

    def test_secondary_tab_activates(self, page: Page):
        """Clicking secondary tab should mark it as active."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")

        # CUSTOMIZE: Replace with your tab selector
        page.click("text=Your Secondary Tab")
        page.wait_for_timeout(2000)

        tab = page.locator("button:has-text('Your Secondary Tab')")
        expect(tab).to_have_class(re.compile(r"active|selected|border-"))

    def test_switching_back_preserves_data(self, page: Page):
        """Switching away and back should preserve content."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        text_before = page.locator("body").inner_text()

        # CUSTOMIZE: Replace with your tab selectors
        page.click("text=Your Secondary Tab")
        page.wait_for_timeout(1000)
        page.click("text=Your Default Tab")
        page.wait_for_timeout(1000)

        text_after = page.locator("body").inner_text()

        assert len(text_after) > 100 or "no" in text_after.lower(), (
            "Switching back to default tab should show data or empty state, not a blank page"
        )


@pytest.mark.skip(reason="CUSTOMIZE: Set page_url fixture and filter selectors")
class TestFilters:
    """Filter controls update displayed results."""

    def test_filter_updates_results(self, page: Page):
        """Clicking a filter should visually update the active state."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")

        # CUSTOMIZE: Navigate to filtered view if needed
        # page.click("text=Your Tab")
        # page.wait_for_timeout(2000)

        # CUSTOMIZE: Replace with your filter selector
        filter_btn = page.locator("text=Your Filter")
        if filter_btn.is_visible():
            filter_btn.click()
            page.wait_for_timeout(2000)
            expect(filter_btn).to_have_class(re.compile(r"active|selected|bg-"))


@pytest.mark.skip(reason="CUSTOMIZE: Set page_url fixture and card selectors")
class TestDataDisplay:
    """Verify that data cards render correct information."""

    def test_cards_show_expected_fields(self, page: Page):
        """Data cards should display the expected fields."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        body = page.locator("body").inner_text()
        # CUSTOMIZE: Only check if data exists
        if "no results" not in body.lower():
            # CUSTOMIZE: Replace with your expected field labels
            assert "Field A" in body, "Cards should show Field A"
            assert "Field B" in body, "Cards should show Field B"

    def test_cards_have_content(self, page: Page):
        """Cards should contain meaningful text, not be empty shells."""
        # CUSTOMIZE: Use your page_url fixture
        page.goto("http://localhost:8000/your-page/test-user-id")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # CUSTOMIZE: Replace with your card selector
        cards = page.locator("[class*='card'], [class*='rounded']").all()
        if len(cards) > 1:
            first_card_text = cards[0].inner_text()
            assert len(first_card_text) > 10, "Card should contain meaningful text"
