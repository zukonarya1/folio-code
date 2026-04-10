"""
Root test fixtures.

This file is loaded by pytest before any test module. Use it for
project-wide fixtures like database sessions, test users, or API clients.
"""

import pytest


# Example: Database session fixture
# Uncomment and adapt to your ORM/database setup.
#
# from your_app.database import SessionLocal
#
# @pytest.fixture
# def db_session():
#     """Provide a transactional database session that rolls back after each test."""
#     session = SessionLocal()
#     try:
#         yield session
#         session.rollback()
#     finally:
#         session.close()


# Example: Test client fixture (FastAPI)
#
# from fastapi.testclient import TestClient
# from your_app.main import app
#
# @pytest.fixture
# def client():
#     """Provide a test client for the FastAPI app."""
#     with TestClient(app) as c:
#         yield c
