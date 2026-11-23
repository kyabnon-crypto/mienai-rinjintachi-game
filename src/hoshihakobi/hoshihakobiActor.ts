import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function createMiniStarGeo(outerR: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const innerR = outerR * 0.45;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? innerR : outerR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const depth = outerR * 0.34;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: outerR * 0.08,
    bevelSize: outerR * 0.06,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/**
 * Hoshihakobi 3D character actor — the star carrier walking softly across nighttime rooftops.
 * Loads official rigged hoshihakobi.glb (Walking / Running, 1.7m tall),
 * carries his glowing Starlight Wand ("星明かりの杖") near the right hand,
 * radiates a starry indigo-gold constellation reach ring on the attic wood floor,
 * and casts an expanding dual "星の並べ替え (STAR SHIFT)" celestial wave.
 */
export class HoshihakobiActor {
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
  private wandGroup: THREE.Group;
  private wandTipHalo: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private shiftWaveRing: THREE.Mesh;
  private shiftWaveRing2: THREE.Mesh;

  public x = 0;
  public z = 0.55;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private shiftWaveTimer = 0;
  private shiftWaveMaxRadius = 4.6;
  private aligningStars = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);
    this.root.add(this.modelPivot);

    // Warm starlight glow illuminating Hoshihakobi and nearby attic floorboards
    this.auraLight = new THREE.PointLight(0xffe094, 2.9, 9.6, 1.24);
    this.auraLight.position.set(0, 1.48, 0.55);
    this.root.add(this.auraLight);

    // Soft starlight floor glow showing Hoshihakobi's constellation reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0x9ac4ff,
        transparent: true,
        opacity: 0.34,
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
        color: 0xffe496,
        transparent: true,
        opacity: 0.56,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.038;
    this.root.add(this.reachRing);

    this.reachInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.71, 40),
      new THREE.MeshBasicMaterial({
        color: 0xa4d2ff,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachInnerRing.rotation.x = -Math.PI / 2;
    this.reachInnerRing.position.y = 0.034;
    this.root.add(this.reachInnerRing);

    // Hoshihakobi's signature Starlight Wand ("星明かりの杖") floating near right hand
    this.wandGroup = new THREE.Group();
    this.wandGroup.position.set(0.38, 0.88, 0.32);
    this.wandGroup.rotation.z = -0.32;
    this.wandGroup.rotation.x = 0.24;

    const woodShaftMat = new THREE.MeshStandardMaterial({
      color: 0x6b472c,
      roughness: 0.65,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe4bc56,
      metalness: 0.84,
      roughness: 0.26,
    });
    const starTipMat = new THREE.MeshStandardMaterial({
      color: 0xfff0a8,
      emissive: 0xffcf5c,
      emissiveIntensity: 1.35,
      roughness: 0.28,
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.58, 10), woodShaftMat);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.06, 12), goldMat);
    collar.position.y = 0.28;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), goldMat);
    pommel.position.y = -0.29;
    const starTip = new THREE.Mesh(createMiniStarGeo(0.11), starTipMat);
    starTip.position.y = 0.38;
    this.wandGroup.add(shaft, collar, pommel, starTip);

    this.wandTipHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe49c,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.wandTipHalo.position.y = 0.38;
    this.wandTipHalo.scale.set(0.84, 0.84, 1);
    this.wandGroup.add(this.wandTipHalo);
    this.modelPivot.add(this.wandGroup);

    // Cozy quilted bed peace-of-mind shield aura ring
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.036, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0x9ac8ff,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "星の並べ替え (STAR SHIFT)" dual starlight-cobalt wave rings
    this.shiftWaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffe89c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.shiftWaveRing.rotation.x = -Math.PI / 2;
    this.shiftWaveRing.position.y = 0.095;
    this.shiftWaveRing.visible = false;
    this.root.add(this.shiftWaveRing);

    this.shiftWaveRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0x9cd2ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.shiftWaveRing2.rotation.x = -Math.PI / 2;
    this.shiftWaveRing2.position.y = 0.14;
    this.shiftWaveRing2.visible = false;
    this.root.add(this.shiftWaveRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official hoshihakobi.glb is 1.7m tall with feet at y = 0
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

  public setAligningStars(aligning: boolean): void {
    this.aligningStars = aligning;
  }

  public getWandOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.wandTipHalo.getWorldPosition(out);
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

  public triggerStarShiftWave(maxRadius: number): void {
    this.shiftWaveTimer = 0.85;
    this.shiftWaveMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.34);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isStarShifting: boolean,
    reachRadius: number,
    crateRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.shiftWaveTimer > 0) this.shiftWaveTimer = Math.max(0, this.shiftWaveTimer - dt);

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
    const alignBob = this.aligningStars ? Math.sin(elapsed * 7.5) * 0.025 + 0.025 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.2) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + alignBob;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    this.modelPivot.rotation.x = this.aligningStars ? 0.11 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.aligningStars
      ? Math.sin(elapsed * 6.5) * 0.035
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop =
      1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Starlight wand sway & flourish when shifting constellations
    this.wandGroup.position.y = 0.88 + Math.sin(elapsed * 3.1) * 0.045;
    this.wandGroup.rotation.z =
      -0.32 + Math.sin(elapsed * (isStarShifting || this.aligningStars ? 8.5 : 2.6)) * 0.18;
    this.wandGroup.rotation.y = elapsed * (isStarShifting || isFever ? 3.2 : 0.7);

    // Personal warm starlight aura
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x8878c8);
      this.auraLight.intensity = 2.4;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff4bc);
      this.auraLight.intensity = 4.8 + beatPulse * 1.1;
    } else if (isStarShifting || this.aligningStars) {
      this.auraLight.color.setHex(0xffe494);
      this.auraLight.intensity = 4.1 + Math.sin(elapsed * 8.5) * 0.45;
    } else {
      this.auraLight.color.setHex(0xffe094);
      this.auraLight.intensity = 2.9 + beatPulse * 0.55 + crateRatio * 0.65;
    }

    // Ground constellation reach rings
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isStarShifting ? 0.1 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.2) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff5c4);
      ringMat.opacity = 0.82;
      innerMat.color.setHex(0xb8e4ff);
      innerMat.opacity = 0.62;
      glowMat.color.setHex(0xffdf7a);
      glowMat.opacity = 0.52;
    } else if (isStarShifting || this.aligningStars) {
      ringMat.color.setHex(0xffeba4);
      ringMat.opacity = 0.76;
      innerMat.color.setHex(0xa8dcff);
      innerMat.opacity = 0.58;
      glowMat.color.setHex(0x8ec4ff);
      glowMat.opacity = 0.46;
    } else {
      ringMat.color.setHex(0xffe496);
      ringMat.opacity = 0.44 + beatPulse * 0.16;
      innerMat.color.setHex(0xa4d2ff);
      innerMat.opacity = 0.28 + beatPulse * 0.12;
      glowMat.color.setHex(0x9ac4ff);
      glowMat.opacity = 0.26 + crateRatio * 0.16;
    }

    // Starlight wand tip halo
    const haloScale =
      0.78 + crateRatio * 0.42 + (this.aligningStars || isStarShifting ? 0.42 : 0) + (isFever ? 0.38 : 0);
    this.wandTipHalo.scale.set(haloScale, haloScale, 1);
    const haloMat = this.wandTipHalo.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.aligningStars || isStarShifting
        ? 0.78 + Math.sin(elapsed * 9) * 0.14
        : 0.38 + crateRatio * 0.22 + (isFever ? 0.24 : 0);
    haloMat.color.setHex(isFever ? 0xfff8c8 : isStarShifting ? 0xc2e6ff : 0xffe49c);

    // Fluffy bed shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.15;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.44 + 0.18 * Math.sin(elapsed * 3.4);
    }

    // Expanding dual STAR SHIFT celestial ripple rings
    if (this.shiftWaveTimer > 0) {
      this.shiftWaveRing.visible = true;
      this.shiftWaveRing2.visible = true;
      const p = 1 - this.shiftWaveTimer / 0.85;
      const eased = 1 - Math.pow(1 - p, 2.5);
      this.shiftWaveRing.scale.setScalar(0.55 + eased * this.shiftWaveMaxRadius);
      this.shiftWaveRing2.scale.setScalar(0.35 + eased * this.shiftWaveMaxRadius * 0.84);
      const fm1 = this.shiftWaveRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.shiftWaveRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.92;
      fm2.opacity = (1 - p) * 0.76;
      fm1.color.setHex(isFever ? 0xfff6c0 : 0xffe89c);
      fm2.color.setHex(0x9cd2ff);
    } else {
      this.shiftWaveRing.visible = false;
      this.shiftWaveRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
