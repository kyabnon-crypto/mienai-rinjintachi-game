import * as THREE from 'three';
import { TomerunAudioEngine } from './audioEngine';
import {
  MOMENT_TOKEN_LIST,
  MOMENT_TOKEN_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  PRESERVATION_ORDERS,
  TIME_SPOTS,
  TOMERUN_TRACKS,
} from './config';
import { FridgeVaultScene } from './fridgeVaultScene';
import { TomerunStateManager } from './state';
import { TomerunActor } from './tomerunActor';
import { MomentTokenId, PreservationOrderDef, TomerunRunStats } from './types';

interface ActiveMomentToken {
  id: number;
  tokenId: MomentTokenId;
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

interface ActiveHurryVortex {
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
  progress: number; // 0..100 (100 = moment preserved in a glowing time jar!)
  cooldown: number; // warm golden celebration hold after preservation
  preserving: boolean;
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
  kind: 'spark' | 'ring' | 'sand' | 'hourglass';
}

export interface PreservationSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: PreservationOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, jarsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onValveCooldownChange: (pct: number, ready: boolean, pausing: boolean) => void;
}

export class PreservationSystem {
  private vaultScene: FridgeVaultScene;
  private actor: TomerunActor;
  private audio: TomerunAudioEngine;
  private gsm: TomerunStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: PreservationSystemCallbacks;

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
  private tokens: ActiveMomentToken[] = [];
  private hurries: ActiveHurryVortex[] = [];
  private spots: SpotProgressState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared 3D geometries for collectible moment tokens & hurry hazards
  private soupGeo = new THREE.SphereGeometry(0.16, 14, 12);
  private laughterGeo = new THREE.OctahedronGeometry(0.17, 0);
  private karaageGeo = new THREE.DodecahedronGeometry(0.16, 0);
  private frostRingGeo = new THREE.TorusGeometry(0.16, 0.032, 8, 20);
  private goldenConeGeo = new THREE.ConeGeometry(0.15, 0.24, 12);
  private hurryRingGeo = new THREE.TorusGeometry(0.28, 0.048, 8, 24);
  private hurryHandGeo = new THREE.BoxGeometry(0.05, 0.26, 0.04);

  // Beat cursors & timers
  private nextTokenBeat = 0;
  private nextHurryBeat = 0;
  private passiveAccum = 0;
  private valveCooldown = 0;
  private valvePauseTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: PreservationOrderDef = PRESERVATION_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: TomerunRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpHandVec = new THREE.Vector3();

  constructor(
    vaultScene: FridgeVaultScene,
    actor: TomerunActor,
    audio: TomerunAudioEngine,
    gsm: TomerunStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: PreservationSystemCallbacks
  ) {
    this.vaultScene = vaultScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initSpots();
    this.pickOrder(0);
  }

  public get isValvePaused(): boolean {
    return this.valvePauseTimer > 0;
  }

  private createEmptyStats(): TomerunRunStats {
    return {
      score: 0,
      tokensGathered: 0,
      momentsSaved: 0,
      secondsExtended: 0,
      ordersCompleted: 0,
      shelfBottled: 0,
      hurriesPaused: 0,
      maxCombo: 0,
      sandsEarned: 0,
      jarsEarned: 0,
    };
  }

