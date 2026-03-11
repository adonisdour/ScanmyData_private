import json
import subprocess


def exec_js(js_code: str) -> str:
    """Run the provided JavaScript code with node and return stdout."""
    proc = subprocess.run(["node", "-e", js_code], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"node exited {proc.returncode}: {proc.stderr}")
    return proc.stdout.strip()


def test_get_categories_includes_repeat_mapping():
    # verify that repeat-mapping categories are merged *for invoices* only; when
    # receipts mode is active the behaviour should remain unchanged.
    base_setup = (
        "var window = {};\n"
        "function normalizeCategoryListSafe(list){ return list || []; }\n"
        "function receiptCategoryAllowedForVatStrict(c, vatKey){ return true; }\n"
        "function categoryAllowedForVat(c, vatKey){ return true; }\n"
        "function getRepeatMappingCategoriesForVat(vatKey){ return ['εγγυοδοσια', 'mapped_cat']; }\n"
        "function getCategoriesForVatInReceiptAnalysis(vatKey, baseCategories){\n"
        "  const receiptsMode = (typeof isReceiptsOn === 'function' && isReceiptsOn()) ||\n"
        "                       (typeof isReceiptAnalysisActive === 'function' && isReceiptAnalysisActive());\n"
        "  let receiptOnly = [];\n"
        "  if (receiptsMode) {\n"
        "    receiptOnly = (Array.isArray(window.RECEIPT_CUSTOMER_CATEGORIES) && window.RECEIPT_CUSTOMER_CATEGORIES.length)\n"
        "      ? window.RECEIPT_CUSTOMER_CATEGORIES.slice()\n"
        "      : (Array.isArray(window.__RC_RECEIPT_CATEGORIES_CACHE) ? window.__RC_RECEIPT_CATEGORIES_CACHE.slice() : []);\n"
        "    if ((!receiptOnly || !receiptOnly.length) && Array.isArray(baseCategories) && baseCategories.length) {\n"
        "      receiptOnly = baseCategories.slice();\n"
        "    }\n"
        "  } else {\n"
        "    receiptOnly = (Array.isArray(window.CUSTOMER_CATEGORIES) && window.CUSTOMER_CATEGORIES.length)\n"
        "      ? window.CUSTOMER_CATEGORIES.slice()\n"
        "      : (Array.isArray(baseCategories) ? baseCategories.slice() : []);\n"
        "  }\n"
        "  if (!receiptsMode && typeof getRepeatMappingCategoriesForVat === 'function') {\n"
        "    const repeatCats = getRepeatMappingCategoriesForVat(vatKey) || [];\n"
        "    repeatCats.forEach(c => { if (c && !receiptOnly.includes(c)) receiptOnly.push(c); });\n"
        "  }\n"
        "  if (!receiptOnly.includes('αποδειξακια')) receiptOnly.unshift('αποδειξακια');\n"
        "  const normalizedCategories = normalizeCategoryListSafe(receiptOnly);\n"
        "  if (!receiptsMode) {\n"
        "    if (typeof categoryAllowedForVat === 'function') {\n"
        "      const allowedByRepeatLogic = normalizedCategories.filter(c => categoryAllowedForVat(c, vatKey));\n"
        "      if (allowedByRepeatLogic.length) return allowedByRepeatLogic;\n"
        "    }\n"
        "    return normalizedCategories;\n"
        "  }\n"
        "  return normalizedCategories.filter(c => receiptCategoryAllowedForVatStrict(c, vatKey));\n"
        "}\n"
    )

    # Case 1: invoice-mode (default), base list empty
    js1 = base_setup + "function isReceiptsOn(){ return false; }\nfunction isReceiptAnalysisActive(){ return false; }\nconsole.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('23%', [])));"
    out = exec_js(js1)
    cats = json.loads(out)
    assert 'αποδειξακια' in cats
    assert 'εγγυοδοσια' in cats
    assert 'mapped_cat' in cats

    # Case 2: invoice-mode, base list has existing entries
    js2 = base_setup + "function isReceiptsOn(){ return false; }\nfunction isReceiptAnalysisActive(){ return false; }\nconsole.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('23%', ['foo', 'εγγυοδοσια'])));"
    out2 = exec_js(js2)
    cats2 = json.loads(out2)
    assert 'foo' in cats2
    assert 'εγγυοδοσια' in cats2
    assert 'mapped_cat' in cats2

    # Case 3: receipts-mode should *not* merge
    js3 = base_setup + "function isReceiptsOn(){ return true; }\nfunction isReceiptAnalysisActive(){ return false; }\nconsole.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('23%', [])));"
    out3 = exec_js(js3)
    cats3 = json.loads(out3)
    assert cats3 == ['αποδειξακια']  # only default tag

    # Case 4: receipts-mode with pre-existing categories
    js4 = base_setup + "function isReceiptsOn(){ return true; }\nfunction isReceiptAnalysisActive(){ return false; }\nconsole.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('23%', ['foo'])));"
    out4 = exec_js(js4)
    cats4 = json.loads(out4)
    assert 'foo' in cats4
    assert 'εγγυοδοσια' not in cats4

    # Case 5: invoice-mode must ignore stale receipt cache when repeat is closed
    # and still use base categories for dropdown options.
    js5 = (
        base_setup
        + "window.RECEIPT_CUSTOMER_CATEGORIES = ['αποδειξακια'];\n"
        + "function getRepeatMappingCategoriesForVat(vatKey){ return []; }\n"
        + "function isReceiptsOn(){ return false; }\n"
        + "function isReceiptAnalysisActive(){ return false; }\n"
        + "console.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('0%', ['foo'])));"
    )
    out5 = exec_js(js5)
    cats5 = json.loads(out5)
    assert 'foo' in cats5

    # Case 6: invoice-mode should follow repeat-logic filter (categoryAllowedForVat)
    js6 = (
        base_setup
        + "function categoryAllowedForVat(c, vatKey){ return c === 'foo'; }\n"
        + "function getRepeatMappingCategoriesForVat(vatKey){ return []; }\n"
        + "function isReceiptsOn(){ return false; }\n"
        + "function isReceiptAnalysisActive(){ return false; }\n"
        + "console.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('0%', ['foo', 'bar'])));"
    )
    out6 = exec_js(js6)
    cats6 = json.loads(out6)
    assert cats6 == ['foo']

    # Case 7: invoice-mode should still provide options when baseCategories is
    # empty by reading CUSTOMER_CATEGORIES (same source as repeat mapping modal).
    js7 = (
        base_setup
        + "window.CUSTOMER_CATEGORIES = ['αγορες_εμπορευματων', 'γενικες_δαπανες'];\n"
        + "function getRepeatMappingCategoriesForVat(vatKey){ return []; }\n"
        + "function categoryAllowedForVat(c, vatKey){ return true; }\n"
        + "function isReceiptsOn(){ return false; }\n"
        + "function isReceiptAnalysisActive(){ return false; }\n"
        + "console.log(JSON.stringify(getCategoriesForVatInReceiptAnalysis('13%', [])));"
    )
    out7 = exec_js(js7)
    cats7 = json.loads(out7)
    assert 'αγορες_εμπορευματων' in cats7


