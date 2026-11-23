import * as THREE from 'three';
import { TALLY_SPOTS } from './config';
import { KazoeruSaveState } from './types';

interface TallySpotVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  tallyCanvas: HTMLCanvasElement;
  tallyTex: THREE.CanvasTexture;
  tallyBoard: THREE.Mesh;
  wispPivot: THREE.Group;
  wispMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
  accentColor: THREE.Color;
  doneColor: THREE.Color;
  lastRenderedStrokes: number;
  lastRenderedUrgent: boolean;
  pulse: number;
}

interface ScrollArchiveArc {
  group: THREE.Group;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  dur: number;
}

interface DynamicBoardRef {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  title: string;
  color: string;
  lastCount: number;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * 3D Moonlit Night Park & Under-Bench Counting Study for Kazoeru.
 * Faithfully fuses the official picturebook (`story.txt`, `kazoeru_image.png`) and
 * official room tour (`カゾエルの部屋.html`):
 *  - Starry midnight-blue sky, glowing crescent moon, distant city skyline & park trees
 *  - Iconic 2-seat park swing set under the moonlight (seat 1 gently sways with the beat
 *    and sweeps high on completed 正 tallies & SWING TALLY!)
 *  - Warm wrought-iron park streetlamp with volumetric light cone & golden floor pool
 *  - Ivy-draped brick wall with the glowing round under-bench study portal
 *  - Wooden park bench with brass oil lantern & signboard ("だれにもほめられなかった日でも…☆")
 *  - Circular woven "正" emblem rug at the heart of the moonlit clearing + wildflowers & leaves
 *  - Left study wall: 3 live-updating chalkboards ("わらった" / "かなしかった" / "がんばった")
 *    that dynamically draw 正 marks as you play, plus knit beanie & scarf rack, yellow stool & scroll basket
 *  - Right study wall: counting desk with giant open 正 notebook, 5-color abacus, live tally counter,
 *    glass jar shelf (pebbles / beans / glass beads), brass balance scale, round moonlit park window,
 *    ribbon-tied scroll shelves, and synchronized miniature swing chain model!
 *  - Back frieze banner: "ちゃんと、数えているよ。" flanked by 正 marks + brass wall clock
 *  - Overhead glass bead garlands ("ガラス玉の数珠"), hanging tiny red lantern, & drifting fireflies
 */
export class ParkStudyScene {
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
  private moonDirLight: THREE.DirectionalLight;
  private streetLampLight: THREE.PointLight;
  private benchLanternLight: THREE.PointLight;
  private portalLight: THREE.PointLight;
  private redLanternLight: THREE.PointLight;
  private deskLight: THREE.PointLight;

  // Animated environment props
  private swingSeat1!: THREE.Group;
  private swingSeat2!: THREE.Group;
  private miniSwingSeat!: THREE.Group;
  private swingExtraEnergy = 0;
  private swingPhase = 0;
  private streetLampGlow!: THREE.Sprite;
  private streetLampBeam!: THREE.Mesh;
  private benchLanternGlow!: THREE.Sprite;
  private portalGlow!: THREE.Sprite;
  private redLanternGroup!: THREE.Group;
  private redLanternGlow!: THREE.Sprite;
  private moonSprite!: THREE.Sprite;
  private starPoints!: THREE.Points;
  private beadGarlandGlows: { sprite: THREE.Sprite; phase: number }[] = [];
  private fireflyPoints!: THREE.Points;
  private fireflyBase: [number, number, number, number][] = [];
  private scrollArcs: ScrollArchiveArc[] = [];

  // Live dynamic chalkboards & counter display
  private chalkboards: Record<'smile' | 'tear' | 'effort', DynamicBoardRef> = {} as Record<
    'smile' | 'tear' | 'effort',
    DynamicBoardRef
  >;
  private counterCanvas!: HTMLCanvasElement;
  private counterTex!: THREE.CanvasTexture;
  private lastCounterDisplay = -1;

  // Upgrade-responsive 3D prop groups
  private notebookExtraGroup = new THREE.Group();
  private beadGarlandGroup = new THREE.Group();
  private scrollShelfExtraGroup = new THREE.Group();
  private swingModelExtraGroup = new THREE.Group();
  private knitScarfGroup = new THREE.Group();
  private jarBalanceExtraGroup = new THREE.Group();

  // Interactive 4 tally spots
  private spotVisuals: TallySpotVisual[] = [];

  // Shared materials for scroll archive arcs
  private scrollPaperMat: THREE.MeshStandardMaterial;
  private scrollRibbonMat: THREE.MeshStandardMaterial;

