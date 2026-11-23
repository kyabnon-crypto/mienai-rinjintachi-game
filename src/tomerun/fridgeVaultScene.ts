import * as THREE from 'three';
import { TIME_SPOTS } from './config';
import { TomerunSaveState } from './types';

interface TimeSpotVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  signCanvas: HTMLCanvasElement;
  signTex: THREE.CanvasTexture;
  signBoard: THREE.Mesh;
  steamOrbs: THREE.Mesh[];
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
  accentColor: THREE.Color;
  urgentColor: THREE.Color;
  lastRenderedBucket: number;
  lastRenderedUrgent: boolean;
  lastRenderedDone: boolean;
  pulse: number;
}

interface JarShelfArc {
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

/**
 * 3D "Another Shelf at the Back of the Fridge" — Tomerun's Time Preservation Vault.
 * Faithfully fuses the official picturebook (`story.txt`, `tomerun_slide.png`, `tomerun_image.png`)
 * and official 3D room tour (`トメルンの部屋.html`):
 *  - Cool frosty blue plastered vault walls & slate-blue checkerboard tile floor with frost pools
 *  - Slightly ajar mint-green retro refrigerator at the back with milk, eggs, jam, butter, veggies,
 *    glowing interior lamp, volumetric cool beam, and the glowing blue arch portal ("もうひとつの棚")
 *  - Brass plaque signs: "時間、すこし止めます。" / "ここは時間が少しゆっくり流れる棚です。"
 *  - Overhead rotating hexagonal golden Time Lantern ("時間ランタン") & orbiting light motes
 *  - Central round enamel pedestal with the giant Hourglass & brass slowing Valve — golden sand grains
 *    fall slowly and visibly freeze mid-air during VALVE PAUSE & ETERNAL SHELF!
 *  - Back dining table with 3 miniature "Dining Table Diorama Jars" (ふたりの食卓 / にぎやかな食卓 / さいごの家族の時間)
 *    holding tiny tables, chairs, candles, soup bowls & suspended white steam
 *  - Left frosty wooden shelves packed with glowing labeled Time Jars & frost icicles,
 *    plus front-left fluffy blue blanket cushion & miniature tabletop hourglass
 *  - Right frosted arched window with crystalline frost filigree, white wooden ladder,
 *    and Tomerun's quill & live-updating preservation notebook desk ("きょうのとめた時間：〇ふん〇〇びょう")
 *  - Hanging expiry-date wish tags along overhead wires & back wall tag board
 *  - 4 interactive Time Preservation Spots with live expiry/preservation gauges
 */
export class FridgeVaultScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpNdc = new THREE.Vector2();

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private camPos = new THREE.Vector3(0, 6.2, 8.95);
  private camTarget = new THREE.Vector3(0, 1.35, -0.75);
  private shakeTimer = 0;
  private shakeIntensity = 0;

  // Lights
  private hemiLight: THREE.HemisphereLight;
  private fridgeArchLight: THREE.PointLight;
  private lanternLight: THREE.PointLight;
  private diningTableLight: THREE.PointLight;
  private frostedWinLight: THREE.PointLight;
  private shelfWarmLight: THREE.PointLight;
  private keyDirLight: THREE.DirectionalLight;

  // Animated environment props
  private timeLanternGroup!: THREE.Group;
  private timeLanternGlow!: THREE.Sprite;
  private fridgePortalGlow!: THREE.Sprite;
  private valveWheelGroup!: THREE.Group;
  private fallingSandGrains: { mesh: THREE.Mesh; offset: number }[] = [];
  private hangingTags: { group: THREE.Group; phase: number }[] = [];
  private jarGlowSprites: { sprite: THREE.Sprite; phase: number; baseOp: number }[] = [];
  private frostPoints!: THREE.Points;
  private frostBase: [number, number, number, number][] = [];
  private jarArcs: JarShelfArc[] = [];

  // Live preservation notebook texture
  private notebookCanvas!: HTMLCanvasElement;
  private notebookTex!: THREE.CanvasTexture;
  private lastNotebookSec = -1;

  // Upgrade-responsive 3D prop groups
  private hourglassExtraGroup = new THREE.Group();
  private lanternExtraGroup = new THREE.Group();
  private diningJarsExtraGroup = new THREE.Group();
  private expiryTagsExtraGroup = new THREE.Group();
  private blueBlanketExtraGroup = new THREE.Group();
  private diaryDeskExtraGroup = new THREE.Group();

  // Interactive 4 preservation spots
  private spotVisuals: TimeSpotVisual[] = [];

  // Shared materials for bottled jar arcs
  private arcGlassMat: THREE.MeshStandardMaterial;
  private arcCoreMat: THREE.MeshStandardMaterial;
  private arcGoldMat: THREE.MeshStandardMaterial;

