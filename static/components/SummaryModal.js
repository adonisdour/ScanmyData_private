/**
 * SummaryModal - Main modal for displaying & editing receipt/invoice summaries
 * Features:
 * - Single/multi-line rendering (buttons vs table)
 * - MTYPE selection for invoices & receipts
 * - Category assignment persistence
 * - Dark mode support
 * - localStorage fallback
 */

import { ModalManager, SubmitGuard, FocusManager } from '../utils/modalHelpers.js';
import {
  escapeHtml,
  getLabelForCategory,
  normalizeSummary,
  buildSingleLineHTML,
  buildTableHTML,
  readCategoriesFromUI,
  persistSummaryToInput
} from '../utils/summaryHelpers.js';

export class SummaryModal extends ModalManager {
  constructor(options = {}) {
    const element = options.element || document.getElementById('summaryModal');
    super(element);

    this.options = {
      categories: options.categories || [],
      expenseCategories: options.expenseCategories || window.G_CATEGORY_DATA?.expense_categories || [],
      mtypeOptions: options.mtypeOptions || window.G_CATEGORY_DATA?.mtype_options || {},
      allowMtypeChange: options.allowMtypeChange !== false,
      showSaveButton: options.showSaveButton !== false,
      ...options
    };

    this.currentSummary = null;
    this.submitGuard = new SubmitGuard();
    this.focusManager = new FocusManager();

    this._setupDOM();
    this._wireEvents();
  }

  _setupDOM() {
    if (!this.element) {
      // Create modal if not exists
      const html = this._getModalHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      this.element = document.getElementById('summaryModal');
    }
  }

  _getModalHTML() {
    return `
      <div id="summaryModal" class="modal-summary" role="dialog" aria-modal="true" aria-labelledby="summaryModalTitle">
        <div class="modal-summary-backdrop"></div>
        <div class="modal-summary-card">
          <!-- Header -->
          <div class="modal-summary-header">
            <h2 id="summaryModalTitle" class="modal-summary-title">Περίληψη</h2>
            <button class="modal-summary-close" aria-label="Κλείσιμο" type="button">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          <!-- Info Grid -->
          <div class="modal-summary-info">
            <div class="info-row">
              <label>MARK / Αποδ/Κία:</label>
              <span id="summaryMark" class="info-value">--</span>
            </div>
            <div class="info-row">
              <label>Ημ/νία:</label>
              <span id="summaryDate" class="info-value">--</span>
            </div>
            <div class="info-row">
              <label>ΑΦΜ Εταιρείας:</label>
              <span id="summaryCompanyAfm" class="info-value">--</span>
            </div>
            <div class="info-row">
              <label>Σύνολο:</label>
              <span id="summaryTotal" class="info-value">--</span>
            </div>
            <div class="info-row">
              <label>Σύνολο ΦΠΑ:</label>
              <span id="summaryVatTotal" class="info-value">--</span>
            </div>
            <div class="info-row">
              <label>Ολικό Ποσό:</label>
              <span id="summaryGrandTotal" class="info-value">--</span>
            </div>
          </div>

          <!-- Summary Lines Container -->
          <div id="summaryLinesContainer" class="modal-summary-lines"></div>

          <!-- Invoice MTYPE (conditional) -->
          <div id="invoiceMtypeContainer" class="mtype-container" style="display: none;">
            <label for="invoiceMtypeSelect">Τύπος Τιμολογίου:</label>
            <select id="invoiceMtypeSelect" name="invoice_mtype">
              <option value="">-- επίλεξε --</option>
            </select>
          </div>

          <!-- Receipt MTYPE (conditional) -->
          <div id="receiptMtypeContainerSummary" class="mtype-container" style="display: none;">
            <label for="receiptMtypeSelectSummary">Τύπος Απόδειξης:</label>
            <select id="receiptMtypeSelectSummary" name="receipt_mtype_summary">
              <option value="">-- επίλεξε --</option>
            </select>
          </div>

          <!-- Actions -->
          <div class="modal-summary-actions">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Ακύρωση</button>
            <button type="button" class="btn btn-primary modal-save-btn" id="summaryModalSaveBtn">
              Αποθήκευση
            </button>
          </div>

          <!-- Hidden form inputs for backend -->
          <input type="hidden" id="summaryDataInput" name="summary_data" value="{}">
        </div>
      </div>
    `;
  }

