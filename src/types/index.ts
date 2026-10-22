// ─── Participant ────────────────────────────────────────────────────────────

/** A single participant parsed from one input line. */
export interface Participant {
  /** Stable identity key: trimmed, lower-cased display name. */
  id: string;
  /** Exact original display name as entered (before the final *qty suffix). */
  displayName: string;
  /** Number of raffle tickets this participant holds initially. */
  tickets: number;
  /** 1-based line number in the original pasted text. */
  lineNumber: number;
}

// ─── Parse result ────────────────────────────────────────────────────────────

export interface InvalidLine {
  lineNumber: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  participants: Participant[];
  invalidLines: InvalidLine[];
  totalTickets: number;
  /** The original raw text that produced this result. */
  rawInput: string;
}

// ─── Draw / Raffle ──────────────────────────────────────────────────────────

export interface DrawSession {
  /** UUID */
  id: string;
  sessionNumber: number;
  prizeName: string;
  /** ISO 8601 local timestamp */
  drawTime: string;
  excludePreviousWinners: boolean;
}

export interface WinnerRecord {
  /** UUID */
  id: string;
  sessionId: string;
  sessionNumber: number;
  /** Participant stable ID (normalized name) */
  participantId: string;
  /** Display name at time of draw */
  participantName: string;
  prizeName: string;
  /** ISO 8601 local timestamp */
  drawTime: string;
  /** 1-based index within the session */
  orderInSession: number;
  /** Number of eligible tickets held immediately before this winning selection */
  ticketCount: number;
  /** Original submitted ticket count */
  originalTicketCount: number;
}

// ─── Animation state ────────────────────────────────────────────────────────

export type DrawPhase =
  | 'idle'        // No draw in progress
  | 'spinning'    // Reel is spinning
  | 'revealing'   // Winner is being revealed (post-spin celebration)
  | 'done';       // All winners for current session revealed

export type AnimationSpeed = 1 | 2 | 3;

export interface DrawState {
  phase: DrawPhase;
  /** Finalized winner list determined BEFORE animation. */
  pendingWinners: WinnerRecord[];
  /** How many of pendingWinners have been shown. */
  revealedCount: number;
  currentSessionId: string | null;
  speed: AnimationSpeed;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface AppSettings {
  prizeName: string;
  winnerCount: number;
  excludePreviousWinners: boolean;
  muted: boolean;
  animationSpeed: AnimationSpeed;
}

// ─── Persisted app state (stored in IndexedDB) ──────────────────────────────

export interface PersistedInputData {
  rawInput: string;
  participants: Participant[];
  totalTickets: number;
  savedAt: string;
}

export interface PendingDrawData {
  id: 'current';
  session: DrawSession;
  winners: WinnerRecord[];
  createdAt: string;
}

// ─── Raffle engine ──────────────────────────────────────────────────────────

export interface EligibleEntry {
  participant: Participant;
  /** Remaining tickets this person can contribute in the current draw session. */
  remainingTickets: number;
}

export interface DrawContext {
  eligibleEntries: EligibleEntry[];
  excludePreviousWinners: boolean;
  /** Set of participantIds who have already won in THIS session. */
  winnersThisSession: Set<string>;
}
