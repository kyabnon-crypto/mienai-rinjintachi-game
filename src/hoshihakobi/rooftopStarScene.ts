import * as THREE from 'three';
import { STAR_SPOTS } from './config';
import { HoshihakobiSaveState } from './types';

interface StarSpotVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  signCanvas: HTMLCanvasElement;
  signTex: THREE.CanvasTexture;
  signBoard: THREE.Mesh;
  starOrbs: THREE.Mesh[];
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

interface ShootingStarArc {
  group: THREE.Group;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  dur: number;
}

interface SkyShootingStar {
  group: THREE.Group;
  period: number;
  offset: number;
  angle: number;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function createStarShape(outerR: number, innerR: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? innerR : outerR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function create3DStarGeometry(outerR: number): THREE.ExtrudeGeometry {
  const depth = outerR * 0.35;
  const g = new THREE.ExtrudeGeometry(createStarShape(outerR, outerR * 0.45), {
    depth,
    bevelEnabled: true,
    bevelThickness: outerR * 0.08,
    bevelSize: outerR * 0.06,
    bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * 3D Rooftop Attic Star-Sorting Workshop ("屋根裏の星の仕分け工房") & Starry Rooftop Terrace.
 * Faithfully fuses the official picturebook (`story.txt`, `10.ホシハコビ.PNG`, `10.ホシハコビ_イメージ.png`)
 * and official 3D room tour (`ホシハコビの部屋.html`):
 *  - Deep starry indigo night sky with 1,200+ twinkling stars, Milky Way glow, glowing moon,
 *    and streaking 3D shooting stars ("流れ星") across the sky
 *  - Distant sleeping town rooftops with warm lit windows & the iconic Clocktower ("時計塔")
 *  - Attic wooden floorboards, central navy-and-gold circular starry rug ("丸い敷物"),
 *    slanted roof eaves with skylights ("天窓") casting diagonal moonbeams & glowing floor pools
 *  - Back gable wall with the round moon window ("丸窓"), framed Constellation Map ("ほしのちず")
 *    with pinned wish notes ("ねがい・あした・げんき・ありがとう"), and brass telescope ("望遠鏡")
 *  - Centerpiece circular Star-Rearranging Workbench ("星のならべかえ台") with constellation chart top,
 *    golden star dishes, magnifying glass, tweezers & rotating overhead Star Mobile ("星のモビール")
 *  - Hanging hexagonal brass lanterns ("吊りランタン") & warm corner terrace lantern posts
 *  - Left wall: glowing 4-color Star-Jar Shelves ("星の瓶の棚") & cozy quilted bed ("ふかふかのベッド")
 *  - Right wall: wooden Star Crates ("ながれ星・ねがい星・ちいさな星・ひとやすみ"),
 *    live-updating Tonight's Star Manifest Board ("今夜の星"), wall-mounted Star Backpack ("星を背負う木箱"),
 *    and Star Logbook Desk ("星の記録帳と羽ペン")
 *  - 4 interactive 3D Constellation Miracle Spots with live alignment gauges & shooting-star launches
 */
export class RooftopStarScene {
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
  private workbenchLight: THREE.PointLight;
  private lanternLightL: THREE.PointLight;
  private lanternLightR: THREE.PointLight;
  private moonWinLight: THREE.PointLight;
  private shelfWarmLight: THREE.PointLight;

  // Animated environment props
  private starMobileGroup!: THREE.Group;
  private mobileStars: { group: THREE.Group; phase: number }[] = [];
  private floatingRoomStars: { group: THREE.Group; x: number; y: number; z: number; phase: number }[] = [];
  private starMaterials: THREE.MeshStandardMaterial[] = [];
  private glowSprites: { sprite: THREE.Sprite; baseScale: number; phase: number; baseOp: number }[] = [];
  private skyStarsA!: THREE.PointsMaterial;
  private skyStarsB!: THREE.PointsMaterial;
  private skyShootingStars: SkyShootingStar[] = [];
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];
  private workbenchConstellationGroup!: THREE.Group;
  private shootingArcs: ShootingStarArc[] = [];

  // Live Tonight's Star Manifest Board texture
  private manifestCanvas!: HTMLCanvasElement;
  private manifestTex!: THREE.CanvasTexture;
  private lastManifestKey = '';

  // Upgrade-responsive 3D prop groups
  private workbenchExtraGroup = new THREE.Group();
  private skylightExtraGroup = new THREE.Group();
  private cratesExtraGroup = new THREE.Group();
  private mapExtraGroup = new THREE.Group();
  private bedExtraGroup = new THREE.Group();
  private deskExtraGroup = new THREE.Group();

  // Interactive 4 constellation spots
  private spotVisuals: StarSpotVisual[] = [];

  // Shared materials for launched shooting-star arcs
  private arcStarGeo: THREE.ExtrudeGeometry;
  private arcStarMat: THREE.MeshStandardMaterial;

  private shiftFlashTimer = 0;
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
    this.scene.background = new THREE.Color(0x070b1c);
    this.scene.fog = new THREE.FogExp2(0x070b1c, 0.017);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 180);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.arcStarGeo = create3DStarGeometry(0.16);
    this.arcStarMat = new THREE.MeshStandardMaterial({
      color: 0xfff0a8,
      emissive: 0xffd060,
      emissiveIntensity: 1.5,
      roughness: 0.28,
    });

    this.scene.add(this.worldGroup);

    // Moonlit sapphire sky contrasted with warm golden star-workshop glow
    this.hemiLight = new THREE.HemisphereLight(0x88a8e6, 0x262c48, 0.78);
    this.scene.add(this.hemiLight);

    this.keyDirLight = new THREE.DirectionalLight(0xaec6ff, 0.82);
    this.keyDirLight.position.set(-5.5, 13.0, 6.5);
    this.keyDirLight.castShadow = true;
    this.keyDirLight.shadow.mapSize.set(1024, 1024);
    this.keyDirLight.shadow.camera.near = 1;
    this.keyDirLight.shadow.camera.far = 38;
    const d = 10.0;
    this.keyDirLight.shadow.camera.left = -d;
    this.keyDirLight.shadow.camera.right = d;
    this.keyDirLight.shadow.camera.top = d;
    this.keyDirLight.shadow.camera.bottom = -d;
    this.keyDirLight.shadow.bias = -0.0005;
    this.scene.add(this.keyDirLight);

    this.workbenchLight = new THREE.PointLight(0xffdc8c, 2.2, 11.5, 1.3);
    this.workbenchLight.position.set(0, 2.8, 0);
    this.scene.add(this.workbenchLight);

    this.lanternLightL = new THREE.PointLight(0xffd896, 1.35, 9.5, 1.35);
    this.lanternLightL.position.set(-3.4, 3.1, -1.6);
    this.scene.add(this.lanternLightL);

    this.lanternLightR = new THREE.PointLight(0xffd896, 1.35, 9.5, 1.35);
    this.lanternLightR.position.set(3.4, 3.1, -1.6);
    this.scene.add(this.lanternLightR);

    this.moonWinLight = new THREE.PointLight(0xa4c4ff, 1.5, 12.5, 1.3);
    this.moonWinLight.position.set(0, 3.8, -5.2);
    this.scene.add(this.moonWinLight);

    this.shelfWarmLight = new THREE.PointLight(0xffd68e, 1.15, 8.5, 1.4);
    this.shelfWarmLight.position.set(-4.6, 1.7, -2.1);
    this.scene.add(this.shelfWarmLight);

    this.buildStarMaterials();
    this.buildNightSkyAndTown();
    this.buildAtticWorkshopShell();
    this.buildCentralStarWorkbench();
    this.buildOverheadLanternsAndMobile();
    this.buildLeftStarShelvesAndBed();
    this.buildRightCratesBackpackAndDesk();
    this.buildFrontRooftopTerrace();
    this.buildAmbientStarsAndDust();
    this.buildFourStarSpots();

    this.worldGroup.add(
      this.workbenchExtraGroup,
      this.skylightExtraGroup,
      this.cratesExtraGroup,
      this.mapExtraGroup,
      this.bedExtraGroup,
      this.deskExtraGroup
    );
  }

  private buildStarMaterials(): void {
    this.starMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0xffe48e,
        emissive: 0xffcb5c,
        emissiveIntensity: 1.0,
        roughness: 0.35,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xcbe4ff,
        emissive: 0x8ec0ff,
        emissiveIntensity: 0.9,
        roughness: 0.35,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xffd0b6,
        emissive: 0xff9e74,
        emissiveIntensity: 0.9,
        roughness: 0.35,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xd4ffe6,
        emissive: 0x84e6b4,
        emissiveIntensity: 0.85,
        roughness: 0.35,
      }),
    ];
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.26, 'rgba(255,250,232,0.52)');
    r.addColorStop(0.62, 'rgba(220,235,255,0.12)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  private makeWoodTexture(hue: number, lightBase: number, rx = 2, ry = 2, planks = 6): THREE.CanvasTexture {
    const rnd = createSeededRandom(Math.round(hue * 17 + lightBase * 31));
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const ph = 256 / planks;
    for (let i = 0; i < planks; i++) {
      const y0 = i * ph;
      g.fillStyle = `hsl(${hue + rnd() * 6}, ${30 + rnd() * 10}%, ${lightBase + rnd() * 8}%)`;
      g.fillRect(0, y0, 256, ph);
      for (let k = 0; k < 20; k++) {
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,10,5' : '255,220,170'}, ${0.04 + rnd() * 0.08})`;
        g.lineWidth = 0.7 + rnd() * 1.2;
        const yy = y0 + rnd() * ph;
        g.beginPath();
        g.moveTo(0, yy);
        g.bezierCurveTo(80, yy + (rnd() - 0.5) * 4, 170, yy + (rnd() - 0.5) * 4, 256, yy + (rnd() - 0.5) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(10,6,4,0.52)';
      g.fillRect(0, y0, 256, 2.2);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(rx, ry);
    return tx;
  }

  private makePlasterTexture(baseColor: string, rx = 2, ry = 1): THREE.CanvasTexture {
    const rnd = createSeededRandom(419);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = baseColor;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '12,14,32'}, ${rnd() * 0.06})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 2, 2 + rnd() * 2);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(rx, ry);
    return tx;
  }

  private makeRoofTileTexture(rx = 5, ry = 3): THREE.CanvasTexture {
    const rnd = createSeededRandom(901);
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#24354c';
    g.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 9; i++) {
        const x = i * 16 + (j % 2 ? 8 : 0) - 8;
        const y = j * 16;
        g.fillStyle = `hsl(${206 + rnd() * 14}, ${26 + rnd() * 10}%, ${22 + rnd() * 10}%)`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 16, y);
        g.lineTo(x + 16, y + 9);
        g.quadraticCurveTo(x + 8, y + 20, x, y + 9);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.42)';
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(rx, ry);
    return tx;
  }

  private makePaperTexture(lines: string[], bg = '#efe4c6', ink = '#2e4663'): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = 'rgba(130, 96, 56, 0.45)';
    g.lineWidth = 5;
    g.strokeRect(7, 7, 242, 146);
    g.fillStyle = ink;
    g.font = `700 ${lines.length > 2 ? 26 : 36}px "Zen Maru Gothic", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const y = lines.length === 1 ? 80 : 42 + i * (88 / Math.max(1, lines.length - 1));
      g.fillText(line, 128, y);
    });
    return new THREE.CanvasTexture(c);
  }

  private addGlow(
    color: number,
    scale: number,
    x: number,
    y: number,
    z: number,
    opacity = 0.65,
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
        fog: false,
      })
    );
    sp.scale.set(scale, scale, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    this.glowSprites.push({
      sprite: sp,
      baseScale: scale,
      phase: Math.random() * Math.PI * 2,
      baseOp: opacity,
    });
    return sp;
  }

  private buildNightSkyAndTown(): void {
    const rnd = createSeededRandom(1010);

    // 1,250 twinkling multi-layer stars in dome above rooftops
    const makeStarLayer = (count: number, size: number, color: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = rnd() * Math.PI * 2;
        const y = 0.05 + rnd() * 0.95;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const rad = 82 + rnd() * 24;
        pos[i * 3] = Math.cos(theta) * r * rad;
        pos[i * 3 + 1] = y * rad - 4;
        pos[i * 3 + 2] = Math.sin(theta) * r * rad - 10;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity,
        fog: false,
        depthWrite: false,
      });
      this.scene.add(new THREE.Points(geo, mat));
      return mat;
    };

    this.skyStarsA = makeStarLayer(1050, 1.9, 0xfff4db, 0.86);
    this.skyStarsB = makeStarLayer(200, 3.4, 0xcce2ff, 0.94);

    // Warm full moon & Milky Way horizon halo
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false })
    );
    moon.position.set(-18, 17, -44);
    this.scene.add(moon);
    this.addGlow(0xc0d6ff, 28, -18, 17, -44.5, 0.45, this.scene);
    this.addGlow(0x3a5aa8, 95, 6, 14, -64, 0.32, this.scene);
    this.addGlow(0x5274c4, 62, 16, 20, -58, 0.24, this.scene);

    // Ambient streaking shooting stars across the distant sky
    const trailCanvas = document.createElement('canvas');
    trailCanvas.width = 128;
    trailCanvas.height = 8;
    const tg = trailCanvas.getContext('2d')!;
    const grad = tg.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,244,205,0)');
    grad.addColorStop(0.7, 'rgba(255,248,220,0.7)');
    grad.addColorStop(1, 'rgba(255,255,240,1)');
    tg.fillStyle = grad;
    tg.fillRect(0, 0, 128, 8);
    const trailTex = new THREE.CanvasTexture(trailCanvas);

    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const trailMat = new THREE.MeshBasicMaterial({
        map: trailTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.22), trailMat);
      tail.position.x = -3.6;
      g.add(tail);
      const head = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xfff7da,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      head.scale.set(1.3, 1.3, 1);
      g.add(head);
      const angle = -0.36 - i * 0.08;
      g.rotation.z = angle;
      g.visible = false;
      this.scene.add(g);
      this.skyShootingStars.push({
        group: g,
        period: 6.2 + i * 2.1,
        offset: i * 2.6 + 0.8,
        angle,
      });
    }

    // Distant sleeping town rooftops below the workshop + iconic Clocktower from cover artwork
    const bodyMatA = new THREE.MeshStandardMaterial({ color: 0x26314e, roughness: 0.92 });
    const bodyMatB = new THREE.MeshStandardMaterial({ color: 0x322b4c, roughness: 0.92 });
    const roofMatA = new THREE.MeshStandardMaterial({ color: 0x1e354c, roughness: 0.85 });
    const roofMatB = new THREE.MeshStandardMaterial({ color: 0x3a263a, roughness: 0.85 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffcf7e });

    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.5, 0);
    roofShape.lineTo(0.5, 0);
    roofShape.lineTo(0, 1);
    roofShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false });
    gableGeo.translate(0, 0, -0.5);
    gableGeo.rotateY(Math.PI / 2);

    const townGroup = new THREE.Group();
    for (let z = -34; z <= -10; z += 5.8) {
      for (let x = -34; x <= 34; x += 6.4) {
        if (Math.abs(x) < 7.5 && z > -15) continue;
        const hx = x + (rnd() - 0.5) * 2.6;
        const hz = z + (rnd() - 0.5) * 2.2;
        const w = 3.2 + rnd() * 2.2;
        const d = 3.2 + rnd() * 2.0;
        const h = 4.2 + rnd() * 3.8;
        const rh = 1.4 + rnd() * 1.2;
        const base = -8.6;
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rnd() < 0.5 ? bodyMatA : bodyMatB);
        house.position.set(hx, base + h / 2, hz);
        townGroup.add(house);

        const roof = new THREE.Mesh(gableGeo, rnd() < 0.5 ? roofMatA : roofMatB);
        roof.scale.set(w + 0.45, rh, d + 0.45);
        roof.position.set(hx, base + h, hz);
        townGroup.add(roof);

        const nw = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < nw; k++) {
          if (rnd() < 0.65) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.66), winMat);
            win.position.set(
              hx + (k - (nw - 1) / 2) * 1.05,
              base + h * (0.4 + rnd() * 0.34),
              hz + d / 2 + 0.03
            );
            townGroup.add(win);
          }
        }
      }
    }

    // Iconic Clocktower ("時計塔") rising on the left-back skyline
    const tower = new THREE.Group();
    tower.position.set(-14.5, -7.2, -24);
    const towerShaft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 12.2, 3.2), bodyMatA);
    towerShaft.position.y = 6.1;
    const towerSpire = new THREE.Mesh(new THREE.ConeGeometry(2.35, 5.2, 4), roofMatA);
    towerSpire.rotation.y = Math.PI / 4;
    towerSpire.position.y = 14.8;
    tower.add(towerShaft, towerSpire);

    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe29a, fog: false })
    );
    clockFace.position.set(0, 10.2, 1.64);
    const clockRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.08, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xd9ae4c, metalness: 0.7, roughness: 0.35 })
    );
    clockRim.position.set(0, 10.2, 1.65);
    tower.add(clockFace, clockRim);
    this.addGlow(0xffd282, 4.8, -14.5, 3.0, -22.1, 0.45, this.scene);
    townGroup.add(tower);

    this.scene.add(townGroup);
  }

  private buildAtticWorkshopShell(): void {
    const woodDarkMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(24, 20, 2, 3, 5),
      roughness: 0.78,
    });
    const woodLightMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(30, 30, 2, 2, 5),
      roughness: 0.72,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(26, 25, 4, 4, 8),
      roughness: 0.62,
    });
    const wallPlasterMat = new THREE.MeshStandardMaterial({
      map: this.makePlasterTexture('#2a3d64', 2, 1),
      roughness: 0.92,
    });
    const tileMat = new THREE.MeshStandardMaterial({
      map: this.makeRoofTileTexture(5, 4),
      roughness: 0.8,
    });

    // Main attic workshop wooden floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.28, 9.4), floorMat);
    floor.position.set(0, -0.14, 0.2);
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    // Central navy-and-gold circular starry rug ("丸い敷物")
    const rugCanvas = document.createElement('canvas');
    rugCanvas.width = 512;
    rugCanvas.height = 512;
    const rg = rugCanvas.getContext('2d')!;
    const rnd = createSeededRandom(555);
    rg.fillStyle = '#182447';
    rg.fillRect(0, 0, 512, 512);
    rg.strokeStyle = '#dfb050';
    rg.lineWidth = 9;
    rg.beginPath();
    rg.arc(256, 256, 236, 0, Math.PI * 2);
    rg.stroke();
    rg.lineWidth = 3;
    rg.beginPath();
    rg.arc(256, 256, 196, 0, Math.PI * 2);
    rg.stroke();
    rg.fillStyle = '#efd28f';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 216;
      rg.save();
      rg.translate(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
      rg.rotate(a);
      rg.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 5 : 13;
        const b = (k / 10) * Math.PI * 2;
        if (k === 0) rg.moveTo(Math.cos(b) * rr, Math.sin(b) * rr);
        else rg.lineTo(Math.cos(b) * rr, Math.sin(b) * rr);
      }
      rg.closePath();
      rg.fill();
      rg.restore();
    }
    for (let i = 0; i < 2400; i++) {
      rg.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'}, ${rnd() * 0.05})`;
      rg.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(2.85, 48),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(rugCanvas),
        roughness: 0.94,
      })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.15);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // Back gable wall with circular moon window cutout ("丸窓")
    const backShape = new THREE.Shape();
    backShape.moveTo(-5.7, 0);
    backShape.lineTo(5.7, 0);
    backShape.lineTo(5.7, 2.75);
    backShape.lineTo(0, 6.2);
    backShape.lineTo(-5.7, 2.75);
    backShape.closePath();
    const winHole = new THREE.Path();
    winHole.absarc(0, 3.45, 1.05, 0, Math.PI * 2, false);
    backShape.holes.push(winHole);

    const backWall = new THREE.Mesh(new THREE.ShapeGeometry(backShape, 32), wallPlasterMat);
    backWall.position.set(0, 0, -4.45);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);

    // Round window wooden frame, cross mullions & windowsill
    const winFrame = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.07, 10, 36), woodLightMat);
    winFrame.position.set(0, 3.45, -4.4);
    const mullH = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.055, 0.055), woodLightMat);
    mullH.position.set(0, 3.45, -4.4);
    const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.14, 0.055), woodLightMat);
    mullV.position.set(0, 3.45, -4.4);
    const winSill = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.3), woodLightMat);
    winSill.position.set(0, 2.34, -4.32);
    this.worldGroup.add(winFrame, mullH, mullV, winSill);

    // Starry sky backdrop behind round window
    const winSkyCanvas = document.createElement('canvas');
    winSkyCanvas.width = 256;
    winSkyCanvas.height = 256;
    const wg = winSkyCanvas.getContext('2d')!;
    const wgrad = wg.createLinearGradient(0, 0, 0, 256);
    wgrad.addColorStop(0, '#0a153a');
    wgrad.addColorStop(1, '#314f8e');
    wg.fillStyle = wgrad;
    wg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {
      wg.fillStyle = `rgba(255,248,220,${0.4 + rnd() * 0.6})`;
      wg.beginPath();
      wg.arc(rnd() * 256, rnd() * 256, 0.7 + rnd() * 1.6, 0, Math.PI * 2);
      wg.fill();
    }
    const mg = wg.createRadialGradient(178, 74, 0, 178, 74, 34);
    mg.addColorStop(0, 'rgba(255,246,210,1)');
    mg.addColorStop(0.45, 'rgba(255,235,190,0.8)');
    mg.addColorStop(1, 'rgba(255,235,190,0)');
    wg.fillStyle = mg;
    wg.fillRect(0, 0, 256, 256);
    const winSkyTex = new THREE.CanvasTexture(winSkyCanvas);
    const winSky = new THREE.Mesh(
      new THREE.CircleGeometry(1.18, 32),
      new THREE.MeshBasicMaterial({ map: winSkyTex, fog: false })
    );
    winSky.position.set(0, 3.45, -4.52);
    this.worldGroup.add(winSky);

    // Low side knee-walls & baseboards
    const sideWallL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.75, 8.6), wallPlasterMat);
    sideWallL.position.set(-5.65, 1.375, -0.2);
    const sideWallR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.75, 8.6), wallPlasterMat);
    sideWallR.position.set(5.65, 1.375, -0.2);
    const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 8.6), woodLightMat);
    baseL.position.set(-5.5, 0.08, -0.2);
    const baseR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 8.6), woodLightMat);
    baseR.position.set(5.5, 0.08, -0.2);
    this.worldGroup.add(sideWallL, sideWallR, baseL, baseR);

    // Slanted attic roof eaves (kept high & open in front for unobstructed 3D gameplay view)
    const roofAngle = Math.atan2(3.45, 5.7);
    const makeRoofEave = (side: -1 | 1) => {
      const g = new THREE.Group();
      g.position.set(side * 2.85, 4.48, -1.3);
      g.rotation.z = -side * roofAngle;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.14, 6.8),
        [woodDarkMat, woodDarkMat, tileMat, woodDarkMat, woodDarkMat, woodDarkMat]
      );
      g.add(slab);

      // Wooden rafters
      [-2.8, -1.2, 0.5, 2.2].forEach((rz) => {
        const rafter = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.12, 0.12), woodLightMat);
        rafter.position.set(0, -0.1, rz);
        g.add(rafter);
      });

      // Skylight window ("天窓") inset into the roof slope
      const skylight = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.9),
        new THREE.MeshBasicMaterial({ map: winSkyTex, fog: false })
      );
      skylight.rotation.x = Math.PI / 2;
      skylight.position.set(side * 0.4, -0.075, -0.4);
      g.add(skylight);

      const frameA = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.07, 0.09), woodLightMat);
      frameA.position.set(side * 0.4, -0.1, -1.35);
      const frameB = frameA.clone();
      frameB.position.z = 0.55;
      const frameC = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 2.0), woodLightMat);
      frameC.position.set(side * 0.4 - 0.78, -0.1, -0.4);
      const frameD = frameC.clone();
      frameD.position.x = side * 0.4 + 0.78;
      g.add(frameA, frameB, frameC, frameD);

      this.worldGroup.add(g);
    };
    makeRoofEave(-1);
    makeRoofEave(1);

    // Ridge beam & tie beams
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 6.8), woodDarkMat);
    ridgeBeam.position.set(0, 6.08, -1.3);
    this.worldGroup.add(ridgeBeam);

    // Diagonal moonlight beams streaming down from the skylights
    const beamCanvas = document.createElement('canvas');
    beamCanvas.width = 16;
    beamCanvas.height = 128;
    const bg = beamCanvas.getContext('2d')!;
    const bgrad = bg.createLinearGradient(0, 0, 0, 128);
    bgrad.addColorStop(0, 'rgba(182,212,255,0.65)');
    bgrad.addColorStop(1, 'rgba(182,212,255,0.0)');
    bg.fillStyle = bgrad;
    bg.fillRect(0, 0, 16, 128);
    const beamMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(beamCanvas),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    [
      [-3.1, -1.8],
      [3.1, -1.8],
    ].forEach(([bx, bz]) => {
      const planeA = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.4), beamMat);
      planeA.position.set(bx, 2.1, bz);
      const planeB = planeA.clone();
      planeB.rotation.y = Math.PI / 2;
      this.worldGroup.add(planeA, planeB);

      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 28),
        new THREE.MeshBasicMaterial({
          map: this.glowTex,
          color: 0x9ec4ff,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(bx, 0.018, bz);
      this.worldGroup.add(pool);
    });

    // Back wall framed Constellation Map ("ほしのちず") + wish notes + Brass Telescope ("望遠鏡")
    this.buildConstellationMapAndTelescope(woodDarkMat, woodLightMat);
  }

  private buildConstellationMapAndTelescope(
    woodDarkMat: THREE.MeshStandardMaterial,
    woodLightMat: THREE.MeshStandardMaterial
  ): void {
    const rnd = createSeededRandom(733);
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = 640;
    mapCanvas.height = 400;
    const g = mapCanvas.getContext('2d')!;
    g.fillStyle = '#18274c';
    g.fillRect(0, 0, 640, 400);
    for (let i = 0; i < 360; i++) {
      g.fillStyle = `rgba(255,245,215,${0.2 + rnd() * 0.65})`;
      g.fillRect(rnd() * 640, rnd() * 400, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.strokeStyle = 'rgba(224,184,80,0.9)';
    g.lineWidth = 7;
    g.strokeRect(10, 10, 620, 380);
    g.lineWidth = 2;
    g.strokeRect(22, 22, 596, 356);

    const constellations = [
      [
        [95, 130],
        [175, 100],
        [240, 155],
        [330, 118],
        [405, 175],
      ],
      [
        [430, 285],
        [495, 240],
        [555, 270],
        [585, 185],
        [525, 138],
      ],
      [
        [115, 275],
        [195, 312],
        [285, 265],
        [240, 222],
      ],
    ];
    g.strokeStyle = 'rgba(255,226,144,0.85)';
    g.lineWidth = 2.4;
    g.fillStyle = '#ffeba8';
    constellations.forEach((pts) => {
      g.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
      g.stroke();
      pts.forEach((p) => {
        g.beginPath();
        g.arc(p[0], p[1], 6, 0, Math.PI * 2);
        g.fill();
      });
    });
    g.font = '700 34px "Zen Maru Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffeba8';
    g.fillText('ほしのちず', 320, 56);

    const mapMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.6),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(mapCanvas),
        roughness: 0.65,
        emissive: 0x1b2b52,
        emissiveIntensity: 0.55,
      })
    );
    mapMesh.position.set(-2.95, 1.7, -4.38);
    this.worldGroup.add(mapMesh);

    const barTop = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.07, 0.08), woodDarkMat);
    barTop.position.set(-2.95, 2.52, -4.36);
    const barBot = barTop.clone();
    barBot.position.y = 0.88;
    this.worldGroup.add(barTop, barBot);

    // Pinned wish notes around the constellation map
    const notes: [string, number, number, number][] = [
      ['ねがい', -4.05, 2.54, 0.12],
      ['あした', -1.88, 2.5, -0.1],
      ['げんき', -3.6, 0.92, 0.08],
      ['ありがとう', -2.15, 0.94, -0.07],
    ];
    notes.forEach(([txt, nx, ny, rz]) => {
      const n = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.26),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTexture([txt], '#f7efd8', '#7a3c3c'),
          roughness: 0.9,
        })
      );
      n.position.set(nx, ny, -4.32);
      n.rotation.z = rz;
      this.worldGroup.add(n);
    });

    // Brass Telescope ("望遠鏡") on wooden tripod pointing toward the round moon window
    const scope = new THREE.Group();
    scope.position.set(-1.35, 1.32, -3.45);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe0b850,
      metalness: 0.82,
      roughness: 0.28,
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xc67e46,
      metalness: 0.68,
      roughness: 0.34,
    });
    [0, 2.094, 4.188].forEach((a) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.38, 8), woodDarkMat);
      leg.position.set(Math.cos(a) * 0.24, -0.64, Math.sin(a) * 0.24);
      leg.rotation.z = Math.cos(a) * -0.18;
      leg.rotation.x = Math.sin(a) * 0.18;
      scope.add(leg);
    });
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.11, 10), goldMat);
    scope.add(mount);

    const tubeGroup = new THREE.Group();
    tubeGroup.position.set(0, 0.11, 0);
    tubeGroup.lookAt(0, 3.45, -4.45);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 1.35, 16), copperMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 0.12;
    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 16), goldMat);
    lensRing.rotation.x = Math.PI / 2;
    lensRing.position.z = 0.8;
    const eyePiece = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.2, 10), woodLightMat);
    eyePiece.rotation.x = Math.PI / 2;
    eyePiece.position.z = -0.6;
    tubeGroup.add(tube, lensRing, eyePiece);
    scope.add(tubeGroup);
    this.worldGroup.add(scope);
  }

  private buildCentralStarWorkbench(): void {
    const woodDarkMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(24, 20, 2, 2, 5),
      roughness: 0.74,
    });
    const woodLightMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(30, 30, 2, 2, 5),
      roughness: 0.68,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe4bc54,
      metalness: 0.84,
      roughness: 0.26,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      metalness: 0.1,
    });

    // Circular Star-Rearranging Workbench ("星のならべかえ台") — sits gracefully near center-back so gameplay has wide movement lanes
    const tableGroup = new THREE.Group();
    tableGroup.position.set(0, 0, -0.35);

    const baseLathePts = [
      [0, 0],
      [0.48, 0],
      [0.48, 0.05],
      [0.14, 0.14],
      [0.11, 0.62],
      [0.24, 0.78],
      [0, 0.78],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const ped = new THREE.Mesh(new THREE.LatheGeometry(baseLathePts, 24), woodDarkMat);
    ped.castShadow = true;
    tableGroup.add(ped);

    // Glowing starry constellation chart tabletop
    const nodes: [number, number][] = [
      [-0.5, -0.28],
      [-0.26, 0.14],
      [0.05, -0.04],
      [0.36, 0.28],
      [0.54, -0.18],
      [-0.08, -0.5],
      [0.22, -0.45],
    ];
    const lines: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [5, 6],
      [2, 6],
    ];

    const chartCanvas = document.createElement('canvas');
    chartCanvas.width = 512;
    chartCanvas.height = 512;
    const cg = chartCanvas.getContext('2d')!;
    const rnd = createSeededRandom(808);
    const cgrad = cg.createRadialGradient(256, 256, 0, 256, 256, 256);
    cgrad.addColorStop(0, '#283c72');
    cgrad.addColorStop(1, '#121b3d');
    cg.fillStyle = cgrad;
    cg.fillRect(0, 0, 512, 512);
    cg.strokeStyle = 'rgba(232,190,84,0.68)';
    cg.lineWidth = 5;
    cg.beginPath();
    cg.arc(256, 256, 244, 0, Math.PI * 2);
    cg.stroke();
    cg.lineWidth = 2;
    cg.beginPath();
    cg.arc(256, 256, 210, 0, Math.PI * 2);
    cg.stroke();
    cg.beginPath();
    cg.arc(256, 256, 128, 0, Math.PI * 2);
    cg.stroke();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      cg.beginPath();
      cg.moveTo(256 + Math.cos(a) * 210, 256 + Math.sin(a) * 210);
      cg.lineTo(256 + Math.cos(a) * (i % 3 ? 224 : 238), 256 + Math.sin(a) * (i % 3 ? 224 : 238));
      cg.stroke();
    }
    for (let i = 0; i < 120; i++) {
      cg.fillStyle = `rgba(255,246,216,${0.3 + rnd() * 0.55})`;
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 200;
      cg.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 2, 2);
    }
    const toPx = (n: [number, number]): [number, number] => [
      (n[1] / 0.9 + 0.5) * 512,
      (0.5 - n[0] / 0.9) * 512,
    ];
    cg.strokeStyle = 'rgba(255,228,144,0.82)';
    cg.lineWidth = 3;
    lines.forEach(([ia, ib]) => {
      const a = toPx(nodes[ia]);
      const b = toPx(nodes[ib]);
      cg.beginPath();
      cg.moveTo(a[0], a[1]);
      cg.lineTo(b[0], b[1]);
      cg.stroke();
    });

    const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.06, 48), [
      woodLightMat,
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(chartCanvas),
        roughness: 0.45,
        emissive: 0x1a264d,
        emissiveIntensity: 0.45,
      }),
      woodLightMat,
    ]);
    topDisc.position.y = 0.81;
    topDisc.castShadow = true;
    topDisc.receiveShadow = true;
    tableGroup.add(topDisc);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.032, 8, 48), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.84;
    tableGroup.add(rim);

    // 3D glowing stars laid on the constellation workbench
    this.workbenchConstellationGroup = new THREE.Group();
    const starGeo = create3DStarGeometry(0.072);
    nodes.forEach((n, idx) => {
      const st = new THREE.Mesh(starGeo, this.starMaterials[idx % this.starMaterials.length]);
      st.position.set(n[0], 0.875, n[1]);
      st.rotation.x = -Math.PI / 2;
      st.rotation.z = idx;
      this.workbenchConstellationGroup.add(st);
      this.addGlow(idx % 2 ? 0xffe096 : 0xbce0ff, 0.4, n[0], 0.93, n[1], 0.5, this.workbenchConstellationGroup);
    });
    tableGroup.add(this.workbenchConstellationGroup);

    // Brass star dishes, magnifying glass & tweezers on workbench
    [
      [-0.52, 0.5],
      [0.3, 0.58],
    ].forEach(([dx, dz], k) => {
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.03, 16), goldMat);
      dish.position.set(dx, 0.865, dz);
      tableGroup.add(dish);
      const tinyStarGeo = create3DStarGeometry(0.044);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(tinyStarGeo, this.starMaterials[(i + k) % 4]);
        s.position.set(dx + (i % 2 ? 0.055 : -0.055), 0.9, dz + (i < 2 ? -0.045 : 0.045));
        s.rotation.x = -Math.PI / 2;
        s.rotation.z = i * 1.4;
        tableGroup.add(s);
      }
    });

    const mag = new THREE.Group();
    mag.position.set(0.58, 0.87, 0.34);
    mag.rotation.y = -0.6;
    const mRim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.013, 8, 24), goldMat);
    mRim.rotation.x = Math.PI / 2;
    const mLens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 20), glassMat);
    mLens.rotation.x = -Math.PI / 2;
    const mHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), woodDarkMat);
    mHandle.rotation.z = Math.PI / 2;
    mHandle.position.x = 0.18;
    mag.add(mRim, mLens, mHandle);
    tableGroup.add(mag);

    this.worldGroup.add(tableGroup);
  }

  private buildOverheadLanternsAndMobile(): void {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe2ba52,
      metalness: 0.82,
      roughness: 0.28,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2436,
      metalness: 0.6,
      roughness: 0.5,
    });

    // Overhead slowly rotating Star Mobile ("星のモビール") hanging above the circular workbench
    this.starMobileGroup = new THREE.Group();
    this.starMobileGroup.position.set(0, 5.45, -0.35);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.15, 6), darkMetalMat);
    stem.position.y = -0.575;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.022, 8, 36), goldMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = -1.15;
    this.starMobileGroup.add(stem, hoop);

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const len = 0.42 + (i % 3) * 0.3;
      const sx = Math.cos(a) * 0.75;
      const sz = Math.sin(a) * 0.75;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 4), darkMetalMat);
      wire.position.set(sx, -1.15 - len / 2, sz);
      this.starMobileGroup.add(wire);

      const sg = new THREE.Group();
      sg.position.set(sx, -1.15 - len, sz);
      const st = new THREE.Mesh(create3DStarGeometry(0.11 + (i % 3) * 0.035), this.starMaterials[i % 4]);
      st.position.y = -0.09;
      sg.add(st);
      this.addGlow(i % 2 ? 0xffe49c : 0xbce2ff, 0.58, 0, -0.09, 0, 0.55, sg);
      this.starMobileGroup.add(sg);
      this.mobileStars.push({ group: sg, phase: i * 1.15 });
    }
    const centerWire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 4), darkMetalMat);
    centerWire.position.y = -1.48;
    const bigStar = new THREE.Mesh(create3DStarGeometry(0.22), this.starMaterials[0]);
    bigStar.position.y = -1.9;
    this.starMobileGroup.add(centerWire, bigStar);
    this.addGlow(0xffe090, 1.15, 0, -1.9, 0, 0.62, this.starMobileGroup);
    this.worldGroup.add(this.starMobileGroup);

    // Two hanging hexagonal brass lanterns ("吊りランタン")
    const makeLantern = (x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 5), darkMetalMat);
      cord.position.y = 0.7;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.28, 0.16, 6), goldMat);
      cap.position.y = -0.08;
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.21, 0.54, 6, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0xfff0d0,
          transparent: true,
          opacity: 0.32,
          roughness: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      glass.position.y = -0.43;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 6), goldMat);
      base.position.y = -0.72;
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 14, 10),
        new THREE.MeshStandardMaterial({
          color: 0xfff4cc,
          emissive: 0xffd888,
          emissiveIntensity: 1.3,
          roughness: 0.3,
        })
      );
      core.position.y = -0.43;
      g.add(cord, cap, glass, base, core);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.52;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 5), goldMat);
        bar.position.set(Math.cos(a) * 0.225, -0.43, Math.sin(a) * 0.225);
        g.add(bar);
      }
      this.addGlow(0xffd890, 2.5, 0, -0.43, 0, 0.55, g);
      this.worldGroup.add(g);
    };
    makeLantern(-3.45, 4.15, -1.65);
    makeLantern(3.45, 4.15, -1.65);
  }

  private buildStarJar(x: number, y: number, z: number, r: number, h: number, colorHex: number, parent: THREE.Object3D): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.96, h, 14),
      new THREE.MeshStandardMaterial({
        color: 0xe6f2ff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.08,
      })
    );
    glass.position.y = h / 2;
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.84, r * 0.84, h * 0.65, 12),
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.78,
        roughness: 0.4,
      })
    );
    fill.position.y = h * 0.36;
    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.62, r * 0.52, 0.07, 10),
      new THREE.MeshStandardMaterial({ color: 0xb88a55, roughness: 0.95 })
    );
    cork.position.y = h + 0.02;
    g.add(glass, fill, cork);
    parent.add(g);
  }

  private buildLeftStarShelvesAndBed(): void {
    const woodLightMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(30, 30, 2, 2, 5),
      roughness: 0.72,
    });
    const woodDarkMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(24, 20, 2, 2, 5),
      roughness: 0.78,
    });

    // Two glowing Star-Jar Shelves ("星の瓶の棚") along left wall
    const jarColors = [0xffdc8e, 0xbce0ff, 0xffc09e, 0xc4ffdc];
    [-2.5, -0.65].forEach((sz) => {
      const shelf = new THREE.Group();
      shelf.position.set(-5.25, 0, sz);
      [0.42, 0.94, 1.46, 1.92].forEach((sy) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 1.55), woodLightMat);
        plank.position.y = sy;
        shelf.add(plank);
      });
      [-0.75, 0.75].forEach((dz) => {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.96, 0.05), woodLightMat);
        side.position.set(0, 0.98, dz);
        shelf.add(side);
      });
      [0.42, 0.94, 1.46].forEach((sy, rowIdx) => {
        for (let i = 0; i < 4; i++) {
          const big = (i + rowIdx) % 3 === 0;
          this.buildStarJar(
            0.04,
            sy + 0.03,
            -0.54 + i * 0.36,
            big ? 0.11 : 0.09,
            big ? 0.3 : 0.24,
            jarColors[(i + rowIdx) % 4],
            shelf
          );
        }
        this.addGlow(0xffdc92, 1.45, 0.1, sy + 0.22, 0, 0.24, shelf);
      });
      this.worldGroup.add(shelf);
    });

    // Cozy quilted bed ("斜め天井の下のふかふかベッド") on front-left wall
    const bed = new THREE.Group();
    bed.position.set(-4.72, 0, 1.85);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.24, 2.0), woodDarkMat);
    frame.position.y = 0.12;

    const quiltCanvas = document.createElement('canvas');
    quiltCanvas.width = 128;
    quiltCanvas.height = 128;
    const qg = quiltCanvas.getContext('2d')!;
    const qCols = ['#5c7da8', '#c47264', '#e4c282', '#6e9c88'];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        qg.fillStyle = qCols[(i + j * 2) % 4];
        qg.fillRect(i * 32, j * 32, 32, 32);
        qg.strokeStyle = 'rgba(255,255,255,0.35)';
        qg.setLineDash([3, 3]);
        qg.strokeRect(i * 32 + 3, j * 32 + 3, 26, 26);
      }
    }
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.18, 1.88),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(quiltCanvas), roughness: 0.94 })
    );
    mattress.position.y = 0.32;
    const pillow = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0xefe3c8, roughness: 0.94 })
    );
    pillow.scale.set(1.4, 0.5, 0.9);
    pillow.position.set(0, 0.48, -0.62);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.12, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x56749e, roughness: 0.94 })
    );
    blanket.position.set(0, 0.43, 0.34);

    // Bedside table + glowing star nightlight
    const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), woodLightMat);
    nightstand.position.set(-0.28, 0.21, -1.24);
    const nightStar = new THREE.Mesh(create3DStarGeometry(0.13), this.starMaterials[0]);
    nightStar.position.set(-0.28, 0.56, -1.24);
    bed.add(frame, mattress, pillow, blanket, nightstand, nightStar);
    this.addGlow(0xffdc8e, 1.05, -0.28, 0.56, -1.24, 0.48, bed);
    this.worldGroup.add(bed);
  }

  private buildRightCratesBackpackAndDesk(): void {
    const woodLightMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(30, 30, 2, 2, 5),
      roughness: 0.72,
    });
    const woodDarkMat = new THREE.MeshStandardMaterial({
      map: this.makeWoodTexture(24, 20, 2, 2, 5),
      roughness: 0.78,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe2ba52,
      metalness: 0.82,
      roughness: 0.28,
    });

    // Wooden Star Crates ("ながれ星・ねがい星・ちいさな星・ひとやすみ") along right wall
    const makeCrate = (x: number, y: number, z: number, ry: number, label: string, open: boolean, starCount: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.42, 0.52), woodLightMat);
      body.position.y = 0.21;
      g.add(body);
      [0.09, 0.21, 0.33].forEach((yy) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.032, 0.54), woodDarkMat);
        band.position.y = yy;
        g.add(band);
      });
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.42, -0.26);
      lidPivot.rotation.x = open ? -1.05 : 0;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.54), woodLightMat);
      lid.position.set(0, 0.025, 0.27);
      lidPivot.add(lid);
      g.add(lidPivot);

      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.38, 0.2),
        new THREE.MeshStandardMaterial({ map: this.makePaperTexture([label]), roughness: 0.9 })
      );
      tag.position.set(0, 0.21, 0.285);
      g.add(tag);

      if (open) {
        const stGeo = create3DStarGeometry(0.072);
        for (let i = 0; i < starCount; i++) {
          const st = new THREE.Mesh(stGeo, this.starMaterials[i % 4]);
          st.position.set(-0.22 + (i % 3) * 0.2, 0.38 + (i % 2) * 0.07, -0.1 + (i % 2) * 0.18);
          st.rotation.set(-1.1 + i * 0.2, i * 0.7, i * 1.2);
          g.add(st);
        }
        this.addGlow(0xffdc8e, 1.35, 0, 0.52, 0, 0.52, g);
      }
      this.worldGroup.add(g);
    };

    makeCrate(5.0, 0, 1.65, -Math.PI / 2 + 0.08, 'ながれ星', true, 6);
    makeCrate(5.0, 0, 0.65, -Math.PI / 2 - 0.05, 'ねがい星', false, 0);
    makeCrate(5.02, 0.42, 1.58, -Math.PI / 2 + 0.16, 'ちいさな星', true, 5);
    makeCrate(4.95, 0, -0.35, -Math.PI / 2 + 0.04, 'ひとやすみ', false, 0);

    // Live-updating Tonight's Star Manifest Board ("今夜の星") on right wall
    this.manifestCanvas = document.createElement('canvas');
    this.manifestCanvas.width = 320;
    this.manifestCanvas.height = 220;
    this.manifestTex = new THREE.CanvasTexture(this.manifestCanvas);
    this.updateManifestBoard(3, 12);

    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.94, 1.32), woodDarkMat);
    boardFrame.position.set(5.48, 1.65, -1.65);
    const boardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.22, 0.84),
      new THREE.MeshStandardMaterial({ map: this.manifestTex, roughness: 0.88 })
    );
    boardFace.position.set(5.44, 1.65, -1.65);
    boardFace.rotation.y = -Math.PI / 2;
    this.worldGroup.add(boardFrame, boardFace);

    // Wall-mounted Star-Carrying Wooden Backpack ("星を背負う木箱")
    const hookBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 1.2), woodDarkMat);
    hookBar.position.set(5.48, 1.72, -3.2);
    this.worldGroup.add(hookBar);

    const bp = new THREE.Group();
    bp.position.set(5.26, 1.2, -3.2);
    const bpBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.6, 0.5), woodLightMat);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x5c3a24, roughness: 0.85 });
    const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.64, 0.06), strapMat);
    strap1.position.set(-0.17, 0.02, -0.12);
    const strap2 = strap1.clone();
    strap2.position.z = 0.12;
    bp.add(bpBody, strap1, strap2);
    const bpStarGeo = create3DStarGeometry(0.064);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(bpStarGeo, this.starMaterials[i % 4]);
      s.position.set(-0.04 + (i % 2) * 0.08, 0.36 + (i % 2) * 0.06, -0.15 + i * 0.1);
      s.rotation.set(0.3, i * 0.7, i * 1.1);
      bp.add(s);
    }
    this.addGlow(0xffdc8e, 1.25, 0, 0.4, 0, 0.56, bp);
    this.worldGroup.add(bp);

    // Star Logbook Desk ("星の記録帳と羽ペン") at back-right corner
    const desk = new THREE.Group();
    desk.position.set(2.9, 0, -3.72);
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.86), woodLightMat);
    deskTop.position.y = 0.84;
    desk.add(deskTop);
    [
      [-0.8, -0.36],
      [0.8, -0.36],
      [-0.8, 0.36],
      [0.8, 0.36],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 0.07), woodDarkMat);
      leg.position.set(lx, 0.41, lz);
      desk.add(leg);
    });
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.045, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x6e2a2f, roughness: 0.72 })
    );
    book.position.set(-0.32, 0.9, 0.05);
    book.rotation.y = 0.25;
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.025, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xf4ebd2, roughness: 0.9 })
    );
    pages.position.set(-0.32, 0.93, 0.05);
    pages.rotation.y = 0.25;
    const ink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.052, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c2238, roughness: 0.35 })
    );
    ink.position.set(0.26, 0.92, -0.1);
    const quill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf6eed6, side: THREE.DoubleSide, roughness: 0.85 })
    );
    quill.position.set(0.36, 1.12, -0.1);
    quill.rotation.z = -0.45;

    // Desk lamp
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 14), goldMat);
    lampBase.position.set(-0.68, 0.895, -0.22);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.46, 6), goldMat);
    lampStem.position.set(-0.68, 1.12, -0.22);
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.15, 0.15, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffecc2,
        emissive: 0xffd078,
        emissiveIntensity: 0.85,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.set(-0.68, 1.38, -0.22);
    desk.add(book, pages, ink, quill, lampBase, lampStem, lampShade);
    this.addGlow(0xffd890, 1.65, -0.68, 1.34, -0.22, 0.55, desk);

    // Wall shelf above desk with glowing star jars
    const wallShelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.28), woodLightMat);
    wallShelf.position.set(0, 1.62, -0.58);
    desk.add(wallShelf);
    const jarCols = [0xffdc8e, 0xbce0ff, 0xffc09e, 0xc4ffdc];
    for (let i = 0; i < 4; i++) {
      this.buildStarJar(-0.52 + i * 0.34, 1.65, -0.56, 0.075, 0.2, jarCols[i], desk);
    }
    this.worldGroup.add(desk);
  }

  private buildFrontRooftopTerrace(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x624b35, roughness: 0.72 });
    const tileMat = new THREE.MeshStandardMaterial({
      map: this.makeRoofTileTexture(6, 3),
      roughness: 0.82,
    });

    // Subtle low terrace balustrade posts at the front corners (never obscuring gameplay)
    [-5.35, 5.35].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 1.05, 8), postMat);
      post.position.set(px, 0.52, 4.55);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.24, 0.22),
        new THREE.MeshStandardMaterial({
          color: 0xfff0c4,
          emissive: 0xffce72,
          emissiveIntensity: 1.05,
          roughness: 0.4,
        })
      );
      lamp.position.set(px, 1.18, 4.55);
      this.worldGroup.add(post, lamp);
      this.addGlow(0xffd888, 1.9, px, 1.2, 4.55, 0.55);
    });

    // Sloping tiled roof eaves visible beyond the terrace edges
    const frontRoof = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.25, 4.6), tileMat);
    frontRoof.position.set(0, -1.65, 6.4);
    frontRoof.rotation.x = 0.65;
    this.worldGroup.add(frontRoof);
  }

  private buildAmbientStarsAndDust(): void {
    const rnd = createSeededRandom(2026);

    // Gently bobbing floating room stars high above the workshop floor
    const smallStarGeo = create3DStarGeometry(0.068);
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const x = (rnd() * 2 - 1) * 4.2;
      const y = 2.6 + rnd() * 1.9;
      const z = -3.4 + rnd() * 5.6;
      g.position.set(x, y, z);
      const st = new THREE.Mesh(smallStarGeo, this.starMaterials[i % 4]);
      g.add(st);
      this.addGlow(i % 2 ? 0xffe49c : 0xbce2ff, 0.48, 0, 0, 0, 0.45, g);
      this.worldGroup.add(g);
      this.floatingRoomStars.push({ group: g, x, y, z, phase: rnd() * Math.PI * 2 });
    }

    // Golden floating stardust motes
    const count = 96;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const b: [number, number, number, number] = [
        (rnd() * 2 - 1) * 5.2,
        rnd() * 4.2,
        -4.0 + rnd() * 8.0,
        rnd() * Math.PI * 2,
      ];
      this.dustBase.push(b);
      pos[i * 3] = b[0];
      pos[i * 3 + 1] = 0.3 + b[1];
      pos[i * 3 + 2] = b[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffebb8,
        size: 0.065,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);
  }

  private buildFourStarSpots(): void {
    const starGeo = create3DStarGeometry(0.11);

    for (const def of STAR_SPOTS) {
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      this.worldGroup.add(group);

      const accentColor = new THREE.Color(def.accentHex);
      const urgentColor = new THREE.Color(0xb288ff);

      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.84, 44),
        new THREE.MeshBasicMaterial({
          color: 0x1b2748,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.022;
      group.add(ringBg);

      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.66, 0.86, 44, 1, 0, Math.PI * 2),
        new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.032;
      group.add(ringFill);

      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 0.96, 40),
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

      // Orbiting 3D glowing stars floating gently above the constellation circle
      const starOrbs: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(
          starGeo,
          new THREE.MeshStandardMaterial({
            color: accentColor,
            emissive: accentColor,
            emissiveIntensity: 0.95,
            roughness: 0.3,
          })
        );
        const a = (i / 3) * Math.PI * 2;
        orb.position.set(Math.cos(a) * 0.36, 0.42 + i * 0.14, Math.sin(a) * 0.36);
        group.add(orb);
        starOrbs.push(orb);
      }

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: accentColor,
          transparent: true,
          opacity: 0.48,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.set(1.7, 1.7, 1);
      halo.position.y = 0.56;
      group.add(halo);

      const glowLight = new THREE.PointLight(def.accentHex, 1.1, 4.4, 1.5);
      glowLight.position.set(0, 0.72, 0);
      group.add(glowLight);

      // Live canvas signboard showing spot name & alignment percentage
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 96;
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(1.42, 0.52),
        new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          depthWrite: false,
        })
      );
      if (def.id === 3) {
        signBoard.position.set(1.05, 0.76, 0.25);
      } else {
        signBoard.position.set(0, 1.32, 0);
      }
      group.add(signBoard);

      const vis: StarSpotVisual = {
        group,
        ringFill,
        ringBg,
        signCanvas,
        signTex,
        signBoard,
        starOrbs,
        halo,
        glowLight,
        pulseRing,
        accentColor,
        urgentColor,
        lastRenderedBucket: -1,
        lastRenderedUrgent: false,
        lastRenderedDone: false,
        pulse: 0,
      };
      this.renderSpotSign(vis, def.shortName, def.tagLabel, 50, false, false);
      this.spotVisuals.push(vis);
    }
  }

  private renderSpotSign(
    vis: StarSpotVisual,
    shortName: string,
    tagLabel: string,
    progress: number,
    urgent: boolean,
    done: boolean
  ): void {
    const ctx = vis.signCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 96);

    ctx.fillStyle = done
      ? 'rgba(42, 34, 12, 0.88)'
      : urgent
        ? 'rgba(44, 18, 56, 0.88)'
        : 'rgba(10, 18, 42, 0.84)';
    ctx.strokeStyle = done
      ? 'rgba(255, 228, 128, 0.96)'
      : urgent
        ? 'rgba(216, 152, 255, 0.95)'
        : 'rgba(170, 210, 255, 0.65)';
    ctx.lineWidth = 4;

    const r = 16;
    ctx.beginPath();
    ctx.moveTo(r + 4, 4);
    ctx.lineTo(252 - r, 4);
    ctx.quadraticCurveTo(252, 4, 252, r + 4);
    ctx.lineTo(252, 92 - r);
    ctx.quadraticCurveTo(252, 92, 252 - r, 92);
    ctx.lineTo(r + 4, 92);
    ctx.quadraticCurveTo(4, 92, 4, 92 - r);
    ctx.lineTo(4, r + 4);
    ctx.quadraticCurveTo(4, 4, r + 4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px "Zen Maru Gothic", sans-serif';
    ctx.fillStyle = done ? '#fff5c2' : '#f4f7ff';
    ctx.fillText(shortName, 128, 32);

    ctx.font = '700 20px "Zen Maru Gothic", sans-serif';
    ctx.fillStyle = done ? '#ffe07a' : urgent ? '#e6b8ff' : '#a8d4ff';
    ctx.fillText(
      done ? `🌠 ${tagLabel}` : urgent ? `☁ 曇りそう ${Math.round(progress)}%` : `⭐ 並べ替え ${Math.round(progress)}%`,
      128,
      68
    );

    vis.signTex.needsUpdate = true;
  }

  public updateManifestBoard(shootingCount: number, wishCount: number): void {
    const key = `${shootingCount}:${wishCount}`;
    if (key === this.lastManifestKey) return;
    this.lastManifestKey = key;

    const g = this.manifestCanvas.getContext('2d')!;
    g.fillStyle = '#f2e8cc';
    g.fillRect(0, 0, 320, 220);
    g.strokeStyle = '#6f5538';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 304, 204);

    g.fillStyle = '#2a3f62';
    g.font = '800 30px "Zen Maru Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillText('今夜の星メモ', 160, 50);

    g.textAlign = 'left';
    g.font = '700 26px "Zen Maru Gothic", sans-serif';
    g.fillStyle = '#384c6e';
    g.fillText(`・ながれ星  ${shootingCount}`, 34, 114);
    g.fillText(`・ねがい星  ${wishCount}`, 34, 166);
    this.manifestTex.needsUpdate = true;
  }

  /** Visually reflects all 6 workshop room upgrades in 3D! */
  public syncUpgrades(state: HoshihakobiSaveState): void {
    const clear = (g: THREE.Group) => {
      while (g.children.length > 0) g.remove(g.children[0]);
    };
    clear(this.workbenchExtraGroup);
    clear(this.skylightExtraGroup);
    clear(this.cratesExtraGroup);
    clear(this.mapExtraGroup);
    clear(this.bedExtraGroup);
    clear(this.deskExtraGroup);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be54,
      metalness: 0.84,
      roughness: 0.26,
    });
    const starGeoSm = create3DStarGeometry(0.085);

    // 1. Star Workbench upgrades: extra orbiting brass astrolabe rings & glowing stars
    const wbLv = state.upgrades.starWorkbench;
    for (let i = 0; i < Math.min(4, wbLv); i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.98 + i * 0.08, 0.014, 6, 40),
        goldMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.85 + i * 0.06, -0.35);
      this.workbenchExtraGroup.add(ring);
    }

    // 2. Skylight & Lantern upgrades: celestial golden fairy-star garland strung overhead
    const skLv = state.upgrades.skylightLantern;
    if (skLv > 0) {
      const bulbs = Math.min(10, 4 + skLv * 2);
      for (let i = 0; i < bulbs; i++) {
        const t = i / (bulbs - 1);
        const x = -4.2 + t * 8.4;
        const y = 3.85 - Math.sin(t * Math.PI) * 0.45;
        const st = new THREE.Mesh(starGeoSm, this.starMaterials[i % 4]);
        st.position.set(x, y, -3.95);
        this.skylightExtraGroup.add(st);
      }
    }

    // 3. Star Crate Backpack upgrades: extra overflowing glowing star crates on right side
    const crLv = state.upgrades.starCrateBackpack;
    for (let i = 0; i < Math.min(3, crLv); i++) {
      const st = new THREE.Mesh(create3DStarGeometry(0.11), this.starMaterials[i % 4]);
      st.position.set(4.62, 0.58 + i * 0.22, 1.65 - i * 0.72);
      this.cratesExtraGroup.add(st);
    }

    // 4. Constellation Map & Telescope upgrades: golden glow frame & starry beacons on back wall
    const mpLv = state.upgrades.constellationMap;
    for (let i = 0; i < Math.min(4, mpLv); i++) {
      const st = new THREE.Mesh(starGeoSm, this.starMaterials[i % 4]);
      st.position.set(-4.1 + i * 0.78, 2.72, -4.32);
      this.mapExtraGroup.add(st);
    }

    // 5. Fluffy Bed upgrades: glowing dream-catcher star pillows & jar lights near bed
    const bdLv = state.upgrades.fluffyBed;
    for (let i = 0; i < Math.min(4, bdLv); i++) {
      this.buildStarJar(-4.45, 0.02, 0.52 + i * 0.3, 0.085, 0.22, 0xffdc92, this.bedExtraGroup);
    }

    // 6. Star Log Desk upgrades: extra glowing logbooks & golden star lamp aura on desk
    const dkLv = state.upgrades.starLogDesk;
    for (let i = 0; i < Math.min(4, dkLv); i++) {
      const st = new THREE.Mesh(starGeoSm, this.starMaterials[i % 4]);
      st.position.set(2.35 + i * 0.36, 1.02, -3.55);
      this.deskExtraGroup.add(st);
    }

    this.updateManifestBoard(
      3 + state.totalShootingStars,
      12 + state.totalMiraclesSent
    );
  }

  public updateSpotVisual(
    spotId: number,
    progress: number,
    urgent: boolean,
    done: boolean,
    aligning: boolean,
    elapsed: number
  ): void {
    const vis = this.spotVisuals[spotId];
    const def = STAR_SPOTS[spotId];
    if (!vis || !def) return;

    const clamped = Math.max(0.02, Math.min(1, progress / 100));
    const fillMat = vis.ringFill.material as THREE.MeshBasicMaterial;
    fillMat.color.copy(done ? new THREE.Color(0xfff4b0) : urgent ? vis.urgentColor : vis.accentColor);
    fillMat.opacity = done ? 0.96 : aligning ? 0.92 : 0.62 + clamped * 0.25;

    // Scale inner glow and hovering stars by alignment progress
    const scale = 0.75 + clamped * 0.35 + (aligning ? Math.sin(elapsed * 8) * 0.05 : 0);
    vis.ringFill.scale.setScalar(scale);

    vis.starOrbs.forEach((orb, idx) => {
      const a = elapsed * (aligning || done ? 2.6 : 1.05) + (idx * Math.PI * 2) / 3;
      const rad = 0.34 + (1 - clamped) * 0.24;
      orb.position.set(
        Math.cos(a) * rad,
        0.38 + clamped * 0.32 + Math.sin(elapsed * 3 + idx * 1.4) * 0.08,
        Math.sin(a) * rad
      );
      orb.rotation.y = elapsed * 2.2 + idx;
      orb.scale.setScalar(0.72 + clamped * 0.48);
    });

    vis.halo.scale.setScalar(1.3 + clamped * 0.95 + (done ? 0.55 : 0));
    (vis.halo.material as THREE.SpriteMaterial).opacity = done
      ? 0.85
      : aligning
        ? 0.68
        : 0.32 + clamped * 0.25;
    vis.glowLight.intensity = done ? 2.6 : aligning ? 2.1 : 0.75 + clamped * 0.85;

    if (vis.pulse > 0) {
      vis.pulse = Math.max(0, vis.pulse - 0.025);
      vis.pulseRing.scale.setScalar(1 + (1 - vis.pulse) * 1.2);
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = vis.pulse * 0.85;
    } else {
      (vis.pulseRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Billboard signboard gently toward camera
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
      this.renderSpotSign(vis, def.shortName, def.tagLabel, progress, urgent, done);
    }
  }

  public pulseSpot(spotId: number): void {
    const vis = this.spotVisuals[spotId];
    if (vis) vis.pulse = 1.0;
  }

  /** Launches a glowing 3D shooting star arching from a spot or backpack up into the starry night sky! */
  public launchShootingStarArc(startX: number, startY: number, startZ: number): void {
    const g = new THREE.Group();
    const star = new THREE.Mesh(this.arcStarGeo, this.arcStarMat);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xfff0a8,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(1.1, 1.1, 1);
    g.add(star, halo);
    this.worldGroup.add(g);

    const endX = (Math.random() - 0.5) * 14;
    const endY = 8.5 + Math.random() * 4.5;
    const endZ = -14 - Math.random() * 8;
    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const ctrl = new THREE.Vector3(
      (startX + endX) * 0.5,
      Math.max(startY, endY) + 2.4,
      (startZ + endZ) * 0.5
    );

    this.shootingArcs.push({ group: g, start, ctrl, end, t: 0, dur: 0.95 });
  }

  public triggerStarShiftFlash(): void {
    this.shiftFlashTimer = 0.72;
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
    isStarShifting: boolean
  ): void {
    this.simClock += dt;
    if (this.shiftFlashTimer > 0) this.shiftFlashTimer = Math.max(0, this.shiftFlashTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    // Camera gentle framing
    const goalPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.24) * 1.4, 5.4, 8.85)
        : new THREE.Vector3(0, 6.25, 9.15);
    const goalTarget =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.55, -0.95)
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

    // Animate lighting with beat, STAR SHIFT, and STARLIGHT MIRACLE fever
    const shiftBoost = this.shiftFlashTimer > 0 ? this.shiftFlashTimer * 1.4 : 0;
    const feverBoost = isFever ? 0.65 + beatPulse * 0.35 : 0;

    this.workbenchLight.intensity = 2.1 + beatPulse * 0.45 + energy * 0.4 + shiftBoost + feverBoost;
    this.workbenchLight.color.setHex(isFever ? 0xfff2b0 : isStarShifting ? 0xcce4ff : 0xffdc8c);
    this.moonWinLight.intensity = 1.45 + (isFever ? 1.15 : 0) + (isStarShifting ? 0.7 : 0);
    this.lanternLightL.intensity = 1.35 * (1 + 0.06 * Math.sin(elapsed * 4.5));
    this.lanternLightR.intensity = 1.35 * (1 + 0.06 * Math.sin(elapsed * 4.9 + 1.2));

    // Rotate overhead Star Mobile & gently sway each hanging star
    this.starMobileGroup.rotation.y = elapsed * (isFever || isStarShifting ? 0.65 : 0.18);
    this.mobileStars.forEach((m) => {
      m.group.rotation.z = 0.13 * Math.sin(elapsed * 1.1 + m.phase);
      m.group.rotation.x = 0.08 * Math.sin(elapsed * 0.8 + m.phase * 1.7);
    });

    // Workbench constellation stars twinkle
    this.starMaterials.forEach((m, i) => {
      m.emissiveIntensity =
        (isFever ? 1.35 : 0.9) + 0.25 * Math.sin(elapsed * 1.8 + i * 1.5) + beatPulse * 0.22;
    });

    // Floating stars in the workshop
    this.floatingRoomStars.forEach((s) => {
      s.group.position.y = s.y + Math.sin(elapsed * 0.9 + s.phase) * 0.11;
      s.group.position.x = s.x + Math.sin(elapsed * 0.55 + s.phase) * 0.06;
      s.group.rotation.y = elapsed * 0.55 + s.phase;
    });

    // Glow sprites breathing
    for (const gs of this.glowSprites) {
      const s = gs.baseScale * (1 + 0.055 * Math.sin(elapsed * 2.1 + gs.phase) + (isFever ? 0.14 : 0));
      gs.sprite.scale.set(s, s, 1);
    }

    // Night sky twinkling & shooting stars
    this.skyStarsA.opacity = 0.78 + 0.14 * Math.sin(elapsed * 1.3);
    this.skyStarsB.opacity = 0.82 + 0.14 * Math.sin(elapsed * 0.95 + 1.1);

    const hash = (v: number) => {
      const s = Math.sin(v * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };
    this.skyShootingStars.forEach((sh, i) => {
      const speedMult = isFever ? 2.1 : 1.0;
      const tt = elapsed * speedMult + sh.offset;
      const cycle = Math.floor(tt / sh.period);
      const p = (tt - cycle * sh.period) / 1.55;
      if (p < 1) {
        sh.group.visible = true;
        const sx = -32 + hash(cycle * 3.1 + i * 7.7) * 56;
        const sy = 15 + hash(cycle * 5.3 + i * 2.9) * 14;
        sh.group.position.set(
          sx + Math.cos(sh.angle) * 34 * p,
          sy + Math.sin(sh.angle) * 34 * p,
          -52
        );
        const fade = Math.sin(Math.PI * p);
        sh.group.children.forEach((ch) => {
          const mat = (ch as THREE.Mesh | THREE.Sprite).material as THREE.Material & { opacity: number };
          if (mat) mat.opacity = fade * 0.95;
        });
      } else {
        sh.group.visible = false;
      }
    });

    // Floating stardust motes
    const dustAttr = this.dustPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = dustAttr.array as Float32Array;
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i];
      arr[i * 3] = b[0] + Math.sin(this.simClock * 0.28 + b[3]) * 0.34;
      arr[i * 3 + 1] = 0.3 + ((b[1] + this.simClock * (isFever ? 0.25 : 0.06)) % 4.2);
      arr[i * 3 + 2] = b[2] + Math.cos(this.simClock * 0.22 + b[3]) * 0.34;
    }
    dustAttr.needsUpdate = true;

    // Update launched shooting-star arcs
    for (let i = this.shootingArcs.length - 1; i >= 0; i--) {
      const a = this.shootingArcs[i];
      a.t += dt / a.dur;
      if (a.t >= 1) {
        this.worldGroup.remove(a.group);
        this.shootingArcs.splice(i, 1);
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
      a.group.scale.setScalar(1.1 - u * 0.45);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
