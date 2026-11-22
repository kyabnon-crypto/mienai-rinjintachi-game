import * as THREE from 'three';
import { TokitsugiAudioEngine } from './audioEngine';
import {
  BROKEN_TIME_ORDERS,
  CLOCK_RADIUS,
  CLOCK_SLOTS,
  FRAGMENT_LIST,
  FRAGMENT_MAP,
  TOKITSUGI_TRACKS,
} from './config';
import { TokitsugiStateManager } from './state';
import { TokitsugiActor } from './tokitsugiActor';
import { BrokenTimeOrderDef, FragmentId, TokitsugiRunStats } from './types';
import { WorkshopScene } from './workshopScene';

interface ClockNode {
  id: number;
  slotIndex: number;
  slotAngle: number;
  fragmentId: FragmentId | null;
  isRift: boolean;
  pairId: number | null;
  pairOrder: 0 | 1;
  mesh: THREE.Group;
  coreMesh: THREE.Mesh;
  approachRing: THREE.Mesh;
  glowSprite: THREE.Sprite;
  spawnBeat: number;
  targetPassBeat: number;
  age: number;
  stitched: boolean;
  expired: boolean;
  passedOnce: boolean;
}

interface GoldenThreadArc {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface PairGuideLine {
  pairId: number;
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  slotA: number;
  slotB: number;
  firstStitched: boolean;
  firstWorldPos: THREE.Vector3;
}

interface FxBurst {
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

export interface ClockworkCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onOrderChange: (order: BrokenTimeOrderDef, filled: [boolean, boolean, boolean]) => void;
  onWatchMended: (title: string, message: string, miraclesEarned: number) => void;
  onFeverChange: (active: boolean, pct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
  onRewindCooldownChange: (pct: number, ready: boolean) => void;
}

function shortestAngleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function forwardAngleDistance(fromAngle: number, toAngle: number): number {
  let d = (toAngle - fromAngle) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d;
}

export class ClockworkSystem {
  private workshop: WorkshopScene;
  private actor: TokitsugiActor;
  private audio: TokitsugiAudioEngine;
  private gsm: TokitsugiStateManager;
  private callbacks: ClockworkCallbacks;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private viewWidth = 1280;
  private viewHeight = 720;

  private nodeLayer = new THREE.Group();
  private threadLayer = new THREE.Group();
  private nodes: ClockNode[] = [];
  private threads: GoldenThreadArc[] = [];
  private pairGuides: PairGuideLine[] = [];
  private nextNodeId = 1;
  private nextPairId = 1;

  private fxBursts: FxBurst[] = [];
  private fxSparks: FxSpark[] = [];

  public combo = 0;
  public isFever = false;
  public feverCharge = 0;
  public feverRemaining = 0;
  public shieldsRemaining = 0;
  public rewindCooldown = 0;

  public currentHandAngle = 0;
  private rewindVisualOffset = 0;
  private lastSpawnBeat = -10;
  private lastResonanceBeat = -1;

  private currentOrder: BrokenTimeOrderDef = BROKEN_TIME_ORDERS[0];
  private orderFilled: [boolean, boolean, boolean] = [false, false, false];
  private orderCursor = 0;

  public sessionStats: TokitsugiRunStats = this.createEmptyStats();

  constructor(
    workshop: WorkshopScene,
    actor: TokitsugiActor,
    audio: TokitsugiAudioEngine,
    gsm: TokitsugiStateManager,
    fxCanvas: HTMLCanvasElement,
    callbacks: ClockworkCallbacks
  ) {
    this.workshop = workshop;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.workshop.watchGroup.add(this.nodeLayer);
    this.workshop.worldGroup.add(this.threadLayer);
  }

  private createEmptyStats(): TokitsugiRunStats {
    return {
      stitched: 0,
      perfects: 0,
      linksCompleted: 0,
      ordersCompleted: 0,
      watchesMended: 0,
      riftsPurified: 0,
      riftHits: 0,
      maxCombo: 0,
      sandsEarned: 0,
      miraclesEarned: 0,
    };
  }

  public resizeFx(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.width = Math.round(this.viewWidth * dpr);
    this.fxCanvas.height = Math.round(this.viewHeight * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public resetSession(pickNewOrder: boolean): void {
    this.clearAllNodes();
    this.clearAllThreads();
    this.fxBursts = [];
    this.fxSparks = [];

    this.combo = 0;
    this.isFever = false;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.rewindCooldown = 0;
    this.rewindVisualOffset = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.sessionStats = this.createEmptyStats();

    if (pickNewOrder) {
      this.orderCursor = Math.floor(Math.random() * BROKEN_TIME_ORDERS.length);
      this.currentOrder = BROKEN_TIME_ORDERS[this.orderCursor];
      this.orderFilled = [false, false, false];
    }

    this.callbacks.onComboChange(0, 1);
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled] as [boolean, boolean, boolean]);
    this.callbacks.onFeverChange(false, 0, 0);
    this.callbacks.onShieldChange(this.shieldsRemaining);
    this.callbacks.onRewindCooldownChange(1, true);
  }

