/**
 * Team Inbox Conversations List & Active Chat Pane Controller
 */

import { subscribeToMessages, markLeadAsRead, resolveWhatsAppMediaUrl, addLeadNote, updateLeadStatus, updateLeadAssignee } from '../../firebase-config.js';
import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { DEMO_LEADS } from '../constants/demo-data.js';
import { escapeHtml, getInitials, formatFullDateTime, formatRelativeTime, formatTimeOnly, parseDate, normalizePhone, formatDisplayPhone, getLeadNotesList, getLatestLeadNote } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { clearAllStagedAttachments, autoResizeTextarea, updateComposerDisabledState } from './composer.js';
import { openLightbox } from './lightbox.js';
import { handleDeleteLead, openLeadNotesModal, updateActiveChatNotes, renderLeadNotesHistory } from './leads-table.js';
import { getUserFirstQuery } from '../utils/export-excel.js';
import { addAuditLog } from '../services/logging-service.js';
import { checkUserDisabledAndEnforceLogout } from '../services/auth-service.js';
import { hasPermission } from '../services/user-service.js';

export function setupConversationsHandlers(switchView, renderLeadsView) {
  if (elements.convSearchInput) {
    elements.convSearchInput.addEventListener('input', (e) => {
      state.convSearchQuery = e.target.value.trim().toLowerCase();
      renderConversationsView();
    });
  }

  document.querySelectorAll('.conversations-col .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.conversations-col .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.convFilter = pill.dataset.filter;
      renderConversationsView();
    });
  });

  if (elements.markReadBtn) {
    elements.markReadBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        markLeadAsRead(state.activeLeadId);
        const lead = state.leads.find(l => l.id === state.activeLeadId);
        if (lead) lead.unreadCount = 0;
        renderConversationsView();
        showToast('Marked as read', 'info');
      }
    });
  }

  // Open Lead Notes Modal from Active Chat Header & Quick Bar
  if (elements.chatNotesBtn) {
    elements.chatNotesBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        openLeadNotesModal(state.activeLeadId, renderLeadsView, renderConversationsView);
      }
    });
  }

  if (elements.chatAddNoteBtn) {
    elements.chatAddNoteBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        openLeadNotesModal(state.activeLeadId, renderLeadsView, renderConversationsView);
      }
    });
  }

  if (elements.refreshChatBtn) {
    elements.refreshChatBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        loadMessagesForLead(state.activeLeadId, renderLeadsView);
        showToast('Refreshing chat...', 'info');
      }
    });
  }

  if (elements.deleteLeadBtn) {
    elements.deleteLeadBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        handleDeleteLead(state.activeLeadId);
      }
    });
  }

  if (elements.closeErrorBannerBtn) {
    elements.closeErrorBannerBtn.addEventListener('click', () => {
      if (elements.chatErrorBanner) elements.chatErrorBanner.style.display = 'none';
    });
  }


  // Toggle Contact Details Sidebar
  if (elements.toggleContactDetailsBtn) {
    elements.toggleContactDetailsBtn.addEventListener('click', () => {
      if (!elements.contactDetailsPane) return;
      const isVisible = elements.contactDetailsPane.style.display !== 'none';
      elements.contactDetailsPane.style.display = isVisible ? 'none' : 'flex';
      elements.toggleContactDetailsBtn.classList.toggle('active', !isVisible);
    });
  }

  if (elements.closeContactDetailsBtn) {
    elements.closeContactDetailsBtn.addEventListener('click', () => {
      if (elements.contactDetailsPane) elements.contactDetailsPane.style.display = 'none';
      if (elements.toggleContactDetailsBtn) elements.toggleContactDetailsBtn.classList.remove('active');
    });
  }

  // Copy Phone Number
  if (elements.copyContactPhoneBtn) {
    elements.copyContactPhoneBtn.addEventListener('click', () => {
      if (state.activeLeadId) {
        const lead = state.leads.find(l => l.id === state.activeLeadId);
        const phone = lead ? (lead.phone || lead.id) : '';
        if (phone) {
          navigator.clipboard.writeText(phone);
          showToast('Phone number copied to clipboard!', 'info');
        }
      }
    });
  }

  // Sidebar Owner Select Change
  if (elements.contactDetailsOwnerSelect) {
    elements.contactDetailsOwnerSelect.addEventListener('change', async (e) => {
      if (checkUserDisabledAndEnforceLogout()) return;
      if (!hasPermission('canAssignLead')) {
        showToast("Permission denied: You do not have permission to reassign leads.", "error");
        return;
      }
      const newAssigneeId = e.target.value;
      const leadId = state.activeLeadId;
      if (!leadId) return;

      const lead = state.leads.find(l => l.id === leadId);
      const teamMembers = state.teamMembers || [];
      const assignedUser = teamMembers.find(u => u.id === newAssigneeId);
      const assigneeName = assignedUser ? assignedUser.name : 'Unassigned';

      if (lead) {
        lead.assigneeId = newAssigneeId || null;
        lead.assigneeName = assigneeName;
        lead.assignedAt = new Date().toISOString();
      }

      if (!state.demoMode) {
        try {
          await updateLeadAssignee(leadId, newAssigneeId, assigneeName);
        } catch (err) {
          console.warn("Assignee update error:", err);
        }
      }

      addAuditLog('assignee_change', leadId, lead ? lead.name : leadId, `Assigned owner changed to ${assigneeName}`);
      showToast(`Assigned owner changed to ${assigneeName}`, 'info');
      if (renderLeadsView) renderLeadsView(renderConversationsView);
      renderConversationsView();
    });
  }

  // Sidebar Status Select Change
  if (elements.contactDetailsStatusSelect) {
    elements.contactDetailsStatusSelect.addEventListener('change', async (e) => {
      if (checkUserDisabledAndEnforceLogout()) return;
      if (!hasPermission('canChangeStatus')) {
        showToast("Permission denied: You do not have permission to change lead status.", "error");
        return;
      }
      const newStatus = e.target.value;
      const leadId = state.activeLeadId;
      if (!leadId) return;

      const lead = state.leads.find(l => l.id === leadId);
      if (lead) {
        lead.status = newStatus;
      }

      if (!state.demoMode) {
        try {
          await updateLeadStatus(leadId, newStatus);
        } catch (err) {
          showToast(`Failed to update status: ${err.message}`, 'error');
        }
      }

      addAuditLog('status_change', leadId, lead ? lead.name : leadId, `Updated lead status to ${newStatus.toUpperCase()}`);
      showToast(`Lead status updated to ${newStatus}`, 'info');
      if (renderLeadsView) renderLeadsView(renderConversationsView);
      renderConversationsView();
    });
  }

  // Sidebar Add Note Form Submit
  if (elements.contactDetailsAddNoteForm) {
    elements.contactDetailsAddNoteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (checkUserDisabledAndEnforceLogout()) return;
      if (!hasPermission('canAddNote')) {
        showToast("Permission denied: You do not have permission to add notes.", "error");
        return;
      }
      const targetLeadId = state.activeLeadId;
      if (!targetLeadId) return;

      const lead = state.leads.find(l => l.id === targetLeadId);
      const newNoteText = elements.contactDetailsNoteInput ? elements.contactDetailsNoteInput.value.trim() : '';
      if (!newNoteText) return;

      const authorInfo = {
        id: state.currentUser ? state.currentUser.id : '',
        name: state.currentUser ? state.currentUser.name : 'Super Admin',
        role: state.currentUser ? state.currentUser.role : 'admin'
      };

      const submitBtn = elements.contactDetailsAddNoteSubmitBtn;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
      }

      try {
        let createdNote = null;
        if (!state.demoMode) {
          createdNote = await addLeadNote(targetLeadId, newNoteText, authorInfo);
        } else {
          createdNote = {
            id: 'note_' + Date.now(),
            text: newNoteText,
            authorId: authorInfo.id,
            authorName: authorInfo.name,
            authorRole: authorInfo.role,
            createdAt: new Date().toISOString()
          };
        }

        if (lead) {
          if (!Array.isArray(lead.notes)) {
            lead.notes = getLeadNotesList(lead);
          }
          lead.notes.push(createdNote);
          lead.latestNote = createdNote;
          lead.noteUpdatedAt = createdNote.createdAt;
        }

        // Re-render sidebar notes feed
        renderContactDetailsNotesFeed(lead);

        // Update active chat header preview
        updateActiveChatNotes(lead);

        addAuditLog('note_update', targetLeadId, lead ? lead.name : targetLeadId, `Added note: "${newNoteText.substring(0, 40)}..."`);
        showToast('Note added successfully!', 'info');

        if (elements.contactDetailsNoteInput) {
          elements.contactDetailsNoteInput.value = '';
        }

        if (renderLeadsView) renderLeadsView(renderConversationsView);
      } catch (err) {
        showToast(`Failed to add note: ${err.message}`, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Note';
        }
      }
    });
  }

  // Audit Logs Link
  if (elements.contactViewAuditBtn) {
    elements.contactViewAuditBtn.addEventListener('click', () => {
      if (switchView) {
        switchView('logs');
        if (elements.logsSearchInput && state.activeLeadId) {
          const lead = state.leads.find(l => l.id === state.activeLeadId);
          elements.logsSearchInput.value = lead ? (lead.name || lead.phone || lead.id) : state.activeLeadId;
          elements.logsSearchInput.dispatchEvent(new Event('input'));
        }
      }
    });
  }
}

