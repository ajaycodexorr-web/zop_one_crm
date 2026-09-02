/**
 * Export Leads to Excel (XLSX / XLS) Utility & Modal Handlers
 */

import { state } from '../state/app-state.js';
import { elements } from '../dom/elements.js';
import { formatFullDateTime, parseDate, escapeHtml, formatDisplayPhone, getLeadNotesList } from './formatters.js';
import { showToast } from './notifications.js';
import { checkUserDisabledAndEnforceLogout } from '../services/auth-service.js';
import { hasPermission } from '../services/user-service.js';

export function setupExportHandlers() {
  if (elements.exportExcelBtn) {
    elements.exportExcelBtn.addEventListener('click', openExportModal);
  }
  if (elements.closeExportModalBtn) {
    elements.closeExportModalBtn.addEventListener('click', closeExportModal);
  }
  if (elements.cancelExportBtn) {
    elements.cancelExportBtn.addEventListener('click', closeExportModal);
  }
  if (elements.confirmDownloadExcelBtn) {
    elements.confirmDownloadExcelBtn.addEventListener('click', handleConfirmExport);
  }

  // Radio button toggle for date range fields
  const scopeRadios = document.querySelectorAll('input[name="exportScope"]');
  scopeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (elements.exportDateRangeFields) {
        elements.exportDateRangeFields.style.display = e.target.value === 'duration' ? 'block' : 'none';
      }
    });
  });
}

export function updateExportBtnDisabledState() {
  const isDisabled = state.currentUser && state.currentUser.status === 'disabled';
  const canExport = hasPermission('canExportExcel');
  const isBlocked = isDisabled || !canExport;

  if (elements.exportExcelBtn) {
    elements.exportExcelBtn.disabled = isBlocked;
    elements.exportExcelBtn.style.opacity = isBlocked ? '0.5' : '1';
    elements.exportExcelBtn.style.cursor = isBlocked ? 'not-allowed' : 'pointer';
    if (isDisabled) {
      elements.exportExcelBtn.title = "Your account is disabled. Export restricted.";
    } else if (!canExport) {
      elements.exportExcelBtn.title = "Export permission has been restricted for your account.";
    } else {
      elements.exportExcelBtn.title = "Export leads to Excel";
    }
  }
}

export function openExportModal() {
  if (checkUserDisabledAndEnforceLogout()) return;

  if (!hasPermission('canExportExcel')) {
    showToast("You do not have permission to export leads to Excel.", "warning");
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const startStr = lastMonth.toISOString().split('T')[0];

  if (elements.exportStartDate && !elements.exportStartDate.value) elements.exportStartDate.value = startStr;
  if (elements.exportEndDate && !elements.exportEndDate.value) elements.exportEndDate.value = todayStr;

  if (elements.exportModal) elements.exportModal.style.display = 'flex';
}

export function closeExportModal() {
  if (elements.exportModal) elements.exportModal.style.display = 'none';
}

export function handleConfirmExport() {
  const scopeRadio = document.querySelector('input[name="exportScope"]:checked');
  const scope = scopeRadio ? scopeRadio.value : 'all';
  const selectedStatus = elements.exportStatusSelect ? elements.exportStatusSelect.value : 'all';

  let filteredLeads = [...state.leads];

  // 1. Filter by Status Choice
  if (selectedStatus === 'all') {
    filteredLeads = filteredLeads.filter(l => (l.status || '').toLowerCase() !== 'deleted');
  } else if (selectedStatus !== 'all_with_deleted') {
    filteredLeads = filteredLeads.filter(l => (l.status || '').toLowerCase() === selectedStatus);
  }

  // 2. Filter by Date Duration if selected
  if (scope === 'duration') {
    const startVal = elements.exportStartDate ? elements.exportStartDate.value : '';
    const endVal = elements.exportEndDate ? elements.exportEndDate.value : '';

    if (!startVal || !endVal) {
      showToast("Please select both Start Date and End Date", "warning");
      return;
    }

    const startDate = new Date(startVal);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endVal);
    endDate.setHours(23, 59, 59, 999);

    filteredLeads = filteredLeads.filter(lead => {
      const leadDate = parseDate(lead.createdAt || lead.lastMessageAt);
      if (!leadDate) return false;
      return leadDate >= startDate && leadDate <= endDate;
    });
  }

  if (filteredLeads.length === 0) {
    showToast("No leads match the selected date or status criteria", "warning");
    return;
  }

  exportLeadsToExcel(filteredLeads);
  closeExportModal();
}