  private moonlightFlashTimer = 0;
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
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x081022);
    this.scene.fog = new THREE.FogExp2(0x081022, 0.018);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 140);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.scrollPaperMat = new THREE.MeshStandardMaterial({
      color: 0xf4ecd6,
      emissive: 0xd8a84a,
      emissiveIntensity: 0.45,
      roughness: 0.6,
    });
    this.scrollRibbonMat = new THREE.MeshStandardMaterial({
      color: 0xd85a4a,
      emissive: 0xa63a2a,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });

    this.scene.add(this.worldGroup);

    // Midnight park moonlight + warm lantern contrast
    this.hemiLight = new THREE.HemisphereLight(0x88a8e0, 0x2a2d28, 0.72);
    this.scene.add(this.hemiLight);

    this.moonDirLight = new THREE.DirectionalLight(0xb8d0ff, 0.85);
    this.moonDirLight.position.set(-5.5, 12.5, -7.0);
    this.moonDirLight.castShadow = true;
    this.moonDirLight.shadow.mapSize.set(1024, 1024);
    this.moonDirLight.shadow.camera.near = 1;
    this.moonDirLight.shadow.camera.far = 36;
    const d = 9.5;
    this.moonDirLight.shadow.camera.left = -d;
    this.moonDirLight.shadow.camera.right = d;
    this.moonDirLight.shadow.camera.top = d;
    this.moonDirLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonDirLight);

    this.streetLampLight = new THREE.PointLight(0xffc978, 2.8, 19, 1.18);
    this.streetLampLight.position.set(2.9, 4.4, -3.5);
    this.scene.add(this.streetLampLight);

    this.benchLanternLight = new THREE.PointLight(0xffb85e, 2.2, 12, 1.25);
    this.benchLanternLight.position.set(0.95, 1.35, 3.05);
    this.scene.add(this.benchLanternLight);

    this.portalLight = new THREE.PointLight(0xffcf88, 1.65, 10, 1.35);
    this.portalLight.position.set(-3.3, 1.15, -3.55);
    this.scene.add(this.portalLight);

    this.redLanternLight = new THREE.PointLight(0xff7d54, 1.15, 9, 1.4);
    this.redLanternLight.position.set(-4.1, 3.0, -1.2);
    this.scene.add(this.redLanternLight);

    this.deskLight = new THREE.PointLight(0xffd698, 1.5, 11, 1.3);
    this.deskLight.position.set(4.5, 2.6, 0.2);
    this.scene.add(this.deskLight);

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
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(m);
    return m;
  }

  private buildEnvironment(): void {
    const rnd = createSeededRandom(808);
    const FNT = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif";

    // Materials
    const woodTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        for (let i = 0; i < 5; i++) {
          const ph = h / 5;
          const y0 = i * ph;
          g.fillStyle = `hsl(${26 + rnd() * 6}, ${34 + rnd() * 8}%, ${28 + rnd() * 8}%)`;
          g.fillRect(0, y0, w, ph);
          for (let k = 0; k < 20; k++) {
            g.strokeStyle =
              rnd() < 0.5 ? `rgba(20,10,5,${0.05 + rnd() * 0.08})` : `rgba(255,220,170,${0.04 + rnd() * 0.07})`;
            g.lineWidth = 0.8 + rnd() * 1.2;
            const yy = y0 + rnd() * ph;
            g.beginPath();
            g.moveTo(0, yy);
            g.bezierCurveTo(w * 0.3, yy + (rnd() - 0.5) * 4, w * 0.7, yy + (rnd() - 0.5) * 4, w, yy);
            g.stroke();
          }
          g.fillStyle = 'rgba(10,5,3,0.5)';
          g.fillRect(0, y0, w, 2);
        }
      },
      2,
      2
    );

    const grassTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#12201d';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1600; i++) {
          g.strokeStyle = `hsl(${136 + rnd() * 28}, ${22 + rnd() * 14}%, ${13 + rnd() * 11}%)`;
          g.lineWidth = 1 + rnd();
          const x = rnd() * w;
          const y = rnd() * h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (rnd() - 0.5) * 5, y - 3 - rnd() * 7);
          g.stroke();
        }
      },
      10,
      10
    );

    const gravelTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#333b4a';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) {
          const l = 24 + rnd() * 28;
          g.fillStyle = `hsl(${210 + rnd() * 20}, 14%, ${l}%)`;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.6, 0, Math.PI * 2);
          g.fill();
        }
      },
      4,
      4
    );

    const brickTex = this.makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#19222a';
        g.fillRect(0, 0, w, h);
        const rows = 8;
        const bh = h / rows;
        for (let j = 0; j < rows; j++) {
          const n = 4;
          const bw = w / n;
          const o = (j % 2) * (bw / 2);
          for (let i = -1; i <= n; i++) {
            const l = 20 + rnd() * 10;
            g.fillStyle = `hsl(${198 + rnd() * 18}, ${14 + rnd() * 10}%, ${l}%)`;
            g.fillRect(i * bw + o + 2, j * bh + 2, bw - 4, bh - 4);
          }
        }
      },
      3,
      1.2
    );

    const woodM = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.72 });
    const woodDarkM = new THREE.MeshStandardMaterial({ color: 0x4c3424, roughness: 0.78 });
    const brassM = new THREE.MeshStandardMaterial({ color: 0xd4a44c, metalness: 0.78, roughness: 0.3 });
    const ironM = new THREE.MeshStandardMaterial({ color: 0x26303c, metalness: 0.65, roughness: 0.45 });
    const plasterTealM = new THREE.MeshStandardMaterial({ color: 0x294246, roughness: 0.9 });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0xdbeeff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const creamM = new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.85 });

    // ===== 1. Starry Night Sky, Crescent Moon & City Skyline =====
    {
      const starCount = 340;
      const pos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const a = rnd() * Math.PI * 2;
        const elev = 0.18 + rnd() * 0.95;
        const r = 68;
        pos[i * 3] = Math.cos(a) * Math.cos(elev) * r;
        pos[i * 3 + 1] = Math.sin(elev) * r * 0.75 + 6;
        pos[i * 3 + 2] = -Math.abs(Math.sin(a)) * Math.cos(elev) * r * 0.85 - 12;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.starPoints = new THREE.Points(
        sg,
        new THREE.PointsMaterial({
          color: 0xe6f0ff,
          size: 2.0,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.88,
          fog: false,
          depthWrite: false,
        })
      );
      this.worldGroup.add(this.starPoints);

      // Glowing Crescent Moon canvas sprite
      const moonTex = this.makeCanvasTex(256, 256, (g, W, H) => {
        g.clearRect(0, 0, W, H);
        const halo = g.createRadialGradient(128, 128, 12, 128, 128, 120);
        halo.addColorStop(0, 'rgba(255, 248, 220, 0.85)');
        halo.addColorStop(0.35, 'rgba(186, 210, 255, 0.32)');
        halo.addColorStop(1, 'rgba(186, 210, 255, 0)');
        g.fillStyle = halo;
        g.fillRect(0, 0, W, H);

        // Crescent mask via offscreen composition
        const c2 = document.createElement('canvas');
        c2.width = W;
        c2.height = H;
        const g2 = c2.getContext('2d')!;
        g2.fillStyle = '#fff9df';
        g2.beginPath();
        g2.arc(124, 128, 46, 0, Math.PI * 2);
        g2.fill();
        g2.globalCompositeOperation = 'destination-out';
        g2.beginPath();
        g2.arc(144, 114, 41, 0, Math.PI * 2);
        g2.fill();
        g.drawImage(c2, 0, 0);
      });
      this.moonSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: moonTex,
          transparent: true,
          opacity: 0.96,
          fog: false,
          depthWrite: false,
        })
      );
      this.moonSprite.position.set(-2.6, 7.4, -22);
      this.moonSprite.scale.set(5.4, 5.4, 1);
      this.worldGroup.add(this.moonSprite);

      // Distant city skyline silhouettes with warm lit windows (matching kazoeru_image.png)
      const skyGroup = new THREE.Group();
      skyGroup.position.set(0, 0, -17.5);
      this.worldGroup.add(skyGroup);
      const bldgMat = new THREE.MeshBasicMaterial({ color: 0x0c162c });
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffd584 });
      for (let i = -7; i <= 7; i++) {
        const bw = 1.15 + rnd() * 1.1;
        const bh = 2.4 + rnd() * 4.2;
        const bx = i * 2.15 + (rnd() - 0.5) * 0.5;
        const bz = (rnd() - 0.5) * 2.2;
        const bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.9), bldgMat);
        bm.position.set(bx, bh / 2, bz);
        skyGroup.add(bm);

        const rows = Math.floor(bh * 1.5);
        for (let r = 1; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            if (rnd() < 0.42) {
              const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.16), winMat);
              wm.position.set(bx - bw * 0.28 + c * bw * 0.28, r * 0.58, bz + 0.46);
              skyGroup.add(wm);
            }
          }
        }
      }

      // Park perimeter trees & fence silhouettes
      const treeMat = new THREE.MeshStandardMaterial({ color: 0x0e1d20, roughness: 0.95 });
      const treeCoords: [number, number][] = [
        [-9.2, -9.8],
        [-5.8, -11.4],
        [6.4, -10.6],
        [9.6, -8.8],
        [-9.4, -3.2],
        [9.6, -2.5],
        [-8.8, 3.8],
        [8.9, 3.6],
      ];
      for (const [tx, tz] of treeCoords) {
        const tg = new THREE.Group();
        tg.position.set(tx, 0, tz);
        this.worldGroup.add(tg);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 7), woodDarkM);
        trunk.position.y = 1.7;
        tg.add(trunk);
        [
          [0, 4.3, 0, 1.85],
          [0.95, 3.6, 0.3, 1.35],
          [-0.95, 3.7, -0.25, 1.4],
        ].forEach(([cx, cy, cz, cr]) => {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(cr, 9, 7), treeMat);
          leaf.position.set(cx, cy, cz);
          tg.add(leaf);
        });
      }

      // Low wrought-iron park fence behind the swing clearing
      const fenceBar = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 0.06), ironM);
      fenceBar.position.set(0, 1.05, -7.8);
      this.worldGroup.add(fenceBar);
      for (let fx = -7.6; fx <= 7.6; fx += 0.95) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), ironM);
        post.position.set(fx, 0.58, -7.8);
        this.worldGroup.add(post);
      }
    }

    // ===== 2. Park Ground, Clearing, Woven "正" Rug, Leaves & Wildflowers =====
    const grassGround = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 38),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.96 })
    );
    grassGround.rotation.x = -Math.PI / 2;
    grassGround.position.set(0, -0.02, -1);
    grassGround.receiveShadow = true;
    this.worldGroup.add(grassGround);

    // Moonlit gravel clearing (play floor)
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 56),
      new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 0.92 })
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(0, 0.002, 0.15);
    clearing.receiveShadow = true;
    this.worldGroup.add(clearing);

    // Iconic circular woven "正" rug from room_tour.html!
    const rugTex = this.makeCanvasTex(512, 512, (g, w, h) => {
      const c = 256;
      g.clearRect(0, 0, w, h);
      const ring = (r: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.fill();
      };
      ring(250, '#e8dcc0');
      ring(236, '#234c54');
      ring(212, '#e8c45a');
      ring(202, '#234c54');
      ring(176, '#7a352c');
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        g.save();
        g.translate(c + Math.cos(a) * 146, c + Math.sin(a) * 146);
        g.rotate(a);
        g.fillStyle = '#f0ca6a';
        g.beginPath();
        g.moveTo(-22, 0);
        g.quadraticCurveTo(0, -11, 22, 0);
        g.quadraticCurveTo(0, 11, -22, 0);
        g.fill();
        g.restore();
      }
      ring(106, '#234c54');
      ring(96, '#e8dcc0');
      ring(84, '#7a352c');
      g.fillStyle = '#f4de8a';
      g.font = `700 112px ${FNT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('正', c, c + 6);
    });
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(2.05, 56),
      new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.92, transparent: true })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.35);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // Streetlamp warm light pool on the clearing
    const poolTex = this.makeCanvasTex(256, 256, (g, w, h) => {
      const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      r.addColorStop(0, 'rgba(255, 200, 116, 0.52)');
      r.addColorStop(0.5, 'rgba(255, 190, 110, 0.18)');
      r.addColorStop(1, 'rgba(255, 190, 110, 0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, h);
    });
    const lampPool = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 48),
      new THREE.MeshBasicMaterial({
        map: poolTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lampPool.rotation.x = -Math.PI / 2;
    lampPool.position.set(2.5, 0.016, -2.6);
    this.worldGroup.add(lampPool);

    // Fallen leaves & little white wildflowers (matching kazoeru_image.png foreground)
    const leafColors = [0xb8623a, 0xd9a441, 0x8a4a2a].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide })
    );
    for (let i = 0; i < 42; i++) {
      const ang = rnd() * Math.PI * 2;
      const dist = 2.6 + rnd() * 4.4;
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), leafColors[i % 3]);
      lf.position.set(Math.cos(ang) * dist, 0.018, Math.sin(ang) * dist);
      lf.rotation.set(-Math.PI / 2, 0, rnd() * 6.28);
      this.worldGroup.add(lf);
    }

    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xf4f0e4,
      emissive: 0x6a789a,
      emissiveIntensity: 0.2,
      roughness: 0.7,
    });
    const stamenMat = new THREE.MeshStandardMaterial({ color: 0xf2ca62, roughness: 0.6 });
    const flowerSpots: [number, number][] = [
      [-4.6, 3.2],
      [-4.2, 3.55],
      [-3.85, 3.3],
      [4.5, 3.1],
      [4.1, 3.45],
      [-4.9, -2.5],
      [4.95, -2.4],
    ];
    for (const [fx, fz] of flowerSpots) {
      const fg = new THREE.Group();
      fg.position.set(fx, 0, fz);
      this.worldGroup.add(fg);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.02, 0.28, 5),
        new THREE.MeshStandardMaterial({ color: 0x264b34, roughness: 0.9 })
      );
      stem.position.y = 0.14;
      fg.add(stem);
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), stamenMat);
      center.position.y = 0.29;
      fg.add(center);
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        const pet = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), petalMat);
        pet.scale.set(1, 0.35, 1.3);
        pet.position.set(Math.cos(pa) * 0.055, 0.285, Math.sin(pa) * 0.055);
        pet.rotation.y = -pa;
        fg.add(pet);
      }
    }

    // ===== 3. Iconic Two-Seat Park Swing Set (Back Center under the Moon!) =====
    {
      const swingRoot = new THREE.Group();
      swingRoot.position.set(0.0, 0, -3.85);
      this.worldGroup.add(swingRoot);

      const pipeMat = new THREE.MeshStandardMaterial({
        color: 0x3b4d60,
        roughness: 0.52,
        metalness: 0.55,
      });
      const chainMat = new THREE.MeshStandardMaterial({
        color: 0xb0bcc8,
        roughness: 0.38,
        metalness: 0.78,
      });

      [-1.75, 1.75].forEach((x) => {
        this.addSegment(new THREE.Vector3(x, 0, -1.0), new THREE.Vector3(x, 3.1, 0), 0.068, pipeMat, swingRoot);
        this.addSegment(new THREE.Vector3(x, 0, 1.0), new THREE.Vector3(x, 3.1, 0), 0.068, pipeMat, swingRoot);
      });
      const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 3.8, 12), pipeMat);
      topBar.rotation.z = Math.PI / 2;
      topBar.position.set(0, 3.1, 0);
      topBar.castShadow = true;
      swingRoot.add(topBar);

      const makeSeat = (xOff: number): THREE.Group => {
        const sw = new THREE.Group();
        sw.position.set(xOff, 3.1, 0);
        swingRoot.add(sw);
        [-0.28, 0.28].forEach((cx) => {
          const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.35, 6), chainMat);
          chain.position.set(cx, -1.175, 0);
          sw.add(chain);
        });
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.065, 0.3), woodM);
        plank.position.set(0, -2.37, 0);
        plank.castShadow = true;
        sw.add(plank);
        return sw;
      };
      this.swingSeat1 = makeSeat(-0.62);
      this.swingSeat2 = makeSeat(0.62);
      this.swingSeat2.rotation.x = 0.03;
    }

    // ===== 4. Park Streetlamp (Back-Right) with Volumetric Glow Cone =====
    {
      const lampG = new THREE.Group();
      lampG.position.set(2.9, 0, -3.5);
      this.worldGroup.add(lampG);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.85, 10), ironM);
      pole.position.y = 1.92;
      pole.castShadow = true;
      lampG.add(pole);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 12), ironM);
      base.position.y = 0.08;
      lampG.add(base);

      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.56), ironM);
      collar.position.y = 3.88;
      lampG.add(collar);

      const glassBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.56, 0.44),
        new THREE.MeshStandardMaterial({
          color: 0xfff3cc,
          emissive: 0xffcf78,
          emissiveIntensity: 1.35,
          transparent: true,
          opacity: 0.96,
        })
      );
      glassBox.position.y = 4.18;
      lampG.add(glassBox);

      [
        [-0.23, -0.23],
        [0.23, -0.23],
        [-0.23, 0.23],
        [0.23, 0.23],
      ].forEach(([cx, cz]) => {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.58, 0.035), ironM);
        strut.position.set(cx, 4.18, cz);
        lampG.add(strut);
      });

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.28, 4), ironM);
      cap.position.y = 4.58;
      cap.rotation.y = Math.PI / 4;
      lampG.add(cap);

      this.streetLampGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffd280,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.streetLampGlow.scale.set(4.8, 4.8, 1);
      this.streetLampGlow.position.set(0, 4.18, 0);
      lampG.add(this.streetLampGlow);

      const beamTex = this.makeCanvasTex(8, 128, (g) => {
        const r = g.createLinearGradient(0, 0, 0, 128);
        r.addColorStop(0, 'rgba(255, 224, 165, 0.85)');
        r.addColorStop(1, 'rgba(255, 224, 165, 0.02)');
        g.fillStyle = r;
        g.fillRect(0, 0, 8, 128);
      });
      this.streetLampBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 2.35, 3.9, 28, 1, true),
        new THREE.MeshBasicMaterial({
          map: beamTex,
          color: 0xffd699,
          transparent: true,
          opacity: 0.085,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      this.streetLampBeam.position.set(0, 2.05, 0);
      lampG.add(this.streetLampBeam);
    }

    // ===== 5. Brick Wall & Glowing Round Under-Bench Study Portal (Back-Left) =====
    {
      const wallG = new THREE.Group();
      wallG.position.set(-3.45, 0, -3.75);
      wallG.rotation.y = 0.24;
      this.worldGroup.add(wallG);

      const sh = new THREE.Shape();
      sh.moveTo(-2.1, 0);
      sh.lineTo(2.1, 0);
      sh.lineTo(2.1, 2.75);
      sh.lineTo(-2.1, 2.75);
      sh.lineTo(-2.1, 0);
      const hole = new THREE.Path();
      hole.absarc(0, 0.56, 0.48, 0, Math.PI * 2, true);
      sh.holes.push(hole);

      const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
      const wallMesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: false, curveSegments: 28 }),
        [brickMat, woodDarkM]
      );
      wallMesh.position.z = -0.34;
      wallMesh.receiveShadow = true;
      wallG.add(wallMesh);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.048, 10, 36), woodM);
      rim.position.set(0, 0.56, 0.02);
      wallG.add(rim);

      const brassRim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.018, 8, 36), brassM);
      brassRim.position.set(0, 0.56, 0.05);
      wallG.add(brassRim);

      const portalBack = new THREE.Mesh(
        new THREE.CircleGeometry(0.47, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd288 })
      );
      portalBack.position.set(0, 0.56, -0.28);
      wallG.add(portalBack);

      this.portalGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffcf82,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.portalGlow.scale.set(2.4, 2.4, 1);
      this.portalGlow.position.set(0, 0.56, 0.14);
      wallG.add(this.portalGlow);

      // Ivy leaves draping along the top of the brick wall
      const ivyMats = [0x213d2c, 0x2c4f37, 0x1a3022].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
      );
      for (let i = 0; i < 36; i++) {
        const ix = -2.0 + rnd() * 4.0;
        const iy = 2.75 - rnd() * 1.15;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12 + rnd() * 0.08, 6, 5), ivyMats[i % 3]);
        leaf.scale.set(1.1, 0.75, 0.45);
        leaf.position.set(ix, iy, 0.05);
        wallG.add(leaf);
      }

      // Back chalkboard frieze mural: "ちゃんと、数えているよ。" (from room_tour.html!)
      const muralTex = this.makeCanvasTex(860, 180, (c, W2, H2) => {
        c.fillStyle = '#1f3b37';
        c.fillRect(0, 0, W2, H2);
        c.strokeStyle = 'rgba(244, 222, 138, 0.25)';
        c.lineWidth = 4;
        c.strokeRect(8, 8, W2 - 16, H2 - 16);
        c.font = `700 26px ${FNT}`;
        c.fillStyle = 'rgba(244, 236, 214, 0.34)';
        for (let k = 0; k < 4; k++) {
          c.fillText('正', 22 + k * 30, 48);
          c.fillText('正', 22 + k * 30, 146);
          c.fillText('正', W2 - 138 + k * 30, 48);
          c.fillText('正', W2 - 138 + k * 30, 146);
        }
        c.fillStyle = '#f4de8a';
        c.font = `700 54px ${FNT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('ちゃんと、数えているよ。', W2 / 2, H2 / 2 + 2);
      });
      const muralFrame = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.82, 0.06), woodDarkM);
      muralFrame.position.set(0, 2.02, 0.05);
      wallG.add(muralFrame);
      const muralPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.7),
        new THREE.MeshStandardMaterial({ map: muralTex, roughness: 0.88 })
      );
      muralPlane.position.set(0, 2.02, 0.09);
      wallG.add(muralPlane);
    }

    // ===== 6. Front Wooden Park Bench, Brass Oil Lantern & Park Signboard =====
    {
      const benchG = new THREE.Group();
      benchG.position.set(0.0, 0, 3.72);
      benchG.rotation.y = Math.PI;
      this.worldGroup.add(benchG);

      for (let i = 0; i < 4; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.055, 0.11), woodM);
        slat.position.set(0, 0.62, -0.17 + i * 0.115);
        slat.castShadow = true;
        benchG.add(slat);
      }
      for (let i = 0; i < 3; i++) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.105, 0.04), woodM);
        back.position.set(0, 0.82 + i * 0.135, -0.26 - i * 0.025);
        back.rotation.x = -0.18;
        benchG.add(back);
      }
      [-1.02, 1.02].forEach((lx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.64, 0.52), ironM);
        leg.position.set(lx, 0.32, 0);
        benchG.add(leg);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.06), ironM);
        post.position.set(lx, 0.9, -0.26);
        post.rotation.x = -0.18;
        benchG.add(post);
      });

      // Brass oil lantern resting on the bench
      const oilG = new THREE.Group();
      oilG.position.set(-0.92, 0.65, 0.02);
      benchG.add(oilG);
      const oilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 14), brassM);
      oilBase.position.y = 0.04;
      oilG.add(oilBase);
      const oilGlass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.24, 14),
        new THREE.MeshStandardMaterial({
          color: 0xffe8a8,
          emissive: 0xffb84a,
          emissiveIntensity: 1.4,
          transparent: true,
          opacity: 0.92,
        })
      );
      oilGlass.position.y = 0.2;
      oilG.add(oilGlass);
      const oilCap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.11, 14), brassM);
      oilCap.position.y = 0.37;
      oilG.add(oilCap);

      this.benchLanternGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffc668,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.benchLanternGlow.scale.set(1.75, 1.75, 1);
      this.benchLanternGlow.position.set(0, 0.22, 0);
      oilG.add(this.benchLanternGlow);

      // Wooden park signboard (left of bench, matching kazoeru_image.png!)
      const signG = new THREE.Group();
      signG.position.set(-2.35, 0, 3.2);
      signG.rotation.y = 0.42;
      this.worldGroup.add(signG);

      const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.05, 0.11), woodDarkM);
      signPost.position.set(0, 0.52, -0.065);
      signG.add(signPost);

      const signFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.96, 0.08), woodDarkM);
      signFrame.position.y = 1.28;
      signG.add(signFrame);

      const signTex = this.makeCanvasTex(280, 220, (g, W, H) => {
        g.fillStyle = '#ddd2bc';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#6c533c';
        g.lineWidth = 6;
        g.strokeRect(8, 8, W - 16, H - 16);
        g.fillStyle = '#2d241c';
        g.font = `700 22px ${FNT}`;
        g.fillText('だれにも', 24, 52);
        g.fillText('ほめられなかった日でも、', 24, 92);
        g.fillText('その がんばりは', 24, 134);
        g.fillText('消えていない。 ☆', 24, 176);
      });
      const signFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.06, 0.84),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.88 })
      );
      signFace.position.set(0, 1.28, 0.044);
      signG.add(signFace);
    }

    // ===== 7. Left Counting Study Wall — 3 Live Chalkboards (わらった / かなしかった / がんばった) =====
    {
      const leftWallG = new THREE.Group();
      leftWallG.position.set(-5.35, 0, 0.2);
      leftWallG.rotation.y = Math.PI / 2 - 0.1;
      this.worldGroup.add(leftWallG);

      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.0, 0.16), plasterTealM);
      backPanel.position.set(0, 1.5, -0.14);
      leftWallG.add(backPanel);

      const wainscot = new THREE.Mesh(new THREE.BoxGeometry(6.82, 0.95, 0.19), woodDarkM);
      wainscot.position.set(0, 0.48, -0.12);
      leftWallG.add(wainscot);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.05, 0.22), brassM);
      rail.position.set(0, 0.97, -0.11);
      leftWallG.add(rail);

      const defs: Array<{ key: 'smile' | 'tear' | 'effort'; x: number; title: string; color: string; initN: number }> = [
        { key: 'smile', x: -1.85, title: 'わらった', color: '#f4de8a', initN: 8 },
        { key: 'tear', x: 0.0, title: 'かなしかった', color: '#a8d0e6', initN: 5 },
        { key: 'effort', x: 1.85, title: 'がんばった', color: '#f2c4b8', initN: 12 },
      ];

      for (const bd of defs) {
        const bg = new THREE.Group();
        bg.position.set(bd.x, 1.92, 0);
        leftWallG.add(bg);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.22, 0.07), woodM);
        bg.add(frame);

        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 270;
        const tex = new THREE.CanvasTexture(canvas);
        const ref: DynamicBoardRef = {
          canvas,
          tex,
          title: bd.title,
          color: bd.color,
          lastCount: -1,
        };
        this.chalkboards[bd.key] = ref;
        this.redrawChalkboard(ref, bd.initN);

        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(1.48, 1.08),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 })
        );
        face.position.z = 0.04;
        bg.add(face);

        const tray = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.045, 0.09), woodM);
        tray.position.set(0, -0.64, 0.05);
        bg.add(tray);

        [-0.24, 0, 0.2].forEach((cx, ci) => {
          const chalk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6),
            new THREE.MeshStandardMaterial({ color: [0xf4ecd6, 0xf4de8a, 0xa8d0e6][ci], roughness: 0.9 })
          );
          chalk.rotation.z = Math.PI / 2;
          chalk.position.set(cx, -0.61, 0.075);
          bg.add(chalk);
        });
      }

      // Hanging tiny red lantern (from room_tour.html!)
      this.redLanternGroup = new THREE.Group();
      this.redLanternGroup.position.set(-4.1, 3.25, -1.2);
      this.worldGroup.add(this.redLanternGroup);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.95, 5), ironM);
      cord.position.y = 0.5;
      this.redLanternGroup.add(cord);
      const redBody = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xd43b30,
          emissive: 0xc84522,
          emissiveIntensity: 0.85,
          roughness: 0.42,
        })
      );
      redBody.scale.set(0.86, 1.28, 0.86);
      this.redLanternGroup.add(redBody);
      [0.26, -0.26].forEach((ry) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 12), brassM);
        cap.position.y = ry;
        this.redLanternGroup.add(cap);
      });
      this.redLanternGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xff8a54,
          transparent: true,
          opacity: 0.68,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.redLanternGlow.scale.set(1.9, 1.9, 1);
      this.redLanternGroup.add(this.redLanternGlow);
    }

    // ===== 8. Right Counting Study Wall — Desk, Notebook, Abacus, Live Counter, Jars, Round Window & Mini Swing =====
    {
      const rightWallG = new THREE.Group();
      rightWallG.position.set(5.35, 0, 0.2);
      rightWallG.rotation.y = -Math.PI / 2 + 0.1;
      this.worldGroup.add(rightWallG);

      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.0, 0.16), plasterTealM);
      backPanel.position.set(0, 1.5, -0.14);
      rightWallG.add(backPanel);

      const wainscot = new THREE.Mesh(new THREE.BoxGeometry(6.82, 0.95, 0.19), woodDarkM);
      wainscot.position.set(0, 0.48, -0.12);
      rightWallG.add(wainscot);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.05, 0.22), brassM);
      rail.position.set(0, 0.97, -0.11);
      rightWallG.add(rail);

      // Round brass window looking out to the moonlit park
      const winG = new THREE.Group();
      winG.position.set(0, 2.02, 0.02);
      rightWallG.add(winG);
      const parkWinTex = this.makeCanvasTex(256, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#0d1838');
        gr.addColorStop(1, '#2a467a');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 42; i++) {
          g.fillStyle = `rgba(255,255,240,${0.35 + rnd() * 0.65})`;
          g.fillRect(rnd() * w, rnd() * h * 0.62, 2, 2);
        }
        g.fillStyle = '#fff6d0';
        g.beginPath();
        g.arc(70, 62, 18, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0d1838';
        g.beginPath();
        g.arc(78, 56, 16, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0a1220';
        g.fillRect(0, h - 56, w, 56);
      });
      winG.add(
        new THREE.Mesh(new THREE.CircleGeometry(0.56, 36), new THREE.MeshBasicMaterial({ map: parkWinTex }))
      );
      const winRim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 10, 36), brassM);
      winRim.position.z = 0.02;
      winG.add(winRim);
      [0, Math.PI / 2].forEach((rz) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.028, 0.03), brassM);
        bar.rotation.z = rz;
        bar.position.z = 0.025;
        winG.add(bar);
      });

      // Counting Desk with giant open notebook, 5-color abacus & live mechanical counter!
      const deskG = new THREE.Group();
      deskG.position.set(0, 0, 0.62);
      rightWallG.add(deskG);
      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 0.96), woodM);
      deskTop.position.y = 0.84;
      deskTop.castShadow = true;
      deskG.add(deskTop);
      [
        [-1.06, -0.38],
        [1.06, -0.38],
        [-1.06, 0.38],
        [1.06, 0.38],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.84, 0.09), woodM);
        leg.position.set(lx, 0.42, lz);
        deskG.add(leg);
      });

      // Giant open notebook
      const nbG = new THREE.Group();
      nbG.position.set(-0.22, 0.89, 0.04);
      deskG.add(nbG);
      nbG.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.035, 0.64),
          new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.7 })
        )
      );
      const nbTex = this.makeCanvasTex(256, 160, (g, W, H) => {
        g.fillStyle = '#f4ecd6';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(70, 120, 140, 0.35)';
        for (let y = 26; y < H; y += 26) {
          g.beginPath();
          g.moveTo(8, y);
          g.lineTo(W - 8, y);
          g.stroke();
        }
        g.fillStyle = '#2a3d5c';
        g.font = `700 18px ${FNT}`;
        g.fillText('きょうのかぞえもの', 14, 22);
        g.font = `700 24px ${FNT}`;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 7; c++) {
            g.fillText('正', 18 + c * 32, 52 + r * 28);
          }
        }
      });
      const nbPage = new THREE.Mesh(
        new THREE.PlaneGeometry(1.08, 0.56),
        new THREE.MeshStandardMaterial({ map: nbTex, roughness: 0.9 })
      );
      nbPage.rotation.x = -Math.PI / 2;
      nbPage.position.y = 0.022;
      nbG.add(nbPage);

      // 5-Color Wooden Abacus (そろばん)
      const abG = new THREE.Group();
      abG.position.set(0.68, 0.98, 0.14);
      abG.rotation.set(-0.35, -0.2, 0);
      deskG.add(abG);
      const beadCols = [0x4fa89b, 0xe8c45a, 0xe49a8a, 0xefe6cf, 0x6aa8d8];
      abG.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.05), woodDarkM));
      for (let r = 0; r < 5; r++) {
        const bx = -0.16 + r * 0.08;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), brassM);
        rod.position.x = bx;
        abG.add(rod);
        for (let k = 0; k < 5; k++) {
          const bead = new THREE.Mesh(
            new THREE.SphereGeometry(0.028, 8, 6),
            new THREE.MeshStandardMaterial({ color: beadCols[(r + k) % 5], roughness: 0.3 })
          );
          bead.scale.set(1, 0.72, 1);
          bead.position.set(bx, -0.095 + k * 0.028 + (k > 2 ? 0.025 : 0), 0.012);
          abG.add(bead);
        }
      }

      // Live Brass Mechanical Tally Counter (数取器)
      const cntG = new THREE.Group();
      cntG.position.set(-0.92, 0.88, 0.22);
      deskG.add(cntG);
      const cntBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.12), brassM);
      cntBody.position.y = 0.07;
      cntG.add(cntBody);
      this.counterCanvas = document.createElement('canvas');
      this.counterCanvas.width = 160;
      this.counterCanvas.height = 56;
      this.counterTex = new THREE.CanvasTexture(this.counterCanvas);
      this.updateMechanicalCounter(0);
      const cntFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.21, 0.07),
        new THREE.MeshStandardMaterial({ map: this.counterTex, roughness: 0.45 })
      );
      cntFace.position.set(0, 0.095, 0.063);
      cntG.add(cntFace);
      const cntBtn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0xc9453a, roughness: 0.4 })
      );
      cntBtn.position.set(0.07, 0.155, 0);
      cntG.add(cntBtn);

      // Green-shaded brass desk lamp
      const dlG = new THREE.Group();
      dlG.position.set(0.92, 0.88, -0.26);
      deskG.add(dlG);
      dlG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 14), brassM));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8), brassM);
      stem.position.y = 0.21;
      dlG.add(stem);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.16, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2e6f68, roughness: 0.42, side: THREE.DoubleSide })
      );
      shade.position.y = 0.42;
      dlG.add(shade);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0c0 })
      );
      bulb.position.y = 0.37;
      dlG.add(bulb);

      // Miniature Swing Chain Model (ブランコの鎖の模型 — syncs with real swing!)
      const miniTable = new THREE.Group();
      miniTable.position.set(2.25, 0, 0.48);
      rightWallG.add(miniTable);
      const mtTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), woodM);
      mtTop.position.y = 0.78;
      miniTable.add(mtTop);
      const mtLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.76, 12), woodDarkM);
      mtLeg.position.y = 0.39;
      miniTable.add(mtLeg);
      const miniFrame = new THREE.Group();
      miniFrame.position.set(0, 0.81, 0);
      miniTable.add(miniFrame);
      [-0.24, 0.24].forEach((mx) => {
        this.addSegment(new THREE.Vector3(mx, 0, -0.14), new THREE.Vector3(mx, 0.46, 0), 0.014, ironM, miniFrame);
        this.addSegment(new THREE.Vector3(mx, 0, 0.14), new THREE.Vector3(mx, 0.46, 0), 0.014, ironM, miniFrame);
      });
      const miniTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.54, 8), ironM);
      miniTop.rotation.z = Math.PI / 2;
      miniTop.position.y = 0.46;
      miniFrame.add(miniTop);
      this.miniSwingSeat = new THREE.Group();
      this.miniSwingSeat.position.set(0, 0.46, 0);
      miniFrame.add(this.miniSwingSeat);
      [-0.04, 0.04].forEach((cx) => {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 5), brassM);
        ch.position.set(cx, -0.16, 0);
        this.miniSwingSeat.add(ch);
      });
      const mSeat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.06), woodM);
      mSeat.position.y = -0.32;
      this.miniSwingSeat.add(mSeat);

      // Scroll Pigeonhole Shelf (right-back)
      const shelfG = new THREE.Group();
      shelfG.position.set(-2.22, 0, 0.3);
      rightWallG.add(shelfG);
      const sw = 1.45;
      const sh = 1.85;
      const sd = 0.4;
      [-1, 1].forEach((side) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, sh, sd), woodDarkM);
        p.position.set(side * (sw / 2), sh / 2, 0);
        shelfG.add(p);
      });
      [0.08, 0.56, 1.04, 1.52, 1.85].forEach((sy) => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.06, 0.04, sd), woodM);
        board.position.set(0, sy, 0);
        shelfG.add(board);
      });
      const ribbonCols = [0xc9453a, 0x4fa89b, 0xe8c45a, 0x456aa8].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })
      );
      [0.08, 0.56, 1.04].forEach((sy, r) => {
        for (let k = 0; k < 5; k++) {
          const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10), creamM);
          sc.rotation.x = Math.PI / 2;
          sc.position.set(-0.48 + k * 0.24, sy + 0.08, 0);
          shelfG.add(sc);
          const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.03, 10), ribbonCols[(k + r) % 4]);
          rb.rotation.x = Math.PI / 2;
          rb.position.set(-0.48 + k * 0.24, sy + 0.08, 0.06);
          shelfG.add(rb);
        }
      });
    }

    // ===== 9. Upgrade-Responsive 3D Prop Groups =====
    this.buildUpgradeGroups(woodM, woodDarkM, brassM, glassM, creamM, rnd);

    // ===== 10. Four Interactive Tally Spots =====
    this.buildTallySpots();

    // ===== 11. Floating Moonlit Fireflies & Golden Dust =====
    {
      const count = 140;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const x = (rnd() * 2 - 1) * 7.2;
        const y = 0.35 + rnd() * 4.4;
        const z = (rnd() * 2 - 1) * 5.8;
        this.fireflyBase.push([x, y, z, rnd() * 6.28]);
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.fireflyPoints = new THREE.Points(
        g,
        new THREE.PointsMaterial({
          map: this.glowTex,
          color: 0xffe6a6,
          size: 0.16,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.worldGroup.add(this.fireflyPoints);
    }
  }

  private buildUpgradeGroups(
    woodM: THREE.Material,
    woodDarkM: THREE.Material,
    brassM: THREE.Material,
    glassM: THREE.Material,
    creamM: THREE.Material,
    rnd: () => number
  ): void {
    // 1. tallyNotebook: Extra golden floating tally lanterns & open notebooks near center edge
    this.worldGroup.add(this.notebookExtraGroup);
    const nbCoords: [number, number][] = [
      [-2.1, -2.9],
      [2.1, -2.9],
      [-4.1, 2.3],
      [4.1, 2.3],
    ];
    nbCoords.forEach(([nx, nz], idx) => {
      const g = new THREE.Group();
      g.position.set(nx, 0, nz);
      g.userData.minLv = idx * 2 + 1;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 12), woodDarkM);
      ped.position.y = 0.21;
      g.add(ped);
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.06, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.6 })
      );
      book.position.y = 0.45;
      book.rotation.y = idx * 0.5;
      g.add(book);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffe49a,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.set(0.85, 0.85, 1);
      halo.position.y = 0.68;
      g.add(halo);
      this.notebookExtraGroup.add(g);
    });

    // 2. parkLamp: Overhead Glass Bead Garlands ("ガラス玉の数珠" from room_tour.html!)
    this.worldGroup.add(this.beadGarlandGroup);
    const beadColors = [0x4fa89b, 0xe8c45a, 0xe49a8a, 0xefe6cf, 0x72b6f0];
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x26201c, roughness: 0.8 });
    [-2.5, 0.1, 2.6].forEach((gz, si) => {
      const strand = new THREE.Group();
      strand.userData.minLv = si + 1;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        pts.push(new THREE.Vector3(-4.9 + 9.8 * u, 4.35 - Math.sin(u * Math.PI) * (0.65 + si * 0.12), gz));
      }
      for (let i = 0; i < 20; i++) {
        this.addSegment(pts[i], pts[i + 1], 0.008, wireMat, strand);
      }
      for (let i = 1; i < 20; i++) {
        const q = pts[i];
        const col = beadColors[(i + si) % beadColors.length];
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 10, 8),
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.45,
            roughness: 0.22,
          })
        );
        bead.position.set(q.x, q.y - 0.06, q.z);
        strand.add(bead);
        if (i % 3 === 0) {
          const sp = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: this.glowTex,
              color: col,
              transparent: true,
              opacity: 0.5,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          sp.scale.set(0.62, 0.62, 1);
          sp.position.set(q.x, q.y - 0.06, q.z);
          strand.add(sp);
          this.beadGarlandGlows.push({ sprite: sp, phase: this.beadGarlandGlows.length * 1.1 });
        }
      }
      this.beadGarlandGroup.add(strand);
    });

    // 3. scrollShelf: Extra rolled scroll baskets & stacked journals
    this.worldGroup.add(this.scrollShelfExtraGroup);
    const basketSpots: [number, number][] = [
      [-4.2, -1.8],
      [-4.2, 2.0],
      [4.2, -2.0],
    ];
    basketSpots.forEach(([bx, bz], idx) => {
      const bg = new THREE.Group();
      bg.position.set(bx, 0, bz);
      bg.userData.minLv = idx * 2 + 1;
      const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.25, 0.42, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x9a7848, roughness: 0.92, side: THREE.DoubleSide })
      );
      basket.position.y = 0.21;
      bg.add(basket);
      for (let k = 0; k < 5; k++) {
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.46, 10), creamM);
        sc.position.set((rnd() - 0.5) * 0.22, 0.38, (rnd() - 0.5) * 0.22);
        sc.rotation.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
        bg.add(sc);
      }
      this.scrollShelfExtraGroup.add(bg);
    });

    // 4. swingChain: Extra glowing lanterns hung on the swing posts & brass wall clock
    this.worldGroup.add(this.swingModelExtraGroup);
    [-1.75, 1.75].forEach((sx, idx) => {
      const lg = new THREE.Group();
      lg.position.set(sx, 2.7, -3.85);
      lg.userData.minLv = idx + 1;
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe49a })
      );
      lg.add(lamp);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffd27a,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(1.4, 1.4, 1);
      lg.add(glow);
      this.swingModelExtraGroup.add(lg);
    });

    // 5. knitScarf: Cozy yellow stool + blue knit scarf & beanie resting near the bench
    this.worldGroup.add(this.knitScarfGroup);
    {
      const sg = new THREE.Group();
      sg.position.set(1.95, 0, 3.28);
      sg.userData.minLv = 1;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18), woodM);
      top.position.y = 0.52;
      sg.add(top);
      const cushion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.07, 18),
        new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.85 })
      );
      cushion.position.y = 0.58;
      sg.add(cushion);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.52, 8), woodM);
        leg.position.set(Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18);
        sg.add(leg);
      }
      // Blue knit beanie on stool
      const beanie = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
        new THREE.MeshStandardMaterial({ color: 0x3b638f, roughness: 0.9 })
      );
      beanie.position.set(0, 0.61, 0);
      sg.add(beanie);
      this.knitScarfGroup.add(sg);
    }

    // 6. jarCollection: Glass jars of pebbles, beans & glowing glass beads + brass balance scale!
    this.worldGroup.add(this.jarBalanceExtraGroup);
    const jarData: Array<{ x: number; z: number; col: number; minLv: number }> = [
      { x: 4.35, z: -1.1, col: 0x9aa6b4, minLv: 1 }, // こいし
      { x: 4.35, z: -0.55, col: 0xc97b42, minLv: 2 }, // まめ
      { x: 4.35, z: 1.55, col: 0x4fa89b, minLv: 3 }, // ガラス玉
      { x: -4.35, z: 0.2, col: 0xe8c45a, minLv: 4 }, // 星小石
    ];
    jarData.forEach((jd) => {
      const jg = new THREE.Group();
      jg.position.set(jd.x, 0, jd.z);
      jg.userData.minLv = jd.minLv;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.42, 16), glassM);
      body.position.y = 0.21;
      jg.add(body);
      const fill = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.16, 0.26, 14),
        new THREE.MeshStandardMaterial({
          color: jd.col,
          emissive: jd.col,
          emissiveIntensity: 0.22,
          roughness: 0.55,
        })
      );
      fill.position.y = 0.14;
      jg.add(fill);
      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.12, 0.08, 14),
        new THREE.MeshStandardMaterial({ color: 0xb0824f, roughness: 0.9 })
      );
      cork.position.y = 0.44;
      jg.add(cork);
      this.jarBalanceExtraGroup.add(jg);
    });

    // Brass balance scale (天秤)
    {
      const sc = new THREE.Group();
      sc.position.set(4.15, 0, 2.25);
      sc.userData.minLv = 2;
      sc.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.06, 16), brassM));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10), brassM);
      post.position.y = 0.36;
      sc.add(post);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.03, 0.03), brassM);
      beam.position.y = 0.72;
      sc.add(beam);
      [-0.34, 0.34].forEach((px) => {
        const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.025, 14), brassM);
        pan.position.set(px, 0.42, 0);
        sc.add(pan);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), brassM);
        chain.position.set(px, 0.57, 0);
        sc.add(chain);
      });
      this.jarBalanceExtraGroup.add(sc);
    }
  }

  private buildTallySpots(): void {
    for (const def of TALLY_SPOTS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      this.worldGroup.add(group);

      const accentColor = new THREE.Color(def.accentHex);
      const doneColor = new THREE.Color(0xfff3b2);

      // Floor base ring
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 0.94, 40),
        new THREE.MeshBasicMaterial({
          color: 0x263858,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.024;
      group.add(ringBg);

      // Floor fill ring (scales with progress 0..1)
      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.96, 40),
        new THREE.MeshBasicMaterial({
          color: accentColor,
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

      // Gentle expanding pulse ring when tallying
      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.0, 40),
        new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.036;
      group.add(pulseRing);

      // Floating glowing 3D 「正」 stroke card above each spot
      const tallyCanvas = document.createElement('canvas');
      tallyCanvas.width = 200;
      tallyCanvas.height = 200;
      const tallyTex = new THREE.CanvasTexture(tallyCanvas);
      const tallyBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({
          map: tallyTex,
          transparent: true,
          opacity: 0.94,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      tallyBoard.position.set(0, 1.48, 0);
      group.add(tallyBoard);

      // Little glowing memory orb / wisp hovering at waist height
      const wispPivot = new THREE.Group();
      wispPivot.position.set(0, 0.62, 0);
      group.add(wispPivot);
      const wispMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      });
      const wispCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 1), wispMat);
      wispPivot.add(wispCore);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: accentColor,
          transparent: true,
          opacity: 0.56,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.set(1.5, 1.5, 1);
      halo.position.set(0, 0.72, 0);
      group.add(halo);

      const glowLight = new THREE.PointLight(def.accentHex, 1.0, 4.6, 1.6);
      glowLight.position.set(0, 0.95, 0);
      group.add(glowLight);

      const vis: TallySpotVisual = {
        group,
        ringFill,
        ringBg,
        tallyCanvas,
        tallyTex,
        tallyBoard,
        wispPivot,
        wispMat,
        halo,
        glowLight,
        pulseRing,
        accentColor,
        doneColor,
        lastRenderedStrokes: -1,
        lastRenderedUrgent: false,
        pulse: def.id * 1.4,
      };
      this.redrawSpotTallyCanvas(vis, def.boardLabel, def.cssColor, 2, false);
      this.spotVisuals.push(vis);
    }
  }

  private redrawSpotTallyCanvas(
    vis: TallySpotVisual,
    label: string,
    cssColor: string,
    strokes: number,
    urgent: boolean
  ): void {
    const c = vis.tallyCanvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);

    // Chalkboard medallion backing
    g.fillStyle = urgent ? 'rgba(66, 26, 46, 0.86)' : 'rgba(18, 34, 48, 0.84)';
    g.strokeStyle = urgent ? '#ff96a8' : cssColor;
    g.lineWidth = urgent ? 6 : 4;
    g.beginPath();
    g.roundRect(14, 14, W - 28, H - 28, 28);
    g.fill();
    g.stroke();

    // Label at top
    g.fillStyle = urgent ? '#ffc2cc' : cssColor;
    g.font = "700 24px 'Zen Maru Gothic', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, W / 2, 42);

    // Draw authentic 5 strokes of 「正」 progressively!
    // Stroke 1: Top horizontal   (54, 76) -> (146, 76)
    // Stroke 2: Center vertical  (100, 76) -> (100, 154)
    // Stroke 3: Mid-right horiz  (100, 114) -> (142, 114)
    // Stroke 4: Left vertical    (64, 104) -> (64, 154)
    // Stroke 5: Bottom horiz     (46, 154) -> (154, 154)
    const segs: Array<[number, number, number, number]> = [
      [54, 78, 146, 78],
      [100, 78, 100, 154],
      [100, 115, 144, 115],
      [64, 106, 64, 154],
      [46, 154, 154, 154],
    ];

    // Faint ghost template of full 「正」
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    for (const [x1, y1, x2, y2] of segs) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }

    // Active lit strokes
    const clamped = Math.max(0, Math.min(5, strokes));
    g.strokeStyle = clamped >= 5 ? '#fff6bd' : urgent ? '#ffb3c0' : cssColor;
    g.shadowColor = clamped >= 5 ? '#ffd668' : cssColor;
    g.shadowBlur = clamped >= 5 ? 16 : 8;
    g.lineWidth = 11;
    for (let i = 0; i < clamped; i++) {
      const [x1, y1, x2, y2] = segs[i];
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.shadowBlur = 0;

    vis.tallyTex.needsUpdate = true;
    vis.lastRenderedStrokes = strokes;
    vis.lastRenderedUrgent = urgent;
  }

  private redrawChalkboard(ref: DynamicBoardRef, tallyCount: number): void {
    const capped = Math.min(40, Math.max(0, tallyCount));
    if (ref.lastCount === capped) return;
    ref.lastCount = capped;

    const c = ref.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const FNT = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif";

    g.fillStyle = '#203d38';
    g.fillRect(0, 0, W, H);
    g.fillStyle = ref.color;
    g.font = `700 40px ${FNT}`;
    g.textBaseline = 'alphabetic';
    g.fillText(ref.title, 22, 52);
    g.strokeStyle = ref.color;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(22, 64);
    g.lineTo(W - 22, 64);
    g.stroke();

    g.font = `700 30px ${FNT}`;
    g.globalAlpha = 0.94;
    const cols = 8;
    let k = 0;
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < cols && k < capped; col++, k++) {
        g.save();
        g.translate(24 + col * 40, 108 + r * 38);
        g.rotate(((k * 37) % 11 - 5) * 0.015);
        g.fillText('正', 0, 0);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    ref.tex.needsUpdate = true;
  }

  public updateMechanicalCounter(totalTallies: number): void {
    const val = Math.max(0, Math.min(9999, Math.floor(totalTallies)));
    if (val === this.lastCounterDisplay) return;
    this.lastCounterDisplay = val;
    const g = this.counterCanvas.getContext('2d')!;
    g.fillStyle = '#14181e';
    g.fillRect(0, 0, 160, 56);
    g.fillStyle = '#f4ecd6';
    g.font = '700 34px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const digits = String(val).padStart(4, '0').split('').join(' ');
    g.fillText(digits, 80, 29);
    this.counterTex.needsUpdate = true;
  }

  public syncCounts(smiles: number, tears: number, efforts: number, totalTallies: number): void {
    this.redrawChalkboard(this.chalkboards.smile, 6 + smiles);
    this.redrawChalkboard(this.chalkboards.tear, 4 + tears);
    this.redrawChalkboard(this.chalkboards.effort, 10 + efforts);
    this.updateMechanicalCounter(totalTallies);
  }

  public syncUpgrades(state: KazoeruSaveState): void {
    const applyGroup = (group: THREE.Group, lv: number) => {
      group.children.forEach((child) => {
        const minLv = (child.userData.minLv as number) || 1;
        child.visible = lv >= minLv;
      });
    };

    applyGroup(this.notebookExtraGroup, state.upgrades.tallyNotebook);
    applyGroup(this.beadGarlandGroup, state.upgrades.parkLamp);
    applyGroup(this.scrollShelfExtraGroup, state.upgrades.scrollShelf);
    applyGroup(this.swingModelExtraGroup, state.upgrades.swingChain);
    applyGroup(this.knitScarfGroup, state.upgrades.knitScarf);
    applyGroup(this.jarBalanceExtraGroup, state.upgrades.jarCollection);

    this.syncCounts(
      state.totalSmilesCounted,
      state.totalTearsCounted,
      state.totalEffortsCounted,
      state.totalTallies
    );
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public triggerShake(intensity = 0.24, duration = 0.26): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public triggerSwingBoost(strength = 0.55): void {
    this.swingExtraEnergy = Math.min(1.0, this.swingExtraEnergy + strength);
    this.moonlightFlashTimer = Math.max(this.moonlightFlashTimer, 0.55);
  }

  public spawnScrollArchiveArc(fromX: number, fromZ: number): void {
    const g = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.44, 12), this.scrollPaperMat);
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), this.scrollRibbonMat);
    rib.rotation.z = Math.PI / 2;
    g.add(rib);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe49a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(0.95, 0.95, 1);
    g.add(halo);
    this.worldGroup.add(g);

    const start = new THREE.Vector3(fromX, 1.0, fromZ);
    const end = new THREE.Vector3(4.9, 1.65, -1.8);
    const ctrl = new THREE.Vector3((fromX + 4.9) * 0.5, 3.6, (fromZ - 1.8) * 0.5);
    this.scrollArcs.push({ group: g, start, ctrl, end, t: 0, dur: 0.85 });
  }

  public updateSpotVisual(
    spotId: number,
    progressPct: number,
    isWriting: boolean,
    justCompleted: boolean,
    elapsed: number
  ): void {
    const vis = this.spotVisuals[spotId];
    const def = TALLY_SPOTS[spotId];
    if (!vis || !def) return;

    const ratio = Math.max(0, Math.min(1, progressPct / 100));
    const strokes = justCompleted ? 5 : Math.min(5, Math.floor(progressPct / 20));
    const urgent = !justCompleted && progressPct < 24;

    if (strokes !== vis.lastRenderedStrokes || urgent !== vis.lastRenderedUrgent) {
      this.redrawSpotTallyCanvas(vis, def.boardLabel, def.cssColor, strokes, urgent);
    }

    vis.ringFill.scale.setScalar(0.32 + ratio * 0.68);
    const fillMat = vis.ringFill.material as THREE.MeshBasicMaterial;
    if (justCompleted) {
      fillMat.color.copy(vis.doneColor);
      fillMat.opacity = 0.92;
    } else if (urgent) {
      fillMat.color.setHex(0xff8ca0);
      fillMat.opacity = 0.6 + 0.35 * Math.sin(elapsed * 9);
    } else {
      fillMat.color.copy(vis.accentColor);
      fillMat.opacity = isWriting ? 0.88 : 0.62;
    }

    // Billboard the 「正」 board gently toward camera
    vis.tallyBoard.lookAt(this.camera.position.x, vis.tallyBoard.position.y, this.camera.position.z);
    vis.tallyBoard.position.y = 1.48 + Math.sin(elapsed * 2.4 + vis.pulse) * 0.08 + (isWriting ? 0.08 : 0);
    const boardScale = justCompleted ? 1.16 : isWriting ? 1.08 : urgent ? 1.0 + Math.sin(elapsed * 8) * 0.06 : 0.96;
    vis.tallyBoard.scale.setScalar(boardScale);

    // Floating memory wisp
    vis.wispPivot.position.y = 0.58 + Math.sin(elapsed * 3.1 + vis.pulse) * 0.1;
    vis.wispPivot.rotation.y = elapsed * (isWriting ? 3.2 : 1.1);
    vis.wispMat.emissiveIntensity = justCompleted ? 1.3 : isWriting ? 1.0 : urgent ? 0.35 : 0.65;

    const haloMat = vis.halo.material as THREE.SpriteMaterial;
    haloMat.opacity = justCompleted ? 0.85 : isWriting ? 0.72 : urgent ? 0.35 + Math.sin(elapsed * 8) * 0.2 : 0.48;
    vis.halo.scale.setScalar(justCompleted ? 2.0 : isWriting ? 1.75 : 1.35);

    vis.glowLight.intensity = justCompleted ? 2.1 : isWriting ? 1.55 : 0.95;

    const pMat = vis.pulseRing.material as THREE.MeshBasicMaterial;
    if (isWriting || justCompleted) {
      const cyc = (elapsed * 1.4 + spotId * 0.25) % 1;
      vis.pulseRing.scale.setScalar(0.85 + cyc * 0.75);
      pMat.opacity = (1 - cyc) * (justCompleted ? 0.72 : 0.45);
      pMat.color.copy(justCompleted ? vis.doneColor : vis.accentColor);
    } else {
      pMat.opacity = 0;
    }
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    viewW: number,
    viewH: number
  ): { x: number; y: number; visible: boolean } {
    const v = worldPos.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * viewW,
      y: (-v.y * 0.5 + 0.5) * viewH,
      visible: v.z < 1,
    };
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
    return this.raycaster.ray.intersectPlane(this.floorPlane, hit);
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.35 ? 49 : 44;
    this.camera.updateProjectionMatrix();
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    this.simClock += dt;
    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    if (this.moonlightFlashTimer > 0) {
      this.moonlightFlashTimer = Math.max(0, this.moonlightFlashTimer - dt);
    }
    if (this.swingExtraEnergy > 0) {
      this.swingExtraEnergy = Math.max(0, this.swingExtraEnergy - dt * 0.42);
    }

    // Swinging park swing (きい……こ) + synced miniature desk swing!
    this.swingPhase += dt * (1.35 + this.swingExtraEnergy * 1.15 + (isFever ? 0.55 : 0));
    const swingAmp = 0.24 + this.swingExtraEnergy * 0.34 + (isFever ? 0.16 : 0) + energy * 0.08;
    const angle1 = Math.sin(this.swingPhase) * swingAmp;
    this.swingSeat1.rotation.x = angle1;
    this.swingSeat2.rotation.x = Math.sin(this.swingPhase * 0.65 + 1.2) * (0.035 + (isFever ? 0.14 : 0));
    this.miniSwingSeat.rotation.x = angle1 * 0.95;

    // Lantern & streetlamp gentle warm flicker
    const fl = 1 + 0.03 * Math.sin(elapsed * 5.2) + 0.02 * Math.sin(elapsed * 11.7);
    const feverBoost = isFever ? 1.35 : 1.0;
    const flashBoost = this.moonlightFlashTimer > 0 ? 1 + this.moonlightFlashTimer * 0.55 : 1.0;

    this.streetLampLight.intensity = 2.8 * fl * feverBoost;
    this.streetLampGlow.scale.setScalar((4.8 + beatPulse * 0.45) * fl * feverBoost);
    (this.streetLampBeam.material as THREE.MeshBasicMaterial).opacity =
      (0.08 + beatPulse * 0.025) * (isFever ? 1.55 : 1.0);

    this.benchLanternLight.intensity = 2.2 * fl * feverBoost;
    this.benchLanternGlow.scale.setScalar((1.75 + beatPulse * 0.16) * fl);

    this.portalGlow.scale.setScalar(2.35 + Math.sin(elapsed * 2.2) * 0.14);
    this.redLanternGroup.rotation.z = 0.04 * Math.sin(elapsed * 1.05);
    this.redLanternGlow.scale.setScalar(1.85 + Math.sin(elapsed * 6.0) * 0.12);

    this.moonDirLight.intensity = (0.85 + (isFever ? 0.45 : 0)) * flashBoost;
    this.moonSprite.scale.setScalar((isFever ? 8.2 : 6.8) * (1 + beatPulse * 0.04));

    // Glass bead garlands softly twinkle
    for (const bg of this.beadGarlandGlows) {
      (bg.sprite.material as THREE.SpriteMaterial).opacity =
        (isFever ? 0.68 : 0.42) + 0.22 * Math.sin(elapsed * 1.8 + bg.phase);
    }

    // Fireflies / golden dust drift
    const posAttr = this.fireflyPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.fireflyBase.length; i++) {
      const [bx, by, bz, ph] = this.fireflyBase[i];
      posAttr.setXYZ(
        i,
        bx + Math.sin(this.simClock * 0.45 + ph) * 0.45,
        0.3 + ((by + this.simClock * 0.12) % 4.4),
        bz + Math.cos(this.simClock * 0.38 + ph) * 0.42
      );
    }
    posAttr.needsUpdate = true;
    const fMat = this.fireflyPoints.material as THREE.PointsMaterial;
    fMat.color.setHex(isFever ? 0xfff3a8 : 0xffe49e);
    fMat.opacity = isFever ? 0.9 : 0.62;

    // Scroll archive flight arcs
    for (let i = this.scrollArcs.length - 1; i >= 0; i--) {
      const arc = this.scrollArcs[i];
      arc.t += dt;
      const u = Math.min(1, arc.t / arc.dur);
      const omt = 1 - u;
      arc.group.position.set(
        omt * omt * arc.start.x + 2 * omt * u * arc.ctrl.x + u * u * arc.end.x,
        omt * omt * arc.start.y + 2 * omt * u * arc.ctrl.y + u * u * arc.end.y,
        omt * omt * arc.start.z + 2 * omt * u * arc.ctrl.z + u * u * arc.end.z
      );
      arc.group.rotation.y += dt * 7;
      arc.group.rotation.x += dt * 4;
      arc.group.scale.setScalar(1 - u * 0.45);
      if (u >= 1) {
        this.worldGroup.remove(arc.group);
        this.scrollArcs.splice(i, 1);
      }
    }

    // Smooth camera orbit (lobby) vs ergonomic top-angle clearing view (play)
    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    if (this.cameraMode === 'lobby') {
      desiredPos.set(Math.sin(elapsed * 0.22) * 1.45, 4.9, 8.8 + Math.cos(elapsed * 0.18) * 0.45);
      desiredTarget.set(0, 1.55, -1.2);
    } else {
      desiredPos.set(0, 5.75, 8.95);
      desiredTarget.set(0, 1.12, -0.55);
    }
    this.camPos.lerp(desiredPos, 1 - Math.exp(-3.6 * dt));
    this.camTarget.lerp(desiredTarget, 1 - Math.exp(-4.2 * dt));

    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const mag = this.shakeIntensity * (this.shakeTimer / 0.26);
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
    }
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