export function hasWhatsAppConversation(lead) {
  if (!lead) return false;
  // If explicitly flagged as no WhatsApp messages yet, it is strictly excluded from conversations
  if (lead.hasWhatsAppMessages === false) return false;
  if (lead.hasWhatsAppMessages === true) return true;

  // If created via CRM and no reply/message recorded
  if (lead.initiatedBy === 'crm' && !lead.hasAdminReplied) {
    return false;
  }

  const hasMsgText = (typeof lead.lastMessage === 'string' && lead.lastMessage.trim() !== '') ||
                     (typeof lead.lastMessageText === 'string' && lead.lastMessageText.trim() !== '');
  return hasMsgText;
}

export function renderConversationsView() {
  const { leads, convSearchQuery, convFilter, activeLeadId, currentUser } = state;
  const isAgent = currentUser && (currentUser.role === 'agent' || currentUser.role === 'maker');

  // Deduplicate active leads with messages by ID or normalized phone number
  const uniqueMap = new Map();
  leads.forEach(lead => {
    if ((lead.status || '').toLowerCase() === 'deleted') return;
    if (!hasWhatsAppConversation(lead)) return;
    const normP = normalizePhone(lead.phone);
    const key = normP ? `phone_${normP}` : lead.id;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, lead);
    } else {
      const existing = uniqueMap.get(key);
      uniqueMap.set(key, { ...existing, ...lead, name: (lead.name && lead.name !== lead.phone) ? lead.name : existing.name });
    }
  });

  let activeConversations = Array.from(uniqueMap.values());

  // Strict Agent Filter: Agents ONLY see conversations for leads assigned to them ("Show only assign")
  if (isAgent) {
    activeConversations = activeConversations.filter(lead => lead.assigneeId === currentUser.id);

    // If active chat lead is not assigned to this agent, close active chat view
    if (activeLeadId) {
      const activeLead = leads.find(l => l.id === activeLeadId);
      if (activeLead && activeLead.assigneeId !== currentUser.id) {
        state.activeLeadId = null;
        if (elements.activeChatView) elements.activeChatView.style.display = 'none';
        if (elements.contactDetailsPane) elements.contactDetailsPane.style.display = 'none';
        if (elements.chatPlaceholder) elements.chatPlaceholder.style.display = 'flex';
      }
    }
  }

  const filtered = activeConversations.filter(lead => {
    const displayName = (lead.name || lead.phone || '').toLowerCase();
    const phone = (lead.phone || '').toLowerCase();
    const lastMsg = (lead.lastMessage || lead.lastMessageText || '').toLowerCase();

    const matchesSearch = !convSearchQuery ||
      displayName.includes(convSearchQuery) ||
      phone.includes(convSearchQuery) ||
      lastMsg.includes(convSearchQuery);

    const matchesFilter = convFilter === 'all' || (convFilter === 'unread' && (lead.unreadCount || 0) > 0);

    return matchesSearch && matchesFilter;
  });

  const totalCount = activeConversations.length;
  const unreadCount = activeConversations.filter(l => (l.unreadCount || 0) > 0).length;

  if (elements.convAllCount) elements.convAllCount.textContent = totalCount;
  if (elements.convUnreadCount) elements.convUnreadCount.textContent = unreadCount;
  if (elements.convActiveCount) elements.convActiveCount.textContent = `${filtered.length} conversations`;
  if (elements.navConversationsCount) elements.navConversationsCount.textContent = unreadCount || totalCount;

  if (!elements.conversationsList) return;

  if (filtered.length === 0) {
    elements.conversationsList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No conversations</div>`;
    return;
  }

  elements.conversationsList.innerHTML = filtered.map(lead => {
    const isActive = lead.id === activeLeadId;
    const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
    const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
    const relativeTime = formatRelativeTime(lead.lastMessageAt || lead.createdAt);
    const hasUnread = (lead.unreadCount || 0) > 0;
    const lastMsgText = lead.lastMessage || lead.lastMessageText || 'No messages yet';
    const initials = getInitials(displayName);
    const isCrmPlatform = (lead.platform || lead.source || '').toUpperCase() === 'CRM';

    return `
      <div class="conv-item ${isActive ? 'active' : ''}" data-lead-id="${escapeHtml(lead.id)}">
        <div class="conv-avatar-wrap">
          <div class="conv-avatar">${escapeHtml(initials)}</div>
          <span class="wa-icon-badge ${isCrmPlatform ? 'crm' : ''}" title="${isCrmPlatform ? 'CRM Lead' : 'WhatsApp Lead'}">
            ${isCrmPlatform ? '<i class="fa-solid fa-laptop"></i>' : '<i class="fa-brands fa-whatsapp"></i>'}
          </span>
        </div>
        <div class="conv-info">
          <div class="conv-top-row">
            <span class="conv-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
            <span class="conv-time">${relativeTime}</span>
          </div>
          <div class="conv-snippet" title="${escapeHtml(lastMsgText)}">
            ${escapeHtml(lastMsgText)}
          </div>
        </div>
        ${hasUnread ? `<span class="conv-unread-pill">${lead.unreadCount}</span>` : ''}
      </div>
    `;
  }).join('');

  elements.conversationsList.querySelectorAll('.conv-item').forEach(item => {
    item.addEventListener('click', () => {
      selectLead(item.dataset.leadId);
    });
  });
}

export function openLeadChat(leadId, switchView, renderLeadsView) {
  if (switchView) switchView('conversations');
  selectLead(leadId, renderLeadsView);
}

export function selectLead(leadId, renderLeadsView) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  state.activeLeadId = leadId;

  if ((lead.unreadCount || 0) > 0) {
    lead.unreadCount = 0;
    markLeadAsRead(leadId);
  }

  renderConversationsView();
  updateActiveChatHeader(lead);

  if (elements.chatPlaceholder) elements.chatPlaceholder.style.display = 'none';
  if (elements.activeChatView) elements.activeChatView.style.display = 'flex';
  if (elements.contactDetailsPane) elements.contactDetailsPane.style.display = 'flex';
  if (elements.chatErrorBanner) elements.chatErrorBanner.style.display = 'none';

  clearAllStagedAttachments();
  updateComposerDisabledState();

  if (state.windowTimerInterval) {
    clearInterval(state.windowTimerInterval);
  }
  update24HourWindowTimer();
  state.windowTimerInterval = setInterval(update24HourWindowTimer, 1000);

  loadMessagesForLead(leadId, renderLeadsView);

  setTimeout(() => {
    updateComposerDisabledState();
    if (elements.messageTextInput && !elements.messageTextInput.disabled) {
      elements.messageTextInput.focus();
    }
  }, 100);
}

export function updateActiveChatHeader(lead) {
  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const phoneDisplay = formatDisplayPhone(lead.phone || lead.id);
  if (elements.chatContactName) elements.chatContactName.textContent = displayName;
  if (elements.chatContactPhone) elements.chatContactPhone.innerHTML = `<i class="fa-solid fa-phone"></i> ${escapeHtml(phoneDisplay)}`;
  if (elements.chatContactAvatar) elements.chatContactAvatar.textContent = getInitials(displayName);
  
  if (elements.deleteLeadBtn) {
    const isDeleted = (lead.status || '').toLowerCase() === 'deleted';
    const canDelete = hasPermission('canDeleteLead') && (!state.currentUser || state.currentUser.status !== 'disabled');
    elements.deleteLeadBtn.style.display = isDeleted ? 'none' : 'inline-flex';
    elements.deleteLeadBtn.disabled = !canDelete;
    elements.deleteLeadBtn.style.cursor = canDelete ? 'pointer' : 'not-allowed';
    elements.deleteLeadBtn.style.opacity = canDelete ? '1' : '0.45';
    elements.deleteLeadBtn.title = canDelete ? 'Delete lead' : 'You do not have permission to delete leads';
  }

  updateComposerDisabledState();
  updateActiveChatNotes(lead);
  renderContactDetailsPanel(lead);
}

export function renderContactDetailsPanel(lead) {
  if (!lead || !elements.contactDetailsPane) return;

  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const phoneDisplay = formatDisplayPhone(lead.phone || lead.id);
  const userFirstQuery = getUserFirstQuery(lead);

  if (elements.contactDetailsAvatar) {
    elements.contactDetailsAvatar.textContent = getInitials(displayName);
  }

  if (elements.contactDetailsPhone) {
    elements.contactDetailsPhone.textContent = phoneDisplay;
  }
  if (elements.contactDetailsName) {
    elements.contactDetailsName.textContent = displayName;
  }

  // Populate Owner Select dropdown
  if (elements.contactDetailsOwnerSelect) {
    const teamMembers = state.teamMembers || [];
    const currentAssigneeId = lead.assigneeId || '';
    const canAssign = hasPermission('canAssignLead');
    elements.contactDetailsOwnerSelect.disabled = !canAssign;
    elements.contactDetailsOwnerSelect.innerHTML = `
      <option value="" ${!currentAssigneeId ? 'selected' : ''}>Unassigned</option>
      ${teamMembers.map(user => `
        <option value="${user.id}" ${currentAssigneeId === user.id ? 'selected' : ''}>
          ${user.role === 'admin' ? '🛡️' : '👤'} ${escapeHtml(user.name)}
        </option>
      `).join('')}
    `;
  }

  // Set Status Select dropdown
  if (elements.contactDetailsStatusSelect) {
    const canChangeStat = hasPermission('canChangeStatus');
    elements.contactDetailsStatusSelect.disabled = !canChangeStat;
    elements.contactDetailsStatusSelect.value = (lead.status || 'new').toLowerCase();
  }

  // Notes permissions
  const canNote = hasPermission('canAddNote');
  if (elements.contactDetailsNoteInput) {
    elements.contactDetailsNoteInput.disabled = !canNote;
    elements.contactDetailsNoteInput.placeholder = canNote ? 'Add internal team note...' : 'No permission to add notes.';
  }
  if (elements.contactDetailsAddNoteSubmitBtn) {
    elements.contactDetailsAddNoteSubmitBtn.disabled = !canNote;
    elements.contactDetailsAddNoteSubmitBtn.style.display = canNote ? 'inline-flex' : 'none';
  }

  // Update Source Tag Pill
  const platformPill = document.getElementById('contactDetailsPlatformPill');
  if (platformPill) {
    if (lead.referral || (lead.source && (lead.source.toLowerCase().includes('meta') || lead.source.toLowerCase().includes('ad')))) {
      const headline = lead.referral && (lead.referral.headline || lead.referral.title) ? ` (${lead.referral.headline})` : '';
      platformPill.className = 'tag-pill meta-ads';
      platformPill.innerHTML = '<i class="fa-brands fa-meta"></i> Meta Ads' + escapeHtml(headline);
    } else {
      const raw = (lead.source || lead.platform || 'Direct WhatsApp').trim();
      const lower = raw.toLowerCase();
      if (lower === 'whatsapp' || lower.includes('direct whatsapp')) {
        platformPill.className = 'tag-pill whatsapp';
        platformPill.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Direct WhatsApp';
      } else if (lower.includes('website')) {
        platformPill.className = 'tag-pill website';
        platformPill.innerHTML = '<i class="fa-solid fa-globe"></i> ' + escapeHtml(raw);
      } else if (lower.includes('message')) {
        platformPill.className = 'tag-pill message';
        platformPill.innerHTML = '<i class="fa-solid fa-comment-dots"></i> ' + escapeHtml(raw);
      } else if (lower.includes('call') || lower.includes('phone')) {
        platformPill.className = 'tag-pill phone';
        platformPill.innerHTML = '<i class="fa-solid fa-phone"></i> ' + escapeHtml(raw);
      } else if (lower === 'crm') {
        platformPill.className = 'tag-pill crm';
        platformPill.innerHTML = '<i class="fa-solid fa-laptop"></i> CRM';
      } else {
        platformPill.className = 'tag-pill custom-source';
        platformPill.innerHTML = '<i class="fa-solid fa-tag"></i> ' + escapeHtml(raw);
      }
    }
  }

  // Populate Fields tab
  if (elements.contactDetailsUserQuery) {
    elements.contactDetailsUserQuery.textContent = userFirstQuery || 'No initial message query';
  }
  if (elements.contactDetailsLeadId) {
    elements.contactDetailsLeadId.textContent = lead.id || '-';
  }
  if (elements.contactDetailsCreatedDate) {
    elements.contactDetailsCreatedDate.textContent = formatFullDateTime(lead.createdAt || lead.lastMessageAt);
  }
  if (elements.contactDetailsLastActivity) {
    elements.contactDetailsLastActivity.textContent = formatRelativeTime(lead.lastMessageAt || lead.createdAt);
  }

  // Set Footer Metadata
  if (elements.contactCreatedBy) {
    elements.contactCreatedBy.textContent = lead.creatorName || (lead.platform === 'WhatsApp' ? 'WhatsApp Cloud API' : 'CRM');
  }
  if (elements.contactCreatedOn) {
    elements.contactCreatedOn.textContent = formatFullDateTime(lead.createdAt || lead.lastMessageAt);
  }

  // Render Sidebar Notes Feed
  renderContactDetailsNotesFeed(lead);
}

export function renderContactDetailsNotesFeed(lead) {
  if (!lead || !elements.contactDetailsNotesList) return;

  const notesList = getLeadNotesList(lead);
  if (elements.contactNotesCountBadge) {
    elements.contactNotesCountBadge.textContent = notesList.length;
  }

  if (notesList.length === 0) {
    if (elements.contactDetailsEmptyNotes) elements.contactDetailsEmptyNotes.style.display = 'block';
    elements.contactDetailsNotesList.innerHTML = '';
    return;
  }

  if (elements.contactDetailsEmptyNotes) elements.contactDetailsEmptyNotes.style.display = 'none';

  // Reverse so newest is at the top
  const sortedNotes = [...notesList].reverse();

  elements.contactDetailsNotesList.innerHTML = sortedNotes.map((note, idx) => {
    const authorName = note.authorName || 'Agent';
    const initials = getInitials(authorName);
    const timeFormatted = formatFullDateTime(note.createdAt);
    const relTime = formatRelativeTime(note.createdAt);
    const isLatest = idx === 0;

    return `
      <div class="contact-note-card ${isLatest ? 'latest-note-card' : ''}">
        <div class="note-card-top">
          <div class="note-card-author">
            <span class="note-card-author-avatar">${escapeHtml(initials)}</span>
            <span>${escapeHtml(authorName)}</span>
          </div>
          <span class="note-card-time" title="${escapeHtml(timeFormatted)}">
            <i class="fa-regular fa-clock"></i> ${escapeHtml(relTime)}
          </span>
        </div>
        <div class="note-card-text">${escapeHtml(note.text || '')}</div>
      </div>
    `;
  }).join('');
}

export function loadMessagesForLead(leadId, renderLeadsView) {
  if (elements.messagesLoading) elements.messagesLoading.style.display = 'flex';
  if (elements.messagesEmptyChat) elements.messagesEmptyChat.style.display = 'none';
  if (elements.messagesStream) elements.messagesStream.innerHTML = '';

  if (state.demoMode) {
    if (elements.messagesLoading) elements.messagesLoading.style.display = 'none';
    const demoLead = DEMO_LEADS.find(l => l.id === leadId);
    state.messages = demoLead ? (demoLead.messages || []) : [];
    renderMessagesStream();
    return;
  }

  if (state.unsubscribeMessages) {
    state.unsubscribeMessages();
  }

  state.unsubscribeMessages = subscribeToMessages(
    leadId,
    (messagesList) => {
      if (elements.messagesLoading) elements.messagesLoading.style.display = 'none';
      state.messages = messagesList;
      renderMessagesStream();
      console.log(
        `%c📨 [MESSAGES LOADED] %cLead: ${leadId} (${messagesList.length} messages received)`,
        'background: #7c3aed; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 3px;',
        'color: #7c3aed; font-weight: bold;',
        messagesList
      );
      update24HourWindowTimer();

      // Extract & cache the user's first incoming message for User Query column
      const activeLead = state.leads.find(l => l.id === leadId);
      if (activeLead && messagesList.length > 0) {
        const firstIncoming = messagesList.find(m => m.direction === 'incoming' || m.fromUser === true);
        if (firstIncoming) {
          const txt = firstIncoming.text || firstIncoming.caption || firstIncoming.message;
          if (txt && typeof txt === 'string' && txt.trim()) {
            activeLead._firstUserMsg = txt.trim();
            if (renderLeadsView) renderLeadsView();
          }
        }
      }
    },
    (err) => {
      console.error(`Messages fetch failed for lead ${leadId}:`, err);
      if (elements.messagesLoading) elements.messagesLoading.style.display = 'none';
      showToast(`Error loading messages: ${err.message}`, 'error');
    }
  );
}

export function renderMessagesStream() {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    if (elements.messagesEmptyChat) elements.messagesEmptyChat.style.display = 'flex';
    if (elements.messagesStream) elements.messagesStream.innerHTML = '';
    return;
  }

  if (elements.messagesEmptyChat) elements.messagesEmptyChat.style.display = 'none';

  let html = '';
  let lastDateString = null;

  messages.forEach((msg, msgIndex) => {
    const msgDate = parseDate(msg.createdAt || msg.timestamp);
    const dateString = msgDate ? msgDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    if (dateString && dateString !== lastDateString) {
      html += `<div class="date-divider">${dateString}</div>`;
      lastDateString = dateString;
    }

    const isOutgoing = (msg.direction === 'outgoing' || msg.direction === 'outbound' || msg.fromUser === false) && msg.direction !== 'incoming';
    const directionClass = isOutgoing ? 'outgoing' : 'incoming';
    const timeFormatted = formatTimeOnly(msg.createdAt || msg.timestamp);
    const status = (msg.status || (isOutgoing ? 'sent' : 'received')).toLowerCase();
    const isFailed = isOutgoing && status === 'failed';

    const normalized = normalizeMessageMedia(msg);
    const performerName = isOutgoing ? (msg.performedByName || msg.performedBy || msg.senderName || 'Agent') : '';
    const bubbleContent = renderMessageBubbleContent(normalized, msg, msgIndex);
    const isMedia = normalized.type !== 'text';

    html += `
      <div class="message-row ${directionClass}">
        <div class="message-bubble ${isMedia ? 'bubble-media' : ''} ${isFailed ? 'bubble-failed' : ''}">
          ${bubbleContent}
          <div class="message-meta">
            ${isOutgoing && performerName ? `<span class="msg-assignee-tag" title="Sent by: ${escapeHtml(performerName)}"><i class="fa-solid fa-user-check"></i> ${escapeHtml(performerName)}</span>` : ''}
            <span class="message-time">${timeFormatted}</span>
            ${getStatusIconHtml(status, isOutgoing)}
          </div>
        </div>
      </div>
    `;
  });

  if (elements.messagesStream) {
    elements.messagesStream.innerHTML = html;
    scrollChatToBottom();
    attachMessageStreamInteractions();
    resolvePendingMediaIds();
  }
}

function normalizeMessageMedia(msg) {
  let type = (msg.type || '').toLowerCase();
  let mediaUrl = msg.mediaUrl || msg.url || msg.link || '';
  let mediaId = msg.mediaId || msg.media_id || '';
  let filename = msg.filename || msg.name || '';
  let caption = msg.caption || '';
  let text = msg.text || '';

  if (msg.image && typeof msg.image === 'object') {
    if (!type || type === 'text') type = 'image';
    if (!mediaId && msg.image.id) mediaId = msg.image.id;
    if (!mediaUrl && (msg.image.url || msg.image.link)) mediaUrl = msg.image.url || msg.image.link;
    if (!caption && msg.image.caption) caption = msg.image.caption;
  }
  if (msg.document && typeof msg.document === 'object') {
    if (!type || type === 'text') type = 'document';
    if (!mediaId && msg.document.id) mediaId = msg.document.id;
    if (!mediaUrl && (msg.document.url || msg.document.link)) mediaUrl = msg.document.url || msg.document.link;
    if (!filename && msg.document.filename) filename = msg.document.filename;
    if (!caption && msg.document.caption) caption = msg.document.caption;
  }
  if (msg.video && typeof msg.video === 'object') {
    if (!type || type === 'text') type = 'video';
    if (!mediaId && msg.video.id) mediaId = msg.video.id;
    if (!mediaUrl && (msg.video.url || msg.video.link)) mediaUrl = msg.video.url || msg.video.link;
    if (!caption && msg.video.caption) caption = msg.video.caption;
  }

  if (mediaId && (!mediaUrl || mediaUrl.includes('facebook.com') || mediaUrl.includes('fbsbx.com'))) {
    mediaUrl = `https://whatsappmediaproxy-udyapyjpza-uc.a.run.app?mediaId=${encodeURIComponent(mediaId)}`;
  }

  if (isImageUrl(mediaUrl) || isImageUrl(filename)) type = 'image';
  else if (isVideoUrl(mediaUrl) || isVideoUrl(filename)) type = 'video';
  else if (isPdfUrl(mediaUrl) || isPdfUrl(filename)) type = 'document';

  return { type: type || 'text', mediaUrl, mediaId, filename, caption, text };
}

