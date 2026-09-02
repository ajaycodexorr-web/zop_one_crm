/**
 * Outbound Message Composer, Staged Media Attachments Tray & Quick Templates
 */

import { sendWhatsAppMessage, updateLeadAssignee, uploadFileToStorage } from '../../firebase-config.js';
import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { escapeHtml } from '../utils/formatters.js';
import { showToast } from '../utils/notifications.js';
import { addAuditLog } from '../services/logging-service.js';
import { checkUserDisabledAndEnforceLogout } from '../services/auth-service.js';
import { hasPermission } from '../services/user-service.js';

let activeMediaModalType = 'image';

export function setupComposerHandlers(renderLeadsView, renderConversationsView, renderMessagesStream, updateLeadStatus) {
  // Attachment Popover Menu
  if (elements.attachmentMenuBtn) {
    elements.attachmentMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = elements.attachmentPopover && elements.attachmentPopover.style.display === 'block';
      if (elements.attachmentPopover) elements.attachmentPopover.style.display = isVisible ? 'none' : 'block';
    });
  }

  if (elements.attachImageFileBtn) {
    elements.attachImageFileBtn.addEventListener('click', () => {
      if (elements.attachmentPopover) elements.attachmentPopover.style.display = 'none';
      if (elements.imageFileInput) elements.imageFileInput.click();
    });
  }

  if (elements.attachDocFileBtn) {
    elements.attachDocFileBtn.addEventListener('click', () => {
      if (elements.attachmentPopover) elements.attachmentPopover.style.display = 'none';
      if (elements.docFileInput) elements.docFileInput.click();
    });
  }

  if (elements.attachUrlBtn) {
    elements.attachUrlBtn.addEventListener('click', () => {
      if (elements.attachmentPopover) elements.attachmentPopover.style.display = 'none';
      openMediaInputModal('image');
    });
  }

  if (elements.imageFileInput) {
    elements.imageFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        addStagedAttachment({
          id: 'att_' + Date.now(),
          type: 'image',
          url: URL.createObjectURL(file),
          file: file,
          name: file.name
        });
      }
      elements.imageFileInput.value = '';
    });
  }

  if (elements.docFileInput) {
    elements.docFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        addStagedAttachment({
          id: 'att_' + Date.now(),
          type: 'document',
          url: URL.createObjectURL(files[0]),
          file: files[0],
          name: files[0].name
        });
      }
      elements.docFileInput.value = '';
    });
  }

  if (elements.clearAllAttachmentsBtn) elements.clearAllAttachmentsBtn.addEventListener('click', clearAllStagedAttachments);
  if (elements.closeMediaModalBtn) elements.closeMediaModalBtn.addEventListener('click', closeMediaInputModal);
  if (elements.cancelMediaModalBtn) elements.cancelMediaModalBtn.addEventListener('click', closeMediaInputModal);

  if (elements.mediaAttachmentForm) {
    elements.mediaAttachmentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = elements.mediaUrlInput ? elements.mediaUrlInput.value.trim() : '';
      if (!url) return;
      addStagedAttachment({
        id: 'att_' + Date.now(),
        type: activeMediaModalType,
        url: url,
        name: (elements.mediaFilenameInput && elements.mediaFilenameInput.value.trim()) || 'Attachment'
      });
      closeMediaInputModal();
    });
  }

  // Global click popover dismiss
  document.addEventListener('click', (e) => {
    if (elements.attachmentPopover && !elements.attachmentPopover.contains(e.target) && elements.attachmentMenuBtn && !elements.attachmentMenuBtn.contains(e.target)) {
      elements.attachmentPopover.style.display = 'none';
    }
  });

  // Composer Form submit
  if (elements.sendMessageForm) {
    elements.sendMessageForm.addEventListener('submit', (e) => handleSendMessage(e, renderLeadsView, renderConversationsView, renderMessagesStream, updateLeadStatus));
  }
  if (elements.messageTextInput) {
    elements.messageTextInput.addEventListener('input', () => autoResizeTextarea(elements.messageTextInput));
    elements.messageTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (elements.sendMessageForm) elements.sendMessageForm.requestSubmit();
      }
    });
  }

  // Setup Drag & Drop File Upload
  setupDragAndDropHandlers();
}

