/**
 * Settings, Change Password & Role-Based Permissions Component (RBAC)
 * Fixed to 3 Roles: Super Admin, Sub Admin, Maker
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { escapeHtml, getInitials } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import {
  changeOwnPassword,
  getAllRoles,
  getRoleById,
  updateRolePermissions,
  assignUserRole,
  getUserPermissions,
  hasPermission,
  PERMISSION_DEFINITIONS,
  PERMISSION_CATEGORIES
} from '../services/user-service.js';
import { addAuditLog } from '../services/logging-service.js';

let isSubmittingPassword = false;
let currentRbacRoleFilter = 'all';
let currentRbacSearch = '';
let activeRbacTab = 'assign'; // 'assign' or 'definitions'
let editingRoleId = null;

export function setupSettingsView(onUserUpdated) {
  setupTabs();
  setupPasswordToggleListeners();
  setupPasswordFormListeners(onUserUpdated);
  setupRbacListeners(onUserUpdated);
  renderSettingsView();
}

/**
 * Switch tabs between Account / Change Password and Roles & Permissions
 */
export function switchSettingsTab(tabName) {
  const tabBtnAccount = document.getElementById('settingsTabBtnAccount');
  const tabBtnPermissions = document.getElementById('settingsTabBtnPermissions');
  const paneAccount = document.getElementById('settingsAccountTabPane');
  const subItemPassword = document.getElementById('navSubItemPassword');
  const subItemPermissions = document.getElementById('navSubItemPermissions');
  const settingsGroupWrapper = document.getElementById('navSettingsGroupWrapper');

  const isAccount = tabName === 'account' || tabName === 'password';
  const isPerm = tabName === 'permissions';

  // Ensure settings group in sidebar is open
  if (settingsGroupWrapper) {
    settingsGroupWrapper.classList.add('open');
  }

  // Sync Sidebar Sub-items
  if (subItemPassword) subItemPassword.classList.toggle('active', isAccount);
  if (subItemPermissions) subItemPermissions.classList.toggle('active', isPerm);

  // Sync Top Tabs
  if (tabBtnAccount) {
    tabBtnAccount.classList.toggle('active', isAccount);
    tabBtnAccount.style.color = isAccount ? 'var(--crm-primary)' : '#64748b';
    tabBtnAccount.style.borderBottomColor = isAccount ? 'var(--crm-primary)' : 'transparent';
  }

  if (tabBtnPermissions) {
    tabBtnPermissions.classList.toggle('active', isPerm);
    tabBtnPermissions.style.color = isPerm ? 'var(--crm-primary)' : '#64748b';
    tabBtnPermissions.style.borderBottomColor = isPerm ? 'var(--crm-primary)' : 'transparent';
  }

  if (paneAccount) paneAccount.style.display = isAccount ? 'block' : 'none';

  if (isPerm) {
    renderRbacView();
  }
}

function setupTabs() {
  const tabBtnAccount = document.getElementById('settingsTabBtnAccount');
  const tabBtnPermissions = document.getElementById('settingsTabBtnPermissions');

  if (tabBtnAccount) tabBtnAccount.addEventListener('click', () => switchSettingsTab('account'));
  if (tabBtnPermissions) tabBtnPermissions.addEventListener('click', () => switchSettingsTab('permissions'));
}

/**
 * Render Current User Details into Settings Profile Card
 */
