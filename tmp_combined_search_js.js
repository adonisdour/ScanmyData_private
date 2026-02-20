




// Loading overlay helpers
function showLoadingOverlay(title, message){
  try{
    const overlay = document.getElementById('loadingOverlay');
    const t = document.getElementById('loadingOverlayTitle');
    const m = document.getElementById('loadingOverlayMessage');
    if(t) t.textContent = title || 'Παρακαλώ περιμένετε...';
    if(m) m.textContent = message || 'Επεξεργασία δεδομένων';
    if(overlay){ overlay.style.display = 'flex'; overlay.classList.remove('hidden'); }
  }catch(e){ /* ignore */ }
}

function hideLoadingOverlay(){
  try{
    const overlay = document.getElementById('loadingOverlay');
    if(overlay){ overlay.style.display = 'none'; overlay.classList.add('hidden'); }
  }catch(e){}
}

// Convenience wrapper for long fetches that should show the overlay
async function fetchWithOverlay(url, opts, title, message){
  showLoadingOverlay(title || 'Παρακαλώ περιμένετε...', message || 'Επικοινωνία με τον διακομιστή...');
  try{
    const res = await fetch(url, opts);
    hideLoadingOverlay();
    return res;
  }catch(err){
    hideLoadingOverlay();
    throw err;
  }
}

// Enhance flash banners: add close button and auto-dismiss with fade
function enhanceFlashBanners(root=document){
  try{
    (root.querySelectorAll || Array.prototype) && root.querySelectorAll('.flash-banner').forEach(el => {
      if (el.dataset.enhanced) return; el.dataset.enhanced = '1';
      // add close button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ml-3 close-btn text-sm text-gray-600';
      btn.innerText = '✕';
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => { el.style.transition = 'opacity 0.35s'; el.style.opacity = '0'; setTimeout(()=>el.remove(), 360); });
      el.appendChild(btn);
      // auto-dismiss unless data-ttl="0"
      const ttl = parseInt(el.getAttribute('data-ttl') || '5000', 10);
      if (ttl > 0) {
        setTimeout(()=>{ try{ el.style.transition='opacity 0.5s'; el.style.opacity='0'; setTimeout(()=>el.remove(),520); }catch(_){}} , ttl);
      }
    });
  }catch(e){console.warn('enhanceFlashBanners failed', e);} 
}

document.addEventListener('DOMContentLoaded', function(){ enhanceFlashBanners(document); }, { once: true });

function normalizeScanValue(raw){
  try {
    const text = (raw == null) ? '' : String(raw).trim();
    if (!text) return '';
    if (!/^https?:\/\//i.test(text)) return text;
    if (typeof URL === 'undefined') return text;

    const url = new URL(text);
    const host = (url.hostname || '').toLowerCase();
    if (host.includes('epsilondigital')){
      url.pathname = (url.pathname || '/').replace(/:\d+(?=$|\/)/g, '');
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      if (!url.pathname.startsWith('/')) url.pathname = '/' + url.pathname;
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch (err){
    return (raw == null) ? '' : String(raw).trim();
  }
}

function isReceiptsOn(){
  const r = document.getElementById('useReceiptsSwitch');
  return !!(r && r.checked);
}

function setActiveProfileHint(name){
  const el = document.getElementById('activeRepeatProfileHint');
  const sw = document.getElementById('repeatEntrySwitch');
  if(!el || !sw) return;

  // Δείξε μόνο όταν: επαναληψιμη ON ΚΑΙ ΔΕΝ είμαστε σε Αποδείξεις
  if (sw.checked && !isReceiptsOn()) {
    el.style.display = '';
    el.textContent = "Ενεργό προφίλ επαναληψιμης: " + (name || "Γενικό");
  } else {
    el.style.display = 'none';
    el.textContent = "";
  }
}


function currentScannerMode(){
  try {
    const modeAttr = document.body && document.body.dataset ? document.body.dataset.mode : '';
    if (modeAttr) {
      const normalized = String(modeAttr).trim().toLowerCase();
      if (normalized === 'receipts' || normalized === 'invoices') {
        return normalized;
      }
    }
  } catch (_) {}
  return isReceiptsOn() ? 'receipts' : 'invoices';
}

function readAutoSubmitState(){
  try {
    if (window.RC && window.RC.autoSubmitControls && typeof window.RC.autoSubmitControls.get === 'function'){
      return !!window.RC.autoSubmitControls.get();
    }
  } catch (_) {}
  try {
    return localStorage.getItem('rc:autoSubmitEnabled') === '1';
  } catch (_) {
    return false;
  }
}

function applyScannedPayload(payload, options){
  options = options || {};
  const rawVal = payload && payload.raw != null ? String(payload.raw).trim() : '';
  const markVal = payload && payload.mark != null ? String(payload.mark).trim() : '';
  const normalizedRaw = normalizeScanValue(rawVal);
  const effectiveRaw = normalizedRaw || rawVal;
  if (payload && typeof payload === 'object'){
    payload.raw = effectiveRaw;
  }
  const chosen = markVal || effectiveRaw;
  if (!chosen) return null;

  let isUrl;
  if (Object.prototype.hasOwnProperty.call(options, 'forceUrl')) {
    isUrl = !!options.forceUrl;
  } else {
    isUrl = /^https?:\/\//i.test(effectiveRaw);
  }

  let mode = options.mode || currentScannerMode();
  if (mode !== 'receipts' && mode !== 'invoices') {
    mode = 'invoices';
  }

  let appliedTo = null;
  if (mode === 'receipts' && isUrl) {
    const receiptsInput = document.getElementById('scrapeUrlInput');
    if (receiptsInput) {
      receiptsInput.value = effectiveRaw;
      try { receiptsInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      appliedTo = 'receipts';
    }
    const hiddenUrl = document.getElementById('scrapeUrlField');
    if (hiddenUrl) hiddenUrl.value = effectiveRaw;
  } else {
    const markInput = document.getElementById('markInput');
    if (markInput) {
      const nextValue = markVal ? markVal : (isUrl ? effectiveRaw : chosen);
      markInput.value = nextValue;
      try { markInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      appliedTo = 'mark';
    }
  }

  return {
    appliedTo,
    raw: effectiveRaw,
    mark: markVal,
    is_url: !!isUrl,
    mode
  };
}





function relabelSummaryModal(){
  const modal = document.getElementById('summaryModal');
  if(!modal) return;

  // Κελιά που δείχνουν την κατηγορία ως κείμενο
  modal.querySelectorAll('[data-cat-key], .category-cell, .summary-category')
    .forEach(el=>{
      const raw = el.getAttribute('data-cat-key') || el.textContent.trim();
      el.textContent = labelForCategory(raw);
    });

  // Επιλογές dropdown (αν έχει select για κατηγορία)
  modal.querySelectorAll('select[name$="[category]"] option')
    .forEach(o=>{ o.textContent = labelForCategory(o.value); });
}

// Αν έχεις ήδη openModal(id), απλά κάλεσέ το εκεί:
const oldOpenModal = window.openModal || function(id){
  document.getElementById(id)?.classList.remove('hidden');
};
// helper: βεβαιώσου ότι τα labels έχουν φορτωθεί
async function ensureCategoryLabelsLoaded(){
  if (window.__labelsPrimed) return;
  try {
    const r = await fetch('/api/char_profiles?vat=' + encodeURIComponent(VAT), { credentials: 'same-origin' });
    const j = await r.json();
    if (j && j.category_labels) {
      // Το CATEGORY_LABELS υπάρχει ήδη στο αρχείο (ίδιο scope με labelForCategory)
      Object.assign(CATEGORY_LABELS, j.category_labels);
      if (window.CATEGORY_LABELS) Object.assign(window.CATEGORY_LABELS, j.category_labels);
    }
  } catch(e) {}
  window.__labelsPrimed = true;
}

// ΠΑΛΙΟ
// window.openModal = function(id){
//   oldOpenModal(id);
//   if(id === 'summaryModal') relabelSummaryModal();
// };

// ΝΕΟ
window.openModal = function(id){
  oldOpenModal(id);
  if (id === 'summaryModal') {
    ensureCategoryLabelsLoaded().then(() => { try { relabelSummaryModal(); } catch(_){} });
  }
};

// Δέχεται είτε ποσοστά είτε kat_fpa_* και επιστρέφει ΠΑΝΤΑ ποσοστά σύμφωνα με: Α→0, Β→6, Γ→13, Δ→17, Ε→24
// ΚΑΝΟΝΑΣ: Α→0%, Β→6%, Γ→13%, Δ→17%, Ε→24%
function normalizeMapping(m){
  const pct = {"0%":"", "6%":"", "13%":"", "17%":"", "24%":""};
  if (!m) return pct;
  if ('kat_fpa_a' in m || 'kat_fpa_b' in m || 'kat_fpa_g' in m || 'kat_fpa_d' in m || 'kat_fpa_e' in m){
    pct["0%"]  = m.kat_fpa_a || "";
    pct["6%"]  = m.kat_fpa_b || "";
    pct["13%"] = m.kat_fpa_g || "";
    pct["17%"] = m.kat_fpa_d || "";
    pct["24%"] = m.kat_fpa_e || "";
    return pct;
  }
  for (const k in pct){ if (Object.prototype.hasOwnProperty.call(m,k)) pct[k] = m[k] || ""; }
  return pct;
}
function percentToKat(p){
  p = p || {};
  return {
    kat_fpa_a: p["0%"]  || "",
    kat_fpa_b: p["6%"]  || "",
    kat_fpa_g: p["13%"] || "",
    kat_fpa_d: p["17%"] || "",
    kat_fpa_e: p["24%"] || "",
  };
}
function katToPercent(k){
  k = k || {};
  return {
    "0%":  k.kat_fpa_a || "",
    "6%":  k.kat_fpa_b || "",
    "13%": k.kat_fpa_g || "",
    "17%": k.kat_fpa_d || "",
    "24%": k.kat_fpa_e || "",
  };
}




(() => {
  const VAT = "{{ vat or '' }}";
  const VAT_KEYS = ["0%","6%","13%","17%","24%"];

  // ενεργές κατηγορίες πελάτη (χωρίς «αποδειξακια»)
  let CUSTOMER_CATEGORIES = (function(){
    try {
      return {{ (customer_categories or []) | tojson | safe }} || [];
    } catch(e){ return []; }
  })();

  let CATEGORY_VAT_CONSTRAINTS = {};

  function normalizeCategoryList(rawList){
    const normalized = [];
    (rawList || []).forEach(item => {
      if(!item) return;
      if(typeof item === 'string'){
        const key = item.trim();
        if(!key || key.toLowerCase() === 'αποδειξακια') return;
        if(!normalized.includes(key)) normalized.push(key);
        return;
      }
      if(typeof item === 'object'){
        const key = String(item.value || item.id || item.slug || '').trim();
        if(!key || key.toLowerCase() === 'αποδειξακια') return;
        const label = String(item.label || '').trim();
        if(label){
          CATEGORY_LABELS[key] = label;
          if(typeof window !== 'undefined'){
            window.CATEGORY_LABELS = window.CATEGORY_LABELS || {};
            window.CATEGORY_LABELS[key] = label;
          }
        }
        if(!normalized.includes(key)) normalized.push(key);
      }
    });
    return normalized;
  }

  CUSTOMER_CATEGORIES = normalizeCategoryList(CUSTOMER_CATEGORIES);

  setCategoryConstraints((function(){
    try {
      return {{ (category_vat_constraints or {}) | tojson | safe }} || {};
    } catch(e){ return {}; }
  })());

  function setCategoryConstraints(map){
    if(map && typeof map === 'object'){
      CATEGORY_VAT_CONSTRAINTS = map;
    } else {
      CATEGORY_VAT_CONSTRAINTS = {};
    }
  }

  function categoryAllowedForVat(cat, vatKey){
    if(!cat) return false;
    const key = String(cat);
    const allowed = CATEGORY_VAT_CONSTRAINTS[key];
    if(!allowed || !allowed.length) return false;
    return allowed.includes(vatKey);
  }

  
  async function fetchDefaultMapping() {
    try {
      const r = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(VAT), {credentials:'same-origin'});
      if (!r.ok) return {};
      const j = await r.json();
      return normalizeMapping((j && j.repeat_entry && j.repeat_entry.mapping) || {});
    } catch (_e) { return {}; }
  }

  async function fetchProfilesAndTags() {
    try {
      const r = await fetch('/api/char_profiles?vat=' + encodeURIComponent(VAT), {credentials:'same-origin'});
      const j = await r.json();
      if (j && j.category_labels) {
        Object.assign(CATEGORY_LABELS, j.category_labels);
        if (typeof window !== 'undefined') {
          window.CATEGORY_LABELS = window.CATEGORY_LABELS || {};
          Object.assign(window.CATEGORY_LABELS, j.category_labels);
        }
      }
      if (Array.isArray(j.expense_tags) && j.expense_tags.length) {
        CUSTOMER_CATEGORIES = normalizeCategoryList(j.expense_tags);
        if (typeof window !== 'undefined') {
          window.CUSTOMER_CATEGORIES = CUSTOMER_CATEGORIES.slice();
        }
      }
      if (j && j.vat_constraints) {
        setCategoryConstraints(j.vat_constraints);
      }
      // κανονικοποίηση mapping κάθε προφίλ σε ποσοστά
      const profiles = Array.isArray(j.profiles) ? j.profiles.map(p => ({
        ...p, mapping: normalizeMapping(p.mapping || {})
      })) : [];
      return profiles;
    } catch (_e) { return []; }
  }

  // ---- DOM refs
  const modal      = document.getElementById('repeatMappingModal');
  const listBox    = document.getElementById('repeatMappingList');
  const selProfile = document.getElementById('charProfileSelect');
  const hint       = document.getElementById('charMissingHint');
  const btnSave    = document.getElementById('repeatModalSave');
  const btnCancel  = document.getElementById('repeatModalCancel');
  const btnX       = document.getElementById('repeatModalCloseX');
  const btnEdit    = document.getElementById('editRepeatMappingBtn');

  const show = () => modal.style.display = 'flex';
  const hide = () => modal.style.display = 'none';
  const setHint = (t) => { hint.textContent = t || ''; hint.style.display = t ? '' : 'none'; };

  // φτιάχνει μία γραμμή (label + select)
  function makeRow(pct, selected) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-3';
    const label = document.createElement('div');
    label.className = 'w-20 text-sm font-medium';
    label.textContent = pct;

    const sel = document.createElement('select');
    sel.className = 'p-1 border rounded flex-1';
    sel.dataset.vat = pct;

    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— επίλεξε —'; sel.appendChild(o0);
    const vatKey = pct;
    const allowedCats = CUSTOMER_CATEGORIES.filter(cat => categoryAllowedForVat(cat, vatKey));
    allowedCats.forEach(t => {
      const o = document.createElement('option'); o.value = t; o.textContent = labelForCategory(t);

      if (t === selected) o.selected = true;
      sel.appendChild(o);
    });

    if (selected && !allowedCats.includes(selected)) {
      const extra = document.createElement('option');
      extra.value = selected;
      extra.textContent = `${labelForCategory(selected)} (μη διαθέσιμο για ${vatKey})`;
      extra.dataset.unavailable = '1';
      sel.appendChild(extra);
      sel.value = selected;
    }

    wrap.appendChild(label);
    wrap.appendChild(sel);
    return wrap;
  }

  function renderMapping(mapping = {}) {
    const m = normalizeMapping(mapping);
    listBox.innerHTML = '';                            // ← καθαρίζει ΠΑΝΤΑ (no duplicates)
    VAT_KEYS.forEach(k => listBox.appendChild(makeRow(k, m[k] || '')));
  }

  function readMappingFromUI() {
    const out = {};
    const missing = [];
    listBox.querySelectorAll('select[data-vat]').forEach(sel => {
      const k = sel.dataset.vat;
      const v = (sel.value || '').trim();
      if (!v) missing.push(k);
      out[k] = v;
    });
    return { out, missing };
  }

  // Global override ώστε άλλο code-path να ανοίγει το modal με έτοιμο mapping
  window._repeatMappingOverride = null;

  async function fillProfileSelect(profiles, defaultMapping) {
    selProfile.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'Γενικό';
    o0.dataset.mapping = JSON.stringify(normalizeMapping(defaultMapping || {}));
    selProfile.appendChild(o0);

    profiles.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id || p.name || '';
      o.textContent = p.name || '(χωρίς όνομα)';
      o.dataset.mapping = JSON.stringify(normalizeMapping(p.mapping || {}));
      selProfile.appendChild(o);
    });
  }

  selProfile.addEventListener('change', () => {
    const opt = selProfile.selectedOptions[0];
    const mapping = (opt && opt.dataset.mapping) ? JSON.parse(opt.dataset.mapping) : {};
    renderMapping(mapping);     // ← προ-συμπλήρωση ανά προφίλ ή «καμία»
    setHint('');
  });

  btnSave.addEventListener('click', async () => {
  const { out, missing } = readMappingFromUI();
  if (missing.length) { setHint('Συμπλήρωσε κατηγορία για: ' + missing.join(', ')); return; }
  setHint('');

  const profileName = selProfile?.value || "";   // "" = Γενικό
  const vatToUse = window._repeatModalVAT || "{{ vat or '' }}";  // χρησιμοποίησε το ανιχνευθέν VAT

  // Για Γ Κατηγορία: έλεγχος ΑΠΑΡΑΙΤΗΤΟΥ invoice MTYPE
  const repeatMtypeSelect = document.getElementById('repeatMtypeSelect');
  const invoiceMtype = (repeatMtypeSelect && repeatMtypeSelect.value) || "";

  // Αν το container είναι ορατό, το MTYPE είναι ΑΠΑΡΑΙΤΗΤΟ
  const repeatMtypeContainer = document.getElementById('repeatMtypeContainer');
  if (repeatMtypeContainer && repeatMtypeContainer.style.display !== 'none' && !invoiceMtype) {
    setHint('Επίλεξε Είδος Κίνησης για Τιμολόγια.');
    return;
  }

  // Διατήρηση υπάρχοντος receipt_mtype
  let existingReceiptMtype = '';
  try {
    const getResp = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(vatToUse), {
      credentials: 'same-origin'
    });
    const getData = await getResp.json();
    if (getData.ok && getData.repeat_entry && getData.repeat_entry.receipt_mtype) {
      existingReceiptMtype = getData.repeat_entry.receipt_mtype;
    }
  } catch(e) {
    console.warn('Failed to fetch existing receipt_mtype', e);
  }

  try {
    const r = await fetch('/api/repeat_entry/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({
        vat: vatToUse,
        enabled: true,
        mapping: out,                  // 0/6/13/17/24
        invoice_mtype: invoiceMtype,   // MTYPE για τιμολόγια (ΑΠΑΡΑΙΤΗΤΟ)
        receipt_mtype: existingReceiptMtype,   // Διατήρηση υπάρχοντος receipt MTYPE
        profile_name: profileName      // <-- ΣΗΜΑΝΤΙΚΟ
      })
    });
    const j = await r.json();
    if (!j.ok) { setHint(j.error || 'Αποτυχία αποθήκευσης'); return; }

    // Κλείσε modal
    document.getElementById('repeatMappingModal').style.display = 'none';

    // Flash επιτυχίας
    showFlash('Ενημερώθηκε η ρύθμιση επαναληπτικής εισαγωγής.', 'success', 3000);

    // Ενημέρωσε την ένδειξη πάνω από το toggle
    setActiveProfileHint(profileName);

    // Βάλε checked το switch & δείξε το κουμπί "Επεξεργασία"
    document.getElementById('repeatEntrySwitch')?.setAttribute('checked', 'checked');
    document.getElementById('editRepeatMappingBtn')?.classList.remove('hidden');
  } catch (_e) {
    setHint('Δικτυακό σφάλμα.');
  }
});


  [btnCancel, btnX].forEach(b => b && b.addEventListener('click', hide));
  async function fetchRepeatState(vat){
  // δεν πειράζουμε το δικό σου /api/repeat_entry/get
  // αν υπάρχει το νέο status endpoint, το προτιμάμε για να πάρουμε και profile_name
  try{
    const r = await fetch('/api/repeat_entry/status2' + (vat?('?vat='+encodeURIComponent(vat)):''),
                          {credentials:'same-origin'});
    if(r.ok){
      const j = await r.json();
      const repeat = j.repeat_entry || {};
      return {
        defaultMap: (repeat.mapping || {}),
        invoiceMtype: (repeat.invoice_mtype || ""),
        receiptMtype: (repeat.receipt_mtype || ""),
        savedName: (repeat.profile_name || "")
      };
    }
  }catch(_){}
  // fallback: παλιό endpoint που ίσως δεν επιστρέφει profile_name
  try{
    const r = await fetch('/api/repeat_entry/get' + (vat?('?vat='+encodeURIComponent(vat)):''),
                          {credentials:'same-origin'});
    const j = await r.json();
    const repeat = j.repeat_entry || {};
    return {
      defaultMap: (repeat.mapping || {}),
      invoiceMtype: (repeat.invoice_mtype || ""),
      receiptMtype: (repeat.receipt_mtype || ""),
      savedName: (repeat.profile_name || "")
    };
  }catch(_){}
  return { defaultMap:{}, invoiceMtype:"", receiptMtype:"", savedName:"" };
}
  // Άνοιγμα modal: ΠΑΝΤΑ καθαρό render, χωρίς διπλο-append
  async function openModal(){
  // Προσπάθησε να πάρεις το VAT από διάφορες πηγές
  let VAT = "{{ vat or '' }}";
  
  // Αν δεν υπάρχει VAT, προσπάθησε να το πάρεις από την ενεργή session
  if (!VAT || !VAT.trim()) {
    try {
      const r = await fetch('/api/repeat_entry/get', {credentials:'same-origin'});
      const j = await r.json();
      if (j && j.vat) VAT = j.vat;
      if (j && j.afm) VAT = j.afm;
    } catch(_) {}
  }
  
  // Αποθήκευσε το VAT στη μεταβλητή ώστε να το χρησιμοποιήσει το save
  window._repeatModalVAT = VAT;
  
  const hint = document.getElementById('charMissingHint');
  if(hint){ hint.style.display='none'; hint.textContent=''; }

  // 1) φέρνουμε προφίλ + tags + repeat state (mapping + ενεργό όνομα προφίλ)
  const [profiles, defaultFromGet, state] = await Promise.all([
    (async () => {
      try {
        const r = await fetch('/api/char_profiles?vat=' + encodeURIComponent(VAT), {credentials:'same-origin'});
        const j = await r.json();
        if (j && j.category_labels) {
          Object.assign(CATEGORY_LABELS, j.category_labels);
          if (typeof window !== 'undefined') {
            window.CATEGORY_LABELS = window.CATEGORY_LABELS || {};
            Object.assign(window.CATEGORY_LABELS, j.category_labels);
          }
        }
        if (j && j.vat_constraints) {
          setCategoryConstraints(j.vat_constraints);
        }
        if (Array.isArray(j.expense_tags)) {
          CUSTOMER_CATEGORIES = normalizeCategoryList(j.expense_tags);
          if (typeof window !== 'undefined') {
            window.CUSTOMER_CATEGORIES = CUSTOMER_CATEGORIES.slice();
          }
        }
        return (j.profiles || []).map(p => ({...p, mapping: normalizeMapping(p.mapping || p.map || {})}));
      } catch (_e) { return []; }
    })(),
    (async () => {
      try {
        const r = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(VAT), {credentials:'same-origin'});
        const j = await r.json();
        return (j && j.repeat_entry && j.repeat_entry.mapping) || {};
      } catch (_e) { return {}; }
    })(),
    fetchRepeatState(VAT) // <-- φέρνει defaultMap + savedName
  ]);

  const defaultMap = Object.keys(state.defaultMap || {}).length ? state.defaultMap : defaultFromGet;
  const savedName  = state.savedName || "";
  const invoiceMtype = state.invoiceMtype || "";
  const receiptMtype = state.receiptMtype || "";

  // 2) γέμισε το dropdown των προφίλ (πρώτο = "Γενικό")
  const sel = document.getElementById('charProfileSelect');
  if(sel){
    sel.innerHTML = "";
    const o0 = document.createElement('option');
    o0.value = "";
    o0.textContent = "Γενικό";
    o0.dataset.mapping = JSON.stringify(normalizeMapping(defaultMap || {}));
    sel.appendChild(o0);

    profiles.forEach(p=>{
      const o = document.createElement('option');
      o.value = p.name || p.id || "";
      o.textContent = p.name || "(χωρίς όνομα)";
      o.dataset.id = p.id || "";
      o.dataset.mapping = JSON.stringify(normalizeMapping(p.mapping || p.map || {}));
      sel.appendChild(o);
    });
    
    // Populate MTYPE dropdowns (μόνο για Γ Κατηγορία)
    const repeatMtypeContainer = document.getElementById('repeatMtypeContainer');
    const repeatMtypeSelect = document.getElementById('repeatMtypeSelect');
    const repeatReceiptMtypeContainer = document.getElementById('repeatReceiptMtypeContainer');
    const repeatReceiptMtypeSelect = document.getElementById('repeatReceiptMtypeSelect');
    
    if (window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.mtype_options && window.G_CATEGORY_DATA.mtype_options.length > 0) {
      // Είναι Γ Κατηγορία - δείξε τα MTYPE dropdowns
      if (repeatMtypeContainer) repeatMtypeContainer.style.display = '';
      if (repeatReceiptMtypeContainer) repeatReceiptMtypeContainer.style.display = '';
      
      // Γέμισε το dropdown για τιμολόγια
      if (repeatMtypeSelect) {
        repeatMtypeSelect.innerHTML = '<option value="">-- επίλεξε είδος κίνησης --</option>';
        window.G_CATEGORY_DATA.mtype_options.forEach(mt => {
          const opt = document.createElement('option');
          opt.value = mt.value;
          opt.textContent = mt.label + ' (' + mt.value + ')';
          if (invoiceMtype && mt.value === invoiceMtype) {
            opt.selected = true;
          }
          repeatMtypeSelect.appendChild(opt);
        });
      }
      
      // Γέμισε το dropdown για αποδείξεις
      if (repeatReceiptMtypeSelect) {
        repeatReceiptMtypeSelect.innerHTML = '<option value="">-- επίλεξε είδος κίνησης --</option>';
        window.G_CATEGORY_DATA.mtype_options.forEach(mt => {
          const opt = document.createElement('option');
          opt.value = mt.value;
          opt.textContent = mt.label + ' (' + mt.value + ')';
          if (receiptMtype && mt.value === receiptMtype) {
            opt.selected = true;
          }
          repeatReceiptMtypeSelect.appendChild(opt);
        });
      }
    } else {
      // Όχι Γ Κατηγορία - κρύψε τα MTYPE dropdowns
      if (repeatMtypeContainer) repeatMtypeContainer.style.display = 'none';
      if (repeatReceiptMtypeContainer) repeatReceiptMtypeContainer.style.display = 'none';
    }

    // 3) αν έχει αποθηκευτεί ενεργό προφίλ, επίλεξέ το και προ-συμπλήρωσε
    if (savedName && Array.from(sel.options).some(o => o.value === savedName)){
      sel.value = savedName;
      try{
        const m = JSON.parse(sel.selectedOptions[0].dataset.mapping || "{}");
        renderMapping(m);
        setActiveProfileHint(savedName);

      } catch (_e) {
        renderMapping(defaultMap);
      }
    } else {
      sel.value = "";
      renderMapping(defaultMap); // "Γενικό"
      setActiveProfileHint("");

    }

    sel.onchange = () => {
      const opt = sel.selectedOptions[0];
      const m = (opt && opt.dataset.mapping) ? JSON.parse(opt.dataset.mapping) : defaultMap;
      renderMapping(m);
      setActiveProfileHint(sel.value || "");

      hint && (hint.style.display='none', hint.textContent='');
    };
  } else {
    // αν για κάποιο λόγο δεν υπάρχει το select, τουλάχιστον δείξε τα dropdowns
    renderMapping(defaultMap);
  }

  document.getElementById('repeatMappingModal').style.display = 'flex';
}
  
  document.getElementById('editRepeatMappingBtn')?.addEventListener('click', openModal);
  

  // Εξαγωγή για χρήση από αλλού
  window.openRepeatModal = openModal;
  // auto-open του modal όταν έρχομαι από profiles με ?open_repeat=1
try {
  const p = new URLSearchParams(location.search);
  if (p.get('open_repeat') === '1') {
    setTimeout(() => {
      if (window.openRepeatModal) window.openRepeatModal();
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('open_repeat');
        history.replaceState({}, '', url.toString());
      } catch(_){}
    }, 0);
  }
} catch (_e) {}

})();



(function(){
  const VAT = "{{ vat or '' }}";

  // Διαβάζουμε το mapping που βλέπει ο χρήστης στο modal (0/6/13/17/24)
  function readPercentMappingFromUI(){
    // Αν υπάρχει ήδη helper στη σελίδα σου, χρησιμοποίησέ τον
    if (typeof window.readMappingFromUI === 'function') {
      try {
        const r = window.readMappingFromUI(); // συνήθως { out: { "0%": "...", ... } }
        return (r && (r.out || r.mapping)) || r || {};
      } catch(e) {}
    }
    // Fallback: δοκίμασε data-vat ή γνωστά ids
    const pick = (sel) => (document.querySelector(sel)?.value || "");
    return {
      "0%":  pick('[data-vat="0%"]')  || pick('#repeat_vat_0')  || pick('#vat_0'),
      "6%":  pick('[data-vat="6%"]')  || pick('#repeat_vat_6')  || pick('#vat_6'),
      "13%": pick('[data-vat="13%"]') || pick('#repeat_vat_13') || pick('#vat_13'),
      "17%": pick('[data-vat="17%"]') || pick('#repeat_vat_17') || pick('#vat_17'),
      "24%": pick('[data-vat="24%"]') || pick('#repeat_vat_24') || pick('#vat_24'),
    };
  }

  // Μετατροπή από ποσοστά -> kat_fpa_* για /api/profiles/save
  
  // Δένουμε hook στο κουμπί "Αποθήκευση" του modal χωρίς να πειράξουμε την υπάρχουσα ροή σου
  const saveBtn = document.getElementById('repeatModalSave');
  if (saveBtn && !saveBtn.dataset._profileUpdateBound){
    saveBtn.addEventListener('click', async function(){
      try{
        const sel = document.getElementById('charProfileSelect');
        if (!sel) return;

        const profileName = (sel.value || '').trim();
        // Αν είναι "Γενικό" (κενό value), δεν ενημερώνουμε profile στο credentials
        if (!profileName) return;

        const opt = sel.selectedOptions && sel.selectedOptions[0];
        const profileId = (opt && opt.dataset && opt.dataset.id) ? opt.dataset.id : "";

        // Διάβασε το mapping που έβαλε ο χρήστης στα dropdowns του modal τώρα
        const pctMap = readPercentMappingFromUI();      // 0/6/13/17/24
        const katMap = percentToKat(pctMap);            // kat_fpa_*

        if (profileId){
          // ΚΥΡΙΑ ΟΔΟΣ: Update στο credentials ΜΕ id -> δεν δημιουργεί νέο στο rename
          const r = await fetch('/api/profiles/save', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            credentials:'same-origin',
            body: JSON.stringify({ id: profileId, name: profileName, map: katMap })
          });
          const j = await r.json().catch(()=>null);
          if (!(j && j.ok)) {
            console.warn('profiles/save failed:', j);
            // Fallback (σπάνια χρειάζεται): legacy char_profiles με mapping σε ποσοστά
            await fetch('/api/char_profiles/save', {
              method:'POST',
              headers:{ 'Content-Type':'application/json' },
              credentials:'same-origin',
              body: JSON.stringify({ vat: VAT, name: profileName, mapping: pctMap })
            });
          }
        } else {
          // Δεν έχουμε id (παλιό/legacy profile) -> fallback σε char_profiles (ποσοστά)
          await fetch('/api/char_profiles/save', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            credentials:'same-origin',
            body: JSON.stringify({ vat: VAT, name: profileName, mapping: pctMap })
          });
        }
        // Δεν κάνουμε preventDefault: η δική σου αποθήκευση repeat_entry συνεχίζει κανονικά
      }catch(err){
        console.warn('modal profile update failed', err);
      }
    }, true); // capture ώστε να τρέξει ανεξάρτητα απ’ τους άλλους listeners
    saveBtn.dataset._profileUpdateBound = '1';
  }
})();



