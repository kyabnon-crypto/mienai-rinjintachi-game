import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Nukumori 3D character actor — the fluffy white temperature keeper in a red scarf.
 * Loads official rigged nukumori.glb (Mixamo Walking / Running),
 * radiates a warm stove-amber aura ring on the snowy street, gently pulses when
 * placing hands on chilly benches, and emits a golden Steam Wave ring.
 */
export class NukumoriActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private auraLight: THREE.PointLight;
  private warmRing: THREE.Mesh;
  private warmFloorGlow: THREE.Mesh;
  private steamHaloSprite: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private waveRing: THREE.Mesh;

  public x = 0;
  public z = 0.7;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private waveTimer = 0;
  private waveMaxRadius = 4.2;
  private warmingBench = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);

    this.root.add(this.modelPivot);

    // Warm stove-glow personal light so white fluffy wool & red scarf look super cozy
    this.auraLight = new THREE.PointLight(0xffb870, 3.0, 9.0, 1.3);
    this.auraLight.position.set(0, 1.45, 0.55);
    this.root.add(this.auraLight);

    // Warm golden floor glow showing Nukumori's warmth & hand-warming reach
    this.warmFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 36),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffa858,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.warmFloorGlow.rotation.x = -Math.PI / 2;
    this.warmFloorGlow.position.y = 0.025;
    this.root.add(this.warmFloorGlow);

    this.warmRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 44),
      new THREE.MeshBasicMaterial({
        color: 0xffd699,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.warmRing.rotation.x = -Math.PI / 2;
    this.warmRing.position.y = 0.034;
    this.root.add(this.warmRing);

    // Soft rising steam halo above Nukumori's cozy scarf/shoulders (grows with can rack & warming!)
    this.steamHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe4bc,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.steamHaloSprite.position.set(0, 1.12, 0.16);
    this.steamHaloSprite.scale.set(0.95, 0.95, 1);
    this.modelPivot.add(this.steamHaloSprite);

    // Red-scarf shield aura ring (when redScarfBed shield is active)
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.034, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff7b6b,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.62;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D golden Steam Wave ring
    this.waveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffdca0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.waveRing.rotation.x = -Math.PI / 2;
    this.waveRing.position.y = 0.09;
    this.waveRing.visible = false;
    this.root.add(this.waveRing);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official GLB is ~1.7m tall with feet at y = 0; scale cleanly for winter plaza
    model.scale.setScalar(0.88);
    model.position.set(0, 0, 0);

    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    this.model = model;
    this.modelPivot.add(model);

    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      const walkClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('walk')) || gltf.animations[0];
      const runClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('run')) || walkClip;

      this.walkAction = this.mixer.clipAction(walkClip);
      this.runAction = this.mixer.clipAction(runClip);

      this.walkAction.play();
      this.walkAction.setEffectiveTimeScale(0.14);
      this.walkAction.setEffectiveWeight(0.14);
    }
  }

  public setMotion(
    x: number,
    z: number,
    vx: number,
    vz: number,
    dt: number,
    lookAtTarget?: { x: number; z: number } | null
  ): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, 0, z);
    this.speed = Math.hypot(vx, vz);

    let targetYaw: number | null = null;
    if (this.speed > 0.16) {
      targetYaw = Math.atan2(vx, vz);
    } else if (lookAtTarget) {
      const dx = lookAtTarget.x - x;
      const dz = lookAtTarget.z - z;
      if (Math.hypot(dx, dz) > 0.1) {
        targetYaw = Math.atan2(dx, dz);
      }
    }

    if (targetYaw !== null) {
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-12 * dt));
    }
  }

  public setWarmingBench(warming: boolean): void {
    this.warmingBench = warming;
  }

  public getWarmOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.steamHaloSprite.getWorldPosition(out);
    return out;
  }

  public onCollect(): void {
    this.popTimer = 1.0;
  }

  public onCelebrate(): void {
    this.celebrateTimer = 1.3;
    this.popTimer = 1.0;
  }

  public onFrostHit(): void {
    this.hitFlashTimer = 0.55;
  }

  public onSteamWave(radius: number): void {
    this.waveTimer = 0.58;
    this.waveMaxRadius = radius;
    this.popTimer = 1.0;
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    warmRadius: number,
    canRackRatio: number,
    shields: number
  ): void {
    this.popTimer = Math.max(0, this.popTimer - dt * 3.1);
    this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    if (!active) {
      const lobbyYaw = Math.sin(elapsed * 0.55) * 0.22;
      this.yaw += (lobbyYaw - this.yaw) * (1 - Math.exp(-4 * dt));
      this.speed = 0;
      this.warmingBench = false;
    }

    // Mixamo animation cross-fading
    if (this.mixer && this.walkAction && this.runAction) {
      if (
        this.celebrateTimer > 0.12 ||
        (active && (this.speed > 4.2 || (isFever && this.speed > 1.3)))
      ) {
        if (this.activeAnim !== 'run') {
          this.activeAnim = 'run';
          this.runAction.reset().play();
          this.runAction.crossFadeFrom(this.walkAction, 0.16, true);
        }
        this.runAction.setEffectiveTimeScale(isFever ? 1.15 : 1.0);
        this.runAction.setEffectiveWeight(0.88);
      } else if (active && this.speed > 0.25) {
        if (this.activeAnim !== 'walk') {
          this.activeAnim = 'walk';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.18, true);
        }
        this.walkAction.setEffectiveTimeScale(0.78 + Math.min(0.7, this.speed * 0.18));
        this.walkAction.setEffectiveWeight(0.86);
      } else {
        if (this.activeAnim !== 'idle') {
          this.activeAnim = 'idle';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.22, true);
        }
        this.walkAction.setEffectiveTimeScale(this.warmingBench ? 0.34 : 0.14);
        this.walkAction.setEffectiveWeight(this.warmingBench ? 0.26 : 0.14);
      }
      this.mixer.update(dt);
    }

    // Expressive cozy bounce, gentle lean when warming a bench, happy hop
    const beatBounce = Math.pow(1 - beatPhase, 3) * (isFever ? 0.08 : 0.032);
    const hop = this.celebrateTimer > 0 ? Math.abs(Math.sin(this.celebrateTimer * 10.5)) * 0.26 : 0;
    const shake = this.hitFlashTimer > 0 ? Math.sin(elapsed * 52) * 0.08 * this.hitFlashTimer : 0;
    const warmLean = this.warmingBench ? 0.14 + Math.sin(elapsed * 7.5) * 0.035 : 0;

    this.modelPivot.position.set(shake, beatBounce + hop, 0);
    this.modelPivot.rotation.y = this.yaw;
    this.modelPivot.rotation.x = Math.min(0.18, this.speed * 0.024 + warmLean);

    if (this.model) {
      const pop = 1 + this.popTimer * 0.08 + (this.warmingBench ? Math.sin(elapsed * 8) * 0.022 : 0);
      this.modelPivot.scale.set(pop, 1 + this.popTimer * 0.11, pop);
    }

    // Warm floor ring scales with thermostat upgrade & Fever
    const effRadius = warmRadius * (isFever ? 1.42 : 1.0);
    const ringPulse =
      1 + Math.sin(elapsed * (this.warmingBench ? 7.5 : 3.8)) * 0.035 + this.popTimer * 0.06;
    this.warmRing.scale.setScalar(effRadius * ringPulse);
    this.warmFloorGlow.scale.setScalar(effRadius * 1.18);

    const ringMat = this.warmRing.material as THREE.MeshBasicMaterial;
    ringMat.color.setHex(
      isFever ? 0xfff0aa : this.warmingBench ? 0xffae66 : 0xffcfa0
    );
    ringMat.opacity = isFever ? 0.68 : this.warmingBench ? 0.62 : 0.34 + this.popTimer * 0.24;

    const floorMat = this.warmFloorGlow.material as THREE.MeshBasicMaterial;
    floorMat.opacity = isFever ? 0.58 : this.warmingBench ? 0.52 : 0.32 + canRackRatio * 0.16;

    // Cozy steam halo above Nukumori
    const haloSize =
      0.75 + canRackRatio * 0.85 + this.popTimer * 0.45 + (this.warmingBench ? 0.35 : 0);
    this.steamHaloSprite.scale.set(haloSize, haloSize, 1);
    (this.steamHaloSprite.material as THREE.SpriteMaterial).opacity =
      0.16 + canRackRatio * 0.55 + this.popTimer * 0.25 + (this.warmingBench ? 0.22 : 0);

    // Aura light
    this.auraLight.intensity =
      (isFever ? 4.4 : 3.0) +
      this.popTimer * 1.2 +
      canRackRatio * 0.7 +
      (this.warmingBench ? 0.85 : 0);
    this.auraLight.color.setHex(
      this.hitFlashTimer > 0.12 ? 0x8cc8ff : isFever ? 0xffeeb4 : 0xffb870
    );

    // Red-scarf shield halo
    this.shieldAura.visible = shields > 0;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 0.85;
      (this.shieldAura.material as THREE.MeshBasicMaterial).opacity =
        0.38 + 0.18 * Math.sin(elapsed * 3.6);
    }

    // 3D Steam Wave expansion
    if (this.waveTimer > 0) {
      this.waveTimer = Math.max(0, this.waveTimer - dt);
      const prog = 1 - this.waveTimer / 0.58;
      this.waveRing.visible = true;
      const r = 0.5 + prog * this.waveMaxRadius;
      this.waveRing.scale.setScalar(r);
      (this.waveRing.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.88;
    } else {
      this.waveRing.visible = false;
    }
  }
}
