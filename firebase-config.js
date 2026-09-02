/**
 * Firebase Integration Module for WhatsApp Live Chat Testing Panel
 * Uses Firebase v10 Modular SDK (Firestore, Cloud Functions Gen2, Firebase Auth)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc,
  query, 
  orderBy, 
  onSnapshot, 
  getDocs,
  updateDoc, 
  deleteDoc,
  arrayUnion,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { 
  getFunctions, 
  httpsCallable 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

const STORAGE_KEY = 'wa_crm_firebase_config_v1';

// Default configuration template
export const DEFAULT_CONFIG = {
  apiKey: "AIzaSyDA7gaNrODr7Ceqnr5v81I9pGQUcTrwx6k",
  authDomain: "gold-cash-whatsapp.firebaseapp.com",
  projectId: "gold-cash-whatsapp",
  storageBucket: "gold-cash-whatsapp.appspot.com",
  messagingSenderId: "57988479642",
  appId: "1:57988479642:web:default",
  functionUrl: "sendWhatsAppMessage"
};

let app = null;
let db = null;
let functions = null;
let auth = null;
let storage = null;
let currentUser = null;
let leadsUnsubscribe = null;
let currentChatMessagesUnsubscribe = null;

/**
 * Load stored config or return defaults
 */
export function getSavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        apiKey: (parsed.apiKey && parsed.apiKey.trim()) || DEFAULT_CONFIG.apiKey,
        projectId: (parsed.projectId && parsed.projectId.trim()) || DEFAULT_CONFIG.projectId,
        authDomain: (parsed.authDomain && parsed.authDomain.trim()) || DEFAULT_CONFIG.authDomain,
        storageBucket: (parsed.storageBucket && parsed.storageBucket.trim()) || DEFAULT_CONFIG.storageBucket
      };
    }
  } catch (err) {
    console.warn("Could not read stored Firebase config:", err);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save config to localStorage
 */
export function saveConfig(cfg) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.error("Failed to persist config:", err);
  }
}

/**
 * Initialize Firebase SDK with Auth, Firestore, Functions, and Storage
 */
export function initializeFirebase(customConfig = null) {
  const config = customConfig || getSavedConfig();
  
  if (!config.apiKey || !config.projectId) {
    console.info("Database credentials incomplete. Panel is in Standby Mode.");
    return {
      success: false,
      status: 'standby',
      message: 'Awaiting Database credentials'
    };
  }

  try {
    if (!app) {
      app = initializeApp(config);
    }
    db = getFirestore(app);
    
    try {
      functions = getFunctions(app);
    } catch (e) {
      console.warn("Functions init optional:", e);
    }

    try {
      storage = getStorage(app);
    } catch (e) {
      console.warn("Storage init optional:", e);
    }

    try {
      auth = getAuth(app);
      onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
          console.log("Firebase Auth signed in anonymously:", user.uid);
        }
      });
      // Authenticate anonymously so sendWhatsAppMessage callable and Storage have request.auth
      signInAnonymously(auth).catch((authErr) => {
        console.warn("Anonymous auth warning (enable Anonymous provider in Firebase Console if callable rejects unauthenticated):", authErr);
      });
    } catch (e) {
      console.warn("Auth initialization error:", e);
    }

    return {
      success: true,
      status: 'connected',
      message: 'Database Connected',
      db,
      functions,
      storage,
      auth
    };
  } catch (error) {
    console.error("Firebase init failed:", error);
    return {
      success: false,
      status: 'error',
      message: error.message || 'Connection failed'
    };
  }
}

/**
 * Subscribe in real time to the 'leads' collection
 * Ordered by lastMessageAt descending
 */
