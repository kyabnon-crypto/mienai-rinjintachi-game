import * as THREE from 'three';
import { AudioEngine } from './audioEngine';
import { TEAR_TYPES, TRACKS } from './config';
import { NamidabinActor } from './namidabinActor';
import { GameStateManager } from './state';
import { Judgment, TearTypeDef, TrackId } from './types';
import { VaultScene } from './vaultScene';

interface ActiveCrystal {
  id: number;
  tear: TearTypeDef;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  glowSprite: THREE.Sprite;
  worldPos: THREE.Vector3;
  spawnBeat: number;
  targetBeat: number;
  high: boolean;
  lane: 'left' | 'center' | 'right';
  caught: boolean;
}

interface FlyingOrb {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  duration: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ScreenRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

export interface RhythmCallbacks {
  onJudgment: (judgment: Judgment, screenX: number, screenY: number, gainTears: number, tear: TearTypeDef) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onPolishStateChange: (active: boolean, step: number, totalSteps: number) => void;
  onGemAscended: (gemsEarned: number, totalGemsCrafted: number) => void;
  onFeverChange: (active: boolean, gaugePct: number, remainingSec: number) => void;
  onPassiveResonance: (amount: number) => void;
}

export class RhythmSystem {
  private vault: VaultScene;
  private actor: NamidabinActor;
  private audio: AudioEngine;
  private gsm: GameStateManager;
  private cb: RhythmCallbacks;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;

  private crystalGroup = new THREE.Group();
  private crystals: ActiveCrystal[] = [];
  private flyingOrbs: FlyingOrb[] = [];
  private particles: BurstParticle[] = [];
  private ripples: ScreenRipple[] = [];
  private trail: TrailPoint[] = [];

  private nextCrystalId = 1;
  private lastSpawnStep = -1;
  private lastMeasureIndex = -1;
  private lastLane: 'left' | 'center' | 'right' = 'center';

  // Gameplay counters
  public combo = 0;
  public feverGauge = 0; // 0..100
  public isFever = false;
  public feverRemainingSec = 0;
  private trackBeforeFever: TrackId = 'dreamy';

  // Polishing mini-mode
  public isPolishing = false;
  private polishStep = 0;
  private readonly polishTotalSteps = 4;
  private polishPerfectCount = 0;
  private polishNextBeat = 0;

  // Shared geometries for fast 60fps spawning
  private crystalGeo = new THREE.OctahedronGeometry(0.19);
  private ringGeo = new THREE.RingGeometry(0.24, 0.285, 32);
  private orbGeo = new THREE.SphereGeometry(0.055, 8, 8);
  private particleGeo = new THREE.OctahedronGeometry(0.045);

  private isPointerDown = false;

  constructor(
    vault: VaultScene,
    actor: NamidabinActor,
    audio: AudioEngine,
    gsm: GameStateManager,
    fxCanvas: HTMLCanvasElement,
    cb: RhythmCallbacks
  ) {
    this.vault = vault;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.cb = cb;

    this.vault.scene.add(this.crystalGroup);
    this.resizeFx(window.innerWidth, window.innerHeight);
  }

