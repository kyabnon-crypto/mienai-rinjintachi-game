import * as THREE from 'three';
import { SusunomiAudioEngine } from './audioEngine';
import {
  AROMA_LIST,
  AROMA_MAP,
  COUNTER_HALF_WIDTH,
  MEMORY_RECIPES,
  SUSUNOMI_TRACKS,
  VENT_LANES,
} from './config';
import { KitchenScene } from './kitchenScene';
import { SusunomiStateManager } from './state';
import { SusunomiActor } from './susunomiActor';
import { AromaDef, AromaId, MemoryRecipeDef, SusunomiRunStats } from './types';

interface FallingItem {
  id: number;
  kind: 'aroma' | 'soot';
  aroma?: AromaDef;
  mesh: THREE.Group;
  laneIndex: number;
  baseX: number;
  x: number;
  y: number;
  z: number;
  swayPhase: number;
  swayAmp: number;
  speedMult: number;
  collected: boolean;
  collectAnim: number;
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

interface FxRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FxRibbon {
  x: number;
  y: number;
  vy: number;
  wobble: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface KitchenSystemCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onRecipeChange: (recipe: MemoryRecipeDef, progress: number) => void;
  onDishServed: (
    title: string,
    residentThought: string,
    starsEarned: number,
    totalDishes: number
  ) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onStirCooldownChange: (readyPct: number, isReady: boolean) => void;
}

export class KitchenSystem {
  private kitchen: KitchenScene;
  private actor: SusunomiActor;
  private audio: SusunomiAudioEngine;
  private gsm: SusunomiStateManager;
  private cb: KitchenSystemCallbacks;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private fxWidth = window.innerWidth;
  private fxHeight = window.innerHeight;

  private itemGroup = new THREE.Group();
  private items: FallingItem[] = [];
  private nextItemId = 1;

  private sparks: FxSpark[] = [];
  private rings: FxRing[] = [];
  private ribbons: FxRibbon[] = [];

  public combo = 0;
  public feverCharge = 0;
  public isFever = false;
  public feverRemaining = 0;
  public shieldsRemaining = 0;

  private stirCooldown = 0;
  private activeRecipeIndex = 0;
  private recipeProgress = 0; // 0..2 ingredients matched

  public sessionStats: SusunomiRunStats = this.createEmptyStats();

  private lastSpawnBeat = -1;
  private lastPassiveBeat = -1;
  private prevTrackLoop = false;
  private projVec = new THREE.Vector3();

  constructor(
    kitchen: KitchenScene,
    actor: SusunomiActor,
    audio: SusunomiAudioEngine,
    gsm: SusunomiStateManager,
    fxCanvas: HTMLCanvasElement,
    cb: KitchenSystemCallbacks
  ) {
    this.kitchen = kitchen;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.cb = cb;

    this.kitchen.worldGroup.add(this.itemGroup);
    this.resizeFx(window.innerWidth, window.innerHeight);
    this.cb.onRecipeChange(this.getActiveRecipe(), this.recipeProgress);
  }

  private createEmptyStats(): SusunomiRunStats {
    return {
      caught: 0,
      recipeMatches: 0,
      recipesCompleted: 0,
      dishesServed: 0,
      sootPurified: 0,
      sootHits: 0,
      maxCombo: 0,
      dropsEarned: 0,
      starsEarned: 0,
    };
  }

  public getActiveRecipe(): MemoryRecipeDef {
    return MEMORY_RECIPES[this.activeRecipeIndex % MEMORY_RECIPES.length];
  }

  public getNextNeededAroma(): AromaId {
    const rec = this.getActiveRecipe();
    return rec.ingredients[Math.min(2, this.recipeProgress)];
  }

