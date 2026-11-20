import * as THREE from 'three';
import { SaveState } from './types';

function makeSeededRandom(seed = 12): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  rx = 1,
  ry = 1
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.28, 'rgba(210,238,255,0.52)');
  r.addColorStop(1, 'rgba(130,190,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface ShelfBottleSlot {
  x: number;
  y: number;
  z: number;
  scale: number;
  colorIndex: number;
  unlockThreshold: number;
}

export class VaultScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public vaultGroup: THREE.Group;
  public glowTex: THREE.CanvasTexture;

  // Dynamic elements synced to beat & upgrades
  private centerLight!: THREE.PointLight;
  private leftLight!: THREE.PointLight;
  private rightLight!: THREE.PointLight;
  private backLight!: THREE.PointLight;
  private feverSpot!: THREE.PointLight;

  private pedestalGemGroup!: THREE.Group;
  private pedestalGemMat!: THREE.MeshStandardMaterial;
  private pedestalOrbitalGems: THREE.Mesh[] = [];
  private pedestalRing!: THREE.Mesh;
  private beamMat!: THREE.MeshBasicMaterial;
  private orgelRingGroup!: THREE.Group;

  private bottleCoreMeshes: THREE.InstancedMesh[] = [];
  private bottleCoreMats: THREE.MeshStandardMaterial[] = [];
  private bottleSlotsByColor: ShelfBottleSlot[][] = [[], [], [], []];

  private ladderGroup!: THREE.Group;
  private cartJars: THREE.Object3D[] = [];
  private workbenchGlow!: THREE.Sprite;
  private deskLampGlow!: THREE.Sprite;
  private banners: THREE.Group[] = [];
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];

  // Camera subtle parallax & focus
  private pointerNdc = new THREE.Vector2(0, 0);
  private baseCamPos = new THREE.Vector3(0, 2.75, 5.15);
  private baseLookAt = new THREE.Vector3(0, 1.35, -1.6);
  private polishFocusAmount = 0;
  private targetPolishFocus = 0;

  private rnd = makeSeededRandom(42);
  private litBottleRatio = 0.28;
  private ladderLevel = 0;
  private musicboxLevel = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060b1c);
    this.scene.fog = new THREE.FogExp2(0x070d20, 0.038);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 60);
    this.camera.position.copy(this.baseCamPos);
    this.camera.lookAt(this.baseLookAt);

    this.glowTex = createGlowTexture();
    this.vaultGroup = new THREE.Group();
    this.scene.add(this.vaultGroup);

    this.setupEnvironment();
    this.setupLights();
    this.buildArchitecture();
    this.buildShelvesAndBottles();
    this.buildMedallionAndPedestal();
    this.buildProps();
    this.buildOrgelCrown();
    this.buildDustAndAmbientDrops();

    this.resize(window.innerWidth, window.innerHeight);
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    // Pull camera slightly back on narrower aspect ratios so both shelves stay visible
    const aspectBoost = Math.max(0, (1.6 - this.camera.aspect) * 1.8);
    this.baseCamPos.set(0, 2.75 + aspectBoost * 0.25, 5.15 + aspectBoost);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public setPointerNdc(nx: number, ny: number): void {
    this.pointerNdc.set(nx, ny);
  }

  public setPolishFocus(active: boolean): void {
    this.targetPolishFocus = active ? 1 : 0;
  }

  public getPedestalWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, 1.35, -0.6);
  }

  public getSpawnAnchors(): { pos: THREE.Vector3; lane: 'left' | 'center' | 'right'; high: boolean }[] {
    return [
      // Left shelf & ladder area
      { pos: new THREE.Vector3(-2.6, 2.25, -1.6), lane: 'left', high: true },
      { pos: new THREE.Vector3(-2.5, 1.45, -0.4), lane: 'left', high: false },
      { pos: new THREE.Vector3(-2.1, 1.2, 1.1), lane: 'left', high: false },
      // Central celestial beam & back arch
      { pos: new THREE.Vector3(-0.9, 2.45, -1.8), lane: 'center', high: true },
      { pos: new THREE.Vector3(0.0, 2.65, -0.8), lane: 'center', high: true },
      { pos: new THREE.Vector3(0.9, 2.45, -1.8), lane: 'center', high: true },
      { pos: new THREE.Vector3(-0.8, 1.55, 0.5), lane: 'center', high: false },
      { pos: new THREE.Vector3(0.8, 1.55, 0.5), lane: 'center', high: false },
      // Right shelf, workbench & desk area
      { pos: new THREE.Vector3(2.6, 2.25, -1.6), lane: 'right', high: true },
      { pos: new THREE.Vector3(2.4, 1.45, -0.3), lane: 'right', high: false },
      { pos: new THREE.Vector3(2.1, 1.25, 1.15), lane: 'right', high: false },
    ];
  }

  private setupEnvironment(): void {
    const face = (top: string, bot: string, spot?: string) => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, top);
      gr.addColorStop(1, bot);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      if (spot) {
        const r = g.createRadialGradient(32, 26, 0, 32, 26, 30);
        r.addColorStop(0, spot);
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
      }
      return c;
    };
    try {
      const cube = new THREE.CubeTexture([
        face('#3a5a90', '#182440', '#cfe4ff'),
        face('#3a5a90', '#182440'),
        face('#5a80b8', '#243450', '#e8f4ff'),
        face('#101a2c', '#182440'),
        face('#3a5a90', '#182440', '#cfe4ff'),
        face('#28406a', '#141e34'),
      ]);
      cube.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromCubemap(cube).texture;
      pmrem.dispose();
    } catch {
      // Fallback without envMap
    }
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x98c2f8, 0x1e2c48, 0.72));

    const dir = new THREE.DirectionalLight(0xc2dcff, 0.75);
    dir.position.set(2.5, 7, 4.5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 20;
    dir.shadow.camera.left = -5;
    dir.shadow.camera.right = 5;
    dir.shadow.camera.top = 5;
    dir.shadow.camera.bottom = -5;
    dir.shadow.bias = -0.002;
    this.scene.add(dir);

    this.centerLight = new THREE.PointLight(0xbfe4ff, 2.2, 12, 1.4);
    this.centerLight.position.set(0, 2.5, -0.6);
    this.scene.add(this.centerLight);

    this.leftLight = new THREE.PointLight(0x8ec8ff, 1.1, 10, 1.4);
    this.leftLight.position.set(-2.9, 2.6, -1.2);
    this.scene.add(this.leftLight);

    this.rightLight = new THREE.PointLight(0x98e6ff, 1.1, 10, 1.4);
    this.rightLight.position.set(2.9, 2.6, -1.2);
    this.scene.add(this.rightLight);

    this.backLight = new THREE.PointLight(0xc8deff, 0.9, 9, 1.4);
    this.backLight.position.set(0, 3.0, -5.2);
    this.scene.add(this.backLight);

    this.feverSpot = new THREE.PointLight(0xffd27a, 0, 16, 1.2);
    this.feverSpot.position.set(0, 3.6, 0.2);
    this.scene.add(this.feverSpot);
  }

  private addGlow(
    color: number,
    scale: number,
    x: number,
    y: number,
    z: number,
    opacity = 0.65,
    parent: THREE.Object3D = this.vaultGroup
  ): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
      fog: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale, scale, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    return sp;
  }

  private buildArchitecture(): void {
    const rnd = this.rnd;
    const brickTex = (rx: number, ry: number) =>
      makeCanvasTexture(
        256,
        256,
        (g, w, h) => {
          g.fillStyle = '#151d2d';
          g.fillRect(0, 0, w, h);
          for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 6; i++) {
              const x = i * 52 + (j % 2 ? 26 : 0) - 26;
              g.fillStyle = `hsl(${216 + rnd() * 10}, ${18 + rnd() * 10}%, ${24 + rnd() * 10}%)`;
              g.fillRect(x + 2, j * 32 + 2, 48, 28);
            }
          }
        },
        rx,
        ry
      );

    const floorTex = makeCanvasTexture(
      256,
      256,
      (g, w, h) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            g.fillStyle = (i + j) % 2 ? '#3f4c63' : '#323e54';
            g.fillRect(i * 64, j * 64, 64, 64);
          }
        }
        g.strokeStyle = 'rgba(10,16,28,0.55)';
        g.lineWidth = 2;
        for (let i = 0; i <= 4; i++) {
          g.beginPath();
          g.moveTo(i * 64, 0);
          g.lineTo(i * 64, h);
          g.stroke();
          g.beginPath();
          g.moveTo(0, i * 64);
          g.lineTo(w, i * 64);
          g.stroke();
        }
      },
      4,
      6
    );

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.9,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 13.5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.6);
    floor.receiveShadow = true;
    this.vaultGroup.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      map: brickTex(6, 1.5),
      roughness: 0.9,
    });
    const vaultMat = new THREE.MeshStandardMaterial({
      map: brickTex(5, 6),
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x35435c, roughness: 0.8 });

    // Side walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 13.5), wallMat);
    leftWall.position.set(-4.35, 1.1, -0.6);
    this.vaultGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 13.5), wallMat);
    rightWall.position.set(4.35, 1.1, -0.6);
    this.vaultGroup.add(rightWall);

    // Arched stone ceiling
    const vaultGeo = new THREE.CylinderGeometry(4.25, 4.25, 13.5, 28, 1, true, Math.PI / 2, Math.PI);
    const vaultMesh = new THREE.Mesh(vaultGeo, vaultMat);
    vaultMesh.position.set(0, 2.15, -0.6);
    vaultMesh.rotation.x = Math.PI / 2;
    vaultMesh.scale.z = 0.62;
    this.vaultGroup.add(vaultMesh);

    // Stone arch ribs
    [-5.6, -3.1, -0.6, 1.9, 4.4].forEach((z) => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.1, 8, 28, Math.PI), ribMat);
      rib.position.set(0, 2.15, z);
      rib.scale.y = 0.62;
      this.vaultGroup.add(rib);

      [-4.18, 4.18].forEach((x) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.24), ribMat);
        col.position.set(x, 1.1, z);
        this.vaultGroup.add(col);
      });
    });

    // Back arched wall
    const backShape = new THREE.Shape();
    backShape.moveTo(-4.25, 0);
    backShape.lineTo(4.25, 0);
    backShape.lineTo(4.25, 2.15);
    backShape.absellipse(0, 2.15, 4.25, 2.65, 0, Math.PI, false);
    backShape.lineTo(-4.25, 2.15);
    backShape.lineTo(-4.25, 0);
    const backWall = new THREE.Mesh(
      new THREE.ShapeGeometry(backShape, 28),
      new THREE.MeshStandardMaterial({ color: 0x202c42, roughness: 0.92 })
    );
    backWall.position.set(0, 0, -6.9);
    this.vaultGroup.add(backWall);
  }

  private buildShelvesAndBottles(): void {
    const rnd = this.rnd;
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.78 });

    const allJars: ShelfBottleSlot[] = [];
    const registerBottle = (x: number, y: number, z: number) => {
      const s = 0.9 + rnd() * 0.22;
      const colorIndex = Math.floor(rnd() * 4);
      const slot: ShelfBottleSlot = {
        x,
        y: y + 0.02,
        z,
        scale: s,
        colorIndex,
        unlockThreshold: rnd(),
      };
      allJars.push(slot);
      this.bottleSlotsByColor[colorIndex].push(slot);
    };

    // Left & right shelves
    [-1, 1].forEach((side) => {
      [0.45, 0.98, 1.5, 2.02, 2.52].forEach((y) => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 10.6), woodDark);
        board.position.set(side * 3.85, y, -1.4);
        this.vaultGroup.add(board);

        for (let z = 3.2; z > -6.2; z -= 0.31) {
          if (rnd() > 0.12) registerBottle(side * 3.82, y, z);
        }
      });

      [3.5, 1.0, -1.5, -4.0, -6.4].forEach((z) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.95, 0.06), woodDark);
        post.position.set(side * 3.85, 1.48, z);
        this.vaultGroup.add(post);
      });
    });

    // Curved back shelves
    [0.55, 1.15, 1.75, 2.35, 2.95, 3.55].forEach((y) => {
      const q = (y + 0.35 - 2.15) / 2.65;
      const maxX = y + 0.35 <= 2.15 ? 3.4 : 4.15 * Math.sqrt(Math.max(0, 1 - q * q)) - 0.55;
      if (maxX < 0.7) return;

      const board = new THREE.Mesh(new THREE.BoxGeometry(maxX * 2 + 0.2, 0.045, 0.38), woodDark);
      board.position.set(0, y, -6.62);
      this.vaultGroup.add(board);

      for (let x = -maxX; x <= maxX + 0.01; x += 0.3) {
        if (rnd() > 0.1) registerBottle(x, y, -6.62);
      }
    });

    // Instanced glass shells & corks
    const jarPoints = [
      [0, 0],
      [0.095, 0],
      [0.102, 0.025],
      [0.102, 0.175],
      [0.075, 0.215],
      [0.052, 0.23],
      [0.052, 0.26],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const jarGeo = new THREE.LatheGeometry(jarPoints, 12);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.12,
      depthWrite: false,
    });
    const corkGeo = new THREE.CylinderGeometry(0.056, 0.046, 0.05, 8);
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xb68a58, roughness: 0.9 });

    const glassInst = new THREE.InstancedMesh(jarGeo, glassMat, allJars.length);
    const corkInst = new THREE.InstancedMesh(corkGeo, corkMat, allJars.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();

    allJars.forEach((b, i) => {
      pos.set(b.x, b.y, b.z);
      sc.set(b.scale, b.scale, b.scale);
      m4.compose(pos, q, sc);
      glassInst.setMatrixAt(i, m4);

      pos.set(b.x, b.y + 0.265 * b.scale, b.z);
      m4.compose(pos, q, sc);
      corkInst.setMatrixAt(i, m4);
    });
    glassInst.frustumCulled = false;
    corkInst.frustumCulled = false;
    this.vaultGroup.add(glassInst, corkInst);

    // 4 luminous tear-core instanced groups (can toggle brightness via upgrades!)
    const coreColors = [0x7fc8ff, 0xa8e0ff, 0x6f9cff, 0x8fffe8];
    const coreGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.14, 10);

    coreColors.forEach((hex, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x203554,
        emissive: hex,
        emissiveIntensity: 0.9,
        roughness: 0.45,
      });
      this.bottleCoreMats.push(mat);
      const slots = this.bottleSlotsByColor[idx];
      const inst = new THREE.InstancedMesh(coreGeo, mat, slots.length);
      inst.frustumCulled = false;
      this.bottleCoreMeshes.push(inst);
      this.vaultGroup.add(inst);
    });

    this.refreshShelfLitBottles();
  }

  private refreshShelfLitBottles(): void {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();

    this.bottleSlotsByColor.forEach((slots, idx) => {
      const inst = this.bottleCoreMeshes[idx];
      slots.forEach((b, i) => {
        const isLit = b.unlockThreshold <= this.litBottleRatio;
        const s = isLit ? b.scale : b.scale * 0.22;
        pos.set(b.x, b.y + (isLit ? 0.1 * b.scale : 0.04 * b.scale), b.z);
        sc.set(s, isLit ? s : s * 0.35, s);
        m4.compose(pos, q, sc);
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  private buildMedallionAndPedestal(): void {
    const z0 = -0.6;
    const medTex = makeCanvasTexture(512, 512, (g) => {
      g.fillStyle = '#182846';
      g.beginPath();
      g.arc(256, 256, 256, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#9fc8ff';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(256, 256, 236, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(256, 256, 198, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(256, 256, 122, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = '#d4e8ff';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.save();
        g.translate(256 + Math.cos(a) * 217, 256 + Math.sin(a) * 217);
        g.rotate(a);
        g.beginPath();
        g.moveTo(0, -12);
        g.lineTo(8, 0);
        g.lineTo(0, 12);
        g.lineTo(-8, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
    });

    const medallion = new THREE.Mesh(
      new THREE.CircleGeometry(2.05, 48),
      new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.72 })
    );
    medallion.rotation.x = -Math.PI / 2;
    medallion.position.set(0, 0.015, z0);
    medallion.receiveShadow = true;
    this.vaultGroup.add(medallion);

    // Marble pedestal
    const marble = new THREE.MeshStandardMaterial({ color: 0xcbd7e4, roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3bd5a, metalness: 0.82, roughness: 0.28 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.14, 32), marble);
    base.position.set(0, 0.07, z0);
    base.castShadow = true;
    this.vaultGroup.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.68, 28), marble);
    pillar.position.set(0, 0.48, z0);
    pillar.castShadow = true;
    this.vaultGroup.add(pillar);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.07, 32), marble);
    top.position.set(0, 0.85, z0);
    this.vaultGroup.add(top);

    this.pedestalRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.016, 8, 36), gold);
    this.pedestalRing.rotation.x = Math.PI / 2;
    this.pedestalRing.position.set(0, 0.89, z0);
    this.vaultGroup.add(this.pedestalRing);

    // Large glass vessel on pedestal
    const vesselPts = [
      [0, 0],
      [0.33, 0],
      [0.37, 0.05],
      [0.37, 0.65],
      [0.29, 0.77],
      [0.2, 0.83],
      [0.2, 0.92],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const vessel = new THREE.Mesh(
      new THREE.LatheGeometry(vesselPts, 28),
      new THREE.MeshStandardMaterial({
        color: 0xe8f6ff,
        transparent: true,
        opacity: 0.24,
        roughness: 0.06,
        metalness: 0.15,
        depthWrite: false,
      })
    );
    vessel.position.set(0, 0.88, z0);
    this.vaultGroup.add(vessel);

    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.18, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xb68a58, roughness: 0.88 })
    );
    cork.position.set(0, 1.82, z0);
    this.vaultGroup.add(cork);

    // Floating central tear gem
    this.pedestalGemGroup = new THREE.Group();
    this.pedestalGemGroup.position.set(0, 1.32, z0);
    this.vaultGroup.add(this.pedestalGemGroup);

    this.pedestalGemMat = new THREE.MeshStandardMaterial({
      color: 0x76c5ff,
      emissive: 0x3a84ff,
      emissiveIntensity: 1.0,
      roughness: 0.12,
      metalness: 0.18,
      flatShading: true,
    });
    const mainGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), this.pedestalGemMat);
    mainGem.scale.set(0.88, 1.4, 0.88);
    this.pedestalGemGroup.add(mainGem);

    // Orbital earned gemstones (up to 12 permanently unlocked around the pedestal!)
    const orbitColors = [0x7fc8ff, 0xff8da8, 0xffd78c, 0xd9ecff, 0xfff1a8];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const gMat = new THREE.MeshStandardMaterial({
        color: orbitColors[i % orbitColors.length],
        emissive: orbitColors[i % orbitColors.length],
        emissiveIntensity: 0.85,
        roughness: 0.15,
        flatShading: true,
      });
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.065), gMat);
      m.position.set(Math.cos(a) * 0.24, -0.25 + (i % 3) * 0.14, Math.sin(a) * 0.24);
      m.visible = false;
      this.pedestalGemGroup.add(m);
      this.pedestalOrbitalGems.push(m);
    }

    this.addGlow(0xbfe4ff, 2.3, 0, 1.32, z0, 0.62);
    this.addGlow(0x5f9bff, 3.8, 0, 1.32, z0, 0.26);

    // Volumetric light beam from arched ceiling
    const beamTex = makeCanvasTexture(16, 128, (g) => {
      const r = g.createLinearGradient(0, 0, 0, 128);
      r.addColorStop(0, 'rgba(180,224,255,0.92)');
      r.addColorStop(1, 'rgba(150,205,255,0.02)');
      g.fillStyle = r;
      g.fillRect(0, 0, 16, 128);
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      map: beamTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.1), this.beamMat);
    b1.position.set(0, 2.25, z0);
    const b2 = b1.clone();
    b2.rotation.y = Math.PI / 2;
    this.vaultGroup.add(b1, b2);
  }

  private buildProps(): void {
    const woodL = new THREE.MeshStandardMaterial({ color: 0x62452f, roughness: 0.72 });
    const woodD = new THREE.MeshStandardMaterial({ color: 0x3b281c, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3bd5a, metalness: 0.82, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2234, roughness: 0.7, metalness: 0.3 });
    const blueCloth = new THREE.MeshStandardMaterial({ color: 0x2652a4, roughness: 0.82, side: THREE.DoubleSide });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf1e8d0, roughness: 0.88 });

    // Right-front Workbench (作業台)
    const wb = new THREE.Group();
    wb.position.set(2.45, 0, 1.25);
    this.vaultGroup.add(wb);
    const wbTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.7), woodL);
    wbTop.position.set(0, 0.84, 0);
    wb.add(wbTop);
    [
      [-0.44, -0.76],
      [0.44, -0.76],
      [-0.44, 0.76],
      [0.44, 0.76],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 0.07), woodD);
      leg.position.set(x, 0.41, z);
      wb.add(leg);
    });
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.03, 16), gold);
    tray.position.set(0, 0.9, 0.3);
    wb.add(tray);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.24), blueCloth);
    cloth.position.set(0.15, 0.9, -0.35);
    cloth.rotation.y = 0.35;
    wb.add(cloth);
    this.workbenchGlow = this.addGlow(0x9fd8ff, 1.1, 0, 1.08, 0.2, 0.45, wb);

    // Right-back Label & Ink Desk (ラベル机)
    const dk = new THREE.Group();
    dk.position.set(2.45, 0, -3.55);
    this.vaultGroup.add(dk);
    const dkTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.8), woodL);
    dkTop.position.set(0, 0.78, 0);
    dk.add(dkTop);
    [
      [-0.64, -0.34],
      [0.64, -0.34],
      [-0.64, 0.34],
      [0.64, 0.34],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), woodD);
      leg.position.set(x, 0.38, z);
      dk.add(leg);
    });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.24), cream);
    book.position.set(-0.2, 0.84, 0);
    book.rotation.y = 0.2;
    dk.add(book);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), gold);
    lampStem.position.set(-0.48, 1.02, -0.2);
    dk.add(lampStem);
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.12, 0.14, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xe4f2ff,
        emissive: 0x8cc8ff,
        emissiveIntensity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.set(-0.48, 1.24, -0.2);
    dk.add(lampShade);
    this.deskLampGlow = this.addGlow(0xa8dcff, 1.4, -0.48, 1.22, -0.2, 0.5, dk);

    // Left Rolling Ladder on rail (移動はしご)
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 10.6, 8), dark);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(-3.55, 2.86, -1.4);
    this.vaultGroup.add(rail);

    this.ladderGroup = new THREE.Group();
    this.ladderGroup.position.set(0, 0, -2.8);
    this.vaultGroup.add(this.ladderGroup);
    [-0.22, 0.22].forEach((dz) => {
      const sideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.95, 6), woodD);
      sideBar.position.set(-3.2, 1.42, dz);
      sideBar.rotation.z = 0.24;
      this.ladderGroup.add(sideBar);
    });
    for (let i = 1; i < 9; i++) {
      const f = i / 9;
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, 0.44), woodL);
      rung.position.set(-2.85 + (-3.55 - -2.85) * f, f * 2.84, 0);
      this.ladderGroup.add(rung);
    }

    // Left-front Wooden Cart (荷車)
    const cart = new THREE.Group();
    cart.position.set(-2.45, 0, 1.45);
    this.vaultGroup.add(cart);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 1.35), woodL);
    bed.position.set(0, 0.44, 0);
    cart.add(bed);
    [
      [-0.48, -0.54],
      [0.48, -0.54],
      [-0.48, 0.54],
      [0.48, 0.54],
    ].forEach(([x, z]) => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14), woodD);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, 0.18, z);
      cart.add(wh);
    });

    // 6 glowing cart jars that appear as cart upgrades!
    for (let i = 0; i < 6; i++) {
      const jg = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10),
        new THREE.MeshStandardMaterial({
          color: 0x9fd8ff,
          emissive: 0x5ab0ff,
          emissiveIntensity: 0.75,
          roughness: 0.25,
        })
      );
      body.position.y = 0.11;
      jg.add(body);
      jg.position.set(-0.24 + (i % 3) * 0.24, 0.58, -0.25 + Math.floor(i / 3) * 0.44);
      jg.visible = i < 2;
      cart.add(jg);
      this.cartJars.push(jg);
    }

    // Hanging blue banners (青い布の旗)
    [
      [-2.4, -4.4],
      [2.4, -4.4],
      [-2.4, 1.5],
      [2.4, 1.5],
    ].forEach(([x, z], idx) => {
      const g = new THREE.Group();
      g.position.set(x, 3.85, z);
      this.vaultGroup.add(g);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 6), gold);
      bar.rotation.z = Math.PI / 2;
      g.add(bar);
      const clothM = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.35), blueCloth);
      clothM.position.y = -0.7;
      g.add(clothM);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 0.02), gold);
      trim.position.y = -1.36;
      g.add(trim);
      g.userData.phase = idx * 1.4;
      this.banners.push(g);
    });
  }

  private buildOrgelCrown(): void {
    // Rotating celestial music-box ring above the pedestal!
    this.orgelRingGroup = new THREE.Group();
    this.orgelRingGroup.position.set(0, 3.55, -0.6);
    this.vaultGroup.add(this.orgelRingGroup);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2d07b,
      emissive: 0x705418,
      emissiveIntensity: 0.45,
      metalness: 0.85,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.024, 8, 48), goldMat);
    ring.rotation.x = Math.PI / 2;
    this.orgelRingGroup.add(ring);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const drop = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.065),
        new THREE.MeshStandardMaterial({
          color: 0xa8e2ff,
          emissive: 0x5fb8ff,
          emissiveIntensity: 0.9,
          flatShading: true,
        })
      );
      drop.scale.set(0.8, 1.4, 0.8);
      drop.position.set(Math.cos(a) * 1.18, -0.14, Math.sin(a) * 1.18);
      this.orgelRingGroup.add(drop);
    }
  }

  private buildDustAndAmbientDrops(): void {
    const count = 130;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (this.rnd() * 2 - 1) * 3.8;
      const y = 0.25 + this.rnd() * 3.7;
      const z = -6.2 + this.rnd() * 9.5;
      const ph = this.rnd() * Math.PI * 2;
      this.dustBase.push([x, y, z, ph]);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcbe8ff,
      size: 0.09,
      map: this.glowTex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.vaultGroup.add(this.dustPoints);
  }

  public syncUpgrades(state: SaveState): void {
    this.litBottleRatio = Math.min(1, 0.24 + state.upgrades.shelves * 0.095);
    this.refreshShelfLitBottles();

    this.ladderLevel = state.upgrades.ladder;
    this.musicboxLevel = state.upgrades.musicbox;

    // Cart jars visible
    const visibleJars = Math.min(this.cartJars.length, 1 + state.upgrades.cart);
    this.cartJars.forEach((j, i) => {
      j.visible = i < visibleJars;
    });

    // Workbench & desk glow scale
    this.workbenchGlow.scale.setScalar(1.05 + state.upgrades.workbench * 0.16);
    this.deskLampGlow.scale.setScalar(1.25 + state.upgrades.desk * 0.2);

    // Orbital gems around pedestal
    const gemsCount = Math.min(this.pedestalOrbitalGems.length, state.totalGemsCrafted);
    this.pedestalOrbitalGems.forEach((g, i) => {
      g.visible = i < gemsCount;
    });
  }

  public update(
    t: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    const pulse = Math.pow(1 - beatPhase, 2.2);

    // Smoothly blend camera focus (wide vista vs gentle pedestal zoom during polish)
    this.polishFocusAmount += (this.targetPolishFocus - this.polishFocusAmount) * Math.min(1, dt * 4.5);

    const targetCamX = this.baseCamPos.x + this.pointerNdc.x * 0.35 * (1 - this.polishFocusAmount * 0.6);
    const targetCamY = this.baseCamPos.y + this.pointerNdc.y * 0.18 - this.polishFocusAmount * 0.55;
    const targetCamZ = this.baseCamPos.z - this.polishFocusAmount * 1.95;

    this.camera.position.x += (targetCamX - this.camera.position.x) * Math.min(1, dt * 5);
    this.camera.position.y += (targetCamY - this.camera.position.y) * Math.min(1, dt * 5);
    this.camera.position.z += (targetCamZ - this.camera.position.z) * Math.min(1, dt * 5);

    const lookY = this.baseLookAt.y - this.polishFocusAmount * 0.08;
    const lookZ = this.baseLookAt.z + this.polishFocusAmount * 0.8;
    this.camera.lookAt(this.pointerNdc.x * 0.25, lookY, lookZ);

    // Beat-reactive lighting
    const feverBoost = isFever ? 1.55 : 1.0;
    this.centerLight.intensity = (2.0 + pulse * 0.85 + energy * 0.7) * feverBoost;
    this.leftLight.intensity = (1.05 + pulse * 0.45) * feverBoost;
    this.rightLight.intensity = (1.05 + pulse * 0.45) * feverBoost;
    this.backLight.intensity = 0.85 + energy * 0.55;
    this.feverSpot.intensity += ((isFever ? 2.4 + pulse * 1.6 : 0) - this.feverSpot.intensity) * Math.min(1, dt * 5);

    this.centerLight.color.setHex(isFever ? 0xcceeff : 0xbfe4ff);

    // Bottle core shimmer synced to music
    this.bottleCoreMats.forEach((m, i) => {
      const wave = 0.85 + 0.35 * Math.sin(t * 1.8 + i * 1.5) + pulse * (isFever ? 0.9 : 0.38);
      m.emissiveIntensity = wave;
    });

    // Central pedestal gem rotation & beat bounce
    this.pedestalGemGroup.rotation.y += dt * (isFever ? 2.3 : 0.65);
    this.pedestalGemGroup.position.y = 1.32 + Math.sin(t * 2.1) * 0.04 + pulse * 0.04;
    this.pedestalGemMat.emissiveIntensity = 0.95 + pulse * 0.7 + (isFever ? 0.6 : 0);
    this.pedestalRing.scale.setScalar(1 + pulse * 0.045);

    // Ceiling light beam
    this.beamMat.opacity = 0.14 + pulse * 0.09 + (isFever ? 0.14 : 0) + this.musicboxLevel * 0.02;

    // Rotating overhead music-box ring
    const orgelSpeed = (0.28 + this.musicboxLevel * 0.14) * (isFever ? 3.2 : 1.0);
    this.orgelRingGroup.rotation.y += dt * orgelSpeed;
    this.orgelRingGroup.position.y = 3.55 + Math.sin(t * 1.5) * 0.04;

    // Rolling ladder patrols when upgraded!
    if (this.ladderLevel > 0) {
      const speed = 0.22 + this.ladderLevel * 0.08;
      this.ladderGroup.position.z = -1.4 + Math.sin(t * speed) * 2.9;
    }

    // Gentle banner sway
    this.banners.forEach((b) => {
      const ph = b.userData.phase as number;
      b.rotation.z = 0.035 * Math.sin(t * 0.9 + ph);
      b.rotation.x = 0.025 * Math.sin(t * 0.65 + ph);
    });

    // Floating luminous dust motes
    const arr = this.dustPoints.geometry.attributes.position.array as Float32Array;
    const speedMul = isFever ? 2.6 : 1.0;
    for (let i = 0; i < this.dustBase.length; i++) {
      const [bx, by, bz, ph] = this.dustBase[i];
      arr[i * 3] = bx + Math.sin(t * 0.35 + ph) * 0.25;
      arr[i * 3 + 1] = 0.2 + ((by + t * 0.09 * speedMul) % 3.8);
      arr[i * 3 + 2] = bz + Math.cos(t * 0.28 + ph) * 0.25;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
