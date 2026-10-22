/**
 * raffle.ts
 * Cryptographically-secure weighted random raffle engine.
 * All results are mathematically determined BEFORE animation starts.
 *
 * Fairness Guarantees:
 *  - Selection is strictly proportional to each participant's eligible ticket count.
 *  - Integer sampling via crypto.getRandomValues() using rejection sampling to eliminate modulo bias.
 *  - Supports deterministic testing via an injectable random generator.
 *  - "Exclude previous winners" completely excludes anyone who won in prior sessions,
 *    and excludes any winner in the current session from winning again in that session.
 *  - When exclusion is disabled, winning consumes 1 physical ticket. A participant can only
 *    win as many times as their total ticket count. A 1-ticket holder can NEVER win twice.
 *  - Participants with 0 eligible tickets can never win.
 *  - Ticket count immediately before winning is immutably captured on each winner record.
 */

import type {
  DrawContext,
  EligibleEntry,
  Participant,
  WinnerRecord,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

export function toISOLocal(date: Date): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// ─── Cryptographic Unbiased Random Integer Sampling ──────────────────────────

/**
 * Returns a uniform integer in [0, maxExclusive - 1] without modulo bias.
 * Uses rejection sampling over the 32-bit integer range.
 */
export function getCryptoRandomInt(
  maxExclusive: number,
  customRandom?: (max: number) => number
): number {
  if (maxExclusive <= 0) {
    throw new Error('랜덤 범위는 1 이상이어야 합니다.');
  }
  if (maxExclusive === 1) {
    return 0;
  }

  // Injectable PRNG for deterministic testing
  if (customRandom) {
    return customRandom(maxExclusive);
  }

  // Use Web Crypto API when available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const range = 0x100000000; // 2^32
    const limit = range - (range % maxExclusive);
    const buf = new Uint32Array(1);

    let val: number;
    do {
      crypto.getRandomValues(buf);
      val = buf[0];
    } while (val >= limit);

    return val % maxExclusive;
  }

  // Safe fallback if crypto is unavailable (e.g., unusual non-browser environments)
  return Math.floor(Math.random() * maxExclusive);
}

// ─── Weighted selection using cumulative prefix sums & binary search ────────

/**
 * Selects one entry using binary search over prefix sums.
 * O(log N) time complexity — optimal for up to 100,000+ entries.
 * Returns the index into `activeEntries`.
 */
