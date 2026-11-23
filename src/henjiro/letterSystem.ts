import * as THREE from 'three';
import { HenjiroAudioEngine } from './audioEngine';
import {
  HENJIRO_TRACKS,
  LETTER_DESK_SPOTS,
  LETTER_WORD_LIST,
  LETTER_WORD_MAP,
  PLAY_AREA_HALF_X,
  PLAY_AREA_MAX_Z,
  PLAY_AREA_MIN_Z,
  REPLY_ORDERS,
} from './config';
import { HenjiroActor } from './henjiroActor';
import { PostStudyScene } from './postStudyScene';
import { HenjiroStateManager } from './state';
import { HenjiroRunStats, LetterWordId, ReplyOrderDef } from './types';

interface ActiveLetterItem {
  id: number;
  wordId: LetterWordId;
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

interface ActiveInkBlot {
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
  charge: number; // 0..100
  cooldown: number; // brief warm glow after reply completed
  writing: boolean;
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
  kind: 'spark' | 'ring' | 'paper' | 'wax';
}

export interface LetterSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: ReplyOrderDef, filled: boolean[]) => void;
  onOrderCompleted: (title: string, message: string, sealsEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onFlourishCooldownChange: (pct: number, ready: boolean) => void;
}

export class LetterSystem {
  private studyScene: PostStudyScene;
  private actor: HenjiroActor;
  private audio: HenjiroAudioEngine;
  private gsm: HenjiroStateManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private callbacks: LetterSystemCallbacks;

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
  private letters: ActiveLetterItem[] = [];
  private blots: ActiveInkBlot[] = [];
  private spots: SpotState[] = [];
  private fxParticles: FxParticle[] = [];

