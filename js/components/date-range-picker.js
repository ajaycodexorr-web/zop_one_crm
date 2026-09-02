/**
 * Interactive Date Range Picker Component
 * Supports dual-month interactive calendar, 14 presets, custom range selection,
 * quick clear / reset capabilities, and real-time filtering for the Leads Dashboard.
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { parseDate } from '../utils/formatters.js';

let tempPreset = 'all';
let tempStartDate = null;
let tempEndDate = null;
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0-11
let onApplyCallback = null;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a Date object to "MMM D, YYYY" (e.g. "Jan 1, 2025")
 */
function formatDateDisplay(d) {
  if (!d) return '';
  const m = MONTH_NAMES[d.getMonth()].substring(0, 3);
  const day = d.getDate();
  const yr = d.getFullYear();
  return `${m} ${day}, ${yr}`;
}

/**
 * Format a Date object to "YYYY-MM-DD"
 */
function formatIsoDate(d) {
  if (!d) return '';
  const yr = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${yr}-${m}-${day}`;
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Calculate Date range from Preset option
 */
export function calculatePresetRange(preset) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  let start = null;
  let end = null;
  let label = 'All Time';

  switch (preset) {
    case 'today': {
      start = new Date(currentYear, currentMonth, currentDate, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);
      label = `Today: ${formatDateDisplay(start)}`;
      break;
    }
    case 'yesterday': {
      start = new Date(currentYear, currentMonth, currentDate - 1, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate - 1, 23, 59, 59, 999);
      label = `Yesterday: ${formatDateDisplay(start)}`;
      break;
    }
    case 'last_7_days': {
      start = new Date(currentYear, currentMonth, currentDate - 6, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);
      label = `Last 7 days: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'last_14_days': {
      start = new Date(currentYear, currentMonth, currentDate - 13, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);
      label = `Last 14 days: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'last_30_days': {
      start = new Date(currentYear, currentMonth, currentDate - 29, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);
      label = `Last 30 days: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'this_week': {
      const dayOfWeek = now.getDay(); // 0 is Sun
      start = new Date(currentYear, currentMonth, currentDate - dayOfWeek, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate + (6 - dayOfWeek), 23, 59, 59, 999);
      label = `This week: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      start = new Date(currentYear, currentMonth, currentDate - dayOfWeek - 7, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate - dayOfWeek - 1, 23, 59, 59, 999);
      label = `Last week: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'this_month': {
      start = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
      end = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);
      label = `This month: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'last_month': {
      start = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
      const lastDayOfPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
      end = new Date(currentYear, currentMonth - 1, lastDayOfPrevMonth, 23, 59, 59, 999);
      label = `Last month: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'this_quarter': {
      const currentQuarter = Math.floor(currentMonth / 3);
      start = new Date(currentYear, currentQuarter * 3, 1, 0, 0, 0, 0);
      const endMonth = (currentQuarter * 3) + 2;
      const lastDay = new Date(currentYear, endMonth + 1, 0).getDate();
      end = new Date(currentYear, endMonth, lastDay, 23, 59, 59, 999);
      label = `This quarter: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'last_quarter': {
      let prevQuarter = Math.floor(currentMonth / 3) - 1;
      let yr = currentYear;
      if (prevQuarter < 0) {
        prevQuarter = 3;
        yr -= 1;
      }
      start = new Date(yr, prevQuarter * 3, 1, 0, 0, 0, 0);
      const endMonth = (prevQuarter * 3) + 2;
      const lastDay = new Date(yr, endMonth + 1, 0).getDate();
      end = new Date(yr, endMonth, lastDay, 23, 59, 59, 999);
      label = `Last quarter: ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
      break;
    }
    case 'this_year': {
      start = new Date(currentYear, 0, 1, 0, 0, 0, 0);
      end = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      label = `This year: ${currentYear}`;
      break;
    }
    case 'last_year': {
      start = new Date(currentYear - 1, 0, 1, 0, 0, 0, 0);
      end = new Date(currentYear - 1, 11, 31, 23, 59, 59, 999);
      label = `Last year: ${currentYear - 1}`;
      break;
    }
    case 'all':
    default: {
      start = null;
      end = null;
      label = 'All Time';
      break;
    }
  }

  return { start, end, label };
}

/**
 * Initialize Date Range Picker listeners
 */
export function setupDateRangePicker(applyCallback) {
  onApplyCallback = applyCallback;

  // Initialize state if not present
  if (!state.leadsDateFilter) {
    state.leadsDateFilter = {
      preset: 'all',
      startDate: null,
      endDate: null,
      label: 'All Time'
    };
  }

  const triggerBtn = document.getElementById('leadDateFilterBtn');
  const quickClearBtn = document.getElementById('dateFilterClearQuickBtn');
  const popover = document.getElementById('dateRangePickerPopover');
  const closeBtn = document.getElementById('drpCloseBtn');
  const cancelBtn = document.getElementById('drpCancelBtn');
  const applyBtn = document.getElementById('drpApplyBtn');
  const clearBtn = document.getElementById('drpClearBtn');
  const prevMonthBtn = document.getElementById('drpPrevMonthBtn');
  const nextMonthBtn = document.getElementById('drpNextMonthBtn');

  if (triggerBtn) {
    triggerBtn.addEventListener('click', (e) => {
      // If quick clear clicked, don't open popover
      if (e.target.closest('#dateFilterClearQuickBtn')) {
        e.stopPropagation();
        resetToAllTime();
        return;
      }
      e.stopPropagation();
      toggleDateRangePopover();
    });
  }

  if (quickClearBtn) {
    quickClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetToAllTime();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeDateRangePopover());
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeDateRangePopover());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => resetToAllTime());
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => applySelectedDateRange());
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderDualCalendars();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderDualCalendars();
    });
  }

  // Preset Radio Changes
  document.querySelectorAll('input[name="drpPreset"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      const selected = e.target.value;
      tempPreset = selected;

      if (selected === 'all') {
        tempStartDate = null;
        tempEndDate = null;
        updateInputFields();
        renderDualCalendars();
      } else if (selected !== 'custom') {
        const { start, end } = calculatePresetRange(selected);
        tempStartDate = start;
        tempEndDate = end;
        if (start) {
          viewYear = start.getFullYear();
          viewMonth = start.getMonth();
        }
        updateInputFields();
        renderDualCalendars();
      }
    });
  });

  // Global Outside Click to Close
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('leadDateFilterWrapper');
    if (wrapper && !wrapper.contains(e.target) && popover && popover.style.display === 'flex') {
      closeDateRangePopover();
    }
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover && popover.style.display === 'flex') {
      closeDateRangePopover();
    }
  });

  updateTriggerButtonDisplay();
}