export function subscribeToLeads(onUpdate, onError) {
  if (!db) {
    if (onError) onError(new Error("Firestore is not initialized"));
    return () => {};
  }

  // Cleanup prior subscription if existing
  if (leadsUnsubscribe) {
    leadsUnsubscribe();
    leadsUnsubscribe = null;
  }

  try {
    const leadsRef = collection(db, 'leads');

    // Subscribe to all documents in the leads collection without restrictive orderBy filter
    leadsUnsubscribe = onSnapshot(leadsRef, (snapshot) => {
      const leads = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        
        // Handle Firestore Timestamp conversions
        const parseTs = (val) => {
          if (!val) return null;
          if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
          if (typeof val === 'string' || typeof val === 'number') return new Date(val).toISOString();
          return null;
        };

        const rawCreated = parseTs(data.createdAt);
        const rawLastMsgAt = parseTs(data.lastMessageAt);
        const rawUpdated = parseTs(data.updatedAt);
        const effectiveTime = rawLastMsgAt || rawCreated || rawUpdated || new Date().toISOString();

        const messageText = data.lastMessage || '';
        const userQuery = data.query || data.firstMessage || '';

        leads.push({
          id: docSnap.id,
          name: data.name || '',
          phone: data.phone || docSnap.id,
          status: data.status || 'new',
          lastMessage: messageText,
          firstMessage: data.firstMessage || '',
          query: userQuery,
          lastMessageAt: effectiveTime,
          unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : (data.hasAdminReplied === false ? 1 : 0),
          createdAt: rawCreated,
          updatedAt: rawUpdated,
          ...data
        });
      });

      // Sort client-side by newest first
      leads.sort((a, b) => {
        const timeA = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      console.log(`🔥 [Firestore] Received real-time leads update (${leads.length} contacts fetched from 'leads' collection):`, leads);
      onUpdate(leads);
    }, (error) => {
      console.error("🔥 [Firestore Error] Listening to leads collection failed:", error);
      if (onError) onError(error);
    });

    return leadsUnsubscribe;
  } catch (err) {
    console.error("🔥 [Firestore Error] Failed to attach leads listener:", err);
    if (onError) onError(err);
    return () => {};
  }
}

let usersUnsubscribe = null;

export function subscribeToUsers(onUpdate, onError) {
  if (!db) {
    if (onError) onError(new Error("Firestore is not initialized"));
    return () => {};
  }

  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  try {
    const usersRef = collection(db, 'users');
    usersUnsubscribe = onSnapshot(usersRef, (snapshot) => {
      const users = [];
      snapshot.forEach((docSnap) => {
        users.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      if (onUpdate) onUpdate(users);
    }, (error) => {
      console.warn("Firestore users listener error:", error);
      if (onError) onError(error);
    });

    return usersUnsubscribe;
  } catch (err) {
    console.warn("Attach users listener failed:", err);
    if (onError) onError(err);
    return () => {};
  }
}

let logsUnsubscribe = null;

/**
 * Subscribe in real time to the 'activity_logs' collection
 */
export function subscribeToActivityLogs(onUpdate, onError) {
  if (!db) {
    if (onError) onError(new Error("Firestore is not initialized"));
    return () => {};
  }

  if (logsUnsubscribe) {
    logsUnsubscribe();
    logsUnsubscribe = null;
  }

  try {
    const logsRef = collection(db, 'activity_logs');
    
    logsUnsubscribe = onSnapshot(logsRef, (snapshot) => {
      const logs = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logs.push({
          id: docSnap.id,
          actionType: data.actionType || 'status_change',
          leadId: data.leadId || '',
          leadName: data.leadName || 'N/A',
          performedBy: data.performedBy || 'Admin User',
          details: data.details || '',
          timestamp: data.timestamp || data.createdAt || new Date().toISOString(),
          ...data
        });
      });

      // Sort logs descending by timestamp
      logs.sort((a, b) => {
        const timeA = getComparableTime(a.timestamp || a.createdAt);
        const timeB = getComparableTime(b.timestamp || b.createdAt);
        return timeB - timeA;
      });

      console.log(`📋 [Firestore] Received real-time activity_logs update (${logs.length} entries):`, logs);
      onUpdate(logs);
    }, (error) => {
      console.error("📋 [Firestore Error] Listening to activity_logs collection failed:", error);
      if (onError) onError(error);
    });

    return logsUnsubscribe;
  } catch (err) {
    console.error("Error setting up activity_logs listener:", err);
    if (onError) onError(err);
    return () => {};
  }
}

