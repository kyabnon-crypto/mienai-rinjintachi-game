import * as THREE from 'three';
import { TsumazukiAudioEngine } from './audioEngine';
import {
  DROPPED_ITEM_LIST,
  DROPPED_ITEM_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  STUMBLE_SPOTS,
  TSUMAZUKI_TRACKS,
  WATCH_ORDERS,
} from './config';
import { LandingScene } from './landingScene';
import { TsumazukiStateManager } from './state';
import { TsumazukiActor } from './tsumazukiActor';
import { DroppedItemId, TsumazukiRunStats, WatchOrderDef } from './types';

interface ActiveDroppedItem {
  id: number;
  itemId: DroppedItemId;
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

interface ActiveRushSwirl {
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

interface SpotState {
  id: number;
  stability: number; // 0 (about to trip) .. 100 (safely steadied)
  cooldown: number; // brief golden relief glow after resident is saved
  steadying: boolean;
  tickAccum: number;
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
  kind: 'spark' | 'ring' | 'droplet' | 'clockArc';
}

export interface TimeSlowSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: WatchOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, charmsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onTimeSlowCooldownChange: (pct: number, ready: boolean, slowing: boolean) => void;
}

export class TimeSlowSystem {
  private landingScene: LandingScene;
  private actor: TsumazukiActor;
  private audio: TsumazukiAudioEngine;
  private gsm: TsumazukiStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: TimeSlowSystemCallbacks;

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
  private items: ActiveDroppedItem[] = [];
  private rushes: ActiveRushSwirl[] = [];
  private spots: SpotState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared geometries for dropped items & rush swirls
  private cupGlassGeo = new THREE.CylinderGeometry(0.14, 0.11, 0.28, 14);
  private cupWaterGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.15, 12);
  private dropletGeo = new THREE.SphereGeometry(0.036, 8, 6);
  private keyBowGeo = new THREE.TorusGeometry(0.075, 0.022, 6, 14);
  private keyShaftGeo = new THREE.BoxGeometry(0.04, 0.22, 0.02);
  private coinGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.036, 18);
  private watchBodyGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.055, 22);
  private watchHaloGeo = new THREE.OctahedronGeometry(0.26, 0);
  private planeGeo: THREE.BufferGeometry;
  private rushCoreGeo = new THREE.TorusKnotGeometry(0.24, 0.075, 36, 6, 2, 3);

  // Beat cursors & timers
  private nextItemBeat = 0;
  private nextRushBeat = 0;
  private passiveAccum = 0;
  private timeSlowCooldown = 0;
  private timeSlowActiveTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: WatchOrderDef = WATCH_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0; // 0..100
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: TsumazukiRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpHandVec = new THREE.Vector3();

  constructor(
    landingScene: LandingScene,
    actor: TsumazukiActor,
    audio: TsumazukiAudioEngine,
    gsm: TsumazukiStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: TimeSlowSystemCallbacks
  ) {
    this.landingScene = landingScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    // Origami paper airplane geometry
    this.planeGeo = new THREE.BufferGeometry();
    const pv = new Float32Array([
      0, 0, 0.3, -0.22, 0.02, -0.2, 0, -0.02, -0.2,
      0, 0, 0.3, 0, -0.02, -0.2, 0.22, 0.02, -0.2,
      0, 0, 0.3, 0, -0.1, -0.2, 0, -0.02, -0.2,
    ]);
    this.planeGeo.setAttribute('position', new THREE.BufferAttribute(pv, 3));
    this.planeGeo.computeVertexNormals();

    this.initSpots();
    this.pickOrder(0);
  }

  public get isTimeSlowActive(): boolean {
    return this.timeSlowActiveTimer > 0;
  }

  public get worldTimeScale(): number {
    if (this.timeSlowActiveTimer > 0) return 0.28;
    if (this.isFever) return 0.48;
    return 1.0;
  }

  private createEmptyStats(): TsumazukiRunStats {
    return {
      score: 0,
      itemsCaught: 0,
      stumblesSaved: 0,
      ordersCompleted: 0,
      basketReturns: 0,
      rushesCalmed: 0,
      maxCombo: 0,
      dropsEarned: 0,
      charmsEarned: 0,
    };
  }

  private initSpots(): void {
    this.spots = STUMBLE_SPOTS.map((s, idx) => ({
      id: s.id,
      stability: 54 + idx * 9,
      cooldown: 0,
      steadying: false,
      tickAccum: 0,
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
    const world = this.landingScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    // Snap softly if tapping directly on one of the 4 stumble spots
    let spotId: number | null = null;
    for (const s of STUMBLE_SPOTS) {
      if (Math.hypot(tx - s.x, tz - s.z) < 1.25) {
        spotId = s.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, spotId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextItemBeat = beatFloat + 0.5;
    this.nextRushBeat = beatFloat + 4.0;
  }

  public resetSession(spawnStarterItems: boolean): void {
    for (const it of this.items) this.landingScene.worldGroup.remove(it.group);
    for (const r of this.rushes) this.landingScene.worldGroup.remove(r.group);
    this.items = [];
    this.rushes = [];
    this.fxParticles = [];

    this.posX = 0;
    this.posZ = 0.55;
    this.velX = 0;
    this.velZ = 0;
    this.pointerTarget = null;

    this.combo = 0;
    this.isFever = false;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.timeSlowCooldown = 0;
    this.timeSlowActiveTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initSpots();
    this.pickOrder(Math.floor(Math.random() * WATCH_ORDERS.length));

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onTimeSlowCooldownChange(1, true, false);
    this.callbacks.onStateDirty();

    if (spawnStarterItems) {
      // Spawn 3 inviting floating items right at the start of the morning watch
      this.spawnDroppedItem(this.currentOrder.items[0], -1.8, -0.6);
      this.spawnDroppedItem(this.currentOrder.items[1], 1.85, -0.5);
      this.spawnDroppedItem('cup', 0.1, 1.55);
    }
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % WATCH_ORDERS.length;
    this.currentOrder = WATCH_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMult(): number {
    return 1 + Math.min(2.0, this.combo * 0.04);
  }

  private pickRandomItemId(): DroppedItemId {
    const journalLv = this.gsm.state.upgrades.watchJournal;
    const watchBonus = journalLv * 3.5;

    // Slightly favor items needed by the active morning order for smooth flow
    const neededIds = this.currentOrder.items.filter((_, idx) => !this.orderFilled[idx]);
    if (neededIds.length > 0 && Math.random() < 0.42) {
      return neededIds[Math.floor(Math.random() * neededIds.length)];
    }

    const weights = DROPPED_ITEM_LIST.map((def) =>
      def.id === 'watch' ? def.weight + watchBonus : def.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < DROPPED_ITEM_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return DROPPED_ITEM_LIST[i].id;
    }
    return 'cup';
  }

  private createDroppedItemMesh(itemId: DroppedItemId): THREE.Group {
    const def = DROPPED_ITEM_MAP[itemId];
    const group = new THREE.Group();

    const mainMat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: itemId === 'key' || itemId === 'coin' || itemId === 'watch' ? 0.65 : 0.12,
    });

    if (itemId === 'cup') {
      // Tilted glass tumbler + water + suspended splash droplets!
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xe4f9ff,
        emissive: 0x3b9eb8,
        emissiveIntensity: 0.38,
        transparent: true,
        opacity: 0.78,
        roughness: 0.12,
      });
      const cup = new THREE.Mesh(this.cupGlassGeo, glassMat);
      cup.rotation.z = 0.55;
      group.add(cup);
      const water = new THREE.Mesh(this.cupWaterGeo, mainMat);
      water.position.y = -0.02;
      water.rotation.z = 0.55;
      group.add(water);
      [
        [0.16, 0.22, 0.04],
        [0.24, 0.3, -0.03],
        [0.08, 0.34, 0.05],
      ].forEach(([dx, dy, dz]) => {
        const drop = new THREE.Mesh(this.dropletGeo, mainMat);
        drop.position.set(dx, dy, dz);
        group.add(drop);
      });
    } else if (itemId === 'key') {
      // Cluster of two gleaming apartment keys
      [-0.35, 0.35].forEach((rz, i) => {
        const k = new THREE.Group();
        k.rotation.z = rz;
        k.position.x = i === 0 ? -0.03 : 0.03;
        const bow = new THREE.Mesh(this.keyBowGeo, mainMat);
        bow.position.y = 0.12;
        k.add(bow);
        const shaft = new THREE.Mesh(this.keyShaftGeo, mainMat);
        shaft.position.y = -0.04;
        k.add(shaft);
        group.add(k);
      });
    } else if (itemId === 'plane') {
      const planeMat = new THREE.MeshStandardMaterial({
        color: def.colorHex,
        emissive: def.emissiveHex,
        emissiveIntensity: 0.42,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });
      const pl = new THREE.Mesh(this.planeGeo, planeMat);
      pl.scale.setScalar(1.3);
      pl.rotation.set(0.2, 0.4, 0.15);
      group.add(pl);
    } else if (itemId === 'coin') {
      const coin = new THREE.Mesh(this.coinGeo, mainMat);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14),
        new THREE.MeshStandardMaterial({
          color: 0x4fa89b,
          emissive: 0x2a6b63,
          emissiveIntensity: 0.4,
          roughness: 0.4,
        })
      );
      btn.position.set(0.14, -0.1, 0.05);
      btn.rotation.z = 0.5;
      group.add(btn);
    } else {
      // Rare Star-Sand Pocket Watch ("ひと秒の懐中時計")
      const watch = new THREE.Mesh(this.watchBodyGeo, mainMat);
      watch.rotation.x = Math.PI / 2;
      group.add(watch);
      const star = new THREE.Mesh(
        this.watchHaloGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfff3c2,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          wireframe: true,
        })
      );
      group.add(star);
    }

    // Soft additive halo so every floating item is crisp and readable from top-down camera
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.landingScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: itemId === 'watch' ? 0.85 : 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(itemId === 'watch' ? 1.35 : 0.92, itemId === 'watch' ? 1.35 : 0.92, 1);
    group.add(halo);

    // Subtle ground shadow/ripple indicator underneath
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.3, 24),
      new THREE.MeshBasicMaterial({
        color: def.colorHex,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'ground-ring';
    group.add(ring);

    return group;
  }

  private spawnDroppedItem(forcedId?: DroppedItemId, fx?: number, fz?: number): void {
    const track = TSUMAZUKI_TRACKS[this.gsm.state.selectedTrack];
    if (this.items.length >= track.maxActiveItems + (this.isFever ? 4 : 0)) return;

    const itemId = forcedId ?? this.pickRandomItemId();
    const x = fx ?? (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
    const z = fz ?? PLAY_AREA_MIN_Z + 0.45 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.9);
    const y = 2.6 + Math.random() * 1.1;

    const group = this.createDroppedItemMesh(itemId);
    group.position.set(x, y, z);
    this.landingScene.worldGroup.add(group);

    this.items.push({
      id: this.nextEntityId++,
      itemId,
      group,
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 0.42,
      vz: (Math.random() - 0.5) * 0.32,
      age: 0,
      maxAge: itemId === 'watch' ? 12.5 : 10.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnRushSwirl(): void {
    if (this.isFever || this.rushes.length >= 4) return;
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -PLAY_AREA_HALF_X - 0.3 : PLAY_AREA_HALF_X + 0.3;
    const z = PLAY_AREA_MIN_Z + 0.6 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.2);
    const speed = 1.45 + Math.random() * 0.85;
    const vx = (fromLeft ? 1 : -1) * speed;
    const vz = (Math.random() - 0.5) * 0.65;

    const group = new THREE.Group();
    const core = new THREE.Mesh(
      this.rushCoreGeo,
      new THREE.MeshStandardMaterial({
        color: 0xd86b5c,
        emissive: 0x8f2c2c,
        emissiveIntensity: 0.72,
        roughness: 0.45,
      })
    );
    group.add(core);

    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.landingScene.glowTex,
        color: 0xf27d6b,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    aura.scale.set(1.25, 1.25, 1);
    group.add(aura);

    group.position.set(x, 0.72, z);
    this.landingScene.worldGroup.add(group);

    this.rushes.push({
      id: this.nextEntityId++,
      group,
      x,
      z,
      vx,
      vz,
      age: 0,
      maxAge: 9.5,
      phase: Math.random() * Math.PI * 2,
      radius: 0.58,
    });
  }

  private addDrops(amount: number): number {
    const trackMult = TSUMAZUKI_TRACKS[this.gsm.state.selectedTrack].valueMultiplier;
    const feverMult = this.isFever ? 2.0 : 1.0;
    const total = Math.max(
      1,
      Math.round(amount * this.gsm.getDropsMultiplier() * this.getComboMult() * trackMult * feverMult)
    );
    this.gsm.state.drops += total;
    this.gsm.state.totalDropsEarned += total;
    this.sessionStats.dropsEarned += total;
    this.sessionStats.score += total;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }
    return total;
  }

  private incrementCombo(): void {
    this.combo += 1;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;
    this.callbacks.onComboChange(this.combo, this.getComboMult());
  }

  private addFeverCharge(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private collectDroppedItem(item: ActiveDroppedItem): void {
    if (item.collected) return;
    item.collected = true;
    const def = DROPPED_ITEM_MAP[item.itemId];

    this.incrementCombo();
    const earned = this.addDrops(def.baseValue);
    this.addFeverCharge(def.feverGain);
    this.sessionStats.itemsCaught += 1;

    // Fill return basket
    const cap = this.gsm.getBasketCapacity();
    if (this.gsm.state.basketFill < cap) {
      this.gsm.state.basketFill = Math.min(cap, this.gsm.state.basketFill + 1);
    }

    // Check active morning watch order
    const slotIdx = this.currentOrder.items.findIndex(
      (id, idx) => id === item.itemId && !this.orderFilled[idx]
    );
    if (slotIdx >= 0) {
      this.orderFilled[slotIdx] = true;
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
      if (this.orderFilled.every(Boolean)) {
        this.completeCurrentOrder();
      }
    }

    const pos = new THREE.Vector3(item.x, Math.max(0.65, item.y), item.z);
    const screen = this.landingScene.projectToScreen(pos, this.fxW, this.fxH);
    this.spawnBurst(screen.x, screen.y, def.cssColor, item.itemId === 'watch' ? 18 : 10, 'droplet');
    this.callbacks.onFloatingText(
      `${def.icon} +${earned}`,
      screen.x,
      screen.y - 12,
      def.cssColor,
      item.itemId === 'watch' ? 'ひと秒の懐中時計！' : `${def.shortName} キャッチ！`
    );

    this.actor.triggerPickupPop();
    this.audio.playCatchItemSE(this.combo, item.itemId === 'watch');
    this.landingScene.launchReturnedItemArc(pos, 1);
    this.landingScene.worldGroup.remove(item.group);
    this.callbacks.onStateDirty();
  }

  private completeCurrentOrder(): void {
    const order = this.currentOrder;
    const bonusDrops = this.addDrops(order.bonusDrops);
    const charms = order.bonusCharms + Math.floor(this.gsm.state.upgrades.lostShelf / 2);

    this.gsm.state.charms += charms;
    this.gsm.state.totalOrdersCompleted += 1;
    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.charmsEarned += charms;
    this.addFeverCharge(18);

    this.actor.triggerCelebrate();
    this.landingScene.triggerMorningFlash();
    this.landingScene.launchReturnedItemArc(new THREE.Vector3(this.posX, 1.1, this.posZ), 3);
    this.audio.playOrderCompleteSE(false);

    const screen = this.landingScene.projectToScreen(
      new THREE.Vector3(this.posX, 1.6, this.posZ),
      this.fxW,
      this.fxH
    );
    this.spawnBurst(screen.x, screen.y, '#9cf2e2', 22, 'spark');
    this.callbacks.onFloatingText(
      `⏳ オーダー達成 +${bonusDrops}`,
      screen.x,
      screen.y - 26,
      '#fff0b8',
      `だいじょうぶの証 +${charms}`
    );
    this.callbacks.onOrderCompleted(order.name, order.whisperMessage, charms);
    this.pickOrder(this.orderIndex + 1);
    this.callbacks.onStateDirty();
  }

  /** Return full lost-and-found basket back to morning residents */
  public returnBasket(): boolean {
    const cap = this.gsm.getBasketCapacity();
    if (this.gsm.state.basketFill < cap) return false;

    this.gsm.state.basketFill = 0;
    const charms = this.gsm.getCharmsPerReturn();
    const bonusDrops = this.addDrops(110 + this.gsm.state.upgrades.lostShelf * 28);

    this.gsm.state.charms += charms;
    this.gsm.state.totalBasketReturns += 1;
    this.sessionStats.basketReturns += 1;
    this.sessionStats.charmsEarned += charms;
    this.addFeverCharge(22);

    this.actor.triggerCelebrate();
    this.landingScene.triggerMorningFlash();
    this.landingScene.triggerShake(0.14, 0.22);
    this.landingScene.launchReturnedItemArc(new THREE.Vector3(this.posX, 1.0, this.posZ), 5);
    this.audio.playOrderCompleteSE(true);

    const screen = this.landingScene.projectToScreen(
      new THREE.Vector3(this.posX, 1.5, this.posZ),
      this.fxW,
      this.fxH
    );
    this.spawnBurst(screen.x, screen.y, '#ffe49c', 28, 'spark');
    this.callbacks.onFloatingText(
      `🧺 そっとお返し完了！ +${bonusDrops}`,
      screen.x,
      screen.y - 28,
      '#ffe8a8',
      `だいじょうぶの証 +${charms}`
    );
    this.callbacks.onStateDirty();
    return true;
  }

  /** Signature Action: "ほんのひと秒 (TIME SLOW)" — stretches time for 2.2s, calms rushes, catches nearby items & steadies all 4 spots! */
  public triggerTimeSlow(): boolean {
    if (this.timeSlowCooldown > 0) return false;

    const cd = this.gsm.getTimeSlowCooldownSec();
    this.timeSlowCooldown = cd;
    this.timeSlowActiveTimer = 2.2;

    const radius = this.gsm.getTimeSlowRadius();
    this.actor.triggerTimeSlowWave(radius);
    this.landingScene.triggerShake(0.12, 0.22);
    this.landingScene.triggerMorningFlash();
    this.audio.playTimeSlowSE();

    const originScreen = this.landingScene.projectToScreen(
      new THREE.Vector3(this.posX, 0.8, this.posZ),
      this.fxW,
      this.fxH
    );
    this.fxParticles.push({
      x: originScreen.x,
      y: originScreen.y,
      vx: 0,
      vy: 0,
      size: 26,
      color: '#9cf2e2',
      alpha: 0.92,
      life: 0,
      maxLife: 0.72,
      kind: 'ring',
    });
    this.fxParticles.push({
      x: originScreen.x,
      y: originScreen.y,
      vx: 0,
      vy: 0,
      size: 16,
      color: '#ffe49c',
      alpha: 0.84,
      life: 0,
      maxLife: 0.84,
      kind: 'clockArc',
    });

    // 1. Calm all nearby rush swirls into time drops
    let calmed = 0;
    for (let i = this.rushes.length - 1; i >= 0; i--) {
      const r = this.rushes[i];
      if (Math.hypot(r.x - this.posX, r.z - this.posZ) <= radius + 0.65) {
        const rs = this.landingScene.projectToScreen(new THREE.Vector3(r.x, 0.7, r.z), this.fxW, this.fxH);
        this.spawnBurst(rs.x, rs.y, '#9cf2e2', 14, 'spark');
        this.landingScene.worldGroup.remove(r.group);
        this.rushes.splice(i, 1);
        calmed += 1;
        this.sessionStats.rushesCalmed += 1;
        this.incrementCombo();
        const drops = this.addDrops(26);
        this.addFeverCharge(5.5);
        this.callbacks.onFloatingText(`⏳ ほどいた +${drops}`, rs.x, rs.y - 10, '#9cf2e2');
      }
    }

    // 2. Gently catch all floating dropped items within the time-slow ripple
    let caught = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.collected && Math.hypot(it.x - this.posX, it.z - this.posZ) <= radius) {
        this.collectDroppedItem(it);
        this.items.splice(i, 1);
        caught += 1;
      }
    }

    // 3. Boost stability across all 4 stumble spots!
    for (const sp of this.spots) {
      if (sp.cooldown <= 0) {
        sp.stability = Math.min(100, sp.stability + 36);
        if (sp.stability >= 100) {
          this.completeStumbleSpotSave(sp);
        }
      }
    }

    this.callbacks.onFloatingText(
      '⏳ ほんのひと秒…',
      originScreen.x,
      originScreen.y - 44,
      '#b8fae9',
      calmed + caught > 0 ? `あわて浄化 ${calmed} ・ 救出 ${caught}` : '時間がふわりとゆっくりになった！'
    );
    this.callbacks.onTimeSlowCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Fever Mode: "SLOW SECOND (ひと秒のきせき)" */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverStartSE();
    this.landingScene.triggerMorningFlash();
    this.landingScene.triggerShake(0.18, 0.35);
    this.actor.triggerCelebrate();

    // Transform every active rush swirl into a rare Star-Sand Pocket Watch!
    for (const r of this.rushes) {
      this.landingScene.worldGroup.remove(r.group);
      this.spawnDroppedItem('watch', r.x, r.z);
      this.sessionStats.rushesCalmed += 1;
    }
    this.rushes = [];

    // Also drop 2 bonus rare pocket watches into the sunlit landing!
    this.spawnDroppedItem('watch', -2.1, -0.4);
    this.spawnDroppedItem('watch', 2.1, -0.4);

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    this.callbacks.onStateDirty();
    return true;
  }

  private completeStumbleSpotSave(sp: SpotState): void {
    sp.stability = 100;
    sp.cooldown = 2.6;
    sp.steadying = false;

    this.incrementCombo();
    const earned = this.addDrops(56);
    this.addFeverCharge(14);
    this.gsm.state.totalSaves += 1;
    this.sessionStats.stumblesSaved += 1;

    const spotDef = STUMBLE_SPOTS[sp.id];
    const wPos = new THREE.Vector3(spotDef.x, 1.25, spotDef.z);
    const screen = this.landingScene.projectToScreen(wPos, this.fxW, this.fxH);
    this.spawnBurst(screen.x, screen.y, '#ffe8a8', 18, 'spark');
    this.callbacks.onFloatingText(
      `✨ 運がよかった！ +${earned}`,
      screen.x,
      screen.y - 24,
      '#fff0b8',
      spotDef.shortName
    );
    this.audio.playResidentSavedSE();
    this.landingScene.launchReturnedItemArc(wPos, 2);
    this.callbacks.onStateDirty();
  }

  private spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: 'spark' | 'droplet'
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 140;
      this.fxParticles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 28,
        size: 2.5 + Math.random() * 3.8,
        color,
        alpha: 0.95,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.34,
        kind,
      });
    }
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = TSUMAZUKI_TRACKS[this.gsm.state.selectedTrack];
    const tScale = this.worldTimeScale;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // Update TIME SLOW cooldown & active slow duration
    const prevSlow = this.timeSlowActiveTimer > 0;
    if (this.timeSlowActiveTimer > 0) {
      this.timeSlowActiveTimer = Math.max(0, this.timeSlowActiveTimer - dt);
    }
    if (this.timeSlowCooldown > 0) {
      const maxCd = this.gsm.getTimeSlowCooldownSec();
      this.timeSlowCooldown = Math.max(0, this.timeSlowCooldown - dt);
      this.callbacks.onTimeSlowCooldownChange(
        1 - this.timeSlowCooldown / maxCd,
        this.timeSlowCooldown <= 0,
        this.timeSlowActiveTimer > 0
      );
    } else if (prevSlow !== (this.timeSlowActiveTimer > 0)) {
      this.callbacks.onTimeSlowCooldownChange(1, true, this.timeSlowActiveTimer > 0);
    }

    // Update SLOW SECOND Fever
    if (this.isFever && active) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      const maxDur = this.gsm.getFeverDurationSec();
      const pct = (this.feverRemaining / maxDur) * 100;
      this.callbacks.onFeverChange(true, pct, this.feverRemaining);
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.feverCharge = 0;
        this.callbacks.onFeverChange(false, 0, 0);
      }
    }

    if (active) {
      // Passive drops from tealCloak upgrade
      const cloakLv = this.gsm.state.upgrades.tealCloak;
      if (cloakLv > 0) {
        this.passiveAccum += dt * cloakLv * 4;
        if (this.passiveAccum >= 1) {
          const whole = Math.floor(this.passiveAccum);
          this.passiveAccum -= whole;
          this.gsm.state.drops += whole;
          this.gsm.state.totalDropsEarned += whole;
          this.sessionStats.dropsEarned += whole;
        }
      }

      // ===== 1. Tsumazuki Steering (Tsumazuki moves at full snappy speed even during TIME SLOW!) =====
      let inputX = 0;
      let inputZ = 0;
      if (this.keys.left) inputX -= 1;
      if (this.keys.right) inputX += 1;
      if (this.keys.up) inputZ -= 1;
      if (this.keys.down) inputZ += 1;

      const maxSpeed = this.isFever ? 6.6 : this.isTimeSlowActive ? 6.1 : 5.4;
      let targetVx = 0;
      let targetVz = 0;

      if (inputX !== 0 || inputZ !== 0) {
        const len = Math.hypot(inputX, inputZ);
        targetVx = (inputX / len) * maxSpeed;
        targetVz = (inputZ / len) * maxSpeed;
      } else if (this.pointerTarget) {
        const dx = this.pointerTarget.x - this.posX;
        const dz = this.pointerTarget.z - this.posZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.14) {
          const spd = Math.min(maxSpeed, dist * 5.2);
          targetVx = (dx / dist) * spd;
          targetVz = (dz / dist) * spd;
        } else {
          this.pointerTarget = null;
        }
      }

      const accel = 1 - Math.exp(-13 * dt);
      this.velX += (targetVx - this.velX) * accel;
      this.velZ += (targetVz - this.velZ) * accel;
      this.posX = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, this.posX + this.velX * dt));
      this.posZ = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, this.posZ + this.velZ * dt));

      // ===== 2. Beat-synchronized Spawning =====
      if (beatFloat >= this.nextItemBeat) {
        this.nextItemBeat = beatFloat + (this.isFever ? track.spawnEveryBeats * 0.72 : track.spawnEveryBeats);
        this.spawnDroppedItem();
      }
      if (!this.isFever && beatFloat >= this.nextRushBeat) {
        this.nextRushBeat = beatFloat + Math.max(2.6, 5.4 - track.rushRate * 7.5);
        if (Math.random() < track.rushRate + 0.55) {
          this.spawnRushSwirl();
        }
      }

      // ===== 3. Update Floating Dropped Items (Slow down gently inside Tsumazuki's aura or TIME SLOW!) =====
      const reach = this.gsm.getReachRadius();
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        const dist = Math.hypot(it.x - this.posX, it.z - this.posZ);
        const nearTsumazuki = dist < reach * 1.45;
        const localTimeScale = nearTsumazuki ? Math.min(tScale, 0.35) : tScale;

        it.age += dt * localTimeScale;
        if (it.age >= it.maxAge) {
          this.landingScene.worldGroup.remove(it.group);
          this.items.splice(i, 1);
          continue;
        }

        // Gentle descent into floating equilibrium around y = 0.85
        const targetY = 0.88 + Math.sin(elapsed * 2.2 * localTimeScale + it.phase) * 0.16;
        it.y += (targetY - it.y) * Math.min(1, dt * 2.2 * localTimeScale);

        // Fever auto-attraction or gentle time-slow pull when within reach
        if (this.isFever) {
          const dx = this.posX - it.x;
          const dz = this.posZ - it.z;
          const d = Math.max(0.01, Math.hypot(dx, dz));
          it.x += (dx / d) * dt * 6.4;
          it.z += (dz / d) * dt * 6.4;
        } else {
          it.x += it.vx * dt * localTimeScale;
          it.z += it.vz * dt * localTimeScale;
          if (it.x < -PLAY_AREA_HALF_X + 0.3 || it.x > PLAY_AREA_HALF_X - 0.3) it.vx *= -1;
          if (it.z < PLAY_AREA_MIN_Z + 0.3 || it.z > PLAY_AREA_MAX_Z - 0.3) it.vz *= -1;
        }

        it.group.position.set(it.x, it.y, it.z);
        it.group.rotation.y += dt * (it.itemId === 'watch' ? 2.4 : 1.4) * localTimeScale;
        const groundRing = it.group.getObjectByName('ground-ring');
        if (groundRing) {
          groundRing.position.y = -it.y + 0.03;
        }

        if (dist <= reach * 0.85) {
          this.collectDroppedItem(it);
          this.items.splice(i, 1);
        }
      }

      // ===== 4. Update Rushing Swirls ("あわて足") =====
      for (let i = this.rushes.length - 1; i >= 0; i--) {
        const r = this.rushes[i];
        r.age += dt * tScale;
        r.x += r.vx * dt * tScale;
        r.z += r.vz * dt * tScale;
        r.group.position.set(r.x, 0.72 + Math.sin(elapsed * 5 * tScale + r.phase) * 0.08, r.z);
        r.group.rotation.y += dt * 4.2 * tScale;
        r.group.rotation.x += dt * 2.4 * tScale;

        if (
          r.age >= r.maxAge ||
          Math.abs(r.x) > PLAY_AREA_HALF_X + 1.4 ||
          r.z < PLAY_AREA_MIN_Z - 1.2 ||
          r.z > PLAY_AREA_MAX_Z + 1.2
        ) {
          this.landingScene.worldGroup.remove(r.group);
          this.rushes.splice(i, 1);
          continue;
        }

        const d = Math.hypot(r.x - this.posX, r.z - this.posZ);
        if (d < r.radius + 0.35 && this.invulnTimer <= 0) {
          const rs = this.landingScene.projectToScreen(new THREE.Vector3(r.x, 0.8, r.z), this.fxW, this.fxH);
          this.landingScene.worldGroup.remove(r.group);
          this.rushes.splice(i, 1);

          if (this.shieldsRemaining > 0) {
            this.shieldsRemaining -= 1;
            this.invulnTimer = 0.85;
            this.sessionStats.rushesCalmed += 1;
            this.audio.playRushBumpSE(true);
            this.spawnBurst(rs.x, rs.y, '#7ee6d4', 16, 'spark');
            this.callbacks.onShieldChange(this.shieldsRemaining);
            this.callbacks.onFloatingText('🛡️ マントのまもり！', rs.x, rs.y - 16, '#9cf2e2');
          } else {
            this.invulnTimer = 1.05;
            this.combo = 0;
            this.actor.triggerHitFlash();
            this.landingScene.triggerShake(0.22, 0.28);
            this.audio.playRushBumpSE(false);
            this.spawnBurst(rs.x, rs.y, '#f28b6b', 16, 'spark');
            this.callbacks.onComboChange(0, 1);
            this.callbacks.onFloatingText('あわて足にぶつかった！', rs.x, rs.y - 16, '#ff9c86');
          }
        }
      }

      // ===== 5. Update 4 Interactive Stumble Spots =====
      let steadyingAny = false;
      let lookTarget: { x: number; z: number } | null = null;
      const steadyRate = this.gsm.getSteadyRate();

      for (const sp of this.spots) {
        const def = STUMBLE_SPOTS[sp.id];
        if (sp.cooldown > 0) {
          sp.cooldown = Math.max(0, sp.cooldown - dt);
          if (sp.cooldown <= 0) {
            sp.stability = 34 + Math.random() * 22;
          }
          this.landingScene.updateSpotVisual(sp.id, 100, false, sp.cooldown, elapsed, tScale);
          continue;
        }

        const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
        const inReach = dist <= reach + 0.42;

        if (this.isFever || inReach) {
          sp.steadying = true;
          if (inReach) {
            steadyingAny = true;
            lookTarget = { x: def.x, z: def.z };
          }
          const rate = this.isFever ? steadyRate * 0.9 : steadyRate;
          sp.stability = Math.min(100, sp.stability + rate * dt);
          sp.tickAccum += dt;
          if (inReach && sp.tickAccum >= 0.24) {
            sp.tickAccum = 0;
            this.audio.playSteadyTickSE(sp.stability / 100);
          }
          if (sp.stability >= 100) {
            this.completeStumbleSpotSave(sp);
          }
        } else {
          sp.steadying = false;
          // Danger grows slower when TIME SLOW is active!
          sp.stability = Math.max(8, sp.stability - track.spotSlipSpeed * dt * tScale);
        }

        this.landingScene.updateSpotVisual(sp.id, sp.stability, sp.steadying, 0, elapsed, tScale);
      }

      this.actor.setSteadyingSpot(steadyingAny);
      this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, lookTarget);
    } else {
      // Idle lobby spot display
      for (const sp of this.spots) {
        this.landingScene.updateSpotVisual(sp.id, 72, false, 0, elapsed, 1);
      }
      this.actor.setSteadyingSpot(false);
      this.actor.setMotion(0, 0.55, 0, 0, dt, null);
    }

    this.render2DFx(elapsed, dt, active);
  }

  private render2DFx(elapsed: number, dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Serene teal-gold vignette + subtle rotating clock-tick arc during TIME SLOW or SLOW SECOND fever!
    if (active && (this.isTimeSlowActive || this.isFever)) {
      const grad = ctx.createRadialGradient(
        this.fxW * 0.5,
        this.fxH * 0.5,
        Math.min(this.fxW, this.fxH) * 0.28,
        this.fxW * 0.5,
        this.fxH * 0.5,
        Math.max(this.fxW, this.fxH) * 0.65
      );
      grad.addColorStop(0, 'rgba(130, 240, 224, 0)');
      grad.addColorStop(
        1,
        this.isFever ? 'rgba(255, 224, 138, 0.22)' : 'rgba(92, 220, 200, 0.24)'
      );
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.fxW, this.fxH);

      // Delicate slow-rotating clock dial ticks in the center
      ctx.save();
      ctx.translate(this.fxW * 0.5, this.fxH * 0.5);
      ctx.rotate(elapsed * (this.isFever ? 0.12 : 0.06));
      const r = Math.min(this.fxW, this.fxH) * 0.36;
      ctx.strokeStyle = this.isFever ? 'rgba(255, 236, 175, 0.24)' : 'rgba(156, 242, 226, 0.28)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const inner = i % 2 === 0 ? r - 12 : r - 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (active) {
      // Draw gentle teal-gold time-slow beam from Tsumazuki's outstretched hand to any spot being steadied
      this.actor.getHandOriginWorldPos(this.tmpHandVec);
      const handScreen = this.landingScene.projectToScreen(this.tmpHandVec, this.fxW, this.fxH);

      for (const sp of this.spots) {
        const def = STUMBLE_SPOTS[sp.id];
        this.tmpVec.set(def.x, 1.55, def.z);
        const sPos = this.landingScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

        if (sp.steadying && sp.cooldown <= 0) {
          ctx.save();
          const g = ctx.createLinearGradient(handScreen.x, handScreen.y, sPos.x, sPos.y + 22);
          g.addColorStop(0, 'rgba(156, 242, 226, 0.82)');
          g.addColorStop(1, 'rgba(255, 232, 160, 0.88)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(handScreen.x, handScreen.y);
          const midX = (handScreen.x + sPos.x) * 0.5;
          const midY = (handScreen.y + sPos.y + 22) * 0.5 - 24 + Math.sin(elapsed * 8) * 5;
          ctx.quadraticCurveTo(midX, midY, sPos.x, sPos.y + 22);
          ctx.stroke();
          ctx.restore();
        }

        // Spot floating status pill & progress bar
        const w = 78;
        const h = 7;
        const bx = sPos.x - w * 0.5;
        const by = sPos.y - 16;

        ctx.save();
        ctx.fillStyle = 'rgba(12, 22, 32, 0.72)';
        ctx.beginPath();
        ctx.roundRect(bx - 4, by - 17, w + 8, 28, 8);
        ctx.fill();

        const isUrgent = sp.stability < 34 && sp.cooldown <= 0;
        ctx.font = '700 10.5px "Zen Maru Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle =
          sp.cooldown > 0
            ? '#ffe8a6'
            : sp.steadying
              ? '#9cf2e2'
              : isUrgent
                ? '#ff9d82'
                : '#dbeae8';
        const label =
          sp.cooldown > 0
            ? '✨ 運がよかった！'
            : sp.steadying
              ? '⏳ ゆっくり…'
              : isUrgent
                ? '⚠ あっ！ひやり'
                : def.shortName;
        ctx.fillText(label, sPos.x, by - 5);

        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.roundRect(bx, by + 1, w, h, 4);
        ctx.fill();

        const pct = Math.max(0, Math.min(1, sp.stability / 100));
        ctx.fillStyle =
          sp.cooldown > 0 ? '#ffe494' : isUrgent ? '#f27c62' : '#7ae8d5';
        ctx.beginPath();
        ctx.roundRect(bx, by + 1, w * pct, h, 4);
        ctx.fill();
        ctx.restore();
      }
    }

    // Update & render 2D FX particles
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fxParticles.splice(i, 1);
        continue;
      }
      const u = p.life / p.maxLife;
      const alpha = (1 - u) * p.alpha;

      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === 'ring' || p.kind === 'clockArc') {
        const rad = p.size + u * (p.kind === 'ring' ? 210 : 175);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = (1 - u) * (p.kind === 'ring' ? 5 : 3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - u * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