// ============ RECEIPT MTYPE MODAL LOGIC ============
(function(){
  const G_CATEGORY_DATA = (function(){
    try { return {{ g_category_data | tojson | safe }} || null; }
    catch(e){ return null; }
  })();

  const RECEIPT_MTYPE_STORAGE_KEY = 'receipt_mtype';

  function loadReceiptMtype(){
    // Try to load from backend first
    const vat = "{{ vat or '' }}";
    if (vat && window.__cachedReceiptMtype !== undefined) {
      return window.__cachedReceiptMtype;
    }
    // Fallback to localStorage
    try { return localStorage.getItem(RECEIPT_MTYPE_STORAGE_KEY) || ''; }
    catch(e){ return ''; }
  }

  async function loadReceiptMtypeFromBackend(){
    try {
      const vat = "{{ vat or '' }}";
      if (!vat) return '';
      
      const resp = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(vat), {
        credentials: 'same-origin'
      });
      const data = await resp.json();
      
      if (data.ok && data.repeat_entry && data.repeat_entry.receipt_mtype) {
        window.__cachedReceiptMtype = data.repeat_entry.receipt_mtype;
        return data.repeat_entry.receipt_mtype;
      }
    } catch(e) {
      console.warn('Failed to load receipt MTYPE from backend', e);
    }
    return '';
  }

  function saveReceiptMtype(mtype){
    try { localStorage.setItem(RECEIPT_MTYPE_STORAGE_KEY, mtype || ''); }
    catch(e){ console.warn('Failed to save receipt MTYPE', e); }
  }

  function populateMtypeDropdown(selectEl, currentValue){
    if(!selectEl || !G_CATEGORY_DATA || !Array.isArray(G_CATEGORY_DATA.mtype_options)) return;
    selectEl.innerHTML = '<option value="">-- επίλεξε είδος κίνησης --</option>';
    G_CATEGORY_DATA.mtype_options.forEach(mt => {
      const opt = document.createElement('option');
      opt.value = mt.value;
      opt.innerText = `${mt.value} - ${mt.label}`;
      if(mt.value === currentValue) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function isRepeatEntryEnabled(){
    try {
      const toggle = document.getElementById('repeatEntrySwitch');
      return !!(toggle && toggle.checked);
    } catch(e){ return false; }
  }

  async function openReceiptMtypeModal(){
    const modal = document.getElementById('receiptMtypeModal');
    const select = document.getElementById('receiptMtypeSelect');
    if(!modal || !select) return;

    // Load from backend first
    const backendMtype = await loadReceiptMtypeFromBackend();
    const currentMtype = backendMtype || loadReceiptMtype();
    populateMtypeDropdown(select, currentMtype);
    
    modal.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function closeReceiptMtypeModal(){
    const modal = document.getElementById('receiptMtypeModal');
    if(!modal) return;
    modal.style.display = 'none';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  // Wire up modal buttons
  document.getElementById('receiptMtypeCloseX')?.addEventListener('click', closeReceiptMtypeModal);
  document.getElementById('receiptMtypeCancel')?.addEventListener('click', closeReceiptMtypeModal);
  
  document.getElementById('receiptMtypeSave')?.addEventListener('click', async function(){
    const select = document.getElementById('receiptMtypeSelect');
    if(!select) return;
    const mtype = select.value || '';
    
    // Save to localStorage
    saveReceiptMtype(mtype);
    
    // Save to backend credentials.json via repeat_entry API
    try {
      const vat = "{{ vat or '' }}";
      if (vat) {
        // Get current repeat entry
        const getResp = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(vat), {
          credentials: 'same-origin'
        });
        const getData = await getResp.json();
        
        // Update with receipt_mtype
        const saveResp = await fetch('/api/repeat_entry/save', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          credentials: 'same-origin',
          body: JSON.stringify({
            vat: vat,
            enabled: getData.repeat_entry?.enabled || false,
            mapping: getData.repeat_entry?.mapping || {},
            profile_name: getData.repeat_entry?.profile_name || '',
            invoice_mtype: getData.repeat_entry?.invoice_mtype || '',
            receipt_mtype: mtype
          })
        });
        
        if (saveResp.ok) {
          if(typeof showFlash === 'function'){
            showFlash('Αποθηκεύτηκε ο κωδικός κίνησης για αποδείξεις: ' + (mtype || '(κενό)'), 'success', 3000);
          }
        } else {
          throw new Error('Failed to save receipt MTYPE to backend');
        }
      }
    } catch (e) {
      console.warn('Failed to save receipt MTYPE to backend:', e);
      if(typeof showFlash === 'function'){
        showFlash('Προσοχή: Το MTYPE αποθηκεύτηκε τοπικά αλλά όχι στο backend', 'warning', 4000);
      }
    }
    
    closeReceiptMtypeModal();
  });

  // Monitor receipt toggle + repeat toggle changes
  async function checkAndOpenReceiptMtypeModal(){
    const isReceipts = isReceiptsOn();
    const isRepeat = isRepeatEntryEnabled();
    
    // Άνοιγμα modal ΠΑΝΤΑ όταν receipts + repeat ενεργοποιημένα (ανεξάρτητα από αποθηκευμένη τιμή)
    if(isReceipts && isRepeat && G_CATEGORY_DATA && G_CATEGORY_DATA.mtype_options){
      console.log('Auto-opening receipt MTYPE modal (receipts + repeat enabled)');
      openReceiptMtypeModal();
    }
  }

  // Track initial state to avoid opening on page load
  let initialRepeatState = null;
  let initialReceiptsState = null;
  let pageJustLoaded = true;
  
  // Disable auto-opening for the first 2 seconds after page load
  setTimeout(() => { pageJustLoaded = false; }, 2000);
  
  // Listen to repeat toggle changes
  const repeatSwitch = document.getElementById('repeatEntrySwitch');
  if(repeatSwitch){
    // Capture initial state
    initialRepeatState = repeatSwitch.checked;
    
    repeatSwitch.addEventListener('change', function(){
      // Ignore events during initial page load period
      if(pageJustLoaded) {
        initialRepeatState = this.checked;
        return;
      }
      
      // Only open modal if switching FROM false TO true (user action, not page load)
      if(this.checked && initialRepeatState === false){
        // Delay to allow other handlers to complete
        setTimeout(checkAndOpenReceiptMtypeModal, 300);
      }
      // Update state
      initialRepeatState = this.checked;
    });
  }

  // Listen to receipts toggle changes
  const receiptsSwitch = document.getElementById('useReceiptsSwitch');
  if(receiptsSwitch){
    // Capture initial state
    initialReceiptsState = receiptsSwitch.checked;
    
    receiptsSwitch.addEventListener('change', function(){
      // Ignore events during initial page load period
      if(pageJustLoaded) {
        initialReceiptsState = this.checked;
        return;
      }
      
      // Only open modal if switching FROM false TO true (user action, not page load)
      if(this.checked && initialReceiptsState === false){
        setTimeout(checkAndOpenReceiptMtypeModal, 300);
      }
      // Update state
      initialReceiptsState = this.checked;
    });
  }

  // ΔΕΝ ανοίγουμε το modal on page load - μόνο όταν ο χρήστης ενεργοποιεί τα switches
  // setTimeout(checkAndOpenReceiptMtypeModal, 500);

  // Expose for manual access
  window.openReceiptMtypeModal = openReceiptMtypeModal;
  window.getReceiptMtype = loadReceiptMtype;

  // Hook into receipt confirmation to include MTYPE
  // This will be used when confirming receipts
  window._getReceiptMtypeForConfirm = loadReceiptMtype;
})();




  (function () {
  const KEY = 'UI:useReceipts'; // '1' = Αποδείξεις, '0' = Τιμολόγια

  function fireChange(el){
    if(!el) return;
    try {
      el.dispatchEvent(new Event('change', { bubbles:true }));
    } catch (_e) {
      const evt = document.createEvent('Event');
      evt.initEvent('change', true, true);
      el.dispatchEvent(evt);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sw = document.getElementById('useReceiptsSwitch');
    if (!sw) return;

    // Αν υπάρχει ?use_receipts=1/0 στο URL, γράψ’ το στο localStorage (authoritative)
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('use_receipts')) {
        localStorage.setItem(KEY, q.get('use_receipts') === '1' ? '1' : '0');
      }
    } catch (_e) {}

    // Restore από localStorage
    const saved = localStorage.getItem(KEY);
    if (saved !== null) sw.checked = (saved === '1');

    // ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
    // Τρέξε τον υπάρχοντα change handler του switch ώστε να εμφανίσει/κρύψει
    // τα σωστά inputs (MARK vs URL). Το κάνουμε 2 φορές (rAF + microtask)
    // για να “πιάσει” σε DOM που φτιάχνεται δυναμικά.
    requestAnimationFrame(() => {
      fireChange(sw);
      setTimeout(() => fireChange(sw), 0);
    });

    // Persist σε κάθε αλλαγή χρήστη
    sw.addEventListener('change', () => {
      try { localStorage.setItem(KEY, sw.checked ? '1' : '0'); } catch (_e) {}
      // Προαιρετικό: κρατάμε και ένα data-mode στο body αν το θες για CSS hooks
      document.body.dataset.mode = sw.checked ? 'receipts' : 'invoices';
    });

    // Όταν κάνεις submit/save απόδειξης, κλείδωσε το mode σε “Αποδείξεις”
    // ώστε στο redirect/refresh να παραμείνει.
    document.getElementById('saveSummaryForm')?.addEventListener('submit', () => {
      try {
        // Ενημέρωση του summaryJsonInput με τα τελευταία δεδομένα από το DOM (categories + MTYPE)
        if (typeof window.updateSummaryFromDom === 'function') {
          window.updateSummaryFromDom();
        }
        
        const raw = document.getElementById('summaryJsonInput')?.value || '';
        const s = raw ? JSON.parse(raw) : {};
        const isReceipt = s.is_receipt === true ||
                          /αποδει/i.test(`${s.type_name || ''} ${s.category || s.characteristic || ''}`);
        if (isReceipt) localStorage.setItem(KEY, '1');
      } catch (_e) {}
    });
  });
})();
// --- Reclass guard (yellow box -> ?force_edit=1) ---
const URL_PARAMS = (function(){ try { return new URL(window.location.href).searchParams; } catch(_) { return new URLSearchParams(''); } })();
const FORCE_EDIT = (function(){ try { return URL_PARAMS.get('force_edit') === '1'; } catch(_) { return false; } })();
const CATEGORY_LABELS = (function(){
  try { return {{ (customer_category_labels or {}) | tojson | safe }} || {}; }
  catch(e){ return {}; }
})();
const labelForCategory = (val) => {
  if(!val) return '';
  const key = String(val);
  if(Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, key)){
    return CATEGORY_LABELS[key];
  }
  return key;
};

const SEARCH_BASE_URL = "{{ url_for('search') }}";
const VAT = "{{ vat or '' }}"; // active vat from server
const INITIAL_MARK = "{{ mark|e }}"; // αρχική τιμή mark (αν υπήρχε)
const RC_CLEAR_FLAG_KEY = 'rc:clearSearchAfterReload';

function rcRememberSearchClear(){
  try { sessionStorage.setItem(RC_CLEAR_FLAG_KEY, '1'); } catch(_){}
}

function rcConsumeSearchClear(){
  try {
    if (sessionStorage.getItem(RC_CLEAR_FLAG_KEY) === '1'){
      sessionStorage.removeItem(RC_CLEAR_FLAG_KEY);
      return true;
    }
  } catch(_){ }
  return false;
}
const ACTIVE_YEAR = (function(){ try { return {{ active_year|default('null') }}; } catch(e){ return null; } })();
async function getActiveFiscalYear() {
  // Προτίμησε την τιμή που ήρθε από server-side render (Jinja)
  if (typeof ACTIVE_YEAR !== 'undefined' && ACTIVE_YEAR !== null) {
    try { return String(ACTIVE_YEAR); } catch(_) { /* noop */ }
  }
  // Fallback: ρώτα το backend (υπάρχει route)
  try {
    const r = await fetch('/get_fiscal_year', {credentials:'same-origin'});
    const j = await r.json();
    if (j && j.exists) return String(j.fiscal_year);
  } catch(_) {}
  return null;
}

function rcClearWarningSearchFields(options){
  const skipExtended = (options === false) || (options && options.partial === true);
  try {
    const ids = ['markInput','scrapeUrlInput'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_){}
    });
    const markField = document.querySelector('input[name="mark"]');
    if (markField) {
      markField.value = '';
      try { markField.dispatchEvent(new Event('input', { bubbles: true })); } catch(_){}
    }
    if (!skipExtended){
      const hiddenUrl = document.getElementById('scrapeUrlField');
      const hiddenCategory = document.getElementById('scrapeCategoryField');
      const summaryInput = document.getElementById('summaryJsonInput');
      if (hiddenUrl) hiddenUrl.value = '';
      if (hiddenCategory) hiddenCategory.value = '';
      if (summaryInput) summaryInput.value = '{}';
    }
  } catch(err){ console.warn('rcClearWarningSearchFields failed', err); }
}

function rcReloadAfterWarning(){
  try {
    const current = new URL(window.location.href);
    const keys = new Set(['mark','scrape_url','force_edit']);
    Array.from(current.searchParams.keys()).forEach(key => {
      if (keys.has(key) || /^(warn|warning|modal|open_)/i.test(key)){
        current.searchParams.delete(key);
      }
    });
    const target = current.pathname + (current.search ? `?${current.searchParams.toString()}` : '') + current.hash;
    window.location.replace(target);
  } catch (_){
    window.location.reload();
  }
}

function rcHandleWarningAcknowledge(){
  rcRememberSearchClear();
  rcClearWarningSearchFields();
  setTimeout(rcReloadAfterWarning, 80);
}

window.__RC_handleWarningAck = rcHandleWarningAcknowledge;

document.addEventListener('DOMContentLoaded', function(){
  if (rcConsumeSearchClear()){
    setTimeout(() => { rcClearWarningSearchFields(false); }, 40);
  }
});


(function(){
  // Ανεξάρτητο modal μόνο για Αποδείξεις (δεν ακουμπά το afmWarningModal)
  window.openReceiptWarning = function(message){
    var id='receiptWarn', m=document.getElementById(id);
    if(!m){
      var el=document.createElement('div');
      el.id=id;
      el.style.cssText='position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.4);z-index:9999';
      el.innerHTML =
        '<div style="background:#fff;border-radius:10px;max-width:480px;width:calc(100% - 32px);padding:20px;">'
        + '<h3 style="margin:0 0 10px;color:#b91c1c;font-weight:600;font-size:18px">Προειδοποίηση</h3>'
        + '<div id="receiptWarnBody" style="margin-bottom:14px;color:#374151;font-size:14px"></div>'
        + '<div style="text-align:right"><button id="receiptWarnOk" type="button"'
        + ' style="background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer">Κατάλαβα</button></div>'
        + '</div>';
      document.body.appendChild(el);
      el.addEventListener('click', function(e){ if(e.target===el) el.style.display='none'; });
      el.querySelector('#receiptWarnOk').addEventListener('click', function(){
        el.style.display='none';
        try { window.__RC_handleWarningAck(); } catch(_){}
      });
      m = el;
    }
    var body = m.querySelector('#receiptWarnBody');
    if(body) body.textContent = message || 'Προειδοποίηση.';
    m.style.display='flex';
  };
})();

// Μπλόκο διπλών submit στην φόρμα MARK (ειδικά με auto-submit)
(function(){
  const form = document.getElementById('markSearchForm');
  if (!form) return;

  let submitLocked = false;
  let lastSubmitTs = 0;

  function releaseLock(tag){
    if (tag && form.dataset.rcSubmitTag && form.dataset.rcSubmitTag !== tag) return;
    submitLocked = false;
    lastSubmitTs = 0;
    delete form.dataset.rcSubmitTag;
  }

  function armLock(){
    const now = Date.now();
    if (submitLocked && now - lastSubmitTs < 1200){
      return false;
    }
    submitLocked = true;
    lastSubmitTs = now;
    const tag = String(now);
    form.dataset.rcSubmitTag = tag;
    setTimeout(() => releaseLock(tag), 1600);
    return true;
  }

  const originalSubmit = typeof form.submit === 'function' ? form.submit : null;
  if (originalSubmit){
    form.submit = function(){
      if (!armLock()) return;
      return originalSubmit.apply(this, arguments);
    };
  }

  form.addEventListener('submit', function(evt){
    if (!armLock()){
      evt.preventDefault();
      evt.stopImmediatePropagation();
      return false;
    }
    return true;
  }, true);

  const resetHandler = () => releaseLock();
  form.addEventListener('reset', resetHandler);
  form.addEventListener('formdata', resetHandler);
})();

    // Καθαρισμός ανά γραμμή (πολλαπλές γραμμές)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.clear-row-btn');
    if (btn) {
      e.stopPropagation();
      const tr = btn.closest('tr');
      const sel = tr && tr.querySelector('select[name^="category["]');
      if (sel) sel.value = '';
    }
  });

  // Καθαρισμός στη single-line περίπτωση
  const singleClear = document.getElementById('single-clear');
  if (singleClear) {
    singleClear.addEventListener('click', function (e) {
      e.stopPropagation();
      const sel = document.querySelector('select[name^="category["]');
      if (sel) sel.value = '';
    });
  }

  // Προληπτικά: μην ξανα-ανοίγει δεύτερο modal στο click "Αποθήκευση"
  // (αν έχεις delegate listeners κάτω από το modal)
  document.addEventListener('submit', function(e){
    const form = e.target;
    if (form && form.closest('#summaryModal')) {
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      e.stopPropagation(); // Μπλοκάρει bubbling που θα πυροδοτούσε κάτωθεν click handlers
    }
  }, true);
    // initial categories passed from server as fallback; will be overridden if API returns expense_tags
let CUSTOMER_CATEGORIES = (function(){
  try {
    const raw = {{ customer_categories | tojson | safe }} || [];
    const cleaned = [];
    (raw || []).forEach(item => {
      if(!item) return;
      const key = String(item).trim();
      if(!key || key.toLowerCase() === 'αποδειξακια') return;
      if(!cleaned.includes(key)) cleaned.push(key);
    });
    return cleaned;
  } catch(e){ return []; }
})();
if (typeof window !== 'undefined') {
  window.CUSTOMER_CATEGORIES = window.CUSTOMER_CATEGORIES || CUSTOMER_CATEGORIES.slice();
  // Expose G_CATEGORY_DATA for MTYPE support
  window.G_CATEGORY_DATA = {{ g_category_data | tojson | safe if g_category_data else 'null' }};
}

