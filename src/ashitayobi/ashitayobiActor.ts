import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function createMiniSunriseSunGeo(outerR: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const innerR = outerR * 0.56;
  const rays = 16;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + Math.PI / 2;
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
 * Ashitayobi 3D character actor — the cheerful Dawn Postman ("朝焼け配達人 アシタヨビ").
 * Loads official rigged ashitayobi.glb (Walking / Running, 1.7m tall),
 * carries his luminous Dawn Glass Jar ("朝焼けのガラス瓶") with a spinning golden sunrise sun inside
 * and brass cap that lifts when delivering "特別な朝焼け (DAWN DELIVERY)",
 * radiates a warm orange-rose-gold dawn-gathering ring on the post office floor,
 * and casts an expanding dual sunrise wave.
 */
export class AshitayobiActor {
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
  private jarCap: THREE.Mesh;
  private jarSun: THREE.Mesh;
  private jarHalo: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private dawnWaveRing: THREE.Mesh;
  private dawnWaveRing2: THREE.Mesh;

  public x = 0;
  public z = 0.65;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private dawnWaveTimer = 0;
  private dawnWaveMaxRadius = 4.6;
  private deliveringDawn = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);
    this.root.add(this.modelPivot);

    // Warm orange-golden dawn light illuminating Ashitayobi and nearby floor planks
    this.auraLight = new THREE.PointLight(0xffb86c, 3.0, 9.8, 1.24);
    this.auraLight.position.set(0, 1.45, 0.55);
    this.root.add(this.auraLight);

    // Soft sunrise floor glow showing Ashitayobi's dawn gathering reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffa468,
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
        color: 0xffd278,
        transparent: true,
        opacity: 0.58,
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
        color: 0xff9ec2,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachInnerRing.rotation.x = -Math.PI / 2;
    this.reachInnerRing.position.y = 0.034;
    this.root.add(this.reachInnerRing);

    // Ashitayobi's signature glowing Dawn Glass Jar ("朝焼けのガラス瓶") hovering by his hands
    this.jarGroup = new THREE.Group();
    this.jarGroup.position.set(-0.36, 0.88, 0.36);

    const jarPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.115, 0),
      new THREE.Vector2(0.13, 0.025),
      new THREE.Vector2(0.13, 0.22),
      new THREE.Vector2(0.095, 0.265),
      new THREE.Vector2(0.075, 0.285),
      new THREE.Vector2(0.075, 0.315),
    ];
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffeef2,
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
      new THREE.TorusGeometry(0.076, 0.009, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xe6b84e, metalness: 0.84, roughness: 0.26 })
    );
    brassRim.rotation.x = Math.PI / 2;
    brassRim.position.y = 0.155;

    this.jarCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.078, 0.048, 16),
      new THREE.MeshStandardMaterial({ color: 0xdfa83e, metalness: 0.78, roughness: 0.32 })
    );
    this.jarCap.position.y = 0.182;

    this.jarSun = new THREE.Mesh(
      createMiniSunriseSunGeo(0.082),
      new THREE.MeshStandardMaterial({
        color: 0xfff0b2,
        emissive: 0xff9a3c,
        emissiveIntensity: 1.6,
        roughness: 0.25,
      })
    );
    this.jarSun.position.y = -0.02;

    this.jarHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffb868,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.jarHalo.position.y = 0.0;
    this.jarHalo.scale.set(0.9, 0.9, 1);

    this.jarGroup.add(glassBody, brassRim, this.jarCap, this.jarSun, this.jarHalo);
    this.modelPivot.add(this.jarGroup);

    // Warm yellow scarf "大丈夫のぬくもり" shield aura ring
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.036, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffd278,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "特別な朝焼け (DAWN DELIVERY)" dual orange-gold & rose sunrise wave rings
    this.dawnWaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffb258,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.dawnWaveRing.rotation.x = -Math.PI / 2;
    this.dawnWaveRing.position.y = 0.095;
    this.dawnWaveRing.visible = false;
    this.root.add(this.dawnWaveRing);

    this.dawnWaveRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xff9ec2,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.dawnWaveRing2.rotation.x = -Math.PI / 2;
    this.dawnWaveRing2.position.y = 0.14;
    this.dawnWaveRing2.visible = false;
    this.root.add(this.dawnWaveRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official ashitayobi.glb is 1.7m tall with feet at y = 0
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

  public setDeliveringDawn(delivering: boolean): void {
    this.deliveringDawn = delivering;
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

  public triggerDawnWave(maxRadius: number): void {
    this.dawnWaveTimer = 0.88;
    this.dawnWaveMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.34);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isDeliveringWave: boolean,
    reachRadius: number,
    satchelRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.dawnWaveTimer > 0) this.dawnWaveTimer = Math.max(0, this.dawnWaveTimer - dt);

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
      this.celebrateTimer > 0 ? Math.sin((this.celebrateTimer / 0.72) * Math.PI) * 0.26 : 0;
    const deliverBob = this.deliveringDawn ? Math.sin(elapsed * 7.2) * 0.026 + 0.026 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.4) * 0.025 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + deliverBob;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    this.modelPivot.rotation.x = this.deliveringDawn ? 0.1 : Math.min(0.13, this.speed * 0.022);
    this.modelPivot.rotation.z = this.deliveringDawn
      ? Math.sin(elapsed * 6.2) * 0.032
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop =
      1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Floating Dawn Glass Jar & brass cap lifting during "特別な朝焼け"
    const capLift =
      isDeliveringWave || isFever ? 0.12 + Math.sin(elapsed * 7) * 0.025 : this.deliveringDawn ? 0.05 : 0;
    this.jarGroup.position.y = 0.88 + Math.sin(elapsed * 2.8) * 0.045 + (isDeliveringWave ? 0.12 : 0);
    this.jarGroup.rotation.z = Math.sin(elapsed * 2.1) * 0.06;
    this.jarCap.position.y = 0.182 + capLift;
    this.jarCap.rotation.z = capLift * 2.8;
    this.jarSun.rotation.y = elapsed * (isDeliveringWave || isFever ? 4.4 : 1.6);
    this.jarSun.position.y = -0.02 + Math.sin(elapsed * 3.8) * 0.025 + capLift * 0.35;

    // Personal warm dawn light aura
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x6c7c9e);
      this.auraLight.intensity = 2.3;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff0b8);
      this.auraLight.intensity = 4.9 + beatPulse * 1.1;
    } else if (isDeliveringWave || this.deliveringDawn) {
      this.auraLight.color.setHex(0xffc888);
      this.auraLight.intensity = 4.2 + Math.sin(elapsed * 8.0) * 0.45;
    } else {
      this.auraLight.color.setHex(0xffb86c);
      this.auraLight.intensity = 3.0 + beatPulse * 0.55 + satchelRatio * 0.65;
    }

    // Ground dawn-gathering reach rings
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isDeliveringWave ? 0.1 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.2) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff4c4);
      ringMat.opacity = 0.85;
      innerMat.color.setHex(0xffb4cc);
      innerMat.opacity = 0.66;
      glowMat.color.setHex(0xffc870);
      glowMat.opacity = 0.54;
    } else if (isDeliveringWave || this.deliveringDawn) {
      ringMat.color.setHex(0xffe094);
      ringMat.opacity = 0.78;
      innerMat.color.setHex(0xffb4cc);
      innerMat.opacity = 0.6;
      glowMat.color.setHex(0xffb878);
      glowMat.opacity = 0.46;
    } else {
      ringMat.color.setHex(0xffd278);
      ringMat.opacity = 0.48 + beatPulse * 0.16;
      innerMat.color.setHex(0xff9ec2);
      innerMat.opacity = 0.32 + beatPulse * 0.12;
      glowMat.color.setHex(0xffa468);
      glowMat.opacity = 0.26 + satchelRatio * 0.16;
    }

    // Jar halo glow
    const haloScale =
      0.84 + satchelRatio * 0.42 + (this.deliveringDawn || isDeliveringWave ? 0.44 : 0) + (isFever ? 0.38 : 0);
    this.jarHalo.scale.set(haloScale, haloScale, 1);
    const haloMat = this.jarHalo.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.deliveringDawn || isDeliveringWave
        ? 0.82 + Math.sin(elapsed * 9) * 0.14
        : 0.48 + satchelRatio * 0.22 + (isFever ? 0.24 : 0);
    haloMat.color.setHex(isFever ? 0xfff5c8 : isDeliveringWave ? 0xffb894 : 0xffb868);

    // Scarf warmth shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.15;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.44 + 0.18 * Math.sin(elapsed * 3.4);
    }

    // Expanding dual "特別な朝焼け (DAWN DELIVERY)" sunrise ripple rings
    if (this.dawnWaveTimer > 0) {
      this.dawnWaveRing.visible = true;
      this.dawnWaveRing2.visible = true;
      const p = 1 - this.dawnWaveTimer / 0.88;
      const eased = 1 - Math.pow(1 - p, 2.5);
      this.dawnWaveRing.scale.setScalar(0.55 + eased * this.dawnWaveMaxRadius);
      this.dawnWaveRing2.scale.setScalar(0.35 + eased * this.dawnWaveMaxRadius * 0.84);
      const fm1 = this.dawnWaveRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.dawnWaveRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.92;
      fm2.opacity = (1 - p) * 0.78;
      fm1.color.setHex(isFever ? 0xfff6c0 : 0xffb258);
      fm2.color.setHex(0xff9ec2);
    } else {
      this.dawnWaveRing.visible = false;
      this.dawnWaveRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
