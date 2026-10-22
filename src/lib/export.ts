/**
 * export.ts
 * Copy-to-clipboard and CSV export utilities for winner history.
 */

import type { DrawSession, WinnerRecord } from '../types';

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

// ─── Plain text ──────────────────────────────────────────────────────────────

export function winnersToText(
  sessions: DrawSession[],
  winners: WinnerRecord[]
): string {
  const sorted = [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber);
  const lines: string[] = [];

  for (const session of sorted) {
    const sw = winners
      .filter((w) => w.sessionId === session.id)
      .sort((a, b) => a.orderInSession - b.orderInSession);
    if (sw.length === 0) continue;

    lines.push(`─────────────────────────`);
    lines.push(`${session.sessionNumber}회차 추첨`);
    lines.push(`경품: ${session.prizeName}`);
    lines.push(`추첨 일시: ${formatDateTime(session.drawTime)}`);
    lines.push('');
    sw.forEach((w) => {
      lines.push(`  당첨자: ${w.participantName} (보유 응모권 ${w.ticketCount}장)`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function winnersToCSV(
  _sessions: DrawSession[],
  winners: WinnerRecord[]
): string {
  const header = ['회차', '경품명', '당첨자', '보유 응모권 수', '추첨 일시'];
  const rows = [...winners]
    .sort((a, b) => a.sessionNumber - b.sessionNumber || a.orderInSession - b.orderInSession)
    .map((w) => [
      String(w.sessionNumber),
      w.prizeName,
      w.participantName,
      `${w.ticketCount}장`,
      formatDateTime(w.drawTime),
    ]);

  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(','));
  // BOM for Excel compatibility with Korean characters
  return '\uFEFF' + lines.join('\r\n');
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

// ─── CSV download ────────────────────────────────────────────────────────────

export function downloadCSV(csv: string, filename = '당첨자_목록.csv'): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
