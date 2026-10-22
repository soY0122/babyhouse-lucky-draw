import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { parseInput } from './lib/parser';
import { performDraw } from './lib/raffle';
import {
  clearHistory,
  clearInputData,
  clearPendingDraw,
  commitPendingDraw,
  getNextSessionNumber,
  loadHistory,
  loadInputData,
  loadSettings,
  saveInputData,
  savePendingDraw,
  saveSettings,
} from './lib/db';
import type {
  AppSettings,
  DrawSession,
  DrawState,
  ParseResult,
  WinnerRecord,
} from './types';
import ParticipantPanel from './components/ParticipantPanel';
import RaffleSettings from './components/RaffleSettings';
import SlotMachine from './components/SlotMachine';
import WinnerHistory from './components/WinnerHistory';
import ConfirmDialog from './components/ConfirmDialog';
import WinnerAnnouncementModal from './components/WinnerAnnouncementModal';

// ─── Default settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  prizeName: '',
  winnerCount: 1,
  excludePreviousWinners: true,
  muted: false,
  animationSpeed: 1,
};

const INITIAL_DRAW_STATE: DrawState = {
  phase: 'idle',
  pendingWinners: [],
  revealedCount: 0,
  currentSessionId: null,
  speed: 1,
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Hydration ─────────────────────────────────────────────────────────────
  const [hydrated, setHydrated] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // ── Participant data ───────────────────────────────────────────────────────
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [rawInput, setRawInput] = useState('');

  // ── Settings ───────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // ── Completed History (Visible to public) ──────────────────────────────────
  const [sessions, setSessions] = useState<DrawSession[]>([]);
  const [winners, setWinners] = useState<WinnerRecord[]>([]);

  // ── In-flight / Pending Draw ───────────────────────────────────────────────
  const [drawState, setDrawState] = useState<DrawState>(INITIAL_DRAW_STATE);
  const [currentPendingSession, setCurrentPendingSession] = useState<DrawSession | null>(null);
  const [announcementData, setAnnouncementData] = useState<{
    session: DrawSession;
    winners: WinnerRecord[];
  } | null>(null);
  const isCommittingRef = useRef(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [drawError, setDrawError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ─── Load from IndexedDB on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [inputData, savedSettings, history] = await Promise.all([
          loadInputData(),
          loadSettings(),
          loadHistory(),
        ]);

        if (inputData) {
          setRawInput(inputData.rawInput);
          setParseResult({
            participants: inputData.participants,
            totalTickets: inputData.totalTickets,
            invalidLines: [],
            rawInput: inputData.rawInput,
          });
        }

        const initialSpeed = savedSettings?.animationSpeed ?? 1;

        if (savedSettings) {
          setSettings(savedSettings);
        }

        setSessions(history.sessions);
        setWinners(history.winners);

        // Recovery: Check if there was an interrupted pending draw
        if (history.pending) {
          const pendingSession = history.pending.session;
          const pendingWinners = history.pending.winners;

          // If the session was already completed in history, just clean pending
          const alreadyInHistory = history.sessions.some((s) => s.id === pendingSession.id);
          if (alreadyInHistory) {
            await clearPendingDraw();
          } else {
            // Restore pending draw state safely and show announcement modal for user confirmation
            setCurrentPendingSession(pendingSession);
            setDrawState({
              phase: 'done',
              pendingWinners,
              revealedCount: pendingWinners.length,
              currentSessionId: pendingSession.id,
              speed: initialSpeed,
            });
            setAnnouncementData({
              session: pendingSession,
              winners: pendingWinners,
            });
          }
        }

        setHydrated(true);
      } catch (err) {
        console.error('IndexedDB load error:', err);
        setDbError(
          'IndexedDB를 불러오는 중 오류가 발생했습니다. 브라우저의 개인정보 보호 모드에서는 저장이 제한될 수 있습니다.'
        );
        setHydrated(true);
      }
    })();
  }, []);

  // ─── Persist settings ─────────────────────────────────────────────────────
  const persistSettings = useCallback(async (next: AppSettings) => {
    try {
      await saveSettings(next);
    } catch (err) {
      console.error('Settings save error:', err);
    }
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persistSettings(next);
        return next;
      });
      if (patch.animationSpeed !== undefined) {
        setDrawState((prev) => ({ ...prev, speed: patch.animationSpeed! }));
      }
    },
    [persistSettings]
  );

  // ─── Import participant data ───────────────────────────────────────────────
  const handleImport = useCallback(async (text: string) => {
    const result = parseInput(text);
    setRawInput(text);
    setParseResult(result);
    setSaveStatus('saving');
    try {
      await saveInputData({
        rawInput: text,
        participants: result.participants,
        totalTickets: result.totalTickets,
        savedAt: new Date().toISOString(),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    }
  }, []);

  const handleClearInput = useCallback(async () => {
    setRawInput('');
    setParseResult(null);
    try {
      await clearInputData();
    } catch (err) {
      console.error('Clear input error:', err);
    }
  }, []);

  // ─── Start draw ───────────────────────────────────────────────────────────
  const handleStartDraw = useCallback(async () => {
    if (!parseResult || drawState.phase !== 'idle') return;
    setDrawError(null);
    isCommittingRef.current = false;

    try {
      const sessionNumber = await getNextSessionNumber();
      const result = performDraw({
        prizeName: settings.prizeName,
        winnerCount: settings.winnerCount,
        sessionNumber,
        participants: parseResult.participants,
        previousWinners: winners, // Use only confirmed completed winners
        excludePreviousWinners: settings.excludePreviousWinners,
      });

      const session: DrawSession = {
        id: result.sessionId,
        sessionNumber,
        prizeName: settings.prizeName.trim(),
        drawTime: result.winners[0]?.drawTime ?? new Date().toISOString(),
        excludePreviousWinners: settings.excludePreviousWinners,
      };

      // Persist as pending BEFORE animation starts for crash safety
      await savePendingDraw(session, result.winners);

      setCurrentPendingSession(session);
      setDrawState({
        phase: 'spinning',
        pendingWinners: result.winners,
        revealedCount: 0,
        currentSessionId: result.sessionId,
        speed: settings.animationSpeed,
      });
    } catch (err) {
      setDrawError(err instanceof Error ? err.message : String(err));
    }
  }, [parseResult, drawState.phase, settings, winners]);

  // ─── Animation callbacks ──────────────────────────────────────────────────
  const handleRevealDone = useCallback(() => {
    const nextRevealed = drawState.revealedCount + 1;
    const allDone = nextRevealed >= drawState.pendingWinners.length;

    if (!allDone) {
      // Advance to next winner in this session
      setDrawState((prev) => ({
        ...prev,
        revealedCount: nextRevealed,
        phase: 'spinning',
      }));
    } else {
      // All winners in session have finished animating!
      setDrawState((prev) => ({
        ...prev,
        revealedCount: nextRevealed,
        phase: 'done',
      }));

      // Open the centered WinnerAnnouncementModal!
      // Do NOT commit or update visible history yet until user explicitly clicks "확인"
      if (currentPendingSession) {
        setAnnouncementData({
          session: currentPendingSession,
          winners: drawState.pendingWinners,
        });
      }
    }
  }, [drawState.revealedCount, drawState.pendingWinners, currentPendingSession]);

  const handleConfirmWinnerModal = useCallback(async () => {
    if (isCommittingRef.current || !announcementData) return;
    isCommittingRef.current = true;

    try {
      // Atomically commit to history store in IndexedDB
      await commitPendingDraw(announcementData.session, announcementData.winners);

      // Update public history state ONLY after user clicks "확인"
      setSessions((prev) => [...prev, announcementData.session]);
      setWinners((prev) => [...prev, ...announcementData.winners]);

      setAnnouncementData(null);
      setCurrentPendingSession(null);
    } catch (err) {
      console.error('Commit error:', err);
      setDrawError('당첨 기록을 저장하는 중 오류가 발생했습니다.');
    } finally {
      isCommittingRef.current = false;
    }
  }, [announcementData]);

  const handleResetDraw = useCallback(() => {
    setDrawState((prev) => ({
      ...INITIAL_DRAW_STATE,
      speed: prev.speed,
    }));
    setCurrentPendingSession(null);
    setAnnouncementData(null);
    setDrawError(null);
  }, []);

  // ─── History management ───────────────────────────────────────────────────
  const handleClearHistory = useCallback(async () => {
    try {
      await clearHistory();
      setSessions([]);
      setWinners([]);
      setCurrentPendingSession(null);
      setAnnouncementData(null);
      setDrawState((prev) => ({
        ...INITIAL_DRAW_STATE,
        speed: prev.speed,
      }));
    } catch (err) {
      console.error('Clear history error:', err);
    }
    setConfirmClear(false);
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const currentRevealIndex = drawState.revealedCount;
  const currentWinnerToReveal =
    drawState.pendingWinners[currentRevealIndex] ?? null;

  const allNames = parseResult?.participants.map((p) => p.displayName) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-header__icon" aria-hidden>🎀</span>
          <div>
            <h1 className="app-header__title">창원베이비하우스 행운 추첨</h1>
            <p className="app-header__sub">CHANGWON BABYHOUSE LUCKY DRAW</p>
          </div>
          <span className="app-header__icon app-header__icon--right" aria-hidden>⭐</span>
        </div>
        {dbError && (
          <div className="app-banner app-banner--warn" role="alert">
            ⚠️ {dbError}
          </div>
        )}
        <div className="app-banner app-banner--info">
          💡 데이터는 이 브라우저와 기기에만 안전하게 저장됩니다. 다른 컴퓨터에서는 공유되지 않습니다.
        </div>
      </header>

      {/* ── Main 3-column layout ── */}
      <main className="app-main">
        {/* Left: participant input */}
        <aside className="app-col app-col--left">
          <ParticipantPanel
            rawInput={rawInput}
            parseResult={parseResult}
            saveStatus={saveStatus}
            onImport={handleImport}
            onClear={handleClearInput}
          />
        </aside>

        {/* Center: settings + slot machine */}
        <section className="app-col app-col--center">
          <RaffleSettings
            settings={settings}
            parseResult={parseResult}
            winners={winners}
            drawPhase={drawState.phase}
            onUpdate={updateSettings}
            onStartDraw={handleStartDraw}
            onResetDraw={handleResetDraw}
            drawError={drawError}
            isModalOpen={Boolean(announcementData)}
          />
          <SlotMachine
            allNames={allNames}
            drawState={drawState}
            currentWinner={currentWinnerToReveal}
            muted={settings.muted}
            onRevealDone={handleRevealDone}
            onToggleMute={() => updateSettings({ muted: !settings.muted })}
            onSpeedChange={(speed) => updateSettings({ animationSpeed: speed })}
          />
        </section>

        {/* Right: winner history */}
        <aside className="app-col app-col--right">
          <WinnerHistory
            sessions={sessions}
            winners={winners}
            onClearHistory={() => setConfirmClear(true)}
          />
        </aside>
      </main>

      {/* ── Centered Winner Announcement Modal ── */}
      {announcementData && (
        <WinnerAnnouncementModal
          session={announcementData.session}
          winners={announcementData.winners}
          onConfirm={handleConfirmWinnerModal}
        />
      )}

      {/* ── Confirm clear history dialog ── */}
      {confirmClear && (
        <ConfirmDialog
          title="당첨 기록 삭제"
          message="모든 당첨 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          cancelLabel="취소"
          danger
          onConfirm={handleClearHistory}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
