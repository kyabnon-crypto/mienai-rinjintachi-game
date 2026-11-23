import * as THREE from 'three';
import { DREAM_PEDESTALS } from './config';
import { YumeatsumeSaveState } from './types';

interface DreamPedestalVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  signCanvas: HTMLCanvasElement;
  signTex: THREE.CanvasTexture;
  signBoard: THREE.Mesh;
  lidMesh: THREE.Mesh;
  dioramaGroup: THREE.Group;
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
  accentColor: THREE.Color;
  urgentColor: THREE.Color;
  lastRenderedBucket: number;
  lastRenderedUrgent: boolean;
  lastRenderedDone: boolean;
  pulse: number;
  lidOpenAmt: number;
}

interface DreamReturnArc {
  group: THREE.Group;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  dur: number;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function create3DDreamStarGeometry(outerR: number): THREE.ExtrudeGeometry {
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
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: outerR * 0.08,
    bevelSize: outerR * 0.06,
    bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function createJarLatheGeo(r: number, h: number, segs = 22): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.92, 0),
    new THREE.Vector2(r, h * 0.06),
    new THREE.Vector2(r, h * 0.72),
    new THREE.Vector2(r * 0.8, h * 0.84),
    new THREE.Vector2(r * 0.56, h * 0.9),
    new THREE.Vector2(r * 0.56, h),
  ];
  return new THREE.LatheGeometry(pts, segs);
}

/**
 * 3D Nocturnal Glass Greenhouse "Dream Conservatory" ("夜の丘のガラス温室・夢の保管庫").
 * Faithfully fuses the official picture book (`story.txt`, `11.ユメアツメ.png`, `11.ユメアツメ_スライド.png`)
 * and official 3D room tour (`ユメアツメの部屋.html`):
 *  - Starry night sky above the west hill of Tokoyo-cho with 1,200+ twinkling stars, warm moon,
 *    conifer silhouettes, 240+ distant town windows at the foot of the hill, fireflies,
 *    and rising pink-gold dream lights ascending above the pitched glass roof
 *  - Teal-stone foundation, dark wrought-iron mullions, translucent conservatory glass walls & roof trusses,
 *    checkered teal-slate stone floor & the iconic circular gold-rimmed 12-star Medallion Rug
 *  - Towering wooden shelves along the left, right & back gable walls packed with 300+ instanced glowing
 *    4-color Dream Jars (amber, rose-pink, mint-teal, sky-blue) & the iron-rail Sliding Ladder ("移動はしご")
 *  - Central Dream Lantern Beacon Pedestal & 6-orb overhead Dream Chandelier
 *  - 4 interactive 3D Dream Showcase Pedestals with pop-open cork lids & authentic miniature dioramas inside:
 *      0. Twenty-Year-Old Acoustic Guitar ("二十年前の音楽の夢")
 *      1. Two-Tier Frosted Strawberry Cake ("パティシエの夢")
 *      2. Astronaut Helmet with Gold Visor ("宇宙飛行士の夢")
 *      3. Artist's Palette & Paintbrush ("絵描きの夢")
 *  - Left Bottling Workbench (sample jars, brass funnel, labels, cork dish, stool) & Pink Cotton Candy stand
 *  - Right Receipt Ledger Desk (open teal ledger, inkwell & feather quill, brass shade lamp, live-updating
 *    "今夜の夢の保管庫メモ" board, name tags & stool)
 *  - Lush terracotta potted conservatory plants & hanging ivy baskets with glowing rose dream-buds
 */
