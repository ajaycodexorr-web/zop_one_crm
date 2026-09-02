/**
 * Firebase Connection & Real-Time Firestore Synchronization Service
 */

import { initializeFirebase, subscribeToLeads, subscribeToActivityLogs, subscribeToUsers, subscribeToRoles, fetchFirstUserMessage } from '../../firebase-config.js';
import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { DEMO_LEADS } from '../constants/demo-data.js';
import { playNotificationPing, showNewLeadNotificationBanner, showNewMessageNotificationBanner, triggerDesktopNotification, showToast } from '../utils/notifications.js';
import { addLeadNotification, initLeadNotifications } from '../components/notifications-dropdown.js';
import { addAuditLog, saveLogsToLocalStorage, updateLogsBadge } from './logging-service.js';
import { normalizePhone } from '../utils/formatters.js';

import { syncAllUsersToFirestore, saveTeamMembers, syncRolesFromFirestore } from './user-service.js';
import { logoutUser } from './auth-service.js';
import { updateComposerDisabledState } from '../components/composer.js';

let connectionTimeoutTimer = null;

export function updateConnectionStatus(status) {
  state.connectionStatus = status;

  if (status === 'connecting') {
    if (elements.connectionModal) elements.connectionModal.style.display = 'flex';
    if (elements.connectingState) elements.connectingState.style.display = 'flex';
    if (elements.connectionFailedState) elements.connectionFailedState.style.display = 'none';
  } else if (status === 'connected') {
    if (elements.connectionModal) elements.connectionModal.style.display = 'none';
  } else {
    // Error, disconnected, or standby failed case
    if (elements.connectionModal) elements.connectionModal.style.display = 'flex';
    if (elements.connectingState) elements.connectingState.style.display = 'none';
    if (elements.connectionFailedState) elements.connectionFailedState.style.display = 'flex';
  }
}

export function connectFirebase(renderLeadsView, renderConversationsView, renderLogsView, updateActiveChatHeader, switchView, highlightLeadCard, openLeadChat) {
  updateConnectionStatus('connecting');

  if (connectionTimeoutTimer) {
    clearTimeout(connectionTimeoutTimer);
  }

  // 10-Second Safety Timeout: If Firebase network fails to respond within 10s, trigger error popup
  connectionTimeoutTimer = setTimeout(() => {
    if (state.connectionStatus === 'connecting') {
      console.warn("Firebase connection timed out after 10 seconds.");
      updateConnectionStatus('error');
      const errEl = document.getElementById('connectionErrorMessage');
      if (errEl) {
        errEl.textContent = "Could not reach the database. Please check your internet connection or try again.";
      }
    }
  }, 10000);

  try {
    const res = initializeFirebase();
    if (!res || !res.success) {
      if (connectionTimeoutTimer) {
        clearTimeout(connectionTimeoutTimer);
        connectionTimeoutTimer = null;
      }
      console.warn("Firebase initialization status:", res);
      if (res && res.status === 'standby') {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('error');
        const errEl = document.getElementById('connectionErrorMessage');
        if (errEl) {
          errEl.textContent = res?.message || "Failed to initialize connection. Please verify your settings.";
        }
      }
      return;
    }

    startRealtimeSync(renderLeadsView, renderConversationsView, renderLogsView, updateActiveChatHeader, switchView, highlightLeadCard, openLeadChat);
  } catch (err) {
    if (connectionTimeoutTimer) {
      clearTimeout(connectionTimeoutTimer);
      connectionTimeoutTimer = null;
    }
    console.error("Firebase connection error:", err);
    updateConnectionStatus('error');
  }
}