export function setupDragAndDropHandlers() {
  const chatView = document.getElementById('activeChatView');
  const overlay = document.getElementById('chatDragDropOverlay');
  if (!chatView) return;

  let dragCounter = 0;

  chatView.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (overlay) overlay.style.display = 'flex';
  });

  chatView.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (overlay && overlay.style.display !== 'flex') {
      overlay.style.display = 'flex';
    }
  });

  chatView.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (overlay) overlay.style.display = 'none';
    }
  });

  chatView.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    if (overlay) overlay.style.display = 'none';

    const files = Array.from(e.dataTransfer ? e.dataTransfer.files : []);
    if (files.length === 0) return;

    let addedCount = 0;
    for (const file of files) {
      let type = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      addStagedAttachment({
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type: type,
        url: URL.createObjectURL(file),
        file: file,
        name: file.name
      });
      addedCount++;
    }

    if (addedCount > 0) {
      showToast(`Attached ${addedCount} file(s)! Click Send or press Enter.`, 'info');
      if (elements.messageTextInput) elements.messageTextInput.focus();
    }
  });
}

export function openMediaInputModal(type = 'image') {
  activeMediaModalType = type;
  if (elements.mediaUrlInput) elements.mediaUrlInput.value = '';
  if (elements.mediaInputModal) elements.mediaInputModal.style.display = 'flex';
}

export function closeMediaInputModal() {
  if (elements.mediaInputModal) elements.mediaInputModal.style.display = 'none';
}

export function addStagedAttachment(item) {
  state.stagedAttachments.push(item);
  renderStagingTray();
}

export function removeStagedAttachment(id) {
  state.stagedAttachments = state.stagedAttachments.filter(item => item.id !== id);
  renderStagingTray();
}

export function clearAllStagedAttachments() {
  state.stagedAttachments = [];
  renderStagingTray();
}

export function renderStagingTray() {
  if (!elements.trayCount || !elements.composerAttachmentsTray) return;
  const count = state.stagedAttachments.length;
  elements.trayCount.textContent = count;

  if (count === 0) {
    elements.composerAttachmentsTray.style.display = 'none';
    if (elements.trayItemsList) elements.trayItemsList.innerHTML = '';
    return;
  }

  elements.composerAttachmentsTray.style.display = 'flex';
  if (elements.trayItemsList) {
    elements.trayItemsList.innerHTML = state.stagedAttachments.map(item => {
      const isImg = item.type === 'image';
      return `
        <div class="staged-media-chip" data-id="${item.id}" title="${escapeHtml(item.name)}">
          <button type="button" class="chip-remove-btn" data-remove-id="${item.id}" title="Remove file">
            <i class="fa-solid fa-xmark"></i>
          </button>
          ${isImg ? `
            <div class="chip-thumb-wrap">
              <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">
            </div>
          ` : `
            <div class="chip-doc-wrap">
              <i class="fa-solid fa-file-pdf"></i>
              <span class="chip-doc-name">${escapeHtml(item.name)}</span>
            </div>
          `}
        </div>
      `;
    }).join('');

    elements.trayItemsList.querySelectorAll('.chip-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeStagedAttachment(btn.dataset.removeId);
      });
    });
  }
}

export function updateComposerDisabledState() {
  const isDisabled = state.currentUser && state.currentUser.status === 'disabled';
  const canMessage = hasPermission('canSendMessage');
  const isBlocked = isDisabled || !canMessage;

  let placeholderText = "Type a WhatsApp message...";
  if (isDisabled) {
    placeholderText = "Your account is disabled by Admin. You cannot send messages.";
  } else if (!canMessage) {
    placeholderText = "Messaging permission has been restricted for your account.";
  }

  if (elements.messageTextInput) {
    elements.messageTextInput.disabled = isBlocked;
    elements.messageTextInput.placeholder = placeholderText;
  }

  if (elements.sendMessageBtn) {
    elements.sendMessageBtn.disabled = isBlocked;
    elements.sendMessageBtn.style.opacity = isBlocked ? '0.5' : '1';
    elements.sendMessageBtn.style.cursor = isBlocked ? 'not-allowed' : 'pointer';
  }

  if (elements.attachmentMenuBtn) {
    elements.attachmentMenuBtn.disabled = isBlocked;
    elements.attachmentMenuBtn.style.opacity = isBlocked ? '0.5' : '1';
  }
}

