import os
import pytest


import importlib


def test_browser_toggle_default(monkeypatch):
    # ensure the env var is not set or false and reload module to refresh
    monkeypatch.delenv("MYDATA_USE_BROWSER", raising=False)
    import scraper
    importlib.reload(scraper)
    assert not scraper._use_browser_fallback()
    # calling the resolver should return None quickly even if playwright is present
    result = scraper._resolve_mydatapi_via_browser("http://example.com", debug=True)
    assert result is None


def test_browser_toggle_enabled(monkeypatch):
    # if the variable is truthy but playwright import fails, still return None
    monkeypatch.setenv("MYDATA_USE_BROWSER", "1")
    import scraper
    importlib.reload(scraper)
    assert scraper._use_browser_fallback()
    # function should gracefully return None even if browser code would run
    result = scraper._resolve_mydatapi_via_browser("http://example.com", debug=True)
    assert result is None

# ensure constant parsing works for various truthy values
@pytest.mark.parametrize("val", ["1", "true", "True", "yes", "YES"])
def test_browser_toggle_truthy_vals(monkeypatch, val):
    monkeypatch.setenv("MYDATA_USE_BROWSER", val)
    import scraper
    importlib.reload(scraper)
    assert scraper._use_browser_fallback()