// Helper: show transient flash (client-side)
/* ====== Render summary lines into modal and wire handlers ====== */
 function renderSummaryLinesFromObject(obj) {
  const receiptsMode = !!(document.getElementById('useReceiptsSwitch')?.checked) || !!obj?.is_receipt;
  const RECEIPT_CATEGORY = 'αποδειξακια';

  const container = document.getElementById('summaryLinesContainer');
  const summaryInput = document.getElementById('summaryJsonInput');
  if(!container || !summaryInput) return;

  container.innerHTML = '';
  const lines = Array.isArray(obj.lines) ? obj.lines : [];

  try {
    const markCandidates = [obj && (obj.mark || obj.MARK || obj.Mark), obj && obj.number];
    const rawMark = markCandidates.find(val => val != null && String(val).trim() !== '');
    if (rawMark) {
      const digits = String(rawMark).replace(/[^0-9]/g, '');
      if (digits) {
        window.__RC_pendingSummaryMarks = Array.isArray(window.__RC_pendingSummaryMarks)
          ? window.__RC_pendingSummaryMarks
          : [];
        if (!window.__RC_pendingSummaryMarks.includes(digits)) {
          window.__RC_pendingSummaryMarks.push(digits);
        }
        if (typeof window.__RC_autoSubmitRememberMark === 'function') {
          try { window.__RC_autoSubmitRememberMark(digits); } catch(_) {}
        }
      }
    }
  } catch(_) {}

  // helper to persist back to the hidden input
    (function(){
  function safeParseJson(s){
    try { return JSON.parse(s || '{}'); } catch(e){ return {}; }
  }

  const summaryInput = document.getElementById('summaryJsonInput');
  const container = document.getElementById('summaryLinesContainer');

  // fallback server-side object (if Jinja rendered modal_summary)
  const SERVER_MODAL_SUMMARY = (function(){
    try { return {{ modal_summary | tojson | safe if modal_summary else 'null' }}; } catch(e){ return null; }
  })()
  try {
    var __cc = document.getElementById('summaryLinesContainer');
    if (__cc && __cc.dataset && __cc.dataset.phase === 'iife') {
      // IIFE already rendered content -> skip second render path
      if (typeof persist === 'function') try{ persist(); }catch(e){}
      return;
    }
  } catch(e) {}
;

  // helper to get current summary object (prefer hidden input, fallback server var)
  function getSummaryObj(){
    if(summaryInput && summaryInput.value && summaryInput.value.trim() !== ''){
      const parsed = safeParseJson(summaryInput.value);
      if(parsed && typeof parsed === 'object') return parsed;
    }
    if(SERVER_MODAL_SUMMARY) return SERVER_MODAL_SUMMARY;
    return { lines: [] };
  }

  // ensure each line has id and normalized keys
  function normalizeSummary(summary){
    if(!summary) summary = {};
    const lines = Array.isArray(summary.lines) ? summary.lines.slice() : [];
    const norm = lines.map((l, idx) => {
      const id = (l && (l.id || l.line_id)) ? String(l.id || l.line_id) : ('l' + idx);
      return {
        id: id,
        description: l && (l.description || l.desc || '') || '',
        amount: l && (l.amount || l.lineTotal || l.total || '') || '',
        vat: l && (l.vat || l.vatRate || '') || '',
        vatCategory: l && (l.vatCategory || l.vat_category || '') || '',
        category: l && (l.category || l.cat || '') || ''
      };
    });
    return { ...summary, lines: norm };
  }

  // build DOM for multiple lines (table)
  function buildTableHTML(lines, categories){
    const table = document.createElement('table');
    table.className = 'w-full border-collapse';
    
    const thead = document.createElement('thead');
    thead.className = 'bg-gray-100 sticky top-0';
    thead.innerHTML = '<tr>' +
      '<th class="p-2 border text-left">#</th>' +
      '<th class="p-2 border text-left">ΦΠΑ Κατηγορία</th>' +
      '<th class="p-2 border text-right">Ποσό</th>' +
      '<th class="p-2 border text-right">ΦΠΑ</th>' +
      '<th class="p-2 border text-left">Κατηγορία Εξόδου</th>' +
      '</tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'renderedLinesTableBody';
    lines.forEach((ln, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.lineId = ln.id || ('l' + idx);
      tr.dataset.vat = ln.vatCategory || ln.vat || '';

      tr.innerHTML = '<td class="p-2 border text-sm text-gray-600">' + (idx+1) + '</td>' +
        '<td class="p-2 border break-words">' + escapeHtml(ln.vatCategory || '') + '</td>' +
        '<td class="p-2 border text-right">' + escapeHtml(String(ln.amount || '')) + '</td>' +
        '<td class="p-2 border text-right">' + escapeHtml(String(ln.vat || '')) + '</td>' +
        '<td class="p-2 border"></td>';

      // create category select
      const select = document.createElement('select');
      select.className = 'expense-category p-1 border rounded w-full';
      select.dataset.lineId = ln.id || ('l' + idx);
      select.name = `category[${select.dataset.lineId}]`;
      const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.innerText='-- επίλεξε --';
      select.appendChild(emptyOpt);
      (categories || []).forEach(c => {
        if (!categoryAllowedForVat(c, ln.vatCategory)) return;
        const o = document.createElement('option'); o.value = c; o.textContent = labelForCategory(c);

        if(c === ln.category) o.selected = true;
        select.appendChild(o);
      });

      tr.querySelector('td:last-child').appendChild(select);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    return table;
  }

  // build single-line buttons UI
  function buildSingleLineHTML(line, categories){
    const wrapper = document.createElement('div');
    wrapper.className = 'border rounded p-4';
    wrapper.dataset.lineId = line.id || 'l0';

    const grid = document.createElement('div');
    grid.className = 'mb-3 grid grid-cols-1 md:grid-cols-3 gap-3';
    grid.innerHTML = '<div><strong>ΦΠΑ Κατηγορία</strong><div>' + escapeHtml(line.vatCategory || '') + '</div></div>' +
      '<div><strong>Ποσό</strong><div>' + escapeHtml(String(line.amount || '')) + '</div></div>' +
      '<div><strong>ΦΠΑ</strong><div>' + escapeHtml(String(line.vat || '')) + '</div></div>';
    wrapper.appendChild(grid);

    const controls = document.createElement('div');
    controls.className = 'mb-3';
    const title = document.createElement('strong');
    title.innerText = 'Επίλεξε Κατηγορία Εξόδου';
    controls.appendChild(title);

    const btnwrap = document.createElement('div');
    btnwrap.id = 'renderedCategoryButtons';
    btnwrap.className = 'mt-2 flex flex-wrap gap-2';
    (categories || []).forEach(c => {
      if (!categoryAllowedForVat(c, line.vatCategory)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-btn px-3 py-2 border rounded hover:bg-sky-50';
      btn.dataset.cat = c;
      btn.dataset.lineId = line.id || 'l0';
      btn.innerText = (window.labelForCategory ? window.labelForCategory(c) : c);

      if(c === line.category){
        btn.classList.add('bg-sky-600');
        btn.classList.add('text-white');
      }
      btnwrap.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'px-3 py-2 border rounded text-sm ml-2 clear-category';
    clearBtn.innerText = 'Καθαρισμός';
    btnwrap.appendChild(clearBtn);

    controls.appendChild(btnwrap);
    wrapper.appendChild(controls);
    
    return wrapper;
  }

  function escapeHtml(s){
    if(!s && s !== 0) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // read categories from server-provided global or from a safe default
  function getCategories(){
    try {
      const js = (function(){ try { return {{ customer_categories | tojson | safe }}; } catch(e){ return null; } })();
      if(Array.isArray(js) && js.length) return js;
    } catch(e){}
    return window.CUSTOMER_CATEGORIES || [];
  }

  // Setup invoice-level MTYPE dropdown for Γ Category
  function setupInvoiceMtype(summary) {
    const mtypeContainer = document.getElementById('invoiceMtypeContainer');
    const mtypeSelect = document.getElementById('invoiceMtypeSelect');
    
    if (!mtypeContainer || !mtypeSelect) return;
    
    // Check if Γ Category
    const isGCategory = window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.mtype_options && window.G_CATEGORY_DATA.mtype_options.length > 0;
    
    // Check if repeat is enabled (με fallback αν η συνάρτηση δεν υπάρχει ακόμα)
    let repeatEnabled = false;
    try {
      if (typeof repeatSwitchOn === 'function') {
        repeatEnabled = repeatSwitchOn();
      } else {
        repeatEnabled = !!document.getElementById('repeatEntrySwitch')?.checked;
      }
    } catch (e) {
      repeatEnabled = !!document.getElementById('repeatEntrySwitch')?.checked;
    }
    
    // Εμφάνιση dropdown αν:
    // 1. Είναι Γ Κατηγορία
    // Πάντα να φαίνεται το dropdown για επιλογή/επιβεβαίωση MTYPE
    const savedMtype = summary.mtype || summary.invoice_mtype || localStorage.getItem('saved_invoice_mtype') || '';
    const shouldShow = isGCategory;
    
    if (shouldShow) {
      // Show container
      mtypeContainer.style.display = 'block';
      
      // Clear and populate dropdown
      mtypeSelect.innerHTML = '<option value="">-- επίλεξε είδος κίνησης --</option>';
      const movementTypes = window.G_CATEGORY_DATA.mtype_options || [];
      
      movementTypes.forEach(mt => {
        const option = document.createElement('option');
        option.value = mt.value;
        option.textContent = mt.label + ' (' + mt.value + ')';
        if (mt.value === savedMtype) {
          option.selected = true;
        }
        mtypeSelect.appendChild(option);
      });
      
      // Add change listener
      mtypeSelect.addEventListener('change', function() {
        const selectedValue = this.value;
        // Save to localStorage
        if (selectedValue) {
          localStorage.setItem('saved_invoice_mtype', selectedValue);
        }
        // Update the summary JSON immediately
        const summaryInput = document.getElementById('summaryJsonInput');
        if (summaryInput) {
          try {
            const summary = JSON.parse(summaryInput.value || '{}');
            summary.mtype = selectedValue;
            summary.invoice_mtype = selectedValue;
            summaryInput.value = JSON.stringify(summary);
          } catch (e) {
            console.warn('Failed to update summary mtype', e);
          }
        }
        updateSummaryFromDom();
      });
    } else {
      // Hide container if not needed
      mtypeContainer.style.display = 'none';
    }
  }

  // Setup receipt-level MTYPE dropdown (for receipts mode)
  function setupReceiptMtype(summary) {
    const mtypeContainer = document.getElementById('receiptMtypeContainerSummary');
    const mtypeSelect = document.getElementById('receiptMtypeSelectSummary');
    
    if (!mtypeContainer || !mtypeSelect) return;
    
    // Check if we're in receipts mode
    const isReceiptsMode = isReceiptsOn();
    
    // Check if Γ Category
    const isGCategory = window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.mtype_options && window.G_CATEGORY_DATA.mtype_options.length > 0;
    
    // Check if repeat is enabled
    let repeatEnabled = false;
    try {
      repeatEnabled = !!document.getElementById('repeatEntrySwitch')?.checked;
    } catch (e) {
      repeatEnabled = false;
    }
    
    // Get saved MTYPE from localStorage or summary
    const savedMtype = summary.mtype || summary.receipt_mtype || localStorage.getItem('saved_receipt_mtype') || '';
    
    // Show dropdown if:
    // 1. The summary represents a receipt OR we're in receipts mode OR repeat is enabled
    // 2. Is Γ Category
    const isSummaryReceipt = summary && (summary.is_receipt === true || /αποδει/i.test(String(summary.type_name || '') + ' ' + String(summary.category || '')));
    const shouldShow = (isSummaryReceipt || isReceiptsMode || repeatEnabled) && isGCategory;
    
    if (shouldShow) {
      mtypeContainer.style.display = 'block';
      
      // Clear and populate dropdown
      mtypeSelect.innerHTML = '<option value="">-- επίλεξε είδος κίνησης --</option>';
      const movementTypes = window.G_CATEGORY_DATA.mtype_options || [];
      
      movementTypes.forEach(mt => {
        const option = document.createElement('option');
        option.value = mt.value;
        option.textContent = mt.label + ' (' + mt.value + ')';
        if (mt.value === savedMtype) {
          option.selected = true;
        }
        mtypeSelect.appendChild(option);
      });
      
      // Add change listener
      mtypeSelect.addEventListener('change', function() {
        const selectedValue = this.value;
        // Save to localStorage
        if (selectedValue) {
          localStorage.setItem('saved_receipt_mtype', selectedValue);
        }
        updateSummaryFromDom();
      });
    } else {
      mtypeContainer.style.display = 'none';
    }
  }

  // render everything into the container
  function renderSummaryLines(){
    if(!container) return;
    const summary = normalizeSummary(getSummaryObj());
    const lines = summary.lines || [];
    const categories = getCategories();

    // clear container
    container.innerHTML = '';

    // Title (optional)
    // const info = document.createElement('div'); info.className='mb-2 text-sm text-gray-700'; container.appendChild(info);

    if(lines.length === 0){
      const warn = document.createElement('div');
      warn.className = 'mt-4 p-3 bg-yellow-50 rounded';
      warn.innerText = 'Δεν βρέθηκαν γραμμές για αυτό το MARK.';
      container.appendChild(warn);
      wireInteractions();
    try{ container.dataset.phase = 'iife'; }catch(e){}
 // ensure handlers cleared
      // Setup invoice-level MTYPE dropdown (για Γ Category)
      setupInvoiceMtype(summary);
      
      // Setup receipt-level MTYPE dropdown (για Αποδείξεις)
      setupReceiptMtype(summary);
      return;
    }

    if(lines.length === 1){
      container.appendChild(buildSingleLineHTML(lines[0], categories));
    } else {
      container.appendChild(buildTableHTML(lines, categories));
    }

    // after building DOM, wire events
    wireInteractions();
    
    // Setup invoice-level MTYPE dropdown (για Γ Category)
    setupInvoiceMtype(summary);
    
    // Setup receipt-level MTYPE dropdown (για Αποδείξεις)
    setupReceiptMtype(summary);
  }

  // update hidden input from current DOM selections/buttons

  function wireInteractions(){
    // remove old handlers by cloning nodes if necessary (to avoid duplicate attachments)
    document.querySelectorAll('select.expense-category').forEach(sel => {
      sel.addEventListener('change', function(){
        updateSummaryFromDom();
      });
    });

    // category buttons (single-line)
    document.querySelectorAll('#renderedCategoryButtons .category-btn').forEach(btn => {
      btn.addEventListener('click', function(){
        const lineId = this.dataset.lineId || '';
        // toggle this button active/inactive
        document.querySelectorAll('#renderedCategoryButtons .category-btn').forEach(b => {
          if(b.dataset.lineId === lineId){
            b.classList.remove('bg-sky-600'); b.classList.remove('text-white');
          }
        });
        const isActive = !(this.classList.contains('bg-sky-600'));
        if(isActive){
          this.classList.add('bg-sky-600'); this.classList.add('text-white');
        } else {
          this.classList.remove('bg-sky-600'); this.classList.remove('text-white');
        }
        updateSummaryFromDom();
      });
    });

    // clear buttons
    document.querySelectorAll('.clear-category').forEach(cb => {
      cb.addEventListener('click', function(){
        const parent = cb.closest('[data-line-id]');
        if(!parent) return;
        const lid = parent.dataset.lineId || '';
        // clear UI
        document.querySelectorAll('#renderedCategoryButtons .category-btn').forEach(b => {
          if(b.dataset.lineId === lid){ b.classList.remove('bg-sky-600'); b.classList.remove('text-white'); }
        });
        // if there is a select for same line (unlikely in single-line view) clear it
        const sel = document.querySelector('select.expense-category[data-line-id="' + lid + '"]');
        if(sel) sel.value = '';
        updateSummaryFromDom();
      });
    });
  }

  // watch hidden input changes (some flows set it programmatically before opening modal)
  let lastSummaryValue = summaryInput ? summaryInput.value : '';
  function pollSummaryInput(){
    const now = summaryInput ? summaryInput.value : '';
    if(now !== lastSummaryValue){
      lastSummaryValue = now;
      // re-render so UI matches new data
      renderSummaryLines();
    }
  }
  let pollTimer = null;
  try {
    pollTimer = setInterval(pollSummaryInput, 250);
    window.addEventListener('beforeunload', ()=> { if(pollTimer) clearInterval(pollTimer); });
  } catch(e){ /* ignore */ }

  // ensure initial render on load (modal might be shown later)
  try { renderSummaryLines(); } catch(e){ console.warn('initial renderSummaryLines failed', e); }

  // also re-render whenever modal is shown (in case show logic sets display later)
  const modal = document.getElementById('summaryModal');
  if(modal){
    // intercept style changes to detect show
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        if(m.attributeName === 'style' || m.attributeName === 'class'){
          const disp = window.getComputedStyle(modal).display;
          if(disp !== 'none'){
            // modal visible -> render (ensure DOM inside ready)
            setTimeout(renderSummaryLines, 10);
            setTimeout(relabelSummaryModal, 20);

          }
        }
      });
    });
    try { obs.observe(modal, { attributes: true, attributeFilter:['style','class'] }); } catch(e){ /* ignore */ }
  }

  // expose for debug and for RC_AUTO_INJECT modal
  window._renderSummaryLines = renderSummaryLines;
  window.buildTableHTML = buildTableHTML;
  window.buildSingleLineHTML = buildSingleLineHTML;
  window.wireInteractions = wireInteractions;
  window.updateSummaryFromDom = updateSummaryFromDom;
})();
  function persist() {
    summaryInput.value = JSON.stringify(obj || {});
  }

  if (!lines || lines.length === 0) {
    container.innerHTML = '<div class="mt-4 p-3 bg-yellow-50 rounded">Δεν βρέθηκαν γραμμές για αυτό το MARK.</div>';
    persist();
    return;
  }

  if (lines.length > 1) {
    // build table
    const tbl = document.createElement('table');
    tbl.className = 'w-full border-collapse';
    tbl.innerHTML = `<thead class="bg-gray-100 sticky top-0">
      <tr>
        <th class="p-2 border text-left">#</th>
        <th class="p-2 border text-left">ΦΠΑ Κατηγορία</th>
        <th class="p-2 border text-right">Ποσό</th>
        <th class="p-2 border text-right">ΦΠΑ</th>
        <th class="p-2 border text-left">Κατηγορία Εξόδου</th>
      </tr>
    </thead>`;
    const tbody = document.createElement('tbody');
    lines.forEach((ln, idx) => {
      const lid = (ln.id !== undefined) ? String(ln.id) : ('l' + idx);
      const vat_cat = ln.vatCategory || ln.vat_category || ln.vat || '';
      const amt = ln.amount || ln.lineTotal || ln.total || '';
      const vatv = ln.vat || ln.vatRate || '';
      const tr = document.createElement('tr');
      tr.dataset.lineId = lid;
      tr.dataset.vat = vat_cat;
      tr.className = '';
      tr.innerHTML = `
        <td class="p-2 border text-sm text-gray-600">${idx+1}</td>
        <td class="p-2 border break-words">${vat_cat}</td>
        <td class="p-2 border text-right">${amt}</td>
        <td class="p-2 border text-right">${vatv}</td>
        <td class="p-2 border"></td>`;
      // build select
      const td = tr.querySelector('td:last-child');
      const sel = document.createElement('select');
      sel.className = 'expense-category p-1 border rounded w-full';
      sel.dataset.lineId = lid;
      const opt0 = document.createElement('option'); opt0.value = ''; opt0.innerText = '-- επίλεξε --'; sel.appendChild(opt0);
      // ΝΕΟ
      (window.CUSTOMER_CATEGORIES || []).forEach(c => {
        if (!categoryAllowedForVat(c, vat_cat)) return;
        const o = document.createElement('option'); o.value = c;
        o.textContent = (typeof labelForCategory === 'function' ? labelForCategory(c) : c);
        if ((ln.category || '') === c) o.selected = true;
        sel.appendChild(o);
      });

      sel.addEventListener('change', function(){
        const val = this.value;
        // find line in obj and update
        const found = (obj.lines || []).find(x => String(x.id || x.line_id || '') === lid);
        if(found) found.category = val;
        persist();
      });
      td.appendChild(sel);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    // wrap in container
    const wrapper = document.createElement('div');
    wrapper.className = 'overflow-auto max-h-96 border rounded';
    wrapper.appendChild(tbl);
    container.appendChild(wrapper);
    persist();
    return;
  }

  // single line case -> render buttons
  const single = lines[0];
  const lid = (single.id !== undefined) ? String(single.id) : (single.line_id !== undefined ? String(single.line_id) : 'l0');
  const amt = single.amount || single.lineTotal || '';
  const vatv = single.vat || single.vatRate || '';
  const vat_cat = single.vatCategory || single.vat_category || '';
  const selected_cat = single.category || '';

  const singleDiv = document.createElement('div');
  singleDiv.id = 'singleLine';
  singleDiv.className = 'border rounded p-4';
  singleDiv.dataset.lineId = lid;
  singleDiv.dataset.amount = amt;
  singleDiv.dataset.vat = vatv;
  singleDiv.dataset.vatcat = vat_cat;

  const infoHtml = document.createElement('div');
  infoHtml.className = 'mb-3 grid grid-cols-1 md:grid-cols-3 gap-3';
  infoHtml.innerHTML = `<div><strong>ΦΠΑ Κατηγορία</strong><div>${vat_cat}</div></div>
                        <div><strong>Ποσό</strong><div>${amt}</div></div>
                        <div><strong>ΦΠΑ</strong><div>${vatv}</div></div>`;
  singleDiv.appendChild(infoHtml);

  const chooseWrap = document.createElement('div');
  chooseWrap.className = 'mb-3';
  chooseWrap.innerHTML = `<strong>Επίλεξε Κατηγορία Εξόδου</strong>`;
  const btnRow = document.createElement('div');
  btnRow.id = 'categoryButtons';
  btnRow.className = 'mt-2 flex flex-wrap gap-2';

  (window.CUSTOMER_CATEGORIES || []).forEach(c => {
    if (!categoryAllowedForVat(c, vat_cat)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'category-btn px-3 py-2 border rounded hover:bg-sky-50';
    b.dataset.cat = c;
    b.dataset.lineId = lid;
    b.innerText = (typeof labelForCategory === 'function' ? labelForCategory(c) : c);

    if (c === selected_cat) { b.classList.add('bg-sky-600', 'text-white'); }
    b.addEventListener('click', function(){
      const cat = this.dataset.cat;
      // toggle selection
      const currently = (obj.lines[0].category || '');
      obj.lines[0].category = (currently === cat) ? '' : cat;
      // reflect UI
      Array.from(btnRow.querySelectorAll('button.category-btn')).forEach(bb=>{
        bb.classList.toggle('bg-sky-600', bb.dataset.cat === obj.lines[0].category);
        bb.classList.toggle('text-white', bb.dataset.cat === obj.lines[0].category);
      });
      persist();
    });
    btnRow.appendChild(b);
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.id = 'clearCategory';
  clearBtn.className = 'px-3 py-2 border rounded text-sm ml-2';
  clearBtn.innerText = 'Καθαρισμός';
  clearBtn.addEventListener('click', function(){
    obj.lines[0].category = '';
    Array.from(btnRow.querySelectorAll('button.category-btn')).forEach(bb=>{
      bb.classList.remove('bg-sky-600', 'text-white');
    });
    persist();
  });

  btnRow.appendChild(clearBtn);
  chooseWrap.appendChild(btnRow);
  singleDiv.appendChild(chooseWrap);
  container.appendChild(singleDiv);
  persist();
}

/* Call this helper whenever you open the summary modal after you populated summaryJsonInput.
   Examples of call sites are below (where modal.style.display='flex' is set). */


function ensureFlashContainer(){
  let container = document.getElementById('flashContainer');
  if (container) return container;
  const root = document.querySelector('.container') || document.body;
  container = document.createElement('div');
  container.id = 'flashContainer';
  container.className = 'space-y-2 mb-4';
  const header = root.querySelector('header');
  if (header && header.nextSibling) {
    root.insertBefore(container, header.nextSibling);
  } else {
    root.prepend(container);
  }
  return container;
}

function showFlash(message, type='info', timeout=3000){
  try {
    const container = ensureFlashContainer() || document.getElementById('clientFlashContainer');
    if(!container) return;
    const selector = `[data-flash-dynamic="1"][data-message="${message}"][data-type="${type}"]`;
    const dup = container.querySelector(selector);
    if (dup) dup.remove();
    const el = document.createElement('div');
    el.className = 'flash-banner text-sm';
    if(type === 'success') el.classList.add('flash-success');
    else if(type === 'error') el.classList.add('flash-error');
    else {
      el.classList.add('flash-info');
      el.style.background = '#eff6ff';
      el.style.color = '#1e3a8a';
      el.style.border = '1px solid #bfdbfe';
    }
    el.dataset.flashDynamic = '1';
    el.dataset.message = message;
    el.dataset.type = type;
    if (timeout) el.setAttribute('data-ttl', String(timeout));
    el.textContent = message;
    container.appendChild(el);
  } catch(e){ console.warn('showFlash failed', e); }
}

function persistReceiptFlash(message, type='info'){
  try {
    sessionStorage.setItem('RC:lastFlash', JSON.stringify({ message, type, ts: Date.now() }));
  } catch(e){ console.warn('persistReceiptFlash failed', e); }
}

function replayPersistedReceiptFlash(){
  try {
    const raw = sessionStorage.getItem('RC:lastFlash');
    if(!raw) return;
    sessionStorage.removeItem('RC:lastFlash');
    const data = JSON.parse(raw);
    if(!data || !data.message) return;
    const age = Date.now() - (data.ts || 0);
    if(age > 5 * 60 * 1000) return;
    showFlash(data.message, data.type || 'info', 4000);
  } catch(e){ console.warn('replayPersistedReceiptFlash failed', e); }
}

document.addEventListener('DOMContentLoaded', replayPersistedReceiptFlash, { once: true });


(function(){
  const openBtn = document.getElementById('openQrScanner');
  const menuToggle = document.getElementById('qrScannerMenuToggle');
  const menu = document.getElementById('qrScannerMenu');
  const localOption = document.getElementById('qrLocalOption');
  const remoteOption = document.getElementById('qrRemoteOption');

  if (!openBtn) return;

  const supportsMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function hideMenu(){
    if (!menu) return;
    menu.classList.add('hidden');
    if (menuToggle) menuToggle.setAttribute('aria-expanded','false');
  }

  function toggleMenu(){
    if (!menu) return;
    const hidden = menu.classList.contains('hidden');
    if (hidden){
      menu.classList.remove('hidden');
      if (menuToggle) menuToggle.setAttribute('aria-expanded','true');
    } else {
      menu.classList.add('hidden');
      if (menuToggle) menuToggle.setAttribute('aria-expanded','false');
    }
  }

  menuToggle?.addEventListener('click', (evt) => {
    evt.preventDefault();
    toggleMenu();
  });

  document.addEventListener('click', (evt) => {
    if (!menu) return;
    if (evt.target === menu || evt.target === menuToggle || menu.contains(evt.target)) return;
    hideMenu();
  });

  const remoteCtrl = initRemoteController();
  const localCtrl = supportsMedia ? initLocalScanner() : null;

  if (!supportsMedia){
    openBtn.title = 'Η συσκευή δεν υποστηρίζει πρόσβαση σε κάμερα. Χρησιμοποίησε φορητή συσκευή.';
    openBtn.classList.add('text-gray-500');
    if (localOption){
      localOption.disabled = true;
      localOption.classList.add('cursor-not-allowed','text-gray-400');
    }
  }

  function openLocal(){
    if (localCtrl && typeof localCtrl.open === 'function'){
      localCtrl.open();
    } else {
      remoteCtrl.open();
    }
  }

  openBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    hideMenu();
    if (supportsMedia && localCtrl){
      localCtrl.open();
    } else {
      remoteCtrl.open();
    }
  });

  localOption?.addEventListener('click', (evt) => {
    evt.preventDefault();
    hideMenu();
    openLocal();
  });

  remoteOption?.addEventListener('click', (evt) => {
    evt.preventDefault();
    hideMenu();
    remoteCtrl.open();
  });

  function initLocalScanner(){
    const modal = document.getElementById('qrCameraModal');
    if (!modal) return null;

    const DEVICE_KEY = 'QR:lastDeviceId';
    const video     = document.getElementById('qrVideo');
    const canvas    = document.getElementById('qrCanvas');
    const statusEl  = document.getElementById('qrStatus');
    const closeEls  = [document.getElementById('qrModalClose'), document.getElementById('qrModalCloseBtn')];
    const rescanBtn = document.getElementById('qrModalRescan');
    const camSelect = document.getElementById('qrCameraSelect');
    const refreshBtn= document.getElementById('qrRefreshDevices');

    let stream = null;
    let scanning = false;
    let timer = null;
    let devices = [];
    let selectedDeviceId = null;

    function setStatus(text, tone){
      if(!statusEl) return;
      statusEl.textContent = text;
      const base = 'text-sm ';
      statusEl.className = base + (tone==='error' ? 'text-red-600' : tone==='success' ? 'text-green-600' : 'text-gray-500');
    }

    function clearTimer(){ if (timer){ clearTimeout(timer); timer = null; } }
    function stopStream(){
      if (stream){
        try { stream.getTracks().forEach(t => t.stop()); } catch(_){}
        stream = null;
      }
    }
    function scheduleScan(delay){ clearTimer(); timer = setTimeout(runScan, delay); }

    async function enumerateCameras(){
      try{
        const list = await navigator.mediaDevices.enumerateDevices();
        devices = list.filter(d => d.kind === 'videoinput');
        fillCameraSelect();
      }catch(err){
        console.warn('enumerateDevices failed', err);
      }
    }

    function fillCameraSelect(){
      if(!camSelect) return;
      camSelect.innerHTML = '';
      if (!devices.length){
        const o = document.createElement('option'); o.value=''; o.textContent='— καμία κάμερα —';
        camSelect.appendChild(o);
        camSelect.disabled = true;
        return;
      }
      camSelect.disabled = false;

      const last = localStorage.getItem(DEVICE_KEY) || '';
      let toSelect = selectedDeviceId || last || '';

      devices.forEach((d,idx) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || `Κάμερα ${idx+1}`;
        camSelect.appendChild(o);
      });

      if (toSelect && devices.some(d => d.deviceId === toSelect)){
        camSelect.value = toSelect;
      } else {
        const env = devices.find(d => /back|rear|environment/i.test(d.label||''));
        camSelect.value = (env && env.deviceId) || devices[0].deviceId;
      }
    }

    async function startCamera(deviceId){
      try{
        stopStream();
        clearTimer();

        const constraints = deviceId
          ? { video: { deviceId: { exact: deviceId } }, audio: false }
          : { video: { facingMode: 'environment' }, audio: false };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (video){
          video.srcObject = stream;
          video.onloadedmetadata = function(){
            try { video.play(); } catch(_){}
            scanning = true;
            setStatus('Σάρωση…','info');
            scheduleScan(400);
          };
        }

        try {
          const track = stream.getVideoTracks()[0];
          selectedDeviceId = deviceId || (track.getSettings && track.getSettings().deviceId) || null;
          if (selectedDeviceId) localStorage.setItem(DEVICE_KEY, selectedDeviceId);
        } catch(_){}

        await enumerateCameras();
      } catch(err){
        console.error('Camera access failed', err);
        setStatus('Αποτυχία πρόσβασης στην κάμερα. Έλεγξε τα δικαιώματα.','error');
      }
    }

    async function runScan(){
      if (!scanning || !video) return;

      if (video.readyState < 2){
        scheduleScan(250);
        return;
      }

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/png');

      try{
        setStatus('Ανάγνωση QR…','info');
        const res = await fetch('/api/qr/decode', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ image: dataUrl, filename: 'capture.png' })
        });
        const j = await res.json();

        if (res.ok && j && j.ok){
          const payload = {
            raw: (j.raw || '').trim(),
            mark: (j.mark || '').trim()
          };
          const applied = applyScannedPayload(payload);
          const message = payload.raw && /^https?:\/\//i.test(payload.raw)
            ? 'Εντοπίστηκε URL από QR.'
            : (payload.mark ? `Εντοπίστηκε MARK ${payload.mark}.` : 'Εντοπίστηκε QR.');
          setStatus(message, 'success');
          closeModal();
          if (!applied){
            showFlash('Η σάρωση ολοκληρώθηκε αλλά δεν συμπληρώθηκε κάποιο πεδίο.', 'error', 4000);
          }
          return;
        }

        setStatus((j && j.error) ? j.error : 'Δεν αναγνωρίστηκε QR. Προσπάθησε ξανά.','info');
        scheduleScan(900);
      } catch(err){
        console.warn('QR scan failed', err);
        setStatus('Σφάλμα ανάγνωσης QR. Προσπάθησε ξανά.','error');
        scheduleScan(1500);
      }
    }

    function openModal(){
      modal.classList.remove('hidden');
      setStatus('Ενεργοποίηση κάμερας…','info');
      clearTimer();
      stopStream();

      const last = localStorage.getItem(DEVICE_KEY) || '';
      if (last) startCamera(last);
      else startCamera(null);
    }

    function closeModal(){
      scanning = false;
      clearTimer();
      stopStream();
      setStatus('Ενεργοποίηση κάμερας…','info');
      modal.classList.add('hidden');
    }

    modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
    (closeEls||[]).forEach(b => b && b.addEventListener('click', closeModal));

    rescanBtn?.addEventListener('click', async ()=>{
      const id = camSelect && camSelect.value ? camSelect.value : (localStorage.getItem(DEVICE_KEY) || null);
      await startCamera(id);
    });

    camSelect?.addEventListener('change', async ()=>{
      const id = camSelect.value || null;
      if (id) localStorage.setItem(DEVICE_KEY, id);
      await startCamera(id);
    });

    refreshBtn?.addEventListener('click', enumerateCameras);
    navigator.mediaDevices.addEventListener?.('devicechange', enumerateCameras);

    enumerateCameras().catch(()=>{});

    return { open: openModal, close: closeModal };
  }

  function initRemoteController(){
    const modal = document.getElementById('qrRemoteModal');
    if (!modal){
      return {
        open(){
          showFlash('Η απομακρυσμένη σάρωση δεν είναι διαθέσιμη.', 'error', 4000);
        }
      };
    }

    const closeEls = [document.getElementById('qrRemoteClose'), document.getElementById('qrRemoteCloseBtn')];
    const restartBtn = document.getElementById('qrRemoteRestart');
    const copyBtn = document.getElementById('qrRemoteCopyLink');
    const statusEl = document.getElementById('qrRemoteStatus');
    const codeContainer = document.getElementById('qrRemoteCode');
    const codePlaceholder = document.getElementById('qrRemoteCodePlaceholder');
    const connectedBadge = document.getElementById('qrRemoteConnected');
    const modeBadge = document.getElementById('qrRemoteMode');
    const countdownEl = document.getElementById('qrRemoteCountdown');
    const linkWrapper = document.getElementById('qrRemoteLinkWrapper');
    const linkValue = document.getElementById('qrRemoteLinkValue');
    const indicator = document.getElementById('remoteSessionIndicator');
    const indicatorDot = document.getElementById('remoteSessionDot');
    const indicatorText = document.getElementById('remoteSessionText');
    const indicatorDisconnect = document.getElementById('remoteDisconnectBtn');
    const repeatSwitch = document.getElementById('repeatEntrySwitch');
    const modeButtons = Array.from(modal.querySelectorAll('[data-remote-mode-option]'));

    let sessionId = null;
    let pollVersion = 0;
    let pollTimer = null;
    let countdownTimer = null;
    let connectUrl = '';
    let expiresAt = null;
    let remoteMode = currentScannerMode();
    let remoteRepeatEnabled = !!(repeatSwitch && repeatSwitch.checked);
    let remoteAutoSubmitEnabled = readAutoSubmitState();
    let qrImageData = '';
    let suppressPageNotify = false;
    let suppressRepeatNotify = false;
    let isAttached = false;
    let autoClosed = false;
    let hasRemoteDevice = false;
    let lastRemoteActivity = 0;
    let summaryWatcherTimer = null;
    let lastSummaryPayload = '';
    let lastSummaryVersion = 0;
    let resumeAttempted = false;

    const STORAGE_KEY = 'remoteQrSessionState';

    const indicatorDotClasses = ['bg-slate-300','bg-amber-400','bg-green-500','bg-red-500'];

    function isElementVisible(el){
      if (!el) return false;
      if (el.classList && el.classList.contains('hidden')) return false;
      try {
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (!style) return true;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
      } catch (_) {}
      return true;
    }

    function persistSessionState(extra){
      try {
        if (!window.sessionStorage || !sessionId) return;
        const state = {
          sessionId,
          version: pollVersion || 0,
          attached: !!isAttached,
        hasRemoteDevice: !!hasRemoteDevice,
        lastRemoteActivity,
        mode: remoteMode,
        repeat: remoteRepeatEnabled,
        autoSubmit: !!remoteAutoSubmitEnabled,
        summaryVersion: lastSummaryVersion || 0,
      };
        if (expiresAt){
          const expIso = new Date(expiresAt).toISOString();
          if (expIso) state.expiresAt = expIso;
        }
        if (extra && typeof extra === 'object'){
          Object.assign(state, extra);
        }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err){ console.warn('persistSessionState failed', err); }
    }

    function clearPersistedSession(){
      try { if (window.sessionStorage) sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }

    function loadPersistedSession(){
      try {
        if (!window.sessionStorage) return null;
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
      } catch (err){ console.warn('loadPersistedSession failed', err); return null; }
    }

    function stopSummaryWatcher(){
      if (summaryWatcherTimer){
        clearInterval(summaryWatcherTimer);
        summaryWatcherTimer = null;
      }
    }

    async function pushSummaryState(force){
      if (!sessionId) return;
      const state = collectSummaryState();
      const payload = state ? JSON.stringify(state) : '';
      if (!force && payload === lastSummaryPayload){
        return;
      }
      lastSummaryPayload = payload;
      try {
        await sendSessionUpdate({ summary_state: state }, { syncPage: false, syncRepeat: false });
      } catch (err){
        console.warn('summary broadcast failed', err);
      }
    }

    function startSummaryWatcher(){
      stopSummaryWatcher();
      if (!sessionId) return;
      summaryWatcherTimer = setInterval(() => {
        pushSummaryState(false);
      }, 2500);
      pushSummaryState(true);
    }

    function collectSummaryState(){
      const modal = document.getElementById('summaryModal');
      const summaryInput = document.getElementById('summaryJsonInput');
      const markEl = document.getElementById('summaryModalMark');
      const netEl = document.getElementById('summary_totalNetValue');
      const vatEl = document.getElementById('summary_totalVatAmount');
      const totalEl = document.getElementById('summary_totalValue');
      const banner = document.getElementById('existingBanner');
      const canSave = !!document.getElementById('saveSummaryForm');
      const canClose = !!document.getElementById('modalCloseBtn') || !!document.getElementById('modalCloseX');

      const base = {
        visible: isElementVisible(modal),
        mark: markEl ? markEl.textContent.trim() : '',
        totals: {
          net: netEl ? netEl.textContent.trim() : '',
          vat: vatEl ? vatEl.textContent.trim() : '',
          total: totalEl ? totalEl.textContent.trim() : '',
        },
        can_save: canSave,
        can_close: canClose,
        reclassification_banner: {
          visible: isElementVisible(banner),
          text: banner ? banner.textContent.trim() : '',
        },
        updated_at: new Date().toISOString(),
      };

      try {
        const markDigits = (base.mark || '').replace(/[^0-9]/g, '');
        if (markDigits.length === 15 && typeof window.__RC_autoSubmitRememberMark === 'function') {
          window.__RC_autoSubmitRememberMark(markDigits);
        }
      } catch(_) {}

      const container = document.getElementById('summaryLinesContainer') || modal;
      const rows = [];
      if (container){
        const primary = Array.from(container.querySelectorAll('[data-line-id]'));
        if (primary.length){ rows.push(...primary); }
        else if (modal){ rows.push(...modal.querySelectorAll('[data-line-id]')); }
      }

      const seen = new Set();
      const lines = [];
      rows.forEach((row, idx) => {
        if (!row || !(row instanceof HTMLElement)) return;
        const lid = (row.dataset && row.dataset.lineId) || row.getAttribute('data-line-id') || '';
        const lineId = (lid || '').toString().trim();
        if (!lineId || seen.has(lineId)) return;
        seen.add(lineId);

        const descriptionEl = row.querySelector('[data-role="description"], .line-description, td[data-role="description"], .summary-description, td:nth-child(2)');
        const amountEl = row.querySelector('[data-role="amount"], .line-amount, td[data-role="amount"], .summary-amount, td:nth-child(3)');
        const vatCell = row.querySelector('[data-role="vat"], .line-vat, td[data-role="vat"], .summary-vat, td:nth-child(4)');
        const description = descriptionEl ? descriptionEl.textContent.trim() : ((row.getAttribute('data-description') || '').trim());
        const amount = amountEl ? amountEl.textContent.trim() : ((row.getAttribute('data-amount') || '').trim());
        const vat = vatCell ? vatCell.textContent.trim() : ((row.getAttribute('data-vat') || '').trim());

        let category = (row.dataset && row.dataset.category) || row.getAttribute('data-category') || '';
        let selectedLabel = '';
        const select = row.querySelector('select.expense-category');
        if (select){
          if (!category) category = select.value || '';
          const opt = select.options[select.selectedIndex];
          if (opt){ selectedLabel = opt.textContent.trim(); }
        }
        const activeBtn = row.querySelector('.category-btn.bg-sky-600, .category-btn.active');
        if (activeBtn){
          if (!category && activeBtn.dataset && activeBtn.dataset.cat){ category = activeBtn.dataset.cat; }
          if (!selectedLabel) selectedLabel = activeBtn.textContent.trim();
        }

        const options = [];
        if (select){
          Array.from(select.options).forEach(opt => {
            options.push({ value: opt.value || '', label: opt.textContent.trim() });
          });
        }
        row.querySelectorAll('.category-btn[data-cat]').forEach(btn => {
          options.push({ value: btn.dataset.cat || '', label: btn.textContent.trim() });
        });

        lines.push({
          id: lineId,
          index: idx,
          description,
          amount,
          vat,
          category,
          selected_label: selectedLabel,
          options,
        });
      });

      base.lines = lines;
      if (summaryInput){
        base.summary_present = !!summaryInput.value;
      }

      const detailIds = {
        aa: 'summary_AA',
        afm: 'summary_AFM',
        name: 'summary_Name',
        issue_date: 'summary_issueDate',
        type: 'summary_type_name',
        total_net: 'summary_totalNetValue',
        total_vat: 'summary_totalVatAmount',
        total_value: 'summary_totalValue',
      };
      const details = {};
      Object.entries(detailIds).forEach(([key, id]) => {
        const node = document.getElementById(id);
        if (!node) return;
        const text = (node.textContent || '').trim();
        if (text) details[key] = text;
      });
      if (Object.keys(details).length){
        base.details = details;
      }

      const warningNodes = Array.from(document.querySelectorAll('[data-modal-type="warning"], [id$="WarningModal"], .warning-modal'));
      const warnings = [];
      warningNodes.forEach(node => {
        if (!node || !isElementVisible(node)) return;
        const warning = {
          id: (node.id || '').toString(),
          title: '',
          body: '',
          severity: '',
          visible: true,
          actions: [],
        };
        try {
          const titleEl = node.querySelector('[data-warning-title], h1, h2, h3, h4, h5, h6');
          if (titleEl) warning.title = titleEl.textContent.trim();
        } catch(_){}
        try {
          const bodyEl = node.querySelector('[data-warning-body], .modal-body, .warning-body, [data-role="warning-body"]');
          if (bodyEl) warning.body = bodyEl.textContent.trim();
        } catch(_){}
        try {
          const sev = node.getAttribute('data-warning-severity') || (node.dataset ? node.dataset.warningSeverity : '');
          if (sev) warning.severity = String(sev).trim();
        } catch(_){}

        const seen = new Set();
        const actionElements = Array.from(node.querySelectorAll('button, a'));
        actionElements.forEach(btn => {
          if (!btn || btn.disabled) return;
          if (btn.closest('[data-ignore-remote="1"]')) return;
          if (btn.hasAttribute('aria-hidden') && btn.getAttribute('aria-hidden') === 'true') return;
          const label = (btn.textContent || '').trim();
          if (!label) return;
          const actionKey = btn.dataset ? (btn.dataset.remoteAction || btn.dataset.action || '') : '';
          const buttonId = btn.id || '';
          const dedupeKey = actionKey || buttonId || label;
          if (!dedupeKey || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          const role = btn.dataset ? (btn.dataset.role || (btn.dataset.ack === '1' ? 'ack' : '')) : '';
          warning.actions.push({
            id: buttonId,
            label,
            action: actionKey,
            role,
          });
        });

        if (!warning.title && warning.body) warning.title = 'Προειδοποίηση';
        if (warning.body || warning.actions.length){
          warning.actions = warning.actions.slice(0, 6);
          warnings.push(warning);
        }
      });

      if (warnings.length){
        base.warnings = warnings.slice(0, 6);
      }

      return base;
    }

    function cssEscape(value){
      const text = value == null ? '' : String(value);
      try {
        if (window.CSS && typeof window.CSS.escape === 'function'){
          return window.CSS.escape(text);
        }
      } catch (_) {}
      try {
        if (typeof CSSescape === 'function'){
          return CSSescape(text);
        }
      } catch (_) {}
      return text.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
    }

    function scheduleSummaryRefresh(delay){
      if (!sessionId) return;
      setTimeout(() => { pushSummaryState(true); }, delay || 250);
    }

    function applyRemoteSummaryCategory(lineId, category){
      if (!lineId) return;
      const escapedId = cssEscape(lineId);
      const container = document.getElementById('summaryModal') || document;
      let changed = false;
      const select = container.querySelector('select.expense-category[data-line-id="' + escapedId + '"]');
      if (select){
        if (select.value !== category){
          select.value = category;
          try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        }
        changed = true;
      }
      if (category){
        const escapedCat = cssEscape(category);
        const btn = container.querySelector('.category-btn[data-line-id="' + escapedId + '"][data-cat="' + escapedCat + '"]');
        if (btn){
          btn.click();
          changed = true;
        }
      }
      if (changed){
        scheduleSummaryRefresh(200);
      }
    }

    function triggerSummarySave(){
      const form = document.getElementById('saveSummaryForm');
      if (!form) return;
      try {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
        showFlash('Η αποθήκευση ζητήθηκε από τη φορητή συσκευή.', 'info', 2500);
      } catch (_) {
        try { form.submit(); } catch (_) {}
      }
      scheduleSummaryRefresh(400);
    }

    function triggerSummaryClose(){
      const closeBtn = document.getElementById('modalCloseBtn') || document.getElementById('modalCloseX');
      if (closeBtn){
        closeBtn.click();
      } else {
        const modal = document.getElementById('summaryModal');
        if (modal){ modal.classList.add('hidden'); modal.style.display = 'none'; }
      }
      scheduleSummaryRefresh(350);
    }

    function triggerSummaryConfirm(){
      const forceBtn = document.getElementById('forceEditBtn');
      if (forceBtn && isElementVisible(forceBtn)){
        forceBtn.click();
        showFlash('Επιβεβαιώθηκε ο επαναχαρακτηρισμός από τη φορητή συσκευή.', 'success', 2500);
        scheduleSummaryRefresh(350);
      }
    }

    function handleRemoteAutoSubmit(control){
      const controls = window.RC && window.RC.autoSubmitControls;
      if (!controls){
        const btn = document.getElementById('autoSubmitBtnOn') || document.getElementById('autoSubmitBtnOff');
        if (!btn) return;
      }

      const type = (control.type || '').toString().toLowerCase();
      if (type === 'auto_submit_toggle'){
        if (controls && typeof controls.toggle === 'function'){
          controls.toggle();
        } else {
          const btn = remoteAutoSubmitEnabled ? document.getElementById('autoSubmitBtnOff') : document.getElementById('autoSubmitBtnOn');
          try { btn && btn.click(); } catch(_){}
        }
        return;
      }

      if (type === 'auto_submit_set'){
        let desired = control.enabled;
        if (desired === undefined) desired = control.value;
        if (desired === undefined) desired = control.state;
        if (desired === undefined) desired = control.target;
        let normalized = desired;
        if (typeof normalized === 'string'){
          normalized = /^(1|true|on|yes)$/i.test(normalized);
        }
        normalized = !!normalized;
        if (controls && typeof controls.set === 'function'){
          controls.set(normalized, { silent: false });
        } else {
          const btn = normalized ? document.getElementById('autoSubmitBtnOn') : document.getElementById('autoSubmitBtnOff');
          try { btn && btn.click(); } catch(_){}
        }
      }
    }

    function handleRemoteWarningAction(control){
      if (!control || typeof control !== 'object') return;
      const modalId = (control.modal_id || control.modalId || control.id || '').toString().trim();
      const actionKey = (control.action || control.action_id || control.actionId || '').toString().trim();
      const buttonId = (control.button_id || control.buttonId || '').toString().trim();
      const label = (control.label || '').toString().trim();
      const role = (control.role || '').toString().trim();

      const modals = [];
      if (modalId){
        const byId = document.getElementById(modalId);
        if (byId) modals.push(byId);
      }
      if (!modals.length){
        document.querySelectorAll('[data-modal-type="warning"], [id$="WarningModal"], .warning-modal').forEach(node => {
          if (node && isElementVisible(node)) modals.push(node);
        });
      }
      if (!modals.length) return;

      function matchBySelector(modal, selector, predicate){
        const nodes = Array.from(modal.querySelectorAll(selector));
        return nodes.find(node => !node.disabled && (!predicate || predicate(node))) || null;
      }

      function findButton(modal){
        if (!modal) return null;
        if (buttonId){
          const byId = modal.querySelector('#' + cssEscape(buttonId)) || document.getElementById(buttonId);
          if (byId && !byId.disabled) return byId;
        }
        if (actionKey){
          const byAction = matchBySelector(modal, '[data-remote-action]', (node) => {
            const data = node.dataset || {};
            return (data.remoteAction || data.action || '') === actionKey;
          });
          if (byAction) return byAction;
        }
        if (role){
          const byRole = matchBySelector(modal, '[data-role], [data-ack]', (node) => {
            const data = node.dataset || {};
            const nodeRole = data.role || (data.ack === '1' ? 'ack' : '');
            return nodeRole === role;
          });
          if (byRole) return byRole;
        }
        if (label){
          const normalized = label.toLowerCase();
          const byLabel = matchBySelector(modal, 'button, a', (node) => {
            if (!isElementVisible(node)) return false;
            const text = (node.textContent || '').trim().toLowerCase();
            return text === normalized;
          });
          if (byLabel) return byLabel;
        }
        const ackBtn = matchBySelector(modal, '[data-ack="1"]');
        if (ackBtn) return ackBtn;
        return matchBySelector(modal, 'button, a');
      }

      let targetBtn = null;
      for (const modal of modals){
        targetBtn = findButton(modal);
        if (targetBtn) break;
      }

      if (!targetBtn){
        showFlash('Δεν βρέθηκε διαθέσιμη ενέργεια προειδοποίησης για απομακρυσμένο έλεγχο.', 'error', 3200);
        return;
      }

      try { targetBtn.focus({ preventScroll: true }); } catch(_){}
      try { targetBtn.click(); } catch(err){ console.warn('remote warning action click failed', err); }
      showFlash('Η φορητή συσκευή ολοκλήρωσε την προειδοποίηση.', 'info', 2600);
    }

    function handleRemoteControl(control){
      if (!control || typeof control !== 'object') return;
      const type = (control.type || '').toString().toLowerCase();
      if (type === 'warning_action'){
        handleRemoteWarningAction(control);
        return;
      }
      if (type === 'auto_submit_set' || type === 'auto_submit_toggle'){
        handleRemoteAutoSubmit(control);
        return;
      }
      if (type === 'summary_set_category'){
        applyRemoteSummaryCategory(control.line_id || control.lineId || control.id, control.category || control.value || '');
        return;
      }
      if (type === 'summary_save'){
        triggerSummarySave();
        return;
      }
      if (type === 'summary_close'){
        triggerSummaryClose();
        return;
      }
      if (type === 'summary_confirm'){
        triggerSummaryConfirm();
      }
    }

    async function attemptResumeFromStorage(){
      if (resumeAttempted || sessionId) return;
      resumeAttempted = true;
      const stored = loadPersistedSession();
      if (!stored || !stored.sessionId) return;
      if (Object.prototype.hasOwnProperty.call(stored, 'autoSubmit')){
        remoteAutoSubmitEnabled = !!stored.autoSubmit;
      } else {
        remoteAutoSubmitEnabled = readAutoSubmitState();
      }
      try {
        setStatus('Επαναφορά υπάρχουσας συνεδρίας…', 'info');
        updateIndicator('starting', 'Επαναφορά υπάρχουσας συνεδρίας…');
        const params = new URLSearchParams({ session_id: stored.sessionId });
        if (stored.version) params.set('since', String(stored.version));
        const res = await fetch('/api/qr/remote/status?' + params.toString(), { credentials: 'same-origin' });
        if (!res.ok){
          clearPersistedSession();
          updateIndicator('inactive');
          return;
        }
        const data = await res.json();
        if (!data || data.ok === false){
          clearPersistedSession();
          updateIndicator('inactive');
          return;
        }

        sessionId = data.session_id;
        pollVersion = data.version || stored.version || 0;
        isAttached = !!data.attached;
        autoClosed = !!data.attached;
        if (data.mode){
          setRemoteMode(data.mode, { syncPage: true });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'repeat_enabled')){
          setRemoteRepeat(data.repeat_enabled, { syncPage: true });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'auto_submit_enabled')){
          setRemoteAutoSubmit(data.auto_submit_enabled, { syncPage: false });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'auto_submit_enabled')){
          setRemoteAutoSubmit(data.auto_submit_enabled, { syncPage: false });
        }
        if (data.expires_at){
          const ts = Date.parse(data.expires_at);
          if (!Number.isNaN(ts)){
            expiresAt = ts;
            startCountdown();
          }
        }
        if (data.remote_last_seen){
          const seenTs = Date.parse(data.remote_last_seen);
          if (!Number.isNaN(seenTs)){
            hasRemoteDevice = true;
            lastRemoteActivity = seenTs;
          }
        }
        if (Object.prototype.hasOwnProperty.call(data, 'summary_version')){
          lastSummaryVersion = data.summary_version || 0;
        }
        if (data.summary_state){
          try { lastSummaryPayload = JSON.stringify(data.summary_state); } catch (_) {}
        }

        if (isAttached){
          connectedBadge?.classList.remove('hidden');
          updateIndicator('connected', 'Η φορητή συσκευή παραμένει διαθέσιμη.');
        } else if (hasRemoteDevice){
          connectedBadge?.classList.remove('hidden');
          updateIndicator('connected', 'Η φορητή συσκευή παραμένει διαθέσιμη για νέες σαρώσεις.');
        } else {
          updateIndicator('waiting');
        }

        showFlash('Η απομακρυσμένη συνεδρία επανενεργοποιήθηκε μετά την καταχώρηση.', 'info', 3000);
        startSummaryWatcher();
        persistSessionState();
        schedulePoll(800);
      } catch (err){
        console.warn('remote resume failed', err);
        clearPersistedSession();
        updateIndicator('inactive');
      }
    }

    function setStatus(text, tone){
      if (!statusEl) return;
      const base = 'text-sm ';
      if (tone === 'error') statusEl.className = base + 'text-red-600';
      else if (tone === 'success') statusEl.className = base + 'text-green-600';
      else statusEl.className = base + 'text-gray-600';
      statusEl.textContent = text;
    }

    function updateIndicator(state, message){
      if (!indicator || !indicatorDot || !indicatorText){
        return;
      }
      indicatorDotClasses.forEach(cls => indicatorDot.classList.remove(cls));

      if (state === 'inactive'){
        indicator.classList.add('hidden');
        indicator.dataset.state = 'inactive';
        indicatorDot.classList.add('bg-slate-300');
        if (indicatorDisconnect){
          indicatorDisconnect.classList.add('hidden');
          indicatorDisconnect.disabled = true;
        }
        return;
      }

      indicator.classList.remove('hidden');
      indicator.dataset.state = state;
      let text = message;
      let showButton = false;

      switch(state){
        case 'starting':
          indicatorDot.classList.add('bg-amber-400');
          text = text || 'Δημιουργία ασφαλούς συνεδρίας…';
          showButton = true;
          break;
        case 'waiting':
          indicatorDot.classList.add('bg-amber-400');
          text = text || 'Αναμονή φορητής συσκευής…';
          showButton = true;
          break;
        case 'connected':
          indicatorDot.classList.add('bg-green-500');
          text = text || 'Φορητή συσκευή συνδεδεμένη.';
          showButton = true;
          break;
        case 'error':
          indicatorDot.classList.add('bg-red-500');
          text = text || 'Η απομακρυσμένη σύνδεση τερματίστηκε.';
          showButton = false;
          break;
        default:
          indicatorDot.classList.add('bg-slate-300');
          text = text || '';
          showButton = false;
      }

      indicatorText.textContent = text;
      if (indicatorDisconnect){
        indicatorDisconnect.classList.toggle('hidden', !showButton);
        indicatorDisconnect.disabled = !showButton;
      }
    }

    function rememberRemoteActivity(){
      hasRemoteDevice = true;
      lastRemoteActivity = Date.now();
    }

    function updateModeBadge(){
      if (!modeBadge) return;
      modeBadge.textContent = remoteMode === 'receipts' ? 'Αποδείξεις' : 'Τιμολόγια';
    }

    function highlightModeButtons(){
      modeButtons.forEach(btn => {
        if (!btn) return;
        const target = btn.getAttribute('data-remote-mode-option');
        if (!target) return;
        const active = (target === 'receipts' && remoteMode === 'receipts') || (target === 'invoices' && remoteMode !== 'receipts');
        btn.classList.toggle('bg-sky-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('shadow-inner', active);
        if (!active){
          btn.classList.remove('bg-sky-600','text-white','shadow-inner');
        }
      });
    }

    function syncPageToggle(mode){
      const switchEl = document.getElementById('useReceiptsSwitch');
      if (!switchEl) return;
      const shouldBeReceipts = mode === 'receipts';
      if (switchEl.checked === shouldBeReceipts) return;
      suppressPageNotify = true;
      switchEl.checked = shouldBeReceipts;
      try {
        switchEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
      setTimeout(() => { suppressPageNotify = false; }, 0);
    }

    function setRemoteMode(newMode, options){
      options = options || {};
      const normalized = newMode === 'receipts' ? 'receipts' : 'invoices';
      const changed = normalized !== remoteMode;
      remoteMode = normalized;
      updateModeBadge();
      highlightModeButtons();
      if (options.syncPage !== false){
        syncPageToggle(normalized);
      }
      return { mode: normalized, changed };
    }

    function setRemoteRepeat(value, options){
      options = options || {};
      const normalized = value === true || value === 'true' || value === 1 ? true : !!value;
      const changed = normalized !== remoteRepeatEnabled;
      remoteRepeatEnabled = normalized;
      if (options.syncPage !== false && repeatSwitch){
        if (!!repeatSwitch.checked !== normalized){
          suppressRepeatNotify = true;
          repeatSwitch.checked = normalized;
          try { repeatSwitch.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
          setTimeout(() => { suppressRepeatNotify = false; }, 0);
        } else {
          suppressRepeatNotify = false;
        }
      } else {
        suppressRepeatNotify = false;
      }
      return { repeat: normalized, changed };
    }

    function setRemoteAutoSubmit(value, options){
      options = options || {};
      const normalized = value === true || value === 'true' || value === 1 ? true : !!value;
      const changed = normalized !== remoteAutoSubmitEnabled;
      remoteAutoSubmitEnabled = normalized;
      if (options.syncPage){
        const controls = window.RC && window.RC.autoSubmitControls;
        if (controls && typeof controls.set === 'function'){
          controls.set(normalized, { silent: !!options.silent });
        } else if (!options.silent) {
          const targetBtn = normalized ? document.getElementById('autoSubmitBtnOn') : document.getElementById('autoSubmitBtnOff');
          try { targetBtn && targetBtn.click(); } catch(_){}
        }
      }
      return { enabled: normalized, changed };
    }

    function clearCode(){
      if (!codeContainer) return;
      Array.from(codeContainer.querySelectorAll('canvas, img, div[data-generated="1"]')).forEach(el => el.remove());
    }

    function renderQr(text, imageData){
      if (!codeContainer) return;
      clearCode();
      if (codePlaceholder){
        codePlaceholder.style.display = 'none';
      }
      if (imageData){
        const img = document.createElement('img');
        img.dataset.generated = '1';
        img.src = imageData;
        img.alt = 'QR σύνδεσμος απομακρυσμένης σάρωσης';
        img.className = 'w-56 h-56 object-contain';
        codeContainer.appendChild(img);
        return;
      }
      if (text){
        const fallback = document.createElement('div');
        fallback.dataset.generated = '1';
        fallback.className = 'w-56 h-56 flex items-center justify-center text-center text-gray-500 text-sm p-4';
        fallback.textContent = 'Αντέγραψε τον σύνδεσμο και άνοιξέ τον χειροκίνητα.';
        codeContainer.appendChild(fallback);
        return;
      }
      resetPlaceholder();
    }

    function resetPlaceholder(){
      if (codePlaceholder){
        codePlaceholder.style.display = 'flex';
        codePlaceholder.textContent = 'Δημιουργία QR…';
      }
      qrImageData = '';
    }

    function stopPoll(){ if (pollTimer){ clearTimeout(pollTimer); pollTimer = null; } }
    function stopCountdown(){ if (countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; } }

    function updateCountdown(){
      if (!countdownEl){
        return;
      }
      if (!expiresAt){
        countdownEl.textContent = '';
        return;
      }
      const diff = expiresAt - Date.now();
      if (diff <= 0){
        countdownEl.textContent = 'Η συνεδρία έληξε.';
        stopCountdown();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = `Λήγει σε ${mins}:${secs.toString().padStart(2,'0')}`;
    }

    function startCountdown(){
      stopCountdown();
      updateCountdown();
      countdownTimer = setInterval(updateCountdown, 1000);
    }

    function schedulePoll(delay){
      stopPoll();
      // Adaptive polling: γρηγορότερο όταν υπάρχει ενεργή συσκευή, πιο αργό όταν περιμένουμε
      const adaptiveDelay = delay || (hasRemoteDevice && isAttached ? 1000 : (hasRemoteDevice ? 1500 : 2500));
      pollTimer = setTimeout(runPoll, adaptiveDelay);
    }

    async function runPoll(){
      if (!sessionId) return;
      try {
        const params = new URLSearchParams({ session_id: sessionId });
        if (pollVersion) params.set('since', String(pollVersion));
        const res = await fetch('/api/qr/remote/status?' + params.toString(), { credentials: 'same-origin' });
        if (res.status === 410){
          let data = null;
          try { data = await res.json(); } catch (_) {}
          const disconnected = data && data.disconnected;
          const message = disconnected
            ? 'Η φορητή συσκευή αποσυνδέθηκε. Η συνεδρία τερματίστηκε.'
            : 'Η συνεδρία έληξε. Δημιούργησε νέα.';
          setStatus(message, 'error');
          showFlash(message, disconnected ? 'error' : 'info', 4000);
          await terminateSession({ notify: false, indicator: 'error', indicatorMessage: message });
          return;
        }
        if (!res.ok){
          setStatus('Σφάλμα επικοινωνίας με τον διακομιστή.', 'error');
          schedulePoll(4000);
          return;
        }
        const data = await res.json();
        if (!data || data.ok === false){
          const message = data && data.error ? data.error : 'Αποτυχία ενημέρωσης.';
          setStatus(message, 'error');
          schedulePoll(4000);
          return;
        }

        pollVersion = data.version || pollVersion;

        if (data.remote_last_seen){
          const seenTs = Date.parse(data.remote_last_seen);
          if (!Number.isNaN(seenTs)){
            hasRemoteDevice = true;
            lastRemoteActivity = seenTs;
          }
        }

        if (data.mode){
          setRemoteMode(data.mode, { syncPage: true });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'repeat_enabled')){
          setRemoteRepeat(data.repeat_enabled, { syncPage: true });
        }

        if (data.expires_at){
          const ts = Date.parse(data.expires_at);
          if (!Number.isNaN(ts)){
            expiresAt = ts;
            startCountdown();
          }
        }

        if (Object.prototype.hasOwnProperty.call(data, 'summary_version')){
          lastSummaryVersion = data.summary_version || 0;
        }
        if (data.summary_state){
          try { lastSummaryPayload = JSON.stringify(data.summary_state); } catch (_) {}
        }

        if (data.attached){
          rememberRemoteActivity();
        }

        const wasAttached = isAttached;
        const nextAttached = !!data.attached;
        isAttached = nextAttached;

        if (nextAttached !== wasAttached){
          if (isAttached){
            connectedBadge?.classList.remove('hidden');
            updateIndicator('connected');
            if (!autoClosed){
              autoClosed = true;
              if (!modal.classList.contains('hidden')){
                modal.classList.add('hidden');
              }
              showFlash('Η φορητή συσκευή συνδέθηκε. Μπορείς να σαρώνεις κωδικούς.', 'success', 4000);
            }
          } else {
            if (hasRemoteDevice){
              connectedBadge?.classList.remove('hidden');
              updateIndicator('connected', 'Η φορητή συσκευή παραμένει διαθέσιμη για νέες σαρώσεις.');
            } else {
              connectedBadge?.classList.add('hidden');
              if (sessionId){
                updateIndicator('waiting');
              }
            }
          }
        } else {
          if (isAttached){
            connectedBadge?.classList.remove('hidden');
            updateIndicator('connected');
          } else if (sessionId){
            if (hasRemoteDevice){
              const idleFor = Date.now() - lastRemoteActivity;
              const indicatorMessage = idleFor > 60000
                ? 'Η φορητή συσκευή παραμένει διαθέσιμη. Περιμένουμε νέο κωδικό.'
                : 'Η φορητή συσκευή παραμένει διαθέσιμη για νέες σαρώσεις.';
              updateIndicator('connected', indicatorMessage);
              connectedBadge?.classList.remove('hidden');
            } else {
              connectedBadge?.classList.add('hidden');
              updateIndicator('waiting');
            }
          }
        }

        if (data.control){
          handleRemoteControl(data.control);
        }

        if (data.payload){
          const payload = typeof data.payload === 'object' ? data.payload : { raw: String(data.payload || '') };
          const applied = applyScannedPayload(payload, { mode: remoteMode });
          const message = payload.is_url
            ? 'Ελήφθη URL από τη φορητή συσκευή.'
            : (payload.mark ? `Ελήφθη MARK ${payload.mark}.` : 'Ελήφθη QR τιμή.');
          rememberRemoteActivity();
          setStatus(message + ' Η σύνδεση παραμένει ενεργή.', 'success');
          showFlash('Ελήφθη QR από φορητή συσκευή. Η σύνδεση παραμένει ενεργή.', 'success', 4000);
          if (!applied){
            showFlash('Η απομακρυσμένη σάρωση ολοκληρώθηκε αλλά δεν συμπληρώθηκε πεδίο.', 'error', 4000);
          }
        } else if (isAttached){
          setStatus('Η φορητή συσκευή είναι συνδεδεμένη. Σάρωσε έναν κωδικό.', 'info');
        } else {
          if (hasRemoteDevice){
            const idleFor = Date.now() - lastRemoteActivity;
            if (idleFor > 60000){
              setStatus('Η φορητή συσκευή είναι σε ετοιμότητα. Περιμένουμε νέο κωδικό.', 'info');
            } else {
              setStatus('Η φορητή συσκευή παραμένει διαθέσιμη. Συνέχισε να σαρώνεις κωδικούς.', 'info');
            }
          } else {
            setStatus('Περιμένουμε σύνδεση φορητής συσκευής…', 'info');
          }
        }

        if (!summaryWatcherTimer && sessionId){
          startSummaryWatcher();
        }

        persistSessionState();
        
        // Adaptive polling: πιο γρήγορο όταν υπάρχουν δεδομένα ή ενεργή συσκευή
        let nextPollDelay = 2000; // default
        if (data.payload) {
          nextPollDelay = 600; // Πολύ γρήγορο μετά από scan
        } else if (isAttached) {
          nextPollDelay = 1000; // Γρήγορο όταν συνδεδεμένο
        } else if (hasRemoteDevice) {
          const idleTime = Date.now() - lastRemoteActivity;
          nextPollDelay = idleTime < 30000 ? 1200 : 2000; // Πιο γρήγορο αν πρόσφατα ενεργό
        } else {
          nextPollDelay = 2500; // Πιο αργό όταν περιμένουμε σύνδεση
        }
        
        schedulePoll(nextPollDelay);
      } catch (err){
        console.warn('remote poll error', err);
        setStatus('⚠️ Προσωρινό σφάλμα σύνδεσης. Επανέλεγχος…', 'error');
        schedulePoll(4000);
      }
    }

    async function terminateSession(options){
      const opts = options || {};
      const notify = opts.notify !== false;
      const indicatorState = opts.indicator || 'inactive';
      const indicatorMessage = opts.indicatorMessage;

      stopPoll();
      stopCountdown();
      stopSummaryWatcher();

      if (notify && sessionId){
        try {
          await fetch('/api/qr/remote/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ session_id: sessionId })
          });
        } catch (_) {}
      }

      sessionId = null;
      pollVersion = 0;
      connectUrl = '';
      expiresAt = null;
      isAttached = false;
      autoClosed = false;
      hasRemoteDevice = false;
      lastRemoteActivity = 0;
      qrImageData = '';
      lastSummaryPayload = '';
      lastSummaryVersion = 0;
      resetPlaceholder();
      clearCode();
      if (linkWrapper) linkWrapper.style.display = 'none';
      connectedBadge?.classList.add('hidden');
      if (indicatorState === 'inactive') updateIndicator('inactive');
      else updateIndicator(indicatorState, indicatorMessage);
      clearPersistedSession();
    }

    async function startSession(){
      await terminateSession({ notify: true, indicator: 'inactive' });

      remoteMode = currentScannerMode();
      remoteRepeatEnabled = !!(repeatSwitch && repeatSwitch.checked);
      remoteAutoSubmitEnabled = readAutoSubmitState();
      hasRemoteDevice = false;
      lastRemoteActivity = 0;
      isAttached = false;
      setRemoteMode(remoteMode, { syncPage: true });
      setRemoteRepeat(remoteRepeatEnabled, { syncPage: false });

      setStatus('Δημιουργία ασφαλούς συνεδρίας…', 'info');
      updateIndicator('starting');
      resetPlaceholder();
      clearCode();
      if (linkWrapper) linkWrapper.style.display = 'none';
      connectedBadge?.classList.add('hidden');

      try {
        const res = await fetch('/api/qr/remote/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ mode: remoteMode, repeat_enabled: remoteRepeatEnabled, auto_submit_enabled: remoteAutoSubmitEnabled })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.ok === false){
          const message = data && data.error ? data.error : 'Αποτυχία δημιουργίας συνεδρίας.';
          setStatus(message, 'error');
          updateIndicator('error', message);
          showFlash(message, 'error', 4000);
          return;
        }

        sessionId = data.session_id;
        connectUrl = data.connect_url || '';
        pollVersion = data.version || 0;
        isAttached = false;
        autoClosed = false;
        lastSummaryVersion = data.summary_version || 0;
        if (data.summary_state){
          try { lastSummaryPayload = JSON.stringify(data.summary_state); } catch (_) { lastSummaryPayload = ''; }
        }

        if (data.mode){
          setRemoteMode(data.mode, { syncPage: true });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'repeat_enabled')){
          setRemoteRepeat(data.repeat_enabled, { syncPage: true });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'auto_submit_enabled')){
          setRemoteAutoSubmit(data.auto_submit_enabled, { syncPage: false });
        }
        if (data.expires_at){
          const ts = Date.parse(data.expires_at);
          if (!Number.isNaN(ts)){
            expiresAt = ts;
            startCountdown();
          }
        }

        if (connectUrl){
          qrImageData = data.qr_image || '';
          renderQr(connectUrl, qrImageData);
          if (linkWrapper && linkValue){
            linkWrapper.style.display = 'block';
            linkValue.textContent = connectUrl;
            linkValue.href = connectUrl;
          }
          setStatus('Σάρωσε τον κωδικό με τη φορητή συσκευή σου.', 'info');
          updateIndicator('waiting');
          schedulePoll(1500);
          persistSessionState();
          startSummaryWatcher();
        } else {
          setStatus('Δεν δημιουργήθηκε σύνδεσμος QR.', 'error');
          updateIndicator('error', 'Δεν δημιουργήθηκε σύνδεσμος QR.');
        }
      } catch (err){
        console.warn('remote session start failed', err);
        setStatus('Σφάλμα δημιουργίας συνεδρίας.', 'error');
        updateIndicator('error', 'Σφάλμα δημιουργίας συνεδρίας.');
      }
    }

    async function copyLink(){
      if (!connectUrl) return;
      try {
        await navigator.clipboard.writeText(connectUrl);
        showFlash('Ο σύνδεσμος αντιγράφηκε στο πρόχειρο.', 'success', 2500);
      } catch (err){
        console.warn('clipboard write failed', err);
        showFlash('Δεν ήταν δυνατή η αντιγραφή. Αντέγραψε χειροκίνητα τον σύνδεσμο.', 'error', 4000);
      }
    }

    async function sendSessionUpdate(fields, options){
      options = options || {};
      if (!sessionId) return null;
      try {
        const payload = Object.assign({ session_id: sessionId }, fields || {});
        if (!Object.prototype.hasOwnProperty.call(payload, 'auto_submit_enabled')){
          payload.auto_submit_enabled = !!remoteAutoSubmitEnabled;
        }
        const res = await fetch('/api/qr/remote/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.ok === false){
          const message = data && data.error ? data.error : 'Αποτυχία ενημέρωσης συνεδρίας.';
          setStatus(message, 'error');
          return null;
        }
        if (data.mode){
          setRemoteMode(data.mode, { syncPage: options.syncPage !== false });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'repeat_enabled')){
          setRemoteRepeat(data.repeat_enabled, { syncPage: options.syncRepeat !== false });
        }
        if (Object.prototype.hasOwnProperty.call(data, 'auto_submit_enabled')){
          setRemoteAutoSubmit(data.auto_submit_enabled, { syncPage: false });
        }
        if (data.expires_at){
          const ts = Date.parse(data.expires_at);
          if (!Number.isNaN(ts)){
            expiresAt = ts;
            startCountdown();
          }
        }
        if (Object.prototype.hasOwnProperty.call(data, 'summary_version')){
          lastSummaryVersion = data.summary_version || 0;
        }
        if (data.summary_state){
          try { lastSummaryPayload = JSON.stringify(data.summary_state); } catch (_) {}
        }
        persistSessionState();
        return data;
      } catch (err){
        console.warn('remote update failed', err);
        setStatus('Δεν ήταν δυνατή η ενημέρωση συνεδρίας.', 'error');
        return null;
      }
    }

    window.__RC_onAutoSubmitChange = function(next){
      remoteAutoSubmitEnabled = !!next;
      persistSessionState({ autoSubmit: remoteAutoSubmitEnabled });
      if (sessionId){
        sendSessionUpdate({ auto_submit_enabled: remoteAutoSubmitEnabled }, { syncPage: false, syncRepeat: false });
      }
    };

    async function sendModeUpdate(nextMode, options){
      options = options || {};
      if (!sessionId) return;
      await sendSessionUpdate({ mode: nextMode, repeat_enabled: remoteRepeatEnabled }, options);
    }

    async function handleRepeatChange(nextValue){
      const { repeat, changed } = setRemoteRepeat(nextValue, { syncPage: false });
      if (!changed) return;
      if (sessionId){
        await sendSessionUpdate({ repeat_enabled: repeat }, { syncRepeat: false });
        setStatus(repeat ? 'Η επαναληπτική εισαγωγή ενεργοποιήθηκε.' : 'Η επαναληπτική εισαγωγή απενεργοποιήθηκε.', 'info');
      }
    }

    function handlePageModeChange(nextMode){
      if (suppressPageNotify) return;
      const { mode, changed } = setRemoteMode(nextMode, { syncPage: false });
      if (sessionId && changed){
        sendModeUpdate(mode, { syncPage: false });
        setStatus(mode === 'receipts' ? 'Η λειτουργία άλλαξε σε Αποδείξεις.' : 'Η λειτουργία άλλαξε σε Τιμολόγια.', 'info');
      }
    }

    function open(){
      modal.classList.remove('hidden');
      setRemoteMode(currentScannerMode(), { syncPage: true });
      if (!sessionId){
        startSession();
      } else {
        schedulePoll(500);
        startCountdown();
        updateIndicator(isAttached ? 'connected' : 'waiting');
      }
    }

    function hide(){
      modal.classList.add('hidden');
    }

    async function disconnect(){
      await terminateSession({ notify: true, indicator: 'inactive' });
      setStatus('Η συνεδρία τερματίστηκε.', 'info');
      showFlash('Η απομακρυσμένη συνεδρία τερματίστηκε.', 'info', 3000);
    }

    modeButtons.forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const choice = btn.getAttribute('data-remote-mode-option');
        const { mode, changed } = setRemoteMode(choice, { syncPage: true });
        if (changed){
          setStatus(mode === 'receipts' ? 'Η αποστολή θα στοχεύει στις αποδείξεις.' : 'Η αποστολή θα στοχεύει στα τιμολόγια.', 'info');
        }
        await sendModeUpdate(mode);
      });
    });

    repeatSwitch?.addEventListener('change', () => {
      if (suppressRepeatNotify) return;
      handleRepeatChange(!!repeatSwitch.checked);
    });

    modal.addEventListener('click', (evt) => { if (evt.target === modal) hide(); });
    closeEls.forEach(btn => btn && btn.addEventListener('click', hide));
    restartBtn?.addEventListener('click', (evt) => { evt.preventDefault(); startSession(); });
    copyBtn?.addEventListener('click', (evt) => { evt.preventDefault(); copyLink(); });
    indicatorDisconnect?.addEventListener('click', (evt) => { evt.preventDefault(); disconnect(); });

    updateIndicator('inactive');
    setRemoteMode(remoteMode, { syncPage: false });

    setTimeout(() => { attemptResumeFromStorage(); }, 120);

    return { open, close: hide, restart: startSession, disconnect, pageModeChanged: handlePageModeChange, repeatChanged: handleRepeatChange };
  }

})();