export async function handleSendMessage(e, renderLeadsView, renderConversationsView, renderMessagesStream, updateLeadStatus) {
  if (e) e.preventDefault();

  if (state.currentUser && state.currentUser.status === 'disabled') {
    showToast("Your account is disabled. You cannot send messages or perform actions.", "error");
    return;
  }

  if (!hasPermission('canSendMessage')) {
    showToast("You do not have permission to send messages.", "error");
    return;
  }

  if (checkUserDisabledAndEnforceLogout()) return;

  const text = elements.messageTextInput ? elements.messageTextInput.value.trim() : '';
  const leadId = state.activeLeadId;
  const attachments = [...state.stagedAttachments];

  if ((!text && attachments.length === 0) || !leadId) return;

  const activeLead = state.leads.find(l => l.id === leadId);
  const phone = activeLead ? (activeLead.phone || activeLead.id) : '';

  if (elements.messageTextInput) {
    elements.messageTextInput.value = '';
    autoResizeTextarea(elements.messageTextInput);
  }
  clearAllStagedAttachments();

  try {
    if (activeLead) {
      activeLead.lastMessageDirection = 'outgoing';
      activeLead.hasAdminReplied = true;
      if (activeLead.status === 'new') activeLead.status = 'contacted';

      // Auto-assign lead to active agent if currently unassigned
      if (!activeLead.assigneeId && state.currentUser) {
        activeLead.assigneeId = state.currentUser.id;
        activeLead.assigneeName = state.currentUser.name;
        if (!state.demoMode) {
          updateLeadAssignee(leadId, state.currentUser.id, state.currentUser.name).catch(() => { });
        }
      }
    }

    const performer = state.currentUser || { id: 'usr_admin', name: 'Admin User', role: 'admin' };
    const now = new Date();
    const tempMsgId = "temp_msg_" + Date.now();

    const firstAtt = attachments.length > 0 ? attachments[0] : null;

    // Construct Instant Optimistic Message
    const optimisticMsg = {
      id: tempMsgId,
      type: firstAtt ? (firstAtt.type || "image") : "text",
      mediaUrl: firstAtt ? firstAtt.url : null,
      filename: firstAtt ? (firstAtt.name || "file") : null,
      text: text,
      caption: text || "",
      direction: "outgoing",
      status: "sending",
      timestamp: String(Math.floor(now.getTime() / 1000)),
      createdAt: now,
      performerId: performer.id,
      performedBy: performer.name,
      performerRole: performer.role
    };

    // Immediately push to state & update lead preview for 0ms latency
    if (!Array.isArray(state.messages)) state.messages = [];
    state.messages.push(optimisticMsg);

    if (activeLead) {
      activeLead.hasWhatsAppMessages = true;
      activeLead.lastMessage = text || (attachments.length > 0 ? `[${attachments[0].type || 'Media'}]` : 'Sent media');
      activeLead.lastMessageAt = now;
      activeLead.lastMessageDirection = 'outgoing';
      activeLead.hasAdminReplied = true;
      if (activeLead.status === 'new') activeLead.status = 'contacted';
    }

    // Instantly render in Chat Window & Sidebar Inbox (0ms delay)
    if (renderMessagesStream) renderMessagesStream();
    if (renderConversationsView) renderConversationsView();
    if (renderLeadsView) renderLeadsView();

    const msgSnippet = text ? (text.substring(0, 40) + (text.length > 40 ? '...' : '')) : 'Media Attachment';
    addAuditLog('message_sent', leadId, activeLead ? activeLead.name : leadId, `Sent WhatsApp message: "${msgSnippet}"`);

    if (state.demoMode) return;

    // Send payload asynchronously via Cloud Function in background
    (async () => {
      try {
        if (attachments.length > 0) {
          for (const att of attachments) {
            let mediaType = "document";
            let base64Data = att.url;

            if (att.file) {
              base64Data = await fileToBase64(att.file);
              if (att.file.type.startsWith("image/")) mediaType = "image";
              else if (att.file.type.startsWith("video/")) mediaType = "video";
              else if (att.file.type.startsWith("audio/")) mediaType = "audio";
            } else if (att.type) {
              mediaType = att.type;
            }

            await sendWhatsAppMessage({
              phone: phone,
              type: mediaType,
              mediaUrl: base64Data,
              caption: text || "",
              filename: att.name || "file",
              performerId: performer.id,
              performedBy: performer.name,
              performerRole: performer.role
            });
          }
        } else if (text) {
          await sendWhatsAppMessage({
            phone: phone,
            text: text,
            performerId: performer.id,
            performedBy: performer.name,
            performerRole: performer.role
          });
        }

        optimisticMsg.status = 'delivered';
        if (leadId && updateLeadStatus) updateLeadStatus(leadId, 'contacted');
        if (renderMessagesStream) renderMessagesStream();
      } catch (err) {
        optimisticMsg.status = 'failed';
        if (renderMessagesStream) renderMessagesStream();
        showToast("Failed to send: " + err.message, "error");
      }
    })();
  } catch (err) {
    showToast("Failed to send: " + err.message, "error");
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

export function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 140);
  textarea.style.height = `${newHeight}px`;
}
