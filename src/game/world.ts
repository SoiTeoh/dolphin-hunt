import { tuning, type FishKind, type Tuning } from '../config/tuning';
import {
  applyFishEaten,
  clamp,
  classifySurfaceZone,
  computeTideY,
  createInitialHuntState,
  isMouthBitingFish,
  stepFishEntity,
  stepHelperPatrolAndAssist,
  stepMatchClockAndCombo,
  stepMoistureAndRescue,
  type FishEntity,
  type HelperState,
  type HuntMatchState,
  type SurfaceZone,
} from './rules';

export type DolphinExpression = 'chill' | 'bite' | 'chew' | 'dry';

export interface DolphinState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angleRad: number;
  lungeCooldownSec: number;
  lungeAnimSec: number;
  chewAnimSec: number;
  tailPhase: number;
  zone: SurfaceZone;
  expression: DolphinExpression;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface WorldStepEvents {
  readonly lunged: boolean;
  readonly ateFish: boolean;
  readonly comboMultiplier: 1 | 2 | 3;
  readonly assisted: boolean;
  readonly rescued: boolean;
  readonly strandedOut: boolean;
  readonly enteredLowMoisture: boolean;
}

export class DolphinHuntWorld {
  readonly t: Tuning;
  match: HuntMatchState;
  dolphin: DolphinState;
  helper: HelperState;
  fishes: FishEntity[] = [];
  particles: Particle[] = [];
  floats: FloatingText[] = [];
  shakeMag = 0;

  private nextFishId = 1;
  private fishSpawnTimer = 0.2;
  private wasLowMoisture = false;

  constructor(t: Tuning = tuning) {
    this.t = t;
    this.match = createInitialHuntState(t);
    this.dolphin = {
      x: t.view.width * 0.5,
      y: 485,
      vx: 0,
      vy: 0,
      angleRad: -Math.PI / 2,
      lungeCooldownSec: 0,
      lungeAnimSec: 0,
      chewAnimSec: 0,
      tailPhase: 0,
      zone: 'DEEP_WATER',
      expression: 'chill',
    };
    this.helper = {
      x: 110,
      y: t.beach.helperPatrolY,
      dir: 1,
      assistCooldownSec: 1.2,
      rescueFlashSec: 0,
    };

    for (let i = 0; i < 5; i++) {
      this.spawnFish();
    }
  }

  private pickFishKind(): FishKind {
    const r = Math.random();
    if (r < 0.52) return 'silver';
    if (r < 0.8) return 'flying';
    return 'tuna';
  }

  private spawnFish(): void {
    const kind = this.pickFishKind();
    const spec = this.t.fish[kind];
    const x = 44 + Math.random() * (this.t.view.width - 88);
    const tideY = computeTideY(x, this.match.elapsedSec, this.t);
    const y = clamp(tideY + 26 + Math.random() * 55, 220, this.t.beach.maxPlayableY - 40);
    const dir = Math.random() < 0.5 ? -1 : 1;

    this.fishes.push({
      id: this.nextFishId++,
      kind,
      x,
      y,
      vx: dir * spec.swimSpeed,
      vy: 0,
      aiState: 'SWIM',
      hopsRemaining: spec.extraHops,
      hopTimerSec: 0.35,
      beachTimerSec: 0,
    });
  }

