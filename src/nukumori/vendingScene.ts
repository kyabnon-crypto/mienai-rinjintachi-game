import * as THREE from 'three';
import { BENCH_SPOTS } from './config';
import { NukumoriSaveState } from './types';

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

export interface BenchVisual {
  id: number;
  group: THREE.Group;
  seatLight: THREE.PointLight;
  warmGlow: THREE.Sprite;
  frostOverlay: THREE.Mesh;
  warmRipples: THREE.Mesh[];
  pipeGlow: THREE.Mesh;
  visitorGroup: THREE.Group;
  visitorGlow: THREE.Sprite;
  tempGaugeFill: THREE.Mesh;
}

/**
 * 3D Winter Vending-Machine Backroom & Park Bench Plaza ("自動販売機の裏の温度番")
 * Faithful to Nukumori's official room tour diorama (thermostat dial, 5 thermometers,
 * daruma stove & copper kettle, hot can warmer, red scarf, plaid blanket bed,
 * white-breath jars, "おつかれさまです" mug, glowing vending machine front & chimney)
 * expanded into a playable snowy park plaza with 4 interactive warming benches.
 */
export class VendingScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  public benchVisuals: BenchVisual[] = [];

  private rng = makeSeededRng(29);
  private fog: THREE.FogExp2;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private bulbLight: THREE.PointLight;
  private stoveLight: THREE.PointLight;
  private vendCoolLight: THREE.PointLight;
  private thermoLight: THREE.PointLight;

  // Animated shed props
  private needleGroup!: THREE.Group;
  private dialKnobs: THREE.Mesh[] = [];
  private fanBlades!: THREE.Group;
  private signBoard!: THREE.Group;
  private scarfGroup!: THREE.Group;
  private kettleGroup!: THREE.Group;
  private miniBenchRipples: THREE.Mesh[] = [];
  private miniBenchGlow!: THREE.Sprite;
  private bulbGlowMain!: THREE.Sprite;
  private bulbGlowWide!: THREE.Sprite;
  private vendFrontMat!: THREE.MeshBasicMaterial;
  private vendHalo!: THREE.Sprite;
  private mercuryBars: THREE.Mesh[] = [];

  // Upgrade-reactive groups
  private extraThermPipes: THREE.Object3D[] = [];
  private extraStringBulbs: THREE.Sprite[] = [];
  private stringLightRows: THREE.Group[] = [];
  private stoveFlameGlow!: THREE.Sprite;
  private extraHotCans: THREE.Group[] = [];
  private bedExtraGroup!: THREE.Group;
  private extraBreathJars: THREE.Group[] = [];
  private mugSteamSprites: { sprite: THREE.Sprite; p: number; a: number }[] = [];

  // Ambient steam & snow
  private chimneyPlumes: { sprite: THREE.Sprite; p: number; a: number; src: number }[] = [];
  private kettleSteams: { sprite: THREE.Sprite; p: number; a: number }[] = [];
  private warmSparks: { sprite: THREE.Sprite; p: number; a: number }[] = [];
  private snowGeo!: THREE.BufferGeometry;
  private snowPos!: Float32Array;
  private snowBase: [number, number, number, number, number][] = [];
  private snowMat!: THREE.PointsMaterial;

  // Camera state
  private cameraMode: 'lobby' | 'play' = 'lobby';
  private focusX = 0;
  private focusZ = 0.2;
  private camPos = new THREE.Vector3(1.5, 2.55, 5.2);
  private camLook = new THREE.Vector3(0, 1.2, -3.5);
  private shakeTimer = 0;
  private shakeStrength = 0;
  private feverBlend = 0;
  private lampLevel = 0;
  private stoveLevel = 0;
  private avgBenchTemp = 65;

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
    this.scene.background = new THREE.Color(0x060916);
    this.fog = new THREE.FogExp2(0x080d1e, 0.021);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 140);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.glowTex = makeGlowTex();
    this.scene.add(this.worldGroup);

    // Base winter night + warm backroom lighting
    this.hemiLight = new THREE.HemisphereLight(0x88a4dc, 0x282124, 0.62);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xb2c9ff, 0.48);
    this.moonLight.position.set(-7, 13, 9);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.left = -10;
    this.moonLight.shadow.camera.right = 10;
    this.moonLight.shadow.camera.top = 10;
    this.moonLight.shadow.camera.bottom = -10;
    this.moonLight.shadow.bias = -0.0005;
    this.scene.add(this.moonLight);

    this.bulbLight = new THREE.PointLight(0xffbc70, 4.0, 20, 1.2);
    this.bulbLight.position.set(0.3, 2.75, -5.0);
    this.scene.add(this.bulbLight);

    this.stoveLight = new THREE.PointLight(0xff9244, 2.2, 11, 1.35);
    this.stoveLight.position.set(0.3, 0.9, -5.1);
    this.scene.add(this.stoveLight);

    this.thermoLight = new THREE.PointLight(0xffca82, 1.3, 8, 1.4);
    this.thermoLight.position.set(1.2, 1.75, -6.2);
    this.scene.add(this.thermoLight);

    this.vendCoolLight = new THREE.PointLight(0xcbe4ff, 1.9, 10, 1.4);
    this.vendCoolLight.position.set(-3.2, 1.5, -2.5);
    this.scene.add(this.vendCoolLight);

    this.buildSkyAndBuildings();
    this.buildGroundAndSnow();
    this.buildBackroomShed();
    this.buildVendingMachine();
    this.buildThermostatAndGauges();
    this.buildStoveAndKettle();
    this.buildHotCanWarmer();
    this.buildBenchModelAndBreathJars();
    this.buildScarfAndBlanketBed();
    this.buildFrostedWindowAndMug();
    this.buildSignAndLights();
    this.buildInteractiveBenches();
    this.buildParticles();
  }

  private sm(color: number, opts?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0,
      ...opts,
    });
  }

  private woodTex(hue = 25, rx = 1, ry = 1, bands = 5, baseL = 24): THREE.CanvasTexture {
    return makeCanvasTex(
      256,
      256,
      (g, w, h) => {
        const ph = h / bands;
        for (let i = 0; i < bands; i++) {
          const y0 = i * ph;
          const l = baseL + this.rng() * 9;
          g.fillStyle = `hsl(${hue + this.rng() * 6}, ${32 + this.rng() * 10}%, ${l}%)`;
          g.fillRect(0, y0, w, ph);
          for (let k = 0; k < 22; k++) {
            g.strokeStyle =
              this.rng() < 0.5
                ? `rgba(20,10,5,${0.05 + this.rng() * 0.09})`
                : `rgba(255,220,175,${0.04 + this.rng() * 0.08})`;
            g.lineWidth = 0.7 + this.rng() * 1.4;
            const yy = y0 + this.rng() * ph;
            g.beginPath();
            g.moveTo(0, yy);
            g.bezierCurveTo(
              w * 0.33,
              yy + (this.rng() - 0.5) * 5,
              w * 0.66,
              yy + (this.rng() - 0.5) * 5,
              w,
              yy + (this.rng() - 0.5) * 3
            );
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

  private makeSprite(
    color: number,
    scale: number,
    x: number,
    y: number,
    z: number,
    opacity = 0.8,
    parent: THREE.Object3D = this.worldGroup
  ): THREE.Sprite {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity,
      })
    );
    sp.scale.set(scale, scale, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    return sp;
  }

  private addSeg(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    mat: THREE.Material,
    parent: THREE.Object3D = this.worldGroup
  ): THREE.Mesh {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    parent.add(mesh);
    return mesh;
  }

  private buildSkyAndBuildings(): void {
    // Crisp winter starfield
    const n = 340;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const e = 0.22 + this.rng() * 1.1;
      const r = 82;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r * 0.72 + 10;
      pos[i * 3 + 2] = -Math.abs(Math.sin(a)) * Math.cos(e) * r * 0.9 - 14;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.worldGroup.add(
      new THREE.Points(
        sg,
        new THREE.PointsMaterial({
          color: 0xe2ecff,
          size: 1.7,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.78,
          fog: false,
          depthWrite: false,
        })
      )
    );

    // Winter pale moon glow
    const moon = this.makeSprite(0xc6d9ff, 26, -24, 34, -74, 0.55);
    (moon.material as THREE.SpriteMaterial).fog = false;

    // Distant snowy town buildings flanking the plaza
    const facadeTex = makeCanvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#182034';
      g.fillRect(0, 0, w, h);
      for (let j = 0; j < 36; j++) {
        for (let i = 0; i < 10; i++) {
          const l = 13 + this.rng() * 7;
          g.fillStyle = `hsl(${220 + this.rng() * 14}, 24%, ${l}%)`;
          g.fillRect(i * 25.6 + (j % 2 ? 12 : 0), j * 14.2, 24, 12.5);
        }
      }
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 3; i++) {
          const x = 22 + i * 80;
          const y = 36 + j * 78;
          const lit = this.rng() < 0.16;
          g.fillStyle = '#090d18';
          g.fillRect(x - 4, y - 4, 50, 62);
          if (lit) {
            const gr = g.createLinearGradient(0, y, 0, y + 54);
            gr.addColorStop(0, '#ffd994');
            gr.addColorStop(1, '#d6823a');
            g.fillStyle = gr;
          } else {
            g.fillStyle = `hsl(222, 30%, ${10 + this.rng() * 7}%)`;
          }
          g.fillRect(x, y, 42, 54);
          g.fillStyle = '#090d18';
          g.fillRect(x + 19, y, 4, 54);
          g.fillRect(x, y + 24, 42, 4);
          // Snow sill
          g.fillStyle = 'rgba(232,242,255,0.88)';
          g.fillRect(x - 4, y - 7, 50, 5);
        }
      }
    });
    const facMat = this.sm(0xffffff, {
      map: facadeTex,
      roughness: 0.9,
      emissive: 0x1a1e2e,
      emissiveIntensity: 0.35,
    });
    const darkMat = this.sm(0x161c2e, { roughness: 0.92 });
    const snowMat = this.sm(0xdde8f8, { roughness: 0.95 });

    let zz = -10;
    const heights = [10, 12.5, 9.5, 13, 11, 14];
    for (let i = 0; i < 6; i++) {
      const d = 3.4 + this.rng() * 1.8;
      const hh = heights[i % heights.length];
      const zc = zz + d / 2;

      const mL = [facMat, darkMat, snowMat, darkMat, darkMat, darkMat];
      const bL = new THREE.Mesh(new THREE.BoxGeometry(2.6, hh, d), mL);
      bL.position.set(-8.6, hh / 2, zc);
      this.worldGroup.add(bL);

      const mR = [darkMat, facMat, snowMat, darkMat, darkMat, darkMat];
      const bR = new THREE.Mesh(new THREE.BoxGeometry(2.6, hh, d), mR);
      bR.position.set(8.6, hh / 2, zc);
      this.worldGroup.add(bR);

      zz += d;
    }

    // Back winter apartment wall behind the shed
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(20, 13, 1.2),
      [darkMat, darkMat, snowMat, darkMat, facMat, darkMat]
    );
    backWall.position.set(0, 6.5, -8.5);
    this.worldGroup.add(backWall);

    // Distant winter streetlamp posts on both sides of the snowy park
    const ironMat = this.sm(0x202730, { metalness: 0.65, roughness: 0.45 });
    [-6.2, 6.2].forEach((x) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 4.6, 10), ironMat);
      pole.position.set(x, 2.3, 1.6);
      this.worldGroup.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.06), ironMat);
      arm.position.set(x + (x < 0 ? 0.3 : -0.3), 4.45, 1.6);
      this.worldGroup.add(arm);
      const lx = x + (x < 0 ? 0.56 : -0.56);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffe4aa })
      );
      bulb.position.set(lx, 4.35, 1.6);
      this.worldGroup.add(bulb);
      this.makeSprite(0xffce84, 2.8, lx, 4.35, 1.6, 0.65);
    });
  }

  private buildGroundAndSnow(): void {
    const iceGroundTex = makeCanvasTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#151c2e';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4200; i++) {
          g.fillStyle =
            this.rng() < 0.62
              ? `rgba(205,222,250,${this.rng() * 0.08})`
              : `rgba(5,8,18,${this.rng() * 0.08})`;
          g.fillRect(this.rng() * w, this.rng() * h, 1 + this.rng() * 3, 1 + this.rng() * 3);
        }
        // Subtle paving tiles & frost cracks
        g.strokeStyle = 'rgba(8,12,24,0.34)';
        g.lineWidth = 2;
        for (let y = 0; y < h; y += 64) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(w, y);
          g.stroke();
        }
        for (let x = 0; x < w; x += 64) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, h);
          g.stroke();
        }
        // Frost patches
        for (let i = 0; i < 16; i++) {
          const x = this.rng() * w;
          const y = this.rng() * h;
          const r = 30 + this.rng() * 55;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(200,222,255,0.22)');
          gr.addColorStop(1, 'rgba(200,222,255,0)');
          g.fillStyle = gr;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      },
      5,
      5
    );

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 22),
      this.sm(0xffffff, { map: iceGroundTex, roughness: 0.56, metalness: 0.12 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0.2);
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // Warm golden light pool spilling from Nukumori's backroom shed onto snow
    const warmPool = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 48),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: 0xffa652,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.42,
      })
    );
    warmPool.rotation.x = -Math.PI / 2;
    warmPool.position.set(0.2, 0.015, -3.4);
    this.worldGroup.add(warmPool);

    // Cool blue-white vending machine light pool on left
    const coolPool = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 36),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: 0xbcdfff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.36,
      })
    );
    coolPool.rotation.x = -Math.PI / 2;
    coolPool.position.set(-3.1, 0.018, -2.5);
    this.worldGroup.add(coolPool);

    // Snow drifts along edges & around shed
    const snowMat = this.sm(0xdce8fa, { roughness: 0.94 });
    const driftSpots: [number, number, number, number, number][] = [
      [-6.3, -2.5, 1.3, 0.34, 2.2],
      [-6.4, 2.4, 1.2, 0.3, 2.0],
      [6.3, -2.2, 1.3, 0.34, 2.2],
      [6.4, 2.6, 1.2, 0.3, 2.0],
      [-4.8, -5.0, 0.95, 0.28, 1.8],
      [4.5, -5.0, 0.95, 0.28, 1.8],
      [0, 5.4, 3.8, 0.22, 0.8],
    ];
    driftSpots.forEach(([x, z, sx, sy, sz]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), snowMat);
      s.position.set(x, 0, z);
      s.scale.set(sx, sy, sz);
      s.receiveShadow = true;
      this.worldGroup.add(s);
    });

    // Shiny frozen ice patch near the vending machine
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 28),
      this.sm(0x0c1930, { metalness: 0.88, roughness: 0.08 })
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(-1.7, 0.012, -1.6);
    ice.scale.set(1.25, 0.72, 1);
    this.worldGroup.add(ice);
  }

  private buildBackroomShed(): void {
    const plankMat = this.sm(0xffffff, {
      map: this.woodTex(26, 1.4, 1, 5, 22),
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const floorMat = this.sm(0xffffff, {
      map: this.woodTex(24, 3, 2.4, 4, 24),
      roughness: 0.84,
    });

    // Raised wooden duckboard floor of Nukumori's cozy nook (centered around z = -5.4)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.08, 3.6), floorMat);
    floor.position.set(0.2, 0.04, -5.4);
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    // Back plank wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.35, 0.12), plankMat);
    backWall.position.set(0.2, 1.68, -7.15);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    // Right plank wall (left side is sheltered by the vending machine)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.25, 3.6), plankMat);
    rightWall.position.set(3.82, 1.62, -5.4);
    rightWall.receiveShadow = true;
    this.worldGroup.add(rightWall);

    // Corrugated tin lean-to roof + snow layer + sparkling icicles
    const corrTex = makeCanvasTex(
      128,
      128,
      (g, w, h) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#4d6560' : '#3d5651';
          g.fillRect(i * 16, 0, 16, h);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(i * 16 + 3, 0, 3, h);
        }
        for (let i = 0; i < 200; i++) {
          g.fillStyle = `rgba(155,82,42,${this.rng() * 0.3})`;
          g.fillRect(this.rng() * w, this.rng() * h, 2 + this.rng() * 4, 2 + this.rng() * 7);
        }
      },
      6,
      3
    );

    const roofG = new THREE.Group();
    roofG.position.set(0.2, 3.12, -5.35);
    roofG.rotation.x = 0.14;
    this.worldGroup.add(roofG);

    const tinRoof = new THREE.Mesh(
      new THREE.BoxGeometry(8.0, 0.08, 4.3),
      this.sm(0xffffff, { map: corrTex, roughness: 0.6, metalness: 0.32 })
    );
    roofG.add(tinRoof);

    const snowRoof = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.16, 4.1),
      this.sm(0xdce8f8, { roughness: 0.94 })
    );
    snowRoof.position.set(0, 0.12, -0.05);
    roofG.add(snowRoof);

    // Icicles hanging from front edge of the roof
    const icicleMat = this.sm(0xcfe6ff, {
      transparent: true,
      opacity: 0.78,
      roughness: 0.12,
    });
    for (let i = 0; i < 26; i++) {
      const len = 0.1 + this.rng() * 0.26;
      const ic = new THREE.Mesh(new THREE.ConeGeometry(0.024 + this.rng() * 0.012, len, 6), icicleMat);
      ic.position.set(-3.75 + i * 0.3 + this.rng() * 0.06, -0.04 - len / 2, 2.15);
      ic.rotation.x = Math.PI;
      roofG.add(ic);
    }

    // Wooden corner posts
    const postMat = this.sm(0x4a3a2a, { roughness: 0.9 });
    [-3.35, 3.78].forEach((x) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.86, 8), postMat);
      p.position.set(x, 1.43, -3.55);
      this.worldGroup.add(p);
    });
  }

  private buildVendingMachine(): void {
    const ironMat = this.sm(0x20262c, { metalness: 0.65, roughness: 0.48 });

    // Glowing front texture ("あったか〜い / つめた〜い" + colorful drinks)
    const frontTex = makeCanvasTex(256, 480, (g, w, h) => {
      g.fillStyle = '#24403e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c83c34';
      g.fillRect(14, 12, 114, 42);
      g.fillStyle = '#2f6fb5';
      g.fillRect(128, 12, 114, 42);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 20px "Zen Maru Gothic", sans-serif';
      g.fillText('あったか〜い', 71, 33);
      g.fillText('つめた〜い', 185, 33);

      const gr = g.createLinearGradient(0, 60, 0, 330);
      gr.addColorStop(0, '#f4faff');
      gr.addColorStop(1, '#cfe0ee');
      g.fillStyle = gr;
      g.fillRect(14, 62, 228, 268);

      const cc = ['#c8392b', '#e68c2e', '#7c4c2a', '#2e7d5b', '#2f5fa0', '#e8c14a'];
      for (let r = 0; r < 4; r++) {
        for (let i = 0; i < 6; i++) {
          g.fillStyle = cc[(i + r * 2) % 6];
          g.fillRect(22 + i * 36, 76 + r * 62, 26, 42);
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(25 + i * 36, 80 + r * 62, 6, 34);
        }
        g.fillStyle = '#8a97a3';
        g.fillRect(14, 122 + r * 62, 228, 4);
        g.fillStyle = '#ffffff';
        g.fillRect(22, 126 + r * 62, 212, 9);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = r >= 2 ? '#c8392b' : '#2f6fb5';
          g.fillRect(26 + i * 36, 128 + r * 62, 18, 5);
        }
      }

      g.fillStyle = '#1a2c2b';
      g.fillRect(14, 338, 228, 62);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i < 3 ? '#e64c3e' : '#3fae6a';
        g.fillRect(24 + i * 28, 348, 20, 14);
        g.fillStyle = '#e9f0f5';
        g.fillRect(24 + i * 28, 370, 20, 6);
      }
      g.fillStyle = '#0a1211';
      g.fillRect(204, 346, 26, 44);
      g.fillStyle = '#ffd27a';
      g.fillRect(212, 356, 10, 3);
      g.fillStyle = '#0b1514';
      g.fillRect(30, 414, 170, 52);
      g.strokeStyle = '#5a7a76';
      g.lineWidth = 4;
      g.strokeRect(30, 414, 170, 52);
    });

    // Back panel texture with exhaust louvers & "あたためちゅう" sticker
    const backTex = makeCanvasTex(256, 460, (g, w, h) => {
      g.fillStyle = '#41605a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        g.fillStyle =
          this.rng() < 0.5
            ? `rgba(20,30,28,${this.rng() * 0.25})`
            : `rgba(160,90,50,${this.rng() * 0.25})`;
        g.fillRect(this.rng() * w, this.rng() * h, 2 + this.rng() * 5, 2 + this.rng() * 8);
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(18, 300, w - 36, 10);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = '#16201e';
        g.fillRect(34, 322 + i * 13, w - 68, 6);
      }
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 4;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#dfd5b4';
      g.fillRect(146, 380, 82, 42);
      g.fillStyle = '#4a3f35';
      g.font = '700 13px "Zen Maru Gothic", sans-serif';
      g.textAlign = 'center';
      g.fillText('あたためちゅう', 187, 405);
    });

    const vendGroup = new THREE.Group();
    vendGroup.position.set(-3.45, 0, -4.45);
    vendGroup.rotation.y = 0.24;
    this.worldGroup.add(vendGroup);

    const bodyMat = this.sm(0x2d4a47, { roughness: 0.62, metalness: 0.25 });
    const backMat = this.sm(0xffffff, { map: backTex, roughness: 0.7, metalness: 0.2 });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 2.25, 0.96),
      [backMat, bodyMat, bodyMat, bodyMat, bodyMat, bodyMat]
    );
    body.position.set(0, 1.18, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    vendGroup.add(body);

    // Top snow cap on vending machine
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.1, 1.02), ironMat);
    topCap.position.set(0, 2.34, 0);
    vendGroup.add(topCap);

    // Glowing front display facing slightly toward street
    this.vendFrontMat = new THREE.MeshBasicMaterial({
      map: frontTex,
      color: 0xdce6f0,
    });
    const frontPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 2.12), this.vendFrontMat);
    frontPlane.position.set(0, 1.18, 0.486);
    vendGroup.add(frontPlane);

    // Glowing warm exhaust fan on the right/back side (visible inside Nukumori's nook!)
    const fanG = new THREE.Group();
    fanG.position.set(0.62, 1.56, 0);
    fanG.rotation.y = Math.PI / 2;
    vendGroup.add(fanG);
    fanG.add(
      new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ color: 0x070a0d }))
    );
    const fanRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 8, 24), ironMat);
    fanRim.position.z = 0.012;
    fanG.add(fanRim);

    this.fanBlades = new THREE.Group();
    fanG.add(this.fanBlades);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.06, 0.01), ironMat);
      b.position.set(Math.cos((i * Math.PI) / 2) * 0.1, Math.sin((i * Math.PI) / 2) * 0.1, 0.02);
      b.rotation.z = (i * Math.PI) / 2 + 0.45;
      this.fanBlades.add(b);
    }

    // Warm orange exhaust coils glowing on the back of the vending machine
    for (let i = 0; i < 3; i++) {
      const coil = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.06, 0.46),
        new THREE.MeshBasicMaterial({ color: 0xff9a3a })
      );
      coil.position.set(0.618, 0.42 + i * 0.11, 0);
      vendGroup.add(coil);
    }
    this.makeSprite(0xff9a3a, 1.1, 0.72, 0.55, 0, 0.55, vendGroup);

    // Exhaust chimney rising above the roof
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 10), ironMat);
    chim.position.set(0, 3.45, -0.15);
    vendGroup.add(chim);
    const chimHat = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 10), ironMat);
    chimHat.position.set(0, 4.62, -0.15);
    vendGroup.add(chimHat);

    this.vendHalo = this.makeSprite(0xdaf0ff, 4.0, -3.25, 1.35, -3.65, 0.34);
  }

  private buildThermostatAndGauges(): void {
    const brassMat = this.sm(0xc99a4a, { metalness: 0.78, roughness: 0.3 });
    const glassMat = this.sm(0xdfe9ee, {
      transparent: true,
      opacity: 0.28,
      roughness: 0.06,
      metalness: 0.1,
    });

    // Brass steam pipes crawling from vending machine back to thermostat
    const pipePts = [
      new THREE.Vector3(-2.75, 0.9, -4.6),
      new THREE.Vector3(-2.1, 0.9, -6.98),
      new THREE.Vector3(1.15, 0.9, -6.98),
      new THREE.Vector3(1.15, 1.25, -6.98),
    ];
    for (let i = 0; i < pipePts.length - 1; i++) {
      this.addSeg(pipePts[i], pipePts[i + 1], 0.04, brassMat);
    }

    // Extra upgrade brass pipes & valves (revealed as thermostat upgrades)
    for (let lv = 0; lv < 4; lv++) {
      const g = new THREE.Group();
      const y = 2.38 + lv * 0.14;
      this.addSeg(
        new THREE.Vector3(-2.6, y, -6.98),
        new THREE.Vector3(2.8, y, -6.98),
        0.028,
        brassMat,
        g
      );
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 16), this.sm(0xc83e32));
      valve.position.set(-0.8 + lv * 1.1, y, -6.9);
      g.add(valve);
      g.visible = false;
      this.worldGroup.add(g);
      this.extraThermPipes.push(g);
    }

    // Old Thermostat Control Box with working brass dial & needle!
    const dialTex = makeCanvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f2e8d0';
      g.fillRect(0, 0, w, h);
      const cx = 128;
      const cy = 142;
      g.lineWidth = 15;
      g.strokeStyle = '#4a6fa8';
      g.beginPath();
      g.arc(cx, cy, 92, Math.PI * 1.12, Math.PI * 1.38);
      g.stroke();
      g.strokeStyle = '#e6a83a';
      g.beginPath();
      g.arc(cx, cy, 92, Math.PI * 1.38, Math.PI * 1.62);
      g.stroke();
      g.strokeStyle = '#c8443a';
      g.beginPath();
      g.arc(cx, cy, 92, Math.PI * 1.62, Math.PI * 1.88);
      g.stroke();

      g.strokeStyle = '#3a2f28';
      g.lineWidth = 3;
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI * 1.12 + (Math.PI * 0.76 * i) / 20;
        const r1 = i % 5 ? 78 : 68;
        const r2 = 85;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        g.stroke();
      }
      g.fillStyle = '#3a2f28';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 24px "Zen Maru Gothic", sans-serif';
      g.fillText('ぬくもり', cx, cy + 38);
      g.font = '700 18px "Zen Maru Gothic", sans-serif';
      g.fillText('さむい', cx - 60, cy - 48);
      g.fillText('あつい', cx + 60, cy - 48);
    });

    const unit = new THREE.Group();
    unit.position.set(1.15, 1.72, -6.96);
    this.worldGroup.add(unit);

    unit.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 1.18, 0.3),
        this.sm(0x5a7368, { roughness: 0.55, metalness: 0.38 })
      )
    );
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.038, 10, 36), brassMat);
    bezel.position.set(0, 0.08, 0.155);
    unit.add(bezel);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 40),
      new THREE.MeshStandardMaterial({
        map: dialTex,
        roughness: 0.55,
        emissive: 0x38240e,
        emissiveIntensity: 0.6,
      })
    );
    face.position.set(0, 0.08, 0.158);
    unit.add(face);

    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), glassMat);
    glass.position.set(0, 0.08, 0.17);
    unit.add(glass);

    this.needleGroup = new THREE.Group();
    this.needleGroup.position.set(0, 0.06, 0.164);
    unit.add(this.needleGroup);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.35, 0.005), this.sm(0xa82a24));
    needle.position.y = 0.15;
    this.needleGroup.add(needle);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), brassMat);
    pin.position.z = 0.01;
    this.needleGroup.add(pin);

    this.dialKnobs = [-0.48, 0, 0.48].map((x) => {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.074, 0.075, 16), brassMat);
      k.rotation.x = Math.PI / 2;
      k.position.set(x, -0.44, 0.18);
      unit.add(k);
      return k;
    });

    // Warm pilot lamp on thermostat
    const pilot = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa63a })
    );
    pilot.position.set(0.62, 0.42, 0.16);
    unit.add(pilot);
    this.makeSprite(0xffa63a, 0.55, 0.62, 0.42, 0.22, 0.8, unit);

    // Row of 5 Cold-Measuring Thermometers on left back wall!
    const tb = new THREE.Group();
    tb.position.set(-1.35, 1.72, -7.02);
    this.worldGroup.add(tb);
    tb.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.95, 1.38, 0.05),
        this.sm(0xffffff, { map: this.woodTex(22, 1, 1, 5, 24), roughness: 0.85 })
      )
    );

    const levels = [0.25, 0.38, 0.55, 0.64, 0.45];
    const mercMat = this.sm(0xd83630, {
      emissive: 0x801812,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    levels.forEach((lv, i) => {
      const x = -0.72 + i * 0.36;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.02, 0.014), this.sm(0xeee5d0));
      plate.position.set(x, -0.05, 0.035);
      tb.add(plate);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.88, 8), glassMat);
      tube.position.set(x, -0.03, 0.055);
      tb.add(tube);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), mercMat);
      bulb.position.set(x, -0.49, 0.055);
      tb.add(bulb);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.8, 6), mercMat);
      bar.position.set(x, -0.49 + 0.4 * lv, 0.055);
      bar.scale.y = lv;
      tb.add(bar);
      this.mercuryBars.push(bar);
    });
  }

  private buildStoveAndKettle(): void {
    const brassMat = this.sm(0xc99a4a, { metalness: 0.78, roughness: 0.3 });
    const copperMat = this.sm(0xc97d48, { metalness: 0.76, roughness: 0.28, side: THREE.DoubleSide });
    const ironMat = this.sm(0x20262c, { metalness: 0.65, roughness: 0.48 });

    const stove = new THREE.Group();
    stove.position.set(0.32, 0.08, -5.2);
    this.worldGroup.add(stove);

    const stoveMat = this.sm(0x2d4b3d, { roughness: 0.52, metalness: 0.46 });
    const bodyPts = [
      [0, 0],
      [0.34, 0],
      [0.36, 0.06],
      [0.36, 0.64],
      [0.3, 0.76],
      [0.22, 0.8],
      [0, 0.8],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 28), stoveMat);
    body.castShadow = true;
    stove.add(body);

    [0.09, 0.68].forEach((y) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.364, 0.014, 6, 28), brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      stove.add(ring);
    });

    // Glowing fire window on front of the stove
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.18, 0.025),
      new THREE.MeshBasicMaterial({ color: 0xff9a3a })
    );
    win.position.set(0, 0.38, 0.358);
    stove.add(win);
    this.stoveFlameGlow = this.makeSprite(0xff9838, 1.35, 0, 0.38, 0.44, 0.72, stove);

    // Copper kettle sitting atop the stove
    this.kettleGroup = new THREE.Group();
    this.kettleGroup.position.set(0, 0.81, 0);
    stove.add(this.kettleGroup);

    const kPts = [
      [0, 0],
      [0.19, 0],
      [0.22, 0.05],
      [0.22, 0.17],
      [0.15, 0.25],
      [0.07, 0.28],
      [0, 0.28],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    this.kettleGroup.add(new THREE.Mesh(new THREE.LatheGeometry(kPts, 32), copperMat));
    const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), brassMat);
    lidKnob.position.y = 0.31;
    this.kettleGroup.add(lidKnob);

    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.038, 0.22, 12), copperMat);
    spout.position.set(0.22, 0.19, 0);
    spout.rotation.z = -0.9;
    this.kettleGroup.add(spout);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 28, Math.PI), ironMat);
    handle.position.set(0, 0.26, 0);
    this.kettleGroup.add(handle);

    // Stove flue pipe going up through roof
    const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 10), ironMat);
    flue.position.set(0, 2.0, -0.32);
    stove.add(flue);
  }

  private buildHotCanWarmer(): void {
    const crateMat = this.sm(0xffffff, {
      map: this.woodTex(28, 1.2, 1, 4, 24),
      roughness: 0.82,
    });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.62, 0.68), crateMat);
    crate.position.set(2.45, 0.39, -6.15);
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.worldGroup.add(crate);

    // Glowing orange heater tray
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.11, 0.56),
      this.sm(0x2b2f36, { metalness: 0.6, roughness: 0.48 })
    );
    tray.position.set(2.45, 0.75, -6.15);
    this.worldGroup.add(tray);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 0.016, 0.48),
      new THREE.MeshBasicMaterial({ color: 0xff8a2e })
    );
    plate.position.set(2.45, 0.815, -6.15);
    this.worldGroup.add(plate);
    this.makeSprite(0xff8a2e, 1.1, 2.45, 0.9, -6.15, 0.46);

    const canColors = [0xc8392b, 0xe88e2e, 0x7c4c2a, 0x2e7d5b, 0x2f5fa0, 0xe8c14a];
    const silverMat = this.sm(0xd0d4dc, { metalness: 0.88, roughness: 0.28 });
    const labelMat = this.sm(0xf2e8cc, { roughness: 0.7 });

    const makeCan = (x: number, y: number, z: number, col: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.16, 14),
        this.sm(col, { roughness: 0.35, metalness: 0.52 })
      );
      body.position.y = 0.08;
      g.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.052, 0.014, 14), silverMat);
      top.position.y = 0.166;
      g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.052, 14), labelMat);
      band.position.y = 0.08;
      g.add(band);
      this.worldGroup.add(g);
      return g;
    };

    // Base hot cans on warmer
    const baseOffsets = [
      [-0.32, -0.12],
      [-0.12, -0.12],
      [0.08, -0.12],
      [0.28, -0.12],
      [-0.22, 0.12],
      [0.0, 0.12],
      [0.22, 0.12],
    ];
    baseOffsets.forEach(([ox, oz], i) => {
      makeCan(2.45 + ox, 0.82, -6.15 + oz, canColors[i % canColors.length]);
    });

    // Upper shelf for upgrade extra cans
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.05, 0.34), crateMat);
    shelf.position.set(2.45, 1.38, -6.95);
    this.worldGroup.add(shelf);

    for (let i = 0; i < 6; i++) {
      const can = makeCan(2.0 + i * 0.18, 1.41, -6.95, canColors[(i + 1) % canColors.length]);
      can.visible = false;
      this.extraHotCans.push(can);
    }
  }

  private buildBenchModelAndBreathJars(): void {
    const woodMat = this.sm(0xffffff, {
      map: this.woodTex(24, 1, 1, 4, 24),
      roughness: 0.84,
    });
    const ironMat = this.sm(0x20262c, { metalness: 0.65, roughness: 0.48 });

    // Little table holding the miniature glowing park bench model
    const tbl = new THREE.Group();
    tbl.position.set(2.75, 0.08, -4.45);
    this.worldGroup.add(tbl);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.055, 0.56), woodMat);
    top.position.y = 0.62;
    tbl.add(top);
    [
      [-0.35, -0.22],
      [0.35, -0.22],
      [-0.35, 0.22],
      [0.35, 0.22],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), woodMat);
      leg.position.set(lx, 0.31, lz);
      tbl.add(leg);
    });

    // Miniature park bench model with warm ripple rings
    const mb = new THREE.Group();
    mb.position.set(0, 0.65, 0);
    tbl.add(mb);
    [0, 0.07].forEach((z) => {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.018, 0.055), woodMat);
      plank.position.set(0, 0.11, z - 0.025);
      mb.add(plank);
    });
    [0, 0.055].forEach((y, i) => {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.042, 0.014), woodMat);
      back.position.set(0, 0.18 + i * 0.055, -0.075);
      mb.add(back);
    });
    [-0.19, 0.19].forEach((x) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.11), ironMat);
      l.position.set(x, 0.055, 0);
      mb.add(l);
    });

    this.miniBenchGlow = this.makeSprite(0xffa24a, 0.95, 0, 0.14, 0.02, 0.72, mb);
    this.miniBenchRipples = [0, 1, 2].map((i) => {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.072, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffc67d,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      r.rotation.x = -Math.PI / 2;
      r.position.set(0, 0.125, 0);
      r.userData.p = i / 3;
      mb.add(r);
      return r;
    });

    // Right wall shelves with glowing White Breath Jars ("はぁ", "ふぅ", "ほっ", "ぽかぽか")
    [1.24, 1.72].forEach((y) => {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.048, 1.75), woodMat);
      sh.position.set(3.58, y, -5.25);
      this.worldGroup.add(sh);
    });

    const glassMat = this.sm(0xdfe9ee, {
      transparent: true,
      opacity: 0.3,
      roughness: 0.06,
      metalness: 0.1,
    });
    const corkMat = this.sm(0xb88a55, { roughness: 0.95 });

    const makeJar = (x: number, y: number, z: number, col: number, radius = 0.1, height = 0.28): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 18), glassMat);
      glass.position.y = height / 2;
      g.add(glass);
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.84, radius * 0.88, height * 0.65, 16),
        this.sm(col, { emissive: col, emissiveIntensity: 0.85, roughness: 0.25 })
      );
      inner.position.y = height * 0.36;
      g.add(inner);
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.55, 0.07, 12), corkMat);
      cork.position.y = height + 0.025;
      g.add(cork);
      this.makeSprite(col, 0.68, 0, height * 0.6, 0, 0.36, g);
      this.worldGroup.add(g);
      return g;
    };

    // Base lower-shelf breath jars
    [-5.85, -5.45, -5.05, -4.65].forEach((z, i) => {
      makeJar(3.54, 1.27, z, i % 2 === 0 ? 0xddeaff : 0xffdfb2, 0.105, 0.29);
    });

    // Upper-shelf upgrade jars (unlock as breathJars upgrades!)
    [-5.85, -5.52, -5.19, -4.86, -4.53].forEach((z, i) => {
      const j = makeJar(3.54, 1.75, z, i % 2 === 0 ? 0xffd79b : 0xcde4ff, 0.092, 0.24);
      j.visible = false;
      this.extraBreathJars.push(j);
    });
  }

  private buildScarfAndBlanketBed(): void {
    const brassMat = this.sm(0xc99a4a, { metalness: 0.78, roughness: 0.3 });
    const woodMat = this.sm(0xffffff, { map: this.woodTex(24, 1, 1, 2, 22), roughness: 0.85 });

    // Red Scarf Hook Board on back wall
    const hb = new THREE.Group();
    hb.position.set(-0.08, 1.92, -7.02);
    this.worldGroup.add(hb);
    hb.add(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.15, 0.055), woodMat));
    [-0.24, 0, 0.24].forEach((x) => {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 10, Math.PI * 1.4), brassMat);
      hook.position.set(x, -0.06, 0.055);
      hook.rotation.z = Math.PI * 0.8;
      hb.add(hook);
    });

    this.scarfGroup = new THREE.Group();
    this.scarfGroup.position.set(0, -0.06, 0.08);
    hb.add(this.scarfGroup);
    const scarfMat = this.sm(0xc83630, { roughness: 0.98, side: THREE.DoubleSide });
    const curve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0.04, 0),
      new THREE.Vector3(-0.1, -0.12, 0.02),
      new THREE.Vector3(0.05, -0.25, 0.03),
      new THREE.Vector3(0.11, -0.52, 0.04),
      new THREE.Vector3(0.09, -0.88, 0.03),
      new THREE.Vector3(0.1, -1.08, 0.03),
    ]);
    const muf1 = new THREE.Mesh(new THREE.TubeGeometry(curve1, 22, 0.058, 8), scarfMat);
    muf1.scale.set(1, 1, 0.42);
    this.scarfGroup.add(muf1);

    const curve2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.04, 0),
      new THREE.Vector3(0.14, -0.22, 0.025),
      new THREE.Vector3(0.2, -0.55, 0.03),
      new THREE.Vector3(0.22, -0.78, 0.03),
    ]);
    const muf2 = new THREE.Mesh(new THREE.TubeGeometry(curve2, 18, 0.052, 8), scarfMat);
    muf2.scale.set(1, 1, 0.42);
    this.scarfGroup.add(muf2);
    this.makeSprite(0xff7262, 0.65, 0.1, -0.68, 0.12, 0.18, this.scarfGroup);

    // Cozy Plaid Blanket Bed & Copper Hot-Water Bottle (left rear inside nook)
    const plaidTex = makeCanvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = '#a8453a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(242,226,192,0.75)';
        [20, 84].forEach((p) => {
          g.fillRect(p, 0, 12, h);
          g.fillRect(0, p, w, 12);
        });
        g.fillStyle = 'rgba(60,20,20,0.4)';
        [52, 116].forEach((p) => {
          g.fillRect(p, 0, 6, h);
          g.fillRect(0, p, w, 6);
        });
      },
      3,
      3
    );

    const nest = new THREE.Group();
    nest.position.set(-1.45, 0.08, -6.1);
    this.worldGroup.add(nest);
    const plaidMat = this.sm(0xffffff, { map: plaidTex, roughness: 0.98 });
    const matBase = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 1.15), plaidMat);
    matBase.position.y = 0.025;
    nest.add(matBase);

    const blanket = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), plaidMat);
    blanket.position.set(0.1, 0.19, 0.05);
    blanket.scale.set(0.58, 0.19, 0.4);
    nest.add(blanket);

    const pillow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.sm(0xf2e8d4, { roughness: 0.98 }));
    pillow.position.set(-0.52, 0.19, -0.02);
    pillow.scale.set(0.25, 0.11, 0.2);
    nest.add(pillow);

    // Copper hot water bottle + extra cushions (upgradable)
    this.bedExtraGroup = new THREE.Group();
    nest.add(this.bedExtraGroup);
    const copperMat = this.sm(0xc97d48, { metalness: 0.76, roughness: 0.28 });
    const hwPts = [
      [0, 0],
      [0.11, 0],
      [0.15, 0.04],
      [0.15, 0.11],
      [0.08, 0.18],
      [0.03, 0.21],
      [0, 0.21],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const hw = new THREE.Mesh(new THREE.LatheGeometry(hwPts, 24), copperMat);
    hw.position.set(0.62, 0.1, 0.28);
    hw.rotation.z = 1.45;
    this.bedExtraGroup.add(hw);
    this.makeSprite(0xffcb8c, 1.35, 0.1, 0.34, 0, 0.3, this.bedExtraGroup);
    this.bedExtraGroup.visible = false;
  }

  private buildFrostedWindowAndMug(): void {
    // Frosted little window on far left of back wall
    const frostTex = makeCanvasTex(128, 160, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, h * 0.65);
      gr.addColorStop(0, '#d2e0ff');
      gr.addColorStop(1, '#31426d');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.72)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 42; i++) {
        let x = this.rng() < 0.5 ? this.rng() * w : this.rng() < 0.5 ? 0 : w;
        let y = this.rng() < 0.5 ? (this.rng() < 0.5 ? 0 : h) : this.rng() * h;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (w / 2 - x) * 0.12 + (this.rng() - 0.5) * 14;
          y += (h / 2 - y) * 0.12 + (this.rng() - 0.5) * 14;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    });

    const frameMat = this.sm(0x3a2a1c, { roughness: 0.82 });
    const win = new THREE.Group();
    win.position.set(-2.78, 1.92, -7.02);
    this.worldGroup.add(win);
    win.add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.04, 0.06), frameMat));
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.88),
      new THREE.MeshBasicMaterial({ map: frostTex })
    );
    pane.position.z = 0.036;
    win.add(pane);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.88, 0.02), frameMat);
    barV.position.z = 0.042;
    win.add(barV);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.02), frameMat);
    barH.position.set(0, 0.04, 0.042);
    win.add(barH);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.055, 0.16), frameMat);
    sill.position.set(0, -0.55, 0.06);
    win.add(sill);

    // "おつかれさまです" ceramic mug sitting on the front corner of the shed floor!
    const mugTex = makeCanvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#efe7d6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a382c';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 22px "Zen Maru Gothic", sans-serif';
      g.fillText('おつかれ', w / 2, h * 0.38);
      g.fillText('さまです', w / 2, h * 0.68);
    });
    const mugGroup = new THREE.Group();
    mugGroup.position.set(-1.35, 0.08, -3.95);
    this.worldGroup.add(mugGroup);
    const mugBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.115, 0.24, 20),
      this.sm(0xffffff, { map: mugTex, roughness: 0.4 })
    );
    mugBody.position.y = 0.12;
    mugBody.rotation.y = -Math.PI / 2;
    mugGroup.add(mugBody);
    const mugCoffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.108, 16),
      this.sm(0x3a2012, { roughness: 0.2 })
    );
    mugCoffee.rotation.x = -Math.PI / 2;
    mugCoffee.position.y = 0.22;
    mugGroup.add(mugCoffee);
    const mugHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.068, 0.016, 8, 16, Math.PI),
      this.sm(0xefe7d6, { roughness: 0.4 })
    );
    mugHandle.position.set(0.115, 0.125, 0);
    mugHandle.rotation.z = -Math.PI / 2;
    mugGroup.add(mugHandle);

    // Rising cozy steam wisps from the mug
    for (let i = 0; i < 6; i++) {
      const sp = this.makeSprite(0xfff1dc, 0.22, -1.35, 0.4, -3.95, 0.35);
      this.mugSteamSprites.push({ sprite: sp, p: i / 6, a: i * 1.9 });
    }
  }

  private buildSignAndLights(): void {
    const ironMat = this.sm(0x20262c, { metalness: 0.65, roughness: 0.48 });

    // Hanging wooden sign "おんどばん" under the front eaves
    const signTex = makeCanvasTex(512, 220, (g, w, h) => {
      g.fillStyle = '#2a1e16';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#deb66e';
      g.lineWidth = 8;
      g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = '#f5dea8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 84px "Zen Maru Gothic", sans-serif';
      g.fillText('おんどばん', w / 2, h / 2 + 4);
    });

    const signG = new THREE.Group();
    signG.position.set(0.25, 2.84, -3.45);
    this.worldGroup.add(signG);
    [-0.36, 0.36].forEach((x) => {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), ironMat);
      wire.position.set(x, -0.15, 0);
      signG.add(wire);
    });

    this.signBoard = new THREE.Group();
    this.signBoard.position.y = -0.32;
    signG.add(this.signBoard);
    this.signBoard.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.06, 0.44, 0.045),
        this.sm(0xffffff, {
          map: signTex,
          roughness: 0.68,
          emissive: 0x30200e,
          emissiveIntensity: 0.55,
        })
      )
    );

    // Naked hanging bulb with dark green enamel shade inside shed
    const bulbG = new THREE.Group();
    bulbG.position.set(0.3, 3.05, -5.0);
    this.worldGroup.add(bulbG);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.56, 4), ironMat);
    cord.position.y = -0.28;
    bulbG.add(cord);
    const shadePts = [
      [0, 0],
      [0.14, 0],
      [0.22, -0.07],
      [0.27, -0.16],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const shade = new THREE.Mesh(
      new THREE.LatheGeometry(shadePts, 24),
      this.sm(0x2d4b3d, { roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide })
    );
    shade.position.y = -0.5;
    bulbG.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff0c4 })
    );
    bulb.position.y = -0.68;
    bulbG.add(bulb);
    this.bulbGlowMain = this.makeSprite(0xffd28a, 2.8, 0.3, 2.38, -5.0, 0.88);
    this.bulbGlowWide = this.makeSprite(0xffc072, 7.2, 0.3, 2.38, -5.0, 0.25);

    // Upgradeable warm string light rows draped across the snowy plaza
    const rowZs = [-3.35, -1.2, 1.4];
    rowZs.forEach((rz, rowIdx) => {
      const row = new THREE.Group();
      const curvePts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const x = -6.0 + u * 12.0;
        const sag = Math.sin(u * Math.PI) * 0.52;
        curvePts.push(new THREE.Vector3(x, 3.85 - sag + rowIdx * 0.2, rz));
      }
      const wireCurve = new THREE.CatmullRomCurve3(curvePts);
      row.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(wireCurve, 24, 0.012, 6, false),
          this.sm(0x1f242c)
        )
      );
      for (let b = 1; b <= 9; b++) {
        const pt = wireCurve.getPoint(b / 10);
        const bulbMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffe2a4 })
        );
        bulbMesh.position.copy(pt);
        bulbMesh.position.y -= 0.05;
        row.add(bulbMesh);
        const sp = this.makeSprite(0xffcc7c, 0.95, pt.x, pt.y - 0.05, pt.z, 0.72, row);
        this.extraStringBulbs.push(sp);
      }
      row.visible = false;
      this.worldGroup.add(row);
      this.stringLightRows.push(row);
    });
  }

  private buildInteractiveBenches(): void {
    const woodMatBase = this.sm(0xffffff, {
      map: this.woodTex(24, 1.2, 1, 3, 24),
      roughness: 0.82,
    });
    const ironMat = this.sm(0x202732, { metalness: 0.7, roughness: 0.45 });
    const brassMat = this.sm(0xc99a4a, { metalness: 0.75, roughness: 0.35 });

    BENCH_SPOTS.forEach((spot) => {
      const g = new THREE.Group();
      g.position.set(spot.x, 0, spot.z);
      g.rotation.y = spot.rotY;
      this.worldGroup.add(g);

      // Park bench seat planks & backrest
      const seatMat = woodMatBase.clone();
      [-0.14, 0.04, 0.22].forEach((zOff) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.15), seatMat);
        plank.position.set(0, 0.48, zOff);
        plank.castShadow = true;
        plank.receiveShadow = true;
        g.add(plank);
      });
      [0.74, 0.94].forEach((yOff) => {
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 0.05), seatMat);
        back.position.set(0, yOff, -0.26);
        back.rotation.x = -0.16;
        back.castShadow = true;
        g.add(back);
      });

      // Cast-iron bench legs & armrests
      [-0.64, 0.64].forEach((xOff) => {
        const legFront = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.07), ironMat);
        legFront.position.set(xOff, 0.24, 0.2);
        g.add(legFront);
        const legBack = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.96, 0.07), ironMat);
        legBack.position.set(xOff, 0.48, -0.24);
        g.add(legBack);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.52), ironMat);
        arm.position.set(xOff, 0.66, -0.02);
        g.add(arm);
      });

      // Frost crystal blanket across bench seat (appears when chilly!)
      const frostOverlay = new THREE.Mesh(
        new THREE.BoxGeometry(1.58, 0.07, 0.52),
        new THREE.MeshStandardMaterial({
          color: 0xaed4ff,
          emissive: 0x3c78c8,
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.0,
          roughness: 0.22,
        })
      );
      frostOverlay.position.set(0, 0.52, 0.03);
      g.add(frostOverlay);

      // 3D temperature progress bar floating subtly under front edge of bench
      const gaugeBg = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 0.06, 0.04),
        new THREE.MeshBasicMaterial({ color: 0x0e1628 })
      );
      gaugeBg.position.set(0, 0.14, 0.38);
      g.add(gaugeBg);

      const tempGaugeFill = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.045, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffb866 })
      );
      tempGaugeFill.position.set(0, 0.14, 0.39);
      g.add(tempGaugeFill);

      // Warm seat point light & floor aura sprite
      const seatLight = new THREE.PointLight(0xffa652, 0.9, 5.2, 1.5);
      seatLight.position.set(0, 0.95, 0.15);
      g.add(seatLight);

      const warmGlow = this.makeSprite(0xffa652, 2.2, 0, 0.55, 0.08, 0.42, g);

      // Warm expanding ripples when bench is cozy / being warmed
      const warmRipples = [0, 1].map((i) => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.45, 0.52, 32),
          new THREE.MeshBasicMaterial({
            color: 0xffc67c,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 0.04, 0.04);
        ring.userData.p = i * 0.5;
        g.add(ring);
        return ring;
      });

      // Glowing subterranean warmth pipe connecting shed to each bench!
      const startPt = new THREE.Vector3(0.32, 0.04, -4.6);
      const endPt = new THREE.Vector3(spot.x, 0.04, spot.z);
      const pipeGlow = this.addSeg(
        startPt,
        endPt,
        0.032,
        new THREE.MeshBasicMaterial({
          color: 0xffa852,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

      // Brass junction node under bench
      const node = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 12), brassMat);
      node.position.set(0, 0.03, 0);
      g.add(node);

      // Cozy translucent silhouette of a grateful winter passerby sitting on the warmed bench!
      const visitorGroup = new THREE.Group();
      visitorGroup.position.set(0, 0.5, 0.04);
      visitorGroup.visible = false;
      g.add(visitorGroup);

      const visMat = new THREE.MeshStandardMaterial({
        color: 0xffe4be,
        emissive: 0xffa24a,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.82,
        roughness: 0.4,
      });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 8, 14), visMat);
      torso.position.y = 0.34;
      visitorGroup.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), visMat);
      head.position.y = 0.74;
      visitorGroup.add(head);
      const visitorGlow = this.makeSprite(0xffd28a, 1.5, 0, 0.62, 0.12, 0.55, visitorGroup);

      this.benchVisuals.push({
        id: spot.id,
        group: g,
        seatLight,
        warmGlow,
        frostOverlay,
        warmRipples,
        pipeGlow,
        visitorGroup,
        visitorGlow,
        tempGaugeFill,
      });
    });
  }

  private buildParticles(): void {
    // Rising steam plumes from vending chimney & stove flue
    for (let i = 0; i < 32; i++) {
      const sp = this.makeSprite(0xffe9ce, 0.85, 0, 0, 0, 0);
      (sp.material as THREE.SpriteMaterial).fog = false;
      this.chimneyPlumes.push({ sprite: sp, p: i / 32, a: i * 1.7, src: i % 3 === 2 ? 1 : 0 });
    }

    // Copper kettle steam wisps
    for (let i = 0; i < 10; i++) {
      const sp = this.makeSprite(0xfff3e2, 0.4, 0, 0, 0, 0);
      this.kettleSteams.push({ sprite: sp, p: i / 10, a: i * 2.3 });
    }

    // Floating cozy amber embers / warmth motes
    for (let i = 0; i < 34; i++) {
      const sp = this.makeSprite(0xffc988, 0.24, 0, 0, 0, 0);
      (sp.material as THREE.SpriteMaterial).fog = false;
      this.warmSparks.push({ sprite: sp, p: i / 34, a: i * 1.9 });
    }

    // Gently falling winter snowflakes across the whole plaza
    const count = 420;
    this.snowPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.snowBase.push([
        this.rng() * 18 - 9,
        this.rng() * 8.5,
        -8 + this.rng() * 16,
        this.rng() * 6.28,
        0.55 + this.rng() * 0.75,
      ]);
    }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snowMat = new THREE.PointsMaterial({
      map: this.glowTex,
      color: 0xeaf2ff,
      size: 0.13,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.worldGroup.add(new THREE.Points(this.snowGeo, this.snowMat));
  }

  public syncUpgrades(state: NukumoriSaveState): void {
    const u = state.upgrades;
    this.lampLevel = u.hangingLamp;
    this.stoveLevel = u.stoveKettle;

    // 1. Thermostat upgrade -> brass pipes & brighter dial
    const pipesVisible = Math.min(this.extraThermPipes.length, Math.ceil(u.thermostat / 2));
    this.extraThermPipes.forEach((p, idx) => {
      p.visible = idx < pipesVisible;
    });
    this.thermoLight.intensity = 1.3 + u.thermostat * 0.22;

    // 2. Hanging Lamp upgrade -> warm overhead plaza string light rows
    this.stringLightRows.forEach((row, idx) => {
      row.visible = u.hangingLamp >= idx + 1;
    });

    // 3. Stove & Kettle upgrade -> stronger stove glow
    this.stoveLight.intensity = 2.2 + u.stoveKettle * 0.25;

    // 4. Can Warmer upgrade -> more hot cans on upper shelf
    this.extraHotCans.forEach((c, idx) => {
      c.visible = idx < u.canWarmer;
    });

    // 5. Red Scarf & Bed upgrade -> copper hot water bottle & glow
    this.bedExtraGroup.visible = u.redScarfBed >= 1;

    // 6. Breath Jars upgrade -> upper shelf glowing breath jars
    this.extraBreathJars.forEach((j, idx) => {
      j.visible = idx < u.breathJars;
    });
  }

  public updateBenchVisual(
    benchId: number,
    temp: number,
    warmingNow: boolean,
    visitorTimer: number,
    elapsed: number
  ): void {
    const vis = this.benchVisuals[benchId];
    if (!vis) return;

    const tNorm = Math.max(0, Math.min(1, temp / 100));
    const chilly = Math.max(0, (42 - temp) / 42);
    const cozy = Math.max(0, (temp - 55) / 45);

    // Color interpolates from icy blue (chilly) -> warm stove amber (cozy)
    const col = new THREE.Color().setRGB(
      0.34 + tNorm * 0.66,
      0.56 + tNorm * 0.24 - chilly * 0.08,
      0.95 - tNorm * 0.64
    );

    vis.seatLight.color.copy(col);
    vis.seatLight.intensity = 0.6 + cozy * 1.6 + (warmingNow ? 1.1 : 0);

    const glowMat = vis.warmGlow.material as THREE.SpriteMaterial;
    glowMat.color.copy(col);
    glowMat.opacity = 0.22 + cozy * 0.45 + (warmingNow ? 0.25 : 0);
    const gScale = 1.7 + cozy * 1.1 + (warmingNow ? Math.sin(elapsed * 9) * 0.22 + 0.35 : 0);
    vis.warmGlow.scale.set(gScale, gScale, 1);

    // Frost overlay fades in when bench gets cold
    const fMat = vis.frostOverlay.material as THREE.MeshStandardMaterial;
    fMat.opacity = chilly * 0.72;
    vis.frostOverlay.visible = chilly > 0.04;

    // 3D gauge fill bar under bench
    vis.tempGaugeFill.scale.x = Math.max(0.05, tNorm);
    vis.tempGaugeFill.position.x = -0.65 * (1 - Math.max(0.05, tNorm));
    (vis.tempGaugeFill.material as THREE.MeshBasicMaterial).color.copy(col);

    // Warm subterranean pipe glow
    const pipeMat = vis.pipeGlow.material as THREE.MeshBasicMaterial;
    pipeMat.color.copy(col);
    pipeMat.opacity = warmingNow ? 0.78 : 0.16 + cozy * 0.32;

    // Ripples expand when warming or freshly cozy
    vis.warmRipples.forEach((ring) => {
      const rMat = ring.material as THREE.MeshBasicMaterial;
      if (warmingNow || visitorTimer > 0) {
        const p = (elapsed * (warmingNow ? 0.95 : 0.55) + (ring.userData.p as number)) % 1;
        ring.scale.setScalar(1 + p * 2.1);
        rMat.color.setHex(warmingNow ? 0xffb866 : 0xffe2a8);
        rMat.opacity = (1 - p) * (warmingNow ? 0.62 : 0.42);
      } else {
        rMat.opacity = 0;
      }
    });

    // Cozy grateful visitor silhouette when bench was recently warmed!
    vis.visitorGroup.visible = visitorTimer > 0;
    if (visitorTimer > 0) {
      const fade = Math.min(1, visitorTimer / 0.8);
      vis.visitorGroup.position.y = 0.5 + Math.sin(elapsed * 2.2) * 0.025;
      vis.visitorGlow.scale.setScalar(1.3 + 0.25 * Math.sin(elapsed * 3.5));
      (vis.visitorGlow.material as THREE.SpriteMaterial).opacity = 0.52 * fade;
    }
  }

  public setAverageBenchTemp(avgTemp: number): void {
    this.avgBenchTemp = avgTemp;
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public setFocus(x: number, z: number): void {
    this.focusX = x;
    this.focusZ = z;
  }

  public triggerShake(strength = 0.16, duration = 0.22): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.35 ? 53 : 46;
    this.camera.updateProjectionMatrix();
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    const targetFever = isFever ? 1 : 0;
    this.feverBlend += (targetFever - this.feverBlend) * (1 - Math.exp(-4.5 * dt));

    // Sky & snow shift warmly during POKAPOKA NIGHT fever!
    const bgCol = new THREE.Color(0x060916).lerp(new THREE.Color(0x1f1410), this.feverBlend * 0.72);
    this.scene.background = bgCol;
    this.fog.color.copy(bgCol);
    this.fog.density = 0.021 - this.feverBlend * 0.006;

    const beatPulse = Math.pow(1 - beatPhase, 3);

    // Bulb & stove warm flicker synced gently to music
    const bulbFlicker = 1 + 0.04 * Math.sin(elapsed * 6.5) + beatPulse * 0.12 + this.feverBlend * 0.4;
    this.bulbLight.intensity = (3.8 + this.lampLevel * 0.35) * bulbFlicker;
    this.bulbGlowMain.scale.setScalar((2.7 + this.lampLevel * 0.25) * bulbFlicker);
    this.bulbGlowWide.scale.setScalar((7.0 + this.feverBlend * 3.5) * bulbFlicker);

    const stoveFlicker = 1 + 0.09 * Math.sin(elapsed * 8.5) + 0.05 * Math.sin(elapsed * 14);
    this.stoveLight.intensity = (2.2 + this.stoveLevel * 0.25 + this.feverBlend * 1.2) * stoveFlicker;
    this.stoveFlameGlow.scale.setScalar((1.3 + this.stoveLevel * 0.1) * stoveFlicker);

    // Vending machine fluorescent gentle hum
    const vCol = 0.86 + 0.03 * Math.sin(elapsed * 3.2) - (Math.sin(elapsed * 0.9) > 0.985 ? 0.12 : 0);
    this.vendFrontMat.color.setScalar(vCol);
    this.vendCoolLight.intensity = 1.9 * (0.96 + 0.04 * Math.sin(elapsed * 3.2));
    this.vendHalo.scale.setScalar(3.9 + 0.18 * Math.sin(elapsed * 2.4));

    // String lights twinkle
    this.extraStringBulbs.forEach((sp, i) => {
      const tw = 0.8 + 0.22 * Math.sin(elapsed * 3.4 + i * 0.8) + this.feverBlend * 0.4;
      sp.scale.setScalar(0.9 * tw);
    });

    // Thermostat dial needle reflects live average bench warmth!
    const normTemp = Math.max(0, Math.min(1, this.avgBenchTemp / 100));
    const targetNeedle = 0.9 - normTemp * 1.8 + Math.sin(elapsed * 4.5) * 0.03;
    this.needleGroup.rotation.z += (targetNeedle - this.needleGroup.rotation.z) * (1 - Math.exp(-5 * dt));
    if (this.dialKnobs[1]) {
      this.dialKnobs[1].rotation.y = Math.sin(elapsed * 0.7) * 0.3;
    }

    // 5 mercury thermometers breathe gently with music energy & warmth
    this.mercuryBars.forEach((bar, i) => {
      const lv = Math.max(
        0.15,
        Math.min(0.95, normTemp * 0.78 + 0.14 * Math.sin(elapsed * 1.1 + i * 1.2) + energy * 0.12)
      );
      bar.scale.y = lv;
      bar.position.y = -0.49 + 0.4 * lv;
    });

    // Exhaust fan spinning, sign & red scarf swaying gently, kettle simmering
    this.fanBlades.rotation.z = -elapsed * (6.8 + this.feverBlend * 4);
    this.signBoard.rotation.z = 0.04 * Math.sin(elapsed * 0.95);
    this.signBoard.rotation.y = 0.05 * Math.sin(elapsed * 0.6);
    this.scarfGroup.rotation.z = 0.045 * Math.sin(elapsed * 1.1) + 0.02 * Math.sin(elapsed * 2.4);
    this.kettleGroup.rotation.y = Math.sin(elapsed * 0.6) * 0.06;
    this.kettleGroup.position.y = 0.81 + Math.abs(Math.sin(elapsed * 12)) * (0.008 + this.feverBlend * 0.012);

    // Miniature bench ripples
    this.miniBenchRipples.forEach((r) => {
      const p = (elapsed * 0.48 + (r.userData.p as number)) % 1;
      r.scale.setScalar(1 + p * 3.0);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.52 * (1 - p);
    });
    this.miniBenchGlow.scale.setScalar(0.95 * (1 + 0.12 * Math.sin(elapsed * 2.2)));

    // Rising chimney & stove steam plumes
    this.chimneyPlumes.forEach((item) => {
      const p = (elapsed * 0.08 + item.p) % 1;
      const sx = item.src ? 0.32 : -3.45;
      const sy = item.src ? 3.2 : 4.6;
      const sz = item.src ? -5.52 : -4.6;
      item.sprite.position.set(
        sx + Math.sin(item.a + p * 3) * 0.16 * (1 + p * 2) + p * 0.85,
        sy + p * 3.1,
        sz + Math.cos(item.a + p * 3) * 0.12 * (1 + p * 2) + p * 0.3
      );
      const sc = 0.48 + p * 1.8;
      item.sprite.scale.set(sc, sc, 1);
      (item.sprite.material as THREE.SpriteMaterial).opacity = 0.48 * Math.sin(p * Math.PI);
    });

    // Kettle & mug steam wisps
    this.kettleSteams.forEach((item) => {
      const p = (elapsed * 0.22 + item.p) % 1;
      item.sprite.position.set(
        0.56 + p * 0.34 + Math.sin(item.a + p * 6) * 0.05,
        1.12 + p * 1.1,
        -5.2 + Math.cos(item.a + p * 5) * 0.05
      );
      const sc = 0.18 + p * 0.46;
      item.sprite.scale.set(sc, sc, 1);
      (item.sprite.material as THREE.SpriteMaterial).opacity = 0.46 * Math.sin(p * Math.PI);
    });

    this.mugSteamSprites.forEach((item) => {
      const p = (elapsed * 0.26 + item.p) % 1;
      item.sprite.position.set(
        -1.35 + Math.sin(item.a + p * 5) * 0.06,
        0.34 + p * 0.72,
        -3.95 + Math.cos(item.a + p * 4) * 0.05
      );
      const sc = 0.12 + p * 0.28;
      item.sprite.scale.set(sc, sc, 1);
      (item.sprite.material as THREE.SpriteMaterial).opacity = 0.4 * Math.sin(p * Math.PI);
    });

    // Warm floating sparks around shed & plaza
    this.warmSparks.forEach((item) => {
      const p = (elapsed * 0.06 + item.p) % 1;
      item.sprite.position.set(
        Math.sin(item.a + p * 4) * 3.6 * (0.45 + p * 0.65),
        0.35 + p * 2.8,
        -4.5 + Math.cos(item.a + p * 4) * 3.2
      );
      (item.sprite.material as THREE.SpriteMaterial).opacity =
        (0.55 + this.feverBlend * 0.35) * Math.sin(p * Math.PI);
    });

    // Falling snow (turns into golden warm steam-snow during POKAPOKA NIGHT!)
    this.snowMat.color.setHex(0xeaf2ff).lerp(new THREE.Color(0xffe096), this.feverBlend * 0.88);
    for (let i = 0; i < this.snowBase.length; i++) {
      const b = this.snowBase[i];
      this.snowPos[i * 3] = b[0] + Math.sin(elapsed * 0.45 + b[3]) * 0.42;
      this.snowPos[i * 3 + 1] = (((b[1] - elapsed * b[4] * (0.65 - this.feverBlend * 0.2)) % 8.5) + 8.5) % 8.5;
      this.snowPos[i * 3 + 2] = b[2] + Math.cos(elapsed * 0.35 + b[3]) * 0.32;
    }
    this.snowGeo.attributes.position.needsUpdate = true;

    // Camera motion: cozy close-up showcase in lobby, elevated tactical winter-plaza view in play
    const targetCamPos = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    if (this.cameraMode === 'lobby') {
      targetCamPos.set(
        1.15 + Math.sin(elapsed * 0.35) * 0.75,
        2.15 + Math.sin(elapsed * 0.25) * 0.14,
        4.15 + Math.cos(elapsed * 0.3) * 0.35
      );
      targetLook.set(0.0, 1.15, -3.5);
    } else {
      targetCamPos.set(
        this.focusX * 0.36,
        6.15 - this.feverBlend * 0.25,
        8.65 + this.focusZ * 0.18
      );
      targetLook.set(this.focusX * 0.26, 0.72, -1.05 + this.focusZ * 0.22);
    }

    const lerpK = 1 - Math.exp(-4.5 * dt);
    this.camPos.lerp(targetCamPos, lerpK);
    this.camLook.lerp(targetLook, lerpK);

    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const mag = this.shakeStrength * (this.shakeTimer / 0.22);
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
    } else {
      this.shakeStrength = 0;
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  }
}
