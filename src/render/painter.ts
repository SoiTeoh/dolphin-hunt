import { tuning, type Tuning } from '../config/tuning';
import { computeTideY, getComboMultiplier, type FishEntity } from '../game/rules';
import type { DolphinHuntWorld } from '../game/world';

export interface RenderExtra {
  readonly screenMode: 'title' | 'playing' | 'result';
  readonly bestScore: number;
  readonly muted: boolean;
  readonly debug: boolean;
  readonly animTimeSec: number;
  readonly pointerGuide: { readonly x: number; readonly y: number } | null;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  active: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = active ? '#fb7185' : 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-9, -2, -10, -10, -4, -10);
  ctx.bezierCurveTo(-1, -10, 0, -7, 0, -6);
  ctx.bezierCurveTo(0, -7, 1, -10, 4, -10);
  ctx.bezierCurveTo(10, -10, 9, -2, 0, 6);
  ctx.fill();
  ctx.restore();
}

function drawCoastline(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  t: Tuning,
): void {
  const { width, height } = t.view;

  // 1. Dry sand base
  const sandGrad = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  sandGrad.addColorStop(0, '#fef08a');
  sandGrad.addColorStop(1, '#fcd34d');
  ctx.fillStyle = sandGrad;
  ctx.fillRect(0, 0, width, height);

  // Decorative seashells on upper beach
  ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
  for (const [sx, sy] of [
    [62, 128],
    [188, 118],
    [318, 134],
    [95, 178],
    [276, 172],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI, true);
    ctx.fill();
  }

  // 2. Wet sand band above tide line
  ctx.fillStyle = 'rgba(180, 83, 9, 0.24)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 10) {
    ctx.lineTo(x, computeTideY(x, timeSec, t) - t.beach.wetSandBandPx);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // 3. Shallow surf & deep ocean below tide line
  const seaGrad = ctx.createLinearGradient(0, t.beach.tideBaseY - 90, 0, height);
  seaGrad.addColorStop(0, '#38bdf8');
  seaGrad.addColorStop(0.28, '#0284c7');
  seaGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = seaGrad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 10) {
    ctx.lineTo(x, computeTideY(x, timeSec, t));
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // 4. Layered white surf foam along tide line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= width; x += 10) {
    const y = computeTideY(x, timeSec, t);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 10) {
    const y = computeTideY(x, timeSec, t) + 14;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawHelperHuman(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  animTimeSec: number,
): void {
  const { helper } = world;
  ctx.save();
  const bob = Math.sin(animTimeSec * 7) * 2;
  ctx.translate(helper.x, helper.y + bob);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders / shirt
  ctx.fillStyle = helper.rescueFlashSec > 0 ? '#f97316' : '#10b981';
  roundRect(ctx, -14, -6, 28, 16, 8);
  ctx.fill();

  // Straw hat
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Red hat band
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(0, -2, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(0, -2, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawFish(
  ctx: CanvasRenderingContext2D,
  fish: FishEntity,
  t: Tuning,
  animTimeSec: number,
): void {
  const spec = t.fish[fish.kind];
  const r = spec.radius;
  const flopAngle =
    fish.aiState === 'FLOPPING'
      ? Math.sin(animTimeSec * 26 + fish.id) * 0.45
      : Math.atan2(fish.vy, fish.vx);

  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.rotate(flopAngle);

  // Flying fish wing-fins
  if (fish.kind === 'flying') {
    ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.9, r * 0.45, r * 0.85, -0.3, 0, Math.PI * 2);
    ctx.ellipse(0, r * 0.9, r * 0.45, r * 0.85, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tail fin
  ctx.fillStyle = fish.kind === 'tuna' ? '#d97706' : fish.kind === 'flying' ? '#0284c7' : '#64748b';
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0);
  ctx.lineTo(-r * 1.45, -r * 0.55);
  ctx.lineTo(-r * 1.45, r * 0.55);
  ctx.closePath();
  ctx.fill();

  // Body
  ctx.fillStyle = fish.kind === 'tuna' ? '#fbbf24' : fish.kind === 'flying' ? '#38bdf8' : '#e2e8f0';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.15, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Panic exclamation mark
  if (fish.aiState === 'PANIC_BEACH') {
    ctx.fillStyle = '#ef4444';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', fish.x, fish.y - r - 6);
  }
}

function drawDolphin(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  t: Tuning,
): void {
  const { dolphin, match } = world;
  const isLow = match.moisture < t.dolphin.lowMoistureThreshold;
  const tailWag = Math.sin(dolphin.tailPhase) * 0.35;

  ctx.save();
  ctx.translate(dolphin.x, dolphin.y);
  ctx.rotate(dolphin.angleRad);

  // Side pectoral fins
  ctx.fillStyle = isLow ? '#ef4444' : '#475569';
  ctx.beginPath();
  ctx.ellipse(-2, -16, 6, 11, -0.4, 0, Math.PI * 2);
  ctx.ellipse(-2, 16, 6, 11, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Tail fluke
  ctx.save();
  ctx.translate(-22, 0);
  ctx.rotate(tailWag);
  ctx.fillStyle = isLow ? '#f87171' : '#475569';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -12);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-14, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Plump dolphin body
  ctx.fillStyle = isLow ? '#fca5a5' : '#64748b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Lighter belly / snout
  ctx.fillStyle = isLow ? '#fecaca' : '#cbd5e1';
  ctx.beginPath();
  ctx.ellipse(6, 0, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dorsal fin
  ctx.fillStyle = isLow ? '#dc2626' : '#334155';
  ctx.beginPath();
  ctx.moveTo(-2, -3);
  ctx.lineTo(-11, -13);
  ctx.lineTo(4, -3);
  ctx.closePath();
  ctx.fill();

  // Snout / bite mouth
  if (dolphin.expression === 'bite') {
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(22, 0, 7, -0.8, 0.8);
    ctx.lineTo(15, 0);
    ctx.closePath();
    ctx.fill();
    // Cute little teeth
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(21, -4, 3, 2);
    ctx.fillRect(21, 2, 3, 2);
  } else {
    ctx.fillStyle = isLow ? '#f87171' : '#64748b';
    ctx.beginPath();
    ctx.ellipse(24, 0, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes / expression
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = 2;
  for (const ey of [-5, 5]) {
    if (dolphin.expression === 'dry') {
      ctx.beginPath();
      ctx.moveTo(10, ey - 2.5);
      ctx.lineTo(14, ey + 2.5);
      ctx.moveTo(14, ey - 2.5);
      ctx.lineTo(10, ey + 2.5);
      ctx.stroke();
    } else if (dolphin.expression === 'chew') {
      ctx.beginPath();
      ctx.arc(12, ey, 2.5, Math.PI, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(12, ey, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // Moisture alert arc when out of water
  if (dolphin.zone === 'WET_SAND' || dolphin.zone === 'DRY_SAND' || match.moisture < 99) {
    const ratio = match.moisture / 100;
    const arcColor = ratio > 0.6 ? '#38bdf8' : ratio > 0.35 ? '#f59e0b' : '#ef4444';
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(dolphin.x, dolphin.y, 28, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();

    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      dolphin.x,
      dolphin.y,
      28,
      -Math.PI * 0.85,
      -Math.PI * 0.85 + Math.PI * 0.7 * ratio,
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticlesAndFloats(ctx: CanvasRenderingContext2D, world: DolphinHuntWorld): void {
  for (const p of world.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const f of world.floats) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `900 ${Math.round(17 * f.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

function drawHudAndControls(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  extra: RenderExtra,
  t: Tuning,
): void {
  const { width } = t.view;
  const { match } = world;

  // Top HUD bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  roundRect(ctx, 14, 14, width - 28, 48, 14);
  ctx.fill();

  ctx.fillStyle = match.remainingSec <= 10 ? '#fca5a5' : '#ffffff';
  ctx.font = '800 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.ceil(match.remainingSec)}s`, 28, 38);

  // 3 rescue hearts
  for (let i = 0; i < t.scoring.maxHearts; i++) {
    drawHeart(ctx, 88 + i * 24, 40, i < match.hearts);
  }

  // Score + Combo pill
  ctx.fillStyle = '#fde047';
  ctx.font = '800 18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(match.score)}分`, width - 64, 38);

  const mult = getComboMultiplier(match.comboCount);
  if (mult > 1 && match.comboTimerSec > 0) {
    ctx.fillStyle = mult === 3 ? '#f97316' : '#38bdf8';
    roundRect(ctx, width - 144, 68, 84, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`干饭狂潮 ×${mult}`, width - 102, 79);
  }

  // Mute button
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(width - 36, 38, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(extra.muted ? '🔇' : '🔊', width - 36, 39);

  if (extra.screenMode !== 'playing') return;

  // Optional touch guide target indicator
  if (extra.pointerGuide) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(extra.pointerGuide.x, extra.pointerGuide.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Bottom-right circular "冲滩猛扑" button
  const btn = t.dolphin.lungeButton;
  const cdRatio = world.dolphin.lungeCooldownSec / t.dolphin.lungeCooldownSec;
  const ready = cdRatio <= 0.001;

  ctx.save();
  ctx.beginPath();
  ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
  ctx.fillStyle = ready ? '#f59e0b' : 'rgba(71, 85, 105, 0.88)';
  ctx.fill();
  ctx.strokeStyle = ready ? '#fef08a' : '#94a3b8';
  ctx.lineWidth = 3;
  ctx.stroke();

  if (!ready) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      btn.x,
      btn.y,
      btn.r - 4,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - cdRatio),
    );
    ctx.stroke();
  }

  ctx.fillStyle = ready ? '#0f172a' : '#f8fafc';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('冲滩猛扑', btn.x, btn.y - 6);
  ctx.font = '700 10px sans-serif';
  ctx.fillText(ready ? '(Space)' : '冷却中', btn.x, btn.y + 10);
  ctx.restore();
}

function drawTitleOverlay(ctx: CanvasRenderingContext2D, bestScore: number, t: Tuning): void {
  const { width, height } = t.view;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.56)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 28, 114, width - 56, 392, 22);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('海豚干饭冲滩', width / 2, 158);

  ctx.fillStyle = '#475569';
  ctx.font = '600 13px sans-serif';
  ctx.fillText('管他搁不搁浅，先干饭！', width / 2, 188);

  const tips = [
    ['🌊 趁涨潮冲滩咬鱼', '银鱼 +20 / 飞鱼 +40 / 金枪 +60，连吃最高 ×3'],
    ['☀️ 小心退潮变干沙', '按住拖动游动，右下角「冲滩猛扑」强行抢食'],
    ['🧑‍🌾 卡住路人推你一把', '耗尽湿润度扣 1 颗心（共 3 次机会）'],
  ];
  tips.forEach(([title, desc], idx) => {
    const ty = 236 + idx * 54;
    ctx.fillStyle = '#f1f5f9';
    roundRect(ctx, 46, ty - 16, width - 92, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 60, ty);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 11.5px sans-serif';
    ctx.fillText(desc, 60, ty + 18);
  });

  if (bestScore > 0) {
    ctx.fillStyle = '#d97706';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`本机最高分：${Math.floor(bestScore)} 分`, width / 2, 402);
  }

  // Start button: x 64..326, y 422..474
  ctx.fillStyle = '#0ea5e9';
  roundRect(ctx, 64, 422, width - 128, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('下海干饭！', width / 2, 454);
}

function drawResultOverlay(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  bestScore: number,
  t: Tuning,
): void {
  const { width, height } = t.view;
  const { match } = world;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.64)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 28, 122, width - 56, 400, 22);
  ctx.fill();

  const title = match.endReason === 'stranded_out' ? '晒成“海豚干”啦！' : '称霸海岸线！';
  ctx.fillStyle = match.endReason === 'stranded_out' ? '#dc2626' : '#0284c7';
  ctx.font = '900 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, 166);

  ctx.fillStyle = '#ea580c';
  ctx.font = '900 36px sans-serif';
  ctx.fillText(`${Math.floor(match.score)} 分`, width / 2, 214);

  const totalFish =
    match.fishEaten.silver + match.fishEaten.tuna + match.fishEaten.flying;
  const rows = [
    ['干饭总数', `${totalFish} 条（金枪 ${match.fishEaten.tuna}）`],
    ['路人救援 / 助攻', `${match.rescuesUsed} 次救援 · ${match.assistsCount} 次助攻`],
    ['最高干饭狂潮', `×${match.maxCombo}`],
    ['本机最高纪录', `${Math.floor(Math.max(bestScore, match.score))} 分`],
  ];
  rows.forEach(([label, val], idx) => {
    const ry = 268 + idx * 38;
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, 48, ry - 18, width - 96, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 60, ry);
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 13.5px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, width - 60, ry);
  });

  // Restart button: x 64..326, y 446..498
  ctx.fillStyle = '#10b981';
  roundRect(ctx, 64, 446, width - 128, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('再来干一顿 (R)', width / 2, 478);
}

function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  t: Tuning,
): void {
  const { width } = t.view;
  const timeSec = world.match.elapsedSec;

  // Wet sand upper boundary line
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let x = 0; x <= width; x += 12) {
    const y = computeTideY(x, timeSec, t) - t.beach.wetSandBandPx;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Dolphin mouth bite circle
  const mouth = world.getMouthPosition();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mouth.x, mouth.y, t.dolphin.biteRadiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // Fish panic radii & AI labels
  for (const f of world.fishes) {
    ctx.strokeStyle =
      f.aiState === 'SWIM' ? 'rgba(56,189,248,0.4)' : 'rgba(244,63,94,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, t.fish[f.kind].panicRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(f.aiState, f.x, f.y + 18);
  }

  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  ctx.fillRect(10, 70, 245, 46);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `zone=${world.dolphin.zone} moist=${world.match.moisture.toFixed(0)}`,
    16,
    86,
  );
  ctx.fillText(
    `helperX=${world.helper.x.toFixed(0)} hearts=${world.match.hearts} fish=${world.fishes.length}`,
    16,
    102,
  );
}

export function drawGameFrame(
  ctx: CanvasRenderingContext2D,
  world: DolphinHuntWorld,
  extra: RenderExtra,
  t: Tuning = tuning,
): void {
  const shakeX = world.shakeMag > 0.2 ? (Math.random() - 0.5) * world.shakeMag * 2 : 0;
  const shakeY = world.shakeMag > 0.2 ? (Math.random() - 0.5) * world.shakeMag * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawCoastline(ctx, world.match.elapsedSec, t);
  drawHelperHuman(ctx, world, extra.animTimeSec);

  for (const fish of world.fishes) {
    drawFish(ctx, fish, t, extra.animTimeSec);
  }

  drawDolphin(ctx, world, t);
  drawParticlesAndFloats(ctx, world);
  ctx.restore();

  drawHudAndControls(ctx, world, extra, t);

  if (extra.debug) {
    drawDebugOverlay(ctx, world, t);
  }

  if (extra.screenMode === 'title') {
    drawTitleOverlay(ctx, extra.bestScore, t);
  } else if (extra.screenMode === 'result') {
    drawResultOverlay(ctx, world, extra.bestScore, t);
  }
}