function renderMessageBubbleContent(norm, origMsg, msgIndex) {
  const { type, mediaUrl, mediaId, filename, caption, text } = norm;
  
  let captionDisplay = (caption && caption.trim() && caption !== text) ? caption.trim() : (text && text !== caption ? text.trim() : '');
  
  const genericLabels = ['photo', '📷 photo', 'image', '📷 image', 'video', '🎥 video', 'document', '📄 document', 'file'];
  if (captionDisplay && (
      genericLabels.includes(captionDisplay.toLowerCase().trim()) ||
      captionDisplay === filename || 
      captionDisplay === origMsg.filename ||
      captionDisplay === origMsg.name ||
      isImageUrl(captionDisplay) ||
      isVideoUrl(captionDisplay) ||
      isPdfUrl(captionDisplay) ||
      /\.(png|jpe?g|gif|webp|svg|mp4|pdf|mov|avi)$/i.test(captionDisplay)
  )) {
    captionDisplay = '';
  }

  const isUploading = origMsg.status === 'sending' || origMsg.isUploading === true;
  const uploadOverlayHtml = isUploading ? `
    <div class="media-upload-overlay">
      <div class="media-upload-spinner-circle">
        <i class="fa-solid fa-arrow-up-from-bracket media-upload-icon"></i>
        <div class="media-upload-spinner"></div>
      </div>
      <span class="media-upload-text">Uploading...</span>
    </div>
  ` : '';

  if (type === 'image' || (mediaUrl && isImageUrl(mediaUrl))) {
    return `
      <div class="msg-image-wrap" data-lightbox-url="${escapeHtml(mediaUrl)}">
        <img src="${escapeHtml(mediaUrl)}" alt="WhatsApp photo" loading="lazy">
        ${uploadOverlayHtml}
        ${!isUploading ? `<span class="image-zoom-badge"><i class="fa-solid fa-magnifying-glass-plus"></i> View</span>` : ''}
      </div>
      ${captionDisplay ? `<div class="msg-caption">${formatMessageTextWithLinks(captionDisplay)}</div>` : ''}
    `;
  }

  if (type === 'video' || (mediaUrl && isVideoUrl(mediaUrl))) {
    return `
      <div class="msg-video-wrap">
        <video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video>
        ${uploadOverlayHtml}
      </div>
      ${captionDisplay ? `<div class="msg-caption">${formatMessageTextWithLinks(captionDisplay)}</div>` : ''}
    `;
  }

  if (type === 'document' || (mediaUrl && isPdfUrl(mediaUrl)) || filename) {
    const docName = filename || 'Document.pdf';
    return `
      <a href="${escapeHtml(mediaUrl)}" class="msg-doc-card" target="_blank" download="${escapeHtml(docName)}">
        <i class="fa-solid fa-file-pdf"></i>
        <span>${escapeHtml(docName)}</span>
        ${uploadOverlayHtml}
      </a>
      ${captionDisplay ? `<div class="msg-caption">${formatMessageTextWithLinks(captionDisplay)}</div>` : ''}
    `;
  }

  return `<div class="message-text">${formatMessageTextWithLinks(text || '')}</div>`;
}