export function renderSettingsView() {
  const current = state.currentUser || { id: 'usr_admin', name: 'Super Admin', email: 'admin@zopmedia.com', role: 'super_admin', status: 'active' };
  const isSuperAdmin = current.role === 'super_admin' || current.role === 'admin';
  const isSubAdmin = current.role === 'sub_admin';
  const canManagePerms = isSuperAdmin || (isSubAdmin && hasPermission('canManagePermissions', current));
  const canChangePass = hasPermission('canChangePassword', current);

  // Toggle Top Tab buttons
  const tabBtnAccount = document.getElementById('settingsTabBtnAccount');
  const tabBtnPermissions = document.getElementById('settingsTabBtnPermissions');
  if (tabBtnAccount) {
    tabBtnAccount.style.display = canChangePass ? 'flex' : 'none';
  }
  if (tabBtnPermissions) {
    tabBtnPermissions.style.display = canManagePerms ? 'flex' : 'none';
    const roleBadge = tabBtnPermissions.querySelector('.user-role-badge');
    if (roleBadge) {
      roleBadge.textContent = isSuperAdmin ? 'Super Admin' : 'Sub Admin';
      roleBadge.className = `user-role-badge ${isSuperAdmin ? 'super_admin' : 'sub_admin'}`;
    }
  }

  // Sidebar Permissions Sub-item visibility
  const subItemPermissions = document.getElementById('navSubItemPermissions');
  const navPermBadge = document.getElementById('navPermBadge');
  if (subItemPermissions) {
    subItemPermissions.style.display = canManagePerms ? 'flex' : 'none';
  }
  if (navPermBadge) {
    navPermBadge.textContent = isSuperAdmin ? 'Admin' : 'Sub Admin';
    navPermBadge.className = `user-role-badge ${isSuperAdmin ? 'super_admin' : 'sub_admin'} nav-sub-badge`;
  }

  // Profile Avatar
  const avatarEl = elements.settingsProfileAvatar || document.getElementById('settingsProfileAvatar');
  if (avatarEl) {
    avatarEl.textContent = getInitials(current.name);
    if (current.role === 'maker' || current.role === 'agent') {
      avatarEl.style.background = '#e0f2fe';
      avatarEl.style.color = '#0369a1';
    } else if (current.role === 'sub_admin') {
      avatarEl.style.background = '#fef3c7';
      avatarEl.style.color = '#b45309';
    } else {
      avatarEl.style.background = '#f1f5f9';
      avatarEl.style.color = '#334155';
    }
  }

  // Profile Name & Email
  const nameEl = elements.settingsProfileName || document.getElementById('settingsProfileName');
  const emailEl = elements.settingsProfileEmail || document.getElementById('settingsProfileEmail');
  const hasCustomName = current.name && current.name.trim() !== '' && current.name.toLowerCase() !== 'super admin' && !isSuperAdmin;

  if (nameEl) {
    if (hasCustomName) {
      nameEl.style.display = 'block';
      nameEl.textContent = current.name;
    } else {
      nameEl.style.display = 'none';
      nameEl.textContent = '';
    }
  }

  if (emailEl) {
    emailEl.textContent = current.email || '';
    if (!hasCustomName) {
      emailEl.style.fontSize = '14px';
      emailEl.style.fontWeight = '600';
      emailEl.style.color = 'var(--text-main)';
      emailEl.style.marginBottom = '6px';
    } else {
      emailEl.style.fontSize = '13px';
      emailEl.style.fontWeight = 'normal';
      emailEl.style.color = '#64748b';
      emailEl.style.marginBottom = '6px';
    }
  }

  // Profile Role Badge
  const roleEl = elements.settingsProfileRole || document.getElementById('settingsProfileRole');
  if (roleEl) {
    const roleObj = getRoleById(current.role);
    roleEl.textContent = (roleObj ? roleObj.name : current.role).toUpperCase();
    roleEl.className = `user-role-badge ${roleObj ? roleObj.badgeClass : 'maker'}`;
  }

  // Profile Status
  const statusEl = elements.settingsProfileStatus || document.getElementById('settingsProfileStatus');
  if (statusEl) {
    const isActive = current.status !== 'disabled';
    statusEl.textContent = isActive ? 'Active' : 'Disabled';
    statusEl.style.color = isActive ? '#10b981' : '#ef4444';
  }

  // Profile Role Access Description
  const roleDescEl = document.getElementById('settingsProfileRoleDesc');
  if (roleDescEl) {
    if (isSuperAdmin) {
      roleDescEl.textContent = 'Full Access';
    } else if (isSubAdmin) {
      roleDescEl.textContent = 'Sub Admin';
    } else {
      roleDescEl.textContent = 'Maker (Role Limited)';
    }
  }

  // Check if current user has permission to change password
  const passNotice = document.getElementById('passwordDisabledNotice');
  const passForm = elements.changePasswordForm || document.getElementById('changePasswordForm');

  if (passNotice) passNotice.style.display = canChangePass ? 'none' : 'block';
  if (passForm) {
    passForm.querySelectorAll('input, button').forEach(el => {
      el.disabled = !canChangePass;
    });
  }

  if (canManagePerms) {
    renderRbacView();
  }
}

