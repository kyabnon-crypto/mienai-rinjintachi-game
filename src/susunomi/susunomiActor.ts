import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COUNTER_HALF_WIDTH } from './config';

export class SusunomiActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  public currentX = 0;
  public targetX = 0;
  private velocityX = 0;
  private stirTimer = 0;
  private catchPulse = 0;
  private hitFlashTimer = 0;

  // Signature Copper Pot + Wooden Ladle + Blue Stove Aura riding right in front of Susunomi
  public potGroup = new THREE.Group();
  private soupMat: THREE.MeshStandardMaterial;
  private soupLight: THREE.PointLight;
  private potGlow: THREE.Sprite;
  private ladlePivot = new THREE.Group();
  private catchRing: THREE.Mesh;
  private shieldRing: THREE.Mesh;
  private stirWaveMesh: THREE.Mesh;
  private steamPuffs: Array<{ sprite: THREE.Sprite; phase: number; angle: number; radius: number }> = [];

  private targetSoupColor = new THREE.Color(0xffb454);

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(0, 0, 0.12);
    parent.add(this.root);

    // Cute wooden chef step-crate under Susunomi (from room tour lore!) so he towers happily above the pot
    const stepBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.28, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x7d512f, roughness: 0.82 })
    );
    stepBox.position.set(0, 0.14, 0);
    stepBox.castShadow = true;
    stepBox.receiveShadow = true;
    this.root.add(stepBox);

    this.modelPivot.position.set(0, 0.28, 0);
    this.root.add(this.modelPivot);

    // Dedicated warm character rim/face light so Susunomi's soot fur, white eyes & apron pop
    const faceLight = new THREE.PointLight(0xffdbb0, 2.2, 5.5, 1.4);
    faceLight.position.set(0, 1.55, 1.35);
    this.root.add(faceLight);

    // Build burnished Copper Pot + wooden ladle
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd98242,
      metalness: 0.78,
      roughness: 0.24,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xf4b26b,
      metalness: 0.84,
      roughness: 0.2,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x995628,
      metalness: 0.68,
      roughness: 0.36,
    });

    this.potGroup.position.set(0, 0.12, 0.73); // Aligns cleanly over z = 0.85 burner rail!
    this.root.add(this.potGroup);

    const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.48, 0.44, 24), copperMat);
    potBody.position.y = 0.22;
    potBody.castShadow = true;
    potBody.receiveShadow = true;
    this.potGroup.add(potBody);

    const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.04, 10, 28), rimMat);
    potRim.rotation.x = Math.PI / 2;
    potRim.position.y = 0.44;
    this.potGroup.add(potRim);

    // Left & right copper handles
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI), handleMat);
      handle.position.set(side * 0.56, 0.34, 0);
      handle.rotation.z = side * -Math.PI / 2;
      this.potGroup.add(handle);
    }

    // Glowing swirling soup surface inside the copper pot
    this.soupMat = new THREE.MeshStandardMaterial({
      color: 0xffc66e,
      emissive: 0xff9a38,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.1,
    });
    const soupMesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), this.soupMat);
    soupMesh.rotation.x = -Math.PI / 2;
    soupMesh.position.y = 0.42;
    this.potGroup.add(soupMesh);

    // Wooden ladle stirring inside the copper pot
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb67a44, roughness: 0.7 });
    this.ladlePivot.position.set(0, 0.44, 0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.78, 10), woodMat);
    stick.position.set(0.22, 0.28, 0);
    stick.rotation.z = -0.34;
    this.ladlePivot.add(stick);
    this.potGroup.add(this.ladlePivot);

    // Blue gas flame ring directly under the pot
    const potFlame = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.048, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x45c8ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      })
    );
    potFlame.rotation.x = Math.PI / 2;
    potFlame.position.y = 0.01;
    this.potGroup.add(potFlame);

    // Warm soup glow light & sprite
    this.soupLight = new THREE.PointLight(0xffb454, 2.6, 8.5, 1.3);
    this.soupLight.position.set(0, 0.85, 0.73);
    this.root.add(this.soupLight);

    this.potGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffc875,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    this.potGlow.scale.set(1.65, 1.35, 1);
    this.potGlow.position.set(0, 0.56, 0);
    this.potGroup.add(this.potGlow);

    // Subtle glowing catch radius ring on the counter
    this.catchRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 0.96, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffcb78,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.catchRing.rotation.x = -Math.PI / 2;
    this.catchRing.position.set(0, 0.05, 0.73);
    this.root.add(this.catchRing);

    // Vent Fan Guard shield ring around pot
    this.shieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.036, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7cd8ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldRing.rotation.x = Math.PI / 2;
    this.shieldRing.position.set(0, 0.62, 0.73);
    this.shieldRing.visible = false;
    this.root.add(this.shieldRing);

    // Expanding golden ring for Stir Burst
    this.stirWaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.86, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffe49c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.stirWaveMesh.rotation.x = -Math.PI / 2;
    this.stirWaveMesh.position.set(0, 0.64, 0.73);
    this.root.add(this.stirWaveMesh);

    // Rising glowing soup steam puffs
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffe1a8,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      sp.scale.set(0.3, 0.3, 1);
      this.potGroup.add(sp);
      this.steamPuffs.push({
        sprite: sp,
        phase: i / 16,
        angle: i * 1.9,
        radius: 0.14 + (i % 4) * 0.07,
      });
    }
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    model.scale.setScalar(0.96);
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
      this.walkAction.setEffectiveTimeScale(0.18);
      this.walkAction.setEffectiveWeight(0.22);
    }
  }

  public setTargetX(x: number): void {
    this.targetX = THREE.MathUtils.clamp(x, -COUNTER_HALF_WIDTH, COUNTER_HALF_WIDTH);
  }

  public nudgeTargetX(delta: number): void {
    this.setTargetX(this.targetX + delta);
  }

  public getPotWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.currentX, 0.78, 0.85);
  }

  public triggerCatchPulse(aromaColorHex: number): void {
    this.catchPulse = 1.0;
    this.targetSoupColor.setHex(aromaColorHex);
  }

  public triggerStirBurst(): void {
    this.stirTimer = 0.55;
    this.catchPulse = Math.max(this.catchPulse, 0.9);
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.55;
  }

  public reset(): void {
    this.currentX = 0;
    this.targetX = 0;
    this.velocityX = 0;
    this.stirTimer = 0;
    this.catchPulse = 0;
    this.hitFlashTimer = 0;
    this.targetSoupColor.setHex(0xffb454);
    this.root.position.set(0, 0, 0.14);
  }

  private setAnimState(next: 'idle' | 'walk' | 'run'): void {
    if (this.activeAnim === next || !this.walkAction || !this.runAction) return;
    this.activeAnim = next;

    if (next === 'idle') {
      this.runAction.fadeOut(0.22);
      this.walkAction.reset().fadeIn(0.22);
      this.walkAction.setEffectiveTimeScale(0.16);
      this.walkAction.setEffectiveWeight(0.22);
    } else if (next === 'walk') {
      this.runAction.fadeOut(0.16);
      this.walkAction.reset().fadeIn(0.16);
      this.walkAction.setEffectiveTimeScale(1.15);
      this.walkAction.setEffectiveWeight(1.0);
    } else {
      this.walkAction.fadeOut(0.15);
      this.runAction.reset().fadeIn(0.15);
      this.runAction.setEffectiveTimeScale(1.28);
      this.runAction.setEffectiveWeight(1.0);
    }
  }

  public update(
    elapsed: number,
    dt: number,
    playing: boolean,
    beatPhase: number,
    isFever: boolean,
    catchRadius: number,
    shieldCount: number
  ): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    const desiredX = playing ? this.targetX : Math.sin(elapsed * 0.55) * 0.45;
    const prevX = this.currentX;
    this.currentX += (desiredX - this.currentX) * Math.min(1, dt * 13.5);
    this.velocityX = dt > 0.0001 ? (this.currentX - prevX) / dt : 0;
    this.root.position.x = this.currentX;

    const absSpeed = Math.abs(this.velocityX);
    if (!playing) {
      this.setAnimState('idle');
    } else if (absSpeed > 2.4) {
      this.setAnimState('run');
    } else if (absSpeed > 0.4) {
      this.setAnimState('walk');
    } else {
      this.setAnimState('idle');
    }

    // Face forward toward the pot & camera, leaning eagerly toward horizontal dash direction
    const targetYaw = playing
      ? THREE.MathUtils.clamp(this.velocityX * 0.075, -0.58, 0.58)
      : Math.sin(elapsed * 0.7) * 0.14;
    this.modelPivot.rotation.y += (targetYaw - this.modelPivot.rotation.y) * Math.min(1, dt * 10);
    const bankZ = THREE.MathUtils.clamp(-this.velocityX * 0.025, -0.18, 0.18);
    this.modelPivot.rotation.z += (bankZ - this.modelPivot.rotation.z) * Math.min(1, dt * 10);

    // Rhythmic cooking bounce atop his wooden step-box
    const beatBob = Math.pow(1 - beatPhase, 2.6) * (playing ? 0.055 : 0.025);
    this.modelPivot.position.y =
      0.28 + beatBob + (this.stirTimer > 0 ? Math.sin(this.stirTimer * 28) * 0.04 : 0);

    // Flicker on soot hit
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.model) {
        this.model.visible = Math.floor(this.hitFlashTimer * 22) % 2 === 0;
      }
    } else if (this.model) {
      this.model.visible = true;
    }

    // Wooden ladle continuous cozy stirring (turbo speed during Stir Burst or Fever!)
    const stirSpeed = this.stirTimer > 0 ? 15.0 : isFever ? 6.2 : 2.6;
    this.ladlePivot.rotation.y += dt * stirSpeed;

    // Expanding stir wave ring
    if (this.stirTimer > 0) {
      this.stirTimer = Math.max(0, this.stirTimer - dt);
      const p = 1 - this.stirTimer / 0.55;
      const sc = 0.8 + p * 3.4;
      this.stirWaveMesh.scale.set(sc, sc, 1);
      (this.stirWaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.75;
    } else {
      (this.stirWaveMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Soup glow & color transition
    this.catchPulse = Math.max(0, this.catchPulse - dt * 2.8);
    this.soupMat.color.lerp(isFever ? new THREE.Color(0xffe9a6) : this.targetSoupColor, Math.min(1, dt * 4));
    this.soupMat.emissive.lerp(
      isFever ? new THREE.Color(0xffbd4f) : this.targetSoupColor,
      Math.min(1, dt * 4)
    );
    this.soupMat.emissiveIntensity = 0.85 + this.catchPulse * 1.1 + (isFever ? 0.65 : 0);

    this.soupLight.color.copy(this.soupMat.emissive);
    this.soupLight.intensity = (isFever ? 3.8 : 2.2) + this.catchPulse * 1.8;

    const glowSize = (isFever ? 2.45 : 1.75) + this.catchPulse * 0.85;
    this.potGlow.scale.set(glowSize, glowSize * 0.85, 1);
    (this.potGlow.material as THREE.SpriteMaterial).color.copy(this.soupMat.color);

    // Pot subtle joyful squash/stretch when catching
    const potScale = 1 + this.catchPulse * 0.11;
    this.potGroup.scale.set(potScale, 1 + this.catchPulse * 0.06, potScale);

    // Catch radius ring on counter
    const ringScale = Math.max(0.9, (isFever ? catchRadius * 1.4 : catchRadius) * 0.86);
    this.catchRing.scale.set(ringScale, ringScale, 1);
    const ringMat = this.catchRing.material as THREE.MeshBasicMaterial;
    ringMat.color.setHex(isFever ? 0xffe89e : 0xffcb78);
    ringMat.opacity = isFever ? 0.45 : 0.24 + this.catchPulse * 0.2;

    // Vent Guard shield ring
    this.shieldRing.visible = playing && shieldCount > 0 && !isFever;
    if (this.shieldRing.visible) {
      this.shieldRing.rotation.z = elapsed * 1.5;
    }

    // Rising soup steam particles
    for (const s of this.steamPuffs) {
      const p = (elapsed * (isFever ? 0.72 : 0.4) + s.phase) % 1;
      const swirl = s.angle + p * (isFever ? 6.5 : 3.8);
      s.sprite.position.set(
        Math.cos(swirl) * (s.radius + p * 0.34),
        0.58 + p * (isFever ? 2.4 : 1.45),
        Math.sin(swirl) * (s.radius + p * 0.22)
      );
      const sz = (0.24 + p * 0.36) * (isFever ? 1.25 : 1.0);
      s.sprite.scale.set(sz, sz, 1);
      const mat = s.sprite.material as THREE.SpriteMaterial;
      mat.color.copy(this.soupMat.color);
      mat.opacity = (isFever ? 0.72 : 0.44) * Math.sin(p * Math.PI);
    }
  }
}
