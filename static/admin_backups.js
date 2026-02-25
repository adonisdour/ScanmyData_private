// Admin Backups Tab - AJAX restore with confirmation

// ============================================================================
// LOCAL BACKUPS
// ============================================================================

async function restoreLocalBackupAjax(backupName) {
    const groupId = document.getElementById(`groupSelect_${backupName}`).value;
    if (!groupId) {
        // if user forgot to pick, try defaulting to first available group
        const sel = document.getElementById(`groupSelect_${backupName}`);
        if (sel && sel.options.length > 1) {
            groupId = sel.options[1].value; // first non-placeholder
            if (groupId) {
                sel.value = groupId;
            }
        }
        if (!groupId) {
            try{ await showModalAlert('Ενημέρωση', 'Please select a group'); }catch(_){ }
            return;
        }
    }
    
    try{
      const ok = await showModalConfirm('Επιβεβαίωση', `Restore local backup to selected group? This will overwrite existing data.`,'Restore','Άκυρο');
      if(!ok) return;
    }catch(_){ return; }

    try{
      const formData = new FormData();
      formData.append('group_id', groupId);
      // strip leading slash if present (remote backups come prefixed with '/backups/...')
      let name = backupName.replace(/^\/+/, '');
      const resp = await fetch(`/admin/backups/restore/${encodeURIComponent(name)}`, { method: 'POST', credentials: 'same-origin', body: formData });
      const data = await resp.json().catch(()=>({}));
      if (data.ok || data.success) {
          try{ await showModalAlert('Επιτυχία', 'Restore successful'); }catch(_){ }
          location.reload();
      } else {
          try{ await showModalAlert('Σφάλμα', 'Restore failed: ' + (data.error || data.message)); }catch(_){ }
      }
    }catch(err){ try{ await showModalAlert('Σφάλμα', 'Error: ' + String(err)); }catch(_){ } }
}

// Keep old name for backward compatibility
function restoreBackupAjax(backupName) {
    restoreLocalBackupAjax(backupName);
}

// ============================================================================
// REMOTE BACKUPS (Firebase)
// ============================================================================

let remoteBackupList = [];
let selectedBackupPath = null;

function loadRemoteBackups() {
    const container = document.getElementById('remoteBackupsContainer');
    container.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div> Loading remote backups...';
    
    fetch('/admin/api/backup/list')
        .then(resp => resp.json())
        .then(data => {
            if (!data.success) {
                container.innerHTML = `<div class="alert alert-danger">Failed to load: ${data.error || 'Unknown error'}</div>`;
                return;
            }
            
            remoteBackupList = data.backups || [];
            renderRemoteBackups();
        })
        .catch(err => {
            container.innerHTML = `<div class="alert alert-danger">Error: ${err}</div>`;
        });
}

function renderRemoteBackups() {
    const container = document.getElementById('remoteBackupsContainer');
    
    if (!remoteBackupList || remoteBackupList.length === 0) {
        container.innerHTML = '<p class="text-muted">No remote backups available in Firebase</p>';
        return;
    }
    
    let html = '<table class="table table-striped"><thead class="table-dark"><tr><th>Backup Path</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead><tbody>';
    
    remoteBackupList.forEach(backup => {
        html += `
            <tr>
                <td><code>${backup.name}</code></td>
                <td>${backup.size_mb} MB</td>
                <td>${backup.created_at}</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="openRemoteRestoreModal('${backup.name}')">Restore</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRemoteBackup('${backup.name}')">Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function openRemoteRestoreModal(backupPath) {
    selectedBackupPath = backupPath;
    document.getElementById('modalBackupPath').textContent = `Backup: ${backupPath}`;
    document.getElementById('targetGroupId').value = '';
    document.getElementById('selectAllGroups').checked = false;
    document.getElementById('groupChecklistContainer').innerHTML = '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('remoteRestoreModal'));
    modal.show();
}

function toggleAllGroups() {
    const checked = document.getElementById('selectAllGroups').checked;
    const checkboxes = document.querySelectorAll('.groupCheckbox');
    checkboxes.forEach(cb => cb.checked = checked);
}

async function doRemoteRestore() {
    if (!selectedBackupPath) {
        try{ await showModalAlert('Ενημέρωση', 'No backup selected'); }catch(_){ }
        return;
    }
    
    const targetGroupId = document.getElementById('targetGroupId').value;
    const selectedCheckboxes = document.querySelectorAll('.groupCheckbox:checked');
    
    let groups = null;
    if (selectedCheckboxes.length > 0) {
        groups = Array.from(selectedCheckboxes).map(cb => cb.value);
    }
    
    if (!targetGroupId && (!groups || groups.length === 0)) {
        try{ await showModalAlert('Ενημέρωση', 'Please select either a target group or specific groups to restore'); }catch(_){ }
        return;
    }
    
    try{
      const ok = await showModalConfirm('Επιβεβαίωση', 'Restore from remote backup? This will overwrite existing data.','Restore','Άκυρο');
      if(!ok) return;
    }catch(_){ return; }

    const payload = {
        backup_path: selectedBackupPath,
        target_group_id: targetGroupId ? parseInt(targetGroupId) : null,
        groups: groups
    };

    try{
      const resp = await fetch('/admin/api/backup/restore', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) {
          let errMsg = `HTTP ${resp.status}`;
          try {
              const errData = await resp.json();
              errMsg = errData.error || JSON.stringify(errData);
          } catch (_) {}
          throw new Error(errMsg);
      }
      const data = await resp.json().catch(()=>({}));
      if (data.success) {
          try{ await showModalAlert('Επιτυχία', `Restore successful. Restored groups: ${(data.restored || []).join(', ')}`); }catch(_){ }
          // Hide modal
          bootstrap.Modal.getInstance(document.getElementById('remoteRestoreModal')).hide();
          location.reload();
      } else {
          try{ await showModalAlert('Σφάλμα', `Restore failed: ${data.error || 'Unknown error'}`); }catch(_){ }
      }
    }catch(err){ try{ await showModalAlert('Σφάλμα', `Error: ${String(err)}`); }catch(_){ } }
}

async function deleteRemoteBackup(backupPath) {
    try{
      const ok = await showModalConfirm('Διαγραφή backup', `Delete remote backup: ${backupPath}? This cannot be undone.`,'Διαγραφή','Άκυρο');
      if(!ok) return;
    }catch(_){ return; }

    try{
      const resp = await fetch('/admin/api/backup', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup_path: backupPath }) });
      const data = await resp.json().catch(()=>({}));
      if (data.success) {
          try{ await showModalAlert('Επιτυχία', 'Backup deleted'); }catch(_){ }
          loadRemoteBackups();
      } else {
          try{ await showModalAlert('Σφάλμα', `Delete failed: ${data.error || 'Unknown error'}`); }catch(_){ }
      }
    }catch(err){ try{ await showModalAlert('Σφάλμα', `Error: ${String(err)}`); }catch(_){ } }
}
