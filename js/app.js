/**
 * Main Application Orchestrator & Initialization Controller
 */

import { updateLeadStatus, getSavedConfig, saveConfig } from '../firebase-config.js';
import { state } from './state/app-state.js';
import { elements } from './dom/elements.js';
import { showToast } from './utils/notifications.js';
import { setupExportHandlers } from './utils/export-excel.js';
import { loadSavedLogs } from './services/logging-service.js';
import { loadTeamMembers } from './services/user-service.js';
import { connectFirebase } from './services/firebase-service.js';
import { setupNavigation, switchView } from './components/navigation.js';
import { setupLeadsHandlers, renderLeadsView, highlightLeadCard } from './components/leads-table.js';
import { setupConversationsHandlers, renderConversationsView, openLeadChat, renderMessagesStream, updateActiveChatHeader } from './components/chat-inbox.js';
import { setupComposerHandlers } from './components/composer.js';
import { setupLightboxHandlers } from './components/lightbox.js';
import { setupLogsHandlers, renderLogsView } from './components/logs-table.js';
import { setupUserSwitcher } from './components/user-switcher.js';
import { setupTeamManagement, renderTeamList } from './components/team-management.js';
import { setupSettingsView, renderSettingsView } from './components/settings-view.js';
import { initAuthCheck, checkUserDisabledAndEnforceLogout } from './services/auth-service.js';
import { setupLoginView } from './components/login-view.js';
import { global_settings_CRM } from './constants/global-settings.js';
import { setupNotificationDropdown } from './components/notifications-dropdown.js';
import { normalizePhone } from './utils/formatters.js';
import { setupDateRangePicker } from './components/date-range-picker.js';

// Application Initialization Bootstrapper
document.addEventListener('DOMContentLoaded', () => {
  global_settings_CRM.apply();
  loadSavedLogs();
  loadTeamMembers();

  // Background Heartbeat Poller: Periodically check if active user status is disabled and enforce immediate logout!
  setInterval(() => {
    checkUserDisabledAndEnforceLogout();
  }, 1500);

  window.addEventListener('storage', (e) => {
    if (e.key === 'crm_team_members_v1') {
      loadTeamMembers();
      checkUserDisabledAndEnforceLogout();
    }
  });

  const handleRenderTeam = () => renderTeamList(handleRenderTeam);
  const handleRenderSettings = () => renderSettingsView();
  const handleSwitchView = (v) => switchView(v, handleRenderLeads, renderConversationsView, renderLogsView, handleRenderTeam, handleRenderSettings);
  const handleOpenLeadChat = (id) => openLeadChat(id, handleSwitchView, handleRenderLeads);
  const handleRenderLeads = () => renderLeadsView(renderConversationsView, handleOpenLeadChat);

  const triggerDatabaseConnection = () => {
    connectFirebase(
      handleRenderLeads,
      renderConversationsView,
      renderLogsView,
      updateActiveChatHeader,
      handleSwitchView,
      highlightLeadCard,
      handleOpenLeadChat
    );
  };

  // Setup Login Page & Authentication Check
  setupLoginView((user) => {
    setupUserSwitcher(() => {
      handleRenderLeads();
      renderConversationsView();
      renderLogsView();
      handleRenderSettings();
    });
    handleSwitchView('leads');
    triggerDatabaseConnection();
  });

  const isAuthenticated = initAuthCheck((user) => {
    setupUserSwitcher();
    if (user && (user.role === 'maker' || user.role === 'agent') && (state.activeView === 'team' || state.activeView === 'logs')) {
      handleSwitchView('leads');
    } else if (state.activeView) {
      handleSwitchView(state.activeView);
    } else {
      handleSwitchView('leads');
    }
    triggerDatabaseConnection();
  });

  // Setup UI Component Event Handlers
  setupUserSwitcher(() => {
    handleRenderLeads();
    renderConversationsView();
    renderLogsView();
    handleRenderSettings();
  });
  setupTeamManagement(() => {
    setupUserSwitcher(() => {
      handleRenderLeads();
      renderConversationsView();
      renderLogsView();
      handleRenderSettings();
    });
    handleRenderLeads();
  });
  setupSettingsView(() => {
    setupUserSwitcher(() => {
      handleRenderLeads();
      renderConversationsView();
      renderLogsView();
      handleRenderSettings();
    });
  });
  setupNavigation(handleRenderLeads, renderConversationsView, renderLogsView, handleRenderTeam, handleRenderSettings);
  setupLeadsHandlers(renderConversationsView, handleOpenLeadChat, handleRenderLeads);
  setupConversationsHandlers(handleSwitchView, handleRenderLeads);
  setupComposerHandlers(handleRenderLeads, renderConversationsView, renderMessagesStream, updateLeadStatus);
  setupLightboxHandlers();
  setupLogsHandlers();
  setupExportHandlers();
  setupDateRangePicker(handleRenderLeads);
  setupNotificationDropdown((leadId, type, notif) => {
    // Find matching lead in state.leads (by ID or normalized phone)
    let targetLead = state.leads.find(l => l.id === leadId);
    if (!targetLead && notif && notif.phone) {
      const normNotifPhone = normalizePhone(notif.phone);
      targetLead = state.leads.find(l => normalizePhone(l.phone) === normNotifPhone);
    }
    const resolvedLeadId = targetLead ? targetLead.id : leadId;

    if (type === 'message') {
      handleOpenLeadChat(resolvedLeadId);
    } else {
      // For lead notifications: switch to leads view, reset filter so lead is visible, and highlight
      state.leadsFilter = 'all';
      state.leadsCurrentPage = 1;
      handleSwitchView('leads');
      handleRenderLeads();
      highlightLeadCard(resolvedLeadId);
    }
  });
  setupConfigModalHandlers(handleRenderLeads, handleSwitchView, handleOpenLeadChat);
});

