/**
 * Team Sub-Users Management Modal Component
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { escapeHtml, getInitials } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { addSubUser, toggleUserStatus, deleteSubUser, resetUserPassword, containsGoldCash } from '../services/user-service.js';
import { addAuditLog } from '../services/logging-service.js';

let pendingResetUserId = null;

export function setupTeamManagement(onTeamUpdated) {
  const form = document.getElementById('addTeamMemberForm');

  const clearFormFields = () => {
    const nameInput = document.getElementById('newMemberName');
    const emailInput = document.getElementById('newMemberEmail');
    const passwordInput = document.getElementById('newMemberPassword');
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
  };

  clearFormFields();
  setTimeout(clearFormFields, 100);
  setTimeout(clearFormFields, 300);

  // Setup Password Eye Toggle for Add New Member form
  const toggleAddPwdBtn = document.getElementById('toggleNewMemberPasswordBtn');
  const addPwdInput = document.getElementById('newMemberPassword');
  if (toggleAddPwdBtn && addPwdInput) {
    toggleAddPwdBtn.addEventListener('click', () => {
      const isPass = addPwdInput.type === 'password';
      addPwdInput.type = isPass ? 'text' : 'password';
      toggleAddPwdBtn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
  }

  updateRoleDropdownOptions();
  renderTeamList(onTeamUpdated);

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('newMemberName');
      const emailInput = document.getElementById('newMemberEmail');
      const passwordInput = document.getElementById('newMemberPassword');
      const roleSelect = document.getElementById('newMemberRole');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value.trim() : '';
      const role = roleSelect ? roleSelect.value : 'maker';

      if (!name || !email || !password) {
        showToast('Please fill in Name, Email, and Password', 'warning');
        return;
      }

      const newUser = addSubUser(name, email, password, role);
      const roleDisplay = getRoleLabel(newUser.role);
      addAuditLog('user_created', '', name, `Added user ${name} (${roleDisplay})`);
      showToast(`Added user ${name} (${roleDisplay})`, 'info');

      if (nameInput) nameInput.value = '';
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';

      renderTeamList(onTeamUpdated);
      if (onTeamUpdated) onTeamUpdated();
    });
  }

  // Setup Reset Password Modal Listeners
  setupResetPasswordModalListeners(onTeamUpdated);
}

function setupResetPasswordModalListeners(onTeamUpdated) {
  const modal = document.getElementById('resetPasswordModal');
  const closeBtn = document.getElementById('closeResetPasswordModalBtn');
  const cancelBtn = document.getElementById('cancelResetPasswordBtn');
  const form = document.getElementById('resetPasswordForm');
  const pwdInput = document.getElementById('newPasswordInput');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    if (pwdInput) {
      pwdInput.value = '';
      pwdInput.type = 'password';
    }
    const toggleResetPwdBtn = document.getElementById('toggleResetPasswordBtn');
    if (toggleResetPwdBtn) toggleResetPwdBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    pendingResetUserId = null;
  };

  // Setup Password Eye Toggle for Reset Password modal
  const toggleResetPwdBtn = document.getElementById('toggleResetPasswordBtn');
  if (toggleResetPwdBtn && pwdInput) {
    toggleResetPwdBtn.addEventListener('click', () => {
      const isPass = pwdInput.type === 'password';
      pwdInput.type = isPass ? 'text' : 'password';
      toggleResetPwdBtn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const newPassword = pwdInput ? pwdInput.value.trim() : '';
      if (!newPassword || !pendingResetUserId) {
        showToast('Please enter a valid new password', 'warning');
        return;
      }

      const updatedUser = resetUserPassword(pendingResetUserId, newPassword);
      if (updatedUser) {
        addAuditLog('password_reset', '', updatedUser.name, `Reset password for user ${updatedUser.name}`);
        showToast(`Password updated successfully for "${updatedUser.name}"`, 'info');
      }
      closeModal();
      renderTeamList(onTeamUpdated);
      if (onTeamUpdated) onTeamUpdated();
    });
  }
}

function updateRoleDropdownOptions() {
  const roleSelect = document.getElementById('newMemberRole');
  if (!roleSelect) return;

  const currentRole = state.currentUser ? state.currentUser.role : 'super_admin';

  if (currentRole === 'super_admin' || currentRole === 'admin') {
    roleSelect.innerHTML = `
      <option value="maker" selected>Maker</option>
      <option value="sub_admin">Sub Admin</option>
    `;
  } else {
    roleSelect.innerHTML = `
      <option value="maker" selected>Maker</option>
    `;
  }
}

function getRoleLabel(role) {
  if (role === 'super_admin' || role === 'admin') return 'SUPER ADMIN';
  if (role === 'sub_admin') return 'SUB ADMIN';
  if (role === 'maker' || role === 'agent') return 'MAKER';
  return (role || 'MAKER').toUpperCase();
}

export function renderTeamList(onTeamUpdated) {
  const container = document.getElementById('teamMembersListTable');
  const countEl = document.getElementById('teamMemberCount');
  if (!container) return;

  const allUsers = state.teamMembers || [];
  // Exclude Super Admin and any legacy Gold Cash accounts so the table only displays valid Zop One Sub Admins and Makers
  const users = allUsers.filter(u => 
    u.role !== 'super_admin' && 
    u.role !== 'admin' && 
    u.id !== 'usr_admin' && 
    !containsGoldCash(u.email) && 
    !containsGoldCash(u.name) && 
    u.email !== 'admin@zopmedia.com' && 
    u.email !== 'admin@zopcrm.com'
  );
  if (countEl) countEl.textContent = users.length;

  if (users.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 36px 20px; color: #64748b; background: #ffffff; border-radius: 8px;">
        <i class="fa-solid fa-users-slash" style="font-size: 28px; margin-bottom: 8px; color: #94a3b8; display: block;"></i>
        <strong style="display: block; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">No Sub-Users Created Yet</strong>
        <span style="font-size: 12.5px;">Click "+ Add Sub-User" above to create Sub Admins or Makers.</span>
      </div>
    `;
    return;
  }

  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';
  const isSuperAdmin = performerRole === 'super_admin' || performerRole === 'admin';

  container.innerHTML = users.map(user => {
    const initials = getInitials(user.name);
    const isCurrent = user.id === (state.currentUser ? state.currentUser.id : '');
    const statusClass = user.status === 'active' ? 'status-active' : 'status-disabled';
    const roleLabel = getRoleLabel(user.role);

    // Permission rules for action buttons:
    // 1. Super Admin row cannot be modified by anyone
    // 2. Sub Admin row can be modified by Super Admin, but protected from other Sub Admins
    // 3. Maker row can be modified by Super Admin and Sub Admin
    let isProtected = false;
    if (user.role === 'super_admin' || user.role === 'admin') {
      isProtected = true;
    } else if (user.role === 'sub_admin' && !isSuperAdmin) {
      isProtected = true;
    }

    // Only Super Admin has permission to directly reset passwords of other team members
    const canResetThisPassword = isSuperAdmin;

    return `
      <div class="team-user-row">
        <div class="team-user-profile">
          <div class="user-avatar-initials ${user.role === 'maker' || user.role === 'agent' ? 'agent-avatar' : ''}">${escapeHtml(initials)}</div>
          <div class="team-user-names">
            <strong>${escapeHtml(user.name)} ${isCurrent ? '<span class="you-badge">(You)</span>' : ''}</strong>
            <span>${escapeHtml(user.email)}</span>
          </div>
        </div>
        <div class="team-user-role">
          <span class="user-role-badge ${user.role}">${roleLabel}</span>
        </div>
        <div class="team-user-status">
          <span class="status-pill ${statusClass}">${user.status === 'active' ? '● Active' : '○ Disabled'}</span>
        </div>
        <div class="team-user-actions" style="display: flex; gap: 12px; align-items: center;">
          ${canResetThisPassword ? `
            <button type="button" class="btn-reset-password" data-user-id="${user.id}" title="Reset User Password" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-size: 12px; font-weight: 600; cursor: pointer;">
              <i class="fa-solid fa-key" style="color: #64748b;"></i> Reset Password
            </button>
          ` : ''}
          ${isProtected ? '<span class="admin-lock"><i class="fa-solid fa-lock"></i> Protected</span>' : `
            <button type="button" class="btn-toggle-status ${user.status === 'active' ? 'btn-disable' : 'btn-enable'}" data-user-id="${user.id}">
              ${user.status === 'active' ? 'Disable' : 'Enable'}
            </button>
            <button type="button" class="btn-delete-team-user" data-user-id="${user.id}" title="Delete User">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      toggleUserStatus(userId);
      renderTeamList(onTeamUpdated);
      if (onTeamUpdated) onTeamUpdated();
    });
  });

  container.querySelectorAll('.btn-reset-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      const user = (state.teamMembers || []).find(u => u.id === userId);
      if (!user) return;
      pendingResetUserId = userId;

      const userNameEl = document.getElementById('resetTargetUserName');
      if (userNameEl) userNameEl.textContent = user.name;

      const modal = document.getElementById('resetPasswordModal');
      if (modal) modal.style.display = 'flex';
      const pwdInput = document.getElementById('newPasswordInput');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
    });
  });

  container.querySelectorAll('.btn-delete-team-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      try {
        const deleted = await deleteSubUser(userId);
        if (deleted) {
          const deletedRoleLabel = getRoleLabel(deleted.role);
          addAuditLog('user_deleted', '', deleted.name, `Deleted user ${deleted.name} (${deletedRoleLabel})`);
          showToast(`Deleted user ${deleted.name}`, 'info');
        }
      } catch (err) {
        showToast(`Could not delete from Firestore: ${err.message || 'Missing permissions'}`, 'error');
      }
      renderTeamList(onTeamUpdated);
      if (onTeamUpdated) onTeamUpdated();
    });
  });
}