  private spawnBurst(x: number, y: number, color: string, count: number, speed = 130): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 35 + Math.random() * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2 + Math.random() * 2.8,
        color,
        life: 0.4 + Math.random() * 0.25,
        maxLife: 0.65,
      });
    }
  }

  private addFloat(x: number, y: number, text: string, color: string, scale = 1): void {
    this.floats.push({
      x: clamp(x, 64, this.t.view.width - 64),
      y,
      text,
      color,
      scale,
      life: 1.05,
      maxLife: 1.05,
    });
  }

  getMouthPosition(): { x: number; y: number } {
    return {
      x: this.dolphin.x + Math.cos(this.dolphin.angleRad) * this.t.dolphin.mouthOffsetPx,
      y: this.dolphin.y + Math.sin(this.dolphin.angleRad) * this.t.dolphin.mouthOffsetPx,
    };
  }

  step(
    steerDir: { x: number; y: number },
    lungePressed: boolean,
    dtMs: number,
  ): WorldStepEvents {
    const dtSec = Math.min(this.t.loop.maxFrameDtMs, Math.max(0, dtMs)) / 1000;

    // Update particles & floating texts
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dtSec;
      f.y -= 34 * dtSec;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    this.shakeMag = Math.max(0, this.shakeMag - 26 * dtSec);

    if (this.match.finished) {
      return {
        lunged: false,
        ateFish: false,
        comboMultiplier: 1,
        assisted: false,
        rescued: false,
        strandedOut: false,
        enteredLowMoisture: false,
      };
    }

    // Clock & combo decay
    this.match = stepMatchClockAndCombo(this.match, dtSec);
    if (this.match.finished) {
      return {
        lunged: false,
        ateFish: false,
        comboMultiplier: 1,
        assisted: false,
        rescued: false,
        strandedOut: false,
        enteredLowMoisture: false,
      };
    }

    // Cooldowns
    this.dolphin.lungeCooldownSec = Math.max(0, this.dolphin.lungeCooldownSec - dtSec);
    this.dolphin.lungeAnimSec = Math.max(0, this.dolphin.lungeAnimSec - dtSec);
    this.dolphin.chewAnimSec = Math.max(0, this.dolphin.chewAnimSec - dtSec);

    // Zone classification & movement physics
    const zone = classifySurfaceZone(
      this.dolphin.x,
      this.dolphin.y,
      this.match.elapsedSec,
      this.t,
    );
    this.dolphin.zone = zone;

    const inWater = zone === 'DEEP_WATER' || zone === 'SURF_FOAM';
    const accel = inWater
      ? this.t.dolphin.waterAccel
      : zone === 'WET_SAND'
        ? this.t.dolphin.wetSandAccel
        : this.t.dolphin.drySandAccel;
    const maxSpd = inWater
      ? this.t.dolphin.waterMaxSpeed
      : zone === 'WET_SAND'
        ? this.t.dolphin.wetSandMaxSpeed
        : this.t.dolphin.drySandMaxSpeed;
    const drag = inWater
      ? this.t.dolphin.waterDrag
      : zone === 'WET_SAND'
        ? this.t.dolphin.wetSandDrag
        : this.t.dolphin.drySandDrag;

    const inputLen = Math.hypot(steerDir.x, steerDir.y);
    if (inputLen > 0.05) {
      const nx = steerDir.x / inputLen;
      const ny = steerDir.y / inputLen;
      this.dolphin.vx += nx * accel * dtSec;
      this.dolphin.vy += ny * accel * dtSec;

      const targetAng = Math.atan2(ny, nx);
      let diff = targetAng - this.dolphin.angleRad;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnRate = inWater ? 11 : 6;
      this.dolphin.angleRad += diff * Math.min(1, turnRate * dtSec);
    }

    // Apply zone drag
    this.dolphin.vx -= this.dolphin.vx * Math.min(1, drag * dtSec);
    this.dolphin.vy -= this.dolphin.vy * Math.min(1, drag * dtSec);

    if (this.dolphin.lungeAnimSec <= 0) {
      const spd = Math.hypot(this.dolphin.vx, this.dolphin.vy);
      if (spd > maxSpd) {
        this.dolphin.vx = (this.dolphin.vx / spd) * maxSpd;
        this.dolphin.vy = (this.dolphin.vy / spd) * maxSpd;
      }
    }

    // Lunge burst ("冲滩猛扑")
    let lunged = false;
    if (lungePressed && this.dolphin.lungeCooldownSec <= 0) {
      lunged = true;
      this.dolphin.lungeCooldownSec = this.t.dolphin.lungeCooldownSec;
      this.dolphin.lungeAnimSec = 0.28;
      this.dolphin.vx = Math.cos(this.dolphin.angleRad) * this.t.dolphin.lungeSpeed;
      this.dolphin.vy = Math.sin(this.dolphin.angleRad) * this.t.dolphin.lungeSpeed;
      this.shakeMag = Math.max(this.shakeMag, 3.5);
      this.spawnBurst(
        this.dolphin.x,
        this.dolphin.y,
        inWater ? '#e0f2fe' : '#fde68a',
        10,
        140,
      );
    }

    // Integrate dolphin position
    this.dolphin.x = clamp(
      this.dolphin.x + this.dolphin.vx * dtSec,
      this.t.beach.marginX,
      this.t.view.width - this.t.beach.marginX,
    );
    this.dolphin.y = clamp(
      this.dolphin.y + this.dolphin.vy * dtSec,
      this.t.beach.minPlayableY,
      this.t.beach.maxPlayableY,
    );

    const speed = Math.hypot(this.dolphin.vx, this.dolphin.vy);
    this.dolphin.tailPhase += (4 + speed * 0.06) * dtSec;

    // Moisture & rescue check
    const moistRes = stepMoistureAndRescue(this.match, zone, dtSec, this.t);
    this.match = moistRes.state;

    const isLow = this.match.moisture < this.t.dolphin.lowMoistureThreshold;
    const enteredLowMoisture = isLow && !this.wasLowMoisture;
    this.wasLowMoisture = isLow;

    if (moistRes.rescued) {
      this.helper = {
        ...this.helper,
        x: clamp(this.dolphin.x, 48, this.t.view.width - 48),
        y: clamp(this.dolphin.y - 12, this.t.beach.helperPatrolY, 330),
        rescueFlashSec: 1.1,
      };
      this.dolphin.y = this.t.dolphin.rescueReturnY;
      this.dolphin.vx = 0;
      this.dolphin.vy = 120;
      this.dolphin.angleRad = Math.PI / 2;
      this.shakeMag = 7;
      this.spawnBurst(this.dolphin.x, this.dolphin.y, '#bae6fd', 14, 160);
      this.addFloat(this.dolphin.x, 320, '快推一把！-1心', '#f97316', 1.15);
    } else if (moistRes.strandedOut) {
      this.shakeMag = 9;
    }

    // Step helper patrol & daily fish assist
    const helperRes = stepHelperPatrolAndAssist(
      this.helper,
      this.fishes,
      this.match.elapsedSec,
      dtSec,
      this.t,
    );
    this.helper = helperRes.helper;
    let assisted = false;
    if (helperRes.assistedFishId !== null) {
      assisted = true;
      this.match = {
        ...this.match,
        assistsCount: this.match.assistsCount + 1,
      };
      this.fishes = this.fishes.map((f) =>
        f.id === helperRes.assistedFishId
          ? { ...f, vy: this.t.helper.assistPushVy, y: f.y + 18 }
          : f,
      );
      this.addFloat(this.helper.x, this.helper.y + 24, '路人神助攻！', '#10b981', 1.05);
    }

    // Step fishes & check mouth bites
    const mouth = this.getMouthPosition();
    let ateFish = false;
    let comboMultiplier: 1 | 2 | 3 = 1;
    let nearPrey = false;
    const nextFishes: FishEntity[] = [];

    for (const f of this.fishes) {
      const stepped = stepFishEntity(
        f,
        this.dolphin.x,
        this.dolphin.y,
        this.match.elapsedSec,
        dtSec,
        this.t,
      );
      if (stepped.escaped) continue;

      if (isMouthBitingFish(mouth.x, mouth.y, stepped.fish, this.t)) {
        ateFish = true;
        const eatRes = applyFishEaten(this.match, stepped.fish.kind, this.t);
        this.match = eatRes.state;
        comboMultiplier = eatRes.multiplier;
        this.dolphin.chewAnimSec = 0.36;
        this.spawnBurst(
          stepped.fish.x,
          stepped.fish.y,
          stepped.fish.kind === 'tuna' ? '#fde047' : '#e2e8f0',
          9,
          120,
        );
        const multLabel = eatRes.multiplier > 1 ? ` ×${eatRes.multiplier}!` : '';
        this.addFloat(
          stepped.fish.x,
          stepped.fish.y - 16,
          `+${eatRes.pointsEarned}${multLabel}`,
          eatRes.multiplier === 3 ? '#f97316' : '#fde047',
          eatRes.multiplier > 1 ? 1.15 : 1,
        );
        continue;
      }

      if (Math.hypot(mouth.x - stepped.fish.x, mouth.y - stepped.fish.y) < 58) {
        nearPrey = true;
      }
      nextFishes.push(stepped.fish);
    }
    this.fishes = nextFishes;

    // Maintain fish population
    this.fishSpawnTimer -= dtSec;
    if (this.fishSpawnTimer <= 0 && this.fishes.length < this.t.fish.maxActiveCount) {
      this.spawnFish();
      this.fishSpawnTimer = this.t.fish.spawnIntervalSec;
    }

    // Update dolphin facial expression
    if (this.match.moisture < this.t.dolphin.lowMoistureThreshold) {
      this.dolphin.expression = 'dry';
    } else if (this.dolphin.chewAnimSec > 0) {
      this.dolphin.expression = 'chew';
    } else if (nearPrey || this.dolphin.lungeAnimSec > 0) {
      this.dolphin.expression = 'bite';
    } else {
      this.dolphin.expression = 'chill';
    }

    return {
      lunged,
      ateFish,
      comboMultiplier,
      assisted,
      rescued: moistRes.rescued,
      strandedOut: moistRes.strandedOut,
      enteredLowMoisture,
    };
  }
}
