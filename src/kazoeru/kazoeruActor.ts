import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Kazoeru 3D character actor — the moonlit park swing counter.
 * Loads official rigged kazoeru.glb (Walking / Running, 1.7m tall),
 * radiates a warm brass-lantern & moonlight counting ring on the ground,
 * glows near the notebook hand while etching 正 strokes, and casts an
 * expanding "数え鳴らし (SWING TALLY)" moonlit wave ring.
 */
export class KazoeruActor {
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
  private lanternHaloSprite: THREE.Sprite;
  private shieldAura: THREE.Mesh;
  private tallyWaveRing: THREE.Mesh;
  private tallyWaveRing2: THREE.Mesh;

  public x = 0;
  public z = 0.55;
  private yaw = 0;
  private speed = 0;
  private popTimer = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;
  private swingWaveTimer = 0;
  private swingWaveMaxRadius = 4.4;
  private writingTally = false;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(this.x, 0, this.z);
    parent.add(this.root);

    this.root.add(this.modelPivot);

    // Warm brass lantern light so Kazoeru's knit beanie & cream fur shine warmly in the night park
    this.auraLight = new THREE.PointLight(0xffcf82, 2.8, 9.2, 1.25);
    this.auraLight.position.set(0, 1.48, 0.55);
    this.root.add(this.auraLight);

