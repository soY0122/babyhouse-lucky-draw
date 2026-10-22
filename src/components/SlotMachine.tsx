import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimationSpeed, DrawState, WinnerRecord } from '../types';
import { playCelebration, playStop, playTick } from '../lib/sound';
import './SlotMachine.css';

interface Props {
  allNames: string[];
  drawState: DrawState;
  currentWinner: WinnerRecord | null;
  muted: boolean;
  onRevealDone: () => void;
  onToggleMute: () => void;
  onSpeedChange: (speed: AnimationSpeed) => void;
}

type AnimPhase = 'idle' | 'spinning' | 'stopped' | 'celebrating';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  angle: number;
  angularVelocity: number;
  shape: 'circle' | 'star' | 'rect';
}

const CONFETTI_COLORS = [
  '#FFB3CA', '#AEE6FF', '#C8F5E6', '#FFF3B0',
  '#FFCDD2', '#B3E5FC', '#A5D6A7', '#FFE082',
];

function makeParticle(id: number): Particle {
  return {
    id,
    x: Math.random() * 100,
    y: -10,
    vx: (Math.random() - 0.5) * 2.5,
    vy: 1.5 + Math.random() * 2.5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 7 + Math.random() * 9,
    angle: Math.random() * 360,
    angularVelocity: (Math.random() - 0.5) * 12,
    shape: (['circle', 'star', 'rect'] as const)[Math.floor(Math.random() * 3)],
  };
}