export async function exportLeadsToExcel(leadsToExport) {
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `whatsapp_leads_export_${dateStr}.xlsx`;

  // Use ExcelJS library if loaded for native XLSX with blue header styling
  if (typeof ExcelJS !== 'undefined') {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('WhatsApp Leads');

      // Define columns and widths matching UI
      worksheet.columns = [
        { header: 'Name', key: 'name', width: 22 },
        { header: 'Phone number', key: 'phone', width: 20 },
        { header: 'User Query', key: 'query', width: 50 },
        { header: 'Source', key: 'source', width: 18 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Notes', key: 'notes', width: 35 },
        { header: 'Created Date', key: 'created', width: 26 }
      ];

      // Add rows
      leadsToExport.forEach(lead => {
        const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
        const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
        const isMetaAd = Boolean(lead.referral || (lead.source && (lead.source.toLowerCase().includes('meta') || lead.source.toLowerCase().includes('ad'))));
        const source = isMetaAd ? 'Meta Ads' : (lead.source || lead.platform || 'Direct WhatsApp');
        const notesList = getLeadNotesList(lead);
        const leadNotesStr = notesList.map(n => `[${n.authorName || 'Agent'} - ${formatFullDateTime(n.createdAt)}]: ${n.text}`).join('\n') || (typeof lead.notes === 'string' ? lead.notes : '');

        const statusRaw = (lead.status || 'new').toLowerCase();
        const statusMap = {
          'new': 'New',
          'contacted': 'Contacted',
          'no_answer': 'No Answer',
          'follow_up': 'Follow Up',
          'converted': 'Converted',
          'lost': 'Lost',
          'deleted': 'Deleted'
        };
        const status = statusMap[statusRaw] || statusRaw.toUpperCase();
        const createdDate = formatFullDateTime(lead.createdAt || lead.lastMessageAt);

        worksheet.addRow({
          name: displayName,
          phone: phone,
          query: userFirstQuery,
          source: source,
          status: status,
          notes: leadNotesStr,
          created: createdDate
        });
      });

      // Style Header Row (Row 1): Royal Blue background (#1D4ED8) with Bold White Text (#FFFFFF)
      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = {
          name: 'Segoe UI',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1D4ED8' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
      });

      // Style Data Rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        row.height = 24;
        const isEven = rowNumber % 2 === 0;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = {
            name: 'Segoe UI',
            size: 10,
            color: { argb: 'FF0F172A' }
          };

          if (isEven) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 6) {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 3 || colNumber === 6 };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }

          if (colNumber === 1) {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
          }

          if (colNumber === 2) {
            cell.numFmt = '@';
          }
        });
      });

      // Generate Buffer and Trigger Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `leads_export_${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      return;
    } catch (err) {
      console.warn("ExcelJS Export failed, using rich HTML table fallback:", err);
    }
  }

  // Fallback HTML XML format
  const headers = ["Name", "Phone number", "User Query", "Source", "Status", "Notes", "Created Date"];
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
<style>
  table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', Arial, sans-serif; }
  th { background-color: #1d4ed8 !important; color: #ffffff !important; font-weight: bold; font-size: 13px; padding: 12px 16px; border: 1px solid #1e40af; text-align: center; vertical-align: middle; height: 36px; }
  td { padding: 10px 14px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a; vertical-align: middle; }
  tr:nth-child(even) { background-color: #f8fafc; }
</style>
</head>
<body>
<table>
  <thead>
    <tr style="background-color: #1d4ed8; color: #ffffff;">`;

  headers.forEach(h => {
    html += `<th style="background-color: #1d4ed8; color: #ffffff; font-weight: bold; font-size: 13px; padding: 12px 16px; border: 1px solid #1e40af; text-align: center; vertical-align: middle;">${escapeHtml(h)}</th>`;
  });

  html += `</tr></thead><tbody>`;

  leadsToExport.forEach(lead => {
    const rawDisplay = lead.name && lead.name.trim() ? lead.name.trim() : (lead.phone || lead.id);
    const displayName = (/^\+?\d[\d\s\-()]+$/.test(rawDisplay)) ? formatDisplayPhone(rawDisplay) : rawDisplay;
    const phone = formatDisplayPhone(lead.phone || lead.id);
    const isMetaAd = Boolean(lead.referral || (lead.source && (lead.source.toLowerCase().includes('meta') || lead.source.toLowerCase().includes('ad'))));
    const source = isMetaAd ? 'Meta Ads' : (lead.source || lead.platform || 'Direct WhatsApp');
    const statusRaw = (lead.status || 'new').toLowerCase();
    const statusMap = { 'new': 'New', 'contacted': 'Contacted', 'no_answer': 'No Answer', 'follow_up': 'Follow Up', 'converted': 'Converted', 'lost': 'Lost', 'deleted': 'Deleted' };
    const status = statusMap[statusRaw] || statusRaw.toUpperCase();
    const notesList = getLeadNotesList(lead);
    const leadNotesStr = notesList.map(n => `[${n.authorName || 'Agent'} - ${formatFullDateTime(n.createdAt)}]: ${n.text}`).join('<br/>') || (typeof lead.notes === 'string' ? lead.notes : '');
    const createdDate = formatFullDateTime(lead.createdAt || lead.lastMessageAt);

    html += `<tr>
      <td style="font-weight: 600; text-align: left;">${escapeHtml(displayName)}</td>
      <td style="mso-number-format:'\\@'; text-align: left;">${escapeHtml(phone)}</td>
      <td style="text-align: left;">${escapeHtml(userFirstQuery)}</td>
      <td style="text-align: center;"><span style="color: #15803d; font-weight: 600;">${escapeHtml(source)}</span></td>
      <td style="text-align: center;"><span style="font-weight: 600;">${escapeHtml(status)}</span></td>
      <td style="text-align: left;">${leadNotesStr}</td>
      <td style="text-align: center;">${escapeHtml(createdDate)}</td>
    </tr>`;
  });

  html += `</tbody></table></body></html>`;

  const blob = new Blob(["\uFEFF" + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `whatsapp_leads_export_${dateStr}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Exported ${leadsToExport.length} leads to Excel!`, "info");
}

export function getUserFirstQuery(lead) {
  if (!lead) return '-';

  if (lead._firstUserMsg && typeof lead._firstUserMsg === 'string' && lead._firstUserMsg.trim()) {
    return lead._firstUserMsg.trim();
  }

  if (lead.firstUserMessage && typeof lead.firstUserMessage === 'string' && lead.firstUserMessage.trim()) {
    return lead.firstUserMessage.trim();
  }
  if (lead.userQuery && typeof lead.userQuery === 'string' && lead.userQuery.trim()) {
    return lead.userQuery.trim();
  }
  if (lead.query && typeof lead.query === 'string' && lead.query.trim()) {
    return lead.query.trim();
  }

  if (Array.isArray(lead.messages) && lead.messages.length > 0) {
    const firstIncoming = lead.messages.find(m => m.direction === 'incoming' || m.fromUser === true || m.sender === 'user');
    if (firstIncoming) {
      const text = firstIncoming.text || firstIncoming.caption || firstIncoming.message || firstIncoming.body;
      if (text && typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }

  // If CRM-created lead without incoming customer messages, show "-"
  if ((lead.platform || lead.source || '').toUpperCase() === 'CRM') {
    return '-';
  }

  if (lead.firstMessage && typeof lead.firstMessage === 'string' && lead.firstMessage.trim()) {
    return lead.firstMessage.trim();
  }
  if (lead.lastMessage && typeof lead.lastMessage === 'string' && lead.lastMessage.trim() && lead.lastMessage !== 'Lead created manually') {
    return lead.lastMessage.trim();
  }

  return '-';
}