/**
 * Toggle Date Range Picker Popover
 */
export function toggleDateRangePopover() {
  const popover = document.getElementById('dateRangePickerPopover');
  if (!popover) return;
  const isVisible = popover.style.display === 'flex';
  if (isVisible) {
    closeDateRangePopover();
  } else {
    openDateRangePopover();
  }
}

/**
 * Open Popover and sync temporary selection with current active filter
 */
export function openDateRangePopover() {
  const popover = document.getElementById('dateRangePickerPopover');
  const triggerBtn = document.getElementById('leadDateFilterBtn');
  if (!popover) return;

  const current = state.leadsDateFilter || { preset: 'all', startDate: null, endDate: null };
  tempPreset = current.preset || 'all';
  tempStartDate = current.startDate ? new Date(current.startDate) : null;
  tempEndDate = current.endDate ? new Date(current.endDate) : null;

  if (tempStartDate) {
    viewYear = tempStartDate.getFullYear();
    viewMonth = tempStartDate.getMonth();
  } else {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }

  // Sync radio selection
  const targetRadio = document.querySelector(`input[name="drpPreset"][value="${tempPreset}"]`);
  if (targetRadio) {
    targetRadio.checked = true;
  }

  updateInputFields();
  renderDualCalendars();

  popover.style.display = 'flex';
  if (triggerBtn) {
    triggerBtn.setAttribute('aria-expanded', 'true');
    triggerBtn.classList.add('dropdown-open');
  }
}

/**
 * Close Popover
 */
export function closeDateRangePopover() {
  const popover = document.getElementById('dateRangePickerPopover');
  const triggerBtn = document.getElementById('leadDateFilterBtn');
  if (!popover) return;

  popover.style.display = 'none';
  if (triggerBtn) {
    triggerBtn.setAttribute('aria-expanded', 'false');
    triggerBtn.classList.remove('dropdown-open');
  }
}

/**
 * Reset date filter back to All Time and immediately apply
 */
export function resetToAllTime() {
  tempPreset = 'all';
  tempStartDate = null;
  tempEndDate = null;

  state.leadsDateFilter = {
    preset: 'all',
    startDate: null,
    endDate: null,
    label: 'All Time'
  };

  state.leadsCurrentPage = 1;

  const allRadio = document.querySelector('input[name="drpPreset"][value="all"]');
  if (allRadio) allRadio.checked = true;

  updateInputFields();
  renderDualCalendars();
  updateTriggerButtonDisplay();
  closeDateRangePopover();

  if (onApplyCallback) {
    onApplyCallback();
  }
}