  public resizeFx(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.width = Math.max(1, Math.floor(w * dpr));
    this.fxCanvas.height = Math.max(1, Math.floor(h * dpr));
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public getComboMultiplier(): number {
    const maxCap = 5 + this.gsm.state.upgrades.workbench * 0.5;
    let m = 1.0;
    if (this.combo >= 80) m = 5.0;
    else if (this.combo >= 50) m = 3.5;
    else if (this.combo >= 25) m = 2.5;
    else if (this.combo >= 10) m = 1.75;
    else if (this.combo >= 5) m = 1.25;
    return Math.min(maxCap, m);
  }

  public resetBeatCursors(currentBeat: number): void {
    const track = TRACKS[this.audio.currentTrackId];
    const stepSize = this.isFever ? 0.5 : track.spawnEveryBeats;
    this.lastSpawnStep = Math.floor(currentBeat / stepSize);
    this.lastMeasureIndex = Math.floor(currentBeat / 4);
  }

  public startPolish(currentBeat: number): void {
    if (this.isPolishing || !this.gsm.isBottleFull()) return;
    this.isPolishing = true;
    this.polishStep = 0;
    this.polishPerfectCount = 0;
    this.polishNextBeat = Math.ceil(currentBeat) + 1;
    this.vault.setPolishFocus(true);
    this.actor.moveToPedestal();
    this.cb.onPolishStateChange(true, 0, this.polishTotalSteps);
  }

  public tapPolish(currentBeat: number): void {
    if (!this.isPolishing) return;
    const diff = Math.abs(currentBeat - this.polishNextBeat);
    const perfect = diff <= 0.34;
    if (perfect) this.polishPerfectCount++;

    this.audio.playPolishStepSE(this.polishStep, perfect);
    this.polishStep++;
    this.polishNextBeat = Math.ceil(currentBeat) + 1;

    // 3D sparkle burst on pedestal
    const pedPos = this.vault.getPedestalWorldPosition();
    this.spawnBurst(pedPos, perfect ? 0xfff0a8 : 0x7fc8ff, perfect ? 18 : 10);
    this.spawnRipple(window.innerWidth * 0.5, window.innerHeight * 0.48, perfect ? '#fff0a6' : '#7fc8ff', 110);

    if (this.polishStep >= this.polishTotalSteps) {
      this.completePolish();
    } else {
      this.cb.onPolishStateChange(true, this.polishStep, this.polishTotalSteps);
    }
  }

  private completePolish(): void {
    this.isPolishing = false;
    this.vault.setPolishFocus(false);
    this.gsm.state.bottleCharge = 0;
    const earned = this.gsm.getPolishGemReward(this.polishPerfectCount, this.isFever);
    this.gsm.state.gems += earned;
    this.gsm.state.totalGemsCrafted += 1;

    if (!this.isFever) {
      this.feverGauge = Math.min(100, this.feverGauge + 22);
    }

    this.gsm.save();
    this.vault.syncUpgrades(this.gsm.state);
    this.actor.celebrateHop();
    this.audio.playGemAscendSE();

    const pedPos = this.vault.getPedestalWorldPosition();
    this.spawnBurst(pedPos, 0x8fe6ff, 34);
    this.spawnBurst(pedPos.clone().add(new THREE.Vector3(0, 0.25, 0)), 0xffe49e, 22);
    this.spawnRipple(window.innerWidth * 0.5, window.innerHeight * 0.45, '#a8e4ff', 220);

    this.cb.onPolishStateChange(false, 0, this.polishTotalSteps);
    this.cb.onGemAscended(earned, this.gsm.state.totalGemsCrafted);
    this.cb.onFeverChange(this.isFever, this.feverGauge, this.feverRemainingSec);
    this.cb.onStateDirty();
  }

  public async activateFever(currentBeat: number): Promise<void> {
    if (this.isFever || this.feverGauge < 100) return;
    this.isFever = true;
    this.feverGauge = 100;
    this.feverRemainingSec = this.gsm.getFeverDurationSec();
    this.trackBeforeFever = this.audio.currentTrackId;

    this.audio.playFeverStartSE();
    await this.audio.switchTrack('remix', TRACKS.remix.feverStartOffsetSec, 0.45);
    this.resetBeatCursors(currentBeat);
    this.actor.celebrateHop();
    this.spawnBurst(this.vault.getPedestalWorldPosition(), 0xffe08a, 30);
    this.cb.onFeverChange(true, 100, this.feverRemainingSec);
  }

  private async endFever(currentBeat: number): Promise<void> {
    this.isFever = false;
    this.feverGauge = 0;
    this.feverRemainingSec = 0;
    await this.audio.switchTrack(this.trackBeforeFever, undefined, 0.8);
    this.resetBeatCursors(currentBeat);
    this.cb.onFeverChange(false, 0, 0);
  }

  /* ===== Input Handling (Tap / Swipe / Keyboard) ===== */

  public handlePointerDown(clientX: number, clientY: number, currentBeat: number): void {
    this.isPointerDown = true;
    this.trail.push({ x: clientX, y: clientY, life: 1 });

    if (this.isPolishing) {
      this.tapPolish(currentBeat);
      return;
    }

    const hit = this.tryHitAtScreen(clientX, clientY, currentBeat, 92);
    if (!hit) {
      // Check if player tapped the glowing central pedestal when bottle is full
      if (this.gsm.isBottleFull()) {
        const pedScreen = this.projectToScreen(this.vault.getPedestalWorldPosition());
        if (Math.hypot(clientX - pedScreen.x, clientY - pedScreen.y) < 100) {
          this.startPolish(currentBeat);
          return;
        }
      }
      // Subtle ambient ripple on empty tap so tapping feels responsive
      this.spawnRipple(clientX, clientY, 'rgba(159, 210, 255, 0.45)', 42);
    }
  }

  public handlePointerMove(clientX: number, clientY: number, currentBeat: number): void {
    if (!this.isPointerDown) return;
    this.trail.push({ x: clientX, y: clientY, life: 1 });
    if (this.trail.length > 26) this.trail.shift();

    if (!this.isPolishing) {
      // Swipe-chaining catches any crystal your finger sweeps across!
      this.tryHitAtScreen(clientX, clientY, currentBeat, 76);
    }
  }

  public handlePointerUp(): void {
    this.isPointerDown = false;
  }

  public handleKeySnap(currentBeat: number): void {
    if (this.isPolishing) {
      this.tapPolish(currentBeat);
      return;
    }
    // Snap to crystal closest to its target beat!
    let best: ActiveCrystal | null = null;
    let bestScore = Infinity;
    for (const c of this.crystals) {
      if (c.caught) continue;
      const dist = Math.abs(c.targetBeat - currentBeat);
      if (dist < bestScore && dist < 1.35) {
        bestScore = dist;
        best = c;
      }
    }
    if (best) {
      const pos = this.projectToScreen(best.worldPos);
      this.collectCrystal(best, currentBeat, pos.x, pos.y);
    } else if (this.gsm.isBottleFull()) {
      this.startPolish(currentBeat);
    }
  }

  private tryHitAtScreen(x: number, y: number, currentBeat: number, radiusPx: number): boolean {
    let best: ActiveCrystal | null = null;
    let bestDist = radiusPx;

    for (const c of this.crystals) {
      if (c.caught) continue;
      const sc = this.projectToScreen(c.worldPos);
      if (!sc.visible) continue;
      const d = Math.hypot(sc.x - x, sc.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (best) {
      const sc = this.projectToScreen(best.worldPos);
      this.collectCrystal(best, currentBeat, sc.x, sc.y);
      return true;
    }
    return false;
  }

  private collectCrystal(c: ActiveCrystal, currentBeat: number, sx: number, sy: number, auto = false): void {
    c.caught = true;
    const delta = Math.abs(currentBeat - c.targetBeat);

    let judgment: Judgment = 'GOOD';
    let judgeMult = 1.0;
    if (auto) {
      judgment = 'GREAT';
      judgeMult = 1.2;
    } else if (delta <= 0.28) {
      judgment = 'PERFECT';
      judgeMult = 2.0;
    } else if (delta <= 0.62) {
      judgment = 'GREAT';
      judgeMult = 1.4;
    }

    this.combo++;
    if (this.combo > this.gsm.state.bestCombo) {
      this.gsm.state.bestCombo = this.combo;
    }
    const comboMult = this.getComboMultiplier();
    const trackMult = TRACKS[this.audio.currentTrackId].valueMultiplier;
    const feverMult = this.isFever ? 2.0 : 1.0;
    const upgMult = this.gsm.getTearMultiplier();

    const gained = Math.max(
      1,
      Math.round(c.tear.baseValue * judgeMult * comboMult * trackMult * feverMult * upgMult)
    );

    this.gsm.state.tears += gained;
    this.gsm.state.totalTearsEarned += gained;
    if (this.gsm.state.bottleCharge < this.gsm.getBottleCapacity()) {
      this.gsm.state.bottleCharge = Math.min(
        this.gsm.getBottleCapacity(),
        this.gsm.state.bottleCharge + (judgment === 'PERFECT' ? 1.25 : 1)
      );
    }

    if (!this.isFever) {
      const feverAdd = c.tear.feverGain * (judgment === 'PERFECT' ? 1.35 : 1.0);
      this.feverGauge = Math.min(100, this.feverGauge + feverAdd);
    }

    this.audio.playCatchSE(judgment, this.combo);
    this.actor.moveToward(c.worldPos, this.isFever || this.combo >= 15);
    this.spawnBurst(c.worldPos, c.tear.colorHex, judgment === 'PERFECT' ? 16 : 9);
    this.spawnFlyingOrb(c.worldPos, c.tear.colorHex);
    this.spawnRipple(sx, sy, c.tear.cssColor, judgment === 'PERFECT' ? 92 : 64);

    this.removeCrystalMesh(c);
    this.cb.onJudgment(judgment, sx, sy, gained, c.tear);
    this.cb.onComboChange(this.combo, comboMult);
    this.cb.onFeverChange(this.isFever, this.feverGauge, this.feverRemainingSec);
    this.cb.onStateDirty();
  }

  private pickTearType(): TearTypeDef {
    const ladderBonus = this.gsm.state.upgrades.ladder * 5;
    const weights = TEAR_TYPES.map((t) =>
      t.id === 'reunion' ? t.weight + ladderBonus + (this.isFever ? 12 : 0) : t.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < TEAR_TYPES.length; i++) {
      r -= weights[i];
      if (r <= 0) return TEAR_TYPES[i];
    }
    return TEAR_TYPES[0];
  }

  private spawnCrystal(currentBeat: number): void {
    const maxActive = this.isFever ? 10 : 6;
    if (this.crystals.length >= maxActive) return;

    const anchors = this.vault.getSpawnAnchors();
    // Alternate lanes for pleasant two-thumb landscape flow!
    const preferred = anchors.filter((a) => a.lane !== this.lastLane);
    const pool = preferred.length > 0 ? preferred : anchors;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.lastLane = pick.lane;

    const pos = pick.pos.clone();
    pos.x += (Math.random() - 0.5) * 0.45;
    pos.y += (Math.random() - 0.5) * 0.28;
    pos.z += (Math.random() - 0.5) * 0.45;

    const tear = this.pickTearType();
    const track = TRACKS[this.audio.currentTrackId];
    const approachBeats = this.isFever ? 1.85 : track.approachBeats;

    const group = new THREE.Group();
    group.position.copy(pos);

    const coreMat = new THREE.MeshStandardMaterial({
      color: tear.colorHex,
      emissive: tear.emissiveHex,
      emissiveIntensity: 1.15,
      roughness: 0.14,
      metalness: 0.15,
      flatShading: true,
    });
    const coreMesh = new THREE.Mesh(this.crystalGeo, coreMat);
    coreMesh.scale.set(0.85, 1.38, 0.85);
    group.add(coreMesh);

    const ringMat = new THREE.MeshBasicMaterial({
      color: tear.colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    group.add(ringMesh);

    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.vault.glowTex,
        color: tear.colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    glowSprite.scale.set(1.05, 1.05, 1);
    group.add(glowSprite);

    this.crystalGroup.add(group);
    this.crystals.push({
      id: this.nextCrystalId++,
      tear,
      group,
      coreMesh,
      ringMesh,
      glowSprite,
      worldPos: pos,
      spawnBeat: currentBeat,
      targetBeat: currentBeat + approachBeats,
      high: pick.high,
      lane: pick.lane,
      caught: false,
    });
  }

  private removeCrystalMesh(c: ActiveCrystal): void {
    this.crystalGroup.remove(c.group);
    (c.coreMesh.material as THREE.Material).dispose();
    (c.ringMesh.material as THREE.Material).dispose();
    (c.glowSprite.material as THREE.Material).dispose();
  }

  private spawnFlyingOrb(from: THREE.Vector3, colorHex: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.orbGeo, mat);
    mesh.position.copy(from);
    this.crystalGroup.add(mesh);

    const end = this.vault.getPedestalWorldPosition();
    const control = from
      .clone()
      .lerp(end, 0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.15, 0.4));

    this.flyingOrbs.push({
      mesh,
      start: from.clone(),
      control,
      end,
      t: 0,
      duration: 0.52,
    });
  }

  private spawnBurst(origin: THREE.Vector3, colorHex: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(origin);
      this.crystalGroup.add(mesh);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = 1.4 + Math.random() * 2.8;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * spd,
          Math.cos(phi) * spd * 0.8 + 1.1,
          Math.sin(phi) * Math.sin(theta) * spd
        ),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  private spawnRipple(x: number, y: number, color: string, maxRadius: number): void {
    this.ripples.push({ x, y, radius: 10, maxRadius, color, alpha: 0.92 });
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = worldPos.clone().project(this.vault.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      visible: v.z < 1,
    };
  }

  public getPolishRingProgress(currentBeat: number): number {
    if (!this.isPolishing) return 0;
    const rem = this.polishNextBeat - currentBeat;
    // Wrap smoothly every beat if player waits
    if (rem < -0.45) {
      this.polishNextBeat = Math.ceil(currentBeat) + 1;
    }
    return Math.max(0, Math.min(1.4, this.polishNextBeat - currentBeat));
  }

  public update(dt: number, currentBeat: number, started: boolean): void {
    if (started) {
      // Fever countdown
      if (this.isFever) {
        this.feverRemainingSec -= dt;
        const pct = Math.max(0, (this.feverRemainingSec / this.gsm.getFeverDurationSec()) * 100);
        this.cb.onFeverChange(true, pct, Math.max(0, this.feverRemainingSec));
        if (this.feverRemainingSec <= 0) {
          void this.endFever(currentBeat);
        }
      }

      // Passive shelf resonance every 4 beats (measure)
      const measure = Math.floor(currentBeat / 4);
      if (measure > this.lastMeasureIndex) {
        this.lastMeasureIndex = measure;
        const shelfLv = this.gsm.state.upgrades.shelves;
        if (shelfLv > 0) {
          const passive = Math.round(shelfLv * 6 * this.gsm.getTearMultiplier());
          this.gsm.state.tears += passive;
          this.gsm.state.totalTearsEarned += passive;
          this.cb.onPassiveResonance(passive);
          this.cb.onStateDirty();
        }
      }

      // Beat-synced crystal spawning (paused cleanly while polishing at pedestal)
      if (!this.isPolishing) {
        const track = TRACKS[this.audio.currentTrackId];
        const stepSize = this.isFever ? 0.5 : track.spawnEveryBeats;
        const step = Math.floor(currentBeat / stepSize);
        if (step > this.lastSpawnStep) {
          this.lastSpawnStep = step;
          this.spawnCrystal(currentBeat);
        }
      }
    }

    // Update active crystals & converging approach rings
    const survivors: ActiveCrystal[] = [];
    for (const c of this.crystals) {
      if (c.caught) continue;

      const totalBeats = Math.max(0.5, c.targetBeat - c.spawnBeat);
      const progress = (currentBeat - c.spawnBeat) / totalBeats; // 0 -> 1 (target) -> >1 (late)

      // Gentle float & spin
      c.coreMesh.rotation.y += dt * 2.1;
      c.group.position.y = c.worldPos.y + Math.sin(currentBeat * 2.5 + c.id) * 0.06;

      // Billboard timing ring to face camera
      c.ringMesh.quaternion.copy(this.vault.camera.quaternion);
      const ringScale = Math.max(0.75, 2.55 - progress * 1.65);
      c.ringMesh.scale.setScalar(ringScale);

      // Highlight brightly inside PERFECT window!
      const inPerfect = Math.abs(1 - progress) < 0.14;
      const ringMat = c.ringMesh.material as THREE.MeshBasicMaterial;
      ringMat.opacity = progress < 1.25 ? (inPerfect ? 1.0 : 0.72) : Math.max(0, 1 - (progress - 1.25) * 3);
      ringMat.color.setHex(inPerfect ? 0xffffff : c.tear.colorHex);

      // Ladder auto-catch right at target beat if upgraded!
      if (progress >= 1.0 && this.gsm.getLadderAutoCatchChance() > 0 && Math.random() < this.gsm.getLadderAutoCatchChance() * dt * 8) {
        const sc = this.projectToScreen(c.worldPos);
        this.collectCrystal(c, currentBeat, sc.x, sc.y, true);
        continue;
      }

      // Expired / missed
      if (progress > 1.38) {
        if (this.combo > 0 && !this.isFever) {
          this.combo = 0;
          this.cb.onComboChange(0, 1.0);
        }
        this.removeCrystalMesh(c);
        continue;
      }

      survivors.push(c);
    }
    this.crystals = survivors;

    // Update flying orbs arcing into central pedestal
    const aliveOrbs: FlyingOrb[] = [];
    for (const o of this.flyingOrbs) {
      o.t += dt / o.duration;
      if (o.t >= 1) {
        this.crystalGroup.remove(o.mesh);
        (o.mesh.material as THREE.Material).dispose();
        continue;
      }
      const u = 1 - o.t;
      o.mesh.position.set(
        u * u * o.start.x + 2 * u * o.t * o.control.x + o.t * o.t * o.end.x,
        u * u * o.start.y + 2 * u * o.t * o.control.y + o.t * o.t * o.end.y,
        u * u * o.start.z + 2 * u * o.t * o.control.z + o.t * o.t * o.end.z
      );
      o.mesh.scale.setScalar(1 - o.t * 0.45);
      aliveOrbs.push(o);
    }
    this.flyingOrbs = aliveOrbs;

    // Update 3D burst particles
    const aliveParts: BurstParticle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.crystalGroup.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        continue;
      }
      p.vel.y -= 3.6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 6;
      const frac = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(frac);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = frac;
      aliveParts.push(p);
    }
    this.particles = aliveParts;

    // Render 2D FX Canvas (ripples + swipe ribbon)
    this.render2DFx(dt);
  }

  private render2DFx(dt: number): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Expanding judgment ripples
    const nextRipples: ScreenRipple[] = [];
    for (const r of this.ripples) {
      r.radius += (r.maxRadius - r.radius) * Math.min(1, dt * 11);
      r.alpha -= dt * 2.4;
      if (r.alpha <= 0.02) continue;

      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
      nextRipples.push(r);
    }
    this.ripples = nextRipples;

    // Luminous swipe trail
    const nextTrail: TrailPoint[] = [];
    for (const pt of this.trail) {
      pt.life -= dt * 4.2;
      if (pt.life > 0.02) nextTrail.push(pt);
    }
    this.trail = nextTrail;

    if (this.trail.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = this.isFever ? '#ffe599' : '#9be0ff';
        ctx.globalAlpha = b.life * 0.72;
        ctx.lineWidth = 3 + b.life * 7;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
