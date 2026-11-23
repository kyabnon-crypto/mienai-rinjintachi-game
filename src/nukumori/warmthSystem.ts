import * as THREE from 'three';
import { NukumoriAudioEngine } from './audioEngine';
import {
  BENCH_SPOTS,
  NUKUMORI_TRACKS,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  WARMTH_ITEM_LIST,
  WARMTH_ITEM_MAP,
  WARMTH_ORDERS,
} from './config';
import { NukumoriActor } from './nukumoriActor';
import { NukumoriStateManager } from './state';
import { NukumoriRunStats, WarmthItemId, WarmthOrderDef } from './types';
import { VendingScene } from './vendingScene';

interface BenchRuntime {
  id: number;
  x: number;
  z: number;
  temp: number; // 0 (frozen) .. 100 (cozy warm)
  wasChilly: boolean; // armed to award Warm Smile once warmed to >= 88
  warmingNow: boolean;
  visitorTimer: number;
  cooldownTimer: number;
}

interface FloatingWarmthItem {
  uid: number;
  id: WarmthItemId;
  x: number;
  z: number;
  age: number;
  maxAge: number;
  bobPhase: number;
  mesh: THREE.Group;
  collected: boolean;
  magnetized: boolean;
}

interface FrostGust {
  uid: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
  mesh: THREE.Group;
  cleared: boolean;
}

interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  ring?: boolean;
}

export interface WarmthSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: WarmthOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, bottlesEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onWaveCooldownChange: (readyPct: number, ready: boolean) => void;
}

export class WarmthSystem {
  private scene: VendingScene;
  private actor: NukumoriActor;
  private audio: NukumoriAudioEngine;
  private gsm: NukumoriStateManager;
  private cb: WarmthSystemCallbacks;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private fxW = 1280;
  private fxH = 720;

  private itemsGroup = new THREE.Group();
  private frostsGroup = new THREE.Group();
  private items: FloatingWarmthItem[] = [];
  private frosts: FrostGust[] = [];
  private benches: BenchRuntime[] = [];
  private fxParticles: FxParticle[] = [];

  private nextUid = 1;
  private lastSpawnBeat = -999;
  private lastResonanceBeat = -999;

  // Steering & movement
  public playerX = 0;
  public playerZ = 0.7;
  private playerVx = 0;
  private playerVz = 0;
  private pointerTarget: { x: number; z: number } | null = null;
  private pointerTargetBenchId: number | null = null;
  private keys = { up: false, down: false, left: false, right: false };

  // Gameplay counters
  public combo = 0;
  public shieldsRemaining = 0;
  public isFever = false;
  public feverGauge = 0; // 0..100
  private feverRemaining = 0;
  private waveCooldown = 0;
  private activeOrderIdx = 0;
  private activeOrderFilled: boolean[] = [false, false, false];
  private activeBeatPhase = 0;

  public sessionStats: NukumoriRunStats = {
    benchesWarmed: 0,
    itemsCollected: 0,
    ordersCompleted: 0,
    frostsMelted: 0,
    maxCombo: 0,
    warmthEarned: 0,
    bottlesEarned: 0,
    score: 0,
  };

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpVec = new THREE.Vector3();
  private tmpHit = new THREE.Vector3();

  constructor(
    scene: VendingScene,
    actor: NukumoriActor,
    audio: NukumoriAudioEngine,
    gsm: NukumoriStateManager,
    fxCanvas: HTMLCanvasElement,
    cb: WarmthSystemCallbacks
  ) {
    this.scene = scene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.cb = cb;

    this.scene.worldGroup.add(this.itemsGroup);
    this.scene.worldGroup.add(this.frostsGroup);

    this.initBenches();
    this.resetSession(false);
  }

  private initBenches(): void {
    const startTemps = [46, 36, 58, 42];
    this.benches = BENCH_SPOTS.map((spot, idx) => ({
      id: spot.id,
      x: spot.x,
      z: spot.z,
      temp: startTemps[idx % startTemps.length],
      wasChilly: true,
      warmingNow: false,
      visitorTimer: 0,
      cooldownTimer: 0,
    }));
  }

