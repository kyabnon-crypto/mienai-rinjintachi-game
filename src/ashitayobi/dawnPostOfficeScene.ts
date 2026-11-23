import * as THREE from 'three';
import { DAWN_WINDOW_SPOTS } from './config';
import { AshitayobiSaveState } from './types';

interface DawnWindowVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  signCanvas: HTMLCanvasElement;
  signTex: THREE.CanvasTexture;
  signBoard: THREE.Mesh;
  bottleMesh: THREE.Group;
  dioramaGroup: THREE.Group;
  windowPaneMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
  accentColor: THREE.Color;
  urgentColor: THREE.Color;
  lastRenderedBucket: number;
  lastRenderedUrgent: boolean;
  lastRenderedDone: boolean;
  pulse: number;
  bottleLiftAmt: number;
}

interface DawnFlightArc {
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

export function create3DSunriseSunGeometry(outerR: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const innerR = outerR * 0.56;
  const rays = 14;
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

function createJarLatheGeo(r: number, h: number, segs = 20): THREE.LatheGeometry {
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
 * 3D East-Gate Dawn Delivery Post Office ("東門の朝焼け配達所 — アシタヨビの部屋").
 * Faithfully fuses the official picture book (`第十三話：朝焼け配達人 〜アシタヨビ〜`,
 * `13.アシタヨビ.png`, `13.アシタヨビ_スライド.png`) and the official 3D room tour (`アシタヨビの部屋.html`):
 *  - Dual Sky Domes (starry night dome + progressive golden-rose dawn dome) with 1,150+ twinkling stars,
 *    fading crescent moon, rising golden morning sun disc, 46 sea-of-clouds sprites shifting from night indigo
 *    to sunrise coral-gold, 70 distant Tokoyo-cho buildings at the foot of the hill, and the stone East Gate ("東門")
 *  - Post office stone & plaster interior with exposed ceiling rafters, grand rear arched window & launch balcony,
 *    sunrise floor light pool ("窓の前の光だまり"), and circular concentric sunrise rug
 *  - Left Wall: 7×17 (119-drawer) Dawn Drawer Cabinet ("朝焼けの引き出し棚") with glowing open drawers,
 *    3 plaques ("勇気の色", "やさしい色", "もっと明るい色") and leaning wooden ladder
 *  - Center: Sorting Table ("仕分け台") with 36 instanced 3-color Dawn Bottles, wax-sealed envelopes & central Dawn Beacon
 *  - Right Wall: Mixing Bench ("調合台") with 16 pigment jars, 6-color glass palette & brush, animated brass
 *    Light-Weighing Balance Scale ("光を量る天秤"), mortar & pestle with pink light powder, and gradient color chart
 *  - Right Rear: Dawn Satchel Hanger ("朝焼け鞄の掛け場") with sun-and-cloud leather satchels & "出発まえ" checklist
 *  - Window Front: Loading Table ("積み込み台") with 18 wax-sealed envelopes, live-updating "今日の届け先" blackboard
 *    & "朝焼けのいろ" color guide board
 *  - 4 interactive 3D Dawn Window Delivery Spots ("窓辺の配達台座"):
 *      0. Hospital Boy's Window ("病院の小さな男の子の窓辺")
 *      1. Tearful Sleeper's Window ("泣きながら眠った人の窓辺")
 *      2. Stumbled Night's Window ("失敗してしまった人の窓辺")
 *      3. Lonely Night's Window ("さみしい夜を過ごした人の窓辺")
 */
export class DawnPostOfficeScene {
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
  private moonDirLight: THREE.DirectionalLight;
  private centerLanternLight: THREE.PointLight;
  private leftDrawerLight: THREE.PointLight;
  private rightMixingLight: THREE.PointLight;
  private archWindowLight: THREE.PointLight;

  // Sky & dynamic Night -> Dawn transition elements
  private dawnDomeMat!: THREE.MeshBasicMaterial;
  private skyStarsA!: THREE.PointsMaterial;
  private skyStarsB!: THREE.PointsMaterial;
  private moonMesh!: THREE.Mesh;
  private moonGlow!: THREE.Sprite;
  private sunDisc!: THREE.Mesh;
  private sunGlow!: THREE.Sprite;
  private cloudSprites: { mat: THREE.SpriteMaterial; tintRatio: number }[] = [];
  private townBodyMat!: THREE.MeshBasicMaterial;
  private townWindowMat!: THREE.MeshBasicMaterial;
  private windowPoolMat!: THREE.MeshBasicMaterial;

  // Animated indoor props
  private coreMaterials: THREE.MeshStandardMaterial[] = [];
  private ceilingLanterns: THREE.Group[] = [];
  private roofFlag!: THREE.Mesh;
  private balanceBeam!: THREE.Mesh;
  private balancePanL!: THREE.Mesh;
  private balancePanR!: THREE.Mesh;
  private balanceOrbL!: THREE.Mesh;
  private centerBeaconSun!: THREE.Mesh;
  private glowSprites: { sprite: THREE.Sprite; baseScale: number; phase: number }[] = [];
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];
  private outdoorFireflies!: THREE.Points;
  private outdoorBase: [number, number, number, number][] = [];
  private flightArcs: DawnFlightArc[] = [];

  // Live Delivery Blackboard ("今日の届け先") texture
  private ledgerCanvas!: HTMLCanvasElement;
  private ledgerTex!: THREE.CanvasTexture;
  private lastLedgerKey = '';

  // Upgrade-responsive 3D prop groups
  private sortingExtraGroup = new THREE.Group();
  private archExtraGroup = new THREE.Group();
  private satchelExtraGroup = new THREE.Group();
  private drawersExtraGroup = new THREE.Group();
  private mixingExtraGroup = new THREE.Group();
  private ledgerExtraGroup = new THREE.Group();

  // Interactive 4 Dawn Window Delivery Spots
  private windowVisuals: DawnWindowVisual[] = [];

  // Shared materials for soaring dawn delivery arcs
  private arcSunGeo: THREE.ExtrudeGeometry;
  private arcSunMat: THREE.MeshStandardMaterial;

  private dawnFlashTimer = 0;
  private simClock = 0;

  // Reusable materials
  private stoneMat!: THREE.MeshStandardMaterial;
  private wallInMat!: THREE.MeshStandardMaterial;
  private woodDarkMat!: THREE.MeshStandardMaterial;
  private woodLightMat!: THREE.MeshStandardMaterial;
  private floorMat!: THREE.MeshStandardMaterial;
  private ironMat!: THREE.MeshStandardMaterial;
  private goldMat!: THREE.MeshStandardMaterial;
  private leatherMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshStandardMaterial;
  private corkMat!: THREE.MeshStandardMaterial;
  private envelopeMat!: THREE.MeshStandardMaterial;

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
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b1c);
    this.scene.fog = new THREE.FogExp2(0x0a1226, 0.0135);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 240);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.arcSunGeo = create3DSunriseSunGeometry(0.15);
    this.arcSunMat = new THREE.MeshStandardMaterial({
      color: 0xfff0b8,
      emissive: 0xff9a3c,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    });

    this.scene.add(this.worldGroup);

    // Dawn Post Office lighting
    this.hemiLight = new THREE.HemisphereLight(0x889ad0, 0x3e2c3a, 0.72);
    this.scene.add(this.hemiLight);

    this.moonDirLight = new THREE.DirectionalLight(0xa8c0f8, 0.75);
    this.moonDirLight.position.set(-6.0, 14.5, 7.5);
    this.moonDirLight.castShadow = true;
    this.moonDirLight.shadow.mapSize.set(1024, 1024);
    this.moonDirLight.shadow.camera.near = 1;
    this.moonDirLight.shadow.camera.far = 38;
    const d = 10.5;
    this.moonDirLight.shadow.camera.left = -d;
    this.moonDirLight.shadow.camera.right = d;
    this.moonDirLight.shadow.camera.top = d;
    this.moonDirLight.shadow.camera.bottom = -d;
    this.moonDirLight.shadow.bias = -0.0005;
    this.scene.add(this.moonDirLight);

    this.centerLanternLight = new THREE.PointLight(0xffcf96, 2.35, 12.5, 1.3);
    this.centerLanternLight.position.set(0, 2.85, -0.35);
    this.scene.add(this.centerLanternLight);

    this.leftDrawerLight = new THREE.PointLight(0xffa8b8, 1.25, 9.5, 1.35);
    this.leftDrawerLight.position.set(-4.1, 2.5, -1.2);
    this.scene.add(this.leftDrawerLight);

    this.rightMixingLight = new THREE.PointLight(0xffd68a, 1.28, 9.5, 1.35);
    this.rightMixingLight.position.set(4.1, 2.5, -1.2);
    this.scene.add(this.rightMixingLight);

