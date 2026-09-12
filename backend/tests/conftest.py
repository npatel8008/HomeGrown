"""Test fixtures.

Auth and storage both read their configuration from the environment at import
time, so the environment is set here BEFORE `main` is imported.
"""

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

# `main` calls load_dotenv(backend/.env) at import, which happily supplies the
# real IFM and ElevenLabs keys to the test run. Every score_crops() call then
# made a live K2 request: the suite took 141s, burned quota on every run, and
# failed without a network. Setting the keys empty here is enough — dotenv does
# not override a name already present in the environment.
#
# With these unset the same 27 feasibility tests run in 1.3s instead of 141s.
os.environ["IFM_API_KEY"] = ""
os.environ["ELEVENLABS_API_KEY"] = ""
os.environ["GARDENAI_LLM_REASONS"] = "0"

os.environ["INTERNAL_API_SECRET"] = "test-secret-not-used-anywhere-real"
os.environ["MONGODB_URI"] = "mongodb://mongomock-in-memory/gardenai"
os.environ.pop("AUTH0_DOMAIN", None)
os.environ.pop("AUTH0_API_AUDIENCE", None)

import mongomock  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from services import auth, user_store  # noqa: E402


@pytest.fixture(autouse=True)
def in_memory_mongo(monkeypatch):
    """Swap the real driver for an in-memory one, fresh for every test."""
    client = mongomock.MongoClient()
    monkeypatch.setattr(user_store, "_client", client)
    monkeypatch.setattr(user_store, "_indexes_ready", False)
    monkeypatch.setattr(user_store, "MONGODB_URI", "mongodb://mongomock-in-memory/gardenai")
    yield client


@pytest.fixture
def client():
    return TestClient(app)


def auth_headers(user_id: str, email: str = None) -> dict:
    """A valid internal token for `user_id`, as the Next.js server would mint."""
    return {"Authorization": "Bearer %s" % auth.mint_internal_token(user_id, email)}