/**
 * Setup Show/Hide Eye toggles for password fields
 */
function setupPasswordToggleListeners() {
  const attachToggle = (btnId, inputId) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
  };

  attachToggle('toggleOldPasswordBtn', 'oldPasswordInput');
  attachToggle('toggleNewSettingsPasswordBtn', 'newSettingsPasswordInput');
  attachToggle('toggleConfirmPasswordBtn', 'confirmNewPasswordInput');
}

/**
 * Setup Password Form Submission and Validation Listeners
 */
function setupPasswordFormListeners(onUserUpdated) {
  const form = elements.changePasswordForm || document.getElementById('changePasswordForm');
  const alertBox = elements.changePasswordAlert || document.getElementById('changePasswordAlert');
  const resetBtn = elements.resetChangePasswordFormBtn || document.getElementById('resetChangePasswordFormBtn');
  const submitBtn = elements.submitChangePasswordBtn || document.getElementById('submitChangePasswordBtn');

  const oldInput = elements.oldPasswordInput || document.getElementById('oldPasswordInput');
  const newInput = elements.newSettingsPasswordInput || document.getElementById('newSettingsPasswordInput');
  const confirmInput = elements.confirmNewPasswordInput || document.getElementById('confirmNewPasswordInput');

  const clearForm = () => {
    if (oldInput) oldInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (alertBox) {
      alertBox.style.display = 'none';
      alertBox.textContent = '';
      alertBox.className = '';
    }
  };

  if (resetBtn) {
    resetBtn.addEventListener('click', clearForm);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmittingPassword) return;

      const oldPass = oldInput ? oldInput.value.trim() : '';
      const newPass = newInput ? newInput.value.trim() : '';
      const confirmPass = confirmInput ? confirmInput.value.trim() : '';

      if (!oldPass) {
        showAlert(alertBox, 'Current (Old) Password is required.', 'error');
        if (oldInput) oldInput.focus();
        return;
      }

      if (!newPass) {
        showAlert(alertBox, 'Please enter a new password.', 'error');
        if (newInput) newInput.focus();
        return;
      }

      if (newPass.length < 6) {
        showAlert(alertBox, 'New password must be at least 6 characters long.', 'error');
        if (newInput) newInput.focus();
        return;
      }

      if (newPass !== confirmPass) {
        showAlert(alertBox, 'New password and Confirm password do not match.', 'error');
        if (confirmInput) confirmInput.focus();
        return;
      }

      if (oldPass === newPass) {
        showAlert(alertBox, 'New password cannot be identical to your old password.', 'warning');
        if (newInput) newInput.focus();
        return;
      }

      try {
        isSubmittingPassword = true;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        }

        const updatedUser = await changeOwnPassword(oldPass, newPass);

        addAuditLog(
          'password_changed',
          '',
          updatedUser.name,
          `User ${updatedUser.name} (${(updatedUser.role || 'user').toUpperCase()}) changed their account password`
        );

        showAlert(alertBox, 'Password changed successfully!', 'success');
        showToast('Password changed successfully!', 'info');

        clearForm();

        if (onUserUpdated) onUserUpdated(updatedUser);
      } catch (err) {
        showAlert(alertBox, err.message || 'Failed to update password. Please check your old password.', 'error');
        showToast(err.message || 'Failed to update password', 'error');
      } finally {
        isSubmittingPassword = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Update Password';
        }
      }
    });
  }
}

