/**
 * WarningModal - Unified warning/confirmation modal component
 * Supports AFM warnings, receipt warnings, and general confirmations
 * With full dark mode support and accessibility features
 */

import { ModalManager, FocusManager } from '../utils/modalHelpers.js';

export class WarningModal extends ModalManager {
  constructor(options = {}) {
    const element = options.element || document.getElementById('warningModal');
    super(element);

    this.options = {
      title: options.title || 'Προσοχή',
      body: options.body || '',
      severity: options.severity || 'warning', // 'warning', 'danger', 'info'
      actions: options.actions || [
        { label: 'Ακύρωση', id: 'cancel', action: () => this.close() },
        { label: 'Συνέχεια', id: 'continue', action: null }
      ],
      allowEscape: options.allowEscape !== false,
      backdropClose: options.backdropClose !== false,
      ...options
    };

    this.focusManager = new FocusManager();
    this._setupDOM();
    this._wireEvents();
  }

  _setupDOM() {
    if (!this.element) {
      // Create modal if not exists
      const html = this._getModalHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      this.element = document.getElementById('warningModal');
    }

    this._updateContent();
  }

  _getModalHTML() {
    return `
      <div id="warningModal" class="modal-warning" role="alertdialog" aria-modal="true">
        <div class="modal-warning-backdrop"></div>
        <div class="modal-warning-card">
          <div class="modal-warning-header">
            <h2 class="modal-warning-title"></h2>
            <button class="modal-warning-close" aria-label="Κλείσιμο" type="button">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-warning-body"></div>
          <div class="modal-warning-actions"></div>
        </div>
      </div>
    `;
  }

  _updateContent() {
    if (!this.element) return;

    const titleEl = this.element.querySelector('.modal-warning-title');
    const bodyEl = this.element.querySelector('.modal-warning-body');
    const actionsEl = this.element.querySelector('.modal-warning-actions');

    // Update title
    if (titleEl) titleEl.textContent = this.options.title || 'Προσοχή';

    // Update body
    if (bodyEl) {
      if (typeof this.options.body === 'string') {
        bodyEl.textContent = this.options.body;
      } else if (this.options.body instanceof HTMLElement) {
        bodyEl.innerHTML = '';
        bodyEl.appendChild(this.options.body);
      } else {
        bodyEl.innerHTML = String(this.options.body || '');
      }
    }

    // Update severity class
    this.element.className = `modal-warning severity-${this.options.severity}`;

    // Rebuild action buttons
    if (actionsEl) {
      actionsEl.innerHTML = '';
      (this.options.actions || []).forEach(action => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `modal-action-btn btn-${action.id || 'action'}`;
        btn.textContent = action.label || 'OK';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (action.action && typeof action.action === 'function') {
            action.action.call(this);
          }
        });
        actionsEl.appendChild(btn);
      });
    }
  }

  _wireEvents() {
    if (!this.element) return;

    // Close button
    const closeBtn = this.element.querySelector('.modal-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Escape key
    if (this.options.allowEscape) {
      this.wireEscapeKey();
    }

    // Backdrop close
    if (this.options.backdropClose) {
      this.wireBackdropClose();
    }
  }

  show(options = {}) {
    // Allow runtime option updates
    if (options.title !== undefined) this.options.title = options.title;
    if (options.body !== undefined) this.options.body = options.body;
    if (options.severity !== undefined) this.options.severity = options.severity;
    if (options.actions !== undefined) this.options.actions = options.actions;

    this._updateContent();
    this.open();

    // Set focus to first action button
    const firstBtn = this.element?.querySelector('.modal-action-btn');
    if (firstBtn) {
      setTimeout(() => firstBtn.focus(), 100);
    }

    // Setup focus trap
    this.focusManager.init(this.element);
  }

  close() {
    this.focusManager.cleanup?.();
    super.close();
  }

  /**
   * Set action handler at runtime
   */
  setAction(actionId, handler) {
    const action = this.options.actions?.find(a => a.id === actionId);
    if (action) {
      action.action = handler;
    }
  }

  /**
   * Factory methods for common warning types
   */
  static createAFMWarning(afm, onContinue) {
    return new WarningModal({
      title: 'Προσοχή: ΑΦΜ δεν ήταν έγκυρο',
      body: `Το ΑΦΜ "${afm}" δεν σύστημα αναγνώρισης. Θέλετε να συνεχίσετε παρόλα αυτά;`,
      severity: 'warning',
      actions: [
        { label: 'Ακύρωση', id: 'cancel', action: () => warningModal.close() },
        { label: 'Συνέχεια', id: 'continue', action: onContinue }
      ],
      allowEscape: true,
      backdropClose: true
    });
  }

  static createReceiptWarning(onContinue) {
    return new WarningModal({
      title: 'Προσοχή: Απόδειξη χωρίς Repeat',
      body: 'Αυτή η απόδειξη δεν έχει κανόνα επανάληψης. Θέλετε να συνεχίσετε;',
      severity: 'warning',
      actions: [
        { label: 'Ακύρωση', id: 'cancel', action: () => warningModal.close() },
        { label: 'Συνέχεια', id: 'continue', action: onContinue }
      ],
      allowEscape: true,
      backdropClose: true
    });
  }

  static createConfirmation(title, body, onConfirm, onCancel) {
    return new WarningModal({
      title: title || 'Επιβεβαίωση',
      body: body || 'Είστε σίγουροι;',
      severity: 'info',
      actions: [
        { label: 'Ακύρωση', id: 'cancel', action: onCancel || (() => {}) },
        { label: 'Επιβεβαίωση', id: 'confirm', action: onConfirm }
      ],
      allowEscape: true,
      backdropClose: true
    });
  }
}

export default WarningModal;