  public resizeFx(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxWidth = Math.max(1, width);
    this.fxHeight = Math.max(1, height);
    this.fxCanvas.width = Math.round(this.fxWidth * dpr);
    this.fxCanvas.height = Math.round(this.fxHeight * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public resetSession(keepUpgrades = true): void {
    this.clearItems();
    this.sparks = [];
    this.rings = [];
    this.ribbons = [];
    this.combo = 0;
    this.feverCharge = 0;
    this.isFever = false;
    this.feverRemaining = 0;
    this.stirCooldown = 0;
    this.shieldsRemaining = keepUpgrades ? this.gsm.getShieldCount() : 0;
    this.activeRecipeIndex = Math.floor(Math.random() * MEMORY_RECIPES.length);
    this.recipeProgress = 0;
    this.sessionStats = this.createEmptyStats();
    this.lastSpawnBeat = -1;
    this.lastPassiveBeat = -1;
    this.actor.reset();

    this.cb.onComboChange(0, 1);
    this.cb.onFeverChange(false, 0, 0);
    this.cb.onShieldChange(this.shieldsRemaining);
    this.cb.onStirCooldownChange(1, true);
    this.cb.onRecipeChange(this.getActiveRecipe(), 0);
    this.cb.onStateDirty();
  }

  public resetBeatCursors(beatFloat: number): void {
    this.lastSpawnBeat = Math.floor(beatFloat) - 1;
    this.lastPassiveBeat = Math.floor(beatFloat / 4);
  }

  private clearItems(): void {
    for (const it of this.items) {
      this.itemGroup.remove(it.mesh);
    }
    this.items = [];
  }

  private projectToScreen(pos: THREE.Vector3): { x: number; y: number } {
    this.projVec.copy(pos).project(this.kitchen.camera);
    return {
      x: (this.projVec.x * 0.5 + 0.5) * this.fxWidth,
      y: (-this.projVec.y * 0.5 + 0.5) * this.fxHeight,
    };
  }

  private pickAromaDef(): AromaDef {
    if (this.isFever && Math.random() < 0.32) {
      return AROMA_MAP.starlight;
    }

    // Generous chance to spawn the exact next ingredient needed for the active recipe!
    if (Math.random() < 0.42) {
      return AROMA_MAP[this.getNextNeededAroma()];
    }

    const starBoost = this.gsm.state.upgrades.ventFan * 5;
    const weights = AROMA_LIST.map((a) => (a.id === 'starlight' ? a.weight + starBoost : a.weight));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < AROMA_LIST.length; i++) {
      r -= weights[i];
      if (r <= 0) return AROMA_LIST[i];
    }
    return AROMA_LIST[0];
  }

  private createAromaMesh(aroma: AromaDef): THREE.Group {
    const g = new THREE.Group();

    // Translucent luminous aroma orb
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 14),
      new THREE.MeshStandardMaterial({
        color: aroma.colorHex,
        emissive: aroma.emissiveHex,
        emissiveIntensity: 0.95,
        roughness: 0.16,
        transparent: true,
        opacity: 0.92,
      })
    );
    g.add(core);