// ==========================================================================
// Roles & Permissions (RBAC) Listeners & Rendering
// ==========================================================================
function setupRbacListeners(onUserUpdated) {
  // 1. View Switcher Tabs (Assign Roles vs Role Definitions)
  const tabAssign = document.getElementById('rbacTabBtnAssign');
  const tabDef = document.getElementById('rbacTabBtnDefinitions');
  const paneAssign = document.getElementById('rbacAssignRolesPane');
  const paneDef = document.getElementById('rbacRoleDefinitionsPane');

  if (tabAssign && tabDef) {
    tabAssign.addEventListener('click', () => {
      activeRbacTab = 'assign';
      tabAssign.classList.add('active');
      tabDef.classList.remove('active');
      if (paneAssign) paneAssign.style.display = 'block';
      if (paneDef) paneDef.style.display = 'none';
      renderRbacView();
    });

    tabDef.addEventListener('click', () => {
      activeRbacTab = 'definitions';
      tabDef.classList.add('active');
      tabAssign.classList.remove('active');
      if (paneAssign) paneAssign.style.display = 'none';
      if (paneDef) paneDef.style.display = 'block';
      renderRbacRoleDefinitions();
    });
  }

  // 2. Role Filter Pills
  const pillsContainer = document.getElementById('rbacRoleFilterPills');
  if (pillsContainer) {
    pillsContainer.addEventListener('click', (e) => {
      const pillBtn = e.target.closest('.rbac-filter-pill');
      if (!pillBtn) return;

      currentRbacRoleFilter = pillBtn.dataset.role || 'all';
      pillsContainer.querySelectorAll('.rbac-filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn === pillBtn);
      });

      renderRbacUsersTable();
    });
  }

  // 3. User Search Input in Assign Roles
  const searchInput = document.getElementById('rbacUserSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentRbacSearch = (e.target.value || '').trim().toLowerCase();
      renderRbacUsersTable();
    });
  }

  // 4. Role Permissions Modal Listeners
  const modalRolePerm = document.getElementById('rolePermissionsModal');
  const closeRolePermBtn = document.getElementById('closeRolePermModalBtn');
  const cancelRolePermBtn = document.getElementById('cancelRolePermModalBtn');
  const saveRolePermBtn = document.getElementById('saveRolePermsBtn');

  const closeRoleModal = () => {
    if (modalRolePerm) modalRolePerm.style.display = 'none';
    editingRoleId = null;
  };

  if (closeRolePermBtn) closeRolePermBtn.addEventListener('click', closeRoleModal);
  if (cancelRolePermBtn) cancelRolePermBtn.addEventListener('click', closeRoleModal);

  if (saveRolePermBtn) {
    saveRolePermBtn.addEventListener('click', () => {
      if (!editingRoleId) return;

      const bodyEl = document.getElementById('rolePermModalBody');
      if (!bodyEl) return;

      const newPerms = {};
      bodyEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        newPerms[cb.dataset.permId] = cb.checked;
      });

      try {
        const updatedRole = updateRolePermissions(editingRoleId, newPerms);
        showToast(`Permissions updated for ${updatedRole.name}!`, 'info');
        addAuditLog(
          'role_permissions_updated',
          '',
          state.currentUser ? state.currentUser.name : 'Super Admin',
          `Super Admin updated permissions for role: ${updatedRole.name}`
        );
        closeRoleModal();
        renderRbacView();
        if (onUserUpdated) onUserUpdated(state.currentUser);
      } catch (err) {
        showToast(err.message || 'Could not update role permissions', 'error');
      }
    });
  }
}

/**
 * Render the entire Roles & Permissions View
 */
export function renderRbacView() {
  updateRbacPillCounts();
  if (activeRbacTab === 'assign') {
    renderRbacUsersTable();
  } else {
    renderRbacRoleDefinitions();
  }
}

/**
 * Update filter pill counts dynamically based on users
 */
function updateRbacPillCounts() {
  const users = state.teamMembers || [];

  const countAll = users.length;
  const countSuper = users.filter(u => u.role === 'super_admin' || u.role === 'admin').length;
  const countSub = users.filter(u => u.role === 'sub_admin').length;
  const countMaker = users.filter(u => u.role === 'maker' || u.role === 'agent').length;

  const setPill = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };

  setPill('rbacPillCount_all', countAll);
  setPill('rbacPillCount_super_admin', countSuper);
  setPill('rbacPillCount_sub_admin', countSub);
  setPill('rbacPillCount_maker', countMaker);
}

/**
 * Render the Assign Roles Users Table
 */
