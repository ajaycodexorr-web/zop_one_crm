/**
 * Audio Synthesizer, Desktop Notifications & Toast Alerts
 */

import { elements } from '../dom/elements.js';
import { escapeHtml, formatDisplayPhone } from './formatters.js';
import { global_settings_CRM } from '../constants/global-settings.js';

let sharedAudioContext = null;

function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Play distinct, loud, and crystal-clear notification chimes
 * @param {'lead'|'message'|'default'} type
 */
export function playNotificationPing(type = 'default') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, now); // Loud, clear volume
    masterGain.connect(ctx.destination);

    if (type === 'lead') {
      // 3-tone ascending grand chime for New Lead: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz)
      const notes = [
        { freq: 523.25, start: 0.00, dur: 0.12 },
        { freq: 659.25, start: 0.10, dur: 0.14 },
        { freq: 783.99, start: 0.20, dur: 0.16 },
        { freq: 1046.50, start: 0.32, dur: 0.45 }
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        noteGain.gain.setValueAtTime(0, now + note.start);
        noteGain.gain.linearRampToValueAtTime(0.8, now + note.start + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } else {
      // 2-tone melodic chime for New Message: F5 (698Hz) -> A5 (880Hz) -> C6 (1046Hz)
      const notes = [
        { freq: 698.46, start: 0.00, dur: 0.12 },
        { freq: 880.00, start: 0.10, dur: 0.14 },
        { freq: 1046.50, start: 0.22, dur: 0.38 }
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        noteGain.gain.setValueAtTime(0, now + note.start);
        noteGain.gain.linearRampToValueAtTime(0.75, now + note.start + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    }
  } catch (err) {
    console.warn("Could not play audio notification ping:", err);
  }
}

export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.textContent = message;
  if (elements.toastContainer) {
    elements.toastContainer.appendChild(toast);
  }
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Popup banner for a brand new WhatsApp Lead
 */
export function showNewLeadNotificationBanner(lead, onViewClick) {
  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const snippet = lead.lastMessage || lead.firstMessage || lead.query || 'New customer inquiry received';

  const banner = document.createElement('div');
  banner.className = 'new-lead-banner-notification new-lead';
  banner.innerHTML = `
    <div class="banner-icon-box lead-icon"><i class="fa-solid fa-user-plus"></i></div>
    <div class="banner-content-box">
      <strong>🔔 New Lead Received!</strong>
      <span class="banner-lead-name">${escapeHtml(displayName)}</span>
      <span class="banner-lead-snippet">"${escapeHtml(snippet.substring(0, 55))}"</span>
    </div>
    <button class="banner-view-btn" type="button">View Lead</button>
    <button class="banner-close-btn" type="button" title="Dismiss">&times;</button>
  `;

  banner.addEventListener('click', (e) => {
    if (e.target.closest('.banner-close-btn')) {
      e.stopPropagation();
      banner.remove();
      return;
    }
    if (onViewClick) onViewClick(lead);
    banner.remove();
  });

  if (elements.toastContainer) {
    elements.toastContainer.appendChild(banner);
  }

  setTimeout(() => {
    if (banner.parentElement) banner.remove();
  }, 8000);
}

/**
 * Popup banner for an incoming message on existing conversation
 */
export function showNewMessageNotificationBanner(lead, onViewClick) {
  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const snippet = lead.lastMessage || lead.lastMessageText || 'New WhatsApp message received';

  const banner = document.createElement('div');
  banner.className = 'new-lead-banner-notification new-message';
  banner.innerHTML = `
    <div class="banner-icon-box msg-icon"><i class="fa-brands fa-whatsapp"></i></div>
    <div class="banner-content-box">
      <strong style="color: #38bdf8;">💬 New WhatsApp Message</strong>
      <span class="banner-lead-name">${escapeHtml(displayName)}</span>
      <span class="banner-lead-snippet">"${escapeHtml(snippet.substring(0, 55))}"</span>
    </div>
    <button class="banner-view-btn msg-btn" type="button">View Chat</button>
    <button class="banner-close-btn" type="button" title="Dismiss">&times;</button>
  `;

  banner.addEventListener('click', (e) => {
    if (e.target.closest('.banner-close-btn')) {
      e.stopPropagation();
      banner.remove();
      return;
    }
    if (onViewClick) onViewClick(lead);
    banner.remove();
  });

  if (elements.toastContainer) {
    elements.toastContainer.appendChild(banner);
  }

  setTimeout(() => {
    if (banner.parentElement) banner.remove();
  }, 8000);
}

/**
 * Trigger browser desktop notification for lead or message
 */
export function triggerDesktopNotification(lead, onClick, type = 'lead') {
  if (!("Notification" in window)) return;

  const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
  const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
  const snippet = lead.lastMessage || (type === 'lead' ? 'New WhatsApp Lead' : 'New WhatsApp message received');
  const title = type === 'lead' ? `🔔 New Lead: ${displayName}` : `💬 New Message from ${displayName}`;

  if (Notification.permission === "granted") {
    const notif = new Notification(title, {
      body: snippet,
      icon: global_settings_CRM.projectIcon || 'https://www.zopdealer.com/images/logo.png'
    });
    notif.onclick = () => {
      window.focus();
      if (onClick) onClick(lead);
    };
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        triggerDesktopNotification(lead, onClick, type);
      }
    });
  }
}
