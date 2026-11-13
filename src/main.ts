import './style.css';
import { tuning } from './config/tuning';
import { SoundEngine } from './game/audio';
import { DolphinHuntWorld } from './game/world';
import { drawGameFrame } from './render/painter';

const BEST_SCORE_KEY = 'dolphin_hunt_best_score_v1';

function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(Math.max(0, Math.floor(score))));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function main(): void {
  const canvasEl = document.getElementById('stage');
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element #stage not found');
  }
  const maybeCtx = canvasEl.getContext('2d');
  if (!maybeCtx) {
    throw new Error('2D rendering context unavailable');
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const params = new URLSearchParams(window.location.search);
  const debugMode = params.get('debug') === '1';

  const sound = new SoundEngine();
  let world = new DolphinHuntWorld(tuning);
  let bestScore = readBestScore();
  let screenMode: 'title' | 'playing' | 'result' = 'title';
  let animTimeSec = 0;

  let swimPointerId: number | null = null;
  let pointerGuide: { x: number; y: number } | null = null;
  const heldKeys = new Set<string>();
  let lungeQueued = false;
  let dpr = 1;

  function resizeCanvas(): void {
    const vw = Math.max(240, window.innerWidth);
    const vh = Math.max(320, window.innerHeight);
    const aspect = tuning.view.width / tuning.view.height;

    let cssWidth = vw;
    let cssHeight = cssWidth / aspect;
    if (cssHeight > vh) {
      cssHeight = vh;
      cssWidth = cssHeight * aspect;
    }

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${Math.floor(cssWidth)}px`;
    canvas.style.height = `${Math.floor(cssHeight)}px`;
    canvas.width = Math.round(tuning.view.width * dpr);
    canvas.height = Math.round(tuning.view.height * dpr);
  }

  function toLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const rx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const ry = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    return {
      x: Math.max(0, Math.min(tuning.view.width, rx * tuning.view.width)),
      y: Math.max(0, Math.min(tuning.view.height, ry * tuning.view.height)),
    };
  }

  function clearInputs(): void {
    swimPointerId = null;
    pointerGuide = null;
    heldKeys.clear();
    lungeQueued = false;
  }

  function startNewGame(): void {
    sound.unlock();
    world = new DolphinHuntWorld(tuning);
    clearInputs();
    screenMode = 'playing';
  }

  function computeSteerVector(): { x: number; y: number } {
    let kx = 0;
    let ky = 0;
    if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) kx -= 1;
    if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) kx += 1;
    if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) ky -= 1;
    if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) ky += 1;

    if (kx !== 0 || ky !== 0) {
      return { x: kx, y: ky };
    }

    if (swimPointerId !== null && pointerGuide !== null) {
      const dx = pointerGuide.x - world.dolphin.x;
      const dy = pointerGuide.y - world.dolphin.y;
      if (Math.hypot(dx, dy) > 8) {
        return { x: dx, y: dy };
      }
    }
    return { x: 0, y: 0 };
  }

  function onPointerDown(e: PointerEvent): void {
    sound.unlock();
    const pt = toLogicalCoords(e.clientX, e.clientY);

    if (screenMode === 'title') {
      if (pt.x >= 64 && pt.x <= tuning.view.width - 64 && pt.y >= 422 && pt.y <= 474) {
        startNewGame();
      }
      return;
    }

    if (screenMode === 'result') {
      if (pt.x >= 64 && pt.x <= tuning.view.width - 64 && pt.y >= 446 && pt.y <= 498) {
        startNewGame();
      }
      return;
    }

    // Mute toggle
    if (Math.hypot(pt.x - (tuning.view.width - 36), pt.y - 38) <= 20) {
      sound.muted = !sound.muted;
      return;
    }

    // Bottom-right circular "冲滩猛扑" button (multi-touch isolated)
    const btn = tuning.dolphin.lungeButton;
    if (Math.hypot(pt.x - btn.x, pt.y - btn.y) <= btn.r + 10) {
      lungeQueued = true;
      return;
    }

    // Swim guide pointer with -36px upward offset so finger doesn't cover dolphin
    swimPointerId = e.pointerId;
    pointerGuide = {
      x: pt.x,
      y: Math.max(tuning.beach.minPlayableY, pt.y + tuning.dolphin.touchOffsetY),
    };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (screenMode !== 'playing' || swimPointerId !== e.pointerId) return;
    const pt = toLogicalCoords(e.clientX, e.clientY);
    pointerGuide = {
      x: pt.x,
      y: Math.max(tuning.beach.minPlayableY, pt.y + tuning.dolphin.touchOffsetY),
    };
  }

  function onPointerEnd(e: PointerEvent): void {
    if (swimPointerId !== e.pointerId) return;
    swimPointerId = null;
    pointerGuide = null;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (screenMode === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      startNewGame();
      return;
    }

    if (screenMode === 'result' && (e.code === 'KeyR' || e.code === 'Enter')) {
      startNewGame();
      return;
    }

    if (screenMode !== 'playing') return;

    sound.unlock();
    if (e.code === 'Space' && !e.repeat) {
      lungeQueued = true;
    } else if (
      e.code === 'KeyA' ||
      e.code === 'ArrowLeft' ||
      e.code === 'KeyD' ||
      e.code === 'ArrowRight' ||
      e.code === 'KeyW' ||
      e.code === 'ArrowUp' ||
      e.code === 'KeyS' ||
      e.code === 'ArrowDown'
    ) {
      heldKeys.add(e.code);
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    heldKeys.delete(e.code);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('lostpointercapture', onPointerEnd);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearInputs);
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInputs();
  });

  resizeCanvas();

  let lastTimeMs = performance.now();
  let accumulatorMs = 0;

  function stepSimulation(dtMs: number): void {
    const dtSec = dtMs / 1000;
    animTimeSec += dtSec;

    if (screenMode !== 'playing') return;

    const doLunge = lungeQueued;
    lungeQueued = false;
    const events = world.step(computeSteerVector(), doLunge, dtMs);

    if (events.lunged) sound.playLunge();
    if (events.ateFish) sound.playChomp(events.comboMultiplier);
    if (events.assisted) sound.playAssist();
    if (events.rescued) sound.playRescue();
    if (events.enteredLowMoisture) sound.playLowMoistureBeep();

    if (world.match.finished) {
      screenMode = 'result';
      clearInputs();
      if (world.match.score > bestScore) {
        bestScore = Math.floor(world.match.score);
        writeBestScore(bestScore);
      }
    }
  }

  function frame(nowMs: number): void {
    const elapsed = Math.min(tuning.loop.maxFrameDtMs, Math.max(0, nowMs - lastTimeMs));
    lastTimeMs = nowMs;
    accumulatorMs += elapsed;

    while (accumulatorMs >= tuning.loop.fixedDtMs) {
      stepSimulation(tuning.loop.fixedDtMs);
      accumulatorMs -= tuning.loop.fixedDtMs;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGameFrame(
      ctx,
      world,
      {
        screenMode,
        bestScore,
        muted: sound.muted,
        debug: debugMode,
        animTimeSec,
        pointerGuide,
      },
      tuning,
    );
    ctx.restore();

    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

main();