  private initSpots(): void {
    this.spots = TIME_SPOTS.map((s, idx) => ({
      id: s.id,
      progress: 42 + idx * 10,
      cooldown: 0,
      preserving: false,
      lastStepIndex: Math.floor((42 + idx * 10) / 25),
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
    const world = this.vaultScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    let spotId: number | null = null;
    for (const s of TIME_SPOTS) {
      if (Math.hypot(tx - s.x, tz - s.z) < 1.25) {
        spotId = s.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, spotId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextTokenBeat = beatFloat + 0.5;
    this.nextHurryBeat = beatFloat + 4.0;
  }

  public resetSession(spawnStarterTokens: boolean): void {
    for (const tk of this.tokens) this.vaultScene.worldGroup.remove(tk.group);
    for (const h of this.hurries) this.vaultScene.worldGroup.remove(h.group);
    this.tokens = [];
    this.hurries = [];
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
    this.valveCooldown = 0;
    this.valvePauseTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initSpots();
    this.pickOrder(0);

    if (spawnStarterTokens) {
      const starterIds: MomentTokenId[] = ['soup', 'laughter', 'karaage', 'winterBreath'];
      starterIds.forEach((id, idx) => {
        const a = (idx / starterIds.length) * Math.PI * 2 + 0.6;
        this.spawnToken(id, Math.cos(a) * 2.2, Math.sin(a) * 1.6);
      });
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onValveCooldownChange(1, true, false);
    this.callbacks.onStateDirty();
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % PRESERVATION_ORDERS.length;
    this.currentOrder = PRESERVATION_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMultiplier(): number {
    return 1 + Math.min(1.5, this.combo * 0.04);
  }

  private addCombo(delta = 1): void {
    this.combo += delta;
    if (this.combo > this.sessionStats.maxCombo) {
      this.sessionStats.maxCombo = this.combo;
    }
    if (this.combo > this.gsm.state.bestCombo) {
      this.gsm.state.bestCombo = this.combo;
    }
    this.callbacks.onComboChange(this.combo, this.getComboMultiplier());
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    this.combo = 0;
    this.callbacks.onComboChange(0, 1);
  }

  private addFever(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private chooseRandomTokenId(): MomentTokenId {
    const deskLv = this.gsm.state.upgrades.diaryDesk;
    const rareBonus = deskLv * 3.5;

    // Slight helpful bias toward an unfilled item in the current preservation order
    const needed: MomentTokenId[] = [];
    this.currentOrder.items.forEach((id, i) => {
      if (!this.orderFilled[i]) needed.push(id);
    });
    if (needed.length > 0 && Math.random() < 0.34) {
      return needed[Math.floor(Math.random() * needed.length)];
    }

    const weights = MOMENT_TOKEN_LIST.map((d) =>
      d.id === 'goldenSand' ? d.weight + rareBonus : d.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < MOMENT_TOKEN_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return MOMENT_TOKEN_LIST[i].id;
    }
    return 'soup';
  }

  private buildTokenMesh(id: MomentTokenId): THREE.Group {
    const def = MOMENT_TOKEN_MAP[id];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: id === 'goldenSand' ? 1.35 : 0.85,
      roughness: 0.28,
      metalness: id === 'goldenSand' ? 0.45 : 0.12,
    });

    if (id === 'soup') {
      const bowl = new THREE.Mesh(this.soupGeo, mat);
      const steam = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
      );
      steam.position.y = 0.22;
      g.add(bowl, steam);
    } else if (id === 'laughter') {
      const gem = new THREE.Mesh(this.laughterGeo, mat);
      const ring = new THREE.Mesh(this.frostRingGeo, mat);
      ring.rotation.x = Math.PI / 2;
      g.add(gem, ring);
    } else if (id === 'karaage') {
      const nugget = new THREE.Mesh(this.karaageGeo, mat);
      nugget.scale.set(1.12, 0.9, 1.05);
      g.add(nugget);
    } else if (id === 'winterBreath') {
      const crystal = new THREE.Mesh(this.laughterGeo, mat);
      crystal.scale.set(0.82, 1.25, 0.82);
      const ring = new THREE.Mesh(this.frostRingGeo, mat);
      g.add(crystal, ring);
    } else {
      // Rare goldenSand: glowing miniature hourglass
      const top = new THREE.Mesh(this.goldenConeGeo, mat);
      top.rotation.x = Math.PI;
      top.position.y = 0.13;
      const bot = new THREE.Mesh(this.goldenConeGeo, mat);
      bot.position.y = -0.13;
      const ring = new THREE.Mesh(this.frostRingGeo, mat);
      ring.scale.setScalar(1.3);
      g.add(top, bot, ring);
    }

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.vaultScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: id === 'goldenSand' ? 0.86 : 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.setScalar(id === 'goldenSand' ? 1.25 : 0.88);
    g.add(halo);
    return g;
  }

  private spawnToken(forcedId?: MomentTokenId, fx?: number, fz?: number): void {
    const tokenId = forcedId || this.chooseRandomTokenId();
    const x =
      typeof fx === 'number'
        ? fx
        : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
    const z =
      typeof fz === 'number'
        ? fz
        : PLAY_AREA_MIN_Z + 0.5 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.0);

    const group = this.buildTokenMesh(tokenId);
    group.position.set(x, 0.78, z);
    this.vaultScene.worldGroup.add(group);

    const ang = Math.random() * Math.PI * 2;
    const spd = 0.28 + Math.random() * 0.36;
    this.tokens.push({
      id: this.nextEntityId++,
      tokenId,
      group,
      x,
      y: 0.78,
      z,
      vx: Math.cos(ang) * spd,
      vz: Math.sin(ang) * spd,
      age: 0,
      maxAge: 14.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnHurryVortex(): void {
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -PLAY_AREA_HALF_X - 0.9 : PLAY_AREA_HALF_X + 0.9;
    const z = PLAY_AREA_MIN_Z + 0.7 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 1.4);

    const g = new THREE.Group();
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x7c74c2,
      emissive: 0x4b3f96,
      emissiveIntensity: 0.95,
      roughness: 0.35,
    });
    const handMat = new THREE.MeshBasicMaterial({ color: 0xd0c4ff });
    const ring = new THREE.Mesh(this.hurryRingGeo, rimMat);
    const hand1 = new THREE.Mesh(this.hurryHandGeo, handMat);
    hand1.position.y = 0.08;
    const hand2 = new THREE.Mesh(this.hurryHandGeo, handMat);
    hand2.rotation.z = Math.PI / 2;
    hand2.scale.set(0.8, 0.72, 1);
    hand2.position.x = 0.06;
    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.vaultScene.glowTex,
        color: 0x8e7ee6,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    aura.scale.setScalar(1.35);
    g.add(ring, hand1, hand2, aura);
    g.position.set(x, 0.78, z);
    this.vaultScene.worldGroup.add(g);

    const speed = 1.45 + Math.random() * 0.65;
    this.hurries.push({
      id: this.nextEntityId++,
      group: g,
      x,
      z,
      vx: fromLeft ? speed : -speed,
      vz: (Math.random() - 0.5) * 0.45,
      age: 0,
      maxAge: 11,
      phase: Math.random() * Math.PI * 2,
      radius: 0.44,
    });
  }

  private spawnFxBurst(
    wx: number,
    wy: number,
    wz: number,
    color: string,
    count: number,
    withHourglass: boolean
  ): void {
    this.tmpVec.set(wx, wy, wz);
    const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (!pt.visible) return;

    this.fxParticles.push({
      x: pt.x,
      y: pt.y,
      vx: 0,
      vy: 0,
      size: 16,
      color,
      alpha: 0.88,
      life: 0,
      maxLife: 0.48,
      kind: 'ring',
    });

    if (withHourglass) {
      this.fxParticles.push({
        x: pt.x,
        y: pt.y - 10,
        vx: 0,
        vy: -36,
        size: 28,
        color: '#fff3ba',
        alpha: 0.96,
        life: 0,
        maxLife: 0.82,
        kind: 'hourglass',
      });
    }

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 42 + Math.random() * 115;
      this.fxParticles.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 16,
        size: 3.2 + Math.random() * 4.5,
        color,
        alpha: 0.92,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        kind: i % 3 === 0 ? 'sand' : 'spark',
      });
    }
  }

  private collectToken(tk: ActiveMomentToken): void {
    tk.collected = true;
    this.vaultScene.worldGroup.remove(tk.group);

    const def = MOMENT_TOKEN_MAP[tk.tokenId];
    const track = TOMERUN_TRACKS[this.audio.currentTrackId];
    this.addCombo(1);

    const feverMult = this.isFever ? 2.0 : 1.0;
    const sandsEarned = Math.round(
      def.baseValue *
        track.valueMultiplier *
        this.gsm.getSandsMultiplier() *
        this.getComboMultiplier() *
        feverMult
    );

    this.gsm.state.sands += sandsEarned;
    this.gsm.state.totalSandsEarned += sandsEarned;
    this.gsm.state.jarFill = Math.min(
      this.gsm.getJarCapacity(),
      this.gsm.state.jarFill + (tk.tokenId === 'goldenSand' ? 2 : 1)
    );

    this.sessionStats.tokensGathered += 1;
    this.sessionStats.sandsEarned += sandsEarned;
    this.sessionStats.score += sandsEarned;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.addFever(def.feverGain);
    this.actor.triggerPickupPop();
    this.audio.playGatherTokenSE(this.combo, tk.tokenId === 'goldenSand');
    this.spawnFxBurst(tk.x, tk.y, tk.z, def.cssColor, tk.tokenId === 'goldenSand' ? 14 : 7, false);

    this.tmpVec.set(tk.x, tk.y + 0.55, tk.z);
    const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `${def.icon} +${sandsEarned}`,
        pt.x,
        pt.y,
        def.cssColor,
        tk.tokenId === 'goldenSand' ? '永遠のひと粒！' : def.wordText
      );
    }

