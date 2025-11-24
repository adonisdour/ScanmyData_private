# -*- coding: utf-8 -*-
"""
epsilon_bridge_g_category.py

Γ Κατηγορία Βιβλίων - FastImport Bridge Export
Επεκτείνει το epsilon_bridge_multiclient_strict.py με υποστήριξη για Γ Κατηγορία.

Κύριες διαφορές από Β Κατηγορία:
1. ΥΠΟΧΡΕΩΤΙΚΟΣ κωδικός κίνησης (MTYPE)
2. Λογαριασμοί μορφής ΧΧ-ΧΧ-ΧΧ-ΧΧΧΧ (αντί ΧΧ-ΧΧΧΧ)
3. ΔΙΠΛΟΓΡΑΦΙΚΗ ΜΕΘΟΔΟΣ με CRDB (Χρέωση/Πίστωση)
4. NETAMT/VATAMT/AMOUNT υποχρεωτικά στα ARTICLE_DETAIL
5. Prefix account_g_ για λογαριασμούς
6. LCODE (header) ΠΑΝΤΑ ΚΕΝΟ - χρήση μόνο LCODE_DETAIL
7. Υποστήριξη Chart of Accounts με αυτόματη προσθήκη λογαριασμών ΦΠΑ

Δομή Εξαγωγής:
- Κάθε τιμολόγιο → πολλαπλές γραμμές ARTICLE_DETAIL
- ΧΡΕΩΣΕΙΣ (CRDB=0): μία γραμμή για κάθε κατηγορία δαπάνης
- ΠΙΣΤΩΣΗ (CRDB=1): μία γραμμή για τον προμηθευτή (σύνολο)
- Όλες οι γραμμές μοιράζονται το ίδιο ARTID
"""
from __future__ import annotations

import os
import re
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# Import από το υπάρχον module
from epsilon_bridge_multiclient_strict import (
    _safe_json_read,
    _to_date,
    _ddmmyyyy,
    _safe_int,
    _round2,
    _norm_key,
    _norm_afm,
    _settings_norm,
    _merge_custom_accounts,
    _canon_category,
    _infer_vat_rate_for_line,
    _is_receipt,
    _parse_lines,
    _reason_for_rec_enhanced,
    _load_client_map,
    resolve_paths_for_vat,
    load_epsilon_invoices,
    _compose_invoice_value,
    _read_active_fiscal_year,
    characts_from_lines,
)


# ============================================================================
# Chart of Accounts (Λογιστικό Σχέδιο) - ΝΕΟΣ ΚΩΔΙΚΑΣ
# ============================================================================

def _load_chart_of_accounts(base_dir: str = "data") -> Optional[pd.DataFrame]:
    """
    Φορτώνει το λογιστικό σχέδιο (group-wide).
    Επιστρέφει DataFrame με στήλες: Κωδικός, Περιγραφή, Ποσοστό ΦΠΑ, Λογαριασμός ΦΠΑ
    """
    logger = logging.getLogger(__name__)
    
    # Ένα αρχείο για όλη την ομάδα
    coa_path = os.path.join(base_dir, 'chart_of_accounts.xlsx')
    
    if not os.path.exists(coa_path):
        logger.debug(f"[Chart of Accounts] No chart of accounts file found in {base_dir}")
        return None
    
    try:
        df = pd.read_excel(coa_path, dtype=str)
        df.fillna('', inplace=True)
        
        # Έλεγχος στηλών
        required = {'Κωδικός', 'Περιγραφή', 'Ποσοστό ΦΠΑ', 'Λογαριασμός ΦΠΑ'}
        if not required.issubset(set(df.columns)):
            logger.warning(f"[Chart of Accounts] Missing required columns in {coa_path}")
            return None
        
        logger.info(f"[Chart of Accounts] Loaded {len(df)} accounts from {coa_path}")
        return df
    
    except Exception as e:
        logger.error(f"[Chart of Accounts] Failed to load {coa_path}: {e}")
        return None


def _validate_account_in_coa(account: str, coa_df: Optional[pd.DataFrame]) -> bool:
    """Ελέγχει αν ο λογαριασμός υπάρχει στο chart of accounts"""
    if coa_df is None:
        return True  # Αν δεν υπάρχει CoA, δεν κάνουμε validation
    
    account = str(account).strip()
    if not account:
        return False
    
    return account in coa_df['Κωδικός'].values


def _get_vat_account_from_coa(account: str, vat_rate: int, coa_df: Optional[pd.DataFrame]) -> Optional[str]:
    """
    Βρίσκει τον λογαριασμό ΦΠΑ για έναν λογαριασμό εξόδων από το CoA.
    Επιστρέφει None αν δεν υπάρχει ή αν το Ποσοστό ΦΠΑ δεν ταιριάζει.
    """
    if coa_df is None:
        return None
    
    account = str(account).strip()
    if not account:
        return None
    
    # Βρες τη γραμμή με αυτόν τον κωδικό
    matching = coa_df[coa_df['Κωδικός'] == account]
    if matching.empty:
        return None
    
    row = matching.iloc[0]
    vat_account = str(row.get('Λογαριασμός ΦΠΑ', '')).strip()
    vat_pct_str = str(row.get('Ποσοστό ΦΠΑ', '')).strip()
    
    if not vat_account:
        return None
    
    # Έλεγχος ότι το ποσοστό ΦΠΑ ταιριάζει
    try:
        vat_pct = int(float(vat_pct_str))
        if vat_pct != vat_rate:
            return None
    except:
        return None
    
    return vat_account


