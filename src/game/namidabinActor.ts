import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class NamidabinActor {
  public root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private targetPos = new THREE.Vector3(-1.35, 0, 0.8);
  private lookTarget = new THREE.Vector3(0, 0.9, 3.0);
  private hopVel = 0;
  private hopY = 0;
  private idleTimer = 0;
  private haloSprite: THREE.Sprite;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    this.root.position.set(-1.35, 0, 0.8);
    parent.add(this.root);

    // Subtle soft blue floor aura under Namidabin's boots
    this.haloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x7fc8ff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    this.haloSprite.scale.set(1.3, 1.3, 1);
    this.haloSprite.position.set(0, 0.45, 0);
    this.root.add(this.haloSprite);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Scale Namidabin to charming miniature artisan height (~1.18 units in vault)
    model.scale.setScalar(0.72);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    this.model = model;
    this.root.add(model);

    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      const walkClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('walk')) || gltf.animations[0];
      const runClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('run')) || walkClip;

      this.walkAction = this.mixer.clipAction(walkClip);
      this.runAction = this.mixer.clipAction(runClip);

      // Start gently posed (slow breathing walk paused/low weight)
      this.walkAction.play();
      this.walkAction.setEffectiveTimeScale(0.18);
      this.walkAction.setEffectiveWeight(0.25);
    }
  }

  public moveToward(worldPos: THREE.Vector3, urgent = false): void {
    // Keep Namidabin on walkable vault floor around the central pedestal
    let tx = Math.max(-2.65, Math.min(2.65, worldPos.x * 0.78));
    let tz = Math.max(-3.0, Math.min(2.15, worldPos.z * 0.78 + 0.35));

    // Avoid intersecting central pedestal at (0, -0.6), radius ~0.95
    const dx = tx - 0;
    const dz = tz - -0.6;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.12) {
      const ang = dist > 0.001 ? Math.atan2(dz, dx) : Math.PI * 0.65;
      tx = Math.cos(ang) * 1.15;
      tz = -0.6 + Math.sin(ang) * 1.15;
    }

    this.targetPos.set(tx, 0, tz);
    this.lookTarget.set(worldPos.x, 0.8, worldPos.z);
    this.idleTimer = urgent ? 1.8 : 3.2;
  }

  public moveToPedestal(): void {
    this.targetPos.set(-0.92, 0, 0.55);
    this.lookTarget.set(0, 1.2, -0.6);
    this.idleTimer = 4.0;
  }

  public celebrateHop(): void {
    this.hopVel = 3.2;
  }

  private setAnimState(next: 'idle' | 'walk' | 'run'): void {
    if (this.activeAnim === next || !this.walkAction || !this.runAction) return;
    this.activeAnim = next;

    if (next === 'idle') {
      this.runAction.fadeOut(0.25);
      this.walkAction.reset().fadeIn(0.25);
      this.walkAction.setEffectiveTimeScale(0.15);
      this.walkAction.setEffectiveWeight(0.22);
    } else if (next === 'walk') {
      this.runAction.fadeOut(0.2);
      this.walkAction.reset().fadeIn(0.2);
      this.walkAction.setEffectiveTimeScale(1.15);
      this.walkAction.setEffectiveWeight(1.0);
    } else {
      this.walkAction.fadeOut(0.15);
      this.runAction.reset().fadeIn(0.15);
      this.runAction.setEffectiveTimeScale(1.35);
      this.runAction.setEffectiveWeight(1.0);
    }
  }

  public update(dt: number, beatPhase: number, isFever: boolean): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Gentle autonomous wandering when player pauses clicking
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1.4 + Math.random() * 1.1;
      this.moveToward(new THREE.Vector3(Math.cos(angle) * r, 0, -0.6 + Math.sin(angle) * r));
      this.idleTimer = isFever ? 1.2 : 3.8 + Math.random() * 2.5;
    }

    const toTarget = new THREE.Vector3().subVectors(this.targetPos, this.root.position);
    toTarget.y = 0;
    const dist = toTarget.length();

    if (dist > 0.08) {
      const runMode = isFever || dist > 1.75;
      this.setAnimState(runMode ? 'run' : 'walk');
      const speed = runMode ? 3.5 : 1.9;
      const step = Math.min(dist, speed * dt);
      toTarget.normalize();
      this.root.position.addScaledVector(toTarget, step);

      const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
      let diff = desiredYaw - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, dt * 10);
    } else {
      this.setAnimState('idle');
      const lookDx = this.lookTarget.x - this.root.position.x;
      const lookDz = this.lookTarget.z - this.root.position.z;
      const desiredYaw = Math.atan2(lookDx, lookDz);
      let diff = desiredYaw - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, dt * 5);
    }

    // Hop physics + subtle rhythmic bobbing on the beat
    if (this.hopY > 0 || this.hopVel > 0) {
      this.hopY += this.hopVel * dt;
      this.hopVel -= 11.5 * dt;
      if (this.hopY <= 0) {
        this.hopY = 0;
        this.hopVel = 0;
      }
    }
    const beatBob = Math.pow(1 - beatPhase, 2.5) * (isFever ? 0.07 : 0.025);
    this.root.position.y = this.hopY + beatBob;

    // Aura pulse
    const auraScale = (isFever ? 1.75 : 1.25) + Math.pow(1 - beatPhase, 2) * 0.28;
    this.haloSprite.scale.set(auraScale, auraScale, 1);
    (this.haloSprite.material as THREE.SpriteMaterial).color.setHex(isFever ? 0xffe49e : 0x7fc8ff);
  }
}