function startRealtimeSync(renderLeadsView, renderConversationsView, renderLogsView, updateActiveChatHeader, switchView, highlightLeadCard, openLeadChat) {
  // 1. Subscribe to Team Users collection
  if (state.unsubscribeUsers) {
    state.unsubscribeUsers();
  }
  state.unsubscribeUsers = subscribeToUsers((users) => {
    if (users && users.length > 0) {
      // Sync Firestore users with local team members state
      state.teamMembers = users;
      saveTeamMembers(users);

      // Verify currently active user has not been deleted by admin
      if (state.currentUser && !['super_admin', 'admin'].includes(state.currentUser.role)) {
        const stillExists = users.some(u => u.id === state.currentUser.id);
        if (!stillExists) {
          showToast("Your account has been deleted by an administrator.", "error");
          setTimeout(() => {
            window.location.reload();
          }, 1200);
          return;
        }
      }

      if (renderLeadsView) renderLeadsView();
      if (renderConversationsView) renderConversationsView();
    }
  });

  // 1.5. Subscribe to Roles collection (Real-time RBAC Permission enforcement)
  if (state.unsubscribeRoles) {
    state.unsubscribeRoles();
  }
  state.unsubscribeRoles = subscribeToRoles((roles) => {
    if (roles && roles.length > 0) {
      syncRolesFromFirestore();
      updateComposerDisabledState();
      if (renderLeadsView) renderLeadsView();
      if (renderConversationsView) renderConversationsView();
    }
  });

  // 2. Subscribe to System Audit Logs collection
  if (state.unsubscribeLogs) {
    state.unsubscribeLogs();
  }
  state.unsubscribeLogs = subscribeToActivityLogs((remoteLogs) => {
    if (remoteLogs && Array.isArray(remoteLogs)) {
      const localLogs = state.logs || [];
      const logMap = new Map();

      remoteLogs.forEach(l => logMap.set(l.id, l));
      localLogs.forEach(l => {
        if (!logMap.has(l.id)) logMap.set(l.id, l);
      });

      const mergedList = Array.from(logMap.values()).sort((a, b) => {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      });

      state.logs = mergedList;
      saveLogsToLocalStorage();
      updateLogsBadge();
      if (renderLogsView) renderLogsView();
    }
  });

  // 3. Subscribe to Real-Time Leads
  if (state.unsubscribeLeads) {
    state.unsubscribeLeads();
  }

  state.unsubscribeLeads = subscribeToLeads(
    (leadsList) => {
      if (connectionTimeoutTimer) {
        clearTimeout(connectionTimeoutTimer);
        connectionTimeoutTimer = null;
      }
      updateConnectionStatus('connected');
      if (elements.leadsLoadingState) elements.leadsLoadingState.style.display = 'none';

      console.log(`📊 [CRM App] Real-time leads update received (${leadsList.length} total docs in Firestore):`, leadsList);

      const isInitial = state.isInitialLeadsLoad;
      state.isInitialLeadsLoad = false;

      if (isInitial) {
        initLeadNotifications(leadsList);
      }

      leadsList.forEach(lead => {
        const isCrmInitiated = (lead.platform || lead.source || '').toUpperCase() === 'CRM' || 
                               lead.initiatedBy === 'crm' || 
                               lead.createdBy === 'crm' ||
                               lead.creatorRole === 'admin' ||
                               lead.creatorRole === 'agent' ||
                               lead.creatorRole === 'maker';
        const isCustomerLead = lead.isLead !== false && !isCrmInitiated;
        const isNewDoc = !state.knownLeadIds.has(lead.id);
        const lastMsgKey = String(lead.lastMessageAt || lead.lastMessage || lead.updatedAt || '');
        const prevMsgKey = state.knownLeadMessages ? state.knownLeadMessages.get(lead.id) : null;
        const hasNewMessage = prevMsgKey !== undefined && prevMsgKey !== null && prevMsgKey !== lastMsgKey && lastMsgKey !== '';
        const isOutgoing = (lead.lastMessageDirection || lead.direction || '').toLowerCase() === 'outgoing' ||
                           (lead.lastMessageDirection || lead.direction || '').toLowerCase() === 'outbound';

        // 1. "New Lead Received" popup banner, sound & Desktop notification ONLY for genuinely new incoming customer leads
        if (!isInitial && isNewDoc && isCustomerLead && !isOutgoing) {
          const isMetaAd = Boolean(lead.referral || (lead.source && (lead.source.toLowerCase().includes('meta') || lead.source.toLowerCase().includes('ad'))));
          const srcName = isMetaAd ? 'Meta Ads' : (lead.source || lead.platform || 'Direct WhatsApp');
          const refDetails = lead.referral ? ` [Meta Ad: ${lead.referral.headline || lead.referral.source_id || 'CTWA'}]` : '';
          const firstQuery = lead.firstMessage || lead.query || lead.lastMessage || 'New inquiry';

          console.log(
            `%c📥 [NEW INBOUND LEAD] %c${lead.name || lead.phone} via ${srcName}`,
            'background: #1d4ed8; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'color: #1d4ed8; font-weight: bold; font-size: 12px;',
            {
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              source: srcName,
              referralData: lead.referral || 'None (Direct WhatsApp / Organic)',
              adHeadline: lead.referral ? (lead.referral.headline || lead.referral.title || 'N/A') : 'N/A',
              adId: lead.referral ? (lead.referral.source_id || 'N/A') : 'N/A',
              userQuery: firstQuery,
              rawPayload: lead
            }
          );

          playNotificationPing('lead');
          addLeadNotification(lead, 'lead');
          addAuditLog(
            'incoming_lead',
            lead.id,
            lead.name || lead.phone,
            `Inbound lead received via ${srcName}${refDetails}. Query: "${firstQuery}"`,
            lead.referral ? 'Meta Ads Webhook' : 'WhatsApp Cloud API'
          );
          showNewLeadNotificationBanner(lead, (targetLead) => {
            if (switchView) switchView('leads');
            if (highlightLeadCard) highlightLeadCard(targetLead.id);
          });
          triggerDesktopNotification(lead, (targetLead) => {
            if (switchView) switchView('leads');
            if (highlightLeadCard) highlightLeadCard(targetLead.id);
          }, 'lead');
        } else if (!isInitial && !isNewDoc && hasNewMessage && !isOutgoing && isCustomerLead) {
          // 2. Incoming customer replies on existing conversations:
          console.log(
            `%c💬 [INCOMING MESSAGE] %c${lead.name || lead.phone}: "${lead.lastMessage || ''}"`,
            'background: #047857; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'color: #047857; font-weight: bold;',
            {
              leadId: lead.id,
              name: lead.name,
              phone: lead.phone,
              messageText: lead.lastMessage,
              timestamp: lead.lastMessageAt || new Date().toISOString(),
              rawLead: lead
            }
          );

          addAuditLog(
            'incoming_message',
            lead.id,
            lead.name || lead.phone,
            `Customer message: "${lead.lastMessage || 'Incoming message'}"`,
            lead.name || lead.phone || 'Customer'
          );

          // Check if this particular user chat is currently open and active
          const isCurrentChatActive = state.activeView === 'conversations' && state.activeLeadId === lead.id;

          if (!isCurrentChatActive) {
            playNotificationPing('message');
            addLeadNotification(lead, 'message');
            showNewMessageNotificationBanner(lead, (targetLead) => {
              if (openLeadChat) {
                openLeadChat(targetLead.id);
              } else if (switchView) {
                switchView('conversations');
                if (window.selectLead) window.selectLead(targetLead.id);
              }
            });
            triggerDesktopNotification(lead, (targetLead) => {
              if (openLeadChat) {
                openLeadChat(targetLead.id);
              } else if (switchView) {
                switchView('conversations');
                if (window.selectLead) window.selectLead(targetLead.id);
              }
            }, 'message');
          }
        }

        state.knownLeadIds.add(lead.id);
        if (!state.knownLeadMessages) state.knownLeadMessages = new Map();
        state.knownLeadMessages.set(lead.id, lastMsgKey);
      });

      const deduplicatedMap = new Map();
      leadsList.forEach(lead => {
        const normP = normalizePhone(lead.phone);
        const key = normP ? `phone_${normP}` : lead.id;
        if (!deduplicatedMap.has(key)) {
          deduplicatedMap.set(key, lead);
        } else {
          // Merge lead records if same phone exists with different ID format
          const existing = deduplicatedMap.get(key);
          deduplicatedMap.set(key, { ...existing, ...lead, name: lead.name || existing.name });
        }
      });

      state.leads = Array.from(deduplicatedMap.values());
      if (renderLeadsView) renderLeadsView();
      if (renderConversationsView) renderConversationsView();

      // Asynchronously fetch initial customer message for leads from subcollection
      state.leads.forEach(async (lead) => {
        if (!lead.firstMessage && !lead._firstUserMsg) {
          const firstMsgText = await fetchFirstUserMessage(lead.id);
          if (firstMsgText) {
            lead._firstUserMsg = firstMsgText;
            if (renderLeadsView) renderLeadsView();
          }
        }
      });

      if (state.activeLeadId && updateActiveChatHeader) {
        const currentActive = state.leads.find(l => l.id === state.activeLeadId);
        if (currentActive) updateActiveChatHeader(currentActive);
      }
    },
    (err) => {
      if (connectionTimeoutTimer) {
        clearTimeout(connectionTimeoutTimer);
        connectionTimeoutTimer = null;
      }
      console.error("Leads subscription error:", err);
      if (elements.leadsLoadingState) elements.leadsLoadingState.style.display = 'none';
      updateConnectionStatus('error');
      showToast(`Database listener error: ${err.message}`, 'error');
    }
  );
}