    // Check active preservation order slot match (goldenSand acts as wild!)
    let slotMatched = false;
    for (let i = 0; i < this.currentOrder.items.length; i++) {
      if (
        !this.orderFilled[i] &&
        (this.currentOrder.items[i] === tk.tokenId || tk.tokenId === 'goldenSand')
      ) {
        this.orderFilled[i] = true;
        slotMatched = true;
        break;
      }
    }

    if (slotMatched) {
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
      if (this.orderFilled.every(Boolean)) {
        this.completeCurrentOrder();
      }
    }

    this.callbacks.onStateDirty();
  }

  private completeCurrentOrder(): void {
    const order = this.currentOrder;
    const diningLv = this.gsm.state.upgrades.diningJars;
    const bonusSands = Math.round(
      order.bonusSands * this.gsm.getSandsMultiplier() * (this.isFever ? 1.5 : 1)
    );
    const bonusJars = order.bonusJars + Math.floor(diningLv / 2);

    this.gsm.state.sands += bonusSands;
    this.gsm.state.totalSandsEarned += bonusSands;
    this.gsm.state.jars += bonusJars;
    this.gsm.state.totalOrdersCompleted += 1;

    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.sandsEarned += bonusSands;
    this.sessionStats.jarsEarned += bonusJars;
    this.sessionStats.score += 240;

    this.addFever(16);
    this.actor.triggerCelebrate();
    this.audio.playOrderCompleteSE(false);
    this.vaultScene.spawnJarShelfArc(this.posX, this.posZ);
    this.spawnFxBurst(this.posX, 1.25, this.posZ, '#ffe694', 18, true);

    this.callbacks.onOrderCompleted(order.name, order.whisperMessage, bonusJars);
    this.pickOrder(this.orderIndex + 1);
  }

  private completeSpotPreservation(sp: SpotProgressState): void {
    const def = TIME_SPOTS[sp.id];
    const track = TOMERUN_TRACKS[this.audio.currentTrackId];
    sp.progress = 100;
    sp.cooldown = 3.0;
    sp.preserving = false;
    sp.lastStepIndex = 4;

    this.addCombo(2);
    const feverMult = this.isFever ? 2.0 : 1.0;
    const sands = Math.round(
      54 * track.valueMultiplier * this.gsm.getSandsMultiplier() * this.getComboMultiplier() * feverMult
    );
    const secAdded = def.secondsAdded + this.gsm.state.upgrades.hourglassValve * 3;

    this.gsm.state.sands += sands;
    this.gsm.state.totalSandsEarned += sands;
    this.gsm.state.totalMomentsSaved += 1;
    this.gsm.state.totalSecondsExtended += secAdded;
    this.gsm.state.jarFill = Math.min(this.gsm.getJarCapacity(), this.gsm.state.jarFill + 2);

    this.sessionStats.momentsSaved += 1;
    this.sessionStats.secondsExtended += secAdded;
    this.sessionStats.sandsEarned += sands;
    this.sessionStats.score += 170 + sands;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.addFever(11.5);
    this.vaultScene.triggerSpotCompletePulse(sp.id);
    this.vaultScene.spawnJarShelfArc(def.x, def.z);
    this.vaultScene.updateNotebookDisplay(this.gsm.state.totalSecondsExtended);
    this.actor.triggerCelebrate();
    this.audio.playMomentSavedSE();
    this.spawnFxBurst(def.x, 1.1, def.z, def.cssColor, 16, true);

    this.tmpVec.set(def.x, 1.95, def.z);
    const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `⏳ あと +${secAdded}びょう保存！`,
        pt.x,
        pt.y,
        '#fff2b4',
        `${def.shortName} ・ 時の砂 +${sands}`
      );
    }

    this.callbacks.onStateDirty();
  }

  /** Trigger VALVE PAUSE ("バルブ回し"): suspend time, purify hurries, attract tokens & extend all 4 spots */
  public triggerValvePause(): boolean {
    if (this.valveCooldown > 0) return false;
    const maxCd = this.gsm.getValvePauseCooldownSec();
    const radius = this.gsm.getValvePauseRadius();
    const pauseDur = this.gsm.getValvePauseDurationSec();

    this.valveCooldown = maxCd;
    this.valvePauseTimer = pauseDur;

    this.actor.triggerValveWave(radius);
    this.vaultScene.triggerValveFlash();
    this.vaultScene.triggerShake(0.14, 0.22);
    this.audio.playValvePauseSE();
    this.spawnFxBurst(this.posX, 0.9, this.posZ, '#ffe49c', 22, true);

    // 1. Freeze & purify nearby Hurry Vortices into glowing moment tokens!
    let purified = 0;
    for (let i = this.hurries.length - 1; i >= 0; i--) {
      const h = this.hurries[i];
      if (Math.hypot(h.x - this.posX, h.z - this.posZ) <= radius) {
        this.vaultScene.worldGroup.remove(h.group);
        this.spawnToken(Math.random() < 0.25 ? 'goldenSand' : 'laughter', h.x, h.z);
        this.spawnFxBurst(h.x, 0.9, h.z, '#b4e4ff', 10, false);
        this.hurries.splice(i, 1);
        this.sessionStats.hurriesPaused += 1;
        purified += 1;
      }
    }

    // 2. Pull nearby moment tokens immediately toward Tomerun
    for (const tk of this.tokens) {
      const dist = Math.hypot(tk.x - this.posX, tk.z - this.posZ);
      if (dist <= radius * 1.15) {
        tk.x = this.posX + (tk.x - this.posX) * 0.26;
        tk.z = this.posZ + (tk.z - this.posZ) * 0.26;
      }
    }

    // 3. Extend all 4 Time Spots by +36% immediately (turning the brass valve!)
    for (const sp of this.spots) {
      if (sp.cooldown > 0) continue;
      sp.progress = Math.min(100, sp.progress + 36);
      if (sp.progress >= 100) {
        this.completeSpotPreservation(sp);
      }
    }

    if (purified > 0) {
      this.addCombo(purified);
      this.addFever(purified * 6.5);
    }

    this.tmpVec.set(this.posX, 1.9, this.posZ);
    const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        '⏳ 時間、すこし止めます。',
        pt.x,
        pt.y,
        '#fff3ba',
        purified > 0 ? `秒針渦 ${purified}個浄化＆全4棚＋36%` : '全4棚＋36%＆スロー停止'
      );
    }

    this.callbacks.onValveCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Seal the full Time Jar and place it onto the secret shelf */
  public bottleToShelf(): boolean {
    const cap = this.gsm.getJarCapacity();
    if (this.gsm.state.jarFill < cap) return false;

    this.gsm.state.jarFill = 0;
    const jars = this.gsm.getJarsPerBottling();
    const sands = Math.round(95 * this.gsm.getSandsMultiplier() * (this.isFever ? 1.5 : 1));
    this.gsm.state.jars += jars;
    this.gsm.state.sands += sands;
    this.gsm.state.totalSandsEarned += sands;
    this.gsm.state.totalShelfBottled += 1;

    this.sessionStats.jarsEarned += jars;
    this.sessionStats.sandsEarned += sands;
    this.sessionStats.shelfBottled += 1;
    this.sessionStats.score += 300;

    this.vaultScene.spawnJarShelfArc(this.posX, this.posZ);
    this.vaultScene.triggerValveFlash();
    this.actor.triggerCelebrate();
    this.audio.playOrderCompleteSE(true);
    this.spawnFxBurst(this.posX, 1.15, this.posZ, '#ffe69a', 20, true);

    this.tmpVec.set(this.posX, 1.9, this.posZ);
    const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    if (pt.visible) {
      this.callbacks.onFloatingText(
        `🫙 秘密の棚へ保存！ +${jars}瓶`,
        pt.x,
        pt.y,
        '#fff4b2',
        `時の砂 +${sands}`
      );
    }

    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate ETERNAL SHELF Fever */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 0;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverStartSE();
    this.vaultScene.triggerValveFlash();
    this.vaultScene.triggerShake(0.2, 0.3);

    // Transform all active Hurry Vortices into rare ⏳ 永遠のひと粒!
    for (const h of this.hurries) {
      this.vaultScene.worldGroup.remove(h.group);
      this.spawnToken('goldenSand', h.x, h.z);
      this.sessionStats.hurriesPaused += 1;
    }
    this.hurries = [];

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = TOMERUN_TRACKS[this.audio.currentTrackId];
    const worldTimeScale = this.isValvePaused ? 0.14 : 1.0;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.valvePauseTimer > 0) this.valvePauseTimer = Math.max(0, this.valvePauseTimer - dt);

    // Update Valve Pause cooldown
    const maxCd = this.gsm.getValvePauseCooldownSec();
    if (this.valveCooldown > 0) {
      this.valveCooldown = Math.max(0, this.valveCooldown - dt);
    }
    const cdPct = maxCd > 0 ? 1 - this.valveCooldown / maxCd : 1;
    this.callbacks.onValveCooldownChange(cdPct, this.valveCooldown <= 0, this.isValvePaused);

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
      // Passive sands from blueBlanket upgrade
      const blanketLv = this.gsm.state.upgrades.blueBlanket;
      if (blanketLv > 0) {
        this.passiveAccum += dt * blanketLv * 4;
        if (this.passiveAccum >= 1) {
          const add = Math.floor(this.passiveAccum);
          this.passiveAccum -= add;
          this.gsm.state.sands += add;
          this.gsm.state.totalSandsEarned += add;
          this.sessionStats.sandsEarned += add;
          this.callbacks.onStateDirty();
        }
      }

      // 1. Player Movement (WASD / Arrow keys / Pointer tap-drag)
      let moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      let moveZ = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      const maxSpeed = this.isFever ? 6.6 : 5.45;

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

      // 2. Beat-synced Spawning of Moment Tokens & Hurry Vortices
      if (beatFloat >= this.nextTokenBeat) {
        this.nextTokenBeat =
          beatFloat + (this.isFever ? track.spawnEveryBeats * 0.72 : track.spawnEveryBeats);
        if (this.tokens.length < track.maxActiveTokens + (this.isFever ? 4 : 0)) {
          this.spawnToken(this.isFever && Math.random() < 0.28 ? 'goldenSand' : undefined);
        }
      }

      if (!this.isFever && !this.isValvePaused && beatFloat >= this.nextHurryBeat) {
        this.nextHurryBeat = beatFloat + 3.8 + Math.random() * 2.2;
        if (Math.random() < track.hurryRate + 0.48 && this.hurries.length < 4) {
          this.spawnHurryVortex();
        }
      }

      // 3. Update & Gather Collectible Moment Tokens
      const reach = this.gsm.getReachRadius() * (this.isFever ? 1.55 : 1.0);
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const tk = this.tokens[i];
        tk.age += dt * worldTimeScale;
        if (tk.age >= tk.maxAge) {
          this.vaultScene.worldGroup.remove(tk.group);
          this.tokens.splice(i, 1);
          continue;
        }

        const dx = this.posX - tk.x;
        const dz = this.posZ - tk.z;
        const dist = Math.hypot(dx, dz);

        if (this.isFever || dist < reach * 1.48) {
          const pull = this.isFever ? 7.8 : 5.5;
          tk.x += (dx / Math.max(0.1, dist)) * pull * dt;
          tk.z += (dz / Math.max(0.1, dist)) * pull * dt;
        } else {
          tk.x += tk.vx * dt * worldTimeScale;
          tk.z += tk.vz * dt * worldTimeScale;
          if (Math.abs(tk.x) > PLAY_AREA_HALF_X - 0.3) tk.vx *= -1;
          if (tk.z < PLAY_AREA_MIN_Z + 0.3 || tk.z > PLAY_AREA_MAX_Z - 0.3) tk.vz *= -1;
        }

        tk.y = 0.76 + Math.sin(elapsed * 2.6 + tk.phase) * 0.14;
        tk.group.position.set(tk.x, tk.y, tk.z);
        tk.group.rotation.y = elapsed * 1.5 * worldTimeScale + tk.phase;

        const fadeOut = tk.maxAge - tk.age < 1.5 ? (tk.maxAge - tk.age) / 1.5 : 1;
        tk.group.scale.setScalar(0.35 + fadeOut * 0.65);

        if (dist < Math.max(0.86, reach * 0.8)) {
          this.collectToken(tk);
          this.tokens.splice(i, 1);
        }
      }

      // 4. Update Hurry Vortices (Hazards — slowed to near-stop during VALVE PAUSE!)
      for (let i = this.hurries.length - 1; i >= 0; i--) {
        const h = this.hurries[i];
        const hdt = dt * worldTimeScale;
        h.age += hdt;
        h.x += h.vx * hdt;
        h.z += h.vz * hdt + Math.sin(elapsed * 2.4 + h.phase) * 0.35 * hdt;
        h.group.position.set(h.x, 0.78 + Math.sin(elapsed * 3.5 + h.phase) * 0.1, h.z);
        h.group.rotation.z -= hdt * 5.2;
        h.group.rotation.y = elapsed * 1.4;

        if (h.age >= h.maxAge || Math.abs(h.x) > PLAY_AREA_HALF_X + 2.2) {
          this.vaultScene.worldGroup.remove(h.group);
          this.hurries.splice(i, 1);
          continue;
        }

        if (
          !this.isValvePaused &&
          this.invulnTimer <= 0 &&
          Math.hypot(h.x - this.posX, h.z - this.posZ) < h.radius + 0.44
        ) {
          this.vaultScene.worldGroup.remove(h.group);
          this.hurries.splice(i, 1);
          this.invulnTimer = 1.05;

          if (this.shieldsRemaining > 0) {
            this.shieldsRemaining -= 1;
            this.callbacks.onShieldChange(this.shieldsRemaining);
            this.audio.playHurryBumpSE(true);
            this.spawnFxBurst(this.posX, 0.9, this.posZ, '#96d8ff', 12, false);
            this.tmpVec.set(this.posX, 1.8, this.posZ);
            const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
            if (pt.visible) {
              this.callbacks.onFloatingText('🧣 青い毛布のぬくもり防御！', pt.x, pt.y, '#9cd8ff');
            }
          } else {
            this.breakCombo();
            this.actor.triggerHitFlash();
            this.vaultScene.triggerShake(0.24, 0.25);
            this.audio.playHurryBumpSE(false);
            this.tmpVec.set(this.posX, 1.8, this.posZ);
            const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
            if (pt.visible) {
              this.callbacks.onFloatingText(
                'せかしの秒針…',
                pt.x,
                pt.y,
                '#c2b4ff',
                '⏳ バルブ回しで止めよう'
              );
            }
          }
        }
      }

      // 5. Update 4 Time Preservation Spots
      let anyPreserving = false;
      let nearestSpotLook: { x: number; z: number } | null = null;
      const preserveRate = this.gsm.getPreserveRate();

      for (const sp of this.spots) {
        const def = TIME_SPOTS[sp.id];
        if (sp.cooldown > 0) {
          sp.cooldown = Math.max(0, sp.cooldown - dt);
          sp.preserving = false;
          if (sp.cooldown <= 0) {
            sp.progress = 22;
            sp.lastStepIndex = 0;
          }
          this.vaultScene.updateSpotVisual(sp.id, 100, false, true, elapsed, worldTimeScale);
          continue;
        }

        const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
        const inRange = dist <= reach + 0.35 || this.isFever;
        sp.preserving = inRange;

        if (inRange) {
          anyPreserving = true;
          if (!nearestSpotLook && dist <= reach + 0.35) {
            nearestSpotLook = { x: def.x, z: def.z };
          }
          sp.progress = Math.min(100, sp.progress + preserveRate * (this.isFever ? 0.85 : 1.0) * dt);
          const stepIdx = Math.floor(sp.progress / 25);
          if (stepIdx > sp.lastStepIndex && stepIdx < 4) {
            sp.lastStepIndex = stepIdx;
            this.audio.playHourglassTickSE(stepIdx);
            this.spawnFxBurst(def.x, 1.2, def.z, def.cssColor, 6, false);
          }
          if (sp.progress >= 100) {
            this.completeSpotPreservation(sp);
          }
        } else if (!this.isValvePaused) {
          // Expiry slowly ticks down when neglected (pauses completely during VALVE PAUSE!)
          sp.progress = Math.max(6, sp.progress - track.spotDrainSpeed * dt);
          sp.lastStepIndex = Math.floor(sp.progress / 25);
        }

        this.vaultScene.updateSpotVisual(sp.id, sp.progress, sp.preserving, false, elapsed, worldTimeScale);
      }

      this.actor.setPreservingTime(anyPreserving);
      this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, nearestSpotLook);
    } else {
      this.actor.setPreservingTime(false);
      for (const sp of this.spots) {
        this.vaultScene.updateSpotVisual(sp.id, sp.progress, false, false, elapsed, 1.0);
      }
    }

    // 6. Render 2D FX Canvas (Valve time-slow frost-gold veil, lantern beams, sand particles)
    this.renderFxOverlay(dt, active);
  }

  private renderFxOverlay(dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Ethereal frosty-gold border vignette while VALVE PAUSE suspends time
    if (active && this.isValvePaused) {
      const grad = ctx.createRadialGradient(
        this.fxW * 0.5,
        this.fxH * 0.5,
        this.fxH * 0.25,
        this.fxW * 0.5,
        this.fxH * 0.5,
        this.fxW * 0.62
      );
      grad.addColorStop(0, 'rgba(164, 224, 255, 0)');
      grad.addColorStop(0.75, 'rgba(164, 224, 255, 0.08)');
      grad.addColorStop(1, 'rgba(255, 224, 146, 0.24)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.fxW, this.fxH);
    }

    // Draw golden hourglass-sand beams from Tomerun's handheld lantern to any active spot
    if (active) {
      this.actor.getLanternOriginWorldPos(this.tmpHandVec);
      const handPt = this.vaultScene.projectToScreen(this.tmpHandVec, this.fxW, this.fxH);

      if (handPt.visible) {
        for (const sp of this.spots) {
          if (!sp.preserving) continue;
          const def = TIME_SPOTS[sp.id];
          this.tmpVec.set(def.x, 1.0, def.z);
          const spPt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
          if (!spPt.visible) continue;

          ctx.save();
          const grad = ctx.createLinearGradient(handPt.x, handPt.y, spPt.x, spPt.y);
          grad.addColorStop(0, 'rgba(255, 228, 152, 0.9)');
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

      // Soft frost-gold pointer destination beacon
      if (this.pointerTarget) {
        this.tmpVec.set(this.pointerTarget.x, 0.05, this.pointerTarget.z);
        const pt = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
        if (pt.visible) {
          ctx.save();
          ctx.strokeStyle = 'rgba(182, 232, 255, 0.62)';
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
      } else if (p.kind === 'hourglass') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#ffd87a';
        ctx.shadowBlur = 14;
        ctx.font = `900 ${Math.round(p.size * (0.95 + u * 0.25))}px 'Zen Maru Gothic', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⏳', p.x, p.y);
      } else if (p.kind === 'sand') {
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(u * 4);
        const r = p.size * (1 - u * 0.4);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.4);
        ctx.lineTo(r * 0.5, 0);
        ctx.lineTo(0, r * 1.4);
        ctx.lineTo(-r * 0.5, 0);
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
