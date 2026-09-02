/**
 * Centralized Application State Container
 */

export const state = {
  activeView: 'leads', // 'leads' | 'conversations' | 'logs'
  leads: [],
  activeLeadId: null,
  messages: [],

  // Search & Filter
  leadsSearchQuery: '',
  leadsFilter: 'all', // 'all' | 'new' | 'contacted' | 'no_answer' | 'follow_up' | 'converted' | 'lost' | 'deleted'
  leadsDateFilter: {
    preset: 'all',
    startDate: null,
    endDate: null,
    label: 'All Time'
  },
  convSearchQuery: '',
  convFilter: 'all', // 'all' | 'unread'

  connectionStatus: 'disconnected',
  isSending: false,
  unsubscribeLeads: null,
  unsubscribeMessages: null,
  unsubscribeLogs: null,
  demoMode: false,
  knownLeadIds: new Set(),
  isInitialLeadsLoad: true,

  windowTimerInterval: null,
  pendingDeleteLeadId: null,

  // Staged Media Attachments
  stagedAttachments: [],

  // Lightbox State
  lightbox: {
    isOpen: false,
    items: [],
    currentIndex: 0
  },

  // Activity Logs State
  logs: [],
  logsFilter: 'all',
  logsSearchQuery: '',

  // Pagination State (10 records per page)
  leadsCurrentPage: 1,
  leadsPageSize: 10,
  logsCurrentPage: 1,
  logsPageSize: 10,

  // Sub-Users & Multi-User State
  currentUser: { id: 'usr_admin', name: 'Admin User', role: 'admin' },
  teamMembers: []
};
