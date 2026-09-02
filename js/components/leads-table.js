/**
 * Leads Dashboard Table Renderer & Actions Handler
 */

import { updateLeadStatus, updateLeadAssignee, addLeadNote, updateLeadNotes, createNewLead, sendWhatsAppMessage } from '../../firebase-config.js';
import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { escapeHtml, getInitials, formatFullDateTime, formatRelativeTime, normalizePhone, formatDisplayPhone, getLeadNotesList, getLatestLeadNote, parseDate } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { getUserFirstQuery } from '../utils/export-excel.js';
import { addAuditLog } from '../services/logging-service.js';
import { checkUserDisabledAndEnforceLogout } from '../services/auth-service.js';
import { hasPermission } from '../services/user-service.js';

export const STATUS_CONFIG = {
  new: { label: 'New', dotClass: 'dot-new' },
  contacted: { label: 'Contacted', dotClass: 'dot-contacted' },
  no_answer: { label: 'No Answer', dotClass: 'dot-no-answer' },
  follow_up: { label: 'Follow Up', dotClass: 'dot-follow-up' },
  converted: { label: 'Converted', dotClass: 'dot-converted' },
  lost: { label: 'Lost', dotClass: 'dot-lost' },
  deleted: { label: 'Deleted', dotClass: 'dot-deleted' }
};

export function toggleStatusFilterDropdown() {
  if (!elements.leadStatusDropdownMenu) return;
  const isShown = elements.leadStatusDropdownMenu.style.display === 'block';
  if (isShown) {
    closeStatusFilterDropdown();
  } else {
    openStatusFilterDropdown();
  }
}

export function openStatusFilterDropdown() {
  if (elements.leadStatusDropdownMenu) {
    elements.leadStatusDropdownMenu.style.display = 'block';
  }
  if (elements.leadStatusDropdownBtn) {
    elements.leadStatusDropdownBtn.setAttribute('aria-expanded', 'true');
    elements.leadStatusDropdownBtn.classList.add('dropdown-open');
  }
}

export function closeStatusFilterDropdown() {
  if (elements.leadStatusDropdownMenu) {
    elements.leadStatusDropdownMenu.style.display = 'none';
  }
  if (elements.leadStatusDropdownBtn) {
    elements.leadStatusDropdownBtn.setAttribute('aria-expanded', 'false');
    elements.leadStatusDropdownBtn.classList.remove('dropdown-open');
  }
}

