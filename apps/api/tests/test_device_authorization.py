"""Direct FreeFrame browser/device authorization tests."""

import json
from unittest.mock import patch

import pytest

from apps.api.models.user import UserStatus


class FakeRedis:
    """Small synchronous Redis double, including the one-use poll Lua action."""

    def __init__(self):
        self.values = {}
        self.expiries = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        self.expiries[key] = ex if ex is not None else -1
        return True

    def setex(self, key, seconds, value):
        self.values[key] = value
        self.expiries[key] = seconds
        return True

    def get(self, key):
        return self.values.get(key)

    def ttl(self, key):
        return self.expiries.get(key, -2)

    def delete(self, *keys):
        for key in keys:
            self.values.pop(key, None)
            self.expiries.pop(key, None)

    def eval(self, _script, _numkeys, key):
        raw = self.values.get(key)
        if not raw:
            return False
        record = json.loads(raw)
        if record["used"] or not record["approved_user_id"]:
            return False
        record["used"] = True
        self.values[key] = json.dumps(record)
        return record["approved_user_id"]


def _start(client):
    response = client.post("/auth/device/start", json={"client_id": "premiere-uxp"})
    assert response.status_code == 200
    return response.json()


def test_start_returns_contract_and_hashes_device_code(client):
    redis = FakeRedis()
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        body = _start(client)

    assert set(body) == {
        "device_code", "user_code", "verification_uri", "verification_uri_complete", "expires_in", "interval",
    }
    assert body["expires_in"] == 600
    assert body["interval"] == 5
    assert body["user_code"].count("-") == 1
    assert body["device_code"] not in " ".join(str(value) for value in redis.values.values())
    assert body["device_code"] not in " ".join(redis.values.keys())


def test_pending_slow_approved_and_one_use_poll(client, mock_db, auth_headers, test_user):
    redis = FakeRedis()
    mock_db.first.return_value = test_user
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        body = _start(client)
        pending = client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": body["device_code"]})
        assert pending.status_code == 202
        assert pending.json() == {"error": "authorization_pending"}

        slow = client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": body["device_code"]})
        assert slow.status_code == 400
        assert slow.json() == {"error": "slow_down"}

        # Let the approval be polled immediately in this deterministic test.
        device_hash = next(key.removeprefix("device_flow:") for key in redis.values if key.startswith("device_flow:"))
        record_key = f"device_flow:{device_hash}"
        record = json.loads(redis.values[record_key])
        record["next_poll_at"] = 0
        redis.values[record_key] = json.dumps(record)

        approve = client.post("/auth/device/approve", json={"user_code": body["user_code"]}, headers=auth_headers)
        assert approve.status_code == 200
        approved = client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": body["device_code"]})
        assert approved.status_code == 200
        assert set(approved.json()) == {"access_token", "refresh_token", "token_type"}
        assert approved.json()["token_type"] == "bearer"

        repeated = client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": body["device_code"]})
        assert repeated.status_code == 400
        assert repeated.json() == {"error": "invalid_device_code"}


def test_invalid_or_expired_device_code_is_rejected(client):
    redis = FakeRedis()
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        assert client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": "wrong"}).status_code == 400
        body = _start(client)
        redis.values.clear()
        assert client.post("/auth/device/poll", json={"client_id": "premiere-uxp", "device_code": body["device_code"]}).status_code == 400


def test_deactivated_user_cannot_approve(client, mock_db, test_user):
    redis = FakeRedis()
    test_user.status = UserStatus.deactivated
    mock_db.first.return_value = test_user
    from apps.api.services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(str(test_user.id))}"}
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        body = _start(client)
        response = client.post("/auth/device/approve", json={"user_code": body["user_code"]}, headers=headers)
    assert response.status_code == 401


def test_device_start_rate_limit_is_enforced(client, monkeypatch):
    monkeypatch.setattr("apps.api.middleware.rate_limit.check_rate_limit", lambda *_args: (False, 12))
    response = client.post("/auth/device/start", json={"client_id": "premiere-uxp"})
    assert response.status_code == 429


@pytest.mark.parametrize(
    "path",
    ["/auth/device/start", "/auth/device/poll"],
)
@pytest.mark.parametrize(
    "origin",
    ["null", "uxp://uxp-internal", "uxp://com.alexlite.plane-freeframe-review"],
)
def test_uxp_origin_preflight_is_allowed(client, path, origin):
    response = client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code in (200, 204)
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.headers["access-control-allow-methods"] == "POST, OPTIONS"
    assert response.headers["access-control-allow-headers"] == "Content-Type"
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(
    "origin",
    ["null", "uxp://uxp-internal", "uxp://com.alexlite.plane-freeframe-review"],
)
def test_uxp_origin_post_includes_non_credentialed_cors_header(client, origin):
    redis = FakeRedis()
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        response = client.post(
            "/auth/device/start",
            json={"client_id": "premiere-uxp"},
            headers={"Origin": origin},
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers


def test_device_flow_allows_wildcard_but_global_cors_stays_restricted(client):
    redis = FakeRedis()
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        response = client.post(
            "/auth/device/start",
            json={"client_id": "premiere-uxp"},
            headers={"Origin": "https://untrusted.example"},
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers

    unrelated = client.get("/health", headers={"Origin": "https://untrusted.example"})
    assert unrelated.status_code == 200
    assert "access-control-allow-origin" not in unrelated.headers


def test_direct_device_flow_remains_separate_from_plane_mode(client, monkeypatch):
    monkeypatch.setattr("apps.api.config.settings.media_plane_mode", True)
    redis = FakeRedis()
    with patch("apps.api.services.redis_service.get_redis", return_value=redis):
        response = client.post("/auth/device/start", json={"client_id": "premiere-uxp"})
    assert response.status_code == 200
