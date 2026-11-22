import * as THREE from 'three';
import { WasuredamaAudioEngine } from './audioEngine';
import {
  LOST_ITEM_LIST,
  LOST_ITEM_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  RECIPIENT_ORDERS,
  WASUREDAMA_TRACKS,
} from './config';
import { WasuredamaStateManager } from './state';
import { StreetScene } from './streetScene';
import { LostItemId, RecipientOrderDef, WasuredamaRunStats } from './types';
import { WasuredamaActor } from './wasuredamaActor';

interface ActiveLostItem {
  id: number;
  kind: LostItemId;
  x: number;
  z: number;
  age: number;
  maxAge: number;
  phase: number;
  collecting: boolean;
  collectProgress: number;
  startX: number;
  startZ: number;
  mesh: THREE.Group;
}

interface ActiveHaze {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
  phase: number;
  mesh: THREE.Group;
}

interface FlyingLight {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  progress: number;
  duration: number;
  sprite: THREE.Sprite;
}

interface FxRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

interface FxSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface StreetSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: RecipientOrderDef, filled: boolean[], readyToDeliver: boolean) => void;
  onDelivered: (title: string, message: string, sproutsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remSec: number) => void;
  onShieldChange: (shields: number) => void;
  onPulseCooldownChange: (pct: number, ready: boolean) => void;
}

const RECIPIENT_SPOTS: [number, number][] = [
  [-3.4, 0.2],
  [3.6, -0.4],
  [0.0, -2.5],
  [2.4, 2.5],
  [-2.5, 2.4],
];

export class StreetSystem {
  private street: StreetScene;
  private actor: WasuredamaActor;
  private audio: WasuredamaAudioEngine;
  private gsm: WasuredamaStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private cb: StreetSystemCallbacks;

  private entitiesGroup = new THREE.Group();
  private recipientGroup = new THREE.Group();
  private recipientRing!: THREE.Mesh;
  private recipientCoreGlow!: THREE.Sprite;
  private recipientBodyMat!: THREE.MeshStandardMaterial;

  private items: ActiveLostItem[] = [];
  private hazes: ActiveHaze[] = [];
  private flyingLights: FlyingLight[] = [];
  private fxRipples: FxRipple[] = [];
  private fxSparks: FxSpark[] = [];

  private nextId = 1;
  private fxWidth = 1280;
  private fxHeight = 720;

  // Player movement state
  private playerX = 0;
  private playerZ = 0.8;
  private playerVx = 0;
  private playerVz = 0;
  private moveTarget: { x: number; z: number } | null = null;
  private keyState = { up: false, down: false, left: false, right: false };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Gameplay counters
  public combo = 0;
  private comboTimer = 0;
  public isFever = false;
  public feverGauge = 0;
  public feverRemaining = 0;
  public shieldsRemaining = 0;
  private pulseCooldown = 0;
  private pulseCooldownMax = 3.0;
  private invulnTimer = 0;

  // Beat cursors
  private lastSpawnBeat = -1;
  private lastShelfBeat = -1;