// Helper API calls
async function apiGetRepeatEntry(vat){
  try {
    const url = '/api/repeat_entry/get' + (vat ? ('?vat=' + encodeURIComponent(vat)) : '');
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch(e){
    console.warn('apiGetRepeatEntry failed', e);
    return { ok: false };
  }
}
async function apiSaveRepeatEntry(enabled, mapping, vat){
  try {
    const vatToUse = vat || VAT || (window._repeatModalVAT || "");  // χρησιμοποίησε το ανιχνευθέν VAT

    // Πάρε τις ήδη αποθηκευμένες τιμές ώστε να ΜΗΝ σβήσουν όταν κάνουμε disable
    let existingInvoiceMtype = '';
    let existingReceiptMtype = '';
    let existingProfileName = '';
    try {
      const getResp = await fetch('/api/repeat_entry/get?vat=' + encodeURIComponent(vatToUse), { credentials: 'same-origin' });
      const getData = await getResp.json();
      if (getData && getData.ok && getData.repeat_entry) {
        existingInvoiceMtype = getData.repeat_entry.invoice_mtype || '';
        existingReceiptMtype = getData.repeat_entry.receipt_mtype || '';
        existingProfileName = getData.repeat_entry.profile_name || '';
        // Αν δεν μας δίνεται mapping, κράτα το υπάρχον
        if (!mapping || !Object.keys(mapping).length) {
          mapping = getData.repeat_entry.mapping || {};
        }
      }
    } catch(fetchErr) {
      console.warn('apiSaveRepeatEntry: failed to get existing repeat_entry', fetchErr);
    }

    const res = await fetch('/api/repeat_entry/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({
        enabled: !!enabled,
        mapping: mapping || {},
        vat: vatToUse,
        invoice_mtype: existingInvoiceMtype,
        receipt_mtype: existingReceiptMtype,
        profile_name: existingProfileName
      })
    });
    if(!res.ok) {
      const txt = await res.text().catch(()=>null);
      return { ok: false, status: res.status, body: txt };
    }
    return await res.json();
  } catch(e){
    console.warn('apiSaveRepeatEntry failed', e);
    return { ok: false, error: String(e) };
  }
}

function removeForceEditParamFromUrl(){
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('force_edit')) {
      url.searchParams.delete('force_edit');
      history.replaceState(null, '', url.pathname + (url.search ? ('?' + url.searchParams.toString()) : '') + url.hash);
    }
  } catch(e){ console.warn('removeForceEditParamFromUrl failed', e); }
}

function hideSummaryModal(){
  const modal = document.getElementById('summaryModal');
  if(!modal) return;
  modal.style.display = 'none';
  try {
    const api = window.WaitOverlay;
    if(api && typeof api.suspend === 'function'){
      api.suspend(false);
      if(typeof api.hide === 'function') api.hide();
    }
  } catch(_){}
}
window.hideSummaryModal = hideSummaryModal;

document.addEventListener('DOMContentLoaded', function(){
  // ---------- DOM references ----------
  const repeatSwitch = document.getElementById('repeatEntrySwitch');
  const editRepeatBtn = document.getElementById('editRepeatMappingBtn');
  const repeatModal = document.getElementById('repeatMappingModal');
  const repeatModalList = document.getElementById('repeatMappingList');
  const repeatModalSave = document.getElementById('repeatModalSave');
  const repeatModalCancel = document.getElementById('repeatModalCancel');
  const repeatModalCloseX = document.getElementById('repeatModalCloseX');
  const summaryInput = document.getElementById('summaryJsonInput'); // may be null
  const saveSummaryForm = document.getElementById('saveSummaryForm');

  // New: receipts switch + url input
  // ---------- Μικρή, local επιδιόρθωση για τα κουμπιά/Select στο modal summary ----------
// ----- Prefill modal fields & categories from summaryJsonInput -----
function prefillSummaryModal(){
  try {
    const input = document.getElementById('summaryJsonInput');
    if(!input) return;
    let data = {};
    try { data = JSON.parse(input.value || '{}'); } catch(e) { data = {}; }

    // Header fields mapping
    const map = {
      mark: 'summaryModalMark',
      AA: 'summary_AA',
      AFM_issuer: 'summary_AFM',
      AFM: 'summary_AFM',
      Name: 'summary_Name',
      issuer_name: 'summary_Name',
      issueDate: 'summary_issueDate',
      type_name: 'summary_type_name',
      totalNetValue: 'summary_totalNetValue',
      totalVatAmount: 'summary_totalVatAmount',
      totalValue: 'summary_totalValue'
    };
    Object.keys(map).forEach(k => {
      const el = document.getElementById(map[k]);
      if(!el) return;
      el.innerText = (data[k] !== undefined && data[k] !== null) ? String(data[k]) : (data[k.toUpperCase()] || '');
    });

    // Ensure container exists
    const container = document.getElementById('summaryLinesContainer') || document;
    const lines = Array.isArray(data.lines) ? data.lines : [];

    // For each line, set select/button states
    lines.forEach(line => {
      const lid = String(line.id || line.line_id || '').trim();
      if(!lid) return;

      // Try to find matching element inside modal (row or singleLine)
      let row = container.querySelector('[data-line-id="'+lid+'"]');
      if(!row){
        // fallback: global lookup
        row = document.querySelector('[data-line-id="'+lid+'"]');
      }
      if(!row) return;

      const cat = line.category || line.cat || '';
      // set select if present
      const sel = row.querySelector('select.expense-category[data-line-id="'+lid+'"]');
      if(sel){
        try { sel.value = cat || ''; } catch(e){ /* ignore */ }
      }
      // set button states if buttons present
      const btns = row.querySelectorAll('.category-btn[data-line-id="'+lid+'"]');
      if(btns && btns.length){
        btns.forEach(b => b.classList.remove('bg-sky-600','text-white'));
        if(cat){
          // try to find exact button
          const esc = (window.CSS && CSS.escape) ? CSS.escape(cat) : cat.replace(/"/g,'\\"');
          const target = row.querySelector('.category-btn[data-line-id="'+lid+'"][data-cat="'+cat+'"]') ||
                         row.querySelector('.category-btn[data-line-id="'+lid+'"][data-cat="'+esc+'"]');
          if(target) target.classList.add('bg-sky-600','text-white');
        }
      }
    });

    // Ensure scrapeUrlField is set only for receipts; clear for invoices to avoid mis-classification
    try {
      const scrapeEl = document.getElementById('scrapeUrlField');
      if (scrapeEl) {
        const isReceipt = data && (data.is_receipt === true || /αποδει/i.test(String(data.type_name || '') + ' ' + String(data.category || '')));
        if (!isReceipt) {
          scrapeEl.value = '';
          try { scrapeEl.removeAttribute('data-mark'); } catch(e){}
        } else {
          // preserve any provided scrape_url
          if (data.scrape_url) scrapeEl.value = data.scrape_url;
        }
      }
    } catch(e) { /* ignore */ }
  } catch(err){
    console.warn('prefillSummaryModal error', err);
  }
}

// Call prefill when modal gets shown by your existing code.
// Find the places where you do: modal.style.display = 'flex' and add prefillSummaryModal().

  (function(){
  // helper: ασφαλής update του hidden json από το DOM
  function updateSummaryFromDom(){
    try {
      // Ensure any component-local summary state is merged into the legacy hidden input
      try {
        const compEl = document.getElementById('summaryDataInput');
        const legacyEl = document.getElementById('summaryJsonInput');
        if (compEl && compEl.value && legacyEl) {
          let comp = {};
          let leg = {};
          try { comp = JSON.parse(compEl.value || '{}'); } catch(_) { comp = {}; }
          try { leg = JSON.parse(legacyEl.value || '{}'); } catch(_) { leg = {}; }
          // copy canonical MTYPE fields if present
          ['mtype','receipt_mtype','invoice_mtype','receiptMtype','invoiceMtype'].forEach(k => {
            if (comp[k] && !leg[k]) leg[k] = comp[k];
          });
          // prefer component lines if legacy empty
          if (comp.lines && (!Array.isArray(leg.lines) || !leg.lines.length)) leg.lines = comp.lines;
          try { legacyEl.value = JSON.stringify(leg); } catch(_){}
        }
      } catch(e){ console.warn('merge component->legacy failed', e); }
      const input = document.getElementById('summaryJsonInput');
      if(!input) return;
      let data = {};
      try { data = JSON.parse(input.value || '{}'); } catch(e){ data = {}; }
      data.lines = Array.isArray(data.lines) ? data.lines.slice() : [];

      // For every element that has data-line-id inside the modal container, read category
      const container = document.getElementById('summaryLinesContainer') || document;
      const __seen = new Set();
      container.querySelectorAll('[data-line-id]').forEach(el => {
        const lid = String(el.dataset.lineId || '').trim();
        if(!lid || __seen.has(lid)) return;
        __seen.add(lid);
        // prefer select.expense-category for this lineId (search in container)
        let chosen = '';
        const sel = container.querySelector('select.expense-category[data-line-id="'+lid+'"]');
        if(sel && sel.value) chosen = sel.value;
        else {
          // else look for active category button for that lineId
          const btn = container.querySelector('.category-btn.bg-sky-600[data-line-id="'+lid+'"]');
          if(btn) chosen = btn.dataset.cat || '';
        }
        
        // find or create line entry
        let found = data.lines.find(x => String(x.id) === lid);
        if(!found){
          found = { id: lid, category: '' };
          data.lines.push(found);
        }
        found.category = chosen || '';
      });
      
      // Συλλογή invoice-level MTYPE (για Γ Category)
      // Διαβάζουμε το MTYPE αν υπάρχει το dropdown, ανεξάρτητα από το G_CATEGORY_DATA
      const invoiceMtypeSelect = document.getElementById('invoiceMtypeSelect');
      if (invoiceMtypeSelect && invoiceMtypeSelect.value) {
        data.mtype = invoiceMtypeSelect.value;
        data.invoice_mtype = invoiceMtypeSelect.value; // for consistency
      }

      // Συλλογή receipt-level MTYPE (για Αποδείξεις)
      // consider receipt mode when either the receipts toggle is ON or the parsed summary itself is a receipt
      const inputVal = (function(){ try { return JSON.parse(document.getElementById('summaryJsonInput')?.value || '{}'); } catch(e){ return {}; } })();
      const isReceiptsMode = isReceiptsOn() || Boolean(inputVal && inputVal.is_receipt);
      const receiptMtypeSelect = document.getElementById('receiptMtypeSelectSummary');
      if (isReceiptsMode && receiptMtypeSelect && receiptMtypeSelect.value) {
        // Include MTYPE for receipts mode
        data.mtype = receiptMtypeSelect.value;
        data.invoice_mtype = receiptMtypeSelect.value; // also set invoice_mtype for consistency
      }

      input.value = JSON.stringify(data);
    } catch(err){
      console.warn('updateSummaryFromDom error', err);
    }
  }

  // only operate inside the modal area to avoid interfering globally
  const container = document.getElementById('summaryLinesContainer');
  if(!container) {
    // fallback: attach to document but remain minimal
    console.warn('summaryLinesContainer not found — fix handlers limitedly');
  }

  // Event delegation: capture clicks on category buttons and selects inside modal
  const targetRoot = container || document;
  // Use capture true so we intercept before other handlers
  targetRoot.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('.category-btn');
    if(btn && (container ? container.contains(btn) : true)){
      // Prevent bubbling to other global handlers that open the receipts-modal
      e.preventDefault();
      e.stopPropagation();

      // ensure it's not treated as a submit (defensive): set type=button if missing
      try { if(btn.tagName === 'BUTTON' && !btn.hasAttribute('type')) btn.setAttribute('type','button'); } catch(_) {}

      // determine line id: prefer dataset, else find closest ancestor with data-line-id
      const lineEl = btn.closest('[data-line-id]');
      const lineId = lineEl ? (lineEl.dataset.lineId || '') : (btn.dataset.lineId || '');

      // Toggle active class for buttons of the same line only
      if(lineId){
        const group = (container || document).querySelectorAll('.category-btn[data-line-id="'+lineId+'"]');
        group.forEach(b => { b.classList.remove('bg-sky-600','text-white'); });
      } else {
        // fallback: toggle only this button
      }
      const isActive = !btn.classList.contains('bg-sky-600');
      if(isActive) btn.classList.add('bg-sky-600','text-white');
      else btn.classList.remove('bg-sky-600','text-white');

      // if there's a select corresponding to this line, keep it in sync
      if(lineId){
        const sel = (container || document).querySelector('select.expense-category[data-line-id="'+lineId+'"]');
        if(sel) sel.value = isActive ? (btn.dataset.cat || '') : '';
      }

      // update hidden JSON immediately
      updateSummaryFromDom();
      return;
    }

    // if clicking on a select inside modal, prevent bubbling too
    const sel = e.target.closest && e.target.closest('select.expense-category');
    if(sel && (container ? container.contains(sel) : true)){
      e.stopPropagation();
      // let change event handle updating (below we also listen change)
      return;
    }
  }, true);

  // Listen change events on selects inside container and update JSON
  (container || document).addEventListener('change', function(e){
    const sel = e.target.closest && e.target.closest('select.expense-category');
    if(sel && (container ? container.contains(sel) : true)){
      e.stopPropagation();
      // sync any visual button states (remove active if select chosen)
      const lid = sel.dataset.lineId || (sel.closest('[data-line-id]') && sel.closest('[data-line-id]').dataset.lineId) || '';
      if(lid){
        // clear buttons for that line
        const group = (container || document).querySelectorAll('.category-btn[data-line-id="'+lid+'"]');
        group.forEach(b => b.classList.remove('bg-sky-600','text-white'));
      }
      updateSummaryFromDom();
    }
  }, true);

  // Ensure Save form updates JSON right before submit (defensive)
  const saveForm = document.getElementById('saveSummaryForm');
  if(saveForm){
    saveForm.addEventListener('submit', function(e){
      try {
        updateSummaryFromDom();
        // Ensure repeat_enabled is posted if repeat is on
        const repeatSwitch = document.getElementById('repeatEntrySwitch');
        if (repeatSwitch && repeatSwitch.checked) {
          let h = saveForm.querySelector('input[name="repeat_enabled"]');
          if (!h) {
            h = document.createElement('input');
            h.type = 'hidden';
            h.name = 'repeat_enabled';
            saveForm.appendChild(h);
          }
          h.value = '1';
        }
        // small synchronous update only; let the submit continue
      } catch(err){ console.warn('pre-submit update failed', err); }
    });
  }

  // Expose helper in case other code wants to call it
  window.updateSummaryFromDom = updateSummaryFromDom;
})();

  const useReceiptsSwitch = document.getElementById('useReceiptsSwitch');
  useReceiptsSwitch?.addEventListener('change', () => {
  // ποιο όνομα να δείξω στο hint; πάρε την τρέχουσα επιλογή από το select του modal,
  // αλλιώς άφησε κενό => θα εμφανιστεί "Γενικό"
  const name = (document.getElementById('charProfileSelect')?.value || "");
  setActiveProfileHint(name);
  try {
    remoteCtrl?.pageModeChanged?.(currentScannerMode());
  } catch (err) { console.warn('remoteCtrl pageModeChanged failed', err); }
});

  // find or create an URL input (if not present in template we create one dynamically)
  let urlInput = document.getElementById('scrapeUrlInput');
  if(!urlInput){
    urlInput = document.createElement('input');
    urlInput.id = 'scrapeUrlInput';
    urlInput.placeholder = 'Εισάγετε URL παραστατικού (για αποδείξεις)';
    urlInput.className = 'p-2 border rounded w-full pr-12 hidden';
    urlInput.type = 'text';
    // insert after markInput
    const mi = document.getElementById('markInput');
    if(mi && mi.parentElement) mi.parentElement.insertBefore(urlInput, mi.nextSibling);
  }

  // --- ensure search icon behaves same as input clear/submit ---
  (function wireSearchIconBehavior(){
    const mi = document.getElementById('markInput');
    if (!mi) return;

    const possibleSelectors = [
      '.icon-search', '.btn-search', '#searchIcon', '.fa-search', '.magnifier',
      'button[aria-label="search"]', 'button[data-action="search"]'
    ];

    let found = null;
    for (const sel of possibleSelectors) {
      const el = document.querySelector(sel);
      if (el) { found = el; break; }
    }

    if (!found) {
      const delBtn = document.querySelector('button#deleteSelected, button.delete-selected, button[data-action="delete-selected"]');
      if (delBtn && delBtn.parentElement) {
        const sibling = delBtn.parentElement.querySelector('button, a, svg, i');
        if (sibling && sibling !== delBtn) found = sibling;
      }
    }

    if (!found) return;

    found.addEventListener('click', function(e){
      try {
        mi.value = '';
        mi.dispatchEvent(new Event('input', { bubbles: true }));
        mi.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }));
        if (window.jQuery && jQuery.fn && jQuery.fn.dataTable) {
          try {
            const dt = $('.summary-table').DataTable();
            dt.search('').columns().search('').draw();
          } catch(ignore){}
        }
      } catch(err){
        console.warn('search icon handler failed', err);
      }
    });
  })();


  // detect vat keys in summary
  function detectVatKeysFromSummary(){
  if(summaryInput && summaryInput.value){
    try {
      const obj = JSON.parse(summaryInput.value || '{}');
      const lines = Array.isArray(obj.lines) ? obj.lines : [];
      const found = new Set();
      lines.forEach(l => {
        const key = (l.vatCategory || l.vat_category || l.vat || '').toString().trim();
        if(key) found.add(key);
      });
      if(found.size) return Array.from(found);
    } catch(e){}
  }
  return ['0%','6%','13%','17%','24%'];
}

      async function getExpenseTagsForVat(vat){
  // 1. Πρώτα από /api/repeat_entry/get (ήταν η παλιά πηγή)
  try{
    const r = await fetch('/api/repeat_entry/get' + (vat?('?vat='+encodeURIComponent(vat)):''),
                          {credentials:'same-origin'});
    const j = await r.json();
    if (j && Array.isArray(j.expense_tags) && j.expense_tags.length) {
      return j.expense_tags.filter(t => t !== 'αποδειξακια'); // όχι στα τιμολόγια
    }
  }catch(_){}

  // 2. Fallback από /api/char_profiles
  try{
    const r = await fetch('/api/char_profiles?vat=' + encodeURIComponent(vat||''), {credentials:'same-origin'});
    const j = await r.json();
    if (j && Array.isArray(j.expense_tags) && j.expense_tags.length) {
      return j.expense_tags.filter(t => t !== 'αποδειξακια');
    }
  }catch(_){}

  // 3. Τελευταίο fallback: SERVER variable / global
  try{
    if (Array.isArray({{ customer_categories|tojson|safe }}) && {{ customer_categories|tojson|safe }}.length){
      return {{ customer_categories|tojson|safe }}.filter(t => t !== 'αποδειξακια');
    }
  }catch(_){}
  if (Array.isArray(window.CUSTOMER_CATEGORIES) && window.CUSTOMER_CATEGORIES.length){
    return window.CUSTOMER_CATEGORIES.filter(t => t !== 'αποδειξακια');
  }
  return [];
}
  // Build repeat modal UI given an existing mapping (object)
  