  public resizeFx(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxW = Math.max(1, width);
    this.fxH = Math.max(1, height);
    this.fxCanvas.width = Math.round(this.fxW * dpr);
    this.fxCanvas.height = Math.round(this.fxH * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public resetSession(keepBenchVariety = true): void {
    this.clearAllEntities();
    this.playerX = 0;
    this.playerZ = 0.7;
    this.playerVx = 0;
    this.playerVz = 0;
    this.pointerTarget = null;
    this.pointerTargetBenchId = null;
    this.clearKeys();

    this.combo = 0;
    this.isFever = false;
    this.feverGauge = 0;
    this.feverRemaining = 0;
    this.waveCooldown = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();

    const startTemps = keepBenchVariety ? [44, 34, 56, 40] : [62, 62, 62, 62];
    this.benches.forEach((b, idx) => {
      b.temp = startTemps[idx % startTemps.length];
      b.wasChilly = true;
      b.warmingNow = false;
      b.visitorTimer = 0;
      b.cooldownTimer = 0;
    });

    this.sessionStats = {
      benchesWarmed: 0,
      itemsCollected: 0,
      ordersCompleted: 0,
      frostsMelted: 0,
      maxCombo: 0,
      warmthEarned: 0,
      bottlesEarned: 0,
      score: 0,
    };

    this.activeOrderIdx = Math.floor(Math.random() * WARMTH_ORDERS.length);
    this.activeOrderFilled = [false, false, false];

    this.actor.setMotion(this.playerX, this.playerZ, 0, 0, 1);
    this.actor.setWarmingBench(false);
    this.scene.setFocus(this.playerX, this.playerZ);

    this.cb.onComboChange(0, 1);
    this.cb.onShieldChange(this.shieldsRemaining);
    this.cb.onFeverChange(false, 0, 0);
    this.cb.onWaveCooldownChange(1, true);
    this.cb.onOrderChange(WARMTH_ORDERS[this.activeOrderIdx], [...this.activeOrderFilled]);
    this.cb.onStateDirty();
  }

  public resetBeatCursors(beatFloat: number): void {
    this.lastSpawnBeat = beatFloat - 0.8;
    this.lastResonanceBeat = Math.floor(beatFloat / 4) * 4;
  }

  public clearKeys(): void {
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
  }

  public setKey(dir: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    this.keys[dir] = down;
    if (down) {
      this.pointerTarget = null;
      this.pointerTargetBenchId = null;
    }
  }

  public setPointerTarget(virtualX: number, virtualY: number): void {
    const ndcX = (virtualX / this.fxW) * 2 - 1;
    const ndcY = -(virtualY / this.fxH) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.scene.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpHit)) return;

    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, this.tmpHit.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, this.tmpHit.z));

    // Snap nicely to a bench if tapped directly on or near a bench!
    let snappedBench: BenchRuntime | null = null;
    let bestDist = 1.45;
    for (const b of this.benches) {
      const d = Math.hypot(b.x - tx, b.z - tz);
      if (d < bestDist) {
        bestDist = d;
        snappedBench = b;
      }
    }

    if (snappedBench) {
      this.pointerTargetBenchId = snappedBench.id;
      // Stand slightly in front/side of the bench so Nukumori reaches out gently
      const standZ = snappedBench.z > 0.5 ? snappedBench.z - 0.82 : snappedBench.z + 0.86;
      this.pointerTarget = { x: snappedBench.x, z: standZ };
    } else {
      this.pointerTargetBenchId = null;
      this.pointerTarget = { x: tx, z: tz };
    }
  }

  private clearAllEntities(): void {
    for (const it of this.items) this.itemsGroup.remove(it.mesh);
    this.items = [];
    for (const f of this.frosts) this.frostsGroup.remove(f.mesh);
    this.frosts = [];
    this.fxParticles = [];
  }

  private worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.tmpVec.set(x, y, z).project(this.scene.camera);
    return {
      x: (this.tmpVec.x * 0.5 + 0.5) * this.fxW,
      y: (-this.tmpVec.y * 0.5 + 0.5) * this.fxH,
      visible: this.tmpVec.z < 1,
    };
  }

  private spawnFxBurst(
    sx: number,
    sy: number,
    color: string,
    count = 14,
    ring = true
  ): void {
    if (ring) {
      this.fxParticles.push({
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.42,
        size: 16,
        color,
        ring: true,
      });
    }
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.45;
      const spd = 48 + Math.random() * 110;
      this.fxParticles.push({
        x: sx,
        y: sy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 35,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.3,
        size: 3 + Math.random() * 4.2,
        color,
      });
    }
  }

  private pickWeightedItemId(): WarmthItemId {
    const starBonus = this.gsm.state.upgrades.redScarfBed * 5;
    const order = WARMTH_ORDERS[this.activeOrderIdx];
    const neededSet = new Set<WarmthItemId>();
    order.items.forEach((id, idx) => {
      if (!this.activeOrderFilled[idx]) neededSet.add(id);
    });

    const weights = WARMTH_ITEM_LIST.map((def) => {
      let w = def.weight;
      if (def.id === 'starsteam') w += starBonus + (this.isFever ? 18 : 0);
      if (neededSet.has(def.id)) w *= 1.48;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < WARMTH_ITEM_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return WARMTH_ITEM_LIST[i].id;
    }
    return 'steam';
  }

  private createWarmthMesh(id: WarmthItemId): THREE.Group {
    const def = WARMTH_ITEM_MAP[id];
    const g = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: id === 'starsteam' ? 1.15 : 0.72,
      roughness: 0.28,
      metalness: id === 'can' ? 0.55 : 0.15,
    });

    if (id === 'can') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 14), mat);
      can.position.y = 0.2;
      g.add(can);
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.16, 0.03, 14),
        new THREE.MeshStandardMaterial({ color: 0xe6eaf2, metalness: 0.85, roughness: 0.2 })
      );
      top.position.y = 0.39;
      g.add(top);
    } else if (id === 'scarf') {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat);
      ball.position.y = 0.22;
      g.add(ball);
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 8, 18), mat);
      ribbon.position.y = 0.22;
      ribbon.rotation.x = Math.PI * 0.35;
      g.add(ribbon);
    } else if (id === 'starsteam') {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat);
      core.position.y = 0.26;
      g.add(core);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.028, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff5c0, transparent: true, opacity: 0.85 })
      );
      halo.position.y = 0.26;
      halo.rotation.x = Math.PI / 2;
      g.add(halo);
    } else {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), mat);
      orb.position.y = 0.22;
      g.add(orb);
      const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat);
      wisp.position.set(0.12, 0.38, 0);
      g.add(wisp);
    }

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.scene.glowTex,
        color: def.colorHex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: id === 'starsteam' ? 0.88 : 0.62,
      })
    );
    sprite.scale.setScalar(id === 'starsteam' ? 1.55 : 1.05);
    sprite.position.y = 0.24;
    g.add(sprite);

    const shadowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 20),
      new THREE.MeshBasicMaterial({
        color: def.colorHex,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shadowRing.rotation.x = -Math.PI / 2;
    shadowRing.position.y = 0.03;
    g.add(shadowRing);

    return g;
  }

  private createFrostMesh(): THREE.Group {
    const g = new THREE.Group();
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x7ab8ff,
      emissive: 0x2658a8,
      emissiveIntensity: 0.78,
      transparent: true,
      opacity: 0.84,
      roughness: 0.18,
    });

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), iceMat);
    crystal.position.y = 0.48;
    crystal.scale.set(0.85, 1.35, 0.85);
    g.add(crystal);

    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x9fd0ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      })
    );
    swirl.rotation.x = Math.PI / 2;
    swirl.position.y = 0.36;
    g.add(swirl);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.scene.glowTex,
        color: 0x72b6ff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.56,
      })
    );
    glow.scale.setScalar(1.45);
    glow.position.y = 0.46;
    g.add(glow);

    return g;
  }

  private spawnWarmthItem(forceId?: WarmthItemId, customPos?: { x: number; z: number }): void {
    const track = NUKUMORI_TRACKS[this.gsm.state.selectedTrack];
    if (!customPos && this.items.length >= track.maxActiveItems) return;

    const id = forceId ?? this.pickWeightedItemId();
    let x = customPos ? customPos.x : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.7);
    let z = customPos ? customPos.z : PLAY_AREA_MIN_Z + 0.6 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.1);

    // Avoid spawning right on top of Nukumori so movement feels rewarding
    if (!customPos && Math.hypot(x - this.playerX, z - this.playerZ) < 1.35) {
      x = -x * 0.8;
    }

    const mesh = this.createWarmthMesh(id);
    mesh.position.set(x, 0, z);
    this.itemsGroup.add(mesh);

    this.items.push({
      uid: this.nextUid++,
      id,
      x,
      z,
      age: 0,
      maxAge: id === 'starsteam' ? 10.5 : 13.5,
      bobPhase: Math.random() * Math.PI * 2,
      mesh,
      collected: false,
      magnetized: false,
    });
  }

  private spawnFrostGust(): void {
    if (this.frosts.length >= 4 || this.isFever) return;
    // Aim gently toward one of the benches from outside the left/right snowy edges
    const targetBench = this.benches[Math.floor(Math.random() * this.benches.length)];
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -PLAY_AREA_HALF_X - 0.9 : PLAY_AREA_HALF_X + 0.9;
    const z = PLAY_AREA_MIN_Z + 0.5 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.6);

    const dx = targetBench.x - x;
    const dz = targetBench.z - z;
    const len = Math.max(0.1, Math.hypot(dx, dz));
    const speed = 1.45 + Math.random() * 0.55;

    const mesh = this.createFrostMesh();
    mesh.position.set(x, 0, z);
    this.frostsGroup.add(mesh);

    this.frosts.push({
      uid: this.nextUid++,
      x,
      z,
      vx: (dx / len) * speed,
      vz: (dz / len) * speed,
      age: 0,
      maxAge: 9.5,
      mesh,
      cleared: false,
    });
  }

  private getComboMult(): number {
    return 1 + Math.min(2.2, this.combo * 0.045);
  }

  private addCombo(delta = 1): void {
    this.combo += delta;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;
    this.cb.onComboChange(this.combo, this.getComboMult());
  }

  private advanceOrderWithItem(itemId: WarmthItemId, worldX: number, worldZ: number): void {
    const order = WARMTH_ORDERS[this.activeOrderIdx];
    let slotIdx = -1;
    if (itemId === 'starsteam') {
      slotIdx = this.activeOrderFilled.findIndex((f) => !f);
    } else {
      slotIdx = order.items.findIndex((req, idx) => !this.activeOrderFilled[idx] && req === itemId);
    }
    if (slotIdx === -1) return;

    this.activeOrderFilled[slotIdx] = true;
    const allFilled = this.activeOrderFilled.every(Boolean);
    if (!allFilled) {
      this.cb.onOrderChange(order, [...this.activeOrderFilled]);
      return;
    }

    // Complete Order!
    const mult = this.gsm.getWarmthMultiplier() * (this.isFever ? 2 : 1);
    const bonusWarmth = Math.round(order.bonusWarmth * mult);
    const bonusBottles = order.bonusBottles + Math.floor(this.gsm.state.upgrades.stoveKettle / 3);

    this.gsm.state.warmth += bonusWarmth;
    this.gsm.state.totalWarmthEarned += bonusWarmth;
    this.gsm.state.bottles += bonusBottles;
    this.gsm.state.totalOrdersCompleted += 1;

    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.warmthEarned += bonusWarmth;
    this.sessionStats.bottlesEarned += bonusBottles;
    this.sessionStats.score += bonusWarmth * 4;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.audio.playOrderCompleteSE(true);
    this.actor.onCelebrate();
    this.scene.triggerShake(0.14, 0.22);

    const pt = this.worldToScreen(worldX, 1.3, worldZ);
    this.spawnFxBurst(pt.x, pt.y, '#ffe29e', 26, true);
    this.cb.onFloatingText(
      `♨️ ${order.name} 達成！`,
      pt.x,
      pt.y - 24,
      '#ffe59e',
      `+${bonusWarmth} ぬくもり / +${bonusBottles} 白い息の小瓶`
    );
    this.cb.onOrderCompleted(order.name, order.whisperMessage, bonusBottles);

    // Next order
    this.activeOrderIdx = (this.activeOrderIdx + 1 + Math.floor(Math.random() * 2)) % WARMTH_ORDERS.length;
    this.activeOrderFilled = [false, false, false];
    this.cb.onOrderChange(WARMTH_ORDERS[this.activeOrderIdx], [...this.activeOrderFilled]);
    this.cb.onStateDirty();
  }

  private collectItem(item: FloatingWarmthItem): void {
    if (item.collected) return;
    item.collected = true;
    this.itemsGroup.remove(item.mesh);

    const def = WARMTH_ITEM_MAP[item.id];
    const track = NUKUMORI_TRACKS[this.gsm.state.selectedTrack];
    this.addCombo(1);

    const feverMult = this.isFever ? 2.0 : 1.0;
    const gain = Math.round(
      def.baseValue * track.valueMultiplier * this.gsm.getWarmthMultiplier() * this.getComboMult() * feverMult
    );

    this.gsm.state.warmth += gain;
    this.gsm.state.totalWarmthEarned += gain;
    this.gsm.state.canRackFill = Math.min(this.gsm.getCanRackCapacity(), this.gsm.state.canRackFill + 1);

    this.sessionStats.itemsCollected += 1;
    this.sessionStats.warmthEarned += gain;
    this.sessionStats.score += gain * 2;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    if (!this.isFever) {
      this.feverGauge = Math.min(100, this.feverGauge + def.feverGain);
      this.cb.onFeverChange(false, this.feverGauge, 0);
    }

    this.audio.playCollectSE(this.combo, item.id === 'starsteam');
    this.actor.onCollect();

    const pt = this.worldToScreen(item.x, 0.55, item.z);
    this.spawnFxBurst(pt.x, pt.y, def.cssColor, item.id === 'starsteam' ? 20 : 12, true);
    this.cb.onFloatingText(
      `${def.icon} +${gain}`,
      pt.x,
      pt.y - 10,
      def.cssColor,
      item.id === 'starsteam' ? 'ほっと星湯気！' : undefined
    );

    this.advanceOrderWithItem(item.id, item.x, item.z);
    this.cb.onStateDirty();
  }

  private completeBenchWarming(b: BenchRuntime): void {
    const spot = BENCH_SPOTS[b.id];
    const track = NUKUMORI_TRACKS[this.gsm.state.selectedTrack];
    const nearBeat = this.activeBeatPhase < 0.22 || this.activeBeatPhase > 0.78;

    b.wasChilly = false;
    b.visitorTimer = 5.4;
    b.cooldownTimer = 3.2;

    this.addCombo(2);
    const feverMult = this.isFever ? 2.0 : 1.0;
    const beatMult = nearBeat ? 1.25 : 1.0;
    const gain = Math.round(
      52 * track.valueMultiplier * this.gsm.getWarmthMultiplier() * this.getComboMult() * feverMult * beatMult
    );

    this.gsm.state.warmth += gain;
    this.gsm.state.totalWarmthEarned += gain;
    this.gsm.state.totalBenchesWarmed += 1;
    this.gsm.state.canRackFill = Math.min(this.gsm.getCanRackCapacity(), this.gsm.state.canRackFill + 2);

    this.sessionStats.benchesWarmed += 1;
    this.sessionStats.warmthEarned += gain;
    this.sessionStats.score += gain * 3;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    if (!this.isFever) {
      this.feverGauge = Math.min(100, this.feverGauge + (nearBeat ? 14 : 11));
      this.cb.onFeverChange(false, this.feverGauge, 0);
    }

    this.audio.playBenchWarmedSE(nearBeat);
    this.actor.onCelebrate();
    this.scene.triggerShake(0.1, 0.16);

    const pt = this.worldToScreen(b.x, 1.0, b.z);
    this.spawnFxBurst(pt.x, pt.y, '#ffd48a', 22, true);
    this.cb.onFloatingText(
      nearBeat ? `✨ PERFECT ぬくもり +${gain}` : `♨️ ほっと安心 +${gain}`,
      pt.x,
      pt.y - 16,
      '#ffe2a0',
      spot.visitorLine
    );

    // Warming a bench also fills one remaining slot in the active order!
    const order = WARMTH_ORDERS[this.activeOrderIdx];
    const nextIdx = this.activeOrderFilled.findIndex((f) => !f);
    if (nextIdx !== -1) {
      this.advanceOrderWithItem(order.items[nextIdx], b.x, b.z);
    }

    this.cb.onStateDirty();
  }

  /** Trigger Steam Wave (Space / Right action button) */
  public triggerSteamWave(): boolean {
    if (this.waveCooldown > 0) return false;
    const cd = this.gsm.getSteamWaveCooldownSec();
    this.waveCooldown = cd;
    const radius = this.gsm.getSteamWaveRadius();

    this.actor.onSteamWave(radius);
    this.scene.triggerShake(0.15, 0.22);

    let melted = 0;
    for (const f of this.frosts) {
      if (f.cleared) continue;
      if (Math.hypot(f.x - this.playerX, f.z - this.playerZ) <= radius + 1.2) {
        f.cleared = true;
        this.frostsGroup.remove(f.mesh);
        melted++;
        this.sessionStats.frostsMelted += 1;
        // Melted frost transforms into a cozy white-breath warmth seed!
        this.spawnWarmthItem('breath', { x: f.x, z: f.z });
        const pt = this.worldToScreen(f.x, 0.6, f.z);
        this.spawnFxBurst(pt.x, pt.y, '#cfe6ff', 14, true);
      }
    }

    // Magnetize nearby warmth items into Nukumori
    for (const it of this.items) {
      if (!it.collected && Math.hypot(it.x - this.playerX, it.z - this.playerZ) <= radius + 0.8) {
        it.magnetized = true;
      }
    }

    // Warm all 4 benches across the plaza via subterranean steam pipes!
    for (const b of this.benches) {
      const prev = b.temp;
      b.temp = Math.min(100, b.temp + 26);
      const bpt = this.worldToScreen(b.x, 0.8, b.z);
      this.spawnFxBurst(bpt.x, bpt.y, '#ffcb80', 10, false);
      if (b.wasChilly && prev < 88 && b.temp >= 88) {
        this.completeBenchWarming(b);
      }
    }

    this.audio.playSteamWaveSE(melted);
    const pPt = this.worldToScreen(this.playerX, 0.9, this.playerZ);
    this.spawnFxBurst(pPt.x, pPt.y, '#ffd898', 22, true);
    this.cb.onFloatingText(
      melted > 0 ? `♨️ 湯気ウェーブ！冷気 ${melted}個溶かした` : '♨️ 湯気ウェーブ！全ベンチ保温',
      pPt.x,
      pPt.y - 24,
      '#ffe2a0'
    );
    this.cb.onWaveCooldownChange(0, false);
    return true;
  }

  /** Deliver full Hot Can Rack (12 / 12) for White Breath Bottles & all-bench boost */
  public deliverHotCanRack(): boolean {
    const cap = this.gsm.getCanRackCapacity();
    if (this.gsm.state.canRackFill < cap) return false;

    this.gsm.state.canRackFill = 0;
    const bottlesEarned = this.gsm.getBottlesPerDelivery();
    const warmthBonus = Math.round(110 * this.gsm.getWarmthMultiplier() * (this.isFever ? 2 : 1));

    this.gsm.state.bottles += bottlesEarned;
    this.gsm.state.warmth += warmthBonus;
    this.gsm.state.totalWarmthEarned += warmthBonus;
    this.gsm.state.totalCanDeliveries += 1;

    this.sessionStats.bottlesEarned += bottlesEarned;
    this.sessionStats.warmthEarned += warmthBonus;
    this.sessionStats.score += warmthBonus * 3;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    // Warm all benches & celebrate
    for (const b of this.benches) {
      b.temp = Math.min(100, b.temp + 32);
      if (b.wasChilly && b.temp >= 88) {
        this.completeBenchWarming(b);
      }
    }

    this.audio.playOrderCompleteSE(true);
    this.actor.onCelebrate();
    this.scene.triggerShake(0.16, 0.24);

    const pt = this.worldToScreen(this.playerX, 1.35, this.playerZ);
    this.spawnFxBurst(pt.x, pt.y, '#ffb870', 28, true);
    this.cb.onFloatingText(
      `🥫 あったか〜い差し入れ完了！`,
      pt.x,
      pt.y - 22,
      '#ffe5a0',
      `+${bottlesEarned} 白い息の小瓶 / +${warmthBonus} ぬくもり`
    );
    this.cb.onOrderCompleted(
      'あったか〜い缶の差し入れ',
      '「自販機の裏から、ほかほかのぬくもりが届きました」',
      bottlesEarned
    );
    this.cb.onStateDirty();
    return true;
  }

  /** Activate POKAPOKA NIGHT Fever! */
  public activateFever(): boolean {
    if (this.isFever || this.feverGauge < 100) return false;
    this.isFever = true;
    this.feverGauge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();
    this.audio.playFeverStartSE();
    this.actor.onCelebrate();
    this.scene.triggerShake(0.2, 0.3);

    // Transform all active frost gusts into rare Star-Steam seeds!
    for (const f of this.frosts) {
      if (f.cleared) continue;
      f.cleared = true;
      this.frostsGroup.remove(f.mesh);
      this.sessionStats.frostsMelted += 1;
      this.spawnWarmthItem('starsteam', { x: f.x, z: f.z });
    }

    // Cozy warmth wave to every bench
    for (const b of this.benches) {
      b.temp = Math.min(100, b.temp + 35);
      if (b.wasChilly && b.temp >= 88) {
        this.completeBenchWarming(b);
      }
    }

    this.cb.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    this.activeBeatPhase = beatFloat - Math.floor(beatFloat);

    // Update Steam Wave cooldown
    if (this.waveCooldown > 0) {
      this.waveCooldown = Math.max(0, this.waveCooldown - dt);
      const cd = this.gsm.getSteamWaveCooldownSec();
      const pct = 1 - this.waveCooldown / cd;
      this.cb.onWaveCooldownChange(pct, this.waveCooldown <= 0.001);
    }

    // Update POKAPOKA NIGHT fever timer
    if (active && this.isFever) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      const dur = this.gsm.getFeverDurationSec();
      const pct = (this.feverRemaining / dur) * 100;
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.feverGauge = 0;
        this.cb.onFeverChange(false, 0, 0);
      } else {
        this.cb.onFeverChange(true, pct, this.feverRemaining);
      }
    }

    if (active) {
      this.updateMovement(dt);
      this.updateSpawning(beatFloat);
      this.updateBenches(elapsed, dt);
      this.updateItems(elapsed, dt);
      this.updateFrosts(elapsed, dt);
    } else {
      // Gentle lobby bench visuals
      let sum = 0;
      for (const b of this.benches) {
        sum += b.temp;
        this.scene.updateBenchVisual(b.id, b.temp, false, 0, elapsed);
      }
      this.scene.setAverageBenchTemp(sum / Math.max(1, this.benches.length));
    }

    this.renderFxOverlay(elapsed, dt, active);
  }

  private updateMovement(dt: number): void {
    const moveSpeed = this.isFever ? 6.4 : 5.3;
    let dx = 0;
    let dz = 0;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;
    if (this.keys.up) dz -= 1;
    if (this.keys.down) dz += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      this.playerVx = (dx / len) * moveSpeed;
      this.playerVz = (dz / len) * moveSpeed;
    } else if (this.pointerTarget) {
      const tx = this.pointerTarget.x - this.playerX;
      const tz = this.pointerTarget.z - this.playerZ;
      const dist = Math.hypot(tx, tz);
      if (dist > 0.14) {
        const spd = Math.min(moveSpeed, dist * 6.5);
        this.playerVx = (tx / dist) * spd;
        this.playerVz = (tz / dist) * spd;
      } else {
        this.playerVx *= Math.exp(-16 * dt);
        this.playerVz *= Math.exp(-16 * dt);
        this.pointerTarget = null;
      }
    } else {
      this.playerVx *= Math.exp(-14 * dt);
      this.playerVz *= Math.exp(-14 * dt);
    }

    this.playerX = Math.max(
      -PLAY_AREA_HALF_X,
      Math.min(PLAY_AREA_HALF_X, this.playerX + this.playerVx * dt)
    );
    this.playerZ = Math.max(
      PLAY_AREA_MIN_Z,
      Math.min(PLAY_AREA_MAX_Z, this.playerZ + this.playerVz * dt)
    );

    const lookBench =
      this.pointerTargetBenchId !== null ? this.benches[this.pointerTargetBenchId] : null;
    this.actor.setMotion(
      this.playerX,
      this.playerZ,
      this.playerVx,
      this.playerVz,
      dt,
      lookBench ? { x: lookBench.x, z: lookBench.z } : null
    );
    this.scene.setFocus(this.playerX, this.playerZ);
  }

  private updateSpawning(beatFloat: number): void {
    const track = NUKUMORI_TRACKS[this.gsm.state.selectedTrack];

    if (beatFloat - this.lastSpawnBeat >= track.spawnEveryBeats) {
      this.lastSpawnBeat = beatFloat;
      this.spawnWarmthItem();
      if (Math.random() < track.frostRate && !this.isFever) {
        this.spawnFrostGust();
      }
    }

    // Can Warmer 4-beat auto resonance
    const warmerLv = this.gsm.state.upgrades.canWarmer;
    if (warmerLv > 0 && beatFloat - this.lastResonanceBeat >= 4) {
      this.lastResonanceBeat = Math.floor(beatFloat / 4) * 4;
      const bonus = warmerLv * 10;
      this.gsm.state.warmth += bonus;
      this.gsm.state.totalWarmthEarned += bonus;
      this.sessionStats.warmthEarned += bonus;
      const pt = this.worldToScreen(2.45, 1.15, -6.15);
      this.cb.onFloatingText(`🥫 +${bonus}`, pt.x, pt.y, '#ffc67c');
      this.cb.onStateDirty();
    }
  }

  private updateBenches(elapsed: number, dt: number): void {
    const track = NUKUMORI_TRACKS[this.gsm.state.selectedTrack];
    const warmRadius = this.gsm.getWarmRadius() + 0.55;
    const warmRate = this.gsm.getBenchWarmRate() * (this.isFever ? 1.45 : 1.0);
    let anyWarming = false;
    let tempSum = 0;

    for (const b of this.benches) {
      b.visitorTimer = Math.max(0, b.visitorTimer - dt);
      b.cooldownTimer = Math.max(0, b.cooldownTimer - dt);

      const dist = Math.hypot(b.x - this.playerX, b.z - this.playerZ);
      const inRange = dist <= warmRadius;
      b.warmingNow = inRange && b.temp < 99;

      if (b.warmingNow) {
        anyWarming = true;
        b.temp = Math.min(100, b.temp + warmRate * dt);
        if (b.wasChilly && b.temp >= 88) {
          this.completeBenchWarming(b);
        }
      } else if (this.isFever) {
        // Gentle automatic cozy insulation during POKAPOKA NIGHT
        b.temp = Math.min(100, b.temp + 10 * dt);
        if (b.wasChilly && b.temp >= 88) {
          this.completeBenchWarming(b);
        }
      } else {
        // Winter night slowly cools benches
        const coolFactor = b.visitorTimer > 0 ? 0.35 : 1.0;
        b.temp = Math.max(8, b.temp - track.benchCoolSpeed * coolFactor * dt);
        if (b.temp <= 62 && b.cooldownTimer <= 0) {
          b.wasChilly = true;
        }
      }

      tempSum += b.temp;
      this.scene.updateBenchVisual(b.id, b.temp, b.warmingNow, b.visitorTimer, elapsed);
    }

    this.actor.setWarmingBench(anyWarming);
    this.scene.setAverageBenchTemp(tempSum / Math.max(1, this.benches.length));
  }

  private updateItems(elapsed: number, dt: number): void {
    const pickupRadius = this.gsm.getWarmRadius() * (this.isFever ? 1.45 : 1.0);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.collected) {
        this.items.splice(i, 1);
        continue;
      }

      it.age += dt;
      if (it.age >= it.maxAge) {
        this.itemsGroup.remove(it.mesh);
        this.items.splice(i, 1);
        continue;
      }

      // Gentle magnet pull when close or during Fever / Steam Wave
      const dx = this.playerX - it.x;
      const dz = this.playerZ - it.z;
      const dist = Math.hypot(dx, dz);

      if (it.magnetized || dist < pickupRadius * 1.45 || this.isFever) {
        const pullSpeed = it.magnetized ? 11.0 : this.isFever ? 7.8 : 5.2;
        if (dist > 0.05) {
          it.x += (dx / dist) * pullSpeed * dt;
          it.z += (dz / dist) * pullSpeed * dt;
        }
      }

      const fadeOut = it.age > it.maxAge - 1.2 ? (it.maxAge - it.age) / 1.2 : 1;
      const popIn = Math.min(1, it.age / 0.25);
      it.mesh.position.set(it.x, Math.sin(elapsed * 3.4 + it.bobPhase) * 0.1 + 0.05, it.z);
      it.mesh.rotation.y = elapsed * (it.id === 'starsteam' ? 2.4 : 1.4) + it.bobPhase;
      it.mesh.scale.setScalar(popIn * fadeOut);

      if (dist <= pickupRadius * 0.92) {
        this.collectItem(it);
        this.items.splice(i, 1);
      }
    }
  }

  private updateFrosts(elapsed: number, dt: number): void {
    for (let i = this.frosts.length - 1; i >= 0; i--) {
      const f = this.frosts[i];
      if (f.cleared) {
        this.frosts.splice(i, 1);
        continue;
      }

      f.age += dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      f.mesh.position.set(f.x, Math.sin(elapsed * 4.5 + f.uid) * 0.06, f.z);
      f.mesh.rotation.y = elapsed * 2.8;

      if (
        f.age >= f.maxAge ||
        Math.abs(f.x) > PLAY_AREA_HALF_X + 2.2 ||
        f.z < PLAY_AREA_MIN_Z - 2.0 ||
        f.z > PLAY_AREA_MAX_Z + 2.0
      ) {
        this.frostsGroup.remove(f.mesh);
        this.frosts.splice(i, 1);
        continue;
      }

      // Check collision with benches (chills bench!)
      let hitBench = false;
      for (const b of this.benches) {
        if (Math.hypot(b.x - f.x, b.z - f.z) < 0.95) {
          b.temp = Math.max(8, b.temp - 20);
          b.wasChilly = true;
          hitBench = true;
          const pt = this.worldToScreen(b.x, 0.9, b.z);
          this.spawnFxBurst(pt.x, pt.y, '#8cc8ff', 12, true);
          this.cb.onFloatingText('❄️ ベンチが冷えた！', pt.x, pt.y - 14, '#a6d8ff');
          break;
        }
      }
      if (hitBench) {
        f.cleared = true;
        this.frostsGroup.remove(f.mesh);
        this.frosts.splice(i, 1);
        continue;
      }

      // Check collision with Nukumori
      if (Math.hypot(this.playerX - f.x, this.playerZ - f.z) < 0.85) {
        f.cleared = true;
        this.frostsGroup.remove(f.mesh);
        this.frosts.splice(i, 1);

        const pt = this.worldToScreen(this.playerX, 0.9, this.playerZ);
        if (this.shieldsRemaining > 0) {
          this.shieldsRemaining -= 1;
          this.cb.onShieldChange(this.shieldsRemaining);
          this.audio.playShieldBlockSE();
          this.spawnFxBurst(pt.x, pt.y, '#ff9a8a', 16, true);
          this.cb.onFloatingText('🧣 マフラーのまもり！', pt.x, pt.y - 16, '#ffb0a4');
        } else {
          this.combo = Math.floor(this.combo * 0.5);
          this.cb.onComboChange(this.combo, this.getComboMult());
          this.audio.playFrostHitSE();
          this.actor.onFrostHit();
          this.scene.triggerShake(0.14, 0.2);
          this.spawnFxBurst(pt.x, pt.y, '#8cc8ff', 14, true);
          this.cb.onFloatingText('❄️ ぶるっ…冷たい北風', pt.x, pt.y - 16, '#a6d8ff');
        }
      }
    }
  }

  private renderFxOverlay(elapsed: number, dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Draw crisp floating temperature badges above the 4 benches during active play!
    if (active) {
      for (const b of this.benches) {
        const pt = this.worldToScreen(b.x, 1.38, b.z);
        if (!pt.visible) continue;

        const temp = Math.round(b.temp);
        const chilly = temp < 45;
        const cozy = temp >= 84;
        const badgeW = 92;
        const badgeH = 28;
        const bx = pt.x - badgeW / 2;
        const by = pt.y - badgeH / 2 + (chilly ? Math.sin(elapsed * 7.5 + b.id) * 2.5 : 0);

        ctx.save();
        ctx.fillStyle = b.warmingNow
          ? 'rgba(56, 26, 12, 0.86)'
          : chilly
            ? 'rgba(14, 28, 54, 0.86)'
            : 'rgba(22, 18, 28, 0.78)';
        ctx.strokeStyle = b.warmingNow
          ? '#ffbe6b'
          : chilly
            ? '#84c5ff'
            : cozy
              ? '#ffd98a'
              : 'rgba(255,220,175,0.45)';
        ctx.lineWidth = b.warmingNow || chilly ? 2 : 1.2;

        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 14);
        ctx.fill();
        ctx.stroke();

        // Mini progress bar inside badge
        const barX = bx + 8;
        const barY = by + badgeH - 6;
        const barW = badgeW - 16;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(barX, barY, barW, 3);
        ctx.fillStyle = chilly ? '#7ec4ff' : cozy ? '#ffe08a' : '#ff9e52';
        ctx.fillRect(barX, barY, barW * (temp / 100), 3);

        // Status text
        ctx.font = '700 11px "Zen Maru Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = chilly ? '#cce8ff' : cozy ? '#fff1c2' : '#ffe2be';
        const status = b.warmingNow
          ? `♨️ ${temp}%`
          : chilly
            ? `❄️ さむい ${temp}%`
            : cozy
              ? `✨ ぽかぽか`
              : `🌡 ${temp}%`;
        ctx.fillText(status, pt.x, by + 11.5);
        ctx.restore();
      }
    }

    // Draw FX burst particles & rings
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fxParticles.splice(i, 1);
        continue;
      }
      const prog = p.life / p.maxLife;
      const alpha = 1 - prog;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.6 * alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + prog * 48, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - prog * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
