/**
 * Activity & Audit Logging Service
 */

import { createActivityLog } from '../../firebase-config.js';
import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';

export function addAuditLog(actionType, leadId, leadName, details, overridePerformer = null) {
  const activeUser = state.currentUser || { id: 'usr_admin', name: 'Admin User', role: 'admin' };
  const performerName = overridePerformer || activeUser.name || 'Admin User';
  const performerId = activeUser.id || 'usr_admin';
  const performerRole = activeUser.role || 'admin';

  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    actionType: actionType, // 'status_change', 'delete_lead', 'message_sent', 'assignee_change', 'user_created'
    leadId: leadId || '',
    leadName: leadName || 'N/A',
    performedBy: performerName,
    performerId: performerId,
    performerRole: performerRole,
    details: details || '',
    timestamp: new Date().toISOString()
  };

  state.logs.unshift(logEntry);
  saveLogsToLocalStorage();

  if (!state.demoMode) {
    try {
      createActivityLog(logEntry).catch(err => console.warn('Activity log Firestore sync failed:', err));
    } catch (e) {
      console.warn('Activity log error:', e);
    }
  }

  updateLogsBadge();
}

export function loadSavedLogs() {
  try {
    const saved = localStorage.getItem('crm_activity_logs');
    if (saved) {
      state.logs = JSON.parse(saved);
    } else {
      state.logs = [
        {
          id: 'log_seed_1',
          actionType: 'status_change',
          leadId: '919876543210',
          leadName: 'Maya Lin',
          performedBy: 'Admin User',
          details: 'Updated lead status to NEW',
          timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        },
        {
          id: 'log_seed_2',
          actionType: 'message_sent',
          leadId: '919876543210',
          leadName: 'Maya Lin',
          performedBy: 'Admin User',
          details: 'Sent WhatsApp response regarding webhook sync',
          timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString()
        },
        {
          id: 'log_seed_3',
          actionType: 'delete_lead',
          leadId: '919811223344',
          leadName: 'Rohan Sharma',
          performedBy: 'Admin User',
          details: 'Deleted lead and moved to Deleted status',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        }
      ];
      saveLogsToLocalStorage();
    }
  } catch (e) {
    state.logs = [];
  }
  updateLogsBadge();
}

export function saveLogsToLocalStorage() {
  try {
    localStorage.setItem('crm_activity_logs', JSON.stringify(state.logs.slice(0, 250)));
  } catch (e) {}
}

export function getLogCategory(log) {
  if (!log) return 'other';
  const type = (log.actionType || '').toLowerCase();
  const details = (log.details || '').toLowerCase();

  if (type === 'delete_lead' || details.includes('delete') || details.includes('moved to deleted')) {
    return 'deleted';
  }
  if (type === 'message_sent') {
    return 'message_sent';
  }
  if (type === 'assignee_change') {
    return 'assignee_change';
  }

  if (details.includes('to new')) return 'new';
  if (details.includes('to contacted')) return 'contacted';
  if (details.includes('to no_answer') || details.includes('to no answer')) return 'no_answer';
  if (details.includes('to follow_up') || details.includes('to follow up')) return 'follow_up';
  if (details.includes('to converted')) return 'converted';
  if (details.includes('to lost')) return 'lost';

  return 'status_change';
}

export function updateLogsBadge() {
  if (elements.countAllLogs) elements.countAllLogs.textContent = state.logs.length;

  const countNew = state.logs.filter(l => getLogCategory(l) === 'new').length;
  const countContacted = state.logs.filter(l => getLogCategory(l) === 'contacted').length;
  const countNoAnswer = state.logs.filter(l => getLogCategory(l) === 'no_answer').length;
  const countFollowUp = state.logs.filter(l => getLogCategory(l) === 'follow_up').length;
  const countConverted = state.logs.filter(l => getLogCategory(l) === 'converted').length;
  const countLost = state.logs.filter(l => getLogCategory(l) === 'lost').length;
  const countDeleted = state.logs.filter(l => getLogCategory(l) === 'deleted').length;
  const countMessages = state.logs.filter(l => getLogCategory(l) === 'message_sent').length;

  const countNewEl = document.getElementById('countLogNew');
  const countContactedEl = document.getElementById('countLogContacted');
  const countNoAnswerEl = document.getElementById('countLogNoAnswer');
  const countFollowUpEl = document.getElementById('countLogFollowUp');
  const countConvertedEl = document.getElementById('countLogConverted');
  const countLostEl = document.getElementById('countLogLost');

  if (countNewEl) countNewEl.textContent = countNew;
  if (countContactedEl) countContactedEl.textContent = countContacted;
  if (countNoAnswerEl) countNoAnswerEl.textContent = countNoAnswer;
  if (countFollowUpEl) countFollowUpEl.textContent = countFollowUp;
  if (countConvertedEl) countConvertedEl.textContent = countConverted;
  if (countLostEl) countLostEl.textContent = countLost;

  if (elements.countDeleteLogs) elements.countDeleteLogs.textContent = countDeleted;
  if (elements.countMessageLogs) elements.countMessageLogs.textContent = countMessages;
}
