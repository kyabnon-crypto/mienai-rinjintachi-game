import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function createMiniDreamStarGeo(outerR: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const innerR = outerR * 0.44;
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
 * Yumeatsume 3D character actor — the gentle keeper of the Dream Conservatory ("夢の保管庫の管理人").
 * Loads official rigged yumeatsume.glb (Walking / Running, 1.7m tall),
 * carries his luminous Dream Glass Jar ("光のガラス瓶") with a spinning golden star inside
 * and a cork lid that pops open when whispering "おかえり (LID OPEN)",
 * radiates a warm amber-rose dream-gathering ring on the greenhouse floor,
 * and casts an expanding dual awakening wave.
 */
export class YumeatsumeActor {
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
  private jarGroup: THREE.Group;
  private jarLid: THREE.Mesh;
  private jarStar: THREE.Mesh;
  private jarHalo: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private lidWaveRing: THREE.Mesh;
  private lidWaveRing2: THREE.Mesh;

  public x = 0;
  public z = 0.65;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private lidWaveTimer = 0;
  private lidWaveMaxRadius = 4.6;
  private awakeningDream = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);
    this.root.add(this.modelPivot);

    // Warm golden-amber dreamlight illuminating Yumeatsume and nearby conservatory tiles
    this.auraLight = new THREE.PointLight(0xffd996, 2.9, 9.6, 1.24);
    this.auraLight.position.set(0, 1.45, 0.55);
    this.root.add(this.auraLight);

    // Soft rose-gold floor glow showing Yumeatsume's dream gathering reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffc4d6,
        transparent: true,
        opacity: 0.32,
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
        color: 0xffe094,
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
        color: 0x9de8d4,
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

    // Yumeatsume's signature glowing Dream Glass Jar ("光のガラス瓶") hovering by his hands
    this.jarGroup = new THREE.Group();
    this.jarGroup.position.set(0.36, 0.86, 0.36);

    const jarPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.115, 0),
      new THREE.Vector2(0.13, 0.025),
      new THREE.Vector2(0.13, 0.22),
      new THREE.Vector2(0.095, 0.265),
      new THREE.Vector2(0.072, 0.285),
      new THREE.Vector2(0.072, 0.315),
    ];
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xe6f4f6,
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glassBody = new THREE.Mesh(new THREE.LatheGeometry(jarPoints, 22), glassMat);
    glassBody.position.y = -0.15;

    const brassRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.009, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xdfb452, metalness: 0.82, roughness: 0.28 })
    );
    brassRim.rotation.x = Math.PI / 2;
    brassRim.position.y = 0.155;

    this.jarLid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.06, 0.06, 14),
      new THREE.MeshStandardMaterial({ color: 0xb98a54, roughness: 0.9 })
    );
    this.jarLid.position.y = 0.185;

    this.jarStar = new THREE.Mesh(
      createMiniDreamStarGeo(0.078),
      new THREE.MeshStandardMaterial({
        color: 0xfff0b2,
        emissive: 0xffc852,
        emissiveIntensity: 1.5,
        roughness: 0.25,
      })
    );
    this.jarStar.position.y = -0.02;

    this.jarHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffdf94,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.jarHalo.position.y = 0.0;
    this.jarHalo.scale.set(0.86, 0.86, 1);

    this.jarGroup.add(glassBody, brassRim, this.jarLid, this.jarStar, this.jarHalo);
    this.modelPivot.add(this.jarGroup);

    // Cotton-candy rose peace-of-mind shield aura ring
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.036, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffb8d4,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "おかえり (LID OPEN)" dual golden-rose awakening wave rings
    this.lidWaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffe296,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.lidWaveRing.rotation.x = -Math.PI / 2;
    this.lidWaveRing.position.y = 0.095;
    this.lidWaveRing.visible = false;
    this.root.add(this.lidWaveRing);

    this.lidWaveRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffb8d4,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.lidWaveRing2.rotation.x = -Math.PI / 2;
    this.lidWaveRing2.position.y = 0.14;
    this.lidWaveRing2.visible = false;
    this.root.add(this.lidWaveRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official yumeatsume.glb is 1.7m tall with feet at y = 0
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

  public setAwakeningDream(awakening: boolean): void {
    this.awakeningDream = awakening;
  }

  public getJarOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.jarHalo.getWorldPosition(out);
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

  public triggerLidOpenWave(maxRadius: number): void {
    this.lidWaveTimer = 0.88;
    this.lidWaveMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.34);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isLidOpening: boolean,
    reachRadius: number,
    satchelRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.lidWaveTimer > 0) this.lidWaveTimer = Math.max(0, this.lidWaveTimer - dt);

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
    const awakenBob = this.awakeningDream ? Math.sin(elapsed * 7.2) * 0.025 + 0.025 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.2) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + awakenBob;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    this.modelPivot.rotation.x = this.awakeningDream ? 0.1 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.awakeningDream
      ? Math.sin(elapsed * 6.2) * 0.032
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop =
      1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Floating Dream Glass Jar & popping cork lid during "おかえり"
    const lidLift = isLidOpening || isFever ? 0.12 + Math.sin(elapsed * 7) * 0.025 : this.awakeningDream ? 0.05 : 0;
    this.jarGroup.position.y = 0.86 + Math.sin(elapsed * 2.8) * 0.045 + (isLidOpening ? 0.12 : 0);
    this.jarGroup.rotation.z = Math.sin(elapsed * 2.1) * 0.06;
    this.jarLid.position.y = 0.185 + lidLift;
    this.jarLid.rotation.z = lidLift * 2.8;
    this.jarStar.rotation.y = elapsed * (isLidOpening || isFever ? 4.4 : 1.6);
    this.jarStar.position.y = -0.02 + Math.sin(elapsed * 3.8) * 0.025 + lidLift * 0.35;

    // Personal warm dreamlight aura
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x6c7c9e);
      this.auraLight.intensity = 2.3;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff0c0);
      this.auraLight.intensity = 4.8 + beatPulse * 1.1;
    } else if (isLidOpening || this.awakeningDream) {
      this.auraLight.color.setHex(0xffd6a6);
      this.auraLight.intensity = 4.2 + Math.sin(elapsed * 8.0) * 0.45;
    } else {
      this.auraLight.color.setHex(0xffd996);
      this.auraLight.intensity = 2.9 + beatPulse * 0.55 + satchelRatio * 0.65;
    }

    // Ground dream-gathering reach rings
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isLidOpening ? 0.1 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.2) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff4c4);
      ringMat.opacity = 0.84;
      innerMat.color.setHex(0xffc2dc);
      innerMat.opacity = 0.65;
      glowMat.color.setHex(0xffd888);
      glowMat.opacity = 0.52;
    } else if (isLidOpening || this.awakeningDream) {
      ringMat.color.setHex(0xffe6a0);
      ringMat.opacity = 0.78;
      innerMat.color.setHex(0xffc4dc);
      innerMat.opacity = 0.6;
      glowMat.color.setHex(0xffd2a8);
      glowMat.opacity = 0.46;
    } else {
      ringMat.color.setHex(0xffe094);
      ringMat.opacity = 0.46 + beatPulse * 0.16;
      innerMat.color.setHex(0x9de8d4);
      innerMat.opacity = 0.3 + beatPulse * 0.12;
      glowMat.color.setHex(0xffc4d6);
      glowMat.opacity = 0.25 + satchelRatio * 0.16;
    }

    // Jar halo glow
    const haloScale =
      0.8 + satchelRatio * 0.42 + (this.awakeningDream || isLidOpening ? 0.44 : 0) + (isFever ? 0.38 : 0);
    this.jarHalo.scale.set(haloScale, haloScale, 1);
    const haloMat = this.jarHalo.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.awakeningDream || isLidOpening
        ? 0.8 + Math.sin(elapsed * 9) * 0.14
        : 0.44 + satchelRatio * 0.22 + (isFever ? 0.24 : 0);
    haloMat.color.setHex(isFever ? 0xfff5c8 : isLidOpening ? 0xffc8dc : 0xffdf94);

    // Cotton-candy shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.15;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.44 + 0.18 * Math.sin(elapsed * 3.4);
    }

    // Expanding dual "おかえり (LID OPEN)" awakening ripple rings
    if (this.lidWaveTimer > 0) {
      this.lidWaveRing.visible = true;
      this.lidWaveRing2.visible = true;
      const p = 1 - this.lidWaveTimer / 0.88;
      const eased = 1 - Math.pow(1 - p, 2.5);
      this.lidWaveRing.scale.setScalar(0.55 + eased * this.lidWaveMaxRadius);
      this.lidWaveRing2.scale.setScalar(0.35 + eased * this.lidWaveMaxRadius * 0.84);
      const fm1 = this.lidWaveRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.lidWaveRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.92;
      fm2.opacity = (1 - p) * 0.78;
      fm1.color.setHex(isFever ? 0xfff6c0 : 0xffe296);
      fm2.color.setHex(0xffb8d4);
    } else {
      this.lidWaveRing.visible = false;
      this.lidWaveRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
