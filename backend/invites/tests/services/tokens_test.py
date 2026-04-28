from __future__ import annotations

import re

from invites.services.tokens import hash_token, issue_token, sha256_email


def test_issue_token_returns_url_safe_string_and_hash():
    raw, hashed = issue_token()
    assert re.fullmatch(r"[A-Za-z0-9_\-]+", raw)
    assert len(raw) >= 40
    assert len(hashed) == 64
    assert all(c in "0123456789abcdef" for c in hashed)


def test_issue_token_is_random_per_call():
    a, _ = issue_token()
    b, _ = issue_token()
    assert a != b


def test_hash_token_is_deterministic():
    assert hash_token("abc") == hash_token("abc")


def test_hash_token_changes_with_input():
    assert hash_token("abc") != hash_token("abd")


def test_issue_token_hash_matches_hash_token():
    raw, hashed = issue_token()
    assert hash_token(raw) == hashed


def test_sha256_email_is_lowercased_before_hashing():
    assert sha256_email("Alice@X.com") == sha256_email("alice@x.com")


def test_sha256_email_hex_length():
    assert len(sha256_email("alice@x.com")) == 64
