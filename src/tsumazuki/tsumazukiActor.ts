import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Tsumazuki 3D character actor — the hooded stair-landing watchman.
 * Loads official rigged tsumazuki.glb (Walking / Running),
 * radiates a serene teal & morning-gold time-dilation ripple ring on the floor,
 * glows near the outstretched hand while slowing time, and casts an expanding
 * "ほんのひと秒 (TIME SLOW)" wave ring.
 */
export class TsumazukiActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private auraLight: THREE.PointLight;
  private reachRing: THREE.Mesh;
  private reachInnerRing: THREE.Mesh;
  private reachFloorGlow: THREE.Mesh;
  private handHaloSprite: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private timeSlowRing: THREE.Mesh;
  private timeSlowRing2: THREE.Mesh;

  public x = 0;
  public z = 0.55;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private timeSlowWaveTimer = 0;
  private timeSlowMaxRadius = 4.3;
  private steadyingSpot = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);

    this.root.add(this.modelPivot);

    // Warm morning + teal personal light so Tsumazuki's hood & wooden name tag read clearly
    this.auraLight = new THREE.PointLight(0x9ee8dc, 2.7, 8.8, 1.28);
    this.auraLight.position.set(0, 1.48, 0.55);
    this.root.add(this.auraLight);

    // Soft teal-gold floor glow showing Tsumazuki's time-slow reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0x5cc9b8,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachFloorGlow.rotation.x = -Math.PI / 2;
    this.reachFloorGlow.position.y = 0.028;
    this.root.add(this.reachFloorGlow);

    this.reachRing = new THREE.Mesh(
      new THREE.RingGeometry(0.955, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xbdeee4,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.038;
    this.root.add(this.reachRing);

    // Inner counter-pulsing morning-gold ring (visualizing gentle time ripple)
    this.reachInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.71, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe4a8,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachInnerRing.rotation.x = -Math.PI / 2;
    this.reachInnerRing.position.y = 0.034;
    this.root.add(this.reachInnerRing);

    // Ethereal teal-gold sparkle halo near Tsumazuki's outstretched hand
    this.handHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xbef5ea,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.handHaloSprite.position.set(0.28, 0.96, 0.28);
    this.handHaloSprite.scale.set(0.84, 0.84, 1);
    this.modelPivot.add(this.handHaloSprite);

    // Teal cloak shield aura ring (when tealCloak shield is active)
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.032, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0x7ee6d4,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "ほんのひと秒" dual time-ripple rings
    this.timeSlowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0x9cf2e2,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.timeSlowRing.rotation.x = -Math.PI / 2;
    this.timeSlowRing.position.y = 0.095;
    this.timeSlowRing.visible = false;
    this.root.add(this.timeSlowRing);

    this.timeSlowRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffe4a0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.timeSlowRing2.rotation.x = -Math.PI / 2;
    this.timeSlowRing2.position.y = 0.14;
    this.timeSlowRing2.visible = false;
    this.root.add(this.timeSlowRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official tsumazuki.glb is 1.7m tall with feet at y = 0
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

  public setSteadyingSpot(steadying: boolean): void {
    this.steadyingSpot = steadying;
  }

  public getHandOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.handHaloSprite.getWorldPosition(out);
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

  public triggerTimeSlowWave(maxRadius: number): void {
    this.timeSlowWaveTimer = 0.78;
    this.timeSlowMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.3);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isTimeSlow: boolean,
    reachRadius: number,
    basketRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.timeSlowWaveTimer > 0) this.timeSlowWaveTimer = Math.max(0, this.timeSlowWaveTimer - dt);

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
          this.walkAction.setEffectiveTimeScale(1.2);
          this.walkAction.setEffectiveWeight(1);
        } else {
          this.walkAction.fadeOut(0.14);
          this.runAction.reset().fadeIn(0.14).play();
          this.runAction.setEffectiveTimeScale(1.16);
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
    const steadyFloat = this.steadyingSpot ? Math.sin(elapsed * 8) * 0.035 + 0.04 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.4) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + steadyFloat;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    // Gentle reaching-out lean when slowing time for a resident
    this.modelPivot.rotation.x = this.steadyingSpot ? 0.14 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.steadyingSpot
      ? Math.sin(elapsed * 7) * 0.045
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop = 1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Personal aura light
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0xe89078);
      this.auraLight.intensity = 2.6;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff0be);
      this.auraLight.intensity = 4.4 + beatPulse * 1.1;
    } else if (isTimeSlow || this.steadyingSpot) {
      this.auraLight.color.setHex(0x88f0de);
      this.auraLight.intensity = 3.7 + Math.sin(elapsed * 9) * 0.4;
    } else {
      this.auraLight.color.setHex(0x9ee8dc);
      this.auraLight.intensity = 2.6 + beatPulse * 0.55 + basketRatio * 0.65;
    }

    // Time-slow reach rings on floor
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isTimeSlow ? 0.08 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.4) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff3be);
      ringMat.opacity = 0.74;
      innerMat.color.setHex(0x9ff5e6);
      innerMat.opacity = 0.55;
      glowMat.color.setHex(0xffdf8c);
      glowMat.opacity = 0.52;
    } else if (isTimeSlow || this.steadyingSpot) {
      ringMat.color.setHex(0x9ef5e6);
      ringMat.opacity = 0.72;
      innerMat.color.setHex(0xffe6a6);
      innerMat.opacity = 0.52;
      glowMat.color.setHex(0x5ed6c2);
      glowMat.opacity = 0.5;
    } else {
      ringMat.color.setHex(0xbdeee4);
      ringMat.opacity = 0.4 + beatPulse * 0.16;
      innerMat.color.setHex(0xffe4a8);
      innerMat.opacity = 0.24 + beatPulse * 0.12;
      glowMat.color.setHex(0x5cc9b8);
      glowMat.opacity = 0.28 + basketRatio * 0.14;
    }

    // Hand halo sprite
    const haloScale =
      0.74 + basketRatio * 0.44 + (this.steadyingSpot || isTimeSlow ? 0.36 : 0) + (isFever ? 0.36 : 0);
    this.handHaloSprite.scale.set(haloScale, haloScale, 1);
    const haloMat = this.handHaloSprite.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.steadyingSpot || isTimeSlow
        ? 0.62 + Math.sin(elapsed * 10) * 0.14
        : 0.24 + basketRatio * 0.22 + (isFever ? 0.26 : 0);
    haloMat.color.setHex(isFever ? 0xfff0b8 : 0xbef5ea);

    // Shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.25;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.42 + 0.18 * Math.sin(elapsed * 3.6);
    }

    // Expanding dual Time-Slow ripple rings
    if (this.timeSlowWaveTimer > 0) {
      this.timeSlowRing.visible = true;
      this.timeSlowRing2.visible = true;
      const p = 1 - this.timeSlowWaveTimer / 0.78;
      const eased = 1 - Math.pow(1 - p, 2.6);
      this.timeSlowRing.scale.setScalar(0.55 + eased * this.timeSlowMaxRadius);
      this.timeSlowRing2.scale.setScalar(0.35 + eased * this.timeSlowMaxRadius * 0.84);
      const fm1 = this.timeSlowRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.timeSlowRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.88;
      fm2.opacity = (1 - p) * 0.72;
      fm1.color.setHex(isFever ? 0xfff3be : 0x9cf2e2);
      fm2.color.setHex(0xffe29c);
    } else {
      this.timeSlowRing.visible = false;
      this.timeSlowRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
