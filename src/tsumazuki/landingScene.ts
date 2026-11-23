import * as THREE from 'three';
import { STUMBLE_SPOTS } from './config';
import { TsumazukiSaveState } from './types';

interface StumbleSpotVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  silhouettePivot: THREE.Group;
  silhouetteMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  timeRipple: THREE.Mesh;
  dangerColor: THREE.Color;
  safeColor: THREE.Color;
  pulse: number;
}

interface ReturningItemArc {
  group: THREE.Group;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  dur: number;
}

interface DecorFloatingProp {
  group: THREE.Group;
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  phase: number;
  amp: number;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * 3D Morning Apartment Stair Landing & Hidden Watchman Room for Tsumazuki.
 * Inspired directly by the official Tsumazuki room tour & picturebook:
 *  - Sunlit morning apartment staircase landing with arched window & volumetric sunbeam
 *  - Circular teal-and-cream rug on parquet & stairwell tiles
 *  - Ascending & descending steps with brass non-slip strips & dark wood handrails
 *  - Under-stair watchman nook: teal door, peek window, sawtooth stair-underside beams
 *  - Left wall: lost-and-found shelf (labeled boxes, jars, glowing hourglass, tagged items),
 *    room key hook board (302/5F/あさ/B1/204), corkboard, apartment mailboxes & extinguisher
 *  - Right wall: almost-stopped pendulum clock (slows in real time during TIME SLOW!),
 *    teal hooded cloak hook, cozy window cushion & plaid blanket, handrail model table &
 *    watch journal, blueprint "おどりば", wall memo "だいじょうぶ。ほんの少しだけだからね。"
 *  - 4 interactive Stumble Spots with leaning morning resident silhouettes that steady when helped
 */
export class LandingScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpNdc = new THREE.Vector2();

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private camPos = new THREE.Vector3(0, 6.2, 8.9);
  private camTarget = new THREE.Vector3(0, 1.35, -0.75);
  private shakeTimer = 0;
  private shakeIntensity = 0;

  // Lights
  private hemiLight: THREE.HemisphereLight;
  private sunDirLight: THREE.DirectionalLight;
  private archWinLight: THREE.PointLight;
  private pendLight: THREE.PointLight;
  private doorLight: THREE.PointLight;
  private shelfLight: THREE.PointLight;

