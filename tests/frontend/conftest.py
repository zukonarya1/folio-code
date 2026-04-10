"""
Frontend test fixtures.

Provides DB state control and Playwright page setup for behavioral tests.
Requires: pytest-playwright, a running dev server at BASE_URL, and DB access.

Usage:
    pytest tests/frontend/ --base-url http://localhost:8000

CUSTOMIZE: Replace model imports and queries with your project's models.
"""

import os
import pytest

BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


# --- CUSTOMIZE: Uncomment and adapt these fixtures to your data model ---

# from your_app.database import SessionLocal
# from your_app.models import User
#
# @pytest.fixture
# def db_session():
#     session = SessionLocal()
#     try:
#         yield session
#     finally:
#         session.close()
#
#
# @pytest.fixture
# def test_user(db_session):
#     """Return the first user in the DB. Tests assume at least one user exists."""
#     user = db_session.query(User).first()
#     if not user:
#         pytest.skip("No user in DB — seed one before running frontend tests")
#     return user
#
#
# @pytest.fixture
# def page_url(test_user):
#     """URL for the main page under test, with data."""
#     return f"{BASE_URL}/your-page/{test_user.id}"
#
#
# @pytest.fixture
# def empty_page_url(db_session, test_user):
#     """Temporarily clear data for test user, restore after.
#
#     This fixture pattern:
#     1. Saves current data
#     2. Deletes it (simulating empty state)
#     3. Yields the URL
#     4. Restores the data in teardown
#     """
#     user_id = test_user.id
#
#     # Save existing data
#     # items = db_session.query(YourModel).filter_by(user_id=user_id).all()
#     # saved_data = [(item.id, item.field1, item.field2) for item in items]
#
#     # Delete for empty state
#     # db_session.query(YourModel).filter_by(user_id=user_id).delete()
#     # db_session.commit()
#
#     yield f"{BASE_URL}/your-page/{user_id}"
#
#     # Restore data
#     # for data in saved_data:
#     #     db_session.add(YourModel(id=data[0], field1=data[1], field2=data[2]))
#     # db_session.commit()
