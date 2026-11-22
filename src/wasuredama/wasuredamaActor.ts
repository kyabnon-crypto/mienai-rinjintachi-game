import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Wasuredama 3D character actor freely strolling the cobblestone plaza.
 * Loads the official rigged wasuredama.glb (Mixamo Walking / Running),
 * carries a glowing burlap light-aura ring at its feet, swells its sack-glow
 * as lost items accumulate, and reacts joyously on pickup, Lamp Bloom, and delivery.
 */
export class WasuredamaActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private auraLight: THREE.PointLight;
  private pickupRing: THREE.Mesh;
  private pickupFloorGlow: THREE.Mesh;
  private sackGlowSprite: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private pulseRing: THREE.Mesh;

  public x = 0;
  public z = 0.6;
  private yaw = 0;
  private speed = 0;
  private pickupPop = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private pulseWaveTimer = 0;
  private pulseWaveMaxRadius = 3.5;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);

    this.root.add(this.modelPivot);

    // Warm personal lantern glow so Wasuredama's silhouette & glowing eyes pop against cobblestones
    this.auraLight = new THREE.PointLight(0xffd794, 3.2, 8.5, 1.3);
    this.auraLight.position.set(0, 1.45, 0.55);
    this.root.add(this.auraLight);

    // Soft glowing floor pool showing Wasuredama's illumination & pickup reach
    this.pickupFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 36),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffd28a,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.pickupFloorGlow.rotation.x = -Math.PI / 2;
    this.pickupFloorGlow.position.y = 0.025;
    this.root.add(this.pickupFloorGlow);

    this.pickupRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 44),
      new THREE.MeshBasicMaterial({
        color: 0xffe2a8,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.pickupRing.rotation.x = -Math.PI / 2;
    this.pickupRing.position.y = 0.032;
    this.root.add(this.pickupRing);

    // Warm star-glow radiating from Wasuredama's burlap sack (brightens as sack fills!)
    this.sackGlowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe096,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.sackGlowSprite.position.set(-0.35, 0.62, -0.18);
    this.sackGlowSprite.scale.set(0.85, 0.85, 1);
    this.modelPivot.add(this.sackGlowSprite);

    // Shield halo ring (when Hope Jars shield is active)
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.032, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x9cd8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.58;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D golden Lamp Bloom wave ring
    this.pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe59e,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 0.08;
    this.pulseRing.visible = false;
    this.root.add(this.pulseRing);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official GLB assets are normalized ~1.7m tall with feet at y = 0; scale nicely for plaza proportion
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
      this.walkAction.setEffectiveWeight(0.15);
    }
  }

  public setMotion(x: number, z: number, vx: number, vz: number, dt: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, 0, z);
    this.speed = Math.hypot(vx, vz);

    if (this.speed > 0.15) {
      const targetYaw = Math.atan2(vx, vz);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-12 * dt));
    }
  }

  public getSackWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.sackGlowSprite.getWorldPosition(out);
    return out;
  }

  public onPickup(): void {
    this.pickupPop = 1.0;
  }

  public onCelebrate(): void {
    this.celebrateTimer = 1.35;
    this.pickupPop = 1.0;
  }

  public onHazeHit(): void {
    this.hitFlashTimer = 0.55;
  }

  public onLampPulse(radius: number): void {
    this.pulseWaveTimer = 0.55;
    this.pulseWaveMaxRadius = radius;
    this.pickupPop = 1.0;
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    pickupRadius: number,
    sackRatio: number,
    shields: number
  ): void {
    this.pickupPop = Math.max(0, this.pickupPop - dt * 3.2);
    this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    if (!active) {
      // Gentle lobby idle facing slightly toward camera
      const lobbyYaw = Math.sin(elapsed * 0.5) * 0.22;
      this.yaw += (lobbyYaw - this.yaw) * (1 - Math.exp(-4 * dt));
      this.speed = 0;
    }

    // Mixamo animation cross-fading
    if (this.mixer && this.walkAction && this.runAction) {
      if (this.celebrateTimer > 0.12 || (active && (this.speed > 4.1 || (isFever && this.speed > 1.2)))) {
        if (this.activeAnim !== 'run') {
          this.activeAnim = 'run';
          this.runAction.reset().play();
          this.runAction.crossFadeFrom(this.walkAction, 0.16, true);
        }
        this.runAction.setEffectiveTimeScale(isFever ? 1.15 : 1.0);
        this.runAction.setEffectiveWeight(0.88);
      } else if (active && this.speed > 0.28) {
        if (this.activeAnim !== 'walk') {
          this.activeAnim = 'walk';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.18, true);
        }
        this.walkAction.setEffectiveTimeScale(0.75 + Math.min(0.7, this.speed * 0.18));
        this.walkAction.setEffectiveWeight(0.85);
      } else {
        if (this.activeAnim !== 'idle') {
          this.activeAnim = 'idle';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.22, true);
        }
        this.walkAction.setEffectiveTimeScale(0.14);
        this.walkAction.setEffectiveWeight(0.14);
      }
      this.mixer.update(dt);
    }

    // Expressive bounce, happy hop, and squash/stretch on pickup
    const beatBounce = Math.pow(1 - beatPhase, 3) * (isFever ? 0.08 : 0.032);
    const hop = this.celebrateTimer > 0 ? Math.abs(Math.sin(this.celebrateTimer * 10.5)) * 0.28 : 0;
    const shake = this.hitFlashTimer > 0 ? Math.sin(elapsed * 52) * 0.08 * this.hitFlashTimer : 0;

    this.modelPivot.position.set(shake, beatBounce + hop, 0);
    this.modelPivot.rotation.y = this.yaw;
    this.modelPivot.rotation.x = Math.min(0.14, this.speed * 0.025);

    if (this.model) {
      const pop = 1 + this.pickupPop * 0.08;
      this.modelPivot.scale.set(pop, 1 + this.pickupPop * 0.11, pop);
    }

    // Pickup light ring scales with streetLamp upgrade & Fever
    const effRadius = pickupRadius * (isFever ? 1.48 : 1.0);
    const ringPulse = 1 + Math.sin(elapsed * 3.8) * 0.03 + this.pickupPop * 0.06;
    this.pickupRing.scale.setScalar(effRadius * ringPulse);
    this.pickupFloorGlow.scale.setScalar(effRadius * 1.15);

    const ringMat = this.pickupRing.material as THREE.MeshBasicMaterial;
    ringMat.color.setHex(isFever ? 0xfff0a8 : 0xffd794);
    ringMat.opacity = isFever ? 0.68 : 0.34 + this.pickupPop * 0.25;

    const floorMat = this.pickupFloorGlow.material as THREE.MeshBasicMaterial;
    floorMat.opacity = isFever ? 0.56 : 0.32 + sackRatio * 0.16;

    // Sack star-glow grows as more lost items are collected
    const sackSize = 0.72 + sackRatio * 0.95 + this.pickupPop * 0.45;
    this.sackGlowSprite.scale.set(sackSize, sackSize, 1);
    (this.sackGlowSprite.material as THREE.SpriteMaterial).opacity =
      0.18 + sackRatio * 0.62 + this.pickupPop * 0.25;

    // Aura light
    this.auraLight.intensity = (isFever ? 4.4 : 3.0) + this.pickupPop * 1.2 + sackRatio * 0.8;
    this.auraLight.color.setHex(
      this.hitFlashTimer > 0.12 ? 0xc892ff : isFever ? 0xfff0be : 0xffd794
    );

    // Shield halo
    this.shieldAura.visible = shields > 0;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 0.85;
      (this.shieldAura.material as THREE.MeshBasicMaterial).opacity =
        0.36 + 0.18 * Math.sin(elapsed * 3.6);
    }

    // 3D Lamp Bloom wave expansion
    if (this.pulseWaveTimer > 0) {
      this.pulseWaveTimer = Math.max(0, this.pulseWaveTimer - dt);
      const prog = 1 - this.pulseWaveTimer / 0.55;
      this.pulseRing.visible = true;
      const r = 0.5 + prog * this.pulseWaveMaxRadius;
      this.pulseRing.scale.setScalar(r);
      (this.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.85;
    } else {
      this.pulseRing.visible = false;
    }
  }
}