function isImageUrl(url) {
  if (!url) return false;
  return /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(url) || url.startsWith('data:image/');
}

function isVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url) || url.startsWith('data:video/');
}

function isPdfUrl(url) {
  if (!url) return false;
  return /\.pdf(\?.*)?$/i.test(url) || url.startsWith('data:application/pdf');
}

function formatMessageTextWithLinks(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return escaped.replace(urlRegex, (url) => {
    return `<a href="${escapeHtml(url)}" class="msg-link" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  });
}

async function resolvePendingMediaIds() {
  if (!elements.messagesStream) return;
  const pendingNodes = elements.messagesStream.querySelectorAll('[data-media-id]:not([data-resolved="true"])');
  pendingNodes.forEach(async (el) => {
    const mediaId = el.dataset.mediaId;
    if (!mediaId) return;
    el.setAttribute('data-resolved', 'true');
    try {
      const resolvedUrl = await resolveWhatsAppMediaUrl(mediaId);
      if (resolvedUrl) {
        if (el.tagName === 'IMG') {
          el.src = resolvedUrl;
          const parentWrap = el.closest('.msg-image-wrap');
          if (parentWrap) parentWrap.dataset.lightboxUrl = resolvedUrl;
        } else if (el.tagName === 'VIDEO') {
          el.src = resolvedUrl;
        } else if (el.tagName === 'A') {
          el.href = resolvedUrl;
        }
      }
    } catch (err) {
      console.warn(`Media ID resolution failed for ${mediaId}:`, err);
    }
  });
}

function attachMessageStreamInteractions() {
  if (!elements.messagesStream) return;
  elements.messagesStream.querySelectorAll('.msg-image-wrap').forEach(wrap => {
    wrap.addEventListener('click', () => {
      const url = wrap.dataset.lightboxUrl;
      if (url) openLightbox([{ url, caption: '', name: 'Image' }], 0);
    });
  });
}

function scrollChatToBottom() {
  if (!elements.chatMessagesBody) return;
  setTimeout(() => {
    elements.chatMessagesBody.scrollTo({
      top: elements.chatMessagesBody.scrollHeight,
      behavior: 'smooth'
    });
  }, 50);
}

function getStatusIconHtml(status, isOutgoing) {
  if (!isOutgoing) return '';
  if (status === 'read') return `<i class="fa-solid fa-check-double" style="color:#53bdeb"></i>`;
  if (status === 'delivered') return `<i class="fa-solid fa-check-double" style="color:#8696a0"></i>`;
  return `<i class="fa-solid fa-check" style="color:#8696a0"></i>`;
}

export function update24HourWindowTimer() {
  if (!elements.chatWindowTimerBadge || !elements.chatWindowTimerText) return;

  if (!state.activeLeadId) {
    elements.chatWindowTimerBadge.style.display = 'none';
    return;
  }

  elements.chatWindowTimerBadge.style.display = 'inline-flex';
  const lead = state.leads.find(l => l.id === state.activeLeadId);
  if (!lead) return;

  let lastCustomerTime = null;

  if (lead.lastCustomerMessageAt) {
    lastCustomerTime = getComparableTime(lead.lastCustomerMessageAt);
  } else if (lead.lastIncomingTimestamp) {
    lastCustomerTime = getComparableTime(lead.lastIncomingTimestamp);
  }

  if (!lastCustomerTime && Array.isArray(state.messages) && state.messages.length > 0) {
    const incomingMsgs = state.messages.filter(m => m.direction === 'incoming' || m.fromUser === true);
    if (incomingMsgs.length > 0) {
      const latestIncoming = incomingMsgs[incomingMsgs.length - 1];
      lastCustomerTime = getComparableTime(latestIncoming.createdAt || latestIncoming.timestamp);
    }
  }

  if (!lastCustomerTime && (lead.lastMessageDirection === 'incoming' || !lead.hasAdminReplied || lead.isLead === true)) {
    lastCustomerTime = getComparableTime(lead.lastMessageAt || lead.createdAt);
  }

  const badge = elements.chatWindowTimerBadge;
  const textEl = elements.chatWindowTimerText;
  const expiredBanner = elements.windowExpiredBanner;
  const messageInput = elements.messageTextInput;
  const sendBtn = elements.sendMessageBtn;
  const attachmentBtn = elements.attachmentMenuBtn;

  const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;
  const expiryTime = (lastCustomerTime || Date.now()) + WINDOW_DURATION_MS;
  const now = Date.now();
  const diffMs = expiryTime - now;

  if (diffMs > 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    const formattedTime = `Window closes in ${hours}h ${String(minutes).padStart(2, '0')}m`;
    textEl.textContent = formattedTime;

    if (hours < 4) {
      badge.className = 'window-timer-badge urgent-red';
      badge.title = `Urgent: 24-Hour window closes in ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours < 12) {
      badge.className = 'window-timer-badge warning-amber';
      badge.title = `Warning: 24-Hour window closes in ${hours}h ${minutes}m ${seconds}s`;
    } else {
      badge.className = 'window-timer-badge active-green';
      badge.title = `24-Hour Window Active (${hours}h ${minutes}m remaining)`;
    }

    if (expiredBanner) expiredBanner.style.display = 'none';
    if (messageInput) {
      messageInput.disabled = false;
      messageInput.placeholder = "Type a WhatsApp message...";
    }
    if (sendBtn) sendBtn.disabled = false;
    if (attachmentBtn) attachmentBtn.disabled = false;
  } else {
    badge.className = 'window-timer-badge expired';
    textEl.textContent = 'Window Closed';
    badge.title = '24-Hour Messaging Window Expired. Only Template Messages can be sent.';

    if (expiredBanner) expiredBanner.style.display = 'flex';
    if (messageInput) {
      messageInput.value = '';
      messageInput.disabled = true;
      messageInput.placeholder = "Type a WhatsApp message...";
    }
    if (sendBtn) sendBtn.disabled = true;
    if (attachmentBtn) attachmentBtn.disabled = true;
  }
}

function getComparableTime(val) {
  if (!val) return null;
  const d = parseDate(val);
  return d ? d.getTime() : null;
}