# ============================================================================
# MTYPE (Κωδικός Κίνησης) - ΥΠΟΧΡΕΩΤΙΚΟ για Γ Κατηγορία
# ============================================================================

DEFAULT_MTYPE_MAPPING = {
    'αγορες_εμπορευματων': '1',
    'αγορες_α_υλων': '2',
    'γενικες_δαπανες_με_φπα': '3',
    'αμοιβες_τριτων': '4',
    'δαπανες_χωρις_φπα': '5',
    'εγγυοδοσια': '3',  # Γενικά έξοδα
    'αποδειξακια': '3',  # Γενικά έξοδα
}


def _get_article_movement_type(settings: Dict[str, Any]) -> str:
    """
    Βρίσκει τον κωδικό είδους κίνησης άρθρου (Article Movement Type).
    Αυτός είναι διαφορετικός από το MTYPE κατηγοριών.
    π.χ. 11=Συμψηφιστική, 12=Αγορών-Εξόδων, 13=Πωλήσεων, 14=Ταμειακή
    """
    setts = _settings_norm(settings)
    key = _norm_key("article_movement_type_g")
    val = setts.get(key, "")
    if isinstance(val, str) and val.strip():
        return val.strip()
    return "12"  # Default: Αγορών-Εξόδων


def _get_mtype_for_category(settings: Dict[str, Any], canon_category: str) -> str:
    """
    Βρίσκει τον κωδικό κίνησης (MTYPE) για την κατηγορία.
    Ψάχνει πρώτα στις ρυθμίσεις, μετά στο default mapping.
    """
    setts = _settings_norm(settings)
    
    # Ψάξε στις custom ρυθμίσεις
    key = _norm_key(f"mtype_code_{canon_category}")
    if key in setts and setts[key]:
        return str(setts[key]).strip()
    
    # Fallback στο default mapping
    return DEFAULT_MTYPE_MAPPING.get(canon_category, '3')  # Default: Γενικά έξοδα


# ============================================================================
# Λογαριασμοί Γ Κατηγορίας (ΧΧ-ΧΧ-ΧΧ-ΧΧΧΧ)
# ============================================================================

def _validate_g_account_format(account: str) -> bool:
    """Ελέγχει αν ο λογαριασμός έχει μορφή ΧΧ-ΧΧ-ΧΧ-ΧΧΧΧ"""
    pattern = r'^\d{2}-\d{2}-\d{2}-\d{4}$'
    return bool(re.match(pattern, str(account).strip()))


def _account_key_candidates_g(canon: str, rate: int) -> List[str]:
    """Κλειδιά για Γ Κατηγορία (με prefix account_g_)"""
    r = str(int(rate))
    base = f"account_g_{canon}_"
    return [
        _norm_key(base + f"fpa_kat_{r}%"),
        _norm_key(base + f"fpa_kat_{r}"),
        _norm_key(base + f"{r}%"),
        _norm_key(base + f"{r}"),
    ]


def _get_account_for_g(settings: Dict[str, Any], canon: str, rate: int) -> str:
    """Βρίσκει λογαριασμό Γ Κατηγορίας"""
    setts = _settings_norm(settings)
    for key in _account_key_candidates_g(canon, rate):
        val = setts.get(key)
        if val and isinstance(val, str):
            account = val.strip()
            if account and _validate_g_account_format(account):
                return account
    return ""


def _account_header_P_g(settings: Dict[str, Any], is_receipt: bool) -> str:
    """Λογαριασμός προμηθευτή για Γ Κατηγορία"""
    setts = _settings_norm(settings)
    key = _norm_key("account_g_supplier_retail" if is_receipt else "account_g_supplier_wholesale")
    val = setts.get(key, "")
    if isinstance(val, str) and val.strip() and _validate_g_account_format(val.strip()):
        return val.strip()
    return ""


def _account_detail_for_line_g(
    settings: Dict[str, Any],
    category: str,
    is_receipt: bool,
    vat_rate: Optional[int]
) -> Tuple[str, Dict[str, Any]]:
    """
    Εύρεση λογαριασμού για γραμμή - Γ Κατηγορία.
    Παρόμοιο με το _account_detail_for_line αλλά για account_g_ λογαριασμούς.
    """
    canon = _canon_category(category)
    tried: List[str] = []
    chosen = ""
    used_key = ""

    # Forced rate για receipts/εγγυοδοσία
    forced_rate = 0 if (is_receipt or canon == "εγγυοδοσια") else None
    target_rate = int(forced_rate) if forced_rate is not None else (int(vat_rate) if vat_rate is not None else None)

    if target_rate is None:
        return "", {"error": "no_vat_rate", "category": canon}

    setts = _settings_norm(settings)
    for key in _account_key_candidates_g(canon, target_rate):
        tried.append(key)
        val = setts.get(key)
        if val and isinstance(val, str):
            account = val.strip()
            if account and _validate_g_account_format(account):
                chosen = account
                used_key = key
                break

    dbg = {
        "category": canon,
        "vat_in": vat_rate,
        "forced_zero": bool(forced_rate is not None),
        "used_key": used_key,
        "tried_keys": tried,
        "chosen": chosen,
    }
    return chosen, dbg


# ============================================================================
# Preview/Export για Γ Κατηγορία
# ============================================================================

