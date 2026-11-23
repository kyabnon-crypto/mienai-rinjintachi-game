import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Henjiro 3D character actor — the hedgehog reply-writer with round glasses & navy cap.
 * Loads official rigged henjiro.glb (Mixamo Walking / Running),
 * radiates a warm parchment & brass reach ring on the post-study floor,
 * glows softly with golden quill light while writing replies, and casts
 * an expanding ink-gold Quill Flourish ring.
 */
export class HenjiroActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private auraLight: THREE.PointLight;
  private reachRing: THREE.Mesh;
  private reachFloorGlow: THREE.Mesh;
  private quillHaloSprite: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private flourishRing: THREE.Mesh;

  public x = 0;
  public z = 0.55;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private flourishTimer = 0;
  private flourishMaxRadius = 4.1;
  private writingSpot = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);

    this.root.add(this.modelPivot);

    // Warm desk-lamp personal light so Henjiro's round glasses & navy cap read clearly
    this.auraLight = new THREE.PointLight(0xffcb82, 2.8, 8.5, 1.3);
    this.auraLight.position.set(0, 1.48, 0.55);
    this.root.add(this.auraLight);

    // Warm parchment-amber floor glow showing Henjiro's smoothing & writing reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 36),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xf4b96e,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachFloorGlow.rotation.x = -Math.PI / 2;
    this.reachFloorGlow.position.y = 0.028;
    this.root.add(this.reachFloorGlow);

    this.reachRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 44),
      new THREE.MeshBasicMaterial({
        color: 0xffdfa2,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.036;
    this.root.add(this.reachRing);

    // Soft quill sparkle halo near Henjiro's writing hand (grows with tray & writing!)
    this.quillHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe9b5,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.quillHaloSprite.position.set(0.26, 0.96, 0.24);
    this.quillHaloSprite.scale.set(0.82, 0.82, 1);
    this.modelPivot.add(this.quillHaloSprite);

    // Brass-and-moonlight shield aura ring (when glassesChair shield is active)
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.032, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xa6ccff,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D golden Quill Flourish ring
    this.flourishRing = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe09c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.flourishRing.rotation.x = -Math.PI / 2;
    this.flourishRing.position.y = 0.095;
    this.flourishRing.visible = false;
    this.root.add(this.flourishRing);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official henjiro.glb is 1.7m tall with feet at y = 0
    model.scale.setScalar(0.86);
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

  public setWritingSpot(writing: boolean): void {
    this.writingSpot = writing;
  }

  public getQuillOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.quillHaloSprite.getWorldPosition(out);
    return out;
  }

  public triggerPickupPop(): void {
    this.popTimer = 0.24;
  }

  public triggerCelebrate(): void {
    this.celebrateTimer = 0.72;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.45;
  }

  public triggerQuillFlourish(maxRadius: number): void {
    this.flourishTimer = 0.56;
    this.flourishMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.28);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    reachRadius: number,
    trayRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.flourishTimer > 0) this.flourishTimer = Math.max(0, this.flourishTimer - dt);

    // Animation blending (idle / walk / run)
    if (this.mixer && this.walkAction && this.runAction) {
      const desired: 'idle' | 'walk' | 'run' =
        !active || this.speed < 0.22
          ? 'idle'
          : this.speed > 4.1 || isFever
            ? 'run'
            : 'walk';

      if (desired !== this.activeAnim) {
        if (desired === 'idle') {
          this.runAction.fadeOut(0.18);
          this.walkAction.reset().play();
          this.walkAction.setEffectiveTimeScale(0.14);
          this.walkAction.setEffectiveWeight(0.14);
        } else if (desired === 'walk') {
          this.runAction.fadeOut(0.16);
          this.walkAction.reset().fadeIn(0.16).play();
          this.walkAction.setEffectiveTimeScale(1.22);
          this.walkAction.setEffectiveWeight(1);
        } else {
          this.walkAction.fadeOut(0.14);
          this.runAction.reset().fadeIn(0.14).play();
          this.runAction.setEffectiveTimeScale(1.18);
          this.runAction.setEffectiveWeight(1);
        }
        this.activeAnim = desired;
      }

      if (desired === 'walk') {
        this.walkAction.setEffectiveTimeScale(Math.max(0.75, Math.min(1.65, this.speed * 0.34)));
      } else if (desired === 'run') {
        this.runAction.setEffectiveTimeScale(Math.max(0.95, Math.min(1.5, this.speed * 0.26)));
      }
      this.mixer.update(dt);
    }

    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);
    const popLift = Math.sin((this.popTimer / 0.24) * Math.PI) * 0.14;
    const celLift =
      this.celebrateTimer > 0 ? Math.sin((this.celebrateTimer / 0.72) * Math.PI) * 0.24 : 0;
    const writeBob = this.writingSpot ? Math.sin(elapsed * 14) * 0.032 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.5) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + writeBob;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    // Gentle forward writing lean + subtle quill sway
    this.modelPivot.rotation.x = this.writingSpot ? 0.14 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.writingSpot
      ? Math.sin(elapsed * 13) * 0.06
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop = 1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Personal aura light
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x8892c9);
      this.auraLight.intensity = 2.6;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff0b8);
      this.auraLight.intensity = 4.4 + beatPulse * 1.1;
    } else if (this.writingSpot) {
      this.auraLight.color.setHex(0xffd284);
      this.auraLight.intensity = 3.6 + Math.sin(elapsed * 10) * 0.45;
    } else {
      this.auraLight.color.setHex(0xffcb82);
      this.auraLight.intensity = 2.7 + beatPulse * 0.55 + trayRatio * 0.65;
    }

    // Reach ring on floor
    const ringScale = reachRadius * (1 + beatPulse * 0.045);
    this.reachRing.scale.setScalar(ringScale);
    this.reachFloorGlow.scale.setScalar(ringScale * 1.16);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;
    if (isFever) {
      ringMat.color.setHex(0xfff2ba);
      ringMat.opacity = 0.72;
      glowMat.color.setHex(0xffdc88);
      glowMat.opacity = 0.54;
    } else if (this.writingSpot) {
      ringMat.color.setHex(0xffc978);
      ringMat.opacity = 0.68;
      glowMat.color.setHex(0xf2a854);
      glowMat.opacity = 0.52;
    } else {
      ringMat.color.setHex(0xffdfa2);
      ringMat.opacity = 0.36 + beatPulse * 0.16;
      glowMat.color.setHex(0xf4b96e);
      glowMat.opacity = 0.3 + trayRatio * 0.14;
    }

    // Quill halo sprite
    const haloScale =
      0.72 + trayRatio * 0.45 + (this.writingSpot ? 0.32 : 0) + (isFever ? 0.35 : 0);
    this.quillHaloSprite.scale.set(haloScale, haloScale, 1);
    const haloMat = this.quillHaloSprite.material as THREE.SpriteMaterial;
    haloMat.opacity = this.writingSpot
      ? 0.58 + Math.sin(elapsed * 12) * 0.14
      : 0.22 + trayRatio * 0.24 + (isFever ? 0.25 : 0);

    // Shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.3;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.42 + 0.18 * Math.sin(elapsed * 3.8);
    }

    // Expanding Quill Flourish 3D ring
    if (this.flourishTimer > 0) {
      this.flourishRing.visible = true;
      const p = 1 - this.flourishTimer / 0.56;
      const eased = 1 - Math.pow(1 - p, 2.5);
      this.flourishRing.scale.setScalar(0.55 + eased * this.flourishMaxRadius);
      const fm = this.flourishRing.material as THREE.MeshBasicMaterial;
      fm.opacity = (1 - p) * 0.84;
      fm.color.setHex(isFever ? 0xfff3be : 0xffd788);
    } else {
      this.flourishRing.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