export function setupLeadsHandlers(renderConversationsView, openLeadChat, renderLeadsView) {
  // Search input
  if (elements.leadsSearchInput) {
    elements.leadsSearchInput.addEventListener('input', (e) => {
      state.leadsSearchQuery = e.target.value.trim().toLowerCase();
      renderLeadsView(renderConversationsView, openLeadChat);
    });
  }

  // All Leads Filter Pill
  if (elements.leadsFilterAllBtn) {
    elements.leadsFilterAllBtn.addEventListener('click', () => {
      state.leadsFilter = 'all';
      state.leadsCurrentPage = 1;
      closeStatusFilterDropdown();
      renderLeadsView(renderConversationsView, openLeadChat);
    });
  }

  // Status Filter Dropdown Toggle
  if (elements.leadStatusDropdownBtn) {
    elements.leadStatusDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStatusFilterDropdown();
    });
  }

  // Status Filter Dropdown Items
  document.querySelectorAll('.status-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedStatus = item.dataset.status;
      if (selectedStatus) {
        state.leadsFilter = selectedStatus;
        state.leadsCurrentPage = 1;
        closeStatusFilterDropdown();
        renderLeadsView(renderConversationsView, openLeadChat);
      }
    });
  });

  // Global Outside Click to Close Status Dropdown
  document.addEventListener('click', (e) => {
    if (elements.leadStatusDropdownWrapper && !elements.leadStatusDropdownWrapper.contains(e.target)) {
      closeStatusFilterDropdown();
    }
  });

  // ESC to close Status Dropdown
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStatusFilterDropdown();
    }
  });

  // Lead Source Select Change (Show Custom Input when 'Other' is selected)
  const sourceSelect = document.getElementById('newLeadSource');
  const customSourceGroup = document.getElementById('newLeadCustomSourceGroup');
  const customSourceInput = document.getElementById('newLeadCustomSource');

  if (sourceSelect) {
    sourceSelect.addEventListener('change', () => {
      const isOther = sourceSelect.value === 'Other';
      if (customSourceGroup) {
        customSourceGroup.style.display = isOther ? 'block' : 'none';
      }
      if (customSourceInput) {
        customSourceInput.required = isOther;
        if (isOther) {
          customSourceInput.focus();
        } else {
          customSourceInput.value = '';
        }
      }
    });
  }

  // Open Create Lead Modal
  if (elements.openAddLeadModalBtn) {
    elements.openAddLeadModalBtn.addEventListener('click', () => {
      if (!hasPermission('canAddLead')) {
        showToast("You do not have permission to add new leads.", "warning");
        return;
      }
      populateLeadAssigneeOptions();
      if (elements.createLeadForm) elements.createLeadForm.reset();
      if (customSourceGroup) customSourceGroup.style.display = 'none';
      if (customSourceInput) {
        customSourceInput.required = false;
        customSourceInput.value = '';
      }
      if (elements.addLeadModal) elements.addLeadModal.style.display = 'flex';
    });
  }

  // Close Create Lead Modal
  if (elements.closeAddLeadModalBtn) {
    elements.closeAddLeadModalBtn.addEventListener('click', () => {
      if (elements.addLeadModal) elements.addLeadModal.style.display = 'none';
    });
  }

  if (elements.cancelAddLeadBtn) {
    elements.cancelAddLeadBtn.addEventListener('click', () => {
      if (elements.addLeadModal) elements.addLeadModal.style.display = 'none';
    });
  }

  if (elements.addLeadModal) {
    elements.addLeadModal.addEventListener('click', (e) => {
      if (e.target === elements.addLeadModal) elements.addLeadModal.style.display = 'none';
    });
  }

  // Lead Notes Modal Handlers
  if (elements.closeLeadNotesModalBtn) {
    elements.closeLeadNotesModalBtn.addEventListener('click', () => {
      if (elements.leadNotesModal) elements.leadNotesModal.style.display = 'none';
    });
  }

  if (elements.cancelLeadNotesBtn) {
    elements.cancelLeadNotesBtn.addEventListener('click', () => {
      if (elements.leadNotesModal) elements.leadNotesModal.style.display = 'none';
    });
  }

  if (elements.leadNotesModal) {
    elements.leadNotesModal.addEventListener('click', (e) => {
      if (e.target === elements.leadNotesModal) elements.leadNotesModal.style.display = 'none';
    });
  }

  // Submit Add Note in Modal
  if (elements.leadNotesAddForm) {
    elements.leadNotesAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (checkUserDisabledAndEnforceLogout()) return;

      if (!hasPermission('canAddNote')) {
        showToast("Permission denied: You do not have permission to add notes.", "error");
        return;
      }

      const targetLeadId = state.activeNotesLeadId;
      if (!targetLeadId) return;

      const lead = state.leads.find(l => l.id === targetLeadId);
      const newNoteText = elements.leadNotesInput ? elements.leadNotesInput.value.trim() : '';
      if (!newNoteText) return;

      const authorInfo = {
        id: state.currentUser ? state.currentUser.id : '',
        name: state.currentUser ? state.currentUser.name : 'Super Admin',
        role: state.currentUser ? state.currentUser.role : 'admin'
      };

      const submitBtn = elements.saveLeadNotesSubmitBtn;
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

        // Re-render notes history inside the modal
        renderLeadNotesHistory(lead);

        // Update active chat header/bar preview
        updateActiveChatNotes(lead);

        addAuditLog('note_update', targetLeadId, lead ? lead.name : targetLeadId, `Added note: "${newNoteText.substring(0, 40)}..."`);
        showToast('Note added successfully!', 'info');

        if (elements.leadNotesInput) {
          elements.leadNotesInput.value = '';
          elements.leadNotesInput.focus();
        }

        if (renderLeadsView) renderLeadsView(renderConversationsView, openLeadChat);
        if (renderConversationsView) renderConversationsView();
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

  // Submit Create Lead Form
  if (elements.createLeadForm) {
    elements.createLeadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (checkUserDisabledAndEnforceLogout()) return;

      if (!hasPermission('canAddLead')) {
        showToast("Permission denied: You do not have permission to add new leads.", "error");
        if (elements.addLeadModal) elements.addLeadModal.style.display = 'none';
        return;
      }

      const nameInput = document.getElementById('newLeadName');
      const phoneInput = document.getElementById('newLeadPhone');
      const sourceEl = document.getElementById('newLeadSource');
      const customSourceEl = document.getElementById('newLeadCustomSource');
      const statusSelect = document.getElementById('newLeadStatus');
      const assigneeSelect = document.getElementById('newLeadAssignee');
      const noteInput = document.getElementById('newLeadNote');

      const name = nameInput ? nameInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const selectedSource = sourceEl ? sourceEl.value : '';
      const customSource = customSourceEl ? customSourceEl.value.trim() : '';
      const status = statusSelect ? statusSelect.value : 'new';
      const assigneeId = assigneeSelect ? assigneeSelect.value : '';
      const initialNoteText = noteInput ? noteInput.value.trim() : '';

      if (!name || !phone) {
        showToast('Please enter both Customer Name and Phone Number', 'warning');
        return;
      }

      if (!selectedSource) {
        showToast('Please select a Lead Source', 'warning');
        if (sourceEl) sourceEl.focus();
        return;
      }

      if (selectedSource === 'Other' && !customSource) {
        showToast('Please specify the custom Source', 'warning');
        if (customSourceEl) customSourceEl.focus();
        return;
      }

      const finalSource = selectedSource === 'Other' ? customSource : selectedSource;

      const assignedUser = state.teamMembers ? state.teamMembers.find(u => u.id === assigneeId) : null;
      const assigneeName = assignedUser ? assignedUser.name : 'Unassigned';
      const creatorName = state.currentUser ? state.currentUser.name : 'Super Admin';

      const initialNotesList = initialNoteText ? [
        {
          id: 'note_' + Date.now(),
          text: initialNoteText,
          authorName: creatorName,
          authorRole: state.currentUser ? state.currentUser.role : 'admin',
          createdAt: new Date().toISOString()
        }
      ] : [];

      const leadPayload = {
        name,
        phone,
        platform: finalSource,
        source: finalSource,
        status,
        assigneeId: assigneeId || null,
        assigneeName,
        notes: initialNotesList,
        latestNote: initialNotesList[0] || null,
        hasWhatsAppMessages: false,
        unreadCount: 0,
        lastMessage: '',
        lastMessageText: '',
        creatorName
      };

      const submitBtn = document.getElementById('saveNewLeadSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
      }

      try {
        const createdDoc = await createNewLead(leadPayload);

        // Deduplicate against state.leads by ID or normalized phone number
        const normPhone = normalizePhone(phone);
        const existingIdx = state.leads.findIndex(l => l.id === createdDoc.id || (normPhone && normalizePhone(l.phone) === normPhone));
        if (existingIdx !== -1) {
          state.leads[existingIdx] = { ...state.leads[existingIdx], ...createdDoc };
        } else {
          state.leads.unshift(createdDoc);
        }
        state.knownLeadIds.add(createdDoc.id);

        addAuditLog('create_lead', createdDoc.id, name, `Created new lead ${name} (${phone})`);
        showToast(`New lead "${name}" created successfully!`, 'info');

        if (elements.addLeadModal) elements.addLeadModal.style.display = 'none';
        if (elements.createLeadForm) elements.createLeadForm.reset();

        renderLeadsView(renderConversationsView, openLeadChat);
        if (renderConversationsView) renderConversationsView();
      } catch (err) {
        showToast(`Failed to create lead: ${err.message}`, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Create Lead';
        }
      }
    });
  }

  // Delete Confirmation Modal
  if (elements.closeDeleteModalBtn) {
    elements.closeDeleteModalBtn.addEventListener('click', () => {
      if (elements.deleteConfirmModal) elements.deleteConfirmModal.style.display = 'none';
      state.pendingDeleteLeadId = null;
    });
  }

  if (elements.cancelDeleteModalBtn) {
    elements.cancelDeleteModalBtn.addEventListener('click', () => {
      if (elements.deleteConfirmModal) elements.deleteConfirmModal.style.display = 'none';
      state.pendingDeleteLeadId = null;
    });
  }

  if (elements.deleteConfirmModal) {
    elements.deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteConfirmModal) {
        elements.deleteConfirmModal.style.display = 'none';
        state.pendingDeleteLeadId = null;
      }
    });
  }

  if (elements.confirmDeleteModalBtn) {
    elements.confirmDeleteModalBtn.addEventListener('click', async () => {
      const leadId = state.pendingDeleteLeadId;
      if (!leadId) return;

      if (elements.deleteConfirmModal) elements.deleteConfirmModal.style.display = 'none';
      state.pendingDeleteLeadId = null;

      const lead = state.leads.find(l => l.id === leadId);
      try {
        if (!state.demoMode) {
          await updateLeadStatus(leadId, 'deleted');
        } else if (lead) {
          lead.status = 'deleted';
        }

        if (state.activeLeadId === leadId) {
          state.activeLeadId = null;
          if (elements.activeChatView) elements.activeChatView.style.display = 'none';
          if (elements.chatPlaceholder) elements.chatPlaceholder.style.display = 'flex';
        }

        addAuditLog('delete_lead', leadId, lead ? lead.name : leadId, 'Deleted lead and moved to Deleted status', 'Admin User');

        renderLeadsView(renderConversationsView, openLeadChat);
        if (renderConversationsView) renderConversationsView();
        showToast('Lead moved to Deleted', 'info');
      } catch (err) {
        showToast(`Failed to delete lead: ${err.message}`, 'error');
      }
    });
  }
}

