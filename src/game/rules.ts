import { tuning, type FishKind, type Tuning } from '../config/tuning';

export type SurfaceZone = 'DEEP_WATER' | 'SURF_FOAM' | 'WET_SAND' | 'DRY_SAND';
export type FishAiState = 'SWIM' | 'PANIC_BEACH' | 'FLOPPING';

export interface FishEntity {
  readonly id: number;
  readonly kind: FishKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly aiState: FishAiState;
  readonly hopsRemaining: number;
  readonly hopTimerSec: number;
  readonly beachTimerSec: number;
}

export interface HelperState {
  readonly x: number;
  readonly y: number;
  readonly dir: -1 | 1;
  readonly assistCooldownSec: number;
  readonly rescueFlashSec: number;
}

export interface HuntMatchState {
  readonly remainingSec: number;
  readonly elapsedSec: number;
  readonly moisture: number;
  readonly hearts: number;
  readonly score: number;
  readonly comboCount: number;
  readonly comboTimerSec: number;
  readonly maxCombo: 1 | 2 | 3;
  readonly fishEaten: Record<FishKind, number>;
  readonly rescuesUsed: number;
  readonly assistsCount: number;
  readonly finished: boolean;
  readonly endReason: 'none' | 'stranded_out' | 'time_up';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 计算 x 位置在 timeSec 时刻的动态潮汐线 Y 坐标（周期 4.5s）：
 * 波峰上涌时 y 变小（靠近上方沙滩），退潮时 y 变大（退回下方深海）。
 */
export function computeTideY(x: number, timeSec: number, t: Tuning = tuning): number {
  const omega = (Math.PI * 2) / t.beach.tidePeriodSec;
  const mainTide = Math.sin(timeSec * omega) * t.beach.tideAmplitudeY;
  const ripple = Math.sin(x * 0.018 + timeSec * 1.9) * 14;
  return t.beach.tideBaseY - mainTide + ripple;
}

/**
 * 根据位置与潮汐线划分地表物理区域：
 * DEEP_WATER（深水）/ SURF_FOAM（浪花浅滩）/ WET_SAND（湿沙）/ DRY_SAND（干沙）。
 */
export function classifySurfaceZone(
  x: number,
  y: number,
  timeSec: number,
  t: Tuning = tuning,
): SurfaceZone {
  const tideY = computeTideY(x, timeSec, t);
  if (y > tideY + t.beach.surfBandPx) return 'DEEP_WATER';
  if (y > tideY) return 'SURF_FOAM';
  if (y > tideY - t.beach.wetSandBandPx) return 'WET_SAND';
  return 'DRY_SAND';
}

export function getComboMultiplier(comboCount: number): 1 | 2 | 3 {
  if (comboCount >= 4) return 3;
  if (comboCount >= 2) return 2;
  return 1;
}

export function createInitialHuntState(t: Tuning = tuning): HuntMatchState {
  return {
    remainingSec: t.scoring.roundDurationSec,
    elapsedSec: 0,
    moisture: 100,
    hearts: t.scoring.maxHearts,
    score: 0,
    comboCount: 0,
    comboTimerSec: 0,
    maxCombo: 1,
    fishEaten: { silver: 0, tuna: 0, flying: 0 },
    rescuesUsed: 0,
    assistsCount: 0,
    finished: false,
    endReason: 'none',
  };
}

export interface MoistureStepResult {
  readonly state: HuntMatchState;
  readonly rescued: boolean;
  readonly strandedOut: boolean;
}

/**
 * 更新海豚湿润度与搁浅救援/耗尽心判定：
 * - 深水 / 浪花：快速回满；
 * - 湿沙 / 干沙：按不同速率流失；
 * - 湿润度跌至 0 时触发路人救援（扣 1 心并清零连击），第 3 次耗尽则晒成“海豚干”结束。
 */
export function stepMoistureAndRescue(
  prev: HuntMatchState,
  zone: SurfaceZone,
  dtSec: number,
  t: Tuning = tuning,
): MoistureStepResult {
  if (prev.finished) {
    return { state: prev, rescued: false, strandedOut: false };
  }

  let moisture = prev.moisture;
  switch (zone) {
    case 'DEEP_WATER':
      moisture += t.dolphin.moistureRecoverDeepPerSec * dtSec;
      break;
    case 'SURF_FOAM':
      moisture += t.dolphin.moistureRecoverSurfPerSec * dtSec;
      break;
    case 'WET_SAND':
      moisture -= t.dolphin.moistureDrainWetPerSec * dtSec;
      break;
    case 'DRY_SAND':
      moisture -= t.dolphin.moistureDrainDryPerSec * dtSec;
      break;
  }
  moisture = clamp(moisture, 0, 100);

  if (moisture <= 0) {
    const nextHearts = prev.hearts - 1;
    if (nextHearts <= 0) {
      return {
        state: {
          ...prev,
          moisture: 0,
          hearts: 0,
          comboCount: 0,
          comboTimerSec: 0,
          finished: true,
          endReason: 'stranded_out',
        },
        rescued: false,
        strandedOut: true,
      };
    }

    return {
      state: {
        ...prev,
        moisture: 100,
        hearts: nextHearts,
        comboCount: 0,
        comboTimerSec: 0,
        rescuesUsed: prev.rescuesUsed + 1,
      },
      rescued: true,
      strandedOut: false,
    };
  }

  return {
    state: { ...prev, moisture },
    rescued: false,
    strandedOut: false,
  };
}

export function stepMatchClockAndCombo(
  prev: HuntMatchState,
  dtSec: number,
): HuntMatchState {
  if (prev.finished) return prev;

  const remainingSec = Math.max(0, prev.remainingSec - dtSec);
  const elapsedSec = prev.elapsedSec + dtSec;
  let comboTimerSec = Math.max(0, prev.comboTimerSec - dtSec);
  let comboCount = prev.comboCount;
  if (comboTimerSec === 0) {
    comboCount = 0;
  }

  const finished = remainingSec <= 0;
  return {
    ...prev,
    remainingSec,
    elapsedSec,
    comboTimerSec,
    comboCount,
    finished,
    endReason: finished ? 'time_up' : prev.endReason,
  };
}

export function applyFishEaten(
  prev: HuntMatchState,
  kind: FishKind,
  t: Tuning = tuning,
): { readonly state: HuntMatchState; readonly pointsEarned: number; readonly multiplier: 1 | 2 | 3 } {
  if (prev.finished) {
    return { state: prev, pointsEarned: 0, multiplier: 1 };
  }
  const nextComboCount = prev.comboTimerSec > 0 ? prev.comboCount + 1 : 1;
  const multiplier = getComboMultiplier(nextComboCount);
  const pointsEarned = t.fish[kind].score * multiplier;
  const maxCombo = Math.max(prev.maxCombo, multiplier) as 1 | 2 | 3;

  return {
    state: {
      ...prev,
      score: prev.score + pointsEarned,
      comboCount: nextComboCount,
      comboTimerSec: t.scoring.comboWindowSec,
      maxCombo,
      fishEaten: {
        ...prev.fishEaten,
        [kind]: prev.fishEaten[kind] + 1,
      },
    },
    pointsEarned,
    multiplier,
  };
}

export function isMouthBitingFish(
  mouthX: number,
  mouthY: number,
  fish: FishEntity,
  t: Tuning = tuning,
): boolean {
  const dist = Math.hypot(mouthX - fish.x, mouthY - fish.y);
  return dist <= t.dolphin.biteRadiusPx + t.fish[fish.kind].radius;
}

/**
 * 逃命鱼 AI 步进：
 * - 在海水中发现海豚靠近警戒圈 -> 进入 PANIC_BEACH 故意朝上方沙滩逃窜；
 * - 冲出潮汐线后进入 FLOPPING 挣扎（滑溜飞鱼额外向岸连跳 2 次）；
 * - 若海浪重新涨潮漫过鱼身，可被冲回海里继续游动；挣扎超时则逃脱。
 */
export function stepFishEntity(
  fish: FishEntity,
  dolphinX: number,
  dolphinY: number,
  timeSec: number,
  dtSec: number,
  t: Tuning = tuning,
): { readonly fish: FishEntity; readonly escaped: boolean } {
  const spec = t.fish[fish.kind];
  const tideY = computeTideY(fish.x, timeSec, t);
  const inWater = fish.y >= tideY - 4;
  const distToDolphin = Math.hypot(fish.x - dolphinX, fish.y - dolphinY);

  let aiState = fish.aiState;
  let vx = fish.vx;
  let vy = fish.vy;
  let x = fish.x;
  let y = fish.y;
  let hopsRemaining = fish.hopsRemaining;
  let hopTimerSec = fish.hopTimerSec;
  let beachTimerSec = fish.beachTimerSec;

  if (inWater) {
    beachTimerSec = 0;
    if (distToDolphin <= spec.panicRadius) {
      aiState = 'PANIC_BEACH';
      // Flee upward toward the beach and slightly away from dolphin X
      const awayX = fish.x >= dolphinX ? 1 : -1;
      const targetVx = awayX * spec.panicSpeed * 0.45;
      const targetVy = -spec.panicSpeed;
      vx += (targetVx - vx) * Math.min(1, 10 * dtSec);
      vy += (targetVy - vy) * Math.min(1, 10 * dtSec);
    } else {
      if (aiState === 'FLOPPING') {
        // Washed back into the sea by incoming tide!
        aiState = 'SWIM';
        hopsRemaining = spec.extraHops;
      }
      // Gentle cruising near the surf line
      const targetY = tideY + 26;
      vy += ((targetY - y) * 1.8 - vy) * Math.min(1, 3 * dtSec);
      if (Math.abs(vx) < 20) vx = (fish.id % 2 === 0 ? 1 : -1) * spec.swimSpeed;
    }
  } else {
    // Stranded on wet/dry sand!
    aiState = 'FLOPPING';
    beachTimerSec += dtSec;

    if (hopsRemaining > 0) {
      hopTimerSec -= dtSec;
      if (hopTimerSec <= 0) {
        hopsRemaining -= 1;
        hopTimerSec = 0.55;
        vy = -125;
        vx = (fish.id % 2 === 0 ? 1 : -1) * 52;
      }
    }

    // Sand friction slows flopping fish quickly
    vx -= vx * Math.min(1, 5.2 * dtSec);
    vy -= vy * Math.min(1, 5.2 * dtSec);

    if (beachTimerSec >= t.fish.maxBeachStruggleSec) {
      return { fish, escaped: true };
    }
  }

  x += vx * dtSec;
  y += vy * dtSec;

  // Bounce off horizontal screen margins
  if (x < t.beach.marginX) {
    x = t.beach.marginX;
    vx = Math.abs(vx);
  } else if (x > t.view.width - t.beach.marginX) {
    x = t.view.width - t.beach.marginX;
    vx = -Math.abs(vx);
  }

  y = clamp(y, t.beach.minPlayableY, t.beach.maxPlayableY - 24);

  return {
    fish: {
      ...fish,
      x,
      y,
      vx,
      vy,
      aiState,
      hopsRemaining,
      hopTimerSec,
      beachTimerSec,
    },
    escaped: false,
  };
}

/**
 * 热心路人巡逻与日常神助攻判定：
 * 若有鱼搁浅在上方干沙滩且靠近路人脚边，路人顺手把鱼往浪花边拨回，给海豚送来干饭机会。
 */
export function stepHelperPatrolAndAssist(
  helper: HelperState,
  fishes: readonly FishEntity[],
  timeSec: number,
  dtSec: number,
  t: Tuning = tuning,
): {
  readonly helper: HelperState;
  readonly assistedFishId: number | null;
} {
  let x = helper.x + helper.dir * t.helper.patrolSpeed * dtSec;
  let dir = helper.dir;
  if (x < 48) {
    x = 48;
    dir = 1;
  } else if (x > t.view.width - 48) {
    x = t.view.width - 48;
    dir = -1;
  }

  const assistCooldownSec = Math.max(0, helper.assistCooldownSec - dtSec);
  const rescueFlashSec = Math.max(0, helper.rescueFlashSec - dtSec);
  const y = helper.y + (t.beach.helperPatrolY - helper.y) * Math.min(1, 3.2 * dtSec);

  let assistedFishId: number | null = null;
  let nextCooldown = assistCooldownSec;

  if (assistCooldownSec <= 0) {
    for (const f of fishes) {
      const tideY = computeTideY(f.x, timeSec, t);
      const strandedHigh = f.y < tideY - 45;
      if (strandedHigh && Math.hypot(f.x - x, f.y - y) <= t.helper.assistReachPx) {
        assistedFishId = f.id;
        nextCooldown = t.helper.assistCooldownSec;
        break;
      }
    }
  }

  return {
    helper: {
      x,
      y,
      dir,
      assistCooldownSec: nextCooldown,
      rescueFlashSec,
    },
    assistedFishId,
  };
}