function setupConfigModalHandlers(handleRenderLeads, handleSwitchView, handleOpenLeadChat) {
  if (elements.popupRetryBtn) {
    elements.popupRetryBtn.addEventListener('click', () => {
      showToast('Attempting to reconnect to Database...', 'info');
      connectFirebase(
        handleRenderLeads,
        renderConversationsView,
        renderLogsView,
        updateActiveChatHeader,
        handleSwitchView,
        highlightLeadCard,
        handleOpenLeadChat
      );
    });
  }

  if (elements.configBtn) {
    elements.configBtn.addEventListener('click', () => {
      populateConfigForm();
      if (elements.configModal) elements.configModal.style.display = 'flex';
    });
  }

  if (elements.closeModalBtn) {
    elements.closeModalBtn.addEventListener('click', () => {
      if (elements.configModal) elements.configModal.style.display = 'none';
    });
  }

  if (elements.resetConfigBtn) {
    elements.resetConfigBtn.addEventListener('click', () => {
      localStorage.removeItem('wa_crm_firebase_config_v1');
      populateConfigForm();
      showToast('Reset to defaults', 'info');
    });
  }

  if (elements.firebaseConfigForm) {
    elements.firebaseConfigForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const config = {
        apiKey: elements.cfgApiKey ? elements.cfgApiKey.value.trim() : '',
        projectId: elements.cfgProjectId ? elements.cfgProjectId.value.trim() : 'gold-cash-whatsapp',
        authDomain: elements.cfgAuthDomain ? elements.cfgAuthDomain.value.trim() : 'gold-cash-whatsapp.firebaseapp.com',
        storageBucket: elements.cfgStorageBucket ? elements.cfgStorageBucket.value.trim() : 'gold-cash-whatsapp.appspot.com',
        messagingSenderId: elements.cfgMessagingSenderId ? elements.cfgMessagingSenderId.value.trim() : '',
        appId: elements.cfgAppId ? elements.cfgAppId.value.trim() : '',
        functionUrl: elements.cfgFunctionUrl ? elements.cfgFunctionUrl.value.trim() : 'sendWhatsAppMessage'
      };

      saveConfig(config);
      if (elements.configModal) elements.configModal.style.display = 'none';
      showToast('Database configuration saved. Connecting...', 'info');
      connectFirebase(
        handleRenderLeads,
        renderConversationsView,
        renderLogsView,
        updateActiveChatHeader,
        handleSwitchView,
        highlightLeadCard,
        handleOpenLeadChat
      );
    });
  }
}

function populateConfigForm() {
  const cfg = getSavedConfig();
  if (elements.cfgApiKey) elements.cfgApiKey.value = cfg.apiKey || '';
  if (elements.cfgProjectId) elements.cfgProjectId.value = cfg.projectId || 'gold-cash-whatsapp';
  if (elements.cfgAuthDomain) elements.cfgAuthDomain.value = cfg.authDomain || 'gold-cash-whatsapp.firebaseapp.com';
  if (elements.cfgStorageBucket) elements.cfgStorageBucket.value = cfg.storageBucket || 'gold-cash-whatsapp.appspot.com';
  if (elements.cfgMessagingSenderId) elements.cfgMessagingSenderId.value = cfg.messagingSenderId || '';
  if (elements.cfgAppId) elements.cfgAppId.value = cfg.appId || '';
  if (elements.cfgFunctionUrl) elements.cfgFunctionUrl.value = cfg.functionUrl || 'sendWhatsAppMessage';
}
