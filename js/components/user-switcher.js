/**
 * User Profile Card & Session Control (Sidebar Footer)
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { getInitials, escapeHtml } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { updateComposerDisabledState } from './composer.js';
import { updateExportBtnDisabledState } from '../utils/export-excel.js';
import { logoutUser } from '../services/auth-service.js';
import { hasPermission } from '../services/user-service.js';
import { updateNavigationVisibility } from './navigation.js';

export function setupUserSwitcher(onUserSwitch) {
  const container = document.getElementById('userProfileCardWrap');
  if (!container) return;

  renderUserSwitcher(container, onUserSwitch);
}

export function renderUserSwitcher(container, onUserSwitch) {
  if (!container) return;

  // Security Check: If current active user was deleted, trigger immediate logout
  if (state.currentUser && !['super_admin', 'admin'].includes(state.currentUser.role) && !state.teamMembers.some(u => u.id === state.currentUser.id)) {
    logoutUser(() => {
      showToast("Your account has been removed.", "error");
      if (onUserSwitch) onUserSwitch(null);
    });
    return;
  }

  const current = state.currentUser || { id: 'usr_admin', name: 'Super Admin', role: 'super_admin' };
  const initials = getInitials(current.name);
  const isMaker = current.role === 'maker' || current.role === 'agent';
  const isDisabled = current.status === 'disabled';
  
  let roleLabel = 'MAKER';
  if (current.role === 'super_admin' || current.role === 'admin') roleLabel = 'SUPER ADMIN';
  else if (current.role === 'sub_admin') roleLabel = 'SUB ADMIN';
  else if (isMaker) roleLabel = 'MAKER';

  if (isDisabled) roleLabel = 'DISABLED';

  // Update navigation visibility according to RBAC permissions
  updateNavigationVisibility();

  // Update composer and export button locking for disabled status
  updateComposerDisabledState();
  updateExportBtnDisabledState();

  const isSuperAdmin = current.role === 'super_admin' || current.role === 'admin';
  const hasCustomName = current.name && current.name.trim() !== '' && current.name.toLowerCase() !== 'super admin' && !isSuperAdmin;

  container.innerHTML = `
    <div class="user-profile-switcher-card ${isDisabled ? 'card-disabled' : ''}">
      <div class="user-avatar-initials ${isMaker ? 'agent-avatar' : ''} ${isDisabled ? 'disabled-avatar' : ''}">${escapeHtml(initials)}</div>
      <div class="user-info-switcher">
        ${hasCustomName ? `<div class="user-name-switcher" title="${escapeHtml(current.name)}">${escapeHtml(current.name)}</div>` : ''}
        <div class="user-role-select-row">
          <span class="user-role-badge ${isDisabled ? 'disabled' : current.role}">${escapeHtml(roleLabel)}</span>
        </div>
      </div>
      <button type="button" id="logoutBtn" class="btn-logout" title="Sign Out">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>
  `;

  const logoutBtn = container.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutUser(() => {
        if (onUserSwitch) onUserSwitch(null);
      });
    });
  }
}