  private valveFlashTimer = 0;
  private simClock = 0;
  private sandClock = 0;

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
    this.scene.background = new THREE.Color(0x091322);
    this.scene.fog = new THREE.FogExp2(0x091322, 0.022);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 140);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.arcGlassMat = new THREE.MeshStandardMaterial({
      color: 0xdff2ff,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.1,
    });
    this.arcCoreMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xffc65c,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    });
    this.arcGoldMat = new THREE.MeshStandardMaterial({
      color: 0xdcb252,
      metalness: 0.8,
      roughness: 0.3,
    });

    this.scene.add(this.worldGroup);

    // Cool frosty fridge ambience contrasted with warm golden lantern pools
    this.hemiLight = new THREE.HemisphereLight(0xa2c8f0, 0x26354a, 0.78);
    this.scene.add(this.hemiLight);

    this.keyDirLight = new THREE.DirectionalLight(0xc2dfff, 0.82);
    this.keyDirLight.position.set(-4.5, 11.5, 5.5);
    this.keyDirLight.castShadow = true;
    this.keyDirLight.shadow.mapSize.set(1024, 1024);
    this.keyDirLight.shadow.camera.near = 1;
    this.keyDirLight.shadow.camera.far = 36;
    const d = 9.5;
    this.keyDirLight.shadow.camera.left = -d;
    this.keyDirLight.shadow.camera.right = d;
    this.keyDirLight.shadow.camera.top = d;
    this.keyDirLight.shadow.camera.bottom = -d;
    this.scene.add(this.keyDirLight);

    this.fridgeArchLight = new THREE.PointLight(0xbce2ff, 2.3, 14, 1.25);
    this.fridgeArchLight.position.set(0, 2.4, -3.7);
    this.scene.add(this.fridgeArchLight);

    this.lanternLight = new THREE.PointLight(0xffd78e, 2.8, 17, 1.18);
    this.lanternLight.position.set(0, 3.85, -0.35);
    this.scene.add(this.lanternLight);

    this.diningTableLight = new THREE.PointLight(0xffd698, 1.65, 11, 1.3);
    this.diningTableLight.position.set(-2.9, 2.1, -3.6);
    this.scene.add(this.diningTableLight);

    this.frostedWinLight = new THREE.PointLight(0x9fd2ff, 1.5, 11, 1.35);
    this.frostedWinLight.position.set(4.8, 2.7, -0.6);
    this.scene.add(this.frostedWinLight);

    this.shelfWarmLight = new THREE.PointLight(0xffcf88, 1.6, 11, 1.3);
    this.shelfWarmLight.position.set(-4.6, 2.2, 0.4);
    this.scene.add(this.shelfWarmLight);

    this.buildEnvironment();
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.28, 'rgba(255,255,255,0.56)');
    r.addColorStop(0.65, 'rgba(255,255,255,0.14)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  private makeCanvasTex(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
    rx = 1,
    ry = 1
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }

  private addSegment(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    mat: THREE.Material,
    parent: THREE.Object3D
  ): THREE.Mesh {
    const d = new THREE.Vector3().subVectors(b, a);
    const l = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 6), mat);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    parent.add(mesh);
    return mesh;
  }

  private makePaperTagTex(
    lines: string[],
    w = 220,
    h = 110,
    bg = '#f6efd8',
    ink = '#2c4d78',
    border = '#8ab0d4'
  ): THREE.CanvasTexture {
    return this.makeCanvasTex(w, h, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = border;
      g.lineWidth = 4;
      g.strokeRect(5, 5, W - 10, H - 10);
      g.fillStyle = ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const fontSize = Math.round(H * (lines.length > 1 ? 0.24 : 0.36));
      g.font = `700 ${fontSize}px 'Zen Maru Gothic', sans-serif`;
      lines.forEach((line, idx) => {
        const y =
          lines.length === 1
            ? H * 0.52
            : H * (0.34 + idx * (0.48 / Math.max(1, lines.length - 1)));
        g.fillText(line, W * 0.5, y);
      });
    });
  }

  private buildEnvironment(): void {
    const rnd = createSeededRandom(909);

    // 1. Frosty tiled vault floor (checkerboard ice-slate tiles like トメルンの部屋)
    const tileTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            g.fillStyle = (i + j) % 2 ? '#5a738d' : '#4b637d';
            g.fillRect(i * 64, j * 64, 64, 64);
          }
        }
        for (let i = 0; i < 600; i++) {
          g.fillStyle = `rgba(225,245,255,${(rnd() * 0.1).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 2, 2);
        }
        g.strokeStyle = 'rgba(18, 28, 44, 0.45)';
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
      7,
      6
    );

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(13.6, 11.4),
      new THREE.MeshStandardMaterial({
        map: tileTex,
        roughness: 0.42,
        metalness: 0.08,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.3);
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    // Central frosty clock-face woven rug under the play clearing
    const rugTex = this.makeCanvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#243a54';
      g.fillRect(0, 0, w, h);
      const rings: [string, number][] = [
        ['#8ec6e6', 246],
        ['#2a4462', 228],
        ['#d9b468', 208],
        ['#233952', 194],
        ['#527da0', 166],
        ['#1f334a', 148],
      ];
      for (const [col, rad] of rings) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(256, 256, rad, 0, Math.PI * 2);
        g.fill();
      }
      // Subtle 12 clock ticks & hourglass emblem at center
      g.strokeStyle = 'rgba(255, 224, 154, 0.65)';
      g.lineWidth = 4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(256 + Math.cos(a) * 158, 256 + Math.sin(a) * 158);
        g.lineTo(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186);
        g.stroke();
      }
      // Hourglass motif
      g.strokeStyle = 'rgba(255, 232, 174, 0.72)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(222, 196);
      g.lineTo(290, 196);
      g.lineTo(256, 256);
      g.lineTo(290, 316);
      g.lineTo(222, 316);
      g.lineTo(256, 256);
      g.closePath();
      g.stroke();
    });
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(2.55, 48),
      new THREE.MeshStandardMaterial({
        map: rugTex,
        roughness: 0.9,
      })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.25);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // Subtle frost pools on the vault floor
    for (let i = 0; i < 10; i++) {
      const fx = (rnd() * 2 - 1) * 4.8;
      const fz = -3.4 + rnd() * 6.8;
      const fm = new THREE.Mesh(
        new THREE.CircleGeometry(0.65 + rnd() * 0.75, 20),
        new THREE.MeshBasicMaterial({
          map: this.glowTex,
          color: 0xcbe8ff,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      fm.rotation.x = -Math.PI / 2;
      fm.position.set(fx, 0.016, fz);
      this.worldGroup.add(fm);
    }

    // 2. Frosty blue plaster walls (back, left, right)
    const plasterTex = this.makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#334c68';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1800; i++) {
          g.fillStyle =
            rnd() < 0.5
              ? `rgba(220,240,255,${(rnd() * 0.06).toFixed(3)})`
              : `rgba(12,20,34,${(rnd() * 0.08).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
        }
      },
      3,
      1.4
    );
    const wallMat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xcfe2f2, roughness: 0.45 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 0.72 });
    const shelfWoodMat = new THREE.MeshStandardMaterial({ color: 0x9c7650, roughness: 0.68 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdcb252,
      metalness: 0.8,
      roughness: 0.3,
    });
    const mintMat = new THREE.MeshStandardMaterial({
      color: 0x9cd2c8,
      roughness: 0.32,
      metalness: 0.18,
    });
    const enamMat = new THREE.MeshStandardMaterial({
      color: 0xe6f2f8,
      roughness: 0.28,
      metalness: 0.1,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd4dde4,
      metalness: 0.88,
      roughness: 0.22,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd8eef8,
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Back wall (z = -4.9)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(12.6, 5.4, 0.24), wallMat);
    backWall.position.set(0, 2.7, -4.95);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    // Left wall (x = -6.1) & Right wall (x = 6.1)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.4, 10.6), wallMat);
    leftWall.position.set(-6.1, 2.7, -0.1);
    this.worldGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.4, 10.6), wallMat);
    rightWall.position.set(6.1, 2.7, -0.1);
    this.worldGroup.add(rightWall);

    // Baseboard trims
    const baseBack = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.16, 0.08), trimMat);
    baseBack.position.set(0, 0.08, -4.8);
    this.worldGroup.add(baseBack);
    for (const sx of [-5.96, 5.96]) {
      const bSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 10.4), trimMat);
      bSide.position.set(sx, 0.08, -0.1);
      this.worldGroup.add(bSide);
    }

    // 3. Back Center: Mint-Green Retro Fridge & Glowing Blue Arch Portal ("もうひとつの棚")
    this.buildBackFridgePortal(mintMat, enamMat, chromeMat, glassMat, brassMat, woodMat);

    // 4. Overhead Rotating Hexagonal Time Lantern ("時間ランタン")
    this.buildTimeLantern(brassMat);

    // 5. Center-Back Pedestal: Giant Hourglass & Brass Slowing Valve (right behind spot 0)
    this.buildCentralHourglass(enamMat, woodMat, brassMat, glassMat);

    // 6. Left Wall: Frosty Wooden Shelves packed with glowing Time Jars + Front-left Blue Fluffy Blanket
    this.buildLeftTimeJarShelves(shelfWoodMat, glassMat, brassMat, rnd);
    this.buildBlueBlanketCorner(brassMat, glassMat, rnd);

    // 7. Right Wall: Frosted Arch Window, White Ladder & Live Preservation Notebook Desk
    this.buildRightWindowAndDesk(woodMat, enamMat, brassMat, glassMat, rnd);

    // 8. Back-Left & Back-Right: Dining Table Diorama Jars & Expiry Tag Wall Board + Overhead Tag Wires
    this.buildBackDiningJars(shelfWoodMat, woodMat, enamMat, brassMat, glassMat);
    this.buildExpiryTagsAndBoard(woodMat, rnd);

    // 9. Attach upgrade-responsive 3D extra groups
    this.worldGroup.add(
      this.hourglassExtraGroup,
      this.lanternExtraGroup,
      this.diningJarsExtraGroup,
      this.expiryTagsExtraGroup,
      this.blueBlanketExtraGroup,
      this.diaryDeskExtraGroup
    );
    this.buildUpgradeExtras(brassMat, glassMat, woodMat, enamMat, rnd);

    // 10. Build 4 interactive Time Preservation Spots
    this.buildTimeSpots(woodMat, brassMat, glassMat, enamMat);

    // 11. Floating frost crystals & golden time-sand dust motes
    const count = 160;
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cFrost = new THREE.Color(0xc8ecff);
    const cGold = new THREE.Color(0xffe096);
    for (let i = 0; i < count; i++) {
      const fx = (rnd() * 2 - 1) * 5.6;
      const fy = 0.4 + rnd() * 4.2;
      const fz = -4.2 + rnd() * 8.2;
      const ph = rnd() * Math.PI * 2;
      this.frostBase.push([fx, fy, fz, ph]);
      pos[i * 3] = fx;
      pos[i * 3 + 1] = fy;
      pos[i * 3 + 2] = fz;
      const col = i % 3 === 0 ? cGold : cFrost;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const frostGeo = new THREE.BufferGeometry();
    frostGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    frostGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.frostPoints = new THREE.Points(
      frostGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        size: 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.frostPoints);
  }

  private buildBackFridgePortal(
    mintMat: THREE.Material,
    enamMat: THREE.Material,
    chromeMat: THREE.Material,
    glassMat: THREE.Material,
    brassMat: THREE.Material,
    woodMat: THREE.Material
  ): void {
    const g = new THREE.Group();
    g.position.set(0, 0, -4.78);
    this.worldGroup.add(g);

    // Mint-green retro refrigerator outer shell framing the secret arch portal
    const shellL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.85, 0.86), mintMat);
    shellL.position.set(-1.38, 1.925, 0.4);
    const shellR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.85, 0.86), mintMat);
    shellR.position.set(1.38, 1.925, 0.4);
    const shellTop = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.34, 0.9), mintMat);
    shellTop.position.set(0, 3.92, 0.4);
    const shellBot = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.16, 0.88), mintMat);
    shellBot.position.set(0, 0.08, 0.4);
    g.add(shellL, shellR, shellTop, shellBot);

    // Interior white enamel backing
    const enamBack = new THREE.Mesh(new THREE.BoxGeometry(2.44, 3.65, 0.08), enamMat);
    enamBack.position.set(0, 1.9, 0.02);
    g.add(enamBack);

    // Glowing ice-blue arched portal ("もうひとつの棚")
    const archGlowMat = new THREE.MeshStandardMaterial({
      color: 0xdcf0ff,
      emissive: 0x7cbfff,
      emissiveIntensity: 0.95,
      roughness: 0.25,
    });
    const archShape = new THREE.Shape();
    archShape.moveTo(-0.66, 0);
    archShape.lineTo(0.66, 0);
    archShape.lineTo(0.66, 1.28);
    archShape.absarc(0, 1.28, 0.66, 0, Math.PI, false);
    archShape.lineTo(-0.66, 0);
    const archMesh = new THREE.Mesh(new THREE.ShapeGeometry(archShape, 24), archGlowMat);
    archMesh.position.set(0, 0.18, 0.08);
    g.add(archMesh);

    const archFrameMat = new THREE.MeshStandardMaterial({
      color: 0xeaf4fc,
      emissive: 0x78a8d8,
      emissiveIntensity: 0.38,
      roughness: 0.3,
    });
    const archRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.055, 8, 28, Math.PI), archFrameMat);
    archRing.position.set(0, 1.46, 0.12);
    g.add(archRing);
    for (const sx of [-0.68, 0.68]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.32, 0.14), archFrameMat);
      post.position.set(sx, 0.82, 0.12);
      g.add(post);
    }

    this.fridgePortalGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xbce2ff,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.fridgePortalGlow.position.set(0, 1.2, 0.32);
    this.fridgePortalGlow.scale.set(3.4, 3.0, 1);
    g.add(this.fridgePortalGlow);

    // Upper glass refrigerator shelves with milk carton, jam jar, eggs & butter
    for (const sy of [2.42, 3.12]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.72), glassMat);
      shelf.position.set(0, sy, 0.42);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.045, 0.045), chromeMat);
      rail.position.set(0, sy, 0.78);
      g.add(shelf, rail);
    }

    // Milk carton
    const milkBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.46, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.45 })
    );
    milkBody.position.set(0.76, 2.68, 0.45);
    const milkBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.14, 0.29),
      new THREE.MeshStandardMaterial({ color: 0x4a7ec8, roughness: 0.45 })
    );
    milkBand.position.set(0.76, 2.7, 0.45);
    g.add(milkBody, milkBand);

    // Strawberry jam jar
    const jamBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.22, 14),
      new THREE.MeshStandardMaterial({ color: 0xc2343c, roughness: 0.28 })
    );
    jamBody.position.set(-0.78, 2.55, 0.48);
    const jamLid = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.045, 14), enamMat);
    jamLid.position.set(-0.78, 2.68, 0.48);
    g.add(jamBody, jamLid);

    // Egg carton with eggs
    const eggTray = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.05, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xcfb98f, roughness: 0.85 })
    );
    eggTray.position.set(-0.18, 2.47, 0.46);
    g.add(eggTray);
    const eggMat = new THREE.MeshStandardMaterial({ color: 0xf6ebd4, roughness: 0.55 });
    for (let i = 0; i < 6; i++) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eggMat);
      egg.scale.set(1, 1.25, 1);
      egg.position.set(-0.33 + (i % 3) * 0.15, 2.53, 0.4 + Math.floor(i / 3) * 0.12);
      g.add(egg);
    }

    // Upper shelf glowing lemon-slice jar & butter dish
    const lemonJar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.34, 14),
      new THREE.MeshStandardMaterial({
        color: 0xffe074,
        emissive: 0xd49c24,
        emissiveIntensity: 0.35,
        roughness: 0.3,
      })
    );
    lemonJar.position.set(0.68, 3.31, 0.44);
    const lemonLid = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.04, 14), brassMat);
    lemonLid.position.set(0.68, 3.5, 0.44);
    g.add(lemonJar, lemonLid);

    const butterDish = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.13, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xf2d06b, roughness: 0.5 })
    );
    butterDish.position.set(-0.52, 3.21, 0.48);
    g.add(butterDish);

    // Slightly ajar mint-green fridge door on the left side with chrome handle
    const door = new THREE.Group();
    door.position.set(-1.54, 0, 0.82);
    door.rotation.y = -1.18;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.85, 0.12), mintMat);
    doorPanel.position.set(0.77, 1.925, 0);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.08), chromeMat);
    handle.position.set(1.38, 2.05, 0.1);
    door.add(doorPanel, handle);
    g.add(door);

    // Brass plaque: "時間、すこし止めます。" above the fridge
    const plaqueTex = this.makePaperTagTex(
      ['時間、すこし止めます。', 'ここは時間が少しゆっくり流れる棚です'],
      460,
      124,
      '#f4e9cc',
      '#2c3c54',
      '#c89c46'
    );
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2.65, 0.72),
      new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.65 })
    );
    plaque.position.set(0, 4.42, 0.2);
    const plaqueFrame = new THREE.Mesh(new THREE.BoxGeometry(2.78, 0.84, 0.06), woodMat);
    plaqueFrame.position.set(0, 4.42, 0.16);
    g.add(plaqueFrame, plaque);
  }

  private buildTimeLantern(brassMat: THREE.Material): void {
    this.timeLanternGroup = new THREE.Group();
    this.timeLanternGroup.position.set(0, 4.15, -0.55);
    this.worldGroup.add(this.timeLanternGroup);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.7 })
    );
    cord.position.y = 0.95;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.28, 0.18, 6), brassMat);
    capTop.position.y = 0.34;
    const ringTop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.045, 6), brassMat);
    ringTop.position.y = 0.22;
    const ringBot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.045, 6), brassMat);
    ringBot.position.y = -0.38;
    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.31, 0.6, 6, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffe8bc,
        transparent: true,
        opacity: 0.34,
        roughness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lanternGlass.position.y = -0.08;

    this.timeLanternGroup.add(cord, capTop, ringTop, ringBot, lanternGlass);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 5), brassMat);
      strut.position.set(Math.cos(a) * 0.33, -0.08, Math.sin(a) * 0.33);
      this.timeLanternGroup.add(strut);
    }

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfff3cc,
        emissive: 0xffd27a,
        emissiveIntensity: 1.5,
        roughness: 0.3,
      })
    );
    core.position.y = -0.08;
    this.timeLanternGroup.add(core);

    this.timeLanternGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffd688,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.timeLanternGlow.position.y = -0.08;
    this.timeLanternGlow.scale.set(3.4, 3.4, 1);
    this.timeLanternGroup.add(this.timeLanternGlow);

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: i % 2 === 0 ? 0xffe29c : 0xb8e6ff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mote.position.set(Math.cos(a) * 0.48, -0.08 + Math.sin(a * 2) * 0.14, Math.sin(a) * 0.48);
      mote.scale.set(0.28, 0.28, 1);
      this.timeLanternGroup.add(mote);
    }
  }

  private buildCentralHourglass(
    enamMat: THREE.Material,
    woodMat: THREE.Material,
    brassMat: THREE.Material,
    glassMat: THREE.Material
  ): void {
    // Placed right behind the center-back spot so Tomerun can walk freely around it
    const g = new THREE.Group();
    g.position.set(1.68, 0, -3.55);
    this.worldGroup.add(g);

    // Round white enamel pedestal table
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 28), enamMat);
    top.position.y = 0.82;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.78, 14), woodMat);
    leg.position.y = 0.41;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.06, 22), woodMat);
    base.position.y = 0.03;
    g.add(top, leg, base);

    // Giant Hourglass on top
    const hg = new THREE.Group();
    hg.position.set(0, 0.86, 0);
    g.add(hg);

    for (const cy of [0.03, 1.32]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.065, 24), brassMat);
      cap.position.y = cy;
      hg.add(cap);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + Math.PI / 4;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 6), brassMat);
      rod.position.set(Math.cos(a) * 0.3, 0.675, Math.sin(a) * 0.3);
      hg.add(rod);
    }

    // Hourglass lathe bulb
    const pts = [
      [0.01, 0.05],
      [0.26, 0.05],
      [0.24, 0.24],
      [0.16, 0.44],
      [0.04, 0.64],
      [0.16, 0.84],
      [0.24, 1.04],
      [0.26, 1.25],
      [0.01, 1.25],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const glassBulb = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), glassMat);
    hg.add(glassBulb);

    // Glowing golden sand cones + thin stream + animated falling sand grains
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xffc65c,
      emissiveIntensity: 0.95,
      roughness: 0.4,
    });
    const botCone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.22, 0.24, 18), sandMat);
    botCone.position.y = 0.18;
    const topCone = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.02, 0.2, 18), sandMat);
    topCone.position.y = 0.92;
    hg.add(botCone, topCone);

    const grainGeo = new THREE.SphereGeometry(0.026, 8, 6);
    for (let i = 0; i < 7; i++) {
      const grain = new THREE.Mesh(grainGeo, sandMat);
      hg.add(grain);
      this.fallingSandGrains.push({ mesh: grain, offset: i / 7 });
    }

    // Iconic brass slowing valve wheel attached to the base of the hourglass!
    this.valveWheelGroup = new THREE.Group();
    this.valveWheelGroup.position.set(-0.38, 0.18, 0.12);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), brassMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.x = 0.14;
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 20), brassMat);
    wheelRim.rotation.y = Math.PI / 2;
    const spoke1 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), brassMat);
    const spoke2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), brassMat);
    spoke2.rotation.x = Math.PI / 2;
    this.valveWheelGroup.add(pipe, wheelRim, spoke1, spoke2);
    hg.add(this.valveWheelGroup);

    const hgGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffd888,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    hgGlow.position.set(0, 0.66, 0);
    hgGlow.scale.set(1.7, 1.7, 1);
    hg.add(hgGlow);
  }

  private buildLeftTimeJarShelves(
    shelfWoodMat: THREE.Material,
    glassMat: THREE.Material,
    brassMat: THREE.Material,
    rnd: () => number
  ): void {
    const glowColors = [
      [0xffd890, 0xffc04a],
      [0xffc29e, 0xff9262],
      [0xc4e8ff, 0x74beff],
      [0xfff0c4, 0xffd874],
      [0xe4c8ff, 0xb88cff],
    ];
    const icicleMat = new THREE.MeshStandardMaterial({
      color: 0xe6f6ff,
      transparent: true,
      opacity: 0.78,
      roughness: 0.2,
      emissive: 0x6a96c4,
      emissiveIntensity: 0.32,
    });

    const buildUnit = (pz: number, W: number) => {
      const g = new THREE.Group();
      g.position.set(-5.68, 0, pz);
      g.rotation.y = Math.PI / 2;
      this.worldGroup.add(g);

      const D = 0.54;
      const H = 3.35;
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, H, D), shelfWoodMat);
        side.position.set(s * (W / 2 - 0.035), H / 2, 0);
        g.add(side);
      }
      const tiers = [0.22, 1.02, 1.82, 2.62];
      for (const y of tiers) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), shelfWoodMat);
        plank.position.set(0, y, 0);
        g.add(plank);

        // Frost icicles hanging from shelf edge
        for (let i = 0; i < 8; i++) {
          const ic = new THREE.Mesh(
            new THREE.ConeGeometry(0.018 + rnd() * 0.014, 0.08 + rnd() * 0.12, 5),
            icicleMat
          );
          ic.rotation.x = Math.PI;
          ic.position.set((rnd() - 0.5) * (W - 0.24), y - 0.06 - rnd() * 0.03, D / 2 - 0.02);
          g.add(ic);
        }
      }
      const topCap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.08, D + 0.06), shelfWoodMat);
      topCap.position.set(0, H + 0.04, 0);
      g.add(topCap);

      // Glowing time jars on every shelf tier
      let n = 0;
      for (const y of tiers) {
        let x = -W / 2 + 0.22;
        while (x < W / 2 - 0.24) {
          const r = 0.095 + rnd() * 0.045;
          const h = 0.26 + rnd() * 0.18;
          if (rnd() < 0.1) {
            x += 0.22;
            continue;
          }
          const col = glowColors[n++ % glowColors.length];
          const j = new THREE.Group();
          j.position.set(x + r, y + 0.03, (rnd() - 0.5) * 0.08);
          const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, h, 14), glassMat);
          body.position.y = h * 0.5;
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(r * 0.58, 10, 8),
            new THREE.MeshStandardMaterial({
              color: col[0],
              emissive: col[1],
              emissiveIntensity: 0.95,
              roughness: 0.4,
            })
          );
          core.position.y = h * 0.44;
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r * 0.65, 0.045, 12), brassMat);
          lid.position.y = h + 0.02;
          j.add(body, core, lid);

          if (n % 2 === 0) {
            const gl = new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: this.glowTex,
                color: col[0],
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            );
            gl.position.y = h * 0.45;
            gl.scale.set(r * 7.2, r * 7.2, 1);
            j.add(gl);
            this.jarGlowSprites.push({ sprite: gl, phase: n * 0.9, baseOp: 0.42 });
          }
          g.add(j);
          x += r * 2 + 0.06;
        }
      }
    };

    buildUnit(-2.35, 3.0);
    buildUnit(0.95, 2.8);
  }

  private buildBlueBlanketCorner(
    brassMat: THREE.Material,
    glassMat: THREE.Material,
    rnd: () => number
  ): void {
    const g = new THREE.Group();
    g.position.set(-4.85, 0, 3.15);
    this.worldGroup.add(g);

    const cushionBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.9, 0.18, 28),
      new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.96 })
    );
    cushionBase.position.y = 0.09;
    g.add(cushionBase);

    const blues = [0x6aa0d8, 0x5890c8, 0x7cb2e6, 0x4b7fb6].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })
    );
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.54;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rnd() * 0.12, 10, 8), blues[i % 4]);
      puff.position.set(Math.cos(a) * r, 0.22 + rnd() * 0.24, Math.sin(a) * r);
      g.add(puff);
    }

    // Miniature tabletop hourglass beside the blanket
    const miniHg = new THREE.Group();
    miniHg.position.set(0.95, 0, 0.2);
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 14), brassMat);
    bot.position.y = 0.012;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 14), brassMat);
    top.position.y = 0.26;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 12), glassMat);
    glass.position.y = 0.135;
    const sand = new THREE.Mesh(
      new THREE.ConeGeometry(0.048, 0.08, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffe49c,
        emissive: 0xffc65c,
        emissiveIntensity: 0.75,
      })
    );
    sand.position.y = 0.06;
    miniHg.add(bot, top, glass, sand);
    g.add(miniHg);
  }

  private buildRightWindowAndDesk(
    woodMat: THREE.Material,
    enamMat: THREE.Material,
    brassMat: THREE.Material,
    glassMat: THREE.Material,
    rnd: () => number
  ): void {
    // 1. Frosted arched window with winter crystals (x = 5.95, z = -1.6)
    const wg = new THREE.Group();
    wg.position.set(5.92, 2.35, -1.6);
    wg.rotation.y = -Math.PI / 2;
    this.worldGroup.add(wg);

    const frostTex = this.makeCanvasTex(256, 320, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#7ea8d8');
      gr.addColorStop(1, '#cde4f6');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        c.fillStyle = `rgba(255,255,255,${(rnd() * 0.35).toFixed(3)})`;
        c.fillRect(rnd() * w, rnd() * h, 1.5 + rnd() * 2, 1.5 + rnd() * 2);
      }
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 1.4;
      for (let k = 0; k < 22; k++) {
        const x = rnd() * w;
        const y = rnd() < 0.5 ? rnd() * h * 0.25 : h - rnd() * h * 0.25;
        c.beginPath();
        c.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          c.lineTo(x + (rnd() - 0.5) * 38, y + (rnd() - 0.5) * 38);
        }
        c.stroke();
      }
    });
    const wShape = new THREE.Shape();
    wShape.moveTo(-0.72, -1.0);
    wShape.lineTo(0.72, -1.0);
    wShape.lineTo(0.72, 0.45);
    wShape.absarc(0, 0.45, 0.72, 0, Math.PI, false);
    wShape.lineTo(-0.72, -1.0);
    const pane = new THREE.Mesh(
      new THREE.ShapeGeometry(wShape, 20),
      new THREE.MeshBasicMaterial({ map: frostTex, fog: false })
    );
    const wFrameArc = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.055, 8, 28, Math.PI), enamMat);
    wFrameArc.position.set(0, 0.45, 0.03);
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.05, 0.05), enamMat);
    mullionV.position.set(0, -0.05, 0.04);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.05, 0.05), enamMat);
    mullionH.position.set(0, -0.1, 0.04);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.09, 0.28), enamMat);
    sill.position.set(0, -1.03, 0.08);
    wg.add(pane, wFrameArc, mullionV, mullionH, sill);

    const wGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xbce2ff,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    wGlow.position.set(0, 0, 0.35);
    wGlow.scale.set(3.2, 3.2, 1);
    wg.add(wGlow);

    // 2. White wooden ladder leaning against the right wall (x = 5.6, z = 0.85)
    const lg = new THREE.Group();
    lg.position.set(5.55, 0, 0.85);
    lg.rotation.y = -Math.PI / 2;
    this.worldGroup.add(lg);
    const ladderMat = new THREE.MeshStandardMaterial({ color: 0xe2eef4, roughness: 0.5 });
    for (const lx of [-0.26, 0.26]) {
      this.addSegment(new THREE.Vector3(lx, 0, 0.45), new THREE.Vector3(lx, 3.2, -0.04), 0.032, ladderMat, lg);
    }
    for (let i = 0; i < 8; i++) {
      const u = (i + 1) / 9;
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 6), ladderMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, u * 3.2, 0.45 - u * 0.49);
      lg.add(rung);
    }

    // 3. Tomerun's quill & live-updating preservation notebook desk (x = 5.2, z = 2.65)
    const dg = new THREE.Group();
    dg.position.set(5.15, 0, 2.55);
    dg.rotation.y = -Math.PI / 2;
    this.worldGroup.add(dg);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.84), woodMat);
    top.position.y = 0.82;
    dg.add(top);
    for (const [lx, lz] of [
      [-0.72, -0.34],
      [0.72, -0.34],
      [-0.72, 0.34],
      [0.72, 0.34],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 0.07), woodMat);
      leg.position.set(lx, 0.41, lz);
      dg.add(leg);
    }

    // Live-updating open preservation notebook
    this.notebookCanvas = document.createElement('canvas');
    this.notebookCanvas.width = 320;
    this.notebookCanvas.height = 200;
    this.notebookTex = new THREE.CanvasTexture(this.notebookCanvas);
    this.updateNotebookDisplay(0);

    const nbCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.03, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x3f6fa8, roughness: 0.72 })
    );
    nbCover.position.set(-0.08, 0.87, 0.04);
    const nbPages = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.4),
      new THREE.MeshStandardMaterial({ map: this.notebookTex, roughness: 0.88 })
    );
    nbPages.rotation.x = -Math.PI / 2;
    nbPages.position.set(-0.08, 0.89, 0.04);
    dg.add(nbCover, nbPages);

    // Inkwell & white feather quill
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.085, 14), glassMat);
    ink.position.set(0.5, 0.9, 0.12);
    const quill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.01, 0.46, 6),
      new THREE.MeshStandardMaterial({ color: 0xf4ecda, roughness: 0.65 })
    );
    quill.position.set(0.54, 1.08, 0.12);
    quill.rotation.z = -0.45;
    dg.add(ink, quill);

    // Blue-shade desk lamp
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 14), brassMat);
    lampBase.position.set(-0.58, 0.87, -0.2);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 8), brassMat);
    lampStem.position.set(-0.58, 1.02, -0.2);
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.15, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x4a82c8, roughness: 0.45, side: THREE.DoubleSide })
    );
    lampShade.position.set(-0.58, 1.18, -0.2);
    const lampGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffd992,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lampGlow.position.set(-0.58, 1.12, -0.2);
    lampGlow.scale.set(0.95, 0.95, 1);
    dg.add(lampBase, lampStem, lampShade, lampGlow);
  }

  private buildBackDiningJars(
    shelfWoodMat: THREE.Material,
    woodMat: THREE.Material,
    enamMat: THREE.Material,
    brassMat: THREE.Material,
    glassMat: THREE.Material
  ): void {
    // Back-left table holding the 3 iconic Dining Table Diorama Jars from トメルンの部屋
    const g = new THREE.Group();
    g.position.set(-3.35, 0, -4.18);
    this.worldGroup.add(g);

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.96), enamMat);
    top.position.y = 0.84;
    g.add(top);
    for (const [lx, lz] of [
      [-1.45, -0.38],
      [1.45, -0.38],
      [-1.45, 0.38],
      [1.45, 0.38],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.84, 0.09), shelfWoodMat);
      leg.position.set(lx, 0.42, lz);
      g.add(leg);
    }

    const steamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.68,
      emissive: 0xb8d4f0,
      emissiveIntensity: 0.4,
      roughness: 0.95,
    });
    const labels = ['ふたりの食卓', 'にぎやかな食卓', 'さいごの家族の時間'];
    const glowCols = [0xffd890, 0xffe2a0, 0xffbe8a];

    labels.forEach((label, idx) => {
      const j = new THREE.Group();
      const jx = -1.02 + idx * 1.02;
      j.position.set(jx, 0.89, 0);
      g.add(j);

      const R = 0.36;
      const H = 0.96;
      const jarShell = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.95, H, 20), glassMat);
      jarShell.position.y = H * 0.5;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.68, R * 0.68, 0.075, 18), brassMat);
      lid.position.y = H + 0.035;
      j.add(jarShell, lid);

      // Tiny dining table, soup bowl & rising steam inside the jar
      const miniTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), woodMat);
      miniTop.position.y = 0.22;
      const miniLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), woodMat);
      miniLeg.position.y = 0.11;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.09, 8), enamMat);
      candle.position.y = 0.28;
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd888 })
      );
      flame.scale.set(1, 1.6, 1);
      flame.position.y = 0.35;
      j.add(miniTop, miniLeg, candle, flame);

      for (let s = 0; s < 3; s++) {
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.028 + s * 0.01, 8, 6), steamMat);
        st.position.set((s - 1) * 0.03, 0.34 + s * 0.08, 0.04);
        j.add(st);
      }

      const gl = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: glowCols[idx],
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      gl.position.y = 0.4;
      gl.scale.set(1.05, 1.05, 1);
      j.add(gl);
      this.jarGlowSprites.push({ sprite: gl, phase: idx * 1.4, baseOp: 0.52 });

      // Front paper label card
      const lb = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.24),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTagTex([label], 280, 96),
          roughness: 0.85,
        })
      );
      lb.position.set(jx, 0.86, 0.5);
      lb.rotation.x = -0.36;
      g.add(lb);
    });
  }

  private buildExpiryTagsAndBoard(woodMat: THREE.Material, rnd: () => number): void {
    // Back-right wall expiry-tag board
    const bg = new THREE.Group();
    bg.position.set(3.55, 2.55, -4.8);
    this.worldGroup.add(bg);

    const boardBack = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.55, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x20324a, roughness: 0.9 })
    );
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(3.54, 1.68, 0.03), woodMat);
    boardFrame.position.z = -0.018;
    bg.add(boardFrame, boardBack);

    const words = [
      'あと3分',
      'おわらないで',
      'ありがとう',
      'おいしかったね',
      'また明日',
      '笑った日',
      'いっしょに',
      'もう少し',
      'ただいま',
      'おやすみ',
    ];
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xd94c42, roughness: 0.45 });
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const tx = this.makePaperTagTex([words[(r * 4 + c) % words.length]], 200, 100);
        const card = new THREE.Mesh(
          new THREE.PlaneGeometry(0.68, 0.34),
          new THREE.MeshStandardMaterial({ map: tx, roughness: 0.88 })
        );
        card.position.set(-1.14 + c * 0.76, 0.34 - r * 0.66, 0.035);
        card.rotation.z = (rnd() - 0.5) * 0.12;
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), pinMat);
        pin.position.set(card.position.x, card.position.y + 0.13, 0.05);
        bg.add(card, pin);
      }
    }

    // Overhead draped wire with gently swaying expiry-date wish tags
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.8 });
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      pts.push(new THREE.Vector3(-5.6 + 11.2 * u, 4.72 - Math.sin(u * Math.PI) * 0.48, -2.85));
    }
    for (let i = 0; i < 14; i++) {
      this.addSegment(pts[i], pts[i + 1], 0.008, wireMat, this.worldGroup);
    }
    for (let i = 2; i <= 12; i += 2) {
      const q = pts[i];
      const tg = new THREE.Group();
      tg.position.copy(q);
      const tx = this.makePaperTagTex([words[(i / 2) % words.length]], 190, 100);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.24),
        new THREE.MeshStandardMaterial({ map: tx, roughness: 0.88, side: THREE.DoubleSide })
      );
      plane.position.y = -0.18;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4), wireMat);
      string.position.y = -0.04;
      tg.add(string, plane);
      this.worldGroup.add(tg);
      this.hangingTags.push({ group: tg, phase: i * 0.85 });
    }
  }

  private buildUpgradeExtras(
    brassMat: THREE.Material,
    glassMat: THREE.Material,
    woodMat: THREE.Material,
    enamMat: THREE.Material,
    rnd: () => number
  ): void {
    // 1. hourglassValve extra: Twin miniature brass hourglasses flanking the central pedestal + golden aura ring
    const hgAura = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 0.92, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffdf8c,
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    hgAura.rotation.x = -Math.PI / 2;
    hgAura.position.set(1.68, 0.03, -3.55);
    this.hourglassExtraGroup.add(hgAura);

    for (const ox of [-0.52, 0.52]) {
      const mini = new THREE.Group();
      mini.position.set(1.68 + ox, 0.86, -3.32);
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 14), brassMat);
      const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 14), brassMat);
      c2.position.y = 0.34;
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.32, 12), glassMat);
      gl.position.y = 0.17;
      const sd = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.055, 0),
        new THREE.MeshStandardMaterial({
          color: 0xffe49c,
          emissive: 0xffc65c,
          emissiveIntensity: 1.1,
        })
      );
      sd.position.y = 0.17;
      mini.add(c1, c2, gl, sd);
      this.hourglassExtraGroup.add(mini);
    }

    // 2. timeLantern extra: Hanging string of warm frost-gold fairy bulbs overhead
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a2 });
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const bx = -4.8 + u * 9.6;
      const by = 4.42 - Math.sin(u * Math.PI) * 0.55;
      const bz = -1.2 + Math.cos(u * Math.PI) * 0.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat);
      bulb.position.set(bx, by, bz);
      const gl = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: i % 2 === 0 ? 0xffdc8c : 0xb8e6ff,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      gl.position.set(bx, by, bz);
      gl.scale.set(0.9, 0.9, 1);
      this.lanternExtraGroup.add(bulb, gl);
    }

    // 3. diningJars extra: Warm golden floating halos & extra glowing condiment/soup jars on the back table
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffd888,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sp.position.set(-4.37 + i * 1.02, 1.55, -4.18);
      sp.scale.set(1.4, 1.4, 1);
      this.diningJarsExtraGroup.add(sp);
    }

    // 4. expiryTags extra: Second front-side hanging wish-tag garland
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.8 });
    const extraWords = ['あと5びょう', 'また明日ね', 'ずっと一緒', 'だいじょうぶ', 'おやすみ'];
    for (let i = 0; i < 5; i++) {
      const u = (i + 1) / 6;
      const x = -4.6 + u * 9.2;
      const y = 4.55 - Math.sin(u * Math.PI) * 0.35;
      const tg = new THREE.Group();
      tg.position.set(x, y, 0.8);
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.24),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTagTex([extraWords[i]], 190, 100, '#fff5dc', '#2a4d78', '#d4a84c'),
          roughness: 0.85,
          side: THREE.DoubleSide,
        })
      );
      card.position.y = -0.16;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4), wireMat);
      st.position.y = -0.04;
      tg.add(st, card);
      this.expiryTagsExtraGroup.add(tg);
      this.hangingTags.push({ group: tg, phase: i * 1.2 + 0.5 });
    }

    // 5. blueBlanket extra: Extra fluffy knitted pillows & frost-blue comfort glow at the blanket corner
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0x8cc6f2, roughness: 0.92 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), pillowMat);
      pf.position.set(-4.85 + Math.cos(a) * 0.72, 0.22 + rnd() * 0.1, 3.15 + Math.sin(a) * 0.72);
      this.blueBlanketExtraGroup.add(pf);
    }
    const blGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0x90d0ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    blGlow.position.set(-4.85, 0.6, 3.15);
    blGlow.scale.set(2.2, 2.2, 1);
    this.blueBlanketExtraGroup.add(blGlow);

    // 6. diaryDesk extra: Stacked blue-bound preservation logbooks & glowing crystal sand bottle on the desk
    for (let i = 0; i < 3; i++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.06, 0.24),
        new THREE.MeshStandardMaterial({
          color: [0x3b6ba8, 0x5c8dc4, 0x2c4e7c][i],
          roughness: 0.72,
        })
      );
      book.position.set(5.32, 0.89 + i * 0.062, 2.02);
      book.rotation.y = (i - 1) * 0.18;
      this.diaryDeskExtraGroup.add(book);
    }
    const starBottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.09, 0.26, 14),
      enamMat
    );
    starBottle.position.set(5.1, 0.98, 3.12);
    const starGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe49c,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    starGlow.position.set(5.1, 1.05, 3.12);
    starGlow.scale.set(1.1, 1.1, 1);
    this.diaryDeskExtraGroup.add(starBottle, starGlow);

    // Unused parameter safety
    void woodMat;
  }

  private buildTimeSpots(
    woodMat: THREE.Material,
    brassMat: THREE.Material,
    glassMat: THREE.Material,
    enamMat: THREE.Material
  ): void {
    const steamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      emissive: 0xffe0a8,
      emissiveIntensity: 0.45,
      roughness: 0.9,
    });

    for (const def of TIME_SPOTS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      this.worldGroup.add(group);

      // Floor background ring & filling progress ring
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 0.98, 40),
        new THREE.MeshBasicMaterial({
          color: 0x254060,
          transparent: true,
          opacity: 0.56,
          side: THREE.DoubleSide,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.022;
      group.add(ringBg);

      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 0.97, 40),
        new THREE.MeshBasicMaterial({
          color: def.accentHex,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.032;
      group.add(ringFill);

      // Expanding pulse ring on completion
      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.02, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffe8a0,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.045;
      group.add(pulseRing);

      // Theme-specific miniature pedestal prop at the center of the spot
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.14, 20), enamMat);
      ped.position.y = 0.07;
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.58, 18), glassMat);
      dome.position.y = 0.43;
      const domeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), brassMat);
      domeCap.position.y = 0.74;
      group.add(ped, dome, domeCap);

      // Inside miniature table/bowl
      const innerTable = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 16), woodMat);
      innerTable.position.y = 0.26;
      const innerCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 10),
        new THREE.MeshStandardMaterial({
          color: def.accentHex,
          emissive: def.accentHex,
          emissiveIntensity: 0.9,
          roughness: 0.35,
        })
      );
      innerCore.position.y = 0.38;
      group.add(innerTable, innerCore);

      // Floating steam / sparkle orbs rising inside
      const steamOrbs: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045 + i * 0.012, 8, 6), steamMat);
        orb.position.set((i - 1) * 0.07, 0.48 + i * 0.12, 0);
        group.add(orb);
        steamOrbs.push(orb);
      }

      // Live sign tag board floating above each spot (faces camera cleanly)
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 128;
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(1.48, 0.74),
        new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          depthWrite: false,
        })
      );
      signBoard.position.set(0, 1.48, 0);
      group.add(signBoard);

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
      halo.position.set(0, 0.48, 0);
      halo.scale.set(1.65, 1.65, 1);
      group.add(halo);

      const glowLight = new THREE.PointLight(def.accentHex, 0.85, 4.2, 1.6);
      glowLight.position.set(0, 0.85, 0);
      group.add(glowLight);

      const vis: TimeSpotVisual = {
        group,
        ringFill,
        ringBg,
        signCanvas,
        signTex,
        signBoard,
        steamOrbs,
        halo,
        glowLight,
        pulseRing,
        accentColor: new THREE.Color(def.accentHex),
        urgentColor: new THREE.Color(0x7cc8ff),
        lastRenderedBucket: -1,
        lastRenderedUrgent: false,
        lastRenderedDone: false,
        pulse: 0,
      };
      this.redrawSpotSign(vis, def.shortName, def.tagLabel, def.cssColor, 40, false, false);
      this.spotVisuals.push(vis);
    }
  }

  private redrawSpotSign(
    vis: TimeSpotVisual,
    shortName: string,
    tagLabel: string,
    cssColor: string,
    progress: number,
    urgent: boolean,
    done: boolean
  ): void {
    const c = vis.signCanvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);

    // Rounded parchment / frosty glass expiry-tag card
    const rx = 14;
    g.fillStyle = done
      ? 'rgba(54, 42, 16, 0.90)'
      : urgent
        ? 'rgba(20, 44, 78, 0.92)'
        : 'rgba(13, 25, 44, 0.86)';
    g.strokeStyle = done ? '#ffe694' : urgent ? '#90dcff' : cssColor;
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(6, 6, W - 12, H - 12, rx);
    g.fill();
    g.stroke();

    // Small tag title
    g.fillStyle = done ? '#fff2b6' : urgent ? '#b4e8ff' : '#e6eef8';
    g.font = "800 22px 'Zen Maru Gothic', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(shortName, W * 0.5, 34);

    // Status subtitle
    g.fillStyle = done ? '#ffe082' : urgent ? '#7cd8ff' : cssColor;
    g.font = "700 18px 'Zen Maru Gothic', sans-serif";
    const statusText = done
      ? '✨ 時間の瓶に保存済！'
      : urgent
        ? '❄️ 賞味期限ま近！そばへ！'
        : `⏳「${tagLabel}」 ${Math.round(progress)}%`;
    g.fillText(statusText, W * 0.5, 68);

    // Progress bar inside the tag
    const bx = 26;
    const by = 92;
    const bw = W - 52;
    const bh = 16;
    g.fillStyle = 'rgba(255, 255, 255, 0.14)';
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 8);
    g.fill();

    const fillW = Math.max(8, (bw * Math.max(0, Math.min(100, progress))) / 100);
    g.fillStyle = done ? '#ffe68c' : urgent ? '#7cd8ff' : cssColor;
    g.beginPath();
    g.roundRect(bx, by, fillW, bh, 8);
    g.fill();

    vis.signTex.needsUpdate = true;
  }

  public updateNotebookDisplay(totalSecondsExtended: number): void {
    const sec = Math.floor(totalSecondsExtended);
    if (sec === this.lastNotebookSec) return;
    this.lastNotebookSec = sec;

    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    const c = this.notebookCanvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;

    g.fillStyle = '#f5eedc';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(84, 126, 174, 0.35)';
    g.lineWidth = 2;
    for (let y = 38; y < H; y += 30) {
      g.beginPath();
      g.moveTo(14, y);
      g.lineTo(W - 14, y);
      g.stroke();
    }
    // Center crease
    g.strokeStyle = 'rgba(60, 80, 110, 0.35)';
    g.beginPath();
    g.moveTo(W * 0.5, 6);
    g.lineTo(W * 0.5, H - 6);
    g.stroke();

    g.fillStyle = '#264672';
    g.font = "700 22px 'Zen Maru Gothic', sans-serif";
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('きょうの', 20, 44);
    g.fillText('とめた時間', 20, 78);
    g.fillStyle = '#b47420';
    g.font = "900 26px 'Zen Maru Gothic', sans-serif";
    g.fillText(`${mins}ぷん`, 20, 122);
    g.fillText(`${rem}びょう`, 20, 156);

    g.fillStyle = '#264672';
    g.font = "700 20px 'Zen Maru Gothic', sans-serif";
    g.fillText('だいじょうぶ', W * 0.54, 54);
    g.fillText('たいせつな', W * 0.54, 92);
    g.fillText('時間は', W * 0.54, 126);
    g.fillText('守られてるよ', W * 0.54, 160);

    this.notebookTex.needsUpdate = true;
  }

  public syncUpgrades(state: TomerunSaveState): void {
    const u = state.upgrades;
    this.hourglassExtraGroup.visible = u.hourglassValve >= 1;
    this.lanternExtraGroup.visible = u.timeLantern >= 1;
    this.diningJarsExtraGroup.visible = u.diningJars >= 1;
    this.expiryTagsExtraGroup.visible = u.expiryTags >= 1;
    this.blueBlanketExtraGroup.visible = u.blueBlanket >= 1;
    this.diaryDeskExtraGroup.visible = u.diaryDesk >= 1;
    this.updateNotebookDisplay(state.totalSecondsExtended);
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public triggerShake(intensity: number, duration = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public triggerValveFlash(): void {
    this.valveFlashTimer = 0.9;
  }

  public triggerSpotCompletePulse(spotId: number): void {
    const vis = this.spotVisuals[spotId];
    if (vis) vis.pulse = 1.0;
  }

  /** Launches a glowing bottled time jar in a 3D arc to the left time-jar shelf */
  public spawnJarShelfArc(fromX: number, fromZ: number): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.34, 14), this.arcGlassMat);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), this.arcCoreMat);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), this.arcGoldMat);
    lid.position.y = 0.19;
    const gl = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe296,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    gl.scale.set(0.9, 0.9, 1);
    g.add(body, core, lid, gl);
    this.worldGroup.add(g);

    const start = new THREE.Vector3(fromX, 1.0, fromZ);
    const end = new THREE.Vector3(-5.2, 2.0 + Math.random() * 0.9, -1.8 + Math.random() * 2.4);
    const ctrl = new THREE.Vector3(
      (start.x + end.x) * 0.5,
      Math.max(start.y, end.y) + 2.2,
      (start.z + end.z) * 0.5
    );
    this.jarArcs.push({ group: g, start, ctrl, end, t: 0, dur: 0.88 });
  }

  public updateSpotVisual(
    spotId: number,
    progress: number,
    preserving: boolean,
    doneHold: boolean,
    elapsed: number,
    timeScale: number
  ): void {
    const vis = this.spotVisuals[spotId];
    const def = TIME_SPOTS[spotId];
    if (!vis || !def) return;

    const urgent = !doneHold && progress < 28;
    const bucket = Math.round(progress / 5) * 5;
    if (
      bucket !== vis.lastRenderedBucket ||
      urgent !== vis.lastRenderedUrgent ||
      doneHold !== vis.lastRenderedDone
    ) {
      vis.lastRenderedBucket = bucket;
      vis.lastRenderedUrgent = urgent;
      vis.lastRenderedDone = doneHold;
      this.redrawSpotSign(vis, def.shortName, def.tagLabel, def.cssColor, progress, urgent, doneHold);
    }

    // Billboard sign towards camera
    vis.signBoard.quaternion.copy(this.camera.quaternion);
    vis.signBoard.position.y = 1.48 + Math.sin(elapsed * 2.2 + spotId) * 0.04;

    const ringScale = 0.52 + (Math.max(0, Math.min(100, progress)) / 100) * 0.5;
    vis.ringFill.scale.setScalar(ringScale);
    const ringMat = vis.ringFill.material as THREE.MeshBasicMaterial;
    if (doneHold) {
      ringMat.color.setHex(0xfff2b0);
      ringMat.opacity = 0.95;
    } else if (urgent) {
      ringMat.color.copy(vis.urgentColor);
      ringMat.opacity = 0.5 + 0.42 * Math.abs(Math.sin(elapsed * 6.5));
    } else {
      ringMat.color.copy(vis.accentColor);
      ringMat.opacity = preserving ? 0.92 : 0.65;
    }

    const haloMat = vis.halo.material as THREE.SpriteMaterial;
    haloMat.opacity = doneHold
      ? 0.82
      : preserving
        ? 0.64 + Math.sin(elapsed * 8) * 0.14
        : urgent
          ? 0.25 + 0.25 * Math.abs(Math.sin(elapsed * 6))
          : 0.36;
    vis.glowLight.intensity = doneHold ? 1.8 : preserving ? 1.45 : urgent ? 0.5 : 0.85;

    // Animate miniature steam orbs rising slowly (nearly frozen during valve pause!)
    vis.steamOrbs.forEach((orb, idx) => {
      const cycle = ((this.sandClock * 0.45 + idx * 0.33 + spotId * 0.2) % 1);
      orb.position.y = 0.38 + cycle * 0.46;
      orb.position.x = Math.sin(elapsed * 1.4 * timeScale + idx * 2.1) * 0.08;
      const sc = 0.55 + Math.sin(cycle * Math.PI) * 0.7;
      orb.scale.setScalar(sc);
    });

    if (vis.pulse > 0) {
      vis.pulse = Math.max(0, vis.pulse - 0.025);
      const p = 1 - vis.pulse;
      vis.pulseRing.scale.setScalar(1 + p * 1.6);
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = vis.pulse * 0.9;
    } else {
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.45 ? 49 : 44;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public screenToFloor(
    virtualX: number,
    virtualY: number,
    viewW: number,
    viewH: number
  ): THREE.Vector3 | null {
    this.tmpNdc.set((virtualX / viewW) * 2 - 1, -(virtualY / viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpNdc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, out);
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    viewW: number,
    viewH: number
  ): { x: number; y: number; visible: boolean } {
    const p = worldPos.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * viewW,
      y: (-p.y * 0.5 + 0.5) * viewH,
      visible: p.z < 1,
    };
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean,
    isValvePaused: boolean
  ): void {
    const timeScale = isValvePaused ? 0.14 : isFever ? 0.45 : 1.0;
    this.simClock += dt;
    this.sandClock += dt * timeScale;

    if (this.valveFlashTimer > 0) this.valveFlashTimer = Math.max(0, this.valveFlashTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    // Camera smoothly frames the time-preservation vault
    const goalPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.24) * 1.15, 4.9, 8.2)
        : new THREE.Vector3(0, 6.45, 8.75);
    const goalTarget =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.45, -1.2)
        : new THREE.Vector3(0, 0.85, -0.35);

    const safeDt = Math.max(0, Math.min(0.05, dt));
    const smooth = Math.max(0, Math.min(1, 1 - Math.exp(-3.6 * safeDt)));
    this.camPos.lerp(goalPos, smooth);
    this.camTarget.lerp(goalTarget, smooth);

    this.camera.position.copy(this.camPos);
    if (this.shakeTimer > 0) {
      const mag = this.shakeIntensity * (this.shakeTimer / 0.25);
      this.camera.position.x += (Math.random() - 0.5) * mag;
      this.camera.position.y += (Math.random() - 0.5) * mag;
    }
    this.camera.lookAt(this.camTarget);

    // Rotate overhead Time Lantern (accelerates warmly during fever or valve turn)
    this.timeLanternGroup.rotation.y += dt * (isValvePaused ? 1.45 : isFever ? 0.9 : 0.28);
    this.timeLanternGlow.scale.setScalar(
      3.3 + beatPulse * 0.35 + (isFever ? 0.9 : 0) + this.valveFlashTimer * 1.1
    );

    // Brass valve wheel rotates when VALVE PAUSE is active!
    if (this.valveWheelGroup) {
      this.valveWheelGroup.rotation.x += dt * (isValvePaused ? 4.2 : 0.35);
    }

    // Falling golden sand grains inside the central giant hourglass (freeze mid-air on VALVE PAUSE!)
    for (const fg of this.fallingSandGrains) {
      const u = (this.sandClock * 0.55 + fg.offset) % 1;
      fg.mesh.position.set(
        Math.sin(fg.offset * 12 + elapsed * 1.5) * 0.012,
        0.78 - u * 0.52,
        Math.cos(fg.offset * 12) * 0.012
      );
      fg.mesh.scale.setScalar(isValvePaused ? 1.35 : 0.9 + beatPulse * 0.2);
    }

    // Hanging expiry wish tags gently sway
    for (const ht of this.hangingTags) {
      ht.group.rotation.z = Math.sin(this.sandClock * 1.4 + ht.phase) * 0.08;
      ht.group.rotation.x = Math.sin(this.sandClock * 1.0 + ht.phase * 0.7) * 0.05;
    }

    // Glowing shelf jars breathe gently with the music
    for (const jg of this.jarGlowSprites) {
      const mat = jg.sprite.material as THREE.SpriteMaterial;
      mat.opacity = jg.baseOp * (0.82 + 0.24 * Math.sin(elapsed * 2.0 + jg.phase) + energy * 0.22);
    }

    // Fridge portal cool glow shimmer
    this.fridgePortalGlow.scale.setScalar(3.3 + Math.sin(elapsed * 2.4) * 0.16);

    // Dynamic lighting shift for Fever (golden warm shelf) vs Valve Pause (crystalline cyan-gold)
    if (isFever) {
      this.lanternLight.color.setHex(0xffe69c);
      this.lanternLight.intensity = 4.2 + beatPulse * 0.9;
      this.fridgeArchLight.color.setHex(0xffd896);
      this.fridgeArchLight.intensity = 2.8;
      this.hemiLight.intensity = 1.05;
    } else if (isValvePaused) {
      this.lanternLight.color.setHex(0xffdf96);
      this.lanternLight.intensity = 3.6 + Math.sin(elapsed * 8) * 0.35;
      this.fridgeArchLight.color.setHex(0x9ee2ff);
      this.fridgeArchLight.intensity = 3.2;
      this.hemiLight.intensity = 0.95;
    } else {
      this.lanternLight.color.setHex(0xffd78e);
      this.lanternLight.intensity = 2.75 + beatPulse * 0.55 + energy * 0.45;
      this.fridgeArchLight.color.setHex(0xbce2ff);
      this.fridgeArchLight.intensity = 2.25 + Math.sin(elapsed * 3.1) * 0.12;
      this.hemiLight.intensity = 0.78;
    }

    // Update drifting frost & time-sand dust motes (slow down during VALVE PAUSE!)
    const posAttr = this.frostPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.frostBase.length; i++) {
      const [bx, by, bz, ph] = this.frostBase[i];
      posAttr.setXYZ(
        i,
        bx + Math.sin(this.sandClock * 0.65 + ph) * 0.22,
        ((by - this.sandClock * 0.18 + 4.4) % 4.4) + 0.3,
        bz + Math.cos(this.sandClock * 0.52 + ph) * 0.18
      );
    }
    posAttr.needsUpdate = true;

    // Update bottled time jars flying in arcs to the left shelf
    for (let i = this.jarArcs.length - 1; i >= 0; i--) {
      const arc = this.jarArcs[i];
      arc.t += dt;
      const u = Math.min(1, arc.t / arc.dur);
      const inv = 1 - u;
      arc.group.position.set(
        inv * inv * arc.start.x + 2 * inv * u * arc.ctrl.x + u * u * arc.end.x,
        inv * inv * arc.start.y + 2 * inv * u * arc.ctrl.y + u * u * arc.end.y,
        inv * inv * arc.start.z + 2 * inv * u * arc.ctrl.z + u * u * arc.end.z
      );
      arc.group.rotation.y += dt * 4.5;
      arc.group.scale.setScalar(1 - u * 0.4);
      if (u >= 1) {
        this.worldGroup.remove(arc.group);
        this.jarArcs.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
