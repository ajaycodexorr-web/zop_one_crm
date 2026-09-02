/**
 * Main Application View Navigation Controller
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { hasPermission } from '../services/user-service.js';
import { renderPermissionsTab } from './settings-view.js';

export function setupNavigation(renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView) {
  const closeSettingsSubmenu = () => {
    const groupWrapper = document.getElementById('navSettingsGroupWrapper');
    if (groupWrapper) groupWrapper.classList.remove('open');
  };

  if (elements.navItemLeads) {
    elements.navItemLeads.addEventListener('click', () => {
      closeSettingsSubmenu();
      switchView('leads', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }
  if (elements.navItemConversations) {
    elements.navItemConversations.addEventListener('click', () => {
      closeSettingsSubmenu();
      switchView('conversations', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }
  if (elements.navItemLogs) {
    elements.navItemLogs.addEventListener('click', () => {
      closeSettingsSubmenu();
      switchView('logs', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }
  if (elements.navItemTeam) {
    elements.navItemTeam.addEventListener('click', () => {
      closeSettingsSubmenu();
      switchView('team', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }

  // Parent Settings Navigation Item: Only Show / Hide submenu options (do not switch page)
  if (elements.navItemSettings) {
    elements.navItemSettings.addEventListener('click', (e) => {
      e.preventDefault();
      const groupWrapper = document.getElementById('navSettingsGroupWrapper');
      if (groupWrapper) {
        groupWrapper.classList.toggle('open');
      }
    });
  }

  // Submenu: Change Password
  if (elements.navSubItemPassword) {
    elements.navSubItemPassword.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupWrapper = document.getElementById('navSettingsGroupWrapper');
      if (groupWrapper) groupWrapper.classList.add('open');
      switchView('password', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }

  // Submenu: Permissions
  if (elements.navSubItemPermissions) {
    elements.navSubItemPermissions.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupWrapper = document.getElementById('navSettingsGroupWrapper');
      if (groupWrapper) groupWrapper.classList.add('open');
      switchView('permissions', renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView);
    });
  }
}

export function updateNavigationVisibility() {
  const canLogs = hasPermission('canViewLogs');
  const canTeam = hasPermission('canViewTeams');
  const canPassword = hasPermission('canChangePassword');
  const canPerms = hasPermission('canManagePermissions');
  const canSettings = canPassword || canPerms;

  if (elements.navItemLogs) elements.navItemLogs.style.display = canLogs ? 'flex' : 'none';
  if (elements.navItemTeam) elements.navItemTeam.style.display = canTeam ? 'flex' : 'none';

  // Parent Settings Group wrapper (contains Settings button + submenu)
  const groupWrapper = document.getElementById('navSettingsGroupWrapper');
  if (groupWrapper) {
    groupWrapper.style.display = canSettings ? 'block' : 'none';
  }
  if (elements.navItemSettings) {
    elements.navItemSettings.style.display = canSettings ? 'flex' : 'none';
  }

  // Submenu items
  if (elements.navSubItemPassword) {
    elements.navSubItemPassword.style.display = canPassword ? 'flex' : 'none';
  }
  if (elements.navSubItemPermissions) {
    elements.navSubItemPermissions.style.display = canPerms ? 'flex' : 'none';
  }
}

export function switchView(viewName, renderLeadsView, renderConversationsView, renderLogsView, renderTeamList, renderSettingsView) {
  updateNavigationVisibility();

  const canPassword = hasPermission('canChangePassword');
  const canPerms = hasPermission('canManagePermissions');
  const canSettings = canPassword || canPerms;

  let targetView = viewName;
  if (targetView === 'logs' && !hasPermission('canViewLogs')) {
    targetView = 'leads';
  }
  if (targetView === 'team' && !hasPermission('canViewTeams')) {
    targetView = 'leads';
  }

  if (targetView === 'settings' || targetView === 'password' || targetView === 'permissions') {
    if (!canSettings) {
      targetView = 'leads';
    } else if (targetView === 'permissions' && !canPerms) {
      targetView = canPassword ? 'password' : 'leads';
    } else if (targetView === 'password' && !canPassword) {
      targetView = canPerms ? 'permissions' : 'leads';
    } else if (targetView === 'settings') {
      targetView = canPassword ? 'password' : (canPerms ? 'permissions' : 'leads');
    }
  }

  state.activeView = targetView;

  const isSettingsGroup = targetView === 'password' || targetView === 'permissions';

  if (elements.navItemLeads) elements.navItemLeads.classList.toggle('active', targetView === 'leads');
  if (elements.navItemConversations) elements.navItemConversations.classList.toggle('active', targetView === 'conversations');
  if (elements.navItemLogs) elements.navItemLogs.classList.toggle('active', targetView === 'logs');
  if (elements.navItemTeam) elements.navItemTeam.classList.toggle('active', targetView === 'team');
  if (elements.navItemSettings) elements.navItemSettings.classList.toggle('active', isSettingsGroup);

  // Submenu items
  if (elements.navSubItemPassword) elements.navSubItemPassword.classList.toggle('active', targetView === 'password');
  if (elements.navSubItemPermissions) elements.navSubItemPermissions.classList.toggle('active', targetView === 'permissions');

  // Views display
  if (elements.leadsViewSection) elements.leadsViewSection.style.display = targetView === 'leads' ? 'flex' : 'none';
  if (elements.conversationsViewSection) elements.conversationsViewSection.style.display = targetView === 'conversations' ? 'flex' : 'none';
  if (elements.logsViewSection) elements.logsViewSection.style.display = targetView === 'logs' ? 'flex' : 'none';
  if (elements.teamViewSection) elements.teamViewSection.style.display = targetView === 'team' ? 'flex' : 'none';
  if (elements.passwordViewSection) elements.passwordViewSection.style.display = targetView === 'password' ? 'flex' : 'none';
  if (elements.permissionsViewSection) elements.permissionsViewSection.style.display = targetView === 'permissions' ? 'flex' : 'none';

  if (targetView === 'leads' && renderLeadsView) {
    renderLeadsView();
  } else if (targetView === 'conversations' && renderConversationsView) {
    renderConversationsView();
  } else if (targetView === 'logs' && renderLogsView) {
    renderLogsView();
  } else if (targetView === 'team' && renderTeamList) {
    renderTeamList();
  } else if (targetView === 'password' && renderSettingsView) {
    renderSettingsView();
  } else if (targetView === 'permissions') {
    if (renderSettingsView) renderSettingsView();
    renderPermissionsTab();
  }
}
