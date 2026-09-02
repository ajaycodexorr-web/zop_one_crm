/**
 * Utility Formatters & String Helpers
 */

export function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getInitials(name) {
  if (!name) return 'U';
  const clean = name.trim();
  if (!clean) return 'U';
  if (/^\+?\d[\d\s\-()]+$/.test(clean)) {
    const digits = clean.replace(/\D/g, '');
    return digits.length >= 2 ? digits.substring(0, 2) : 'P';
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].length >= 2 ? parts[0].substring(0, 2).toUpperCase() : parts[0].toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatRelativeTime(dateVal) {
  if (!dateVal) return 'Just now';
  const date = parseDate(dateVal);
  if (!date) return 'Just now';
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export function formatFullDateTime(dateVal) {
  if (!dateVal) return 'N/A';
  const date = parseDate(dateVal);
  if (!date) return 'N/A';

  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} ${month} ${year}, ${timeStr}`;
}

export function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function formatTimeOnly(val) {
  const d = parseDate(val);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const formatShortTime = formatTimeOnly;

export function normalizePhone(phone) {
  if (!phone && phone !== 0) return '';
  return String(phone).replace(/\D/g, '');
}

export function formatDisplayPhone(phone) {
  if (!phone && phone !== 0) return '';
  const str = String(phone).trim();
  if (!str) return '';
  const digits = str.replace(/\D/g, '');
  if (!digits) return str;
  return '+' + digits;
}

export function getLeadNotesList(lead) {
  if (!lead) return [];
  if (Array.isArray(lead.notes)) {
    return lead.notes.map(n => {
      if (typeof n === 'string') {
        return { text: n, authorName: 'Admin', createdAt: lead.createdAt || new Date().toISOString() };
      }
      return n;
    });
  }
  if (typeof lead.notes === 'string' && lead.notes.trim()) {
    return [{ text: lead.notes.trim(), authorName: 'Admin', createdAt: lead.noteUpdatedAt || lead.createdAt || new Date().toISOString() }];
  }
  if (typeof lead.note === 'string' && lead.note.trim()) {
    return [{ text: lead.note.trim(), authorName: 'Admin', createdAt: lead.noteUpdatedAt || lead.createdAt || new Date().toISOString() }];
  }
  return [];
}

export function getLatestLeadNote(lead) {
  if (!lead) return null;
  if (lead.latestNote && typeof lead.latestNote === 'object' && lead.latestNote.text) {
    return lead.latestNote;
  }
  const list = getLeadNotesList(lead);
  if (list.length === 0) return null;
  return list[list.length - 1];
}