  public resetBeatCursors(beatFloat: number): void {
    this.lastSpawnBeat = beatFloat - 0.6;
    this.lastResonanceBeat = Math.floor(beatFloat / 4);
  }

  private clearAllNodes(): void {
    for (const n of this.nodes) {
      this.nodeLayer.remove(n.mesh);
    }
    this.nodes = [];
    for (const pg of this.pairGuides) {
      this.nodeLayer.remove(pg.line);
      pg.line.geometry.dispose();
      pg.mat.dispose();
    }
    this.pairGuides = [];
  }

  private clearAllThreads(): void {
    for (const t of this.threads) {
      this.threadLayer.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mat.dispose();
    }
    this.threads = [];
  }

  private getComboMultiplier(): number {
    return 1 + Math.min(2.2, this.combo * 0.045);
  }

  private pickWeightedFragment(): FragmentId {
    // Boost needed order ingredients slightly so completing broken-time orders feels snappy & rewarding
    const needed: FragmentId[] = [];
    this.currentOrder.fragments.forEach((fid, idx) => {
      if (!this.orderFilled[idx]) needed.push(fid);
    });
    if (needed.length > 0 && Math.random() < 0.48) {
      return needed[Math.floor(Math.random() * needed.length)];
    }

    const dreamBonus = this.gsm.state.upgrades.hourglass * 5;
    let total = 0;
    const weights = FRAGMENT_LIST.map((f) => {
      const w = f.id === 'dream' ? f.weight + dreamBonus : f.weight;
      total += w;
      return { id: f.id, w };
    });
    let r = Math.random() * total;
    for (const item of weights) {
      r -= item.w;
      if (r <= 0) return item.id;
    }
    return 'photo';
  }

  private buildFragmentMesh(fragmentId: FragmentId | null, isRift: boolean): {
    group: THREE.Group;
    core: THREE.Mesh;
    approachRing: THREE.Mesh;
    glow: THREE.Sprite;
  } {
    const group = new THREE.Group();
    let coreGeo: THREE.BufferGeometry;
    let colorHex = 0xffd27a;
    let emissiveHex = 0xd99b26;

    if (isRift) {
      coreGeo = new THREE.IcosahedronGeometry(0.26, 0);
      colorHex = 0x5c3a6e;
      emissiveHex = 0x8a2c5a;
    } else {
      const def = FRAGMENT_MAP[fragmentId || 'photo'];
      colorHex = def.colorHex;
      emissiveHex = def.emissiveHex;
      switch (fragmentId) {
        case 'photo':
          coreGeo = new THREE.BoxGeometry(0.32, 0.08, 0.38);
          break;
        case 'word':
          coreGeo = new THREE.OctahedronGeometry(0.24, 0);
          break;
        case 'timing':
          coreGeo = new THREE.TorusGeometry(0.21, 0.075, 8, 16);
          break;
        case 'promise':
          coreGeo = new THREE.DodecahedronGeometry(0.23, 0);
          break;
        case 'dream':
        default:
          coreGeo = new THREE.OctahedronGeometry(0.28, 1);
          break;
      }
    }

    const coreMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: emissiveHex,
      emissiveIntensity: isRift ? 0.9 : 1.05,
      roughness: isRift ? 0.6 : 0.22,
      metalness: isRift ? 0.25 : 0.55,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    if (fragmentId === 'timing') {
      core.rotation.x = Math.PI / 2;
    }
    core.castShadow = true;
    group.add(core);

    // Approach timing ring that shrinks smoothly as the golden clock hand nears this slot
    const approachRing = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.33, 28),
      new THREE.MeshBasicMaterial({
        color: isRift ? 0xff5a8a : colorHex,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    approachRing.rotation.x = -Math.PI / 2;
    approachRing.position.y = -0.06;
    group.add(approachRing);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.workshop.glowTex,
        color: isRift ? 0xc2488a : colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: isRift ? 0.65 : 0.85,
        depthWrite: false,
      })
    );
    glow.scale.set(isRift ? 0.95 : 1.05, isRift ? 0.95 : 1.05, 1);
    group.add(glow);

    return { group, core, approachRing, glow };
  }

  private isSlotOccupied(slotIndex: number): boolean {
    return this.nodes.some((n) => !n.stitched && !n.expired && n.slotIndex === slotIndex);
  }

  private spawnNodeAtSlot(
    slotIndex: number,
    beatFloat: number,
    fragmentId: FragmentId | null,
    isRift: boolean,
    pairId: number | null = null,
    pairOrder: 0 | 1 = 0
  ): ClockNode | null {
    if (this.isSlotOccupied(slotIndex)) return null;

    const slotAngle = (slotIndex / CLOCK_SLOTS) * Math.PI * 2;
    const { group, core, approachRing, glow } = this.buildFragmentMesh(fragmentId, isRift);
    const localPos = this.workshop.getSlotLocalPosition(slotIndex, 0.24);
    group.position.copy(localPos);
    group.scale.setScalar(0.01);
    this.nodeLayer.add(group);

    const track = TOKITSUGI_TRACKS[this.audio.currentTrackId];
    const distRad = forwardAngleDistance(this.currentHandAngle, slotAngle);
    const beatsUntilPass = (distRad / (Math.PI * 2)) * track.beatsPerRevolution;

    const node: ClockNode = {
      id: this.nextNodeId++,
      slotIndex,
      slotAngle,
      fragmentId,
      isRift,
      pairId,
      pairOrder,
      mesh: group,
      coreMesh: core,
      approachRing,
      glowSprite: glow,
      spawnBeat: beatFloat,
      targetPassBeat: beatFloat + Math.max(1.2, beatsUntilPass),
      age: 0,
      stitched: false,
      expired: false,
      passedOnce: false,
    };
    this.nodes.push(node);
    return node;
  }