export function renderRbacUsersTable() {
  const tbody = document.getElementById('rbacUsersTableBody');
  const countLabel = document.getElementById('rbacUserCountLabel');
  if (!tbody) return;

  const users = state.teamMembers || [];
  const roles = getAllRoles();

  let filtered = users.filter(u => {
    if (currentRbacRoleFilter !== 'all') {
      if (currentRbacRoleFilter === 'super_admin' && (u.role !== 'super_admin' && u.role !== 'admin')) return false;
      if (currentRbacRoleFilter === 'sub_admin' && u.role !== 'sub_admin') return false;
      if (currentRbacRoleFilter === 'maker' && (u.role !== 'maker' && u.role !== 'agent')) return false;
    }

    if (currentRbacSearch) {
      const q = currentRbacSearch;
      const matchName = (u.name || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }

    return true;
  });

  if (countLabel) {
    countLabel.textContent = `${filtered.length} user${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 40px; color: #94a3b8;">
          <i class="fa-solid fa-user-xmark" style="font-size: 28px; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
          <strong>No matching users found</strong>
          <p style="font-size: 12px; margin-top: 4px; color: #a8a29e;">Try adjusting your role filter or search query.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(user => {
    const initials = getInitials(user.name);
    const isActive = user.status !== 'disabled';
    const currentRoleId = user.role === 'admin' ? 'super_admin' : (user.role === 'agent' ? 'maker' : user.role);
    const roleObj = getRoleById(currentRoleId);
    const totalPerms = PERMISSION_DEFINITIONS.length; // 11
    const grantedCount = currentRoleId === 'super_admin' 
      ? totalPerms 
      : Object.values(roleObj.permissions || {}).filter(Boolean).length;

    const isPrimarySuperAdmin = user.id === 'usr_admin' || currentRoleId === 'super_admin';
    const assignableRoles = roles.filter(r => r.id !== 'super_admin');
    const roleOptions = assignableRoles.map(r => {
      const isSelected = r.id === currentRoleId;
      return `<option value="${escapeHtml(r.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(r.name)}</option>`;
    }).join('');

    return `
      <tr data-user-id="${escapeHtml(user.id)}">
        <td>
          <div class="rbac-user-cell">
            <div class="rbac-user-avatar">${escapeHtml(initials)}</div>
            <div class="rbac-user-info">
              <span class="rbac-user-name">${escapeHtml(user.name || 'User')}</span>
              <span class="rbac-user-status ${isActive ? 'active' : 'disabled'}">${isActive ? 'ACTIVE' : 'DISABLED'}</span>
            </div>
          </div>
        </td>
        <td>
          <span style="color: #64748b; font-weight: 500;">${escapeHtml(user.email || '—')}</span>
        </td>
        <td>
          <button type="button" class="btn-view-user-perms ${currentRoleId === 'super_admin' ? 'super' : ''}" data-role-id="${escapeHtml(currentRoleId)}" title="Click to inspect role permissions">
            <i class="fa-solid ${currentRoleId === 'super_admin' ? 'fa-shield-check' : 'fa-shield-halved'}"></i>
            <span>${grantedCount}/${totalPerms} Permissions</span>
          </button>
        </td>
        <td>
          ${isPrimarySuperAdmin ? `
            <span class="user-role-badge super_admin" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px;">
              <i class="fa-solid fa-lock" style="font-size: 10px;"></i> SUPER ADMIN
            </span>
          ` : `
            <select class="rbac-role-select" data-user-id="${escapeHtml(user.id)}">
              ${roleOptions}
            </select>
          `}
        </td>
      </tr>
    `;
  }).join('');

  // Attach role select change listeners
  tbody.querySelectorAll('.rbac-role-select').forEach(select => {
    select.addEventListener('change', async () => {
      const userId = select.dataset.userId;
      const newRoleId = select.value;

      try {
        const updated = await assignUserRole(userId, newRoleId);
        const roleObj = getRoleById(newRoleId);
        showToast(`Assigned ${updated.name} to role "${roleObj.name}"!`, 'info');
        addAuditLog(
          'user_role_assigned',
          '',
          updated.name,
          `Super Admin assigned role "${roleObj.name}" to ${updated.name}`
        );
        updateRbacPillCounts();
        renderRbacUsersTable();
      } catch (err) {
        showToast(err.message || 'Could not assign role', 'error');
        renderRbacUsersTable();
      }
    });
  });

  // Attach View Permissions click on the Permissions column
  tbody.querySelectorAll('.btn-view-user-perms').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleId = btn.dataset.roleId;
      openRolePermissionsModal(roleId);
    });
  });
}

/**
 * Render the Role Definitions Cards list
 */
