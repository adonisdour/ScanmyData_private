#!/usr/bin/env python3
"""Regression tests for the e-invoicing.gr scraper logic (PEPPOL).

These exercises reproduce the problematic URLs mentioned by the user:

* a query-string URL that previously worked via the API endpoint
* a "path-only" URL which has no query parameters and must be handled by
  following the "Παραστατικό (ΑΑΔΕ)" button -> mydatapi link.

The behaviour we care about is that the path-only URL should be delegated
through :func:`scrape_mydatapi` (as evidenced by the `source` field being
"MyData").

We exercise both the ``scraper_receipt_analysis`` implementation directly
and the thin wrapper exposed by ``scraper_receipt`` to make sure the
latter remains functional.
"""

from scraper_receipt_analysis import scrape_einvoicing_gr
import scraper_receipt

# fixtures taken from bug report
URL_PARAM = "https://e-invoicing.gr/edocuments/ViewInvoice/-1/8490e0f0-2ba0-4e5c-b0c6-7c447cec9efb"
URL_PATH  = "https://e-invoicing.gr/edocuments/ViewInvoice/-1/d4ba79e0-e43a-4cac-a30a-a2211f38ee24_bff6688"
# additional query-string case from latest bug report
URL_QUERY = "https://e-invoicing.gr/edocuments/ViewInvoice?ct=PEPPOL&id=3D4F4B4DBB99647D7CDA6730059686BBE647FEA9&s=A&h=0cc317ed"


def test_path_only_url_uses_mydatapi():
    """The path-only URL should resolve to a MyData request and return valid data."""
    res = scrape_einvoicing_gr(URL_PATH, debug=False)
    assert res.get("source") == "MyData", "expected delegation to MyData"
    # basic sanity of extracted fields
    assert res.get("issuer_vat") == "094441550"
    assert res.get("MARK") == "400012468037605"


def test_query_url_falls_back_nicely():
    """The *original* query-less URL should still return an empty/None result.

    The path-only variant does not contain MARK and we simply delegate to the
    path-based logic; verifying that we don't crash is sufficient.
    """
    res = scrape_einvoicing_gr(URL_PARAM, debug=False)
    assert isinstance(res, dict)
    assert res.get("MARK") is None


def test_explicit_query_url_parses_values():
    """The CT/ID/S/H URL from the report must return the expected fields."""
    res = scrape_einvoicing_gr(URL_QUERY, debug=False)
    assert res.get("issuer_vat") == "800764388"
    assert res.get("MARK") == "400011572690415"
    assert res.get("doc_type") == "ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ ΠΩΛΗΣΗΣ"
    assert res.get("total_amount") == "12,78"
    wrapped = scraper_receipt.scrape_einvoicing_gr(URL_QUERY, debug=False)
    assert "vat_analysis" not in wrapped
    assert "vat_analysis_inferred" not in wrapped


def test_wrapper_matches_analysis():
    """The helper in ``scraper_receipt`` should behave equivalently, aside
    from stripped analysis fields.
    """
    expected = scrape_einvoicing_gr(URL_PATH, debug=False)
    # remove VAT analysis keys when comparing
    expected.pop("vat_analysis", None)
    expected.pop("vat_analysis_inferred", None)
    actual = scraper_receipt.scrape_einvoicing_gr(URL_PATH, debug=False)
    assert actual == expected


if __name__ == "__main__":
    test_path_only_url_uses_mydatapi()
    test_query_url_falls_back_nicely()
    test_wrapper_matches_analysis()
    print("e-invoicing.gr tests passed")