  private spawnBeatWave(beatFloat: number): void {
    const activeCount = this.nodes.filter((n) => !n.stitched && !n.expired).length;
    if (activeCount >= 6) return;

    const track = TOKITSUGI_TRACKS[this.audio.currentTrackId];
    const handSlot = Math.floor((this.currentHandAngle / (Math.PI * 2)) * CLOCK_SLOTS) % CLOCK_SLOTS;

    // Place 3..5 slots ahead of the moving golden hand so the player always has clean sightlines
    const aheadOffset = 3 + Math.floor(Math.random() * 3);
    const primarySlot = (handSlot + aheadOffset) % CLOCK_SLOTS;

    if (this.isSlotOccupied(primarySlot)) return;

    // During Golden Hour, never spawn rifts — spawn luminous golden fragments & dream star-sand
    if (!this.isFever && Math.random() < track.riftRate) {
      this.spawnNodeAtSlot(primarySlot, beatFloat, null, true);
      return;
    }

    const fid = this.isFever && Math.random() < 0.35 ? 'dream' : this.pickWeightedFragment();

    // Chance to spawn a "Missed Timing Pair" (two linked fragments 2 slots apart!)
    const secondarySlot = (primarySlot + 2) % CLOCK_SLOTS;
    if (Math.random() < track.pairRate && !this.isSlotOccupied(secondarySlot) && activeCount <= 4) {
      const pairId = this.nextPairId++;
      const n1 = this.spawnNodeAtSlot(primarySlot, beatFloat, fid, false, pairId, 0);
      const fid2 = Math.random() < 0.55 ? fid : this.pickWeightedFragment();
      const n2 = this.spawnNodeAtSlot(secondarySlot, beatFloat, fid2, false, pairId, 1);

      if (n1 && n2) {
        const p1 = this.workshop.getSlotLocalPosition(primarySlot, 0.22);
        const p2 = this.workshop.getSlotLocalPosition(secondarySlot, 0.22);
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        mid.y += 0.28;
        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const pts = curve.getPoints(18);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: 0xffe28c,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
        });
        const line = new THREE.Line(geo, mat);
        this.nodeLayer.add(line);

        this.pairGuides.push({
          pairId,
          line,
          mat,
          slotA: primarySlot,
          slotB: secondarySlot,
          firstStitched: false,
          firstWorldPos: this.workshop.getSlotWorldPosition(primarySlot, 0.24),
        });
      }
      return;
    }

    this.spawnNodeAtSlot(primarySlot, beatFloat, fid, false);
  }

  private spawnGoldenThreadArc(fromWorld: THREE.Vector3, toWorld: THREE.Vector3, colorHex = 0xffe28c, thickness = 0.032): void {
    const mid = fromWorld.clone().add(toWorld).multiplyScalar(0.5);
    mid.y += 0.55 + fromWorld.distanceTo(toWorld) * 0.14;
    const curve = new THREE.QuadraticBezierCurve3(fromWorld, mid, toWorld);
    const geo = new THREE.TubeGeometry(curve, 20, thickness, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.threadLayer.add(mesh);
    this.threads.push({ mesh, mat, life: 0.65, maxLife: 0.65 });
  }

  private spawnFxBurst(worldPos: THREE.Vector3, color: string, maxRadius = 64, sparkCount = 12): void {
    const pt = this.workshop.projectToScreen(worldPos, this.viewWidth, this.viewHeight);
    this.fxBursts.push({
      x: pt.x,
      y: pt.y,
      radius: 10,
      maxRadius,
      color,
      alpha: 0.95,
      lineWidth: 3.2,
    });

    for (let i = 0; i < sparkCount; i++) {
      const a = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 75 + Math.random() * 145;
      this.fxSparks.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 24,
        size: 2.2 + Math.random() * 3.0,
        color,
        life: 0.42 + Math.random() * 0.3,
        maxLife: 0.72,
      });
    }
  }

  /**
   * Main player action: tap/click anywhere or press Space/Enter.
   * Supports BOTH direct-node tap (gentle & intuitive) AND golden-hand rhythm alignment!
   */
  public triggerStitchInput(virtualX?: number, virtualY?: number): void {
    const candidates = this.nodes.filter((n) => !n.stitched && !n.expired);
    if (candidates.length === 0) {
      this.audio.playSoftMissTick();
      return;
    }

    const perfectRad = this.gsm.getPerfectAngleRad() * (this.isFever ? 1.55 : 1.0);
    const goodRad = this.gsm.getGoodAngleRad() * (this.isFever ? 1.7 : 1.0);

    // 1. Check if player directly tapped a visible fragment node on screen
    if (typeof virtualX === 'number' && typeof virtualY === 'number') {
      let bestDirect: ClockNode | null = null;
      let bestDistPx = 68; // generous touch hit target in virtual pixels
      for (const n of candidates) {
        const wpos = this.workshop.getSlotWorldPosition(n.slotIndex, 0.24);
        const spt = this.workshop.projectToScreen(wpos, this.viewWidth, this.viewHeight);
        const dist = Math.hypot(spt.x - virtualX, spt.y - virtualY);
        if (dist < bestDistPx) {
          bestDistPx = dist;
          bestDirect = n;
        }
      }

      if (bestDirect) {
        if (bestDirect.isRift) {
          // Friendly nudge rather than punishing accidental direct taps on a rift
          const wpos = this.workshop.getSlotWorldPosition(bestDirect.slotIndex, 0.28);
          const spt = this.workshop.projectToScreen(wpos, this.viewWidth, this.viewHeight);
          this.audio.playSoftMissTick();
          this.callbacks.onFloatingText('ほころび！', spt.x, spt.y - 16, '#ff8eb8', '🧵巻き戻しで浄化');
          return;
        }
        const angleErr = Math.abs(shortestAngleDiff(this.currentHandAngle, bestDirect.slotAngle));
        const grade = angleErr <= perfectRad ? 'PERFECT' : angleErr <= goodRad ? 'GOOD' : 'STITCH';
        this.completeStitch(bestDirect, grade);
        return;
      }
    }

    // 2. Hand-alignment rhythm match (Space / Enter / tap anywhere on clock face)
    let bestHandNode: ClockNode | null = null;
    let bestErr = Infinity;
    for (const n of candidates) {
      if (n.isRift) continue;
      const err = Math.abs(shortestAngleDiff(this.currentHandAngle, n.slotAngle));
      if (err < bestErr) {
        bestErr = err;
        bestHandNode = n;
      }
    }

    const timingWindow = goodRad * (this.isFever ? 1.65 : 1.35);
    if (bestHandNode && bestErr <= timingWindow) {
      const grade = bestErr <= perfectRad ? 'PERFECT' : 'GOOD';
      this.completeStitch(bestHandNode, grade);
      return;
    }

    // Soft tick feedback if tapped between notes (does not break combo unfairly)
    this.audio.playSoftMissTick();
    if (typeof virtualX === 'number' && typeof virtualY === 'number') {
      this.fxBursts.push({
        x: virtualX,
        y: virtualY,
        radius: 6,
        maxRadius: 34,
        color: 'rgba(255, 224, 150, 0.5)',
        alpha: 0.55,
        lineWidth: 2,
      });
    }
  }

  private completeStitch(node: ClockNode, grade: 'PERFECT' | 'GOOD' | 'STITCH' | 'REWIND'): void {
    node.stitched = true;
    this.nodeLayer.remove(node.mesh);

    const fid = node.fragmentId || 'photo';
    const def = FRAGMENT_MAP[fid];
    const worldPos = this.workshop.getSlotWorldPosition(node.slotIndex, 0.24);
    const centerWorld = this.workshop.watchGroup.localToWorld(new THREE.Vector3(0, 0.22, 0));
    const needleOrigin = this.actor.getStitchOriginWorld(new THREE.Vector3());

    // 3D golden thread shooting from Tokitsugi's needle -> fragment -> watch axis!
    this.spawnGoldenThreadArc(needleOrigin, worldPos, def.colorHex, grade === 'PERFECT' ? 0.042 : 0.03);
    this.spawnGoldenThreadArc(worldPos, centerWorld, 0xffe8a3, 0.028);

    this.combo += 1;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;

    this.sessionStats.stitched += 1;
    if (grade === 'PERFECT') this.sessionStats.perfects += 1;

    const trackMult = TOKITSUGI_TRACKS[this.audio.currentTrackId].valueMultiplier;
    const gradeMult = grade === 'PERFECT' ? 1.45 : grade === 'GOOD' ? 1.15 : grade === 'REWIND' ? 1.25 : 0.92;
    const feverMult = this.isFever ? 2.0 : 1.0;
    const sandGain = Math.max(
      1,
      Math.round(def.baseValue * this.gsm.getSandMultiplier() * trackMult * this.getComboMultiplier() * gradeMult * feverMult)
    );

    this.gsm.state.sands += sandGain;
    this.gsm.state.totalSandsEarned += sandGain;
    this.sessionStats.sandsEarned += sandGain;

    // Fill pocket-watch mainspring (0..12)
    const cap = this.gsm.getWatchCapacity();
    if (this.gsm.state.watchFill < cap) {
      this.gsm.state.watchFill = Math.min(cap, this.gsm.state.watchFill + 1);
    }

    // Charge GOLDEN HOUR gauge
    if (!this.isFever) {
      const fGain = def.feverGain * (grade === 'PERFECT' ? 1.25 : 1.0);
      this.feverCharge = Math.min(100, this.feverCharge + fGain);
      this.callbacks.onFeverChange(false, this.feverCharge, 0);
    }

    // Pair Thread Link check
    let linkTriggered = false;
    if (node.pairId !== null) {
      const pgIdx = this.pairGuides.findIndex((p) => p.pairId === node.pairId);
      if (pgIdx >= 0) {
        const pg = this.pairGuides[pgIdx];
        if (!pg.firstStitched) {
          pg.firstStitched = true;
          pg.firstWorldPos.copy(worldPos);
          pg.mat.color.setHex(0xfff4bd);
          pg.mat.opacity = 0.95;
        } else {
          // Completed the pair! Draw luminous golden bridge between the two moments!
          linkTriggered = true;
          this.sessionStats.linksCompleted += 1;
          this.spawnGoldenThreadArc(pg.firstWorldPos, worldPos, 0xfff3ba, 0.052);
          this.nodeLayer.remove(pg.line);
          pg.line.geometry.dispose();
          pg.mat.dispose();
          this.pairGuides.splice(pgIdx, 1);

          const linkBonus = Math.round(45 * this.gsm.getSandMultiplier() * (this.isFever ? 2 : 1));
          this.gsm.state.sands += linkBonus;
          this.gsm.state.totalSandsEarned += linkBonus;
          this.sessionStats.sandsEarned += linkBonus;
          if (!this.isFever) {
            this.feverCharge = Math.min(100, this.feverCharge + 10);
            this.callbacks.onFeverChange(false, this.feverCharge, 0);
          }
          this.audio.playLinkSE();
        }
      }
    }

    // Broken-time Order slot match (dream star-sand acts as a universal wildcard!)
    let orderMatched = false;
    for (let i = 0; i < 3; i++) {
      if (!this.orderFilled[i] && (this.currentOrder.fragments[i] === fid || fid === 'dream')) {
        this.orderFilled[i] = true;
        orderMatched = true;
        break;
      }
    }

    this.actor.onStitch(worldPos.x, grade === 'PERFECT' || linkTriggered);
    this.audio.playStitchSE(this.combo, grade === 'PERFECT', fid === 'dream');
    this.spawnFxBurst(worldPos, def.cssColor, grade === 'PERFECT' ? 78 : 58, grade === 'PERFECT' ? 16 : 10);

    const screenPt = this.workshop.projectToScreen(worldPos, this.viewWidth, this.viewHeight);
    const label = linkTriggered
      ? 'TIME LINK!!'
      : grade === 'PERFECT'
        ? 'PERFECT!'
        : grade === 'REWIND'
          ? 'REWIND!'
          : grade === 'GOOD'
            ? 'GOOD!'
            : 'STITCH';
    const sub = `+${sandGain} 砂${orderMatched ? ' ・ 依頼一致!' : ''}`;
    this.callbacks.onFloatingText(
      label,
      screenPt.x,
      screenPt.y - 18,
      linkTriggered ? '#fff4bd' : grade === 'PERFECT' ? '#ffe082' : def.cssColor,
      sub
    );

    if (orderMatched) {
      this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled] as [boolean, boolean, boolean]);
      if (this.orderFilled[0] && this.orderFilled[1] && this.orderFilled[2]) {
        this.completeCurrentOrder();
      }
    }

    this.callbacks.onComboChange(this.combo, this.getComboMultiplier());
    this.callbacks.onStateDirty();
  }

  private completeCurrentOrder(): void {
    const order = this.currentOrder;
    const bonusSands = Math.round(order.bonusSands * this.gsm.getSandMultiplier() * (this.isFever ? 1.5 : 1));
    const bonusMiracles = order.bonusMiracles + Math.floor(this.gsm.state.upgrades.goldenThread / 2);

    this.gsm.state.sands += bonusSands;
    this.gsm.state.totalSandsEarned += bonusSands;
    this.gsm.state.miracles += bonusMiracles;
    this.gsm.state.totalOrdersCompleted += 1;
    this.gsm.state.totalWatchesMended += 1;

    this.sessionStats.sandsEarned += bonusSands;
    this.sessionStats.miraclesEarned += bonusMiracles;
    this.sessionStats.ordersCompleted += 1;
    this.sessionStats.watchesMended += 1;

    this.workshop.triggerMendFlash();
    this.actor.onCelebrate();
    this.audio.playOrderCompleteSE();

    const centerWorld = this.workshop.watchGroup.localToWorld(new THREE.Vector3(0, 0.35, 0));
    this.spawnFxBurst(centerWorld, '#9ce2ff', 140, 26);
    const spt = this.workshop.projectToScreen(centerWorld, this.viewWidth, this.viewHeight);
    this.callbacks.onFloatingText('TIME MENDED!!', spt.x, spt.y - 36, '#9ce2ff', `${order.name} 修繕完了!`);
    this.callbacks.onWatchMended(order.name, order.miracleMessage, bonusMiracles);

    // Advance to next broken-time order
    this.orderCursor = (this.orderCursor + 1) % BROKEN_TIME_ORDERS.length;
    this.currentOrder = BROKEN_TIME_ORDERS[this.orderCursor];
    this.orderFilled = [false, false, false];
    this.callbacks.onOrderChange(this.currentOrder, [...this.orderFilled] as [boolean, boolean, boolean]);
    this.callbacks.onStateDirty();
  }

  /** Wind the full pocket-watch mainspring & return it to its owner */
  public windAndSendWatch(): boolean {
    const cap = this.gsm.getWatchCapacity();
    if (this.gsm.state.watchFill < cap) return false;

    this.gsm.state.watchFill = 0;
    const miraclesEarned = this.gsm.getMiraclesPerWatch();
    const bonusSands = Math.round(110 * this.gsm.getSandMultiplier());

    this.gsm.state.miracles += miraclesEarned;
    this.gsm.state.sands += bonusSands;
    this.gsm.state.totalSandsEarned += bonusSands;
    this.gsm.state.totalWatchesMended += 1;

    this.sessionStats.miraclesEarned += miraclesEarned;
    this.sessionStats.sandsEarned += bonusSands;
    this.sessionStats.watchesMended += 1;

    this.workshop.triggerMendFlash();
    this.actor.onCelebrate();
    this.audio.playWatchMendedSE();

    const centerWorld = this.workshop.watchGroup.localToWorld(new THREE.Vector3(0, 0.3, 0));
    this.spawnFxBurst(centerWorld, '#ffe49c', 155, 28);
    const spt = this.workshop.projectToScreen(centerWorld, this.viewWidth, this.viewHeight);
    this.callbacks.onFloatingText(
      '懐中時計が動き出した！',
      spt.x,
      spt.y - 44,
      '#ffe598',
      `+${miraclesEarned} 小さな奇跡 / +${bonusSands} 砂`
    );
    this.callbacks.onWatchMended(
      'ぜんまい仕上げの懐中時計',
      '「大丈夫、ちゃんと届いてるよ。」— 止まっていた時間が再び時を刻みはじめた',
      miraclesEarned
    );
    this.callbacks.onStateDirty();
    return true;
  }

  /**
   * Signature Rewind Stitch action (Right-side button or Shift / R):
   * Briefly spins the clockwork backward, purifies ALL Time Rifts into Golden Star-Sand,
   * and auto-stitches up to 2 nearby fragments!
   */
  public triggerRewindStitch(): boolean {
    if (this.rewindCooldown > 0.02) return false;
    this.rewindCooldown = this.gsm.getRewindCooldownSec();
    this.rewindVisualOffset = Math.PI * 0.65;
    this.workshop.triggerRewindEffect();

    let purified = 0;
    const rifts = this.nodes.filter((n) => !n.stitched && !n.expired && n.isRift);
    for (const r of rifts) {
      r.stitched = true;
      this.nodeLayer.remove(r.mesh);
      purified += 1;
      this.sessionStats.riftsPurified += 1;

      const wpos = this.workshop.getSlotWorldPosition(r.slotIndex, 0.24);
      const needleOrigin = this.actor.getStitchOriginWorld(new THREE.Vector3());
      this.spawnGoldenThreadArc(needleOrigin, wpos, 0x9ce2ff, 0.042);
      this.spawnFxBurst(wpos, '#9ce2ff', 88, 16);

      const bonus = Math.round(52 * this.gsm.getSandMultiplier() * (this.isFever ? 2 : 1));
      this.gsm.state.sands += bonus;
      this.gsm.state.totalSandsEarned += bonus;
      this.sessionStats.sandsEarned += bonus;
      this.combo += 1;
      if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
      if (!this.isFever) {
        this.feverCharge = Math.min(100, this.feverCharge + 9);
      }

      const spt = this.workshop.projectToScreen(wpos, this.viewWidth, this.viewHeight);
      this.callbacks.onFloatingText('ほころび浄化！', spt.x, spt.y - 18, '#9ce2ff', `+${bonus} 時の砂`);
    }

    // Also auto-stitch up to 2 fragments closest to the golden hand!
    const normals = this.nodes
      .filter((n) => !n.stitched && !n.expired && !n.isRift)
      .sort(
        (a, b) =>
          Math.abs(shortestAngleDiff(this.currentHandAngle, a.slotAngle)) -
          Math.abs(shortestAngleDiff(this.currentHandAngle, b.slotAngle))
      );

    const autoCount = Math.min(2, normals.length);
    for (let i = 0; i < autoCount; i++) {
      this.completeStitch(normals[i], 'REWIND');
    }

    this.audio.playRewindSE(purified);
    const centerWorld = this.workshop.watchGroup.localToWorld(new THREE.Vector3(0, 0.25, 0));
    this.spawnFxBurst(centerWorld, '#9ce2ff', 135, 20);
    if (purified === 0 && autoCount === 0) {
      const spt = this.workshop.projectToScreen(centerWorld, this.viewWidth, this.viewHeight);
      this.callbacks.onFloatingText('REWIND STITCH', spt.x, spt.y - 20, '#9ce2ff', '時の針を巻き戻した');
    }

    this.callbacks.onComboChange(this.combo, this.getComboMultiplier());
    this.callbacks.onFeverChange(this.isFever, this.isFever ? 100 : this.feverCharge, this.feverRemaining);
    this.callbacks.onRewindCooldownChange(0, false);
    this.callbacks.onStateDirty();
    return true;
  }

  public activateFever(): boolean {
    if (this.isFever || this.feverCharge < 100) return false;
    this.isFever = true;
    this.feverCharge = 0;
    this.feverRemaining = this.gsm.getFeverDurationSec();
    this.workshop.triggerMendFlash();
    this.actor.onCelebrate();
    this.audio.playFeverStartSE();

    // Purify all existing rifts into glowing dream star-sand!
    for (const n of this.nodes) {
      if (!n.stitched && !n.expired && n.isRift) {
        n.isRift = false;
        n.fragmentId = 'dream';
        const wpos = this.workshop.getSlotWorldPosition(n.slotIndex, 0.24);
        this.spawnFxBurst(wpos, '#fff4bd', 68, 12);
        const mat = n.coreMesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0xfff3ba);
        mat.emissive.setHex(0xffbf52);
        (n.approachRing.material as THREE.MeshBasicMaterial).color.setHex(0xfff3ba);
        (n.glowSprite.material as THREE.SpriteMaterial).color.setHex(0xfff3ba);
      }
    }

    const centerWorld = this.workshop.watchGroup.localToWorld(new THREE.Vector3(0, 0.3, 0));
    this.spawnFxBurst(centerWorld, '#ffe598', 180, 32);
    this.callbacks.onFeverChange(true, 100, this.feverRemaining);
    return true;
  }

  private handleRiftCollision(node: ClockNode): void {
    node.expired = true;
    this.nodeLayer.remove(node.mesh);
    const wpos = this.workshop.getSlotWorldPosition(node.slotIndex, 0.24);
    const spt = this.workshop.projectToScreen(wpos, this.viewWidth, this.viewHeight);

    if (this.shieldsRemaining > 0) {
      this.shieldsRemaining -= 1;
      this.audio.playShieldBlockSE();
      this.spawnFxBurst(wpos, '#9ce2ff', 80, 14);
      this.callbacks.onShieldChange(this.shieldsRemaining);
      this.callbacks.onFloatingText('砂時計ガード！', spt.x, spt.y - 16, '#9ce2ff', 'ほころびを防いだ');
      return;
    }

    this.sessionStats.riftHits += 1;
    this.combo = 0;
    this.actor.onRiftHit();
    this.workshop.triggerShake(0.24);
    this.audio.playRiftHitSE();
    this.spawnFxBurst(wpos, '#e05892', 75, 12);
    this.callbacks.onComboChange(0, 1);
    this.callbacks.onFloatingText('時のほころび…', spt.x, spt.y - 16, '#ff88b2', '🧵巻き戻しで浄化しよう');
  }

  public update(elapsed: number, dt: number, beatFloat: number, active: boolean): void {
    const track = TOKITSUGI_TRACKS[this.audio.currentTrackId];

    // Rewind visual spin decays smoothly back to 0
    if (this.rewindVisualOffset > 0.001) {
      this.rewindVisualOffset = Math.max(0, this.rewindVisualOffset - dt * 3.8);
    }

    // Update golden clock hand angle synchronized to the music beat
    if (active) {
      const revs = beatFloat / track.beatsPerRevolution;
      this.currentHandAngle = (((revs % 1) + 1) % 1) * Math.PI * 2;
    } else {
      this.currentHandAngle = (elapsed * 0.35) % (Math.PI * 2);
    }
    this.workshop.setHandAngle(this.currentHandAngle - this.rewindVisualOffset);

    // Highlight nearest active slot under the hand
    const nearestSlot = Math.round((this.currentHandAngle / (Math.PI * 2)) * CLOCK_SLOTS) % CLOCK_SLOTS;
    this.workshop.highlightSlot(active ? nearestSlot : null);

    // Update Rewind cooldown
    if (this.rewindCooldown > 0) {
      this.rewindCooldown = Math.max(0, this.rewindCooldown - dt);
      const maxCd = this.gsm.getRewindCooldownSec();
      const pct = Math.min(1, 1 - this.rewindCooldown / maxCd);
      this.callbacks.onRewindCooldownChange(pct, this.rewindCooldown <= 0.01);
    }

    // Update GOLDEN HOUR timer
    if (this.isFever && active) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
      const maxDur = this.gsm.getFeverDurationSec();
      this.callbacks.onFeverChange(true, (this.feverRemaining / maxDur) * 100, this.feverRemaining);
      if (this.feverRemaining <= 0) {
        this.isFever = false;
        this.callbacks.onFeverChange(false, 0, 0);
      }
    }

    // Active spawning & Memory Jar 4-beat auto resonance
    if (active) {
      const spawnInterval = this.isFever ? track.spawnEveryBeats * 0.72 : track.spawnEveryBeats;
      if (beatFloat - this.lastSpawnBeat >= spawnInterval) {
        this.lastSpawnBeat = beatFloat;
        this.spawnBeatWave(beatFloat);
      }

      const resBlock = Math.floor(beatFloat / 4);
      if (resBlock > this.lastResonanceBeat) {
        this.lastResonanceBeat = resBlock;
        const jarLv = this.gsm.state.upgrades.memoryJars;
        if (jarLv > 0) {
          const autoSands = jarLv * 9;
          this.gsm.state.sands += autoSands;
          this.gsm.state.totalSandsEarned += autoSands;
          this.sessionStats.sandsEarned += autoSands;
          this.workshop.triggerJarResonance();
          this.callbacks.onStateDirty();
        }
      }
    }

    // Update all active nodes on the pocket watch dial
    const perfectRad = this.gsm.getPerfectAngleRad() * (this.isFever ? 1.55 : 1.0);
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.stitched || n.expired) {
        this.nodes.splice(i, 1);
        continue;
      }

      n.age += dt;
      const popIn = Math.min(1, n.age * 4.5);
      const easePop = 1 - Math.pow(1 - popIn, 3);
      n.mesh.scale.setScalar(easePop);

      // Gentle bobbing & spinning
      const basePos = this.workshop.getSlotLocalPosition(n.slotIndex, 0.24);
      n.mesh.position.y = basePos.y + Math.sin(elapsed * 3.4 + n.id) * 0.05;
      n.coreMesh.rotation.y += dt * (n.isRift ? -2.4 : 1.5);
      if (!n.isRift && n.fragmentId !== 'timing') {
        n.coreMesh.rotation.x = Math.sin(elapsed * 2 + n.id) * 0.2;
      }

      // Compute angular proximity of golden hand for visual approach ring
      const diff = shortestAngleDiff(this.currentHandAngle, n.slotAngle);
      const absDiff = Math.abs(diff);

      // Approach ring shrinks tightly to 1.0 when hand arrives!
      const forwardDist = forwardAngleDistance(this.currentHandAngle, n.slotAngle);
      const approachNorm = Math.min(1, forwardDist / (Math.PI * 0.85));
      const ringScale = absDiff <= perfectRad ? 1.02 : 1.0 + approachNorm * 1.15;
      n.approachRing.scale.setScalar(ringScale);
      const ringMat = n.approachRing.material as THREE.MeshBasicMaterial;
      if (absDiff <= perfectRad && !n.isRift) {
        ringMat.color.setHex(0xffffff);
        ringMat.opacity = 0.98;
      } else {
        ringMat.color.setHex(n.isRift ? 0xff5a8a : FRAGMENT_MAP[n.fragmentId || 'photo'].colorHex);
        ringMat.opacity = 0.45 + (1 - approachNorm) * 0.45;
      }

      // Detect hand sweep past this node
      if (active && n.age > 0.45) {
        // Check when hand crosses just past the slot (diff in [0, 0.36])
        if (diff >= 0 && diff < 0.42) {
          n.passedOnce = true;
          if (n.isRift) {
            this.handleRiftCollision(n);
            continue;
          }
          // In GOLDEN HOUR, automatically stitch any fragment the golden hand touches if player hasn't already!
          if (this.isFever && absDiff < 0.14) {
            this.completeStitch(n, 'PERFECT');
            continue;
          }
        } else if (n.passedOnce && diff > 0.55) {
          // Missed normal fragment after hand moved well past it
          n.expired = true;
          this.nodeLayer.remove(n.mesh);
          this.cleanupPairGuide(n.pairId);
          if (!n.isRift && !this.isFever && this.combo > 0) {
            this.combo = 0;
            this.callbacks.onComboChange(0, 1);
          }
        }
      }
    }

    // Fade 3D golden thread arcs
    for (let i = this.threads.length - 1; i >= 0; i--) {
      const t = this.threads[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.threadLayer.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mat.dispose();
        this.threads.splice(i, 1);
      } else {
        t.mat.opacity = (t.life / t.maxLife) * 0.96;
      }
    }

    // Pulse pair guide lines
    for (const pg of this.pairGuides) {
      pg.mat.opacity = 0.45 + 0.35 * Math.sin(elapsed * 5.2 + pg.pairId);
    }

    this.renderFx(dt);
  }

  private cleanupPairGuide(pairId: number | null): void {
    if (pairId === null) return;
    const idx = this.pairGuides.findIndex((p) => p.pairId === pairId);
    if (idx >= 0) {
      const pg = this.pairGuides[idx];
      this.nodeLayer.remove(pg.line);
      pg.line.geometry.dispose();
      pg.mat.dispose();
      this.pairGuides.splice(idx, 1);
    }
  }

  private renderFx(dt: number): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);

    // Expanding luminous clockwork ripples
    for (let i = this.fxBursts.length - 1; i >= 0; i--) {
      const b = this.fxBursts[i];
      b.radius += (b.maxRadius - b.radius) * Math.min(1, dt * 8.5) + dt * 22;
      b.alpha -= dt * 2.1;
      if (b.alpha <= 0.01) {
        this.fxBursts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.alpha);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.lineWidth * b.alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Golden thread sparks
    for (let i = this.fxSparks.length - 1; i >= 0; i--) {
      const s = this.fxSparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.fxSparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      const ratio = s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, ratio);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  public getClockRadius(): number {
    return CLOCK_RADIUS;
  }
}