export function renderRbacRoleDefinitions() {
  const container = document.getElementById('rbacRoleCardsList');
  if (!container) return;

  const roles = getAllRoles();
  const totalPerms = PERMISSION_DEFINITIONS.length;

  container.innerHTML = roles.map(role => {
    const isSuperAdmin = role.id === 'super_admin';
    const permCount = isSuperAdmin ? totalPerms : Object.values(role.permissions || {}).filter(Boolean).length;

    return `
      <div class="rbac-role-card-item">
        <div class="rbac-role-meta-left">
          <div class="rbac-role-badges-wrap">
            <span class="role-pill-badge ${escapeHtml(role.badgeClass || 'maker')}">${escapeHtml(role.name)}</span>
            <span class="system-tag-badge">SYSTEM</span>
          </div>
          <p class="rbac-role-description">${escapeHtml(role.description || '')}</p>
          <span class="rbac-role-perm-count">${isSuperAdmin ? 'Full unrestricted access (All 11 permissions)' : `${permCount} of ${totalPerms} permissions enabled`}</span>
        </div>
        <div>
          ${isSuperAdmin 
            ? '<span style="font-size: 12px; font-weight: 600; color: #a8a29e; padding: 6px 12px;">Locked (Full Access)</span>' 
            : `<button type="button" class="btn-edit-role-perms" data-role-id="${escapeHtml(role.id)}">Edit Permissions</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  // Attach Edit Permissions click handlers
  container.querySelectorAll('.btn-edit-role-perms').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleId = btn.dataset.roleId;
      openRolePermissionsModal(roleId);
    });
  });
}

/**
 * Open Role Permissions Modal and render CRM categorized checklist
 */
function openRolePermissionsModal(roleId) {
  const role = getRoleById(roleId);
  if (!role) return;

  editingRoleId = roleId;

  const modal = document.getElementById('rolePermissionsModal');
  const titleEl = document.getElementById('rolePermModalTitle');
  const subtitleEl = document.getElementById('rolePermModalSubtitle');
  const bodyEl = document.getElementById('rolePermModalBody');
  const saveBtn = document.getElementById('saveRolePermsBtn');

  if (titleEl) titleEl.textContent = role.name.toUpperCase();
  if (subtitleEl) {
    subtitleEl.textContent = role.id === 'super_admin' 
      ? 'Super Admin permissions are locked to full system access.'
      : `Toggle what ${role.name} can do. Changes apply on each user's next login.`;
  }

  if (saveBtn) {
    saveBtn.style.display = role.id === 'super_admin' ? 'none' : 'inline-flex';
  }

  if (bodyEl) {
    const rolePerms = role.permissions || {};
    const isSuperAdmin = role.id === 'super_admin';

    bodyEl.innerHTML = PERMISSION_CATEGORIES.map(category => {
      const defs = PERMISSION_DEFINITIONS.filter(p => p.category === category);
      if (defs.length === 0) return '';

      const items = defs.map(def => {
        const isChecked = isSuperAdmin || rolePerms[def.id] === true;
        const isDisabled = isSuperAdmin;

        return `
          <label class="role-perm-checkbox-item ${isDisabled ? 'disabled' : ''}">
            <input type="checkbox" data-perm-id="${escapeHtml(def.id)}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
            <div>
              <strong>${escapeHtml(def.label)}</strong>
              <span style="display: block; font-size: 11.5px; color: #78716c; margin-top: 2px;">${escapeHtml(def.description)}</span>
            </div>
          </label>
        `;
      }).join('');

      return `
        <div class="role-perm-category-group">
          <div class="role-perm-category-title">${escapeHtml(category)}</div>
          <div class="role-perm-checkboxes-grid">
            ${items}
          </div>
        </div>
      `;
    }).join('');
  }

  if (modal) modal.style.display = 'flex';
}

function showAlert(alertBox, message, type = 'error') {
  if (!alertBox) return;

  alertBox.style.display = 'block';
  alertBox.textContent = message;

  if (type === 'error') {
    alertBox.style.background = '#fef2f2';
    alertBox.style.border = '1px solid #fecaca';
    alertBox.style.color = '#b91c1c';
  } else if (type === 'warning') {
    alertBox.style.background = '#fffbeb';
    alertBox.style.border = '1px solid #fde68a';
    alertBox.style.color = '#b45309';
  } else {
    alertBox.style.background = '#ecfdf5';
    alertBox.style.border = '1px solid #a7f3d0';
    alertBox.style.color = '#047857';
  }
}

// Backward-compatible alias for navigation router
export { renderRbacView as renderPermissionsTab };