export default function SlotMachine({
  allNames,
  drawState,
  currentWinner,
  muted,
  onRevealDone,
  onToggleMute,
  onSpeedChange,
}: Props) {
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const [centerDisplayName, setCenterDisplayName] = useState<string>('행운의 주인공');
  const [topDisplayName, setTopDisplayName] = useState<string>('창원베이비하우스');
  const [bottomDisplayName, setBottomDisplayName] = useState<string>('행운 추첨');
  const [particles, setParticles] = useState<Particle[]>([]);

  const particleIdRef = useRef(0);
  const particleRafRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      if (particleRafRef.current) cancelAnimationFrame(particleRafRef.current);
    };
  }, [clearAllTimers]);

  // Confetti animation
  const spawnConfetti = useCallback(() => {
    const initial = Array.from({ length: 65 }, (_, i) =>
      makeParticle(particleIdRef.current + i)
    );
    particleIdRef.current += 65;
    setParticles(initial);

    let frame = 0;
    const animate = () => {
      frame++;
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.04,
            angle: p.angle + p.angularVelocity,
          }))
          .filter((p) => p.y < 125)
      );
      if (frame < 120) {
        particleRafRef.current = requestAnimationFrame(animate);
      } else {
        setParticles([]);
      }
    };
    particleRafRef.current = requestAnimationFrame(animate);
  }, []);

  // ─── Multi-stage suspenseful animation ────────────────────────────────────
  useEffect(() => {
    if (drawState.phase === 'spinning' && currentWinner) {
      clearAllTimers();
      setAnimPhase('spinning');

      const speedFactor = drawState.speed; // 1, 2, or 3
      const winnerName = currentWinner.participantName;

      // Pool of decoy names (excluding winner)
      const decoys = allNames.filter((n) => n !== winnerName);
      const getDecoy = () =>
        decoys.length > 0
          ? decoys[Math.floor(Math.random() * decoys.length)]
          : '창원베이비하우스';

      // Pick final 3 decoys for the progressive crawl
      const crawl3 = getDecoy();
      const crawl2 = getDecoy();
      const crawl1 = getDecoy();

      // Stage 1: Fast spin (rapid random cycling)
      const fastIntervalMs = Math.max(30, Math.round(50 / speedFactor));
      const fastDuration = Math.round(1800 / speedFactor);

      const fastSpinInterval = setInterval(() => {
        setTopDisplayName(getDecoy());
        setCenterDisplayName(getDecoy());
        setBottomDisplayName(getDecoy());
        if (!muted) playTick();
      }, fastIntervalMs);
      intervalsRef.current.push(fastSpinInterval);

      // Transition to Stage 2: Initial Deceleration
      const t1 = setTimeout(() => {
        clearInterval(fastSpinInterval);

        // Slow step 1
        setTopDisplayName(getDecoy());
        setCenterDisplayName(crawl3);
        setBottomDisplayName(getDecoy());
        if (!muted) playTick();

        // Slow step 2
        const t2 = setTimeout(() => {
          setTopDisplayName(crawl3);
          setCenterDisplayName(crawl2);
          setBottomDisplayName(getDecoy());
          if (!muted) playTick();

          // Slow step 3 (suspense crawl)
          const t3 = setTimeout(() => {
            setTopDisplayName(crawl2);
            setCenterDisplayName(crawl1);
            setBottomDisplayName(winnerName);
            if (!muted) playTick();

            // Final Step 4: Stop precisely on winner in the center reel!
            const t4 = setTimeout(() => {
              setTopDisplayName(crawl1);
              setCenterDisplayName(winnerName);
              setBottomDisplayName(getDecoy());

              setAnimPhase('stopped');
              if (!muted) playStop();

              // Step 5: Sound & Confetti celebration
              const t5 = setTimeout(() => {
                setAnimPhase('celebrating');
                if (!muted) playCelebration();
                spawnConfetti();

                // If this is the last winner, transition quickly to trigger the centered modal dialog.
                // If there are subsequent winners in this session, pause briefly so the viewer can note this winner.
                const isLastWinner =
                  drawState.revealedCount + 1 >= drawState.pendingWinners.length;
                const pauseDuration = isLastWinner
                  ? Math.round(600 / speedFactor)
                  : Math.round(1400 / speedFactor);

                const t6 = setTimeout(() => {
                  onRevealDone();
                }, pauseDuration);
                timersRef.current.push(t6);
              }, Math.round(350 / speedFactor));
              timersRef.current.push(t5);
            }, Math.round(750 / speedFactor));
            timersRef.current.push(t4);
          }, Math.round(500 / speedFactor));
          timersRef.current.push(t3);
        }, Math.round(300 / speedFactor));
        timersRef.current.push(t2);
      }, fastDuration);
      timersRef.current.push(t1);
    }

    if (drawState.phase === 'idle') {
      clearAllTimers();
      setAnimPhase('idle');
      setParticles([]);
      if (!currentWinner) {
        setCenterDisplayName('행운의 주인공');
        setTopDisplayName('창원베이비하우스');
        setBottomDisplayName('행운 추첨');
      }
    }

    if (drawState.phase === 'done') {
      clearAllTimers();
      setAnimPhase('idle');
    }
  }, [
    drawState.phase,
    drawState.revealedCount,
    drawState.pendingWinners.length,
    drawState.speed,
    currentWinner,
    allNames,
    muted,
    clearAllTimers,
    spawnConfetti,
    onRevealDone,
  ]);

  const isDrawing = drawState.phase === 'spinning' || animPhase === 'spinning';

  return (
    <div className="sm">
      {/* ── Top Bar: Speed controls & Sound mute ── */}
      <div className="sm__controls">
        <div className="sm__speed-group" role="group" aria-label="추첨 속도 조절">
          <span className="sm__speed-label">속도:</span>
          {([1, 2, 3] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              className={`btn sm__speed-btn ${drawState.speed === spd ? 'sm__speed-btn--active' : ''}`}
              onClick={() => onSpeedChange(spd)}
              disabled={isDrawing}
              title={`${spd}배속`}
            >
              {spd}배속
            </button>
          ))}
        </div>

        <button
          className="sm__mute-btn"
          onClick={onToggleMute}
          title={muted ? '소리 켜기' : '소리 끄기'}
          aria-label={muted ? '소리 켜기' : '소리 끄기'}
          type="button"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* ── Toy Slot Machine Body ── */}
      <div className="sm__machine">
        {/* Machine Head */}
        <div className="sm__top">
          <span className="sm__star sm__star--1" aria-hidden>⭐</span>
          <div className="sm__teddy" aria-hidden>🧸</div>
          <span className="sm__star sm__star--2" aria-hidden>⭐</span>
        </div>

        {/* Machine Window (Single Vertical Reel) */}
        <div className="sm__slot-window">
          {/* Top Row (Decoy/Previous) */}
          <div className="sm__reel-row sm__reel-row--dim">
            <span className="sm__reel-text">{topDisplayName}</span>
          </div>

          {/* Center Highlighted Row (Actual Active / Winner Row) */}
          <div className="sm__reel-row sm__reel-row--center">
            <span className="sm__reel-star sm__reel-star--left" aria-hidden>✨</span>
            <span
              className={`sm__reel-text sm__reel-text--highlight ${animPhase === 'celebrating' || animPhase === 'stopped' ? 'sm__reel-text--winner-locked' : ''}`}
              data-testid="slot-final-winner"
            >
              {centerDisplayName}
            </span>
            <span className="sm__reel-star sm__reel-star--right" aria-hidden>✨</span>
          </div>

          {/* Bottom Row (Decoy/Next) */}
          <div className="sm__reel-row sm__reel-row--dim">
            <span className="sm__reel-text">{bottomDisplayName}</span>
          </div>

          {/* Glass Gradient Overlays */}
          <div className="sm__window-overlay sm__window-overlay--top" />
          <div className="sm__window-overlay sm__window-overlay--bottom" />
          <div className="sm__window-highlight-bar" />
        </div>

        {/* Machine Bottom Lever */}
        <div className="sm__bottom">
          <div className={`sm__lever ${isDrawing ? 'sm__lever--active' : ''}`} aria-hidden>
            <div className="sm__lever-ball" />
            <div className="sm__lever-rod" />
          </div>
        </div>
      </div>

      {/* NOTE: Bottom winner banner has been completely removed.
          All winner announcements are now displayed exclusively in the centered WinnerAnnouncementModal. */}

      {/* ── Confetti Particle Overlay ── */}
      <div className="sm__confetti-container" aria-hidden>
        {particles.map((p) => (
          <div
            key={p.id}
            className="sm__confetti-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              transform: `rotate(${p.angle}deg)`,
              borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'rect' ? '2px' : '0',
              clipPath:
                p.shape === 'star'
                  ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
                  : 'none',
            }}
          />
        ))}
      </div>

      {/* ── Draw Status Indicator ── */}
      <div className="sm__status">
        {drawState.phase === 'idle' && drawState.pendingWinners.length === 0 && (
          <p className="sm__status-text sm__status-text--idle">
            🎯 추첨 설정을 완료하고 추첨을 시작하세요
          </p>
        )}
        {isDrawing && (
          <p className="sm__status-text sm__status-text--spinning">
            🎰 추첨 진행 중... ({drawState.revealedCount + 1} / {drawState.pendingWinners.length}명)
          </p>
        )}
        {drawState.phase === 'done' && (
          <p className="sm__status-text sm__status-text--done">
            🎉 {drawState.pendingWinners.length}명의 추첨이 완료되었습니다!
          </p>
        )}
      </div>

      {/* ── Decorative Balloons ── */}
      <div className="sm__balloons" aria-hidden>
        <span className="sm__balloon sm__balloon--1">🎈</span>
        <span className="sm__balloon sm__balloon--2">🎈</span>
        <span className="sm__balloon sm__balloon--3">🎈</span>
      </div>
    </div>
  );
}
