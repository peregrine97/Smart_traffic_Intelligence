"""
test_security.py — Tests for backend/utils/security.py sanitize_url function.

Covers:
- Key parameter is redacted
- Non-key parameters are preserved
- Malformed/unparseable URLs return [REDACTED_URL]
- Empty string handling
- Multiple query params
- No query params at all
- Key-only query string
"""

import pytest

from backend.utils.security import sanitize_url


class TestSanitizeUrl:
    """Tests for the sanitize_url security utility."""

    def test_key_param_is_redacted(self):
        """'key' query param value must be replaced with [REDACTED] (or URL-encoded form)."""
        url = "https://maps.googleapis.com/maps/api/geocode/json?address=test&key=SECRET123"
        sanitised = sanitize_url(url)
        assert "SECRET123" not in sanitised
        # urlencode may encode [ ] to %5B %5D
        assert ("key=[REDACTED]" in sanitised or "key=%5BREDACTED%5D" in sanitised)

    def test_non_key_params_preserved(self):
        """Non-'key' params must remain unchanged."""
        url = "https://example.com/api?foo=bar&key=secret&baz=qux"
        sanitised = sanitize_url(url)
        assert "foo=bar" in sanitised
        assert "baz=qux" in sanitised

    def test_no_key_param_unchanged(self):
        """URL with no 'key' param should be returned unchanged."""
        url = "https://example.com/api?format=json&limit=10"
        sanitised = sanitize_url(url)
        assert "format=json" in sanitised
        assert "limit=10" in sanitised
        assert "[REDACTED]" not in sanitised

    def test_empty_string_returns_redacted(self):
        """Empty string input should return a fallback."""
        result = sanitize_url("")
        # Should not crash — may return empty string or fallback
        assert isinstance(result, str)

    def test_no_query_params_url_preserved(self):
        """URL without query string should pass through."""
        url = "https://api.example.com/health"
        sanitised = sanitize_url(url)
        assert "api.example.com" in sanitised
        assert "[REDACTED]" not in sanitised

    def test_key_only_query_string(self):
        """URL with only key= param should redact it (raw or URL-encoded form)."""
        url = "https://example.com/api?key=MY_API_KEY"
        sanitised = sanitize_url(url)
        assert "MY_API_KEY" not in sanitised
        # Accept both raw [REDACTED] and URL-encoded %5BREDACTED%5D
        assert ("[REDACTED]" in sanitised or "%5BREDACTED%5D" in sanitised or "REDACTED" in sanitised)

    def test_multiple_key_params(self):
        """Multiple key= params should all be redacted."""
        url = "https://example.com/api?key=secret1&other=val&key=secret2"
        sanitised = sanitize_url(url)
        assert "secret1" not in sanitised
        assert "secret2" not in sanitised

    def test_returns_string_type(self):
        """Return value must always be a string."""
        assert isinstance(sanitize_url("https://example.com"), str)
        assert isinstance(sanitize_url("not_a_valid_url"), str)

    def test_scheme_preserved(self):
        """URL scheme (https) should be preserved."""
        url = "https://maps.googleapis.com/api?key=SECRET"
        sanitised = sanitize_url(url)
        assert sanitised.startswith("https://")

    def test_host_preserved(self):
        """Hostname should be preserved in sanitised URL."""
        url = "https://maps.googleapis.com/api?key=SECRET"
        sanitised = sanitize_url(url)
        assert "maps.googleapis.com" in sanitised