function populateLeadAssigneeOptions() {
  const assigneeSelect = document.getElementById('newLeadAssignee');
  if (!assigneeSelect) return;

  const teamMembers = state.teamMembers || [];
  assigneeSelect.innerHTML = `
    <option value="" selected>Unassigned</option>
    ${teamMembers.map(user => `
      <option value="${user.id}">
        ${user.role === 'super_admin' || user.role === 'admin' || user.role === 'sub_admin' ? '🛡️' : '👤'} ${escapeHtml(user.name)} (${(user.role || 'maker').toUpperCase()})
      </option>
    `).join('')}
  `;
}

export function renderLeadsView(renderConversationsView, openLeadChat) {
  const { leads, leadsSearchQuery, leadsFilter, currentUser, teamMembers } = state;
  const isAgent = currentUser && (currentUser.role === 'agent' || currentUser.role === 'maker');
  const isDisabledUser = currentUser && currentUser.status === 'disabled';

  // Deduplicate leads by id and normalized clean phone number
  const uniqueMap = new Map();
  leads.forEach(l => {
    const normP = normalizePhone(l.phone);
    const key = normP ? `phone_${normP}` : l.id;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, l);
    } else {
      const existing = uniqueMap.get(key);
      uniqueMap.set(key, { ...existing, ...l, name: (l.name && l.name !== l.phone) ? l.name : existing.name });
    }
  });
  const deduplicatedLeads = Array.from(uniqueMap.values());

  // Filter leads: Customer-initiated or manually created CRM leads (isLead !== false)
  let leadsOnly = deduplicatedLeads.filter(l => l.isLead !== false && l.category !== 'conversation');

  // Strict Agent Filter: Agents ONLY see leads assigned to them ("Show only assign")
  if (isAgent) {
    leadsOnly = leadsOnly.filter(l => l.assigneeId === currentUser.id);
  }

  const activeLeadsOnly = leadsOnly.filter(l => (l.status || '').toLowerCase() !== 'deleted');
  const deletedLeadsOnly = leadsOnly.filter(l => (l.status || '').toLowerCase() === 'deleted');

  const filtered = leadsOnly.filter(lead => {
    const displayName = (lead.name || lead.phone || '').toLowerCase();
    const phone = (lead.phone || '').toLowerCase();
    const lastMsg = (lead.lastMessage || '').toLowerCase();

    const matchesSearch = !leadsSearchQuery ||
      displayName.includes(leadsSearchQuery) ||
      phone.includes(leadsSearchQuery) ||
      lastMsg.includes(leadsSearchQuery);

    const status = (lead.status || 'new').toLowerCase();
    let matchesFilter = false;

    if (leadsFilter === 'all') {
      matchesFilter = status !== 'deleted';
    } else if (leadsFilter === 'deleted') {
      matchesFilter = status === 'deleted';
    } else {
      matchesFilter = status === leadsFilter;
    }

    // Date Range Evaluation
    let matchesDate = true;
    const dateFilter = state.leadsDateFilter;
    if (dateFilter && (dateFilter.startDate || dateFilter.endDate)) {
      const leadDate = parseDate(lead.createdAt || lead.lastMessageAt || lead.updatedAt || lead.timestamp);
      if (leadDate) {
        const leadTime = leadDate.getTime();
        if (dateFilter.startDate) {
          const s = new Date(dateFilter.startDate);
          s.setHours(0, 0, 0, 0);
          if (leadTime < s.getTime()) matchesDate = false;
        }
        if (dateFilter.endDate && matchesDate) {
          const e = new Date(dateFilter.endDate);
          e.setHours(23, 59, 59, 999);
          if (leadTime > e.getTime()) matchesDate = false;
        }
      }
    }

    return matchesSearch && matchesFilter && matchesDate;
  });

  // Update counters
  const activeCount = activeLeadsOnly.length;
  const deletedCount = deletedLeadsOnly.length;
  const newCount = activeLeadsOnly.filter(l => (l.status || 'new').toLowerCase() === 'new').length;
  const contactedCount = activeLeadsOnly.filter(l => (l.status || '').toLowerCase() === 'contacted').length;
  const noAnswerCount = activeLeadsOnly.filter(l => (l.status || '').toLowerCase() === 'no_answer').length;
  const followUpCount = activeLeadsOnly.filter(l => (l.status || '').toLowerCase() === 'follow_up').length;
  const convertedCount = activeLeadsOnly.filter(l => (l.status || '').toLowerCase() === 'converted').length;
  const lostCount = activeLeadsOnly.filter(l => (l.status || '').toLowerCase() === 'lost').length;
  const hasWhatsAppMessages = (l) => {
    if (!l) return false;
    if (l.hasWhatsAppMessages === false) return false;
    if (l.hasWhatsAppMessages === true) return true;
    if (l.initiatedBy === 'crm' && !l.hasAdminReplied) return false;
    return (typeof l.lastMessage === 'string' && l.lastMessage.trim() !== '') ||
           (typeof l.lastMessageText === 'string' && l.lastMessageText.trim() !== '');
  };
  let activeConversations = leads.filter(l => (l.status || '').toLowerCase() !== 'deleted' && hasWhatsAppMessages(l));
  if (isAgent) {
    activeConversations = activeConversations.filter(l => l.assigneeId === currentUser.id);
  }
  const activeUnreadCount = activeConversations.filter(l => (l.unreadCount || 0) > 0).length;

  if (elements.navLeadsCount) elements.navLeadsCount.textContent = activeCount;
  if (elements.navConversationsCount) elements.navConversationsCount.textContent = activeUnreadCount || activeConversations.length;


  if (elements.countAllLeads) elements.countAllLeads.textContent = activeCount;
  if (elements.countNewLeads) elements.countNewLeads.textContent = newCount;
  if (elements.countContactedLeads) elements.countContactedLeads.textContent = contactedCount;
  if (elements.countNoAnswerLeads) elements.countNoAnswerLeads.textContent = noAnswerCount;
  if (elements.countFollowUpLeads) elements.countFollowUpLeads.textContent = followUpCount;
  if (elements.countConvertedLeads) elements.countConvertedLeads.textContent = convertedCount;
  if (elements.countLostLeads) elements.countLostLeads.textContent = lostCount;
  if (elements.countDeletedLeads) elements.countDeletedLeads.textContent = deletedCount;

  // Toggle action buttons based on permissions
  if (elements.openAddLeadModalBtn) {
    elements.openAddLeadModalBtn.style.display = hasPermission('canAddLead') ? 'inline-flex' : 'none';
  }
  if (elements.btnExportExcel) {
    elements.btnExportExcel.style.display = hasPermission('canExportExcel') ? 'inline-flex' : 'none';
  }

  // Sync active states on All Leads button & Status Dropdown Button
  if (leadsFilter === 'all') {
    if (elements.leadsFilterAllBtn) elements.leadsFilterAllBtn.classList.add('active');
    if (elements.leadStatusDropdownBtn) {
      elements.leadStatusDropdownBtn.classList.remove('active');
      elements.leadStatusDropdownBtn.removeAttribute('data-filter');
    }
    if (elements.statusDropdownCurrentLabel) {
      elements.statusDropdownCurrentLabel.textContent = 'Status';
    }
  } else if (STATUS_CONFIG[leadsFilter]) {
    const config = STATUS_CONFIG[leadsFilter];
    let selectedCount = 0;
    if (leadsFilter === 'new') selectedCount = newCount;
    else if (leadsFilter === 'contacted') selectedCount = contactedCount;
    else if (leadsFilter === 'no_answer') selectedCount = noAnswerCount;
    else if (leadsFilter === 'follow_up') selectedCount = followUpCount;
    else if (leadsFilter === 'converted') selectedCount = convertedCount;
    else if (leadsFilter === 'lost') selectedCount = lostCount;
    else if (leadsFilter === 'deleted') selectedCount = deletedCount;

    if (elements.leadsFilterAllBtn) elements.leadsFilterAllBtn.classList.remove('active');
    if (elements.leadStatusDropdownBtn) {
      elements.leadStatusDropdownBtn.classList.add('active');
      elements.leadStatusDropdownBtn.setAttribute('data-filter', leadsFilter);
    }
    if (elements.statusDropdownCurrentLabel) {
      elements.statusDropdownCurrentLabel.innerHTML = `
        <span class="status-indicator-dot ${config.dotClass}"></span>
        <span>${config.label} (${selectedCount})</span>
      `;
    }
  }

  // Update selected status in dropdown list
  document.querySelectorAll('.status-dropdown-item').forEach(item => {
    if (item.dataset.status === leadsFilter) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  if (elements.leadsLoadingState) elements.leadsLoadingState.style.display = 'none';

  if ((activeCount === 0 && deletedCount === 0) || filtered.length === 0) {
    if (elements.leadsEmptyState) elements.leadsEmptyState.style.display = 'flex';
    if (elements.leadsCardsList) elements.leadsCardsList.innerHTML = '';
    renderLeadsPagination(0, 1, renderConversationsView, openLeadChat);
    return;
  }

  if (elements.leadsEmptyState) elements.leadsEmptyState.style.display = 'none';

  if (!elements.leadsCardsList) return;

  // Pagination Calculations (10 records per page)
  const pageSize = state.leadsPageSize || 10;
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;

  if (state.leadsCurrentPage > totalPages) state.leadsCurrentPage = totalPages;
  if (state.leadsCurrentPage < 1) state.leadsCurrentPage = 1;

  const startIndex = (state.leadsCurrentPage - 1) * pageSize;
  const pageRecords = filtered.slice(startIndex, startIndex + pageSize);

  // Render Lead Cards matching UI design
  elements.leadsCardsList.innerHTML = pageRecords.map(lead => {
    const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
    const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
    const subtitle = lead.company || '';
    const handle = formatDisplayPhone(lead.handle || lead.phone || lead.id);
    const userFirstQuery = getUserFirstQuery(lead);
    const createdDateTime = formatFullDateTime(lead.createdAt || lead.lastMessageAt);
    const currentStatus = (lead.status || 'new').toLowerCase();
    const isDeleted = currentStatus === 'deleted';
    const currentAssigneeId = lead.assigneeId || '';
    const currentAssigneeName = lead.assigneeName || 'Unassigned';
    const notesList = getLeadNotesList(lead);
    const latestNote = getLatestLeadNote(lead);
    const latestNoteText = latestNote ? latestNote.text : '';
    const latestAuthor = latestNote ? latestNote.authorName || 'Agent' : '';
    const latestTime = latestNote ? formatRelativeTime(latestNote.createdAt) : '';
    const noteTooltip = latestNote ? `Latest by ${latestAuthor} (${latestTime}):\n${latestNoteText}` : 'Click to view note history & add note';

    return `
      <div class="lead-card-row ${isDisabledUser ? 'row-disabled' : ''}" data-lead-id="${escapeHtml(lead.id)}">
        <!-- 1. Name -->
        <div class="lead-profile-col" style="cursor: pointer;" title="Open chat with ${escapeHtml(displayName)}">
          <div class="lead-name-box">
            <span class="lead-name-title" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
            ${subtitle ? `<span class="lead-subtitle" title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</span>` : ''}
          </div>
        </div>

        <!-- 2. Phone number -->
        <div class="lead-handle-col">
          <span>${escapeHtml(handle)}</span>
        </div>

        <!-- 3. User Query -->
        <div class="lead-message-col" style="cursor: pointer;" title="Open chat with ${escapeHtml(displayName)}">
          <div class="lead-quote-bubble" title="${escapeHtml(userFirstQuery)}">
            ${escapeHtml(userFirstQuery)}
          </div>
        </div>

        <!-- 4. Source -->
        <div class="lead-channel-col">
          ${formatSourceBadge(lead.source || lead.platform, lead.referral)}
        </div>

        <!-- 5. Assigned -->
        <div class="lead-assignee-col">
          ${(!hasPermission('canAssignLead') || isAgent) ? `
            <span class="assignee-badge-pill" title="Assigned: ${escapeHtml(currentAssigneeName)}">
              <i class="fa-solid fa-user-check"></i> ${escapeHtml(currentAssigneeName)}
            </span>
          ` : `
            <select class="lead-assignee-select" data-lead-id="${escapeHtml(lead.id)}" ${isDeleted || isDisabledUser ? 'disabled' : ''}>
              <option value="" ${!currentAssigneeId ? 'selected' : ''}>Unassigned</option>
              ${teamMembers.map(user => `
                <option value="${user.id}" ${currentAssigneeId === user.id ? 'selected' : ''}>
                  ${user.role === 'admin' ? '🛡️' : '👤'} ${escapeHtml(user.name)}
                </option>
              `).join('')}
            </select>
          `}
        </div>

        <!-- 6. Status -->
        <div class="lead-status-col">
          <select class="lead-status-select status-${currentStatus}" data-lead-id="${escapeHtml(lead.id)}" ${isDeleted || isDisabledUser || !hasPermission('canChangeStatus') ? 'disabled' : ''} ${!hasPermission('canChangeStatus') ? 'title="You do not have permission to change lead status" style="cursor: not-allowed;"' : ''}>
            ${isDeleted ? `<option value="deleted" selected disabled>Deleted</option>` : ''}
            <option value="new" ${currentStatus === 'new' ? 'selected' : ''}>New</option>
            <option value="contacted" ${currentStatus === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="no_answer" ${currentStatus === 'no_answer' ? 'selected' : ''}>No Answer</option>
            <option value="follow_up" ${currentStatus === 'follow_up' ? 'selected' : ''}>Follow Up</option>
            <option value="converted" ${currentStatus === 'converted' ? 'selected' : ''}>Converted</option>
            <option value="lost" ${currentStatus === 'lost' ? 'selected' : ''}>Lost</option>
          </select>
        </div>

        <!-- 7. Notes -->
        <div class="lead-notes-col">
          <div class="lead-note-badge ${latestNoteText ? 'has-note' : 'no-note'}" data-lead-id="${escapeHtml(lead.id)}" title="${escapeHtml(noteTooltip)}">
            <i class="fa-regular fa-note-sticky note-icon"></i>
            <span class="note-text">${escapeHtml(latestNoteText || (hasPermission('canAddNote') ? '+ Add note' : 'No notes'))}</span>
            ${notesList.length > 1 ? `<span class="note-count-pill" title="${notesList.length} total notes">${notesList.length}</span>` : ''}
            ${hasPermission('canAddNote') ? `
              <button type="button" class="btn-note-edit" data-lead-id="${escapeHtml(lead.id)}" title="View notes history & add note">
                <i class="fa-solid fa-pen"></i>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 8. Created Date with Time -->
        <div class="lead-time-col">
          <span>${createdDateTime}</span>
        </div>

        <!-- 9. Action -->
        <div class="lead-actions-col">
          ${isDeleted ? '' : `
            <button class="btn-lead-delete ${(!hasPermission('canDeleteLead') || isDisabledUser) ? 'disabled' : ''}" 
                    data-action="delete" 
                    data-lead-id="${escapeHtml(lead.id)}" 
                    ${(!hasPermission('canDeleteLead') || isDisabledUser) ? 'disabled style="cursor: not-allowed; opacity: 0.45;"' : ''} 
                    title="${!hasPermission('canDeleteLead') ? 'You do not have permission to delete leads' : 'Delete lead'}">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Attach card event listeners
  elements.leadsCardsList.querySelectorAll('.btn-lead-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentUser && state.currentUser.status === 'disabled') {
        showToast("Your account is disabled. You cannot perform actions.", "error");
        return;
      }
      const leadId = btn.dataset.leadId;
      handleDeleteLead(leadId);
    });
  });

  // Note Badge Click Listeners
  elements.leadsCardsList.querySelectorAll('.lead-note-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const leadId = badge.dataset.leadId;
      openLeadNotesModal(leadId, renderLeadsView, renderConversationsView, openLeadChat);
    });
  });

  // Row Profile / Query Click to open chat
  elements.leadsCardsList.querySelectorAll('.lead-profile-col, .lead-message-col').forEach(col => {
    col.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = col.closest('.lead-card-row');
      if (row && row.dataset.leadId && openLeadChat) {
        openLeadChat(row.dataset.leadId);
      }
    });
  });

  elements.leadsCardsList.querySelectorAll('.lead-status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (state.currentUser && state.currentUser.status === 'disabled') {
        showToast("Your account is disabled. You cannot perform actions.", "error");
        return;
      }
      const leadId = select.dataset.leadId;
      const newStatus = select.value;
      try {
        const lead = state.leads.find(l => l.id === leadId);
        if (!state.demoMode) {
          await updateLeadStatus(leadId, newStatus);
        } else {
          if (lead) lead.status = newStatus;
        }
        addAuditLog('status_change', leadId, lead ? lead.name : leadId, `Updated lead status to ${newStatus.toUpperCase()}`);
        showToast(`Lead status updated to ${newStatus}`, 'info');
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
      }
    });
  });

  // Assignee Select Listener
  elements.leadsCardsList.querySelectorAll('.lead-assignee-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (state.currentUser && state.currentUser.status === 'disabled') {
        showToast("Your account is disabled. You cannot perform actions.", "error");
        return;
      }
      const leadId = select.dataset.leadId;
      const newAssigneeId = select.value;
      const assignedUser = teamMembers.find(u => u.id === newAssigneeId);
      const assigneeName = assignedUser ? assignedUser.name : 'Unassigned';

      const lead = state.leads.find(l => l.id === leadId);
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

      addAuditLog('assignee_change', leadId, lead ? lead.name : leadId, `Assigned lead to ${assigneeName}`);
      showToast(`Assigned lead to ${assigneeName}`, 'info');
      renderLeadsView(renderConversationsView, openLeadChat);
    });
  });

  renderLeadsPagination(totalRecords, totalPages, renderConversationsView, openLeadChat);
}

export function renderLeadNotesHistory(lead) {
  if (!lead || !elements.leadNotesHistoryList) return;

  const notesList = getLeadNotesList(lead);
  const totalCount = notesList.length;

  if (elements.leadNotesCount) {
    elements.leadNotesCount.textContent = totalCount;
  }

  if (totalCount === 0) {
    if (elements.leadNotesEmptyHistory) elements.leadNotesEmptyHistory.style.display = 'block';
    elements.leadNotesHistoryList.innerHTML = '';
    return;
  }

  if (elements.leadNotesEmptyHistory) elements.leadNotesEmptyHistory.style.display = 'none';

  // Show newest notes at the top
  const sortedNotes = [...notesList].reverse();

  elements.leadNotesHistoryList.innerHTML = sortedNotes.map((note, idx) => {
    const authorName = note.authorName || 'Agent';
    const authorRole = note.authorRole || (authorName.toLowerCase().includes('admin') ? 'admin' : 'agent');
    const initials = getInitials(authorName);
    const timeFormatted = formatFullDateTime(note.createdAt);
    const relTime = formatRelativeTime(note.createdAt);
    const isLatest = idx === 0;

    return `
      <div class="note-history-item ${isLatest ? 'latest-note-item' : ''}">
        <div class="note-history-top">
          <div class="note-author-block">
            <div class="note-author-avatar" title="${escapeHtml(authorName)}">${escapeHtml(initials)}</div>
            <span class="note-author-name">${escapeHtml(authorName)}</span>
            <span class="note-author-badge">${escapeHtml(authorRole)}</span>
            ${isLatest ? `<span style="font-size: 10px; font-weight: 700; color: var(--crm-primary); background: #dbeafe; padding: 1px 5px; border-radius: 4px;">Latest</span>` : ''}
          </div>
          <span class="note-history-time" title="${escapeHtml(timeFormatted)}">
            <i class="fa-regular fa-clock"></i> ${escapeHtml(relTime)}
          </span>
        </div>
        <div class="note-history-body">${escapeHtml(note.text || '')}</div>
      </div>
    `;
  }).join('');
}

export function updateActiveChatNotes(lead) {
  if (!lead) return;
  const latestNote = getLatestLeadNote(lead);
  const notesList = getLeadNotesList(lead);

  if (elements.chatNotePreviewText) {
    if (latestNote && latestNote.text) {
      const author = latestNote.authorName || 'Agent';
      const relTime = formatRelativeTime(latestNote.createdAt);
      elements.chatNotePreviewText.innerHTML = `<strong>${escapeHtml(latestNote.text)}</strong> <span style="font-size: 11.5px; opacity: 0.85; margin-left: 6px; font-weight: normal;">(by ${escapeHtml(author)} • ${escapeHtml(relTime)}${notesList.length > 1 ? ` • ${notesList.length} notes total` : ''})</span>`;
      elements.chatNotePreviewText.style.fontStyle = 'normal';
      elements.chatNotePreviewText.style.color = '#78350f';
    } else {
      elements.chatNotePreviewText.textContent = 'No note added yet';
      elements.chatNotePreviewText.style.fontStyle = 'italic';
      elements.chatNotePreviewText.style.color = '#94a3b8';
    }
  }

  if (elements.chatAddNoteBtnText) {
    elements.chatAddNoteBtnText.textContent = 'Add Note';
  }
}

export function openLeadNotesModal(leadId, renderLeadsView, renderConversationsView, openLeadChat) {
  if (checkUserDisabledAndEnforceLogout()) return;

  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  state.activeNotesLeadId = leadId;

  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const phoneDisplay = formatDisplayPhone(lead.phone || lead.id);

  if (elements.leadNotesModalTitle) {
    elements.leadNotesModalTitle.textContent = `Notes History — ${displayName}`;
  }
  if (elements.leadNotesModalSubtitle) {
    elements.leadNotesModalSubtitle.textContent = `Phone: ${phoneDisplay}`;
  }

  // Toggle Add Note form based on canAddNote permission
  const canAddNote = hasPermission('canAddNote');
  if (elements.leadNotesAddForm) {
    elements.leadNotesAddForm.style.display = canAddNote ? 'block' : 'none';
  }

  // Clear input box so user can type a fresh note
  if (elements.leadNotesInput) {
    elements.leadNotesInput.value = '';
  }

  // Render past notes history listing
  renderLeadNotesHistory(lead);

  if (elements.leadNotesModal) {
    elements.leadNotesModal.style.display = 'flex';
  }

  setTimeout(() => {
    if (canAddNote && elements.leadNotesInput) {
      elements.leadNotesInput.focus();
    }
  }, 100);
}

export function handleDeleteLead(leadId) {
  if (checkUserDisabledAndEnforceLogout()) return;

  if (!hasPermission('canDeleteLead')) {
    showToast("Permission denied: You do not have permission to delete leads.", "warning");
    return;
  }

  state.pendingDeleteLeadId = leadId;
  const lead = state.leads.find(l => l.id === leadId);
  if (elements.deleteLeadTargetName) {
    elements.deleteLeadTargetName.textContent = lead ? (lead.name || lead.phone || lead.id) : leadId;
  }
  if (elements.deleteConfirmModal) {
    elements.deleteConfirmModal.style.display = 'flex';
  }
}

export function highlightLeadCard(leadId) {
  setTimeout(() => {
    const row = document.querySelector(`.lead-card-row[data-lead-id="${leadId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('highlight-pulse');
      setTimeout(() => row.classList.remove('highlight-pulse'), 3000);
    }
  }, 150);
}

export function renderLeadsPagination(totalRecords, totalPages, renderConversationsView, openLeadChat) {
  const pageNumEl = document.getElementById('leadsCurrentPageNum');
  const totalPagesEl = document.getElementById('leadsTotalPagesNum');
  const totalRecordsEl = document.getElementById('leadsTotalRecordsNum');
  const prevBtn = document.getElementById('leadsPrevBtn');
  const nextBtn = document.getElementById('leadsNextBtn');
  const pageNumbersWrap = document.getElementById('leadsPageNumbers');

  if (pageNumEl) pageNumEl.textContent = totalRecords === 0 ? 0 : state.leadsCurrentPage;
  if (totalPagesEl) totalPagesEl.textContent = totalPages;
  if (totalRecordsEl) totalRecordsEl.textContent = totalRecords;

  if (prevBtn) {
    prevBtn.disabled = state.leadsCurrentPage <= 1 || totalRecords === 0;
    prevBtn.onclick = () => {
      if (state.leadsCurrentPage > 1) {
        state.leadsCurrentPage--;
        renderLeadsView(renderConversationsView, openLeadChat);
      }
    };
  }

  if (nextBtn) {
    nextBtn.disabled = state.leadsCurrentPage >= totalPages || totalRecords === 0;
    nextBtn.onclick = () => {
      if (state.leadsCurrentPage < totalPages) {
        state.leadsCurrentPage++;
        renderLeadsView(renderConversationsView, openLeadChat);
      }
    };
  }

  if (pageNumbersWrap) {
    if (totalRecords === 0) {
      pageNumbersWrap.innerHTML = '';
      return;
    }
    let html = '';
    const maxVisiblePills = 5;
    let startP = Math.max(1, state.leadsCurrentPage - 2);
    let endP = Math.min(totalPages, startP + maxVisiblePills - 1);
    if (endP - startP < maxVisiblePills - 1) {
      startP = Math.max(1, endP - maxVisiblePills + 1);
    }

    for (let p = startP; p <= endP; p++) {
      html += `<button type="button" class="page-num-pill ${p === state.leadsCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
    pageNumbersWrap.innerHTML = html;

    pageNumbersWrap.querySelectorAll('.page-num-pill').forEach(btn => {
      btn.onclick = () => {
        state.leadsCurrentPage = parseInt(btn.dataset.page, 10);
        renderLeadsView(renderConversationsView, openLeadChat);
      };
    });
  }
}

/**
 * Format Source pill badge with appropriate icons and style
 */
export function formatSourceBadge(sourceValue, referral = null) {
  // If referral metadata exists from a Meta Ad (or source explicitly set to Meta Ads)
  if (referral || (typeof sourceValue === 'string' && (sourceValue.toLowerCase().includes('meta') || sourceValue.toLowerCase().includes('ad')))) {
    const headline = referral && (referral.headline || referral.title) ? ` - ${referral.headline}` : '';
    return `<span class="channel-pill meta-ads" title="Source: Meta Ads${escapeHtml(headline)}"><i class="fa-brands fa-meta"></i> Meta Ads</span>`;
  }

  const raw = (sourceValue || 'Direct WhatsApp').trim();
  const lower = raw.toLowerCase();

  if (lower === 'whatsapp' || lower.includes('direct whatsapp')) {
    return `<span class="channel-pill whatsapp" title="Source: Direct WhatsApp"><i class="fa-brands fa-whatsapp"></i> Direct WhatsApp</span>`;
  } else if (lower.includes('website')) {
    return `<span class="channel-pill website" title="Source: ${escapeHtml(raw)}"><i class="fa-solid fa-globe"></i> ${escapeHtml(raw)}</span>`;
  } else if (lower.includes('message')) {
    return `<span class="channel-pill message" title="Source: ${escapeHtml(raw)}"><i class="fa-solid fa-comment-dots"></i> ${escapeHtml(raw)}</span>`;
  } else if (lower.includes('call') || lower.includes('phone')) {
    return `<span class="channel-pill phone" title="Source: ${escapeHtml(raw)}"><i class="fa-solid fa-phone"></i> ${escapeHtml(raw)}</span>`;
  } else if (lower === 'crm') {
    return `<span class="channel-pill crm" title="Source: CRM"><i class="fa-solid fa-laptop"></i> CRM</span>`;
  } else {
    return `<span class="channel-pill custom-source" title="Source: ${escapeHtml(raw)}"><i class="fa-solid fa-tag"></i> ${escapeHtml(raw)}</span>`;
  }
}
