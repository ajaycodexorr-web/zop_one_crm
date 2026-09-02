/**
 * Header Notification Bell & Lead Dropdown Component
 * Tracks real-time incoming leads, displays unread counters, and opens lead details on click.
 */

import { state } from '../state/app-state.js';
import { escapeHtml, formatDisplayPhone, formatRelativeTime } from '../utils/formatters.js';

const STORAGE_KEY = 'crm_lead_notifications_v1';
let notifications = [];
let onLeadSelectCallback = null;

/**
 * Load persisted notifications from localStorage
 */
function loadPersistedNotifications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      notifications = JSON.parse(raw);
      if (!Array.isArray(notifications)) notifications = [];
    }
  } catch (e) {
    notifications = [];
  }
}

/**
 * Save notifications to localStorage
 */
function saveNotifications() {
  try {
    // Keep at most latest 50 notifications
    if (notifications.length > 50) {
      notifications = notifications.slice(0, 50);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch (e) {
    console.error('Failed to save notifications:', e);
  }
}

/**
 * Get count of unread notifications
 */
export function getUnreadNotificationCount() {
  return notifications.filter(n => !n.isRead).length;
}

/**
 * Setup Notification Bell Dropdown event listeners
 */
export function setupNotificationDropdown(onLeadSelect) {
  onLeadSelectCallback = onLeadSelect;
  loadPersistedNotifications();

  const notifBtns = document.querySelectorAll('.header-notification-btn');
  const dropdown = document.getElementById('headerNotificationDropdown');
  const markAllBtn = document.getElementById('notifMarkAllReadBtn');
  const clearAllBtn = document.getElementById('notifClearAllBtn');

  // Toggle Dropdown when clicking any notification bell button
  notifBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dropdown) return;
      const isVisible = dropdown.classList.contains('active') || dropdown.style.display === 'flex' || dropdown.style.display === 'block';
      if (isVisible) {
        closeNotificationDropdown();
      } else {
        openNotificationDropdown(btn);
      }
    });
  });

  // Mark all as read button
  if (markAllBtn) {
    markAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllAsRead();
    });
  }

  // Clear all notifications button
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllNotifications();
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.header-notification-btn')) {
      closeNotificationDropdown();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown) {
      closeNotificationDropdown();
    }
  });

  renderNotificationBadges();
  renderNotificationList();
}

/**
 * Open the notification dropdown
 */
function openNotificationDropdown(triggerBtn) {
  const dropdown = document.getElementById('headerNotificationDropdown');
  if (!dropdown) return;

  // Reposition dropdown relative to trigger button's container
  if (triggerBtn && triggerBtn.parentElement) {
    triggerBtn.parentElement.style.position = 'relative';
    triggerBtn.parentElement.appendChild(dropdown);
  }

  dropdown.style.display = 'flex';
  // Trigger transition
  requestAnimationFrame(() => {
    dropdown.classList.add('active');
  });

  renderNotificationList();
}

/**
 * Close the notification dropdown
 */
function closeNotificationDropdown() {
  const dropdown = document.getElementById('headerNotificationDropdown');
  if (!dropdown) return;

  dropdown.classList.remove('active');
  setTimeout(() => {
    if (!dropdown.classList.contains('active')) {
      dropdown.style.display = 'none';
    }
  }, 150);
}

/**
 * Safe ISO Timestamp Parser
 */
