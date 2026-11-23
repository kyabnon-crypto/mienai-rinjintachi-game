import * as THREE from 'three';
import { HoshihakobiAudioEngine } from './audioEngine';
import {
  CONSTELLATION_ORDERS,
  HOSHIHAKOBI_TRACKS,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  STAR_SPOTS,
  WISH_STAR_TOKEN_LIST,
  WISH_STAR_TOKEN_MAP,
} from './config';
import { HoshihakobiActor } from './hoshihakobiActor';
import { create3DStarGeometry, RooftopStarScene } from './rooftopStarScene';
import { HoshihakobiStateManager } from './state';
import { ConstellationOrderDef, HoshihakobiRunStats, WishStarTokenId } from './types';

interface ActiveWishToken {
  id: number;
  tokenId: WishStarTokenId;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
  phase: number;
  collected: boolean;
}

interface ActiveCloudMist {
  id: number;
  group: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
  phase: number;
  radius: number;
}

interface SpotAlignState {
  id: number;
  progress: number; // 0..100 (100 = constellation lit & shooting star launched!)
  cooldown: number;
  aligning: boolean;
  lastStepIndex: number;
}

interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'spark' | 'ring' | 'star';
}

export interface StarCarrySystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: ConstellationOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, miraclesEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onShiftCooldownChange: (pct: number, ready: boolean, shifting: boolean) => void;
}

export class StarCarrySystem {
  private starScene: RooftopStarScene;
  private actor: HoshihakobiActor;
  private audio: HoshihakobiAudioEngine;
  private gsm: HoshihakobiStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: StarCarrySystemCallbacks;

  private fxW = 1280;
  private fxH = 720;

  // Steering & movement
  private keys = { up: false, down: false, left: false, right: false };
  private pointerTarget: { x: number; z: number; spotId: number | null } | null = null;
  private posX = 0;
  private posZ = 0.55;
  private velX = 0;
  private velZ = 0;

  // Entities
  private nextEntityId = 1;
  private tokens: ActiveWishToken[] = [];
  private clouds: ActiveCloudMist[] = [];
  private spots: SpotAlignState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared 3D geometries for wish stars & clouded mist hazards
  private wishStarGeo = create3DStarGeometry(0.19);
  private milkyStarGeo = create3DStarGeometry(0.24);
  private shootingCoreGeo = new THREE.OctahedronGeometry(0.17, 0);
  private timingRingGeo = new THREE.TorusGeometry(0.17, 0.036, 8, 22);
  private reunionGemGeo = new THREE.DodecahedronGeometry(0.16, 0);
  private cloudPuffGeo = new THREE.SphereGeometry(0.22, 12, 10);
  private cloudRingGeo = new THREE.TorusGeometry(0.32, 0.045, 8, 24);

  // Beat cursors & timers
  private nextTokenBeat = 0;
  private nextCloudBeat = 0;
  private passiveAccum = 0;
  private shiftCooldown = 0;
  private shiftActiveTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: ConstellationOrderDef = CONSTELLATION_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: HoshihakobiRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpWandVec = new THREE.Vector3();

  constructor(
    starScene: RooftopStarScene,
    actor: HoshihakobiActor,
    audio: HoshihakobiAudioEngine,
    gsm: HoshihakobiStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: StarCarrySystemCallbacks
  ) {
    this.starScene = starScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initSpots();
    this.pickOrder(0);
  }

  public get isStarShifting(): boolean {
    return this.shiftActiveTimer > 0;
  }

  private createEmptyStats(): HoshihakobiRunStats {
    return {
      score: 0,
      starsGathered: 0,
      constellationsLit: 0,
      shootingStarsLaunched: 0,
      ordersCompleted: 0,
      cratesReleased: 0,
      cloudsCleared: 0,
      maxCombo: 0,
      stardustEarned: 0,
      miraclesEarned: 0,
    };
  }

  private initSpots(): void {
    this.spots = STAR_SPOTS.map((s, idx) => ({
      id: s.id,
      progress: 44 + idx * 9,
      cooldown: 0,
      aligning: false,
      lastStepIndex: Math.floor((44 + idx * 9) / 25),
    }));
  }