export async function createActivityLog(logData) {
  if (!db || !logData) return;

  try {
    const logId = logData.id || ('log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    const logRef = doc(db, 'activity_logs', logId);
    await setDoc(logRef, {
      ...logData,
      id: logId,
      createdAt: serverTimestamp()
    });
    console.log(`📋 [Firestore] Saved activity log [${logId}]`);
  } catch (err) {
    console.warn("Activity log save failed:", err);
  }
}

/**
 * Subscribe in real time to messages for a specific lead: leads/{leadId}/messages
 * Ordered by createdAt ascending with robust timestamp fallback
 */
export function subscribeToMessages(leadId, onUpdate, onError) {
  if (!db || !leadId) {
    if (onError) onError(new Error("Firestore or leadId missing"));
    return () => {};
  }

  // Unsubscribe previous active chat listener
  if (currentChatMessagesUnsubscribe) {
    currentChatMessagesUnsubscribe();
    currentChatMessagesUnsubscribe = null;
  }

  try {
    const messagesRef = collection(db, 'leads', leadId, 'messages');
    
    currentChatMessagesUnsubscribe = onSnapshot(messagesRef, (snapshot) => {
      const messages = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          whatsappMessageId: data.whatsappMessageId || docSnap.id,
          text: data.text || '',
          type: data.type || 'text',
          direction: data.direction || 'incoming', // incoming (customer) | outgoing (admin)
          status: data.status || 'received', // received | sent | delivered | read | failed
          timestamp: data.timestamp || null,
          createdAt: data.createdAt || null,
          errorMessage: data.errorMessage || '',
          ...data
        });
      });

      // Sort messages ascending by creation time / timestamp
      messages.sort((a, b) => {
        const timeA = getComparableTime(a.createdAt || a.timestamp);
        const timeB = getComparableTime(b.createdAt || b.timestamp);
        return timeA - timeB;
      });

      console.log(`💬 [Firestore] Received real-time messages for lead [${leadId}] (${messages.length} messages fetched from 'leads/${leadId}/messages'):`, messages);
      onUpdate(messages);
    }, (error) => {
      console.error(`💬 [Firestore Error] Listening to messages for lead ${leadId} failed:`, error);
      if (onError) onError(error);
    });

    return currentChatMessagesUnsubscribe;
  } catch (err) {
    console.error(`💬 [Firestore Error] Failed to attach messages listener for lead ${leadId}:`, err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetch the first incoming (customer) message for a given lead from Firestore
 */
export async function fetchFirstUserMessage(leadId) {
  if (!db || !leadId) return null;
  try {
    const messagesRef = collection(db, 'leads', leadId, 'messages');
    const snapshot = await getDocs(messagesRef);
    const messages = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      messages.push({
        id: docSnap.id,
        text: data.text || '',
        direction: data.direction || 'incoming',
        createdAt: data.createdAt || null,
        timestamp: data.timestamp || null,
        ...data
      });
    });

    if (messages.length === 0) return null;

    messages.sort((a, b) => {
      const timeA = getComparableTime(a.createdAt || a.timestamp);
      const timeB = getComparableTime(b.createdAt || b.timestamp);
      return timeA - timeB;
    });

    const firstIncoming = messages.find(m => m.direction === 'incoming' || m.fromUser === true || m.sender === 'user');
    if (firstIncoming) {
      return firstIncoming.text || firstIncoming.caption || firstIncoming.message || firstIncoming.body || null;
    }

    const firstMsg = messages[0];
    return firstMsg.text || firstMsg.caption || firstMsg.message || firstMsg.body || null;
  } catch (err) {
    console.warn(`Could not fetch first message for lead ${leadId}:`, err);
    return null;
  }
}

/**
 * Helper to convert various timestamp formats into millisecond epochs for sorting
 */