def test_category_allowed_for_vat_accepts_0_percent_variants():
    js = (
        "function normalizeVatKey(s){\n"
        "  const t = (s || '').toString().toLowerCase().trim().replace(',', '.');\n"
        "  if (/^[1-7]$/.test(t)) { const m = { '1':'24%','2':'13%','3':'6%','4':'17%','5':'9%','6':'4%','7':'0%' }; return m[t] || ''; }\n"
        "  if (/\\b24\\b|24%|24\\.0/.test(t)) return '24%';\n"
        "  if (/\\b17\\b|17%|17\\.0/.test(t)) return '17%';\n"
        "  if (/\\b13\\b|13%|13\\.0/.test(t)) return '13%';\n"
        "  if (/\\b6\\b|6%|6\\.0/.test(t)) return '6%';\n"
        "  if (/\\b9\\b|9%|9\\.0/.test(t)) return '9%';\n"
        "  if (/\\b4\\b|4%|4\\.0/.test(t)) return '4%';\n"
        "  if (/\\b3\\b|3%|3\\.0/.test(t)) return '3%';\n"
        "  if (/\\b0\\b|0%|0\\.0|μηδεν|απαλλ|χωρις|χωρίς|ανευ|άνευ|exempt|no\\s*vat|39α|47β/.test(t)) return '0%';\n"
        "  return '';\n"
        "}\n"
        "var CATEGORY_VAT_CONSTRAINTS = { 'αγορες_εμπορευματων': ['0%','13%'], 'γενικες_δαπανες': ['13%'] };\n"
        "function categoryAllowedForVat(cat, vatKey){\n"
        "  if(!cat) return false;\n"
        "  const key = String(cat).trim();\n"
        "  let normVat = (typeof normalizeVatKey === 'function') ? normalizeVatKey(vatKey) : String(vatKey || '').trim();\n"
        "  const vatNormKey = normVat || (vatKey || '');\n"
        "  const allowed = CATEGORY_VAT_CONSTRAINTS[key];\n"
        "  if(!allowed || !allowed.length) return true;\n"
        "  return allowed.includes(vatNormKey);\n"
        "}\n"
        "console.log(JSON.stringify({\n"
        "  aneu: categoryAllowedForVat('αγορες_εμπορευματων', 'Άνευ ΦΠΑ'),\n"
        "  code7: categoryAllowedForVat('αγορες_εμπορευματων', '7'),\n"
        "  zeroPct: categoryAllowedForVat('αγορες_εμπορευματων', '0%'),\n"
        "  wrongRate: categoryAllowedForVat('γενικες_δαπανες', '0%')\n"
        "}));\n"
    )
    out = exec_js(js)
    result = json.loads(out)
    assert result['aneu'] is True
    assert result['code7'] is True
    assert result['zeroPct'] is True
    assert result['wrongRate'] is False


