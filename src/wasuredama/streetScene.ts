import * as THREE from 'three';
import { WasuredamaSaveState } from './types';

function makeSeededRng(seedStart = 7): () => number {
  let sd = seedStart;
  return () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };
}

function makeCanvasTex(
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
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.28, 'rgba(255,255,255,0.48)');
  rad.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * 3D Nighttime Streetlamp Corner ("街灯の下の落とし物置き場")
 * Faithful to Wasuredama's official room tour diorama, expanded into an
 * atmospheric playable cobblestone plaza where all 6 upgrades visually grow.
 */
export class StreetScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private rng = makeSeededRng(42);
  private fog: THREE.FogExp2;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private lampLight: THREE.PointLight;
  private lampLowLight: THREE.PointLight;
  private shelfLight: THREE.PointLight;
  private jarLight: THREE.PointLight;

  private lampGlowMain!: THREE.Sprite;
  private lampGlowWide!: THREE.Sprite;
  private lampBeam!: THREE.Mesh;
  private lampPool!: THREE.Mesh;
  private signGroup!: THREE.Group;
  private puddleRipple!: THREE.Mesh;

  // Upgrade-reactive 3D prop groups
  private extraLampGlows: THREE.Sprite[] = [];
  private stringLightRows: THREE.Group[] = [];
  private stringBulbSprites: THREE.Sprite[] = [];
  private sackPropGroup!: THREE.Group;
  private sackExtraGlow!: THREE.Sprite;
  private shelfItemGroups: THREE.Object3D[] = [];
  private hopeJarGroups: THREE.Group[] = [];
  private promiseThreadGroup!: THREE.Group;
  private notebookGroup!: THREE.Group;
  private notebookGlow!: THREE.Sprite;
  private benchGroup!: THREE.Group;

  // Ambient night particles
  private sparks: { sprite: THREE.Sprite; p: number; a: number }[] = [];
  private dustGeo!: THREE.BufferGeometry;
  private dustPos!: Float32Array;
  private dustBase: [number, number, number, number][] = [];

  // Camera state
  private cameraMode: 'lobby' | 'play' = 'lobby';
  private focusX = 0;
  private focusZ = 0;
  private camPos = new THREE.Vector3(1.6, 2.5, 4.8);
  private camLook = new THREE.Vector3(0, 1.25, -2.8);
  private shakeTimer = 0;
  private shakeStrength = 0;
  private feverBlend = 0;
  private lampLevel = 0;

  private readonly lampX = 0;
  private readonly lampZ = -4.6;

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
    this.scene.background = new THREE.Color(0x070b18);
    this.fog = new THREE.FogExp2(0x090e1f, 0.022);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 140);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.glowTex = makeGlowTex();
    this.scene.add(this.worldGroup);

    // Base lighting
    this.hemiLight = new THREE.HemisphereLight(0x7690cc, 0x262120, 0.58);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xa6bef5, 0.45);
    this.moonLight.position.set(-7, 13, 9);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.left = -9;
    this.moonLight.shadow.camera.right = 9;
    this.moonLight.shadow.camera.top = 9;
    this.moonLight.shadow.camera.bottom = -9;
    this.moonLight.shadow.bias = -0.0005;
    this.scene.add(this.moonLight);

    this.lampLight = new THREE.PointLight(0xffc57e, 4.6, 22, 1.15);
    this.lampLight.position.set(this.lampX, 4.6, this.lampZ);
    this.scene.add(this.lampLight);

    this.lampLowLight = new THREE.PointLight(0xffba6e, 1.8, 14, 1.25);
    this.lampLowLight.position.set(0, 1.8, -2.0);
    this.scene.add(this.lampLowLight);

    this.shelfLight = new THREE.PointLight(0xffcc88, 1.6, 10, 1.3);
    this.shelfLight.position.set(0, 2.9, -5.8);
    this.scene.add(this.shelfLight);

    this.jarLight = new THREE.PointLight(0xffda8f, 1.2, 7, 1.4);
    this.jarLight.position.set(2.3, 1.4, -3.8);
    this.scene.add(this.jarLight);

    this.buildSkyAndBuildings();
    this.buildCobblestonePlaza();
    this.buildStreetLamp();
    this.buildPuddleAndGroundProps();
    this.buildBurlapSackAndUmbrella();
    this.buildCratesJarsAndNotebook();
    this.buildSortingShelf();
    this.buildBench();
    this.buildStringLights();
    this.buildParticles();
  }

  private addGlow(
    col: number,
    scale: number,
    x: number,
    y: number,
    z: number,
    opacity = 0.75,
    parent: THREE.Object3D = this.worldGroup
  ): THREE.Sprite {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: col,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity,
        fog: false,
      })
    );
    sp.scale.set(scale, scale, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    return sp;
  }

  private makeWoodTex(hue: number, rx = 1, ry = 1, l0 = 24): THREE.CanvasTexture {
    const rnd = this.rng;
    return makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        const n = 4;
        const ph = h / n;
        for (let i = 0; i < n; i++) {
          const l = l0 + rnd() * 9;
          const y0 = i * ph;
          g.fillStyle = `hsl(${hue + rnd() * 6}, ${32 + rnd() * 10}%, ${l}%)`;
          g.fillRect(0, y0, w, ph);
          for (let k = 0; k < 22; k++) {
            g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,10,5' : '255,220,170'}, ${0.04 + rnd() * 0.08})`;
            g.lineWidth = 0.7 + rnd() * 1.3;
            const yy = y0 + rnd() * ph;
            g.beginPath();
            g.moveTo(0, yy);
            g.bezierCurveTo(w * 0.3, yy + (rnd() - 0.5) * 5, w * 0.6, yy + (rnd() - 0.5) * 5, w, yy);
            g.stroke();
          }
          g.fillStyle = 'rgba(10,5,3,0.52)';
          g.fillRect(0, y0, w, 2.5);
        }
      },
      rx,
      ry
    );
  }

  private makePaperTex(lines: string[], w = 256, h = 180): THREE.CanvasTexture {
    const rnd = this.rng;
    return makeCanvasTex(w, h, (g, W, H) => {
      g.fillStyle = '#eadec4';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 320; i++) {
        g.fillStyle = `rgba(120,90,50,${rnd() * 0.08})`;
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
      g.fillStyle = '#3a2f28';
      g.font = `700 ${Math.round(H * 0.16)}px 'Zen Maru Gothic', sans-serif`;
      g.textBaseline = 'middle';
      lines.forEach((s, i) => {
        g.save();
        g.translate(W * 0.09, H * (0.22 + i * 0.22));
        g.rotate(i % 2 ? 0.012 : -0.014);
        g.fillText(s, 0, 0);
        g.restore();
      });
    });
  }

  private makeLabelTex(txt: string, borderCol = '#7a5a3a'): THREE.CanvasTexture {
    return makeCanvasTex(160, 96, (g, w, h) => {
      g.fillStyle = '#ece0c4';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = borderCol;
      g.lineWidth = 5;
      g.strokeRect(5, 5, w - 10, h - 10);
      if (txt) {
        g.fillStyle = '#3a2b1e';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 32px 'Zen Maru Gothic', sans-serif`;
        g.fillText(txt, w / 2, h / 2 + 2);
      }
    });
  }

  private buildSkyAndBuildings(): void {
    const rnd = this.rng;

    // Night stars
    const n = 360;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.22 + rnd() * 1.1;
      const r = 88;
      p[i * 3] = Math.cos(a) * Math.cos(e) * r;
      p[i * 3 + 1] = Math.sin(e) * r * 0.72 + 12;
      p[i * 3 + 2] = -Math.abs(Math.sin(a)) * Math.cos(e) * r * 0.85 - 16;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xe3ecff,
        size: 1.7,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.82,
        fog: false,
        depthWrite: false,
      })
    );
    this.worldGroup.add(stars);

    // Soft crescent-like moon glow
    this.addGlow(0xc6d8ff, 26, -24, 34, -74, 0.52);

    // Night residential facades lining both sides of the cobblestone street
    const facadeTex = (rx: number) =>
      makeCanvasTex(
        256,
        512,
        (g, w, h) => {
          g.fillStyle = '#181d34';
          g.fillRect(0, 0, w, h);
          for (let j = 0; j < 36; j++) {
            for (let i = 0; i < 12; i++) {
              const l = 15 + rnd() * 7;
              g.fillStyle = `hsl(${224 + rnd() * 16}, 22%, ${l}%)`;
              g.fillRect(i * 21.4 + (j % 2 ? 10 : 0), j * 14.2, 20, 12);
            }
          }
          const cols = 3;
          const rows = 6;
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
              const x = 22 + i * 80;
              const y = 34 + j * 78;
              const lit = rnd() < 0.2;
              g.fillStyle = '#090c18';
              g.fillRect(x - 4, y - 4, 50, 62);
              if (lit) {
                const gr = g.createLinearGradient(0, y, 0, y + 54);
                gr.addColorStop(0, '#ffd88f');
                gr.addColorStop(1, '#d8883c');
                g.fillStyle = gr;
              } else {
                g.fillStyle = `hsl(225, 30%, ${10 + rnd() * 5}%)`;
              }
              g.fillRect(x, y, 42, 54);
              g.fillStyle = '#090c18';
              g.fillRect(x + 19, y, 4, 54);
              g.fillRect(x, y + 24, 42, 4);
            }
          }
        },
        rx,
        1
      );

    const darkM = new THREE.MeshStandardMaterial({ color: 0x161a2b, roughness: 0.92 });
    const facM = new THREE.MeshStandardMaterial({
      map: facadeTex(1),
      roughness: 0.88,
      emissive: 0x1a1a28,
      emissiveIntensity: 0.35,
    });

    const heights = [10, 12.5, 9.5, 13.5, 11.5, 14, 10.5, 12];
    let zz = -8.5;
    for (let i = 0; i < 7; i++) {
      const d = 3.2 + rnd() * 1.8;
      const hh = heights[i % heights.length];
      const zc = zz + d / 2;

      const mL = [facM, darkM, darkM, darkM, darkM, darkM];
      const bL = new THREE.Mesh(new THREE.BoxGeometry(2.2, hh, d), mL);
      bL.position.set(-7.9, hh / 2, zc);
      this.worldGroup.add(bL);

      const mR = [darkM, facM, darkM, darkM, darkM, darkM];
      const bR = new THREE.Mesh(new THREE.BoxGeometry(2.2, hh, d), mR);
      bR.position.set(7.9, hh / 2, zc);
      this.worldGroup.add(bR);

      zz += d;
    }

    // Back wall of the cozy street corner behind the sorting shelf
    const backWallFac = new THREE.MeshStandardMaterial({
      map: facadeTex(2.2),
      roughness: 0.9,
      emissive: 0x181926,
      emissiveIntensity: 0.32,
    });
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(16, 12, 1),
      [darkM, darkM, darkM, darkM, backWallFac, darkM]
    );
    backWall.position.set(0, 6, -7.8);
    this.worldGroup.add(backWall);
  }

  private buildCobblestonePlaza(): void {
    const rnd = this.rng;
    const stoneTex = makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#090c16';
        g.fillRect(0, 0, w, h);
        const n = 8;
        const s = w / n;
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const o = (j % 2) * (s / 2);
            const x = i * s + o;
            const y = j * s;
            const l = 20 + rnd() * 13;
            g.fillStyle = `hsl(${216 + rnd() * 18}, ${12 + rnd() * 10}%, ${l}%)`;
            g.beginPath();
            const r = 8;
            g.moveTo(x + r + 3, y + 3);
            g.arcTo(x + s - 3, y + 3, x + s - 3, y + s - 3, r);
            g.arcTo(x + s - 3, y + s - 3, x + 3, y + s - 3, r);
            g.arcTo(x + 3, y + s - 3, x + 3, y + 3, r);
            g.arcTo(x + 3, y + 3, x + s - 3, y + 3, r);
            g.fill();
            for (let k = 0; k < 20; k++) {
              g.fillStyle = `rgba(255,255,255,${rnd() * 0.055})`;
              g.fillRect(x + rnd() * s, y + rnd() * s, 2, 2);
            }
          }
        }
      },
      6,
      10
    );

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 28),
      new THREE.MeshStandardMaterial({
        map: stoneTex,
        roughness: 0.62,
        metalness: 0.08,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 2);
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // Sidewalks / curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x2c3248, roughness: 0.82 });
    [-6.6, 6.6].forEach((x) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 28), curbMat);
      curb.position.set(x, 0.11, 2);
      curb.receiveShadow = true;
      this.worldGroup.add(curb);
    });

    // Subtle glowing boundary frame indicating the cozy playable streetlamp plaza
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffd08a,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeFront = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 0.06), borderMat);
    edgeFront.rotation.x = -Math.PI / 2;
    edgeFront.position.set(0, 0.015, 4.45);
    this.worldGroup.add(edgeFront);

    // Warm pool of streetlamp light on cobblestones
    const poolTex = makeCanvasTex(256, 256, (g) => {
      const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      r.addColorStop(0, 'rgba(255,212,138,0.85)');
      r.addColorStop(0.45, 'rgba(255,180,98,0.38)');
      r.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 256);
    });
    this.lampPool = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 48),
      new THREE.MeshBasicMaterial({
        map: poolTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.72,
        fog: false,
      })
    );
    this.lampPool.rotation.x = -Math.PI / 2;
    this.lampPool.position.set(this.lampX, 0.02, this.lampZ + 1.2);
    this.worldGroup.add(this.lampPool);
  }

  private buildStreetLamp(): void {
    const lpost = new THREE.Group();
    lpost.position.set(this.lampX, 0, this.lampZ);
    this.worldGroup.add(lpost);

    const iron = new THREE.MeshStandardMaterial({
      color: 0x222830,
      metalness: 0.7,
      roughness: 0.45,
    });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0xffeacc,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const lathe = (pts: [number, number][], seg = 24) =>
      new THREE.LatheGeometry(
        pts.map((p) => new THREE.Vector2(p[0], p[1])),
        seg
      );

    // Ornate lamp base & post
    const base = new THREE.Mesh(
      lathe(
        [
          [0, 0],
          [0.36, 0],
          [0.36, 0.1],
          [0.27, 0.16],
          [0.25, 0.54],
          [0.2, 0.66],
          [0.14, 0.78],
          [0.1, 0.84],
          [0, 0.84],
        ],
        24
      ),
      iron
    );
    base.castShadow = true;
    lpost.add(base);

    const pole = new THREE.Mesh(
      lathe(
        [
          [0, 0],
          [0.11, 0],
          [0.095, 3.1],
          [0.075, 3.5],
          [0, 3.5],
        ],
        18
      ),
      iron
    );
    pole.position.y = 0.8;
    pole.castShadow = true;
    lpost.add(pole);

    [1.45, 3.35].forEach((yy) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.024, 8, 18), iron);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yy;
      lpost.add(ring);
    });

    const collar = new THREE.Mesh(
      lathe(
        [
          [0, 0],
          [0.28, 0],
          [0.3, 0.06],
          [0.18, 0.12],
          [0.1, 0.2],
          [0, 0.2],
        ],
        22
      ),
      iron
    );
    collar.position.y = 4.08;
    lpost.add(collar);

    // Lantern head
    const lan = new THREE.Group();
    lan.position.y = 4.24;
    lpost.add(lan);

    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.64, 16, 1, true), glassM);
    glass.position.y = 0.32;
    lan.add(glass);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false })
    );
    bulb.position.y = 0.32;
    lan.add(bulb);

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.78;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.66, 6), iron);
      strut.position.set(Math.cos(a) * 0.24, 0.32, Math.sin(a) * 0.24);
      lan.add(strut);
    }

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.3, 16), iron);
    cap.position.y = 0.78;
    lan.add(cap);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), iron);
    finial.position.y = 0.98;
    lan.add(finial);

    this.lampGlowMain = this.addGlow(0xffd28a, 3.6, 0, 0.32, 0, 0.92, lan);
    this.lampGlowWide = this.addGlow(0xffc880, 9.2, 0, 0.32, 0, 0.3, lan);
    this.addGlow(0xffedc8, 1.35, 0, 0.32, 0, 1.0, lan);

    // Extra lantern halo sprites revealed as streetLamp is upgraded
    for (let i = 0; i < 3; i++) {
      const eg = this.addGlow(0xffe19e, 5.2 + i * 2.4, 0, 0.32, 0, 0.2, lan);
      eg.visible = false;
      this.extraLampGlows.push(eg);
    }

    // Light cone beam descending onto the cobblestones
    const beamTex = makeCanvasTex(8, 128, (g) => {
      const r = g.createLinearGradient(0, 0, 0, 128);
      r.addColorStop(0, 'rgba(255,228,175,0.92)');
      r.addColorStop(1, 'rgba(255,200,130,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 8, 128);
    });
    this.lampBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 3.5, 4.3, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex,
        color: 0xffd299,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    this.lampBeam.position.set(this.lampX, 2.22, this.lampZ);
    this.worldGroup.add(this.lampBeam);

    // Hanging "わすれもの" sign on arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.045, 0.045), iron);
    arm.position.set(0.48, 2.7, 0);
    lpost.add(arm);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), iron);
    brace.position.set(0.14, 2.5, 0);
    brace.rotation.z = 0.6;
    lpost.add(brace);

    [0.24, 0.92].forEach((x) => {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 5), iron);
      chain.position.set(x, 2.52, 0);
      lpost.add(chain);
    });

    const signTex = makeCanvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#2a1e16';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#dfb86e';
      g.lineWidth = 8;
      g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = '#f4dda6';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 94px 'Zen Maru Gothic', sans-serif`;
      g.fillText('わすれもの', w / 2, h / 2 + 4);
    });
    this.signGroup = new THREE.Group();
    this.signGroup.position.set(0.6, 2.18, 0);
    lpost.add(this.signGroup);
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.42, 0.045),
      new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.65,
        emissive: 0x38240c,
        emissiveIntensity: 0.55,
      })
    );
    this.signGroup.add(signBoard);

    // Pinned memo on post: "まだ まにあう"
    const pin = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.2),
      new THREE.MeshStandardMaterial({
        map: this.makePaperTex(['まだ', 'まにあう'], 200, 140),
        roughness: 0.95,
        side: THREE.DoubleSide,
      })
    );
    pin.position.set(-0.06, 1.78, 0.13);
    pin.rotation.set(0, -0.2, 0.12);
    lpost.add(pin);
  }

  private buildPuddleAndGroundProps(): void {
    const rnd = this.rng;

    // Rain puddle reflecting the warm streetlamp
    const pud = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 40),
      new THREE.MeshStandardMaterial({
        color: 0x091020,
        metalness: 0.92,
        roughness: 0.06,
      })
    );
    pud.rotation.x = -Math.PI / 2;
    pud.scale.set(1.25, 1, 0.82);
    pud.position.set(-3.9, 0.012, -1.5);
    this.worldGroup.add(pud);

    const pr = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 32),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: 0xffd28c,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pr.rotation.x = -Math.PI / 2;
    pr.scale.set(1.25, 0.72, 1);
    pr.position.set(-3.7, 0.016, -1.62);
    this.worldGroup.add(pr);

    this.puddleRipple = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.28, 28),
      new THREE.MeshBasicMaterial({
        color: 0xd0e2ff,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.puddleRipple.rotation.x = -Math.PI / 2;
    this.puddleRipple.position.set(-4.1, 0.018, -1.35);
    this.worldGroup.add(this.puddleRipple);

    // Lost glove, brass keys, scattered buttons near lamp base (decor behind play center)
    const glove = new THREE.Group();
    glove.position.set(-0.55, 0.025, -3.7);
    glove.rotation.y = 0.9;
    this.worldGroup.add(glove);
    const glM = new THREE.MeshStandardMaterial({ color: 0xa4673c, roughness: 0.85 });
    glove.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.17), glM));
    [
      [-0.055, 0.16],
      [-0.018, 0.19],
      [0.02, 0.19],
      [0.055, 0.16],
    ].forEach(([fx, fl]) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.04, fl), glM);
      f.position.set(fx, 0, 0.085 + fl / 2);
      glove.add(f);
    });

    const keyM = new THREE.MeshStandardMaterial({
      color: 0xd9a846,
      metalness: 0.88,
      roughness: 0.28,
    });
    const keyG = new THREE.Group();
    keyG.position.set(-1.1, 0.02, -3.95);
    keyG.rotation.y = -0.5;
    this.worldGroup.add(keyG);
    const kr = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 18), keyM);
    kr.rotation.x = Math.PI / 2;
    keyG.add(kr);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.2), keyM);
    kb.position.set(0, 0, 0.16);
    keyG.add(kb);

    // Scattered notes near streetlamp
    const notes: [number, number, string[], number][] = [
      [0.65, -3.85, ['いつか', 'やりたい…'], 0.8],
      [-0.2, -4.05, ['また、', 'あした'], 1.3],
    ];
    notes.forEach(([nx, nz, lines, rot]) => {
      const pp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.36),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTex(lines, 256, 180),
          roughness: 0.95,
          side: THREE.DoubleSide,
        })
      );
      pp.position.set(nx, 0.022, nz);
      pp.rotation.set(-Math.PI / 2, 0, rot);
      this.worldGroup.add(pp);
      this.addGlow(0xffe4aa, 0.85, nx, 0.09, nz, 0.32);
    });

    // Autumn fallen leaves around perimeter
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0xb8742e,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 1.4 + rnd() * 4.2;
      const lf = new THREE.Mesh(new THREE.CircleGeometry(0.07 + rnd() * 0.05, 6), leafMat);
      lf.position.set(this.lampX + Math.cos(a) * r, 0.015, this.lampZ + 1.5 + Math.sin(a) * r * 0.65);
      lf.rotation.set(-Math.PI / 2, 0, rnd() * 6);
      lf.scale.set(1, 0.56, 1);
      this.worldGroup.add(lf);
    }
  }

  private buildBurlapSackAndUmbrella(): void {
    const rnd = this.rng;
    const burlapTex = makeCanvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8e7650';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        g.fillStyle =
          rnd() < 0.5
            ? `rgba(255,245,220,${rnd() * 0.38})`
            : `rgba(24,14,6,${rnd() * 0.38})`;
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
      }
    });

    this.sackPropGroup = new THREE.Group();
    this.sackPropGroup.position.set(-1.75, 0, -4.35);
    this.sackPropGroup.rotation.y = 0.42;
    this.worldGroup.add(this.sackPropGroup);

    const sackM = new THREE.MeshStandardMaterial({
      map: burlapTex,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const sackMesh = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0, 0],
          [0.48, 0.02],
          [0.72, 0.2],
          [0.8, 0.52],
          [0.7, 0.86],
          [0.45, 1.14],
          [0.24, 1.34],
          [0.2, 1.48],
          [0.33, 1.6],
          [0.26, 1.72],
          [0.1, 1.68],
          [0, 1.64],
        ].map((p) => new THREE.Vector2(p[0], p[1])),
        28
      ),
      sackM
    );
    sackMesh.scale.set(1, 1, 0.92);
    sackMesh.castShadow = true;
    this.sackPropGroup.add(sackMesh);

    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5c4426, roughness: 0.95 });
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 20), ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 1.42;
    this.sackPropGroup.add(rope);

    // Peeking umbrella handle, scarf & notebook inside the sack
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.55 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), handleMat);
    stick.position.set(0.1, 1.9, 0.02);
    stick.rotation.z = 0.12;
    this.sackPropGroup.add(stick);

    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 14, Math.PI), handleMat);
    hook.position.set(0.04, 2.15, 0.02);
    hook.rotation.z = 0.12;
    this.sackPropGroup.add(hook);

    const scarfTex = makeCanvasTex(64, 64, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#b4553f' : '#e6d8b8';
        g.fillRect(0, i * 8, w, 8);
      }
    });
    const scarfCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 1.78, 0.14),
      new THREE.Vector3(-0.3, 1.54, 0.36),
      new THREE.Vector3(-0.36, 1.14, 0.55),
      new THREE.Vector3(-0.3, 0.8, 0.66),
    ]);
    const scarf = new THREE.Mesh(
      new THREE.TubeGeometry(scarfCurve, 14, 0.058, 6),
      new THREE.MeshStandardMaterial({ map: scarfTex, roughness: 0.95 })
    );
    scarf.scale.set(1, 1, 0.52);
    this.sackPropGroup.add(scarf);

    this.sackExtraGlow = this.addGlow(0xffe19c, 1.9, 0, 1.55, 0.05, 0.38, this.sackPropGroup);

    // Blue umbrella leaning against the streetlamp post
    const umb = new THREE.Group();
    umb.position.set(-0.38, 0, -4.18);
    umb.rotation.set(-0.18, 0.32, -0.06);
    this.worldGroup.add(umb);
    const canopy = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0, 0],
          [0.05, 0.04],
          [0.1, 0.3],
          [0.12, 0.7],
          [0.085, 1.1],
          [0.03, 1.32],
          [0, 1.38],
        ].map((p) => new THREE.Vector2(p[0], p[1])),
        14
      ),
      new THREE.MeshStandardMaterial({ color: 0x1d315c, roughness: 0.78, side: THREE.DoubleSide })
    );
    canopy.position.y = 0.04;
    umb.add(canopy);
    const uPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.78, 6), handleMat);
    uPole.position.y = -0.02;
    umb.add(uPole);
  }

  private buildCratesJarsAndNotebook(): void {
    const crateWood = new THREE.MeshStandardMaterial({
      map: this.makeWoodTex(28, 1.2, 1, 24),
      roughness: 0.82,
    });
    const trimWood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.85 });

    const makeCrate = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      ry: number,
      txt: string
    ) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry;
      this.worldGroup.add(g);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateWood);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      [h * 0.25, h * 0.75].forEach((yy) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.045, d + 0.02), trimWood);
        band.position.y = yy;
        g.add(band);
      });
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.54, h * 0.38),
        new THREE.MeshStandardMaterial({ map: this.makeLabelTex(txt), roughness: 0.9 })
      );
      lbl.position.set(0, h * 0.5, d / 2 + 0.014);
      g.add(lbl);
      return g;
    };

    makeCrate(2.15, 0, -4.55, 1.18, 0.62, 0.92, -0.14, 'まいご');
    makeCrate(1.88, 0.62, -4.6, 0.82, 0.5, 0.72, 0.18, 'ひろいもの');
    makeCrate(3.45, 0, -4.05, 0.64, 0.44, 0.62, 0.48, 'こころ');

    // Glowing hope jars (revealed progressively as hopeJars upgrades)
    const glassM = new THREE.MeshStandardMaterial({
      color: 0xe3eef5,
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const corkM = new THREE.MeshStandardMaterial({ color: 0xb88a55, roughness: 0.95 });
    const jarSpecs: [number, number, number, number, string][] = [
      [2.6, 0.62, -4.55, 0xffd27a, 'きぼう'],
      [2.32, 0.62, -4.22, 0x9ec8ff, 'ゆめ'],
      [3.45, 0.44, -4.05, 0xffb0c0, 'ひかり'],
      [3.05, 0, -3.45, 0xffe29a, 'まだ'],
      [1.35, 0, -4.15, 0xa9e0c2, 'だいじょうぶ'],
    ];

    jarSpecs.forEach(([jx, jy, jz, hex, lbl], i) => {
      const g = new THREE.Group();
      g.position.set(jx, jy, jz);
      this.worldGroup.add(g);
      const r = 0.12 - 0.01 * (i % 2);
      const h = 0.32 + 0.03 * (i % 2);

      const shell = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 18, 1, true), glassM);
      shell.position.y = h / 2;
      g.add(shell);

      const fill = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.78, r * 0.86, h * 0.65, 16),
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.95,
          roughness: 0.25,
        })
      );
      fill.position.y = h * 0.35;
      g.add(fill);

      const cork = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.48, 0.07, 12), corkM);
      cork.position.y = h + 0.02;
      g.add(cork);

      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.09),
        new THREE.MeshStandardMaterial({ map: this.makeLabelTex(lbl), roughness: 0.9 })
      );
      tag.position.set(0, h * 0.45, r + 0.008);
      g.add(tag);

      this.addGlow(hex, 0.95, 0, h * 0.55, 0, 0.55, g);
      this.hopeJarGroups.push(g);
    });

    // Promise tied thread ("約束の結び糸")
    this.promiseThreadGroup = new THREE.Group();
    this.worldGroup.add(this.promiseThreadGroup);
    const threadMat = new THREE.MeshStandardMaterial({
      color: 0x9fb8e0,
      emissive: 0x456099,
      emissiveIntensity: 0.65,
      roughness: 0.85,
    });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.35, 0.62, -4.1),
      new THREE.Vector3(2.45, 0.5, -4.0),
      new THREE.Vector3(2.55, 0.28, -3.9),
      new THREE.Vector3(2.7, 0.05, -3.72),
      new THREE.Vector3(2.92, 0.03, -3.62),
    ]);
    this.promiseThreadGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.013, 6), threadMat));
    this.addGlow(0xa8c8ff, 0.78, 2.75, 0.14, -3.75, 0.42, this.promiseThreadGroup);

    // Open old notebook ("わたしの夢") on top crate
    this.notebookGroup = new THREE.Group();
    this.notebookGroup.position.set(1.86, 1.13, -4.6);
    this.notebookGroup.rotation.set(0, 0.45, 0);
    this.worldGroup.add(this.notebookGroup);

    const coverM = new THREE.MeshStandardMaterial({ color: 0x4c2c1e, roughness: 0.72 });
    const pageM = new THREE.MeshStandardMaterial({
      map: this.makePaperTex(['わたしの夢', '絵本をつくる', 'あきらめない!'], 256, 256),
      roughness: 0.92,
    });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.45), coverM);
    cover.position.y = 0.01;
    this.notebookGroup.add(cover);

    const pgL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.4), pageM);
    pgL.position.set(-0.15, 0.03, 0);
    pgL.rotation.z = 0.07;
    this.notebookGroup.add(pgL);

    const pgR = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.018, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xeadec4, roughness: 0.95 })
    );
    pgR.position.set(0.15, 0.03, 0);
    pgR.rotation.z = -0.07;
    this.notebookGroup.add(pgR);

    this.notebookGlow = this.addGlow(0xffdf9e, 1.2, 0, 0.24, 0, 0.48, this.notebookGroup);
  }

  private buildSortingShelf(): void {
    const shelfG = new THREE.Group();
    shelfG.position.set(0, 0, -6.95);
    this.worldGroup.add(shelfG);

    const shW = new THREE.MeshStandardMaterial({
      map: this.makeWoodTex(24, 2, 1, 20),
      roughness: 0.84,
    });
    const darkBase = new THREE.MeshStandardMaterial({ color: 0x281910, roughness: 0.85 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x13182a, roughness: 0.92 });

    const cols = 6;
    const rows = 3;
    const cw = 0.88;
    const ch = 0.82;
    const sx0 = (-cw * cols) / 2;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(cw * cols + 0.3, 0.1, 0.62), darkBase);
    plinth.position.y = 0.05;
    shelfG.add(plinth);

    for (let r = 0; r <= rows; r++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(cw * cols + 0.12, 0.055, 0.52), shW);
      board.position.set(0, 0.48 + r * ch, 0);
      shelfG.add(board);
    }
    for (let c = 0; c <= cols; c++) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.055, ch * rows + 0.06, 0.52), shW);
      div.position.set(sx0 + c * cw, 0.48 + (ch * rows) / 2, 0);
      shelfG.add(div);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(cw * cols + 0.12, ch * rows + 0.06, 0.04), backMat);
    back.position.set(0, 0.48 + (ch * rows) / 2, -0.25);
    shelfG.add(back);

    // Header signboard: "まだ必要な人へ"
    const headerTex = makeCanvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#2a1e16';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9b26a';
      g.lineWidth = 5;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#f2dca4';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 44px 'Zen Maru Gothic', sans-serif`;
      g.fillText('まだ必要な人へ', w / 2, h / 2 + 2);
    });
    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.54),
      new THREE.MeshStandardMaterial({
        map: headerTex,
        roughness: 0.78,
        emissive: 0x32210d,
        emissiveIntensity: 0.4,
      })
    );
    header.position.set(0, 0.48 + ch * rows + 0.36, 0.12);
    shelfG.add(header);

    // 18 cubby slots populated with glowing notes, mini hope jars, wrapped letters
    const tags = ['あした', 'だれか', 'いつか', 'あの人', 'まだ', 'もうすぐ'];
    const jarColors = [0xffd27a, 0x9ec8ff, 0xffb0c0, 0xa9e0c2];
    const rnd = this.rng;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = sx0 + (c + 0.5) * cw;
        const cy = 0.48 + r * ch + 0.04;
        const idx = r * cols + c;

        const lbl = new THREE.Mesh(
          new THREE.PlaneGeometry(0.28, 0.13),
          new THREE.MeshStandardMaterial({
            map: this.makeLabelTex(tags[(idx * 5 + r) % tags.length]),
            roughness: 0.9,
          })
        );
        lbl.position.set(cx, cy + ch - 0.14, 0.27);
        shelfG.add(lbl);

        const itemGroup = new THREE.Group();
        itemGroup.position.set(cx, cy, 0);
        shelfG.add(itemGroup);

        const kind = idx % 3;
        if (kind === 0) {
          const note = new THREE.Mesh(
            new THREE.PlaneGeometry(0.24, 0.18),
            new THREE.MeshStandardMaterial({
              color: 0xfff0c4,
              emissive: 0xffd284,
              emissiveIntensity: 0.6,
              roughness: 0.85,
              side: THREE.DoubleSide,
            })
          );
          note.position.set(0, 0.16, 0);
          note.rotation.set(-0.28, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.2);
          itemGroup.add(note);
          this.addGlow(0xffda8a, 0.65, 0, 0.2, 0.05, 0.35, itemGroup);
        } else if (kind === 1) {
          const hex = jarColors[(r + c) % jarColors.length];
          const orb = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.09, 0.22, 14),
            new THREE.MeshStandardMaterial({
              color: hex,
              emissive: hex,
              emissiveIntensity: 0.9,
              roughness: 0.25,
            })
          );
          orb.position.set(0, 0.12, 0);
          itemGroup.add(orb);
          this.addGlow(hex, 0.72, 0, 0.14, 0.06, 0.45, itemGroup);
        } else {
          const env = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.03, 0.16),
            new THREE.MeshStandardMaterial({ color: 0xeadec4, roughness: 0.9 })
          );
          env.position.y = 0.02;
          env.rotation.y = (rnd() - 0.5) * 0.45;
          itemGroup.add(env);
          const seal = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.035, 0.08),
            new THREE.MeshStandardMaterial({ color: 0xc45d46, roughness: 0.8 })
          );
          seal.position.y = 0.045;
          itemGroup.add(seal);
        }

        this.shelfItemGroups.push(itemGroup);
      }
    }
  }

  private buildBench(): void {
    this.benchGroup = new THREE.Group();
    this.benchGroup.position.set(5.85, 0, -1.6);
    this.benchGroup.rotation.y = -Math.PI / 2;
    this.worldGroup.add(this.benchGroup);

    const bW = new THREE.MeshStandardMaterial({
      map: this.makeWoodTex(22, 1, 2, 20),
      roughness: 0.85,
    });
    const iron = new THREE.MeshStandardMaterial({ color: 0x202630, metalness: 0.65, roughness: 0.5 });

    [0, 0.18, 0.36].forEach((z) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.055, 0.15), bW);
      seat.position.set(0, 0.5, z - 0.2);
      seat.castShadow = true;
      this.benchGroup.add(seat);
    });
    [0, 0.18, 0.36].forEach((_, i) => {
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.13, 0.045), bW);
      back.position.set(0, 0.78 + i * 0.17, -0.35);
      back.rotation.x = -0.08;
      this.benchGroup.add(back);
    });
    [-0.78, 0.78].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.5, 0.56), iron);
      leg.position.set(x, 0.25, -0.05);
      this.benchGroup.add(leg);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.58, 0.055), iron);
      post.position.set(x, 0.82, -0.35);
      this.benchGroup.add(post);
    });

    // Someone's forgotten hat resting on the bench
    const hat = new THREE.Group();
    hat.position.set(-0.38, 0.54, -0.04);
    hat.rotation.y = 0.4;
    this.benchGroup.add(hat);
    const hatCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.14, 18),
      new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9 })
    );
    hatCrown.position.y = 0.07;
    hat.add(hatCrown);
    const hatBrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.018, 22),
      new THREE.MeshStandardMaterial({ color: 0x4b382a, roughness: 0.9 })
    );
    hatBrim.position.y = 0.01;
    hat.add(hatBrim);
  }

  private buildStringLights(): void {
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x1b2030 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe8a8, fog: false });

    const rowSpecs: [number, number, number][] = [
      [-5.5, 5.7, 0.85],
      [-1.4, 6.0, 0.95],
      [2.4, 6.2, 0.9],
    ];

    rowSpecs.forEach(([z, y0, sag]) => {
      const rowGroup = new THREE.Group();
      this.worldGroup.add(rowGroup);
      const pts: THREE.Vector3[] = [];
      const segs = 12;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        pts.push(new THREE.Vector3(-6.7 + 13.4 * u, y0 - Math.sin(u * Math.PI) * sag, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      rowGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 4), cordMat));

      for (let i = 1; i < segs; i++) {
        const p = pts[i];
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat);
        bulb.position.set(p.x, p.y - 0.07, p.z);
        rowGroup.add(bulb);
        const sp = this.addGlow(0xffd48a, 0.68, p.x, p.y - 0.07, p.z, 0.58, rowGroup);
        this.stringBulbSprites.push(sp);
      }

      this.stringLightRows.push(rowGroup);
    });
  }

  private buildParticles(): void {
    const rnd = this.rng;
    for (let i = 0; i < 36; i++) {
      const sp = this.addGlow(i % 4 === 0 ? 0x9cd4ff : 0xffdfa0, 0.28, 0, 0, 0, 0);
      this.sparks.push({ sprite: sp, p: i / 36, a: i * 1.9 });
    }

    const n = 120;
    this.dustPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.dustBase.push([rnd() * 12 - 6, 0.25 + rnd() * 4.8, -6.5 + rnd() * 12, rnd() * 6]);
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    const dust = new THREE.Points(
      this.dustGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        color: 0xffe8bc,
        size: 0.11,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(dust);
  }

  public syncUpgrades(state: WasuredamaSaveState): void {
    const u = state.upgrades;
    this.lampLevel = u.streetLamp;

    // 1. streetLamp: extra glowing halo rings around streetlamp head
    this.extraLampGlows.forEach((g, idx) => {
      g.visible = u.streetLamp >= idx * 2 + 1;
    });

    // 2. stringLights: unlock successive rows of overhead warm fairy bulbs
    this.stringLightRows.forEach((row, idx) => {
      row.visible = idx === 0 || u.stringLights >= idx;
    });

    // 3. burlapSack: bigger & brighter resting burlap sack
    const sackScale = 0.94 + u.burlapSack * 0.045;
    this.sackPropGroup.scale.setScalar(sackScale);
    (this.sackExtraGlow.material as THREE.SpriteMaterial).opacity = 0.28 + u.burlapSack * 0.08;

    // 4. sortingShelf: progressively fill all 18 cubbies with glowing lost treasures
    const visibleCubbies = Math.min(this.shelfItemGroups.length, 4 + u.sortingShelf * 3);
    this.shelfItemGroups.forEach((item, idx) => {
      item.visible = idx < visibleCubbies;
    });

    // 5. hopeJars: progressively reveal all 5 glowing hope jars & promise thread
    const visibleJars = Math.min(this.hopeJarGroups.length, 1 + u.hopeJars);
    this.hopeJarGroups.forEach((jar, idx) => {
      jar.visible = idx < visibleJars;
    });
    this.promiseThreadGroup.visible = u.hopeJars >= 1;

    // 6. oldNotebook: brighten notebook and reveal bench glow
    this.notebookGroup.scale.setScalar(0.95 + u.oldNotebook * 0.05);
    (this.notebookGlow.material as THREE.SpriteMaterial).opacity = 0.32 + u.oldNotebook * 0.12;
    this.benchGroup.visible = true;
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public setPlayerFocus(x: number, z: number): void {
    this.focusX = x;
    this.focusZ = z;
  }

  public triggerShake(strength = 0.18, duration = 0.24): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = Math.max(0.5, width / Math.max(1, height));
    this.camera.fov = this.camera.aspect < 1.35 ? 52 : 45;
    this.camera.updateProjectionMatrix();
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    const smooth = 1 - Math.exp(-4.5 * dt);
    this.feverBlend += ((isFever ? 1 : 0) - this.feverBlend) * smooth;

    // Gentle camera tracking (lobby hero shot vs. crisp oblique top-down gameplay shot)
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (this.cameraMode === 'lobby') {
      desiredPos.set(
        1.55 + Math.sin(elapsed * 0.28) * 0.45,
        2.35 + Math.sin(elapsed * 0.42) * 0.14,
        4.65 + Math.cos(elapsed * 0.25) * 0.35
      );
      desiredLook.set(0, 1.3, -2.5);
    } else {
      desiredPos.set(this.focusX * 0.26, 7.65, 10.15 + this.focusZ * 0.16);
      desiredLook.set(this.focusX * 0.22, 0.38, -0.55 + this.focusZ * 0.14);
    }

    this.camPos.lerp(desiredPos, 1 - Math.exp(-3.8 * dt));
    this.camLook.lerp(desiredLook, 1 - Math.exp(-4.6 * dt));

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer * 4;
      shakeX = (Math.random() - 0.5) * this.shakeStrength * decay;
      shakeY = (Math.random() - 0.5) * this.shakeStrength * decay;
    }

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook);

    // Streetlamp flicker + beat pulse + Starlit Street Fever golden glow
    const beatPulse = Math.pow(1 - beatPhase, 3);
    const flicker = 1 + 0.03 * Math.sin(elapsed * 6.5) + 0.02 * Math.sin(elapsed * 12.1);
    const lampBoost = 1 + this.lampLevel * 0.08 + this.feverBlend * 0.55 + beatPulse * 0.14;

    this.lampLight.intensity = 4.6 * flicker * lampBoost;
    this.lampLowLight.intensity = (1.8 + this.feverBlend * 1.4 + beatPulse * 0.35) * flicker;
    this.shelfLight.intensity = 1.6 + this.feverBlend * 0.9 + energy * 0.5;
    this.jarLight.intensity = 1.2 + Math.sin(elapsed * 2.4) * 0.18 + this.feverBlend * 0.6;

    const gScale = (3.6 + this.lampLevel * 0.18 + this.feverBlend * 1.2) * flicker;
    this.lampGlowMain.scale.set(gScale, gScale, 1);
    const wScale = 9.2 + this.feverBlend * 3.8 + beatPulse * 0.6;
    this.lampGlowWide.scale.set(wScale, wScale, 1);
    (this.lampBeam.material as THREE.MeshBasicMaterial).opacity =
      (0.13 + this.feverBlend * 0.1 + beatPulse * 0.03) * flicker;
    (this.lampPool.material as THREE.MeshBasicMaterial).opacity =
      0.7 + this.feverBlend * 0.25 + beatPulse * 0.08;

    // Sky & fog gently warm into starlit indigo-gold during STARLIT STREET fever
    const bgR = 0.028 + this.feverBlend * 0.045;
    const bgG = 0.042 + this.feverBlend * 0.042;
    const bgB = 0.094 + this.feverBlend * 0.068;
    (this.scene.background as THREE.Color).setRGB(bgR, bgG, bgB);
    this.fog.color.setRGB(bgR, bgG, bgB);
    this.fog.density = 0.022 - this.feverBlend * 0.008;
    this.hemiLight.intensity = 0.58 + this.feverBlend * 0.36;

    // Hanging sign gentle night breeze sway
    this.signGroup.rotation.z = 0.045 * Math.sin(elapsed * 0.95);
    this.signGroup.rotation.y = 0.055 * Math.sin(elapsed * 0.62);

    // Puddle ripple pulse
    const ripScale = 0.85 + ((elapsed * 0.45) % 1) * 0.9;
    this.puddleRipple.scale.set(ripScale, ripScale, 1);
    (this.puddleRipple.material as THREE.MeshBasicMaterial).opacity =
      0.38 * (1 - ((elapsed * 0.45) % 1));

    // String light bulbs twinkle on beat
    this.stringBulbSprites.forEach((sp, i) => {
      const tw = 0.62 + 0.16 * Math.sin(elapsed * 2.8 + i * 0.9) + this.feverBlend * 0.35 + beatPulse * 0.12;
      sp.scale.set(tw, tw, 1);
    });

    // Rising warm golden motes around streetlamp
    this.sparks.forEach((w) => {
      const p = (elapsed * (0.055 + this.feverBlend * 0.03) + w.p) % 1;
      const rad = 2.6 * (0.35 + p * 0.8);
      w.sprite.position.set(
        this.lampX + Math.sin(w.a + p * 4) * rad,
        0.18 + p * 3.8,
        this.lampZ + 0.8 + Math.cos(w.a + p * 4) * rad * 0.8
      );
      (w.sprite.material as THREE.SpriteMaterial).opacity =
        (0.65 + this.feverBlend * 0.25) * Math.sin(p * Math.PI);
    });

    // Floating night dust
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i];
      this.dustPos[i * 3] = b[0] + Math.sin(elapsed * 0.32 + b[3]) * 0.35;
      this.dustPos[i * 3 + 1] = 0.25 + ((b[1] + elapsed * 0.06) % 4.8);
      this.dustPos[i * 3 + 2] = b[2] + Math.cos(elapsed * 0.26 + b[3]) * 0.35;
    }
    this.dustGeo.attributes.position.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
