import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config/tuning';
import {
  applyFishEaten,
  classifySurfaceZone,
  computeTideY,
  createInitialHuntState,
  getComboMultiplier,
  isMouthBitingFish,
  stepFishEntity,
  stepHelperPatrolAndAssist,
  stepMatchClockAndCombo,
  stepMoistureAndRescue,
  type FishEntity,
  type HelperState,
} from '../src/game/rules';

describe('Tide & Surface Zones', () => {
  it('oscillates tideY over the 4.5s tidal period (high tide smaller Y, low tide larger Y)', () => {
    const base = computeTideY(0, 0, tuning);
    const highTide = computeTideY(0, tuning.beach.tidePeriodSec * 0.25, tuning);
    const lowTide = computeTideY(0, tuning.beach.tidePeriodSec * 0.75, tuning);

    expect(highTide).toBeLessThan(base);
    expect(lowTide).toBeGreaterThan(base);
  });

  it('classifies DEEP_WATER, SURF_FOAM, WET_SAND, and DRY_SAND accurately', () => {
    const tideY = computeTideY(195, 0, tuning);
    expect(classifySurfaceZone(195, tideY + 60, 0, tuning)).toBe('DEEP_WATER');
    expect(classifySurfaceZone(195, tideY + 12, 0, tuning)).toBe('SURF_FOAM');
    expect(classifySurfaceZone(195, tideY - 20, 0, tuning)).toBe('WET_SAND');
    expect(classifySurfaceZone(195, tideY - 80, 0, tuning)).toBe('DRY_SAND');
  });
});

describe('Moisture, Stranding & Rescue', () => {
  it('recovers moisture rapidly in DEEP_WATER and SURF_FOAM', () => {
    const low = { ...createInitialHuntState(tuning), moisture: 40 };
    const deepRes = stepMoistureAndRescue(low, 'DEEP_WATER', 0.5, tuning);
    const surfRes = stepMoistureAndRescue(low, 'SURF_FOAM', 0.5, tuning);

    expect(deepRes.state.moisture).toBeGreaterThan(surfRes.state.moisture);
    expect(surfRes.state.moisture).toBeGreaterThan(40);
  });

  it('drains moisture faster on DRY_SAND than WET_SAND', () => {
    const full = createInitialHuntState(tuning);
    const wetRes = stepMoistureAndRescue(full, 'WET_SAND', 1.0, tuning);
    const dryRes = stepMoistureAndRescue(full, 'DRY_SAND', 1.0, tuning);

    expect(wetRes.state.moisture).toBeLessThan(100);
    expect(dryRes.state.moisture).toBeLessThan(wetRes.state.moisture);
  });

  it('triggers helper rescue, deducts 1 heart, refills moisture, and resets combo when moisture hits 0', () => {
    const state = {
      ...createInitialHuntState(tuning),
      moisture: 5,
      hearts: 3,
      comboCount: 4,
      comboTimerSec: 2.0,
    };
    const res = stepMoistureAndRescue(state, 'DRY_SAND', 0.5, tuning);

    expect(res.rescued).toBe(true);
    expect(res.strandedOut).toBe(false);
    expect(res.state.hearts).toBe(2);
    expect(res.state.moisture).toBe(100);
    expect(res.state.comboCount).toBe(0);
    expect(res.state.rescuesUsed).toBe(1);
  });

  it('ends match with stranded_out when the 3rd rescue heart is lost', () => {
    const state = {
      ...createInitialHuntState(tuning),
      moisture: 5,
      hearts: 1,
    };
    const res = stepMoistureAndRescue(state, 'DRY_SAND', 0.5, tuning);

    expect(res.rescued).toBe(false);
    expect(res.strandedOut).toBe(true);
    expect(res.state.hearts).toBe(0);
    expect(res.state.finished).toBe(true);
    expect(res.state.endReason).toBe('stranded_out');
  });
});

describe('Combo & Match Clock', () => {
  it('computes combo multipliers 1, 2, 3 correctly', () => {
    expect(getComboMultiplier(1)).toBe(1);
    expect(getComboMultiplier(2)).toBe(2);
    expect(getComboMultiplier(3)).toBe(2);
    expect(getComboMultiplier(4)).toBe(3);
  });

  it('stacks combo multiplier on consecutive fish and decays after 3.5s', () => {
    let s = createInitialHuntState(tuning);
    s = applyFishEaten(s, 'silver', tuning).state; // 1 -> +20
    s = applyFishEaten(s, 'silver', tuning).state; // 2 -> x2 (+40)
    s = applyFishEaten(s, 'silver', tuning).state; // 3 -> x2 (+40)
    const fourth = applyFishEaten(s, 'tuna', tuning); // 4 -> x3 (+180)

    expect(fourth.multiplier).toBe(3);
    expect(fourth.pointsEarned).toBe(180);
    expect(fourth.state.maxCombo).toBe(3);

    const decayed = stepMatchClockAndCombo(fourth.state, tuning.scoring.comboWindowSec + 0.1);
    expect(decayed.comboCount).toBe(0);
    expect(decayed.comboTimerSec).toBe(0);
  });

  it('ends match with time_up at 60s and stops advancing afterward', () => {
    const almost = { ...createInitialHuntState(tuning), remainingSec: 0.1 };
    const ended = stepMatchClockAndCombo(almost, 0.2);

    expect(ended.finished).toBe(true);
    expect(ended.endReason).toBe('time_up');
    expect(ended.remainingSec).toBe(0);

    const frozen = stepMatchClockAndCombo(ended, 1.0);
    expect(frozen).toEqual(ended);
  });

  it('detects mouth biting fish within biteRadius + fishRadius', () => {
    const fish: FishEntity = {
      id: 1,
      kind: 'silver',
      x: 200,
      y: 300,
      vx: 0,
      vy: 0,
      aiState: 'SWIM',
      hopsRemaining: 0,
      hopTimerSec: 0,
      beachTimerSec: 0,
    };
    expect(isMouthBitingFish(210, 300, fish, tuning)).toBe(true);
    expect(isMouthBitingFish(280, 300, fish, tuning)).toBe(false);
  });
});

