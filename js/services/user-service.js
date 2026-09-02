import { state } from '../state/app-state.js';
import { saveUserToFirestore, updateUserStatusInFirestore, deleteUserFromFirestore, fetchUsersFromFirestore, fetchRolesFromFirestore, saveRoleToFirestore } from '../../firebase-config.js';

// ==========================================================================
// Standard CRM Permissions Catalog
// ==========================================================================
export const PERMISSION_DEFINITIONS = [
  // LEADS & PIPELINE
  { id: 'canAddLead', label: 'Can Add New Lead', category: 'LEADS & PIPELINE', description: 'Create and add new leads to CRM dashboard' },
  { id: 'canDeleteLead', label: 'Can Delete Lead', category: 'LEADS & PIPELINE', description: 'Delete existing leads and conversations' },
  { id: 'canExportExcel', label: 'Can Export to Excel', category: 'LEADS & PIPELINE', description: 'Download lead data and history as Excel spreadsheets' },
  { id: 'canAssignLead', label: 'Can Reassign Lead', category: 'LEADS & PIPELINE', description: 'Change assigned team member for any lead' },
  { id: 'canChangeStatus', label: 'Can Change Status', category: 'LEADS & PIPELINE', description: 'Update lead pipeline status (New, Contacted, Converted, etc.)' },
  { id: 'canAddNote', label: 'Can Add / Edit Notes', category: 'LEADS & PIPELINE', description: 'Add and update internal notes on leads' },

  // WHATSAPP & CHAT
  { id: 'canSendMessage', label: 'Can Send WhatsApp Messages', category: 'WHATSAPP & CHAT', description: 'Compose and send live replies in chat conversation pane' },

  // SYSTEM & ADMINISTRATION
  { id: 'canViewLogs', label: 'Can View Audit Logs', category: 'SYSTEM & ADMINISTRATION', description: 'Access the System Audit & Activity Logs page' },
  { id: 'canViewTeams', label: 'Can View Team Management', category: 'SYSTEM & ADMINISTRATION', description: 'Access the Team & Sub-Users management section' },
  { id: 'canChangePassword', label: 'Can Change Password', category: 'SYSTEM & ADMINISTRATION', description: 'Allow user to update their own password in Settings' },
  { id: 'canManagePermissions', label: 'Can Manage Permissions', category: 'SYSTEM & ADMINISTRATION', description: 'Allow Sub Admin to configure permissions for Makers' }
];

export const PERMISSION_CATEGORIES = [
  'LEADS & PIPELINE',
  'WHATSAPP & CHAT',
  'SYSTEM & ADMINISTRATION'
];

// ==========================================================================
// 3 Core CRM System Roles (RBAC)
// ==========================================================================
export const DEFAULT_ROLES = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    badgeClass: 'super_admin',
    color: '#df8516',
    description: 'Full unrestricted access to all CRM modules, settings, and team control.',
    isSystem: true,
    permissions: Object.fromEntries(PERMISSION_DEFINITIONS.map(p => [p.id, true]))
  },
  {
    id: 'sub_admin',
    name: 'Sub Admin',
    badgeClass: 'sub_admin',
    color: '#2563eb',
    description: 'Administrative operational access with lead management, messaging, and team control.',
    isSystem: true,
    permissions: {
      canAddLead: true,
      canDeleteLead: true,
      canSendMessage: true,
      canAddNote: true,
      canExportExcel: true,
      canAssignLead: true,
      canChangeStatus: true,
      canViewLogs: true,
      canViewTeams: true,
      canChangePassword: true,
      canManagePermissions: true
    }
  },
  {
    id: 'maker',
    name: 'Maker',
    badgeClass: 'maker',
    color: '#0284c7',
    description: 'Handles lead capture, customer conversations, and follow-ups.',
    isSystem: true,
    permissions: {
      canAddLead: true,
      canDeleteLead: false,
      canSendMessage: true,
      canAddNote: true,
      canExportExcel: false,
      canAssignLead: false,
      canChangeStatus: true,
      canViewLogs: false,
      canViewTeams: false,
      canChangePassword: true,
      canManagePermissions: false
    }
  }
];

export const DEFAULT_PERMISSIONS = Object.fromEntries(
  DEFAULT_ROLES.map(r => [r.id, r.permissions])
);