  // Shared geometries for letters & blots
  private paperBallGeo = new THREE.DodecahedronGeometry(0.24, 0);
  private envBodyGeo = new THREE.BoxGeometry(0.46, 0.05, 0.32);
  private waxDotGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.025, 12);
  private starGeo = new THREE.OctahedronGeometry(0.24, 0);
  private blotCoreGeo = new THREE.DodecahedronGeometry(0.32, 1);

  // Beat cursors & timers
  private nextLetterBeat = 0;
  private nextBlotBeat = 0;
  private passiveAccum = 0;
  private flourishCooldown = 0;
  private invulnTimer = 0;

  // Order & combo & fever
  private orderIndex = 0;
  private currentOrder: ReplyOrderDef = REPLY_ORDERS[0];
  private orderFilled: boolean[] = [false, false, false];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0; // 0..100
  private feverRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: HenjiroRunStats = this.createEmptyStats();

  private tmpVec = new THREE.Vector3();
  private tmpQuillVec = new THREE.Vector3();

  constructor(
    studyScene: PostStudyScene,
    actor: HenjiroActor,
    audio: HenjiroAudioEngine,
    gsm: HenjiroStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: LetterSystemCallbacks
  ) {
    this.studyScene = studyScene;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.initSpots();
    this.pickOrder(0);
  }

  private createEmptyStats(): HenjiroRunStats {
    return {
      score: 0,
      lettersSmoothed: 0,
      repliesFinished: 0,
      ordersCompleted: 0,
      waxDispatches: 0,
      blotsCleared: 0,
      maxCombo: 0,
      lightEarned: 0,
      sealsEarned: 0,
    };
  }

  private initSpots(): void {
    this.spots = LETTER_DESK_SPOTS.map((s, idx) => ({
      id: s.id,
      charge: 52 + idx * 9,
      cooldown: 0,
      writing: false,
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
    if (!this.studyScene.screenToFloor(virtualX, virtualY, this.fxW, this.fxH, this.tmpVec)) {
      return;
    }
    const clamped = this.clampToStudy(this.tmpVec.x, this.tmpVec.z);

    // Snap gently to a writing spot if tapped nearby
    let snappedSpot: number | null = null;
    for (const s of LETTER_DESK_SPOTS) {
      if (Math.hypot(clamped.x - s.x, clamped.z - s.z) < 1.35) {
        clamped.x = s.x;
        clamped.z = s.z;
        snappedSpot = s.id;
        break;
      }
    }

    this.pointerTarget = { x: clamped.x, z: clamped.z, spotId: snappedSpot };
  }

  private clampToStudy(x: number, z: number): { x: number; z: number } {
    let cx = Math.max(-PLAY_AREA_HALF_X, Math.min(PLAY_AREA_HALF_X, x));
    let cz = Math.max(PLAY_AREA_MIN_Z, Math.min(PLAY_AREA_MAX_Z, z));
    // Stay neatly inside the circular post study rug & floor
    const rad = Math.hypot(cx, cz);
    const maxR = 4.55;
    if (rad > maxR) {
      cx = (cx / rad) * maxR;
      cz = (cz / rad) * maxR;
    }
    return { x: cx, z: cz };
  }

  public resetSession(spawnStarterLetters: boolean): void {
    this.clearEntities();
    this.fxParticles = [];
    this.clearKeys();

    this.posX = 0;
    this.posZ = 0.55;
    this.velX = 0;
    this.velZ = 0;
    this.actor.setMotion(this.posX, this.posZ, 0, 0, 0.016, null);
    this.actor.setWritingSpot(false);

    this.combo = 0;
    this.isFever = false;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.flourishCooldown = 0;
    this.invulnTimer = 0;
    this.passiveAccum = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    this.initSpots();
    this.pickOrder(Math.floor(Math.random() * REPLY_ORDERS.length));

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onFlourishCooldownChange(1, true);

    if (spawnStarterLetters) {
      for (let i = 0; i < 4; i++) {
        this.spawnWordLetter(true);
      }
    }
  }

  public resetBeatCursors(currentBeat: number): void {
    const track = HENJIRO_TRACKS[this.audio.currentTrackId];
    this.nextLetterBeat = currentBeat + track.spawnEveryBeats * 0.65;
    this.nextBlotBeat = currentBeat + 6.5;
  }

  private clearEntities(): void {
    for (const l of this.letters) {
      this.studyScene.worldGroup.remove(l.group);
    }
    this.letters = [];

    for (const b of this.blots) {
      this.studyScene.worldGroup.remove(b.group);
    }
    this.blots = [];
  }

  private pickOrder(index: number): void {
    this.orderIndex = index % REPLY_ORDERS.length;
    this.currentOrder = REPLY_ORDERS[this.orderIndex];
    this.orderFilled = this.currentOrder.words.map(() => false);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
  }

  private chooseWordId(): LetterWordId {
    // Helpful bias toward words needed for the active reply order
    const needed = this.currentOrder.words.filter((_, i) => !this.orderFilled[i]);
    if (needed.length > 0 && Math.random() < 0.48) {
      return needed[Math.floor(Math.random() * needed.length)];
    }

    const rareBoost = this.gsm.state.upgrades.bookshelfWindow * 3.5;
    const weights = LETTER_WORD_LIST.map((item) =>
      item.id === 'daijoubu' ? item.weight + rareBoost : item.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < LETTER_WORD_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return LETTER_WORD_LIST[i].id;
    }
    return 'gomen';
  }

  private spawnWordLetter(nearCenter = false, forceWord?: LetterWordId): void {
    const track = HENJIRO_TRACKS[this.audio.currentTrackId];
    if (this.letters.length >= track.maxActiveLetters && !forceWord) return;

    const wordId = forceWord || this.chooseWordId();
    const def = LETTER_WORD_MAP[wordId];

    const angle = Math.random() * Math.PI * 2;
    const radius = nearCenter ? 1.1 + Math.random() * 1.9 : 1.0 + Math.random() * 3.1;
    const pos = this.clampToStudy(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.78 + 0.15);

    const group = new THREE.Group();
    const startY = nearCenter ? 0.55 : 4.2 + Math.random() * 1.4;
    group.position.set(pos.x, startY, pos.z);

    if (wordId === 'daijoubu') {
      // Radiant star-wax sealed golden letter
      const star = new THREE.Mesh(
        this.starGeo,
        new THREE.MeshStandardMaterial({
          color: def.colorHex,
          emissive: def.emissiveHex,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.35,
        })
      );
      group.add(star);
    } else {
      // Cute crumpled parchment letter with colored ribbon & tiny red wax seal
      const paperMat = new THREE.MeshStandardMaterial({
        color: def.colorHex,
        emissive: def.emissiveHex,
        emissiveIntensity: 0.45,
        roughness: 0.65,
      });
      const env = new THREE.Mesh(this.envBodyGeo, paperMat);
      env.rotation.set(0.22, Math.random() * Math.PI, 0.14);
      group.add(env);

      const ball = new THREE.Mesh(
        this.paperBallGeo,
        new THREE.MeshStandardMaterial({
          color: 0xf7eed8,
          emissive: def.emissiveHex,
          emissiveIntensity: 0.32,
          roughness: 0.8,
        })
      );
      ball.scale.set(0.75, 0.55, 0.75);
      ball.position.y = 0.08;
      group.add(ball);

      const wax = new THREE.Mesh(
        this.waxDotGeo,
        new THREE.MeshStandardMaterial({
          color: 0xc93a30,
          emissive: 0x6b140e,
          emissiveIntensity: 0.45,
        })
      );
      wax.position.y = 0.2;
      group.add(wax);
    }

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.studyScene.glowTex,
        color: def.colorHex,
        transparent: true,
        opacity: wordId === 'daijoubu' ? 0.92 : 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.setScalar(wordId === 'daijoubu' ? 1.55 : 1.12);
    group.add(halo);

    this.studyScene.worldGroup.add(group);
    this.letters.push({
      id: this.nextEntityId++,
      wordId,
      group,
      x: pos.x,
      y: startY,
      z: pos.z,
      vx: (Math.random() - 0.5) * 0.25,
      vz: (Math.random() - 0.5) * 0.25,
      age: 0,
      maxAge: wordId === 'daijoubu' ? 12 : 11,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private spawnInkBlot(): void {
    if (this.isFever || this.blots.length >= 3) return;

    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (PLAY_AREA_HALF_X - 0.2);
    const z = -1.6 + Math.random() * 4.2;
    const speed = 1.05 + Math.random() * 0.55;
    const targetX = -side * 3.6;
    const targetZ = (Math.random() - 0.5) * 3.0;
    const dist = Math.max(1, Math.hypot(targetX - x, targetZ - z));

    const group = new THREE.Group();
    group.position.set(x, 0.68, z);

    const core = new THREE.Mesh(
      this.blotCoreGeo,
      new THREE.MeshStandardMaterial({
        color: 0x20274a,
        emissive: 0x3b4885,
        emissiveIntensity: 0.65,
        roughness: 0.35,
        transparent: true,
        opacity: 0.88,
      })
    );
    group.add(core);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 24),
      new THREE.MeshBasicMaterial({
        color: 0x7084d4,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.62;
    group.add(ring);

    const mist = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.studyScene.glowTex,
        color: 0x5c6ec2,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mist.scale.set(1.5, 1.5, 1);
    group.add(mist);

    this.studyScene.worldGroup.add(group);
    this.blots.push({
      id: this.nextEntityId++,
      group,
      x,
      z,
      vx: ((targetX - x) / dist) * speed,
      vz: ((targetZ - z) / dist) * speed,
      age: 0,
      maxAge: 9.5,
      phase: Math.random() * Math.PI * 2,
      radius: 0.58,
    });
  }

  public getComboMultiplier(): number {
    return 1 + Math.min(2.0, Math.floor(this.combo / 5) * 0.15);
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

  private resetCombo(): void {
    if (this.combo === 0) return;
    this.combo = 0;
    this.callbacks.onComboChange(0, 1);
  }

  private earnLight(baseAmount: number): number {
    const track = HENJIRO_TRACKS[this.audio.currentTrackId];
    const feverMult = this.isFever ? 2.0 : 1.0;
    const total = Math.max(
      1,
      Math.round(
        baseAmount *
          track.valueMultiplier *
          this.gsm.getLightMultiplier() *
          this.getComboMultiplier() *
          feverMult
      )
    );
    this.gsm.state.light += total;
    this.gsm.state.totalLightEarned += total;
    this.sessionStats.lightEarned += total;
    this.sessionStats.score += total * 10;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }
    return total;
  }

  private chargeFever(amount: number): void {
    if (this.isFever) return;
    this.feverCharge = Math.min(100, this.feverCharge + amount);
    this.callbacks.onFeverChange(false, this.feverCharge, 0);
  }

  private collectLetter(item: ActiveLetterItem): void {
    if (item.collected) return;
    item.collected = true;
    const def = LETTER_WORD_MAP[item.wordId];
    const isRare = item.wordId === 'daijoubu';

    this.addCombo(1);
    const gained = this.earnLight(def.baseValue);
    this.chargeFever(def.feverGain);
    this.sessionStats.lettersSmoothed += 1;

    // Fill the reply tray
    const cap = this.gsm.getTrayCapacity();
    if (this.gsm.state.trayFill < cap) {
      this.gsm.state.trayFill = Math.min(cap, this.gsm.state.trayFill + (isRare ? 2 : 1));
    }

    // Check active reply order slot
    let matchedOrder = false;
    for (let i = 0; i < this.currentOrder.words.length; i++) {
      if (!this.orderFilled[i] && (this.currentOrder.words[i] === item.wordId || isRare)) {
        this.orderFilled[i] = true;
        matchedOrder = true;
        break;
      }
    }

    this.actor.triggerPickupPop();
    this.audio.playLetterSmoothSE(this.combo, isRare);

    const proj = this.studyScene.projectToScreen(
      new THREE.Vector3(item.x, item.y + 0.35, item.z),
      this.fxW,
      this.fxH
    );
    if (proj.visible) {
      this.spawnFxBurst(proj.x, proj.y, def.cssColor, isRare ? 16 : 9, 'paper');
      this.callbacks.onFloatingText(
        `${def.icon} ${def.wordText}`,
        proj.x,
        proj.y - 10,
        def.cssColor,
        `+${gained} 灯り`
      );
    }

    if (matchedOrder) {
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
      if (this.orderFilled.every(Boolean)) {
        this.completeCurrentOrder();
      }
    }

    this.callbacks.onStateDirty();
  }

  private completeCurrentOrder(): void {
    const order = this.currentOrder;
    const bonusLight = this.earnLight(order.bonusLight);
    const seals = order.bonusSeals + Math.floor(this.gsm.state.upgrades.clothesline / 2);
    this.gsm.state.seals += seals;
    this.gsm.state.totalOrdersCompleted += 1;
    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.sealsEarned += seals;
    this.chargeFever(16);

    this.actor.triggerCelebrate();
    this.studyScene.spawnFlyingReplyLetter(new THREE.Vector3(this.posX, 1.15, this.posZ), false);
    this.studyScene.spawnFlyingReplyLetter(new THREE.Vector3(0, 1.35, -3.4), true);
    this.audio.playOrderCompleteSE(false);

    const proj = this.studyScene.projectToScreen(
      new THREE.Vector3(this.posX, 1.75, this.posZ),
      this.fxW,
      this.fxH
    );
    if (proj.visible) {
      this.spawnFxBurst(proj.x, proj.y, '#ffe39a', 20, 'wax');
      this.callbacks.onFloatingText(
        `💌 返事お届け！ +${bonusLight}`,
        proj.x,
        proj.y - 24,
        '#ffe59e',
        `+${seals} 心の手紙`
      );
    }

    this.callbacks.onOrderCompleted(order.name, order.whisperMessage, seals);
    this.pickOrder(this.orderIndex + 1);
    this.callbacks.onStateDirty();
  }

  private completeWritingSpot(spot: SpotState): void {
    spot.charge = 100;
    spot.cooldown = 3.2;
    spot.writing = false;

    this.addCombo(2);
    const gained = this.earnLight(52);
    this.chargeFever(14);
    this.gsm.state.totalRepliesSent += 1;
    this.sessionStats.repliesFinished += 1;

    const cap = this.gsm.getTrayCapacity();
    this.gsm.state.trayFill = Math.min(cap, this.gsm.state.trayFill + 2);

    // Completing a spot also advances 1 unfilled order slot softly!
    for (let i = 0; i < this.orderFilled.length; i++) {
      if (!this.orderFilled[i]) {
        this.orderFilled[i] = true;
        this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled]);
        if (this.orderFilled.every(Boolean)) {
          this.completeCurrentOrder();
        }
        break;
      }
    }

    const def = LETTER_DESK_SPOTS[spot.id];
    this.studyScene.triggerSpotCompleteFX(spot.id);
    this.actor.triggerCelebrate();
    this.audio.playReplyFinishSE();

    const proj = this.studyScene.projectToScreen(
      new THREE.Vector3(def.x, 1.45, def.z),
      this.fxW,
      this.fxH
    );
    if (proj.visible) {
      this.spawnFxBurst(proj.x, proj.y, '#ff8e7e', 18, 'wax');
      this.callbacks.onFloatingText(
        `✉️ 封蝋ポンッ！ +${gained}`,
        proj.x,
        proj.y - 16,
        '#ffe4a4',
        def.whisperLine
      );
    }

    this.callbacks.onStateDirty();
  }

  /** Trigger Quill Flourish (clears nearby ink blots, boosts all writing spots, pulls letters) */
  public triggerQuillFlourish(): boolean {
    if (this.flourishCooldown > 0) return false;
    const cd = this.gsm.getFlourishCooldownSec();
    this.flourishCooldown = cd;
    this.callbacks.onFlourishCooldownChange(0, false);

    const radius = this.gsm.getFlourishRadius();
    this.actor.triggerQuillFlourish(radius);

    // Purify nearby ink blots into sparkling bonus light & rare letters
    let cleared = 0;
    for (let i = this.blots.length - 1; i >= 0; i--) {
      const b = this.blots[i];
      if (Math.hypot(b.x - this.posX, b.z - this.posZ) <= radius) {
        this.studyScene.worldGroup.remove(b.group);
        this.blots.splice(i, 1);
        cleared += 1;
        this.sessionStats.blotsCleared += 1;
        this.addCombo(1);
        const bonus = this.earnLight(34);
        this.chargeFever(8);
        const bp = this.studyScene.projectToScreen(new THREE.Vector3(b.x, 0.9, b.z), this.fxW, this.fxH);
        if (bp.visible) {
          this.spawnFxBurst(bp.x, bp.y, '#a8ccff', 12, 'spark');
          this.callbacks.onFloatingText(`✨ インク浄化 +${bonus}`, bp.x, bp.y, '#b8d8ff');
        }
      }
    }

    // Gently boost all 4 writing spots and pull nearby letters straight to Henjiro
    for (const s of this.spots) {
      if (s.cooldown <= 0 && s.charge < 100) {
        s.charge = Math.min(100, s.charge + 24);
        if (s.charge >= 100) {
          this.completeWritingSpot(s);
        }
      }
    }

    for (const l of this.letters) {
      if (!l.collected && Math.hypot(l.x - this.posX, l.z - this.posZ) <= radius * 0.95) {
        this.collectLetter(l);
      }
    }

    const p = this.studyScene.projectToScreen(new THREE.Vector3(this.posX, 0.8, this.posZ), this.fxW, this.fxH);
    if (p.visible) {
      this.fxParticles.push({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        size: 32,
        color: '#ffe09c',
        alpha: 0.92,
        life: 0,
        maxLife: 0.52,
        kind: 'ring',
      });
    }

    this.audio.playFlourishSE(cleared);
    this.studyScene.triggerShake(0.14, 0.08);
    this.callbacks.onStateDirty();
    return true;
  }

  /** Dispatch all 12 letters in the reply tray with a red wax seal! */
  public dispatchWaxTray(): boolean {
    const cap = this.gsm.getTrayCapacity();
    if (this.gsm.state.trayFill < cap) return false;

    this.gsm.state.trayFill = 0;
    const sealsEarned = this.gsm.getSealsPerDispatch();
    this.gsm.state.seals += sealsEarned;
    this.gsm.state.totalWaxDispatches += 1;
    this.gsm.state.totalRepliesSent += 3;
    this.sessionStats.waxDispatches += 1;
    this.sessionStats.sealsEarned += sealsEarned;

    const bonusLight = this.earnLight(125);
    this.chargeFever(22);

    this.actor.triggerCelebrate();
    this.studyScene.triggerWaxDispatchBurst(new THREE.Vector3(this.posX, 0.9, this.posZ));
    this.audio.playWaxDispatchSE();

    const p = this.studyScene.projectToScreen(new THREE.Vector3(this.posX, 1.6, this.posZ), this.fxW, this.fxH);
    if (p.visible) {
      this.spawnFxBurst(p.x, p.y, '#ff7d6e', 26, 'wax');
      this.callbacks.onFloatingText(
        `📮 封蝋ポスト便 発送！ +${sealsEarned} 心の手紙`,
        p.x,
        p.y - 26,
        '#ffcaa2',
        `+${bonusLight} ことばの灯り`
      );
    }

    this.callbacks.onStateDirty();
    return true;
  }

  /** Activate MOONLIGHT REPLY fever */
  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 100;
    this.feverRemaining = this.gsm.getFeverDurationSec();

    // Transform all ink blots into rare 'daijoubu' star-wax letters!
    for (const b of this.blots) {
      this.studyScene.worldGroup.remove(b.group);
      this.spawnWordLetter(true, 'daijoubu');
    }
    this.blots = [];

    this.actor.triggerCelebrate();
    this.audio.playFeverSE();
    this.studyScene.triggerShake(0.28, 0.14);
    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private spawnFxBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: 'spark' | 'paper' | 'wax'
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 145;
      this.fxParticles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 35,
        size: kind === 'paper' ? 5 + Math.random() * 5 : 3 + Math.random() * 4.5,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.4,
        kind,
      });
    }
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    // Update flourish cooldown
    if (this.flourishCooldown > 0) {
      const cdMax = this.gsm.getFlourishCooldownSec();
      this.flourishCooldown = Math.max(0, this.flourishCooldown - dt);
      const pct = 1 - this.flourishCooldown / Math.max(0.1, cdMax);
      this.callbacks.onFlourishCooldownChange(pct, this.flourishCooldown <= 0);
    }

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // Passive light generation from glassesChair
    if (active && this.gsm.state.upgrades.glassesChair > 0) {
      this.passiveAccum += dt * this.gsm.state.upgrades.glassesChair * 4;
      if (this.passiveAccum >= 1) {
        const gain = Math.floor(this.passiveAccum);
        this.passiveAccum -= gain;
        this.gsm.state.light += gain;
        this.gsm.state.totalLightEarned += gain;
        this.sessionStats.lightEarned += gain;
        this.callbacks.onStateDirty();
      }
    }

    // Fever countdown
    if (this.isFever && active) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      const dur = this.gsm.getFeverDurationSec();
      const pct = (this.feverRemaining / Math.max(1, dur)) * 100;
      this.callbacks.onFeverChange(true, pct, this.feverRemaining);
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.feverCharge = 0;
        this.callbacks.onFeverChange(false, 0, 0);
      }
    }

    // Player steering (keyboard or pointer target)
    let moveX = 0;
    let moveZ = 0;
    if (active) {
      if (this.keys.left) moveX -= 1;
      if (this.keys.right) moveX += 1;
      if (this.keys.up) moveZ -= 1;
      if (this.keys.down) moveZ += 1;

      const maxSpeed = this.isFever ? 6.4 : 5.2;
      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        this.velX = (moveX / len) * maxSpeed;
        this.velZ = (moveZ / len) * maxSpeed;
      } else if (this.pointerTarget) {
        const dx = this.pointerTarget.x - this.posX;
        const dz = this.pointerTarget.z - this.posZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.14) {
          const spd = Math.min(maxSpeed, dist * 5.8);
          this.velX = (dx / dist) * spd;
          this.velZ = (dz / dist) * spd;
        } else {
          this.velX *= 0.6;
          this.velZ *= 0.6;
          if (this.pointerTarget.spotId === null) {
            this.pointerTarget = null;
          }
        }
      } else {
        this.velX *= Math.exp(-10 * dt);
        this.velZ *= Math.exp(-10 * dt);
      }

      const next = this.clampToStudy(this.posX + this.velX * dt, this.posZ + this.velZ * dt);
      this.posX = next.x;
      this.posZ = next.z;
    }

    // Beat-synced spawning
    if (active) {
      const track = HENJIRO_TRACKS[this.audio.currentTrackId];
      if (beatFloat >= this.nextLetterBeat) {
        this.nextLetterBeat = beatFloat + (this.isFever ? track.spawnEveryBeats * 0.72 : track.spawnEveryBeats);
        this.spawnWordLetter(false);
      }
      if (beatFloat >= this.nextBlotBeat) {
        this.nextBlotBeat = beatFloat + (5.2 + Math.random() * 2.8);
        if (Math.random() < track.blotRate * 2.4) {
          this.spawnInkBlot();
        }
      }
    }

    // Update 4 writing spots
    const reach = this.gsm.getReachRadius();
    const writeRate = this.gsm.getWriteRate();
    const track = HENJIRO_TRACKS[this.audio.currentTrackId];
    let writingAnySpot = false;
    let activeWriteSpotPos: { x: number; z: number } | null = null;

    for (const spot of this.spots) {
      const def = LETTER_DESK_SPOTS[spot.id];
      const dist = Math.hypot(this.posX - def.x, this.posZ - def.z);
      if (spot.cooldown > 0) {
        spot.cooldown = Math.max(0, spot.cooldown - dt);
        spot.writing = false;
        this.studyScene.setSpotVisualState(spot.id, 100, false, elapsed);
        continue;
      }

      if (active) {
        if (this.isFever) {
          // Moonlight fever gently writes all 4 spots automatically!
          spot.charge = Math.min(100, spot.charge + writeRate * 0.36 * dt);
          spot.writing = true;
          if (spot.charge >= 100) {
            this.completeWritingSpot(spot);
          }
        } else if (dist <= reach * 0.96) {
          spot.writing = true;
          writingAnySpot = true;
          activeWriteSpotPos = { x: def.x, z: def.z };
          spot.charge = Math.min(100, spot.charge + writeRate * dt);
          spot.tickAccum += dt;
          if (spot.tickAccum >= 0.22) {
            spot.tickAccum = 0;
            this.audio.playQuillTickSE(spot.charge / 100);
          }
          if (spot.charge >= 100) {
            this.completeWritingSpot(spot);
          }
        } else {
          spot.writing = false;
          spot.tickAccum = 0;
          spot.charge = Math.max(8, spot.charge - track.spotFadeSpeed * dt);
        }
      } else {
        spot.writing = false;
      }

      this.studyScene.setSpotVisualState(spot.id, spot.charge, spot.writing, elapsed);
    }

    this.actor.setWritingSpot(writingAnySpot);
    this.actor.setMotion(this.posX, this.posZ, this.velX, this.velZ, dt, activeWriteSpotPos);

    // Update falling & floating word letters
    const pickupDist = reach * 0.92;
    for (let i = this.letters.length - 1; i >= 0; i--) {
      const l = this.letters[i];
      l.age += dt;
      if (l.collected || l.age >= l.maxAge) {
        this.studyScene.worldGroup.remove(l.group);
        this.letters.splice(i, 1);
        continue;
      }

      // Gently flutter down from the top slot until hovering at waist height
      const hoverY = 0.52 + Math.sin(elapsed * 2.8 + l.phase) * 0.11;
      if (l.y > hoverY + 0.04) {
        l.y = Math.max(hoverY, l.y - 2.35 * dt);
        l.x += Math.sin(elapsed * 3.2 + l.phase) * 0.45 * dt;
      } else {
        l.y = hoverY;
        l.x += l.vx * dt;
        l.z += l.vz * dt;
      }

      // Magnetic pull during MOONLIGHT REPLY fever or when very close
      const dx = this.posX - l.x;
      const dz = this.posZ - l.z;
      const dist = Math.hypot(dx, dz);
      if (active && (this.isFever || dist < reach * 1.35)) {
        const pull = this.isFever ? 6.8 : 3.2;
        l.x += (dx / Math.max(0.1, dist)) * pull * dt;
        l.z += (dz / Math.max(0.1, dist)) * pull * dt;
      }

      const clamped = this.clampToStudy(l.x, l.z);
      l.x = clamped.x;
      l.z = clamped.z;
      l.group.position.set(l.x, l.y, l.z);
      l.group.rotation.y = elapsed * 1.4 + l.phase;

      // Fade warning scale near end of lifetime
      const rem = l.maxAge - l.age;
      const s = rem < 1.8 ? 0.72 + Math.sin(elapsed * 16) * 0.18 : 1;
      l.group.scale.setScalar(s);

      if (active && dist <= pickupDist && l.y < 1.85) {
        this.collectLetter(l);
      }
    }

    // Update hesitation ink blots
    for (let i = this.blots.length - 1; i >= 0; i--) {
      const b = this.blots[i];
      b.age += dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.group.position.set(b.x, 0.68 + Math.sin(elapsed * 3.4 + b.phase) * 0.14, b.z);
      b.group.rotation.y = elapsed * 1.8 + b.phase;
      b.group.rotation.x = Math.sin(elapsed * 2 + b.phase) * 0.3;

      if (b.age >= b.maxAge || Math.abs(b.x) > PLAY_AREA_HALF_X + 1.2) {
        this.studyScene.worldGroup.remove(b.group);
        this.blots.splice(i, 1);
        continue;
      }

      if (active && this.invulnTimer <= 0 && !this.isFever) {
        const dist = Math.hypot(b.x - this.posX, b.z - this.posZ);
        if (dist < b.radius + 0.42) {
          this.studyScene.worldGroup.remove(b.group);
          this.blots.splice(i, 1);
          this.invulnTimer = 1.1;

          const proj = this.studyScene.projectToScreen(
            new THREE.Vector3(this.posX, 1.3, this.posZ),
            this.fxW,
            this.fxH
          );
          if (this.shieldsRemaining > 0) {
            this.shieldsRemaining -= 1;
            this.callbacks.onShieldChange(this.shieldsRemaining);
            this.audio.playBlotHitSE(true);
            if (proj.visible) {
              this.spawnFxBurst(proj.x, proj.y, '#a6ccff', 14, 'spark');
              this.callbacks.onFloatingText('👓 まもり発動！', proj.x, proj.y - 16, '#b8d8ff');
            }
          } else {
            this.resetCombo();
            this.actor.triggerHitFlash();
            this.audio.playBlotHitSE(false);
            this.studyScene.triggerShake(0.22, 0.14);
            if (proj.visible) {
              this.spawnFxBurst(proj.x, proj.y, '#7b8bd4', 12, 'spark');
              this.callbacks.onFloatingText('インク染み…！', proj.x, proj.y - 16, '#9eb0f5', '🪶で浄化しよう');
            }
          }
        }
      }
    }

    this.renderFxOverlay(elapsed, dt, active);
  }

  private renderFxOverlay(elapsed: number, dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Subtle moonlight golden border glow during fever
    if (this.isFever && active) {
      const gr = ctx.createRadialGradient(
        this.fxW * 0.5,
        this.fxH * 0.5,
        Math.min(this.fxW, this.fxH) * 0.34,
        this.fxW * 0.5,
        this.fxH * 0.5,
        Math.max(this.fxW, this.fxH) * 0.68
      );
      gr.addColorStop(0, 'rgba(255, 230, 150, 0)');
      gr.addColorStop(1, `rgba(255, 212, 120, ${(0.22 + 0.08 * Math.sin(elapsed * 6)).toFixed(3)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, this.fxW, this.fxH);
    }

    // Draw 4 writing spot HUD gauges + golden quill stream when writing
    if (active) {
      this.actor.getQuillOriginWorldPos(this.tmpQuillVec);
      const quillScr = this.studyScene.projectToScreen(this.tmpQuillVec, this.fxW, this.fxH);

      for (const spot of this.spots) {
        const def = LETTER_DESK_SPOTS[spot.id];
        const yOff = spot.id === 0 ? 1.85 : 1.28;
        const scr = this.studyScene.projectToScreen(
          new THREE.Vector3(def.x, yOff, def.z),
          this.fxW,
          this.fxH
        );
        if (!scr.visible) continue;

        // Golden ink ribbon from Henjiro's quill to the spot being written
        if (spot.writing && quillScr.visible && !this.isFever) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 222, 142, 0.85)';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ffd27a';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(quillScr.x, quillScr.y);
          const mx = (quillScr.x + scr.x) * 0.5;
          const my = (quillScr.y + scr.y) * 0.5 - 24 + Math.sin(elapsed * 14) * 5;
          ctx.quadraticCurveTo(mx, my, scr.x, scr.y + 8);
          ctx.stroke();
          ctx.restore();
        }

        // Compact pill gauge above each spot
        const pillW = 86;
        const pillH = 22;
        const px = scr.x - pillW / 2;
        const py = scr.y - 26;
        const low = spot.charge < 35 && spot.cooldown <= 0;

        ctx.save();
        ctx.fillStyle = 'rgba(14, 18, 36, 0.82)';
        ctx.strokeStyle =
          spot.cooldown > 0
            ? 'rgba(255, 224, 148, 0.85)'
            : low
              ? `rgba(146, 186, 255, ${(0.65 + 0.35 * Math.sin(elapsed * 8)).toFixed(2)})`
              : 'rgba(255, 206, 138, 0.52)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(px, py, pillW, pillH, 11);
        ctx.fill();
        ctx.stroke();

        // Inner progress bar
        const pct = spot.cooldown > 0 ? 1 : spot.charge / 100;
        const barW = (pillW - 8) * Math.max(0, Math.min(1, pct));
        ctx.fillStyle =
          spot.cooldown > 0
            ? '#f07868'
            : spot.writing
              ? '#ffd67a'
              : low
                ? '#7aa4f0'
                : '#e8b66c';
        ctx.beginPath();
        ctx.roundRect(px + 4, py + pillH - 6, barW, 3.5, 2);
        ctx.fill();

        // Label
        ctx.font = '700 10px "Zen Maru Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = spot.cooldown > 0 ? '#ffe7b8' : low ? '#cfe0ff' : '#faf0e0';
        const txt =
          spot.cooldown > 0
            ? '封蝋済 ✉️'
            : spot.writing
              ? `執筆中 ${Math.round(spot.charge)}%`
              : low
                ? `${def.shortName} 書きかけ!`
                : def.shortName;
        ctx.fillText(txt, scr.x, py + 9);
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
      const a = (1 - u) * p.alpha;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind !== 'ring') p.vy += 150 * dt;

      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * (1 - u);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + u * 150, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'paper') {
        ctx.translate(p.x, p.y);
        ctx.rotate(u * 6);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.65, -p.size * 0.42, p.size * 1.3, p.size * 0.84);
      } else if (p.kind === 'wax') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - u * 0.35), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - u * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
