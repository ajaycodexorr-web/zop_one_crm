/**
 * Full-Screen Image / Media Lightbox Viewer & Keybindings
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';

export function setupLightboxHandlers() {
  if (elements.lightboxCloseBtn) elements.lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (elements.lightboxPrevBtn) elements.lightboxPrevBtn.addEventListener('click', () => navigateLightbox(-1));
  if (elements.lightboxNextBtn) elements.lightboxNextBtn.addEventListener('click', () => navigateLightbox(1));

  if (elements.imageLightboxModal) {
    elements.imageLightboxModal.addEventListener('click', (e) => {
      if (e.target === elements.imageLightboxModal || e.target.classList.contains('lightbox-body') || e.target.classList.contains('lightbox-stage')) {
        closeLightbox();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!state.lightbox.isOpen) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
  });
}

export function openLightbox(items, initialIndex = 0) {
  if (!items || items.length === 0) return;

  state.lightbox.isOpen = true;
  state.lightbox.items = items;
  state.lightbox.currentIndex = Math.max(0, Math.min(initialIndex, items.length - 1));

  renderLightboxSlide();
  if (elements.imageLightboxModal) elements.imageLightboxModal.style.display = 'flex';
}

export function closeLightbox() {
  state.lightbox.isOpen = false;
  if (elements.imageLightboxModal) elements.imageLightboxModal.style.display = 'none';
  if (elements.lightboxImage) elements.lightboxImage.src = '';
  if (elements.lightboxVideo) {
    elements.lightboxVideo.pause();
    elements.lightboxVideo.src = '';
  }
}

export function navigateLightbox(direction) {
  const { items, currentIndex } = state.lightbox;
  if (!items || items.length <= 1) return;

  let newIndex = currentIndex + direction;
  if (newIndex < 0) newIndex = items.length - 1;
  if (newIndex >= items.length) newIndex = 0;

  state.lightbox.currentIndex = newIndex;
  renderLightboxSlide();
}

export function renderLightboxSlide() {
  const { items, currentIndex } = state.lightbox;
  const current = items[currentIndex];
  if (!current) return;

  const total = items.length;

  if (elements.lightboxCounter) elements.lightboxCounter.textContent = `${currentIndex + 1} / ${total}`;
  if (elements.lightboxInlineTitle) elements.lightboxInlineTitle.textContent = current.caption || current.name || (isVideoUrl(current.url) ? 'Video Preview' : 'Image Preview');
  if (elements.lightboxCaption) elements.lightboxCaption.textContent = current.caption || '';

  if (elements.lightboxDownloadBtn) {
    elements.lightboxDownloadBtn.href = current.url;
    elements.lightboxDownloadBtn.setAttribute('download', current.name || `media_${currentIndex + 1}`);
  }
  if (elements.lightboxNewTabBtn) elements.lightboxNewTabBtn.href = current.url;

  if (elements.lightboxPrevBtn) elements.lightboxPrevBtn.style.display = total > 1 ? 'flex' : 'none';
  if (elements.lightboxNextBtn) elements.lightboxNextBtn.style.display = total > 1 ? 'flex' : 'none';

  const isVideo = current.type === 'video' || isVideoUrl(current.url);
  if (isVideo) {
    if (elements.lightboxImage) elements.lightboxImage.style.display = 'none';
    if (elements.lightboxVideo) {
      elements.lightboxVideo.src = current.url;
      elements.lightboxVideo.style.display = 'block';
      elements.lightboxVideo.play().catch(() => { });
    }
  } else {
    if (elements.lightboxVideo) {
      elements.lightboxVideo.pause();
      elements.lightboxVideo.style.display = 'none';
    }
    if (elements.lightboxImage) {
      elements.lightboxImage.src = current.url;
      elements.lightboxImage.style.display = 'block';
    }
  }
}

function isVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}