def build_preview_rows_for_ui_g(
    vat: str,
    credentials_json: str = "data/credentials.json",
    cred_settings_json: str = "data/credentials_settings.json",
    invoices_json: Optional[str] = None,
    client_db: Optional[str] = None,
    base_invoices_dir: str = "data/epsilon",
    fiscal_year: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], bool]:
    """
    Δημιουργεί preview rows για Γ Κατηγορία.
    Παρόμοιο με build_preview_rows_for_ui αλλά με:
    - MTYPE υποχρεωτικό
    - Λογαριασμούς account_g_
    - NETAMT/VATAMT στα details
    - Validation με Chart of Accounts
    """
    paths = resolve_paths_for_vat(vat, invoices_json, client_db, None, base_invoices_dir)
    issues: List[Dict[str, Any]] = []
    
    # Debug logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[Γ Category] Paths: invoices={paths.get('invoices')}, client_db={paths.get('client_db')}")
    
    # Φόρτωση Chart of Accounts
    # Το base_invoices_dir είναι π.χ. "data/tony/epsilon"
    # Θέλουμε το CoA στο "data/tony/" (parent directory) - GROUP-WIDE
    if base_invoices_dir:
        coa_base_dir = os.path.dirname(os.path.abspath(base_invoices_dir))
    else:
        coa_base_dir = "data"
    
    coa_df = _load_chart_of_accounts(coa_base_dir)
    if coa_df is not None:
        logger.info(f"[Γ Category] Chart of Accounts loaded with {len(coa_df)} accounts from {coa_base_dir}")
    else:
        logger.info(f"[Γ Category] No Chart of Accounts found in {coa_base_dir} - validation disabled")

    try:
        invoices = load_epsilon_invoices(paths["invoices"])
        logger.info(f"[Γ Category] Loaded {len(invoices)} invoices from {paths['invoices']}")
    except Exception as e:
        logger.error(f"[Γ Category] Failed to load invoices: {e}")
        return [], [{"code": "load_fail", "message": f"Αδυναμία φόρτωσης invoices: {e}"}], False

    # Fiscal year filter - Φιλτράρει μόνο παραστατικά που εκδόθηκαν το ίδιο έτος με το αποθηκευμένο
    fy = fiscal_year if fiscal_year is not None else _read_active_fiscal_year(base_invoices_dir)
    logger.info(f"[Γ Category] Fiscal year filter: {fy}")
    if fy is not None:
        _filtered = []
        filtered_count = 0
        for _rec in invoices:
            _dt = _to_date(_rec.get("issueDate") or _rec.get("ΗΜΕΡΟΜΗΝΙΑ"))
            if _dt is None or _dt.year != int(fy):
                filtered_count += 1
                continue
            _filtered.append(_rec)
        invoices = _filtered
        logger.info(f"[Γ Category] After year filter: {len(invoices)} invoices (filtered {filtered_count})")
        # Σιωπηλό φιλτράρισμα - ΔΕΝ προσθέτουμε issue (όπως το Β Category)

    credentials = _safe_json_read(credentials_json, default=[])
    settings_all = _safe_json_read(cred_settings_json, default={})

    cred_list = credentials if isinstance(credentials, list) else [credentials]
    active = next((c for c in cred_list if str(c.get("vat")) == str(vat)), (cred_list[0] if cred_list else {}))
    settings_all = _merge_custom_accounts(settings_all, active)
    
    apod_type = (active or {}).get("apodeixakia_type", "")
    apod_supplier_id = _safe_int((active or {}).get("apodeixakia_supplier", ""))
    other_expenses_flag = 1 if bool((active or {}).get("apodeixakia_other_expenses")) else 0
    
    logger.info(f"[Γ Category] Settings: apod_type={apod_type}, apod_supplier_id={apod_supplier_id}")

    # Client map
    client_map = {"by_afm": {}, "ids": set(), "names": {}, "columns": []}
    if paths["client_db"] and os.path.exists(paths["client_db"]):
        try:
            cm = _load_client_map(paths["client_db"])
            client_map["by_afm"] = cm.get("by_afm", {})
            client_map["ids"] = cm.get("ids", set())
            client_map["names"] = cm.get("names", {})
            client_map["columns"] = cm.get("columns", [])
            logger.info(f"[Γ Category] Loaded client_db: {len(client_map['by_afm'])} AFMs, {len(client_map['ids'])} IDs")
        except Exception as e:
            logger.error(f"[Γ Category] Failed to load client_db: {e}")
            issues.append({"code": "client_db_fail", "message": f"Αδυναμία φόρτωσης client_db: {e}"})

    # Tracking για νέους συναλλασσόμενους
    new_suppliers = {}  # afm -> {"custid": int, "name": str}
    next_custid = max(client_map["ids"]) + 1 if client_map["ids"] else 1

    rows: List[Dict[str, Any]] = []
    
    logger.info(f"[Γ Category] Processing {len(invoices)} invoices...")

    for rec in invoices:
        is_receipt = _is_receipt(rec)
        afm_issuer = str(rec.get("AFM_issuer") or rec.get("counterpart_vat") or "").strip()
        mark = rec.get("mark")
        
        logger.debug(f"[Γ Category] Processing MARK={mark}, is_receipt={is_receipt}, AFM={afm_issuer}")
        
        # CUSTID
        custid_val = None
        if is_receipt and apod_type == "supplier":
            # Supplier mode για αποδείξεις
            logger.debug(f"[Γ Category] Receipt with supplier mode: checking if {apod_supplier_id} in {client_map['ids']}")
            if apod_supplier_id is not None and apod_supplier_id in (client_map["ids"] or set()):
                custid_val = apod_supplier_id
                logger.debug(f"[Γ Category] Using supplier CUSTID: {custid_val}")
            else:
                logger.warning(f"[Γ Category] Supplier ID {apod_supplier_id} not in client_db!")
                issues.append({
                    "code": "apodeixakia_supplier_not_in_client_db",
                    "message": f"Απόδειξη MARK={mark}: apodeixakia_supplier={apod_supplier_id} δεν υπάρχει στο client_db."
                })
                continue
        else:
            # Αναζήτηση με AFM στο client_db
            logger.debug(f"[Γ Category] Looking up AFM {afm_issuer} in client_db")
            custid_val = client_map["by_afm"].get(afm_issuer)
            if custid_val is None:
                # Έλεγχος αν έχουμε ήδη δημιουργήσει νέο CUSTID για αυτό το AFM
                if afm_issuer in new_suppliers:
                    custid_val = new_suppliers[afm_issuer]["custid"]
                    logger.debug(f"[Γ Category] Using previously created CUSTID {custid_val} for AFM {afm_issuer}")
                else:
                    # Δημιουργία νέου CUSTID
                    custid_val = next_custid
                    counterpart_name = str(rec.get("counterpart_name") or rec.get("Name_issuer") or "").strip()
                    if not counterpart_name:
                        counterpart_name = f"Συναλλασσόμενος {afm_issuer}"
                    
                    new_suppliers[afm_issuer] = {
                        "custid": custid_val,
                        "name": counterpart_name
                    }
                    next_custid += 1
                    logger.info(f"[Γ Category] Created new CUSTID {custid_val} for AFM {afm_issuer} ({counterpart_name})")
                    issues.append({
                        "code": "auto_created_supplier",
                        "message": f"Δημιουργήθηκε αυτόματα νέος συναλλασσόμενος: CUSTID={custid_val}, AFM={afm_issuer}, NAME={counterpart_name}"
                    })

        # Reason
        reason = _reason_for_rec_enhanced(rec, is_receipt, client_map.get("names"))
        
        # Date
        date_str = _ddmmyyyy(rec.get("issueDate") or rec.get("date"))
        if not date_str:
            issues.append({"code": "missing_date", "message": f"Λείπει ημερομηνία για MARK={rec.get('mark')}"})
            continue

        # Invoice value
        invoice_val = _compose_invoice_value(rec)

        # Parse lines
        lines = _parse_lines(rec)
        if not lines:
            issues.append({"code": "no_lines", "message": f"Δεν βρέθηκαν γραμμές για MARK={rec.get('mark')}"})
            continue

        # Συγκέντρωση ανά κατηγορία + VAT
        aggregated: Dict[Tuple[str, int], Dict[str, Any]] = {}
        sum_net = 0.0
        sum_vat = 0.0

        for ln in lines:
            cat = ln.get("category", "")
            vr = ln.get("vat_rate")
            net = _round2(ln.get("net", 0))
            vat = _round2(ln.get("vat", 0))

            # Κρατάμε το πραγματικό vat_rate για preview
            # αλλά θα χρησιμοποιήσουμε forced_rate=0 μόνο για account lookup
            canon = _canon_category(cat)
            
            # Έλεγχος για missing VAT rate - ΜΕ ΕΞΑΙΡΕΣΗ ΤΙΣ ΑΠΟΔΕΙΞΕΙΣ (όπως στο Β Category)
            if vr is None and (not is_receipt or canon != "αποδειξακια"):
                issues.append({
                    "code": "missing_vat_rate",
                    "message": f"Λείπει VAT rate για γραμμή στο MARK={mark}, category={cat}"
                })
                continue
            
            # Για αποδείξεις αποδειξακια, αν δεν υπάρχει VAT rate, θέτουμε 0
            if vr is None and is_receipt and canon == "αποδειξακια":
                vr = 0

            key = (cat, int(vr))
            if key not in aggregated:
                aggregated[key] = {"net": 0.0, "vat": 0.0, "category": cat, "vat_rate": int(vr)}
            aggregated[key]["net"] += net
            aggregated[key]["vat"] += vat
            sum_net += net
            sum_vat += vat

        if not aggregated:
            continue

        # Δημιουργία γραμμών με MTYPE για export (details)
        # Αλλά και formatted lines για preview (LINES)
        detail_rows = []  # Για export
        lines_out = []     # Για preview (ίδιο format με Β Category)
        lcodes_summary = []
        
        # Πρώτα βρες τον λογαριασμό προμηθευτή (θα χρειαστεί για έλεγχο)
        account_p = _account_header_P_g(settings_all, is_receipt)
        if not account_p:
            issues.append({
                "code": "missing_supplier_account_g",
                "message": f"Λείπει λογαριασμός προμηθευτή Γ για MARK={rec.get('mark')}"
            })
            continue
        
        for (cat, vr), agg in aggregated.items():
            canon = _canon_category(cat)
            
            # ΥΠΟΧΡΕΩΤΙΚΟΣ MTYPE
            mtype = _get_mtype_for_category(settings_all, canon)
            if not mtype:
                issues.append({
                    "code": "missing_mtype",
                    "message": f"Λείπει MTYPE για κατηγορία {canon}"
                })
                continue

            # Λογαριασμός Γ Κατηγορίας (ΧΡΕΩΣΗ)
            account, dbg = _account_detail_for_line_g(settings_all, cat, is_receipt, vr)
            if not account:
                issues.append({
                    "code": "missing_account_g",
                    "message": f"Δεν βρέθηκε λογαριασμός Γ για {canon}, VAT={vr}%. Tried: {dbg.get('tried_keys')}"
                })
                continue
            
            # Validation με Chart of Accounts
            if coa_df is not None and not _validate_account_in_coa(account, coa_df):
                issues.append({
                    "code": "account_not_in_coa",
                    "message": f"Ο λογαριασμός {account} δεν υπάρχει στο λογιστικό σχέδιο (κατηγορία: {canon}, ΦΠΑ: {vr}%)"
                })
                # Συνέχισε ούτως ή άλλως - θα δουν το warning

            # Detail row για export (με MTYPE) - ΧΡΕΩΣΗ
            # ΣΗΜΑΝΤΙΚΟ: Αν έχουμε CoA και θα προστεθεί λογαριασμός ΦΠΑ,
            # τότε η χρέωση εξόδων ΔΕΝ πρέπει να περιλαμβάνει το ΦΠΑ στο VATAMT
            vat_account = None
            if coa_df is not None and vr > 0:
                vat_account = _get_vat_account_from_coa(account, vr, coa_df)
                if vat_account:
                    logger.debug(f"[Γ Category] Found VAT account {vat_account} for {account} (ΦΠΑ: {vr}%)")
            
            if vat_account:
                # Αν υπάρχει λογαριασμός ΦΠΑ, χρέωσε μόνο το NET στα έξοδα
                detail_rows.append({
                    "MTYPE": mtype,
                    "LCODE": account,
                    "NETAMT": agg["net"],
                    "VATAMT": 0.0,  # Το ΦΠΑ θα πάει σε ξεχωριστή εγγραφή
                    "category": canon,
                    "vat_rate": vr,
                    "CRDB": 0,  # Χρέωση
                })
                
                # Προσθήκη ξεχωριστής εγγραφής για τον λογαριασμό ΦΠΑ
                detail_rows.append({
                    "MTYPE": mtype,
                    "LCODE": vat_account,
                    "NETAMT": agg["vat"],  # Το ποσό του ΦΠΑ
                    "VATAMT": 0.0,  # Δεν έχει δικό του ΦΠΑ
                    "category": f"{canon}_fpa",
                    "vat_rate": 0,
                    "CRDB": 0,  # Χρέωση
                })
            else:
                # Αν ΔΕΝ υπάρχει λογαριασμός ΦΠΑ, χρέωσε NET + VAT όπως πριν
                detail_rows.append({
                    "MTYPE": mtype,
                    "LCODE": account,
                    "NETAMT": agg["net"],
                    "VATAMT": agg["vat"],
                    "category": canon,
                    "vat_rate": vr,
                    "CRDB": 0,  # Χρέωση
                })
            
            # Line για preview - ΧΡΕΩΣΗ (Debit)
            lines_out.append({
                "category": canon,
                "vat_rate": int(vr) if vr is not None else 0,
                "vat_rate_in": int(vr) if vr is not None else 0,
                "lcode": account,
                "lcode_detail": account,
                "net": _round2(agg["net"]),
                "vat": _round2(agg["vat"]) if not vat_account else 0.0,
                "gross": _round2(agg["net"] + (agg["vat"] if not vat_account else 0.0)),
                "crdb": "Χ",
                "mtype": mtype,
            })
            lcodes_summary.append(account)
            
            # Αν προστέθηκε ΦΠΑ λογαριασμός, πρόσθεσε και στο preview
            if vat_account:
                lines_out.append({
                    "category": f"{canon} (ΦΠΑ {vr}%)",
                    "vat_rate": 0,
                    "vat_rate_in": 0,
                    "lcode": vat_account,
                    "lcode_detail": vat_account,
                    "net": _round2(agg["vat"]),
                    "vat": 0.0,
                    "gross": _round2(agg["vat"]),
                    "crdb": "Χ",
                    "mtype": mtype,
                })
                lcodes_summary.append(vat_account)

        if not detail_rows:
            continue

        # Προσθήκη ΠΙΣΤΩΣΗΣ προμηθευτή στα details και preview
        detail_rows.append({
            "MTYPE": detail_rows[0]["MTYPE"] if detail_rows else "",  # Χρήση του πρώτου MTYPE
            "LCODE": account_p,
            "NETAMT": sum_net,
            "VATAMT": sum_vat,
            "category": "προμηθευτής",
            "vat_rate": 0,  # 0 για πίστωση προμηθευτή
            "CRDB": 1,  # Πίστωση
        })
        
        # Line για preview - ΠΙΣΤΩΣΗ προμηθευτή
        lines_out.append({
            "category": "προμηθευτής",
            "vat_rate": 0,  # 0 για πίστωση προμηθευτή (όχι None)
            "vat_rate_in": 0,  # Συμβατότητα με template
            "lcode": account_p,
            "lcode_detail": account_p,  # Συμβατότητα με template
            "net": _round2(sum_net),
            "vat": _round2(sum_vat),
            "gross": _round2(sum_net + sum_vat),
            "crdb": "Π",  # Πίστωση για preview
            "mtype": detail_rows[0]["MTYPE"] if detail_rows else "",
        })
        lcodes_summary.append(account_p)

        # Πάρε issuer info από το record
        aa = str(rec.get("aa") or rec.get("AA") or "")
        series = str(rec.get("series") or rec.get("SERIES") or "")
        doc_type = str(rec.get("type") or "")
        issuer_name = str(rec.get("Name_issuer") or rec.get("issuerName") or rec.get("name") or client_map.get("names", {}).get(afm_issuer, ""))
        
        # Characts
        characts = characts_from_lines(rec)
        
        # OTHEREXPEND: Λοιπές δαπάνες - μόνο για αποδείξεις
        receipt_other_flag = 1 if (is_receipt and other_expenses_flag) else 0

        # Append row με format συμβατό με Β Category (για preview)
        # + extra fields για export
        rows.append({
            # Preview fields (format Β Category)
            "MARK": mark,
            "AA": aa,
            "SERIES": series,
            "DATE": date_str,
            "AFM_ISSUER": afm_issuer,
            "ISSUER_NAME": issuer_name,
            "CUSTID": custid_val,
            "NET": round(sum_net, 2),
            "VAT": round(sum_vat, 2),
            "GROSS": round(sum_net + sum_vat, 2),
            "DOCTYPE": doc_type,
            "REASON": reason,
            "CHARACTS": characts,
            "LINES": lines_out,
            "LCODE_DETAIL_SUMMARY": ", ".join(sorted(set(lcodes_summary))),
            "LCODE": account_p,
            "OTHEREXPEND": receipt_other_flag,
            # Export fields (για export_g_category)
            "MDATE": date_str,
            "INVOICE": invoice_val,
            "ISKEPYO": 1,  # 1 = ΚΕΠΥΟ Υπόχρεος
            "ISAGRYP": 0,
            "SUMKEPYOYP": round(sum_net, 2),
            "SUMKEPYONOTYP": 0,
            "SUMKEPYOFPA": round(sum_vat, 2),
            "LCODE_HEADER": account_p,
            "MSIGN": "",
            "_g_details": detail_rows,  # Κρατάμε τα MTYPE details για export
            "_source": rec,
        })
        logger.debug(f"[Γ Category] Successfully added row for MARK={mark}, CUSTID={custid_val}")

    ok = len(rows) > 0
    logger.info(f"[Γ Category] Final result: {len(rows)} rows, {len(issues)} issues, ok={ok}")
    return rows, issues, ok