    this.archWindowLight = new THREE.PointLight(0x7898ff, 1.35, 12.5, 1.3);
    this.archWindowLight.position.set(0, 2.4, -4.6);
    this.scene.add(this.archWindowLight);

    this.buildSharedMaterials();
    this.buildDualSkyHorizonAndEastGate();
    this.buildPostOfficeShellAndBalcony();
    this.buildLeftDawnDrawerWallAndLadder();
    this.buildCentralSortingTableAndRug();
    this.buildRightMixingBenchAndScale();
    this.buildSatchelHangerAndLoadingTable();
    this.buildCeilingLanternsAndMotes();
    this.buildFourDawnWindowSpots();

    this.worldGroup.add(
      this.sortingExtraGroup,
      this.archExtraGroup,
      this.satchelExtraGroup,
      this.drawersExtraGroup,
      this.mixingExtraGroup,
      this.ledgerExtraGroup
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
      g.fillStyle = 'rgba(10,5,3,0.52)';
      g.fillRect(0, y0, 256, 2.2);
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
    for (let i = 0; i < 1400; i++) {
      g.fillStyle =
        rnd() < 0.5
          ? `rgba(255,255,255,${rnd() * 0.06})`
          : `rgba(15,10,20,${rnd() * 0.08})`;
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
    this.stoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createPlasterTexture('#3b4868', 31),
      roughness: 0.9,
    });
    this.wallInMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createPlasterTexture('#8e7460', 43),
      roughness: 0.94,
    });
    this.woodDarkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createWoodTexture(24, 20, 17),
      roughness: 0.76,
    });
    this.woodLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createWoodTexture(30, 30, 29),
      roughness: 0.7,
    });
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createWoodTexture(26, 22, 53),
      roughness: 0.64,
    });
    this.ironMat = new THREE.MeshStandardMaterial({
      color: 0x1d222e,
      roughness: 0.48,
      metalness: 0.62,
    });
    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xe2b850,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.leatherMat = new THREE.MeshStandardMaterial({
      color: 0x865636,
      roughness: 0.72,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xdfeef2,
      transparent: true,
      opacity: 0.28,
      roughness: 0.06,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.corkMat = new THREE.MeshStandardMaterial({
      color: 0xb88a55,
      roughness: 0.92,
    });
    this.envelopeMat = new THREE.MeshStandardMaterial({
      color: 0xf1e6cc,
      roughness: 0.85,
    });

    // Three signature dawn colors from the story & room tour: Courage Orange, Gentle Rose, Bright Smile Gold
    const coreColors = [0xff8a3a, 0xff6f9f, 0xffc040];
    this.coreMaterials = coreColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: 0x302030,
          emissive: c,
          emissiveIntensity: 0.86,
          roughness: 0.44,
        })
    );
  }

  private createGradientTexture(stops: [number, string][]): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach((s) => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 256);
    return new THREE.CanvasTexture(c);
  }

  private buildDualSkyHorizonAndEastGate(): void {
    const rnd = createSeededRandom(1301);

    // Night Sky Dome (outer)
    const nightDome = new THREE.Mesh(
      new THREE.SphereGeometry(155, 32, 20),
      new THREE.MeshBasicMaterial({
        map: this.createGradientTexture([
          [0, '#050818'],
          [0.35, '#0a1230'],
          [0.46, '#1a2858'],
          [0.5, '#2c3c74'],
          [0.54, '#101836'],
          [1, '#04060f'],
        ]),
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    );
    nightDome.renderOrder = -2;
    this.scene.add(nightDome);

    // Progressive Dawn Sky Dome (inner, fades in as morning approaches!)
    this.dawnDomeMat = new THREE.MeshBasicMaterial({
      map: this.createGradientTexture([
        [0, '#1c2c64'],
        [0.25, '#4a4a8c'],
        [0.38, '#9a5c98'],
        [0.45, '#e88a78'],
        [0.49, '#ffb070'],
        [0.51, '#ffd890'],
        [0.54, '#c87a6a'],
        [0.62, '#503a5a'],
        [1, '#1a1a30'],
      ]),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.18,
    });
    const dawnDome = new THREE.Mesh(new THREE.SphereGeometry(152, 32, 20), this.dawnDomeMat);
    dawnDome.renderOrder = -1;
    this.scene.add(dawnDome);

    // 1,150+ twinkling stars
    const makeStars = (count: number, size: number, op: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const y = 0.06 + rnd() * 0.92;
        const r = Math.sqrt(1 - y * y);
        const R0 = 120;
        pos[i * 3] = Math.cos(a) * r * R0;
        pos[i * 3 + 1] = y * R0 - 2;
        pos[i * 3 + 2] = Math.sin(a) * r * R0 - 12;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xfff2d6,
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
    this.skyStarsA = makeStars(1000, 1.8, 0.85);
    this.skyStarsB = makeStars(150, 3.4, 0.95);

    // Moon (fades softly as sunrise brightens)
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff1cf, fog: false, transparent: true, opacity: 0.9 })
    );
    this.moonMesh.position.set(-28, 22, -72);
    this.scene.add(this.moonMesh);

    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xbcd0ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonGlow.scale.set(22, 22, 1);
    this.moonGlow.position.set(-28, 22, -73);
    this.scene.add(this.moonGlow);

    // Rising Morning Sun Disc beyond the grand arched window
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c0,
        fog: false,
        transparent: true,
        opacity: 0.35,
      })
    );
    this.sunDisc.position.set(0, -4, -95);
    this.scene.add(this.sunDisc);

    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xff9a50,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.sunGlow.scale.set(78, 78, 1);
    this.sunGlow.position.set(0, -4, -93);
    this.scene.add(this.sunGlow);

    // Sea of Clouds ("雲海") shifting from night indigo to coral-gold dawn
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256;
    cloudCanvas.height = 128;
    const cg = cloudCanvas.getContext('2d')!;
    cg.fillStyle = '#000';
    cg.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 9; i++) {
      const x = 38 + i * 22 + rnd() * 10;
      const y = 74 + (rnd() - 0.5) * 14;
      const r = 26 + rnd() * 22;
      const gr = cg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.86)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.36)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = gr;
      cg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);

    for (let i = 0; i < 42; i++) {
      const x = (rnd() * 2 - 1) * 85;
      const z = -(32 + rnd() * 62);
      const y = -8 + rnd() * 11;
      const s = 32 + rnd() * 44;
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        alphaMap: cloudTex,
        color: 0x263268,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(s, s * 0.4, 1);
      sp.position.set(x, y, z);
      this.scene.add(sp);
      this.cloudSprites.push({ mat, tintRatio: rnd() });
    }

    // Distant sleeping Tokoyo-cho town silhouettes & warm window lights below the balcony
    this.townBodyMat = new THREE.MeshBasicMaterial({ color: 0x0d152c, fog: false });
    this.townWindowMat = new THREE.MeshBasicMaterial({
      color: 0xffcf90,
      fog: false,
      transparent: true,
      opacity: 0.85,
    });

    const bodies: [number, number, number, number, number, number][] = [];
    const roofs: [number, number, number, number, number, number][] = [];
    const wins: [number, number, number, number, number, number][] = [];

    for (let i = 0; i < 68; i++) {
      const x = (rnd() * 2 - 1) * 65;
      const z = -26 - rnd() * 45;
      const w = 2.6 + rnd() * 3.8;
      const top = -6.5 + rnd() * 5.2;
      const h = top + 18;
      const d = 3.2 + rnd() * 2.5;
      bodies.push([x, top - h / 2, z, w, h, d]);
      roofs.push([x, top + 0.9, z, w * 1.1, 1.8, d * 1.1]);
      for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
        if (rnd() < 0.82) {
          wins.push([
            x + (rnd() - 0.5) * w * 0.6,
            top - 1.0 - rnd() * 2.2,
            z + d / 2 + 0.05,
            0.42,
            0.55,
            1,
          ]);
        }
      }
    }

    const inst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      arr: [number, number, number, number, number, number][]
    ) => {
      const m = new THREE.InstancedMesh(geo, mat, arr.length);
      const mat4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      arr.forEach((a, idx) => {
        mat4.compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(a[3], a[4], a[5]));
        m.setMatrixAt(idx, mat4);
      });
      m.frustumCulled = false;
      this.scene.add(m);
    };

    inst(new THREE.BoxGeometry(1, 1, 1), this.townBodyMat, bodies);
    const roofGeo = new THREE.CylinderGeometry(0, 0.72, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    inst(roofGeo, this.townBodyMat, roofs);
    inst(new THREE.PlaneGeometry(1, 1), this.townWindowMat, wins);

    // Distant East Gate ("東門") stone archway silhouette on the eastern ridge
    const gateGroup = new THREE.Group();
    gateGroup.position.set(-14.5, -1.2, -22.0);
    gateGroup.rotation.y = 0.28;
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.2, 1.2), this.stoneMat);
    pillarL.position.set(-2.6, 3.1, 0);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.2, 1.2), this.stoneMat);
    pillarR.position.set(2.6, 3.1, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.1, 1.5), this.stoneMat);
    lintel.position.set(0, 6.4, 0);

    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 256;
    plaqueCanvas.height = 96;
    const pg = plaqueCanvas.getContext('2d')!;
    pg.fillStyle = '#232b40';
    pg.fillRect(0, 0, 256, 96);
    pg.strokeStyle = '#e8c070';
    pg.lineWidth = 6;
    pg.strokeRect(6, 6, 244, 84);
    pg.fillStyle = '#ffd890';
    pg.font = '700 58px "Zen Maru Gothic", sans-serif';
    pg.textAlign = 'center';
    pg.textBaseline = 'middle';
    pg.fillText('東門', 128, 50);
    const gatePlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.75),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(plaqueCanvas) })
    );
    gatePlaque.position.set(0, 6.4, 0.78);
    gateGroup.add(pillarL, pillarR, lintel, gatePlaque);
    this.addGlow(0xffb070, 3.2, -2.6, 4.2, 0.7, 0.65, gateGroup);
    this.addGlow(0xffb070, 3.2, 2.6, 4.2, 0.7, 0.65, gateGroup);
    this.worldGroup.add(gateGroup);
  }

  private buildPostOfficeShellAndBalcony(): void {
    // Warm wooden plank floor of the Dawn Post Office
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 9.6), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.4);
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    // Stone & plaster side walls (left & right)
    [-1, 1].forEach((s) => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.8, 9.6), this.wallInMat);
      sideWall.position.set(s * 5.8, 2.4, -0.4);
      sideWall.receiveShadow = true;
      this.worldGroup.add(sideWall);

      const wainscot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.1, 9.6), this.woodDarkMat);
      wainscot.position.set(s * 5.76, 0.55, -0.4);
      this.worldGroup.add(wainscot);
    });

    // Rear wall with grand sunrise arched window opening
    const backShape = new THREE.Shape();
    backShape.moveTo(-5.8, -0.2);
    backShape.lineTo(5.8, -0.2);
    backShape.lineTo(5.8, 5.2);
    backShape.lineTo(0, 6.2);
    backShape.lineTo(-5.8, 5.2);
    backShape.lineTo(-5.8, -0.2);

    const archHole = new THREE.Path();
    archHole.moveTo(-1.85, 0.72);
    archHole.lineTo(1.85, 0.72);
    archHole.lineTo(1.85, 2.25);
    archHole.absarc(0, 2.25, 1.85, 0, Math.PI, false);
    archHole.lineTo(-1.85, 0.72);
    backShape.holes.push(archHole);

    const backWall = new THREE.Mesh(
      new THREE.ExtrudeGeometry(backShape, { depth: 0.32, bevelEnabled: false, curveSegments: 32 }),
      [this.wallInMat, this.stoneMat]
    );
    backWall.position.z = -5.2;
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    // Overhead wooden ceiling rafters ("天井の梁")
    [-4.6, -2.6, -0.6, 1.4, 3.4].forEach((z) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 0.24), this.woodDarkMat);
      beam.position.set(0, 4.65, z);
      this.worldGroup.add(beam);
    });

    // Grand Arched Window iron muntins & wooden sill
    const mullionC = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 0.06), this.ironMat);
    mullionC.position.set(0, 2.38, -5.04);
    this.worldGroup.add(mullionC);
    [-0.92, 0.92].forEach((x) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.0, 0.06), this.ironMat);
      m.position.set(x, 2.22, -5.04);
      this.worldGroup.add(m);
    });
    const transA = new THREE.Mesh(new THREE.BoxGeometry(3.68, 0.06, 0.06), this.ironMat);
    transA.position.set(0, 2.25, -5.04);
    const transB = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.06, 0.06), this.ironMat);
    transB.position.set(0, 3.15, -5.04);
    const archRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.065, 10, 36, Math.PI),
      this.ironMat
    );
    archRim.position.set(0, 2.25, -5.02);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 0.52), this.woodLightMat);
    sill.position.set(0, 0.72, -4.98);
    this.worldGroup.add(transA, transB, archRim, sill);

    // Overhead "朝焼け配達所" Signboard & Sunrise Crest above the arch window
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 110;
    const sg = signCanvas.getContext('2d')!;
    sg.fillStyle = '#362428';
    sg.fillRect(0, 0, 512, 110);
    sg.strokeStyle = '#e8b060';
    sg.lineWidth = 6;
    sg.strokeRect(8, 8, 496, 94);
    sg.fillStyle = '#ffd8a0';
    sg.font = '700 58px "Zen Maru Gothic", sans-serif';
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.fillText('朝焼け配達所', 256, 57);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.56),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(signCanvas),
        roughness: 0.75,
        emissive: 0x3a2216,
        emissiveIntensity: 0.55,
      })
    );
    signBoard.position.set(0, 4.42, -4.85);
    this.worldGroup.add(signBoard);

    // Sunrise emblem above signboard
    const crestCanvas = document.createElement('canvas');
    crestCanvas.width = 240;
    crestCanvas.height = 150;
    const cg = crestCanvas.getContext('2d')!;
    const cx = 120;
    const cy = 132;
    for (let i = 0; i < 13; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      cg.strokeStyle = '#ffc060';
      cg.lineWidth = 7;
      cg.beginPath();
      cg.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
      cg.lineTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90);
      cg.stroke();
    }
    cg.fillStyle = '#ff9a50';
    cg.beginPath();
    cg.arc(cx, cy, 50, Math.PI, 0);
    cg.fill();
    cg.fillStyle = '#ffd25a';
    cg.beginPath();
    cg.arc(cx, cy, 30, Math.PI, 0);
    cg.fill();
    const crestMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.82),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(crestCanvas),
        transparent: true,
      })
    );
    crestMesh.position.set(0, 5.15, -4.85);
    this.worldGroup.add(crestMesh);

    // Exterior Launch Balcony ("窓の外の発着台") & fluttering Sunrise Flag
    const balSlab = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.16, 2.5), this.stoneMat);
    balSlab.position.set(0, 0.63, -6.5);
    this.worldGroup.add(balSlab);

    [
      [-2.25, -7.6],
      [2.25, -7.6],
      [-2.25, -5.4],
      [2.25, -5.4],
    ].forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), this.ironMat);
      post.position.set(x, 1.22, z);
      this.worldGroup.add(post);
    });
    const railBack = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 0.06), this.ironMat);
    railBack.position.set(0, 1.72, -7.6);
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.3), this.ironMat);
    railL.position.set(-2.25, 1.72, -6.5);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.3), this.ironMat);
    railR.position.set(2.25, 1.72, -6.5);
    this.worldGroup.add(railBack, railL, railR);

    // Balcony beacon lantern & sunrise flag
    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 1.85, 8),
      this.ironMat
    );
    flagPole.position.set(2.25, 2.6, -7.5);
    this.worldGroup.add(flagPole);

    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 180;
    flagCanvas.height = 100;
    const fg = flagCanvas.getContext('2d')!;
    fg.fillStyle = '#ff9a50';
    fg.fillRect(0, 0, 180, 100);
    fg.fillStyle = '#ffd25a';
    fg.beginPath();
    fg.arc(65, 62, 30, Math.PI, 0);
    fg.fill();
    fg.fillStyle = '#ff7a60';
    fg.fillRect(0, 62, 180, 38);
    this.roofFlag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.52),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(flagCanvas),
        side: THREE.DoubleSide,
        roughness: 0.75,
        emissive: 0x402010,
        emissiveIntensity: 0.5,
      })
    );
    this.roofFlag.position.set(2.74, 3.22, -7.5);
    this.worldGroup.add(this.roofFlag);
    this.addGlow(0xffb070, 2.2, -2.25, 1.9, -7.5, 0.65);

    // Sunrise light pool on the floor in front of the arched window ("窓の前の光だまり")
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = 256;
    poolCanvas.height = 256;
    const plg = poolCanvas.getContext('2d')!;
    const pr = plg.createRadialGradient(128, 128, 0, 128, 128, 128);
    pr.addColorStop(0, 'rgba(255,155,80,0.92)');
    pr.addColorStop(0.5, 'rgba(255,130,70,0.38)');
    pr.addColorStop(1, 'rgba(255,120,60,0)');
    plg.fillStyle = pr;
    plg.fillRect(0, 0, 256, 256);
    this.windowPoolMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(poolCanvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.25,
    });
    const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.2), this.windowPoolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(0, 0.018, -2.8);
    this.worldGroup.add(poolMesh);
  }

  private buildLeftDawnDrawerWallAndLadder(): void {
    // Left Wall: Towering 7x17 Dawn Drawer Cabinet ("朝焼けの引き出し棚")
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.56, 3.45, 8.2), this.woodDarkMat);
    cab.position.set(-5.36, 1.72, -0.5);
    cab.castShadow = true;
    cab.receiveShadow = true;
    this.worldGroup.add(cab);

    const openDrawers: Record<string, number> = {
      '3,3': 0,
      '5,8': 1,
      '2,10': 1,
      '4,14': 2,
    };

    const fronts: [number, number, number, number, number, number][] = [];
    const tags: [number, number, number, number, number, number][][] = [[], [], []];
    const knobs: [number, number, number, number, number, number][] = [];

    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 16; j++) {
        const y = 0.38 + i * 0.38;
        const z = 3.1 - j * 0.48;
        const k = j < 5 ? 0 : j < 11 ? 1 : 2;
        const key = `${i},${j}`;
        if (openDrawers[key] !== undefined) {
          // Pulled-out glowing dawn drawer!
          const df = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.33, 0.44), this.woodLightMat);
          df.position.set(-4.75, y, z);
          const dt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.16), this.coreMaterials[k]);
          dt.position.set(-4.71, y + 0.08, z);
          const dk = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), this.goldMat);
          dk.position.set(-4.69, y - 0.04, z);
          const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.4), this.woodDarkMat);
          tray.position.set(-4.94, y - 0.08, z);
          const glowCore = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.08, 0.34),
            this.coreMaterials[k]
          );
          glowCore.position.set(-4.92, y - 0.03, z);
          this.worldGroup.add(df, dt, dk, tray, glowCore);
          const glowCols = [0xff8a3a, 0xff6f9f, 0xffc040];
          this.addGlow(glowCols[k], 1.35, -4.85, y + 0.08, z, 0.42);
          continue;
        }
        fronts.push([-5.05, y, z, 0.07, 0.33, 0.44]);
        tags[k].push([-5.01, y + 0.08, z, 0.02, 0.06, 0.16]);
        knobs.push([-4.99, y - 0.04, z, 0.05, 0.05, 0.05]);
      }
    }

    const addInst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      arr: [number, number, number, number, number, number][]
    ) => {
      const m = new THREE.InstancedMesh(geo, mat, arr.length);
      const mat4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      arr.forEach((a, idx) => {
        mat4.compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(a[3], a[4], a[5]));
        m.setMatrixAt(idx, mat4);
      });
      this.worldGroup.add(m);
    };

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    addInst(boxGeo, this.woodLightMat, fronts);
    tags.forEach((list, k) => addInst(boxGeo, this.coreMaterials[k], list));
    addInst(new THREE.SphereGeometry(0.5, 8, 6), this.goldMat, knobs);

    // 3 Section Plaques ("勇気の色", "やさしい色", "もっと明るい色")
    const makePlaque = (txt: string, z: number, col: string) => {
      const c = document.createElement('canvas');
      c.width = 420;
      c.height = 88;
      const g = c.getContext('2d')!;
      g.fillStyle = '#2e2230';
      g.fillRect(0, 0, 420, 88);
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.strokeRect(6, 6, 408, 76);
      g.fillStyle = col;
      g.font = '700 46px "Zen Maru Gothic", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, 210, 46);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.95, 0.4),
        new THREE.MeshStandardMaterial({
          map: new THREE.CanvasTexture(c),
          roughness: 0.8,
          emissive: 0x302018,
          emissiveIntensity: 0.5,
        })
      );
      m.position.set(-5.06, 3.22, z);
      m.rotation.y = Math.PI / 2;
      this.worldGroup.add(m);
    };
    makePlaque('勇気の色', 2.0, '#ffb060');
    makePlaque('やさしい色', -0.5, '#ffa0c0');
    makePlaque('もっと明るい色', -3.0, '#ffe070');

    // Leaning wooden ladder against the drawer cabinet
    const ladderGroup = new THREE.Group();
    ladderGroup.position.set(-4.65, 0, -1.35);
    [-0.24, 0.24].forEach((dz) => {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 3.0, 8),
        this.woodLightMat
      );
      rail.position.set(0, 1.45, dz);
      rail.rotation.z = 0.22;
      ladderGroup.add(rail);
    });
    for (let k = 0; k < 8; k++) {
      const u = (k + 0.6) / 8.5;
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.48), this.woodLightMat);
      rung.position.set(0.32 - u * 0.64, u * 2.85, 0);
      ladderGroup.add(rung);
    }
    this.worldGroup.add(ladderGroup);
  }

  private buildCentralSortingTableAndRug(): void {
    const rnd = createSeededRandom(77);

    // Circular concentric Sunrise Rug ("日の出模様の丸ラグ")
    const rugCanvas = document.createElement('canvas');
    rugCanvas.width = 512;
    rugCanvas.height = 512;
    const rg = rugCanvas.getContext('2d')!;
    rg.fillStyle = '#2a2e58';
    rg.fillRect(0, 0, 512, 512);
    const rings: [string, number][] = [
      ['#2a2e58', 254],
      ['#d9805a', 236],
      ['#2a2e58', 212],
      ['#f0c8a0', 196],
      ['#c06a8a', 170],
      ['#ffd890', 130],
      ['#e0805a', 94],
      ['#2a2e58', 54],
    ];
    rings.forEach(([col, rad]) => {
      rg.fillStyle = col;
      rg.beginPath();
      rg.arc(256, 256, rad, 0, Math.PI * 2);
      rg.fill();
    });
    for (let i = 0; i < 3200; i++) {
      rg.fillStyle =
        rnd() < 0.5
          ? `rgba(255,255,255,${rnd() * 0.06})`
          : `rgba(0,0,0,${rnd() * 0.06})`;
      rg.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 48),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(rugCanvas),
        roughness: 0.92,
      })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.014, -0.35);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // Central Sorting Table & Dawn Beacon Pedestal at (0, -0.35)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(0, 0, -0.35);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.55), this.woodLightMat);
    top.position.y = 0.86;
    top.castShadow = true;
    top.receiveShadow = true;
    tableGroup.add(top);

    [
      [-0.62, -0.66],
      [0.62, -0.66],
      [-0.62, 0.66],
      [0.62, 0.66],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.84, 0.09), this.woodDarkMat);
      leg.position.set(lx, 0.42, lz);
      tableGroup.add(leg);
    });

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 1.35), this.woodDarkMat);
    shelf.position.y = 0.28;
    tableGroup.add(shelf);

    // 3 rows of glowing miniature Dawn Bottles on the central sorting table
    [-0.42, 0, 0.42].forEach((rx, rIdx) => {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 1.2), this.woodDarkMat);
      tray.position.set(rx, 0.91, 0);
      tableGroup.add(tray);

      for (let n = 0; n < 5; n++) {
        if (rIdx === 1 && n === 2) continue; // leave center for master beacon sun
        const bz = -0.46 + n * 0.23;
        const jarBody = new THREE.Mesh(createJarLatheGeo(0.055, 0.2, 14), this.glassMat);
        jarBody.position.set(rx, 0.92, bz);
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.042, 0.12, 10),
          this.coreMaterials[(rIdx + (n % 2)) % 3]
        );
        core.position.set(rx, 0.99, bz);
        const cork = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.024, 0.036, 8),
          this.corkMat
        );
        cork.position.set(rx, 1.13, bz);
        tableGroup.add(jarBody, core, cork);
      }
    });

    // Central Master Sunrise Beacon Orb floating above the sorting table
    const pedestalBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.14, 18),
      this.goldMat
    );
    pedestalBase.position.set(0, 0.96, 0);
    tableGroup.add(pedestalBase);

    this.centerBeaconSun = new THREE.Mesh(
      create3DSunriseSunGeometry(0.19),
      new THREE.MeshStandardMaterial({
        color: 0xfff2c0,
        emissive: 0xff9a3a,
        emissiveIntensity: 1.5,
        roughness: 0.24,
      })
    );
    this.centerBeaconSun.position.set(0, 1.24, 0);
    tableGroup.add(this.centerBeaconSun);
    this.addGlow(0xffb868, 1.85, 0, 1.24, 0, 0.65, tableGroup);

    this.worldGroup.add(tableGroup);
  }

  private buildRightMixingBenchAndScale(): void {
    // Right Wall: Dawn Mixing Bench ("調合台")
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 3.8), this.woodLightMat);
    bench.position.set(5.1, 0.92, 0.2);
    bench.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.86, 3.65), this.woodDarkMat);
    base.position.set(5.15, 0.43, 0.2);
    const upperShelf = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 3.7), this.woodDarkMat);
    upperShelf.position.set(5.46, 1.85, 0.2);
    this.worldGroup.add(bench, base, upperShelf);

    const pigCols = [0xff9a50, 0xff8fb4, 0xffd25a, 0xff7a6a, 0xb890e0, 0x6a8cff, 0xffe8b0];
    pigCols.forEach((col, i) => {
      const z = 1.75 - i * 0.52;
      const g = new THREE.Group();
      g.position.set(5.36, 0.96, z);
      const j = new THREE.Mesh(createJarLatheGeo(0.075, 0.22, 14), this.glassMat);
      const liq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.15, 12),
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.62,
          roughness: 0.3,
        })
      );
      liq.position.y = 0.08;
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.04, 10), this.corkMat);
      ck.position.y = 0.23;
      g.add(j, liq, ck);
      this.worldGroup.add(g);
    });

    // 6-color Glass Palette & Mixing Brush
    const palette = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.02, 24),
      new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.3 })
    );
    palette.position.set(4.85, 0.97, 0.85);
    this.worldGroup.add(palette);
    [0xff9a50, 0xff8fb4, 0xffd25a, 0xff7a6a, 0xb890e0, 0x6a8cff].forEach((c, i) => {
      const a = (i / 6) * Math.PI * 2;
      const dab = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.85 })
      );
      dab.scale.y = 0.45;
      dab.position.set(4.85 + Math.cos(a) * 0.19, 0.99, 0.85 + Math.sin(a) * 0.19);
      this.worldGroup.add(dab);
    });

    // Brass Light-Weighing Balance Scale ("光を量る天秤")
    const scaleGroup = new THREE.Group();
    scaleGroup.position.set(4.92, 0.96, -0.15);
    const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 14), this.goldMat);
    sBase.position.y = 0.015;
    const sPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), this.goldMat);
    sPillar.position.y = 0.27;
    this.balanceBeam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.68), this.goldMat);
    this.balanceBeam.position.y = 0.52;
    this.balancePanL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14),
      this.goldMat
    );
    this.balancePanL.position.set(0, 0.3, -0.34);
    this.balancePanR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14),
      this.goldMat
    );
    this.balancePanR.position.set(0, 0.3, 0.34);
    this.balanceOrbL = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 12, 10),
      this.coreMaterials[2]
    );
    this.balanceOrbL.position.set(0, 0.35, -0.34);
    const weightR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), this.goldMat);
    weightR.position.set(0, 0.34, 0.34);
    scaleGroup.add(
      sBase,
      sPillar,
      this.balanceBeam,
      this.balancePanL,
      this.balancePanR,
      this.balanceOrbL,
      weightR
    );
    this.addGlow(0xffd25a, 0.65, 0, 0.36, -0.34, 0.55, scaleGroup);
    this.worldGroup.add(scaleGroup);

    // Mortar & pestle with pink light powder ("すり鉢と光の粉")
    const mortar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.08, 0.11, 16),
      new THREE.MeshStandardMaterial({ color: 0x6a6a7a, roughness: 0.6 })
    );
    mortar.position.set(4.85, 1.01, -0.95);
    const powder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14),
      this.coreMaterials[1]
    );
    powder.position.set(4.85, 1.07, -0.95);
    this.worldGroup.add(mortar, powder);
    this.addGlow(0xff8fb4, 0.7, 4.85, 1.12, -0.95, 0.45);

    // Wall Sky Gradient Swatch Chart ("よあけまえ → 朝焼け → 朝")
    const swCanvas = document.createElement('canvas');
    swCanvas.width = 600;
    swCanvas.height = 160;
    const swg = swCanvas.getContext('2d')!;
    const gr = swg.createLinearGradient(0, 0, 600, 0);
    [
      [0, '#1c2c64'],
      [0.25, '#5a4a8c'],
      [0.5, '#c86a8a'],
      [0.75, '#ff9a60'],
      [1, '#ffd890'],
    ].forEach(([p, col]) => gr.addColorStop(p as number, col as string));
    swg.fillStyle = '#2e2230';
    swg.fillRect(0, 0, 600, 160);
    swg.fillStyle = gr;
    swg.fillRect(14, 14, 572, 96);
    swg.fillStyle = '#ffe8c8';
    swg.font = '700 28px "Zen Maru Gothic", sans-serif';
    swg.textAlign = 'center';
    swg.textBaseline = 'middle';
    swg.fillText('よあけまえ', 90, 134);
    swg.fillText('朝焼け', 300, 134);
    swg.fillText('朝', 520, 134);
    const swatchMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.85, 0.76),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(swCanvas),
        roughness: 0.8,
        emissive: 0x302018,
        emissiveIntensity: 0.48,
      })
    );
    swatchMesh.position.set(5.63, 2.75, 0.2);
    swatchMesh.rotation.y = -Math.PI / 2;
    this.worldGroup.add(swatchMesh);
  }

  private buildSatchelHangerAndLoadingTable(): void {
    // Right Rear: Dawn Satchel Hanger ("朝焼け鞄の掛け場")
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 1.7), this.woodDarkMat);
    rack.position.set(5.6, 1.6, -3.1);
    this.worldGroup.add(rack);
    [-0.55, 0, 0.55].forEach((oz) => {
      const hook = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8),
        this.goldMat
      );
      hook.rotation.z = Math.PI / 2;
      hook.position.set(5.52, 1.66, -3.1 + oz);
      this.worldGroup.add(hook);
    });

    // Hanging Leather Dawn Satchel with glowing sun-and-cloud crest
    const bagGroup = new THREE.Group();
    bagGroup.position.set(5.42, 1.18, -3.1);
    const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.56), this.leatherMat);
    const bagFlap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.58), this.leatherMat);
    bagFlap.position.y = 0.22;
    const sunBadge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16),
      this.goldMat
    );
    sunBadge.rotation.z = Math.PI / 2;
    sunBadge.position.set(-0.12, 0.02, 0);
    const dawnGlowInBag = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12),
      this.coreMaterials[0]
    );
    dawnGlowInBag.position.y = 0.27;
    bagGroup.add(bagBody, bagFlap, sunBadge, dawnGlowInBag);
    this.addGlow(0xffa860, 1.25, -0.05, 0.28, 0, 0.55, bagGroup);
    this.worldGroup.add(bagGroup);

    // Window Front: Loading Table ("窓の前：積み込み台") with 18 wax-sealed envelopes
    const loadTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.72), this.woodLightMat);
    loadTop.position.set(0, 0.78, -4.25);
    const loadShelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.62), this.woodDarkMat);
    loadShelf.position.set(0, 0.26, -4.25);
    this.worldGroup.add(loadTop, loadShelf);
    [
      [-1.3, -3.95],
      [1.3, -3.95],
      [-1.3, -4.55],
      [1.3, -4.55],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 0.08), this.woodDarkMat);
      leg.position.set(lx, 0.38, lz);
      this.worldGroup.add(leg);
    });

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        const ex = -1.0 + c * 0.4;
        const ez = -4.05 - r * 0.2;
        const env = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.14), this.envelopeMat);
        env.position.set(ex, 0.825, ez);
        const seal = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, 8, 6),
          this.coreMaterials[(r + c) % 3]
        );
        seal.scale.y = 0.45;
        seal.position.set(ex, 0.838, ez);
        this.worldGroup.add(env, seal);
      }
    }

    // Left Rear Wall Board: "朝焼けのいろ" (勇気・やさしさ・笑顔)
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 320;
    colorCanvas.height = 230;
    const ccg = colorCanvas.getContext('2d')!;
    ccg.fillStyle = '#e8dcc0';
    ccg.fillRect(0, 0, 320, 230);
    ccg.strokeStyle = '#8a6a3a';
    ccg.lineWidth = 6;
    ccg.strokeRect(5, 5, 310, 220);
    ccg.fillStyle = '#4a3a30';
    ccg.font = '700 26px "Zen Maru Gothic", sans-serif';
    ccg.textBaseline = 'middle';
    ccg.fillText('朝焼けの いろ', 24, 34);
    [
      ['#ff9a50', '勇気 （オレンジ色）'],
      ['#ff8fb4', 'やさしさ （桃色）'],
      ['#ffd25a', '笑顔 （もっと明るい金色）'],
    ].forEach(([col, label], idx) => {
      ccg.fillStyle = col;
      ccg.beginPath();
      ccg.arc(46, 88 + idx * 46, 16, 0, Math.PI * 2);
      ccg.fill();
      ccg.fillStyle = '#4a3a30';
      ccg.font = '700 20px "Zen Maru Gothic", sans-serif';
      ccg.fillText(label, 76, 89 + idx * 46);
    });
    const colorBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.12),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(colorCanvas), roughness: 0.9 })
    );
    colorBoard.position.set(-3.35, 2.05, -4.86);
    this.worldGroup.add(colorBoard);

    // Right Rear Wall Live Blackboard: "今日の届け先"
    this.ledgerCanvas = document.createElement('canvas');
    this.ledgerCanvas.width = 360;
    this.ledgerCanvas.height = 250;
    this.ledgerTex = new THREE.CanvasTexture(this.ledgerCanvas);
    const ledgerBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 1.15),
      new THREE.MeshStandardMaterial({
        map: this.ledgerTex,
        roughness: 0.85,
        emissive: 0x1e2824,
        emissiveIntensity: 0.42,
      })
    );
    ledgerBoard.position.set(3.35, 2.05, -4.86);
    this.worldGroup.add(ledgerBoard);
    this.updateLedgerBoard(24, 6);
  }

  public updateLedgerBoard(totalWindowsLit: number, totalMorningsDelivered: number): void {
    const key = `${totalWindowsLit}:${totalMorningsDelivered}`;
    if (key === this.lastLedgerKey) return;
    this.lastLedgerKey = key;

    const g = this.ledgerCanvas.getContext('2d')!;
    g.fillStyle = '#22302c';
    g.fillRect(0, 0, 360, 250);
    g.strokeStyle = '#c49b5a';
    g.lineWidth = 8;
    g.strokeRect(5, 5, 350, 240);

    g.fillStyle = '#ffe6b4';
    g.font = '700 25px "Zen Maru Gothic", sans-serif';
    g.textBaseline = 'middle';
    g.fillText('今日の届け先 ・ 配達記録', 22, 34);

    g.fillStyle = '#f4ecd8';
    g.font = '500 18px "Zen Maru Gothic", sans-serif';
    const lines = [
      '・病院の、小さな男の子の窓辺',
      '・泣きながら眠った人の窓辺',
      '・失敗した夜のあの人の窓辺',
      '・さみしい夜をすごした人の窓辺',
    ];
    lines.forEach((s, i) => g.fillText(s, 22, 76 + i * 32));

    g.fillStyle = '#ffd278';
    g.font = '700 19px "Zen Maru Gothic", sans-serif';
    g.fillText(
      `届けた朝：${totalMorningsDelivered}回 ／ 灯した窓：${totalWindowsLit}窓`,
      22,
      216
    );
    this.ledgerTex.needsUpdate = true;
  }

  private buildCeilingLanternsAndMotes(): void {
    const rnd = createSeededRandom(901);

    // 5 Hanging Dawn Lanterns from ceiling rafters
    const lanDefs: [number, number, number][] = [
      [0, 1.4, 0xffb060],
      [0, -1.6, 0xff9ab8],
      [-2.4, -2.6, 0xffd070],
      [2.4, -2.6, 0xffb878],
      [0, -3.8, 0xffa0a8],
    ];
    lanDefs.forEach(([x, z, col]) => {
      const g = new THREE.Group();
      g.position.set(x, 3.65, z);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6),
        this.ironMat
      );
      cord.position.y = 0.55;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.14, 0.34, 12),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: col,
          emissiveIntensity: 0.95,
          roughness: 0.55,
          transparent: true,
          opacity: 0.92,
        })
      );
      const capT = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12),
        this.goldMat
      );
      capT.position.y = 0.19;
      const capB = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12),
        this.goldMat
      );
      capB.position.y = -0.19;
      g.add(cord, body, capT, capB);
      this.addGlow(col, 1.9, 0, 0, 0, 0.38, g);
      this.worldGroup.add(g);
      this.ceilingLanterns.push(g);
    });

    // Indoor floating dawn light motes ("光の粒")
    const moteCount = 120;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      this.dustBase.push([
        (rnd() * 2 - 1) * 4.8,
        rnd() * 3.8,
        (rnd() * 2 - 1) * 3.8,
        rnd() * Math.PI * 2,
      ]);
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    this.dustPoints = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: 0xffe0b8,
        size: 0.11,
        map: this.glowTex,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);

    // Outdoor rising dawn fireflies beyond the arched window
    const outCount = 65;
    const outPos = new Float32Array(outCount * 3);
    for (let i = 0; i < outCount; i++) {
      this.outdoorBase.push([
        (rnd() * 2 - 1) * 12,
        rnd() * 6.5,
        -6.0 - rnd() * 14,
        rnd() * Math.PI * 2,
      ]);
    }
    const outGeo = new THREE.BufferGeometry();
    outGeo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    this.outdoorFireflies = new THREE.Points(
      outGeo,
      new THREE.PointsMaterial({
        color: 0xffd288,
        size: 0.28,
        map: this.glowTex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.outdoorFireflies);
  }

  private buildWindowSpotDiorama(
    theme: 'hospital' | 'tearful' | 'stumbled' | 'lonely'
  ): { group: THREE.Group; paneMat: THREE.MeshStandardMaterial } {
    const g = new THREE.Group();

    // Miniature casement window frame & glowing glass pane
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.05), this.woodDarkMat);
    frame.position.set(0, 0.16, -0.08);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.18), this.woodLightMat);
    sill.position.set(0, -0.1, -0.02);

    const paneColor =
      theme === 'hospital'
        ? 0xffb468
        : theme === 'tearful'
          ? 0xff9ec0
          : theme === 'stumbled'
            ? 0xff9248
            : 0xffe078;

    const paneMat = new THREE.MeshStandardMaterial({
      color: paneColor,
      emissive: paneColor,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.86,
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.44), paneMat);
    pane.position.set(0, 0.16, -0.052);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.06), this.woodDarkMat);
    barH.position.set(0, 0.16, -0.05);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.46, 0.06), this.woodDarkMat);
    barV.position.set(0, 0.16, -0.05);
    g.add(frame, sill, pane, barH, barV);

    if (theme === 'hospital') {
      // Hospital cross emblem & little potted flower on the sill
      const crossMat = new THREE.MeshStandardMaterial({
        color: 0xff7a68,
        emissive: 0xff5a46,
        emissiveIntensity: 0.7,
      });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.03), crossMat);
      c1.position.set(0, 0.46, -0.05);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.03), crossMat);
      c2.position.set(0, 0.46, -0.05);
      g.add(c1, c2);
    } else if (theme === 'tearful') {
      // Gentle pink curtain & teardrop pearl turning into rose light
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 10),
        new THREE.MeshStandardMaterial({
          color: 0xffc0d8,
          emissive: 0xff80b0,
          emissiveIntensity: 1.1,
        })
      );
      drop.position.set(-0.12, -0.04, 0.03);
      g.add(drop);
    } else if (theme === 'stumbled') {
      // Open study notebook & mug on the desk by the window
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.025, 0.11),
        this.envelopeMat
      );
      book.position.set(-0.1, -0.07, 0.03);
      g.add(book);
    } else {
      // Warm golden star lantern on the lonely windowsill
      const star = new THREE.Mesh(
        create3DSunriseSunGeometry(0.07),
        new THREE.MeshStandardMaterial({
          color: 0xfff0a8,
          emissive: 0xffc84a,
          emissiveIntensity: 1.2,
        })
      );
      star.position.set(-0.11, -0.02, 0.03);
      g.add(star);
    }

    return { group: g, paneMat };
  }

  private buildFourDawnWindowSpots(): void {
    this.windowVisuals = DAWN_WINDOW_SPOTS.map((spot) => {
      const group = new THREE.Group();
      group.position.set(spot.x, 0, spot.z);
      this.worldGroup.add(group);

      // Wooden delivery pedestal base
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.44, 0.44, 24),
        this.woodDarkMat
      );
      base.position.y = 0.22;
      base.castShadow = true;
      base.receiveShadow = true;

      const goldTrim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.045, 24),
        this.goldMat
      );
      goldTrim.position.y = 0.45;
      group.add(base, goldTrim);

      // Floor progress rings
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.78, 40),
        new THREE.MeshBasicMaterial({
          color: 0x1c2642,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.024;

      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.63, 0.79, 44),
        new THREE.MeshBasicMaterial({
          color: spot.accentHex,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.032;

      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.92, 44),
        new THREE.MeshBasicMaterial({
          color: spot.accentHex,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.04;
      group.add(ringBg, ringFill, pulseRing);

      // Window Miniature Diorama
      const { group: dioramaGroup, paneMat: windowPaneMat } = this.buildWindowSpotDiorama(
        spot.theme
      );
      dioramaGroup.position.y = 0.62;
      group.add(dioramaGroup);

      // Glowing Dawn Bottle placed on the windowsill
      const bottleMesh = new THREE.Group();
      const bGlass = new THREE.Mesh(createJarLatheGeo(0.085, 0.24, 16), this.glassMat);
      const bCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.068, 0.15, 12),
        new THREE.MeshStandardMaterial({
          color: spot.accentHex,
          emissive: spot.accentHex,
          emissiveIntensity: 1.25,
          roughness: 0.25,
        })
      );
      bCore.position.y = 0.08;
      const bCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.038, 12),
        this.goldMat
      );
      bCap.position.y = 0.25;
      bottleMesh.add(bGlass, bCore, bCap);
      bottleMesh.position.set(0.11, 0.56, 0.05);
      group.add(bottleMesh);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: spot.accentHex,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.y = 0.76;
      halo.scale.set(1.5, 1.5, 1);
      group.add(halo);

      const glowLight = new THREE.PointLight(spot.accentHex, 1.3, 4.4, 1.4);
      glowLight.position.set(0, 0.95, 0.2);
      group.add(glowLight);

      // Floating status billboard above the window spot
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 104;
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(1.42, 0.58),
        new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          depthWrite: false,
        })
      );
      signBoard.position.y = 1.52;
      group.add(signBoard);

      const vis: DawnWindowVisual = {
        group,
        ringFill,
        ringBg,
        signCanvas,
        signTex,
        signBoard,
        bottleMesh,
        dioramaGroup,
        windowPaneMat,
        halo,
        glowLight,
        pulseRing,
        accentColor: new THREE.Color(spot.accentHex),
        urgentColor: new THREE.Color(0xff6b88),
        lastRenderedBucket: -1,
        lastRenderedUrgent: false,
        lastRenderedDone: false,
        pulse: 0,
        bottleLiftAmt: 0,
      };

      this.renderWindowSign(vis, spot.shortName, spot.tagLabel, 50, false, false);
      return vis;
    });
  }

  private renderWindowSign(
    vis: DawnWindowVisual,
    title: string,
    tagLabel: string,
    progress: number,
    urgent: boolean,
    done: boolean
  ): void {
    const ctx = vis.signCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 104);

    ctx.fillStyle = done
      ? 'rgba(54, 34, 14, 0.92)'
      : urgent
        ? 'rgba(56, 18, 32, 0.9)'
        : 'rgba(20, 24, 46, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 6, 240, 92, 16);
    ctx.fill();

    ctx.strokeStyle = done
      ? '#ffd878'
      : urgent
        ? '#ff7a98'
        : `#${vis.accentColor.getHexString()}`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fff5e4';
    ctx.font = '700 20px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 128, 30);

    // Progress bar track
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(28, 48, 200, 12);

    ctx.fillStyle = done
      ? '#ffe28a'
      : urgent
        ? '#ff7a98'
        : `#${vis.accentColor.getHexString()}`;
    ctx.fillRect(28, 48, Math.max(4, Math.round((Math.min(100, progress) / 100) * 200)), 12);

    ctx.fillStyle = done ? '#ffe8a4' : urgent ? '#ffb4c6' : '#ffe0be';
    ctx.font = '700 14px "Zen Maru Gothic", sans-serif';
    ctx.fillText(
      done
        ? '🌅 新しい朝が届いた！'
        : urgent
          ? `夜が深い… ${Math.round(progress)}%`
          : `${tagLabel} ${Math.round(progress)}%`,
      128,
      80
    );

    vis.signTex.needsUpdate = true;
  }

  public syncUpgrades(state: AshitayobiSaveState): void {
    const clear = (g: THREE.Group) => {
      while (g.children.length > 0) g.remove(g.children[0]);
    };
    clear(this.sortingExtraGroup);
    clear(this.archExtraGroup);
    clear(this.satchelExtraGroup);
    clear(this.drawersExtraGroup);
    clear(this.mixingExtraGroup);
    clear(this.ledgerExtraGroup);

    // 1. Central Sorting Bench extras (extra golden dawn bottles & wax-sealed express bundles)
    const sortLv = state.upgrades.sortingBench;
    for (let i = 0; i < Math.min(4, sortLv); i++) {
      const sun = new THREE.Mesh(
        create3DSunriseSunGeometry(0.08),
        this.coreMaterials[i % 3]
      );
      sun.position.set(-0.55 + i * 0.36, 1.06, 0.36);
      this.sortingExtraGroup.add(sun);
    }

    // 2. Sunrise Arch & Balcony extras (fairy dawn garland lights across the arch window)
    const archLv = state.upgrades.sunriseArch;
    if (archLv > 0) {
      const count = Math.min(5, archLv) * 3;
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count;
        const x = -4.5 + u * 9.0;
        const y = 3.95 - Math.sin(u * Math.PI) * 0.38;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 10, 8),
          this.coreMaterials[i % 3]
        );
        bulb.position.set(x, y, -4.75);
        this.archExtraGroup.add(bulb);
      }
    }

    // 3. Dawn Satchel extras (display leather dawn satchel by the sorting table)
    const satchelLv = state.upgrades.dawnSatchel;
    if (satchelLv > 0) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.24), this.leatherMat);
      bag.position.set(0.88, 0.18, -0.35);
      bag.rotation.y = -0.45;
      const badge = new THREE.Mesh(create3DSunriseSunGeometry(0.07), this.goldMat);
      badge.position.set(0.76, 0.22, -0.22);
      this.satchelExtraGroup.add(bag, badge);
    }

    // 4. Dawn Drawers extras (golden lantern on the ladder & open drawer sunbeams)
    const drawerLv = state.upgrades.dawnDrawers;
    if (drawerLv > 0) {
      for (let i = 0; i < Math.min(4, drawerLv); i++) {
        const star = new THREE.Mesh(
          create3DSunriseSunGeometry(0.09),
          this.coreMaterials[i % 3]
        );
        star.position.set(-4.5, 0.8 + i * 0.65, -1.35);
        this.drawersExtraGroup.add(star);
      }
    }

    // 5. Mixing Desk extras (extra glowing crystal decanters on the mixing bench)
    const mixLv = state.upgrades.mixingDesk;
    if (mixLv > 0) {
      for (let i = 0; i < Math.min(5, mixLv); i++) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 12, 10),
          this.coreMaterials[i % 3]
        );
        orb.position.set(4.85, 1.02, 1.5 - i * 0.32);
        this.mixingExtraGroup.add(orb);
      }
    }

    // 6. Loading Ledger extras (extra stacks of golden dawn letters on the window loading table)
    const ledgerLv = state.upgrades.loadingLedger;
    if (ledgerLv > 0) {
      for (let i = 0; i < Math.min(4, ledgerLv); i++) {
        const stack = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.04 + i * 0.02, 0.2),
          this.envelopeMat
        );
        stack.position.set(-1.1 + i * 0.72, 0.84, -4.45);
        this.ledgerExtraGroup.add(stack);
      }
    }

    this.updateLedgerBoard(
      24 + state.totalSatchelsDispatched * 12 + state.totalWindowsLit,
      6 + state.totalMorningsDelivered
    );
  }

  public updateWindowSpotVisual(
    spotId: number,
    progress: number,
    urgent: boolean,
    done: boolean,
    delivering: boolean,
    elapsed: number
  ): void {
    const vis = this.windowVisuals[spotId];
    const def = DAWN_WINDOW_SPOTS[spotId];
    if (!vis || !def) return;

    const clamped = Math.max(0, Math.min(1, progress / 100));
    vis.ringFill.scale.setScalar(0.86 + clamped * 0.18);
    const rfMat = vis.ringFill.material as THREE.MeshBasicMaterial;
    rfMat.color.copy(
      done ? new THREE.Color(0xfff0b2) : urgent ? vis.urgentColor : vis.accentColor
    );
    rfMat.opacity = done ? 0.96 : delivering ? 0.92 : 0.45 + clamped * 0.45;

    // Gently float the Dawn Bottle on the windowsill as morning arrives
    const targetLift = done ? 1.0 : delivering ? 0.35 : 0.0;
    vis.bottleLiftAmt += (targetLift - vis.bottleLiftAmt) * 0.12;
    vis.bottleMesh.position.y =
      0.56 + Math.sin(elapsed * 2.6 + spotId) * 0.03 + vis.bottleLiftAmt * 0.18;
    vis.bottleMesh.rotation.y = elapsed * (done ? 2.2 : delivering ? 1.2 : 0.4);

    // Window pane brightens with warm dawn glow as progress increases
    vis.windowPaneMat.emissiveIntensity = done
      ? 1.75
      : delivering
        ? 1.35
        : 0.45 + clamped * 0.85;

    vis.dioramaGroup.rotation.y = Math.sin(elapsed * 0.9 + spotId) * 0.12;

    vis.halo.scale.setScalar(1.35 + clamped * 0.95 + (done ? 0.65 : 0));
    (vis.halo.material as THREE.SpriteMaterial).opacity = done
      ? 0.9
      : delivering
        ? 0.74
        : 0.34 + clamped * 0.28;
    vis.glowLight.intensity = done ? 2.8 : delivering ? 2.2 : 0.8 + clamped * 0.85;

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
      this.renderWindowSign(vis, def.shortName, def.tagLabel, progress, urgent, done);
    }
  }

  public pulseWindowSpot(spotId: number): void {
    const vis = this.windowVisuals[spotId];
    if (vis) vis.pulse = 1.0;
  }

  /** Launches a radiant 3D sunrise sun-ray arc soaring out the grand arched window over Tokoyo-cho! */
  public launchDawnDeliveryArc(
    startX: number,
    startY: number,
    startZ: number,
    colorHex = 0xffb858
  ): void {
    const g = new THREE.Group();
    const sun = new THREE.Mesh(this.arcSunGeo, this.arcSunMat);
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
    halo.scale.set(1.2, 1.2, 1);
    g.add(sun, halo);
    this.worldGroup.add(g);

    const endX = (Math.random() - 0.5) * 14;
    const endY = 5.5 + Math.random() * 4.5;
    const endZ = -16 - Math.random() * 10;
    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const ctrl = new THREE.Vector3(
      (startX + endX) * 0.5,
      Math.max(startY, endY) + 2.4,
      (startZ + endZ) * 0.5
    );

    this.flightArcs.push({ group: g, start, ctrl, end, t: 0, dur: 0.98 });
  }

  public triggerDawnWaveFlash(): void {
    this.dawnFlashTimer = 0.78;
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
    songProgress: number,
    isFever: boolean,
    isDeliveringWave: boolean
  ): void {
    this.simClock += dt;
    if (this.dawnFlashTimer > 0) this.dawnFlashTimer = Math.max(0, this.dawnFlashTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    // Camera framing
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

    // Dynamic Night -> Sunrise progression across the 62s song (or full golden sunrise during GOLDEN DAYBREAK fever!)
    const rawDawn =
      this.cameraMode === 'lobby'
        ? 0.35 + 0.25 * Math.sin(elapsed * 0.25)
        : isFever
          ? 0.96
          : Math.min(1, Math.max(0.12, songProgress * 0.95 + (isDeliveringWave ? 0.22 : 0)));
    const dawnAmt = rawDawn * rawDawn * (3 - 2 * rawDawn);

    this.dawnDomeMat.opacity = Math.pow(dawnAmt, 1.05);
    this.skyStarsA.opacity = (0.82 + 0.12 * Math.sin(elapsed * 1.3)) * (1 - dawnAmt * 0.72);
    this.skyStarsB.opacity = (0.9 + 0.08 * Math.sin(elapsed * 0.9 + 1)) * (1 - dawnAmt * 0.72);
    (this.moonMesh.material as THREE.MeshBasicMaterial).opacity = 1 - dawnAmt * 0.8;
    (this.moonGlow.material as THREE.SpriteMaterial).opacity = 0.45 * (1 - dawnAmt * 0.8);

    const sunY = -7 + 16 * dawnAmt;
    this.sunDisc.position.y = sunY;
    this.sunGlow.position.y = sunY;
    (this.sunDisc.material as THREE.MeshBasicMaterial).opacity = Math.min(
      1,
      Math.max(0.15, dawnAmt * 1.25)
    );
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = 0.24 + 0.54 * dawnAmt;
    const sunScale = 76 * (1 + 0.04 * Math.sin(elapsed * 0.9) + (isFever ? 0.16 : 0));
    this.sunGlow.scale.set(sunScale, sunScale, 1);

    // Clouds shifting from indigo night to coral-gold sunrise
    const nightCloudCol = new THREE.Color(0x1e2858);
    const dawnCloudA = new THREE.Color(0xff9672);
    const dawnCloudB = new THREE.Color(0xffd2a4);
    const tmpCol = new THREE.Color();
    for (const cl of this.cloudSprites) {
      tmpCol.copy(dawnCloudA).lerp(dawnCloudB, cl.tintRatio);
      cl.mat.color.copy(nightCloudCol).lerp(tmpCol, dawnAmt);
      cl.mat.opacity = 0.55 + 0.32 * dawnAmt;
    }

    this.townBodyMat.color
      .setHex(0x0c1428)
      .lerp(new THREE.Color(0x36243e), dawnAmt);
    this.townWindowMat.opacity = 0.88 - 0.45 * dawnAmt;

    // Arched window light & floor sunrise pool
    this.archWindowLight.color
      .setHex(0x7090ff)
      .lerp(new THREE.Color(0xffa658), dawnAmt);
    this.archWindowLight.intensity = 1.15 + 1.45 * dawnAmt + (isFever ? 0.8 : 0);
    this.windowPoolMat.opacity = 0.18 + 0.58 * dawnAmt;

    // Beat-reactive interior lighting
    const waveBoost = this.dawnFlashTimer > 0 ? this.dawnFlashTimer * 1.45 : 0;
    const feverBoost = isFever ? 0.7 + beatPulse * 0.35 : 0;

    this.centerLanternLight.intensity =
      2.25 + beatPulse * 0.45 + energy * 0.4 + waveBoost + feverBoost;
    this.centerLanternLight.color.setHex(
      isFever ? 0xfff0b8 : isDeliveringWave ? 0xffc488 : 0xffcf96
    );
    this.leftDrawerLight.intensity =
      1.25 * (1 + 0.08 * Math.sin(elapsed * 1.4)) + (isFever ? 0.55 : 0);
    this.rightMixingLight.intensity =
      1.28 * (1 + 0.08 * Math.sin(elapsed * 1.6 + 1)) + (isFever ? 0.55 : 0);

    // Center master sunrise beacon rotation
    this.centerBeaconSun.rotation.y = elapsed * (isFever || isDeliveringWave ? 2.1 : 0.75);
    this.centerBeaconSun.position.y = 1.24 + Math.sin(elapsed * 2.0) * 0.045;

    // 3-color dawn cores pulsing with the beat
    this.coreMaterials.forEach((m, i) => {
      m.emissiveIntensity =
        (isFever ? 1.38 : 0.86) + 0.25 * Math.sin(elapsed * 1.4 + i * 1.7) + beatPulse * 0.22;
    });

    // Hanging ceiling lanterns & balcony flag
    this.ceilingLanterns.forEach((g, i) => {
      g.rotation.z = 0.03 * Math.sin(elapsed * 0.85 + i * 1.3);
      g.rotation.x = 0.02 * Math.sin(elapsed * 0.65 + i);
    });
    this.roofFlag.rotation.y = 0.28 * Math.sin(elapsed * 2.1);
    this.roofFlag.rotation.z = 0.06 * Math.sin(elapsed * 3.0);

    // Animated Brass Light-Weighing Balance Scale ("光を量る天秤")
    const theta = 0.11 * Math.sin(elapsed * 0.78);
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    this.balanceBeam.rotation.x = theta;
    this.balancePanL.position.set(0, 0.3 + 0.34 * sinT, -0.34 * cosT);
    this.balancePanR.position.set(0, 0.3 - 0.34 * sinT, 0.34 * cosT);
    this.balanceOrbL.position.set(0, 0.35 + 0.34 * sinT, -0.34 * cosT);

    // Glow sprites breathing
    for (const gs of this.glowSprites) {
      const s =
        gs.baseScale * (1 + 0.055 * Math.sin(elapsed * 2.1 + gs.phase) + (isFever ? 0.14 : 0));
      gs.sprite.scale.set(s, s, 1);
    }

    // Indoor dawn motes
    const dustAttr = this.dustPoints.geometry.attributes.position as THREE.BufferAttribute;
    const dArr = dustAttr.array as Float32Array;
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i];
      dArr[i * 3] = b[0] + Math.sin(this.simClock * 0.25 + b[3]) * 0.32;
      dArr[i * 3 + 1] = 0.3 + ((b[1] + this.simClock * (isFever ? 0.24 : 0.05)) % 3.8);
      dArr[i * 3 + 2] = b[2] + Math.cos(this.simClock * 0.2 + b[3]) * 0.32;
    }
    dustAttr.needsUpdate = true;

    // Outdoor dawn fireflies beyond the arched window
    const outAttr = this.outdoorFireflies.geometry.attributes.position as THREE.BufferAttribute;
    const oArr = outAttr.array as Float32Array;
    for (let i = 0; i < this.outdoorBase.length; i++) {
      const b = this.outdoorBase[i];
      oArr[i * 3] = b[0] + Math.sin(this.simClock * 0.32 + b[3]) * 0.65;
      oArr[i * 3 + 1] = b[1] + 0.35 * Math.sin(this.simClock * 0.7 + b[3] * 2);
      oArr[i * 3 + 2] = b[2] + Math.cos(this.simClock * 0.25 + b[3]) * 0.65;
    }
    outAttr.needsUpdate = true;

    // Soaring dawn delivery arcs flying out into the morning sky
    for (let i = this.flightArcs.length - 1; i >= 0; i--) {
      const a = this.flightArcs[i];
      a.t += dt / a.dur;
      if (a.t >= 1) {
        this.worldGroup.remove(a.group);
        this.flightArcs.splice(i, 1);
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
