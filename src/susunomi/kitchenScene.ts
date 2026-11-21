import * as THREE from 'three';
import { COUNTER_HALF_WIDTH, VENT_LANES } from './config';
import { SusunomiSaveState } from './types';

function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function createWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4b3120';
  g.fillRect(0, 0, 512, 256);

  for (let i = 0; i < 60; i++) {
    const y = (i / 60) * 256;
    g.fillStyle = i % 2 === 0 ? 'rgba(30, 16, 8, 0.16)' : 'rgba(120, 78, 44, 0.11)';
    g.fillRect(0, y, 512, 2 + Math.random() * 4);
  }
  g.strokeStyle = 'rgba(20, 10, 4, 0.45)';
  g.lineWidth = 3;
  for (let y = 64; y < 256; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function createIronDuctTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2522';
  g.fillRect(0, 0, 512, 512);

  // Subtle rust & aged metal speckling
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rust = Math.random() < 0.32;
    g.fillStyle = rust ? 'rgba(138, 72, 36, 0.08)' : 'rgba(14, 11, 10, 0.09)';
    g.fillRect(x, y, 3 + Math.random() * 7, 2 + Math.random() * 5);
  }

  // Seam ribs and rivets
  g.strokeStyle = 'rgba(14, 11, 9, 0.65)';
  g.lineWidth = 4;
  for (let p = 0; p <= 512; p += 128) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(512, p);
    g.stroke();
  }
  g.fillStyle = 'rgba(110, 82, 60, 0.45)';
  for (let x = 16; x < 512; x += 64) {
    for (let y = 16; y < 512; y += 128) {
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function createRecipeBoardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e7d5b5';
  g.fillRect(0, 0, 384, 256);
  g.strokeStyle = '#5c3c22';
  g.lineWidth = 10;
  g.strokeRect(8, 8, 368, 240);

  g.fillStyle = '#402614';
  g.textAlign = 'center';
  g.font = '700 32px "Shippori Mincho", serif';
  g.fillText('記憶のレシピ', 192, 54);

  g.strokeStyle = 'rgba(92, 60, 34, 0.45)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(46, 72);
  g.lineTo(338, 72);
  g.stroke();

  g.font = '700 22px "Zen Maru Gothic", sans-serif';
  g.fillStyle = '#6c381a';
  g.fillText('・焼き魚の香ばしさ', 192, 114);
  g.fillText('・カレーのスパイス', 192, 152);
  g.fillText('・パン屋の甘い香り', 192, 190);
  g.font = '600 18px "Zen Maru Gothic", sans-serif';
  g.fillStyle = '#8b4d24';
  g.fillText('ことこと 3時間 — ススノミ', 192, 228);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class KitchenScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private ambientLight: THREE.HemisphereLight;
  private lanternLight: THREE.PointLight;
  private stoveLight: THREE.PointLight;
  private feverLight: THREE.PointLight;
  private rimLight: THREE.DirectionalLight;

  private fanBlades = new THREE.Group();
  private hangingLantern = new THREE.Group();
  private lanternCoreSprite: THREE.Sprite;
  private burnerFlames: THREE.Mesh[] = [];
  private ventGlows: THREE.Sprite[] = [];
  private shelfJars: Array<{ group: THREE.Group; glow: THREE.Sprite; minLevel: number; phase: number }> = [];
  private recipeBoardGroup = new THREE.Group();
  private matchboxBedGroup = new THREE.Group();
  private copperKettleGroup = new THREE.Group();
  private ambientMotes: Array<{ sprite: THREE.Sprite; baseX: number; baseY: number; baseZ: number; speed: number; phase: number }> = [];
  private morningRayMesh: THREE.Mesh;

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private focusX = 0;
  private shakeAmp = 0;
  private feverBlend = 0;

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
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b120d);
    this.scene.fog = new THREE.FogExp2(0x1e130d, 0.026);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 60);
    this.camera.position.set(0, 2.75, 8.6);
    this.camera.lookAt(0, 1.9, 0);

    this.glowTex = createGlowTexture();
    this.scene.add(this.worldGroup);

    // Warm cozy soot-kitchen lighting + iconic blue stove counter-light + clear front fill for Susunomi
    this.ambientLight = new THREE.HemisphereLight(0xffd7a8, 0x3b261a, 1.35);
    this.scene.add(this.ambientLight);

    this.rimLight = new THREE.DirectionalLight(0xffddb3, 1.35);
    this.rimLight.position.set(3.2, 7.2, 6.5);
    this.rimLight.castShadow = true;
    this.rimLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.rimLight);

    const frontWarmFill = new THREE.DirectionalLight(0xffcfa0, 0.85);
    frontWarmFill.position.set(-2.5, 3.2, 7.0);
    this.scene.add(frontWarmFill);

    this.lanternLight = new THREE.PointLight(0xffb45c, 5.2, 18, 1.2);
    this.lanternLight.position.set(2.9, 4.0, -1.2);
    this.scene.add(this.lanternLight);

    const shelfLampLight = new THREE.PointLight(0xffa954, 3.2, 12, 1.25);
    shelfLampLight.position.set(-3.0, 3.2, -1.6);
    this.scene.add(shelfLampLight);

    this.stoveLight = new THREE.PointLight(0x45c4ff, 2.8, 11, 1.35);
    this.stoveLight.position.set(0, 0.9, 1.25);
    this.scene.add(this.stoveLight);

    this.feverLight = new THREE.PointLight(0xffe29c, 0, 22, 1.2);
    this.feverLight.position.set(0, 4.4, 1.2);
    this.scene.add(this.feverLight);

    // Build curved metallic ventilation duct enclosure
    this.buildVentDuct();
    this.buildKitchenCounterAndStove();
    this.buildBackWallAndFan();
    this.lanternCoreSprite = this.buildHangingLantern();
    this.buildSpiceShelves();
    this.buildCozyDecor();
    this.buildOverheadAromaVents();
    this.morningRayMesh = this.buildMorningRay();
    this.buildAmbientMotes();
  }

  private buildVentDuct(): void {
    const ductTex = createIronDuctTexture();
    const ductMat = new THREE.MeshStandardMaterial({
      map: ductTex,
      color: 0x856f5e,
      metalness: 0.42,
      roughness: 0.68,
      side: THREE.BackSide,
    });

    // Open-front curved vent tunnel (wraps floor -> back wall -> ceiling without blocking the camera!)
    const tunnelGeo = new THREE.CylinderGeometry(6.8, 6.8, 13.8, 28, 1, true, Math.PI * 0.62, Math.PI * 1.28);
    const tunnel = new THREE.Mesh(tunnelGeo, ductMat);
    tunnel.rotation.z = Math.PI / 2;
    tunnel.position.set(0, 2.75, -1.1);
    this.worldGroup.add(tunnel);

    // Structural riveted iron side-framing arches along left/right & ceiling (never crossing the front center!)
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x4d3d33,
      metalness: 0.58,
      roughness: 0.52,
    });
    for (const rx of [-5.4, -3.2, 3.2, 5.4]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(6.58, 0.11, 8, 28, Math.PI * 1.15), ribMat);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = Math.PI * 0.45;
      rib.position.set(rx, 2.75, -1.1);
      this.worldGroup.add(rib);
    }

    // Back warm dark-iron wall behind shelves
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(14.4, 9.2),
      new THREE.MeshStandardMaterial({
        map: ductTex,
        color: 0x6c5545,
        metalness: 0.34,
        roughness: 0.78,
      })
    );
    backWall.position.set(0, 3.0, -3.55);
    backWall.receiveShadow = true;
    this.worldGroup.add(backWall);
  }

  private buildKitchenCounterAndStove(): void {
    const woodTex = createWoodTexture();
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0x7c5538,
      roughness: 0.78,
      metalness: 0.08,
    });

    // Main wooden kitchen floor / workbench deck where Susunomi moves
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.44, 3.6), woodMat);
    counterTop.position.set(0, -0.22, 0.15);
    counterTop.receiveShadow = true;
    this.worldGroup.add(counterTop);

    // Front brass trim along the counter lip
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x8f6236,
      metalness: 0.68,
      roughness: 0.36,
    });
    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(11.45, 0.1, 0.12), trimMat);
    frontTrim.position.set(0, -0.02, 1.95);
    this.worldGroup.add(frontTrim);

    // Counter movement guide groove with subtle blue gas burner bar
    const burnerBed = new THREE.Mesh(
      new THREE.BoxGeometry(COUNTER_HALF_WIDTH * 2 + 1.0, 0.05, 0.62),
      new THREE.MeshStandardMaterial({
        color: 0x1b1a1e,
        metalness: 0.72,
        roughness: 0.4,
      })
    );
    burnerBed.position.set(0, 0.025, 0.85);
    this.worldGroup.add(burnerBed);

    // Blue gas burner flames lining the cooking counter rail
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x4cc4ff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
    });
    const flameCount = 26;
    for (let i = 0; i < flameCount; i++) {
      const t = i / (flameCount - 1);
      const x = -COUNTER_HALF_WIDTH + t * COUNTER_HALF_WIDTH * 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.19, 6), flameMat.clone());
      flame.position.set(x, 0.11, 0.85);
      this.worldGroup.add(flame);
      this.burnerFlames.push(flame);
    }

    // Back counter shelf ledge
    const backBench = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.9, 1.45), woodMat);
    backBench.position.set(0, 0.45, -2.55);
    backBench.receiveShadow = true;
    this.worldGroup.add(backBench);
  }

  private buildBackWallAndFan(): void {
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x3b332f,
      metalness: 0.72,
      roughness: 0.45,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xb98242,
      metalness: 0.78,
      roughness: 0.34,
    });

    // Iconic round ventilation exhaust fan on the back-right wall
    const fanPos = new THREE.Vector3(3.15, 2.75, -3.42);
    const fanRim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.1, 10, 32), ironMat);
    fanRim.position.copy(fanPos);
    this.worldGroup.add(fanRim);

    const nightWindow = new THREE.Mesh(
      new THREE.CircleGeometry(1.06, 28),
      new THREE.MeshBasicMaterial({ color: 0x151e34 })
    );
    nightWindow.position.set(fanPos.x, fanPos.y, fanPos.z - 0.04);
    this.worldGroup.add(nightWindow);

    this.fanBlades.position.copy(fanPos);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), brassMat);
    hub.rotation.x = Math.PI / 2;
    this.fanBlades.add(hub);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.92, 0.04), ironMat);
      blade.position.set(Math.sin(a) * 0.52, Math.cos(a) * 0.52, 0);
      blade.rotation.z = -a;
      blade.rotation.y = 0.28;
      this.fanBlades.add(blade);
    }
    this.worldGroup.add(this.fanBlades);

    // Copper hanging utensil rail along back-center
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 10), brassMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(-0.2, 2.35, -3.28);
    this.worldGroup.add(rail);

    const panMat = new THREE.MeshStandardMaterial({
      color: 0xc26e3a,
      metalness: 0.78,
      roughness: 0.28,
    });
    for (let i = 0; i < 4; i++) {
      const px = -1.4 + i * 0.8;
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), brassMat);
      hook.position.set(px, 2.16, -3.28);
      this.worldGroup.add(hook);

      if (i % 2 === 0) {
        const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.08, 16), panMat);
        pan.rotation.x = Math.PI / 2;
        pan.position.set(px, 1.84, -3.26);
        this.worldGroup.add(pan);
      } else {
        const ladle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), panMat);
        ladle.scale.set(1, 1, 0.55);
        ladle.position.set(px, 1.88, -3.26);
        this.worldGroup.add(ladle);
      }
    }
  }

  private buildHangingLantern(): THREE.Sprite {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc88f46,
      metalness: 0.78,
      roughness: 0.28,
    });
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), brassMat);
    chain.position.y = 0.65;
    this.hangingLantern.add(chain);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 14), brassMat);
    cap.position.y = 0.12;
    this.hangingLantern.add(cap);

    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.23, 0.44, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffe4b8,
        transparent: true,
        opacity: 0.38,
        roughness: 0.12,
      })
    );
    glass.position.y = -0.14;
    this.hangingLantern.add(glass);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe9b5 })
    );
    bulb.position.y = -0.14;
    this.hangingLantern.add(bulb);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.1, 14), brassMat);
    base.position.y = -0.4;
    this.hangingLantern.add(base);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffb354,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })
    );
    glow.scale.set(2.4, 2.4, 1);
    glow.position.y = -0.14;
    this.hangingLantern.add(glow);

    this.hangingLantern.position.set(3.2, 4.45, -1.85);
    this.worldGroup.add(this.hangingLantern);
    return glow;
  }

  private buildSpiceShelves(): void {
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x624028,
      roughness: 0.8,
    });
    const shelfYs = [2.1, 3.05];
    for (const sy of shelfYs) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.09, 0.56), shelfMat);
      plank.position.set(-3.15, sy, -3.12);
      this.worldGroup.add(plank);
    }

    const jarColors = [0xff9248, 0xffd24c, 0xfff0c4, 0xffb38a, 0x9ce0ff, 0xffc6e0];
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xfff3e0,
      transparent: true,
      opacity: 0.36,
      roughness: 0.12,
    });
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xa47449, roughness: 0.9 });

    let idx = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const g = new THREE.Group();
        const x = -4.25 + col * 0.55;
        const y = shelfYs[row] + 0.05;
        g.position.set(x, y, -3.08);

        const h = 0.34 + (idx % 3) * 0.07;
        const r = 0.12 + (idx % 2) * 0.025;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 12), glassMat);
        body.position.y = h / 2;
        g.add(body);

        const colHex = jarColors[idx % jarColors.length];
        const fill = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.78, r * 0.82, h * 0.72, 10),
          new THREE.MeshStandardMaterial({
            color: colHex,
            emissive: colHex,
            emissiveIntensity: 0.55,
            roughness: 0.35,
          })
        );
        fill.position.y = h * 0.38;
        g.add(fill);

        const cork = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.65, 0.09, 10), corkMat);
        cork.position.y = h + 0.04;
        g.add(cork);

        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowTex,
            color: colHex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          })
        );
        glow.scale.set(0.68, 0.68, 1);
        glow.position.y = h * 0.5;
        g.add(glow);

        const minLevel = idx < 4 ? 0 : Math.min(6, Math.ceil((idx - 3) / 1));
        this.worldGroup.add(g);
        this.shelfJars.push({ group: g, glow, minLevel, phase: idx * 0.7 });
        idx++;
      }
    }
  }

  private buildCozyDecor(): void {
    // Framed Memory Recipe board on back wall (shown as recipeBook upgrade increases)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c3920, roughness: 0.7 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.24, 0.08), frameMat);
    this.recipeBoardGroup.add(frame);

    const canvasMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.62, 1.08),
      new THREE.MeshBasicMaterial({ map: createRecipeBoardTexture() })
    );
    canvasMesh.position.z = 0.045;
    this.recipeBoardGroup.add(canvasMesh);
    this.recipeBoardGroup.position.set(-0.2, 3.45, -3.44);
    this.worldGroup.add(this.recipeBoardGroup);

    // Cozy matchbox bed tucked on the back-left counter (from Susunomi's room!)
    const boxOuter = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.34, 0.84),
      new THREE.MeshStandardMaterial({ color: 0x9b4428, roughness: 0.75 })
    );
    boxOuter.position.y = 0.17;
    this.matchboxBedGroup.add(boxOuter);

    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.2, 0.72),
      new THREE.MeshStandardMaterial({ color: 0xe6cfa8, roughness: 0.9 })
    );
    blanket.position.set(0.05, 0.34, 0);
    this.matchboxBedGroup.add(blanket);

    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.16, 0.56),
      new THREE.MeshStandardMaterial({ color: 0xffecd2, roughness: 0.85 })
    );
    pillow.position.set(-0.42, 0.42, 0);
    this.matchboxBedGroup.add(pillow);
    this.matchboxBedGroup.position.set(-3.65, 0.9, -2.5);
    this.worldGroup.add(this.matchboxBedGroup);

    // Copper kettle on back-right bench
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd07c40,
      metalness: 0.82,
      roughness: 0.25,
    });
    const kBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.42, 16), copperMat);
    kBody.position.y = 0.21;
    this.copperKettleGroup.add(kBody);
    const kLid = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), copperMat);
    kLid.position.y = 0.42;
    this.copperKettleGroup.add(kLid);
    const kHandle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 16, Math.PI), copperMat);
    kHandle.position.y = 0.46;
    this.copperKettleGroup.add(kHandle);
    this.copperKettleGroup.position.set(3.45, 0.9, -2.42);
    this.worldGroup.add(this.copperKettleGroup);
  }

  private buildOverheadAromaVents(): void {
    const grilleMat = new THREE.MeshStandardMaterial({
      color: 0x3b312c,
      metalness: 0.65,
      roughness: 0.48,
    });

    for (const vx of VENT_LANES) {
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.65), grilleMat);
      chute.position.set(vx, 5.42, 0.85);
      this.worldGroup.add(chute);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffc67c,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        })
      );
      glow.scale.set(1.5, 0.95, 1);
      glow.position.set(vx, 5.2, 0.85);
      this.worldGroup.add(glow);
      this.ventGlows.push(glow);
    }
  }

  private buildMorningRay(): THREE.Mesh {
    // Golden morning sunlight shaft that blooms during KOTOKOTO FEVER
    const ray = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 4.4, 8.5, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe4a0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ray.position.set(0, 3.6, -0.4);
    ray.rotation.z = -0.18;
    this.worldGroup.add(ray);
    return ray;
  }

  private buildAmbientMotes(): void {
    for (let i = 0; i < 42; i++) {
      const warm = i % 4 !== 0;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: warm ? 0xffcf88 : 0x80d4ff,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        })
      );
      const sz = 0.08 + Math.random() * 0.14;
      sp.scale.set(sz, sz, 1);
      const bx = (Math.random() - 0.5) * 10.5;
      const by = 0.4 + Math.random() * 4.8;
      const bz = -2.8 + Math.random() * 4.2;
      sp.position.set(bx, by, bz);
      this.worldGroup.add(sp);
      this.ambientMotes.push({
        sprite: sp,
        baseX: bx,
        baseY: by,
        baseZ: bz,
        speed: 0.25 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  public syncUpgrades(state: SusunomiSaveState): void {
    const shelfLv = state.upgrades.spiceShelf;
    for (const jar of this.shelfJars) {
      jar.group.visible = shelfLv >= jar.minLevel;
    }

    const bookLv = state.upgrades.recipeBook;
    this.recipeBoardGroup.visible = bookLv >= 1;
    this.matchboxBedGroup.visible = bookLv >= 2;
    this.copperKettleGroup.visible = state.upgrades.copperPot >= 1;

    // Blue gas burner flame scale reflects blueStove level
    const stoveScale = 0.85 + state.upgrades.blueStove * 0.18;
    for (const f of this.burnerFlames) {
      f.scale.set(stoveScale, stoveScale, stoveScale);
    }
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public setFocusX(x: number): void {
    this.focusX = x;
  }

  public triggerShake(amount = 0.14): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  public pulseVent(laneIdx: number, colorHex: number): void {
    const g = this.ventGlows[laneIdx];
    if (!g) return;
    const mat = g.material as THREE.SpriteMaterial;
    mat.color.setHex(colorHex);
    mat.opacity = 0.92;
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    this.feverBlend += ((isFever ? 1 : 0) - this.feverBlend) * Math.min(1, dt * 3.5);

    // Rotate exhaust fan smoothly (faster during KOTOKOTO FEVER)
    this.fanBlades.rotation.z -= dt * (0.9 + this.feverBlend * 2.4 + energy * 0.8);

    // Hanging lantern gentle sway & warm heartbeat
    this.hangingLantern.rotation.z = Math.sin(elapsed * 1.6) * 0.08;
    const pulse = Math.pow(1 - beatPhase, 2.8);
    this.lanternLight.intensity = 3.2 + pulse * 1.1 + this.feverBlend * 1.8;
    const lMat = this.lanternCoreSprite.material as THREE.SpriteMaterial;
    lMat.opacity = 0.72 + pulse * 0.22;

    // Stove blue flames dance with the music
    this.stoveLight.intensity = 1.9 + energy * 1.4 + this.feverBlend * 1.1;
    this.stoveLight.color.setHex(isFever ? 0x72e2ff : 0x3cb8ff);
    for (let i = 0; i < this.burnerFlames.length; i++) {
      const f = this.burnerFlames[i];
      const wave = 0.78 + 0.34 * Math.sin(elapsed * 14 + i * 1.3) + pulse * 0.28;
      f.scale.y = wave * (1 + this.feverBlend * 0.45);
      (f.material as THREE.MeshBasicMaterial).color.setHex(
        isFever && i % 2 === 0 ? 0xffe49c : 0x4cc4ff
      );
    }

    // Decay vent glows gently
    for (const vg of this.ventGlows) {
      const mat = vg.material as THREE.SpriteMaterial;
      const baseOp = 0.2 + this.feverBlend * 0.22;
      mat.opacity += (baseOp - mat.opacity) * Math.min(1, dt * 4);
    }

    // Shelf aroma jars softly breathe
    for (const jar of this.shelfJars) {
      if (!jar.group.visible) continue;
      const mat = jar.glow.material as THREE.SpriteMaterial;
      mat.opacity = 0.24 + 0.2 * Math.sin(elapsed * 2.4 + jar.phase) + pulse * 0.16;
    }

    // KOTOKOTO FEVER golden warmth & dawn shaft
    this.feverLight.intensity = this.feverBlend * 4.2;
    (this.morningRayMesh.material as THREE.MeshBasicMaterial).opacity =
      this.feverBlend * (0.14 + 0.05 * Math.sin(elapsed * 3.5));

    // Ambient warm kitchen motes rising
    for (const m of this.ambientMotes) {
      const y = ((m.baseY + elapsed * m.speed * (1 + this.feverBlend * 1.2)) % 5.2) + 0.3;
      m.sprite.position.set(
        m.baseX + Math.sin(elapsed * 0.9 + m.phase) * 0.28,
        y,
        m.baseZ
      );
      (m.sprite.material as THREE.SpriteMaterial).opacity =
        (0.2 + 0.28 * Math.sin(elapsed * 2 + m.phase)) * (1 + this.feverBlend * 0.65);
    }

    // Smooth camera framing (cozy close-up in lobby, wide clear stage in play)
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.2);
    const sx = (Math.random() - 0.5) * this.shakeAmp;
    const sy = (Math.random() - 0.5) * this.shakeAmp;

    if (this.cameraMode === 'lobby') {
      const tx = Math.sin(elapsed * 0.35) * 0.85;
      const ty = 2.05 + Math.sin(elapsed * 0.6) * 0.12;
      const tz = 6.2;
      this.camera.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 3.5));
      this.camera.lookAt(0, 1.45, 0.2);
    } else {
      const tx = this.focusX * 0.14 + sx;
      const ty = 2.88 + sy;
      const tz = 8.45 - this.feverBlend * 0.28;
      this.camera.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 6));
      this.camera.lookAt(this.focusX * 0.08, 2.28, 0.65);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
