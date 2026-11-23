import * as THREE from 'three';
import { YumeatsumeAudioEngine } from './audioEngine';
import {
  DREAM_PEDESTALS,
  DREAM_RETURN_ORDERS,
  DREAM_TOKEN_LIST,
  DREAM_TOKEN_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  YUMEATSUME_TRACKS,
} from './config';
import { create3DDreamStarGeometry, DreamGreenhouseScene } from './dreamGreenhouseScene';
import { YumeatsumeStateManager } from './state';
import { DreamLightTokenId, DreamReturnOrderDef, YumeatsumeRunStats } from './types';
import { YumeatsumeActor } from './yumeatsumeActor';

interface ActiveDreamToken {
  id: number;
  tokenId: DreamLightTokenId;
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

interface ActiveSighMist {
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

interface PedestalState {
  id: number;
  progress: number; // 0..100 (100 = dream jar lid opens & dream returns to owner!)
  cooldown: number;
  awakening: boolean;
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

export interface DreamVaultSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: DreamReturnOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, jarsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onLidCooldownChange: (pct: number, ready: boolean, opening: boolean) => void;
}

export class DreamVaultSystem {
  private vaultScene: DreamGreenhouseScene;
  private actor: YumeatsumeActor;
  private audio: YumeatsumeAudioEngine;
  private gsm: YumeatsumeStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: DreamVaultSystemCallbacks;

  private fxW = 1280;
  private fxH = 720;

  // Steering & movement
  private keys = { up: false, down: false, left: false, right: false };
  private pointerTarget: { x: number; z: number; pedestalId: number | null } | null = null;
  private posX = 0;
  private posZ = 0.72;
  private velX = 0;
  private velZ = 0;

  // Entities
  private nextEntityId = 1;
  private tokens: ActiveDreamToken[] = [];
  private mists: ActiveSighMist[] = [];
  private pedestals: PedestalState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared 3D geometries for spilled dream lights & "もう無理だよ" sigh mist hazards
  private cottonStarGeo = create3DDreamStarGeometry(0.23);
  private musicStarGeo = create3DDreamStarGeometry(0.18);
  private cakeOrbGeo = new THREE.SphereGeometry(0.16, 14, 12);
  private astroGemGeo = new THREE.OctahedronGeometry(0.17, 0);
  private painterDropGeo = new THREE.DodecahedronGeometry(0.16, 0);
  private mistPuffGeo = new THREE.SphereGeometry(0.22, 12, 10);
  private mistRingGeo = new THREE.TorusGeometry(0.32, 0.045, 8, 24);

  // Beat cursors & timers
  private nextTokenBeat = 0;
  private nextMistBeat = 0;
  private passiveAccum = 0;
  private lidCooldown = 0;
  private lidActiveTimer = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: DreamReturnOrderDef = DREAM_RETURN_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: YumeatsumeRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpJarVec = new THREE.Vector3();

  constructor(
    vaultScene: DreamGreenhouseScene,
    actor: YumeatsumeActor,
    audio: YumeatsumeAudioEngine,
    gsm: YumeatsumeStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: DreamVaultSystemCallbacks
  ) {
    this.vaultScene = vaultScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initPedestals();
    this.pickOrder(0);
  }

  public get isLidOpening(): boolean {
    return this.lidActiveTimer > 0;
  }

  private createEmptyStats(): YumeatsumeRunStats {
    return {
      score: 0,
      lightsGathered: 0,
      dreamsAwakened: 0,
      lidsOpened: 0,
      ordersCompleted: 0,
      satchelsStored: 0,
      mistsCleared: 0,
      maxCombo: 0,
      dropsEarned: 0,
      jarsEarned: 0,
    };
  }

  private initPedestals(): void {
    this.pedestals = DREAM_PEDESTALS.map((p, idx) => ({
      id: p.id,
      progress: 44 + idx * 9,
      cooldown: 0,
      awakening: false,
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
    const world = this.vaultScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH);
    if (!world) return;
    const tx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, world.x));
    const tz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, world.z));

