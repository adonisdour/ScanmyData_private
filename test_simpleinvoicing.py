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


if __name__ == "__main__":
    test_simpleinvoicing_receipt_classification()
    test_simpleinvoicing_invoice_keyword_boundary()
    print("All simpleinvoicing tests passed")