def build_preview_strict_g_category(
    vat: str,
    credentials_json: str,
    cred_settings_json: str,
    invoices_json: Optional[str] = None,
    client_db: Optional[str] = None,
    base_invoices_dir: str = "data/epsilon",
    fiscal_year: Optional[int] = None,
) -> Dict[str, Any]:
    """Preview για Γ Κατηγορία"""
    rows, issues, ok = build_preview_rows_for_ui_g(
        vat=vat,
        credentials_json=credentials_json,
        cred_settings_json=cred_settings_json,
        invoices_json=invoices_json,
        client_db=client_db,
        base_invoices_dir=base_invoices_dir,
        fiscal_year=fiscal_year
    )
    paths = resolve_paths_for_vat(vat, invoices_json, client_db, None, base_invoices_dir)
    return {"ok": ok and not issues, "rows": rows, "issues": issues, "paths": paths}


def export_g_category(
    vat: str,
    credentials_json: str,
    cred_settings_json: str,
    invoices_json: Optional[str] = None,
    client_db: Optional[str] = None,
    out_xlsx: Optional[str] = None,
    base_invoices_dir: str = "data/epsilon",
    base_exports_dir: str = "exports",
    fiscal_year: Optional[int] = None
) -> Tuple[bool, Optional[str], List[Dict[str, Any]]]:
    """
    Export γέφυρας για Γ Κατηγορία με διπλογραφική μέθοδο.
    
    Κάθε τιμολόγιο παράγει:
    - Πολλαπλές ΧΡΕΩΣΕΙΣ (μία για κάθε κατηγορία με NET+VAT)
    - Μία ΠΙΣΤΩΣΗ στον προμηθευτή (σύνολο)
    
    Returns:
        (success, output_path, issues)
    """
    preview = build_preview_strict_g_category(
        vat=vat,
        credentials_json=credentials_json,
        cred_settings_json=cred_settings_json,
        invoices_json=invoices_json,
        client_db=client_db,
        base_invoices_dir=base_invoices_dir,
        fiscal_year=fiscal_year
    )
    
    nonfatal_codes = {"filtered_out_by_year", "auto_created_supplier", "account_not_in_coa"}
    fatals = [i for i in preview["issues"] if str(i.get("code", "")) not in nonfatal_codes]
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[Γ Export] Preview has {len(preview.get('rows', []))} rows, {len(preview['issues'])} issues")
    logger.info(f"[Γ Export] Fatal issues: {fatals}")
    logger.info(f"[Γ Export] Preview OK: {preview.get('ok')}")
    
    if fatals:
        logger.error(f"[Γ Export] Export failed due to fatal issues: {fatals}")
        return False, None, preview["issues"]
    
    # Έλεγχος αν υπάρχουν rows
    if not preview.get("rows"):
        logger.error(f"[Γ Export] No rows to export after filtering")
        return False, None, preview["issues"] + [{"code": "no_rows", "message": "Δεν υπάρχουν εγγραφές για εξαγωγή"}]
    
    nonfatal_issues = [i for i in preview["issues"] if str(i.get("code", "")) in nonfatal_codes]

    # Δημιουργία custom out_xlsx path με prefix "G_CATEGORY_" για διαχωρισμό
    if not out_xlsx:
        out_xlsx = os.path.join(base_exports_dir, f"{vat}_G_CATEGORY_EPSILON_BRIDGE_KINHSEIS.xlsx")
    
    paths = resolve_paths_for_vat(vat, invoices_json, client_db, out_xlsx, base_invoices_dir, base_exports_dir)
    rows = preview["rows"]

    # Δημιουργία ΚΙΝΗΣΕΙΣ με διπλογραφική μέθοδο
    flat: List[Dict[str, Any]] = []
    artid = 1
    
    # Διάβασμα settings για article movement type
    settings_all = _safe_json_read(cred_settings_json, default={})
    credentials = _safe_json_read(credentials_json, default=[])
    cred_list = credentials if isinstance(credentials, list) else [credentials]
    active = next((c for c in cred_list if str(c.get("vat")) == str(vat)), (cred_list[0] if cred_list else {}))
    settings_all = _merge_custom_accounts(settings_all, active)
    
    # Πάρε τον article movement type (π.χ. 12 για Αγορών-Εξόδων)
    article_mtype = _get_article_movement_type(settings_all)
    
    for rec in rows:
        # Χρησιμοποίησε τα _g_details για export (που έχουν category MTYPE codes)
        details = rec.get("_g_details", [])
        if not details:
            continue
        
        # ΧΡΕΩΣΕΙΣ: Μία γραμμή για κάθε κατηγορία (λογαριασμός εξόδων)
        for detail in details:
            if detail.get("CRDB") == 1:  # Αγνόησε την πίστωση από τα details (θα την προσθέσουμε μετά)
                continue
                
            flat.append({
                "ARTID": artid,
                "MTYPE": article_mtype,  # Κωδικός είδους κίνησης άρθρου (π.χ. 12)
                "ISKEPYO": rec["ISKEPYO"],
                "ISAGRYP": rec["ISAGRYP"],
                "CUSTID": rec["CUSTID"],
                "MDATE": rec["MDATE"],
                "REASON": rec["REASON"],
                "INVOICE": rec["INVOICE"],
                "SUMKEPYOYP": rec["SUMKEPYOYP"],
                "SUMKEPYONOTYP": rec["SUMKEPYONOTYP"],
                "SUMKEPYOFPA": rec["SUMKEPYOFPA"],
                "MSIGN": rec.get("MSIGN", ""),
                "LCODE": "",  # Άδειο για Γ Category (χρησιμοποιούμε LCODE_DETAIL)
                "OTHEREXPEND": int(rec.get("OTHEREXPEND", 0) or 0),
                # ARTICLE_DETAIL
                "LCODE_DETAIL": detail["LCODE"],
                "ISAGRYP_DETAIL": rec["ISAGRYP"],
                "KEPYOPARTY": "",
                "CRDB": 0,  # 0 = Χρέωση (Debit)
                "NETAMT": round(detail["NETAMT"], 2),  # Καθαρή αξία
                "VATAMT": round(detail["VATAMT"], 2),  # ΦΠΑ
                "AMOUNT": round(detail["NETAMT"] + detail["VATAMT"], 2),  # Σύνολο
                "INVOICE_DETAIL": rec["INVOICE"],
                "REASON_DETAIL": rec["REASON"],
            })
        
        # ΠΙΣΤΩΣΗ: Μία γραμμή για τον προμηθευτή (σύνολο)
        total_amount = rec["SUMKEPYOYP"] + rec["SUMKEPYOFPA"]
        flat.append({
            "ARTID": artid,
            "MTYPE": article_mtype,  # Ίδιο MTYPE με τις χρεώσεις
            "ISKEPYO": rec["ISKEPYO"],
            "ISAGRYP": rec["ISAGRYP"],
            "CUSTID": rec["CUSTID"],
            "MDATE": rec["MDATE"],
            "REASON": rec["REASON"],
            "INVOICE": rec["INVOICE"],
            "SUMKEPYOYP": rec["SUMKEPYOYP"],
            "SUMKEPYONOTYP": rec["SUMKEPYONOTYP"],
            "SUMKEPYOFPA": rec["SUMKEPYOFPA"],
            "MSIGN": rec.get("MSIGN", ""),
            "LCODE": "",  # Άδειο για Γ Category
            
            # ARTICLE_DETAIL
            "LCODE_DETAIL": rec["LCODE_HEADER"],
            "ISAGRYP_DETAIL": rec["ISAGRYP"],
            "KEPYOPARTY": "",
            "CRDB": 1,  # 1 = Πίστωση (Credit)
            "NETAMT": round(rec["SUMKEPYOYP"], 2),  # Καθαρή αξία συνόλου
            "VATAMT": round(rec["SUMKEPYOFPA"], 2),  # ΦΠΑ συνόλου
            "AMOUNT": round(total_amount, 2),  # Σύνολο
            "INVOICE_DETAIL": rec["INVOICE"],
            "REASON_DETAIL": rec["REASON"],
            "OTHEREXPEND": int(rec.get("OTHEREXPEND", 0) or 0)
        })
        
        artid += 1

    df_moves = pd.DataFrame(flat, columns=[
        "ARTID", "MTYPE", "ISKEPYO", "ISAGRYP", "CUSTID", "MDATE", "REASON", "INVOICE",
        "SUMKEPYOYP", "SUMKEPYONOTYP", "SUMKEPYOFPA", "MSIGN", "LCODE", 
        "LCODE_DETAIL", "ISAGRYP_DETAIL", "KEPYOPARTY", "CRDB", "NETAMT", "VATAMT", "AMOUNT",
        "INVOICE_DETAIL", "REASON_DETAIL","OTHEREXPEND"
    ])

    # ---------- Διαβάσε ρυθμίσεις για supplier mode (χωρίς να αλλάξεις τίποτα άλλο) ----------
    try:
        credentials = _safe_json_read(credentials_json, default=[])
    except Exception:
        credentials = []
    cred_list = credentials if isinstance(credentials, list) else [credentials]
    active = next((c for c in cred_list if str(c.get("vat")) == str(vat)), (cred_list[0] if cred_list else {}))
    apod_type = (active or {}).get("apodeixakia_type", "")
    apod_supplier_id = _safe_int((active or {}).get("apodeixakia_supplier", ""))

    # ---------- Χτίσε ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΥΣ με ΜΟΝΗ προσαρμογή για supplier mode ----------
    # 1) used CUSTIDs από το df_moves
    import math as _math
    used_ids_unique: List[Any] = []
    if not df_moves.empty and "CUSTID" in df_moves.columns:
        for x in df_moves["CUSTID"].tolist():
            if x is None:
                continue
            if isinstance(x, float):
                try:
                    if _math.isnan(x):
                        continue
                except Exception:
                    pass
            try:
                fx = float(x)
                x = int(fx) if fx.is_integer() else x
            except Exception:
                pass
            if x not in used_ids_unique:
                used_ids_unique.append(x)

    # 2) Χτίσε mapping CUSTID -> (AFM, NAME) από τα rows (χωρίς αλλαγές σε λογικές)
    partners: Dict[Any, Tuple[str, str]] = {}
    for rec in rows:
        cid = rec.get("CUSTID")
        if cid in (None, ""):
            continue
        afm = _norm_afm(rec.get("AFM_ISSUER") or rec.get("AFM") or "")
        nm  = str(rec.get("ISSUER_NAME") or rec.get("Name") or "").strip()
        if cid not in partners:
            partners[cid] = (afm, nm)

    # 3) Αν είναι supplier mode και ο supplier id χρησιμοποιήθηκε, ΕΠΙΒΑΛΕ default "000000000 / ΠΡΟΜΗΘΕΥΤΕΣ ΔΑΠΑΝΩΝ"
    if str(apod_type).lower() == "supplier" and apod_supplier_id not in (None, ""):
        if apod_supplier_id in used_ids_unique:
            partners[apod_supplier_id] = ("000000000", "ΠΡΟΜΗΘΕΥΤΕΣ ΔΑΠΑΝΩΝ")

    # 4) Κράτα ΜΟΝΟ όσους χρησιμοποιήθηκαν πράγματι στις κινήσεις (με τη σωστή σειρά)
    partners_rows: List[Dict[str, Any]] = []
    for cid in used_ids_unique:
        afm, nm = partners.get(cid, ("", ""))
        partners_rows.append({"Α/Α": cid, "ΑΦΜ": afm, "ΕΠΩΝΥΜΙΑ": nm})

    df_partners = pd.DataFrame(partners_rows, columns=["Α/Α","ΑΦΜ","ΕΠΩΝΥΜΙΑ"]).drop_duplicates(subset=["Α/Α"])
    try:
        df_partners["_k"] = df_partners["Α/Α"].apply(lambda x: int(x) if str(x).isdigit() else x)
        df_partners = df_partners.sort_values(by="_k", kind="mergesort").drop(columns=["_k"])
    except Exception:
        pass

    # ---------- Γράψε Excel: ΚΙΝΗΣΕΙΣ + ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΙ ----------
    with pd.ExcelWriter(paths["out"], engine="xlsxwriter", datetime_format="dd/mm/yyyy") as writer:
        # ΚΙΝΗΣΕΙΣ
        df_moves.to_excel(writer, index=False, sheet_name="ΚΙΝΗΣΕΙΣ")
        wb, ws = writer.book, writer.sheets["ΚΙΝΗΣΕΙΣ"]
        fmt_num  = wb.add_format({"num_format": "0.00"})
        fmt_int  = wb.add_format({"num_format": "0"})
        fmt_date = wb.add_format({"num_format": "dd/mm/yyyy"})
        idx = {n: i for i, n in enumerate(df_moves.columns)}
        for n in ["ARTID","MTYPE","ISKEPYO","ISAGRYP","ISAGRYP_DETAIL","MSIGN","CUSTID","CRDB","OTHEREXPEND"]:
            if n in idx:
                ws.set_column(idx[n], idx[n], 10, fmt_int)
        for n in ["SUMKEPYOYP","SUMKEPYONOTYP","SUMKEPYOFPA","KEPYOPARTY","NETAMT","VATAMT","AMOUNT"]:
            if n in idx:
                ws.set_column(idx[n], idx[n], 14, fmt_num)
        if "MDATE" in idx:
            ws.set_column(idx["MDATE"], idx["MDATE"], 12, fmt_date)
        for n, w in [("REASON", 40), ("REASON_DETAIL", 40), ("INVOICE", 18), ("INVOICE_DETAIL", 18), ("LCODE_DETAIL", 16), ("LCODE", 16)]:
            if n in idx:
                ws.set_column(idx[n], idx[n], w)

        # ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΙ
        if df_partners.empty:
            df_partners = pd.DataFrame(columns=["Α/Α","ΑΦΜ","ΕΠΩΝΥΜΙΑ"])
        df_partners.to_excel(writer, index=False, sheet_name="ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΙ")
        ws2 = writer.sheets["ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΙ"]
        try:
            ws2.set_column(0, 0, 8,  fmt_int)  # Α/Α
            ws2.set_column(1, 1, 14)           # ΑΦΜ
            ws2.set_column(2, 2, 40)           # ΕΠΩΝΥΜΙΑ
        except Exception:
            pass

    return True, paths["out"], nonfatal_issues