  public resizeFx(width: number, height: number): void {
    this.fxW = Math.max(1, Math.round(width));
    this.fxH = Math.max(1, Math.round(height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.width = Math.round(this.fxW * dpr);
    this.fxCanvas.height = Math.round(this.fxH * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public clearKeys(): void {
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
    this.pointerTarget = null;
  }

  public setKey(dir: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    this.keys[dir] = down;
    if (down) this.pointerTarget = null;
  }

  public setPointerTarget(virtualX: number, virtualY: number): void {
    const world = this.starScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    let spotId: number | null = null;
    for (const s of STAR_SPOTS) {
      if (Math.hypot(tx - s.x, tz - s.z) < 1.28) {
        spotId = s.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, spotId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextTokenBeat = beatFloat + 0.5;
    this.nextCloudBeat = beatFloat + 4.2;
  }

  public resetSession(spawnStarterTokens: boolean): void {
    for (const tk of this.tokens) this.starScene.worldGroup.remove(tk.group);
    for (const cl of this.clouds) this.starScene.worldGroup.remove(cl.group);
    this.tokens = [];
    this.clouds = [];
    this.fxParticles = [];

    this.posX = 0;
    this.posZ = 0.72;
    this.velX = 0;
    this.velZ = 0;
    this.pointerTarget = null;
    this.actor.setMotion(this.posX, this.posZ, 0, 0, 1);

    this.combo = 0;
    this.isFever = false;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.shiftCooldown = 0;
    this.shiftActiveTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initSpots();
    this.pickOrder(Math.floor(Math.random() * CONSTELLATION_ORDERS.length));

    if (spawnStarterTokens) {
      for (let i = 0; i < 4; i++) {
        this.spawnWishToken(false);
      }
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onShiftCooldownChange(1, true, false);
    this.callbacks.onStateDirty();
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % CONSTELLATION_ORDERS.length;
    this.currentOrder = CONSTELLATION_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMult(): number {
    return 1 + Math.min(2.0, this.combo * 0.045);
  }

  private chooseTokenType(forceRare = false): WishStarTokenId {
    if (forceRare) return 'milkyWayStar';
    const deskBonus = this.gsm.state.upgrades.starLogDesk * 3.5;
    const weights = WISH_STAR_TOKEN_LIST.map((t) =>
      t.id === 'milkyWayStar' ? t.weight + deskBonus : t.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < WISH_STAR_TOKEN_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return WISH_STAR_TOKEN_LIST[i].id;
    }
    return 'wishStar';
  }

  private spawnWishToken(forceRare = false, spawnPos?: { x: number; z: number }): void {
    const track = HOSHIHAKOBI_TRACKS[this.gsm.state.selectedTrack];
    if (!forceRare && this.tokens.length >= track.maxActiveTokens) return;

    const tokenId = this.chooseTokenType(forceRare);
    const def = WISH_STAR_TOKEN_MAP[tokenId];

    let x = spawnPos ? spawnPos.x : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
    let z = spawnPos
      ? spawnPos.z
      : PLAY_AREA_MIN_Z + 0.45 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.9);

    // Keep clear of central workbench table at (0, -0.35)
    if (!spawnPos && Math.hypot(x, z + 0.35) < 1.25) {
      x += x >= 0 ? 1.35 : -1.35;
      x = Math.max(-PLAY_AREA_HALF_X + 0.4, Math.min(PLAY_AREA_HALF_X - 0.4, x));
    }

    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: tokenId === 'milkyWayStar' ? 1.45 : 0.98,
      roughness: 0.28,
      metalness: tokenId === 'timingGear' ? 0.55 : 0.2,
    });

    const geo =
      tokenId === 'milkyWayStar'
        ? this.milkyStarGeo
        : tokenId === 'wishStar'
          ? this.wishStarGeo
          : tokenId === 'shootingTail'
            ? this.shootingCoreGeo
            : tokenId === 'timingGear'
              ? this.timingRingGeo
              : this.reunionGemGeo;

    const core = new THREE.Mesh(geo, mat);
    core.castShadow = true;
    group.add(core);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.starScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: tokenId === 'milkyWayStar' ? 0.92 : 0.66,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const haloScale = tokenId === 'milkyWayStar' ? 1.18 : 0.86;
    halo.scale.set(haloScale, haloScale, 1);
    group.add(halo);

    group.position.set(x, 0.56, z);
    this.starScene.worldGroup.add(group);

    this.tokens.push({
      id: this.nextEntityId++,
      tokenId,
      group,
      x,
      y: 0.56,
      z,
      vx: (Math.random() - 0.5) * 0.26,
      vz: (Math.random() - 0.5) * 0.26,
      age: 0,
      maxAge: tokenId === 'milkyWayStar' ? 13.5 : 15.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnCloudMist(): void {
    if (this.isFever || this.clouds.length >= 4) return;
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let z = 0;
    let vx = 0;
    let vz = 0;
    const speed = 0.92 + Math.random() * 0.55;

    if (edge === 0) {
      x = -PLAY_AREA_HALF_X - 0.3;
      z = PLAY_AREA_MIN_Z + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z);
      vx = speed;
      vz = (Math.random() - 0.5) * 0.4;
    } else if (edge === 1) {
      x = PLAY_AREA_HALF_X + 0.3;
      z = PLAY_AREA_MIN_Z + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z);
      vx = -speed;
      vz = (Math.random() - 0.5) * 0.4;
    } else if (edge === 2) {
      x = (Math.random() * 2 - 1) * PLAY_AREA_HALF_X;
      z = PLAY_AREA_MIN_Z - 0.3;
      vx = (Math.random() - 0.5) * 0.45;
      vz = speed;
    } else {
      x = (Math.random() * 2 - 1) * PLAY_AREA_HALF_X;
      z = PLAY_AREA_MAX_Z + 0.3;
      vx = (Math.random() - 0.5) * 0.45;
      vz = -speed;
    }

    const group = new THREE.Group();
    const mistMat = new THREE.MeshStandardMaterial({
      color: 0x3b325c,
      emissive: 0x261a4a,
      emissiveIntensity: 0.72,
      roughness: 0.9,
      transparent: true,
      opacity: 0.86,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa684e8,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    // Cluster of 3 dark clouded puffs representing "星が曇ってしまう雲"
    const puffA = new THREE.Mesh(this.cloudPuffGeo, mistMat);
    const puffB = new THREE.Mesh(this.cloudPuffGeo, mistMat);
    puffB.scale.setScalar(0.75);
    puffB.position.set(0.18, 0.06, -0.06);
    const puffC = new THREE.Mesh(this.cloudPuffGeo, mistMat);
    puffC.scale.setScalar(0.72);
    puffC.position.set(-0.17, 0.04, 0.08);

    const warnRing = new THREE.Mesh(this.cloudRingGeo, ringMat);
    warnRing.rotation.x = Math.PI / 2;
    warnRing.position.y = -0.26;
    group.add(puffA, puffB, puffC, warnRing);

    group.position.set(x, 0.55, z);
    this.starScene.worldGroup.add(group);

    this.clouds.push({
      id: this.nextEntityId++,
      group,
      x,
      z,
      vx,
      vz,
      age: 0,
      maxAge: 12.5,
      phase: Math.random() * Math.PI * 2,
      radius: 0.62,
    });
  }

  /** Special Action: STAR SHIFT ("星の並べ替え") — wave the Starlight Wand! */
  public triggerStarShift(): boolean {
    if (this.shiftCooldown > 0) return false;

    const maxRadius = this.gsm.getStarShiftRadius();
    this.shiftCooldown = this.gsm.getStarShiftCooldownSec();
    this.shiftActiveTimer = this.gsm.getStarShiftDurationSec();

    this.actor.triggerStarShiftWave(maxRadius);
    this.starScene.triggerStarShiftFlash();
    this.starScene.triggerShake(0.13, 0.22);
    this.audio.playStarShiftSE();

    this.tmpVec.set(this.posX, 0.8, this.posZ);
    const sc = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffe89c', 22, true);
    this.callbacks.onFloatingText('🌠 星の並べ替え！', sc.x, sc.y - 34, '#ffe89c', '全スポット＋36%');

    // Clear clouded mist within radius and convert them into bonus stardust!
    let cleared = 0;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cl = this.clouds[i];
      if (Math.hypot(cl.x - this.posX, cl.z - this.posZ) <= maxRadius) {
        this.tmpVec.set(cl.x, 0.6, cl.z);
        const cp = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
        this.spawnFxBurst(cp.x, cp.y, '#bfe2ff', 12, false);
        this.starScene.worldGroup.remove(cl.group);
        this.clouds.splice(i, 1);
        cleared++;
        this.sessionStats.cloudsCleared++;
        this.addStardust(28, cp.x, cp.y, '☁ 曇り晴れ +28');
        this.addFeverCharge(5.5);
      }
    }

    // Magnetize wish stars within radius straight into Hoshihakobi's hands
    for (const tk of this.tokens) {
      if (tk.collected) continue;
      if (Math.hypot(tk.x - this.posX, tk.z - this.posZ) <= maxRadius) {
        this.collectToken(tk);
      }
    }

    // Nudge all 4 constellation spots forward by +36% and launch a sparkling star!
    for (const sp of this.spots) {
      if (sp.cooldown > 0) continue;
      sp.progress = Math.min(100, sp.progress + 36);
      this.starScene.pulseSpot(sp.id);
      if (sp.progress >= 100) {
        this.completeConstellationSpot(sp);
      }
    }
    this.starScene.launchShootingStarArc(this.posX, 1.25, this.posZ);

    if (cleared > 0) {
      this.callbacks.onFloatingText(
        `✨ ${cleared}つの星曇りを晴らした！`,
        sc.x,
        sc.y - 68,
        '#bce2ff'
      );
    }

    this.callbacks.onShiftCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Release full Star Crate ("星の箱を空へ放つ") to earn Miracles + big Stardust! */
  public releaseStarCrate(): boolean {
    const cap = this.gsm.getCrateCapacity();
    if (this.gsm.state.crateFill < cap) return false;

    this.gsm.state.crateFill = 0;
    const miraclesGain = this.gsm.getMiraclesPerCrateRelease();
    const dustGain = Math.round(
      115 *
        this.gsm.getStardustMultiplier() *
        HOSHIHAKOBI_TRACKS[this.gsm.state.selectedTrack].valueMultiplier *
        (this.isFever ? 2 : 1)
    );

    this.gsm.state.miracles += miraclesGain;
    this.gsm.state.totalCratesReleased += 1;
    this.gsm.state.totalShootingStars += 3;
    this.gsm.state.stardust += dustGain;
    this.gsm.state.totalStardustEarned += dustGain;

    this.sessionStats.cratesReleased += 1;
    this.sessionStats.shootingStarsLaunched += 3;
    this.sessionStats.miraclesEarned += miraclesGain;
    this.sessionStats.stardustEarned += dustGain;
    this.sessionStats.score += Math.round(dustGain * 1.45);
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    this.audio.playCrateReleaseSE();
    this.actor.triggerCelebrate();
    this.starScene.triggerShake(0.14, 0.25);

    // Launch 3 celebratory 3D shooting stars soaring from Hoshihakobi's backpack into the sky
    for (let i = 0; i < 3; i++) {
      this.starScene.launchShootingStarArc(
        this.posX + (i - 1) * 0.35,
        1.15 + i * 0.15,
        this.posZ
      );
    }
    this.starScene.updateManifestBoard(
      3 + this.gsm.state.totalShootingStars,
      12 + this.gsm.state.totalMiraclesSent
    );

    this.tmpVec.set(this.posX, 1.1, this.posZ);
    const sc = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffe89c', 26, true);
    this.callbacks.onFloatingText(
      `📦 星の箱を空へ！ +${miraclesGain} 奇跡の流星`,
      sc.x,
      sc.y - 42,
      '#fff2b2',
      `星くず +${dustGain.toLocaleString('ja-JP')}`
    );

    this.addFeverCharge(14);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate STARLIGHT MIRACLE fever mode */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverSE();
    this.actor.triggerCelebrate();
    this.starScene.triggerStarShiftFlash();
    this.starScene.triggerShake(0.18, 0.35);

    // Transform every active clouded mist hazard into a rare Milky Way Polar Star!
    for (const cl of this.clouds) {
      this.starScene.worldGroup.remove(cl.group);
      this.spawnWishToken(true, { x: cl.x, z: cl.z });
    }
    this.clouds = [];

    // Launch shooting-star shower across the sky
    for (let i = 0; i < 5; i++) {
      this.starScene.launchShootingStarArc((i - 2) * 1.4, 1.3, -0.5);
    }

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private addFeverCharge(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private addStardust(rawBase: number, sx?: number, sy?: number, customLabel?: string): number {
    const track = HOSHIHAKOBI_TRACKS[this.gsm.state.selectedTrack];
    const earned = Math.max(
      1,
      Math.round(
        rawBase *
          this.gsm.getStardustMultiplier() *
          track.valueMultiplier *
          this.getComboMult() *
          (this.isFever ? 2 : 1)
      )
    );
    this.gsm.state.stardust += earned;
    this.gsm.state.totalStardustEarned += earned;
    this.sessionStats.stardustEarned += earned;
    this.sessionStats.score += earned;
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    if (typeof sx === 'number' && typeof sy === 'number') {
      this.callbacks.onFloatingText(customLabel || `+${earned}`, sx, sy, '#ffeaa0');
    }
    return earned;
  }

  private collectToken(tk: ActiveWishToken): void {
    if (tk.collected) return;
    tk.collected = true;
    this.starScene.worldGroup.remove(tk.group);

    const def = WISH_STAR_TOKEN_MAP[tk.tokenId];
    this.combo += 1;
    this.sessionStats.starsGathered += 1;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);

    const isRare = tk.tokenId === 'milkyWayStar';
    this.audio.playStarCollectSE(this.combo, isRare);
    this.actor.triggerPickupPop();

    this.tmpVec.set(tk.x, 0.7, tk.z);
    const sc = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, isRare ? 20 : 11, isRare);

    const earned = this.addStardust(def.baseValue);
    this.callbacks.onFloatingText(
      `${def.icon} ${def.shortName}`,
      sc.x,
      sc.y - 16,
      def.cssColor,
      `+${earned} 星くず`
    );

    // Fill Star Crate ("星の箱")
    const cap = this.gsm.getCrateCapacity();
    this.gsm.state.crateFill = Math.min(cap, this.gsm.state.crateFill + (isRare ? 3 : 1));
    this.addFeverCharge(def.feverGain);

    // Check Constellation Order slots
    let matchedOrder = false;
    for (let i = 0; i < this.currentOrder.items.length; i++) {
      if (
        !this.orderFilled[i] &&
        (this.currentOrder.items[i] === tk.tokenId || isRare)
      ) {
        this.orderFilled[i] = true;
        matchedOrder = true;
        break;
      }
    }

    if (matchedOrder) {
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
      if (this.orderFilled.every(Boolean)) {
        const order = this.currentOrder;
        const bonusDust = Math.round(order.bonusStardust * this.gsm.getStardustMultiplier());
        const bonusMiracles = order.bonusMiracles + Math.floor(this.gsm.state.upgrades.starCrateBackpack / 3);

        this.gsm.state.stardust += bonusDust;
        this.gsm.state.totalStardustEarned += bonusDust;
        this.gsm.state.miracles += bonusMiracles;
        this.gsm.state.totalOrdersCompleted += 1;

        this.sessionStats.ordersCompleted += 1;
        this.sessionStats.stardustEarned += bonusDust;
        this.sessionStats.miraclesEarned += bonusMiracles;
        this.sessionStats.score += bonusDust * 2;
        this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

        this.audio.playOrderCompleteSE(false);
        this.actor.triggerCelebrate();
        this.starScene.launchShootingStarArc(this.posX, 1.3, this.posZ);
        this.callbacks.onOrderCompleted(order.name, order.whisperMessage, bonusMiracles);
        this.pickOrder(this.orderIndex + 1);
      }
    }

    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private completeConstellationSpot(sp: SpotAlignState): void {
    const def = STAR_SPOTS[sp.id];
    sp.progress = 100;
    sp.cooldown = 3.2;
    sp.aligning = false;

    this.combo += 2;
    this.sessionStats.constellationsLit += 1;
    this.sessionStats.shootingStarsLaunched += def.starsAligned;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);
    this.gsm.state.totalMiraclesSent += 1;
    this.gsm.state.totalShootingStars += def.starsAligned;

    const earned = this.addStardust(68);
    const cap = this.gsm.getCrateCapacity();
    this.gsm.state.crateFill = Math.min(cap, this.gsm.state.crateFill + 2);
    this.addFeverCharge(12);

    this.audio.playConstellationCompleteSE();
    this.actor.triggerCelebrate();
    this.starScene.pulseSpot(sp.id);
    this.starScene.launchShootingStarArc(def.x, 0.9, def.z);
    this.starScene.updateManifestBoard(
      3 + this.gsm.state.totalShootingStars,
      12 + this.gsm.state.totalMiraclesSent
    );

    this.tmpVec.set(def.x, 1.15, def.z);
    const sc = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, 24, true);
    this.callbacks.onFloatingText(
      `🌠 ${def.tagLabel}`,
      sc.x,
      sc.y - 26,
      def.cssColor,
      `+${earned} 星くず`
    );
    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private handleCloudCollision(cl: ActiveCloudMist): void {
    this.starScene.worldGroup.remove(cl.group);
    this.invulnTimer = 1.15;

    this.tmpVec.set(this.posX, 0.9, this.posZ);
    const sc = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

    if (this.shieldsRemaining > 0) {
      this.shieldsRemaining -= 1;
      this.audio.playCloudHitSE(true);
      this.spawnFxBurst(sc.x, sc.y, '#9ec8ff', 16, true);
      this.callbacks.onFloatingText('🛏 やすらぎ防御！', sc.x, sc.y - 28, '#b4dcff');
      this.callbacks.onShieldChange(this.shieldsRemaining);
      return;
    }

    this.combo = 0;
    this.audio.playCloudHitSE(false);
    this.actor.triggerHitFlash();
    this.starScene.triggerShake(0.22, 0.32);
    this.spawnFxBurst(sc.x, sc.y, '#a888e6', 14, false);
    this.callbacks.onFloatingText('☁ 星が曇っちゃった…', sc.x, sc.y - 26, '#c8a8ff');
    this.callbacks.onComboChange(0, 1);
  }

  private spawnFxBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    withRing: boolean
  ): void {
    if (withRing) {
      this.fxParticles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        size: 16,
        color,
        alpha: 0.9,
        life: 0,
        maxLife: 0.45,
        kind: 'ring',
      });
    }
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 45 + Math.random() * 145;
      this.fxParticles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 20,
        size: 3 + Math.random() * 5,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.35,
        kind: i % 3 === 0 ? 'star' : 'spark',
      });
    }
  }

  private drawStarShape2D(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = HOSHIHAKOBI_TRACKS[this.gsm.state.selectedTrack];

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // STAR SHIFT cooldown & active duration
    if (this.shiftActiveTimer > 0) {
      this.shiftActiveTimer = Math.max(0, this.shiftActiveTimer - dt);
    }
    if (this.shiftCooldown > 0) {
      const maxCd = this.gsm.getStarShiftCooldownSec();
      this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
      this.callbacks.onShiftCooldownChange(
        1 - this.shiftCooldown / Math.max(0.1, maxCd),
        this.shiftCooldown <= 0,
        this.shiftActiveTimer > 0
      );
    }

    // Fever timer
    if (this.isFever) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      const pct = (this.feverRemaining / Math.max(1, this.gsm.getFeverDurationSec())) * 100;
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.feverCharge = 0;
        this.callbacks.onFeverChange(false, 0, 0);
      } else {
        this.callbacks.onFeverChange(true, pct, this.feverRemaining);
      }
    }

    // Passive stardust from Fluffy Bed upgrade
    if (active && this.gsm.state.upgrades.fluffyBed > 0) {
      this.passiveAccum += dt * this.gsm.state.upgrades.fluffyBed * 4;
      if (this.passiveAccum >= 1) {
        const gain = Math.floor(this.passiveAccum);
        this.passiveAccum -= gain;
        this.gsm.state.stardust += gain;
        this.gsm.state.totalStardustEarned += gain;
        this.sessionStats.stardustEarned += gain;
        this.callbacks.onStateDirty();
      }
    }

    // Beat-driven spawning
    if (active) {
      if (beatFloat >= this.nextTokenBeat) {
        this.spawnWishToken(this.isFever && Math.random() < 0.45);
        this.nextTokenBeat = beatFloat + track.spawnEveryBeats * (this.isFever ? 0.68 : 1);
      }
      if (beatFloat >= this.nextCloudBeat) {
        if (!this.isFever && Math.random() < track.cloudRate + 0.35) {
          this.spawnCloudMist();
        }
        this.nextCloudBeat = beatFloat + 3.6;
      }
    }

    // Player steering (WASD / Arrow keys or Pointer tap/drag)
    let moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let moveZ = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);

