/**
 * Modal Helpers - Κοινές λειτουργίες για όλα τα modals
 * Χρήση: show/hide, event wiring, dark mode support
 */

export class ModalManager {
  constructor(modalId) {
    this.modalId = modalId;
    this.modal = document.getElementById(modalId);
    this.isOpen = false;
  }

  /**
   * Ανοίγει το modal με smooth fade-in
   */
  open() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');
    this.modal.style.display = 'flex';
    this.isOpen = true;
    // Trigger reflow για CSS animation
    this.modal.offsetHeight;
    this.modal.classList.add('modal-show');
    document.body.classList.add('modal-open');
  }

  /**
   * Κλείνει το modal με smooth fade-out
   */
  close() {
    if (!this.modal) return;
    this.modal.classList.remove('modal-show');
    setTimeout(() => {
      this.modal.style.display = 'none';
      this.modal.classList.add('hidden');
      this.isOpen = false;
      if (!document.querySelector('.modal-open[style*="flex"]')) {
        document.body.classList.remove('modal-open');
      }
    }, 200);
  }

  /**
   * Δύσκολο κλείσιμο (χωρίς animation)
   */
  forceClose() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
    this.modal.classList.add('hidden');
    this.isOpen = false;
    document.body.classList.remove('modal-open');
  }

  /**
   * Ενσύρματη τα κουμπιά κλεισίματος (X, Cancel, Close)
   */
  wireCloseButtons(selector = '[data-modal-close], .modal-close, [id$="CloseX"], [id$="CloseBtn"]') {
    const buttons = this.modal?.querySelectorAll(selector);
    buttons?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    });
  }

  /**
   * Κλείσιμο με click στο backdrop
   */
  wireBackdropClose() {
    if (!this.modal) return;
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });
  }

  /**
   * Δεσμός κλειδιού Escape
   */
  wireEscapeKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && this.modal) {
        this.close();
      }
    });
  }

  /**
   * Ενημέρωση περιεχομένου modal
   */
  setContent(selector, content) {
    const el = this.modal?.querySelector(selector);
    if (el) {
      if (typeof content === 'string') {
        el.textContent = content;
      } else {
        el.innerHTML = '';
        el.appendChild(content);
      }
    }
  }

  /**
   * Ενημέρωση κλάσης (για styling)
   */
  setClass(selector, className, add = true) {
    const el = this.modal?.querySelector(selector);
    if (el) {
      el.classList.toggle(className, add);
    }
  }

  /**
   * Άνοιγμα με callback
   */
  openWith(callback) {
    this.open();
    if (typeof callback === 'function') {
      callback();
    }
  }

  /**
   * Κλείσιμο με callback
   */
  closeWith(callback) {
    if (typeof callback === 'function') {
      callback();
    }
    this.close();
  }
}

/**
 * Flash Messages Helper
 */
export class FlashManager {
  constructor(containerId = 'clientFlashContainer') {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
  }

  show(message, type = 'info', timeout = 3000) {
    if (!this.container) {
      console.warn('Flash container not found');
      return;
    }

    const el = document.createElement('div');
    el.className = `flash-banner flash-${type}`;
    el.textContent = message;
    el.dataset.flashMessage = message;
    el.dataset.flashType = type;

    this.container.appendChild(el);

    if (timeout) {
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
      }, timeout);
    }

    return el;
  }

  success(message, timeout = 3000) {
    return this.show(message, 'success', timeout);
  }

  error(message, timeout = 4000) {
    return this.show(message, 'error', timeout);
  }

  info(message, timeout = 3000) {
    return this.show(message, 'info', timeout);
  }

  warning(message, timeout = 4000) {
    return this.show(message, 'warning', timeout);
  }
}

/**
 * Helper για αποφυγή διπλών submit
 */
export class SubmitGuard {
  constructor() {
    this.locked = false;
    this.lastSubmitTime = 0;
    this.lockDuration = 1200;
  }

  canSubmit() {
    const now = Date.now();
    if (this.locked && now - this.lastSubmitTime < this.lockDuration) {
      return false;
    }
    return true;
  }

  lock() {
    this.locked = true;
    this.lastSubmitTime = Date.now();
    setTimeout(() => {
      this.locked = false;
    }, this.lockDuration);
  }

  wireForm(form) {
    if (!form) return;
    form.addEventListener('submit', (e) => {
      if (!this.canSubmit()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
      this.lock();
    }, true);
  }
}

/**
 * Helper για focus management
 */
export class FocusManager {
  constructor(modalId) {
    this.modalId = modalId;
    this.modal = document.getElementById(modalId);
    this.focusableElements = [];
    this.firstElement = null;
    this.lastElement = null;
  }

  init() {
    if (!this.modal) return;
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    this.focusableElements = Array.from(
      this.modal.querySelectorAll(selector)
    ).filter(el => !el.hidden && el.offsetParent !== null);

    this.firstElement = this.focusableElements[0];
    this.lastElement = this.focusableElements[this.focusableElements.length - 1];
  }

  trap(event) {
    if (event.key !== 'Tab') return;
    if (event.shiftKey) {
      if (document.activeElement === this.firstElement) {
        event.preventDefault();
        this.lastElement?.focus();
      }
    } else {
      if (document.activeElement === this.lastElement) {
        event.preventDefault();
        this.firstElement?.focus();
      }
    }
  }

  wireKeyTrap() {
    if (!this.modal) return;
    this.init();
    this.modal.addEventListener('keydown', (e) => this.trap(e));
  }

  focusFirst() {
    this.firstElement?.focus();
  }
}

export default {
  ModalManager,
  FlashManager,
  SubmitGuard,
  FocusManager
};