// αντικατάσταση της παλιάς openRepeatModalWithMapping
function openRepeatModalWithMapping(mapping){
  // πέρασε το mapping ως override στο νέο renderer
  window._repeatMappingOverride = mapping ? mapping : null;
  // άνοιξε το modal από τον ενιαίο renderer
  if (typeof window.openRepeatModal === 'function') {
    window.openRepeatModal();
  }
}
  function closeRepeatModal(){ repeatModal.style.display = 'none'; }

  
// --- normalize VAT γραμμής σε ένα από τα κλειδιά 0/6/13/17/24 ---
function normalizeVatKey(s){
  const t = (s || '').toString().toLowerCase().trim().replace(',', '.');

  // τυπικά patterns που επιστρέφει myDATA / scrapers
  if (/\b17\b|17%|17\.0/.test(t)) return '17%';
  if (/\b24\b|24%|24\.0|κανονικ/.test(t)) return '24%';
  if (/\b13\b|13%|13\.0/.test(t)) return '13%';
  if (/\b6\b|6%|6\.0|μειωμ|reduced/.test(t)) return '6%';
  // 0: μηδενικό, απαλλασσόμενο, χωρίς ΦΠΑ
  if (/\b0\b|0%|0\.0|μηδεν|απαλλ|χωρις|χωρίς|exempt|no\s*vat/.test(t)) return '0%';

  return ''; // άγνωστο -> θα αφήσει το modal ανοιχτό
}

// --- εφαρμογή του ενεργού mapping στις γραμμές + auto submit ---
function applyMappingToSummaryAndSubmitUsingMapping(mapping){
  const input = document.getElementById('summaryJsonInput');
  const form  = document.getElementById('saveSummaryForm');
  if (!input || !form) return false;

  let obj;
  try { obj = JSON.parse(input.value || '{}'); } catch(e){ obj = {}; }
  const lines = Array.isArray(obj.lines) ? obj.lines : [];
  if (!lines.length) return false;

  // Βεβαιώσου ότι έχουμε όλα τα κλειδιά ποσοστών
  const M = Object.assign(
    {"0%":"","6%":"","13%":"","17%":"","24%":""},
    mapping || {}
  );

  let missing = false;
  lines.forEach((ln, idx) => {
    // αν λείπει id, φτιάξτο για συνέπεια
    if (!ln.id && ln.line_id !== undefined) ln.id = String(ln.line_id);
    if (!ln.id) ln.id = 'l' + idx;

    const rawVat = (ln.vatCategory || ln.vat_category || ln.vat || '').toString();
    const key    = normalizeVatKey(rawVat);
    const cat    = key ? (M[key] || '') : '';

    ln.category = cat;
    if (!cat) missing = true;
  });

  // γράψε πίσω στο hidden input
  input.value = JSON.stringify(obj);

  // Αν λείπουν κατηγορίες -> άστο να φανεί το modal για χειροκίνητα
  if (missing) return false;

  // Προστασία: μην ξανα-γίνει submit δεύτερη φορά
  if (window.__repeat_auto_submitting) return true;
  window.__repeat_auto_submitting = true;

  // Καθάρισε τυχόν πεδία receipts (για να μην μπερδέψουν το submit)
  const u = document.getElementById('scrapeUrlField');
  const c = document.getElementById('scrapeCategoryField');
  const f = document.getElementById('scrapeForceField');
  if (u) u.value = '';
  if (c) c.value = '';
  if (f) f.value = 'false';

  // Κάνε submit στο υπάρχον flow σου
  try { form.submit(); } catch(_) { window.__repeat_auto_submitting = false; return false; }
  return true;
}
  // ---------- Initialization: load server repeat_entry config ----------
  (async function initRepeatEntry(){
    try {
      const resp = await apiGetRepeatEntry(VAT);
      if(resp && resp.ok){
        const repeat = resp.repeat_entry || { enabled: false, mapping: {} };
        if(resp.expense_tags && Array.isArray(resp.expense_tags) && resp.expense_tags.length){
          CUSTOMER_CATEGORIES = resp.expense_tags.slice();
        }
        const enabled = !!repeat.enabled;
        const mapping = repeat.mapping || {};

        if(repeatSwitch){
          repeatSwitch.checked = enabled;
          setActiveProfileHint(enabled ? ((repeat && repeat.profile_name) || "") : "");

          // show edit button if mapping exists and receipts not selected
          if(mapping && Object.keys(mapping).length && !(useReceiptsSwitch && useReceiptsSwitch.checked)) editRepeatBtn.classList.remove('hidden');
          repeatSwitch.addEventListener('change', async function(){
            const now = this.checked;
            // if enabling and no mapping -> open modal to create mapping
            if(now){
              if(!mapping || Object.keys(mapping).length === 0){
                // open modal letting user create mapping (but only if receipts not selected)
                if(useReceiptsSwitch && useReceiptsSwitch.checked){
                  // do not open — receipts use only αποδειξακια
                  editRepeatBtn.classList.add('hidden');
                } else {
                  openRepeatModalWithMapping({});
                }
              } else {
                if(useReceiptsSwitch && useReceiptsSwitch.checked){
                  // receipts + repeat -> hide edit button
                  editRepeatBtn.classList.add('hidden');
                } else {
                  editRepeatBtn.classList.remove('hidden');
                }
              }
            } else {
              editRepeatBtn.classList.add('hidden');
            }
            // Persist enabled flag immediately (keep mapping as-is)
            const saveResp = await apiSaveRepeatEntry(now, mapping, VAT);
            if(saveResp && saveResp.ok){
              showFlash('Ενημερώθηκε η ρύθμιση επαναληπτικής εισαγωγής.', 'success');
              if(saveResp.expense_tags && Array.isArray(saveResp.expense_tags) && saveResp.expense_tags.length){
                CUSTOMER_CATEGORIES = saveResp.expense_tags.slice();
              }
            } else {
              showFlash('Αποτυχία αποθήκευσης ρύθμισης.', 'error');
            }
          });
        }

        // If repeat enabled and mapping exists and modal_summary present -> auto apply mapping now
        if (enabled && mapping && Object.keys(mapping).length && summaryInput) {
        const receiptsOn = !!(useReceiptsSwitch && useReceiptsSwitch.checked);
          if (!receiptsOn && !FORCE_EDIT) {
            const did = applyMappingToSummaryAndSubmitUsingMapping(mapping);
          if (did) {
            const sm = document.getElementById('summaryModal');
          if (sm) sm.style.display = 'none';
      }
    }
  }

        // Wire edit button
        if(editRepeatBtn){
          editRepeatBtn.classList.toggle('hidden', !mapping || Object.keys(mapping).length===0 || (useReceiptsSwitch && useReceiptsSwitch.checked));
          editRepeatBtn.addEventListener('click', function(){
            openRepeatModalWithMapping(mapping);
          });
        }
      } else {
        if(repeatSwitch) repeatSwitch.checked = false;
      }
    } catch(e){
      console.warn('initRepeatEntry failed', e);
    }
  })();

  // wire receipts switch to show/hide url input and to enforce mapping rule
  if(useReceiptsSwitch){
    useReceiptsSwitch.addEventListener('change', function(){
      const on = !!this.checked;
      this.setAttribute('aria-checked', on ? 'true' : 'false');
      // UI: swap inputs
      if(on){
        document.getElementById('markInput')?.classList.add('hidden');
        urlInput?.classList.remove('hidden');
        urlInput?.focus();
        // when receipts are active, edit button must be hidden (even if repeat on)
        if(editRepeatBtn) editRepeatBtn.classList.add('hidden');
      } else {
        document.getElementById('markInput')?.classList.remove('hidden');
        urlInput?.classList.add('hidden');
        document.getElementById('markInput')?.focus();
        // restore edit button visibility based on repeatSwitch/mapping
        // re-init repeat button visibility by calling initRepeatEntry lightly:
        (async function(){
          try {
            const resp = await apiGetRepeatEntry(VAT);
            if(resp && resp.ok){
              const mapping = (resp.repeat_entry && resp.repeat_entry.mapping) ? resp.repeat_entry.mapping : {};
              if(mapping && Object.keys(mapping).length && repeatSwitch && repeatSwitch.checked){
                editRepeatBtn.classList.remove('hidden');
              } else {
                editRepeatBtn.classList.add('hidden');
              }
            }
          } catch(e){}
        })();
      }
    });
    useReceiptsSwitch.setAttribute('aria-checked', useReceiptsSwitch.checked ? 'true' : 'false');
  }

  // repeat modal handlers
  repeatModalCloseX?.addEventListener('click', closeRepeatModal);
  repeatModalCancel?.addEventListener('click', closeRepeatModal);

  
  // ---------- existing original JS (dismiss banner, force edit, summary modal wiring, etc) ----------
  const forceBtn = document.getElementById('forceEditBtn');
  const markInput = document.getElementById('markInput');
  const existingBanner = document.getElementById('existingBanner');
  const dismissBannerBtn = document.getElementById('dismissBannerBtn');

  if(dismissBannerBtn){
    dismissBannerBtn.addEventListener('click', function(){ if(existingBanner) existingBanner.style.display = 'none'; });
  }

  if (forceBtn){
    forceBtn.addEventListener('click', async function(){
      const markValRaw = (markInput && markInput.value) ? markInput.value.trim() : '{{ mark or "" }}';
      const markVal = encodeURIComponent(markValRaw || '');
      if (!markVal){ await showModalAlert('Σφάλμα', 'Δεν δόθηκε MARK για επιβεβαίωση.'); return; }
      if (await showModalConfirm('Επιβεβαίωση', 'Θες σίγουρα να επαναχαρακτηρίσεις το MARK και να ανοίξει η φόρμα επεξεργασίας;')) {
        if(existingBanner) existingBanner.style.display = 'none';
        window.location = SEARCH_BASE_URL + '?mark=' + markVal + '&force_edit=1';
      }
    });
  }

  const modal = document.getElementById('summaryModal');
  const modalCloseBtns = Array.from(document.querySelectorAll('#modalCloseX, #modalCloseBtn'));
  modalCloseBtns.forEach(b => b?.addEventListener('click', function(){
    hideSummaryModal();
    removeForceEditParamFromUrl();
  }));

  {% if modal_summary and (request.args.get('force_edit') == '1' or not allow_edit_existing) %}
  setTimeout(()=>{
  const m = document.getElementById('summaryModal');
  if (!m) return;

  // Αν είμαστε σε mode αποδείξεων ΚΑΙ είναι ενεργό το repeat, μην ανοίγεις modal
  // ΕΞΑΙΡΕΣΗ: αν είναι reclassification (force_edit=1), τότε άνοιξέ το για να αλλάξουμε χαρακτηρισμούς.
  const receiptsOn = !!(document.getElementById('useReceiptsSwitch') && document.getElementById('useReceiptsSwitch').checked);
  const repeatOn   = !!(document.getElementById('repeatEntrySwitch') && document.getElementById('repeatEntrySwitch').checked);

  // Επιπλέον έλεγχος: αν το summary είναι σαφώς Απόδειξη, αντιμετώπισέ το ως receipts flow
  let isReceiptSummary = false;
  try {
    const raw = (document.getElementById('summaryJsonInput')?.value || '').trim();
    if (raw) {
      const sobj = JSON.parse(raw);
      const tname = (sobj.type_name || sobj.type || '').toString().toLowerCase();
      const cat   = (sobj.category || sobj.characteristic || sobj['χαρακτηρισμός'] || '').toString().toLowerCase();
      isReceiptSummary = !!(sobj.is_receipt || tname.includes('απόδει') || tname.includes('receipt') || cat === 'αποδειξακια');
    }
  } catch(_){}


  if ((receiptsOn || isReceiptSummary) && repeatOn && !FORCE_EDIT) {
    // auto-flow αποδείξεων όταν είναι ενεργό το "Επαναληψιμη εισαγωγή"
    try {
      let raw = (document.getElementById('summaryJsonInput')?.value || '').trim();
      if (!raw || raw === '{}' || raw === 'null') {
        try { raw = JSON.stringify({{ modal_summary | tojson | safe }}); } catch(_) {}
      }
      const sobj = raw ? JSON.parse(raw) : {};
      // Κανονικοποίησε σαν απόδειξη και επιβεβαίωσε μία φορά
      const url = document.getElementById('scrapeUrlInput')?.value || '';
      (async () => {
        try {
          await RC.confirmReceiptOnce(RC.normalizeReceiptSummary(sobj), url);
          // κράτα το mode σε receipts και κάνε hard redirect για καθαρή κατάσταση
          try { localStorage.setItem('useReceiptsSwitch','1'); } catch(_){}
          const base = location.pathname + '?use_receipts=1';
          location.replace(base);
        } catch(e) {
          console.warn('auto-confirm receipt failed', e);
        }
      })();
    } catch(e) { console.warn('auto-flow receipts error', e); }
    return;
  }


  // Αλλιώς, άνοιξέ το κανονικά
  try {
    const summaryInputEl = document.getElementById('summaryJsonInput');
    if (summaryInputEl && (!summaryInputEl.value || summaryInputEl.value === '{}')) {
      summaryInputEl.value = {{ modal_summary | tojson | safe }};
    }
    const obj = JSON.parse(document.getElementById('summaryJsonInput').value || '{}');
    renderSummaryLinesFromObject(obj);
  } catch(e) { console.warn('renderSummaryLinesFromObject error', e); }

  m.style.display = 'flex';
  removeForceEditParamFromUrl();
}, 80);
{% endif %}



  {% if modal_warning %}
  const afmModal = document.getElementById('afmWarningModal');
  const afmModalBtn = document.getElementById('afmModalConfirm');
  if (afmModal && afmModalBtn){
    setTimeout(()=>{ afmModal.style.display = 'flex'; }, 50);
    afmModalBtn.addEventListener('click', function(evt){
      evt.preventDefault();
      afmModal.style.display = 'none';
      try { window.__RC_handleWarningAck(); } catch(_){}
    });
  }
  {% endif %}

  // --- the rest of your existing summary wiring (no changes) ---
  if (summaryInput){
  try {
    let summaryData = JSON.parse(summaryInput.value || '{}');
    if (!Array.isArray(summaryData.lines)) summaryData.lines = [];
    summaryData.lines = summaryData.lines.map(l => {
      if (!l) return {id:'', description:'', amount:'', vat:'', category:'', vatCategory:''};
      l.id = (l.id!==undefined)?String(l.id):(l.line_id!==undefined?String(l.line_id):'');
      l.category = l.category || l.cat || l.line_category || l['κατηγορία'] || '';
      return l;
    });

    // multi-line selects
    document.querySelectorAll('#linesTableBody tr[data-line-id]').forEach(tr => {
      const lid = String(tr.dataset.lineId || '');
      const sel = tr.querySelector('select.expense-category');
      if (!sel) return;
      let existing = summaryData.lines.find(x => String(x.id) === lid);
      if (!existing){
        existing = {id: lid, category: ''};
        summaryData.lines.push(existing);
      }
      sel.value = existing.category || '';
      sel.addEventListener('change', function(){ existing.category = sel.value; summaryInput.value = JSON.stringify(summaryData); });
    });

    // single-line buttons
    const singleLine = document.getElementById('singleLine');
    if (singleLine){
      const lid = String(singleLine.dataset.lineId || '');
      let existing = summaryData.lines.find(x => String(x.id) === lid);
      if (!existing){
        existing = {id: lid, category: ''};
        summaryData.lines.push(existing);
      }
      const buttons = document.querySelectorAll('#categoryButtons .category-btn');
      function markActive(cat){
        buttons.forEach(b => {
          b.classList.toggle('bg-sky-600', b.dataset.cat === cat);
          b.classList.toggle('text-white', b.dataset.cat === cat);
        });
      }
      if (existing.category) markActive(existing.category);
      buttons.forEach(btn => {
        btn.addEventListener('click', function(){
          const cat = this.dataset.cat;
          existing.category = (existing.category === cat) ? '' : cat;
          markActive(existing.category);
          summaryInput.value = JSON.stringify(summaryData);
        });
      });
      const clearBtn = document.getElementById('clearCategory');
      clearBtn?.addEventListener('click', function(){
        existing.category = '';
        markActive('');
        summaryInput.value = JSON.stringify(summaryData);
      });
    }
    summaryInput.value = JSON.stringify(summaryData);
  } catch(e){
    console.warn('summary JSON parse/normalize error', e);
  }
}


  // --- the table / datatables logic code (kept unchanged) ---
  const hasTable = document.querySelector('.summary-table') !== null;
  if (hasTable){
    const jq = window.jQuery;
    const dtAvail = jq && jq.fn && jq.fn.dataTable;
    if (dtAvail){
      try {
        const dt = $('.summary-table').DataTable({
          paging: true,
          scrollY: '55vh',
          scrollX: true,
          scrollCollapse: true,
          fixedHeader: { header: true, headerOffset: 0 },
          colReorder: true,
          autoWidth: false,
          columnDefs: [{ orderable: false, targets: 0 }]
        });
        if (typeof dt.colResize === 'function') {
          try { dt.colResize({ resizeMode: 'flex' }); } catch(e){ console.warn('colResize failed', e); }
        }
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch){
          globalSearch.addEventListener('input', function(){ dt.search(this.value).draw(); });
        }
        setTimeout(()=>{ try{ dt.columns.adjust().draw(); }catch(e){} }, 120);
      } catch(e){
        console.warn('DataTables init failed — falling back', e);
      }
    } else {
      const globalSearch = document.getElementById('globalSearch');
      if (globalSearch){
        globalSearch.addEventListener('input', function(){
          const q = this.value.toLowerCase();
          document.querySelectorAll('.summary-table tbody tr').forEach(tr => {
            tr.style.display = tr.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
          });
        });
      }
    }

    try {
      const anyCheckbox = document.querySelector('input[name="delete_mark"]');
      if (anyCheckbox){
        const firstTh = document.querySelector('.summary-table thead th');
        if (firstTh && !document.getElementById('selectAll')){
          const chk = document.createElement('input');
          chk.type = 'checkbox'; chk.id = 'selectAll'; chk.title = 'Επιλογή όλων';
          chk.style.marginRight = '6px';
          firstTh.prepend(chk);
          chk.addEventListener('change', function(){ document.querySelectorAll('input[name="delete_mark"]').forEach(cb => cb.checked = this.checked); });
        }
        const headers = Array.from(document.querySelectorAll('.summary-table thead th')).map(h => h.innerText.trim().toLowerCase());
        let markIdx = headers.findIndex(h => h.includes('mark'));
        if (markIdx === -1) markIdx = headers.findIndex(h => h.includes('αφμ') || h.includes('afm'));
        if (markIdx >= 0){
          document.querySelectorAll('.summary-table tbody tr').forEach(row => {
            const cb = row.querySelector('input[name="delete_mark"]');
            if (cb){
              const td = row.querySelectorAll('td')[markIdx];
              if (td){
                const v = td.innerText.trim();
                if (v) cb.value = v;
              }
            }
          });
        }
      }
    } catch(e){ console.warn('select-all / mark mapping error', e); }
  }

  // --- new: restore table / reload when markInput cleared ---
  (function wireRobustClearRestore(){
    const mi = (typeof markInput !== 'undefined' && markInput) ? markInput : document.getElementById('markInput');
    if (!mi) return;

    let t = null;
    let lastVal = mi.value || '';

    function restoreAllRowsAndUi(){
      try {
        if (window.jQuery && jQuery.fn && jQuery.fn.dataTable) {
          try {
            const dt = $('.summary-table').DataTable();
            dt.search('').columns().search('').draw();
            try {
              dt.rows().nodes().to$().each(function(){ this.style.display = ''; });
            } catch(e){ /* ignore */ }
            try { dt.columns.adjust().draw(false); } catch(e){ /* ignore */ }
          } catch(e) {
            console.warn('DataTables restore failed, falling back to DOM restore', e);
            document.querySelectorAll('.summary-table tbody tr').forEach(tr => tr.style.display = '');
          }
        } else {
          document.querySelectorAll('.summary-table tbody tr').forEach(tr => tr.style.display = '');
        }

        const selectAll = document.getElementById('selectAll') || document.querySelector('.summary-table thead input[type="checkbox"]#selectAll');
        if (selectAll) selectAll.checked = false;

        const evt = new Event('tableRestored');
        document.querySelectorAll('.summary-table').forEach(t => t.dispatchEvent(evt));
      } catch(err){
        console.warn('restoreAllRowsAndUi failed', err);
      }
    }


document.addEventListener('DOMContentLoaded', function(){
  try {
    const m = document.getElementById('summaryModal');
    if(m && (m.style.display === 'flex' || getComputedStyle(m).display !== 'none')){
      // small timeout to let template-rendered inner HTML settle
      setTimeout(()=>{ try { prefillSummaryModal(); } catch(e){ console.warn(e); } }, 40);
    }
  } catch(e){ /* ignore */ }
});
    function maybeRestore(){
      clearTimeout(t);
      t = setTimeout(()=>{
        try {
          const v = (mi.value || '').trim();
          if (v === '' && (lastVal && lastVal.trim() !== '')) {
            try {
              if (typeof INITIAL_MARK !== 'undefined' && INITIAL_MARK && INITIAL_MARK.trim() !== '') {
                const cur = new URL(window.location.href);
                if (cur.searchParams.has('mark') || cur.searchParams.has('force_edit')) {
                  window.location = SEARCH_BASE_URL;
                  return;
                }
              }
            } catch(e){ /* ignore URL errors and fallthrough to client restore */ }

            restoreAllRowsAndUi();
          }
          lastVal = v;
        } catch(e){
          console.warn(e);
        }
      }, 150);
    }

    mi.addEventListener('input', maybeRestore);
    mi.addEventListener('keyup', maybeRestore);
    mi.addEventListener('paste', function(){ setTimeout(maybeRestore, 50); });
    mi.addEventListener('cut', function(){ setTimeout(maybeRestore, 50); });
    mi.addEventListener('blur', maybeRestore);

    let pollInterval = null;
    try {
      pollInterval = setInterval(() => {
        const current = (mi.value || '').trim();
        if (current !== (lastVal || '').trim()) {
          maybeRestore();
        }
      }, 300);

      window.addEventListener('beforeunload', () => {
        if (pollInterval) clearInterval(pollInterval);
      });
    } catch(e){
    }
  })();

  // ----- SCRAPER integration: auto call endpoint when URL provided and show modal -----
  // Add a handler: when receipts switch ON and user submits form -> call /api/scrape_receipt and show modal
  // ====================== RECEIPTS SCRAPE FLOW ======================
document.getElementById('markSearchForm')?.addEventListener('submit', async function (evt) {
  if (useReceiptsSwitch && useReceiptsSwitch.checked) {

    // --- de-dupe receipts submit (scrape) ---
    // --- de-dupe receipts submit (scrape) ---
  const form = evt.currentTarget;
  if (form && form.dataset.receiptsSubmitting === '1') {
    evt.preventDefault();
    return;
  }
  if (form) form.dataset.receiptsSubmitting = '';
  if (form) form.dataset.receiptsSubmitting = '1';

evt.preventDefault();
    const url = (urlInput && urlInput.value) ? urlInput.value.trim() : '';
    if (!url) {
      showFlash('Εισάγετε URL για αποδείξεις.', 'error');
      return;
    }
    
    // Έλεγχος: Αν είναι 15ψήφιο MARK αντί για URL, απόρριψη
    if (/^\d{15}$/.test(url)) {
      showFlash('Για αποδείξεις, εισάγετε μόνο URL (όχι 15ψήφιο MARK). Το MARK χρησιμοποιείται μόνο για τιμολόγια.', 'error', 7000);
      if (form) form.dataset.receiptsSubmitting = ''; // reset flag
      return;
    }
    
    // Έλεγχος: Αν δεν μοιάζει με URL, απόρριψη
    if (!/^https?:\/\//i.test(url) && !/^www\./i.test(url)) {
      showFlash('Παρακαλώ εισάγετε έγκυρο URL αποδείξεων (π.χ. https://...)','error', 6000);
      if (form) form.dataset.receiptsSubmitting = ''; // reset flag
      return;
    }

    try {
      const res = await fetchWithOverlay('/api/scrape_receipt', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ url: url })
      }, 'Λήψη Απόδειξης', 'Παρακαλώ περιμένετε - ανάκτηση δεδομένων από το URL...');

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) {
        const msg = j && (j.error || j.message) ? (j.error || j.message) : ('Server ' + (res.status || ''));
        showFlash('Σφάλμα scraper: ' + msg, 'error', 6000);
        return;
      }

      if (j && j.is_invoice === true) {
  openReceiptWarning('Το URL φαίνεται να περιέχει Τιμολόγιο — δεν θα αποθηκευτεί ως Απόδειξη. Έλεγξε το παραστατικό.');
  return; // STOP
        }
        // ---- Έλεγχος έτους απόδειξης vs ενεργή χρήση (modal + STOP)
try {
  // 1) Πάρε ενεργή χρήση από ACTIVE_YEAR ή από το backend (fallback)
  const activeYear = await getActiveFiscalYear();

  // 2) Εξήγαγε issueYear από την απόκριση του scraper
  let issueYear = null;
  if (j && j.issue_year != null && String(j.issue_year).trim() !== '') {
    // δέξου είτε καθαρό έτος είτε π.χ. "2025"
    const m = String(j.issue_year).match(/\b(19|20)\d{2}\b/);
    issueYear = m ? m[0] : String(j.issue_year);
  } else if (j) {
    const anyDate = j.issue_date || j.issueDate || j.date || '';
    if (typeof anyDate === 'string') {
      const m = anyDate.match(/\b(19|20)\d{2}\b/);
      if (m) issueYear = m[0];
    }
  }

  // 3) Αν δεν ταιριάζουν -> δείξε modal και σταμάτα
  if (activeYear && issueYear && String(issueYear) !== String(activeYear)) {
    openReceiptWarning(`Προσοχή: Η απόδειξη είναι του ${issueYear}, ενώ η ενεργή χρήση είναι ${activeYear}. Η διαδικασία μπλοκάρεται.`);
    return; // STOP
  }
} catch (_) {
  /* αν αποτύχει ο έλεγχος, δεν μπλοκάρουμε σιωπηλά */
}


      // Δημιουργία αυξανόμενου MARK 15 ψηφίων (από το backend)
      const markRes = await fetch('/api/next_receipt_mark', { credentials: 'same-origin' });
      const markData = await markRes.json().catch(() => null);
      const nextMark = (markData && markData.mark) ? markData.mark : '';

      // Prepare summary object για modal
      const summaryObj = {
        mark: nextMark,
        AA: j.progressive_aa || '',
        AFM_issuer: j.issuer_vat || '',
        Name: j.issuer_name || '',
        issueDate: j.issue_date || '',
        type_name: 'ΑΠΟΔΕΙΞΗ',
        totalValue: j.total_amount || '',
        totalNetValue: j.total_amount || '',
        totalVatAmount: (j.raw && (j.raw.totalVatAmount || j.raw.totalVat)) || '',
        lines: []
      ,
  type: 'ΑΠΟΔΕΙΞΗ',
  category: 'αποδειξακια',
  is_receipt: true,
  number: (j.progressive_aa || '')};

      // Έλεγχος: Αν δεν υπάρχει issuer_name, κάλεσε VAT validator
      if (!summaryObj.Name && summaryObj.AFM_issuer) {
        try {
          console.log('Missing issuer_name, calling VAT validator for:', summaryObj.AFM_issuer);
          const vatResp = await fetch('/api/get_vat_name', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({ vat: summaryObj.AFM_issuer })
          });
          
          if (vatResp.ok) {
            const vatData = await vatResp.json();
            if (vatData.ok && vatData.name) {
              summaryObj.Name = vatData.name;
              console.log('VAT validator returned name:', vatData.name);
              showFlash(`Βρέθηκε επωνυμία από VAT validator: ${vatData.name}`, 'info', 4000);
            }
          }
        } catch (vatErr) {
          console.warn('VAT validator failed:', vatErr);
          // Συνέχισε χωρίς όνομα - ο χρήστης μπορεί να το προσθέσει χειροκίνητα
        }
      }

      if (j.raw && Array.isArray(j.raw.lines) && j.raw.lines.length) {
        j.raw.lines.forEach((l, idx) => {
          summaryObj.lines.push({
            id: l.id || ('r' + idx),
            amount: l.amount || l.lineTotal || '',
            vat: l.vat || l.vatRate || '',
            vatCategory: l.vatCategory || l.vat_category || '',
            description: l.description || l.desc || ''
          });
        });
      } else {
        summaryObj.lines.push({
          id: 'r0',
          amount: j.total_amount || '',
          vat: (j.raw && (j.raw.vat || '')) || '',
          vatCategory: (j.raw && (j.raw.vatCategory || '')) || '',
          description: (j.raw && (j.raw.description || '')) || ''
        });
      }

      // Populate modal inputs
      const summaryInput = document.getElementById('summaryJsonInput');
      if (summaryInput) summaryInput.value = JSON.stringify(summaryObj);


      document.getElementById('scrapeUrlField')?.setAttribute('value', url);
      const desiredCat = CUSTOMER_CATEGORIES.includes('αποδειξακια')
        ? 'αποδειξακια'
        : (CUSTOMER_CATEGORIES[0] || '');
      document.getElementById('scrapeCategoryField')?.setAttribute('value', desiredCat);
      document.getElementById('scrapeForceField')?.setAttribute('value', 'false');

      // Ενημέρωση modal
      const modal = document.getElementById('summaryModal');
      if (modal) {
        // ensure populate code runs (some populate watchers poll or listen for modal display)
        // prefer calling RC_forcePopulateSummaryModal if present
        if (window.RC_forcePopulateSummaryModal) {
          try { window.RC_forcePopulateSummaryModal(); } catch(e){ console.warn('RC_forcePopulateSummaryModal failed', e); }
        }
        if (!(window.__RC_FLAGS && window.__RC_FLAGS.autoHandled)) { modal.style.display = 'flex'; }
        if (!(window.__RC_FLAGS && window.__RC_FLAGS.autoHandled)) { showFlash('Λήφθηκε απόδειξη — ελέγξτε τα στοιχεία και πατήστε "Αποθήκευση στο Cache".', 'success', 5000); }
      }

    } catch (err) {
      console.error('scrape_receipt error', err);
      showFlash('Σφάλμα scraper: ' + (err.message || err), 'error', 6000);
    }
  }
});


  // Intercept "Αποθήκευση στο Cache" to perform AJAX save for scraped receipts
  // intercept saveSummaryForm submit when scrapeUrlField is present
