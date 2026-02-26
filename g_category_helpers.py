# -*- coding: utf-8 -*-
"""
g_category_helpers.py

Helper functions για Γ Κατηγορία βιβλίων.
Περιλαμβάνει λογική για MTYPE codes, available categories, κλπ.
"""

from typing import Dict, List, Optional, Any


def get_mtype_settings(settings: Dict[str, Any]) -> Dict[str, str]:
    """
    Επιστρέφει mapping category -> MTYPE code από τα settings.
    
    Args:
        settings: Το credentials_settings dictionary
        
    Returns:
        Dict με {category: mtype_code} για όσες έχουν ορισμένο MTYPE
    """
    mtype_map = {}
    
    # Διαβάζουμε τα mtype_code_* keys
    for key, value in settings.items():
        if key.startswith("mtype_code_") and value:
            category = key.replace("mtype_code_", "")
            mtype_map[category] = str(value).strip()
    
    return mtype_map


def get_available_categories_for_g(
    settings: Dict[str, Any],
    all_categories: List[str]
) -> List[str]:
    """
    Φιλτράρει τις κατηγορίες και επιστρέφει μόνο αυτές που έχουν MTYPE code.
    
    Args:
        settings: Το credentials_settings dictionary
        all_categories: Λίστα με όλες τις διαθέσιμες κατηγορίες
        
    Returns:
        Λίστα με κατηγορίες που έχουν ορισμένο MTYPE
    """
    mtype_map = get_mtype_settings(settings)
    
    # ΔΕΝ φιλτράρουμε - απλά επιστρέφουμε όλες τις categories
    # Η λογική είναι: κάθε category έχει default MTYPE (1-5)
    # Οι custom ρυθμίσεις απλά override το default
    return all_categories


def get_mtype_for_category(settings: Dict[str, Any], category: str) -> Optional[str]:
    """
    Επιστρέφει το MTYPE code για μια κατηγορία.
    
    Args:
        settings: Το credentials_settings dictionary
        category: Η κατηγορία εξόδου
        
    Returns:
        MTYPE code ή None αν δεν υπάρχει
    """
    # Normalize category name
    canon = category.lower().strip().replace(" ", "_").replace("-", "_")
    
    # Ψάξε πρώτα στα settings
    key = f"mtype_code_{canon}"
    value = settings.get(key)
    if value:
        return str(value).strip()
    
    # Default mapping
    DEFAULT_MTYPE_MAPPING = {
        "αγορες_εμπορευματων": "1",
        "αγορες_α_υλων": "2",
        "γενικες_δαπανες": "3",
        "γενικες_δαπανες_με_φπα": "3",
        "αμοιβες_τριτων": "4",
        "δαπανες_χωρις_φπα": "5",
        "εγγυοδοσια": "3",
        "αποδειξακια": "3",
    }
    
    return DEFAULT_MTYPE_MAPPING.get(canon, "3")  # Default: Γενικά Έξοδα


def get_movement_types(settings: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Επιστρέφει τα διαθέσιμα article movement types από settings.
    
    Args:
        settings: Το credentials_settings dictionary
        
    Returns:
        Λίστα με dicts: {"value": code, "label": label}
    """
    # Labels για τα movement types
    MOVEMENT_TYPE_LABELS = {
        "agoron_exodon": "Αγορών - Εξόδων Επί Πιστώσει",
        "tameiaki": "Ταμειακή",
        "symsifistiki": "Συμψηφιστική",
        "agoron_exodon_tameiaki": "Αγορών - Εξόδων Ταμειακή",
        "agoron_exodon_opseos": "Αγορών - Εξόδων Όψεως",
    }
    
    result = []
    
    for key, label in MOVEMENT_TYPE_LABELS.items():
        setting_key = f"article_movement_type_{key}"
        value = settings.get(setting_key)
        
        # Προσθέτουμε μόνο αν έχει τιμή
        if value and str(value).strip():
            result.append({
                "value": str(value).strip(),
                "label": label,
                "key": key
            })
    
    return result


def get_mtype_label(mtype_code: str) -> str:
    """
    Επιστρέφει ανθρώπινο label για MTYPE code (article movement type).
    
    Args:
        mtype_code: Ο κωδικός κίνησης (π.χ. 11, 12, 14)
        
    Returns:
        Περιγραφή του κωδικού
    """
    # Συνήθεις τιμές
    labels = {
        "11": "Συμψηφιστική",
        "12": "Αγορών - Εξόδων Επί Πιστώσει",
        "13": "Πωλήσεων",
        "14": "Ταμειακή",
        "15": "Αγορών - Εξόδων Όψεως",
        "16": "Αγορών - Εξόδων Ταμειακή",
    }
    return labels.get(str(mtype_code), f"Κίνηση {mtype_code}")


def is_g_category_active(credential: Optional[Dict[str, Any]]) -> bool:
    """
    Ελέγχει αν το credential έχει Γ Κατηγορία βιβλία.
    
    Args:
        credential: Το active credential dictionary
        
    Returns:
        True αν είναι Γ Κατηγορία
    """
    if not credential:
        return False
    
    book_cat = str(credential.get("book_category", "")).strip().upper()
    return book_cat in ("Γ", "G")


def enrich_categories_with_mtype(
    categories: List[str],
    settings: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Εμπλουτίζει τη λίστα κατηγοριών με MTYPE info και movement types.
    
    Args:
        categories: Λίστα με category slugs
        settings: Το credentials_settings dictionary
        
    Returns:
        Dict με: {
            "categories": [...],  # Category data
            "movement_types": [...] # Available movement types
        }
    """
    from app import DEFAULT_INVOICE_CATEGORY_LABELS
    
    categories_data = []
    
    for cat in categories:
        # Βρίσκουμε το default MTYPE για αυτή την κατηγορία (για hint)
        default_mtype = get_mtype_for_category(settings, cat)
        
        categories_data.append({
            "value": cat,
            "label": DEFAULT_INVOICE_CATEGORY_LABELS.get(cat, cat),
            "default_mtype": default_mtype,
        })
    
    # Παίρνουμε τα διαθέσιμα movement types
    movement_types = get_movement_types(settings)

    # Καθορισμός του κωδικού για το "Αγορών - Εξόδων Ταμειακή" από τα settings
    # (χρησιμοποιείται στον client για γρήγορη σύγκριση).
    cash_code = ''
    cash_label = ''
    for mt in movement_types:
        # οι αντικειμενο-τύπου movment_types περιέχουν field "key"
        if mt.get('key') == 'agoron_exodon_tameiaki':
            cash_code = mt.get('value', '')
            cash_label = mt.get('label', '')
            break

    return {
        "categories": categories_data,
        "mtype_options": movement_types,
        "cash_mtype_code": cash_code,
        "cash_mtype_label": cash_label,
    }