  // Active recipient order
  private orderIndex = 0;
  private currentOrder: RecipientOrderDef = RECIPIENT_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];
  private recipientSpotIdx = 0;
  private recipientX = RECIPIENT_SPOTS[0][0];
  private recipientZ = RECIPIENT_SPOTS[0][1];
  private recipientCelebrateTimer = 0;

  public sessionStats: WasuredamaRunStats = this.emptyStats();
  private tempVec = new THREE.Vector3();

  constructor(
    street: StreetScene,
    actor: WasuredamaActor,
    audio: WasuredamaAudioEngine,
    gsm: WasuredamaStateManager,
    fxCanvas: HTMLCanvasElement,
    cb: StreetSystemCallbacks
  ) {
    this.street = street;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.cb = cb;

    this.street.worldGroup.add(this.entitiesGroup);
    this.buildRecipientFigure();
    this.selectOrder(0);
  }

  private emptyStats(): WasuredamaRunStats {
    return {
      pickedUp: 0,
      delivered: 0,
      ordersCompleted: 0,
      hazesCleared: 0,
      maxCombo: 0,
      lightsEarned: 0,
      sproutsEarned: 0,
      score: 0,
    };
  }

  private buildRecipientFigure(): void {
    this.recipientGroup.position.set(this.recipientX, 0, this.recipientZ);
    this.entitiesGroup.add(this.recipientGroup);

    // Translucent standing silhouette of "someone who still needs their forgotten light"
    this.recipientBodyMat = new THREE.MeshStandardMaterial({
      color: 0x7c96cc,
      emissive: 0x3b5490,
      emissiveIntensity: 0.72,
      transparent: true,
      opacity: 0.62,
      roughness: 0.4,
    });

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 18), this.recipientBodyMat);
    cloak.position.y = 0.72;
    this.recipientGroup.add(cloak);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), this.recipientBodyMat);
    head.position.y = 1.56;
    this.recipientGroup.add(head);

    // Heart light inside chest
    this.recipientCoreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.street.glowTex,
        color: 0xffd78a,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.recipientCoreGlow.position.set(0, 1.08, 0.16);
    this.recipientCoreGlow.scale.set(1.05, 1.05, 1);
    this.recipientGroup.add(this.recipientCoreGlow);

    // Ground delivery halo ring
    this.recipientRing = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.36, 40),
      new THREE.MeshBasicMaterial({
        color: 0x9fd0ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.recipientRing.rotation.x = -Math.PI / 2;
    this.recipientRing.position.y = 0.04;
    this.recipientGroup.add(this.recipientRing);
  }

  public resizeFx(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxWidth = width;
    this.fxHeight = height;
    this.fxCanvas.width = Math.round(width * dpr);
    this.fxCanvas.height = Math.round(height * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public setKey(dir: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    this.keyState[dir] = down;
    if (down) {
      this.moveTarget = null;
    }
  }

  public clearKeys(): void {
    this.keyState.up = false;
    this.keyState.down = false;
    this.keyState.left = false;
    this.keyState.right = false;
    this.moveTarget = null;
  }

  public setPointerTarget(virtualX: number, virtualY: number): void {
    const ndcX = (virtualX / Math.max(1, this.fxWidth)) * 2 - 1;
    const ndcY = -(virtualY / Math.max(1, this.fxHeight)) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.street.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      const tx = THREE.MathUtils.clamp(hit.x, -PLAY_AREA_HALF_X, PLAY_AREA_HALF_X);
      const tz = THREE.MathUtils.clamp(hit.z, PLAY_AREA_MIN_Z, PLAY_AREA_MAX_Z);
      this.moveTarget = { x: tx, z: tz };
    }
  }

  public clearPointerTarget(): void {
    this.moveTarget = null;
  }

  public resetSession(spawnInitial: boolean): void {
    for (const item of this.items) this.entitiesGroup.remove(item.mesh);
    this.items = [];
    for (const haze of this.hazes) this.entitiesGroup.remove(haze.mesh);
    this.hazes = [];
    for (const fl of this.flyingLights) this.entitiesGroup.remove(fl.sprite);
    this.flyingLights = [];
    this.fxRipples = [];
    this.fxSparks = [];

    this.playerX = 0;
    this.playerZ = 0.8;
    this.playerVx = 0;
    this.playerVz = 0;
    this.moveTarget = null;
    this.actor.setMotion(this.playerX, this.playerZ, 0, 0, 0.016);
    this.street.setPlayerFocus(this.playerX, this.playerZ);

    this.combo = 0;
    this.comboTimer = 0;
    this.isFever = false;
    this.feverGauge = 0;
    this.feverRemaining = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.pulseCooldown = 0;
    this.pulseCooldownMax = this.gsm.getPulseCooldownSec();
    this.invulnTimer = 0;
    this.sessionStats = this.emptyStats();
    this.recipientCelebrateTimer = 0;

    this.selectOrder(Math.floor(Math.random() * RECIPIENT_ORDERS.length));
    this.cb.onComboChange(0, 1);
    this.cb.onFeverChange(false, 0, 0);
    this.cb.onShieldChange(this.shieldsRemaining);
    this.cb.onPulseCooldownChange(1, true);
    this.cb.onStateDirty();

    if (spawnInitial) {
      // Seed 5 glowing lost items across the cobblestones so play feels lively immediately
      for (let i = 0; i < 5; i++) {
        this.spawnLostItem(false);
      }
    }
  }

  public resetBeatCursors(beatFloat: number): void {
    const track = WASUREDAMA_TRACKS[this.audio.currentTrackId];
    this.lastSpawnBeat = Math.floor(beatFloat / track.spawnEveryBeats);
    this.lastShelfBeat = Math.floor(beatFloat / 4);
  }

  private selectOrder(index: number): void {
    this.orderIndex = index % RECIPIENT_ORDERS.length;
    this.currentOrder = RECIPIENT_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.moveRecipientToNewSpot();
    this.cb.onOrderChange(this.currentOrder, [...this.orderFilled], false);
  }

  private moveRecipientToNewSpot(): void {
    const nextIdx = (this.recipientSpotIdx + 1 + Math.floor(Math.random() * 2)) % RECIPIENT_SPOTS.length;
    this.recipientSpotIdx = nextIdx;
    this.recipientX = RECIPIENT_SPOTS[nextIdx][0];
    this.recipientZ = RECIPIENT_SPOTS[nextIdx][1];
    this.recipientGroup.position.set(this.recipientX, 0, this.recipientZ);
  }

  private isOrderReady(): boolean {
    return this.orderFilled.every(Boolean);
  }

  private projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number } {
    this.tempVec.set(wx, wy, wz).project(this.street.camera);
    return {
      x: (this.tempVec.x * 0.5 + 0.5) * this.fxWidth,
      y: (-this.tempVec.y * 0.5 + 0.5) * this.fxHeight,
    };
  }

  private spawnFxBurst(wx: number, wy: number, wz: number, color: string, count = 10, maxR = 66): void {
    const pt = this.projectToScreen(wx, wy, wz);
    this.fxRipples.push({
      x: pt.x,
      y: pt.y,
      radius: 10,
      maxRadius: maxR,
      color,
      alpha: 0.9,
      lineWidth: 2.8,
    });
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 48 + Math.random() * 110;
      this.fxSparks.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 26,
        size: 2.2 + Math.random() * 3.0,
        color,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  private spawnFlyingLight(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    colorHex: number,
    duration = 0.52
  ): void {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.street.glowTex,
        color: colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    sp.scale.set(0.62, 0.62, 1);
    sp.position.set(sx, sy, sz);
    this.entitiesGroup.add(sp);
    this.flyingLights.push({
      startX: sx,
      startY: sy,
      startZ: sz,
      endX: ex,
      endY: ey,
      endZ: ez,
      progress: 0,
      duration,
      sprite: sp,
    });
  }

  private pickItemKind(forceStarlight = false): LostItemId {
    if (forceStarlight) return 'starlight';

    // Gently favor still-needed order items so deliveries flow smoothly
    const missing = this.currentOrder.items.filter((_, idx) => !this.orderFilled[idx]);
    if (missing.length > 0 && Math.random() < 0.44) {
      return missing[Math.floor(Math.random() * missing.length)];
    }

    const starBonus = this.gsm.state.upgrades.hopeJars * 5 + (this.isFever ? 18 : 0);
    const weights = LOST_ITEM_LIST.map((d) =>
      d.id === 'starlight' ? d.weight + starBonus : d.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < LOST_ITEM_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return LOST_ITEM_LIST[i].id;
    }
    return 'dream';
  }

  private createLostItemMesh(kind: LostItemId): THREE.Group {
    const def = LOST_ITEM_MAP[kind];
    const g = new THREE.Group();

    const coreMat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: 1.05,
      roughness: 0.22,
      metalness: 0.15,
    });

    if (kind === 'dream') {
      // Blue dream orb with floating halo ring
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), coreMat);
      orb.position.y = 0.42;
      g.add(orb);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.032, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.72 })
      );
      ring.position.y = 0.42;
      ring.rotation.x = Math.PI * 0.35;
      g.add(ring);
    } else if (kind === 'promise') {
      // Orange knotted promise ribbon
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.055, 36, 8, 2, 3), coreMat);
      knot.position.y = 0.44;
      g.add(knot);
    } else if (kind === 'hope') {
      // Sprouting green-gold bud inside soft glass sphere
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), coreMat);
      bud.position.y = 0.38;
      g.add(bud);
      const leafMat = new THREE.MeshStandardMaterial({
        color: 0xbff5a8,
        emissive: 0x5dc464,
        emissiveIntensity: 0.9,
        roughness: 0.35,
      });
      [-1, 1].forEach((s) => {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMat);
        lf.scale.set(1.4, 0.45, 0.7);
        lf.position.set(s * 0.14, 0.56, 0);
        lf.rotation.z = s * -0.45;
        g.add(lf);
      });
    } else if (kind === 'note') {
      // Glowing miniature old notebook
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.28), coreMat);
      cover.position.y = 0.44;
      cover.rotation.set(0.28, 0.4, 0.15);
      g.add(cover);
      const pages = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.08, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xfff4d4 })
      );
      pages.position.y = 0.45;
      pages.rotation.copy(cover.rotation);
      g.add(pages);
    } else {
      // Starlight rare octahedron crystal
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), coreMat);
      gem.position.y = 0.48;
      g.add(gem);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.03, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff5c8, transparent: true, opacity: 0.85 })
      );
      ring.position.y = 0.48;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }

    // Soft additive aura sprite & floor pool
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.street.glowTex,
        color: def.colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: kind === 'starlight' ? 0.92 : 0.66,
        depthWrite: false,
      })
    );
    sp.scale.set(kind === 'starlight' ? 1.55 : 1.12, kind === 'starlight' ? 1.55 : 1.12, 1);
    sp.position.y = 0.44;
    g.add(sp);

    const floorDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 18),
      new THREE.MeshBasicMaterial({
        map: this.street.glowTex,
        color: def.colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    floorDot.rotation.x = -Math.PI / 2;
    floorDot.position.y = 0.02;
    g.add(floorDot);

    return g;
  }

  private createHazeMesh(): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({
        color: 0x2f2042,
        emissive: 0x5c2e8a,
        emissiveIntensity: 0.85,
        roughness: 0.65,
      })
    );
    core.position.y = 0.48;
    g.add(core);

    const mist = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.street.glowTex,
        color: 0x8244b8,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
      })
    );
    mist.scale.set(1.45, 1.45, 1);
    mist.position.y = 0.48;
    g.add(mist);

    const warnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 22),
      new THREE.MeshBasicMaterial({
        color: 0xb672ff,
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    warnRing.rotation.x = -Math.PI / 2;
    warnRing.position.y = 0.028;
    g.add(warnRing);

    return g;
  }

  private spawnLostItem(forceStarlight = false): void {
    const track = WASUREDAMA_TRACKS[this.audio.currentTrackId];
    if (this.items.length >= track.maxActiveItems + (this.isFever ? 4 : 0)) return;

    // Pick a nice cobblestone spot not overlapping Wasuredama or the recipient too tightly
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 10; tries++) {
      x = (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
      z = PLAY_AREA_MIN_Z + 0.4 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.7);
      const distPlayer = Math.hypot(x - this.playerX, z - this.playerZ);
      const distRecip = Math.hypot(x - this.recipientX, z - this.recipientZ);
      if (distPlayer > 1.5 && distRecip > 1.35) break;
    }

    const kind = this.pickItemKind(forceStarlight);
    const mesh = this.createLostItemMesh(kind);
    mesh.position.set(x, 0, z);
    mesh.scale.setScalar(0.01);
    this.entitiesGroup.add(mesh);

    this.items.push({
      id: this.nextId++,
      kind,
      x,
      z,
      age: 0,
      maxAge: 14.5,
      phase: Math.random() * Math.PI * 2,
      collecting: false,
      collectProgress: 0,
      startX: x,
      startZ: z,
      mesh,
    });
  }

  private spawnHaze(): void {
    if (this.isFever || this.hazes.length >= 4) return;
    // Enter gently from left or right edge of the cobblestone street
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -PLAY_AREA_HALF_X - 0.3 : PLAY_AREA_HALF_X + 0.3;
    const z = PLAY_AREA_MIN_Z + 0.6 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.2);
    const speed = 1.05 + Math.random() * 0.55;
    const vx = (fromLeft ? 1 : -1) * speed;
    const vz = (Math.random() - 0.5) * 0.65;

    const mesh = this.createHazeMesh();
    mesh.position.set(x, 0, z);
    this.entitiesGroup.add(mesh);

    this.hazes.push({
      id: this.nextId++,
      x,
      z,
      vx,
      vz,
      age: 0,
      maxAge: 11.5,
      phase: Math.random() * Math.PI * 2,
      mesh,
    });
  }

  private completePickup(item: ActiveLostItem): void {
    const def = LOST_ITEM_MAP[item.kind];
    const track = WASUREDAMA_TRACKS[this.audio.currentTrackId];

    this.combo += 1;
    this.comboTimer = 4.6;
    if (this.combo > this.sessionStats.maxCombo) {
      this.sessionStats.maxCombo = this.combo;
    }
    if (this.combo > this.gsm.state.bestCombo) {
      this.gsm.state.bestCombo = this.combo;
    }

    const comboMult = Math.min(2.5, 1 + Math.floor(this.combo / 5) * 0.15);
    const feverMult = this.isFever ? 2.0 : 1.0;
    const earned = Math.max(
      1,
      Math.round(def.baseValue * track.valueMultiplier * this.gsm.getLightMultiplier() * comboMult * feverMult)
    );

    this.gsm.state.lights += earned;
    this.gsm.state.totalLightsEarned += earned;
    this.gsm.state.sackFill = Math.min(this.gsm.getSackCapacity(), this.gsm.state.sackFill + 1);

    this.sessionStats.pickedUp += 1;
    this.sessionStats.lightsEarned += earned;
    this.sessionStats.score += earned * 10;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    if (!this.isFever) {
      this.feverGauge = Math.min(100, this.feverGauge + def.feverGain);
      this.cb.onFeverChange(false, this.feverGauge, 0);
    }

    // Fill matching slot in current recipient order (starlight acts as wildcard!)
    let slotMatched = false;
    for (let i = 0; i < this.currentOrder.items.length; i++) {
      if (!this.orderFilled[i] && (this.currentOrder.items[i] === item.kind || item.kind === 'starlight')) {
        this.orderFilled[i] = true;
        slotMatched = true;
        break;
      }
    }
    if (slotMatched) {
      this.cb.onOrderChange(this.currentOrder, [...this.orderFilled], this.isOrderReady());
    }

    this.actor.onPickup();
    this.audio.playPickupSE(this.combo, item.kind === 'starlight');
    this.spawnFxBurst(this.playerX, 0.75, this.playerZ, def.cssColor, item.kind === 'starlight' ? 16 : 9, 64);

    const pt = this.projectToScreen(this.playerX, 1.45, this.playerZ);
    this.cb.onFloatingText(
      `${def.icon} +${earned}`,
      pt.x,
      pt.y,
      def.cssColor,
      item.kind === 'starlight' ? 'STARLIGHT!' : slotMatched ? 'お届け準備OK!' : def.shortName
    );

    this.cb.onComboChange(this.combo, comboMult);
    this.cb.onStateDirty();
  }

  /** Deliver current completed order to the waiting recipient figure */
  private deliverOrderToRecipient(): void {
    const order = this.currentOrder;
    const bonusLights = Math.round(order.bonusLights * this.gsm.getLightMultiplier() * (this.isFever ? 1.5 : 1));
    const sprouts = order.bonusSprouts + Math.floor(this.gsm.state.upgrades.burlapSack / 2);

    this.gsm.state.lights += bonusLights;
    this.gsm.state.totalLightsEarned += bonusLights;
    this.gsm.state.sprouts += sprouts;
    this.gsm.state.totalOrdersCompleted += 1;
    this.gsm.state.totalDeliveries += 1;

    this.sessionStats.delivered += 1;
    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.lightsEarned += bonusLights;
    this.sessionStats.sproutsEarned += sprouts;
    this.sessionStats.score += bonusLights * 15;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.combo += 2;
    this.comboTimer = 5.0;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;

    // Launch 3 warm glowing orbs from Wasuredama's sack to the recipient's heart
    const sackOrigin = this.actor.getSackWorldPos(new THREE.Vector3());
    order.items.forEach((kind, idx) => {
      const def = LOST_ITEM_MAP[kind];
      this.spawnFlyingLight(
        sackOrigin.x,
        sackOrigin.y,
        sackOrigin.z,
        this.recipientX + (idx - 1) * 0.14,
        1.15 + idx * 0.12,
        this.recipientZ,
        def.colorHex,
        0.48 + idx * 0.08
      );
    });

    this.recipientCelebrateTimer = 1.1;
    this.actor.onCelebrate();
    this.audio.playDeliverSE(true);
    this.street.triggerShake(0.12, 0.18);
    this.spawnFxBurst(this.recipientX, 1.15, this.recipientZ, '#ffe49e', 20, 105);

    const pt = this.projectToScreen(this.recipientX, 1.85, this.recipientZ);
    this.cb.onFloatingText(
      `🌱 +${sprouts} 芽 / +${bonusLights} 灯り`,
      pt.x,
      pt.y,
      '#ffe8a8',
      `お届け完了「${order.recipientLabel}」`
    );

    this.cb.onDelivered(order.name, order.whisperMessage, sprouts);
    this.cb.onComboChange(this.combo, Math.min(2.5, 1 + Math.floor(this.combo / 5) * 0.15));

    // Advance to next recipient order & relocate recipient softly
    this.selectOrder(this.orderIndex + 1);
    this.cb.onStateDirty();
  }

  /** Deliver a full burlap sack (12/12) into the night street for Sprout rewards */
  public deliverFullSack(): boolean {
    const cap = this.gsm.getSackCapacity();
    if (this.gsm.state.sackFill < cap) return false;

    this.gsm.state.sackFill = 0;
    const sprouts = this.gsm.getSproutsPerDelivery();
    const bonusLights = Math.round(96 * this.gsm.getLightMultiplier() * (this.isFever ? 1.5 : 1));

    this.gsm.state.sprouts += sprouts;
    this.gsm.state.lights += bonusLights;
    this.gsm.state.totalLightsEarned += bonusLights;
    this.gsm.state.totalDeliveries += 1;

    this.sessionStats.delivered += 1;
    this.sessionStats.lightsEarned += bonusLights;
    this.sessionStats.sproutsEarned += sprouts;
    this.sessionStats.score += bonusLights * 14;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    const sackOrigin = this.actor.getSackWorldPos(new THREE.Vector3());
    const colors = [0x84c8ff, 0xffb46b, 0xa8e89e, 0xffe094, 0xfff5c8];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI * 2 * i) / 6;
      this.spawnFlyingLight(
        sackOrigin.x,
        sackOrigin.y,
        sackOrigin.z,
        this.playerX + Math.cos(ang) * 2.4,
        2.6 + (i % 2) * 0.5,
        this.playerZ + Math.sin(ang) * 2.0,
        colors[i % colors.length],
        0.65
      );
    }

    this.actor.onCelebrate();
    this.audio.playDeliverSE(true);
    this.street.triggerShake(0.14, 0.2);
    this.spawnFxBurst(this.playerX, 1.0, this.playerZ, '#ffe8a8', 22, 118);

    const pt = this.projectToScreen(this.playerX, 1.9, this.playerZ);
    this.cb.onFloatingText(
      `🎒 袋のお届け完了！ +${sprouts} 思い出の芽`,
      pt.x,
      pt.y,
      '#fff0b5',
      `+${bonusLights} こころの灯り`
    );

    this.cb.onDelivered(
      'たいせつな布袋のお返し',
      '「きっと、だいじょうぶ。誰かの心に小さな灯りが戻りました」',
      sprouts
    );
    this.cb.onStateDirty();
    return true;
  }

  /** Trigger Lamp Bloom pulse: clears surrounding hazes & magnet-collects nearby lost items */
  public triggerLampPulse(): boolean {
    if (this.pulseCooldown > 0) return false;

    this.pulseCooldownMax = this.gsm.getPulseCooldownSec();
    this.pulseCooldown = this.pulseCooldownMax;
    const radius = this.gsm.getPulseRadius() * (this.isFever ? 1.3 : 1.0);

    let cleared = 0;
    for (let i = this.hazes.length - 1; i >= 0; i--) {
      const h = this.hazes[i];
      if (Math.hypot(h.x - this.playerX, h.z - this.playerZ) <= radius + 0.65) {
        cleared += 1;
        this.sessionStats.hazesCleared += 1;
        const reward = Math.round(28 * this.gsm.getLightMultiplier());
        this.gsm.state.lights += reward;
        this.gsm.state.totalLightsEarned += reward;
        this.sessionStats.lightsEarned += reward;
        this.sessionStats.score += reward * 12;
        this.spawnFxBurst(h.x, 0.6, h.z, '#c7a4ff', 10, 56);
        const hpt = this.projectToScreen(h.x, 1.0, h.z);
        this.cb.onFloatingText(`✨ +${reward}`, hpt.x, hpt.y, '#d6bcff', 'もや浄化!');
        this.entitiesGroup.remove(h.mesh);
        this.hazes.splice(i, 1);
      }
    }

    // Magnetically pull nearby lost items straight into the burlap sack
    let pulled = 0;
    for (const item of this.items) {
      if (!item.collecting && Math.hypot(item.x - this.playerX, item.z - this.playerZ) <= radius) {
        item.collecting = true;
        item.collectProgress = 0;
        item.startX = item.x;
        item.startZ = item.z;
        pulled += 1;
      }
    }

    this.actor.onLampPulse(radius);
    this.audio.playLampPulseSE(cleared);
    this.street.triggerShake(cleared > 0 ? 0.16 : 0.08, 0.2);
    this.spawnFxBurst(this.playerX, 0.45, this.playerZ, '#ffe49e', 18, 128);

    if (cleared > 0 || pulled > 0) {
      const pt = this.projectToScreen(this.playerX, 1.65, this.playerZ);
      this.cb.onFloatingText(
        cleared > 0 ? `💡 街灯パルス！ ${cleared}浄化` : `💡 街灯パルス！ ${pulled}回収`,
        pt.x,
        pt.y,
        '#ffe7a6'
      );
    }

    this.cb.onPulseCooldownChange(0, false);
    this.cb.onStateDirty();
    return true;
  }

  /** Activate STARLIT STREET Fever when gauge hits 100% */
  public activateFever(): boolean {
    if (this.isFever || this.feverGauge < 100) return false;
    this.isFever = true;
    this.feverGauge = 0;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    // Transform all active hazes into rare Starlight orbs!
    for (const h of this.hazes) {
      this.entitiesGroup.remove(h.mesh);
      const mesh = this.createLostItemMesh('starlight');
      mesh.position.set(h.x, 0, h.z);
      this.entitiesGroup.add(mesh);
      this.items.push({
        id: this.nextId++,
        kind: 'starlight',
        x: h.x,
        z: h.z,
        age: 0,
        maxAge: 14,
        phase: Math.random() * Math.PI * 2,
        collecting: false,
        collectProgress: 0,
        startX: h.x,
        startZ: h.z,
        mesh,
      });
    }
    this.hazes = [];

    // Also spawn 2 bonus starlight orbs
    this.spawnLostItem(true);
    this.spawnLostItem(true);

    this.actor.onCelebrate();
    this.audio.playFeverStartSE();
    this.street.triggerShake(0.2, 0.3);
    this.spawnFxBurst(this.playerX, 1.0, this.playerZ, '#fff2b0', 26, 150);
    this.cb.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    // Cooldowns & timers
    if (this.pulseCooldown > 0) {
      this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
      const pct = 1 - this.pulseCooldown / Math.max(0.1, this.pulseCooldownMax);
      this.cb.onPulseCooldownChange(pct, this.pulseCooldown <= 0);
    }
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.recipientCelebrateTimer = Math.max(0, this.recipientCelebrateTimer - dt);

    if (active) {
      // Fever countdown
      if (this.isFever) {
        this.feverRemaining -= dt;
        const pct = Math.max(0, (this.feverRemaining / this.gsm.getFeverDurationSec()) * 100);
        if (this.feverRemaining <= 0) {
          this.isFever = false;
          this.feverRemaining = 0;
          this.cb.onFeverChange(false, 0, 0);
        } else {
          this.cb.onFeverChange(true, pct, this.feverRemaining);
        }
      }

      // Combo decay
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.combo = 0;
          this.cb.onComboChange(0, 1);
        }
      }

      // Beat-synced spawning & Sorting Shelf auto-resonance
      const track = WASUREDAMA_TRACKS[this.audio.currentTrackId];
      const spawnSlot = Math.floor(beatFloat / track.spawnEveryBeats);
      if (spawnSlot > this.lastSpawnBeat) {
        this.lastSpawnBeat = spawnSlot;
        this.spawnLostItem(false);
        if (this.isFever && Math.random() < 0.45) {
          this.spawnLostItem(false);
        }
        if (!this.isFever && Math.random() < track.hazeRate) {
          this.spawnHaze();
        }
      }

      const shelfLv = this.gsm.state.upgrades.sortingShelf;
      const shelfSlot = Math.floor(beatFloat / 4);
      if (shelfLv > 0 && shelfSlot > this.lastShelfBeat) {
        this.lastShelfBeat = shelfSlot;
        const autoLights = shelfLv * 9;
        this.gsm.state.lights += autoLights;
        this.gsm.state.totalLightsEarned += autoLights;
        this.sessionStats.lightsEarned += autoLights;
        this.spawnFlyingLight(
          (Math.random() - 0.5) * 3.8,
          1.7 + Math.random() * 1.1,
          -6.6,
          this.playerX,
          0.9,
          this.playerZ,
          0xffda8a,
          0.6
        );
        this.cb.onStateDirty();
      }

      // Player movement (keyboard or pointer target)
      const moveSpeed = this.isFever ? 6.2 : 4.95;
      let dirX = (this.keyState.right ? 1 : 0) - (this.keyState.left ? 1 : 0);
      let dirZ = (this.keyState.down ? 1 : 0) - (this.keyState.up ? 1 : 0);

      if (dirX !== 0 || dirZ !== 0) {
        const len = Math.hypot(dirX, dirZ);
        dirX /= len;
        dirZ /= len;
        this.playerVx = dirX * moveSpeed;
        this.playerVz = dirZ * moveSpeed;
      } else if (this.moveTarget) {
        const dx = this.moveTarget.x - this.playerX;
        const dz = this.moveTarget.z - this.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.14) {
          const spd = Math.min(moveSpeed, dist * 6.5);
          this.playerVx = (dx / dist) * spd;
          this.playerVz = (dz / dist) * spd;
        } else {
          this.playerVx *= Math.exp(-14 * dt);
          this.playerVz *= Math.exp(-14 * dt);
        }
      } else {
        this.playerVx *= Math.exp(-12 * dt);
        this.playerVz *= Math.exp(-12 * dt);
      }

      this.playerX = THREE.MathUtils.clamp(
        this.playerX + this.playerVx * dt,
        -PLAY_AREA_HALF_X,
        PLAY_AREA_HALF_X
      );
      this.playerZ = THREE.MathUtils.clamp(
        this.playerZ + this.playerVz * dt,
        PLAY_AREA_MIN_Z,
        PLAY_AREA_MAX_Z
      );

      this.actor.setMotion(this.playerX, this.playerZ, this.playerVx, this.playerVz, dt);
      this.street.setPlayerFocus(this.playerX, this.playerZ);

      // Update lost items & check pickup reach
      const pickupRad = this.gsm.getPickupRadius() * (this.isFever ? 1.48 : 1.0);
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        item.age += dt;

        if (item.collecting) {
          item.collectProgress += dt / 0.24;
          const p = Math.min(1, item.collectProgress);
          const ease = 1 - Math.pow(1 - p, 2);
          const sackPos = this.actor.getSackWorldPos(this.tempVec);
          const arcY = Math.sin(p * Math.PI) * 0.95;
          item.mesh.position.set(
            THREE.MathUtils.lerp(item.startX, sackPos.x, ease),
            THREE.MathUtils.lerp(0.25, sackPos.y, ease) + arcY,
            THREE.MathUtils.lerp(item.startZ, sackPos.z, ease)
          );
          item.mesh.scale.setScalar(Math.max(0.15, 1 - p * 0.72));
          item.mesh.rotation.y += dt * 9;

          if (p >= 1) {
            this.entitiesGroup.remove(item.mesh);
            this.items.splice(i, 1);
            this.completePickup(item);
          }
          continue;
        }

        // Gentle spawn pop-in & despawn fade-out
        const enterScale = Math.min(1, item.age * 3.8);
        const exitScale = item.age > item.maxAge - 1.2 ? Math.max(0, (item.maxAge - item.age) / 1.2) : 1;
        const distToPlayer = Math.hypot(item.x - this.playerX, item.z - this.playerZ);
        const illumBoost = distToPlayer < pickupRad * 1.9 ? 1.15 : 0.92;
        item.mesh.scale.setScalar(enterScale * exitScale * illumBoost);
        item.mesh.position.set(
          item.x,
          Math.sin(elapsed * 2.8 + item.phase) * 0.1,
          item.z
        );
        item.mesh.rotation.y = elapsed * 1.3 + item.phase;

        if (distToPlayer <= pickupRad) {
          item.collecting = true;
          item.collectProgress = 0;
          item.startX = item.x;
          item.startZ = item.z;
          continue;
        }

        if (item.age >= item.maxAge) {
          this.entitiesGroup.remove(item.mesh);
          this.items.splice(i, 1);
        }
      }

      // Check recipient delivery when order is complete (or sack is full near recipient!)
      const distToRecipient = Math.hypot(this.playerX - this.recipientX, this.playerZ - this.recipientZ);
      if (distToRecipient <= 1.65) {
        if (this.isOrderReady()) {
          this.deliverOrderToRecipient();
        } else if (this.gsm.state.sackFill >= this.gsm.getSackCapacity()) {
          this.deliverFullSack();
        }
      }

      // Update hazes & check collision
      for (let i = this.hazes.length - 1; i >= 0; i--) {
        const h = this.hazes[i];
        h.age += dt;
        h.x += h.vx * dt;
        h.z += (h.vz + Math.sin(elapsed * 2.2 + h.phase) * 0.55) * dt;
        h.z = THREE.MathUtils.clamp(h.z, PLAY_AREA_MIN_Z, PLAY_AREA_MAX_Z);
        h.mesh.position.set(h.x, Math.sin(elapsed * 3.4 + h.phase) * 0.08, h.z);
        h.mesh.rotation.y += dt * 1.8;

        const outOfBounds = Math.abs(h.x) > PLAY_AREA_HALF_X + 1.4 || h.age >= h.maxAge;
        if (outOfBounds) {
          this.entitiesGroup.remove(h.mesh);
          this.hazes.splice(i, 1);
          continue;
        }

        const dist = Math.hypot(h.x - this.playerX, h.z - this.playerZ);
        if (dist < 0.85 && this.invulnTimer <= 0) {
          this.entitiesGroup.remove(h.mesh);
          this.hazes.splice(i, 1);
          this.invulnTimer = 0.85;

          if (this.shieldsRemaining > 0) {
            this.shieldsRemaining -= 1;
            this.cb.onShieldChange(this.shieldsRemaining);
            this.audio.playShieldBlockSE();
            this.spawnFxBurst(this.playerX, 0.7, this.playerZ, '#98d8ff', 14, 78);
            const pt = this.projectToScreen(this.playerX, 1.5, this.playerZ);
            this.cb.onFloatingText('🛡️ 街灯のまもり!', pt.x, pt.y, '#9cd8ff', 'コンボ維持');
          } else {
            this.combo = 0;
            this.cb.onComboChange(0, 1);
            this.actor.onHazeHit();
            this.audio.playHazeHitSE();
            this.street.triggerShake(0.24, 0.28);
            this.spawnFxBurst(this.playerX, 0.7, this.playerZ, '#b97aff', 12, 70);
            const pt = this.projectToScreen(this.playerX, 1.5, this.playerZ);
            this.cb.onFloatingText('ためらいのもや…', pt.x, pt.y, '#d2a8ff', '灯りパルスで浄化!');
          }
        }
      }
    }

    // Animate recipient figure (pulses warmly gold when ready for delivery!)
    const ready = this.isOrderReady();
    this.recipientGroup.visible = active;
    if (active) {
      this.recipientGroup.position.y = Math.sin(elapsed * 2.2) * 0.05;
      const ringMat = this.recipientRing.material as THREE.MeshBasicMaterial;
      const pulse = 1 + Math.sin(elapsed * (ready ? 6.0 : 2.6)) * (ready ? 0.1 : 0.04);
      this.recipientRing.scale.setScalar(pulse);
      ringMat.color.setHex(ready ? 0xffe07d : 0x8fc4ff);
      ringMat.opacity = ready ? 0.88 : 0.42;

      this.recipientBodyMat.emissive.setHex(
        this.recipientCelebrateTimer > 0 ? 0xffd274 : ready ? 0xc48b36 : 0x3b5490
      );
      this.recipientBodyMat.emissiveIntensity =
        this.recipientCelebrateTimer > 0 ? 1.4 : ready ? 1.05 : 0.65;

      const glowSz = ready ? 1.65 + Math.sin(elapsed * 5.2) * 0.25 : 0.95;
      this.recipientCoreGlow.scale.set(glowSz, glowSz, 1);
    }

    // Update flying delivery/shelf lights
    for (let i = this.flyingLights.length - 1; i >= 0; i--) {
      const fl = this.flyingLights[i];
      fl.progress += dt / fl.duration;
      const p = Math.min(1, fl.progress);
      const ease = 1 - Math.pow(1 - p, 2);
      fl.sprite.position.set(
        THREE.MathUtils.lerp(fl.startX, fl.endX, ease),
        THREE.MathUtils.lerp(fl.startY, fl.endY, ease) + Math.sin(p * Math.PI) * 1.15,
        THREE.MathUtils.lerp(fl.startZ, fl.endZ, ease)
      );
      (fl.sprite.material as THREE.SpriteMaterial).opacity = 1 - p * 0.7;
      if (p >= 1) {
        this.entitiesGroup.remove(fl.sprite);
        this.flyingLights.splice(i, 1);
      }
    }

    this.renderFx(dt, active);
  }

  private renderFx(dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxWidth, this.fxHeight);

    // Subtle tap/drag destination beacon on ground
    if (active && this.moveTarget) {
      const dist = Math.hypot(this.moveTarget.x - this.playerX, this.moveTarget.z - this.playerZ);
      if (dist > 0.25) {
        const pt = this.projectToScreen(this.moveTarget.x, 0.06, this.moveTarget.z);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 224, 156, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 224, 156, 0.35)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Recipient delivery marker label floating cleanly over waiting figure
    if (active) {
      const ready = this.isOrderReady();
      const pt = this.projectToScreen(this.recipientX, 2.05, this.recipientZ);
      if (pt.x > 20 && pt.x < this.fxWidth - 20 && pt.y > 40 && pt.y < this.fxHeight - 60) {
        ctx.save();
        const text = ready
          ? `✨ 近づいてそっと届ける！`
          : `👤 ${this.currentOrder.recipientLabel}`;
        ctx.font = `800 ${ready ? 13 : 11.5}px 'Zen Maru Gothic', sans-serif`;
        const tw = ctx.measureText(text).width + 20;
        const bx = pt.x - tw / 2;
        const by = pt.y - 14;
        ctx.fillStyle = ready ? 'rgba(42, 28, 12, 0.88)' : 'rgba(14, 22, 42, 0.78)';
        ctx.strokeStyle = ready ? 'rgba(255, 224, 138, 0.92)' : 'rgba(154, 200, 255, 0.45)';
        ctx.lineWidth = ready ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, 24, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = ready ? '#fff0bd' : '#d8e6ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, pt.x, pt.y - 2);
        ctx.restore();
      }
    }

    // Expanding light ripples
    for (let i = this.fxRipples.length - 1; i >= 0; i--) {
      const r = this.fxRipples[i];
      r.radius += (r.maxRadius - r.radius) * Math.min(1, dt * 7.5);
      r.alpha -= dt * 2.2;
      if (r.alpha <= 0.02) {
        this.fxRipples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Spark particles
    for (let i = this.fxSparks.length - 1; i >= 0; i--) {
      const s = this.fxSparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.fxSparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      const alpha = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
