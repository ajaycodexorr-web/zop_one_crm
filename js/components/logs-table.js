/**
 * Activity Logs Table Renderer & Category Filter Handlers
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { escapeHtml, formatFullDateTime, formatDisplayPhone } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { saveLogsToLocalStorage, updateLogsBadge, getLogCategory } from '../services/logging-service.js';

export function setupLogsHandlers() {
  if (elements.logsSearchInput) {
    elements.logsSearchInput.addEventListener('input', (e) => {
      state.logsSearchQuery = e.target.value.trim().toLowerCase();
      renderLogsView();
    });
  }

  if (elements.clearLogsBtn) {
    elements.clearLogsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all activity logs?')) {
        state.logs = [];
        saveLogsToLocalStorage();
        renderLogsView();
        showToast('Activity logs cleared', 'info');
      }
    });
  }

  document.querySelectorAll('.log-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.log-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.logsFilter = pill.dataset.filter;
      renderLogsView();
    });
  });
}

export function renderLogsView() {
  if (!elements.logsCardsList) return;

  updateLogsBadge();

  let filtered = state.logs;

  if (state.logsFilter !== 'all') {
    filtered = filtered.filter(l => {
      const cat = getLogCategory(l);
      if (state.logsFilter === 'deleted' || state.logsFilter === 'delete_lead') {
        return cat === 'deleted' || l.actionType === 'delete_lead';
      }
      return cat === state.logsFilter || l.actionType === state.logsFilter;
    });
  }

  if (state.logsSearchQuery) {
    const q = state.logsSearchQuery;
    filtered = filtered.filter(l =>
      (l.leadName && l.leadName.toLowerCase().includes(q)) ||
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.performedBy && l.performedBy.toLowerCase().includes(q)) ||
      (l.actionType && l.actionType.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    elements.logsCardsList.innerHTML = '';
    if (elements.logsEmptyState) elements.logsEmptyState.style.display = 'flex';
    renderLogsPagination(0, 1);
    return;
  }

  if (elements.logsEmptyState) elements.logsEmptyState.style.display = 'none';

  // Pagination Calculations (10 records per page)
  const pageSize = state.logsPageSize || 10;
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;

  if (state.logsCurrentPage > totalPages) state.logsCurrentPage = totalPages;
  if (state.logsCurrentPage < 1) state.logsCurrentPage = 1;

  const startIndex = (state.logsCurrentPage - 1) * pageSize;
  const pageRecords = filtered.slice(startIndex, startIndex + pageSize);

  elements.logsCardsList.innerHTML = pageRecords.map(log => {
    const timeFormatted = formatFullDateTime(log.timestamp);
    const cat = getLogCategory(log);
    const pillHtml = renderLogActionPill(log, cat);

    return `
      <div class="log-card-row">
        <div class="col-log-time">${escapeHtml(timeFormatted)}</div>
        <div class="col-log-action">
          ${pillHtml}
        </div>
        <div class="col-log-lead">
          ${(() => {
            const raw = log.leadName || '';
            const disp = (/^\+?\d[\d\s\-()]+$/.test(raw)) ? formatDisplayPhone(raw) : raw;
            return `<strong title="${escapeHtml(disp)}">${escapeHtml(disp)}</strong>`;
          })()}
        </div>
        <div class="col-log-performer">
          <span class="log-performer-badge"><i class="fa-solid fa-user-check"></i> ${escapeHtml(log.performedBy || 'Admin User')}</span>
        </div>
        <div class="col-log-details" title="${escapeHtml(log.details)}">
          ${escapeHtml(log.details)}
        </div>
      </div>
    `;
  }).join('');

  renderLogsPagination(totalRecords, totalPages);
}

export function renderLogsPagination(totalRecords, totalPages) {
  const pageNumEl = document.getElementById('logsCurrentPageNum');
  const totalPagesEl = document.getElementById('logsTotalPagesNum');
  const totalRecordsEl = document.getElementById('logsTotalRecordsNum');
  const prevBtn = document.getElementById('logsPrevBtn');
  const nextBtn = document.getElementById('logsNextBtn');
  const pageNumbersWrap = document.getElementById('logsPageNumbers');

  if (pageNumEl) pageNumEl.textContent = totalRecords === 0 ? 0 : state.logsCurrentPage;
  if (totalPagesEl) totalPagesEl.textContent = totalPages;
  if (totalRecordsEl) totalRecordsEl.textContent = totalRecords;

  if (prevBtn) {
    prevBtn.disabled = state.logsCurrentPage <= 1 || totalRecords === 0;
    prevBtn.onclick = () => {
      if (state.logsCurrentPage > 1) {
        state.logsCurrentPage--;
        renderLogsView();
      }
    };
  }

  if (nextBtn) {
    nextBtn.disabled = state.logsCurrentPage >= totalPages || totalRecords === 0;
    nextBtn.onclick = () => {
      if (state.logsCurrentPage < totalPages) {
        state.logsCurrentPage++;
        renderLogsView();
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
    let startP = Math.max(1, state.logsCurrentPage - 2);
    let endP = Math.min(totalPages, startP + maxVisiblePills - 1);
    if (endP - startP < maxVisiblePills - 1) {
      startP = Math.max(1, endP - maxVisiblePills + 1);
    }

    for (let p = startP; p <= endP; p++) {
      html += `<button type="button" class="page-num-pill ${p === state.logsCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
    pageNumbersWrap.innerHTML = html;

    pageNumbersWrap.querySelectorAll('.page-num-pill').forEach(btn => {
      btn.onclick = () => {
        state.logsCurrentPage = parseInt(btn.dataset.page, 10);
        renderLogsView();
      };
    });
  }
}

export function renderLogActionPill(log, cat) {
  const type = (log.actionType || cat || '').toLowerCase();

  switch (type) {
    case 'incoming_lead':
    case 'new_lead':
      return `<span class="log-action-pill new" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;"><i class="fa-solid fa-cloud-arrow-down"></i> Inbound Lead</span>`;
    case 'incoming_message':
      return `<span class="log-action-pill message_sent" style="background:#ecfdf5;color:#047857;border-color:#a7f3d0;"><i class="fa-solid fa-inbox"></i> Inbound Message</span>`;
    case 'message_sent':
      return `<span class="log-action-pill message_sent"><i class="fa-solid fa-paper-plane"></i> Message Sent</span>`;
    case 'assignee_change':
    case 'assignee_update':
      return `<span class="log-action-pill assignee_change"><i class="fa-solid fa-user-gear"></i> Assignee Update</span>`;
    case 'status_change':
      return `<span class="log-action-pill status_change"><i class="fa-solid fa-sliders"></i> Status Change</span>`;
    case 'user_login':
      return `<span class="log-action-pill user_login"><i class="fa-solid fa-right-to-bracket"></i> User Login</span>`;
    case 'user_logout':
      return `<span class="log-action-pill user_logout"><i class="fa-solid fa-right-from-bracket"></i> User Logout</span>`;
    case 'user_created':
      return `<span class="log-action-pill user_created"><i class="fa-solid fa-user-plus"></i> User Created</span>`;
    case 'user_deleted':
      return `<span class="log-action-pill user_deleted"><i class="fa-solid fa-user-xmark"></i> User Deleted</span>`;
    case 'delete_lead':
    case 'deleted':
      return `<span class="log-action-pill delete_lead"><i class="fa-solid fa-trash-can"></i> Lead Deleted</span>`;
    case 'new':
      return `<span class="log-action-pill new"><i class="fa-solid fa-user-plus"></i> New Lead</span>`;
    case 'contacted':
      return `<span class="log-action-pill contacted"><i class="fa-solid fa-phone"></i> Contacted</span>`;
    case 'no_answer':
      return `<span class="log-action-pill no_answer"><i class="fa-solid fa-phone-slash"></i> No Answer</span>`;
    case 'follow_up':
      return `<span class="log-action-pill follow_up"><i class="fa-solid fa-clock"></i> Follow Up</span>`;
    case 'converted':
      return `<span class="log-action-pill converted"><i class="fa-solid fa-circle-check"></i> Converted</span>`;
    case 'lost':
      return `<span class="log-action-pill lost"><i class="fa-solid fa-circle-xmark"></i> Lost</span>`;
    default: {
      const formatted = (log.actionType || 'Activity').replace(/_/g, ' ');
      return `<span class="log-action-pill status_change"><i class="fa-solid fa-arrows-rotate"></i> ${escapeHtml(formatted)}</span>`;
    }
  }
}
