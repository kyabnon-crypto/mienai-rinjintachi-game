import * as THREE from 'three';
import { KazoeruAudioEngine } from './audioEngine';
import {
  KAZOERU_TRACKS,
  MEMORY_TOKEN_LIST,
  MEMORY_TOKEN_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  TALLY_ORDERS,
  TALLY_SPOTS,
} from './config';
import { KazoeruActor } from './kazoeruActor';
import { ParkStudyScene } from './parkStudyScene';
import { KazoeruStateManager } from './state';
import { KazoeruRunStats, MemoryTokenId, TallyOrderDef } from './types';

interface ActiveMemoryToken {
  id: number;
  tokenId: MemoryTokenId;
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

interface ActiveForgetGust {
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

interface SpotProgressState {
  id: number;
  progress: number; // 0..100 (each 20 = 1 stroke of 正, 100 = complete 正!)
  cooldown: number; // golden celebration hold after completing 正
  writing: boolean;
  lastStrokeIndex: number;
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
  kind: 'spark' | 'ring' | 'star' | 'tally';
}

export interface CountingSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: TallyOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, starsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onSwingTallyCooldownChange: (pct: number, ready: boolean, boosting: boolean) => void;
}

export class CountingSystem {
  private parkScene: ParkStudyScene;
  private actor: KazoeruActor;
  private audio: KazoeruAudioEngine;
  private gsm: KazoeruStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: CountingSystemCallbacks;

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
  private tokens: ActiveMemoryToken[] = [];
  private gusts: ActiveForgetGust[] = [];
  private spots: SpotProgressState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared 3D geometries for collectible memory tokens & hazards
  private orbGeo = new THREE.SphereGeometry(0.16, 14, 12);
  private teardropGeo = new THREE.ConeGeometry(0.13, 0.3, 12);
  private effortGeo = new THREE.OctahedronGeometry(0.18, 0);
  private beadRingGeo = new THREE.TorusGeometry(0.16, 0.032, 8, 20);
  private starDiscGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.055, 18);
  private starHaloGeo = new THREE.OctahedronGeometry(0.28, 0);
  private gustCoreGeo = new THREE.TorusKnotGeometry(0.24, 0.072, 34, 6, 2, 3);

  // Beat cursors & timers
  private nextTokenBeat = 0;
  private nextGustBeat = 0;
  private passiveAccum = 0;
  private swingTallyCooldown = 0;
  private swingBoostTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: TallyOrderDef = TALLY_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: KazoeruRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpHandVec = new THREE.Vector3();

  constructor(
    parkScene: ParkStudyScene,
    actor: KazoeruActor,
    audio: KazoeruAudioEngine,
    gsm: KazoeruStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: CountingSystemCallbacks
  ) {
    this.parkScene = parkScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initSpots();
    this.pickOrder(0);
  }

  public get isSwingBoostActive(): boolean {
    return this.swingBoostTimer > 0;
  }

  private createEmptyStats(): KazoeruRunStats {
    return {
      score: 0,
      tokensGathered: 0,
      talliesCompleted: 0,
      ordersCompleted: 0,
      scrollsArchived: 0,
      gustsCalmed: 0,
      maxCombo: 0,
      marksEarned: 0,
      starsEarned: 0,
    };
  }