export function getComparableTime(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e11 ? val : val * 1000;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 0) return num > 1e11 ? num : num * 1000;
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
  if (val.seconds) return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  return 0;
}

/**
 * Mark a lead's unreadCount as 0 in Firestore
 */
export async function markLeadAsRead(leadId) {
  if (!db || !leadId) return;

  try {
    console.log(`📖 [Firestore] Marking unreadCount = 0 for lead [${leadId}]`);
    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      unreadCount: 0,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn(`Could not reset unreadCount for lead ${leadId}:`, err);
  }
}

/**
 * Update lead status directly in Firestore
 * @param {string} leadId 
 * @param {string} status ('new' | 'contacted' | 'follow_up' | 'converted' | 'closed')
 */
export async function updateLeadStatus(leadId, status) {
  if (!db || !leadId) {
    throw new Error("Firestore is not connected");
  }

  console.log(`📝 [Firestore] Updating lead status for [${leadId}] to "${status}"`);
  const leadRef = doc(db, 'leads', leadId);
  await updateDoc(leadRef, {
    status: status,
    updatedAt: serverTimestamp()
  });
}

export async function updateLeadAssignee(leadId, assigneeId, assigneeName) {
  if (!db || !leadId) return;

  console.log(`👤 [Firestore] Updating lead assignee for [${leadId}] to ${assigneeName} (${assigneeId})`);
  const leadRef = doc(db, 'leads', leadId);
  await updateDoc(leadRef, {
    assigneeId: assigneeId || null,
    assigneeName: assigneeName || 'Unassigned',
    assignedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Add a new note entry to a lead in Firestore
 * @param {string} leadId
 * @param {string} noteText
 * @param {Object} author { id, name, role }
 */
export async function addLeadNote(leadId, noteText, author) {
  if (!db || !leadId) {
    throw new Error("Firestore is not connected");
  }

  const nowIso = new Date().toISOString();
  const newNote = {
    id: 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    text: (noteText || '').trim(),
    authorId: author?.id || '',
    authorName: author?.name || 'Agent',
    authorRole: author?.role || 'agent',
    createdAt: nowIso
  };

  console.log(`📝 [Firestore] Adding new note entry for lead [${leadId}] by ${newNote.authorName}`);
  const leadRef = doc(db, 'leads', leadId);
  await updateDoc(leadRef, {
    notes: arrayUnion(newNote),
    latestNote: newNote,
    noteUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return newNote;
}

/**
 * Update lead notes directly in Firestore
 * @param {string} leadId
 * @param {Array|string} notes
 */
export async function updateLeadNotes(leadId, notes) {
  if (!db || !leadId) {
    throw new Error("Firestore is not connected");
  }

  console.log(`📝 [Firestore] Updating lead notes for [${leadId}]`);
  const leadRef = doc(db, 'leads', leadId);
  const nowIso = new Date().toISOString();
  let latestNote = null;
  if (Array.isArray(notes) && notes.length > 0) {
    latestNote = notes[notes.length - 1];
  } else if (typeof notes === 'string' && notes.trim()) {
    latestNote = { text: notes.trim(), authorName: 'Admin', createdAt: nowIso };
  }

  await updateDoc(leadRef, {
    notes: notes || [],
    latestNote: latestNote,
    noteUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function saveUserToFirestore(userData) {
  if (!db || !userData) {
    console.warn("⚠️ [Firestore] Database not initialized yet. Skipping user save.");
    return;
  }
  try {
    const userRef = doc(db, 'users', userData.id);
    await setDoc(userRef, userData, { merge: true });
    console.log(`👤 [Firestore] Saved user document [${userData.id}] successfully to 'users' collection!`);
  } catch (err) {
    console.error("❌ [Firestore Error] Could not save user to 'users' collection:", err);
  }
}

export async function updateUserStatusInFirestore(userId, status) {
  if (!db || !userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { status: status });
    console.log(`👤 [Firestore] Updated user status [${userId}] to ${status}`);
  } catch (err) {
    console.warn("User status update failed:", err);
  }
}

export async function deleteUserFromFirestore(userId) {
  if (!db || !userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    console.log(`🗑️ [Firestore] Deleted user document [${userId}]`);
  } catch (err) {
    console.error("❌ User Firestore delete failed:", err);
    throw err;
  }
}

export async function ensureFirebaseAuth() {
  if (!auth) {
    initializeFirebase();
  }
  if (auth && !auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.warn("ensureFirebaseAuth warning:", e);
    }
  }
}

export async function fetchUsersFromFirestore() {
  if (!db) {
    initializeFirebase();
  }
  if (!db) return [];
  try {
    await ensureFirebaseAuth();
    const usersRef = collection(db, 'users');
    const qSnap = await getDocs(usersRef);
    const usersList = [];
    qSnap.forEach(docSnap => {
      const data = docSnap.data();
      usersList.push({
        id: docSnap.id,
        ...data
      });
    });
    return usersList;
  } catch (err) {
    console.warn("Could not fetch users from Firestore:", err);
    return [];
  }
}

export async function fetchRolesFromFirestore() {
  if (!db) {
    initializeFirebase();
  }
  if (!db) return [];
  try {
    await ensureFirebaseAuth();
    const rolesRef = collection(db, 'roles');
    const qSnap = await getDocs(rolesRef);
    const rolesList = [];
    qSnap.forEach(docSnap => {
      const data = docSnap.data();
      rolesList.push({
        id: docSnap.id,
        ...data
      });
    });
    return rolesList;
  } catch (err) {
    console.warn("Could not fetch roles from Firestore:", err);
    return [];
  }
}

export async function saveRoleToFirestore(role) {
  if (!db) {
    initializeFirebase();
  }
  if (!db || !role || !role.id) return;
  try {
    await ensureFirebaseAuth();
    const roleRef = doc(db, 'roles', role.id);
    await setDoc(roleRef, {
      ...role,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`🛡️ [Firestore] Saved role document [${role.id}]`);
  } catch (err) {
    console.warn("Role Firestore save failed:", err);
  }
}

let rolesUnsubscribe = null;
export function subscribeToRoles(onUpdate, onError) {
  if (!db) {
    if (onError) onError(new Error("Firestore is not initialized"));
    return () => {};
  }

  if (rolesUnsubscribe) {
    rolesUnsubscribe();
    rolesUnsubscribe = null;
  }

  try {
    const rolesRef = collection(db, 'roles');
    rolesUnsubscribe = onSnapshot(rolesRef, (snapshot) => {
      const rolesList = [];
      snapshot.forEach((docSnap) => {
        rolesList.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      if (onUpdate) onUpdate(rolesList);
    }, (err) => {
      console.warn("Roles snapshot listener error:", err);
      if (onError) onError(err);
    });

    return rolesUnsubscribe;
  } catch (e) {
    console.warn("Subscribe to roles exception:", e);
    return () => {};
  }
}

/**
 * Delete a lead document from Firestore
 * @param {string} leadId
 */
export async function deleteLead(leadId) {
  if (!db || !leadId) {
    throw new Error("Firestore is not connected");
  }
  console.log(`🗑️ [Firestore] Deleting lead document [${leadId}]`);
  const leadRef = doc(db, 'leads', leadId);
  await deleteDoc(leadRef);
}

/**
 * Cache for resolved WhatsApp Media IDs to avoid repeated network lookups
 */
const mediaUrlCache = new Map();

/**
 * Convert a File object to a Base64 Data URL
 * @param {File} file
 * @returns {Promise<string>} Base64 Data URL (e.g. data:image/png;base64,...)
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a local File to Firebase Storage bucket and return public download URL.
 * If Storage is not configured or blocked by rules, returns null so caller can fallback to Base64.
 * @param {File} file - Local File object
 * @returns {Promise<string|null>} Public download URL for the uploaded file
 */
export async function uploadFileToStorage(file) {
  if (!file) return null;

  try {
    if (!app || !storage) {
      if (app) storage = getStorage(app);
      else return null;
    }

    // Ensure authenticated session before uploading
    if (auth && !auth.currentUser) {
      await signInAnonymously(auth).catch(() => {});
    }

    const timestamp = Date.now();
    const safeName = (file.name || 'media_' + timestamp).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `leads_media/${timestamp}_${safeName}`;
    const fileRef = storageRef(storage, storagePath);

    const customMetadata = {
      contentType: file.type || (file.name?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
    };

    const uploadResult = await uploadBytes(fileRef, file, customMetadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);
    return downloadUrl;
  } catch (err) {
    console.warn("Direct Firebase Storage upload unavailable (will use base64 payload):", err.message);
    return null;
  }
}

/**
 * Resolve WhatsApp mediaId to viewable URL or Data URI
 * @param {string} mediaId 
 * @returns {Promise<string|null>}
 */
export async function resolveWhatsAppMediaUrl(mediaId) {
  if (!mediaId) return null;
  if (mediaUrlCache.has(mediaId)) {
    return mediaUrlCache.get(mediaId);
  }

  // Check if mediaId is already a public data URI or non-Facebook direct link
  if (typeof mediaId === 'string' && (mediaId.startsWith('data:') || mediaId.startsWith('blob:') || (mediaId.startsWith('https://') && !mediaId.includes('lookaside.fbsbx.com') && !mediaId.includes('facebook.com')))) {
    return mediaId;
  }

  const config = getSavedConfig();
  const projectId = config.projectId || 'gold-cash-whatsapp';

  // 1. Try Firebase Callable getWhatsAppMediaUrl if functions client is connected
  if (functions) {
    try {
      if (auth && !auth.currentUser) {
        await signInAnonymously(auth).catch(() => {});
      }
      const getMediaCallable = httpsCallable(functions, 'getWhatsAppMediaUrl');
      const res = await getMediaCallable({ mediaId });

      if (res?.data?.dataUrl) {
        mediaUrlCache.set(mediaId, res.data.dataUrl);
        return res.data.dataUrl;
      }
      if (res?.data?.base64) {
        const mime = res.data.mimeType || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${res.data.base64}`;
        mediaUrlCache.set(mediaId, dataUrl);
        return dataUrl;
      }
      // If returned URL is already a public CDN link
      if (res?.data?.url && !res.data.url.includes('lookaside.fbsbx.com') && !res.data.url.includes('facebook.com')) {
        mediaUrlCache.set(mediaId, res.data.url);
        return res.data.url;
      }
    } catch (e) {
      console.warn("Callable getWhatsAppMediaUrl notice for mediaId " + mediaId + ":", e);
    }
  }

  // 2. Use Cloud Function whatsappMediaProxy endpoint
  const proxyEndpoint = `https://whatsappmediaproxy-udyapyjpza-uc.a.run.app?mediaId=${encodeURIComponent(mediaId)}`;
  mediaUrlCache.set(mediaId, proxyEndpoint);
  return proxyEndpoint;
}

/**
 * Send WhatsApp Message via Firebase Cloud Function Callable or HTTP proxy.
 * Supports Text, Image, Document (PDF), Video, Audio, Base64 uploads, and Batch Multi-attachment payloads.
 * 
 * @param {Object} payload
 * @param {string} payload.phone - Target WhatsApp phone number (E.164)
 * @param {string} [payload.text] - Message body text
 * @param {string} [payload.type] - 'text' | 'image' | 'document' | 'video' | 'audio'
 * @param {string} [payload.mediaUrl] - Direct URL to media asset
 * @param {string} [payload.base64] - Base64 Data URL of file
 * @param {string} [payload.filename] - Custom filename (for PDF/Document)
 * @param {string} [payload.caption] - Caption for media asset
 * @param {Array} [payload.messages] - Batch list of message objects for multi-send
 */
export async function sendWhatsAppMessage(payload) {
  const { phone, text, type, mediaUrl, base64, dataUrl, filename, caption, messages } = payload || {};

  if (!phone || !phone.trim()) {
    throw new Error("Recipient phone number is required.");
  }

  const isBatch = Array.isArray(messages) && messages.length > 0;
  const isMedia = type && type !== 'text' && (mediaUrl || base64 || dataUrl || payload.media || payload.fileBase64);
  const isText = Boolean(text && text.trim());

  if (!isBatch && !isMedia && !isText) {
    throw new Error("Message content or attachment is required.");
  }

  const config = getSavedConfig();
  const functionTarget = config.functionUrl || 'sendWhatsAppMessage';

  // Construct standard request body
  const requestData = {
    phone: phone.trim(),
    ...payload
  };

  if (text) requestData.text = text.trim();
  if (caption) requestData.caption = caption.trim();

  // Approach 1: If an explicit HTTP URL endpoint is configured
  if (functionTarget.startsWith('http://') || functionTarget.startsWith('https://')) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      } catch (tokenErr) {
        console.warn("Could not retrieve Auth token:", tokenErr);
      }
    }

    const response = await fetch(functionTarget, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: requestData })
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = (responseData && (responseData.error?.message || responseData.message)) ||
        `HTTP error ${response.status}: ${response.statusText}`;
      throw new Error(errMsg);
    }

    return responseData.result || responseData;
  }

  // Approach 2: Call Firebase Callable Cloud Function (Standard)
  if (functions) {
    // Ensure we are signed in anonymously if auth is ready
    if (auth && !auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.warn("Pre-call auth sign-in notice:", authErr);
      }
    }

    const callable = httpsCallable(functions, functionTarget);
    const result = await callable(requestData);
    return result.data;
  }

  throw new Error("Database client is not connected. Please check your Database configuration.");
}

export const sendWhatsAppMessageCloud = sendWhatsAppMessage;

/**
 * Create a new lead document in Firestore
 * @param {Object} leadData
 */
export async function createNewLead(leadData) {
  const rawPhone = (leadData.phone || '').trim();
  const digitsPhone = rawPhone.replace(/\D/g, '');
  const nowIso = new Date().toISOString();
  const initialMsg = (leadData.initialMessage || '').trim();
  const performerName = leadData.creatorName || 'Admin User';

  let targetLeadId = leadData.id;

  if (db && !targetLeadId && digitsPhone) {
    try {
      const leadsRef = collection(db, 'leads');
      const qSnap = await getDocs(leadsRef);
      qSnap.forEach(d => {
        const dPhone = (d.data().phone || '').replace(/\D/g, '');
        if (dPhone && dPhone === digitsPhone) {
          targetLeadId = d.id;
        }
      });
    } catch (qErr) {
      console.warn("Could not query existing lead by phone:", qErr);
    }
  }

  if (!targetLeadId) {
    targetLeadId = 'lead_' + Date.now();
  }

  const leadSource = leadData.source || leadData.platform || 'Direct WhatsApp';

  const docPayload = {
    id: targetLeadId,
    name: leadData.name || 'New Lead',
    phone: rawPhone,
    status: leadData.status || 'new',
    platform: leadSource,
    source: leadSource,
    assigneeId: leadData.assigneeId || null,
    assigneeName: leadData.assigneeName || 'Unassigned',
    notes: leadData.notes || [],
    latestNote: (Array.isArray(leadData.notes) && leadData.notes[0]) || null,
    initiatedBy: 'crm',
    isLead: true,
    hasWhatsAppMessages: false,
    unreadCount: 0,
    lastMessage: '',
    lastMessageText: '',
    lastMessageTime: '',
    lastMessageAt: nowIso,
    createdAt: nowIso
  };

  if (db) {
    console.log(`📝 [Firestore] Saving CRM lead document [${targetLeadId}]`);
    const leadRef = doc(db, 'leads', targetLeadId);
    await setDoc(leadRef, docPayload, { merge: true });
  }

  return docPayload;
}

