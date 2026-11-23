import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Tomerun 3D character actor — the time preserver at the back of the fridge.
 * Loads official rigged tomerun.glb (Walking / Running, 1.7m tall),
 * carries a glowing brass hourglass lantern near the right hand,
 * radiates a golden-frost preservation ring on the tiled floor,
 * and casts an expanding dual "バルブ回し (VALVE PAUSE)" time-suspension wave.
 */
export class TomerunActor {
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
  private handLanternGroup: THREE.Group;
  private handLanternHalo: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private valveWaveRing: THREE.Mesh;
  private valveWaveRing2: THREE.Mesh;

  public x = 0;
  public z = 0.55;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private valveWaveTimer = 0;
  private valveWaveMaxRadius = 4.6;
  private preservingTime = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);
    this.root.add(this.modelPivot);

    // Warm golden hourglass light contrasting against the frosty fridge vault
    this.auraLight = new THREE.PointLight(0xffd794, 2.8, 9.4, 1.24);
    this.auraLight.position.set(0, 1.46, 0.55);
    this.root.add(this.auraLight);

    // Soft frost-gold floor glow showing Tomerun's time-preservation reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0x9cd2f6,
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
        color: 0xffe09c,
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
        color: 0x9edcff,
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

    // Miniature handheld brass hourglass lantern floating gently beside Tomerun's right hand
    this.handLanternGroup = new THREE.Group();
    this.handLanternGroup.position.set(0.36, 0.86, 0.28);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9ae52,
      metalness: 0.82,
      roughness: 0.28,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xfff0cc,
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
    });
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xffc65c,
      emissiveIntensity: 1.25,
      roughness: 0.35,
    });
    const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.024, 14), brassMat);
    capBot.position.y = -0.11;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.024, 14), brassMat);
    capTop.position.y = 0.11;
    const bodyGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.2, 12), glassMat);
    const sandCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 1), sandMat);
    sandCore.scale.set(0.85, 1.35, 0.85);
    this.handLanternGroup.add(capBot, capTop, bodyGlass, sandCore);

    this.handLanternHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffdf9a,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.handLanternHalo.scale.set(0.76, 0.76, 1);
    this.handLanternGroup.add(this.handLanternHalo);
    this.modelPivot.add(this.handLanternGroup);

    // Blue fluffy blanket shield aura ring
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.036, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0x86c8ff,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "バルブ回し (VALVE PAUSE)" dual golden-frost wave rings
    this.valveWaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffe49c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.valveWaveRing.rotation.x = -Math.PI / 2;
    this.valveWaveRing.position.y = 0.095;
    this.valveWaveRing.visible = false;
    this.root.add(this.valveWaveRing);

    this.valveWaveRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xa4e2ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.valveWaveRing2.rotation.x = -Math.PI / 2;
    this.valveWaveRing2.position.y = 0.14;
    this.valveWaveRing2.visible = false;
    this.root.add(this.valveWaveRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official tomerun.glb is 1.7m tall with feet at y = 0
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

  public setPreservingTime(preserving: boolean): void {
    this.preservingTime = preserving;
  }

  public getLanternOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.handLanternHalo.getWorldPosition(out);
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

  public triggerValveWave(maxRadius: number): void {
    this.valveWaveTimer = 0.85;
    this.valveWaveMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.32);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isValvePaused: boolean,
    reachRadius: number,
    jarRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.valveWaveTimer > 0) this.valveWaveTimer = Math.max(0, this.valveWaveTimer - dt);

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
    const preserveBob = this.preservingTime ? Math.sin(elapsed * 7.5) * 0.025 + 0.025 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.2) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + preserveBob;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    this.modelPivot.rotation.x = this.preservingTime ? 0.12 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.preservingTime
      ? Math.sin(elapsed * 6.5) * 0.035
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop =
      1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Handheld hourglass lantern gentle sway & spin when turning valve
    this.handLanternGroup.position.y = 0.86 + Math.sin(elapsed * 3.1) * 0.04;
    this.handLanternGroup.rotation.y = elapsed * (isValvePaused || isFever ? 3.8 : 1.1);

    // Personal hourglass light
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x9a88d8);
      this.auraLight.intensity = 2.5;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff1ba);
      this.auraLight.intensity = 4.7 + beatPulse * 1.1;
    } else if (isValvePaused || this.preservingTime) {
      this.auraLight.color.setHex(0xffe096);
      this.auraLight.intensity = 4.0 + Math.sin(elapsed * 8.5) * 0.45;
    } else {
      this.auraLight.color.setHex(0xffd794);
      this.auraLight.intensity = 2.8 + beatPulse * 0.55 + jarRatio * 0.65;
    }

    // Ground preservation reach rings
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isValvePaused ? 0.1 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.2) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff4c2);
      ringMat.opacity = 0.8;
      innerMat.color.setHex(0xb8ecff);
      innerMat.opacity = 0.6;
      glowMat.color.setHex(0xffda78);
      glowMat.opacity = 0.52;
    } else if (isValvePaused || this.preservingTime) {
      ringMat.color.setHex(0xffe8a6);
      ringMat.opacity = 0.76;
      innerMat.color.setHex(0xa8e4ff);
      innerMat.opacity = 0.58;
      glowMat.color.setHex(0x88d4f5);
      glowMat.opacity = 0.46;
    } else {
      ringMat.color.setHex(0xffe09c);
      ringMat.opacity = 0.44 + beatPulse * 0.16;
      innerMat.color.setHex(0x9edcff);
      innerMat.opacity = 0.28 + beatPulse * 0.12;
      glowMat.color.setHex(0x9cd2f6);
      glowMat.opacity = 0.26 + jarRatio * 0.16;
    }

    // Handheld lantern halo sprite
    const haloScale =
      0.72 + jarRatio * 0.4 + (this.preservingTime || isValvePaused ? 0.38 : 0) + (isFever ? 0.36 : 0);
    this.handLanternHalo.scale.set(haloScale, haloScale, 1);
    const haloMat = this.handLanternHalo.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.preservingTime || isValvePaused
        ? 0.72 + Math.sin(elapsed * 9) * 0.14
        : 0.32 + jarRatio * 0.2 + (isFever ? 0.24 : 0);
    haloMat.color.setHex(isFever ? 0xfff5c4 : isValvePaused ? 0xc2eeff : 0xffdf9a);

    // Blue fluffy blanket shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.15;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.44 + 0.18 * Math.sin(elapsed * 3.4);
    }

    // Expanding dual VALVE PAUSE ripple rings
    if (this.valveWaveTimer > 0) {
      this.valveWaveRing.visible = true;
      this.valveWaveRing2.visible = true;
      const p = 1 - this.valveWaveTimer / 0.85;
      const eased = 1 - Math.pow(1 - p, 2.5);
      this.valveWaveRing.scale.setScalar(0.55 + eased * this.valveWaveMaxRadius);
      this.valveWaveRing2.scale.setScalar(0.35 + eased * this.valveWaveMaxRadius * 0.84);
      const fm1 = this.valveWaveRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.valveWaveRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.92;
      fm2.opacity = (1 - p) * 0.76;
      fm1.color.setHex(isFever ? 0xfff5be : 0xffe49c);
      fm2.color.setHex(0xa4e2ff);
    } else {
      this.valveWaveRing.visible = false;
      this.valveWaveRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