describe('Panic Fish AI & Helper Assist', () => {
  it('makes fish panic and flee upward toward the beach when dolphin approaches', () => {
    const tideY = computeTideY(195, 0, tuning);
    const fish: FishEntity = {
      id: 1,
      kind: 'silver',
      x: 195,
      y: tideY + 25,
      vx: 40,
      vy: 0,
      aiState: 'SWIM',
      hopsRemaining: 0,
      hopTimerSec: 0,
      beachTimerSec: 0,
    };
    const res = stepFishEntity(fish, 195, tideY + 60, 0, 0.1, tuning);
    expect(res.fish.aiState).toBe('PANIC_BEACH');
    expect(res.fish.vy).toBeLessThan(0);
  });

  it('switches fish to FLOPPING above tideY and triggers escape after maxBeachStruggleSec', () => {
    const tideY = computeTideY(195, 0, tuning);
    const stranded: FishEntity = {
      id: 2,
      kind: 'tuna',
      x: 195,
      y: tideY - 40,
      vx: 0,
      vy: 0,
      aiState: 'PANIC_BEACH',
      hopsRemaining: 0,
      hopTimerSec: 0,
      beachTimerSec: tuning.fish.maxBeachStruggleSec - 0.05,
    };
    const res = stepFishEntity(stranded, 195, 500, 0, 0.1, tuning);
    expect(res.escaped).toBe(true);
  });

  it('executes extra shoreward hops for flying fish when beached', () => {
    const tideY = computeTideY(195, 0, tuning);
    const flying: FishEntity = {
      id: 3,
      kind: 'flying',
      x: 195,
      y: tideY - 35,
      vx: 0,
      vy: 0,
      aiState: 'FLOPPING',
      hopsRemaining: 2,
      hopTimerSec: 0.02,
      beachTimerSec: 0.2,
    };
    const res = stepFishEntity(flying, 195, 500, 0, 0.05, tuning);
    expect(res.fish.hopsRemaining).toBe(1);
    expect(res.fish.vy).toBeLessThan(0);
  });

  it('washes FLOPPING fish back to SWIM when rising tide covers it', () => {
    const highTideTime = tuning.beach.tidePeriodSec * 0.25;
    const tideY = computeTideY(195, highTideTime, tuning);
    const fish: FishEntity = {
      id: 4,
      kind: 'silver',
      x: 195,
      y: tideY + 20,
      vx: 0,
      vy: 0,
      aiState: 'FLOPPING',
      hopsRemaining: 0,
      hopTimerSec: 0,
      beachTimerSec: 2.0,
    };
    const res = stepFishEntity(fish, 50, 560, highTideTime, 0.1, tuning);
    expect(res.fish.aiState).toBe('SWIM');
    expect(res.fish.beachTimerSec).toBe(0);
  });

  it('triggers helper assist when a fish is stranded high near the patrolling human', () => {
    const helper: HelperState = {
      x: 160,
      y: tuning.beach.helperPatrolY,
      dir: 1,
      assistCooldownSec: 0,
      rescueFlashSec: 0,
    };
    const strandedHigh: FishEntity = {
      id: 7,
      kind: 'tuna',
      x: 172,
      y: tuning.beach.helperPatrolY + 12,
      vx: 0,
      vy: 0,
      aiState: 'FLOPPING',
      hopsRemaining: 0,
      hopTimerSec: 0,
      beachTimerSec: 1.0,
    };
    const res = stepHelperPatrolAndAssist(helper, [strandedHigh], 0, 0.05, tuning);
    expect(res.assistedFishId).toBe(7);
    expect(res.helper.assistCooldownSec).toBe(tuning.helper.assistCooldownSec);
  });

  it('reverses helper patrol direction at beach edges', () => {
    const helper: HelperState = {
      x: 47,
      y: tuning.beach.helperPatrolY,
      dir: -1,
      assistCooldownSec: 1,
      rescueFlashSec: 0,
    };
    const res = stepHelperPatrolAndAssist(helper, [], 0, 0.1, tuning);
    expect(res.helper.dir).toBe(1);
    expect(res.helper.x).toBeGreaterThanOrEqual(48);
  });

  it('ignores moisture drain and fish eating once match is finished', () => {
    const finished = { ...createInitialHuntState(tuning), finished: true, endReason: 'time_up' as const };
    const mRes = stepMoistureAndRescue(finished, 'DRY_SAND', 1.0, tuning);
    const eRes = applyFishEaten(finished, 'tuna', tuning);
    expect(mRes.state).toEqual(finished);
    expect(eRes.pointsEarned).toBe(0);
  });

  it('keeps combo active while comboTimerSec remains > 0', () => {
    const ate = applyFishEaten(createInitialHuntState(tuning), 'silver', tuning).state;
    const mid = stepMatchClockAndCombo(ate, 1.0);
    expect(mid.comboCount).toBe(1);
    expect(mid.comboTimerSec).toBeCloseTo(tuning.scoring.comboWindowSec - 1.0, 4);
    expect(mid.remainingSec).toBeCloseTo(tuning.scoring.roundDurationSec - 1.0, 4);
  });
});
