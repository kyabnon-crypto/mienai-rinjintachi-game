import * as THREE from 'three';
import { KagemichiAudioEngine } from './audioEngine';
import { KAGEMICHI_TRACKS, LANE_POSITIONS, MEMORY_TYPES } from './config';
import { KagemichiActor } from './kagemichiActor';
import { KagemichiStateManager } from './state';
import { StationScene } from './stationScene';
import { KagemichiRunStats, MemoryTypeDef } from './types';

interface MemoryOrb {
  id: number;
  mesh: THREE.Group;
  def: MemoryTypeDef;
  lane: number;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  magnetized: boolean;
  spinOffset: number;
}

interface StationObstacle {
  id: number;
  kind: 'mist' | 'gate';
  mesh: THREE.Group;
  lane: number;
  x: number;
  z: number;
  resolved: boolean;
  jumpedOver: boolean;
}

interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface RunnerCallbacks {
  onFloatingText: (label: string, sx: number, sy: number, color: string, sub?: string) => void;
  onComboChange: (combo: number, mult: number) => void;
  onStateDirty: () => void;
  onDreamSent: (ticketsEarned: number, totalDreamsSent: number) => void;
  onExpressChange: (active: boolean, gaugePct: number, remainingSec: number) => void;
  onShieldChange: (shields: number) => void;
}

export class RunnerSystem {
  private station: StationScene;
  private actor: KagemichiActor;
  private audio: KagemichiAudioEngine;
  private gsm: KagemichiStateManager;
  private cb: RunnerCallbacks;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private fxW = 1280;
  private fxH = 720;
  private fxParticles: FxParticle[] = [];

  private orbs: MemoryOrb[] = [];
  private obstacles: StationObstacle[] = [];
  private nextId = 1;

  public combo = 0;
  public expressGauge = 0; // 0..100
  public isExpress = false;
  public expressRemaining = 0;
  public shieldsRemaining = 0;

  public sessionStats: KagemichiRunStats = {
    collected: 0,
    jumpsCleared: 0,
    mistHits: 0,
    purified: 0,
    maxCombo: 0,
    lightsEarned: 0,
    ticketsEarned: 0,
    dreamsSent: 0,
    score: 0,
  };

  private nextSpawnBeat = 1.5;
  private nextPassiveBeat = 4;
  private patternQueue: Array<{
    lane: number;
    y: number;
    forceRare?: boolean;
    obstacle?: { kind: 'mist' | 'gate'; lane: number };
  }> = [];
  private lastGuideLane = 1;
  private projVec = new THREE.Vector3();

  constructor(
    station: StationScene,
    actor: KagemichiActor,
    audio: KagemichiAudioEngine,
    gsm: KagemichiStateManager,
    fxCanvas: HTMLCanvasElement,
    cb: RunnerCallbacks
  ) {
    this.station = station;
    this.actor = actor;
    this.audio = audio;
    this.gsm = gsm;
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.cb = cb;
  }

