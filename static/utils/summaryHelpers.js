/**
 * Summary Helpers - Rendering & persistence for modal summary
 */

export function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getLabelForCategory(val) {
  if (!val) return '';
  const key = String(val);
  const labels = window.CATEGORY_LABELS || {};
  if (labels[key]) {
    return labels[key];
  }
  return key;
}

export function normalizeSummary(summary) {
  if (!summary) summary = {};
  const lines = Array.isArray(summary.lines) ? summary.lines.slice() : [];
  const norm = lines.map((l, idx) => ({
    id: (l && (l.id || l.line_id)) ? String(l.id || l.line_id) : ('l' + idx),
    description: l && (l.description || l.desc || '') || '',
    amount: l && (l.amount || l.lineTotal || l.total || '') || '',
    vat: l && (l.vat || l.vatRate || '') || '',
    vatCategory: l && (l.vatCategory || l.vat_category || '') || '',
    category: l && (l.category || l.cat || '') || ''
  }));
  return { ...summary, lines: norm };
}

/**
 * Δημιουργία single-line UI (buttons)
 */
export function buildSingleLineHTML(line, categories = []) {
  const wrapper = document.createElement('div');
  wrapper.className = 'summary-line-card';
  wrapper.dataset.lineId = line.id || 'l0';

  const info = document.createElement('div');
  info.className = 'summary-line-info';
  info.innerHTML = `
    <div class="info-grid">
      <div>
        <strong>ΦΠΑ Κατηγορία</strong>
        <div>${escapeHtml(line.vatCategory || '')}</div>
      </div>
      <div>
        <strong>Ποσό</strong>
        <div>${escapeHtml(String(line.amount || ''))}</div>
      </div>
      <div>
        <strong>ΦΠΑ</strong>
        <div>${escapeHtml(String(line.vat || ''))}</div>
      </div>
    </div>
  `;
  wrapper.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'summary-line-controls';
  
  const label = document.createElement('strong');
  label.textContent = 'Επίλεξε Κατηγορία Εξόδου';
  controls.appendChild(label);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'category-buttons';

  (categories || []).forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-btn';
    btn.dataset.cat = c;
    btn.dataset.lineId = line.id || 'l0';
    btn.textContent = getLabelForCategory(c);

    if (c === line.category) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Toggle selection
      const isActive = btn.classList.contains('active');
      Array.from(btnWrap.querySelectorAll('.category-btn')).forEach(b => {
        b.classList.remove('active');
      });
      if (!isActive) {
        btn.classList.add('active');
      }
      // Update internal state
      window._updateSummaryLineCategory?.(line.id || 'l0', isActive ? '' : c);
    });

    btnWrap.appendChild(btn);
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'clear-btn';
  clearBtn.textContent = 'Καθαρισμός';
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    Array.from(btnWrap.querySelectorAll('.category-btn')).forEach(b => {
      b.classList.remove('active');
    });
    window._updateSummaryLineCategory?.(line.id || 'l0', '');
  });
  btnWrap.appendChild(clearBtn);

  controls.appendChild(btnWrap);
  wrapper.appendChild(controls);

  return wrapper;
}

/**
 * Δημιουργία table UI (multiple lines)
 */
export function buildTableHTML(lines, categories = []) {
  const table = document.createElement('table');
  table.className = 'summary-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>ΦΠΑ Κατηγορία</th>
      <th>Ποσό</th>
      <th>ΦΠΑ</th>
      <th>Κατηγορία Εξόδου</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  lines.forEach((ln, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.lineId = ln.id || ('l' + idx);
    tr.dataset.vat = ln.vatCategory || '';

    tr.innerHTML = `
      <td class="idx-col">${idx + 1}</td>
      <td class="vat-col">${escapeHtml(ln.vatCategory || '')}</td>
      <td class="amount-col">${escapeHtml(String(ln.amount || ''))}</td>
      <td class="vat-value-col">${escapeHtml(String(ln.vat || ''))}</td>
      <td class="cat-col"></td>
    `;

    const sel = document.createElement('select');
    sel.className = 'expense-category';
    sel.dataset.lineId = ln.id || ('l' + idx);
    sel.name = `category[${sel.dataset.lineId}]`;

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- επίλεξε --';
    sel.appendChild(emptyOpt);

    (categories || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = getLabelForCategory(c);
      if (c === ln.category) o.selected = true;
      sel.appendChild(o);
    });

    sel.addEventListener('change', () => {
      window._updateSummaryLineCategory?.(sel.dataset.lineId, sel.value);
    });

    tr.querySelector('.cat-col').appendChild(sel);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'summary-table-wrapper';
  wrapper.appendChild(table);

  return wrapper;
}

/**
 * Αποδοχή γραμμών σε container
 */
export function renderSummaryLines(container, summary, categories) {
  if (!container) return;

  const normalized = normalizeSummary(summary);
  const lines = normalized.lines || [];

  container.innerHTML = '';

  if (!lines.length) {
    const warn = document.createElement('div');
    warn.className = 'summary-empty-warning';
    warn.textContent = 'Δεν βρέθηκαν γραμμές για αυτό το MARK.';
    container.appendChild(warn);
    return;
  }

  if (lines.length === 1) {
    container.appendChild(buildSingleLineHTML(lines[0], categories));
  } else {
    container.appendChild(buildTableHTML(lines, categories));
  }
}

/**
 * Ανάγνωση κατηγοριών από UI
 */
export function readCategoriesFromUI(container) {
  const out = {};
  const selects = container?.querySelectorAll('select.expense-category');
  const buttons = container?.querySelectorAll('.category-btn.active');

  selects?.forEach(sel => {
    const lineId = sel.dataset.lineId || '';
    if (lineId) out[lineId] = sel.value || '';
  });

  buttons?.forEach(btn => {
    const lineId = btn.dataset.lineId || '';
    if (lineId && !out[lineId]) {
      out[lineId] = btn.dataset.cat || '';
    }
  });

  return out;
}

/**
 * Αποθήκευση summary σε hidden input
 */
export function persistSummaryToInput(inputId, summary) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = JSON.stringify(summary || {});
  }
}

export default {
  escapeHtml,
  getLabelForCategory,
  normalizeSummary,
  buildSingleLineHTML,
  buildTableHTML,
  renderSummaryLines,
  readCategoriesFromUI,
  persistSummaryToInput
};
