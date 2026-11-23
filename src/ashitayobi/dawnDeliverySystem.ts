import * as THREE from 'three';
import { AshitayobiActor } from './ashitayobiActor';
import { AshitayobiAudioEngine } from './audioEngine';
import {
  ASHITAYOBI_TRACKS,
  DAWN_DELIVERY_ORDERS,
  DAWN_TOKEN_LIST,
  DAWN_TOKEN_MAP,
  DAWN_WINDOW_SPOTS,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
} from './config';
import { create3DSunriseSunGeometry, DawnPostOfficeScene } from './dawnPostOfficeScene';
import { AshitayobiStateManager } from './state';
import { AshitayobiRunStats, DawnDeliveryOrderDef, DawnLightTokenId } from './types';

interface ActiveDawnToken {
  id: number;
  tokenId: DawnLightTokenId;
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

interface ActiveNightGloom {
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

interface WindowSpotState {
  id: number;
  progress: number; // 0..100 (100 = morning delivered to window!)
  cooldown: number;
  delivering: boolean;
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
  kind: 'spark' | 'ring' | 'sun';
}

export interface DawnDeliverySystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: DawnDeliveryOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, bottlesEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onDawnWaveCooldownChange: (pct: number, ready: boolean, delivering: boolean) => void;
}

export class DawnDeliverySystem {
  private postScene: DawnPostOfficeScene;
  private actor: AshitayobiActor;
  private audio: AshitayobiAudioEngine;
  private gsm: AshitayobiStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: DawnDeliverySystemCallbacks;

  private fxW = 1280;
  private fxH = 720;

  // Steering & movement
  private keys = { up: false, down: false, left: false, right: false };
  private pointerTarget: { x: number; z: number; spotId: number | null } | null = null;
  private posX = 0;
  private posZ = 0.72;
  private velX = 0;
  private velZ = 0;

  // Entities
  private nextEntityId = 1;
  private tokens: ActiveDawnToken[] = [];
  private glooms: ActiveNightGloom[] = [];
  private windowSpots: WindowSpotState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared 3D geometries for dawn lights & sleepless night gloom clouds ("眠れぬ夜霧")
  private specialSunGeo = create3DSunriseSunGeometry(0.23);
  private smileSunGeo = create3DSunriseSunGeometry(0.18);
  private courageOrbGeo = new THREE.SphereGeometry(0.16, 14, 12);
  private gentleDropGeo = new THREE.DodecahedronGeometry(0.16, 0);
  private wishStarGeo = new THREE.OctahedronGeometry(0.17, 0);
  private gloomPuffGeo = new THREE.SphereGeometry(0.22, 12, 10);
  private gloomRingGeo = new THREE.TorusGeometry(0.32, 0.045, 8, 24);

  // Beat cursors & timers
  private nextTokenBeat = 0;
  private nextGloomBeat = 0;
  private passiveAccum = 0;
  private dawnWaveCooldown = 0;
  private dawnWaveActiveTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: DawnDeliveryOrderDef = DAWN_DELIVERY_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: AshitayobiRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpJarVec = new THREE.Vector3();

  constructor(
    postScene: DawnPostOfficeScene,
    actor: AshitayobiActor,
    audio: AshitayobiAudioEngine,
    gsm: AshitayobiStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: DawnDeliverySystemCallbacks
  ) {
    this.postScene = postScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initWindowSpots();
    this.pickOrder(0);
  }

  public get isDeliveringWave(): boolean {
    return this.dawnWaveActiveTimer > 0;
  }

  private createEmptyStats(): AshitayobiRunStats {
    return {
      score: 0,
      lightsGathered: 0,
      morningsDelivered: 0,
      windowsLit: 0,
      ordersCompleted: 0,
      satchelsDispatched: 0,
      gloomsCleared: 0,
      maxCombo: 0,
      glowEarned: 0,
      bottlesEarned: 0,
    };
  }