  private initSpots(): void {
    this.spots = TALLY_SPOTS.map((s, idx) => ({
      id: s.id,
      progress: 42 + idx * 10,
      cooldown: 0,
      writing: false,
      lastStrokeIndex: Math.floor((42 + idx * 10) / 20),
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
    const world = this.parkScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    let spotId: number | null = null;
    for (const s of TALLY_SPOTS) {
      if (Math.hypot(tx - s.x, tz - s.z) < 1.25) {
        spotId = s.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, spotId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextTokenBeat = beatFloat + 0.5;
    this.nextGustBeat = beatFloat + 4.0;
  }

  public resetSession(spawnStarterTokens: boolean): void {
    for (const tk of this.tokens) this.parkScene.worldGroup.remove(tk.group);
    for (const g of this.gusts) this.parkScene.worldGroup.remove(g.group);
    this.tokens = [];
    this.gusts = [];
    this.fxParticles = [];

    this.posX = 0;
    this.posZ = 0.55;
    this.velX = 0;
    this.velZ = 0;
    this.pointerTarget = null;
    this.actor.setMotion(this.posX, this.posZ, 0, 0, 1);

    this.combo = 0;
    this.isFever = false;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.swingTallyCooldown = 0;
    this.swingBoostTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initSpots();
    this.pickOrder(0);

    if (spawnStarterTokens) {
      this.spawnToken('smile', -1.8, -0.5);
      this.spawnToken('effort', 1.8, -0.5);
      this.spawnToken('tear', 0.0, 1.45);
      this.spawnToken('bead', -1.5, 1.65);
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onSwingTallyCooldownChange(1, true, false);
    this.callbacks.onStateDirty();
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % TALLY_ORDERS.length;
    this.currentOrder = TALLY_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMult(): number {
    return 1 + Math.min(2.0, this.combo * 0.05);
  }

  private incrementCombo(): void {
    this.combo += 1;
    if (this.combo > this.sessionStats.maxCombo) {
      this.sessionStats.maxCombo = this.combo;
    }
    if (this.combo > this.gsm.state.bestCombo) {
      this.gsm.state.bestCombo = this.combo;
    }
    this.callbacks.onComboChange(this.combo, this.getComboMult());
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    this.combo = 0;
    this.callbacks.onComboChange(0, 1);
  }

  private addFeverCharge(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private createTokenMesh(tokenId: MemoryTokenId): THREE.Group {
    const def = MEMORY_TOKEN_MAP[tokenId];
    const g = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: 0.72,
      roughness: 0.24,
      metalness: tokenId === 'starTally' ? 0.6 : 0.12,
    });

    if (tokenId === 'smile') {
      const sun = new THREE.Mesh(this.orbGeo, mat);
      g.add(sun);
      const ring = new THREE.Mesh(
        this.beadRingGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff2ba, transparent: true, opacity: 0.75 })
      );
      ring.rotation.x = Math.PI / 3;
      g.add(ring);
    } else if (tokenId === 'tear') {
      const drop = new THREE.Mesh(this.teardropGeo, mat);
      drop.position.y = 0.04;
      g.add(drop);
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), mat);
      base.position.y = -0.07;
      g.add(base);
    } else if (tokenId === 'effort') {
      const crystal = new THREE.Mesh(this.effortGeo, mat);
      crystal.scale.set(0.9, 1.35, 0.9);
      g.add(crystal);
      const ring = new THREE.Mesh(
        this.beadRingGeo,
        new THREE.MeshBasicMaterial({ color: 0xffd2be, transparent: true, opacity: 0.7 })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    } else if (tokenId === 'bead') {
      const marble = new THREE.Mesh(this.orbGeo, mat);
      g.add(marble);
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xe6fff8 })
      );
      g.add(inner);
    } else {
      // Rare ⭐ 星の正の字 medallion
      const disc = new THREE.Mesh(this.starDiscGeo, mat);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
      const halo = new THREE.Mesh(
        this.starHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfff6be,
          wireframe: true,
          transparent: true,
          opacity: 0.88,
        })
      );
      g.add(halo);
    }

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.parkScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: tokenId === 'starTally' ? 0.92 : 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sprite.scale.setScalar(tokenId === 'starTally' ? 1.45 : 1.05);
    g.add(sprite);

    return g;
  }

  private chooseTokenId(): MemoryTokenId {
    const rareBoost = this.gsm.state.upgrades.jarCollection * 3.5;
    const needed = this.currentOrder.items.filter((_, idx) => !this.orderFilled[idx]);

    const weights = MEMORY_TOKEN_LIST.map((def) => {
      let w = def.weight;
      if (def.id === 'starTally') w += rareBoost;
      if (needed.includes(def.id)) w *= 1.48;
      return { id: def.id, w };
    });

    const total = weights.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const item of weights) {
      r -= item.w;
      if (r <= 0) return item.id;
    }
    return 'smile';
  }

  private spawnToken(forcedId?: MemoryTokenId, forcedX?: number, forcedZ?: number): void {
    const tokenId = forcedId ?? this.chooseTokenId();
    const x =
      forcedX !== undefined
        ? forcedX
        : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.6);
    const z =
      forcedZ !== undefined
        ? forcedZ
        : PLAY_AREA_MIN_Z + 0.5 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.0);

    const group = this.createTokenMesh(tokenId);
    group.position.set(x, 0.78, z);
    this.parkScene.worldGroup.add(group);

    this.tokens.push({
      id: this.nextEntityId++,
      tokenId,
      group,
      x,
      y: 0.78,
      z,
      vx: (Math.random() - 0.5) * 0.42,
      vz: (Math.random() - 0.5) * 0.36,
      age: 0,
      maxAge: tokenId === 'starTally' ? 11.5 : 13.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnForgetGust(): void {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -PLAY_AREA_HALF_X - 0.8 : PLAY_AREA_HALF_X + 0.8;
    const startZ = PLAY_AREA_MIN_Z + 0.7 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.4);
    const speed = 1.45 + Math.random() * 0.65;
    const vx = fromLeft ? speed : -speed;
    const vz = (Math.random() - 0.5) * 0.42;

    const g = new THREE.Group();
    const core = new THREE.Mesh(
      this.gustCoreGeo,
      new THREE.MeshStandardMaterial({
        color: 0x3b2f5e,
        emissive: 0x624496,
        emissiveIntensity: 0.55,
        roughness: 0.45,
      })
    );
    g.add(core);
    const mist = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.parkScene.glowTex,
        color: 0x7b56b8,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mist.scale.set(1.5, 1.5, 1);
    g.add(mist);
    g.position.set(startX, 0.75, startZ);
    this.parkScene.worldGroup.add(g);

    this.gusts.push({
      id: this.nextEntityId++,
      group: g,
      x: startX,
      z: startZ,
      vx,
      vz,
      age: 0,
      maxAge: 10.5,
      phase: Math.random() * Math.PI * 2,
      radius: 0.56,
    });
  }

  private spawnFxBurst(
    wx: number,
    wy: number,
    wz: number,
    color: string,
    count = 10,
    includeTallyMark = false
  ): void {
    this.tmpVec.set(wx, wy, wz);
    const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (!pt.visible) return;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 48 + Math.random() * 110;
      this.fxParticles.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 26,
        size: 2.5 + Math.random() * 3.8,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        kind: i % 3 === 0 ? 'star' : 'spark',
      });
    }

    this.fxParticles.push({
      x: pt.x,
      y: pt.y,
      vx: 0,
      vy: 0,
      size: 16,
      color,
      alpha: 0.9,
      life: 0,
      maxLife: 0.46,
      kind: 'ring',
    });

    if (includeTallyMark) {
      this.fxParticles.push({
        x: pt.x,
        y: pt.y - 12,
        vx: 0,
        vy: -36,
        size: 28,
        color: '#fff4b2',
        alpha: 1,
        life: 0,
        maxLife: 0.85,
        kind: 'tally',
      });
    }
  }

  private collectToken(tk: ActiveMemoryToken): void {
    if (tk.collected) return;
    tk.collected = true;
    this.parkScene.worldGroup.remove(tk.group);

    const def = MEMORY_TOKEN_MAP[tk.tokenId];
    const track = KAZOERU_TRACKS[this.audio.currentTrackId];
    this.incrementCombo();

    const feverMult = this.isFever ? 2.0 : 1.0;
    const marks = Math.max(
      1,
      Math.round(def.baseValue * this.gsm.getMarksMultiplier() * this.getComboMult() * track.valueMultiplier * feverMult)
    );

    this.gsm.state.marks += marks;
    this.gsm.state.totalMarksEarned += marks;
    this.sessionStats.marksEarned += marks;
    this.sessionStats.tokensGathered += 1;
    this.sessionStats.score += Math.round(marks * 1.15);
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    // Fill notebook page toward Scroll Archive (0..12)
    const cap = this.gsm.getNotebookCapacity();
    if (this.gsm.state.notebookFill < cap) {
      this.gsm.state.notebookFill = Math.min(cap, this.gsm.state.notebookFill + (tk.tokenId === 'starTally' ? 2 : 1));
    }

    this.addFeverCharge(def.feverGain);
    this.actor.triggerPickupPop();
    this.audio.playGatherTokenSE(this.combo, tk.tokenId === 'starTally');

    this.tmpVec.set(tk.x, tk.y + 0.35, tk.z);
    const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `${def.icon} +${marks}`,
        pt.x,
        pt.y,
        def.cssColor,
        def.wordText
      );
    }
    this.spawnFxBurst(tk.x, tk.y, tk.z, def.cssColor, tk.tokenId === 'starTally' ? 16 : 9, tk.tokenId === 'starTally');

    // Check active "きょうのかぞえオーダー"
    const slotIdx = this.currentOrder.items.findIndex(
      (id, i) => !this.orderFilled[i] && (id === tk.tokenId || tk.tokenId === 'starTally')
    );
    if (slotIdx !== -1) {
      this.orderFilled[slotIdx] = true;
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);

      if (this.orderFilled.every(Boolean)) {
        const bonusMarks = Math.round(
          this.currentOrder.bonusMarks * this.gsm.getMarksMultiplier() * (this.isFever ? 1.5 : 1)
        );
        const bonusStars = this.currentOrder.bonusStars + Math.floor(this.gsm.state.upgrades.scrollShelf / 3);
        this.gsm.state.marks += bonusMarks;
        this.gsm.state.totalMarksEarned += bonusMarks;
        this.gsm.state.stars += bonusStars;
        this.gsm.state.totalOrdersCompleted += 1;

        this.sessionStats.marksEarned += bonusMarks;
        this.sessionStats.starsEarned += bonusStars;
        this.sessionStats.ordersCompleted += 1;
        this.sessionStats.score += 240;

        this.actor.triggerCelebrate();
        this.parkScene.triggerSwingBoost(0.5);
        this.audio.playOrderCompleteSE(false);
        this.callbacks.onOrderCompleted(
          this.currentOrder.name,
          this.currentOrder.whisperMessage,
          bonusStars
        );
        this.pickOrder(this.orderIndex + 1);
      }
    }

    this.callbacks.onStateDirty();
  }

  private completeSpotTally(spot: SpotProgressState): void {
    const def = TALLY_SPOTS[spot.id];
    const track = KAZOERU_TRACKS[this.audio.currentTrackId];
    spot.progress = 100;
    spot.cooldown = 3.2;
    spot.writing = false;
    spot.lastStrokeIndex = 5;

    this.incrementCombo();
    const feverMult = this.isFever ? 2.0 : 1.0;
    const marks = Math.round(52 * this.gsm.getMarksMultiplier() * this.getComboMult() * track.valueMultiplier * feverMult);

    this.gsm.state.marks += marks;
    this.gsm.state.totalMarksEarned += marks;
    this.gsm.state.totalTallies += 1;
    if (def.category === 'smile') this.gsm.state.totalSmilesCounted += 1;
    else if (def.category === 'tear') this.gsm.state.totalTearsCounted += 1;
    else if (def.category === 'effort') this.gsm.state.totalEffortsCounted += 1;
    else {
      // Bench count adds to effort too!
      this.gsm.state.totalEffortsCounted += 1;
    }

    // Sync live 3D chalkboards & mechanical tally counter!
    this.parkScene.syncCounts(
      this.gsm.state.totalSmilesCounted,
      this.gsm.state.totalTearsCounted,
      this.gsm.state.totalEffortsCounted,
      this.gsm.state.totalTallies
    );

    this.sessionStats.marksEarned += marks;
    this.sessionStats.talliesCompleted += 1;
    this.sessionStats.score += Math.round(marks * 1.45);
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.addFeverCharge(11.5);
    this.actor.triggerCelebrate();
    this.parkScene.triggerSwingBoost(0.6);
    this.audio.playTallyCompleteSE();
    this.spawnFxBurst(def.x, 1.35, def.z, def.cssColor, 18, true);

    this.tmpVec.set(def.x, 1.9, def.z);
    const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `正 完成！ +${marks}`,
        pt.x,
        pt.y,
        '#fff5b8',
        def.completedLine
      );
    }

    this.callbacks.onStateDirty();
  }

  /** Active Skill: 「数え鳴らし (SWING TALLY)」 */
  public triggerSwingTally(): boolean {
    if (this.swingTallyCooldown > 0) return false;
    const cd = this.gsm.getSwingTallyCooldownSec();
    const radius = this.gsm.getSwingTallyRadius();

    this.swingTallyCooldown = cd;
    this.swingBoostTimer = 2.0;

    this.actor.triggerSwingWave(radius);
    this.parkScene.triggerSwingBoost(0.85);
    this.parkScene.triggerShake(0.16, 0.22);
    this.audio.playSwingTallySE();
    this.spawnFxBurst(this.posX, 0.9, this.posZ, '#ffe49c', 16, true);

    // 1. Calm all Forgetful Gusts within radius into bonus ひかりの印
    let calmed = 0;
    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const g = this.gusts[i];
      if (Math.hypot(g.x - this.posX, g.z - this.posZ) <= radius + 0.6) {
        this.parkScene.worldGroup.remove(g.group);
        this.gusts.splice(i, 1);
        calmed += 1;
        this.sessionStats.gustsCalmed += 1;
        const bonus = Math.round(30 * this.gsm.getMarksMultiplier() * (this.isFever ? 2 : 1));
        this.gsm.state.marks += bonus;
        this.gsm.state.totalMarksEarned += bonus;
        this.sessionStats.marksEarned += bonus;
        this.sessionStats.score += 90;
        this.incrementCombo();
        this.addFeverCharge(7);
        this.spawnFxBurst(g.x, 0.85, g.z, '#a6d4ff', 12, false);
      }
    }

    // 2. Magnet-pull nearby memory tokens directly to Kazoeru
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const tk = this.tokens[i];
      if (Math.hypot(tk.x - this.posX, tk.z - this.posZ) <= radius) {
        this.collectToken(tk);
        this.tokens.splice(i, 1);
      }
    }

    // 3. Advance all 4 tally spots by +2 strokes (+40%!)
    for (const sp of this.spots) {
      if (sp.cooldown > 0) continue;
      sp.progress = Math.min(100, sp.progress + 40);
      sp.lastStrokeIndex = Math.floor(sp.progress / 20);
      if (sp.progress >= 100) {
        this.completeSpotTally(sp);
      }
    }

    this.tmpVec.set(this.posX, 1.85, this.posZ);
    const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        calmed > 0 ? `きい…こ！ 夜風浄化 ×${calmed}` : 'きい…こ！ 数え鳴らし！',
        pt.x,
        pt.y,
        '#ffe8a2',
        '全スポット＋2画＆ひかり吸引'
      );
    }

    this.callbacks.onSwingTallyCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Roll up completed notebook page into a ribbon-tied scroll */
  public archiveScroll(): boolean {
    const cap = this.gsm.getNotebookCapacity();
    if (this.gsm.state.notebookFill < cap) return false;

    this.gsm.state.notebookFill = 0;
    const stars = this.gsm.getStarsPerScroll();
    const marks = Math.round(95 * this.gsm.getMarksMultiplier() * (this.isFever ? 1.5 : 1));
    this.gsm.state.stars += stars;
    this.gsm.state.marks += marks;
    this.gsm.state.totalMarksEarned += marks;
    this.gsm.state.totalScrollsArchived += 1;

    this.sessionStats.starsEarned += stars;
    this.sessionStats.marksEarned += marks;
    this.sessionStats.scrollsArchived += 1;
    this.sessionStats.score += 300;

    this.parkScene.spawnScrollArchiveArc(this.posX, this.posZ);
    this.parkScene.triggerSwingBoost(0.5);
    this.actor.triggerCelebrate();
    this.audio.playOrderCompleteSE(true);
    this.spawnFxBurst(this.posX, 1.15, this.posZ, '#ffe69a', 18, true);

    this.tmpVec.set(this.posX, 1.9, this.posZ);
    const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `📜 巻物まとめ！ +${stars}⭐`,
        pt.x,
        pt.y,
        '#fff4b2',
        `ひかりの印 +${marks}`
      );
    }

    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate STARLIGHT TALLY Fever */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 0;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverStartSE();
    this.parkScene.triggerSwingBoost(1.0);
    this.parkScene.triggerShake(0.2, 0.3);

    // Transform all active Forgetful Gusts into rare ⭐ 星の正の字!
    for (const g of this.gusts) {
      this.parkScene.worldGroup.remove(g.group);
      this.spawnToken('starTally', g.x, g.z);
      this.sessionStats.gustsCalmed += 1;
    }
    this.gusts = [];

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = KAZOERU_TRACKS[this.audio.currentTrackId];

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.swingBoostTimer > 0) this.swingBoostTimer = Math.max(0, this.swingBoostTimer - dt);

    // Update Swing Tally cooldown
    const maxCd = this.gsm.getSwingTallyCooldownSec();
    if (this.swingTallyCooldown > 0) {
      this.swingTallyCooldown = Math.max(0, this.swingTallyCooldown - dt);
    }
    const cdPct = maxCd > 0 ? 1 - this.swingTallyCooldown / maxCd : 1;
    this.callbacks.onSwingTallyCooldownChange(cdPct, this.swingTallyCooldown <= 0, this.swingBoostTimer > 0);

    // Fever countdown
    if (this.isFever) {
      this.feverRemaining -= dt;
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.feverRemaining = 0;
        this.callbacks.onFeverChange(false, 0, 0);
      } else {
        const pct = (this.feverRemaining / Math.max(1, this.gsm.getFeverDurationSec())) * 100;
        this.callbacks.onFeverChange(true, pct, this.feverRemaining);
      }
    }

    if (active) {
      // Passive marks from knitScarf upgrade
      const scarfLv = this.gsm.state.upgrades.knitScarf;
      if (scarfLv > 0) {
        this.passiveAccum += dt * scarfLv * 4;
        if (this.passiveAccum >= 1) {
          const add = Math.floor(this.passiveAccum);
          this.passiveAccum -= add;
          this.gsm.state.marks += add;
          this.gsm.state.totalMarksEarned += add;
          this.sessionStats.marksEarned += add;
          this.callbacks.onStateDirty();
        }
      }

      // 1. Player Movement (WASD / Arrow keys / Pointer tap-drag)
      let moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      let moveZ = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      const maxSpeed = this.isFever ? 6.6 : 5.4;

      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        moveX = (moveX / len) * maxSpeed;
        moveZ = (moveZ / len) * maxSpeed;
      } else if (this.pointerTarget) {
        const dx = this.pointerTarget.x - this.posX;
        const dz = this.pointerTarget.z - this.posZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.14) {
          const spd = Math.min(maxSpeed, dist * 5.2);
          moveX = (dx / dist) * spd;
          moveZ = (dz / dist) * spd;
        } else {
          this.pointerTarget = null;
        }
      }

      const accel = 1 - Math.exp(-14 * dt);
      this.velX += (moveX - this.velX) * accel;
      this.velZ += (moveZ - this.velZ) * accel;
      this.posX = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, this.posX + this.velX * dt));
      this.posZ = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, this.posZ + this.velZ * dt));

      // 2. Beat-synced Spawning of Memory Lights & Forgetful Gusts
      if (beatFloat >= this.nextTokenBeat) {
        this.nextTokenBeat = beatFloat + (this.isFever ? track.spawnEveryBeats * 0.72 : track.spawnEveryBeats);
        if (this.tokens.length < track.maxActiveTokens + (this.isFever ? 4 : 0)) {
          this.spawnToken(this.isFever && Math.random() < 0.28 ? 'starTally' : undefined);
        }
      }

      if (!this.isFever && beatFloat >= this.nextGustBeat) {
        this.nextGustBeat = beatFloat + 3.8 + Math.random() * 2.2;
        if (Math.random() < track.gustRate + 0.48 && this.gusts.length < 4) {
          this.spawnForgetGust();
        }
      }

      // 3. Update & Gather Collectible Memory Tokens
      const reach = this.gsm.getReachRadius() * (this.isFever ? 1.55 : 1.0);
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const tk = this.tokens[i];
        tk.age += dt;
        if (tk.age >= tk.maxAge) {
          this.parkScene.worldGroup.remove(tk.group);
          this.tokens.splice(i, 1);
          continue;
        }

        const dx = this.posX - tk.x;
        const dz = this.posZ - tk.z;
        const dist = Math.hypot(dx, dz);

        if (this.isFever || dist < reach * 1.45) {
          const pull = this.isFever ? 7.8 : 5.4;
          tk.x += (dx / Math.max(0.1, dist)) * pull * dt;
          tk.z += (dz / Math.max(0.1, dist)) * pull * dt;
        } else {
          tk.x += tk.vx * dt;
          tk.z += tk.vz * dt;
          if (Math.abs(tk.x) > PLAY_AREA_HALF_X - 0.3) tk.vx *= -1;
          if (tk.z < PLAY_AREA_MIN_Z + 0.3 || tk.z > PLAY_AREA_MAX_Z - 0.3) tk.vz *= -1;
        }

        tk.y = 0.76 + Math.sin(elapsed * 2.8 + tk.phase) * 0.14;
        tk.group.position.set(tk.x, tk.y, tk.z);
        tk.group.rotation.y = elapsed * 1.6 + tk.phase;

        const fadeOut = tk.maxAge - tk.age < 1.5 ? (tk.maxAge - tk.age) / 1.5 : 1;
        tk.group.scale.setScalar(0.35 + fadeOut * 0.65);

        if (dist < Math.max(0.85, reach * 0.78)) {
          this.collectToken(tk);
          this.tokens.splice(i, 1);
        }
      }

      // 4. Update Forgetful Gusts (Hazards)
      for (let i = this.gusts.length - 1; i >= 0; i--) {
        const g = this.gusts[i];
        g.age += dt;
        g.x += g.vx * dt;
        g.z += g.vz * dt + Math.sin(elapsed * 2.4 + g.phase) * 0.35 * dt;
        g.group.position.set(g.x, 0.75 + Math.sin(elapsed * 3.5 + g.phase) * 0.12, g.z);
        g.group.rotation.y = elapsed * 2.8;
        g.group.rotation.x = elapsed * 1.6;

        if (g.age >= g.maxAge || Math.abs(g.x) > PLAY_AREA_HALF_X + 2.2) {
          this.parkScene.worldGroup.remove(g.group);
          this.gusts.splice(i, 1);
          continue;
        }

        if (this.invulnTimer <= 0 && Math.hypot(g.x - this.posX, g.z - this.posZ) < g.radius + 0.45) {
          this.parkScene.worldGroup.remove(g.group);
          this.gusts.splice(i, 1);
          this.invulnTimer = 1.05;

          if (this.shieldsRemaining > 0) {
            this.shieldsRemaining -= 1;
            this.callbacks.onShieldChange(this.shieldsRemaining);
            this.audio.playGustBumpSE(true);
            this.spawnFxBurst(this.posX, 0.9, this.posZ, '#9ccaff', 12, false);
            this.tmpVec.set(this.posX, 1.8, this.posZ);
            const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
            if (pt.visible) {
              this.callbacks.onFloatingText('🧶 ニット帽のぬくもり防御！', pt.x, pt.y, '#9ccaff');
            }
          } else {
            this.breakCombo();
            this.actor.triggerHitFlash();
            this.parkScene.triggerShake(0.24, 0.25);
            this.audio.playGustBumpSE(false);
            this.tmpVec.set(this.posX, 1.8, this.posZ);
            const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
            if (pt.visible) {
              this.callbacks.onFloatingText('忘却の夜風…', pt.x, pt.y, '#c2a6ff', '⏳ 数え鳴らしで浄化しよう');
            }
          }
        }
      }

      // 5. Update 4 Progressive 「正」 Tally Spots
      let anyWriting = false;
      let nearestSpotLook: { x: number; z: number } | null = null;
      const writeRate = this.gsm.getTallyWriteRate();

      for (const sp of this.spots) {
        const def = TALLY_SPOTS[sp.id];
        if (sp.cooldown > 0) {
          sp.cooldown = Math.max(0, sp.cooldown - dt);
          sp.writing = false;
          if (sp.cooldown <= 0) {
            sp.progress = 20; // Start fresh with 1 gentle stroke
            sp.lastStrokeIndex = 1;
          }
          this.parkScene.updateSpotVisual(sp.id, 100, false, true, elapsed);
          continue;
        }

        const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
        const inRange = dist <= reach + 0.35 || this.isFever;
        sp.writing = inRange;

        if (inRange) {
          anyWriting = true;
          if (!nearestSpotLook && dist <= reach + 0.35) {
            nearestSpotLook = { x: def.x, z: def.z };
          }
          sp.progress = Math.min(100, sp.progress + writeRate * (this.isFever ? 0.85 : 1.0) * dt);
          const strokeIdx = Math.floor(sp.progress / 20);
          if (strokeIdx > sp.lastStrokeIndex && strokeIdx < 5) {
            sp.lastStrokeIndex = strokeIdx;
            this.audio.playStrokeTickSE(strokeIdx);
            this.spawnFxBurst(def.x, 1.25, def.z, def.cssColor, 6, false);
          }
          if (sp.progress >= 100) {
            this.completeSpotTally(sp);
          }
        } else {
          // Gently fades if neglected, never drops below 6% so it always invites Kazoeru
          sp.progress = Math.max(6, sp.progress - track.spotFadeSpeed * dt);
          sp.lastStrokeIndex = Math.floor(sp.progress / 20);
        }

        this.parkScene.updateSpotVisual(sp.id, sp.progress, sp.writing, false, elapsed);
      }

      this.actor.setWritingTally(anyWriting);
      this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, nearestSpotLook);
    } else {
      this.actor.setWritingTally(false);
      for (const sp of this.spots) {
        this.parkScene.updateSpotVisual(sp.id, sp.progress, false, false, elapsed);
      }
    }

    // 6. Render 2D FX Canvas (Writing beams, sparkles, rings, pointer beacon)
    this.renderFxOverlay(dt, active);
  }

  private renderFxOverlay(dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Draw golden writing beams from Kazoeru's notebook to any active tally spot
    if (active) {
      this.actor.getNotebookOriginWorldPos(this.tmpHandVec);
      const handPt = this.parkScene.projectToScreen(this.tmpHandVec, this.fxW, this.fxH);

      if (handPt.visible) {
        for (const sp of this.spots) {
          if (!sp.writing) continue;
          const def = TALLY_SPOTS[sp.id];
          this.tmpVec.set(def.x, 1.35, def.z);
          const spPt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
          if (!spPt.visible) continue;

          ctx.save();
          const grad = ctx.createLinearGradient(handPt.x, handPt.y, spPt.x, spPt.y);
          grad.addColorStop(0, 'rgba(255, 224, 148, 0.85)');
          grad.addColorStop(1, def.cssColor);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3.2;
          ctx.shadowColor = def.cssColor;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(handPt.x, handPt.y);
          const midX = (handPt.x + spPt.x) * 0.5;
          const midY = (handPt.y + spPt.y) * 0.5 - 24;
          ctx.quadraticCurveTo(midX, midY, spPt.x, spPt.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Soft moonlit pointer destination beacon
      if (this.pointerTarget) {
        this.tmpVec.set(this.pointerTarget.x, 0.05, this.pointerTarget.z);
        const pt = this.parkScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
        if (pt.visible) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 226, 152, 0.58)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(pt.x, pt.y, 16, 9, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Update & render 2D particles
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fxParticles.splice(i, 1);
        continue;
      }
      const u = p.life / p.maxLife;
      const alpha = (1 - u) * p.alpha;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * (1 - u);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + u * 44, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'tally') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#ffd268';
        ctx.shadowBlur = 14;
        ctx.font = `900 ${Math.round(p.size * (0.95 + u * 0.25))}px 'Zen Maru Gothic', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('正', p.x, p.y);
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(u * 4);
        const r = p.size * (1 - u * 0.4);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.5);
        ctx.lineTo(r * 0.45, -r * 0.45);
        ctx.lineTo(r * 1.5, 0);
        ctx.lineTo(r * 0.45, r * 0.45);
        ctx.lineTo(0, r * 1.5);
        ctx.lineTo(-r * 0.45, r * 0.45);
        ctx.lineTo(-r * 1.5, 0);
        ctx.lineTo(-r * 0.45, -r * 0.45);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - u * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
