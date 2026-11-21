import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LANE_POSITIONS } from './config';

export class KagemichiActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private rightHandBone: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  public laneIndex = 1; // 0 = left, 1 = center, 2 = right
  private currentX = 0;
  private jumpY = 0;
  private jumpVel = 0;
  private isGrounded = true;
  private hitFlashTimer = 0;
  private collectPulse = 0;

  // Brass Lantern attached near right hand
  private lanternGroup = new THREE.Group();
  private lanternLight: THREE.PointLight;
  private lanternGlow: THREE.Sprite;
  private groundHalo: THREE.Mesh;
  private shieldRing: THREE.Mesh;
  private sparks: Array<{ sprite: THREE.Sprite; phase: number; angle: number }> = [];
  private tmpHandPos = new THREE.Vector3();

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(0, 0, 0.6);
    parent.add(this.root);
    this.root.add(this.modelPivot);

    // Build Kagemichi's signature warm brass lantern
    this.buildLantern(glowTex);
    this.root.add(this.lanternGroup);

    this.lanternLight = new THREE.PointLight(0xffbe68, 2.2, 13, 1.35);
    this.lanternLight.position.set(0.45, 0.85, -0.25);
    this.root.add(this.lanternLight);

    this.lanternGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffc670,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );
    this.lanternGlow.scale.set(1.35, 1.35, 1);
    this.lanternGroup.add(this.lanternGlow);

    // Warm ground illumination ring showing lantern magnet reach
    const haloGeo = new THREE.RingGeometry(0.42, 1.15, 36);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffc673,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.groundHalo = new THREE.Mesh(haloGeo, haloMat);
    this.groundHalo.rotation.x = -Math.PI / 2;
    this.groundHalo.position.y = 0.03;
    this.root.add(this.groundHalo);

    // Mist-guard shield aura (visible when streetlamp shield > 0)
    this.shieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x99d0ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldRing.rotation.x = Math.PI / 2;
    this.shieldRing.position.y = 0.88;
    this.shieldRing.visible = false;
    this.root.add(this.shieldRing);

    // Floating warm ember sparks rising from lantern
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffda99,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      sp.scale.set(0.18, 0.18, 1);
      this.root.add(sp);
      this.sparks.push({ sprite: sp, phase: i / 14, angle: i * 1.7 });
    }
  }

  private buildLantern(glowTex: THREE.CanvasTexture): void {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd2a152,
      metalness: 0.78,
      roughness: 0.28,
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe8b0 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d4,
      transparent: true,
      opacity: 0.34,
      roughness: 0.1,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 14), brassMat);
    base.position.y = -0.24;
    this.lanternGroup.add(base);

    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.26, 14, 1, true), glassMat);
    glass.position.y = -0.09;
    this.lanternGroup.add(glass);

    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.18, 10), coreMat);
    flame.position.y = -0.1;
    this.lanternGroup.add(flame);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.09, 14), brassMat);
    cap.position.y = 0.08;
    this.lanternGroup.add(cap);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 14, Math.PI), brassMat);
    handle.position.y = 0.12;
    this.lanternGroup.add(handle);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffb95e,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    halo.scale.set(0.85, 0.85, 1);
    halo.position.y = -0.1;
    this.lanternGroup.add(halo);

    this.lanternGroup.position.set(0.45, 0.78, -0.18);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    model.scale.setScalar(0.92);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if (obj.name.toLowerCase().includes('righthand') && !this.rightHandBone) {
        this.rightHandBone = obj;
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
      this.walkAction.setEffectiveWeight(0.2);
    }
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.currentX, this.jumpY, this.root.position.z);
  }

  public getJumpY(): number {
    return this.jumpY;
  }

  public setLane(index: number): boolean {
    const clamped = Math.max(0, Math.min(2, index));
    if (clamped === this.laneIndex) return false;
    this.laneIndex = clamped;
    return true;
  }

  public moveLane(delta: number): boolean {
    return this.setLane(this.laneIndex + delta);
  }

  public jump(): boolean {
    if (!this.isGrounded) return false;
    this.isGrounded = false;
    this.jumpVel = 9.4;
    return true;
  }

  public triggerCollectPulse(): void {
    this.collectPulse = 1.0;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.55;
  }

  public resetForRun(): void {
    this.laneIndex = 1;
    this.currentX = LANE_POSITIONS[1];
    this.jumpY = 0;
    this.jumpVel = 0;
    this.isGrounded = true;
    this.hitFlashTimer = 0;
    this.collectPulse = 0;
    this.root.position.set(this.currentX, 0, 0.6);
  }

  private setAnimState(next: 'idle' | 'walk' | 'run'): void {
    if (this.activeAnim === next || !this.walkAction || !this.runAction) return;
    this.activeAnim = next;

    if (next === 'idle') {
      this.runAction.fadeOut(0.25);
      this.walkAction.reset().fadeIn(0.25);
      this.walkAction.setEffectiveTimeScale(0.14);
      this.walkAction.setEffectiveWeight(0.2);
    } else if (next === 'walk') {
      this.runAction.fadeOut(0.2);
      this.walkAction.reset().fadeIn(0.2);
      this.walkAction.setEffectiveTimeScale(1.15);
      this.walkAction.setEffectiveWeight(1.0);
    } else {
      this.walkAction.fadeOut(0.18);
      this.runAction.reset().fadeIn(0.18);
      this.runAction.setEffectiveTimeScale(1.22);
      this.runAction.setEffectiveWeight(1.0);
    }
  }

  public update(
    elapsed: number,
    dt: number,
    running: boolean,
    beatPhase: number,
    isExpress: boolean,
    magnetRadius: number,
    shieldCount: number
  ): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    const desiredAnim = !running ? 'idle' : isExpress ? 'run' : 'run';
    this.setAnimState(desiredAnim);
    if (this.runAction && running) {
      this.runAction.setEffectiveTimeScale(isExpress ? 1.48 : 1.18);
    }

    // Smooth horizontal lane glide with natural banking tilt
    const targetX = running ? LANE_POSITIONS[this.laneIndex] : 0;
    const dx = targetX - this.currentX;
    this.currentX += dx * Math.min(1, dt * 15);
    this.root.position.x = this.currentX;

    // Jump arc physics
    if (!this.isGrounded) {
      this.jumpY += this.jumpVel * dt;
      this.jumpVel -= 26.5 * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVel = 0;
        this.isGrounded = true;
      }
    }

    // Orient Kagemichi: facing camera slightly in lobby, running into the night (-Z) during play
    const targetYaw = running ? Math.PI : 0.28 + Math.sin(elapsed * 0.6) * 0.08;
    let diff = targetYaw - this.modelPivot.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.modelPivot.rotation.y += diff * Math.min(1, dt * 8);

    // Subtle banking lean into lane shift + rhythmic stride bob
    const bankAngle = THREE.MathUtils.clamp(-dx * 0.16, -0.26, 0.26);
    this.modelPivot.rotation.z += (bankAngle - this.modelPivot.rotation.z) * Math.min(1, dt * 12);
    const beatBob = Math.pow(1 - beatPhase, 2.6) * (running ? 0.04 : 0.015);
    this.modelPivot.position.y = this.jumpY + beatBob;

    // Flicker on mist hit
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.model) {
        this.model.visible = Math.floor(this.hitFlashTimer * 22) % 2 === 0;
      }
    } else if (this.model) {
      this.model.visible = true;
    }

    // Attach lantern smoothly near right hand bone (in local root space) with natural gravity swing
    if (this.rightHandBone) {
      this.rightHandBone.getWorldPosition(this.tmpHandPos);
      this.root.worldToLocal(this.tmpHandPos);
      this.lanternGroup.position.lerp(
        new THREE.Vector3(this.tmpHandPos.x + (running ? -0.1 : 0.1), this.tmpHandPos.y - 0.12, this.tmpHandPos.z),
        Math.min(1, dt * 18)
      );
    } else {
      this.lanternGroup.position.set(running ? -0.45 : 0.45, 0.78 + this.jumpY, running ? -0.22 : 0.22);
    }
    this.lanternGroup.rotation.z = Math.sin(elapsed * 5.2) * 0.12 + bankAngle * 0.7;
    this.lanternGroup.rotation.x = running ? 0.2 + Math.sin(elapsed * 7.5) * 0.08 : 0.04;

    // Lantern light flicker + collect pulse + express radiance
    this.collectPulse = Math.max(0, this.collectPulse - dt * 3.2);
    const flicker = 1 + 0.06 * Math.sin(elapsed * 9) + 0.04 * Math.sin(elapsed * 15);
    this.lanternLight.position.copy(this.lanternGroup.position);
    this.lanternLight.position.y += 0.1;
    this.lanternLight.intensity =
      (isExpress ? 3.8 : 2.2) * flicker + this.collectPulse * 2.2;
    this.lanternLight.color.setHex(isExpress ? 0xffe49e : 0xffbe68);

    const glowSize = (isExpress ? 2.1 : 1.3) * flicker + this.collectPulse * 0.9;
    this.lanternGlow.scale.set(glowSize, glowSize, 1);

    // Ground halo reflects current lantern magnet reach
    const haloScale = Math.max(0.95, (isExpress ? magnetRadius * 1.65 : magnetRadius) * 0.88);
    this.groundHalo.scale.set(haloScale, haloScale, 1);
    const haloMat = this.groundHalo.material as THREE.MeshBasicMaterial;
    haloMat.color.setHex(isExpress ? 0xffe89e : 0xffc673);
    haloMat.opacity = isExpress ? 0.42 : 0.22 + this.collectPulse * 0.18;

    // Mist guard shield ring
    this.shieldRing.visible = running && shieldCount > 0 && !isExpress;
    if (this.shieldRing.visible) {
      this.shieldRing.position.y = 0.85 + this.jumpY;
      this.shieldRing.rotation.z = elapsed * 1.4;
    }

    // Update rising lantern ember sparks
    const lp = this.lanternGroup.position;
    for (const sp of this.sparks) {
      const p = (elapsed * (isExpress ? 0.65 : 0.35) + sp.phase) % 1;
      sp.sprite.position.set(
        lp.x + Math.sin(sp.angle + p * 5) * 0.32 * (0.3 + p),
        lp.y + p * 1.65,
        lp.z + (running ? p * 1.4 : Math.cos(sp.angle + p * 4) * 0.25)
      );
      (sp.sprite.material as THREE.SpriteMaterial).opacity =
        (isExpress ? 0.85 : 0.55) * Math.sin(p * Math.PI);
    }
  }
}