  // Animated environment props
  private pendulumPivot!: THREE.Group;
  private pendulumPhase = 0;
  private pendantGlow!: THREE.Sprite;
  private sunBeamGroup!: THREE.Group;
  private sunPoolMesh!: THREE.Mesh;
  private garlandBulbs: { sprite: THREE.Sprite; mesh: THREE.Mesh; phase: number }[] = [];
  private ambientTimeRings: THREE.Mesh[] = [];
  private decorFloats: DecorFloatingProp[] = [];
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];
  private returningArcs: ReturningItemArc[] = [];

  // Upgrade-responsive 3D prop groups
  private hourglassExtraGroup = new THREE.Group();
  private garlandGroup = new THREE.Group();
  private lostShelfExtraGroup = new THREE.Group();
  private clockModelExtraGroup = new THREE.Group();
  private cloakCushionGroup = new THREE.Group();
  private journalBlueprintGroup = new THREE.Group();

  // Interactive 4 stumble spots
  private spotVisuals: StumbleSpotVisual[] = [];

  // Shared materials for returning item arcs
  private tealOrbMat: THREE.MeshStandardMaterial;
  private goldRingMat: THREE.MeshStandardMaterial;

  private sunFlashTimer = 0;
  private simClock = 0;

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
    this.scene.background = new THREE.Color(0x0f1826);
    this.scene.fog = new THREE.FogExp2(0x0f1826, 0.02);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 120);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.tealOrbMat = new THREE.MeshStandardMaterial({
      color: 0x9cf2e2,
      emissive: 0x3fa898,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });
    this.goldRingMat = new THREE.MeshStandardMaterial({
      color: 0xffdf96,
      emissive: 0xb87e28,
      emissiveIntensity: 0.45,
      metalness: 0.72,
      roughness: 0.28,
    });

    this.scene.add(this.worldGroup);

    // Morning apartment stairwell lighting — crisp morning sky blue + warm creamy sunlit amber
    this.hemiLight = new THREE.HemisphereLight(0xcbe2f8, 0x3b4846, 0.88);
    this.scene.add(this.hemiLight);

    this.sunDirLight = new THREE.DirectionalLight(0xfff0d4, 1.05);
    this.sunDirLight.position.set(4.5, 11.5, -5.5);
    this.sunDirLight.castShadow = true;
    this.sunDirLight.shadow.mapSize.set(1024, 1024);
    this.sunDirLight.shadow.camera.near = 1;
    this.sunDirLight.shadow.camera.far = 32;
    const d = 9.0;
    this.sunDirLight.shadow.camera.left = -d;
    this.sunDirLight.shadow.camera.right = d;
    this.sunDirLight.shadow.camera.top = d;
    this.sunDirLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunDirLight);

    this.archWinLight = new THREE.PointLight(0xffe6bc, 2.5, 18, 1.2);
    this.archWinLight.position.set(0, 4.6, -4.4);
    this.scene.add(this.archWinLight);

    this.pendLight = new THREE.PointLight(0xffcf88, 2.3, 16, 1.25);
    this.pendLight.position.set(0, 5.2, 0.2);
    this.scene.add(this.pendLight);

    this.doorLight = new THREE.PointLight(0x88e6d4, 1.45, 10, 1.35);
    this.doorLight.position.set(-3.2, 1.6, -3.6);
    this.scene.add(this.doorLight);

    this.shelfLight = new THREE.PointLight(0xffdfaa, 1.2, 10, 1.35);
    this.shelfLight.position.set(-4.6, 2.8, 0.2);
    this.scene.add(this.shelfLight);

    this.buildEnvironment();
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.28, 'rgba(255,255,255,0.54)');
    r.addColorStop(0.65, 'rgba(255,255,255,0.12)');
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

  private makePaperTex(
    lines: string[],
    w = 256,
    h = 180,
    bg = '#fbf3da',
    ink = '#2f6d68'
  ): THREE.CanvasTexture {
    const rnd = createSeededRandom(lines.join('').length * 131 + 19);
    return this.makeCanvasTex(w, h, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 320; i++) {
        g.fillStyle = `rgba(120,100,70,${(rnd() * 0.06).toFixed(3)})`;
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
      g.fillStyle = ink;
      const fs = Math.round(H * (lines.length > 2 ? 0.15 : 0.22));
      g.font = `700 ${fs}px "Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const step = lines.length > 1 ? H * (lines.length > 2 ? 0.25 : 0.34) : 0;
      const startY = H * 0.5 - ((lines.length - 1) * step) / 2;
      lines.forEach((s, i) => g.fillText(s, W * 0.5, startY + i * step));
    });
  }

  private addSegment(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
    parent: THREE.Object3D
  ): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mat);
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
    return mesh;
  }

  private buildEnvironment(): void {
    const rnd = createSeededRandom(707);

    // ===== Shared Materials =====
    const plasterTex = this.makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#9db0b2';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2200; i++) {
          g.fillStyle =
            rnd() < 0.5
              ? `rgba(255,250,240,${(rnd() * 0.07).toFixed(3)})`
              : `rgba(20,30,36,${(rnd() * 0.06).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
        }
      },
      2,
      1.5
    );
    const plasterMat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.92 });

    const warmWallTex = this.makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#b9bbb0';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2000; i++) {
          g.fillStyle =
            rnd() < 0.5
              ? `rgba(255,248,232,${(rnd() * 0.07).toFixed(3)})`
              : `rgba(38,34,26,${(rnd() * 0.05).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
        }
      },
      2,
      1.4
    );
    const warmWallMat = new THREE.MeshStandardMaterial({ map: warmWallTex, roughness: 0.9 });

    // Teal wainscoting panel texture (signature color of Tsumazuki's room!)
    const panelTex = this.makeCanvasTex(
      256,
      128,
      (g, w, h) => {
        g.fillStyle = '#2b6762';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) {
          const x = i * 64;
          g.fillStyle = 'rgba(0,0,0,0.34)';
          g.fillRect(x, 0, 3, h);
          g.strokeStyle = 'rgba(195,240,230,0.28)';
          g.lineWidth = 2;
          g.strokeRect(x + 9, 10, 46, h - 20);
        }
        for (let i = 0; i < 240; i++) {
          g.fillStyle = `rgba(255,255,255,${(rnd() * 0.045).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 1, 5);
        }
      },
      8,
      1
    );
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.56 });

    // Parquet + apartment landing tile floor
    const floorTex = this.makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        const n = 10;
        const pw = w / n;
        for (let i = 0; i < n; i++) {
          let y = -rnd() * 140;
          while (y < h) {
            const L = 120 + rnd() * 140;
            const l = 33 + rnd() * 8;
            g.fillStyle = `hsl(${30 + rnd() * 6}, ${34 + rnd() * 10}%, ${l}%)`;
            g.fillRect(i * pw, y, pw, L);
            g.fillStyle = 'rgba(42,24,10,0.42)';
            g.fillRect(i * pw, y, pw, 2);
            for (let k = 0; k < 10; k++) {
              g.fillStyle = `rgba(70,40,18,${(rnd() * 0.08).toFixed(3)})`;
              g.fillRect(i * pw + rnd() * pw, y + rnd() * L, 1 + rnd() * 2, 8 + rnd() * 26);
            }
            y += L;
          }
          g.fillStyle = 'rgba(42,24,10,0.48)';
          g.fillRect(i * pw, 0, 2, h);
        }
      },
      2.2,
      1.8
    );
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.58 });

    const tileTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            g.fillStyle = (i + j) % 2 ? '#c4c1b2' : '#aeaa9c';
            g.fillRect(i * 64, j * 64, 64, 64);
          }
        }
        g.strokeStyle = 'rgba(40,35,30,0.28)';
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
      4
    );
    const tileMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.72 });

    const woodMid = new THREE.MeshStandardMaterial({ color: 0x7d583a, roughness: 0.7 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.65 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd8ad56,
      metalness: 0.78,
      roughness: 0.3,
    });
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xc8d2d8,
      metalness: 0.78,
      roughness: 0.3,
    });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf2ead4, roughness: 0.78 });
    const tealMat = new THREE.MeshStandardMaterial({ color: 0x4ba699, roughness: 0.68 });
    const tealDarkMat = new THREE.MeshStandardMaterial({ color: 0x265c57, roughness: 0.75 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xb0aea2, roughness: 0.82 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff2f6,
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kraftMat = new THREE.MeshStandardMaterial({ color: 0xc8a574, roughness: 0.9 });

    // Plaid blanket texture
    const plaidTex = this.makeCanvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ece0c4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(75,166,153,0.55)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 32 + 4, 0, 12, h);
        g.fillRect(0, i * 32 + 4, w, 12);
      }
      g.fillStyle = 'rgba(205,105,82,0.52)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 32 + 22, 0, 3, h);
        g.fillRect(0, i * 32 + 22, w, 3);
      }
    });
    const plaidMat = new THREE.MeshStandardMaterial({ map: plaidTex, roughness: 0.92 });

    // Morning sky texture (soft sky blue -> warm peach-cream sunrise + town silhouette)
    const morningSkyTex = this.makeCanvasTex(256, 384, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#88b6e6');
      gr.addColorStop(0.52, '#f0e2ce');
      gr.addColorStop(1, '#f8c698');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      const sg = g.createRadialGradient(w * 0.68, h * 0.66, 0, w * 0.68, h * 0.66, 98);
      sg.addColorStop(0, 'rgba(255,252,226,0.96)');
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        const cx = rnd() * w;
        const cy = 36 + rnd() * 145;
        for (let k = 0; k < 5; k++) {
          g.fillStyle = 'rgba(255,255,255,0.34)';
          g.beginPath();
          g.ellipse(cx + k * 15, cy + rnd() * 7, 26, 9, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = '#7e8fa8';
      let bx = 0;
      while (bx < w) {
        const bw = 22 + rnd() * 34;
        const bh = 38 + rnd() * 68;
        g.fillRect(bx, h - bh, bw, bh);
        bx += bw;
      }
      g.fillStyle = '#687992';
      bx = 8;
      while (bx < w) {
        const bw = 18 + rnd() * 24;
        const bh = 22 + rnd() * 48;
        g.fillRect(bx, h - bh, bw, bh);
        bx += bw + 10;
      }
    });

    // ===== 1. Landing Floor & Outer Stairwell Base =====
    const outerTile = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), tileMat);
    outerTile.rotation.x = -Math.PI / 2;
    outerTile.position.set(0, -0.02, 0.5);
    outerTile.receiveShadow = true;
    this.worldGroup.add(outerTile);

    const landingFloor = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.08, 8.6), floorMat);
    landingFloor.position.set(0, -0.04, 0.05);
    landingFloor.receiveShadow = true;
    this.worldGroup.add(landingFloor);

    // Brass border framing the landing play area
    const borderMat = brassMat;
    const fTop = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.04, 0.09), borderMat);
    fTop.position.set(0, 0.01, -4.25);
    this.worldGroup.add(fTop);
    const fBot = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.04, 0.09), borderMat);
    fBot.position.set(0, 0.01, 4.35);
    this.worldGroup.add(fBot);

    // Circular teal-and-cream rug in center (direct homage to Tsumazuki's room!)
    const rugTex = this.makeCanvasTex(512, 512, (g, w, h) => {
      const c = 256;
      g.clearRect(0, 0, w, h);
      const ring = (r: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.fill();
      };
      ring(250, '#efe6cf');
      ring(236, '#2b6762');
      ring(212, '#d8b46a');
      ring(202, '#2b6762');
      ring(178, '#efe6cf');
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        g.save();
        g.translate(c + Math.cos(a) * 148, c + Math.sin(a) * 148);
        g.rotate(a);
        g.fillStyle = '#4fa89b';
        g.beginPath();
        g.moveTo(-25, 0);
        g.quadraticCurveTo(0, -13, 25, 0);
        g.quadraticCurveTo(0, 13, -25, 0);
        g.fill();
        g.restore();
      }
      ring(110, '#2b6762');
      ring(98, '#efe6cf');
      ring(86, '#8fbfb4');
      g.fillStyle = '#efe6cf';
      g.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = i % 2 ? 22 : 68;
        if (i === 0) g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        else g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(2.05, 64),
      new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.96, transparent: true })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.15);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // ===== 2. Walls, Teal Wainscoting & Sawtooth Under-Stair Ceiling Motif =====
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.6, 6.2, 0.28), warmWallMat);
    backWall.position.set(0, 3.1, -4.4);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6.2, 9.2), plasterMat);
    leftWall.position.set(-5.65, 3.1, 0.1);
    leftWall.receiveShadow = true;
    this.worldGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6.2, 9.2), plasterMat);
    rightWall.position.set(5.65, 3.1, 0.1);
    rightWall.receiveShadow = true;
    this.worldGroup.add(rightWall);

    // Teal wainscoting + brass molding along back, left, and right walls
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(11.1, 1.15, 0.06), panelMat);
    backPanel.position.set(0, 0.58, -4.23);
    this.worldGroup.add(backPanel);
    const backTrim = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.06, 0.09), brassMat);
    backTrim.position.set(0, 1.18, -4.21);
    this.worldGroup.add(backTrim);

    [-5.48, 5.48].forEach((wx) => {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 8.8), panelMat);
      sp.position.set(wx, 0.58, 0.1);
      this.worldGroup.add(sp);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 8.8), brassMat);
      st.position.set(wx + (wx < 0 ? 0.02 : -0.02), 1.18, 0.1);
      this.worldGroup.add(st);
    });

    // Sawtooth stair-underside beams overhead on back-left (iconic stair-under-room silhouette!)
    for (let i = 0; i < 6; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.55), woodDark);
      beam.position.set(-4.35 + i * 0.42, 4.75 + i * 0.24, -4.0);
      this.worldGroup.add(beam);
    }

    // ===== 3. Iconic Apartment Staircases (Left Ascending & Right Descending) =====
    // Left-back ascending stairs rising along left wall
    const leftStairGroup = new THREE.Group();
    leftStairGroup.position.set(-4.75, 0, 2.7);
    this.worldGroup.add(leftStairGroup);
    const railPtsL: THREE.Vector3[] = [];
    for (let i = 0; i < 9; i++) {
      const h = (i + 1) * 0.24;
      const z = -i * 0.58;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 0.58), stepMat);
      step.position.set(0, h * 0.5, z);
      step.receiveShadow = true;
      leftStairGroup.add(step);
      // Brass non-slip nosing strip
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.024, 0.05), brassMat);
      nosing.position.set(0, h + 0.012, z + 0.24);
      leftStairGroup.add(nosing);
      const rp = new THREE.Vector3(0.72, h + 0.92, z);
      railPtsL.push(rp);
      if (i % 2 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.92, 0.045), woodDark);
        post.position.set(rp.x, h + 0.46, rp.z);
        leftStairGroup.add(post);
      }
      if (i > 0) this.addSegment(railPtsL[i - 1], rp, 0.032, woodDark, leftStairGroup);
    }

    // Right-back descending/ascending stairs with wooden balustrade
    const rightStairGroup = new THREE.Group();
    rightStairGroup.position.set(4.75, 0, -2.0);
    this.worldGroup.add(rightStairGroup);
    const railPtsR: THREE.Vector3[] = [];
    for (let i = 0; i < 9; i++) {
      const h = (i + 1) * 0.24;
      const z = i * 0.58;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 0.58), stepMat);
      step.position.set(0, h * 0.5, z);
      step.receiveShadow = true;
      rightStairGroup.add(step);
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.024, 0.05), brassMat);
      nosing.position.set(0, h + 0.012, z - 0.24);
      rightStairGroup.add(nosing);
      const rp = new THREE.Vector3(-0.72, h + 0.92, z);
      railPtsR.push(rp);
      if (i % 2 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.92, 0.045), woodDark);
        post.position.set(rp.x, h + 0.46, rp.z);
        rightStairGroup.add(post);
      }
      if (i > 0) this.addSegment(railPtsR[i - 1], rp, 0.032, woodDark, rightStairGroup);
    }

    // ===== 4. Grand Arched Morning Window & Volumetric Sunbeam (Back Center) =====
    {
      const winGroup = new THREE.Group();
      winGroup.position.set(0, 1.55, -4.22);
      this.worldGroup.add(winGroup);

      const archShape = new THREE.Shape();
      archShape.moveTo(-1.15, 0);
      archShape.lineTo(1.15, 0);
      archShape.lineTo(1.15, 1.75);
      archShape.absarc(0, 1.75, 1.15, 0, Math.PI, false);
      archShape.lineTo(-1.15, 0);

      const skyTex = morningSkyTex.clone();
      skyTex.needsUpdate = true;
      skyTex.repeat.set(1 / 2.3, 1 / 2.9);
      skyTex.offset.set(0.5, 0);

      const skyPane = new THREE.Mesh(
        new THREE.ShapeGeometry(archShape, 24),
        new THREE.MeshBasicMaterial({ map: skyTex, fog: false })
      );
      winGroup.add(skyPane);

      // Arched cream frame & mullions
      const archFrame = new THREE.Mesh(
        new THREE.TorusGeometry(1.18, 0.075, 8, 36, Math.PI),
        creamMat
      );
      archFrame.position.set(0, 1.75, 0.03);
      winGroup.add(archFrame);

      [-1.18, 1.18].forEach((fx) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.75, 0.14), creamMat);
        jamb.position.set(fx, 0.875, 0.03);
        winGroup.add(jamb);
      });
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.11, 0.34), creamMat);
      sill.position.set(0, -0.04, 0.12);
      winGroup.add(sill);

      const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.86, 0.07), creamMat);
      vMullion.position.set(0, 1.43, 0.04);
      winGroup.add(vMullion);
      const hMullion = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.07), creamMat);
      hMullion.position.set(0, 1.25, 0.04);
      winGroup.add(hMullion);
      const innerArch = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.035, 8, 24, Math.PI),
        creamMat
      );
      innerArch.position.set(0, 1.75, 0.04);
      winGroup.add(innerArch);

      // Morning window halo sprite
      const winGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xfff0d4,
          transparent: true,
          opacity: 0.44,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      winGlow.scale.set(5.4, 5.4, 1);
      winGlow.position.set(0, 1.55, 0.45);
      winGroup.add(winGlow);

      // Volumetric morning light shaft slanting onto the landing (soft-feathered edges)
      const beamTex = this.makeCanvasTex(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let y = 0; y < h; y++) {
          const vy = y / (h - 1);
          const vAlpha = Math.sin(Math.min(1, vy * 1.15) * Math.PI * 0.5) * Math.pow(1 - vy, 1.35);
          const hg = g.createLinearGradient(0, y, w, y);
          hg.addColorStop(0, 'rgba(255,244,216,0)');
          hg.addColorStop(0.25, `rgba(255,244,216,${(vAlpha * 0.55).toFixed(3)})`);
          hg.addColorStop(0.5, `rgba(255,248,224,${(vAlpha * 0.9).toFixed(3)})`);
          hg.addColorStop(0.75, `rgba(220,248,242,${(vAlpha * 0.55).toFixed(3)})`);
          hg.addColorStop(1, 'rgba(220,248,242,0)');
          g.fillStyle = hg;
          g.fillRect(0, y, w, 1);
        }
      });
      this.sunBeamGroup = new THREE.Group();
      this.sunBeamGroup.position.set(0, 2.35, -2.55);
      this.sunBeamGroup.rotation.x = -0.62;
      this.worldGroup.add(this.sunBeamGroup);
      [0, Math.PI / 2].forEach((rot) => {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(2.3, 5.2),
          new THREE.MeshBasicMaterial({
            map: beamTex,
            color: 0xfff3d8,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
          })
        );
        plane.rotation.y = rot;
        this.sunBeamGroup.add(plane);
      });

      // Floor sunlight pool
      this.sunPoolMesh = new THREE.Mesh(
        new THREE.CircleGeometry(2.15, 40),
        new THREE.MeshBasicMaterial({
          map: this.glowTex,
          color: 0xfff0cf,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      this.sunPoolMesh.rotation.x = -Math.PI / 2;
      this.sunPoolMesh.scale.set(1.15, 1.45, 1);
      this.sunPoolMesh.position.set(0, 0.02, -1.6);
      this.worldGroup.add(this.sunPoolMesh);
    }

    // ===== 5. Small Teal Watchman Door & Peek Window (Back Left) =====
    {
      const doorFrame = new THREE.Group();
      doorFrame.position.set(-3.15, 0, -4.22);
      this.worldGroup.add(doorFrame);

      // Door jambs
      [-0.58, 0.58].forEach((dx) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.72, 0.18), woodDark);
        post.position.set(dx, 0.86, 0);
        doorFrame.add(post);
      });
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.1, 0.18), woodDark);
      lintel.position.set(0, 1.74, 0);
      doorFrame.add(lintel);

      // Warm glow behind slightly ajar teal door
      const doorBackGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.06, 1.66),
        new THREE.MeshBasicMaterial({ color: 0xffdea6, fog: false })
      );
      doorBackGlow.position.set(0, 0.84, -0.02);
      doorFrame.add(doorBackGlow);

      // Slightly open teal door leaf
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-0.54, 0, 0.05);
      doorPivot.rotation.y = 0.55;
      doorFrame.add(doorPivot);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.66, 0.06), tealMat);
      leaf.position.set(0.54, 0.83, 0);
      doorPivot.add(leaf);
      [0.42, 1.24].forEach((py) => {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.02), tealDarkMat);
        inset.position.set(0.54, py, 0.035);
        doorPivot.add(inset);
      });
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), brassMat);
      knob.position.set(0.95, 0.82, 0.06);
      doorPivot.add(knob);

      // Striped teal-and-cream welcome mat
      const matTex = this.makeCanvasTex(128, 76, (g, w, h) => {
        g.fillStyle = '#ece0c4';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? '#4fa89b' : '#ece0c4';
          g.fillRect(0, i * 13 + 2, w, 10);
        }
      });
      const matMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.65),
        new THREE.MeshStandardMaterial({ map: matTex, roughness: 1 })
      );
      matMesh.rotation.x = -Math.PI / 2;
      matMesh.position.set(0, 0.018, 0.56);
      doorFrame.add(matMesh);

      // Peek window right next to door
      const peek = new THREE.Group();
      peek.position.set(-1.35, 1.9, 0.03);
      doorFrame.add(peek);
      const pGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), glassMat);
      peek.add(pGlass);
      [
        [0, 0.4, 0.86, 0.06],
        [0, -0.4, 0.86, 0.06],
        [-0.4, 0, 0.06, 0.86],
        [0.4, 0, 0.06, 0.86],
        [0, 0, 0.03, 0.76],
        [0, 0, 0.76, 0.03],
      ].forEach(([px, py, pw, ph]) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.08), creamMat);
        bar.position.set(px, py, 0.02);
        peek.add(bar);
      });
    }

    // ===== 6. Pendant Light & Overhead Warm Glow =====
    {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 8), woodDark);
      cord.position.set(0, 5.75, 0.15);
      this.worldGroup.add(cord);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), brassMat);
      cap.position.set(0, 5.1, 0.15);
      this.worldGroup.add(cap);
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xfff2d2, fog: false })
      );
      globe.position.set(0, 4.92, 0.15);
      this.worldGroup.add(globe);
      this.pendantGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffd896,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      this.pendantGlow.scale.set(3.4, 3.4, 1);
      this.pendantGlow.position.set(0, 4.92, 0.15);
      this.worldGroup.add(this.pendantGlow);
    }

    // ===== 7. Base Potted Plants & Fire Extinguisher =====
    this.addPottedPlant(-4.45, -3.55, 1.15);
    this.addPottedPlant(4.45, -3.55, 1.0);
    // Red apartment stairwell fire extinguisher
    {
      const ext = new THREE.Group();
      ext.position.set(-4.85, 0, -3.7);
      this.worldGroup.add(ext);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.54, 14),
        new THREE.MeshStandardMaterial({ color: 0xc2352c, roughness: 0.38, metalness: 0.32 })
      );
      body.position.y = 0.27;
      ext.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 10), woodDark);
      neck.position.y = 0.58;
      ext.add(neck);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), woodDark);
      handle.position.set(0.06, 0.63, 0);
      ext.add(handle);
    }

    // ===== 8. Upgrade Group 1: Glowing Hourglasses & Extra Time Ripples =====
    this.worldGroup.add(this.hourglassExtraGroup);
    [
      [-1.7, -3.35],
      [1.7, -3.35],
    ].forEach(([hx, hz]) => {
      const hg = this.buildHourglass(1.35);
      hg.position.set(hx, 0, hz);
      this.hourglassExtraGroup.add(hg);
    });

    // ===== 9. Upgrade Group 2: Arch Window Bulb Garland =====
    this.worldGroup.add(this.garlandGroup);
    {
      const wireMat = new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.8 });
      const bulbColors = [0xffe094, 0x9cf2e2, 0xffc682];
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        pts.push(new THREE.Vector3(-4.9 + 9.8 * u, 4.95 - Math.sin(u * Math.PI) * 0.55, -4.1));
      }
      for (let i = 0; i < 18; i++) {
        this.addSegment(pts[i], pts[i + 1], 0.01, wireMat, this.garlandGroup);
      }
      for (let i = 1; i < 18; i += 2) {
        const q = pts[i];
        const col = bulbColors[i % 3];
        const bMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 10, 8),
          new THREE.MeshBasicMaterial({ color: col, fog: false })
        );
        bMesh.position.set(q.x, q.y - 0.06, q.z);
        this.garlandGroup.add(bMesh);
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowTex,
            color: col,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          })
        );
        sp.scale.set(0.68, 0.68, 1);
        sp.position.copy(bMesh.position);
        this.garlandGroup.add(sp);
        this.garlandBulbs.push({ sprite: sp, mesh: bMesh, phase: i * 0.85 });
      }
    }

    // ===== 10. Upgrade Group 3: Lost-and-Found Shelf & Room Key Hook Board (Left Wall) =====
    this.worldGroup.add(this.lostShelfExtraGroup);
    {
      const shelf = new THREE.Group();
      shelf.position.set(-5.25, 0, -1.65);
      shelf.rotation.y = Math.PI / 2;
      this.lostShelfExtraGroup.add(shelf);

      const W = 2.6;
      const D = 0.42;
      const H = 2.65;
      const ys = [0.14, 0.72, 1.3, 1.88, 2.46];
      [-1, 1].forEach((s) => {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, H, D), woodMid);
        side.position.set(s * (W * 0.5 - 0.035), H * 0.5, 0);
        shelf.add(side);
      });
      const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), woodDark);
      back.position.set(0, H * 0.5, -D * 0.5 + 0.015);
      shelf.add(back);
      ys.forEach((y) => {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), woodMid);
        pl.position.set(0, y, 0);
        shelf.add(pl);
      });

      // Row 1: Labeled craft boxes ("かぎ" "イヤホン" "コイン" "ボタン")
      [
        ['かぎ', -0.9],
        ['イヤホン', -0.3],
        ['コイン', 0.3],
        ['ボタン', 0.9],
      ].forEach(([lbl, bx]) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.32), kraftMat);
        box.position.set(bx as number, ys[0] + 0.19, 0);
        shelf.add(box);
        const tag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.28, 0.14),
          new THREE.MeshStandardMaterial({
            map: this.makePaperTex([lbl as string], 160, 80, '#f4ecd6', '#4a301c'),
            roughness: 0.9,
          })
        );
        tag.position.set(bx as number, ys[0] + 0.21, 0.165);
        shelf.add(tag);
      });

      // Row 2: Glass jars of coins & buttons + small glowing hourglass
      [-0.78, -0.25, 0.28].forEach((jx, idx) => {
        const jarBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 16), glassMat);
        jarBody.position.set(jx, ys[1] + 0.19, 0);
        shelf.add(jarBody);
        const fillCols = [0xe8bc52, 0x4fa89b, 0xd86254];
        const fill = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.21, 14),
          new THREE.MeshStandardMaterial({ color: fillCols[idx], roughness: 0.5 })
        );
        fill.position.set(jx, ys[1] + 0.12, 0);
        shelf.add(fill);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), woodDark);
        lid.position.set(jx, ys[1] + 0.38, 0);
        shelf.add(lid);
      });
      const miniHg = this.buildHourglass(0.88);
      miniHg.position.set(0.86, ys[1] + 0.02, 0);
      shelf.add(miniHg);

      // Row 3: Lost colorful items + brass bell + miniature lantern
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 14), brassMat);
      bell.position.set(-0.75, ys[2] + 0.09, 0.02);
      shelf.add(bell);
      const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.18), plaidMat);
      scarf.position.set(-0.2, ys[2] + 0.07, 0);
      scarf.rotation.y = 0.2;
      shelf.add(scarf);
      const capItem = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x305078, roughness: 0.9 })
      );
      capItem.scale.set(1, 0.72, 1);
      capItem.position.set(0.35, ys[2] + 0.09, 0);
      shelf.add(capItem);
      const miniLantern = this.buildLantern(0.85);
      miniLantern.position.set(0.88, ys[2] + 0.02, 0);
      shelf.add(miniLantern);

      // Row 4: Watch journals & brass binders
      const spineCols = [0x2b6762, 0xa83c34, 0x334d74, 0xd8a846, 0x5c3e66, 0x2b6762, 0x447594];
      let bx = -1.05;
      spineCols.forEach((c) => {
        const bw = 0.09;
        const bh = 0.32 + rnd() * 0.08;
        const bk = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, 0.24),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.72 })
        );
        bk.position.set(bx, ys[3] + 0.03 + bh * 0.5, 0);
        shelf.add(bk);
        bx += bw + 0.02;
      });
    }

    // Room key hook board ("302", "5F", "あさ", "B1", "204")
    {
      const kb = new THREE.Group();
      kb.position.set(-5.42, 2.35, -3.55);
      kb.rotation.y = Math.PI / 2;
      this.lostShelfExtraGroup.add(kb);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.04), woodMid);
      kb.add(board);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.93, 0.02), woodDark);
      frame.position.z = -0.015;
      kb.add(frame);
      const tags = ['302', '5F', 'あさ', 'B1', '204'];
      tags.forEach((t, idx) => {
        const kx = (idx - 2) * 0.24;
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 6), brassMat);
        hook.rotation.x = Math.PI / 2;
        hook.position.set(kx, 0.14, 0.04);
        kb.add(hook);
        const keyMat = idx % 2 === 0 ? silverMat : brassMat;
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 12), keyMat);
        bow.position.set(kx, 0.08, 0.055);
        kb.add(bow);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.006), keyMat);
        shaft.position.set(kx, 0.01, 0.055);
        kb.add(shaft);
        const tag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, 0.09),
          new THREE.MeshStandardMaterial({
            map: this.makePaperTex([t], 96, 60, '#f6edcf', '#4c321c'),
            roughness: 0.9,
          })
        );
        tag.position.set(kx, -0.18, 0.04);
        kb.add(tag);
      });
    }

    // ===== 11. Upgrade Group 4: Almost-Stopped Pendulum Clock & Handrail Model Table (Right Wall) =====
    this.worldGroup.add(this.clockModelExtraGroup);
    {
      // Tall Grandfather Pendulum Clock
      const ck = new THREE.Group();
      ck.position.set(5.2, 0, -2.95);
      ck.rotation.y = -Math.PI / 2;
      this.clockModelExtraGroup.add(ck);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.64, 0.46), woodDark);
      base.position.y = 0.32;
      ck.add(base);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.54, 1.45, 0.36), woodMid);
      trunk.position.y = 1.36;
      ck.add(trunk);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.78, 0.44), woodDark);
      hood.position.y = 2.46;
      ck.add(hood);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), brassMat);
      finial.position.y = 2.94;
      ck.add(finial);

      // Clock face
      const dialTex = this.makeCanvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#f6eed8';
        g.fillRect(0, 0, w, h);
        g.translate(128, 128);
        g.fillStyle = '#362418';
        for (let i = 0; i < 12; i++) {
          g.save();
          g.rotate((i / 12) * Math.PI * 2);
          g.fillRect(-3, -114, 6, i % 3 ? 14 : 26);
          g.restore();
        }
        g.save();
        g.rotate(1.36);
        g.fillRect(-5, -68, 10, 74);
        g.restore();
        g.save();
        g.rotate(3.78);
        g.fillRect(-3.5, -96, 7, 102);
        g.restore();
        g.beginPath();
        g.arc(0, 0, 9, 0, Math.PI * 2);
        g.fill();
      });
      const dial = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 36),
        new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.55 })
      );
      dial.position.set(0, 2.48, 0.23);
      ck.add(dial);
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.018, 8, 36), brassMat);
      bezel.position.set(0, 2.48, 0.23);
      ck.add(bezel);

      // Pendulum cavity + glass + swinging brass pendulum!
      const cavity = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 1.15, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.9 })
      );
      cavity.position.set(0, 1.36, 0.17);
      ck.add(cavity);
      const pGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 1.15), glassMat);
      pGlass.position.set(0, 1.36, 0.2);
      ck.add(pGlass);

      this.pendulumPivot = new THREE.Group();
      this.pendulumPivot.position.set(0, 1.88, 0.185);
      ck.add(this.pendulumPivot);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.88, 6), brassMat);
      rod.position.y = -0.44;
      this.pendulumPivot.add(rod);
      const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 24), brassMat);
      bob.rotation.x = Math.PI / 2;
      bob.position.y = -0.9;
      this.pendulumPivot.add(bob);
      const pGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffe49c,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pGlow.scale.set(0.55, 0.55, 1);
      pGlow.position.set(0, -0.9, 0.03);
      this.pendulumPivot.add(pGlow);
    }

    // Round wooden side table with miniature staircase handrail model & teal desk lamp
    {
      const tbl = new THREE.Group();
      tbl.position.set(4.15, 0, -3.25);
      this.clockModelExtraGroup.add(tbl);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 28), woodMid);
      top.position.y = 0.82;
      tbl.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 12), woodDark);
      leg.position.y = 0.41;
      tbl.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.05, 20), woodDark);
      foot.position.y = 0.025;
      tbl.add(foot);

      // Miniature stair & brass handrail model
      const md = new THREE.Group();
      md.position.set(0.06, 0.85, 0.04);
      md.rotation.y = 0.42;
      tbl.add(md);
      for (let i = 0; i < 6; i++) {
        const st = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.045 * (i + 1), 0.09),
          i % 2 ? creamMat : stepMat
        );
        st.position.set(0, 0.0225 * (i + 1), -0.24 + i * 0.09);
        md.add(st);
      }
      this.addSegment(
        new THREE.Vector3(-0.16, 0.17, -0.24),
        new THREE.Vector3(-0.16, 0.42, 0.21),
        0.012,
        brassMat,
        md
      );

      // Green-teal desk lamp
      const lmp = new THREE.Group();
      lmp.position.set(-0.24, 0.85, -0.14);
      tbl.add(lmp);
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 16), brassMat);
      lb.position.y = 0.015;
      lmp.add(lb);
      const ls = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8), brassMat);
      ls.position.y = 0.15;
      lmp.add(ls);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.14, 18, 1, true), tealDarkMat);
      shade.position.y = 0.28;
      lmp.add(shade);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0c4 })
      );
      bulb.position.y = 0.24;
      lmp.add(bulb);
    }

    // ===== 12. Upgrade Group 5: Teal Hooded Cloak Hook & Cozy Window Cushion =====
    this.worldGroup.add(this.cloakCushionGroup);
    {
      // Cozy round cushion + plaid blanket + stacked books + lantern near the arched window
      const nook = new THREE.Group();
      nook.position.set(2.45, 0, -3.55);
      this.cloakCushionGroup.add(nook);
      const cush = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.2, 32), tealDarkMat);
      cush.position.y = 0.1;
      nook.add(cush);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), creamMat);
      inner.scale.set(1, 0.18, 1);
      inner.position.y = 0.19;
      nook.add(inner);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.62), plaidMat);
      blanket.position.set(0.1, 0.24, 0.05);
      blanket.rotation.set(0.05, 0.35, -0.05);
      nook.add(blanket);
      const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), creamMat);
      pillow.scale.set(1.15, 0.45, 0.85);
      pillow.position.set(-0.32, 0.32, -0.2);
      nook.add(pillow);

      const lantern = this.buildLantern(1.15);
      lantern.position.set(0.92, 0, -0.25);
      nook.add(lantern);

      // Teal hooded cloak & leather satchel hanging on right wall
      const rack = new THREE.Group();
      rack.position.set(5.42, 0, -1.5);
      rack.rotation.y = -Math.PI / 2;
      this.cloakCushionGroup.add(rack);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.04), woodMid);
      bar.position.y = 2.05;
      rack.add(bar);
      // Hanging cloak silhouette
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.15, 20, 1, true), tealMat);
      cloak.position.set(0, 1.44, 0.14);
      rack.add(cloak);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), tealMat);
      hood.position.set(0, 2.04, 0.1);
      rack.add(hood);
      // Leather satchel
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.22, 0.09),
        new THREE.MeshStandardMaterial({ color: 0x6b3d1f, roughness: 0.6 })
      );
      bag.position.set(-0.38, 1.78, 0.12);
      rack.add(bag);
    }

    // ===== 13. Upgrade Group 6: Watch Journal, Stair Blueprint, Corkboard & Wall Memo =====
    this.worldGroup.add(this.journalBlueprintGroup);
    {
      // Wall memo "だいじょうぶ。ほんの少しだけだからね。" next to arched window
      const memo = new THREE.Group();
      memo.position.set(-1.72, 2.48, -4.2);
      memo.rotation.z = 0.04;
      this.journalBlueprintGroup.add(memo);
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.68),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTex(
            ['だいじょうぶ。', 'ほんの少しだけ', 'だからね。'],
            320,
            236,
            '#fbf3da',
            '#2b6762'
          ),
          roughness: 0.9,
        })
      );
      memo.add(paper);
      [-1, 1].forEach((s) => {
        const tape = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.045, 0.008),
          new THREE.MeshStandardMaterial({ color: 0xe8d9a0, roughness: 0.8 })
        );
        tape.position.set(s * 0.36, 0.31, 0.008);
        tape.rotation.z = s * 0.36;
        memo.add(tape);
      });

      // Staircase blueprint ("おどりば — ほんの少しだけ、ゆっくり") on back-right wall
      const bp = new THREE.Group();
      bp.position.set(2.35, 2.55, -4.2);
      this.journalBlueprintGroup.add(bp);
      const bpFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.86, 0.05), woodDark);
      bp.add(bpFrame);
      const bpTex = this.makeCanvasTex(320, 224, (c, w, h) => {
        c.fillStyle = '#254a74';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 1;
        for (let i = 0; i < w; i += 16) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, h);
          c.stroke();
        }
        for (let i = 0; i < h; i += 16) {
          c.beginPath();
          c.moveTo(0, i);
          c.lineTo(w, i);
          c.stroke();
        }
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(28, 190);
        for (let i = 0; i < 8; i++) {
          c.lineTo(28 + i * 32, 190 - i * 19);
          c.lineTo(60 + i * 32, 190 - i * 19);
        }
        c.stroke();
        c.fillStyle = '#fff';
        c.font = '700 20px "Zen Maru Gothic",sans-serif';
        c.fillText('おどりば', 190, 38);
        c.font = '700 13px "Zen Maru Gothic",sans-serif';
        c.fillText('ほんの少しだけ、ゆっくり', 142, 62);
      });
      const bpFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.06, 0.74),
        new THREE.MeshStandardMaterial({ map: bpTex, roughness: 0.78 })
      );
      bpFace.position.z = 0.03;
      bp.add(bpFace);

      // Corkboard on left wall ("ゆっくり" "きをつけて" "いってらっしゃい" "おかえり")
      const cb = new THREE.Group();
      cb.position.set(-5.42, 2.35, 0.7);
      cb.rotation.y = Math.PI / 2;
      this.journalBlueprintGroup.add(cb);
      const cork = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.92, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xb88a52, roughness: 0.95 })
      );
      cb.add(cork);
      [
        ['ゆっくり', -0.32, 0.2, '#fbf3da', -0.05],
        ['きをつけて', 0.28, 0.22, '#d8f0ec', 0.05],
        ['いってらっしゃい', -0.26, -0.2, '#f6e3b4', 0.04],
        ['おかえり', 0.3, -0.18, '#fbf3da', -0.04],
      ].forEach(([txt, x, y, bg, rz]) => {
        const note = new THREE.Mesh(
          new THREE.PlaneGeometry(0.42, 0.28),
          new THREE.MeshStandardMaterial({
            map: this.makePaperTex([txt as string], 200, 130, bg as string, '#2b6762'),
            roughness: 0.9,
          })
        );
        note.position.set(x as number, y as number, 0.03);
        note.rotation.z = rz as number;
        cb.add(note);
      });
    }

    // ===== 14. Ambient Floating Slow-Time Props & Concentric Time Ripple Rings =====
    for (let i = 0; i < 3; i++) {
      const rMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1.0, 64),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x9cf2e2 : 0xffe8b0,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        })
      );
      rMesh.rotation.x = -Math.PI / 2;
      rMesh.position.set(0, 0.04 + i * 0.02, 0.15);
      rMesh.userData.idx = i;
      this.worldGroup.add(rMesh);
      this.ambientTimeRings.push(rMesh);
    }

    // Subtle decorative floating coffee cup & pocket watch high near the arch window
    const decorCup = new THREE.Group();
    const cupShell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.22, 16), glassMat);
    decorCup.add(cupShell);
    const cupLiquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.08, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: 0x99e0f2, transparent: true, opacity: 0.72, roughness: 0.12 })
    );
    cupLiquid.position.y = -0.02;
    decorCup.add(cupLiquid);
    decorCup.position.set(-0.9, 3.1, -3.2);
    decorCup.rotation.set(0.55, 0.3, 0.45);
    this.worldGroup.add(decorCup);
    this.decorFloats.push({
      group: decorCup,
      basePos: decorCup.position.clone(),
      baseRot: decorCup.rotation.clone(),
      phase: 0.4,
      amp: 0.12,
    });

    const decorWatch = new THREE.Group();
    const wBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.036, 20), brassMat);
    wBody.rotation.x = Math.PI / 2;
    decorWatch.add(wBody);
    const wRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 14), brassMat);
    wRing.position.y = 0.145;
    decorWatch.add(wRing);
    decorWatch.position.set(1.05, 3.35, -3.15);
    decorWatch.rotation.set(0.2, -0.4, 0.18);
    this.worldGroup.add(decorWatch);
    this.decorFloats.push({
      group: decorWatch,
      basePos: decorWatch.position.clone(),
      baseRot: decorWatch.rotation.clone(),
      phase: 2.2,
      amp: 0.11,
    });

    // ===== 15. Morning Dust Motes Floating Slowly in Sunbeams =====
    const dustCount = 130;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const bx = (rnd() * 2 - 1) * 5.2;
      const by = 0.35 + rnd() * 4.5;
      const bz = -3.8 + rnd() * 7.6;
      const ph = rnd() * Math.PI * 2;
      this.dustBase.push([bx, by, bz, ph]);
      dustPos[i * 3] = bx;
      dustPos[i * 3 + 1] = by;
      dustPos[i * 3 + 2] = bz;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        color: 0xfff4d8,
        size: 0.12,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);

    // ===== 16. Build 4 Interactive Stumble Spots (Morning Residents about to trip!) =====
    this.buildStumbleSpots();
  }

  private buildHourglass(scale = 1): THREE.Group {
    const g = new THREE.Group();
    g.scale.setScalar(scale);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b462c, roughness: 0.65 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8ad56, metalness: 0.78, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xdff6f8,
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const sand = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: 0xffc856,
      emissiveIntensity: 0.72,
      roughness: 0.4,
    });
    [0.02, 0.46].forEach((y) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 18), wood);
      cap.position.y = y;
      g.add(cap);
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6), brass);
      rod.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.11);
      g.add(rod);
    }
    const bulb1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), glass);
    bulb1.position.y = 0.13;
    g.add(bulb1);
    const bulb2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), glass);
    bulb2.rotation.x = Math.PI;
    bulb2.position.y = 0.35;
    g.add(bulb2);
    const sandBot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.11, 14), sand);
    sandBot.position.y = 0.085;
    g.add(sandBot);
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), sand);
    stream.position.y = 0.24;
    g.add(stream);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe094,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(0.75, 0.75, 1);
    glow.position.y = 0.24;
    g.add(glow);
    return g;
  }

  private buildLantern(scale = 1): THREE.Group {
    const g = new THREE.Group();
    g.scale.setScalar(scale);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8ad56, metalness: 0.78, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xe6f2f6,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.04, 14), brass);
    base.position.y = 0.02;
    g.add(base);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 14), glass);
    tube.position.y = 0.15;
    g.add(tube);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdf94 })
    );
    flame.scale.set(1, 1.6, 1);
    flame.position.y = 0.13;
    g.add(flame);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.08, 14), brass);
    top.position.y = 0.3;
    g.add(top);
    const gl = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffcc78,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    gl.scale.set(0.95, 0.95, 1);
    gl.position.y = 0.15;
    g.add(gl);
    return g;
  }

  private addPottedPlant(x: number, z: number, scale = 1): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    this.worldGroup.add(g);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.17, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: 0xb8643c, roughness: 0.82 })
    );
    pot.position.y = 0.17;
    g.add(pot);
    const leafMats = [0x347546, 0x459256, 0x2b623c].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 })
    );
    for (let i = 0; i < 10; i++) {
      const a = i * 2.39;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), leafMats[i % 3]);
      leaf.scale.set(0.55, 1.6, 0.22);
      leaf.position.set(Math.sin(a) * 0.15, 0.45 + (i % 3) * 0.12, Math.cos(a) * 0.15);
      leaf.rotation.set(Math.cos(a) * 0.52, 0, -Math.sin(a) * 0.52);
      g.add(leaf);
    }
  }

  private buildStumbleSpots(): void {
    this.spotVisuals = STUMBLE_SPOTS.map((spot) => {
      const group = new THREE.Group();
      group.position.set(spot.x, 0, spot.z);
      group.rotation.y = spot.rotY;
      this.worldGroup.add(group);

      // Subtle floor pad
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(0.94, 36),
        new THREE.MeshBasicMaterial({
          color: 0x1b3438,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.016;
      group.add(pad);

      // Outer background track ring
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.84, 0.96, 40),
        new THREE.MeshBasicMaterial({
          color: 0x3b6e68,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.024;
      group.add(ringBg);

      // Dynamic charge fill ring (grows & glows teal-gold as resident regains balance!)
      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 0.96, 40),
        new THREE.MeshBasicMaterial({
          color: 0x8ef2df,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.032;
      group.add(ringFill);

      // Soft pulsing time-ripple ring underneath
      const timeRipple = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.68, 36),
        new THREE.MeshBasicMaterial({
          color: 0xffe49c,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      timeRipple.rotation.x = -Math.PI / 2;
      timeRipple.position.y = 0.029;
      group.add(timeRipple);

      // Translucent morning resident silhouette (leans precariously when in danger, stands tall when saved!)
      const silhouettePivot = new THREE.Group();
      silhouettePivot.position.set(0, 0.04, 0);
      group.add(silhouettePivot);

      const silhouetteMat = new THREE.MeshStandardMaterial({
        color: 0xdcf4f8,
        emissive: 0x5bc9ba,
        emissiveIntensity: 0.42,
        transparent: true,
        opacity: 0.56,
        roughness: 0.35,
      });

      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 6, 12), silhouetteMat);
      torso.position.y = 0.72;
      silhouettePivot.add(torso);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), silhouetteMat);
      head.position.y = 1.2;
      silhouettePivot.add(head);

      // Outstretched balancing arms
      [-1, 1].forEach((s) => {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.28, 4, 8), silhouetteMat);
        arm.position.set(s * 0.26, 0.88, 0.08);
        arm.rotation.z = s * 0.65;
        arm.rotation.x = -0.35;
        silhouettePivot.add(arm);
      });

      // Tiny tumbling cup hovering beside the resident's hand!
      const miniCup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.048, 0.13, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfff2cc,
          emissive: 0xffd27a,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.75,
        })
      );
      miniCup.position.set(0.36, 0.98, 0.16);
      miniCup.rotation.z = 0.45;
      silhouettePivot.add(miniCup);

      // Overhead halo sprite
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0x8ef2df,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.set(1.6, 1.6, 1);
      halo.position.set(0, 1.05, 0);
      group.add(halo);

      const glowLight = new THREE.PointLight(0x8ef2df, 0.8, 4.2, 1.5);
      glowLight.position.set(0, 1.15, 0);
      group.add(glowLight);

      return {
        group,
        ringFill,
        ringBg,
        silhouettePivot,
        silhouetteMat,
        halo,
        glowLight,
        timeRipple,
        dangerColor: new THREE.Color(0xf28b6b),
        safeColor: new THREE.Color(0x8ef2df),
        pulse: 0,
      };
    });
  }

  public syncUpgrades(state: TsumazukiSaveState): void {
    const u = state.upgrades;
    this.hourglassExtraGroup.visible = u.hourglasses > 0;
    this.hourglassExtraGroup.scale.setScalar(0.82 + Math.min(0.32, u.hourglasses * 0.04));

    this.garlandGroup.visible = u.archWindow > 0;
    this.lostShelfExtraGroup.visible = u.lostShelf > 0;
    this.clockModelExtraGroup.visible = u.pendulumClock > 0;
    this.cloakCushionGroup.visible = u.tealCloak > 0;
    this.journalBlueprintGroup.visible = u.watchJournal > 0;
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public triggerShake(intensity = 0.18, duration = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public triggerMorningFlash(): void {
    this.sunFlashTimer = 0.85;
  }

  /**
   * Update a stumble spot visual:
   *  - stability: 0 (about to trip!) .. 100 (safely steadied!)
   */
  public updateSpotVisual(
    spotId: number,
    stability: number,
    steadying: boolean,
    cooldown: number,
    elapsed: number,
    timeScale: number
  ): void {
    const v = this.spotVisuals[spotId];
    if (!v) return;

    const ratio = Math.max(0, Math.min(1, stability / 100));
    const danger = 1 - ratio;
    const col = new THREE.Color().lerpColors(v.dangerColor, v.safeColor, ratio);
    if (cooldown > 0) col.setHex(0xfff0b2);

    const fillMat = v.ringFill.material as THREE.MeshBasicMaterial;
    fillMat.color.copy(col);
    fillMat.opacity = cooldown > 0 ? 0.92 : steadying ? 0.85 : 0.42 + danger * 0.44;
    const s = 0.36 + ratio * 0.68;
    v.ringFill.scale.setScalar(s);

    const rippleMat = v.timeRipple.material as THREE.MeshBasicMaterial;
    const ripCycle = (elapsed * (steadying ? 1.1 : 0.55) * Math.max(0.35, timeScale) + spotId * 0.25) % 1;
    v.timeRipple.scale.setScalar(0.65 + ripCycle * 0.72);
    rippleMat.opacity = (steadying ? 0.56 : 0.24) * Math.sin(ripCycle * Math.PI);
    rippleMat.color.setHex(steadying ? 0x9cf2e2 : 0xffe49c);

    // Lean silhouette forward/sideways when danger is high; straighten smoothly when steadied!
    const wobbleFreq = (steadying ? 2.4 : 6.2) * Math.max(0.3, timeScale);
    const wobble = Math.sin(elapsed * wobbleFreq + spotId * 1.9);
    const leanAmount = cooldown > 0 ? 0 : danger * 0.46;
    v.silhouettePivot.rotation.z = leanAmount * 0.75 + wobble * (0.04 + danger * 0.14);
    v.silhouettePivot.rotation.x = leanAmount * 0.55;
    v.silhouettePivot.position.y = cooldown > 0 ? 0.08 + Math.sin(elapsed * 8) * 0.04 : 0.04;

    v.silhouetteMat.color.copy(col);
    v.silhouetteMat.emissive.copy(col);
    v.silhouetteMat.emissiveIntensity = cooldown > 0 ? 0.95 : steadying ? 0.72 : 0.34 + danger * 0.38;
    v.silhouetteMat.opacity = cooldown > 0 ? 0.82 : 0.48 + danger * 0.26;

    const haloMat = v.halo.material as THREE.SpriteMaterial;
    haloMat.color.copy(col);
    haloMat.opacity = cooldown > 0 ? 0.85 : steadying ? 0.65 : 0.26 + danger * 0.35;
    const hs = 1.35 + (steadying ? 0.42 : 0) + (cooldown > 0 ? 0.45 : 0);
    v.halo.scale.set(hs, hs, 1);

    v.glowLight.color.copy(col);
    v.glowLight.intensity = cooldown > 0 ? 2.2 : steadying ? 1.7 : 0.6 + danger * 0.9;
  }

  /** Launch a gleaming recovered item gracefully back toward the sunlit arch window / resident */
  public launchReturnedItemArc(fromWorld: THREE.Vector3, count = 1): void {
    for (let i = 0; i < count; i++) {
      const grp = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), this.tealOrbMat);
      grp.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 20), this.goldRingMat);
      ring.rotation.x = Math.PI / 2;
      grp.add(ring);

      const start = fromWorld.clone().add(new THREE.Vector3((i - (count - 1) / 2) * 0.32, 0.45, 0));
      const end = new THREE.Vector3((Math.random() - 0.5) * 1.8, 3.05 + Math.random() * 0.6, -4.05);
      const ctrl = start
        .clone()
        .lerp(end, 0.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.0, 0.4));

      grp.position.copy(start);
      this.worldGroup.add(grp);
      this.returningArcs.push({
        group: grp,
        start,
        ctrl,
        end,
        t: 0,
        dur: 0.72 + Math.random() * 0.25,
      });
    }
  }

  public screenToFloor(
    virtualX: number,
    virtualY: number,
    width: number,
    height: number
  ): THREE.Vector3 | null {
    this.tmpNdc.set((virtualX / width) * 2 - 1, -(virtualY / height) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpNdc, this.camera);
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, out);
    return hit ? out : null;
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    width: number,
    height: number
  ): { x: number; y: number } {
    const v = worldPos.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
    };
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean,
    worldTimeScale = 1.0
  ): void {
    this.simClock += dt * worldTimeScale;
    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    if (this.sunFlashTimer > 0) this.sunFlashTimer = Math.max(0, this.sunFlashTimer - dt);

    // Smooth camera transition between lobby overview & active landing watch
    const desiredPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.22) * 1.45, 4.9, 8.7)
        : new THREE.Vector3(0, 8.45, 7.35);
    const desiredTarget =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.5, -1.1)
        : new THREE.Vector3(0, 0.3, -0.35);

    const k = 1 - Math.exp(-3.4 * dt);
    this.camPos.lerp(desiredPos, k);
    this.camTarget.lerp(desiredTarget, k);

    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const amp = this.shakeIntensity * (this.shakeTimer / 0.25);
      sx = (Math.random() - 0.5) * amp;
      sy = (Math.random() - 0.5) * amp;
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camTarget);

    // Dynamic lighting response to beat, TIME SLOW, and SLOW SECOND fever
    const isSlow = worldTimeScale < 0.7;
    if (isFever) {
      this.scene.background = new THREE.Color(0x162933);
      this.archWinLight.color.setHex(0xfff0b8);
      this.archWinLight.intensity = 3.8 + beatPulse * 1.2;
      this.pendLight.color.setHex(0x9cf5e4);
      this.pendLight.intensity = 3.2 + energy * 1.2;
      this.hemiLight.intensity = 1.15;
    } else if (isSlow) {
      this.scene.background = new THREE.Color(0x0d212b);
      this.archWinLight.color.setHex(0xbef5ea);
      this.archWinLight.intensity = 3.1 + beatPulse * 0.6;
      this.pendLight.color.setHex(0xffe0a0);
      this.pendLight.intensity = 2.6;
      this.hemiLight.intensity = 0.96;
    } else {
      this.scene.background = new THREE.Color(0x0f1826);
      this.archWinLight.color.setHex(0xffe6bc);
      this.archWinLight.intensity = 2.4 + beatPulse * 0.5 + this.sunFlashTimer * 1.8;
      this.pendLight.color.setHex(0xffcf88);
      this.pendLight.intensity = 2.2 + energy * 0.55;
      this.hemiLight.intensity = 0.88;
    }
    (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background);

    this.doorLight.intensity = 1.35 + Math.sin(elapsed * 2.6) * 0.2;
    this.pendantGlow.scale.setScalar(3.3 + beatPulse * 0.45);

    // Morning sunbeam pulse
    this.sunBeamGroup.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = (isFever ? 0.26 : isSlow ? 0.21 : 0.13) + Math.sin(elapsed * 1.4) * 0.03 + this.sunFlashTimer * 0.14;
      m.color.setHex(isFever ? 0xfff0b8 : isSlow ? 0xbef5ea : 0xfff3d8);
    });
    const poolMat = this.sunPoolMesh.material as THREE.MeshBasicMaterial;
    poolMat.opacity = (isFever ? 0.52 : isSlow ? 0.44 : 0.3) + beatPulse * 0.08;

    // Almost-stopped pendulum clock swings smoothly scaled by worldTimeScale!
    if (this.pendulumPivot) {
      this.pendulumPhase += dt * 1.35 * worldTimeScale;
      this.pendulumPivot.rotation.z = Math.sin(this.pendulumPhase) * 0.24;
    }

    // Garland bulbs shimmer
    for (const b of this.garlandBulbs) {
      const tw = 0.48 + 0.32 * Math.sin(elapsed * 2.4 + b.phase);
      (b.sprite.material as THREE.SpriteMaterial).opacity = isFever ? 0.9 : tw;
    }

    // Ambient slow-time concentric ripples on the circular rug
    for (const r of this.ambientTimeRings) {
      const idx = r.userData.idx as number;
      const p = (this.simClock * 0.22 + idx / 3) % 1;
      r.scale.setScalar(0.65 + p * 2.45);
      const rm = r.material as THREE.MeshBasicMaterial;
      rm.opacity = (isFever ? 0.45 : isSlow ? 0.42 : 0.22) * Math.sin(p * Math.PI);
    }

    // Decorative floating cup & watch drift peacefully with time scale
    for (const df of this.decorFloats) {
      const st = this.simClock;
      df.group.position.set(
        df.basePos.x + Math.sin(st * 0.7 + df.phase) * df.amp * 0.6,
        df.basePos.y + Math.sin(st * 0.9 + df.phase) * df.amp,
        df.basePos.z + Math.cos(st * 0.6 + df.phase) * df.amp * 0.5
      );
      df.group.rotation.set(
        df.baseRot.x + Math.sin(st * 0.5 + df.phase) * 0.16,
        df.baseRot.y + st * 0.24,
        df.baseRot.z + Math.cos(st * 0.45 + df.phase) * 0.14
      );
    }

    // Morning sunlit dust motes
    const dAttr = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.dustBase.length; i++) {
      const [bx, by, bz, ph] = this.dustBase[i];
      dAttr.setXYZ(
        i,
        bx + Math.sin(this.simClock * 0.45 + ph) * 0.35,
        0.3 + ((by + this.simClock * 0.14) % 4.6),
        bz + Math.cos(this.simClock * 0.38 + ph) * 0.32
      );
    }
    dAttr.needsUpdate = true;

    // Returning item parabolic arcs
    for (let i = this.returningArcs.length - 1; i >= 0; i--) {
      const arc = this.returningArcs[i];
      arc.t += dt / arc.dur;
      if (arc.t >= 1) {
        this.worldGroup.remove(arc.group);
        this.returningArcs.splice(i, 1);
        continue;
      }
      const u = arc.t;
      const inv = 1 - u;
      arc.group.position.set(
        inv * inv * arc.start.x + 2 * inv * u * arc.ctrl.x + u * u * arc.end.x,
        inv * inv * arc.start.y + 2 * inv * u * arc.ctrl.y + u * u * arc.end.y,
        inv * inv * arc.start.z + 2 * inv * u * arc.ctrl.z + u * u * arc.end.z
      );
      arc.group.rotation.y += dt * 7;
      arc.group.rotation.x += dt * 4;
      const sc = 1 - u * 0.45;
      arc.group.scale.setScalar(sc);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
