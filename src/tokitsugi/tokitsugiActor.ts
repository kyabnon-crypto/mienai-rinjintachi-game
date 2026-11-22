import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Tokitsugi 3D character actor standing behind the giant pocket-watch workbench.
 * Loads the official rigged tokitsugi.glb (Mixamo Walking / Running),
 * reacts expressively whenever a time fragment is stitched or a watch is mended,
 * and emits the origin point for golden thread beams.
 */
export class TokitsugiActor {
  public root = new THREE.Group();
  private modelPivot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAnim: 'idle' | 'walk' | 'run' = 'idle';

  private faceLight: THREE.PointLight;
  private lanternGroup = new THREE.Group();
  private lanternLight: THREE.PointLight;
  private lanternGlow: THREE.Sprite;
  private needleTip = new THREE.Group();
  private needleSpark: THREE.Sprite;
  private shieldAura: THREE.Mesh;

  private readonly baseX = 1.68;
  private targetYaw = -0.34;
  private currentYaw = -0.34;
  private targetX = 1.68;
  private currentX = 1.68;
  private stitchPulse = 0;
  private celebrateTimer = 0;
  private hitFlashTimer = 0;

  constructor(parent: THREE.Object3D, glowTex: THREE.CanvasTexture) {
    // Positioned at the 1-o'clock side behind the giant pocket watch so Tokitsugi is 100% unobstructed by top-center HUD
    this.root.position.set(this.baseX, 0.08, -2.55);
    parent.add(this.root);

    // Small wooden craftsman stool/platform so Tokitsugi clearly leans over the giant watch
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.8 });
    const brassTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a152,
      metalness: 0.8,
      roughness: 0.3,
    });
    const stool = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.36, 0.82), woodMat);
    stool.position.set(0, 0.18, 0);
    stool.castShadow = true;
    stool.receiveShadow = true;
    this.root.add(stool);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.86), brassTrimMat);
    trim.position.set(0, 0.36, 0);
    this.root.add(trim);

    this.modelPivot.position.set(0, 0.38, 0);
    this.root.add(this.modelPivot);

    // Warm key light illuminating Tokitsugi's silver hair, amber eyes, and navy cap
    this.faceLight = new THREE.PointLight(0xffe4bc, 3.6, 7.5, 1.2);
    this.faceLight.position.set(0.25, 1.9, 1.55);
    this.root.add(this.faceLight);

    // Signature antique brass lantern floating/resting beside Tokitsugi
    this.lanternGroup.position.set(-1.18, 0.96, 0.45);
    this.root.add(this.lanternGroup);

    const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 16), brassTrimMat);
    this.lanternGroup.add(lanternBase);

    const lanternCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.09, 0.24, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe5a8 })
    );
    lanternCore.position.y = 0.18;
    this.lanternGroup.add(lanternCore);

    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.28, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffeed6,
        transparent: true,
        opacity: 0.32,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })
    );
    lanternGlass.position.y = 0.18;
    this.lanternGroup.add(lanternGlass);

    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 16), brassTrimMat);
    lanternCap.position.y = 0.38;
    this.lanternGroup.add(lanternCap);

    this.lanternLight = new THREE.PointLight(0xffbe68, 3.8, 10.0, 1.2);
    this.lanternLight.position.set(0, 0.22, 0);
    this.lanternGroup.add(this.lanternLight);

    this.lanternGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffc872,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );
    this.lanternGlow.scale.set(1.3, 1.3, 1);
    this.lanternGlow.position.set(0, 0.2, 0);
    this.lanternGroup.add(this.lanternGlow);

    // Floating golden stitching needle/precision tool tip near Tokitsugi's right hand
    this.needleTip.position.set(0.46, 1.32, 0.62);
    this.root.add(this.needleTip);

    const toolBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.009, 0.44, 10),
      new THREE.MeshStandardMaterial({
        color: 0xf7d788,
        emissive: 0xc28624,
        emissiveIntensity: 0.65,
        metalness: 0.88,
        roughness: 0.2,
      })
    );
    toolBody.rotation.x = Math.PI * 0.36;
    toolBody.rotation.z = 0.22;
    this.needleTip.add(toolBody);

    this.needleSpark = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe9a6,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    this.needleSpark.scale.set(0.58, 0.58, 1);
    this.needleSpark.position.set(0, -0.05, 0.14);
    this.needleTip.add(this.needleSpark);

    // Subtle hourglass shield halo around Tokitsugi
    this.shieldAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.03, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x8fd6ff,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldAura.rotation.x = Math.PI / 2;
    this.shieldAura.position.set(0, 0.44, 0);
    this.shieldAura.visible = false;
    this.root.add(this.shieldAura);
  }

  public async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // Official GLB assets are normalized to ~1.70m height with feet at y = 0; avoid Box3 on SkinnedMesh
    model.scale.setScalar(1.06);
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
      this.walkAction.setEffectiveTimeScale(0.16);
      this.walkAction.setEffectiveWeight(0.18);
    }
  }

  /** World position of the golden needle tip where golden thread beams originate */
  public getStitchOriginWorld(out: THREE.Vector3): THREE.Vector3 {
    this.needleTip.getWorldPosition(out);
    out.z += 0.12;
    return out;
  }

  public onStitch(targetWorldX: number, isPerfect: boolean): void {
    this.stitchPulse = isPerfect ? 1.0 : 0.72;
    this.targetX = THREE.MathUtils.clamp(this.baseX + targetWorldX * 0.18, 1.15, 2.25);
    this.targetYaw = THREE.MathUtils.clamp(-0.34 + targetWorldX * 0.14, -0.72, 0.08);
  }

  public onCelebrate(): void {
    this.celebrateTimer = 1.45;
    this.stitchPulse = 1.0;
  }

  public onRiftHit(): void {
    this.hitFlashTimer = 0.55;
  }

  public update(
    elapsed: number,
    dt: number,
    active: boolean,
    beatPhase: number,
    isFever: boolean,
    shields: number
  ): void {
    const smooth = 1 - Math.exp(-7.5 * dt);
    if (!active) {
      this.targetX = this.baseX + Math.sin(elapsed * 0.55) * 0.14;
      this.targetYaw = -0.34 + Math.sin(elapsed * 0.45) * 0.1;
    }

    const prevX = this.currentX;
    this.currentX += (this.targetX - this.currentX) * smooth;
    this.currentYaw += (this.targetYaw - this.currentYaw) * smooth;
    const speedX = Math.abs(this.currentX - prevX) / Math.max(0.001, dt);

    this.root.position.x = this.currentX;

    this.stitchPulse = Math.max(0, this.stitchPulse - dt * 2.8);
    this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    // Animation cross-fade
    if (this.mixer && this.walkAction && this.runAction) {
      if (this.celebrateTimer > 0.1 || isFever) {
        if (this.activeAnim !== 'run') {
          this.activeAnim = 'run';
          this.runAction.reset().play();
          this.runAction.crossFadeFrom(this.walkAction, 0.18, true);
        }
        this.runAction.setEffectiveTimeScale(isFever ? 0.95 : 1.1);
        this.runAction.setEffectiveWeight(isFever ? 0.6 : 0.78);
      } else if (speedX > 0.35 || this.stitchPulse > 0.25) {
        if (this.activeAnim !== 'walk') {
          this.activeAnim = 'walk';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.2, true);
        }
        this.walkAction.setEffectiveTimeScale(0.45 + Math.min(0.65, speedX * 0.4));
        this.walkAction.setEffectiveWeight(0.5);
      } else {
        if (this.activeAnim !== 'idle') {
          this.activeAnim = 'idle';
          this.walkAction.reset().play();
          this.walkAction.crossFadeFrom(this.runAction, 0.24, true);
        }
        this.walkAction.setEffectiveTimeScale(0.14);
        this.walkAction.setEffectiveWeight(0.16);
      }
      this.mixer.update(dt);
    }

    // Expressive posture & beat bobbing
    const beatBounce = Math.pow(1 - beatPhase, 3) * (isFever ? 0.08 : 0.035);
    const hop = this.celebrateTimer > 0 ? Math.abs(Math.sin(this.celebrateTimer * 10)) * 0.24 : 0;
    const shake = this.hitFlashTimer > 0 ? Math.sin(elapsed * 50) * 0.07 * this.hitFlashTimer : 0;

    this.modelPivot.position.y = 0.38 + beatBounce + hop;
    this.modelPivot.position.x = shake;
    this.modelPivot.rotation.y = this.currentYaw;
    this.modelPivot.rotation.x = 0.08 + this.stitchPulse * 0.12;

    if (this.model) {
      const pop = 1 + this.stitchPulse * 0.045;
      this.modelPivot.scale.set(pop, pop, pop);
    }

    // Floating brass lantern gentle sway
    this.lanternGroup.position.y = 0.96 + Math.sin(elapsed * 2.1) * 0.05;
    this.lanternGroup.rotation.z = Math.sin(elapsed * 1.6) * 0.06;
    const glowScale = (isFever ? 1.55 : 1.15) + Math.sin(elapsed * 6.5) * 0.07 + this.stitchPulse * 0.35;
    this.lanternGlow.scale.set(glowScale, glowScale, 1);
    this.lanternLight.intensity = (isFever ? 3.2 : 2.2) + this.stitchPulse * 1.1;

    // Needle tip energetic motion when stitching
    this.needleTip.position.set(
      0.42 + Math.sin(elapsed * 3.0) * 0.05 + this.currentYaw * 0.35,
      1.32 + Math.cos(elapsed * 2.6) * 0.04 + this.stitchPulse * 0.14,
      0.62 + this.stitchPulse * 0.25
    );
    this.needleTip.rotation.z = -0.18 + Math.sin(elapsed * 4.5) * 0.08 - this.stitchPulse * 0.45;
    const sparkSize = (isFever ? 0.85 : 0.48) + this.stitchPulse * 0.72;
    this.needleSpark.scale.set(sparkSize, sparkSize, 1);
    (this.needleSpark.material as THREE.SpriteMaterial).opacity =
      (isFever ? 0.88 : 0.5) + this.stitchPulse * 0.45;

    // Face light reacts warmly to fever / stitch
    this.faceLight.intensity = (isFever ? 3.4 : 2.5) + this.stitchPulse * 0.9;
    this.faceLight.color.setHex(
      this.hitFlashTimer > 0.15 ? 0xd090ff : isFever ? 0xffecc2 : 0xffdfb0
    );

    // Shield halo visibility
    this.shieldAura.visible = shields > 0;
    if (this.shieldAura.visible) {
      this.shieldAura.rotation.z = elapsed * 0.8;
      const mat = this.shieldAura.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.32 + 0.18 * Math.sin(elapsed * 3.5);
    }
  }
}