/**
 * Update Start/End date text fields & helper text inside popover
 */
function updateInputFields() {
  const startInput = document.getElementById('drpStartDateInput');
  const endInput = document.getElementById('drpEndDateInput');
  const helperText = document.getElementById('drpHelperText');

  if (startInput) {
    startInput.value = tempStartDate ? formatDateDisplay(tempStartDate) : '';
  }
  if (endInput) {
    endInput.value = tempEndDate ? formatDateDisplay(tempEndDate) : '';
  }

  if (helperText) {
    if (!tempStartDate && !tempEndDate) {
      helperText.textContent = 'Showing all leads (All Time)';
    } else if (tempStartDate && tempEndDate) {
      helperText.textContent = `Selected: ${formatDateDisplay(tempStartDate)} — ${formatDateDisplay(tempEndDate)}`;
    } else if (tempStartDate) {
      helperText.textContent = `Select end date (Start: ${formatDateDisplay(tempStartDate)})`;
    }
  }
}

/**
 * Render Dual Calendars (Left: viewMonth, Right: viewMonth + 1)
 */
function renderDualCalendars() {
  const leftCalendarEl = document.getElementById('drpCalendarLeft');
  const rightCalendarEl = document.getElementById('drpCalendarRight');
  const leftTitleEl = document.getElementById('drpMonthTitleLeft');
  const rightTitleEl = document.getElementById('drpMonthTitleRight');

  if (!leftCalendarEl || !rightCalendarEl) return;

  // Left month
  const leftDate = new Date(viewYear, viewMonth, 1);
  const leftY = leftDate.getFullYear();
  const leftM = leftDate.getMonth();

  // Right month
  const rightDate = new Date(viewYear, viewMonth + 1, 1);
  const rightY = rightDate.getFullYear();
  const rightM = rightDate.getMonth();

  if (leftTitleEl) {
    leftTitleEl.textContent = `${MONTH_NAMES[leftM]} ${leftY}`;
  }
  if (rightTitleEl) {
    rightTitleEl.textContent = `${MONTH_NAMES[rightM]} ${rightY}`;
  }

  leftCalendarEl.innerHTML = buildMonthCalendarHtml(leftY, leftM);
  rightCalendarEl.innerHTML = buildMonthCalendarHtml(rightY, rightM);

  attachCalendarDayEvents(leftCalendarEl);
  attachCalendarDayEvents(rightCalendarEl);
}

/**
 * Build Single Month HTML
 */