export function weightedSelect(
  activeEntries: EligibleEntry[],
  customRandom?: (max: number) => number
): number {
  const n = activeEntries.length;
  if (n === 0) throw new Error('추첨 가능한 참가자가 없습니다.');

  // Build prefix sums
  const prefixSums = new Array<number>(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += activeEntries[i].remainingTickets;
    prefixSums[i] = total;
  }

  if (total <= 0) {
    throw new Error('추첨 가능한 유효 응모권이 없습니다.');
  }

  // Sample uniform ticket index in [0, total - 1]
  const ticketIndex = getCryptoRandomInt(total, customRandom);

  // Binary search for first index i where prefixSums[i] > ticketIndex
  let low = 0;
  let high = n - 1;
  let resultIndex = n - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (prefixSums[mid] > ticketIndex) {
      resultIndex = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return resultIndex;
}

// ─── Build draw context ─────────────────────────────────────────────────────

/**
 * Creates the DrawContext for a new draw session.
 * Correctly accounts for tickets already won in previous sessions.
 *
 * @param participants       Full parsed participant list.
 * @param previousWinners    List of all historical WinnerRecords.
 * @param excludePrev        Whether "Exclude previous winners" is enabled.
 */
export function buildDrawContext(
  participants: Participant[],
  previousWinners: WinnerRecord[],
  excludePrev: boolean
): DrawContext {
  // Count how many times each participant has won across all previous sessions
  const winCounts = new Map<string, number>();
  for (const w of previousWinners) {
    winCounts.set(w.participantId, (winCounts.get(w.participantId) || 0) + 1);
  }

  const eligibleEntries: EligibleEntry[] = [];

  for (const p of participants) {
    const wins = winCounts.get(p.id) || 0;

    if (excludePrev) {
      // If exclusion is enabled, prior winners have 0 eligible tickets
      if (wins > 0) continue;
      if (p.tickets > 0) {
        eligibleEntries.push({ participant: p, remainingTickets: p.tickets });
      }
    } else {
      // If exclusion is disabled, remaining tickets = original - previous wins
      const remaining = Math.max(0, p.tickets - wins);
      if (remaining > 0) {
        eligibleEntries.push({ participant: p, remainingTickets: remaining });
      }
    }
  }

  return {
    eligibleEntries,
    excludePreviousWinners: excludePrev,
    winnersThisSession: new Set(),
  };
}

// ─── Eligibility checks ─────────────────────────────────────────────────────

/** Returns the number of eligible unique participants remaining in the context. */
export function eligibleParticipantCount(ctx: DrawContext): number {
  return ctx.eligibleEntries.filter((e) => e.remainingTickets > 0).length;
}

/** Returns the total eligible ticket count remaining in the context. */
export function eligibleTicketCount(ctx: DrawContext): number {
  return ctx.eligibleEntries.reduce((s, e) => s + e.remainingTickets, 0);
}

// ─── Draw one winner ────────────────────────────────────────────────────────

export interface DrawnWinnerInfo {
  entry: EligibleEntry;
  ticketCountBeforeWin: number;
}

/**
 * Selects one winner from the context, capturing ticket count and updating remaining tickets.
 */
function drawOne(
  ctx: DrawContext,
  customRandom?: (max: number) => number
): DrawnWinnerInfo | null {
  const active = ctx.eligibleEntries.filter((e) => e.remainingTickets > 0);
  if (active.length === 0) return null;

  const idx = weightedSelect(active, customRandom);
  const winner = active[idx];

  // Capture ticket count immediately before this winning selection
  const ticketCountBeforeWin = winner.remainingTickets;

  if (ctx.excludePreviousWinners) {
    // In this mode, winner cannot win again in this session
    winner.remainingTickets = 0;
    ctx.winnersThisSession.add(winner.participant.id);
  } else {
    // Only 1 ticket consumed; remaining tickets remain eligible
    winner.remainingTickets -= 1;
  }

  return { entry: winner, ticketCountBeforeWin };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export interface DrawSessionResult {
  winners: WinnerRecord[];
  sessionId: string;
}

/**
 * Performs a complete draw session, selecting `winnerCount` winners.
 * All results are determined and finalized here BEFORE any animation.
 *
 * @throws if there are not enough eligible participants or tickets.
 */
export function performDraw(params: {
  prizeName: string;
  winnerCount: number;
  sessionNumber: number;
  participants: Participant[];
  previousWinners: WinnerRecord[];
  excludePreviousWinners: boolean;
  customRandom?: (max: number) => number;
}): DrawSessionResult {
  const {
    prizeName,
    winnerCount,
    sessionNumber,
    participants,
    previousWinners,
    excludePreviousWinners,
    customRandom,
  } = params;

  if (!prizeName || prizeName.trim() === '') {
    throw new Error('경품 이름을 입력해 주세요.');
  }

  if (isNaN(winnerCount) || winnerCount < 1 || !Number.isInteger(winnerCount)) {
    throw new Error('당첨자 수는 1 이상의 정수여야 합니다.');
  }

  const ctx = buildDrawContext(participants, previousWinners, excludePreviousWinners);

  // Pre-draw validation
  if (excludePreviousWinners) {
    const eligibleUnique = eligibleParticipantCount(ctx);
    if (eligibleUnique < winnerCount) {
      throw new Error(
        `선택 가능한 참가자 수(${eligibleUnique}명)가 당첨자 수(${winnerCount}명)보다 적습니다.`
      );
    }
  } else {
    const totalTickets = eligibleTicketCount(ctx);
    if (totalTickets < winnerCount) {
      throw new Error(
        `응모권 수(${totalTickets}장)가 당첨자 수(${winnerCount}명)보다 적습니다.`
      );
    }
  }

  const sessionId = generateId();
  const drawTime = toISOLocal(new Date());
  const winners: WinnerRecord[] = [];

  for (let i = 0; i < winnerCount; i++) {
    const result = drawOne(ctx, customRandom);
    if (!result) {
      throw new Error(`추첨 중 오류: ${i + 1}번째 당첨자를 선택할 수 없습니다.`);
    }

    winners.push({
      id: generateId(),
      sessionId,
      sessionNumber,
      participantId: result.entry.participant.id,
      participantName: result.entry.participant.displayName,
      prizeName: prizeName.trim(),
      drawTime,
      orderInSession: i + 1,
      ticketCount: result.ticketCountBeforeWin,
      originalTicketCount: result.entry.participant.tickets,
    });
  }

  return { winners, sessionId };
}