    if (active && moveX === 0 && moveZ === 0 && this.pointerTarget) {
      const dx = this.pointerTarget.x - this.posX;
      const dz = this.pointerTarget.z - this.posZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.14) {
        moveX = dx / dist;
        moveZ = dz / dist;
      } else {
        this.pointerTarget = null;
      }
    }

    const len = Math.hypot(moveX, moveZ);
    const maxSpeed = this.isFever ? 5.65 : 4.65;
    if (active && len > 0.01) {
      this.velX = (moveX / len) * maxSpeed;
      this.velZ = (moveZ / len) * maxSpeed;
    } else {
      const damp = Math.exp(-10 * dt);
      this.velX *= damp;
      this.velZ *= damp;
    }

    this.posX = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, this.posX + this.velX * dt));
    this.posZ = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, this.posZ + this.velZ * dt));

    // Gently slide around the central circular star workbench at (0, -0.35)
    const wbDx = this.posX;
    const wbDz = this.posZ + 0.35;
    const wbDist = Math.hypot(wbDx, wbDz);
    const minWbDist = 1.24;
    if (wbDist < minWbDist && wbDist > 0.001) {
      this.posX = (wbDx / wbDist) * minWbDist;
      this.posZ = -0.35 + (wbDz / wbDist) * minWbDist;
    }

    // Update wish-star tokens (bob, orbit, magnetize & collect)
    const reach = this.gsm.getReachRadius();
    const magnetRange = this.isFever ? 12.0 : reach * 1.45;
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const tk = this.tokens[i];
      if (tk.collected) {
        this.tokens.splice(i, 1);
        continue;
      }
      tk.age += dt;
      if (tk.age >= tk.maxAge) {
        this.starScene.worldGroup.remove(tk.group);
        this.tokens.splice(i, 1);
        continue;
      }

      const dx = this.posX - tk.x;
      const dz = this.posZ - tk.z;
      const dist = Math.hypot(dx, dz);

      if (active && dist < magnetRange && dist > 0.01) {
        const pull = (this.isFever ? 8.2 : 4.2) * (1 - dist / (magnetRange + 0.6));
        tk.x += (dx / dist) * pull * dt;
        tk.z += (dz / dist) * pull * dt;
      } else {
        tk.x += tk.vx * dt;
        tk.z += tk.vz * dt;
        if (Math.abs(tk.x) > PLAY_AREA_HALF_X - 0.3) tk.vx *= -1;
        if (tk.z < PLAY_AREA_MIN_Z + 0.3 || tk.z > PLAY_AREA_MAX_Z - 0.3) tk.vz *= -1;
      }

      tk.y = 0.58 + Math.sin(elapsed * 3.1 + tk.phase) * 0.14;
      tk.group.position.set(tk.x, tk.y, tk.z);
      tk.group.rotation.y = elapsed * 1.85 + tk.phase;

      if (active && dist < Math.max(0.85, reach * 0.68)) {
        this.collectToken(tk);
        this.tokens.splice(i, 1);
      }
    }

    // Update clouded star mist hazards
    const cloudSlow = this.isStarShifting ? 0.25 : 1.0;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cl = this.clouds[i];
      cl.age += dt * cloudSlow;
      if (cl.age >= cl.maxAge) {
        this.starScene.worldGroup.remove(cl.group);
        this.clouds.splice(i, 1);
        continue;
      }
      cl.x += cl.vx * dt * cloudSlow;
      cl.z += cl.vz * dt * cloudSlow;
      cl.group.position.set(cl.x, 0.56 + Math.sin(elapsed * 2.5 + cl.phase) * 0.08, cl.z);
      cl.group.rotation.y = elapsed * 1.6 + cl.phase;

      if (active && this.invulnTimer <= 0 && !this.isFever) {
        if (Math.hypot(cl.x - this.posX, cl.z - this.posZ) < cl.radius + 0.34) {
          this.clouds.splice(i, 1);
          this.handleCloudCollision(cl);
        }
      }
    }

    // Update 4 constellation miracle spots & draw live Starlight Wand beams
    let aligningAny = false;
    let lookSpot: { x: number; z: number } | null = null;
    const alignRate = this.gsm.getAlignRate();
    const beamPairs: { spotId: number; color: string }[] = [];

    for (const sp of this.spots) {
      const def = STAR_SPOTS[sp.id];
      if (sp.cooldown > 0) {
        sp.cooldown = Math.max(0, sp.cooldown - dt);
        if (sp.cooldown <= 0) {
          sp.progress = 26;
          sp.lastStepIndex = 1;
        }
        this.starScene.updateSpotVisual(sp.id, 100, false, true, false, elapsed);
        continue;
      }

      const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
      const inRange = active && (dist <= reach + 0.42 || this.isFever);

      if (inRange) {
        sp.aligning = true;
        aligningAny = true;
        if (!lookSpot) lookSpot = { x: def.x, z: def.z };
        const rate = this.isFever ? alignRate * 0.72 : alignRate;
        sp.progress = Math.min(100, sp.progress + rate * dt);
        beamPairs.push({ spotId: sp.id, color: def.cssColor });

        const stepIdx = Math.floor(sp.progress / 25);
        if (stepIdx > sp.lastStepIndex && stepIdx < 4) {
          sp.lastStepIndex = stepIdx;
          this.audio.playAlignStepSE(stepIdx);
          this.starScene.pulseSpot(sp.id);
        }

        if (sp.progress >= 100) {
          this.completeConstellationSpot(sp);
        }
      } else {
        sp.aligning = false;
        if (active && !this.isStarShifting) {
          sp.progress = Math.max(8, sp.progress - track.spotDrainSpeed * dt);
          sp.lastStepIndex = Math.floor(sp.progress / 25);
        }
      }

      const urgent = sp.progress < 25;
      this.starScene.updateSpotVisual(sp.id, sp.progress, urgent, false, sp.aligning, elapsed);
    }

    this.actor.setAligningStars(aligningAny);
    this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, lookSpot);

    // Render 2D FX Canvas (Starlight Wand constellation threads + sparkling star particles)
    this.fxCtx.clearRect(0, 0, this.fxW, this.fxH);

    if (beamPairs.length > 0 && active) {
      this.actor.getWandOriginWorldPos(this.tmpWandVec);
      const from = this.starScene.projectToScreen(this.tmpWandVec, this.fxW, this.fxH);

      for (const bp of beamPairs) {
        const def = STAR_SPOTS[bp.spotId];
        this.tmpVec.set(def.x, 0.56, def.z);
        const to = this.starScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

        this.fxCtx.save();
        this.fxCtx.strokeStyle = bp.color;
        this.fxCtx.lineWidth = this.isFever ? 3.4 : 2.6;
        this.fxCtx.shadowColor = bp.color;
        this.fxCtx.shadowBlur = 12;
        this.fxCtx.setLineDash([7, 6]);
        this.fxCtx.lineDashOffset = -elapsed * 55;
        this.fxCtx.beginPath();
        this.fxCtx.moveTo(from.x, from.y);
        const mx = (from.x + to.x) * 0.5;
        const my = (from.y + to.y) * 0.5 - 22;
        this.fxCtx.quadraticCurveTo(mx, my, to.x, to.y);
        this.fxCtx.stroke();
        this.fxCtx.restore();
      }
    }

    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fxParticles.splice(i, 1);
        continue;
      }
      const u = p.life / p.maxLife;
      const alpha = (1 - u) * p.alpha;
      this.fxCtx.save();
      this.fxCtx.globalAlpha = Math.max(0, alpha);
      if (p.kind === 'ring') {
        this.fxCtx.strokeStyle = p.color;
        this.fxCtx.lineWidth = 3 * (1 - u);
        this.fxCtx.beginPath();
        this.fxCtx.arc(p.x, p.y, p.size + u * 68, 0, Math.PI * 2);
        this.fxCtx.stroke();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 60 * dt;
        this.fxCtx.fillStyle = p.color;
        if (p.kind === 'star') {
          this.drawStarShape2D(this.fxCtx, p.x, p.y, p.size * (1 - u * 0.35));
        } else {
          this.fxCtx.beginPath();
          this.fxCtx.arc(p.x, p.y, p.size * (1 - u * 0.4), 0, Math.PI * 2);
          this.fxCtx.fill();
        }
      }
      this.fxCtx.restore();
    }
  }
}