  _wireEvents() {
    if (!this.element) return;

    // Close button
    const closeBtn = this.element.querySelector('.modal-summary-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    const cancelBtn = this.element.querySelector('.modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Save button
    const saveBtn = this.element.querySelector('.modal-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleSave();
      });
    }

    // Escape key close
    this.wireEscapeKey();

    // Backdrop close
    this.wireBackdropClose();
  }

  /**
   * Display modal with summary data
   */
  show(summary, options = {}) {
    const normalized = normalizeSummary(summary);
    this.currentSummary = { ...normalized };

    // Update info fields
    this.element.querySelector('#summaryMark').textContent = escapeHtml(summary.mark || '--');
    this.element.querySelector('#summaryDate').textContent = escapeHtml(summary.date || '--');
    this.element.querySelector('#summaryCompanyAfm').textContent = escapeHtml(summary.companyAfm || '--');
    this.element.querySelector('#summaryTotal').textContent = escapeHtml(String(summary.total || '--'));
    this.element.querySelector('#summaryVatTotal').textContent = escapeHtml(String(summary.vatTotal || '--'));
    this.element.querySelector('#summaryGrandTotal').textContent = escapeHtml(String(summary.grandTotal || '--'));

    // Render lines
    const linesContainer = this.element.querySelector('#summaryLinesContainer');
    if (linesContainer) {
      this._renderLines(normalized.lines || []);
    }

    // Setup MTYPE selectors
    this._setupMtypeSelectors(summary);

    // Set up callbacks
    if (options.onSave) this.onSave = options.onSave;
    if (options.onClose) this.onClose = options.onClose;

    // Open modal and focus
    this.open();
    setTimeout(() => {
      this.focusManager.init(this.element);
      const firstFocusable = this.element?.querySelector('select, input, button');
      if (firstFocusable) firstFocusable.focus();
    }, 100);
  }

  _renderLines(lines) {
    const container = this.element.querySelector('#summaryLinesContainer');
    if (!container) return;

    const summary = {
      lines: lines,
      ...this.currentSummary
    };

    // Import and use summary helpers
    const categories = this.options.expenseCategories || [];
    if (lines.length === 1) {
      container.innerHTML = '';
      container.appendChild(buildSingleLineHTML(lines[0], categories));
    } else if (lines.length > 1) {
      container.innerHTML = '';
      container.appendChild(buildTableHTML(lines, categories));
    } else {
      container.innerHTML = '<div class="summary-empty-warning">Δεν βρέθηκαν γραμμές.</div>';
    }

    // Wire up change handlers
    this._wireLineInteractions();
  }

  _wireLineInteractions() {
    const container = this.element.querySelector('#summaryLinesContainer');
    if (!container) return;

    // Wire select changes
    container.querySelectorAll('select.expense-category').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const lineId = e.target.dataset.lineId || '';
        const value = e.target.value || '';
        this._updateLineCategory(lineId, value);
      });
    });

    // Wire button clicks for single-line UI
    container.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const lineId = btn.dataset.lineId || '';
        const cat = btn.dataset.cat || '';
        const isActive = btn.classList.contains('active');

        // Clear all buttons in this group
        const wrapper = btn.closest('.summary-line-card');
        if (wrapper) {
          wrapper.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
          if (!isActive) {
            btn.classList.add('active');
            this._updateLineCategory(lineId, cat);
          } else {
            this._updateLineCategory(lineId, '');
          }
        }
      });
    });

    // Wire clear buttons
    container.querySelectorAll('.clear-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const wrapper = btn.closest('.summary-line-card');
        if (wrapper) {
          wrapper.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
          const lineId = wrapper.dataset.lineId || '';
          this._updateLineCategory(lineId, '');
        }
      });
    });
  }

  _updateLineCategory(lineId, category) {
    // Update in-memory summary
    const line = this.currentSummary.lines?.find(l => (l.id || l.line_id) === lineId);
    if (line) {
      line.category = category || '';
    }
  }

  _setupMtypeSelectors(summary) {
    const invoiceContainer = this.element.querySelector('#invoiceMtypeContainer');
    const receiptContainer = this.element.querySelector('#receiptMtypeContainerSummary');
    const invoiceSelect = this.element.querySelector('#invoiceMtypeSelect');
    const receiptSelect = this.element.querySelector('#receiptMtypeSelectSummary');

    // Check if MTYPE is available for this category
    const docType = summary.docType || summary.type || '';
    const hasInvoiceMtype = this.options.mtypeOptions?.invoice?.length > 0;
    const hasReceiptMtype = this.options.mtypeOptions?.receipt?.length > 0;

    // Show/hide containers
    if (invoiceContainer && hasInvoiceMtype && docType === 'invoice') {
      invoiceContainer.style.display = 'block';
      this._populateMtypeSelect(invoiceSelect, this.options.mtypeOptions.invoice, summary.invoiceMtype || '');
    } else if (invoiceContainer) {
      invoiceContainer.style.display = 'none';
    }

    if (receiptContainer && hasReceiptMtype && docType === 'receipt') {
      receiptContainer.style.display = 'block';
      this._populateMtypeSelect(receiptSelect, this.options.mtypeOptions.receipt, summary.receiptMtype || '');
    } else if (receiptContainer) {
      receiptContainer.style.display = 'none';
    }
  }

  _populateMtypeSelect(select, options, currentValue) {
    if (!select || !options) return;

    select.innerHTML = '<option value="">-- επίλεξε --</option>';
    (Array.isArray(options) ? options : Object.keys(options)).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === currentValue) o.selected = true;
      select.appendChild(o);
    });
  }

  _handleSave() {
    if (!this.submitGuard.canSubmit()) return;

    this.submitGuard.lock();

    try {
      // Read categories from UI
      const linesContainer = this.element.querySelector('#summaryLinesContainer');
      const categoriesFromUI = readCategoriesFromUI(linesContainer);

      // Update summary with selected categories
      if (this.currentSummary.lines) {
        this.currentSummary.lines.forEach(line => {
          const lineId = line.id || line.line_id || '';
          if (lineId in categoriesFromUI) {
            line.category = categoriesFromUI[lineId];
          }
        });
      }

      // Read MTYPE selections
      const invoiceSelect = this.element.querySelector('#invoiceMtypeSelect');
      const receiptSelect = this.element.querySelector('#receiptMtypeSelectSummary');

      if (invoiceSelect && invoiceSelect.style.display !== 'none') {
        this.currentSummary.invoiceMtype = invoiceSelect.value || '';
      }

      if (receiptSelect && receiptSelect.style.display !== 'none') {
        this.currentSummary.receiptMtype = receiptSelect.value || '';
      }

      // Persist to hidden input
      persistSummaryToInput('summaryDataInput', this.currentSummary);

      // Call custom handler if provided
      if (this.onSave && typeof this.onSave === 'function') {
        this.onSave(this.currentSummary);
      }

      this.close();
    } finally {
      this.submitGuard.unlock();
    }
  }

  close() {
    this.focusManager.cleanup?.();
    if (this.onClose && typeof this.onClose === 'function') {
      this.onClose();
    }
    super.close();
  }

  /**
   * Get current summary state
   */
  getSummary() {
    return { ...this.currentSummary };
  }

  /**
   * Update summary data programmatically
   */
  updateSummary(summary) {
    this.currentSummary = normalizeSummary(summary);
  }
}

export default SummaryModal;
