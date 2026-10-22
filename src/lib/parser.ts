/**
 * parser.ts
 * Parses raw multiline participant input into structured Participant records.
 *
 * Format per line:  <displayName>*<positiveInteger>
 * If the *quantity suffix is absent, defaults to 1 ticket.
 *
 * Memory note: we never create a separate string per ticket; only one
 * Participant object is created per unique input line.
 */

import type { InvalidLine, ParseResult, Participant } from '../types';

// ─── Normalisation ──────────────────────────────────────────────────────────

/** Produces a stable identity key from a display name. */
export function normalizeId(displayName: string): string {
  return displayName.trim().toLowerCase();
}

// ─── Line parser ────────────────────────────────────────────────────────────

interface LineOk {
  ok: true;
  displayName: string;
  tickets: number;
}

interface LineErr {
  ok: false;
  reason: string;
}

function parseSingleLine(raw: string): LineOk | LineErr {
  const line = raw.trim();
  if (line === '') return { ok: false, reason: '빈 줄' }; // caller skips blanks

  const lastStar = line.lastIndexOf('*');

  if (lastStar === -1) {
    // No asterisk → entire line is name, quantity defaults to 1
    return { ok: true, displayName: line, tickets: 1 };
  }

  const namePart = line.substring(0, lastStar);
  const qtyPart = line.substring(lastStar + 1);

  // If what follows the last * looks like digits, interpret as quantity
  if (/^\d+$/.test(qtyPart)) {
    const qty = parseInt(qtyPart, 10);
    if (qty === 0) {
      return { ok: false, reason: '수량은 0이 될 수 없습니다 (양의 정수를 입력하세요)' };
    }
    if (namePart.trim() === '') {
      return { ok: false, reason: '이름이 비어 있습니다' };
    }
    return { ok: true, displayName: namePart.trim(), tickets: qty };
  }

  // The part after last * is not purely digits → treat whole line as name
  return { ok: true, displayName: line, tickets: 1 };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parses the entire pasted text and returns valid participants and error lines.
 *
 * Deduplication: if the same normalized name appears multiple times, their
 * ticket counts are summed (later lines add to earlier ones).
 */
export function parseInput(rawInput: string): ParseResult {
  const lines = rawInput.split('\n');
  const participantMap = new Map<string, Participant>();
  const invalidLines: InvalidLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];

    // Skip genuinely blank lines silently
    if (raw.trim() === '') continue;

    const result = parseSingleLine(raw);

    if (!result.ok) {
      // Zero-quantity and empty-name errors are reported; blank lines are skipped
      if (result.reason !== '빈 줄') {
        invalidLines.push({ lineNumber, text: raw, reason: result.reason });
      }
      continue;
    }

    const id = normalizeId(result.displayName);
    const existing = participantMap.get(id);

    if (existing) {
      // Merge: sum ticket counts for duplicated names
      existing.tickets += result.tickets;
    } else {
      participantMap.set(id, {
        id,
        displayName: result.displayName,
        tickets: result.tickets,
        lineNumber,
      });
    }
  }

  const participants = Array.from(participantMap.values());
  const totalTickets = participants.reduce((sum, p) => sum + p.tickets, 0);

  return { participants, invalidLines, totalTickets, rawInput };
}