// --- replace the previous payload construction + fetch with this robust version ---
document.getElementById('saveSummaryForm')?.addEventListener('submit', async function(e){
  const scrapeUrl = document.getElementById('scrapeUrlField')?.value || '';
  if(!scrapeUrl) return; // let normal (invoice) flow proceed
  e.preventDefault();

  let summary = {};
  try {
    summary = JSON.parse(document.getElementById('summaryJsonInput').value || '{}');
  } catch(err){
    console.warn('Failed parsing summaryJsonInput', err);
    await showModalAlert('Σφάλμα', 'Άκυρα δεδομένα παραστατικού.');
    return;
  }

  summary.is_receipt = true;
  if (!summary.category || String(summary.category).trim() === '') summary.category = 'αποδειξακια';
  if (!summary.type || String(summary.type).trim() === '') summary.type = 'ΑΠΟΔΕΙΞΗ';
  if (!summary.type_name || String(summary.type_name).trim() === '') summary.type_name = 'Απόδειξη';

  const aaCoalesce = summary.number || summary.AA || summary.aa || summary.progressive_aa || '';
  summary.number = aaCoalesce;

  if (!Array.isArray(summary.lines)) summary.lines = [];
  summary.lines = summary.lines.map((l, i) => ({
    id: (l && (l.id || l.line_id)) ? String(l.id || l.line_id) : ('r' + i),
    description: (l && (l.description || l.desc)) || '',
    amount: (l && (l.amount || l.lineTotal || l.total)) || '',
    vat: (l && (l.vat || l.vatRate)) || '',
    vatCategory: (l && (l.vatCategory || l.vat_category)) || '',
    category: (l && l.category) || ''
  }));

  try {
    // Merge live component state (`summaryDataInput`) so MTYPE selections from
    // the modal/component are not lost when we POST JSON directly.
    try {
      const compEl = document.getElementById('summaryDataInput');
      if (compEl && compEl.value && String(compEl.value).trim() !== '') {
        const comp = JSON.parse(compEl.value || '{}') || {};
        if (comp && typeof comp === 'object') {
          if (comp.mtype) summary.mtype = comp.mtype;
          if (comp.receipt_mtype) summary.receipt_mtype = comp.receipt_mtype;
          if (comp.invoice_mtype) summary.invoice_mtype = comp.invoice_mtype;
          if (comp.receiptMtype) summary.receipt_mtype = comp.receiptMtype;
          if (comp.invoiceMtype) summary.invoice_mtype = comp.invoiceMtype;
          if (comp.lines) summary.lines = comp.lines;
        }
      }
    } catch (e) { console.warn('merge summaryDataInput -> summary failed', e); }
    const res = await fetchWithOverlay('/save_summary', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(summary)
    }, 'Αποθήκευση Παραστατικού', 'Παρακαλώ περιμένετε - αποθήκευση δεδομένων...');
    if (!res.ok) {
      const t = await res.text().catch(()=>'');
      await showModalAlert('Σφάλμα', 'Αποτυχία αποθήκευσης (HTTP ' + res.status + '): ' + t);
      return;
    }
    try { hideSummaryModal(); } catch(_) {}
    window.location = window.location.pathname;
  } catch (err) {
    console.error('save_summary AJAX error', err);
    await showModalAlert('Σφάλμα', 'Σφάλμα αποθήκευσης: ' + (err.message || err));
  }
});

document.getElementById('saveSummaryForm')?.addEventListener('submit', async function(e){
  const scrapeUrl = document.getElementById('scrapeUrlField')?.value || '';
  if(!scrapeUrl) {
    // Invoice flow - προσθήκη payment validation (για repeat και non-repeat)
    e.preventDefault();
    
    let summary = {};
    try {
      summary = JSON.parse(document.getElementById('summaryJsonInput').value || '{}');
    } catch(err){
      console.warn('Failed parsing summaryJsonInput for validation', err);
      // Άφησε το να προχωρήσει στο server
      try{ showLoadingOverlay('Αποθήκευση', 'Παρακαλώ περιμένετε - αποστολή στο server...'); }catch(e){}
      e.target.submit();
      return;
    }
    
    // Έλεγχος για Γ Κατηγορία και MTYPE
    // Use invoiceMtypeSelect as a defensive fallback when window.G_CATEGORY_DATA
    // is not available (some pages initialise the dropdown but not the global).
    const invoiceSelectEl = document.getElementById('invoiceMtypeSelect');
    const fallbackMtypeOptions = invoiceSelectEl ? Array.from(invoiceSelectEl.options).map(o => ({ value: o.value, label: (o.textContent || '').trim() })) : [];

    const isGCategory = (
      (window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.mtype_options && window.G_CATEGORY_DATA.mtype_options.length > 0)
      || (fallbackMtypeOptions.length > 0)
    );

    const isReceipt = summary.is_receipt === true || /αποδει/i.test(`${summary.type_name || ''} ${summary.category || summary.characteristic || ''}`);

    console.debug('saveSummaryForm: G-check', { isGCategory, isReceipt, fallbackMtypeOptions: fallbackMtypeOptions.length, summaryMark: summary.mark });

    // Έλεγχος αν έχει επαναληψιμή εισαγωγή ενεργοποιημένη
    const repeatEnabled = !!document.getElementById('repeatEntrySwitch')?.checked;
    
    // Αν είναι τιμολόγιο με MTYPE (repeat ή όχι), κάνε validation
    // Ανανέωση του summary από το DOM για να πάρουμε το τελευταίο MTYPE
    if (typeof updateSummaryFromDom === 'function') {
      updateSummaryFromDom();
      // Re-read summary after update
      try {
        summary = JSON.parse(document.getElementById('summaryJsonInput').value || '{}');
      } catch(err) {
        console.warn('Failed to re-parse summary after DOM update', err);
      }
    }

    // FORCE-SYNC fallback: if legacy hidden input lacks mtype, take value
    // directly from any visible invoice/receipt MTYPE selects inside the modal
    try {
      const legacyInputEl = document.getElementById('summaryJsonInput');
      const invoiceSelectEl = document.getElementById('invoiceMtypeSelect');
      const receiptSelectEl = document.getElementById('receiptMtypeSelectSummary');
      let forced = false;
      if (legacyInputEl) {
        let parsed = {};
        try { parsed = JSON.parse(legacyInputEl.value || '{}') || {}; } catch(_) { parsed = {}; }
        if (!parsed.mtype && invoiceSelectEl && invoiceSelectEl.value) {
          parsed.mtype = invoiceSelectEl.value;
          parsed.invoice_mtype = invoiceSelectEl.value;
          forced = true;
        }
        if (!parsed.receipt_mtype && receiptSelectEl && receiptSelectEl.value) {
          parsed.receipt_mtype = receiptSelectEl.value;
          parsed.mtype = parsed.mtype || receiptSelectEl.value;
          forced = true;
        }
        if (forced) {
          legacyInputEl.value = JSON.stringify(parsed);
          try { summary = JSON.parse(legacyInputEl.value || '{}'); } catch(_){}
          console.debug('saveSummaryForm: forced-sync MTYPE from selects', { mtype: parsed.mtype, invoice_mtype: parsed.invoice_mtype, receipt_mtype: parsed.receipt_mtype });
        }
      }
    } catch (syncErr) {
      console.warn('saveSummaryForm: forced mtype sync failed', syncErr);
    }

    // Determine the currently chosen mtype.  `updateSummaryFromDom` has
    // just been called above, but in case it doesn't exist or fails we still
    // want to read the actual dropdown value – the DOM is authoritative.
    const invoiceSelectEl2 = document.getElementById('invoiceMtypeSelect');
    let selectedMtype = '';
    if (invoiceSelectEl2 && invoiceSelectEl2.value) {
      selectedMtype = String(invoiceSelectEl2.value).trim();
    } else {
      selectedMtype = String(summary.mtype || summary.invoice_mtype || '').trim();
    }
    
    // Defensive fallback check: if the page exposes movement types (invoice select)
    // but `isGCategory` detection fails, still run the cash->article pre-check.
    try {
      const paymentMethodType = String(summary.paymentMethodType || '').trim();
      const invoiceSelectEl = document.getElementById('invoiceMtypeSelect');
      const movementTypesFallback = invoiceSelectEl ? Array.from(invoiceSelectEl.options).map(o=>({ value: o.value, label: o.textContent||'' })) : [];
      const movementTypesAny = (window.G_CATEGORY_DATA && Array.isArray(window.G_CATEGORY_DATA.mtype_options) && window.G_CATEGORY_DATA.mtype_options.length)
        ? window.G_CATEGORY_DATA.mtype_options
        : movementTypesFallback;
      const cashOpt = (movementTypesAny || []).find(mt => {
        const lbl = String((mt && (mt.label || mt.text || '')) || '').toLowerCase();
        return lbl.includes('αγορ') && lbl.includes('εξοδ') && lbl.includes('ταμει');
      }) || null;
      let cashMtypeCodeFallback = '';
      if (window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.cash_mtype_code) {
        cashMtypeCodeFallback = String(window.G_CATEGORY_DATA.cash_mtype_code).trim();
      } else {
        cashMtypeCodeFallback = String((cashOpt && (cashOpt.value || cashOpt.key)) || '').trim() || '';
      }
      console.debug('fallback cash-check values', { selectedMtype, cashMtypeCodeFallback, equal: selectedMtype === cashMtypeCodeFallback });

      if (!isReceipt && paymentMethodType === '3' && selectedMtype && !selectedMtype.includes('.') && selectedMtype !== cashMtypeCodeFallback && movementTypesAny.length) {
        console.debug('saveSummaryForm: fallback client-side cash pre-check (will prompt)', { selectedMtype, cashMtypeCodeFallback, movementTypesAnyCount: movementTypesAny.length });
        const userChoice = confirm(
          `Το παραστατικό έχει τρόπο πληρωμής «Μετρητά», αλλά το επιλεγμένο Είδος Κίνησης δεν είναι το συνιστώμενο ταμειακό κίνημα (${cashMtypeCodeFallback || '—'}).\nΘες να το αλλάξω αυτόματα;` 
        );
        if (userChoice && cashMtypeCodeFallback) {
          const mtypeSelect = document.getElementById('invoiceMtypeSelect');
          if (mtypeSelect) {
            mtypeSelect.value = cashMtypeCodeFallback;
            mtypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
          try {
            const legacyInput = document.getElementById('summaryJsonInput');
            if (legacyInput) {
              const parsed = JSON.parse(legacyInput.value || '{}') || {};
              parsed.mtype = cashMtypeCodeFallback; parsed.invoice_mtype = cashMtypeCodeFallback;
              legacyInput.value = JSON.stringify(parsed);
            }
          } catch(e){ console.warn('fallback override update failed', e); }
          // update component state too
          if (typeof updateSummaryFromDom === 'function') {
            try { updateSummaryFromDom(); } catch(e){ console.warn('fallback updateSummaryFromDom failed', e); }
          }
          } catch (e) { console.warn('fallback apply mtype failed', e); }
        }
      }
    } catch (fallbackErr) {
      console.warn('saveSummaryForm: fallback pre-check error', fallbackErr);
    }
    
    console.debug('saveSummaryForm: pre-validate', { paymentMethodType: summary.paymentMethodType, selectedMtype: selectedMtype, hasAFM: !!(summary.AFM_issuer || summary.AFM) });

    if (isGCategory && !isReceipt && selectedMtype && summary.mark && (summary.AFM_issuer || summary.AFM)) {
      console.debug('saveSummaryForm: entering validation branch', { isGCategory, isReceipt, selectedMtype, paymentMethodType: summary.paymentMethodType });

      // CLIENT-SIDE FAILSAFE: if paymentMethodType is cash (3) and the selected
      // MTYPE is an article-style code different from the configured cash
      // article-code, show the confirmation modal immediately so the user can
      // change it without waiting for server validation (covers race/missing
      // server-response cases).
      try {
        const paymentMethodType = String(summary.paymentMethodType || '').trim();
        selectedMtype = String(selectedMtype || '').trim();
        const movementTypes = (window.G_CATEGORY_DATA && Array.isArray(window.G_CATEGORY_DATA.mtype_options) && window.G_CATEGORY_DATA.mtype_options.length)
          ? window.G_CATEGORY_DATA.mtype_options
          : (invoiceSelectEl ? Array.from(invoiceSelectEl.options).map(o=>({value:o.value,label:o.textContent||''})) : []);

        // prefer server-provided cash MTYPE code/label if available
        let cashMtypeCode = '';
        let cashMtypeLabel = '';
        if (window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.cash_mtype_code) {
          cashMtypeCode = String(window.G_CATEGORY_DATA.cash_mtype_code).trim();
          cashMtypeLabel = String(window.G_CATEGORY_DATA.cash_mtype_label || '').trim() || cashMtypeCode;
        } else {
          const cashMtypeOption = (movementTypes || []).find(mt => {
            const lbl = String((mt && (mt.label || mt.text || mt.t || '')) || '').toLowerCase();
            return lbl.includes('αγορ') && lbl.includes('εξοδ') && lbl.includes('ταμει');
          }) || null;
          cashMtypeCode = String((cashMtypeOption && (cashMtypeOption.value || cashMtypeOption.key)) || '').trim() || '16';
          cashMtypeLabel = String((cashMtypeOption && (cashMtypeOption.label || cashMtypeOption.text)) || 'Αγορών - Εξόδων Ταμειακή');
        }

        console.debug('saveSummaryForm: cash-precheck values', { paymentMethodType, selectedMtype, cashMtypeCode, equal: selectedMtype === cashMtypeCode });
        if (paymentMethodType === '3' && selectedMtype && selectedMtype !== cashMtypeCode) {
          console.debug('saveSummaryForm: client-side cash pre-check triggered', { selectedMtype, cashMtypeCode });
          const useCashNow = await showModalConfirm(
            'Προειδοποίηση Τρόπου Πληρωμής',
            `Το παραστατικό έχει τρόπο πληρωμής «Μετρητά», αλλά το επιλεγμένο Είδος Κίνησης δεν είναι «${cashMtypeLabel}» (${cashMtypeCode}).\n\nΘέλεις να το αλλάξω τώρα αυτόματα;\n\n- OK: Αλλαγή τώρα σε «${cashMtypeLabel}»\n- Άκυρο: Συνέχεια με το τρέχον Είδος Κίνησης`,
            'Αλλαγή τώρα',
            'Συνέχεια έτσι'
          );

          if (useCashNow) {
            // Apply immediately to UI and hidden input so subsequent flows see it
            const mtypeSelect = document.getElementById('invoiceMtypeSelect');
            if (mtypeSelect) {
              mtypeSelect.value = cashMtypeCode;
              mtypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const summaryInput = document.getElementById('summaryJsonInput');
            if (summaryInput) {
              try {
                const s = JSON.parse(summaryInput.value || '{}') || {};
                s.mtype = cashMtypeCode;
                s.invoice_mtype = cashMtypeCode;
                summaryInput.value = JSON.stringify(s);
                selectedMtype = cashMtypeCode;
                localStorage.setItem('saved_invoice_mtype', cashMtypeCode);
                try { scheduleSummaryRefresh(200); } catch(_) {}
                console.debug('saveSummaryForm: applied cash mtype override', cashMtypeCode);
              } catch (e) { console.warn('Failed to apply cash mtype override', e); }
            }
            // ensure component state updated too
            if (typeof updateSummaryFromDom === 'function') {
              try { updateSummaryFromDom(); } catch(e){ console.warn('post-change updateSummaryFromDom failed', e); }
            }
          }
        }
      } catch (preErr) {
        console.warn('saveSummaryForm: cash pre-check failed', preErr);
      }

      try {
        const validationResp = await fetch('/api/validate_payment_mtype', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          credentials: 'same-origin',
          body: JSON.stringify({
            mark: summary.mark,
            vat: summary.AFM_issuer || summary.AFM,
            selected_mtype: selectedMtype
          })
        });
        
        if (validationResp.ok) {
          const validationData = await validationResp.json();
          if (validationData.warning) {
            if (validationData.special_case) {
              const expected = (validationData.expected_mtype && validationData.expected_mtype.code) || '';
              const expectedLabel = (validationData.expected_mtype && validationData.expected_mtype.label) || expected;
              const userChoice = confirm(
                validationData.warning + '\n\n' +
                `Επιλέξτε:\n- OK: Αλλαγή σε ${expectedLabel} (${expected})\n- Ακύρωση: Συνέχεια με ${selectedMtype}`
              );
              if (userChoice && expected) {
                const mtypeSelect = document.getElementById('invoiceMtypeSelect');
                if (mtypeSelect) mtypeSelect.value = expected;
                const summaryInput = document.getElementById('summaryJsonInput');
                if (summaryInput) {
                  try {
                    const s = JSON.parse(summaryInput.value || '{}') || {};
                    s.mtype = expected;
                    s.invoice_mtype = expected;
                    summaryInput.value = JSON.stringify(s);
                    localStorage.setItem('saved_invoice_mtype', expected);
                  } catch (e) {
                    console.warn('Failed to apply expected mtype from validation', e);
                  }
                }
              }
              // Συνέχεια με την αποθήκευση
            } else {
              // Κανονικό warning
              const userConfirmed = confirm(validationData.warning);
              if (!userConfirmed) {
                return; // Ματαίωση αποθήκευσης
              }
            }
          }
        }
      } catch (validationErr) {
        console.warn('Payment validation failed:', validationErr);
      }
    }
    
    // Προχώρα στην κανονική server αποθήκευση
    try{ showLoadingOverlay('Αποθήκευση', 'Παρακαλώ περιμένετε - αποστολή στο server...'); }catch(e){}
    e.target.submit();
    return;
  }
  
  // Receipt flow
  e.preventDefault();

  // parse summary from hidden input
  let summary = {};
  try {
    summary = JSON.parse(document.getElementById('summaryJsonInput').value || '{}');
  } catch(err){
    console.warn('Failed parsing summaryJsonInput', err);
    showFlash('Σφάλμα: άκυρα δεδομένα παραστατικού.', 'error');
    return;
  }

  // robust AFM extraction (try many variants)
  const afmFromSummary = (summary && (summary.AFM_issuer || summary.AFM || summary.issuer_vat || summary.issuerVat || summary.issuer_vat)) ||
                         (summary && summary.raw && (summary.raw.issuer_vat || summary.raw.issuerVat || summary.raw.AFM || summary.raw.AFM_issuer));
  const afmVal = (typeof VAT !== 'undefined' && VAT) ? VAT : (afmFromSummary ? String(afmFromSummary).trim() : '');

  // robust year extraction: prefer ACTIVE_YEAR, then summary.year, then parse issueDate, then fallback to current year
  let yearVal = null;
  try {
    if (typeof ACTIVE_YEAR !== 'undefined' && ACTIVE_YEAR) yearVal = String(ACTIVE_YEAR);
    else if (summary && (summary.year || summary.Year)) yearVal = String(summary.year || summary.Year);
    else if (summary && summary.issueDate) {
      const parts = (summary.issueDate || '').split('/');
      if (parts.length >= 3) yearVal = parts[2];
    }
    if (!yearVal) yearVal = String((new Date()).getUTCFullYear());
  } catch(e){
    yearVal = String((new Date()).getUTCFullYear());
  }

  // final mark
  const markVal = summary.mark || document.getElementById('scrapeUrlField')?.dataset.mark || '';

  // if afm missing -> abort with client message (server requires AFM or active session)
  if (!afmVal) {
    console.warn('confirm_receipt abort: missing AFM', { summary });
    showFlash('Αδύνατο να αποθηκευτεί: λείπει AFM του ενεργού πελάτη. Επιλέξτε ενεργό πελάτη ή βεβαιωθείτε ότι το παραστατικό περιέχει ΑΦΜ.', 'error', 7000);
    return;
  }

  const payload = {
    url: scrapeUrl,
    summary: summary,
    force: (document.getElementById('scrapeForceField')?.value === 'true'),
    category: 'αποδειξακια',
    afm: afmVal,
    year: String(yearVal),
    mark: (summary.mark || markVal || '')
  };

  console.log('[RC-DEBUG] FETCH -> /api/confirm_receipt called', '/api/confirm_receipt', payload);

  // send to backend
  try {
    const res = await fetch('/api/confirm_receipt', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(payload)
    });
    const j = await res.json().catch(()=>null);
    if(!res.ok || !j || !j.ok){
      console.warn('confirm_receipt failed', res.status, j);
      const errMsg = 'Σφάλμα αποθήκευσης: ' + ((j && j.error) ? j.error : ('Server ' + (res.status || '')));
      showFlash(errMsg, 'error', 7000);
      persistReceiptFlash(errMsg, 'error');
      return;
    }
    const successMsg = 'Αποθηκεύτηκε η απόδειξη (excel + json).';
    showFlash(successMsg, 'success');
    persistReceiptFlash(successMsg, 'success');
    hideSummaryModal();
    // clean hidden fields
    document.getElementById('scrapeUrlField').value = '';
    document.getElementById('scrapeForceField').value = 'false';
  } catch(err){
    console.error('confirm_receipt fetch error', err);
    const errMsg = 'Σφάλμα δικτύου κατά την αποθήκευση.';
    showFlash(errMsg, 'error');
    persistReceiptFlash(errMsg, 'error');
  }
});

// --- Fix: on page load, populate modal if summaryJsonInput already contains summary JSON ---
// This replaces a missing populateSummaryModal call and uses the populate watcher (RC_forcePopulateSummaryModal) if available.
// Robust startup: only show summary modal if summaryJsonInput actually contains meaningful data
document.addEventListener("DOMContentLoaded", function(){
  try {
    const summaryEl = document.getElementById("summaryJsonInput");
    const modal = document.getElementById("summaryModal");
    if (!summaryEl) return;

    let obj = {};
    try { obj = JSON.parse(summaryEl.value || '{}'); } catch(e){ obj = {}; }

    function isMeaningful(o){
      if (!o || typeof o !== 'object') return false;

      // quick acceptors: important single fields
      const important = ['mark','MARK','AFM_issuer','AFM','totalValue','totalNetValue','total_amount','issueDate','issue_date','progressive_aa','AA'];
      for (const k of important) {
        if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return true;
      }

      // if lines array exists and has at least one line with some non-empty field -> accept
      if (Array.isArray(o.lines) && o.lines.length) {
        for (const ln of o.lines) {
          if (!ln) continue;
          if ( (ln.description && String(ln.description).trim() !== '') ||
               (ln.amount && String(ln.amount).trim() !== '') ||
               (ln.id && String(ln.id).trim() !== '') ) return true;
        }
      }

      // fallback: if object has more than one non-empty key -> accept
      const nonEmptyKeys = Object.keys(o).filter(k => {
        try { return o[k] !== null && o[k] !== undefined && String(o[k]).trim() !== ''; } catch(e){ return false; }
      });
      if (nonEmptyKeys.length > 1) return true;

      return false;
    }

    if (isMeaningful(obj)) {
      // ask the populate watcher to run (if available), else run a safe local populate
      if (window.RC_forcePopulateSummaryModal) {
        try { window.RC_forcePopulateSummaryModal(); } catch(e){ console.warn('RC_forcePopulateSummaryModal failed', e); }
      } else {
        // try to populate basic fields if populate function not present
        try {
          if (typeof populateSummaryModal === 'function') try { populateSummaryModal(obj); } catch(_) {}
        } catch(_) {}
      }

      if (modal) if (!(window.__RC_FLAGS && window.__RC_FLAGS.autoHandled)) { modal.style.display = 'flex'; }
    } else {
      // ensure modal remains hidden on load
      if (modal) modal.style.display = 'none';
    }
  } catch(e){
    console.warn('startup populate summary failed', e);
  }
});



  // This expects rows to have 'input[type="radio"][name="active_name"]' and row id pattern cred-row-<name>
  document.querySelectorAll('tr[id^="cred-row-"]').forEach(tr=>{
    tr.addEventListener('dblclick', function(e){
      try {
        const radio = tr.querySelector('input[type="radio"][name="active_name"]');
        if(radio){
          radio.checked = true;
          // also give visual feedback (optional)
          tr.classList.add('bg-gray-100');
          setTimeout(()=>tr.classList.remove('bg-gray-100'), 600);
        }
      } catch(err){ console.warn('dblclick select radio failed', err); }
    });
  });

});