    let pedestalId: number | null = null;
    for (const p of DREAM_PEDESTALS) {
      if (Math.hypot(tx - p.x, tz - p.z) < 1.28) {
        pedestalId = p.id;
        break;
      }
    }
    this.pointerTarget = { x: tx, z: tz, pedestalId };
  }

  public resetBeatCursors(beatFloat: number): void {
    this.nextTokenBeat = beatFloat + 0.5;
    this.nextMistBeat = beatFloat + 4.2;
  }

  public resetSession(spawnStarterTokens: boolean): void {
    for (const tk of this.tokens) this.vaultScene.worldGroup.remove(tk.group);
    for (const ms of this.mists) this.vaultScene.worldGroup.remove(ms.group);
    this.tokens = [];
    this.mists = [];
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
    this.lidCooldown = 0;
    this.lidActiveTimer = 0;
    this.invulnTimer = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initPedestals();
    this.pickOrder(Math.floor(Math.random() * DREAM_RETURN_ORDERS.length));

    if (spawnStarterTokens) {
      for (let i = 0; i < 4; i++) {
        this.spawnDreamToken(false);
      }
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onLidCooldownChange(1, true, false);
    this.callbacks.onStateDirty();
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % DREAM_RETURN_ORDERS.length;
    this.currentOrder = DREAM_RETURN_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.items.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private getComboMult(): number {
    return 1 + Math.min(2.0, this.combo * 0.045);
  }

  private chooseTokenType(forceRare = false): DreamLightTokenId {
    if (forceRare) return 'cottonDream';
    const deskBonus = this.gsm.state.upgrades.receiptDesk * 3.5;
    const weights = DREAM_TOKEN_LIST.map((t) =>
      t.id === 'cottonDream' ? t.weight + deskBonus : t.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < DREAM_TOKEN_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return DREAM_TOKEN_LIST[i].id;
    }
    return 'cakeDream';
  }

  private spawnDreamToken(forceRare = false, spawnPos?: { x: number; z: number }): void {
    const track = YUMEATSUME_TRACKS[this.gsm.state.selectedTrack];
    if (!forceRare && this.tokens.length >= track.maxActiveTokens) return;

    const tokenId = this.chooseTokenType(forceRare);
    const def = DREAM_TOKEN_MAP[tokenId];

    let x = spawnPos ? spawnPos.x : (Math.random() * 2 - 1) * (PLAY_AREA_HALF_X - 0.55);
    let z = spawnPos
      ? spawnPos.z
      : PLAY_AREA_MIN_Z + 0.45 + Math.random() * (PLAY_AREA_MAX_Z - PLAY_AREA_MIN_Z - 0.9);

    // Keep clear of central medallion pedestal at (0, -0.35)
    if (!spawnPos && Math.hypot(x, z + 0.35) < 1.25) {
      x += x >= 0 ? 1.35 : -1.35;
      x = Math.max(-PLAY_AREA_HALF_X + 0.4, Math.min(PLAY_AREA_HALF_X - 0.4, x));
    }

    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: tokenId === 'cottonDream' ? 1.45 : 1.0,
      roughness: 0.28,
      metalness: tokenId === 'astroDream' ? 0.4 : 0.18,
    });

    const geo =
      tokenId === 'cottonDream'
        ? this.cottonStarGeo
        : tokenId === 'musicDream'
          ? this.musicStarGeo
          : tokenId === 'cakeDream'
            ? this.cakeOrbGeo
            : tokenId === 'astroDream'
              ? this.astroGemGeo
              : this.painterDropGeo;

    const core = new THREE.Mesh(geo, mat);
    core.castShadow = true;
    group.add(core);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.vaultScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: tokenId === 'cottonDream' ? 0.92 : 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const haloScale = tokenId === 'cottonDream' ? 1.18 : 0.88;
    halo.scale.set(haloScale, haloScale, 1);
    group.add(halo);

    group.position.set(x, 0.56, z);
    this.vaultScene.worldGroup.add(group);

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
      maxAge: tokenId === 'cottonDream' ? 13.5 : 15.5,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnSighMist(): void {
    if (this.isFever || this.mists.length >= 4) return;
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
      color: 0x384658,
      emissive: 0x1d2d40,
      emissiveIntensity: 0.72,
      roughness: 0.9,
      transparent: true,
      opacity: 0.86,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x86a8c8,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    // Cluster of 3 gloomy sigh clouds representing "「もう無理だよ」のため息の霧"
    const puffA = new THREE.Mesh(this.mistPuffGeo, mistMat);
    const puffB = new THREE.Mesh(this.mistPuffGeo, mistMat);
    puffB.scale.setScalar(0.75);
    puffB.position.set(0.18, 0.06, -0.06);
    const puffC = new THREE.Mesh(this.mistPuffGeo, mistMat);
    puffC.scale.setScalar(0.72);
    puffC.position.set(-0.17, 0.04, 0.08);

    const warnRing = new THREE.Mesh(this.mistRingGeo, ringMat);
    warnRing.rotation.x = Math.PI / 2;
    warnRing.position.y = -0.26;
    group.add(puffA, puffB, puffC, warnRing);

    group.position.set(x, 0.55, z);
    this.vaultScene.worldGroup.add(group);

    this.mists.push({
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

  /** Special Action: "おかえり" LID OPEN — pop open the dream glass jar! */
  public triggerLidOpen(): boolean {
    if (this.lidCooldown > 0) return false;

    const maxRadius = this.gsm.getLidOpenRadius();
    this.lidCooldown = this.gsm.getLidOpenCooldownSec();
    this.lidActiveTimer = this.gsm.getLidOpenDurationSec();

    this.actor.triggerLidOpenWave(maxRadius);
    this.vaultScene.triggerLidOpenFlash();
    this.vaultScene.triggerShake(0.13, 0.22);
    this.audio.playLidOpenWaveSE();

    this.tmpVec.set(this.posX, 0.85, this.posZ);
    const sc = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffe296', 22, true);
    this.callbacks.onFloatingText('✨ 「おかえり！」', sc.x, sc.y - 34, '#ffe296', '全保管瓶＋36%');

    // Dispel sigh mist within radius and convert into bonus dream drops!
    let cleared = 0;
    for (let i = this.mists.length - 1; i >= 0; i--) {
      const ms = this.mists[i];
      if (Math.hypot(ms.x - this.posX, ms.z - this.posZ) <= maxRadius) {
        this.tmpVec.set(ms.x, 0.6, ms.z);
        const cp = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
        this.spawnFxBurst(cp.x, cp.y, '#ffc6da', 12, false);
        this.vaultScene.worldGroup.remove(ms.group);
        this.mists.splice(i, 1);
        cleared++;
        this.sessionStats.mistsCleared++;
        this.addDrops(28, cp.x, cp.y, '☁ ため息晴れ +28');
        this.addFeverCharge(5.5);
      }
    }

    // Draw spilled dream lights within radius straight into Yumeatsume's satchel
    for (const tk of this.tokens) {
      if (tk.collected) continue;
      if (Math.hypot(tk.x - this.posX, tk.z - this.posZ) <= maxRadius) {
        this.collectToken(tk);
      }
    }

    // Warm all 4 dream pedestal jars by +36% and launch an ascending dream light!
    for (const pd of this.pedestals) {
      if (pd.cooldown > 0) continue;
      pd.progress = Math.min(100, pd.progress + 36);
      this.vaultScene.pulsePedestal(pd.id);
      if (pd.progress >= 100) {
        this.completeDreamPedestal(pd);
      }
    }
    this.vaultScene.launchDreamReturnArc(this.posX, 1.25, this.posZ, 0xffc6da);

    if (cleared > 0) {
      this.callbacks.onFloatingText(
        `✨ ${cleared}つのため息を晴らした！`,
        sc.x,
        sc.y - 68,
        '#ffc8dc'
      );
    }

    this.callbacks.onLidCooldownChange(0, false, true);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Store & send full Leather Satchel ("鞄の夢を棚へしまう・送り出す") for Jars + big Drops! */
  public storeDreamSatchel(): boolean {
    const cap = this.gsm.getSatchelCapacity();
    if (this.gsm.state.satchelFill < cap) return false;

    this.gsm.state.satchelFill = 0;
    const jarsGain = this.gsm.getJarsPerSatchelStore();
    const dropsGain = Math.round(
      115 *
        this.gsm.getDropsMultiplier() *
        YUMEATSUME_TRACKS[this.gsm.state.selectedTrack].valueMultiplier *
        (this.isFever ? 2 : 1)
    );

    this.gsm.state.jars += jarsGain;
    this.gsm.state.totalSatchelsStored += 1;
    this.gsm.state.totalLidsOpened += 3;
    this.gsm.state.drops += dropsGain;
    this.gsm.state.totalDropsEarned += dropsGain;

    this.sessionStats.satchelsStored += 1;
    this.sessionStats.lidsOpened += 3;
    this.sessionStats.jarsEarned += jarsGain;
    this.sessionStats.dropsEarned += dropsGain;
    this.sessionStats.score += Math.round(dropsGain * 1.45);
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    this.audio.playSatchelStoreSE();
    this.actor.triggerCelebrate();
    this.vaultScene.triggerShake(0.14, 0.25);

    const arcCols = [0xffd890, 0xffb8d0, 0x9de8d4];
    for (let i = 0; i < 3; i++) {
      this.vaultScene.launchDreamReturnArc(
        this.posX + (i - 1) * 0.35,
        1.15 + i * 0.15,
        this.posZ,
        arcCols[i]
      );
    }
    this.vaultScene.updateLedgerBoard(
      24 + this.gsm.state.totalSatchelsStored * 12 + this.gsm.state.totalLidsOpened,
      6 + this.gsm.state.totalDreamsReturned
    );

    this.tmpVec.set(this.posX, 1.1, this.posZ);
    const sc = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, '#ffe296', 26, true);
    this.callbacks.onFloatingText(
      `👜 鞄の夢を保管！ +${jarsGain} おかえりの瓶`,
      sc.x,
      sc.y - 42,
      '#fff0b8',
      `夢のしずく +${dropsGain.toLocaleString('ja-JP')}`
    );

    this.addFeverCharge(14);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate NO EXPIRATION ("賞味期限のない夜") fever mode */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    this.audio.playFeverSE();
    this.actor.triggerCelebrate();
    this.vaultScene.triggerLidOpenFlash();
    this.vaultScene.triggerShake(0.18, 0.35);

    // Transform every active sigh mist hazard into a rare Cotton Candy Miracle Dream!
    for (const ms of this.mists) {
      this.vaultScene.worldGroup.remove(ms.group);
      this.spawnDreamToken(true, { x: ms.x, z: ms.z });
    }
    this.mists = [];

    // Launch radiant dream streams rising up through the glass conservatory roof
    const cols = [0xffd890, 0xffb8d0, 0x9de8d4, 0xb8d4ff, 0xfff0c0];
    for (let i = 0; i < 5; i++) {
      this.vaultScene.launchDreamReturnArc((i - 2) * 1.4, 1.3, -0.5, cols[i]);
    }

    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private addFeverCharge(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private addDrops(rawBase: number, sx?: number, sy?: number, customLabel?: string): number {
    const track = YUMEATSUME_TRACKS[this.gsm.state.selectedTrack];
    const earned = Math.max(
      1,
      Math.round(
        rawBase *
          this.gsm.getDropsMultiplier() *
          track.valueMultiplier *
          this.getComboMult() *
          (this.isFever ? 2 : 1)
      )
    );
    this.gsm.state.drops += earned;
    this.gsm.state.totalDropsEarned += earned;
    this.sessionStats.dropsEarned += earned;
    this.sessionStats.score += earned;
    this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

    if (typeof sx === 'number' && typeof sy === 'number') {
      this.callbacks.onFloatingText(customLabel || `+${earned}`, sx, sy, '#ffe6a4');
    }
    return earned;
  }

  private collectToken(tk: ActiveDreamToken): void {
    if (tk.collected) return;
    tk.collected = true;
    this.vaultScene.worldGroup.remove(tk.group);

    const def = DREAM_TOKEN_MAP[tk.tokenId];
    this.combo += 1;
    this.sessionStats.lightsGathered += 1;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);

    const isRare = tk.tokenId === 'cottonDream';
    this.audio.playDreamCollectSE(this.combo, isRare);
    this.actor.triggerPickupPop();

    this.tmpVec.set(tk.x, 0.7, tk.z);
    const sc = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, isRare ? 20 : 11, isRare);

    const earned = this.addDrops(def.baseValue);
    this.callbacks.onFloatingText(
      `${def.icon} ${def.shortName}`,
      sc.x,
      sc.y - 16,
      def.cssColor,
      `+${earned} 夢のしずく`
    );

    // Fill Leather Satchel ("夢の瓶を入れる鞄")
    const cap = this.gsm.getSatchelCapacity();
    this.gsm.state.satchelFill = Math.min(cap, this.gsm.state.satchelFill + (isRare ? 3 : 1));
    this.addFeverCharge(def.feverGain);

    // Check Return Order slots
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
        const bonusDrops = Math.round(order.bonusDrops * this.gsm.getDropsMultiplier());
        const bonusJars =
          order.bonusJars + Math.floor(this.gsm.state.upgrades.dreamSatchel / 3);

        this.gsm.state.drops += bonusDrops;
        this.gsm.state.totalDropsEarned += bonusDrops;
        this.gsm.state.jars += bonusJars;
        this.gsm.state.totalOrdersCompleted += 1;

        this.sessionStats.ordersCompleted += 1;
        this.sessionStats.dropsEarned += bonusDrops;
        this.sessionStats.jarsEarned += bonusJars;
        this.sessionStats.score += bonusDrops * 2;
        this.gsm.state.bestScore = Math.max(this.gsm.state.bestScore, this.sessionStats.score);

        this.audio.playOrderCompleteSE(false);
        this.actor.triggerCelebrate();
        this.vaultScene.launchDreamReturnArc(this.posX, 1.3, this.posZ, 0xffe296);
        this.callbacks.onOrderCompleted(order.name, order.whisperMessage, bonusJars);
        this.pickOrder(this.orderIndex + 1);
      }
    }

    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private completeDreamPedestal(pd: PedestalState): void {
    const def = DREAM_PEDESTALS[pd.id];
    pd.progress = 100;
    pd.cooldown = 3.2;
    pd.awakening = false;

    this.combo += 2;
    this.sessionStats.dreamsAwakened += 1;
    this.sessionStats.lidsOpened += def.dreamsAwakened;
    this.sessionStats.maxCombo = Math.max(this.sessionStats.maxCombo, this.combo);
    this.gsm.state.bestCombo = Math.max(this.gsm.state.bestCombo, this.combo);
    this.gsm.state.totalDreamsReturned += 1;
    this.gsm.state.totalLidsOpened += def.dreamsAwakened;

    const earned = this.addDrops(68);
    const cap = this.gsm.getSatchelCapacity();
    this.gsm.state.satchelFill = Math.min(cap, this.gsm.state.satchelFill + 2);
    this.addFeverCharge(12);

    this.audio.playDreamAwakenSE();
    this.actor.triggerCelebrate();
    this.vaultScene.pulsePedestal(pd.id);
    this.vaultScene.launchDreamReturnArc(def.x, 1.05, def.z, def.accentHex);
    this.vaultScene.updateLedgerBoard(
      24 + this.gsm.state.totalSatchelsStored * 12 + this.gsm.state.totalLidsOpened,
      6 + this.gsm.state.totalDreamsReturned
    );

    this.tmpVec.set(def.x, 1.2, def.z);
    const sc = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);
    this.spawnFxBurst(sc.x, sc.y, def.cssColor, 24, true);
    this.callbacks.onFloatingText(
      `✨ ${def.tagLabel}`,
      sc.x,
      sc.y - 26,
      def.cssColor,
      `+${earned} 夢のしずく`
    );
    this.callbacks.onComboChange(this.combo, this.getComboMult());
    this.callbacks.onStateDirty();
  }

  private handleMistCollision(ms: ActiveSighMist): void {
    this.vaultScene.worldGroup.remove(ms.group);
    this.invulnTimer = 1.15;

    this.tmpVec.set(this.posX, 0.9, this.posZ);
    const sc = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

    if (this.shieldsRemaining > 0) {
      this.shieldsRemaining -= 1;
      this.audio.playMistHitSE(true);
      this.spawnFxBurst(sc.x, sc.y, '#ffc2dc', 16, true);
      this.callbacks.onFloatingText('🍭 綿菓子のやすらぎ！', sc.x, sc.y - 28, '#ffc8dc');
      this.callbacks.onShieldChange(this.shieldsRemaining);
      return;
    }

    this.combo = 0;
    this.audio.playMistHitSE(false);
    this.actor.triggerHitFlash();
    this.vaultScene.triggerShake(0.22, 0.32);
    this.spawnFxBurst(sc.x, sc.y, '#8cb0d0', 14, false);
    this.callbacks.onFloatingText('☁ ため息の霧にふれた…', sc.x, sc.y - 26, '#a4c2de');
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
    const track = YUMEATSUME_TRACKS[this.gsm.state.selectedTrack];

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // LID OPEN cooldown & active duration
    if (this.lidActiveTimer > 0) {
      this.lidActiveTimer = Math.max(0, this.lidActiveTimer - dt);
    }
    if (this.lidCooldown > 0) {
      const maxCd = this.gsm.getLidOpenCooldownSec();
      this.lidCooldown = Math.max(0, this.lidCooldown - dt);
      this.callbacks.onLidCooldownChange(
        1 - this.lidCooldown / Math.max(0.1, maxCd),
        this.lidCooldown <= 0,
        this.lidActiveTimer > 0
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

    // Passive dream drops from Cotton Candy Nook upgrade
    if (active && this.gsm.state.upgrades.cottonCandyNook > 0) {
      this.passiveAccum += dt * this.gsm.state.upgrades.cottonCandyNook * 4;
      if (this.passiveAccum >= 1) {
        const gain = Math.floor(this.passiveAccum);
        this.passiveAccum -= gain;
        this.gsm.state.drops += gain;
        this.gsm.state.totalDropsEarned += gain;
        this.sessionStats.dropsEarned += gain;
        this.callbacks.onStateDirty();
      }
    }

    // Beat-driven spawning
    if (active) {
      if (beatFloat >= this.nextTokenBeat) {
        this.spawnDreamToken(this.isFever && Math.random() < 0.45);
        this.nextTokenBeat = beatFloat + track.spawnEveryBeats * (this.isFever ? 0.68 : 1);
      }
      if (beatFloat >= this.nextMistBeat) {
        if (!this.isFever && Math.random() < track.mistRate + 0.35) {
          this.spawnSighMist();
        }
        this.nextMistBeat = beatFloat + 3.6;
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

    // Gently slide around the central medallion pedestal at (0, -0.35)
    const pbDx = this.posX;
    const pbDz = this.posZ + 0.35;
    const pbDist = Math.hypot(pbDx, pbDz);
    const minPbDist = 1.15;
    if (pbDist < minPbDist && pbDist > 0.001) {
      this.posX = (pbDx / pbDist) * minPbDist;
      this.posZ = -0.35 + (pbDz / pbDist) * minPbDist;
    }

    // Update spilled dream tokens (bob, magnetize & scoop into jar)
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
        this.vaultScene.worldGroup.remove(tk.group);
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

    // Update sigh mist hazards
    const mistSlow = this.isLidOpening ? 0.25 : 1.0;
    for (let i = this.mists.length - 1; i >= 0; i--) {
      const ms = this.mists[i];
      ms.age += dt * mistSlow;
      if (ms.age >= ms.maxAge) {
        this.vaultScene.worldGroup.remove(ms.group);
        this.mists.splice(i, 1);
        continue;
      }
      ms.x += ms.vx * dt * mistSlow;
      ms.z += ms.vz * dt * mistSlow;
      ms.group.position.set(ms.x, 0.56 + Math.sin(elapsed * 2.5 + ms.phase) * 0.08, ms.z);
      ms.group.rotation.y = elapsed * 1.6 + ms.phase;

      if (active && this.invulnTimer <= 0 && !this.isFever) {
        if (Math.hypot(ms.x - this.posX, ms.z - this.posZ) < ms.radius + 0.34) {
          this.mists.splice(i, 1);
          this.handleMistCollision(ms);
        }
      }
    }

    // Update 4 Dream Showcase Pedestals & draw warm dream-light streams from Yumeatsume's glass jar
    let awakeningAny = false;
    let lookPedestal: { x: number; z: number } | null = null;
    const awakenRate = this.gsm.getAwakenRate();
    const beamPairs: { pedestalId: number; color: string }[] = [];

    for (const pd of this.pedestals) {
      const def = DREAM_PEDESTALS[pd.id];
      if (pd.cooldown > 0) {
        pd.cooldown = Math.max(0, pd.cooldown - dt);
        if (pd.cooldown <= 0) {
          pd.progress = 26;
          pd.lastStepIndex = 1;
        }
        this.vaultScene.updatePedestalVisual(pd.id, 100, false, true, false, elapsed);
        continue;
      }

      const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
      const inRange = active && (dist <= reach + 0.44 || this.isFever);

      if (inRange) {
        pd.awakening = true;
        awakeningAny = true;
        if (!lookPedestal) lookPedestal = { x: def.x, z: def.z };
        const rate = this.isFever ? awakenRate * 0.72 : awakenRate;
        pd.progress = Math.min(100, pd.progress + rate * dt);
        beamPairs.push({ pedestalId: pd.id, color: def.cssColor });

        const stepIdx = Math.floor(pd.progress / 25);
        if (stepIdx > pd.lastStepIndex && stepIdx < 4) {
          pd.lastStepIndex = stepIdx;
          this.audio.playAwakenStepSE(stepIdx);
          this.vaultScene.pulsePedestal(pd.id);
        }

        if (pd.progress >= 100) {
          this.completeDreamPedestal(pd);
        }
      } else {
        pd.awakening = false;
        if (active && !this.isLidOpening) {
          pd.progress = Math.max(8, pd.progress - track.pedestalDrainSpeed * dt);
          pd.lastStepIndex = Math.floor(pd.progress / 25);
        }
      }

      const urgent = pd.progress < 25;
      this.vaultScene.updatePedestalVisual(pd.id, pd.progress, urgent, false, pd.awakening, elapsed);
    }

    this.actor.setAwakeningDream(awakeningAny);
    this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, lookPedestal);

    // Render 2D FX Canvas (Dream Glass Jar light threads + sparkling dream particles)
    this.fxCtx.clearRect(0, 0, this.fxW, this.fxH);

    if (beamPairs.length > 0 && active) {
      this.actor.getJarOriginWorldPos(this.tmpJarVec);
      const from = this.vaultScene.projectToScreen(this.tmpJarVec, this.fxW, this.fxH);

      for (const bp of beamPairs) {
        const def = DREAM_PEDESTALS[bp.pedestalId];
        this.tmpVec.set(def.x, 0.85, def.z);
        const to = this.vaultScene.projectToScreen(this.tmpVec, this.fxW, this.fxH);

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