export class DreamGreenhouseScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpNdc = new THREE.Vector2();

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private camPos = new THREE.Vector3(0, 6.2, 9.0);
  private camTarget = new THREE.Vector3(0, 1.35, -0.75);
  private shakeTimer = 0;
  private shakeIntensity = 0;

  // Lights
  private hemiLight: THREE.HemisphereLight;
  private keyDirLight: THREE.DirectionalLight;
  private centerLanternLight: THREE.PointLight;
  private roseShelfLight: THREE.PointLight;
  private tealShelfLight: THREE.PointLight;
  private backWallLight: THREE.PointLight;

  // Animated environment props
  private coreMaterials: THREE.MeshStandardMaterial[] = [];
  private ceilingOrbs: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
  private floatingDreams: { group: THREE.Group; x: number; y: number; z: number; phase: number }[] = [];
  private glowSprites: { sprite: THREE.Sprite; baseScale: number; phase: number }[] = [];
  private skyStarsA!: THREE.PointsMaterial;
  private skyStarsB!: THREE.PointsMaterial;
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];
  private risingPoints!: THREE.Points;
  private risingBase: [number, number, number, number][] = [];
  private centerBeaconOrb!: THREE.Mesh;
  private dreamArcs: DreamReturnArc[] = [];

  // Live Conservatory Ledger Board texture
  private ledgerCanvas!: HTMLCanvasElement;
  private ledgerTex!: THREE.CanvasTexture;
  private lastLedgerKey = '';

  // Upgrade-responsive 3D prop groups
  private benchExtraGroup = new THREE.Group();
  private domeExtraGroup = new THREE.Group();
  private satchelExtraGroup = new THREE.Group();
  private ladderExtraGroup = new THREE.Group();
  private cottonExtraGroup = new THREE.Group();
  private deskExtraGroup = new THREE.Group();

  // Interactive 4 dream pedestals
  private pedestalVisuals: DreamPedestalVisual[] = [];

  // Shared materials for soaring awakened dream arcs
  private arcStarGeo: THREE.ExtrudeGeometry;
  private arcStarMat: THREE.MeshStandardMaterial;

  private lidFlashTimer = 0;
  private simClock = 0;

  // Reusable textures/materials
  private woodDarkMat!: THREE.MeshStandardMaterial;
  private woodLightMat!: THREE.MeshStandardMaterial;
  private marbleMat!: THREE.MeshStandardMaterial;
  private ironMat!: THREE.MeshStandardMaterial;
  private goldMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshStandardMaterial;
  private corkMat!: THREE.MeshStandardMaterial;
  private creamMat!: THREE.MeshStandardMaterial;

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
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d1a);
    this.scene.fog = new THREE.FogExp2(0x070d1a, 0.0155);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 180);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.arcStarGeo = create3DDreamStarGeometry(0.15);
    this.arcStarMat = new THREE.MeshStandardMaterial({
      color: 0xfff0be,
      emissive: 0xffc862,
      emissiveIntensity: 1.55,
      roughness: 0.25,
    });

    this.scene.add(this.worldGroup);

    // Nocturnal glass-greenhouse lighting (warm amber + rose-pink + mint-teal conservatory tones)
    this.hemiLight = new THREE.HemisphereLight(0x88b4cc, 0x22323c, 0.8);
    this.scene.add(this.hemiLight);

    this.keyDirLight = new THREE.DirectionalLight(0xaad0f5, 0.78);
    this.keyDirLight.position.set(-6.0, 14.0, 7.0);
    this.keyDirLight.castShadow = true;
    this.keyDirLight.shadow.mapSize.set(1024, 1024);
    this.keyDirLight.shadow.camera.near = 1;
    this.keyDirLight.shadow.camera.far = 38;
    const d = 10.5;
    this.keyDirLight.shadow.camera.left = -d;
    this.keyDirLight.shadow.camera.right = d;
    this.keyDirLight.shadow.camera.top = d;
    this.keyDirLight.shadow.camera.bottom = -d;
    this.keyDirLight.shadow.bias = -0.0005;
    this.scene.add(this.keyDirLight);

    this.centerLanternLight = new THREE.PointLight(0xffd698, 2.35, 12.0, 1.28);
    this.centerLanternLight.position.set(0, 2.75, -0.35);
    this.scene.add(this.centerLanternLight);

    this.roseShelfLight = new THREE.PointLight(0xffb6cf, 1.3, 9.5, 1.35);
    this.roseShelfLight.position.set(-4.2, 2.5, -1.6);
    this.scene.add(this.roseShelfLight);

    this.tealShelfLight = new THREE.PointLight(0x9beee0, 1.3, 9.5, 1.35);
    this.tealShelfLight.position.set(4.2, 2.5, -1.6);
    this.scene.add(this.tealShelfLight);

    this.backWallLight = new THREE.PointLight(0xffe0a8, 1.5, 11.5, 1.3);
    this.backWallLight.position.set(0, 3.6, -4.6);
    this.scene.add(this.backWallLight);

    this.buildSharedMaterials();
    this.buildNightSkyAndHill();
    this.buildGreenhouseShell();
    this.buildDreamJarShelvesAndLadder();
    this.buildCentralMedallionBeacon();
    this.buildWorkbenchAndCottonCandy();
    this.buildReceiptDeskAndBoard();
    this.buildBotanicalPlants();
    this.buildCeilingOrbsAndAmbientLights();
    this.buildFourDreamPedestals();

    this.worldGroup.add(
      this.benchExtraGroup,
      this.domeExtraGroup,
      this.satchelExtraGroup,
      this.ladderExtraGroup,
      this.cottonExtraGroup,
      this.deskExtraGroup
    );
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.28, 'rgba(255,255,255,0.48)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  private createWoodTexture(hue: number, l0: number, seed: number): THREE.CanvasTexture {
    const rnd = createSeededRandom(seed);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const planks = 5;
    const ph = 256 / planks;
    for (let i = 0; i < planks; i++) {
      const y0 = i * ph;
      g.fillStyle = `hsl(${hue + rnd() * 6}, ${32 + rnd() * 10}%, ${l0 + rnd() * 8}%)`;
      g.fillRect(0, y0, 256, ph);
      for (let k = 0; k < 22; k++) {
        g.strokeStyle =
          rnd() < 0.5
            ? `rgba(20,10,5,${0.05 + rnd() * 0.08})`
            : `rgba(255,220,170,${0.04 + rnd() * 0.07})`;
        g.lineWidth = 0.7 + rnd() * 1.2;
        const yy = y0 + rnd() * ph;
        g.beginPath();
        g.moveTo(0, yy);
        g.bezierCurveTo(80, yy + (rnd() - 0.5) * 4, 170, yy + (rnd() - 0.5) * 4, 256, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(10,5,3,0.48)';
      g.fillRect(0, y0, 256, 2);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(2, 2);
    return tx;
  }

  private createPlasterTexture(baseHex: string, seed: number): THREE.CanvasTexture {
    const rnd = createSeededRandom(seed);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = baseHex;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle =
        rnd() < 0.5
          ? `rgba(255,255,255,${rnd() * 0.055})`
          : `rgba(10,16,22,${rnd() * 0.08})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  }

  private addGlow(
    color: number,
    scale: number,
    x: number,
    y: number,
    z: number,
    opacity = 0.55,
    parent: THREE.Object3D = this.worldGroup
  ): THREE.Sprite {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sp.scale.set(scale, scale, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    this.glowSprites.push({ sprite: sp, baseScale: scale, phase: Math.random() * Math.PI * 2 });
    return sp;
  }

  private buildSharedMaterials(): void {
    this.woodDarkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createWoodTexture(24, 21, 11),
      roughness: 0.78,
    });
    this.woodLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createWoodTexture(30, 31, 23),
      roughness: 0.72,
    });
    this.marbleMat = new THREE.MeshStandardMaterial({
      color: 0xd0dad8,
      roughness: 0.36,
      metalness: 0.06,
    });
    this.ironMat = new THREE.MeshStandardMaterial({
      color: 0x1c2730,
      roughness: 0.48,
      metalness: 0.65,
    });
    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xe4bc56,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xd6eef4,
      transparent: true,
      opacity: 0.24,
      roughness: 0.06,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.corkMat = new THREE.MeshStandardMaterial({
      color: 0xba8c56,
      roughness: 0.92,
    });
    this.creamMat = new THREE.MeshStandardMaterial({
      color: 0xf1e8d2,
      roughness: 0.86,
    });

    const coreColors = [0xffd890, 0xffb2cc, 0x9ce4d8, 0xb8ceff];
    this.coreMaterials = coreColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: 0x2e2432,
          emissive: c,
          emissiveIntensity: 0.92,
          roughness: 0.42,
        })
    );
  }

  private buildNightSkyAndHill(): void {
    const rnd = createSeededRandom(1101);

    const makeStars = (count: number, size: number, op: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const y = 0.06 + rnd() * 0.92;
        const r = Math.sqrt(1 - y * y);
        const R0 = 96;
        pos[i * 3] = Math.cos(a) * r * R0;
        pos[i * 3 + 1] = y * R0 - 4;
        pos[i * 3 + 2] = Math.sin(a) * r * R0 - 12;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xfff3da,
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity: op,
        fog: false,
        depthWrite: false,
      });
      this.scene.add(new THREE.Points(geo, mat));
      return mat;
    };

    this.skyStarsA = makeStars(1050, 1.8, 0.84);
    this.skyStarsB = makeStars(180, 3.2, 0.94);

    // Warm crescent-tinted full moon over the west hill
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2d2, fog: false })
    );
    moon.position.set(-19, 17, -46);
    this.scene.add(moon);
    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xc2d8ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    moonGlow.scale.set(28, 28, 1);
    moonGlow.position.set(-19, 17, -46.5);
    this.scene.add(moonGlow);

    // Soft teal-indigo horizon mist glow
    const hz = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0x355c78,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    hz.scale.set(130, 56, 1);
    hz.position.set(0, 4, -68);
    this.scene.add(hz);

    // Grassy west hilltop exterior surrounding the conservatory
    const hillGround = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ color: 0x162f30, roughness: 1.0 })
    );
    hillGround.rotation.x = -Math.PI / 2;
    hillGround.position.set(0, -0.06, -4);
    this.worldGroup.add(hillGround);

    // Silhouette hill conifers framing the glass greenhouse
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 1.6, 6);
    const foliageGeo = new THREE.ConeGeometry(1.15, 3.4, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2c221d, roughness: 0.95 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x132c32, roughness: 0.92 });
    const trees: [number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const a = -Math.PI * 0.95 + (i / 33) * Math.PI * 1.9;
      const dist = 12.5 + rnd() * 22;
      const x = Math.cos(a) * dist;
      const z = -6 + Math.sin(a) * dist * 0.72;
      if (z > 4 && Math.abs(x) < 9) continue;
      trees.push([x, z, 0.8 + rnd() * 1.1]);
    }
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const folInst = new THREE.InstancedMesh(foliageGeo, foliageMat, trees.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    trees.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 0.8 * s, z), q, new THREE.Vector3(s, s, s));
      trunkInst.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 3.0 * s, z), q, new THREE.Vector3(s, s, s));
      folInst.setMatrixAt(i, m4);
    });
    this.worldGroup.add(trunkInst, folInst);

    // Distant warm town windows sparkling at the foot of the west hill
    const winCount = 220;
    const winInst = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.65, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffd092, fog: false }),
      winCount
    );
    for (let i = 0; i < winCount; i++) {
      const x = (rnd() * 2 - 1) * 58;
      const y = -4.5 + rnd() * 3.2;
      const z = -32 - rnd() * 44;
      const sc = 0.6 + rnd() * 0.85;
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, 1));
      winInst.setMatrixAt(i, m4);
    }
    this.worldGroup.add(winInst);
  }

  private buildGreenhouseShell(): void {
    // Checkered teal-slate stone floor (faithful to ユメアツメの部屋.html)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fg = floorCanvas.getContext('2d')!;
    const rnd = createSeededRandom(31);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        fg.fillStyle = (i + j) % 2 ? '#52707a' : '#435e67';
        fg.fillRect(i * 64, j * 64, 64, 64);
      }
    }
    for (let i = 0; i < 550; i++) {
      fg.fillStyle = `rgba(255,255,255,${rnd() * 0.055})`;
      fg.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    fg.strokeStyle = 'rgba(14,24,30,0.48)';
    fg.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      fg.beginPath();
      fg.moveTo(i * 64, 0);
      fg.lineTo(i * 64, 256);
      fg.stroke();
      fg.beginPath();
      fg.moveTo(0, i * 64);
      fg.lineTo(256, i * 64);
      fg.stroke();
    }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4.5, 4);

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(11.6, 9.6),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floorTex,
        roughness: 0.48,
        metalness: 0.06,
      })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, -0.35);
    floorMesh.receiveShadow = true;
    this.worldGroup.add(floorMesh);

    // Iconic central circular gold-rimmed 12-star Medallion Rug
    const medCanvas = document.createElement('canvas');
    medCanvas.width = 512;
    medCanvas.height = 512;
    const mg = medCanvas.getContext('2d')!;
    mg.fillStyle = '#203b44';
    mg.beginPath();
    mg.arc(256, 256, 252, 0, Math.PI * 2);
    mg.fill();
    mg.strokeStyle = '#dfb050';
    mg.lineWidth = 8;
    mg.beginPath();
    mg.arc(256, 256, 236, 0, Math.PI * 2);
    mg.stroke();
    mg.lineWidth = 3;
    mg.beginPath();
    mg.arc(256, 256, 200, 0, Math.PI * 2);
    mg.stroke();
    mg.beginPath();
    mg.arc(256, 256, 122, 0, Math.PI * 2);
    mg.stroke();
    mg.fillStyle = '#f2d89c';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 218;
      mg.save();
      mg.translate(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
      mg.rotate(a);
      mg.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 5 : 12;
        const b = (k / 10) * Math.PI * 2;
        if (k === 0) mg.moveTo(Math.cos(b) * rr, Math.sin(b) * rr);
        else mg.lineTo(Math.cos(b) * rr, Math.sin(b) * rr);
      }
      mg.closePath();
      mg.fill();
      mg.restore();
    }
    const medTex = new THREE.CanvasTexture(medCanvas);
    const medallion = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 48),
      new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.85 })
    );
    medallion.rotation.x = -Math.PI / 2;
    medallion.position.set(0, 0.012, -0.35);
    medallion.receiveShadow = true;
    this.worldGroup.add(medallion);

    // Teal stone low foundation walls & back gable wall
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createPlasterTexture('#2c4a52', 41),
      roughness: 0.9,
    });
    const inWallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createPlasterTexture('#213942', 53),
      roughness: 0.94,
    });

    const halfW = 5.75;
    const wallLen = 9.4;
    const centerZ = -0.35;

    // Left & Right low stone bases + tall glass windows + wrought-iron mullions
    [-1, 1].forEach((side) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, wallLen), stoneMat);
      base.position.set(side * halfW, 0.31, centerZ);
      base.receiveShadow = true;
      this.worldGroup.add(base);

      const pane = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, 2.7), this.glassMat);
      pane.position.set(side * (halfW - 0.05), 1.97, centerZ);
      pane.rotation.y = Math.PI / 2;
      this.worldGroup.add(pane);

      for (let i = 0; i <= 5; i++) {
        const z = -5.0 + i * 1.85;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 0.08), this.ironMat);
        post.position.set(side * (halfW - 0.05), 2.0, z);
        this.worldGroup.add(post);
      }
      const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, wallLen), this.ironMat);
      midRail.position.set(side * (halfW - 0.05), 1.9, centerZ);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, wallLen), this.ironMat);
      topRail.position.set(side * (halfW - 0.05), 3.35, centerZ);
      this.worldGroup.add(midRail, topRail);
    });

    // Back gable conservatory wall (at z = -5.05) with arched glowing skylight glass above the tall shelf
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-halfW, 0);
    gableShape.lineTo(halfW, 0);
    gableShape.lineTo(halfW, 3.35);
    gableShape.lineTo(0, 6.2);
    gableShape.lineTo(-halfW, 3.35);
    gableShape.closePath();
    const backWall = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), inWallMat);
    backWall.position.set(0, 0, -5.08);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    // Ornate arched glass rose-window medallion high on the back gable
    const archGlass = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 28),
      new THREE.MeshStandardMaterial({
        color: 0xffe4b8,
        emissive: 0xffc688,
        emissiveIntensity: 0.48,
        transparent: true,
        opacity: 0.34,
        roughness: 0.15,
      })
    );
    archGlass.position.set(0, 4.75, -5.03);
    this.worldGroup.add(archGlass);

    const archFrame = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.055, 8, 32), this.ironMat);
    archFrame.position.set(0, 4.75, -5.01);
    this.worldGroup.add(archFrame);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 0.04), this.ironMat);
      spoke.position.set(0, 4.75, -5.01);
      spoke.rotation.z = (i * Math.PI) / 4;
      this.worldGroup.add(spoke);
    }

    // Soaring pitched conservatory glass roof trusses (kept high & translucent so camera view is unobstructed)
    const roofAngle = Math.atan2(2.85, halfW);
    const slopeLen = Math.hypot(halfW, 2.85);
    [-1, 1].forEach((side) => {
      const slopeGrp = new THREE.Group();
      slopeGrp.position.set(side * (halfW * 0.5), 3.35 + 1.425, centerZ);
      slopeGrp.rotation.z = -side * roofAngle;

      const glassRoof = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen + 0.2, 0.03, wallLen),
        new THREE.MeshStandardMaterial({
          color: 0xcbe8f0,
          transparent: true,
          opacity: 0.075,
          roughness: 0.08,
          depthWrite: false,
        })
      );
      slopeGrp.add(glassRoof);

      [-4.6, -2.75, -0.9, 0.95, 2.8].forEach((zOff) => {
        const rafter = new THREE.Mesh(new THREE.BoxGeometry(slopeLen + 0.1, 0.08, 0.08), this.ironMat);
        rafter.position.set(0, -0.04, zOff);
        slopeGrp.add(rafter);
      });
      this.worldGroup.add(slopeGrp);
    });

    // Ridge iron beam & tie beams
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, wallLen), this.ironMat);
    ridge.position.set(0, 6.2, centerZ);
    this.worldGroup.add(ridge);

    [-4.6, -2.75, -0.9, 0.95].forEach((z) => {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.055, 0.055), this.ironMat);
      tie.position.set(0, 3.35, z);
      this.worldGroup.add(tie);
    });

    // Low front stone terrace border & entrance lantern posts
    [-3.6, 3.6].forEach((x) => {
      const post = new THREE.Group();
      post.position.set(x, 0, 4.15);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.45, 8), this.ironMat);
      pole.position.y = 0.725;
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 10),
        new THREE.MeshStandardMaterial({
          color: 0xfff2cc,
          emissive: 0xffce7a,
          emissiveIntensity: 1.1,
          roughness: 0.35,
        })
      );
      globe.position.y = 1.5;
      post.add(pole, globe);
      this.worldGroup.add(post);
      this.addGlow(0xffd48c, 1.9, x, 1.5, 4.15, 0.42);
    });
  }

  private buildDreamJarShelvesAndLadder(): void {
    const rnd = createSeededRandom(707);
    const jarPositions: [number, number, number, number][] = [];
    const coreBuckets: [number, number, number, number][][] = [[], [], [], []];

    // Left & Right wooden shelves lined with glowing glass dream jars
    [-1, 1].forEach((side) => {
      const sx = side * 5.28;
      [0.65, 1.22, 1.79, 2.36].forEach((y) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 7.6), this.woodDarkMat);
        plank.position.set(sx, y, -0.8);
        this.worldGroup.add(plank);
        for (let z = -4.3; z <= 2.7; z += 0.32) {
          if (rnd() > 0.14) {
            const sc = 0.88 + rnd() * 0.24;
            const k = Math.floor(rnd() * 4);
            jarPositions.push([sx, y + 0.025, z, sc]);
            coreBuckets[k].push([sx, y + 0.025 + 0.11 * sc, z, sc]);
          }
        }
      });
      [-4.6, -2.0, 0.6, 3.0].forEach((z) => {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.6, 0.06), this.woodDarkMat);
        upright.position.set(sx, 1.3, z);
        this.worldGroup.add(upright);
      });
    });

    // Soaring back gable wall shelves packed with dream jars
    [0.65, 1.28, 1.91, 2.54, 3.17].forEach((y) => {
      const maxX = Math.min(4.75, (5.8 - y) * 1.45);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(maxX * 2 + 0.25, 0.05, 0.4), this.woodDarkMat);
      plank.position.set(0, y, -4.82);
      this.worldGroup.add(plank);
      for (let x = -maxX; x <= maxX + 0.01; x += 0.31) {
        if (rnd() > 0.1) {
          const sc = 0.9 + rnd() * 0.22;
          const k = Math.floor(rnd() * 4);
          jarPositions.push([x, y + 0.025, -4.82, sc]);
          coreBuckets[k].push([x, y + 0.025 + 0.11 * sc, -4.82, sc]);
        }
      }
    });
    [-4.7, -2.35, 0, 2.35, 4.7].forEach((x) => {
      const h = Math.min(3.45, 5.4 - Math.abs(x) * 0.42);
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.4), this.woodDarkMat);
      upright.position.set(x, h / 2, -4.82);
      this.worldGroup.add(upright);
    });

    // Instanced glass jar bodies, cork stoppers, and 4-color glowing dream cores!
    const jarGeo = createJarLatheGeo(0.105, 0.27, 12);
    const jarInstMat = new THREE.MeshStandardMaterial({
      color: 0xdfeff4,
      transparent: true,
      opacity: 0.3,
      roughness: 0.06,
      metalness: 0.1,
      depthWrite: false,
    });
    const jarInst = new THREE.InstancedMesh(jarGeo, jarInstMat, jarPositions.length);
    const corkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.05, 0.055, 8),
      this.corkMat,
      jarPositions.length
    );

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    jarPositions.forEach(([x, y, z, s], i) => {
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      jarInst.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, y + 0.28 * s, z), q, new THREE.Vector3(s, s, s));
      corkInst.setMatrixAt(i, m4);
    });
    this.worldGroup.add(jarInst, corkInst);

    const coreGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.15, 10);
    coreBuckets.forEach((list, k) => {
      if (list.length === 0) return;
      const inst = new THREE.InstancedMesh(coreGeo, this.coreMaterials[k], list.length);
      list.forEach(([x, y, z, s], i) => {
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
        inst.setMatrixAt(i, m4);
      });
      this.worldGroup.add(inst);
    });

    // Soft ambient glows along the dream jar shelves
    [1.0, 2.2].forEach((y) => {
      this.addGlow(0xffc0d8, 2.1, -4.9, y, -1.6, 0.22);
      this.addGlow(0xa8f0e4, 2.1, 4.9, y, -1.6, 0.22);
    });
    [1.2, 2.5, 3.6].forEach((y) => {
      this.addGlow(0xffe0a8, 2.5, 0, y, -4.45, 0.24);
    });

    // Sliding Wooden Library Ladder ("移動はしご") on iron rail along the back wall
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.6, 8), this.ironMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 3.55, -4.45);
    this.worldGroup.add(rail);

    const ladderX = 1.65;
    const botZ = -3.72;
    const topZ = -4.42;
    const topY = 3.52;
    const railVec = new THREE.Vector3(0, topY, topZ - botZ);
    const railLen = railVec.length();
    const ladderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      railVec.clone().normalize()
    );
    [-0.24, 0.24].forEach((dx) => {
      const sidePole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, railLen, 8),
        this.woodDarkMat
      );
      sidePole.position.set(ladderX + dx, topY / 2, (botZ + topZ) / 2);
      sidePole.quaternion.copy(ladderQuat);
      this.worldGroup.add(sidePole);
    });
    for (let i = 1; i < 10; i++) {
      const f = i / 10;
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.032, 0.045), this.woodLightMat);
      rung.position.set(ladderX, topY * f, botZ + (topZ - botZ) * f);
      this.worldGroup.add(rung);
    }
  }

  private buildCentralMedallionBeacon(): void {
    const grp = new THREE.Group();
    grp.position.set(0, 0, -0.35);

    // Sculpted marble conservatory centerpiece pedestal with golden dream lantern bell
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.14, 32), this.marbleMat);
    base.position.y = 0.07;
    base.castShadow = true;
    base.receiveShadow = true;

    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.66, 28), this.marbleMat);
    col.position.y = 0.47;
    col.castShadow = true;

    const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.07, 32), this.marbleMat);
    topPlate.position.y = 0.84;
    topPlate.receiveShadow = true;

    const goldRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.016, 8, 36), this.goldMat);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 0.875;

    // Large glowing Conservatory Master Bell Jar housing a spinning golden dream star
    const masterJar = new THREE.Mesh(createJarLatheGeo(0.32, 0.72, 26), this.glassMat);
    masterJar.position.y = 0.875;

    const masterCork = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.075, 16), this.corkMat);
    masterCork.position.y = 1.62;

    this.centerBeaconOrb = new THREE.Mesh(
      create3DDreamStarGeometry(0.18),
      new THREE.MeshStandardMaterial({
        color: 0xfff3c4,
        emissive: 0xffca5a,
        emissiveIntensity: 1.35,
        roughness: 0.25,
      })
    );
    this.centerBeaconOrb.position.y = 1.22;

    grp.add(base, col, topPlate, goldRing, masterJar, masterCork, this.centerBeaconOrb);
    this.worldGroup.add(grp);

    this.addGlow(0xffd890, 2.2, 0, 1.24, -0.35, 0.62);
    this.addGlow(0xffb4cc, 3.4, 0, 1.24, -0.35, 0.24);
  }

  private buildWorkbenchAndCottonCandy(): void {
    // Left-rear Dream Bottling Workbench ("作業台: 拾った光を瓶にうつす")
    const wb = new THREE.Group();
    wb.position.set(-3.85, 0, -2.95);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.95), this.woodLightMat);
    top.position.y = 0.88;
    top.castShadow = true;
    top.receiveShadow = true;
    wb.add(top);

    [
      [-0.64, -0.88],
      [0.64, -0.88],
      [-0.64, 0.88],
      [0.64, 0.88],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.86, 0.08), this.woodDarkMat);
      leg.position.set(lx, 0.43, lz);
      wb.add(leg);
    });
    const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.045, 1.8), this.woodDarkMat);
    lowerShelf.position.y = 0.28;
    wb.add(lowerShelf);

    // 3 glowing sample dream jars on the workbench
    [0, 1, 2].forEach((i) => {
      const j = new THREE.Mesh(createJarLatheGeo(0.085, 0.22, 16), this.glassMat);
      j.position.set(-0.32 + i * 0.28, 0.92, -0.58);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.068, 0.13, 12),
        this.coreMaterials[i]
      );
      core.position.set(-0.32 + i * 0.28, 1.0, -0.58);
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.045, 10), this.corkMat);
      ck.position.set(-0.32 + i * 0.28, 1.15, -0.58);
      wb.add(j, core, ck);
    });

    // Metallic brass funnel & cream label roll & gold cork dish
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.024, 0.16, 12),
      this.goldMat
    );
    funnel.position.set(-0.22, 1.0, 0.05);
    const labelRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12), this.creamMat);
    labelRoll.rotation.z = Math.PI / 2;
    labelRoll.position.set(0.24, 0.98, 0.26);
    const corkDish = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.035, 14), this.goldMat);
    corkDish.position.set(-0.18, 0.94, 0.52);
    wb.add(funnel, labelRoll, corkDish);

    // Yumeatsume's favorite Pink Cotton Candy ("綿菓子") standing in a cute ceramic cup on the workbench!
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.06, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: 0xf6ebd8, roughness: 0.45 })
    );
    cup.position.set(0.32, 0.98, -0.1);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), this.woodLightMat);
    stick.position.set(0.32, 1.14, -0.1);
    const candyMat = new THREE.MeshStandardMaterial({
      color: 0xffb8d4,
      emissive: 0xff88b6,
      emissiveIntensity: 0.32,
      roughness: 0.92,
    });
    const puffMain = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), candyMat);
    puffMain.position.set(0.32, 1.32, -0.1);
    const puffA = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), candyMat);
    puffA.position.set(0.38, 1.28, -0.06);
    const puffB = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), candyMat);
    puffB.position.set(0.26, 1.35, -0.13);
    wb.add(cup, stick, puffMain, puffA, puffB);

    // 3-legged wooden stool beside workbench
    const stoolTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.055, 18), this.woodLightMat);
    stoolTop.position.set(1.02, 0.48, 0.05);
    wb.add(stoolTop);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.46, 6), this.woodDarkMat);
      leg.position.set(1.02 + Math.cos(a) * 0.15, 0.23, 0.05 + Math.sin(a) * 0.15);
      wb.add(leg);
    }

    this.worldGroup.add(wb);
    this.addGlow(0xffc6da, 1.1, -3.53, 1.32, -3.05, 0.42);
  }

  private buildReceiptDeskAndBoard(): void {
    // Right-rear Receipt Ledger Desk ("机: 受け取りのノートと羽ペン")
    const dk = new THREE.Group();
    dk.position.set(3.75, 0, -3.05);
    dk.rotation.y = -0.22;

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.85), this.woodLightMat);
    top.position.y = 0.82;
    top.castShadow = true;
    top.receiveShadow = true;
    dk.add(top);

    [
      [-0.74, -0.36],
      [0.74, -0.36],
      [-0.74, 0.36],
      [0.74, 0.36],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), this.woodDarkMat);
      leg.position.set(lx, 0.4, lz);
      dk.add(leg);
    });

    // Teal-bound Receipt Notebook & open cream pages
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.04, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2a5a56, roughness: 0.72 })
    );
    book.position.set(-0.22, 0.875, 0.04);
    book.rotation.y = 0.2;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.025, 0.23), this.creamMat);
    pages.position.set(-0.22, 0.9, 0.04);
    pages.rotation.y = 0.2;
    dk.add(book, pages);

    // Inkwell & Feather Quill Pen
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.08, 10), this.ironMat);
    ink.position.set(0.28, 0.895, -0.12);
    const quillStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.34, 6), this.creamMat);
    quillStem.position.set(0.36, 0.99, -0.08);
    quillStem.rotation.z = -0.48;
    const quillVane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xf5ecd6, side: THREE.DoubleSide, roughness: 0.88 })
    );
    quillVane.position.set(0.44, 1.1, -0.1);
    quillVane.rotation.z = -0.48;
    dk.add(ink, quillStem, quillVane);

    // Brass Desk Shade Lamp
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.025, 14), this.goldMat);
    lampBase.position.set(-0.56, 0.865, -0.2);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.44, 6), this.goldMat);
    lampStem.position.set(-0.56, 1.09, -0.2);
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.14, 0.14, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffebc2,
        emissive: 0xffce7a,
        emissiveIntensity: 0.78,
        roughness: 0.45,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.set(-0.56, 1.32, -0.2);
    dk.add(lampBase, lampStem, lampShade);

    // Wooden desk stool
    const stoolTop = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.055, 18), this.woodLightMat);
    stoolTop.position.set(0.05, 0.46, 0.78);
    dk.add(stoolTop);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.44, 6), this.woodDarkMat);
      leg.position.set(0.05 + Math.cos(a) * 0.14, 0.22, 0.78 + Math.sin(a) * 0.14);
      dk.add(leg);
    }

    this.worldGroup.add(dk);
    this.addGlow(0xffd28c, 1.45, 3.22, 1.25, -3.28, 0.5);

    // Live-Updating Conservatory Ledger Display Board mounted near the back-right shelf
    this.ledgerCanvas = document.createElement('canvas');
    this.ledgerCanvas.width = 320;
    this.ledgerCanvas.height = 192;
    this.ledgerTex = new THREE.CanvasTexture(this.ledgerCanvas);

    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.02, 0.06), this.woodDarkMat);
    boardFrame.position.set(3.25, 2.35, -4.52);
    const boardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.88),
      new THREE.MeshStandardMaterial({ map: this.ledgerTex, roughness: 0.78 })
    );
    boardFace.position.set(3.25, 2.35, -4.48);
    this.worldGroup.add(boardFrame, boardFace);
    this.updateLedgerBoard(24, 6);
  }

  public updateLedgerBoard(storedCount: number, returnedCount: number): void {
    const key = `${storedCount}_${returnedCount}`;
    if (key === this.lastLedgerKey) return;
    this.lastLedgerKey = key;

    const ctx = this.ledgerCanvas.getContext('2d')!;
    ctx.fillStyle = '#1d363e';
    ctx.fillRect(0, 0, 320, 192);
    ctx.strokeStyle = '#dfb254';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 304, 176);

    ctx.fillStyle = '#ffe5a6';
    ctx.font = '700 21px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今夜の夢の保管庫', 160, 40);

    ctx.fillStyle = '#d4eee8';
    ctx.font = '700 18px "Zen Maru Gothic", sans-serif';
    ctx.fillText(`お預かり瓶  ${storedCount} 本`, 160, 86);

    ctx.fillStyle = '#ffc6dc';
    ctx.fillText(`おかえり済  ${returnedCount} 件`, 160, 122);

    ctx.fillStyle = '#f0d8a8';
    ctx.font = '500 15px "Zen Maru Gothic", sans-serif';
    ctx.fillText('「夢には、賞味期限なんてない」', 160, 162);

    this.ledgerTex.needsUpdate = true;
  }

  private buildBotanicalPlants(): void {
    const leafColors = [0x3b7858, 0x529668, 0x2c664e, 0x68a878];
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb66848, roughness: 0.86 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d583a, roughness: 0.82 });

    const addPottedPlant = (x: number, z: number, sc: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * sc, 0.15 * sc, 0.32 * sc, 12),
        potMat
      );
      pot.position.y = 0.16 * sc;
      g.add(pot);

      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + x;
        const r = (0.11 + (i % 3) * 0.075) * sc;
        const y = (0.36 + i * 0.068) * sc;
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01 * sc, 0.01 * sc, y - 0.25 * sc, 5),
          stemMat
        );
        stem.position.set(Math.cos(a) * r * 0.5, (y + 0.25 * sc) / 2, Math.sin(a) * r * 0.5);
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.14 * sc, 10, 8),
          new THREE.MeshStandardMaterial({ color: leafColors[i % 4], roughness: 0.7 })
        );
        leaf.scale.set(1, 0.22, 0.46);
        leaf.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        leaf.rotation.y = -a;
        leaf.rotation.z = 0.48;
        g.add(stem, leaf);
      }

      // Glowing pink dream-bud blossom
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.036 * sc, 8, 6), this.coreMaterials[1]);
      bud.position.set(0.06 * sc, 0.86 * sc, 0.04 * sc);
      g.add(bud);
      this.worldGroup.add(g);
    };

    addPottedPlant(-4.65, 2.85, 1.45);
    addPottedPlant(4.65, 2.85, 1.45);
    addPottedPlant(-4.75, -0.55, 1.25);
    addPottedPlant(4.75, -0.55, 1.25);
    addPottedPlant(-4.65, -4.1, 1.2);
    addPottedPlant(4.65, -4.1, 1.2);

    // Hanging conservatory ivy baskets
    const addHangingBasket = (x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const cordLen = 1.65;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordLen, 5), this.ironMat);
      cord.position.y = cordLen / 2;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.18, 12), potMat);
      g.add(cord, pot);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + x;
        const L = 0.5 + (k % 2) * 0.28;
        const sx = Math.cos(a) * 0.16;
        const sz = Math.sin(a) * 0.16;
        const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, L, 4), stemMat);
        vine.position.set(sx, -0.08 - L / 2, sz);
        g.add(vine);
        for (let j = 0; j < 4; j++) {
          const lf = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 8, 6),
            new THREE.MeshStandardMaterial({ color: leafColors[(j + k) % 4], roughness: 0.72 })
          );
          lf.scale.set(1, 0.3, 0.58);
          lf.position.set(sx, -0.14 - (j * L) / 4, sz);
          lf.rotation.y = a + j;
          g.add(lf);
        }
      }
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), this.coreMaterials[1]);
      bud.position.set(0.11, 0.11, 0);
      g.add(bud);
      this.worldGroup.add(g);
    };

    addHangingBasket(-2.85, 3.65, -2.9);
    addHangingBasket(2.85, 3.65, -2.9);
    addHangingBasket(-3.2, 3.65, 1.35);
    addHangingBasket(3.2, 3.65, 1.35);
  }

  private buildCeilingOrbsAndAmbientLights(): void {
    const rnd = createSeededRandom(909);
    const orbColors = [0xffd890, 0xffb2cc, 0x9ce4d8, 0xb8ceff];

    // 6 hanging dream-light orbs suspended around the central ridge
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ox = Math.cos(a) * 1.25;
      const oz = -0.35 + Math.sin(a) * 1.25;
      const oy = 4.25 + (i % 2) * 0.32;
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 6.2 - oy, 4),
        this.ironMat
      );
      cord.position.set(ox, (6.2 + oy) / 2, oz);
      this.worldGroup.add(cord);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), this.coreMaterials[i % 4]);
      orb.position.set(ox, oy, oz);
      this.worldGroup.add(orb);
      this.ceilingOrbs.push({ mesh: orb, baseY: oy, phase: i * 1.1 });
      this.addGlow(orbColors[i % 4], 0.95, ox, oy, oz, 0.48);
    }

    // Softly drifting miniature dream wisps inside the glass conservatory
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const x = (rnd() * 2 - 1) * 4.4;
      const y = 1.45 + rnd() * 2.4;
      const z = -4.0 + rnd() * 6.8;
      g.position.set(x, y, z);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), this.coreMaterials[i % 4]);
      g.add(dot);
      this.worldGroup.add(g);
      this.addGlow(orbColors[i % 4], 0.46, 0, 0, 0, 0.5, g);
      this.floatingDreams.push({ group: g, x, y, z, phase: rnd() * Math.PI * 2 });
    }

    // Warm indoor dream dust motes
    const dustCount = 95;
    const dp = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const b: [number, number, number, number] = [
        (rnd() * 2 - 1) * 5.0,
        rnd() * 4.2,
        -4.4 + rnd() * 7.8,
        rnd() * Math.PI * 2,
      ];
      this.dustBase.push(b);
      dp[i * 3] = b[0];
      dp[i * 3 + 1] = 0.3 + b[1];
      dp[i * 3 + 2] = b[2];
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dustPoints = new THREE.Points(
      dg,
      new THREE.PointsMaterial({
        color: 0xffdfbe,
        size: 0.065,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);

    // Rose-gold dream lights rising softly above the glass roof into the starry sky
    const riseCount = 46;
    const rp = new Float32Array(riseCount * 3);
    for (let i = 0; i < riseCount; i++) {
      const b: [number, number, number, number] = [
        (rnd() * 2 - 1) * 5.2,
        rnd() * 14,
        -4.5 + rnd() * 7.5,
        rnd() * Math.PI * 2,
      ];
      this.risingBase.push(b);
      rp[i * 3] = b[0];
      rp[i * 3 + 1] = 4.2 + b[1];
      rp[i * 3 + 2] = b[2];
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.risingPoints = new THREE.Points(
      rg,
      new THREE.PointsMaterial({
        color: 0xffc6df,
        size: 0.22,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.worldGroup.add(this.risingPoints);
  }

  private buildMiniatureDiorama(theme: 'music' | 'patissier' | 'astronaut' | 'painter'): THREE.Group {
    const g = new THREE.Group();
    if (theme === 'music') {
      // Twenty-Year-Old Acoustic Guitar ("二十年前の音楽の夢")
      const gi = new THREE.Group();
      gi.scale.setScalar(0.55);
      gi.rotation.z = 0.2;
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb86f38, roughness: 0.42, metalness: 0.1 });
      const neckMat = new THREE.MeshStandardMaterial({ color: 0x5c3820, roughness: 0.62 });
      const lowerBout = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), bodyMat);
      lowerBout.scale.set(1, 1.05, 0.34);
      lowerBout.position.y = -0.09;
      const upperBout = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), bodyMat);
      upperBout.scale.set(1, 1, 0.34);
      upperBout.position.y = 0.08;
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.044, 14),
        new THREE.MeshStandardMaterial({ color: 0x180e08, roughness: 0.9 })
      );
      hole.position.set(0, -0.01, 0.056);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.36, 0.025), neckMat);
      neck.position.set(0, 0.34, 0.01);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.1, 0.022), neckMat);
      head.position.set(0, 0.55, 0.01);
      gi.add(lowerBout, upperBout, hole, neck, head);
      [-0.01, 0, 0.01].forEach((dx) => {
        const str = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.68, 0.004), this.goldMat);
        str.position.set(dx, 0.19, 0.06);
        gi.add(str);
      });
      gi.position.y = 0.24;
      g.add(gi);
    } else if (theme === 'patissier') {
      // Two-Tier Frosted Strawberry Cake ("パティシエの夢")
      const spongeMat = new THREE.MeshStandardMaterial({ color: 0xeac88e, roughness: 0.78 });
      const icingMat = new THREE.MeshStandardMaterial({ color: 0xfff5f0, roughness: 0.55 });
      const berryMat = new THREE.MeshStandardMaterial({
        color: 0xd82a46,
        emissive: 0x8a1428,
        emissiveIntensity: 0.45,
        roughness: 0.38,
      });
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 16), spongeMat);
      b1.position.y = 0.08;
      const i1 = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.032, 16), icingMat);
      i1.position.y = 0.135;
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 0.07, 16), spongeMat);
      b2.position.y = 0.19;
      const i2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.028, 16), icingMat);
      i2.position.y = 0.238;
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), berryMat);
      berry.position.y = 0.275;
      g.add(b1, i1, b2, i2, berry);
    } else if (theme === 'astronaut') {
      // Astronaut Helmet with Gold Visor ("宇宙飛行士の夢")
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.135, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.32 })
      );
      helmet.position.y = 0.21;
      const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.098, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xd4a448,
          emissive: 0x6a4a12,
          emissiveIntensity: 0.35,
          metalness: 0.88,
          roughness: 0.14,
        })
      );
      visor.scale.set(1, 0.82, 0.52);
      visor.position.set(0, 0.21, 0.082);
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.12, 0.04, 16),
        new THREE.MeshStandardMaterial({ color: 0x8a98a8, metalness: 0.55, roughness: 0.38 })
      );
      collar.position.y = 0.08;
      g.add(helmet, visor, collar);
    } else {
      // Wooden Artist Palette & Paintbrush ("絵描きの夢")
      const pal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.145, 0.145, 0.024, 18),
        new THREE.MeshStandardMaterial({ color: 0xc09058, roughness: 0.6 })
      );
      pal.scale.set(1, 1, 0.78);
      pal.position.y = 0.11;
      g.add(pal);
      const paints = ['#e85a6c', '#f5c452', '#5aa4e0', '#6fd098'];
      paints.forEach((hex, idx) => {
        const col = new THREE.Color(hex);
        const dab = new THREE.Mesh(
          new THREE.SphereGeometry(0.026, 8, 6),
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.32,
            roughness: 0.48,
          })
        );
        dab.position.set(-0.075 + idx * 0.05, 0.135, -0.02 + (idx % 2) * 0.045);
        g.add(dab);
      });
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 6), this.woodDarkMat);
      handle.position.set(0.08, 0.24, -0.04);
      handle.rotation.z = 0.38;
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.02, 0.058, 8),
        new THREE.MeshStandardMaterial({ color: 0xe85a6c, roughness: 0.55 })
      );
      tip.position.set(0.145, 0.38, -0.04);
      tip.rotation.z = -0.38;
      g.add(handle, tip);
    }
    return g;
  }

  private buildFourDreamPedestals(): void {
    for (const def of DREAM_PEDESTALS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      this.worldGroup.add(group);

      const accentColor = new THREE.Color(def.accentHex);
      const urgentColor = new THREE.Color(0xff7c96);

      // Marble pedestal base
      const pedCol = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.44, 22), this.marbleMat);
      pedCol.position.y = 0.22;
      pedCol.castShadow = true;
      pedCol.receiveShadow = true;
      const pedTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.055, 24), this.marbleMat);
      pedTop.position.y = 0.465;
      const goldTrim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.013, 8, 28), this.goldMat);
      goldTrim.rotation.x = Math.PI / 2;
      goldTrim.position.y = 0.495;

      // Large transparent Glass Dream Jar with pop-open cork lid
      const jarMesh = new THREE.Mesh(createJarLatheGeo(0.26, 0.56, 22), this.glassMat);
      jarMesh.position.y = 0.495;

      const lidMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.165, 0.14, 0.065, 16),
        this.corkMat
      );
      lidMesh.position.y = 1.075;

      const dioramaGroup = this.buildMiniatureDiorama(def.theme);
      dioramaGroup.position.y = 0.52;

      group.add(pedCol, pedTop, goldTrim, jarMesh, lidMesh, dioramaGroup);

      // Ground progress ring background & active fill ring
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.84, 36),
        new THREE.MeshBasicMaterial({
          color: 0x20343e,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.025;
      group.add(ringBg);

      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.69, 0.85, 36),
        new THREE.MeshBasicMaterial({
          color: def.accentHex,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.032;
      group.add(ringFill);

      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.84, 0.96, 36),
        new THREE.MeshBasicMaterial({
          color: def.accentHex,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.04;
      group.add(pulseRing);

      // Dreamlight halo & point light
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: def.accentHex,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.y = 0.82;
      halo.scale.set(1.5, 1.5, 1);
      group.add(halo);

      const glowLight = new THREE.PointLight(def.accentHex, 1.1, 4.8, 1.4);
      glowLight.position.y = 1.05;
      group.add(glowLight);

      // Floating billboard signboard showing dream name & awakening percentage
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 96;
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(1.48, 0.56),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false })
      );
      signBoard.position.set(0, 1.56, 0);
      group.add(signBoard);

      const vis: DreamPedestalVisual = {
        group,
        ringFill,
        ringBg,
        signCanvas,
        signTex,
        signBoard,
        lidMesh,
        dioramaGroup,
        halo,
        glowLight,
        pulseRing,
        accentColor,
        urgentColor,
        lastRenderedBucket: -1,
        lastRenderedUrgent: false,
        lastRenderedDone: false,
        pulse: 0,
        lidOpenAmt: 0,
      };
      this.renderPedestalSign(vis, def.shortName, def.tagLabel, 50, false, false);
      this.pedestalVisuals.push(vis);
    }
  }

  private renderPedestalSign(
    vis: DreamPedestalVisual,
    shortName: string,
    tagLabel: string,
    progress: number,
    urgent: boolean,
    done: boolean
  ): void {
    const ctx = vis.signCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 96);

    ctx.fillStyle = done
      ? 'rgba(42, 34, 20, 0.9)'
      : urgent
        ? 'rgba(54, 20, 32, 0.9)'
        : 'rgba(14, 28, 36, 0.86)';
    ctx.strokeStyle = done
      ? '#ffe496'
      : urgent
        ? '#ff86a4'
        : `#${vis.accentColor.getHexString()}`;
    ctx.lineWidth = 4;

    const r = 14;
    ctx.beginPath();
    ctx.moveTo(10 + r, 8);
    ctx.lineTo(246 - r, 8);
    ctx.quadraticCurveTo(246, 8, 246, 8 + r);
    ctx.lineTo(246, 88 - r);
    ctx.quadraticCurveTo(246, 88, 246 - r, 88);
    ctx.lineTo(10 + r, 88);
    ctx.quadraticCurveTo(10, 88, 10, 88 - r);
    ctx.lineTo(10, 8 + r);
    ctx.quadraticCurveTo(10, 8, 10 + r, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff9ec';
    ctx.font = '700 22px "Zen Maru Gothic", sans-serif';
    ctx.fillText(done ? `✨ ${tagLabel}` : shortName, 128, 39);

    // Progress bar inside badge
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(28, 54, 200, 12);
    ctx.fillStyle = done ? '#ffe496' : urgent ? '#ff84a2' : `#${vis.accentColor.getHexString()}`;
    ctx.fillRect(28, 54, Math.max(4, Math.round((Math.min(100, progress) / 100) * 200)), 12);

    ctx.fillStyle = done ? '#ffe8a4' : urgent ? '#ffb4c6' : '#dceee8';
    ctx.font = '700 14px "Zen Maru Gothic", sans-serif';
    ctx.fillText(
      done ? 'おかえり！ 夢が歩き出した' : urgent ? `眠りそう… ${Math.round(progress)}%` : `夢の灯り ${Math.round(progress)}%`,
      128,
      82
    );

    vis.signTex.needsUpdate = true;
  }

  public syncUpgrades(state: YumeatsumeSaveState): void {
    const clear = (g: THREE.Group) => {
      while (g.children.length > 0) g.remove(g.children[0]);
    };
    clear(this.benchExtraGroup);
    clear(this.domeExtraGroup);
    clear(this.satchelExtraGroup);
    clear(this.ladderExtraGroup);
    clear(this.cottonExtraGroup);
    clear(this.deskExtraGroup);

    // 1. Bottling Workbench extras (extra glowing sample jars & golden alembic)
    const benchLv = state.upgrades.bottlingBench;
    for (let i = 0; i < Math.min(4, benchLv); i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 10),
        this.coreMaterials[i % 4]
      );
      orb.position.set(-4.1 + i * 0.22, 1.04, -2.55);
      this.benchExtraGroup.add(orb);
    }

    // 2. Glass Dome extras (fairy-light dream garlands along the iron tie beams)
    const domeLv = state.upgrades.glassDome;
    if (domeLv > 0) {
      const count = Math.min(5, domeLv) * 3;
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count;
        const x = -4.6 + u * 9.2;
        const y = 3.25 - Math.sin(u * Math.PI) * 0.35;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 10, 8),
          this.coreMaterials[i % 4]
        );
        bulb.position.set(x, y, -2.75);
        this.domeExtraGroup.add(bulb);
      }
    }

    // 3. Dream Satchel & Storage Shelf extras (extra display leather satchel & gleaming gold jars)
    const satchelLv = state.upgrades.dreamSatchel;
    if (satchelLv > 0) {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.32, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x6a4326, roughness: 0.72 })
      );
      bag.position.set(-2.55, 0.18, -3.55);
      bag.rotation.y = 0.45;
      const clasp = new THREE.Mesh(create3DDreamStarGeometry(0.06), this.goldMat);
      clasp.position.set(-2.48, 0.22, -3.42);
      this.satchelExtraGroup.add(bag, clasp);
      for (let i = 0; i < Math.min(4, satchelLv); i++) {
        const star = new THREE.Mesh(create3DDreamStarGeometry(0.085), this.coreMaterials[i % 4]);
        star.position.set(-2.2 + i * 0.25, 0.55 + (i % 2) * 0.14, -4.35);
        this.satchelExtraGroup.add(star);
      }
    }

    // 4. Sliding Ladder extras (golden ladder lantern & upper specimen bells)
    const ladderLv = state.upgrades.slidingLadder;
    if (ladderLv > 0) {
      const lantern = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        this.coreMaterials[0]
      );
      lantern.position.set(1.65, 2.8, -4.18);
      this.ladderExtraGroup.add(lantern);
      for (let i = 0; i < Math.min(4, ladderLv); i++) {
        const bell = new THREE.Mesh(createJarLatheGeo(0.12, 0.28, 12), this.glassMat);
        bell.position.set(-1.8 + i * 1.2, 3.2, -4.8);
        this.ladderExtraGroup.add(bell);
      }
    }

    // 5. Cotton Candy Nook extras (fluffy pastel cotton-candy bouquet & blooming pink blossoms)
    const cottonLv = state.upgrades.cottonCandyNook;
    if (cottonLv > 0) {
      const pinkMat = new THREE.MeshStandardMaterial({
        color: 0xffc0da,
        emissive: 0xff8cb8,
        emissiveIntensity: 0.48,
        roughness: 0.85,
      });
      for (let i = 0; i < Math.min(5, cottonLv); i++) {
        const a = (i / 5) * Math.PI * 2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), pinkMat);
        puff.position.set(-3.55 + Math.cos(a) * 0.22, 1.48 + (i % 2) * 0.12, -3.05 + Math.sin(a) * 0.22);
        this.cottonExtraGroup.add(puff);
      }
    }

    // 6. Receipt Desk extras (stacked gold-rimmed dream volumes & glowing quill halo)
    const deskLv = state.upgrades.receiptDesk;
    if (deskLv > 0) {
      const bookCols = [0x2a5a56, 0x7c3e4d, 0x3b4d78, 0x6a5534];
      for (let i = 0; i < Math.min(4, deskLv); i++) {
        const vol = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.055, 0.24),
          new THREE.MeshStandardMaterial({ color: bookCols[i % 4], roughness: 0.72 })
        );
        vol.position.set(4.18, 0.88 + i * 0.056, -2.95);
        vol.rotation.y = -0.15 + i * 0.14;
        this.deskExtraGroup.add(vol);
      }
    }

    this.updateLedgerBoard(
      24 + state.totalSatchelsStored * 12 + state.totalLidsOpened,
      6 + state.totalDreamsReturned
    );
  }

  public updatePedestalVisual(
    pedestalId: number,
    progress: number,
    urgent: boolean,
    done: boolean,
    awakening: boolean,
    elapsed: number
  ): void {
    const vis = this.pedestalVisuals[pedestalId];
    const def = DREAM_PEDESTALS[pedestalId];
    if (!vis || !def) return;

    const clamped = Math.max(0, Math.min(1, progress / 100));
    vis.ringFill.scale.setScalar(0.86 + clamped * 0.18);
    const rfMat = vis.ringFill.material as THREE.MeshBasicMaterial;
    rfMat.color.copy(done ? new THREE.Color(0xfff0b2) : urgent ? vis.urgentColor : vis.accentColor);
    rfMat.opacity = done ? 0.96 : awakening ? 0.92 : 0.45 + clamped * 0.45;

    // Smoothly pop open the cork lid when awakened ("おかえり！")
    const targetLid = done ? 1.0 : awakening ? 0.22 : 0.0;
    vis.lidOpenAmt += (targetLid - vis.lidOpenAmt) * 0.12;
    vis.lidMesh.position.y = 1.075 + vis.lidOpenAmt * 0.26;
    vis.lidMesh.position.x = vis.lidOpenAmt * 0.12;
    vis.lidMesh.rotation.z = -vis.lidOpenAmt * 0.65;

    // Gently float and turn the miniature diorama inside the glass jar
    vis.dioramaGroup.rotation.y = elapsed * (done ? 1.8 : awakening ? 1.15 : 0.45) + pedestalId;
    vis.dioramaGroup.position.y = 0.52 + Math.sin(elapsed * 2.1 + pedestalId) * 0.03 + vis.lidOpenAmt * 0.08;

    vis.halo.scale.setScalar(1.35 + clamped * 0.95 + (done ? 0.6 : 0));
    (vis.halo.material as THREE.SpriteMaterial).opacity = done
      ? 0.88
      : awakening
        ? 0.72
        : 0.34 + clamped * 0.26;
    vis.glowLight.intensity = done ? 2.7 : awakening ? 2.15 : 0.8 + clamped * 0.85;

    if (vis.pulse > 0) {
      vis.pulse = Math.max(0, vis.pulse - 0.025);
      vis.pulseRing.scale.setScalar(1 + (1 - vis.pulse) * 1.2);
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = vis.pulse * 0.85;
    } else {
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    vis.signBoard.quaternion.copy(this.camera.quaternion);

    const bucket = Math.round(progress / 5) * 5;
    if (
      bucket !== vis.lastRenderedBucket ||
      urgent !== vis.lastRenderedUrgent ||
      done !== vis.lastRenderedDone
    ) {
      vis.lastRenderedBucket = bucket;
      vis.lastRenderedUrgent = urgent;
      vis.lastRenderedDone = done;
      this.renderPedestalSign(vis, def.shortName, def.tagLabel, progress, urgent, done);
    }
  }

  public pulsePedestal(pedestalId: number): void {
    const vis = this.pedestalVisuals[pedestalId];
    if (vis) vis.pulse = 1.0;
  }

  /** Launches a radiant 3D dream-light star ascending through the glass roof toward its owner! */
  public launchDreamReturnArc(startX: number, startY: number, startZ: number, colorHex = 0xffe296): void {
    const g = new THREE.Group();
    const star = new THREE.Mesh(this.arcStarGeo, this.arcStarMat);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: colorHex,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(1.15, 1.15, 1);
    g.add(star, halo);
    this.worldGroup.add(g);

    const endX = (Math.random() - 0.5) * 12;
    const endY = 8.6 + Math.random() * 4.2;
    const endZ = -12 - Math.random() * 7;
    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const ctrl = new THREE.Vector3(
      (startX + endX) * 0.5,
      Math.max(startY, endY) + 2.2,
      (startZ + endZ) * 0.5
    );

    this.dreamArcs.push({ group: g, start, ctrl, end, t: 0, dur: 0.98 });
  }

  public triggerLidOpenFlash(): void {
    this.lidFlashTimer = 0.75;
  }

  public triggerShake(intensity = 0.16, duration = 0.28): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.45 ? 49 : 44;
    this.camera.updateProjectionMatrix();
  }

  public screenToFloor(
    virtualX: number,
    virtualY: number,
    viewW: number,
    viewH: number
  ): THREE.Vector3 | null {
    this.tmpNdc.set((virtualX / viewW) * 2 - 1, -(virtualY / viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpNdc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, hit) ? hit : null;
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    viewW: number,
    viewH: number
  ): { x: number; y: number } {
    const v = worldPos.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * viewW,
      y: (-v.y * 0.5 + 0.5) * viewH,
    };
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean,
    isLidOpening: boolean
  ): void {
    this.simClock += dt;
    if (this.lidFlashTimer > 0) this.lidFlashTimer = Math.max(0, this.lidFlashTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    // Gentle greenhouse camera framing
    const goalPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.24) * 1.4, 5.4, 8.9)
        : new THREE.Vector3(0, 6.25, 9.15);
    const goalTarget =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.5, -0.95)
        : new THREE.Vector3(0, 1.15, -0.55);

    this.camPos.lerp(goalPos, 1 - Math.exp(-3.4 * dt));
    this.camTarget.lerp(goalTarget, 1 - Math.exp(-3.4 * dt));

    this.camera.position.copy(this.camPos);
    if (this.shakeTimer > 0) {
      const mag = this.shakeIntensity * (this.shakeTimer / 0.28);
      this.camera.position.x += (Math.random() - 0.5) * mag;
      this.camera.position.y += (Math.random() - 0.5) * mag;
    }
    this.camera.lookAt(this.camTarget);

    // Beat-reactive conservatory lighting
    const lidBoost = this.lidFlashTimer > 0 ? this.lidFlashTimer * 1.45 : 0;
    const feverBoost = isFever ? 0.7 + beatPulse * 0.35 : 0;

    this.centerLanternLight.intensity = 2.25 + beatPulse * 0.45 + energy * 0.4 + lidBoost + feverBoost;
    this.centerLanternLight.color.setHex(
      isFever ? 0xfff0b8 : isLidOpening ? 0xffd0dc : 0xffd698
    );
    this.roseShelfLight.intensity = 1.25 * (1 + 0.08 * Math.sin(elapsed * 1.4)) + (isFever ? 0.6 : 0);
    this.tealShelfLight.intensity = 1.25 * (1 + 0.08 * Math.sin(elapsed * 1.6 + 1)) + (isFever ? 0.55 : 0);
    this.backWallLight.intensity = 1.45 + (isFever ? 0.9 : 0) + (isLidOpening ? 0.6 : 0);

    // Center master dream star rotation & pulse
    this.centerBeaconOrb.rotation.y = elapsed * (isFever || isLidOpening ? 1.8 : 0.65);
    this.centerBeaconOrb.position.y = 1.22 + Math.sin(elapsed * 1.9) * 0.045;

    // 4-color instanced dream jars gently breathing with the beat
    this.coreMaterials.forEach((m, i) => {
      m.emissiveIntensity =
        (isFever ? 1.38 : 0.92) + 0.26 * Math.sin(elapsed * 1.4 + i * 1.6) + beatPulse * 0.22;
    });

    // Ceiling hanging orbs bobbing
    this.ceilingOrbs.forEach((o) => {
      o.mesh.position.y = o.baseY + Math.sin(elapsed * 1.1 + o.phase) * 0.06;
    });

    // Floating ambient dream wisps
    this.floatingDreams.forEach((d) => {
      d.group.position.y = d.y + Math.sin(elapsed * 0.85 + d.phase) * 0.11;
      d.group.position.x = d.x + Math.sin(elapsed * 0.52 + d.phase) * 0.06;
    });

    // Glow sprites breathing
    for (const gs of this.glowSprites) {
      const s = gs.baseScale * (1 + 0.055 * Math.sin(elapsed * 2.1 + gs.phase) + (isFever ? 0.14 : 0));
      gs.sprite.scale.set(s, s, 1);
    }

    // Night sky twinkling
    this.skyStarsA.opacity = 0.78 + 0.14 * Math.sin(elapsed * 1.3);
    this.skyStarsB.opacity = 0.82 + 0.14 * Math.sin(elapsed * 0.95 + 1.1);

    // Indoor dream dust motes
    const dustAttr = this.dustPoints.geometry.attributes.position as THREE.BufferAttribute;
    const dArr = dustAttr.array as Float32Array;
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i];
      dArr[i * 3] = b[0] + Math.sin(this.simClock * 0.26 + b[3]) * 0.34;
      dArr[i * 3 + 1] = 0.3 + ((b[1] + this.simClock * (isFever ? 0.26 : 0.055)) % 4.2);
      dArr[i * 3 + 2] = b[2] + Math.cos(this.simClock * 0.21 + b[3]) * 0.34;
    }
    dustAttr.needsUpdate = true;

    // Rose-gold dream lights rising softly above the glass roof
    const riseAttr = this.risingPoints.geometry.attributes.position as THREE.BufferAttribute;
    const rArr = riseAttr.array as Float32Array;
    for (let i = 0; i < this.risingBase.length; i++) {
      const b = this.risingBase[i];
      rArr[i * 3] = b[0] + Math.sin(this.simClock * 0.32 + b[3]) * 0.52;
      rArr[i * 3 + 1] = 4.2 + ((b[1] + this.simClock * (isFever ? 2.2 : 0.85)) % 14);
      rArr[i * 3 + 2] = b[2];
    }
    riseAttr.needsUpdate = true;

    // Soaring awakened dream arcs
    for (let i = this.dreamArcs.length - 1; i >= 0; i--) {
      const a = this.dreamArcs[i];
      a.t += dt / a.dur;
      if (a.t >= 1) {
        this.worldGroup.remove(a.group);
        this.dreamArcs.splice(i, 1);
        continue;
      }
      const u = a.t;
      const inv = 1 - u;
      a.group.position.set(
        inv * inv * a.start.x + 2 * inv * u * a.ctrl.x + u * u * a.end.x,
        inv * inv * a.start.y + 2 * inv * u * a.ctrl.y + u * u * a.end.y,
        inv * inv * a.start.z + 2 * inv * u * a.ctrl.z + u * u * a.end.z
      );
      a.group.rotation.y += dt * 7;
      a.group.scale.setScalar(1.15 - u * 0.42);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