// διαβάζει το mapping από τα 5 select του modal
function readMappingFromUI(){
  const out = {};
  document.querySelectorAll('#repeatMappingList select[data-vat]').forEach(sel=>{
    out[sel.dataset.vat] = sel.value || '';
  });
  return out;
}
// === DEBUG SNIPPET: paste near end of your existing scripts ===
(function(){
  function safeLog(...a){ try{ console.log('[RC-DEBUG]', ...a); }catch(e){} }

  // Global JS error catcher
  window.addEventListener('error', function(e){
    safeLog('Window error', e.message, e.filename + ':' + e.lineno, e.error);
  });
  window.addEventListener('unhandledrejection', function(ev){
    safeLog('Unhandled promise rejection', ev.reason);
  });

  // Watch important DOM elements existence
  function checkDom(){
    const names = [
      'markSearchForm','useReceiptsSwitch','scrapeUrlInput',
      'summaryModal','summaryJsonInput','saveSummaryForm',
      'scrapeUrlField','scrapeCategoryField','scrapeForceField'
    ];
    const out = {};
    names.forEach(n => out[n] = !!document.getElementById(n));
    safeLog('DOM presence', out);
  }
  document.addEventListener('DOMContentLoaded', function(){ checkDom(); });

  // Hook markSearchForm submit
  const msf = document.getElementById('markSearchForm');
  if(msf){
    msf.addEventListener('submit', function(e){
      try{
        const useReceipts = !!(document.getElementById('useReceiptsSwitch') && document.getElementById('useReceiptsSwitch').checked);
        safeLog('markSearchForm.submit fired', 'useReceipts=', useReceipts, 'mark=', (document.getElementById('markInput')?.value||''), 'urlInput=', (document.getElementById('scrapeUrlInput')?.value||''));
      }catch(err){ safeLog('submit hook error', err); }
    }, true);
  } else safeLog('markSearchForm NOT FOUND');

  // Hook receipts switch changes
  const rs = document.getElementById('useReceiptsSwitch');
  if(rs){
    rs.addEventListener('change', function(e){
      safeLog('useReceiptsSwitch change, checked=', rs.checked);
      // show/hide created url input for visibility
      const ui = document.getElementById('scrapeUrlInput');
      if(ui) ui.style.outline = rs.checked ? '2px solid orange' : 'none';
    });
  } else safeLog('useReceiptsSwitch NOT FOUND');

  // Monitor fetch to /api/scrape_receipt by wrapping fetch (only for debugging)
  const origFetch = window.fetch;
  window.fetch = async function(resource, init){
    try{
      if(typeof resource === 'string' && resource.indexOf('/api/scrape_receipt') !== -1){
        safeLog('FETCH -> /api/scrape_receipt called', resource, init && init.body ? (init.body.length>100 ? init.body.slice(0,100)+'...' : init.body) : init);
      }
      if(typeof resource === 'string' && resource.indexOf('/api/confirm_receipt') !== -1){
        safeLog('FETCH -> /api/confirm_receipt called', resource, init && init.body ? (function(){ try { return JSON.parse(init.body); } catch(e){ return init.body; } })() : init);
        // Visual cue: flash border on modal
        const m = document.getElementById('summaryModal');
        if(m) { m.style.outline = '4px dashed lime'; setTimeout(()=>{ if(m) m.style.outline=''; }, 1200); }
      }
    }catch(e){ safeLog('fetch-wrap log failed', e); }
    return origFetch.apply(this, arguments);
  };

  // Hook the saveSummaryForm submit (the interceptor should already exist in your code)
  const ssf = document.getElementById('saveSummaryForm');
  if(ssf){
    ssf.addEventListener('submit', function(e){
      try{
        // show current fields
        const summaryVal = (document.getElementById('summaryJsonInput')?.value) || null;
        const scrapeUrl = document.getElementById('scrapeUrlField')?.value || null;
        const scrapeCat = document.getElementById('scrapeCategoryField')?.value || null;
        const scrapeForce = document.getElementById('scrapeForceField')?.value || null;
        safeLog('saveSummaryForm.submit (intercept) summaryPresent=', !!summaryVal, 'scrapeUrl=', scrapeUrl, 'scrapeCat=', scrapeCat, 'scrapeForce=', scrapeForce);
        // also pretty-print JSON if small
        if(summaryVal){
          try { safeLog('summary JSON', JSON.parse(summaryVal)); } catch(e){ safeLog('summary raw', summaryVal.slice(0,500)); }
        }
      }catch(err){ safeLog('saveSummaryForm submit hook error', err); }
    }, true);
  } else safeLog('saveSummaryForm NOT FOUND');

  // When modal is shown/hidden, log it
  const observer = new MutationObserver(function(muts){
    try{
      const modal = document.getElementById('summaryModal');
      if(modal){
        const style = window.getComputedStyle(modal);
        if(style.display !== 'none'){
          safeLog('summaryModal is visible');
        } else {
          // optional: safeLog('summaryModal is hidden');
        }
      }
    }catch(e){ safeLog('mutation observer err', e); }
  });
  observer.observe(document.documentElement || document.body, { attributes: true, childList: true, subtree: true });

  // Periodic sanity check: print whether modal and form are present every 2s for 6 checks
  let checks = 0;
  const interval = setInterval(function(){
    checks++;
    const present = {
      modal: !!document.getElementById('summaryModal'),
      summaryInput: !!document.getElementById('summaryJsonInput'),
      saveForm: !!document.getElementById('saveSummaryForm'),
      urlField: !!document.getElementById('scrapeUrlField')
    };
    safeLog('periodic-dom-check', present);
    if(checks>6) clearInterval(interval);
  }, 2000);

  safeLog('RC-DEBUG injected');
})();
(function(){
  function getSummaryData(){
    const input = document.getElementById('summaryJsonInput');
    if(!input) return null;
    try {
      const data = JSON.parse(input.value || '{}');
      if(!Array.isArray(data.lines)) data.lines = [];
      return { input, data };
    } catch(e) {
      return { input, data: { lines: [] } };
    }
  }

  function saveSummaryData(obj){
    if(!obj || !obj.input) return;
    obj.input.value = JSON.stringify(obj.data);
  }

  // Click on category buttons (delegation)
  document.addEventListener('click', function(ev){
    const btn = ev.target.closest && ev.target.closest('.category-btn');
    if(!btn) return;
    ev.preventDefault();
    // prevent other handlers (the "other modal" that opened)
    try { ev.stopImmediatePropagation(); } catch(e){}
    try { ev.stopPropagation(); } catch(e){}

    const lid = btn.dataset.lineId || (btn.closest('[data-line-id]') && btn.closest('[data-line-id]').dataset.lineId) || '';
    const cat = btn.dataset.cat || '';
    if(!lid) return;

    const state = getSummaryData();
    if(!state) return;
    let { data } = state;
    let line = data.lines.find(l => String(l.id || l.line_id || '') === String(lid));
    if(!line){
      line = { id: lid, category: '' };
      data.lines.push(line);
    }

    // toggle: if already set -> clear, else set
    line.category = (String(line.category || '') === String(cat)) ? '' : String(cat);

    // update button classes for that line
    document.querySelectorAll('.category-btn[data-line-id="'+CSSescape(lid)+'"]').forEach(b=>{
      b.classList.toggle('bg-sky-600', (b.dataset.cat === line.category));
      b.classList.toggle('text-white', (b.dataset.cat === line.category));
    });

    // also update corresponding select if present
    const sel = document.querySelector('select.expense-category[data-line-id="'+CSSescape(lid)+'"]');
    if(sel) try { sel.value = line.category || ''; } catch(e){}

    saveSummaryData(state);
  }, true);

  // change on line-selects
  document.addEventListener('change', function(ev){
    const sel = ev.target;
    if(!sel || !sel.matches || !sel.matches('select.expense-category')) return;
    const lid = sel.dataset.lineId || (sel.closest('[data-line-id]') && sel.closest('[data-line-id]').dataset.lineId) || '';
    if(!lid) return;
    const state = getSummaryData();
    if(!state) return;
    let { data } = state;
    let line = data.lines.find(l => String(l.id || l.line_id || '') === String(lid));
    if(!line){
      line = { id: lid, category: '' };
      data.lines.push(line);
    }
    line.category = String(sel.value || '');
    // update any buttons
    document.querySelectorAll('.category-btn[data-line-id="'+CSSescape(lid)+'"]').forEach(b=>{
      b.classList.toggle('bg-sky-600', (b.dataset.cat === line.category));
      b.classList.toggle('text-white', (b.dataset.cat === line.category));
    });
    saveSummaryData(state);
  }, true);

  // clear button (if exists)
  document.addEventListener('click', function(ev){
    const cb = ev.target.closest && ev.target.closest('#clearCategory');
    if(!cb) return;
    ev.preventDefault();
    try { ev.stopImmediatePropagation(); } catch(e){}
    const container = cb.closest('[data-line-id]') || document;
    const lid = container && container.dataset && container.dataset.lineId ? container.dataset.lineId : '';
    if(!lid) return;
    const state = getSummaryData();
    if(!state) return;
    let { data } = state;
    let line = data.lines.find(l => String(l.id || l.line_id || '') === String(lid));
    if(!line){
      line = { id: lid, category: '' };
      data.lines.push(line);
    }
    line.category = '';
    // update UI
    document.querySelectorAll('.category-btn[data-line-id="'+CSSescape(lid)+'"]').forEach(b=>{
      b.classList.remove('bg-sky-600','text-white');
    });
    const sel = document.querySelector('select.expense-category[data-line-id="'+CSSescape(lid)+'"]');
    if(sel) sel.value = '';
    saveSummaryData(state);
  }, true);

  // Ensure hidden input is up-to-date before normal form submit
  const saveForm = document.getElementById('saveSummaryForm');
  if(saveForm){
    saveForm.addEventListener('submit', function(ev){
      // just ensure input is stringified (handlers already update it live)
      const s = getSummaryData();
      if(s) saveSummaryData(s);
      // allow normal submit (server-side will persist)
    });
  }

  // small CSS.escape fallback used above
  function CSSescape(s){
    if(window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/([ #;?%&,.+*~\':"!^$[\]()=>|\/@])/g,'\\$1');
  }
})();

(function RC_AUTO_INJECT_SUMMARY_MODAL(){
  try {
    console.log('[RC-DEBUG] periodic-dom-check starting');

    function exists(id){ return !!document.getElementById(id); }

    const needs = {
      modal: exists('summaryModal'),
      summaryInput: exists('summaryJsonInput'),
      saveForm: exists('saveSummaryForm'),
      urlField: exists('scrapeUrlField')
    };
    console.log('[RC-DEBUG] DOM presence (before inject)', needs);

    if (needs.modal && needs.summaryInput && needs.saveForm) {
      console.log('[RC-DEBUG] All required DOM elements present, no injection needed');
      return;
    }

    // Build modal HTML (minimal, matches server-side expected IDs)
    const modalHtml = `
<div id="summaryModal" class="fixed inset-0 flex items-center justify-center bg-black/40 z-50 overflow-auto p-4" style="display:none;">
  <div class="bg-white rounded-lg shadow-lg w-full max-w-6xl p-6">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Περίληψη Παραστατικού - <span id="summaryModalMark">MARK</span></h3>
      <button id="modalCloseX" class="text-gray-500 text-xl font-bold">✕</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      <div><strong>Α/Α Παραστατικού</strong><div id="summary_AA"></div></div>
      <div><strong>ΑΦΜ</strong><div id="summary_AFM"></div></div>
      <div><strong>Επωνυμία</strong><div id="summary_Name"></div></div>
      <div><strong>Ημερομηνία</strong><div id="summary_issueDate"></div></div>
      <div><strong>Τύπος Παραστατικού</strong><div id="summary_type_name"></div></div>
      <div><strong>Καθαρή Αξία</strong><div id="summary_totalNetValue"></div></div>
      <div><strong>ΦΠΑ</strong><div id="summary_totalVatAmount"></div></div>
      <div><strong>Σύνολο</strong><div id="summary_totalValue"></div></div>
    </div>

    <h4 class="font-medium mt-4 mb-2">Γραμμές Παραστατικού (για χαρακτηρισμό)</h4>
    <div id="summaryLinesContainer" class="overflow-auto max-h-96 border rounded p-2"></div>

    <div class="mt-4 flex justify-between items-center">
      <div class="text-sm text-gray-600">Σημείωση: οι κατηγορίες προέρχονται από τα settings του πελάτη.</div>
      <div class="flex justify-end gap-2">
        <form method="POST" action="{{ url_for('save_summary') }}" id="saveSummaryForm">
          <input type="hidden" name="summary_json" id="summaryJsonInput" value='{}'>
          <button type="submit" class="bg-sky-600 text-white px-3 py-2 rounded">Αποθήκευση στο Cache</button>
          <input type="hidden" id="scrapeUrlField" name="scrape_url" value="">
          <input type="hidden" id="scrapeCategoryField" name="scrape_category" value="">
          <input type="hidden" id="scrapeForceField" name="scrape_force" value="false">
        </form>
        <button id="modalCloseBtn" class="px-3 py-2 border rounded">Κλείσιμο</button>
      </div>
    </div>
  </div>
</div>`.trim();

    // Inject into document.body
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    // append at end of body so it does not break layout
    document.body.appendChild(wrapper.firstChild);

    // wire close buttons to hide modal (same behavior as original)
    function hideModal(){
      const m = document.getElementById('summaryModal');
      if (m) m.style.display = 'none';
      try { history.replaceState(null, '', location.pathname + (location.search || '') + location.hash); } catch(e){}
    }
    document.getElementById('modalCloseX')?.addEventListener('click', hideModal);
    document.getElementById('modalCloseBtn')?.addEventListener('click', hideModal);

    // Ensure modal "Save" button triggers the same client-side pre-check as
    // the saveSummaryForm submit handler. This covers cases where the modal
    // save button is used directly and the submit handler may not run.
    (function attachModalSavePrecheck(){
      try {
        // Broad listener: catch clicks on any Save-like button inside the
        // summary modal (covers different modal implementations).
        document.addEventListener('click', async function clickCapture(e){
          try {
            const btn = e.target.closest('#summaryModal button, #summaryModal input[type="submit"]');
            if (!btn) return;
            // ignore close/cancel explicitly
            if (btn.matches('.modal-summary-close, .modal-cancel-btn')) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            const text = (btn.textContent || '').trim().toLowerCase();
            const isSaveLike = btn.matches('.modal-save-btn') || btn.type === 'submit' || text.includes('αποθήκευση') || text.includes('αποθηκευση');
            if (!isSaveLike) return;

            // intercept and run pre-check before letting other handlers proceed
            e.preventDefault();
            e.stopImmediatePropagation();

            const legacyForm = document.getElementById('saveSummaryForm');
            const legacyInput = document.getElementById('summaryJsonInput');

            // If no legacy form, allow normal flow
            if (!legacyForm || !legacyInput) {
              return;
            }

            let summary = {};
            try { summary = JSON.parse(legacyInput.value || '{}') || {}; } catch(_) { summary = {}; }

            const paymentMethodType = String(summary.paymentMethodType || '').trim();
            const selectedMtype = summary.mtype || summary.invoice_mtype || document.getElementById('invoiceMtypeSelect')?.value || localStorage.getItem('saved_invoice_mtype') || '';

            // Build movement types (prefer G_CATEGORY_DATA, else invoice select)
            const invoiceSelectEl = document.getElementById('invoiceMtypeSelect');
            const movementTypesAny = (window.G_CATEGORY_DATA && Array.isArray(window.G_CATEGORY_DATA.mtype_options) && window.G_CATEGORY_DATA.mtype_options.length)
              ? window.G_CATEGORY_DATA.mtype_options
              : (invoiceSelectEl ? Array.from(invoiceSelectEl.options).map(o=>({ value:o.value, label:o.textContent||'' })) : []);

            const cashOpt = (movementTypesAny || []).find(mt => {
              const lbl = String((mt && (mt.label || mt.text || '')) || '').toLowerCase();
              return lbl.includes('αγορ') && lbl.includes('εξοδ') && lbl.includes('ταμει');
            }) || null;
            const cashCode = String((cashOpt && (cashOpt.value || cashOpt.key)) || '').trim() || '';

            // If invoice, cash payment and selected article-style MTYPE differs -> prompt
            if (!(/αποδει/i.test((summary.type_name||summary.type||'').toString().toLowerCase())) && paymentMethodType === '3' && selectedMtype && !selectedMtype.includes('.') && selectedMtype !== cashCode && movementTypesAny.length) {
              console.debug('modalSavePrecheck: prompting user', { selectedMtype, cashCode });
              const useCashNow = await showModalConfirm(
                'Προειδοποίηση Τρόπου Πληρωμής',
                `Το παραστατικό έχει τρόπο πληρωμής «Μετρητά», αλλά το επιλεγμένο Είδος Κίνησης δεν είναι «${(cashOpt && (cashOpt.label||cashOpt.text))||'Αγορών - Εξόδων Ταμειακή'}» (${cashCode}).\n\nΘέλεις να το αλλάξω τώρα αυτόματα;`,
                'Αλλαγή τώρα',
                'Συνέχεια έτσι'
              );
              if (useCashNow && cashCode) {
                const mtypeSelect = document.getElementById('invoiceMtypeSelect');
                if (mtypeSelect) mtypeSelect.value = cashCode;
                summary.mtype = cashCode; summary.invoice_mtype = cashCode; legacyInput.value = JSON.stringify(summary);
                localStorage.setItem('saved_invoice_mtype', cashCode);
              }
            }

            // finally submit the legacy form so the normal validation/save runs
            if (typeof legacyForm.requestSubmit === 'function') legacyForm.requestSubmit(); else legacyForm.submit();

          } catch (innerErr) {
            console.warn('attachModalSavePrecheck click handler failed', innerErr);
          }
        }, true);

      } catch (e) { console.warn('attachModalSavePrecheck failed', e); }
    })();

    // Re-check presence
    const needs_after = {
      modal: exists('summaryModal'),
      summaryInput: exists('summaryJsonInput'),
      saveForm: exists('saveSummaryForm'),
      urlField: exists('scrapeUrlField')
    };
    console.log('[RC-DEBUG] DOM presence (after inject)', needs_after);
    console.log('[RC-DEBUG] Auto-injection done — the client flow should now find the modal and form.');

  } catch (e) {
    console.error('[RC-DEBUG] auto-inject error', e);
  }
})();
(function RC_POPULATE_SUMMARY_MODAL(){
  try {
    console.log('[RC-DEBUG] summary-populate init');

    const summaryInput = document.getElementById('summaryJsonInput');
    const modal = document.getElementById('summaryModal');
    const markEl = document.getElementById('summaryModalMark');
    const aaEl = document.getElementById('summary_AA');
    const afmEl = document.getElementById('summary_AFM');
    const nameEl = document.getElementById('summary_Name');
    const issueEl = document.getElementById('summary_issueDate');
    const typeEl = document.getElementById('summary_type_name');
    const netEl = document.getElementById('summary_totalNetValue');
    const vatEl = document.getElementById('summary_totalVatAmount');
    const totEl = document.getElementById('summary_totalValue');
    const linesContainer = document.getElementById('summaryLinesContainer');

    if (!summaryInput) {
      console.warn('[RC-DEBUG] summaryJsonInput NOT FOUND — modal will not populate');
      return;
    }
    if (!modal) {
      console.warn('[RC-DEBUG] summaryModal NOT FOUND — abort populate watcher');
      return;
    }

    let lastVal = '';
    function safeText(node, v){
      if(!node) return;
      node.textContent = (v === null || v === undefined) ? '' : String(v);
    }

    function renderLines(lines){
      if(!linesContainer) return;
      linesContainer.innerHTML = '';
      if(!Array.isArray(lines) || lines.length === 0){
        const p = document.createElement('div'); p.className = 'p-2 text-sm text-gray-600'; p.textContent = 'Δεν βρέθηκαν γραμμές.';
        linesContainer.appendChild(p);
        return;
      }

      // Χρησιμοποιούμε τα ίδια functions που χρησιμοποιεί το server-rendered modal
      const categories = window.CUSTOMER_CATEGORIES || [];
      
      // Αν υπάρχει το buildTableHTML function (από το server-rendered modal), χρησιμοποίησέ το
      if (typeof window.buildTableHTML === 'function') {
        linesContainer.appendChild(window.buildTableHTML(lines, categories));
      } else if (typeof window.buildSingleLineHTML === 'function' && lines.length === 1) {
        linesContainer.appendChild(window.buildSingleLineHTML(lines[0], categories));
      } else {
        // Fallback: απλό table χωρίς κατηγορίες (μόνο για εμφάνιση)
        const tbl = document.createElement('table');
        tbl.className = 'w-full text-sm';
        tbl.style.borderCollapse = 'collapse';
        const isGCategory = window.G_CATEGORY_DATA && window.G_CATEGORY_DATA.mtype_options && window.G_CATEGORY_DATA.mtype_options.length > 0;
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th class="p-1 border text-left">#</th><th class="p-1 border text-left">Περιγραφή</th><th class="p-1 border text-right">Ποσό</th><th class="p-1 border text-right">ΦΠΑ</th>' + (isGCategory ? '<th class="p-1 border text-left">MTYPE</th>' : '') + '</tr>';
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        lines.forEach((ln, idx) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td class="p-1 border text-left">${idx+1}</td>
                          <td class="p-1 border text-left">${(ln.description||ln.desc||'').toString().slice(0,200)}</td>
                          <td class="p-1 border text-right">${ln.amount||ln.lineTotal||''}</td>
                          <td class="p-1 border text-right">${ln.vat||ln.vatRate||''}</td>` + (isGCategory ? `<td class="p-1 border text-left">${ln.mtype||''}</td>` : '');
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        linesContainer.appendChild(tbl);
      }
      
      // Wire interactions αν υπάρχει το function
      if (typeof window.wireInteractions === 'function') {
        window.wireInteractions();
      }
    }

    function populateOnce(){
      try {
        const v = (summaryInput.value || '').trim();
        if (!v) {
          // nothing to show
          return;
        }
        if (v === lastVal) return;
        lastVal = v;
        let obj = {};
        try { obj = JSON.parse(v); } catch(err){
          console.warn('[RC-DEBUG] failed parsing summaryJsonInput JSON', err, v);
          return;
        }
        console.log('[RC-DEBUG] populate modal from summary JSON', obj);

        safeText(markEl, obj.mark || obj.MARK || (obj.raw && obj.raw.MARK) || '');
        safeText(aaEl, obj.AA || obj.aa || obj.progressive_aa || (obj.raw && obj.raw.progressive_aa) || '');
        safeText(afmEl, obj.AFM_issuer || obj.AFM || obj.issuer_vat || (obj.raw && obj.raw.issuer_vat) || '');
        safeText(nameEl, obj.Name || obj.Name_issuer || obj.issuer_name || (obj.raw && obj.raw.issuer_name) || '');
        safeText(issueEl, obj.issueDate || obj.issue_date || (obj.raw && obj.raw.issue_date) || '');
        safeText(typeEl, obj.type_name || obj.type || (obj.raw && obj.raw.doc_type) || '');
        safeText(netEl, obj.totalNetValue || obj.total_amount || obj.totalValue || (obj.raw && obj.raw.total_amount) || '');
        safeText(vatEl, obj.totalVatAmount || (obj.raw && obj.raw.totalVatAmount) || '');
        safeText(totEl, obj.totalValue || obj.total_amount || (obj.raw && obj.raw.total_amount) || '');

        // lines
        let lines = [];
        if (Array.isArray(obj.lines) && obj.lines.length) lines = obj.lines;
        else if (obj.raw && Array.isArray(obj.raw.lines) && obj.raw.lines.length) lines = obj.raw.lines;
        else if (obj.lines && typeof obj.lines === 'object') {
          // sometimes backend sends object: try to collect values
          try {
            lines = Object.values(obj.lines).filter(x => x);
          } catch(e){}
        }
        renderLines(lines);

        try {
          const waitApi = window.WaitOverlay;
          if (waitApi) {
            if (typeof waitApi.forceHide === 'function') waitApi.forceHide();
            else if (typeof waitApi.hide === 'function') waitApi.hide();
          }
        } catch(_){}

        // if modal is hidden, ensure it's visible when populate invoked by scraper flow
        try {
          if (modal && modal.style.display === 'none') {
            if (!(window.__RC_FLAGS && window.__RC_FLAGS.autoHandled)) { modal.style.display = 'flex'; }
          }
        } catch(e){}

      } catch(e){
        console.error('[RC-DEBUG] populateOnce error', e);
      }
    }

    // Start polling for changes to summaryJsonInput.value
    const poll = setInterval(populateOnce, 250);

    // Also populate when modal opens (observe style attribute)
    const obs = new MutationObserver(muts => {
      for(const m of muts){
        if (m.type === 'attributes' && m.attributeName === 'style'){
          try { if (modal.style.display !== 'none') populateOnce(); } catch(e){}
        }
      }
    });
    try { obs.observe(modal, { attributes: true, attributeFilter: ['style'] }); } catch(e){}

    // expose a debug function on window to force populate
    window.RC_forcePopulateSummaryModal = populateOnce;

    console.log('[RC-DEBUG] summary-populate watcher started');

    // Optional: stop polling after N seconds to be tidy
    setTimeout(()=>{ clearInterval(poll); console.log('[RC-DEBUG] stopped summary-populate polling (timeout)'); }, 60*1000);

  } catch (err) {
    console.error('[RC-DEBUG] summary-populate init failed', err);
  }
})();

(function RC_FORCE_MODAL_GUARD(){
  try {
    const dbg = (...a) => { try { console.log('[RC-MODAL-GUARD]', ...a); } catch(e) {} };

    function parseSummary() {
      const el = document.getElementById('summaryJsonInput');
      if (!el) return {};
      try { return JSON.parse(el.value || '{}') || {}; } catch(e){ dbg('parseSummary JSON error', e); return {}; }
    }

    function hasMeaningfulSummary(obj) {
      if (!obj || typeof obj !== 'object') return false;
      // important single fields that guarantee modal should open
      const keys = ['mark','MARK','AFM_issuer','AFM','totalValue','totalNetValue','total_amount','issueDate','issue_date','progressive_aa','AA'];
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return true;
      }
      // check raw.* fields if present
      if (obj.raw && typeof obj.raw === 'object') {
        for (const k of ['MARK','issuer_vat','total_amount','issue_date','progressive_aa']) {
          if (obj.raw[k] !== undefined && obj.raw[k] !== null && String(obj.raw[k]).trim() !== '') return true;
        }
      }
      // lines array with at least one non-empty line
      if (Array.isArray(obj.lines) && obj.lines.length) {
        for (const ln of obj.lines) {
          if (!ln) continue;
          if ((ln.description && String(ln.description).trim() !== '') ||
              (ln.amount && String(ln.amount).trim() !== '') ||
              (ln.id && String(ln.id).trim() !== '')) return true;
        }
      }
      // fallback: object with >1 non-empty keys
      const nonEmpty = Object.keys(obj).filter(k=>{
        try { return obj[k] !== null && obj[k] !== undefined && String(obj[k]).trim() !== ''; } catch(e){ return false; }
      });
      return nonEmpty.length > 1;
    }

    function ensureModalHiddenUnlessMeaningful() {
      const modal = document.getElementById('summaryModal');
      const summaryEl = document.getElementById('summaryJsonInput');
      if (!modal || !summaryEl) { dbg('no modal/summaryEl present'); return; }

      // Force-hide now (neutralize server/client auto-show)
      hideSummaryModal();

      // If summary becomes meaningful, show it (and populate watcher should fill fields)
      const checkAndMaybeShow = () => {
        const obj = parseSummary();
        if (hasMeaningfulSummary(obj)) {
          dbg('summary meaningful -> showing modal', obj);
          try {
            // try to trigger your populate logic if present
            if (window.RC_forcePopulateSummaryModal) {
              try { window.RC_forcePopulateSummaryModal(); } catch(e){ dbg('RC_forcePopulateSummaryModal failed', e); }
            } else if (typeof populateSummaryModal === 'function') {
              try { populateSummaryModal(obj); } catch(e){ dbg('populateSummaryModal failed', e); }
            }
            if (!(window.__RC_FLAGS && window.__RC_FLAGS.autoHandled)) { modal.style.display = 'flex'; }
          } catch(e){ dbg('show modal failed', e); }
        } else {
          // keep hidden
          dbg('summary not meaningful -> keep modal hidden');
          hideSummaryModal();
        }
      };

      // run immediate check after tiny delay (let other init finish)
      setTimeout(checkAndMaybeShow, 60);

      // observe changes to summaryJsonInput.value (detect writes by other code)
      try {
        let lastVal = summaryEl.value || '';
        const poll = setInterval(() => {
          try {
            const cur = summaryEl.value || '';
            if (cur !== lastVal) {
              lastVal = cur;
              dbg('summaryJsonInput changed -> recheck');
              checkAndMaybeShow();
            }
          } catch(e){ dbg('poll error', e); }
        }, 200);
        // auto-stop polling after 60s
        setTimeout(()=>clearInterval(poll), 60*1000);
      } catch(e){ dbg('poll install failed', e); }

      // observe modal style changes by others: if someone tries to open it while summary not meaningful, immediately hide
      try {
        const mo = new MutationObserver(muts => {
          try {
            const obj = parseSummary();
            if (!hasMeaningfulSummary(obj)) {
              const modalEl = document.getElementById('summaryModal');
              if (modalEl) {
                const disp = window.getComputedStyle(modalEl).display;
                if (disp !== 'none') {
                  dbg('modal was opened by other code while summary not meaningful -> hiding it');
                  hideSummaryModal();
                }
              }
            }
          } catch(e){ dbg('mutation observer callback error', e); }
        });
        const modalNode = document.getElementById('summaryModal');
        if (modalNode) mo.observe(modalNode, { attributes: true, attributeFilter: ['style', 'class'] });
      } catch(e){ dbg('mutation observer install failed', e); }
    }

    // Run after DOM ready (also run if DOM already ready)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureModalHiddenUnlessMeaningful);
    } else {
      setTimeout(ensureModalHiddenUnlessMeaningful, 10);
    }

    dbg('RC_FORCE_MODAL_GUARD installed');
  } catch(err) {
    try { console.error('[RC-MODAL-GUARD] init failed', err); } catch(e){}
  }
})();

document.addEventListener('click', function(ev){
  const btn = ev.target.closest('.category-btn');
  if(!btn) return;

  // 1) Αποτροπή bubbling για να μην ανοίγει άλλο modal
  ev.preventDefault();
  try { ev.stopImmediatePropagation(); } catch(e){}
  try { ev.stopPropagation(); } catch(e){}

  // 2) Ενημέρωση κουμπιών (UI)
  const lineId = btn.dataset.lineId;
  const cat = btn.dataset.cat;
  const siblings = btn.parentElement.querySelectorAll('.category-btn');
  siblings.forEach(s => s.classList.remove('bg-sky-600','text-white'));
  btn.classList.add('bg-sky-600','text-white');

  // 3) Ενημέρωση του select για compatibility
  const sel = document.querySelector('select.expense-category[data-line-id="'+lineId+'"]');
  if(sel) sel.value = cat;

  // 4) Ενημέρωση του hidden JSON input
  const input = document.getElementById('summaryJsonInput');
  if(!input) return;
  let data = {};
  try { data = JSON.parse(input.value || '{}'); } catch(e){ data = {}; }

  // Ensure lines array exists
  if(!Array.isArray(data.lines)) data.lines = [];

  // Update or add line
  let line = data.lines.find(l => String(l.id || l.line_id || '') === lineId);
  if(!line){
    line = {id: lineId};
    data.lines.push(line);
  }
  line.category = cat; // <--- εδώ γράφεται η κατηγορία

  // Save back
  input.value = JSON.stringify(data);
});

document.querySelectorAll('.category-btn').forEach(btn=>{
  btn.addEventListener('click', function(ev){
    ev.preventDefault(); // δεν χρειάζεται stopPropagation

    const lineId = this.dataset.lineId;
    const cat = this.dataset.cat;

    // Αποτύπωση UI
    const siblings = this.parentElement.querySelectorAll('.category-btn');
    siblings.forEach(s => s.classList.remove('bg-sky-600','text-white'));
    this.classList.add('bg-sky-600','text-white');

    // Ενημέρωση select για συμβατότητα
    const sel = document.querySelector('select.expense-category[data-line-id="'+lineId+'"]');
    if(sel) sel.value = cat;

    // Ενημέρωση summaryJsonInput
    const input = document.getElementById('summaryJsonInput');
    if(!input) return;
    let data = {};
    try { data = JSON.parse(input.value || '{}'); } catch(e){ data={}; }
    if(!Array.isArray(data.lines)) data.lines = [];
    let line = data.lines.find(l => String(l.id||l.line_id||'')===lineId);
    if(!line){
      line = {id: lineId};
      data.lines.push(line);
    }
    line.category = cat;
    input.value = JSON.stringify(data);

    // !!! Σημαντικό: μην καλείς stopPropagation εδώ !!!
    // Άλλο modal handler θα πρέπει να φιλτράρει ποιο στοιχείο το ενεργοποιεί
  });
});
document.addEventListener('click', function(ev){
  // Αν το click προέρχεται από κουμπί category, αγνόησε
  if(ev.target.closest('.category-btn')) return;

  // άλλος κώδικας που ανοίγει modal
});





// === Frontend patch: enrich delete_invoices POST + clear client-side cache ===
document.addEventListener('submit', function(ev){
  try{
    const form = ev.target;
    if(!form || !form.action) return;
    // Match delete_invoices endpoint (relative or absolute)
    const a = document.createElement('a'); a.href = form.action;
    const path = (a.pathname || '') + (a.search || '');
    if(!/delete_invoices/.test(path)) return;

    // 1) Ensure active_vat is posted
    const existingHv = form.querySelector('input[name="active_vat"]');
    if(!existingHv){
      const hv = document.createElement('input');
      hv.type = 'hidden';
      hv.name = 'active_vat';
      const activeVat = (document.querySelector('#vatSelector')?.value
                      || document.querySelector('[name="vat"]')?.value
                      || document.body.dataset.activeVat
                      || '').toString().trim();
      hv.value = activeVat;
      form.appendChild(hv);
    }

    // 2) Collect marks to delete
    let marks = Array.from(form.querySelectorAll('input[name="delete_mark"]')).map(i => (i.value||'').trim()).filter(Boolean);
    if(!marks.length){
      marks = Array.from(document.querySelectorAll('input[name="delete_mark"]:checked')).map(i => (i.value||'').trim()).filter(Boolean);
    }

    // 3) Clear client-side caches (localStorage keys that reference these MARKs)
    try{
      marks.forEach(mk => {
        // common per-mark keys
        localStorage.removeItem(`epsilon_summary_${mk}`);
        localStorage.removeItem(`EPSILON:INV:${mk}`);
      });
      // any key containing one of the marks
      for(let i=localStorage.length-1; i>=0; i--){
        const k = localStorage.key(i);
        if(!k) continue;
        if(marks.some(mk => k.includes(mk))){
          localStorage.removeItem(k);
        }
      }
      // also clear any prefilled summary hidden input to avoid stale reopen
      const sumInp = document.getElementById('summaryJsonInput');
      if(sumInp) sumInp.value = '';
    }catch(e){ /* ignore storage errors */ }

  }catch(err){
    console.warn('delete_invoices frontend patch failed', err);
  }
}, true);
(function receiptsRepeatModalGuard(){
  const once = { submitted:false };

  function qs(id){ return document.getElementById(id); }

  function readSummary(){
    try { return JSON.parse(qs('summaryJsonInput')?.value || '{}'); }
    catch(_) { return {}; }
  }

  function isMeaningfulSummary(o){
    try{
      if (!o || typeof o!=='object') return false;
      const mark = String(o.mark || o.MARK || '').trim();
      if (!mark || mark.length<6) return false;
      const lines = Array.isArray(o.lines) ? o.lines : [];
      if (lines.length===0) return false;
      return lines.some(l=>{
        if(!l) return false;
        const desc=(l.description||l.desc||'').toString().trim();
        const amt =(l.amount||l.lineTotal||l.total||'').toString().trim();
        const id  =(l.id||l.line_id||'').toString().trim();
        return !!(desc||amt||id);
      });
    }catch(_){ return false; }
  }

  function isReceiptSummary(o){
    try{
      const t = (o.type_name || o.type || '').toString().toLowerCase();
      const c = (o.category || o.characteristic || o['χαρακτηρισμός'] || '').toString().toLowerCase();
      return !!(o.is_receipt || t.includes('απόδει') || t.includes('receipt') || t.includes('λιαν') || c==='αποδειξακια');
    }catch(_){ return false; }
  }

  function forceEdit(){
    try { return new URLSearchParams(location.search).get('force_edit') === '1'; }
    catch(_){ return false; }
  }

  function shouldOpenSummaryModal(obj){
    const receiptsOn = !!(qs('useReceiptsSwitch') && qs('useReceiptsSwitch').checked);
    const repeatOn   = !!(qs('repeatEntrySwitch') && qs('repeatEntrySwitch').checked);
    // Αν είμαστε σε αποδείξεις (ή το summary είναι απόδειξη) και repeat ON και ΔΕΝ είναι reclassification -> ΜΗΝ ανοίξεις modal
    if ((receiptsOn || isReceiptSummary(obj)) && repeatOn && !forceEdit()) return false;
    return true;
  }

  function autoSubmitReceipt(obj){
    if (once.submitted) return;                       // το στείλαμε ήδη σε αυτόν τον κύκλο
    if (!isMeaningfulSummary(obj)) return;            // ασφαλιστική δικλείδα
    const mark = (obj.mark || obj.MARK || '').toString().trim();
    if (!mark) return;
    const key = 'rc-auto:' + mark;
    if (sessionStorage.getItem(key)) return;          // ήδη υποβλήθηκε μετά από reload

    // Επέβαλε “Αποδειξάκια”
    try{
      if (!Array.isArray(obj.lines)) obj.lines = [];
      obj.is_receipt = true;
      obj.category = 'αποδειξακια';
      obj.characteristic = 'αποδειξακια';
      obj['χαρακτηρισμός'] = 'αποδειξακια';
      qs('summaryJsonInput').value = JSON.stringify(obj);
    }catch(_){}

    const form = qs('saveSummaryForm');
    if (!form) return;
    once.submitted = true;
    sessionStorage.setItem(key,'1');                 // ώστε στο επόμενο reload να ΜΗΝ ξαναστείλει
    // Ensure repeat_enabled is posted
    let h = form.querySelector('input[name="repeat_enabled"]');
    if (!h) {
      h = document.createElement('input');
      h.type = 'hidden';
      h.name = 'repeat_enabled';
      form.appendChild(h);
    }
    h.value = '1';
    form.submit();
  }

  // Φρένο: ΜΗΝ υποβάλλεις την search-form χωρίς mark KAI χωρίς url
  (function guardEmptySearchSubmit(){
    const form = qs('markSearchForm');
    if (!form) return;
    form.addEventListener('submit', (e)=>{
      const mark = (qs('markInput')?.value || '').trim();
      const url  = (qs('scrapeUrlInput')?.value || '').trim();
      if (!mark && !url) e.preventDefault();
    }, true);
  })();

  // Παρακολούθησε το modal: αν πάει να ανοίξει ενώ ΔΕΝ πρέπει, κλείστο και κάνε auto-submit
  const modal = qs('summaryModal');
  if (!modal) return;

  const observer = new MutationObserver(function(){
    try{
      const visible = modal && getComputedStyle(modal).display !== 'none';
      if (!visible) return;
      const obj = readSummary();
      if (!shouldOpenSummaryModal(obj)) {
        // Μπλόκαρε το modal και προχώρησε σε auto-submit
        hideSummaryModal();
        autoSubmitReceipt(obj);
      }
    }catch(_){}
  });

  try{
    observer.observe(modal, { attributes:true, attributeFilter:['style','class'] });
  }catch(_){}

  // One-shot check αν τυχόν ξεκινά ήδη ανοιχτό
  setTimeout(()=>{
    try{
      const visible = modal && getComputedStyle(modal).display !== 'none';
      const obj = readSummary();
      if (visible && !shouldOpenSummaryModal(obj)) {
        hideSummaryModal();
        autoSubmitReceipt(obj);
      }
    }catch(_){}
  }, 80);
})();



/* ===== Auto-submit segmented toggle + guarded auto-detect (receipts & invoices) ===== */
(function(){
  try {
    // Globals
    window.__RC_FLAGS  = window.__RC_FLAGS  || {};
    window.__RC_LOCKS  = window.__RC_LOCKS  || {};
    const AUTO_KEY = 'rc:autoSubmitEnabled';

    // UI refs (may be absent in some partial renders)
    const form     = document.getElementById('markSearchForm');
    const markEl   = document.getElementById('markInput');
    const urlEl    = document.getElementById('scrapeUrlInput'); // may be dynamically created in your code
    const btnOn    = document.getElementById('autoSubmitBtnOn');
    const btnOff   = document.getElementById('autoSubmitBtnOff');
    const receiptsSwitch = document.getElementById('useReceiptsSwitch');

    // State helpers
    function getAuto(){ try { return localStorage.getItem(AUTO_KEY) === '1'; } catch(_) { return false; } }
    function applyAutoValue(v, options){
      const opts = options || {};
      const silent = !!opts.silent;
      const normalized = !!v;
      const current = getAuto();
      if (current === normalized && !opts.force){
        updateUi();
        return normalized;
      }
      try { localStorage.setItem(AUTO_KEY, normalized ? '1' : '0'); } catch(_) {}
      window.__RC_FLAGS.auto_submit_enabled = normalized;
      updateUi();
      if (typeof window.__RC_onAutoSubmitChange === 'function'){
        try { window.__RC_onAutoSubmitChange(normalized, opts); } catch(_){}
      }
      if (silent) {
        return normalized;
      }

      // reload με συγχρονισμό querystring
      try {
        const p = new URLSearchParams(location.search);
        if (normalized) p.set('auto_submit','1'); else p.delete('auto_submit');
        const newQS = p.toString();
        const cur  = location.pathname + location.search;
        const next = location.pathname + (newQS ? '?' + newQS : '');
        if (next === cur) {
          location.reload();          // αν δεν αλλάζει το URL, αναγκαστικό reload
        } else {
          location.search = newQS;    // αλλάζοντας το query κάνει reload μόνο του
        }
      } catch (e) {
        location.reload();
      }
      return normalized;
    }

    function setAuto(v){
      return applyAutoValue(v, { silent: false });
    }

    function updateUi(){
      const on = getAuto();
      if (btnOn && btnOff) {
        btnOn.classList.toggle('bg-sky-600', on);
        btnOn.classList.toggle('text-white', on);
        btnOff.classList.toggle('bg-sky-600', !on);
        btnOff.classList.toggle('text-white', !on);
      }
    }
    updateUi();
    if (btnOn)  btnOn.addEventListener('click', ()=> setAuto(true));
    if (btnOff) btnOff.addEventListener('click', ()=> setAuto(false));

    // Utilities
    function isVisible(el){
      if(!el) return false;
      const cs = getComputedStyle(el);
      return !(cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0');
    }
    function warningOpen(){
      const ids = ['receiptWarn','afmWarningModal','receiptWarningModal','yearWarningModal'];
      for (const id of ids){ const el = document.getElementById(id); if (el && isVisible(el)) return true; }
      // generic: any visible dialog that is not the summary modal
      const nodes = document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.modal-root');
      for (const n of nodes){
        if (!isVisible(n)) continue;
        if (n.id === 'summaryModal' || n.id === 'receiptsModal') continue;
        const t = (n.textContent || '').toLowerCase();
        if (/\bπροειδοπ|\bπροσοχ|warning|σφάλμα|error/.test(t)) return true;
      }
      return false;
    }

    const normMark = v => (v||'').replace(/\D/g,'');
    const isMark   = v => normMark(v).length === 15;
    const isUrl    = v => {
      const s = (v||'').trim();
      return /^https?:\/\/\S+/i.test(s) || /^www\.\S+/i.test(s);
    };
    const extractMark = s => {
      const m = String(s||'').match(/\b(\d{15})\b/);
      return m ? m[1] : '';
    };

    function currentKey(){
      const mv = (markEl && markEl.value) ? markEl.value.trim() : '';
      const uv = (document.getElementById('scrapeUrlInput')?.value || '').trim(); // requery in case it was injected after
      const receipts = !!(receiptsSwitch && receiptsSwitch.checked);

      const keys = [];
      const pushKey = (k) => {
        if (!k) return;
        if (!keys.includes(k)) keys.push(k);
      };

      const appendUrlVariants = (value) => {
        if (!value) return;
        if (!isUrl(value)) return;
        const normalizedUrl = value.replace(/\/+$/,'');
        pushKey('url:'+normalizedUrl);
        const extracted = extractMark(value);
        if (extracted) pushKey('mark:'+normMark(extracted));
      };

      const appendMarkVariant = (value) => {
        if (!value) return;
        if (!isMark(value)) return;
        pushKey('mark:'+normMark(value));
      };

      if (receipts) {
        appendUrlVariants(uv);
        appendMarkVariant(uv);
        appendMarkVariant(mv);
      } else {
        appendMarkVariant(mv);
        appendUrlVariants(mv);
        appendUrlVariants(uv);
      }

      return {
        primary: keys.length ? keys[0] : null,
        keys
      };
    }

    let pending = false;
    const KEY_RECENT = 'rc:recentSubmitKeys';
    const TTL_MS   = 20000;
    const MAX_RECENT = 20;

    function loadRecentKeys(){
      const now = Date.now();
      try {
        const raw = sessionStorage.getItem(KEY_RECENT);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter(entry => entry && typeof entry.k === 'string' && entry.k && typeof entry.ts === 'number' && (now - entry.ts) <= TTL_MS);
      } catch (_) {
        return [];
      }
    }

    function saveRecentKeys(list){
      try {
        const payload = Array.isArray(list) ? list.slice(-MAX_RECENT) : [];
        sessionStorage.setItem(KEY_RECENT, JSON.stringify(payload));
      } catch (_) {}
    }

    function wasRecentlySubmitted(keys){
      const arr = Array.isArray(keys) ? keys : [keys];
      if (!arr.length) return false;
      const recent = loadRecentKeys();
      if (!recent.length) return false;
      const seen = new Set(recent.map(entry => entry.k));
      for (const key of arr) {
        if (key && seen.has(key)) return true;
      }
      return false;
    }

    function markSubmitted(keys){
      const arr = Array.isArray(keys) ? keys.filter(Boolean) : (keys ? [keys] : []);
      if (!arr.length) return;
      const now = Date.now();
      const recent = loadRecentKeys();
      const merged = new Map();
      for (const entry of recent) {
        if (entry && typeof entry.k === 'string' && entry.k) {
          merged.set(entry.k, entry.ts);
        }
      }
      for (const key of arr) {
        merged.set(key, now);
      }
      const ordered = Array.from(merged.entries())
        .sort((a,b) => a[1] - b[1])
        .slice(-MAX_RECENT)
        .map(([k, ts]) => ({ k, ts }));
      saveRecentKeys(ordered);
    }

    function rememberMark(value){
      const digits = typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/[^0-9]/g, '')
        : '';
      if (digits.length !== 15) return;
      markSubmitted(['mark:' + digits]);
    }

    window.__RC_autoSubmitRememberMark = function rememberAutoSubmitMark(value){
      rememberMark(value);
    };

    window.__RC_autoSubmitRememberKeys = function rememberAutoSubmitKeys(keys){
      markSubmitted(keys);
    };

    const debounce = (fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

    function trySubmit(){
      if (!form || !getAuto()) return;
      if (warningOpen()) return;
      const info = currentKey();
      if (!info || !info.primary) return;
      const keys = info.keys || [info.primary];

      // prevent collisions with existing receipts lock if present
      if (window.__RC_LOCKS && window.__RC_LOCKS.scrape) return;

      // prevent duplicate submits on same key
      if (wasRecentlySubmitted(keys)) return;

      // submit once
      markSubmitted(keys);
      if (pending) return;
      pending = true;
      try {
        if (form.requestSubmit) form.requestSubmit(); else form.submit();
      } finally {
        setTimeout(()=>{ pending=false; }, 500);
      }
    }

    const onChange = debounce(trySubmit, 140);

    // Wire inputs if present
    if (markEl) {
      markEl.addEventListener('input', onChange);
      markEl.addEventListener('keyup', onChange);
      markEl.addEventListener('paste', ()=>setTimeout(onChange,0));
    }
    // url input could be injected later; observe for appearance
    let tries = 30;
    const iv = setInterval(()=>{
      const u = document.getElementById('scrapeUrlInput');
      if (u) {
        u.addEventListener('input', onChange);
        u.addEventListener('keyup', onChange);
        u.addEventListener('paste', ()=>setTimeout(onChange,0));
        clearInterval(iv);
      }
      if(--tries<=0) clearInterval(iv);
    }, 200);

    // Initial pass (for browser autofill)
    window.addEventListener('load', ()=> setTimeout(onChange, 60));

    // Ensure a stub exists to avoid ReferenceError when other code calls it
    if (typeof window.autoSubmitReceipt !== 'function') {
      window.autoSubmitReceipt = function(){ /* stub to avoid ReferenceError; actual flow handled elsewhere */ };
    }

    window.RC = window.RC || {};
    window.RC.autoSubmitControls = {
      get: getAuto,
      set: (value, opts) => applyAutoValue(value, opts || {}),
      toggle: (opts) => applyAutoValue(!getAuto(), Object.assign({ silent: false }, opts || {})),
      refresh: updateUi
    };

    try {
      if (Array.isArray(window.__RC_pendingSummaryMarks)){
        window.__RC_pendingSummaryMarks.forEach(rememberMark);
      }
    } catch(_) {}
    window.__RC_pendingSummaryMarks = [];
  } catch (err) {
    console.warn('Auto-submit toggle patch failed', err);
  }
})();

/* === Persist Receipts/Invoices toggle across refresh === */
<script>
/* === Persist Receipts/Invoices toggle across refresh (v2) === */
(function persistReceiptsToggle(){
  const KEY = 'rc:useReceipts';
  const sw  = document.getElementById('useReceiptsSwitch');
  const markInput = document.getElementById('markInput');
  function ensureUrlInput(){
    let el = document.getElementById('scrapeUrlInput');
    if (!el) {
      // try to locate after markInput if dynamically created later by other code
      el = document.createElement('input');
      el.id = 'scrapeUrlInput';
      el.placeholder = 'Εισάγετε URL παραστατικού (για αποδείξεις)';
      el.className = 'p-2 border rounded w-full pr-12 hidden';
      el.type = 'text';
      if (markInput && markInput.parentElement) {
        markInput.parentElement.insertBefore(el, markInput.nextSibling);
      } else {
        document.body.appendChild(el);
      }
    }
    return el;
  }
  function applyUI(isReceipts){
    const urlInput = ensureUrlInput();
    if (isReceipts){
      markInput && markInput.classList.add('hidden');
      urlInput && urlInput.classList.remove('hidden');
    } else {
      markInput && markInput.classList.remove('hidden');
      urlInput && urlInput.classList.add('hidden');
    }
  }

  if (!sw) return;
  // restore saved value
  const saved = localStorage.getItem(KEY);
  if (saved !== null) sw.checked = (saved === '1');
  applyUI(sw.checked);

  // if URL input appears later (other scripts), re-apply for a short window
  let tries = 20;
  const iv = setInterval(()=>{
    applyUI(sw.checked);
    if (--tries <= 0) clearInterval(iv);
  }, 200);

  sw.addEventListener('change', () => {
    localStorage.setItem(KEY, sw.checked ? '1' : '0');
    applyUI(sw.checked);
  });
})();

/* === Lightweight warning detector (client/server modals) === */
(function ensureWarningOpenHelper(){
  if (typeof window.__rc_warningOpen === 'function') return;
  window.__rc_warningOpen = function(){
    function vis(el){ if(!el) return false; const cs=getComputedStyle(el); return !(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0'); }
    const ids=['receiptWarn','afmWarningModal','receiptWarningModal','yearWarningModal'];
    for (const id of ids){ const el=document.getElementById(id); if (el && vis(el)) return true; }
    const nodes=document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.modal-root');
    for (const n of nodes){
      if (!vis(n)) continue;
      if (n.id==='summaryModal' || n.id==='receiptsModal') continue;
      const t=(n.textContent||'').toLowerCase();
      if (/(προειδοπ|προσοχ|warning|σφάλμα|error)/.test(t)) return true;
    }
    return false;
  };
})();


/* === RC helpers μόνο για flow Αποδείξεων === */
window.RC = window.RC || {};

RC.hasWarnings = function(){ return (typeof window.__rc_warningOpen === 'function') ? window.__rc_warningOpen() : false; };

RC.normalizeReceiptSummary = function (summaryObj) {
  summaryObj.is_receipt = true;
  summaryObj.type = summaryObj.type || 'ΑΠΟΔΕΙΞΗ';
  summaryObj.type_name = summaryObj.type_name || 'ΑΠΟΔΕΙΞΗ';
  summaryObj.category = 'αποδειξακια';
  if (!Array.isArray(summaryObj.lines) || !summaryObj.lines.length) {
    const tot = summaryObj.total_amount || summaryObj.totalValue || summaryObj.totalNetValue || '';
    summaryObj.lines = [{ id:'r0', description:'', amount:String(tot||''), vat:'', vatCategory:'', category:'αποδειξακια' }];
  } else {
    summaryObj.lines = summaryObj.lines.map((l,i)=>({
      id: String(l?.id || l?.line_id || ('r'+i)),
      description: String(l?.description || l?.desc || ''),
      amount: String(l?.amount || l?.lineTotal || l?.total || ''),
      vat: String(l?.vat || l?.vatRate || ''),
      vatCategory: String(l?.vatCategory || l?.vat_category || ''),
      category: String(l?.category || '') || 'αποδειξακια'
    }));
  }
  return summaryObj;
};

RC.confirmReceiptOnce = async function(summaryObj, scrapeUrl){
  window.__RC_LOCKS = window.__RC_LOCKS || {};
  if (window.__RC_LOCKS.confirm) return { ok:false, reason:'locked' };
  window.__RC_LOCKS.confirm = true;

  try {
    const VAT = "{{ vat or '' }}";
    const afmVal = (VAT || summaryObj.AFM_issuer || summaryObj.AFM || (summaryObj.raw && summaryObj.raw.issuer_vat) || '').toString().trim();
    if (!afmVal) return { ok:false, reason:'missing_afm' };

    if (!/\b\d{15}\b/.test(String(summaryObj.mark||'').trim())) {
      const r = await fetch('/api/next_receipt_mark', { credentials:'same-origin' });
      const j = await r.json().catch(()=>null);
      if (j && j.mark) summaryObj.mark = j.mark;
    }

    let yearVal = "{{ active_year|default('') }}";
    if (!yearVal) {
      try { const fy = await fetch('/get_fiscal_year', { credentials:'same-origin' }); const fyj = await fy.json(); if (fyj && fyj.exists) yearVal = String(fyj.fiscal_year); } catch(_){}
    }
    if (!yearVal) {
      const any = summaryObj.issueDate || summaryObj.issue_date || (summaryObj.raw && summaryObj.raw.issue_date) || '';
      const m = String(any).match(/\b(19|20)\d{2}\b/);
      yearVal = m ? m[0] : String((new Date()).getUTCFullYear());
    }

    const payload = {
      url: (scrapeUrl||'').trim(),
      summary_json: JSON.stringify(summaryObj),
      force: false,
      category: 'αποδειξακια',
      afm: afmVal,
      year: String(yearVal),
      mark: String(summaryObj.mark||'')
    };

    // Add MTYPE if available (for receipts in repeat mode)
    const isRepeat = !!document.getElementById('repeatEntrySwitch')?.checked;
    if(isRepeat && typeof window._getReceiptMtypeForConfirm === 'function'){
      const mtype = window._getReceiptMtypeForConfirm();
      if(mtype){
        payload.mtype = mtype;
        payload.invoice_mtype = mtype;
      }
    }

    const res = await fetch('/api/confirm_receipt', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(payload)
    });
    const jj = await res.json().catch(()=>null);
    if (!res.ok || !jj || !jj.ok) return { ok:false, reason: (jj&&jj.error) || ('HTTP '+res.status) };

    return { ok:true };
  } finally {
    window.__RC_LOCKS.confirm = false;
  }
};

RC.handleReceiptAfterScrape = async function(summaryObj, scrapeUrl){
  try {
    const repeatOn = !!document.getElementById('repeatEntrySwitch')?.checked;
    const forceEdit = (typeof FORCE_EDIT !== 'undefined') ? !!FORCE_EDIT : false;
    if (!repeatOn || forceEdit || RC.hasWarnings()) return false;

    RC.normalizeReceiptSummary(summaryObj);
    const summaryInput = document.getElementById('summaryJsonInput');
    if (summaryInput) summaryInput.value = JSON.stringify(summaryObj);

    const r = await RC.confirmReceiptOnce(summaryObj, scrapeUrl);
    if (!r.ok) {
      if (r.reason === 'missing_afm') {
        window.openReceiptWarning && openReceiptWarning('Λείπει AFM ενεργού πελάτη.');
      } else {
        const errMsg = 'Σφάλμα αποθήκευσης: ' + (r.reason || 'άγνωστο');
        showFlash(errMsg, 'error', 6000);
        persistReceiptFlash(errMsg, 'error');
      }
      return false;
    }
    window.__RC_FLAGS = window.__RC_FLAGS || {}; window.__RC_FLAGS.autoHandled = true;
    const successMsg = 'Αποθηκεύτηκε η απόδειξη (repeat).';
    showFlash(successMsg, 'success', 4200);
    persistReceiptFlash(successMsg, 'success');
    try { hideSummaryModal(); } catch(_){}
    try { document.getElementById('scrapeUrlInput').value = ''; } catch(_){}
    try { document.getElementById('markInput').value = ''; } catch(_){}
    window.location = window.location.pathname;
    return true;
  } catch (e) {
    console.warn('handleReceiptAfterScrape failed', e);
    const errMsg = 'Σφάλμα αποθήκευσης: ' + (e && e.message ? e.message : 'άγνωστο σφάλμα');
    showFlash(errMsg, 'error', 6000);
    persistReceiptFlash(errMsg, 'error');
    return false;
  }
};
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);

  const isReceipts =
    (params.get('use_receipts') === '1') ||
    (localStorage.getItem('pref_use_receipts') === '1');

  const repeatOn =
    (params.get('repeat') === '1') ||
    (localStorage.getItem('pref_repeat') === '1');

  const autoOn = params.has('auto_submit')
    ? (params.get('auto_submit') === '1')
    : (localStorage.getItem('pref_auto_submit') === '1');

  if (!(isReceipts && repeatOn && autoOn)) return;

  // 1) Κρύψε ό,τι modal επιβεβαίωσης υπάρχει για αποδείξεις
  const hideModal = () => {
    ['#receiptsModal', '#summaryModal', '[data-role="modal-warning"]', '#warningModal']
      .forEach(sel => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.classList?.add('hidden');
        el.style.display = 'none';
      });
  };
  hideModal();

  // 2) Βεβαιώσου ότι στο submit περνάει repeat_enabled=1
  const ensureRepeatHidden = (form) => {
    if (!form) return;
    let h = form.querySelector('input[name="repeat_enabled"]');
    if (!h) {
      h = document.createElement('input');
      h.type = 'hidden';
      h.name = 'repeat_enabled';
      form.appendChild(h);
    }
    h.value = '1';
  };

  // 3) Αυτόματο submit μόλις είναι έτοιμη η φόρμα/δεδομένα
  let submitted = false;
  const tryAutoSubmit = () => {
    if (submitted) return;

    // Βρες τη φόρμα αποθήκευσης
    const form = document.querySelector('form[action$="/save_summary"]');
    if (!form) return;

    // Έλεγξε ότι υπάρχει payload: summary_json (input/textarea) ή τουλάχιστον το mark
    const payloadEl = form.querySelector('input[name="summary_json"],textarea[name="summary_json"]');
    const hasPayload = payloadEl ? String(payloadEl.value || '').trim().length > 0 : false;
    const hasMark = String((form.querySelector('[name="mark"]') || {}).value || '').trim().length === 15;

    if (!hasPayload && !hasMark) return;

    ensureRepeatHidden(form);
    submitted = true;
    hideModal();
    form.submit();
  };

  // Δοκίμασε άμεσα & με μικρό retry
  tryAutoSubmit();
  const i1 = setInterval(() => {
    if (submitted) { clearInterval(i1); return; }
    tryAutoSubmit();
  }, 150);

  // Παρακολούθησε DOM changes (όταν γεμίσει το modal/φόρμα από το fetch)
  const mo = new MutationObserver(() => tryAutoSubmit());
  mo.observe(document.body, { subtree: true, childList: true, attributes: false });

  // Safety stop μετά από ~6s για να μην τρέχει για πάντα
  setTimeout(() => mo.disconnect(), 6000);
});






(function(){
  // 1) Ensure global mapping + helper
  window.CATEGORY_LABELS = window.CATEGORY_LABELS || (function(){
    try { return {{ (customer_category_labels or {}) | tojson | safe }} || {}; } catch(e){ return {}; }
  })();
  window.labelForCategory = window.labelForCategory || function(val){
    if (val == null) return '';
    const key = String(val);
    const MAP = window.CATEGORY_LABELS || {};
    if (Object.prototype.hasOwnProperty.call(MAP, key)) return MAP[key];
    // graceful fallback for custom_* keys
    if (key.startsWith('custom_')) return key.replace(/^custom_/, '').replace(/_/g,' ');
    return key;
  };

  // 2) Prime labels from backend if available
  async function primeCategoryLabels(){
    if (window.__labelsPrimed) return;
    try {
      const r = await fetch('/api/char_profiles?vat=' + encodeURIComponent("{{ vat or '' }}"), { credentials:'same-origin' });
      const j = await r.json();
      if (j && j.category_labels) Object.assign(window.CATEGORY_LABELS, j.category_labels);
    } catch(e) {}
    window.__labelsPrimed = true;
  }

  // 3) Relabel all options & buttons inside the Summary modal
  function relabelAllCategories(root){
    const scope = root || document;
    // select options
    scope.querySelectorAll('#summaryModal select[name$="[category]"] option').forEach(o => {
      if (!o) return;
      const v = (o.value || '').trim();
      if (!v) return;
      o.textContent = window.labelForCategory(v);
    });
    // category buttons (single-line UI)
    scope.querySelectorAll('#summaryModal .category-btn').forEach(b => {
      if (!b) return;
      const v = (b.dataset && b.dataset.cat) ? b.dataset.cat : (b.textContent || '').trim();
      b.textContent = window.labelForCategory(v);
    });
  }

  // 4) Observe Summary modal visibility & relabel after render
  document.addEventListener('DOMContentLoaded', async function(){
    const modal = document.getElementById('summaryModal');
    if (!modal) return;

    // Initial prime (labels ready even before open)
    await primeCategoryLabels();

    // If modal becomes visible later, relabel twice (render → relabel)
    const obs = new MutationObserver(async () => {
      const visible = window.getComputedStyle(modal).display !== 'none';
      if (visible) {
        await primeCategoryLabels();
        setTimeout(() => relabelAllCategories(modal), 0);
        setTimeout(() => relabelAllCategories(modal), 80);
      }
    });
    try { obs.observe(modal, { attributes:true, attributeFilter:['style','class'] }); } catch(e){}

    // If it happens to be already visible now
    if (window.getComputedStyle(modal).display !== 'none') {
      setTimeout(() => relabelAllCategories(modal), 0);
      setTimeout(() => relabelAllCategories(modal), 80);
    }
  });
})();



/* RC-REPEAT-STATE bridge για Αποδείξεις & Τιμολόγια
   - Διαβάζει το state από backend (/api/repeat_state/get) στην εκκίνηση
   - Το περνάει και σε localStorage (REPEAT:enabled) & body dataset (data-repeat-enabled)
   - Όταν αλλάζει ο διακόπτης repeatEntrySwitch, κάνει POST στο /api/repeat_state/set
   - Στο submit της φόρμας αναζήτησης, κάνει ένα φρεσκάρισμα του state πριν τη ροή
*/
(function() {
  const LS_KEY_REPEAT_ENABLED = 'REPEAT:enabled';

  async function refreshRepeatState() {
    try {
      const r = await fetch('/api/repeat_state/get', { credentials: 'include' });
      const j = await r.json();
      const enabled = !!(j && j.ok && j.enabled);
      localStorage.setItem(LS_KEY_REPEAT_ENABLED, enabled ? '1' : '0');
      document.body.dataset.repeatEnabled = enabled ? '1' : '0';
      window.REPEAT_ENABLED = enabled;

      // συγχρόνισε και το switch αν υπάρχει
      const sw = document.getElementById('repeatEntrySwitch');
      if (sw) {
        sw.checked = enabled;
      }
      console.debug('[RC-REPEAT-STATE] GET ->', { enabled });
    } catch (e) {
      console.warn('[RC-REPEAT-STATE] GET failed', e);
    }
  }

  async function setRepeatEnabled(enabled) {
    try {
      const r = await fetch('/api/repeat_state/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !!enabled })
      });
      const j = await r.json();
      if (!j || !j.ok) throw new Error(j && j.error || 'unknown');
      // persist τοπικά
      localStorage.setItem(LS_KEY_REPEAT_ENABLED, enabled ? '1' : '0');
      document.body.dataset.repeatEnabled = enabled ? '1' : '0';
      window.REPEAT_ENABLED = !!enabled;
      console.debug('[RC-REPEAT-STATE] SET ->', { enabled });
    } catch (e) {
      console.warn('[RC-REPEAT-STATE] SET failed', e);
    }
  }

  // bootstrap: στην εκκίνηση
  document.addEventListener('DOMContentLoaded', () => {
    refreshRepeatState();
    const sw = document.getElementById('repeatEntrySwitch');
    if (sw) {
      sw.addEventListener('change', function() {
        setRepeatEnabled(this.checked);
      });
    }

    // στο submit της αναζήτησης: κάνε ένα γρήγορο refresh για να «δει» σωστά το autosave των αποδείξεων
    const form = document.getElementById('markSearchForm');
    if (form) {
      form.addEventListener('submit', () => {
        // fire-and-forget, δεν μπλοκάρουμε το submit
        refreshRepeatState();
      });
    }
  });
})();

(function(){'use strict';
  // ====== Robust receipts repeat autopilot (no UI break) ======
  window.__RC_FLAGS = window.__RC_FLAGS || {};

  function lsget(key, fallback){ try{ const v=localStorage.getItem(key); if(v===null) return fallback; if(v==='1') return true; if(v==='0') return false; return v; }catch(_){
    return fallback; } }

  function receiptsSwitchOn(){ try{ return !!document.getElementById('useReceiptsSwitch')?.checked; }catch(_){
    return !!lsget('rc:useReceipts','receipts')==='receipts'; } }

  function autoSubmitOn(){ return !!lsget('rc:autoSubmitEnabled', true); }
  function repeatSwitchOn(){ try{ return !!document.getElementById('repeatEntrySwitch')?.checked; }catch(_){ return !!lsget('rc:repeat_enabled', false); } }

  async function serverRepeatEnabled(){
    try{ const r = await fetch('/api/repeat_entry/get', { credentials:'include' });
         const j = await r.json(); return !!(j && (j.enabled || j.repeat_enabled)); }
    catch(_){ return repeatSwitchOn(); }
  }

  function hideReceiptBanner(){
    const nodes = document.querySelectorAll('#existingBanner, .flash, .alert');
    nodes.forEach(el => {
      try{ if(/Λήφθηκε απόδειξη/i.test(el.textContent||'')) el.style.display='none'; }catch(_){}
    });
  }

  function tryAutoSave(){
    const form = document.getElementById('saveSummaryForm');
    const input = document.getElementById('summaryJsonInput');
    if (!form || !input) return false;
    // mark flags to suppress informational toast
    window.__RC_FLAGS.autoHandled = true;
    hideReceiptBanner();
    // Submit the server form (keeps server-side logic, excel write etc.)
    // Use a microtask so any last-second JSON sync runs first
    setTimeout(() => {
      try { form.submit(); } catch(e) {
        try { form.dispatchEvent(new Event('submit', { cancelable:false })); } catch(_){}
      }
    }, 30);
    return true;
  }

  function observeModalAndAuto(){
    const modal = document.getElementById('summaryModal');
    if (!modal) return;
    let done = false;
    const doIt = () => {
      if (done) return;
      const visible = getComputedStyle(modal).display !== 'none';
      if (!visible) return;
      if (tryAutoSave()) { done = true; hideSummaryModal(); }
    };
    try { new MutationObserver(doIt).observe(modal, { attributes:true, attributeFilter:['style','class'] }); } catch(_){}
    setTimeout(doIt, 80);
  }

  // Kickoff when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Make search submit more reliable when auto-submit is ON
    const form = document.getElementById('markSearchForm');
    if (form) {
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && autoSubmitOn()) {
          const mark = (document.getElementById('markInput')?.value || '').trim();
          const url  = (document.getElementById('scrapeUrlInput')?.value || document.getElementById('scrapeUrlField')?.value || '').trim();
          if (!mark && !url) e.preventDefault(); // guard empty
        }
      }, true);
    }

    // Always ensure page comes back to a clean state after any save
    const saveForm = document.getElementById('saveSummaryForm');
    if (saveForm) {
      let reloaded = false;
      const reloadSoon = () => {
        if (!reloaded) {
          reloaded = true;
          rcRememberSearchClear();
          setTimeout(() => location.reload(), 300);
        }
      };
      saveForm.addEventListener('ajax:done', reloadSoon, { once:true });
      saveForm.addEventListener('submit', () => setTimeout(reloadSoon, 1200), { once:true });
    }

    // If receipts + repeat are ON, suppress the "Λήφθηκε..." toast and auto-save
    Promise.resolve(serverRepeatEnabled()).then((rep) => {
      if (receiptsSwitchOn() && rep) {
        window.__RC_FLAGS.repeat_enabled = true;
        window.__RC_FLAGS.autoHandled = true; // prevents info message in existing code
        if (!tryAutoSave()) observeModalAndAuto();
      }
    });
  });
})();

(function(){
  // small utility: safe JSON parse
  function parseJSON(x){ try{ return JSON.parse(x); }catch(_){ return null; } }
  function getLS(k, d){ try{ const v = localStorage.getItem(k); return (v===null||v===undefined)?d:v; }catch(_){ return d; } }
  function setLS(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }
  function isTruthy(v){ return v === true || v === '1' || v === 1 || v === 'true'; }

  // Read repeat + receipts mode from both localStorage and globals/switches
  function getRepeatOn(){
    const ls = getLS('REPEAT:enabled', null);
    if (ls !== null) return isTruthy(ls);
    if (window.REPEAT_ENABLED !== undefined) return !!window.REPEAT_ENABLED;
    const sw = document.getElementById('repeatEntrySwitch');
    return !!(sw && sw.checked);
  }
  function getReceiptsModeOn(){
    const ls = getLS('UI:useReceipts', null);
    if (ls !== null) return isTruthy(ls);
    if (window.USE_RECEIPTS !== undefined) return !!window.USE_RECEIPTS;
    const sw = document.getElementById('useReceiptsSwitch');
    return !!(sw && sw.checked);
  }

  function isReceiptSummary(obj){
    if(!obj || typeof obj !== 'object') return false;
    if (obj.is_receipt === true) return true;
    const t = String(obj.type_name || obj.type || '').toLowerCase();
    const cat = String(obj.category || obj.characteristic || obj['χαρακτηρισμός'] || '').toLowerCase();
    return (t.includes('απόδει') || t.includes('receipt') || cat === 'αποδειξακια');
  }

  function hasMeaningfulLines(obj){
    const arr = Array.isArray(obj && obj.lines) ? obj.lines : [];
    if (arr.length === 0) return false;
    // any non-empty amount OR category is enough
    return arr.some(l => {
      const amt = String(l && (l.amount || l.total || l.lineTotal || '')).trim();
      const cat = String(l && (l.category || l.cat || '')).trim();
      return !!(amt || cat);
    });
  }

  function readSummaryObject(){
    const input = document.getElementById('summaryJsonInput');
    if(!input) return null;
    return parseJSON(input.value || '{}') || null;
  }

  function getScrapeUrl(){
    const u = document.getElementById('scrapeUrlInput') || document.getElementById('scrapeUrlField');
    return u ? (u.value || '') : '';
  }

  let lastMarkTried = null;
  let busy = false;

  async function tryAutoConfirm(){
    if (busy) return;
    const rep = getRepeatOn();
    const inRec = getReceiptsModeOn();
    if (!rep || !inRec) return;

    const s = readSummaryObject();
    if (!s || !isReceiptSummary(s) || !hasMeaningfulLines(s)) return;

    // avoid double firing for the same mark
    const mk = String(s.mark || s.MARK || '').trim();
    if (!mk || mk === lastMarkTried) return;
    lastMarkTried = mk;

    // hide modal pre-emptively to avoid flicker
    try { hideSummaryModal(); } catch(_){}

    if (!(window.RC && RC.confirmReceiptOnce && RC.normalizeReceiptSummary)) {
      // RC not yet ready; retry later
      return;
    }

    busy = true;
    try {
      await RC.confirmReceiptOnce(RC.normalizeReceiptSummary(s), getScrapeUrl());
      // keep receipts mode sticky on refresh
      setLS('UI:useReceipts', '1');
      // soft reload to clear form quickly
      setTimeout(function(){
        try {
          const base = location.pathname + '?use_receipts=1';
          location.replace(base);
        } catch(_){ location.reload(); }
      }, 120);
    } catch(err){
      console.warn('[RC-AUTOCONFIRM] failed', err);
      // allow another attempt
      lastMarkTried = null;
    } finally {
      busy = false;
    }
  }

  // Poll for summary changes & conditions (fast but lightweight)
  let pollId = null;
  function startPoll(){
    if (pollId) return;
    pollId = setInterval(tryAutoConfirm, 200);
  }
  function stopPoll(){
    if (pollId) { clearInterval(pollId); pollId = null; }
  }

  // Start ASAP
  startPoll();

  // Re-run when user submits the search form (so mode is immediately persisted)
  document.addEventListener('submit', function(e){
    const f = e.target;
    if (f && f.id === 'markSearchForm') {
      // persist current mode for autosave
      try {
        const sw = document.getElementById('useReceiptsSwitch');
        if (sw) setLS('UI:useReceipts', sw.checked ? '1' : '0');
      } catch(_){}
      setTimeout(tryAutoConfirm, 0);
    }
  }, true);

  // Also, when repeat switch toggles, persist immediately
  document.addEventListener('change', function(e){
    const sw = e.target && e.target.id === 'repeatEntrySwitch' ? e.target : null;
    if (sw){
      setLS('REPEAT:enabled', sw.checked ? '1' : '0');
      setTimeout(tryAutoConfirm, 0);
    }
  }, true);

  // One-time bootstrap from server state (if available via endpoint)
  // This is best-effort; if it fails, user toggles or previous LS values will be used.
  (async function bootstrapRepeatOnce(){
    try {
      const r = await fetch('/api/repeat_entry/get', { credentials: 'same-origin' });
      const j = await r.json();
      if (j && j.ok && j.repeat_entry) {
        setLS('REPEAT:enabled', j.repeat_entry.enabled ? '1' : '0');
        // leave mapping to backend; we only need the enabled bit here
        setTimeout(tryAutoConfirm, 0);
      }
    } catch(_){}
  })();
})();


(function(){
  function isVisible(el){
    if(!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  }

  function bindOverlaySuspension(modal){
    if(!modal || modal.dataset.waitOverlayBound === '1') return;
    modal.dataset.waitOverlayBound = '1';
    let suspended = false;

    const toggleOverlay = () => {
      const api = window.WaitOverlay;
      if(!api || typeof api.suspend !== 'function') return;
      const visible = isVisible(modal);
      if (visible && !suspended) {
        try {
          api.suspend(true);
          if (typeof api.hide === 'function') api.hide();
        } catch(_){}
        suspended = true;
      } else if (!visible && suspended) {
        try { api.suspend(false); } catch(_){}
        suspended = false;
      }
    };

    const watchAttrs = new MutationObserver(() => setTimeout(toggleOverlay, 0));
    try { watchAttrs.observe(modal, { attributes:true, attributeFilter:['style','class','hidden'] }); } catch(_){}

    const watchBody = new MutationObserver(() => setTimeout(toggleOverlay, 0));
    try { watchBody.observe(document.body, { attributes:true, attributeFilter:['class'] }); } catch(_){}

    modal.addEventListener('transitionend', () => setTimeout(toggleOverlay, 0));
    document.addEventListener('keydown', (ev) => { if(ev.key === 'Escape') setTimeout(toggleOverlay, 0); }, true);

    window.addEventListener('beforeunload', () => {
      if(suspended){
        try { window.WaitOverlay && window.WaitOverlay.suspend(false); } catch(_){}
      }
      try { watchAttrs.disconnect(); } catch(_){}
      try { watchBody.disconnect(); } catch(_){}
    }, { once:true });

    // Ensure overlay reacts even if WaitOverlay loads later
    let retries = 10;
    (function ensureReady(){
      toggleOverlay();
      if(--retries > 0 && (!window.WaitOverlay || typeof window.WaitOverlay.suspend !== 'function')){
        setTimeout(ensureReady, 150);
      }
    })();
  }

  function setupSummaryWaitOverlay(){
    const modal = document.getElementById('summaryModal');
    if(modal){
      bindOverlaySuspension(modal);
      return;
    }

    const root = document.body || document.documentElement;
    if(!root) return;
    const finder = new MutationObserver(() => {
      const node = document.getElementById('summaryModal');
      if(!node) return;
      try { finder.disconnect(); } catch(_){}
      bindOverlaySuspension(node);
    });
    try { finder.observe(root, { childList:true, subtree:true }); } catch(_){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupSummaryWaitOverlay, { once:true });
  } else {
    setupSummaryWaitOverlay();
  }
})();



document.addEventListener('click', function(e){
  const a = e.target.closest('#charProfilesLink');
  if(!a) return;
  e.preventDefault();
  window.location.href = a.getAttribute('href');
});



/* Reset & reload όταν εμφανίζονται warning modals στη σελίδα αναζήτησης */
(function(){
  function clearSearchInputs(){
    try {
      const markEl = document.getElementById('markInput');
      if (markEl){
        markEl.value = '';
        markEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (_) {}
    try {
      const urlEl = document.getElementById('scrapeUrlInput');
      if (urlEl){
        urlEl.value = '';
        urlEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (_) {}
    try {
      const hiddenUrl = document.getElementById('scrapeUrlField');
      if (hiddenUrl){
        hiddenUrl.value = '';
        hiddenUrl.removeAttribute('data-mark');
      }
    } catch (_) {}
  }

  function buildCleanUrl(){
    try {
      const url = new URL(window.location.href);
      ['mark','url','payload','scrape_url','mark_id'].forEach(param => url.searchParams.delete(param));
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  function resetSearchAndReload(){
    clearSearchInputs();
    return buildCleanUrl();
  }

  window.handleWarningModalReload = function(){
    return resetSearchAndReload();
  };

  const afmOk = document.getElementById('afmModalConfirm');
  if (afmOk) {
    afmOk.addEventListener('click', function(){
      try { document.getElementById('afmWarningModal').style.display = 'none'; } catch(_){}
      const target = resetSearchAndReload();
      setTimeout(() => {
        if (target){ window.location.replace(target); }
        else { window.location.reload(); }
      }, 40);
    });
  }
})();







(function(){
  function bindQrWaitOverlay(){
    var modal = document.getElementById('qrCameraModal');
    if(!modal) return;
    var suspended = false;
    function toggle(){
      try {
        var visible = modal && getComputedStyle(modal).display !== 'none' && !modal.classList.contains('hidden');
        var api = window.WaitOverlay;
        if (api && typeof api.suspend === 'function'){
          api.suspend(!!visible);
          if (visible && typeof api.hide === 'function') api.hide();
          suspended = !!visible;
        }
      } catch(_){}
    }
    try { new MutationObserver(toggle).observe(modal, { attributes:true, attributeFilter:['style','class','hidden'] }); } catch(_){}
    document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') setTimeout(toggle, 0); }, true);
    var retries = 10;
    (function ensure(){
      toggle();
      if(--retries > 0 && (!window.WaitOverlay || typeof window.WaitOverlay.suspend !== 'function')){
        setTimeout(ensure, 150);
      }
    })();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindQrWaitOverlay, { once:true });
  } else {
    bindQrWaitOverlay();
  }
})();



(function () {
  // ---- 1) Τί θεωρούμε "warning modal"; ----
  // Πιάνει modal containers με id που τελειώνει σε "WarningModal"
  // ή έχουν κλάση .warning-modal ή data-modal-type="warning".
  function findWarningModal(el) {
    return el.closest('[id$="WarningModal"], .warning-modal, [data-modal-type="warning"]');
  }

  // ---- 2) Βοηθητικά ----
  function wipeSearchInputs() {
    // ids που έχεις αναφέρει
    const mark  = document.getElementById('markInput');
    const url   = document.getElementById('scrapeUrlInput');
    // πιθανά hidden πεδία που “κουβαλάνε” κατάσταση
    const hUrl  = document.getElementById('scrapeUrlField');
    const hCat  = document.getElementById('scrapeCategoryField');
    const sumJs = document.getElementById('summaryJsonInput');

    if (mark) { mark.value = ''; try { mark.dispatchEvent(new Event('input',{bubbles:true})); } catch(_){} }
    if (url)  { url.value  = ''; try { url.dispatchEvent(new Event('input',{bubbles:true})); } catch(_){} }
    if (hUrl) hUrl.value = '';
    if (hCat) hCat.value = '';
    if (sumJs) sumJs.value = '{}';
  }

  function clearUrlFlags() {
    try {
      const u = new URL(window.location.href);
      for (const k of Array.from(u.searchParams.keys())) {
        if (/^(warn|warning|modal|open_)/i.test(k)) u.searchParams.delete(k);
        if (k === 'mark' || k === 'scrape_url') u.searchParams.delete(k);
      }
      history.replaceState(null, '', u.toString());
    } catch (_) {}
  }

  function doReload() {
    // καθάρισε flags ώστε να μην ξανανοίξει modal
    clearUrlFlags();
    window.location.reload();
  }

  // ---- 3) Bootstrap-aware reload: αφού κλείσει το modal ----
  function reloadAfterModalHides(modalEl) {
    // Αν υπάρχει Bootstrap 5 modal API, άκου το hidden.bs.modal
    const hasBootstrap = typeof bootstrap !== 'undefined' && modalEl && modalEl.addEventListener;
    if (hasBootstrap) {
      const onHidden = () => {
        modalEl.removeEventListener('hidden.bs.modal', onHidden);
        doReload();
      };
      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      // αν το κουμπί έχει data-bs-dismiss="modal", θα κλείσει μόνο του.
      // Αν ΟΧΙ, κλείστο χειροκίνητα (fallback):
      try {
        const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
        inst.hide();
      } catch (_) {
        // αν δεν είναι πραγματικό Bootstrap modal, πήγαινε σε timeout fallback
        setTimeout(doReload, 80);
      }
    } else {
      // custom modal → απλό fallback
      setTimeout(doReload, 80);
    }
  }

  // ---- 4) Πιάσε το click στο “Κατάλαβα” με capture (για να μην το φάνε άλλοι handlers) ----
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;

    // Αναγνώρισε το “Κατάλαβα” με 3 τρόπους:
    // α) data-ack="1"  β) class .js-warning-ack  γ) κείμενο "Το κατάλαβα"
    const isAck =
      btn.matches('[data-ack="1"], .js-warning-ack') ||
      /το\s*κατάλαβα/i.test((btn.textContent || '').trim());

    if (!isAck) return;

    // Πρέπει να είναι μέσα σε warning modal
    const modal = findWarningModal(btn);
    if (!modal) return;

    // Μη συνεχίσει default (π.χ. href, submit) — κρατάμε πλήρη έλεγχο
    e.preventDefault();

    // Καθάρισε πεδία τώρα, και κάνε reload αφού κλείσει το modal
    wipeSearchInputs();
    reloadAfterModalHides(modal);
  }, true); // <— CAPTURE PHASE

  // ---- 5) Προαιρετικά: αν έχεις συγκεκριμένα IDs στα κουμπιά, πρόσθεσε data-ack="1" στο HTML τους ----
  // π.χ. <button id="afmModalConfirm" data-ack="1" data-bs-dismiss="modal">Το κατάλαβα</button>
  //      <button id="receiptWarnOk"  data-ack="1" data-bs-dismiss="modal">Το κατάλαβα</button>
})();
