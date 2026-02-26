/* receipts_repeat_direct.js — Bypass summary modal for receipts when repeat is ON */
(function(){
  if (window.__rc_direct_bypass__) return;
  window.__rc_direct_bypass__ = true;

  function $id(id){ return document.getElementById(id); }
  function lsGet(k,d){ try{const v=localStorage.getItem(k);return v==null?d:v;}catch(_){return d;} }
  function lsSet(k,v){ try{localStorage.setItem(k,v);}catch(_){ } }
  function ssGet(k){ try{return sessionStorage.getItem(k);}catch(_){return null;} }
  function ssSet(k,v){ try{sessionStorage.setItem(k,v);}catch(_){ } }
  function ssDel(k){ try{sessionStorage.removeItem(k);}catch(_){ } }
  function onceKeyFromSummary(s){
    try {
      var mark = String((s && (s.mark || s.MARK)) || '').trim();
      var aa = String((s && (s.AA || s.aa || s.number || s.progressive_aa)) || '').trim();
      var afm = String((s && (s.AFM_issuer || s.AFM || s.issuer_vat)) || '').trim();
      var date = String((s && (s.issueDate || s.issue_date || s.date)) || '').trim();
      return 'rc-direct:' + [mark, aa, afm, date].join('|');
    } catch(_) {
      return 'rc-direct:' + String((s && (s.mark || s.MARK)) || '').trim();
    }
  }
  function isReceipts(){ try{var sw=$id('useReceiptsSwitch'); if(sw) return !!sw.checked;}catch(_){}
                         return lsGet('UI:useReceipts','0')==='1'; }
  function isRepeat(){   try{var rs=$id('repeatEntrySwitch'); if(rs) return !!rs.checked;}catch(_){}
                         return lsGet('REPEAT:enabled','0')==='1'; }
  function isMixedMode(){
    try{
      var mode = localStorage.getItem('rc:receiptMode') || 'mixed';
      return String(mode || '').toLowerCase() !== 'analysis';
    }catch(_){ return true; }
  }
  function parseSummary(){
    var el=$id('summaryJsonInput');
    if(!el || !el.value || el.value==='{}' || el.value==='null') return null;
    try{ return JSON.parse(el.value); }catch(_){ return null; }
  }
  function isReceiptSummary(s){
    if(!s||typeof s!=='object') return false;
    if(s.is_receipt===true) return true;
    var t=String(s.type_name||s.type||'').toLowerCase();
    if(t.includes('απόδει') || t.includes('receipt')) return true;
    var ui=String(s.ui_hint||'').toLowerCase();
    if(ui.includes('λήφθηκε')&&ui.includes('αποδεί')) return true;
    return false;
  }
  function hasLines(s){
    try{
      if(Array.isArray(s.lines) && s.lines.length>0){
        for(var i=0;i<s.lines.length;i++){
          var l = s.lines[i] || {};
          var amt = String(l.amount || l.total || l.lineTotal || '').trim();
          var vat = String(l.vat || l.vatRate || '').trim();
          var cat = String(l.category || '').trim();
          if(amt || vat || cat) return true;
        }
      }
      // mixed receipts can be header-only
      var total = String((s.totalValue || s.total_amount || s.totalNetValue || '')).trim();
      var aa = String((s.AA || s.aa || s.number || s.progressive_aa || '')).trim();
      return !!(total || aa);
    }catch(_){ return false; }
  }
  function normalizeReceipt(s){
    try{
      s.is_receipt=true;
      s.category=s.category||'αποδειξακια';
      s.characteristic=s.characteristic||'αποδειξακια';
      if(!Array.isArray(s.lines)) s.lines=[];
      s.lines=s.lines.map(function(l){ l=l||{}; l.category='αποδειξακια'; return l; });
    }catch(_){}
    return s;
  }
  function submitViaForm(s){
    var form=$id('saveSummaryForm');
    var input=$id('summaryJsonInput');
    if(form && input){
      input.value=JSON.stringify(s);
      if(typeof form.requestSubmit==='function') form.requestSubmit(); else form.submit();
      return true;
    }
    return false;
  }
  function submitViaFetch(s){
    try{
      return fetch('/save_summary',{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded'},
        body:'summary_json='+encodeURIComponent(JSON.stringify(s)),
        credentials:'same-origin'
      }).then(function(r){ if(!r.ok) throw new Error('save failed'); return r.text(); });
    }catch(e){ return Promise.reject(e); }
  }
  function submitViaConfirmApi(s){
    try{
      var scrapeUrl = '';
      try {
        scrapeUrl = (($id('scrapeUrlField') && $id('scrapeUrlField').value) || ($id('scrapeUrlInput') && $id('scrapeUrlInput').value) || '').trim();
      } catch(_) {}

      return fetch('/api/confirm_receipt', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          url: scrapeUrl,
          summary: s,
          force: false,
          category: 'αποδειξακια',
          receipt_analysis_enabled: false
        })
      }).then(function(r){
        return r.json().catch(function(){ return null; }).then(function(j){ return { r: r, j: j }; });
      }).then(function(out){
        if(!out.r.ok || !out.j || !out.j.ok){
          throw new Error((out.j && out.j.error) ? out.j.error : ('save failed (' + out.r.status + ')'));
        }
        return out.j;
      });
    }catch(e){ return Promise.reject(e); }
  }
  function afterSubmit(mark, dedupeKey){
    lsSet('UI:useReceipts','1');
    if (dedupeKey) ssDel(dedupeKey);
    try{
      var successMsg = 'Αποθηκεύτηκε η απόδειξη (repeat).';
      if (window.showFlash) window.showFlash(successMsg, 'success', 4200);
      if (window.persistReceiptFlash) window.persistReceiptFlash(successMsg, 'success');
    }catch(_){ }
    try{
      var url=location.pathname+'?use_receipts=1';
      location.replace(url);
    }catch(_){ location.reload(); }
  }
  var trying=false;
  function tryDirect(){
    if(trying) return;
    if(!isReceipts()||!isRepeat()) return;
    if(!isMixedMode()) return;

    var s=parseSummary();
    if(!s||!isReceiptSummary(s)||!hasLines(s)) return;

    var mark=String(s.mark||s.MARK||'').trim();
    if(!mark) return;
    var k=onceKeyFromSummary(s);
    var prevTs = parseInt(ssGet(k) || '0', 10);
    var nowTs = Date.now();
    // anti-double-submit window, but do not block forever
    if(prevTs && !isNaN(prevTs) && (nowTs - prevTs) < 4000) return;
    ssSet(k, String(nowTs));
    trying=true;

    s = normalizeReceipt(s);

    // Merge live component state (`summaryDataInput`) so MTYPE set in the component is not lost
    try {
      var compEl = document.getElementById('summaryDataInput');
      if (compEl && compEl.value && compEl.value !== '{}' ) {
        try {
          var comp = JSON.parse(compEl.value || '{}') || {};
          if (comp && typeof comp === 'object') {
            if (comp.mtype) s.mtype = comp.mtype;
            if (comp.receipt_mtype) s.receipt_mtype = comp.receipt_mtype;
            if (comp.invoice_mtype) s.invoice_mtype = comp.invoice_mtype;
            if (comp.receiptMtype) s.receipt_mtype = comp.receiptMtype;
            if (comp.invoiceMtype) s.invoice_mtype = comp.invoiceMtype;
            if (comp.lines) s.lines = comp.lines;
          }
        } catch(e){ /* ignore parse errors */ }
      }

      // If still missing, try localStorage / cached repeat_entry as a fallback —
      // this covers the UX where the user saved the "Κωδικός Κίνησης Αποδείξεων"
      // but the modal/component state wasn't mirrored into #summaryDataInput yet.
      if ((!s.mtype || s.mtype === '') && (!s.receipt_mtype || s.receipt_mtype === '')) {
        try {
          var saved = (window.__cachedReceiptMtype || null) || (localStorage && localStorage.getItem && localStorage.getItem('receipt_mtype')) || null;
          if (saved) {
            s.mtype = s.mtype || saved;
            s.receipt_mtype = s.receipt_mtype || saved;
          }
        } catch(_) { /* ignore localStorage */ }
      }
    } catch(e) { /* ignore */ }

    submitViaConfirmApi(s)
      .then(function(){ afterSubmit(mark, k); })
      .catch(function(err){
        // Fallback path (legacy) only if direct API failed
        if(submitViaForm(s)){
          setTimeout(function(){
            trying=false;
            ssDel(k);
          }, 2500);
          return;
        }
        submitViaFetch(s).then(function(){ afterSubmit(mark, k); })
          .catch(function(err2){
            trying=false;
            ssDel(k);
            try{
              var msg = (err2 && err2.message) ? err2.message : ((err && err.message) ? err.message : 'server');
              var errMsg = 'Σφάλμα αποθήκευσης: ' + msg;
              if (window.showFlash) window.showFlash(errMsg, 'error', 6000);
              if (window.persistReceiptFlash) window.persistReceiptFlash(errMsg, 'error');
            }catch(_){ }
          });
      });
  }

  function patchOpenModal(){
    var old = window.openModal;
    window.openModal = function(id){
      if(id==='summaryModal' && isReceipts() && isRepeat() && isMixedMode()){
        tryDirect();
        return;
      }
      if(typeof old==='function') return old.apply(this, arguments);
    };
  }

  document.addEventListener('DOMContentLoaded', function(){
    try{
      if(lsGet('UI:useReceipts','0')==='1'){
        var sw=$id('useReceiptsSwitch');
        if(sw && !sw.checked){ sw.checked=true; try{ sw.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){ } }
      }
    }catch(_){}

    tryDirect();
    setTimeout(tryDirect, 0);
    setTimeout(tryDirect, 250);
    setTimeout(tryDirect, 750);

    var el=$id('summaryJsonInput');
    if(el){
      var prev=el.value;
      setInterval(function(){
        if(el.value!==prev){ prev=el.value; tryDirect(); }
      }, 200);
    }

    var r1=$id('useReceiptsSwitch'), r2=$id('repeatEntrySwitch');
    if(r1) r1.addEventListener('change', function(){ if(this.checked) setTimeout(tryDirect,10); });
    if(r2) r2.addEventListener('change', function(){ if(this.checked) setTimeout(tryDirect,10); });

    patchOpenModal();
  });
})();