  private initWindowSpots(): void {
    this.windowSpots = DAWN_WINDOW_SPOTS.map((p, idx) => ({
      id: p.id,
      progress: 44 + idx * 9,
      cooldown: 0,
      delivering: false,
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
    const world = this.postScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    let spotId: number | null = null;
    for (const p of DAWN_WINDOW_SPOTS) {
      if (Math.hypot(tx - p.x, tz - p.z) < 1.28) {
        spotId = p.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, spotId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextTokenBeat = beatFloat + 0.5;
    this.nextGloomBeat = beatFloat + 4.2;
  }

  public resetSession(spawnStarterTokens: boolean): void {
    for (const tk of this.tokens) this.postScene.worldGroup.remove(tk.group);
    for (const gl of this.glooms) this.postScene.worldGroup.remove(gl.group);
    this.tokens = [];
    this.glooms = [];
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
    this.dawnWaveCooldown = 0;
    this.dawnWaveActiveTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initWindowSpots();
    this.pickOrder(Math.floor(Math.random() * DAWN_DELIVERY_ORDERS.length));

    if (spawnStarterTokens) {
      for (let i = 0; i < 4; i++) {
        this.spawnDawnToken(false);
      }
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onDawnWaveCooldownChange(1, true, false);
    this.callbacks.onStateDirty();
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % DAWN_DELIVERY_ORDERS.length;
    this.currentOrder = DAWN_DELIVERY_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMult(): number {
    return 1 + Math.min(2.0, this.combo * 0.045);
  }

  private chooseTokenType(forceRare = false): DawnLightTokenId {
    if (forceRare) return 'specialDawn';
    const ledgerBonus = this.gsm.state.upgrades.loadingLedger * 3.5;
    const weights = DAWN_TOKEN_LIST.map((t) =>
      t.id === 'specialDawn' ? t.weight + ledgerBonus : t.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < DAWN_TOKEN_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return DAWN_TOKEN_LIST[i].id;
    }
    return 'courageDawn';
  }

  private spawnDawnToken(forceRare = false, spawnPos?: { x: number; z: number }): void {
    const track = ASHITAYOBI_TRACKS[this.gsm.state.selectedTrack];
    if (!forceRare && this.tokens.length >= track.maxActiveTokens) return;

    const tokenId = this.chooseTokenType(forceRare);
    const def = DAWN_TOKEN_MAP[tokenId];

    let x = spawnPos ? spawnPos.x : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
    let z = spawnPos
      ? spawnPos.z
      : PLAY_AREA_MIN_Z + 0.45 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.9);

    // Keep clear of central sorting table at (0, -0.35)
    if (!spawnPos && Math.hypot(x, z + 0.35) < 1.32) {
      x += x >= 0 ? 1.4 : -1.4;
      x = Math.max(-PLAY_AREA_HALF_X + 0.4, Math.min(PLAY_AREA_HALF_X - 0.4, x));
    }

    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: tokenId === 'specialDawn' ? 1.5 : 1.05,
      roughness: 0.26,
      metalness: tokenId === 'wishDawn' ? 0.38 : 0.18,
    });

    const geo =
      tokenId === 'specialDawn'
        ? this.specialSunGeo
        : tokenId === 'smileDawn'
          ? this.smileSunGeo
          : tokenId === 'courageDawn'
            ? this.courageOrbGeo
            : tokenId === 'wishDawn'
              ? this.wishStarGeo
              : this.gentleDropGeo;

    const core = new THREE.Mesh(geo, mat);
    core.castShadow = true;
    group.add(core);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.postScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: tokenId === 'specialDawn' ? 0.94 : 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const haloScale = tokenId === 'specialDawn' ? 1.22 : 0.9;
    halo.scale.set(haloScale, haloScale, 1);
    group.add(halo);

    group.position.set(x, 0.56, z);
    this.postScene.worldGroup.add(group);

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
      maxAge: tokenId === 'specialDawn' ? 13.5 : 15.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnNightGloom(): void {
    if (this.isFever || this.glooms.length >= 4) return;
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
    const gloomMat = new THREE.MeshStandardMaterial({
      color: 0x323b58,
      emissive: 0x1a2240,
      emissiveIntensity: 0.72,
      roughness: 0.9,
      transparent: true,
      opacity: 0.86,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x829ad0,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    // Cluster of 3 sleepless night clouds representing "眠れぬ夜霧"
    const puffA = new THREE.Mesh(this.gloomPuffGeo, gloomMat);
    const puffB = new THREE.Mesh(this.gloomPuffGeo, gloomMat);
    puffB.scale.setScalar(0.75);
    puffB.position.set(0.18, 0.06, -0.06);
    const puffC = new THREE.Mesh(this.gloomPuffGeo, gloomMat);
    puffC.scale.setScalar(0.72);
    puffC.position.set(-0.17, 0.04, 0.08);

    const warnRing = new THREE.Mesh(this.gloomRingGeo, ringMat);
    warnRing.rotation.x = Math.PI / 2;
    warnRing.position.y = -0.26;
    group.add(puffA, puffB, puffC, warnRing);

    group.position.set(x, 0.55, z);
    this.postScene.worldGroup.add(group);

    this.glooms.push({
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

  /** Special Action: "特別な朝焼け" DAWN DELIVERY — open the special sunrise light! */
  public triggerDawnWave(): boolean {
    if (this.dawnWaveCooldown > 0) return false;

    const maxRadius = this.gsm.getDawnWaveRadius();
    this.dawnWaveCooldown = this.gsm.getDawnWaveCooldownSec();
    this.dawnWaveActiveTimer = this.gsm.getDawnWaveDurationSec();

    this.actor.triggerDawnWave(maxRadius);
    this.postScene.triggerDawnWaveFlash();
    this.postScene.triggerShake(0.13, 0.22);
    this.audio.playDawnWaveSE();

    this.tmpVec.set(this.posX, 0.85, this.posZ);
    const sc = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffb868', 22, true);
    this.callbacks.onFloatingText(
      '🌅 「特別な朝焼け！」',
      sc.x,
      sc.y - 34,
      '#ffd278',
      '全窓辺＋36%'
    );

    // Dispel sleepless night gloom within radius and convert into bonus dawn glow!
    let cleared = 0;
    for (let i = this.glooms.length - 1; i >= 0; i--) {
      const gl = this.glooms[i];
      if (Math.hypot(gl.x - this.posX, gl.z - this.posZ) <= maxRadius) {
        this.tmpVec.set(gl.x, 0.6, gl.z);
        const cp = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
        this.spawnFxBurst(cp.x, cp.y, '#ffb8d0', 12, false);
        this.postScene.worldGroup.remove(gl.group);
        this.glooms.splice(i, 1);
        cleared++;
        this.sessionStats.gloomsCleared++;
        this.addGlow(28, cp.x, cp.y, '🌅 夜霧晴れ +28');
        this.addFeverCharge(5.5);
      }
    }

    // Draw dawn light tokens within radius straight into Ashitayobi's dawn satchel
    for (const tk of this.tokens) {
      if (tk.collected) continue;
      if (Math.hypot(tk.x - this.posX, tk.z - this.posZ) <= maxRadius) {
        this.collectToken(tk);
      }
    }

    // Warm all 4 sleeping window spots by +36% and launch an ascending dawn ray!
    for (const sp of this.windowSpots) {
      if (sp.cooldown > 0) continue;
      sp.progress = Math.min(100, sp.progress + 36);
      this.postScene.pulseWindowSpot(sp.id);
      if (sp.progress >= 100) {
        this.completeWindowSpot(sp);
      }
    }
    this.postScene.launchDawnDeliveryArc(this.posX, 1.25, this.posZ, 0xffa858);

    if (cleared > 0) {
      this.callbacks.onFloatingText(
        `✨ ${cleared}つの夜霧を朝焼けで晴らした！`,
        sc.x,
        sc.y - 68,
        '#ffc8a0'
      );
    }

    this.callbacks.onDawnWaveCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Dispatch full Dawn Satchel ("朝焼け鞄で町へ出発！") for Tomorrow Bottles + big Dawn Glow! */
  public dispatchDawnSatchel(): boolean {
    const cap = this.gsm.getSatchelCapacity();
    if (this.gsm.state.satchelFill < cap) return false;

    this.gsm.state.satchelFill = 0;
    const bottlesGain = this.gsm.getBottlesPerSatchelDispatch();
    const glowGain = Math.round(
      115 *
        this.gsm.getGlowMultiplier() *
        ASHITAYOBI_TRACKS[this.gsm.state.selectedTrack].valueMultiplier *
        (this.isFever ? 2 : 1)
    );

    this.gsm.state.bottles += bottlesGain;
    this.gsm.state.totalSatchelsDispatched += 1;
    this.gsm.state.totalWindowsLit += 3;
    this.gsm.state.glow += glowGain;
    this.gsm.state.totalGlowEarned += glowGain;

    this.sessionStats.satchelsDispatched += 1;
    this.sessionStats.windowsLit += 3;
    this.sessionStats.bottlesEarned += bottlesGain;
    this.sessionStats.glowEarned += glowGain;
    this.sessionStats.score += Math.round(glowGain * 1.45);
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    this.audio.playSatchelDispatchSE();
    this.actor.triggerCelebrate();
    this.postScene.triggerShake(0.14, 0.25);

    const arcCols = [0xff8a3a, 0xff6f9f, 0xffc040];
    for (let i = 0; i < 3; i++) {
      this.postScene.launchDawnDeliveryArc(
        this.posX + (i - 1) * 0.35,
        1.15 + i * 0.15,
        this.posZ,
        arcCols[i]
      );
    }
    this.postScene.updateLedgerBoard(
      24 + this.gsm.state.totalSatchelsDispatched * 12 + this.gsm.state.totalWindowsLit,
      6 + this.gsm.state.totalMorningsDelivered
    );

    this.tmpVec.set(this.posX, 1.1, this.posZ);
    const sc = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffd278', 26, true);
    this.callbacks.onFloatingText(
      `👜 朝焼け鞄で配達！ +${bottlesGain} あしたの小瓶`,
      sc.x,
      sc.y - 42,
      '#fff0b8',
      `朝焼けの光 +${glowGain.toLocaleString('ja-JP')}`
    );

    this.addFeverCharge(14);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate GOLDEN DAYBREAK ("夜明けの特別配達") fever mode */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverSE();
    this.actor.triggerCelebrate();
    this.postScene.triggerDawnWaveFlash();
    this.postScene.triggerShake(0.18, 0.35);

    // Transform every active night gloom cloud into a rare Special Dawn!
    for (const gl of this.glooms) {
      this.postScene.worldGroup.remove(gl.group);
      this.spawnDawnToken(true, { x: gl.x, z: gl.z });
    }
    this.glooms = [];

    // Launch radiant sunrise streams soaring out the grand arched window
    const cols = [0xff8a3a, 0xff6f9f, 0xffc040, 0xffa858, 0xfff0c0];
    for (let i = 0; i < 5; i++) {
      this.postScene.launchDawnDeliveryArc((i - 2) * 1.4, 1.3, -0.5, cols[i]);
    }

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private addFeverCharge(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private addGlow(rawBase: number, sx?: number, sy?: number, customLabel?: string): number {
    const track = ASHITAYOBI_TRACKS[this.gsm.state.selectedTrack];
    const earned = Math.max(
      1,
      Math.round(
        rawBase *
          this.gsm.getGlowMultiplier() *
          track.valueMultiplier *
          this.getComboMult() *
          (this.isFever ? 2 : 1)
      )
    );
    this.gsm.state.glow += earned;
    this.gsm.state.totalGlowEarned += earned;
    this.sessionStats.glowEarned += earned;
    this.sessionStats.score += earned;
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    if (typeof sx === 'number' && typeof sy === 'number') {
      this.callbacks.onFloatingText(customLabel || `+${earned}`, sx, sy, '#ffd890');
    }
    return earned;
  }

  private collectToken(tk: ActiveDawnToken): void {
    if (tk.collected) return;
    tk.collected = true;
    this.postScene.worldGroup.remove(tk.group);

    const def = DAWN_TOKEN_MAP[tk.tokenId];
    this.combo += 1;
    this.sessionStats.lightsGathered += 1;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);

    const isRare = tk.tokenId === 'specialDawn';
    this.audio.playDawnCollectSE(this.combo, isRare);
    this.actor.triggerPickupPop();

    this.tmpVec.set(tk.x, 0.7, tk.z);
    const sc = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, isRare ? 20 : 11, isRare);

    const earned = this.addGlow(def.baseValue);
    this.callbacks.onFloatingText(
      `${def.icon} ${def.shortName}`,
      sc.x,
      sc.y - 16,
      def.cssColor,
      `+${earned} 朝焼けの光`
    );

    // Fill Dawn Satchel ("大きな朝焼け鞄")
    const cap = this.gsm.getSatchelCapacity();
    this.gsm.state.satchelFill = Math.min(cap, this.gsm.state.satchelFill + (isRare ? 3 : 1));
    this.addFeverCharge(def.feverGain);

    // Check Dawn Delivery Order slots
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
        const bonusGlow = Math.round(order.bonusGlow * this.gsm.getGlowMultiplier());
        const bonusBottles =
          order.bonusBottles + Math.floor(this.gsm.state.upgrades.dawnSatchel / 3);

        this.gsm.state.glow += bonusGlow;
        this.gsm.state.totalGlowEarned += bonusGlow;
        this.gsm.state.bottles += bonusBottles;
        this.gsm.state.totalOrdersCompleted += 1;

        this.sessionStats.ordersCompleted += 1;
        this.sessionStats.glowEarned += bonusGlow;
        this.sessionStats.bottlesEarned += bonusBottles;
        this.sessionStats.score += bonusGlow * 2;
        this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

        this.audio.playOrderCompleteSE(false);
        this.actor.triggerCelebrate();
        this.postScene.launchDawnDeliveryArc(this.posX, 1.3, this.posZ, 0xffc868);
        this.callbacks.onOrderCompleted(order.name, order.whisperMessage, bonusBottles);
        this.pickOrder(this.orderIndex + 1);
      }
    }

    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private completeWindowSpot(sp: WindowSpotState): void {
    const def = DAWN_WINDOW_SPOTS[sp.id];
    sp.progress = 100;
    sp.cooldown = 3.2;
    sp.delivering = false;

    this.combo += 2;
    this.sessionStats.morningsDelivered += 1;
    this.sessionStats.windowsLit += def.morningsDelivered;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);
    this.gsm.state.totalMorningsDelivered += 1;
    this.gsm.state.totalWindowsLit += def.morningsDelivered;

    const earned = this.addGlow(68);
    const cap = this.gsm.getSatchelCapacity();
    this.gsm.state.satchelFill = Math.min(cap, this.gsm.state.satchelFill + 2);
    this.addFeverCharge(12);

    this.audio.playWindowDeliveredSE();
    this.actor.triggerCelebrate();
    this.postScene.pulseWindowSpot(sp.id);
    this.postScene.launchDawnDeliveryArc(def.x, 1.05, def.z, def.accentHex);
    this.postScene.updateLedgerBoard(
      24 + this.gsm.state.totalSatchelsDispatched * 12 + this.gsm.state.totalWindowsLit,
      6 + this.gsm.state.totalMorningsDelivered
    );

    this.tmpVec.set(def.x, 1.2, def.z);
    const sc = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, 24, true);
    this.callbacks.onFloatingText(
      `🌅 ${def.tagLabel}`,
      sc.x,
      sc.y - 26,
      def.cssColor,
      `+${earned} 朝焼けの光`
    );
    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private handleGloomCollision(gl: ActiveNightGloom): void {
    this.postScene.worldGroup.remove(gl.group);
    this.invulnTimer = 1.15;

    this.tmpVec.set(this.posX, 0.9, this.posZ);
    const sc = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

    if (this.shieldsRemaining > 0) {
      this.shieldsRemaining -= 1;
      this.audio.playGloomHitSE(true);
      this.spawnFxBurst(sc.x, sc.y, '#ffd884', 16, true);
      this.callbacks.onFloatingText('🧣 大丈夫のぬくもり！', sc.x, sc.y - 28, '#ffe092');
      this.callbacks.onShieldChange(this.shieldsRemaining);
      return;
    }

    this.combo = 0;
    this.audio.playGloomHitSE(false);
    this.actor.triggerHitFlash();
    this.postScene.triggerShake(0.22, 0.32);
    this.spawnFxBurst(sc.x, sc.y, '#88a4d4', 14, false);
    this.callbacks.onFloatingText('☁ 眠れぬ夜霧にふれた…', sc.x, sc.y - 26, '#a4bee6');
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
        kind: i % 3 === 0 ? 'sun' : 'spark',
      });
    }
  }

  private drawSunRayShape2D(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.5 : r;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = ASHITAYOBI_TRACKS[this.gsm.state.selectedTrack];

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // DAWN DELIVERY cooldown & active duration
    if (this.dawnWaveActiveTimer > 0) {
      this.dawnWaveActiveTimer = Math.max(0, this.dawnWaveActiveTimer - dt);
    }
    if (this.dawnWaveCooldown > 0) {
      const maxCd = this.gsm.getDawnWaveCooldownSec();
      this.dawnWaveCooldown = Math.max(0, this.dawnWaveCooldown - dt);
      this.callbacks.onDawnWaveCooldownChange(
        1 - this.dawnWaveCooldown / Math.max(0.1, maxCd),
        this.dawnWaveCooldown <= 0,
        this.dawnWaveActiveTimer > 0
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

    // Passive dawn glow from Mixing Desk upgrade
    if (active && this.gsm.state.upgrades.mixingDesk > 0) {
      this.passiveAccum += dt * this.gsm.state.upgrades.mixingDesk * 4;
      if (this.passiveAccum >= 1) {
        const gain = Math.floor(this.passiveAccum);
        this.passiveAccum -= gain;
        this.gsm.state.glow += gain;
        this.gsm.state.totalGlowEarned += gain;
        this.sessionStats.glowEarned += gain;
        this.callbacks.onStateDirty();
      }
    }

    // Beat-driven spawning
    if (active) {
      if (beatFloat >= this.nextTokenBeat) {
        this.spawnDawnToken(this.isFever && Math.random() < 0.45);
        this.nextTokenBeat = beatFloat + track.spawnEveryBeats * (this.isFever ? 0.68 : 1);
      }
      if (beatFloat >= this.nextGloomBeat) {
        if (!this.isFever && Math.random() < track.gloomRate + 0.35) {
          this.spawnNightGloom();
        }
        this.nextGloomBeat = beatFloat + 3.6;
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

    // Gently slide around the central sorting table at (0, -0.35)
    const pbDx = this.posX;
    const pbDz = this.posZ + 0.35;
    const pbDist = Math.hypot(pbDx, pbDz);
    const minPbDist = 1.22;
    if (pbDist < minPbDist && pbDist > 0.001) {
      this.posX = (pbDx / pbDist) * minPbDist;
      this.posZ = -0.35 + (pbDz / pbDist) * minPbDist;
    }

    // Update dawn tokens (bob, magnetize & gather into jar)
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
        this.postScene.worldGroup.remove(tk.group);
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

    // Update sleepless night gloom clouds
    const gloomSlow = this.isDeliveringWave ? 0.25 : 1.0;
    for (let i = this.glooms.length - 1; i >= 0; i--) {
      const gl = this.glooms[i];
      gl.age += dt * gloomSlow;
      if (gl.age >= gl.maxAge) {
        this.postScene.worldGroup.remove(gl.group);
        this.glooms.splice(i, 1);
        continue;
      }
      gl.x += gl.vx * dt * gloomSlow;
      gl.z += gl.vz * dt * gloomSlow;
      gl.group.position.set(gl.x, 0.56 + Math.sin(elapsed * 2.5 + gl.phase) * 0.08, gl.z);
      gl.group.rotation.y = elapsed * 1.6 + gl.phase;

      if (active && this.invulnTimer <= 0 && !this.isFever) {
        if (Math.hypot(gl.x - this.posX, gl.z - this.posZ) < gl.radius + 0.34) {
          this.glooms.splice(i, 1);
          this.handleGloomCollision(gl);
        }
      }
    }

    // Update 4 Dawn Window Delivery Spots & draw warm sunrise threads from Ashitayobi's dawn jar
    let deliveringAny = false;
    let lookSpot: { x: number; z: number } | null = null;
    const deliverRate = this.gsm.getDeliverRate();
    const beamPairs: { spotId: number; color: string }[] = [];

    for (const sp of this.windowSpots) {
      const def = DAWN_WINDOW_SPOTS[sp.id];
      if (sp.cooldown > 0) {
        sp.cooldown = Math.max(0, sp.cooldown - dt);
        if (sp.cooldown <= 0) {
          sp.progress = 26;
          sp.lastStepIndex = 1;
        }
        this.postScene.updateWindowSpotVisual(sp.id, 100, false, true, false, elapsed);
        continue;
      }

      const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
      const inRange = active && (dist <= reach + 0.44 || this.isFever);

      if (inRange) {
        sp.delivering = true;
        deliveringAny = true;
        if (!lookSpot) lookSpot = { x: def.x, z: def.z };
        const rate = this.isFever ? deliverRate * 0.72 : deliverRate;
        sp.progress = Math.min(100, sp.progress + rate * dt);
        beamPairs.push({ spotId: sp.id, color: def.cssColor });

        const stepIdx = Math.floor(sp.progress / 25);
        if (stepIdx > sp.lastStepIndex && stepIdx < 4) {
          sp.lastStepIndex = stepIdx;
          this.audio.playDeliverStepSE(stepIdx);
          this.postScene.pulseWindowSpot(sp.id);
        }

        if (sp.progress >= 100) {
          this.completeWindowSpot(sp);
        }
      } else {
        sp.delivering = false;
        if (active && !this.isDeliveringWave) {
          sp.progress = Math.max(8, sp.progress - track.windowDrainSpeed * dt);
          sp.lastStepIndex = Math.floor(sp.progress / 25);
        }
      }

      const urgent = sp.progress < 25;
      this.postScene.updateWindowSpotVisual(
        sp.id,
        sp.progress,
        urgent,
        false,
        sp.delivering,
        elapsed
      );
    }

    this.actor.setDeliveringDawn(deliveringAny);
    this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, lookSpot);

    // Render 2D FX Canvas (Dawn Glass Jar light threads + sunrise ray particles)
    this.fxCtx.clearRect(0, 0, this.fxW, this.fxH);

    if (beamPairs.length > 0 && active) {
      this.actor.getJarOriginWorldPos(this.tmpJarVec);
      const from = this.postScene.projectToScreen(this.tmpJarVec, this.fxW, this.fxH);

      for (const bp of beamPairs) {
        const def = DAWN_WINDOW_SPOTS[bp.spotId];
        this.tmpVec.set(def.x, 0.85, def.z);
        const to = this.postScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

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
        if (p.kind === 'sun') {
          this.drawSunRayShape2D(this.fxCtx, p.x, p.y, p.size * (1 - u * 0.35));
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