    // Swirling vapor ribbon ring around the aroma orb
    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.036, 8, 22),
      new THREE.MeshBasicMaterial({
        color: aroma.colorHex,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
      })
    );
    swirl.rotation.x = 0.7;
    g.add(swirl);

    // Soft glowing halo sprite
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.kitchen.glowTex,
        color: aroma.colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      })
    );
    halo.scale.set(1.35, 1.35, 1);
    g.add(halo);

    return g;
  }

  private createSootMesh(): THREE.Group {
    const g = new THREE.Group();
    const sootMat = new THREE.MeshStandardMaterial({
      color: 0x241d24,
      emissive: 0x5c2444,
      emissiveIntensity: 0.65,
      roughness: 0.85,
    });
    const center = new THREE.Mesh(new THREE.DodecahedronGeometry(0.31, 0), sootMat);
    g.add(center);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), sootMat);
      puff.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.18, 0.04);
      g.add(puff);
    }

    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.kitchen.glowTex,
        color: 0x9c456e,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    aura.scale.set(1.25, 1.25, 1);
    g.add(aura);

    return g;
  }

  private spawnWave(): void {
    const track = SUSUNOMI_TRACKS[this.audio.currentTrackId];
    const laneIdx = Math.floor(Math.random() * VENT_LANES.length);
    const laneX = VENT_LANES[laneIdx];

    const isSoot = !this.isFever && Math.random() < track.sootRate;
    if (isSoot) {
      const mesh = this.createSootMesh();
      mesh.position.set(laneX, 5.2, 0.85);
      this.itemGroup.add(mesh);
      this.items.push({
        id: this.nextItemId++,
        kind: 'soot',
        mesh,
        laneIndex: laneIdx,
        baseX: laneX,
        x: laneX,
        y: 5.2,
        z: 0.85,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: 0.22,
        speedMult: 1.08,
        collected: false,
        collectAnim: 0,
      });
      this.kitchen.pulseVent(laneIdx, 0x9c456e);

      // Pair soot with a welcoming aroma in another lane so player always has a fun reward!
      const otherLane = (laneIdx + 1 + Math.floor(Math.random() * (VENT_LANES.length - 1))) % VENT_LANES.length;
      this.spawnAromaAtLane(otherLane, 0.94);
    } else {
      this.spawnAromaAtLane(laneIdx, 1.0);
      if (this.isFever || Math.random() < 0.24) {
        const otherLane = (laneIdx + 2) % VENT_LANES.length;
        this.spawnAromaAtLane(otherLane, 0.9);
      }
    }
  }

  private spawnAromaAtLane(laneIdx: number, speedMult: number): void {
    const aroma = this.pickAromaDef();
    const laneX = VENT_LANES[laneIdx];
    const mesh = this.createAromaMesh(aroma);
    mesh.position.set(laneX, 5.2, 0.85);
    this.itemGroup.add(mesh);
    this.items.push({
      id: this.nextItemId++,
      kind: 'aroma',
      aroma,
      mesh,
      laneIndex: laneIdx,
      baseX: laneX,
      x: laneX,
      y: 5.2,
      z: 0.85,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 0.34,
      speedMult,
      collected: false,
      collectAnim: 0,
    });
    this.kitchen.pulseVent(laneIdx, aroma.colorHex);
  }

  public getComboMultiplier(): number {
    return 1 + Math.min(2.0, this.combo * 0.04);
  }

  private emitSparks(sx: number, sy: number, color: string, count = 12): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 55 + Math.random() * 145;
      this.sparks.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 45,
        size: 2.5 + Math.random() * 4.5,
        color,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.35,
      });
    }
  }

  private emitRing(sx: number, sy: number, maxR: number, color: string): void {
    this.rings.push({ x: sx, y: sy, r: 10, maxR, color, life: 0, maxLife: 0.44 });
  }

  private emitAscendingRibbons(sx: number, sy: number, count = 9): void {
    const colors = ['#ff9a52', '#ffd75e', '#fff0c7', '#ffebad', '#80d8ff'];
    for (let i = 0; i < count; i++) {
      this.ribbons.push({
        x: sx + (Math.random() - 0.5) * 140,
        y: sy,
        vy: -(110 + Math.random() * 120),
        wobble: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
        life: 0,
        maxLife: 1.15 + Math.random() * 0.45,
      });
    }
  }

  public triggerStirBurst(beatPhase: number): boolean {
    if (this.stirCooldown > 0) return false;

    const cd = this.gsm.getStirCooldownSec();
    this.stirCooldown = cd;
    this.cb.onStirCooldownChange(0, false);

    const onBeat = beatPhase < 0.22 || beatPhase > 0.78;
    this.actor.triggerStirBurst();
    this.audio.playStirSE(onBeat);
    this.kitchen.triggerShake(0.11);

    const potPos = this.actor.getPotWorldPosition();
    const screen = this.projectToScreen(potPos);
    const stirR = this.gsm.getStirRadius() * (onBeat ? 1.15 : 1.0);
    this.emitRing(screen.x, screen.y, 130, onBeat ? '#ffebad' : '#ffd080');
    this.emitSparks(screen.x, screen.y, '#ffe099', 16);

    let purified = 0;
    let scooped = 0;

    for (const it of this.items) {
      if (it.collected) continue;
      const dist = Math.hypot(it.x - potPos.x, it.y - potPos.y);
      if (dist <= stirR) {
        if (it.kind === 'soot') {
          it.collected = true;
          purified++;
          this.sessionStats.sootPurified++;
          const pt = this.projectToScreen(it.mesh.position);
          const bonus = Math.round(24 * this.gsm.getDropMultiplier());
          this.gsm.state.drops += bonus;
          this.gsm.state.totalDropsEarned += bonus;
          this.sessionStats.dropsEarned += bonus;
          this.feverCharge = Math.min(100, this.feverCharge + 6);
          this.emitSparks(pt.x, pt.y, '#9ce0ff', 14);
          this.cb.onFloatingText('焦げ浄化!', pt.x, pt.y - 16, '#8ce0ff', `+${bonus} 雫`);
        } else {
          this.collectAroma(it, onBeat);
          scooped++;
        }
      }
    }

    if (purified > 0) {
      this.audio.playSootPurifySE();
    } else if (onBeat) {
      this.cb.onFloatingText('PERFECT STIR!', screen.x, screen.y - 44, '#ffebad', 'リズムかき混ぜ');
    } else if (scooped === 0) {
      this.cb.onFloatingText('ことこと!', screen.x, screen.y - 38, '#ffd48f');
    }

    this.cb.onFeverChange(this.isFever, this.feverCharge, this.feverRemaining);
    this.cb.onStateDirty();
    return true;
  }

  private collectAroma(it: FallingItem, rhythmBoost = false): void {
    if (it.collected || !it.aroma) return;
    it.collected = true;
    const aroma = it.aroma;
    const track = SUSUNOMI_TRACKS[this.audio.currentTrackId];

    this.combo++;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;

    const needed = this.getNextNeededAroma();
    const isMatch = aroma.id === needed || aroma.id === 'starlight';

    const mult =
      this.getComboMultiplier() *
      this.gsm.getDropMultiplier() *
      track.valueMultiplier *
      (this.isFever ? 2.0 : 1.0) *
      (isMatch ? 1.8 : 1.0) *
      (rhythmBoost ? 1.2 : 1.0);

    const earned = Math.max(1, Math.round(aroma.baseValue * mult));
    this.gsm.state.drops += earned;
    this.gsm.state.totalDropsEarned += earned;
    this.sessionStats.caught++;
    this.sessionStats.dropsEarned += earned;

    // Fill Copper Pot simmer gauge
    const cap = this.gsm.getPotCapacity();
    this.gsm.state.potFill = Math.min(cap, this.gsm.state.potFill + (aroma.id === 'starlight' ? 2 : 1));

    // Charge KOTOKOTO FEVER
    if (!this.isFever) {
      this.feverCharge = Math.min(100, this.feverCharge + aroma.feverGain * (isMatch ? 1.45 : 1.0));
      this.cb.onFeverChange(false, this.feverCharge, 0);
    }

    this.actor.triggerCatchPulse(aroma.colorHex);
    this.audio.playCatchSE(this.combo, isMatch, aroma.id === 'starlight');

    const pt = this.projectToScreen(it.mesh.position);
    this.emitSparks(pt.x, pt.y, aroma.cssColor, isMatch ? 18 : 11);
    this.emitRing(pt.x, pt.y, isMatch ? 72 : 44, aroma.cssColor);

    if (isMatch) {
      this.sessionStats.recipeMatches++;
      this.recipeProgress++;
      this.cb.onFloatingText(
        `${aroma.icon} レシピ的中!`,
        pt.x,
        pt.y - 18,
        '#ffebad',
        `+${earned} 雫`
      );
      if (this.recipeProgress >= 3) {
        this.completeActiveRecipe();
      } else {
        this.cb.onRecipeChange(this.getActiveRecipe(), this.recipeProgress);
      }
    } else {
      this.cb.onFloatingText(`${aroma.icon} +${earned}`, pt.x, pt.y - 14, aroma.cssColor, aroma.shortName);
    }

    this.cb.onComboChange(this.combo, this.getComboMultiplier());
    this.cb.onStateDirty();
  }

  private completeActiveRecipe(): void {
    const rec = this.getActiveRecipe();
    const starsEarned = rec.bonusStars + Math.floor(this.gsm.state.upgrades.woodenLadle / 2);
    const bonusDrops = Math.round(rec.bonusDrops * this.gsm.getDropMultiplier() * (this.isFever ? 1.5 : 1));

    this.gsm.state.stars += starsEarned;
    this.gsm.state.drops += bonusDrops;
    this.gsm.state.totalDropsEarned += bonusDrops;
    this.gsm.state.totalDishesServed++;
    this.gsm.state.totalRecipesCompleted++;

    this.sessionStats.recipesCompleted++;
    this.sessionStats.dishesServed++;
    this.sessionStats.starsEarned += starsEarned;
    this.sessionStats.dropsEarned += bonusDrops;

    if (!this.isFever) {
      this.feverCharge = Math.min(100, this.feverCharge + 16);
      this.cb.onFeverChange(false, this.feverCharge, 0);
    }

    this.audio.playDishCompleteSE();
    this.kitchen.triggerShake(0.18);
    this.actor.triggerStirBurst();

    const potScreen = this.projectToScreen(this.actor.getPotWorldPosition());
    this.emitAscendingRibbons(potScreen.x, potScreen.y, 14);
    this.emitRing(potScreen.x, potScreen.y, 165, '#ffe8a3');
    this.cb.onFloatingText(
      `✨ ${rec.name} 完成!`,
      potScreen.x,
      potScreen.y - 54,
      '#fff0b5',
      `+${starsEarned} 記憶の星 / +${bonusDrops} 雫`
    );

    this.cb.onDishServed(rec.name, rec.residentThought, starsEarned, this.gsm.state.totalDishesServed);

    // Advance to next Memory Recipe
    this.activeRecipeIndex = (this.activeRecipeIndex + 1) % MEMORY_RECIPES.length;
    this.recipeProgress = 0;
    this.cb.onRecipeChange(this.getActiveRecipe(), 0);
    this.gsm.save();
    this.cb.onStateDirty();
  }

  public serveSimmeredPot(): boolean {
    const cap = this.gsm.getPotCapacity();
    if (this.gsm.state.potFill < cap) return false;

    this.gsm.state.potFill = 0;
    const starsEarned = this.gsm.getStarsPerDish();
    const bonusDrops = Math.round(60 * this.gsm.getDropMultiplier());

    this.gsm.state.stars += starsEarned;
    this.gsm.state.drops += bonusDrops;
    this.gsm.state.totalDropsEarned += bonusDrops;
    this.gsm.state.totalDishesServed++;

    this.sessionStats.dishesServed++;
    this.sessionStats.starsEarned += starsEarned;
    this.sessionStats.dropsEarned += bonusDrops;

    this.audio.playDishCompleteSE();
    this.kitchen.triggerShake(0.16);
    this.actor.triggerStirBurst();

    const potScreen = this.projectToScreen(this.actor.getPotWorldPosition());
    this.emitAscendingRibbons(potScreen.x, potScreen.y, 12);
    this.emitRing(potScreen.x, potScreen.y, 150, '#ffd485');
    this.cb.onFloatingText(
      `🍲 ことこと記憶鍋 届けました!`,
      potScreen.x,
      potScreen.y - 48,
      '#ffe8a8',
      `+${starsEarned} 記憶の星`
    );

    this.cb.onDishServed(
      'ことこと記憶煮込み',
      '「換気口のむこうへ、あたたかい香りが届きました」',
      starsEarned,
      this.gsm.state.totalDishesServed
    );
    this.gsm.save();
    this.cb.onStateDirty();
    return true;
  }

  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;

    this.isFever = true;
    this.feverCharge = 0;
    this.feverRemaining = this.gsm.getFeverDurationSec();
    this.prevTrackLoop = false;
    this.audio.setCurrentTrackLoop(true);
    this.audio.playFeverStartSE();
    this.kitchen.triggerShake(0.2);

    // Transform all current Burnt Soot into sparkling Starlight Memory Aromas!
    for (const it of this.items) {
      if (it.kind === 'soot' && !it.collected) {
        it.kind = 'aroma';
        it.aroma = AROMA_MAP.starlight;
        const pos = it.mesh.position.clone();
        this.itemGroup.remove(it.mesh);
        it.mesh = this.createAromaMesh(AROMA_MAP.starlight);
        it.mesh.position.copy(pos);
        this.itemGroup.add(it.mesh);
        const pt = this.projectToScreen(pos);
        this.emitSparks(pt.x, pt.y, '#ffebad', 12);
      }
    }

    const potScreen = this.projectToScreen(this.actor.getPotWorldPosition());
    this.emitAscendingRibbons(potScreen.x, potScreen.y, 16);
    this.cb.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private handleSootHit(it: FallingItem): void {
    it.collected = true;
    const pt = this.projectToScreen(it.mesh.position);

    if (this.isFever) {
      this.emitSparks(pt.x, pt.y, '#ffebad', 10);
      return;
    }

    if (this.shieldsRemaining > 0) {
      this.shieldsRemaining--;
      this.sessionStats.sootPurified++;
      this.audio.playSootHitSE(true);
      this.emitSparks(pt.x, pt.y, '#80d8ff', 16);
      this.cb.onShieldChange(this.shieldsRemaining);
      this.cb.onFloatingText('換気ガード!', pt.x, pt.y - 18, '#8ce0ff', '焦げ煙を吹き飛ばした');
      return;
    }

    this.sessionStats.sootHits++;
    this.combo = 0;
    this.audio.playSootHitSE(false);
    this.actor.triggerHitFlash();
    this.kitchen.triggerShake(0.22);
    this.emitSparks(pt.x, pt.y, '#c96b96', 14);
    this.cb.onComboChange(0, 1);
    this.cb.onFloatingText('焦げ煙…!', pt.x, pt.y - 18, '#ef9bb8', 'コンボリセット');
  }

  public update(
    elapsed: number,
    dt: number,
    beatFloat: number,
    active: boolean
  ): void {
    const track = SUSUNOMI_TRACKS[this.audio.currentTrackId];

    // Stir cooldown recovery
    if (this.stirCooldown > 0) {
      const maxCd = this.gsm.getStirCooldownSec();
      this.stirCooldown = Math.max(0, this.stirCooldown - dt);
      const pct = Math.min(1, 1 - this.stirCooldown / maxCd);
      this.cb.onStirCooldownChange(pct, this.stirCooldown <= 0);
    }

    // KOTOKOTO FEVER countdown
    if (this.isFever && active) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      this.cb.onFeverChange(true, (this.feverRemaining / this.gsm.getFeverDurationSec()) * 100, this.feverRemaining);
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.audio.setCurrentTrackLoop(this.prevTrackLoop);
        this.cb.onFeverChange(false, this.feverCharge, 0);
      }
    }

    // Musical beat-synced spawning + passive spiceShelf aroma resonance
    if (active) {
      const spawnCursor = Math.floor(beatFloat / track.spawnEveryBeats);
      if (spawnCursor > this.lastSpawnBeat) {
        this.lastSpawnBeat = spawnCursor;
        this.spawnWave();
      }

      const passiveCursor = Math.floor(beatFloat / 4);
      if (passiveCursor > this.lastPassiveBeat) {
        this.lastPassiveBeat = passiveCursor;
        const shelfLv = this.gsm.state.upgrades.spiceShelf;
        if (shelfLv > 0) {
          const autoDrops = shelfLv * 9;
          this.gsm.state.drops += autoDrops;
          this.gsm.state.totalDropsEarned += autoDrops;
          this.sessionStats.dropsEarned += autoDrops;
          this.cb.onStateDirty();
        }
      }
    }

    // Update falling aromas & burnt soot
    const potPos = this.actor.getPotWorldPosition();
    const catchR = this.gsm.getCatchRadius() * (this.isFever ? 1.48 : 1.0);
    const magnetPullR = catchR + (this.isFever ? 2.4 : 0.72);
    const fallSpeed = track.fallSpeed * (this.isFever ? 1.15 : 1.0);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.collected) {
        it.collectAnim += dt * 7;
        it.mesh.position.lerp(potPos, Math.min(1, dt * 18));
        const sc = Math.max(0.01, 1 - it.collectAnim);
        it.mesh.scale.setScalar(sc);
        if (it.collectAnim >= 1) {
          this.itemGroup.remove(it.mesh);
          this.items.splice(i, 1);
        }
        continue;
      }

      it.y -= fallSpeed * it.speedMult * dt;
      it.swayPhase += dt * 2.4;
      const swayX = it.baseX + Math.sin(it.swayPhase) * it.swayAmp;

      // Gentle magnetic aroma pull toward the Copper Pot!
      const dx = potPos.x - it.x;
      const dy = potPos.y - it.y;
      const dist = Math.hypot(dx, dy);

      if (it.kind === 'aroma' && dist < magnetPullR && it.y < 3.6) {
        const pullStrength = this.isFever ? 10.5 : 6.2;
        it.x += dx * Math.min(1, dt * pullStrength);
        it.y += dy * Math.min(1, dt * pullStrength * 0.55);
      } else {
        it.x += (swayX - it.x) * Math.min(1, dt * 4);
      }

      it.x = THREE.MathUtils.clamp(it.x, -COUNTER_HALF_WIDTH - 0.2, COUNTER_HALF_WIDTH + 0.2);
      it.mesh.position.set(it.x, it.y, it.z);
      it.mesh.rotation.y += dt * (it.kind === 'aroma' ? 1.8 : 2.6);
      it.mesh.rotation.z = Math.sin(elapsed * 3 + it.id) * 0.25;

      // Check collision with Copper Pot
      const hitDist = Math.hypot(it.x - potPos.x, it.y - potPos.y);
      if (active) {
        if (it.kind === 'aroma' && hitDist <= catchR) {
          this.collectAroma(it, false);
          continue;
        }
        if (it.kind === 'soot' && hitDist <= 0.72) {
          this.handleSootHit(it);
          continue;
        }
      }

      // Expired below counter
      if (it.y < -0.65) {
        this.itemGroup.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }

    this.drawFx(dt, active);
  }

  private drawFx(dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxWidth, this.fxHeight);

    // Subtle warm golden morning glow frame during KOTOKOTO FEVER
    if (this.isFever) {
      const grad = ctx.createRadialGradient(
        this.fxWidth * 0.5,
        this.fxHeight * 0.45,
        this.fxWidth * 0.18,
        this.fxWidth * 0.5,
        this.fxHeight * 0.5,
        this.fxWidth * 0.65
      );
      grad.addColorStop(0, 'rgba(255, 224, 150, 0)');
      grad.addColorStop(1, 'rgba(255, 196, 98, 0.22)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.fxWidth, this.fxHeight);
    }

    // Crisp icon badges on active falling aromas & soot so recipes are instantly readable!
    if (active) {
      const neededId = this.getNextNeededAroma();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const it of this.items) {
        if (it.collected || it.y > 5.0 || it.y < 0.2) continue;
        const pt = this.projectToScreen(it.mesh.position);
        if (it.kind === 'aroma' && it.aroma) {
          const isNeeded = it.aroma.id === neededId;
          if (isNeeded) {
            // Golden recipe target halo ring
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 236, 158, 0.92)';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          ctx.font = isNeeded ? '22px sans-serif' : '18px sans-serif';
          ctx.fillText(it.aroma.icon, pt.x, pt.y + 1);
        } else if (it.kind === 'soot') {
          ctx.font = '18px sans-serif';
          ctx.fillText('💨', pt.x, pt.y + 1);
        }
      }
    }

    // Expanding rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.maxLife) {
        this.rings.splice(i, 1);
        continue;
      }
      const p = r.life / r.maxLife;
      const rad = r.r + (r.maxR - r.r) * (1 - Math.pow(1 - p, 2));
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.78;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3.2 * (1 - p * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Ascending Memory Steam Ribbons
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const rb = this.ribbons[i];
      rb.life += dt;
      if (rb.life >= rb.maxLife) {
        this.ribbons.splice(i, 1);
        continue;
      }
      rb.y += rb.vy * dt;
      rb.wobble += dt * 7;
      const p = rb.life / rb.maxLife;
      const rx = rb.x + Math.sin(rb.wobble) * 18;
      ctx.save();
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
      ctx.fillStyle = rb.color;
      ctx.beginPath();
      ctx.arc(rx, rb.y, 5 + (1 - p) * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      const p = s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
