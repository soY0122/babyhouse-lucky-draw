/**
 * sound.ts
 * Celebratory sound effects using Web Audio API.
 * No audio files needed — generated programmatically.
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext();
  }
  return _ctx;
}

function playNote(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gain = 0.3,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

/**
 * Play a happy celebratory chime when a winner is revealed.
 */
export function playCelebration(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // Ascending happy arpeggio: C5 E5 G5 C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      playNote(ctx, freq, now + i * 0.1, 0.4, 0.25, 'sine');
    });

    // Light shimmer overtone
    playNote(ctx, 2093, now + 0.3, 0.6, 0.08, 'sine');
  } catch {
    // Audio not supported or blocked — silently ignore
  }
}

/**
 * Play a soft tick while reels are spinning.
 */
export function playTick(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    playNote(ctx, 1200, now, 0.04, 0.08, 'square');
  } catch {
    // ignore
  }
}

/**
 * Play a reel-stop "thud" sound.
 */
export function playStop(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    playNote(ctx, 220, now, 0.15, 0.2, 'triangle');
    playNote(ctx, 110, now + 0.05, 0.2, 0.1, 'triangle');
  } catch {
    // ignore
  }
}