// ==========================================================================
// Default Users Catalog (3 Core Users)
// ==========================================================================
export const DEFAULT_TEAM_MEMBERS = [
  {
    id: "usr_admin",
    name: "Super Admin",
    email: "admin@zopmedia.com",
    password: "admin123",
    role: "super_admin",
    status: "active",
    createdAt: new Date().toISOString()
  },
  {
    id: "usr_subadmin_demo",
    name: "Sub Admin",
    email: "subadmin@zopmedia.com",
    password: "123",
    role: "sub_admin",
    status: "active",
    createdAt: new Date().toISOString()
  },
  {
    id: "usr_maker_demo",
    name: "Maker Agent",
    email: "maker@zopmedia.com",
    password: "123",
    role: "maker",
    status: "active",
    createdAt: new Date().toISOString()
  }
];

// ==========================================================================
// Roles Storage & Helpers
// ==========================================================================
let cachedRoles = null;

export function loadRoles() {
  try {
    const saved = localStorage.getItem('crm_roles_v3');
    if (saved) {
      cachedRoles = JSON.parse(saved);
      DEFAULT_ROLES.forEach(def => {
        if (!cachedRoles.some(r => r.id === def.id)) {
          cachedRoles.push({ ...def });
        }
      });
    } else {
      cachedRoles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
      saveRoles();
    }
  } catch (e) {
    cachedRoles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  }
  return cachedRoles;
}

export function saveRoles() {
  try {
    if (cachedRoles) {
      localStorage.setItem('crm_roles_v3', JSON.stringify(cachedRoles));
    }
  } catch (e) {}
}

export function getAllRoles() {
  if (!cachedRoles) {
    loadRoles();
  }
  return cachedRoles || DEFAULT_ROLES;
}

export function getRoleById(roleId) {
  const roles = getAllRoles();
  return roles.find(r => r.id === roleId) || roles.find(r => r.id === 'maker') || DEFAULT_ROLES[2];
}

/**
 * Update the permissions for a specific role
 */
export function updateRolePermissions(roleId, newPermissions) {
  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';
  const isSuperAdmin = performerRole === 'super_admin' || performerRole === 'admin';

  if (!isSuperAdmin) {
    throw new Error('Permission denied: Only Super Admin can modify role definitions.');
  }

  if (roleId === 'super_admin') {
    throw new Error('Super Admin role permissions are locked and cannot be modified.');
  }

  const role = getRoleById(roleId);
  if (!role) {
    throw new Error('Role not found.');
  }

  role.permissions = { ...newPermissions };
  saveRoles();

  if (!state.demoMode) {
    try {
      saveRoleToFirestore(role);
    } catch (err) {
      console.warn("Firestore role save warning:", err);
    }
  }

  return role;
}

/**
 * Assign a Role to a User
 */
export async function assignUserRole(userId, newRoleId) {
  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';
  const isSuperAdmin = performerRole === 'super_admin' || performerRole === 'admin';
  const isSubAdmin = performerRole === 'sub_admin';

  if (!isSuperAdmin && !isSubAdmin) {
    throw new Error('Permission denied: You cannot assign user roles.');
  }

  const user = state.teamMembers.find(u => u.id === userId);
  if (!user) {
    throw new Error('User not found.');
  }

  if (user.id === 'usr_admin' && newRoleId !== 'super_admin') {
    throw new Error('Primary Super Admin account role cannot be changed.');
  }

  if (newRoleId === 'super_admin' && user.id !== 'usr_admin') {
    throw new Error('Permission denied: There can only be 1 Super Admin. Additional users can only be Sub Admin or Maker.');
  }

  if (isSubAdmin && (newRoleId === 'super_admin' || newRoleId === 'sub_admin')) {
    throw new Error('Permission denied: Sub Admins cannot assign administrative roles.');
  }

  user.role = newRoleId;
  saveTeamMembers();

  if (!state.demoMode) {
    try {
      await saveUserToFirestore(user);
    } catch (err) {
      console.warn('Firestore user role update warning:', err);
    }
  }

  return user;
}

export function getUserPermissions(user = state.currentUser) {
  if (!user) return {};
  if (user.role === 'super_admin' || user.role === 'admin') {
    return Object.fromEntries(PERMISSION_DEFINITIONS.map(p => [p.id, true]));
  }
  const roleId = user.role || 'maker';
  const role = getRoleById(roleId);
  return role && role.permissions ? { ...role.permissions } : {};
}

/**
 * Check if the active user (or specified user) has a given permission
 */
export function hasPermission(permissionKey, user = state.currentUser) {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'admin') {
    return true; // Super Admin has full access
  }
  const perms = getUserPermissions(user);
  return perms[permissionKey] === true;
}

// ==========================================================================
// Gold Cash Protection & Sanitization Helper
// ==========================================================================
export function containsGoldCash(val) {
  if (!val) return false;
  const str = String(val).toLowerCase();
  return str.includes('goldcash') || 
         str.includes('gold cash') || 
         str.includes('gold-cash') || 
         str.includes('gold_cash');
}

