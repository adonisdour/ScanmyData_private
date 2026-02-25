# Scraper Training & Classification Heuristics

This document records the current set of rules used by the
`scraper_receipt_analysis` (and by extension `scraper_receipt`) module
for classifying Greek fiscal documents encountered on providers such as
SimpleInvoicing.gr.  It also outlines how to continue training the
scraper, especially when using headless browsers for dynamic content.

---

## 1. Existing Heuristics

The goal of the classifier is to populate the `out` dict returned by
`detect_and_scrape()` with accurate values for fields such as
`is_invoice`, `doc_type`, `series` and (later) any additional hints.

### 1.1 Keyword detection

- **Receipt keywords**: look for whole‑word matches of
  `απόδειξη`, `αποδειξη`, `ΑΛΠ` and longer phrases such as
  *απόδειξη παροχής υπηρεσιών* or *πελάτης λιανικής*.
- **Invoice keywords**: similarly search for `τιμολόγιο`, `invoice` and
  explicit variants:
  - τιμολόγιο δελτίο αποστολής
  - τιμολόγιο παροχής υπηρεσιών
  - τιμολόγιο πωλήσεων
  - πιστωτικό τιμολόγιο

All regexes use word boundaries (`\b…\b`) to avoid accidental matches
inside composite words (e.g. `SimpleinvoiceproviderClient`).

### 1.2 Series codes

Many SimpleInvoicing pages declare a `Σειρά` value which, by convention,
encodes the document type.  The scraper now captures the series and
applies a small mapping:

| Series | Meaning                        | `is_invoice` |
|--------|--------------------------------|--------------|
| ΑΛΠ    | Απόδειξη Παροχής Υπηρεσιών    | False        |
| ΤΔΠ    | Τιμολόγιο/Δελτίο Αποστολής      | True         |
| ΤΠΥ    | Τιμολόγιο Παροχής Υπηρεσιών    | True         |
| ΤΠΠ    | Τιμολόγιο Πωλήσεων             | True         |
| ΠΤ     | Πιστωτικό Τιμολόγιο            | True         |

The scraper stores the human‑readable text in the `doc_type` field if
no explicit `doc_type` was extracted, and derives `is_invoice` from the
first letter of the series code (`Α` &rarr; receipt, `Τ`/`Π` &rarr;
invoice).

### 1.3 Customer / VAT clues

Two strong negative signals for invoices are:

- appearance of **"πελάτης λιανικής"** anywhere on the page.  It is
  common for sellers to mark retail customers explicitly.
- a 9‑digit VAT number consisting entirely of **9s** or **0s**.

When either pattern is seen the document is forced to a receipt, even if
other rules would have marked it as an invoice.

### 1.4 Browser rendering

All of the above rules are applied both to the initial HTML pulled via
`requests` and to the HTML returned by the Playwright headless browser
fallback (`rendered_html`).  This ensures that dynamically generated
text (e.g. the itemised breakdown) is also considered.

The helper function implementing the logic is `_refine_doc_type()`; it is
called from the SimpleInvoicing scrapers in both `scraper_receipt.py`
and `scraper_receipt_analysis.py` and can be reused elsewhere.

---

## 2. Extending / Training for New Cases

1. **Collect examples.**  Use the existing scraping pipeline (with
   `debug=True` or by manually driving the browser) to grab a variety of
   pages.  Save the HTML/`rendered_html` along with the manually
   annotated truth (invoice/receipt type, series, etc.).

2. **Identify new keywords or codes.**  Grep the samples for recurring
   words or series strings that correlate with a particular document
   class.  Greek inflections and diacritics can often be normalised by
   lowercasing and stripping accents.

3. **Update `_refine_doc_type()`.**  Add new regex patterns or extend the
   `mapping` table.  Use comments to explain the origin of each rule so
   that future reviewers understand why it was added.

4. **Add regression tests.**  The `test_simpleinvoicing.py` file contains
   examples illustrating each rule.  New samples should be encoded as
   additional unit tests (either by calling the helper directly or by
   exercising `detect_and_scrape()` with a real URL).

5. **Headless automation.**  When a provider uses heavy JavaScript the
   rule‑writing process is identical, except that step 1 must include a
   Playwright invocation.  The `scrape_simpleinvoicing()` function shows
   how to call browser rendering and capture both the final HTML and any
   intercepted network requests (useful to detect myDATA URLs).

   Eventually the helpers can be generalised so that every scraper
   optionally spins up a headless context when the static fetch
   doesn’t yield enough text.

6. **Consider configuration.**  If the list of series codes or
   keywords grows unwieldy, they can be moved out of the Python source
   into a JSON/YAML file that’s loaded at startup.  A small command‑line
   script could re‑generate tests from that configuration automatically.

---

This document will serve as the reference for future training work.  By
centralising the heuristics and pairing them with tests, we make it
straightforward to expand the scraper to handle new vendors and
narrower document subtypes without polluting the core parsing logic.