function buildMonthCalendarHtml(year, month) {
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  let html = `
    <div class="drp-weekdays-row">
      ${WEEK_DAYS.map(d => `<span class="drp-weekday">${d}</span>`).join('')}
    </div>
    <div class="drp-days-grid">
  `;

  // Empty leading days
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="drp-day-cell empty"></div>`;
  }

  // Days in month
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    const dateIso = formatIsoDate(currentDate);

    const isStart = tempStartDate && isSameDay(currentDate, tempStartDate);
    const isEnd = tempEndDate && isSameDay(currentDate, tempEndDate);
    const isToday = isSameDay(currentDate, today);

    let inRange = false;
    if (tempStartDate && tempEndDate) {
      const cTime = currentDate.getTime();
      const sTime = new Date(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate()).getTime();
      const eTime = new Date(tempEndDate.getFullYear(), tempEndDate.getMonth(), tempEndDate.getDate()).getTime();
      if (cTime > sTime && cTime < eTime) {
        inRange = true;
      }
    }

    let classNames = ['drp-day-cell', 'active-day'];
    if (isStart) classNames.push('range-start');
    if (isEnd) classNames.push('range-end');
    if (inRange) classNames.push('in-range');
    if (isToday) classNames.push('today');

    html += `
      <button type="button" class="${classNames.join(' ')}" data-date="${dateIso}" data-year="${year}" data-month="${month}" data-day="${day}">
        <span class="day-number">${day}</span>
      </button>
    `;
  }

  html += `</div>`;
  return html;
}

/**
 * Attach Click and Hover event handlers to calendar day cells without full DOM re-rendering
 */
function attachCalendarDayEvents(container) {
  container.querySelectorAll('.drp-day-cell.active-day').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const y = parseInt(btn.dataset.year, 10);
      const m = parseInt(btn.dataset.month, 10);
      const d = parseInt(btn.dataset.day, 10);
      const clicked = new Date(y, m, d);

      handleDayClick(clicked);
    });

    btn.addEventListener('mouseenter', () => {
      if (tempStartDate && !tempEndDate) {
        const y = parseInt(btn.dataset.year, 10);
        const m = parseInt(btn.dataset.month, 10);
        const d = parseInt(btn.dataset.day, 10);
        const hovered = new Date(y, m, d);
        updateHoverRangeHighlights(hovered);
      }
    });
  });
}

/**
 * Dynamically toggle .in-range classes without rebuilding DOM on hover
 */
function updateHoverRangeHighlights(hovered) {
  if (!tempStartDate || tempEndDate) return;

  const sTime = new Date(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate()).getTime();
  const hTime = new Date(hovered.getFullYear(), hovered.getMonth(), hovered.getDate()).getTime();
  const minTime = Math.min(sTime, hTime);
  const maxTime = Math.max(sTime, hTime);

  document.querySelectorAll('.drp-day-cell.active-day').forEach(cell => {
    const y = parseInt(cell.dataset.year, 10);
    const m = parseInt(cell.dataset.month, 10);
    const d = parseInt(cell.dataset.day, 10);
    const cellTime = new Date(y, m, d).getTime();

    if (cellTime > minTime && cellTime < maxTime) {
      cell.classList.add('in-range');
    } else {
      cell.classList.remove('in-range');
    }

    if (cellTime === hTime && cellTime !== sTime) {
      cell.classList.add('range-hover-end');
    } else {
      cell.classList.remove('range-hover-end');
    }
  });
}

/**
 * Handle day click selection logic
 */
function handleDayClick(clickedDate) {
  // If no start date OR both start and end dates are already set:
  if (!tempStartDate || (tempStartDate && tempEndDate)) {
    tempStartDate = clickedDate;
    tempEndDate = null;
    tempPreset = 'custom';
  } else if (tempStartDate && !tempEndDate) {
    if (clickedDate.getTime() < tempStartDate.getTime()) {
      tempEndDate = new Date(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate(), 23, 59, 59, 999);
      tempStartDate = new Date(clickedDate.getFullYear(), clickedDate.getMonth(), clickedDate.getDate(), 0, 0, 0, 0);
    } else {
      tempEndDate = new Date(clickedDate.getFullYear(), clickedDate.getMonth(), clickedDate.getDate(), 23, 59, 59, 999);
    }
    tempPreset = 'custom';
  }

  // Set custom radio to checked
  const customRadio = document.querySelector('input[name="drpPreset"][value="custom"]');
  if (customRadio) customRadio.checked = true;

  updateInputFields();
  renderDualCalendars();
}

/**
 * Apply selected date filter and trigger leads table re-render
 */
function applySelectedDateRange() {
  let finalPreset = tempPreset;
  let finalStart = tempStartDate;
  let finalEnd = tempEndDate;
  let finalLabel = 'All Time';

  if (finalPreset === 'all' || (!finalStart && !finalEnd)) {
    finalPreset = 'all';
    finalStart = null;
    finalEnd = null;
    finalLabel = 'All Time';
  } else if (finalPreset !== 'custom') {
    const range = calculatePresetRange(finalPreset);
    finalStart = range.start;
    finalEnd = range.end;
    finalLabel = range.label;
  } else {
    // Custom range
    if (finalStart && !finalEnd) {
      finalEnd = new Date(finalStart.getFullYear(), finalStart.getMonth(), finalStart.getDate(), 23, 59, 59, 999);
    }
    if (finalStart && finalEnd) {
      finalStart.setHours(0, 0, 0, 0);
      finalEnd.setHours(23, 59, 59, 999);
      finalLabel = `${formatDateDisplay(finalStart)} – ${formatDateDisplay(finalEnd)}`;
    }
  }

  state.leadsDateFilter = {
    preset: finalPreset,
    startDate: finalStart ? finalStart.toISOString() : null,
    endDate: finalEnd ? finalEnd.toISOString() : null,
    label: finalLabel
  };

  state.leadsCurrentPage = 1;
  updateTriggerButtonDisplay();
  closeDateRangePopover();

  if (onApplyCallback) {
    onApplyCallback();
  }
}

/**
 * Update the trigger button text & active status on the Leads filter bar
 */
export function updateTriggerButtonDisplay() {
  const btn = document.getElementById('leadDateFilterBtn');
  const btnText = document.getElementById('dateFilterBtnText');
  const quickClear = document.getElementById('dateFilterClearQuickBtn');
  const filter = state.leadsDateFilter || { preset: 'all', label: 'All Time' };

  if (btnText) {
    btnText.textContent = filter.label || 'All Time';
  }

  const isFilterActive = filter.preset && filter.preset !== 'all' && (filter.startDate || filter.endDate);

  if (btn) {
    if (isFilterActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  if (quickClear) {
    quickClear.style.display = isFilterActive ? 'inline-flex' : 'none';
  }
}