export function sanitizeTeamMembers(rawList) {
  if (!Array.isArray(rawList)) return JSON.parse(JSON.stringify(DEFAULT_TEAM_MEMBERS));

  const cleaned = [];
  let hasSuperAdmin = false;

  for (const raw of rawList) {
    if (!raw) continue;
    const isGold = containsGoldCash(raw.email) || containsGoldCash(raw.name) || containsGoldCash(raw.id);

    // If it's a super admin from the database (even if it had goldcash email), convert to Zop One Super Admin
    if (raw.role === 'super_admin' || raw.id === 'usr_admin' || isGold) {
      if (raw.role === 'super_admin' || raw.id === 'usr_admin') {
        if (!hasSuperAdmin) {
          cleaned.push({
            ...raw,
            id: 'usr_admin',
            name: 'Super Admin',
            email: 'admin@zopmedia.com',
            password: (raw.password && !isGold) ? raw.password : 'admin123',
            role: 'super_admin',
            status: 'active'
          });
          hasSuperAdmin = true;
        }
        continue;
      }

      // If it's any other account with gold cash in name/email, omit completely
      continue;
    }

    // Normal Sub Admin / Maker
    cleaned.push({ ...raw });
  }

  if (!hasSuperAdmin) {
    cleaned.unshift(DEFAULT_TEAM_MEMBERS[0]);
  }

  return cleaned;
}

// ==========================================================================
// Team Members Storage & Sync
// ==========================================================================
export function loadTeamMembers() {
  loadRoles();
  try {
    const saved = localStorage.getItem('crm_team_members_v3');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.teamMembers = sanitizeTeamMembers(parsed);
      saveTeamMembers();
    } else {
      state.teamMembers = JSON.parse(JSON.stringify(DEFAULT_TEAM_MEMBERS));
      saveTeamMembers();
    }
  } catch (e) {
    state.teamMembers = JSON.parse(JSON.stringify(DEFAULT_TEAM_MEMBERS));
  }

  const savedCurrentId = localStorage.getItem('crm_current_user_id');
  if (savedCurrentId) {
    const found = state.teamMembers.find(u => u.id === savedCurrentId && !containsGoldCash(u.email));
    if (found) state.currentUser = found;
  }
  if (!state.currentUser || containsGoldCash(state.currentUser.email) || containsGoldCash(state.currentUser.name)) {
    state.currentUser = state.teamMembers.find(u => u.role === 'super_admin') || state.teamMembers[0] || DEFAULT_TEAM_MEMBERS[0];
  }

  syncRolesFromFirestore();
  syncUsersFromFirestore();
}

export async function syncRolesFromFirestore() {
  if (state.demoMode) return;
  try {
    const fRoles = await fetchRolesFromFirestore();
    if (fRoles && Array.isArray(fRoles) && fRoles.length > 0) {
      if (!cachedRoles) cachedRoles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
      fRoles.forEach(fRole => {
        const idx = cachedRoles.findIndex(r => r.id === fRole.id);
        if (idx !== -1) {
          cachedRoles[idx] = { ...cachedRoles[idx], ...fRole };
        } else {
          cachedRoles.push(fRole);
        }
      });
      saveRoles();
    }
  } catch (err) {
    console.warn("Firestore roles sync warning:", err);
  }
}

export async function syncUsersFromFirestore() {
  if (state.demoMode) return;
  try {
    const fUsers = await fetchUsersFromFirestore();
    if (fUsers && Array.isArray(fUsers) && fUsers.length > 0) {
      const sanitizedRemote = sanitizeTeamMembers(fUsers);

      state.teamMembers = sanitizedRemote.map(fUser => {
        const existing = state.teamMembers.find(m => m.id === fUser.id);
        return {
          ...fUser,
          role: fUser.role || 'maker',
          password: fUser.password || (existing ? existing.password : '123')
        };
      });

      if (!state.teamMembers.some(u => u.role === 'super_admin' || u.id === 'usr_admin')) {
        state.teamMembers.unshift(DEFAULT_TEAM_MEMBERS[0]);
      }

      if (!state.currentUser || containsGoldCash(state.currentUser.email) || containsGoldCash(state.currentUser.name)) {
        state.currentUser = state.teamMembers.find(u => u.role === 'super_admin') || state.teamMembers[0] || DEFAULT_TEAM_MEMBERS[0];
      }

      saveTeamMembers();
    }
  } catch (err) {
    console.warn("Firestore users sync warning:", err);
  }
}