function getValidIsoTimestamp(val) {
  if (!val) return new Date().toISOString();
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
  if (val && typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    try {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (e) {}
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  return new Date().toISOString();
}

/**
 * Initialize / Populate initial unread leads if storage empty
 */
export function initLeadNotifications(leads = []) {
  loadPersistedNotifications();
  if (notifications.length === 0 && Array.isArray(leads)) {
    const unreadLeads = leads.filter(l => l.status === 'new' || (typeof l.unreadCount === 'number' && l.unreadCount > 0));
    unreadLeads.slice(0, 10).forEach(lead => {
      const rawPhone = lead.phone || lead.id || '';
      const displayPhone = (/^\+?\d[\d\s\-()]+$/.test(rawPhone)) ? formatDisplayPhone(rawPhone) : rawPhone;
      const leadName = (lead.name && lead.name.trim() && !/^\+?\d[\d\s\-()]+$/.test(lead.name.trim())) ? lead.name.trim() : '';
      const title = leadName ? `New lead ${displayPhone} (${leadName})` : `New lead ${displayPhone}`;
      const messageSnippet = lead.query || lead.lastMessage || lead.firstMessage || 'New inquiry received on WhatsApp';

      notifications.push({
        id: `notif_${lead.id}_init_${Date.now()}`,
        leadId: lead.id,
        phone: displayPhone,
        title: title,
        snippet: messageSnippet,
        timestamp: getValidIsoTimestamp(lead.lastMessageAt || lead.createdAt || lead.updatedAt),
        isRead: false
      });
    });
    saveNotifications();
  }
  renderNotificationBadges();
  renderNotificationList();
}

/**
 * Add a notification when a new lead or message arrives
 * @param {Object} lead
 * @param {'lead'|'message'} type
 */
export function addLeadNotification(lead, type = 'lead') {
  if (!lead) return;

  const rawPhone = lead.phone || lead.id || '';
  const displayPhone = (/^\+?\d[\d\s\-()]+$/.test(rawPhone)) ? formatDisplayPhone(rawPhone) : rawPhone;
  const leadName = (lead.name && lead.name.trim() && !/^\+?\d[\d\s\-()]+$/.test(lead.name.trim())) ? lead.name.trim() : '';
  
  let title = '';
  if (type === 'message') {
    title = leadName ? `💬 New message from ${leadName}` : `💬 New message from ${displayPhone}`;
  } else {
    title = leadName ? `🔔 New lead: ${leadName} (${displayPhone})` : `🔔 New lead: ${displayPhone}`;
  }

  const messageSnippet = lead.lastMessage || lead.lastMessageText || lead.query || lead.firstMessage || lead._firstUserMsg || (type === 'message' ? 'New incoming WhatsApp message' : 'New inquiry received on WhatsApp');

  const newNotif = {
    id: `notif_${type}_${lead.id || Date.now()}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    leadId: lead.id,
    type: type,
    phone: displayPhone,
    title: title,
    snippet: messageSnippet,
    timestamp: getValidIsoTimestamp(lead.lastMessageAt || lead.createdAt || lead.updatedAt),
    isRead: false
  };

  // Avoid identical duplicate entries for same lead with same snippet within 3 seconds
  const isRecentDuplicate = notifications.some(n => n.leadId === lead.id && n.snippet === messageSnippet && (Date.now() - new Date(n.timestamp).getTime()) < 3000);
  if (!isRecentDuplicate) {
    notifications.unshift(newNotif);
    saveNotifications();
  }

  renderNotificationBadges(true); // Animate pulse
  renderNotificationList();
}

/**
 * Mark all notifications as read and reset count to 0
 */
export function markAllAsRead() {
  notifications.forEach(n => {
    n.isRead = true;
  });
  saveNotifications();
  renderNotificationBadges();
  renderNotificationList();
}

/**
 * Clear all notifications
 */
export function clearAllNotifications() {
  notifications = [];
  saveNotifications();
  renderNotificationBadges();
  renderNotificationList();
}

/**
 * Mark a single notification as read and route to lead or chat
 */
function handleNotificationClick(notif) {
  notif.isRead = true;
  saveNotifications();
  renderNotificationBadges();
  renderNotificationList();
  closeNotificationDropdown();

  const notifType = notif.type || (notif.title && notif.title.toLowerCase().includes('message') ? 'message' : 'lead');
  if (onLeadSelectCallback && notif.leadId) {
    onLeadSelectCallback(notif.leadId, notifType, notif);
  }
}

/**
 * Update Notification Badges across all header triggers
 */
export function renderNotificationBadges(triggerPulse = false) {
  const unreadCount = getUnreadNotificationCount();
  const badges = document.querySelectorAll('.header-notif-badge');
  const btns = document.querySelectorAll('.header-notification-btn');
  const unreadPill = document.getElementById('notifUnreadPill');

  badges.forEach(badge => {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  });

  btns.forEach(btn => {
    if (triggerPulse && unreadCount > 0) {
      btn.classList.remove('notif-pulse');
      void btn.offsetWidth; // Trigger DOM reflow
      btn.classList.add('notif-pulse');
    }
  });

  if (unreadPill) {
    unreadPill.textContent = `${unreadCount} New`;
    unreadPill.style.display = unreadCount > 0 ? 'inline-block' : 'none';
  }
}

/**
 * Render the dropdown notification list items
 */
export function renderNotificationList() {
  const listContainer = document.getElementById('notifItemsList');
  if (!listContainer) return;

  if (notifications.length === 0) {
    listContainer.innerHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-icon">
          <i class="fa-regular fa-bell-slash"></i>
        </div>
        <p class="notif-empty-title">No notifications yet</p>
        <span class="notif-empty-subtitle">New incoming leads and customer messages will appear here</span>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = notifications.map(n => {
    const isUnread = !n.isRead;
    const timeFormatted = formatRelativeTime(n.timestamp);
    const isMessage = n.type === 'message' || (n.title && n.title.toLowerCase().includes('message'));

    return `
      <div class="notif-item ${isUnread ? 'unread' : ''} ${isMessage ? 'notif-message-type' : 'notif-lead-type'}" data-id="${escapeHtml(n.id)}" data-lead-id="${escapeHtml(n.leadId)}" style="cursor: pointer;">
        <div class="notif-item-icon ${isMessage ? 'icon-message' : 'icon-lead'}">
          ${isMessage ? '<i class="fa-brands fa-whatsapp"></i>' : '<i class="fa-solid fa-user-plus"></i>'}
        </div>
        <div class="notif-item-body">
          <div class="notif-item-header">
            <span class="notif-item-title">${escapeHtml(n.title)}</span>
            <span class="notif-item-time">${escapeHtml(timeFormatted)}</span>
          </div>
          <p class="notif-item-snippet">${escapeHtml(n.snippet)}</p>
          <div class="notif-tag-row">
            <span class="notif-type-pill ${isMessage ? 'pill-msg' : 'pill-lead'}">
              ${isMessage ? '<i class="fa-regular fa-comment-dots"></i> Message' : '<i class="fa-solid fa-sparkles"></i> New Lead'}
            </span>
          </div>
        </div>
        ${isUnread ? '<span class="notif-unread-dot" title="Unread"></span>' : ''}
      </div>
    `;
  }).join('');

  // Attach click events to each notification item
  listContainer.querySelectorAll('.notif-item').forEach(itemEl => {
    itemEl.addEventListener('click', () => {
      const id = itemEl.getAttribute('data-id');
      const targetNotif = notifications.find(n => n.id === id);
      if (targetNotif) {
        handleNotificationClick(targetNotif);
      }
    });
  });
}

// Global window bindings for testing or runtime calls
if (typeof window !== 'undefined') {
  window.addLeadNotification = addLeadNotification;
  window.markAllAsRead = markAllAsRead;
  window.clearAllNotifications = clearAllNotifications;
}
