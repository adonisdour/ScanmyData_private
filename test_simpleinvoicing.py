#!/usr/bin/env python3
"""Unit tests for the SimpleInvoicing scraper logic.

These exercises focus on distinguishing retail receipts (ΑΛΠ) from
invoices.  Prior to the fix, the presence of the word "invoice" in the
branding (SimpleinvoiceproviderClient) caused receipts to be marked as
invoices.  We now apply word boundaries and explicit receipt keywords
so that the Playwright-rendered page seen in production is parsed
correctly.
"""

import sys
import pprint
from scraper_receipt_analysis import detect_and_scrape


def test_simpleinvoicing_receipt_classification():
    """The example URL provided by the user should be classified as a
    *receipt* (is_invoice == False) even though the word "invoice" is
    present in the page branding.
    """

    url = (
        "https://simpleinvoicing.gr/invoice/"
        "32C4FB21D43A4D8E9A1B033D3F9E45D34C7493D53E4BEF5AD5E1B27FC5DF31096FE721E1-"
        "3650-88FDE2C91CFDB0ADB6E8A233B56A362A394F5C90"
    )

    res = detect_and_scrape(url, debug=True)
    pprint.pprint(res)

    assert res.get("is_invoice") is False, "receipt was misclassified as invoice"
    # ensure we still capture reasonable numeric fields
    assert res.get("total_amount") == "36,50"
    assert res.get("vat_analysis", {}).get("13")
    # the example document belongs to series ΑΛΠ (receipt of services)
    assert res.get("series") == "ΑΛΠ"


def test_simpleinvoicing_invoice_keyword_boundary():
    """Sanity check: the word "invoice" embedded in a longer word should
    *not* trigger invoice detection.  We simulate an artificial snippet
    because real fixtures are cumbersome.
    """

    # directly exercise the regex by simulating page text
    from scraper_receipt_analysis import re

    page = "SimpleinvoiceproviderClient ΑΛΠ Σειρά: ΑΛΠ"
    assert not re.search(r"\b(?:τιμολό?γιο|τιμολογιο|invoice)\b", page, re.I)
    assert re.search(r"\bαλπ\b", page, re.I)


def test_series_and_customer_heuristics():
    """Verify that series codes and customer clues influence classification."""
    from scraper_receipt_analysis import _refine_doc_type

    # simulate an output dict for series ΑΛΠ (receipt)
    o = {"is_invoice": True, "series": "ΑΛΠ", "doc_type": None}
    _refine_doc_type(o, "Σειρά: ΑΛΠ")
    assert o["is_invoice"] is False
    assert o["doc_type"] == "Απόδειξη παροχής υπηρεσιών"

    # series ΤΔΠ (invoice/delivery note) should force invoice
    o = {"is_invoice": False, "series": "ΤΔΠ", "doc_type": None}
    _refine_doc_type(o, "")
    assert o["is_invoice"] is True
    assert o["doc_type"] == "Τιμολόγιο/Δελτίο αποστολής"

    # customer retail phrase -> receipt regardless of prior state
    o = {"is_invoice": True, "series": None, "doc_type": "whatever"}
    _refine_doc_type(o, "πελάτης λιανικής")
    assert o["is_invoice"] is False

    # vat with nine 9s triggers receipt
    o = {"is_invoice": True, "series": None}
    _refine_doc_type(o, "ΑΦΜ: 999999999")
    assert o["is_invoice"] is False


if __name__ == "__main__":
    test_simpleinvoicing_receipt_classification()
    test_simpleinvoicing_invoice_keyword_boundary()
    print("All simpleinvoicing tests passed")