  public resizeFx(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxW = Math.max(1, width);
    this.fxH = Math.max(1, height);
    this.fxCanvas.width = Math.round(this.fxW * dpr);
    this.fxCanvas.height = Math.round(this.fxH * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public resetSession(keepReady = false): void {
    for (const o of this.orbs) {
      this.station.worldGroup.remove(o.mesh);
    }
    for (const ob of this.obstacles) {
      this.station.worldGroup.remove(ob.mesh);
    }
    this.orbs = [];
    this.obstacles = [];
    this.patternQueue = [];
    this.fxParticles = [];

    this.combo = 0;
    this.expressGauge = 0;
    this.isExpress = false;
    this.expressRemaining = 0;
    this.shieldsRemaining = this.gsm.getShieldCount();
    this.lastGuideLane = 1;

    this.sessionStats = {
      collected: 0,
      jumpsCleared: 0,
      mistHits: 0,
      purified: 0,
      maxCombo: 0,
      lightsEarned: 0,
      ticketsEarned: 0,
      dreamsSent: 0,
      score: 0,
    };

    this.actor.resetForRun();
    this.cb.onComboChange(0, 1);
    this.cb.onExpressChange(false, 0, 0);
    this.cb.onShieldChange(this.shieldsRemaining);
    if (keepReady) {
      this.nextSpawnBeat = 1.0;
      this.nextPassiveBeat = 4;
    }
  }

  public resetBeatCursors(currentBeat: number): void {
    this.nextSpawnBeat = currentBeat + 1.0;
    this.nextPassiveBeat = Math.floor(currentBeat / 4) * 4 + 4;
  }

  public getComboMultiplier(): number {
    return 1 + Math.min(2.0, this.combo * 0.03);
  }

  public getCurrentSpeed(): number {
    const base = KAGEMICHI_TRACKS[this.audio.currentTrackId].runSpeed;
    return this.isExpress ? base * 1.28 : base;
  }

  public sendToDream(): boolean {
    const cap = this.gsm.getLanternCapacity();
    if (this.gsm.state.lanternFill < cap) return false;

    this.gsm.state.lanternFill = Math.max(0, this.gsm.state.lanternFill - cap);
    const tickets = this.gsm.getTicketsPerDreamSend() * (this.isExpress ? 2 : 1);
    const bonusLights = Math.round(45 * this.gsm.getLightMultiplier() * (this.isExpress ? 1.5 : 1));

    this.gsm.state.tickets += tickets;
    this.gsm.state.totalDreamsSent += 1;
    this.gsm.state.lights += bonusLights;
    this.gsm.state.totalLightsEarned += bonusLights;

    this.sessionStats.ticketsEarned += tickets;
    this.sessionStats.lightsEarned += bonusLights;
    this.sessionStats.dreamsSent += 1;
    this.sessionStats.score += 500 * tickets;
    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }
    this.gsm.save();

    this.audio.playDreamSendSE();
    const pos = this.actor.getPosition();
    this.station.spawnDreamAscendBurst(pos);
    const scr = this.projectToScreen(pos.clone().add(new THREE.Vector3(0, 1.8, 0)));
    this.spawnFxBurst(scr.x, scr.y, '#ffe89e', 28);
    this.cb.onFloatingText('DREAM SENT!', scr.x, scr.y - 10, '#ffe89e', `+${tickets} 夢切符  +${bonusLights}`);
    this.cb.onDreamSent(tickets, this.gsm.state.totalDreamsSent);
    this.cb.onStateDirty();
    return true;
  }

  public activateExpress(): boolean {
    if (this.isExpress || this.expressGauge < 100) return false;
    this.isExpress = true;
    this.expressGauge = 100;
    this.expressRemaining = this.gsm.getFeverDurationSec();
    this.audio.setCurrentTrackLoop(true);
    this.audio.playExpressStartSE();
    this.station.triggerShake(0.18);
    this.station.spawnDreamAscendBurst(this.actor.getPosition());

    // Auto-send lantern if already full on express launch
    if (this.gsm.state.lanternFill >= this.gsm.getLanternCapacity()) {
      this.sendToDream();
    }

    this.cb.onExpressChange(true, 100, this.expressRemaining);
    return true;
  }

  private pickMemoryType(forceRare = false): MemoryTypeDef {
    if (forceRare) return MEMORY_TYPES[4]; // 再会の夢切符
    const lampLv = this.gsm.state.upgrades.streetlamp;
    const weights = MEMORY_TYPES.map((t) =>
      t.id === 'ticket' ? t.weight + lampLv * 5 + (this.isExpress ? 8 : 0) : t.weight
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < MEMORY_TYPES.length; i++) {
      r -= weights[i];
      if (r <= 0) return MEMORY_TYPES[i];
    }
    return MEMORY_TYPES[0];
  }

  private refillPatternQueue(): void {
    const track = KAGEMICHI_TRACKS[this.audio.currentTrackId];
    const roll = Math.random();

    if (roll < 0.34) {
      // Straight glowing ribbon of 3-4 memories + optional obstacle on another lane
      const lane = Math.floor(Math.random() * 3);
      this.lastGuideLane = lane;
      const otherLanes = [0, 1, 2].filter((l) => l !== lane);
      const obsLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
      const addObs = Math.random() < track.obstacleRate * 1.45;
      for (let i = 0; i < 4; i++) {
        this.patternQueue.push({
          lane,
          y: 0.95,
          forceRare: i === 3 && Math.random() < 0.22,
          obstacle: addObs && i === 1 ? { kind: 'mist', lane: obsLane } : undefined,
        });
      }
    } else if (roll < 0.64) {
      // Smooth diagonal wave across all 3 lanes (feels awesome to sweep!)
      const dir = this.lastGuideLane === 0 ? 1 : this.lastGuideLane === 2 ? -1 : Math.random() < 0.5 ? 1 : -1;
      const start = dir > 0 ? 0 : 2;
      const seq = [start, 1, 2 - start];
      this.lastGuideLane = seq[2];
      seq.forEach((lane, idx) => {
        this.patternQueue.push({
          lane,
          y: 0.95,
          forceRare: idx === 2 && Math.random() < 0.25,
        });
      });
    } else if (roll < 0.88 && !this.isExpress) {
      // Jump arch over a low station gate! (3 memories arcing smoothly above the bar)
      const lane = Math.floor(Math.random() * 3);
      this.lastGuideLane = lane;
      this.patternQueue.push({ lane, y: 1.05 });
      this.patternQueue.push({
        lane,
        y: 2.35,
        forceRare: Math.random() < 0.35,
        obstacle: { kind: 'gate', lane },
      });
      this.patternQueue.push({ lane, y: 1.05 });
    } else {
      // Express / High-tempo pair with mist weaving
      const laneA = Math.floor(Math.random() * 3);
      const laneB = (laneA + 1 + Math.floor(Math.random() * 2)) % 3;
      this.lastGuideLane = laneB;
      this.patternQueue.push({
        lane: laneA,
        y: 0.95,
        obstacle: Math.random() < track.obstacleRate ? { kind: 'mist', lane: laneB } : undefined,
      });
      this.patternQueue.push({ lane: laneB, y: 0.95, forceRare: Math.random() < 0.2 });
    }
  }

  private buildOrbMesh(def: MemoryTypeDef): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.colorHex,
      emissive: def.emissiveHex,
      emissiveIntensity: 0.95,
      roughness: 0.18,
      metalness: 0.2,
    });

    if (def.id === 'letter') {
      // Glowing floating envelope with golden wax seal
      const env = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.08), mat);
      g.add(env);
      const seal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10),
        new THREE.MeshBasicMaterial({ color: 0xffc66e })
      );
      seal.rotation.x = Math.PI / 2;
      g.add(seal);
    } else if (def.id === 'bottle') {
      // Tiny glowing emotion vial
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.48, 12), mat);
      g.add(body);
      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.09, 0.14, 10),
        new THREE.MeshStandardMaterial({ color: 0xc2955e, roughness: 0.85 })
      );
      cork.position.y = 0.28;
      g.add(cork);
    } else if (def.id === 'ticket') {
      // Golden vintage hard railway ticket
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.07), mat);
      g.add(card);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.03, 6, 22),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.75 })
      );
      g.add(ring);
    } else {
      // Glowing warm lantern ember / starlight crystal
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
      g.add(core);
    }

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.station.glowTex,
        color: def.colorHex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    halo.scale.set(1.5, 1.5, 1);
    g.add(halo);
    return g;
  }

  private buildObstacleMesh(kind: 'mist' | 'gate'): THREE.Group {
    const g = new THREE.Group();
    if (kind === 'mist') {
      // Swirling dark violet-indigo shadow mist cloud (stray loneliness)
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0x1a1530,
        emissive: 0x4b2f7a,
        emissiveIntensity: 0.72,
        roughness: 0.9,
        transparent: true,
        opacity: 0.9,
      });
      const center = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), cloudMat);
      center.position.y = 0.85;
      g.add(center);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), cloudMat);
        puff.position.set(Math.cos(a) * 0.48, 0.68 + (i % 2) * 0.28, Math.sin(a) * 0.36);
        g.add(puff);
      }
      const warnRing = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.86, 24),
        new THREE.MeshBasicMaterial({
          color: 0x9b6fff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55,
        })
      );
      warnRing.rotation.x = -Math.PI / 2;
      warnRing.position.y = 0.04;
      g.add(warnRing);
    } else {
      // Low station closing barrier bar (jumpable!)
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2c344a, metalness: 0.6, roughness: 0.4 });
      const barMat = new THREE.MeshStandardMaterial({
        color: 0xe6a15c,
        emissive: 0x9e4b1c,
        emissiveIntensity: 0.5,
        roughness: 0.35,
      });
      [-0.85, 0.85].forEach((px) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.05, 10), postMat);
        post.position.set(px, 0.52, 0);
        g.add(post);
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.16), barMat);
      bar.position.y = 0.88;
      g.add(bar);

      // Subtle glowing upward chevron hint on floor
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(1.75, 0.34),
        new THREE.MeshBasicMaterial({
          color: 0xffb970,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
        })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.03, 0.45);
      g.add(strip);
    }
    return g;
  }

  private spawnStep(): void {
    if (this.patternQueue.length === 0) {
      this.refillPatternQueue();
    }
    const item = this.patternQueue.shift()!;
    const spawnZ = -58;

    const def = this.pickMemoryType(item.forceRare);
    const orbMesh = this.buildOrbMesh(def);
    const x = LANE_POSITIONS[item.lane];
    orbMesh.position.set(x, item.y, spawnZ);
    this.station.worldGroup.add(orbMesh);

    this.orbs.push({
      id: this.nextId++,
      mesh: orbMesh,
      def,
      lane: item.lane,
      x,
      y: item.y,
      z: spawnZ,
      collected: false,
      magnetized: false,
      spinOffset: Math.random() * Math.PI * 2,
    });

    if (item.obstacle) {
      const obMesh = this.buildObstacleMesh(item.obstacle.kind);
      const ox = LANE_POSITIONS[item.obstacle.lane];
      obMesh.position.set(ox, 0, spawnZ);
      this.station.worldGroup.add(obMesh);
      this.obstacles.push({
        id: this.nextId++,
        kind: item.obstacle.kind,
        mesh: obMesh,
        lane: item.obstacle.lane,
        x: ox,
        z: spawnZ,
        resolved: false,
        jumpedOver: false,
      });
    }
  }

  private collectOrb(orb: MemoryOrb): void {
    orb.collected = true;
    this.station.worldGroup.remove(orb.mesh);

    const track = KAGEMICHI_TRACKS[this.audio.currentTrackId];
    this.combo += 1;
    if (this.combo > this.sessionStats.maxCombo) this.sessionStats.maxCombo = this.combo;
    if (this.combo > this.gsm.state.bestCombo) this.gsm.state.bestCombo = this.combo;

    const mult = this.getComboMultiplier();
    const expressMult = this.isExpress ? 2.0 : 1.0;
    const gain = Math.round(
      orb.def.baseValue * track.valueMultiplier * this.gsm.getLightMultiplier() * mult * expressMult
    );

    this.gsm.state.lights += gain;
    this.gsm.state.totalLightsEarned += gain;
    this.gsm.state.lanternFill = Math.min(
      this.gsm.getLanternCapacity(),
      this.gsm.state.lanternFill + 1
    );

    this.sessionStats.collected += 1;
    this.sessionStats.lightsEarned += gain;
    this.sessionStats.score += gain * 10;

    // Rare ticket orb grants +1 bonus Dream Ticket immediately!
    if (orb.def.id === 'ticket') {
      this.gsm.state.tickets += 1;
      this.sessionStats.ticketsEarned += 1;
    }

    if (!this.isExpress) {
      this.expressGauge = Math.min(100, this.expressGauge + orb.def.feverGain);
      this.cb.onExpressChange(false, this.expressGauge, 0);
    }

    if (this.sessionStats.score > this.gsm.state.bestScore) {
      this.gsm.state.bestScore = this.sessionStats.score;
    }

    this.actor.triggerCollectPulse();
    this.audio.playCollectSE(this.combo, orb.def.id === 'ticket');

    const scr = this.projectToScreen(new THREE.Vector3(orb.x, orb.y + 0.35, orb.z));
    this.spawnFxBurst(scr.x, scr.y, orb.def.cssColor, orb.def.id === 'ticket' ? 18 : 10);
    const label = orb.def.id === 'ticket' ? `🎫 +1切符 +${gain}` : `+${gain}`;
    this.cb.onFloatingText(label, scr.x, scr.y, orb.def.cssColor, orb.def.id === 'ticket' ? orb.def.name : undefined);
    this.cb.onComboChange(this.combo, mult);
    this.cb.onStateDirty();
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    this.projVec.copy(worldPos).project(this.station.camera);
    return {
      x: (this.projVec.x * 0.5 + 0.5) * this.fxW,
      y: (-this.projVec.y * 0.5 + 0.5) * this.fxH,
    };
  }

  private spawnFxBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 65 + Math.random() * 145;
      this.fxParticles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 30,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.25,
        color,
        size: 2.5 + Math.random() * 3.5,
      });
    }
  }

  public update(
    elapsed: number,
    dt: number,
    beatFloat: number,
    remainingSec: number,
    active: boolean
  ): void {
    const speed = active ? this.getCurrentSpeed() : 3.2;

    // DREAM EXPRESS countdown
    if (this.isExpress && active) {
      this.expressRemaining = Math.max(0, this.expressRemaining - dt);
      const dur = this.gsm.getFeverDurationSec();
      this.expressGauge = (this.expressRemaining / dur) * 100;
      this.cb.onExpressChange(true, this.expressGauge, this.expressRemaining);
      if (this.expressRemaining <= 0) {
        this.isExpress = false;
        this.expressGauge = 0;
        this.audio.setCurrentTrackLoop(false);
        this.cb.onExpressChange(false, 0, 0);
        this.cb.onStateDirty();
      }
    }

    // Spawn beat-synced memories & obstacles (stop spawning 2.8s before song ends for clean finish)
    if (active && (remainingSec > 2.8 || this.isExpress)) {
      const track = KAGEMICHI_TRACKS[this.audio.currentTrackId];
      const interval = this.isExpress ? Math.max(0.5, track.spawnEveryBeats * 0.72) : track.spawnEveryBeats;
      if (beatFloat >= this.nextSpawnBeat) {
        this.spawnStep();
        this.nextSpawnBeat = beatFloat + interval;
      }

      // Jar shelf passive resonance every 4 beats
      if (beatFloat >= this.nextPassiveBeat) {
        this.nextPassiveBeat += 4;
        const jarLv = this.gsm.state.upgrades.jarShelf;
        if (jarLv > 0) {
          const passiveGain = jarLv * 8;
          this.gsm.state.lights += passiveGain;
          this.gsm.state.totalLightsEarned += passiveGain;
          this.sessionStats.lightsEarned += passiveGain;
          this.cb.onStateDirty();
        }
      }
    }

    const playerPos = this.actor.getPosition();
    const playerZ = playerPos.z;
    const magnetRadius = this.isExpress ? 5.2 : this.gsm.getMagnetRadius();

    // Update memory orbs
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.z += speed * dt;
      orb.mesh.rotation.y = elapsed * 2.4 + orb.spinOffset;

      const bobY = orb.y + Math.sin(elapsed * 4.2 + orb.spinOffset) * 0.14;

      // Lantern magnetic attraction when approaching Kagemichi
      const dz = Math.abs(orb.z - playerZ);
      const dx = Math.abs(orb.x - playerPos.x);
      const dy = Math.abs(bobY - (playerPos.y + 0.95));

      if (active && dz < 3.4 && (this.isExpress || (dx < magnetRadius && dy < 1.85))) {
        orb.magnetized = true;
      }

      if (orb.magnetized) {
        const pull = Math.min(1, dt * 16);
        orb.x += (playerPos.x - orb.x) * pull;
        orb.y += (playerPos.y + 0.85 - orb.y) * pull;
        orb.z += (playerZ - orb.z) * pull;
      }

      orb.mesh.position.set(orb.x, orb.magnetized ? orb.y : bobY, orb.z);

      // Collect check
      if (
        active &&
        Math.hypot(orb.x - playerPos.x, orb.z - playerZ) < 1.15 &&
        Math.abs(orb.mesh.position.y - (playerPos.y + 0.9)) < 1.45
      ) {
        this.collectOrb(orb);
        this.orbs.splice(i, 1);
        continue;
      }

      if (orb.z > 9) {
        this.station.worldGroup.remove(orb.mesh);
        this.orbs.splice(i, 1);
      }
    }

    // Update obstacles (Shadow Mist & Low Station Gate)
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const ob = this.obstacles[i];
      ob.z += speed * dt;
      ob.mesh.position.z = ob.z;
      if (ob.kind === 'mist') {
        ob.mesh.rotation.y = elapsed * 1.9;
      }

      if (active && !ob.resolved) {
        const dz = Math.abs(ob.z - playerZ);
        const dx = Math.abs(ob.x - playerPos.x);

        if (dz < 0.85 && dx < 0.92) {
          if (this.isExpress) {
            // Purify obstacle into golden light during DREAM EXPRESS!
            ob.resolved = true;
            this.station.worldGroup.remove(ob.mesh);
            this.obstacles.splice(i, 1);
            const bonus = Math.round(32 * this.gsm.getLightMultiplier());
            this.gsm.state.lights += bonus;
            this.gsm.state.totalLightsEarned += bonus;
            this.sessionStats.lightsEarned += bonus;
            this.sessionStats.purified += 1;
            this.sessionStats.score += bonus * 12;
            const scr = this.projectToScreen(new THREE.Vector3(ob.x, 1.1, ob.z));
            this.spawnFxBurst(scr.x, scr.y, '#ffe89e', 16);
            this.cb.onFloatingText('PURIFIED!', scr.x, scr.y, '#ffe89e', `+${bonus}`);
            this.audio.playCollectSE(this.combo + 3, true);
            this.cb.onStateDirty();
            continue;
          }

          const clearanceHeight = ob.kind === 'gate' ? 0.82 : 1.15;
          if (playerPos.y >= clearanceHeight) {
            // Clean jump over obstacle!
            if (!ob.jumpedOver) {
              ob.jumpedOver = true;
              ob.resolved = true;
              this.sessionStats.jumpsCleared += 1;
              const jumpBonus = Math.round(28 * this.gsm.getLightMultiplier());
              this.gsm.state.lights += jumpBonus;
              this.gsm.state.totalLightsEarned += jumpBonus;
              this.sessionStats.lightsEarned += jumpBonus;
              this.sessionStats.score += 320;
              this.expressGauge = Math.min(100, this.expressGauge + 4.5);
              this.cb.onExpressChange(false, this.expressGauge, 0);
              this.audio.playJumpBonusSE();
              const scr = this.projectToScreen(new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerZ));
              this.spawnFxBurst(scr.x, scr.y, '#b5dcff', 12);
              this.cb.onFloatingText('JUMP CLEAR!', scr.x, scr.y, '#b5dcff', `+${jumpBonus}`);
              this.cb.onStateDirty();
            }
          } else {
            // Hit obstacle — friendly mist stagger (or absorbed by streetlamp shield!)
            ob.resolved = true;
            this.station.worldGroup.remove(ob.mesh);
            this.obstacles.splice(i, 1);

            if (this.shieldsRemaining > 0) {
              this.shieldsRemaining -= 1;
              this.audio.playMistHitSE(true);
              this.cb.onShieldChange(this.shieldsRemaining);
              const scr = this.projectToScreen(new THREE.Vector3(playerPos.x, 1.4, playerZ));
              this.spawnFxBurst(scr.x, scr.y, '#99d0ff', 16);
              this.cb.onFloatingText('GUARD!', scr.x, scr.y, '#99d0ff', '街灯の守り');
            } else {
              this.sessionStats.mistHits += 1;
              this.combo = 0;
              this.actor.triggerHitFlash();
              this.station.triggerShake(0.26);
              this.audio.playMistHitSE(false);
              const scr = this.projectToScreen(new THREE.Vector3(playerPos.x, 1.4, playerZ));
              this.spawnFxBurst(scr.x, scr.y, '#a483ff', 14);
              this.cb.onFloatingText('MIST...', scr.x, scr.y, '#c2a6ff');
              this.cb.onComboChange(0, 1);
            }
            continue;
          }
        }
      }

      if (ob.z > 9) {
        this.station.worldGroup.remove(ob.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    this.renderFx(dt, active);
  }

  private renderFx(dt: number, active: boolean): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxW, this.fxH);

    // Subtle express starlight speedlines on screen edges
    if (active && this.isExpress) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 224, 150, 0.22)';
      ctx.lineWidth = 2;
      const t = performance.now() * 0.008;
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 0 : 1;
        const y = ((i * 79 + t * 140) % this.fxH);
        const x0 = side === 0 ? 0 : this.fxW;
        const x1 = side === 0 ? 60 + (i % 4) * 28 : this.fxW - (60 + (i % 4) * 28);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y + (y - this.fxH * 0.5) * 0.08);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Burst particles
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fxParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