    // Soft lantern-gold & moonlight floor glow showing Kazoeru's counting reach
    this.reachFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 40),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xe6ae58,
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
        color: 0xffe09c,
        transparent: true,
        opacity: 0.54,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.038;
    this.root.add(this.reachRing);

    // Inner counter-pulsing moonlight-blue ring
    this.reachInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.71, 40),
      new THREE.MeshBasicMaterial({
        color: 0x9ec6ff,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.reachInnerRing.rotation.x = -Math.PI / 2;
    this.reachInnerRing.position.y = 0.034;
    this.root.add(this.reachInnerRing);

    // Warm lantern sparkle halo near Kazoeru's notebook/pencil hand
    this.lanternHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffdf9a,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.lanternHaloSprite.position.set(0.26, 0.94, 0.3);
    this.lanternHaloSprite.scale.set(0.86, 0.86, 1);
    this.modelPivot.add(this.lanternHaloSprite);

    // Knit beanie & scarf warmth shield aura ring
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.032, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0x8cc2ff,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.y = 0.64;
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);

    // Expanding 3D "数え鳴らし (SWING TALLY)" dual moon-gold ripple rings
    this.tallyWaveRing = new THREE.Mesh(
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
    this.tallyWaveRing.rotation.x = -Math.PI / 2;
    this.tallyWaveRing.position.y = 0.095;
    this.tallyWaveRing.visible = false;
    this.root.add(this.tallyWaveRing);

    this.tallyWaveRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0xa6ccff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.tallyWaveRing2.rotation.x = -Math.PI / 2;
    this.tallyWaveRing2.position.y = 0.14;
    this.tallyWaveRing2.visible = false;
    this.root.add(this.tallyWaveRing2);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official kazoeru.glb is 1.7m tall with feet at y = 0
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

  public setWritingTally(writing: boolean): void {
    this.writingTally = writing;
  }

  public getNotebookOriginWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.lanternHaloSprite.getWorldPosition(out);
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

  public triggerSwingWave(maxRadius: number): void {
    this.swingWaveTimer = 0.8;
    this.swingWaveMaxRadius = maxRadius;
    this.popTimer = Math.max(this.popTimer, 0.3);
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    isSwingBoost: boolean,
    reachRadius: number,
    notebookRatio: number,
    shields: number
  ): void {
    if (this.popTimer > 0) this.popTimer = Math.max(0, this.popTimer - dt);
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.swingWaveTimer > 0) this.swingWaveTimer = Math.max(0, this.swingWaveTimer - dt);

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
    const writeNod = this.writingTally ? Math.sin(elapsed * 9.5) * 0.03 + 0.03 : 0;
    const idleBob = this.speed < 0.22 ? Math.sin(elapsed * 2.4) * 0.022 : 0;

    this.modelPivot.position.y = popLift + celLift + idleBob + writeNod;
    this.modelPivot.rotation.y =
      this.yaw +
      (this.celebrateTimer > 0 ? (1 - this.celebrateTimer / 0.72) * Math.PI * 2 : 0);
    // Gentle forward nod while writing a 正 mark in the notebook
    this.modelPivot.rotation.x = this.writingTally ? 0.14 : Math.min(0.12, this.speed * 0.02);
    this.modelPivot.rotation.z = this.writingTally
      ? Math.sin(elapsed * 8.5) * 0.04
      : this.hitFlashTimer > 0
        ? Math.sin(this.hitFlashTimer * 44) * 0.16
        : 0;

    const scalePop = 1 + (this.popTimer > 0 ? Math.sin((this.popTimer / 0.24) * Math.PI) * 0.08 : 0);
    this.modelPivot.scale.setScalar(scalePop);

    // Personal lantern light
    if (this.hitFlashTimer > 0) {
      this.auraLight.color.setHex(0x9a88d8);
      this.auraLight.intensity = 2.6;
    } else if (isFever) {
      this.auraLight.color.setHex(0xfff0b6);
      this.auraLight.intensity = 4.6 + beatPulse * 1.1;
    } else if (isSwingBoost || this.writingTally) {
      this.auraLight.color.setHex(0xffd98a);
      this.auraLight.intensity = 3.8 + Math.sin(elapsed * 9) * 0.4;
    } else {
      this.auraLight.color.setHex(0xffcf82);
      this.auraLight.intensity = 2.8 + beatPulse * 0.55 + notebookRatio * 0.65;
    }

    // Ground counting reach rings
    const ringScale = reachRadius * (1 + beatPulse * 0.045 + (isSwingBoost ? 0.08 : 0));
    this.reachRing.scale.setScalar(ringScale);
    this.reachInnerRing.scale.setScalar(ringScale * (0.94 + Math.sin(elapsed * 3.4) * 0.06));
    this.reachFloorGlow.scale.setScalar(ringScale * 1.18);

    const ringMat = this.reachRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.reachInnerRing.material as THREE.MeshBasicMaterial;
    const glowMat = this.reachFloorGlow.material as THREE.MeshBasicMaterial;

    if (isFever) {
      ringMat.color.setHex(0xfff3be);
      ringMat.opacity = 0.78;
      innerMat.color.setHex(0xb8dcff);
      innerMat.opacity = 0.58;
      glowMat.color.setHex(0xffda78);
      glowMat.opacity = 0.54;
    } else if (isSwingBoost || this.writingTally) {
      ringMat.color.setHex(0xffe6a0);
      ringMat.opacity = 0.74;
      innerMat.color.setHex(0xa8d4ff);
      innerMat.opacity = 0.54;
      glowMat.color.setHex(0xf2b85c);
      glowMat.opacity = 0.5;
    } else {
      ringMat.color.setHex(0xffe09c);
      ringMat.opacity = 0.42 + beatPulse * 0.16;
      innerMat.color.setHex(0x9ec6ff);
      innerMat.opacity = 0.26 + beatPulse * 0.12;
      glowMat.color.setHex(0xe6ae58);
      glowMat.opacity = 0.28 + notebookRatio * 0.16;
    }

    // Notebook lantern halo sprite
    const haloScale =
      0.74 + notebookRatio * 0.44 + (this.writingTally || isSwingBoost ? 0.36 : 0) + (isFever ? 0.36 : 0);
    this.lanternHaloSprite.scale.set(haloScale, haloScale, 1);
    const haloMat = this.lanternHaloSprite.material as THREE.SpriteMaterial;
    haloMat.opacity =
      this.writingTally || isSwingBoost
        ? 0.66 + Math.sin(elapsed * 10) * 0.14
        : 0.26 + notebookRatio * 0.22 + (isFever ? 0.26 : 0);
    haloMat.color.setHex(isFever ? 0xfff4be : 0xffdf9a);

    // Shield aura
    this.shieldAura.visible = shields > 0 && active;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 1.25;
      const sm = this.shieldAura.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.42 + 0.18 * Math.sin(elapsed * 3.6);
    }

    // Expanding dual SWING TALLY ripple rings
    if (this.swingWaveTimer > 0) {
      this.tallyWaveRing.visible = true;
      this.tallyWaveRing2.visible = true;
      const p = 1 - this.swingWaveTimer / 0.8;
      const eased = 1 - Math.pow(1 - p, 2.6);
      this.tallyWaveRing.scale.setScalar(0.55 + eased * this.swingWaveMaxRadius);
      this.tallyWaveRing2.scale.setScalar(0.35 + eased * this.swingWaveMaxRadius * 0.84);
      const fm1 = this.tallyWaveRing.material as THREE.MeshBasicMaterial;
      const fm2 = this.tallyWaveRing2.material as THREE.MeshBasicMaterial;
      fm1.opacity = (1 - p) * 0.9;
      fm2.opacity = (1 - p) * 0.72;
      fm1.color.setHex(isFever ? 0xfff5be : 0xffe296);
      fm2.color.setHex(0xa6ccff);
    } else {
      this.tallyWaveRing.visible = false;
      this.tallyWaveRing2.visible = false;
    }

    if (this.model) {
      this.model.visible = true;
    }
  }
}
