/*! receipts_fast_flow.js
 * Seamless AJAX receipt flow when repeat mode is enabled
 * - No page reloads (scrape + save via AJAX)
 * - Respects all existing validation (checks for existing MARK, shows banner if needed)
 * - Auto-enabled when repeat + receipts mode both ON
 * - Uses same /save_summary endpoint as form (preserves all server-side logic)
 * 
 * NO USER BUTTON - automatically activates when repeat mode enabled
 */
(function(){
  if (window.__FAST_FLOW_ATTACHED__) return;
  window.__FAST_FLOW_ATTACHED__ = true;

  // ===== Helpers =====
  const $ = (sel) => document.querySelector(sel);
  const $id = (id) => document.getElementById(id);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(_) { return d; } };

  function isRepeatEnabled() {
    try { const sw = $id('repeatEntrySwitch'); if (sw) return !!sw.checked; } catch(_) {}
    return lsGet('REPEAT:enabled', '0') === '1';
  }

  function isReceiptsMode() {
    try { const sw = $id('useReceiptsSwitch'); if (sw) return !!sw.checked; } catch(_) {}
    return lsGet('UI:useReceipts', '0') === '1';
  }

  function getRepeatMapping() {
    try {
      const m = lsGet('REPEAT:mapping', '{}');
      return JSON.parse(m);
    } catch(_) { return {}; }
  }

  function showLoadingOverlay(msg = 'Σάρωση...') {
    let overlay = $id('fastFlowOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fastFlowOverlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-lg p-6 max-w-sm">
          <div class="flex items-center gap-3">
            <div class="animate-spin text-2xl">⏳</div>
            <div class="text-gray-700">${msg}</div>
          </div>
        </div>
      </div>
    `;
    overlay.style.display = 'block';
    return overlay;
  }

  function hideLoadingOverlay() {
    const overlay = $id('fastFlowOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function showFlash(msg, type = 'info', duration = 3000) {
    if (window.showFlash) {
      window.showFlash(msg, type, duration);
    } else {
      console.log('[' + type.toUpperCase() + ']', msg);
    }
  }

  function showExistingBanner(mark) {
    // Shows the yellow "already exists" banner and hides modal
    const banner = $id('existingBanner');
    if (banner) {
      banner.style.display = 'block';
      const modal = $id('summaryModal');
      if (modal) modal.style.display = 'none';
      return true;
    }
    return false;
  }

  function getModalElement() {
    return $id('summaryModal') || $('.modal-summary');
  }

  function showModal() {
    const modal = getModalElement();
    if (!modal) return false;
    modal.style.display = 'block';
    try { modal.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
    return true;
  }

  function hideModal() {
    const modal = getModalElement();
    if (modal) modal.style.display = 'none';
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // ===== Core AJAX flow =====
  async function scrapeReceiptViaAjax(url) {
    showLoadingOverlay('Σάρωση παραστατικού...');

    try {
      const res = await fetch('/api/scrape_receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Unknown scraper error');
      }

      hideLoadingOverlay();
      return data.raw || data;
    } catch (err) {
      hideLoadingOverlay();
      showFlash('❌ Σφάλμα σάρωσης: ' + err.message, 'error', 5000);
      throw err;
    }
  }

  function populateModalWithReceipt(receipt) {
    try {
      const summaryInput = $id('summaryJsonInput');
      if (summaryInput) {
        summaryInput.value = JSON.stringify(receipt);
      }

      // Apply repeat mapping if enabled
      if (isRepeatEnabled()) {
        const mapping = getRepeatMapping();
        if (mapping && typeof mapping === 'object') {
          const categoryInput = $id('summaryCategory');
          if (categoryInput && mapping.category) {
            categoryInput.value = mapping.category;
          }
          const charInput = $id('summaryCharacteristic');
          if (charInput && mapping.characteristic) {
            charInput.value = mapping.characteristic;
          }
        }
      }

      return true;
    } catch (err) {
      console.warn('Could not populate modal:', err.message);
      return false;
    }
  }

  async function submitReceiptViaAjax(receipt) {
    showLoadingOverlay('Αποθήκευση παραστατικού...');

    try {
      // Use /save_summary like the normal form does (preserves all server validation)
      const formData = new FormData();
      formData.append('summary_json', JSON.stringify(receipt));

      const res = await fetch('/save_summary', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin'
      });

      // Server may return:
      // - 302 redirect if existing MARK (Location header points to /search?allow_edit_existing=1)
      // - 200 if success
      // - Other status if error

      hideLoadingOverlay();

      // Check if server redirected (existing MARK)
      if (res.redirected || res.status === 302 || res.url.includes('allow_edit_existing')) {
        // Show the existing banner instead of error
        const mark = receipt.mark || receipt.MARK || '?';
        showFlash('Το MARK ' + mark + ' υπάρχει ήδη στο Excel', 'warning', 4000);
        showExistingBanner(mark);
        return false;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Save failed: ${res.status}`);
      }

      // Success - update table optimistically
      const urlInput = $id('scrapeUrlInput');
      if (urlInput) urlInput.value = '';

      const markInput = $id('markInput');
      if (markInput) markInput.value = '';

      showFlash('✓ Αποθηκεύτηκε η απόδειξη', 'success', 2500);
      hideModal();

      // Optionally reload to show new entry in table
      setTimeout(() => location.reload(), 800);

      return true;
    } catch (err) {
      hideLoadingOverlay();
      showFlash('❌ Σφάλμα αποθήκευσης: ' + err.message, 'error', 5000);
      return false;
    }
  }

  // ===== Form submit handler (auto-activates when repeat + receipts enabled) =====
  function hookFormSubmit() {
    const form = $id('markSearchForm');
    if (!form) return;

    // Capture original submit handler
    const originalHandler = form.onsubmit;

    form.addEventListener('submit', async function(evt) {
      // Only activate if BOTH repeat AND receipts mode enabled
      if (!isRepeatEnabled() || !isReceiptsMode()) {
        // Use normal flow
        return;
      }

      evt.preventDefault();

      const urlInput = $id('scrapeUrlInput');
      const url = urlInput ? urlInput.value.trim() : '';

      if (!url) {
        showFlash('⚠️ Παρακαλώ εισάγετε URL', 'warning', 2000);
        return;
      }

      try {
        // Step 1: Scrape via AJAX
        const receipt = await scrapeReceiptViaAjax(url);
        if (!receipt) {
          showFlash('❌ Δεν ήταν δυνατή η σάρωση', 'error', 3000);
          return;
        }

        // Step 2: Show modal with scraped data
        populateModalWithReceipt(receipt);
        showModal();

        // Step 3: Auto-submit if repeat enabled (which we know it is)
        setTimeout(() => {
          submitReceiptViaAjax(receipt).catch(err => {
            console.error('Auto-submit failed:', err);
          });
        }, 600);
      } catch (err) {
        console.error('Fast flow error:', err);
      }
    }, { capture: false });
  }

  // ===== Initialize =====
  function init() {
    hookFormSubmit();
    console.log('[fast-flow] Initialized - will activate when repeat + receipts mode enabled');
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