export async function syncAllUsersToFirestore() {
  if (state.demoMode) return;
  try {
    const existing = await fetchUsersFromFirestore();
    if (!existing || existing.length === 0) {
      for (const user of DEFAULT_TEAM_MEMBERS) {
        await saveUserToFirestore(user);
      }
    }
  } catch (err) {
    console.warn("Seeding default admin error:", err);
  }
}

export function saveTeamMembers() {
  try {
    localStorage.setItem('crm_team_members_v3', JSON.stringify(state.teamMembers));
  } catch (e) {}
}

export function switchActiveUser(userId) {
  const user = state.teamMembers.find(u => u.id === userId);
  if (!user) return;

  state.currentUser = user;
  try {
    localStorage.setItem('crm_current_user_id', user.id);
  } catch (e) {}
}

export function addSubUser(name, email, password = '123', role = 'maker') {
  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';

  let validRole = role;
  if (validRole === 'super_admin' || validRole === 'admin') {
    validRole = 'maker';
  }
  if (performerRole === 'sub_admin' && (role === 'super_admin' || role === 'sub_admin')) {
    validRole = 'maker';
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: password.trim() || '123',
    role: validRole,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  state.teamMembers.push(newUser);
  saveTeamMembers();

  saveUserToFirestore(newUser).catch(err => {
    console.warn('Firestore user save warning:', err);
  });

  return newUser;
}

export async function deleteSubUser(userId) {
  const userIndex = state.teamMembers.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;

  const deletedUser = state.teamMembers[userIndex];
  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';

  if (deletedUser.role === 'super_admin' || deletedUser.role === 'admin') return null;
  if (performerRole === 'sub_admin' && deletedUser.role === 'sub_admin') return null;
  if (performerRole === 'maker') return null;

  state.teamMembers.splice(userIndex, 1);
  saveTeamMembers();

  if (!state.demoMode) {
    try {
      await deleteUserFromFirestore(userId);
    } catch (err) {
      state.teamMembers.splice(userIndex, 0, deletedUser);
      saveTeamMembers();
      throw err;
    }
  }

  return deletedUser;
}

export function toggleUserStatus(userId) {
  const user = state.teamMembers.find(u => u.id === userId);
  if (!user) return;

  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';
  if (user.role === 'super_admin' || user.role === 'admin') return;
  if (performerRole === 'sub_admin' && user.role === 'sub_admin') return;
  if (performerRole === 'maker') return;

  user.status = user.status === 'active' ? 'disabled' : 'active';
  saveTeamMembers();

  if (!state.demoMode) {
    updateUserStatusInFirestore(userId, user.status).catch(() => {});
  }
}

export async function changeOwnPassword(oldPassword, newPassword) {
  if (!state.currentUser) {
    throw new Error('No user is currently logged in.');
  }

  const cleanOld = (oldPassword || '').trim();
  const cleanNew = (newPassword || '').trim();

  if (!cleanOld) {
    throw new Error('Current (Old) Password is mandatory.');
  }

  if (!cleanNew) {
    throw new Error('New Password cannot be empty.');
  }

  if (cleanNew.length < 6) {
    throw new Error('New Password must be at least 6 characters long.');
  }

  const currentStoredPass = (state.currentUser.password || '').trim();
  if (currentStoredPass !== cleanOld) {
    throw new Error('Incorrect Current (Old) Password. Please try again.');
  }

  if (cleanOld === cleanNew) {
    throw new Error('New Password must be different from your Current Password.');
  }

  state.currentUser.password = cleanNew;

  const memberIdx = state.teamMembers.findIndex(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));
  if (memberIdx !== -1) {
    state.teamMembers[memberIdx].password = cleanNew;
  }

  saveTeamMembers();

  if (!state.demoMode) {
    try {
      await saveUserToFirestore(state.currentUser);
    } catch (err) {
      console.warn('Firestore user password sync warning:', err);
    }
  }

  return state.currentUser;
}

export function resetUserPassword(userId, newPassword) {
  const user = state.teamMembers.find(u => u.id === userId);
  if (!user) return null;

  const performerRole = state.currentUser ? state.currentUser.role : 'super_admin';
  const isSuperAdmin = performerRole === 'super_admin' || performerRole === 'admin';

  if (!isSuperAdmin) {
    console.warn('Permission denied: Only Super Admin can reset passwords.');
    return null;
  }

  user.password = newPassword.trim();
  saveTeamMembers();

  if (!state.demoMode) {
    saveUserToFirestore(user).catch(err => {
      console.warn('Firestore user password update warning:', err);
    });
  }

  return user;
}
