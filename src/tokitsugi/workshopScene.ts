import * as THREE from 'three';
import { CLOCK_RADIUS, CLOCK_SLOTS } from './config';
import { TokitsugiSaveState } from './types';

function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.26, 'rgba(255,244,214,0.68)');
  grad.addColorStop(0.62, 'rgba(255,210,130,0.22)');
  grad.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createWoodTexture(baseHue: number, lightBase: number, planks = 5): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  let seed = Math.round(baseHue * 17 + lightBase * 13);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const ph = 256 / planks;
  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    const l = lightBase + rnd() * 7;
    g.fillStyle = `hsl(${baseHue + rnd() * 5}, ${30 + rnd() * 10}%, ${l}%)`;
    g.fillRect(0, y0, 256, ph);
    for (let k = 0; k < 22; k++) {
      g.strokeStyle =
        rnd() < 0.5
          ? `rgba(18, 9, 4, ${0.06 + rnd() * 0.1})`
          : `rgba(255, 224, 178, ${0.03 + rnd() * 0.06})`;
      g.lineWidth = 0.7 + rnd() * 1.4;
      const yy = y0 + rnd() * ph;
      g.beginPath();
      g.moveTo(0, yy);
      g.bezierCurveTo(80, yy + (rnd() - 0.5) * 6, 170, yy + (rnd() - 0.5) * 6, 256, yy + (rnd() - 0.5) * 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(10, 5, 2, 0.52)';
    g.fillRect(0, y0, 256, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClockFaceTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Antique parchment radial dial
  const bg = g.createRadialGradient(cx, cy, 40, cx, cy, size * 0.49);
  bg.addColorStop(0, '#fbf2dc');
  bg.addColorStop(0.62, '#efe0be');
  bg.addColorStop(0.88, '#d9c195');
  bg.addColorStop(1, '#b89868');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, size * 0.495, 0, Math.PI * 2);
  g.fill();

  // Inner midnight-navy astral ring (echoes Tokitsugi's navy cap & starry night sky)
  const astral = g.createRadialGradient(cx, cy, 24, cx, cy, size * 0.28);
  astral.addColorStop(0, '#1e2f56');
  astral.addColorStop(0.75, '#131d38');
  astral.addColorStop(1, '#0c1326');
  g.fillStyle = astral;
  g.beginPath();
  g.arc(cx, cy, size * 0.275, 0, Math.PI * 2);
  g.fill();

  // Subtle compass star lines inside the astral ring
  g.strokeStyle = 'rgba(244, 211, 134, 0.34)';
  g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * 46, cy - Math.cos(a) * 46);
    g.lineTo(cx + Math.sin(a) * (size * 0.265), cy - Math.cos(a) * (size * 0.265));
    g.stroke();
  }

  // Concentric antique brass borders
  const rings = [0.475, 0.445, 0.31, 0.275, 0.24];
  rings.forEach((r, idx) => {
    g.strokeStyle = idx === 3 ? '#d8a652' : '#4a3520';
    g.lineWidth = idx === 0 ? 6 : idx === 3 ? 4 : 2.2;
    g.beginPath();
    g.arc(cx, cy, size * r, 0, Math.PI * 2);
    g.stroke();
  });

  // 60 minute ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const isHour = i % 5 === 0;
    const r0 = size * (isHour ? 0.432 : 0.448);
    const r1 = size * 0.472;
    g.strokeStyle = isHour ? '#2c1e12' : 'rgba(58, 40, 22, 0.55)';
    g.lineWidth = isHour ? 6 : 2.2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    g.stroke();
  }

  // Roman numerals I..XII
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#2d1e12';
  g.font = '700 54px "Shippori Mincho", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  romans.forEach((num, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r = size * 0.372;
    const x = cx + Math.sin(a) * r;
    const y = cy - Math.cos(a) * r;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillText(num, 0, 0);
    g.restore();
  });

  // Tiny stars inside the astral center
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 42; i++) {
    const r = 45 + rnd() * (size * 0.21);
    const a = rnd() * Math.PI * 2;
    g.fillStyle = `rgba(255, 240, 196, ${0.35 + rnd() * 0.65})`;
    g.beginPath();
    g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5 + rnd() * 2.5, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createSmallWallClockTex(h: number, m: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe3c6';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2a1a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 === 0 ? 4 : 2;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48);
    g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56);
    g.stroke();
  }
  g.lineCap = 'round';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + Math.sin((h / 12) * Math.PI * 2) * 28, 64 - Math.cos((h / 12) * Math.PI * 2) * 28);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + Math.sin((m / 60) * Math.PI * 2) * 44, 64 - Math.cos((m / 60) * Math.PI * 2) * 44);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGearMesh(radius: number, teeth: number, thickness: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, radius * 0.14, 8, 28), mat);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, thickness * 1.4, 14), mat);
  g.add(hub);

  for (let s = 0; s < 4; s++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.45, thickness * 0.65, radius * 0.11), mat);
    spoke.rotation.y = (s / 4) * Math.PI;
    g.add(spoke);
  }

  const toothW = (Math.PI * 2 * radius) / (teeth * 2.1);
  const toothGeo = new THREE.BoxGeometry(toothW, thickness, radius * 0.24);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(toothGeo, mat);
    t.position.set(Math.sin(a) * radius * 0.96, 0, Math.cos(a) * radius * 0.96);
    t.rotation.y = a;
    g.add(t);
  }
  return g;
}

export class WorkshopScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public watchGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private camPos = new THREE.Vector3(0, 4.4, 7.2);
  private camLook = new THREE.Vector3(0, 0.85, -0.45);
  private shakeAmp = 0;

  // Pocket watch dynamic elements
  private handPivot = new THREE.Group();
  private shortHandPivot = new THREE.Group();
  private handTipGlow: THREE.Sprite;
  private handBeamMat: THREE.MeshBasicMaterial;
  private watchMagicRing: THREE.Mesh;
  private watchFaceMat: THREE.MeshStandardMaterial;
  private slotMarkers: THREE.Mesh[] = [];
  private gears: Array<{ mesh: THREE.Object3D; speed: number }> = [];

  // Lighting & Atmosphere
  private keyLight: THREE.DirectionalLight;
  private gapGlowSprite: THREE.Sprite;
  private gapBeamLight: THREE.PointLight;
  private feverLight: THREE.PointLight;
  private dustPoints: THREE.Points;
  private dustBase: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];

  // Upgrade-driven 3D props
  private repairKitProps: THREE.Object3D[] = [];
  private grandClockPendulum = new THREE.Group();
  private grandClockHalo: THREE.Mesh;
  private threadSpools: THREE.Object3D[] = [];
  private memoryJarNodes: Array<{ group: THREE.Object3D; lightMat: THREE.MeshStandardMaterial; glow: THREE.Sprite }> = [];
  private hourglassGroup = new THREE.Group();
  private hourglassSandMat: THREE.MeshStandardMaterial;
  private diaryPhotoFrames: THREE.Object3D[] = [];

  private mendFlash = 0;
  private rewindSpin = 0;
  private jarResonance = 0;

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
    this.renderer.toneMappingExposure = 1.22;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111728);
    this.scene.fog = new THREE.FogExp2(0x111728, 0.022);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.glowTex = createGlowTexture();
    this.scene.add(this.worldGroup);

    // Rich cozy antique workshop lighting + soft closet-gap moonlight
    this.scene.add(new THREE.HemisphereLight(0xffe4bc, 0x263254, 1.35));

    this.keyLight = new THREE.DirectionalLight(0xffe6be, 1.65);
    this.keyLight.position.set(2.4, 7.5, 4.8);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 20;
    this.keyLight.shadow.camera.left = -6;
    this.keyLight.shadow.camera.right = 6;
    this.keyLight.shadow.camera.top = 6;
    this.keyLight.shadow.camera.bottom = -6;
    this.keyLight.shadow.bias = -0.0015;
    this.scene.add(this.keyLight);

    const coolMoonFill = new THREE.DirectionalLight(0xa4d0ff, 0.72);
    coolMoonFill.position.set(-3.5, 4.2, 5.2);
    this.scene.add(coolMoonFill);

    // Warm overhead lamp lighting the giant brass pocket watch face
    const overheadLamp = new THREE.PointLight(0xffcb7a, 4.8, 16, 1.2);
    overheadLamp.position.set(0, 3.8, 1.1);
    this.scene.add(overheadLamp);

    // Warm rim from left lantern shelf
    const leftLamp = new THREE.PointLight(0xffb45a, 3.8, 14, 1.2);
    leftLamp.position.set(-4.2, 2.7, -1.6);
    this.scene.add(leftLamp);

    // Soft blue-gold moonlight spilling through the closet gap
    this.gapBeamLight = new THREE.PointLight(0x98c8ff, 3.2, 16, 1.2);
    this.gapBeamLight.position.set(0, 3.1, -4.8);
    this.scene.add(this.gapBeamLight);

    this.feverLight = new THREE.PointLight(0xffe296, 0, 18, 1.15);
    this.feverLight.position.set(0, 3.6, 0.8);
    this.scene.add(this.feverLight);

    // Shared materials
    const darkWoodTex = createWoodTexture(24, 13, 6);
    darkWoodTex.repeat.set(3, 2);
    const benchWoodTex = createWoodTexture(28, 22, 4);
    benchWoodTex.repeat.set(2, 1);

    const wallMat = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.86 });
    const benchMat = new THREE.MeshStandardMaterial({ map: benchWoodTex, roughness: 0.58 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9a854,
      metalness: 0.84,
      roughness: 0.26,
    });
    const darkBrassMat = new THREE.MeshStandardMaterial({
      color: 0x9c7232,
      metalness: 0.78,
      roughness: 0.36,
    });
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x2c1e15, roughness: 0.82 });

    // === 1. Closet Workshop Room & Workbench ===
    // Large wooden workbench surface right beneath the giant pocket watch
    const workbench = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.36, 7.6), benchMat);
    workbench.position.set(0, -0.18, 0.4);
    workbench.receiveShadow = true;
    this.worldGroup.add(workbench);

    // Warm crimson/navy woven table mat under the pocket watch
    const matOuter = new THREE.Mesh(
      new THREE.CircleGeometry(3.25, 48),
      new THREE.MeshStandardMaterial({ color: 0x1e2c4b, roughness: 0.94 })
    );
    matOuter.rotation.x = -Math.PI / 2;
    matOuter.position.set(0, 0.008, 0.55);
    matOuter.receiveShadow = true;
    this.worldGroup.add(matOuter);

    const matRim = new THREE.Mesh(
      new THREE.RingGeometry(3.05, 3.16, 48),
      new THREE.MeshStandardMaterial({ color: 0xc99a4a, roughness: 0.65, metalness: 0.45 })
    );
    matRim.rotation.x = -Math.PI / 2;
    matRim.position.set(0, 0.012, 0.55);
    this.worldGroup.add(matRim);

    // Back & Side Closet Walls
    const backWallLeft = new THREE.Mesh(new THREE.BoxGeometry(5.6, 7.4, 0.35), wallMat);
    backWallLeft.position.set(-4.3, 3.2, -5.6);
    this.worldGroup.add(backWallLeft);

    const backWallRight = new THREE.Mesh(new THREE.BoxGeometry(5.6, 7.4, 0.35), wallMat);
    backWallRight.position.set(4.3, 3.2, -5.6);
    this.worldGroup.add(backWallRight);

    // Center "Closet Gap" (押し入れの隙間) glowing subtly behind Tokitsugi
    const gapBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 7.2),
      new THREE.MeshBasicMaterial({ color: 0x101c38 })
    );
    gapBackdrop.position.set(0, 3.2, -6.1);
    this.worldGroup.add(gapBackdrop);

    // Slightly ajar sliding fusuma doors framing the closet gap
    const fusumaMat = new THREE.MeshStandardMaterial({ color: 0x26324d, roughness: 0.88 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22160f, roughness: 0.8 });
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.2, 0.14), fusumaMat);
      door.position.set(side * 1.48, 3.0, -5.42);
      this.worldGroup.add(door);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 6.4, 0.24), frameMat);
      pillar.position.set(side * 0.94, 3.0, -5.36);
      this.worldGroup.add(pillar);
    }

    this.gapGlowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffd28a,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    this.gapGlowSprite.scale.set(5.4, 6.8, 1);
    this.gapGlowSprite.position.set(0, 2.7, -5.45);
    this.worldGroup.add(this.gapGlowSprite);

    // Side walls
    const sideWallL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 11.5), wallMat);
    sideWallL.position.set(-6.4, 3.2, -0.4);
    this.worldGroup.add(sideWallL);

    const sideWallR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 11.5), wallMat);
    sideWallR.position.set(6.4, 3.2, -0.4);
    this.worldGroup.add(sideWallR);

    // Back wall small drawers cabinet (signature Tokitsugi room tour detail)
    const drawerBank = new THREE.Group();
    drawerBank.position.set(-3.35, 1.55, -5.12);
    this.worldGroup.add(drawerBank);
    drawerBank.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 0.65), cabinetMat));
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 5; row++) {
        const px = -0.96 + col * 0.64;
        const py = -1.12 + row * 0.56;
        const face = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.48, 0.05),
          new THREE.MeshStandardMaterial({ color: (col + row) % 2 === 0 ? 0x452d1d : 0x3b2618, roughness: 0.78 })
        );
        face.position.set(px, py, 0.34);
        drawerBank.add(face);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), brassMat);
        knob.position.set(px, py, 0.39);
        drawerBank.add(knob);
      }
    }

    // Small decorative antique clocks on back wall
    const wallClocks: Array<[number, number, number, number, number, number]> = [
      [-2.15, 3.7, -5.3, 0.48, 10, 10],
      [-3.55, 3.9, -5.3, 0.36, 3, 25],
      [2.15, 3.75, -5.3, 0.46, 8, 50],
      [3.4, 3.45, -5.3, 0.34, 1, 15],
    ];
    for (const [wx, wy, wz, wr, hh, mm] of wallClocks) {
      const cg = new THREE.Group();
      cg.position.set(wx, wy, wz);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.08, 24), brassMat);
      body.rotation.x = Math.PI / 2;
      cg.add(body);
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(wr * 0.88, 24),
        new THREE.MeshStandardMaterial({ map: createSmallWallClockTex(hh, mm), roughness: 0.55 })
      );
      face.position.z = 0.045;
      cg.add(face);
      this.worldGroup.add(cg);
    }

    // === 2. Center Hero: Giant 3D Brass Pocket Watch Workbench ===
    // Positioned cleanly above the table mat with a gentle 0.13 rad tilt so all 12 hours (I..XII) remain 100% above the desk
    this.watchGroup.position.set(0, 0.56, 0.68);
    this.watchGroup.rotation.x = 0.13;
    this.worldGroup.add(this.watchGroup);

    // Outer solid brass casing (sits cleanly beneath the dial plane without ever clipping the face)
    const watchBase = new THREE.Mesh(
      new THREE.CylinderGeometry(CLOCK_RADIUS + 0.28, CLOCK_RADIUS + 0.4, 0.36, 64),
      darkBrassMat
    );
    watchBase.position.y = -0.18;
    watchBase.receiveShadow = true;
    watchBase.castShadow = true;
    this.watchGroup.add(watchBase);

    // Beveled gleaming brass bezel
    const outerBezel = new THREE.Mesh(
      new THREE.TorusGeometry(CLOCK_RADIUS + 0.22, 0.14, 16, 72),
      brassMat
    );
    outerBezel.rotation.x = Math.PI / 2;
    outerBezel.position.y = 0.02;
    this.watchGroup.add(outerBezel);

    const innerBezel = new THREE.Mesh(
      new THREE.TorusGeometry(CLOCK_RADIUS + 0.04, 0.045, 10, 64),
      darkBrassMat
    );
    innerBezel.rotation.x = Math.PI / 2;
    innerBezel.position.y = 0.04;
    this.watchGroup.add(innerBezel);

    // Pocket watch crown & bow ring at 12 o'clock (top)
    const crownNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.32, 16), brassMat);
    crownNeck.rotation.x = Math.PI / 2;
    crownNeck.position.set(0, 0.0, -(CLOCK_RADIUS + 0.42));
    this.watchGroup.add(crownNeck);

    const crownBow = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.055, 10, 28), brassMat);
    crownBow.rotation.x = Math.PI / 2;
    crownBow.position.set(0, 0.02, -(CLOCK_RADIUS + 0.72));
    this.watchGroup.add(crownBow);

    // Antique Roman-numeral & astral clock dial face
    this.watchFaceMat = new THREE.MeshStandardMaterial({
      map: createClockFaceTexture(),
      emissive: new THREE.Color(0x182644),
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.14,
    });
    const watchFace = new THREE.Mesh(new THREE.CircleGeometry(CLOCK_RADIUS + 0.04, 64), this.watchFaceMat);
    watchFace.rotation.x = -Math.PI / 2;
    watchFace.position.y = 0.015;
    watchFace.receiveShadow = true;
    this.watchGroup.add(watchFace);

    // Glowing magical blue/gold ring (homage to Tokitsugi's glowing pocket watch picturebook cover!)
    this.watchMagicRing = new THREE.Mesh(
      new THREE.RingGeometry(CLOCK_RADIUS - 0.12, CLOCK_RADIUS + 0.04, 64),
      new THREE.MeshBasicMaterial({
        color: 0x7fd2ff,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.watchMagicRing.rotation.x = -Math.PI / 2;
    this.watchMagicRing.position.y = 0.04;
    this.watchGroup.add(this.watchMagicRing);

    // 5 interlocking 3D brass gears recessed in the astral center
    const gearSpecs: Array<[number, number, number, number, number]> = [
      [0, 0, 0.62, 14, 0.65],
      [0.64, -0.36, 0.34, 10, -1.15],
      [-0.62, 0.38, 0.38, 12, -1.05],
      [-0.48, -0.52, 0.28, 9, 1.35],
      [0.54, 0.5, 0.31, 10, 1.22],
    ];
    gearSpecs.forEach(([gx, gz, gr, teeth, spd]) => {
      const gm = buildGearMesh(gr, teeth, 0.04, brassMat);
      gm.position.set(gx, 0.048, gz);
      this.watchGroup.add(gm);
      this.gears.push({ mesh: gm, speed: spd });
    });

    // 12 brass slot pedestals around the dial rim (where time fragments appear!)
    for (let i = 0; i < CLOCK_SLOTS; i++) {
      const angle = (i / CLOCK_SLOTS) * Math.PI * 2;
      const sx = Math.sin(angle) * (CLOCK_RADIUS - 0.28);
      const sz = -Math.cos(angle) * (CLOCK_RADIUS - 0.28);
      const marker = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.022, 8, 20),
        new THREE.MeshStandardMaterial({
          color: 0xe6bb66,
          emissive: 0x5c3c10,
          emissiveIntensity: 0.35,
          metalness: 0.8,
          roughness: 0.28,
        })
      );
      marker.rotation.x = Math.PI / 2;
      marker.position.set(sx, 0.045, sz);
      this.watchGroup.add(marker);
      this.slotMarkers.push(marker);
    }

    // Decorative Hour Hand (short antique hand)
    this.shortHandPivot.position.y = 0.11;
    this.watchGroup.add(this.shortHandPivot);
    const shortHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.03, CLOCK_RADIUS * 0.48),
      darkBrassMat
    );
    shortHand.position.set(0, 0, -CLOCK_RADIUS * 0.22);
    this.shortHandPivot.add(shortHand);

    // Hero Golden Timing Hand (long luminous hand synced to music beat!)
    this.handPivot.position.y = 0.15;
    this.watchGroup.add(this.handPivot);

    const longHandShaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.036, CLOCK_RADIUS - 0.15),
      new THREE.MeshStandardMaterial({
        color: 0xffe49c,
        emissive: 0xffb844,
        emissiveIntensity: 0.95,
        metalness: 0.72,
        roughness: 0.2,
      })
    );
    longHandShaft.position.set(0, 0, -(CLOCK_RADIUS - 0.15) * 0.46);
    this.handPivot.add(longHandShaft);

    // Glowing light beam ribbon along the hand for effortless visual tracking
    this.handBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffe69c,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const handBeam = new THREE.Mesh(new THREE.PlaneGeometry(0.28, CLOCK_RADIUS - 0.1), this.handBeamMat);
    handBeam.rotation.x = -Math.PI / 2;
    handBeam.position.set(0, 0.01, -(CLOCK_RADIUS - 0.1) * 0.48);
    this.handPivot.add(handBeam);

    // Star-tip orb right at the fragment ring radius
    const tipOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff6d2 })
    );
    tipOrb.position.set(0, 0.03, -(CLOCK_RADIUS - 0.28));
    this.handPivot.add(tipOrb);

    this.handTipGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffdf8c,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    this.handTipGlow.scale.set(0.92, 0.92, 1);
    this.handTipGlow.position.set(0, 0.06, -(CLOCK_RADIUS - 0.28));
    this.handPivot.add(this.handTipGlow);

    // Center golden jewel pivot cap
    const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 24), brassMat);
    centerCap.position.y = 0.14;
    this.watchGroup.add(centerCap);
    const centerGem = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x9ce0ff,
        emissive: 0x58b8ff,
        emissiveIntensity: 1.1,
        roughness: 0.12,
      })
    );
    centerGem.position.y = 0.22;
    this.watchGroup.add(centerGem);

    // === 3. Upgrade-Driven 3D Props ===
    this.grandClockHalo = this.buildGrandClock(brassMat, cabinetMat);
    this.buildRepairKitProps(brassMat, cabinetMat);
    this.buildGoldenThreadSpools(brassMat);
    this.buildMemoryJarShelves(brassMat, benchMat);
    this.hourglassSandMat = this.buildHourglass(brassMat);
    this.buildDiaryPhotoFrames(brassMat);

    // === 4. Floating Golden Time-Dust Particles ===
    const dustCount = 130;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const x = (Math.random() - 0.5) * 11;
      const y = 0.3 + Math.random() * 4.8;
      const z = -4.6 + Math.random() * 8.2;
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;
      this.dustBase.push({ x, y, z, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.65 });
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        color: 0xffe2a8,
        size: 0.14,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);
  }

  private buildGrandClock(brassMat: THREE.Material, cabinetMat: THREE.Material): THREE.Mesh {
    const gc = new THREE.Group();
    gc.position.set(4.55, 0.0, -3.5);
    gc.rotation.y = -0.38;
    this.worldGroup.add(gc);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.1, 0.85), cabinetMat);
    body.position.y = 2.05;
    body.castShadow = true;
    gc.add(body);

    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.98), brassMat);
    crown.position.y = 4.16;
    gc.add(crown);

    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshStandardMaterial({ map: createSmallWallClockTex(11, 55), roughness: 0.45 })
    );
    dial.position.set(0, 3.35, 0.44);
    gc.add(dial);

    const dialRim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 8, 24), brassMat);
    dialRim.position.set(0, 3.35, 0.44);
    gc.add(dialRim);

    // Recessed pendulum window
    const recess = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 1.85, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0e0a08 })
    );
    recess.position.set(0, 1.75, 0.42);
    gc.add(recess);

    this.grandClockPendulum.position.set(0, 2.6, 0.47);
    gc.add(this.grandClockPendulum);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 8), brassMat);
    rod.position.y = -0.68;
    this.grandClockPendulum.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), brassMat);
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -1.35;
    this.grandClockPendulum.add(bob);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd97d,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.position.set(0, 3.35, 0.48);
    halo.visible = false;
    gc.add(halo);
    return halo;
  }

  private buildRepairKitProps(brassMat: THREE.Material, cabinetMat: THREE.Material): void {
    // Wooden repair toolkit box & magnifier on left side of workbench
    const kitBox = new THREE.Group();
    kitBox.position.set(-3.75, 0.16, 0.25);
    kitBox.rotation.y = 0.32;
    kitBox.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.62), cabinetMat));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.62), cabinetMat);
    lid.position.set(0, 0.34, -0.32);
    lid.rotation.x = -1.1;
    kitBox.add(lid);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), brassMat);
      g.position.set(-0.28 + i * 0.18, 0.16, (i % 2 === 0 ? 1 : -1) * 0.08);
      kitBox.add(g);
    }
    this.worldGroup.add(kitBox);
    this.repairKitProps.push(kitBox);

    // Magnifying loupe
    const loupe = new THREE.Group();
    loupe.position.set(-3.35, 0.08, 1.35);
    loupe.rotation.y = -0.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 22), brassMat);
    ring.rotation.x = Math.PI / 2;
    loupe.add(ring);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 20),
      new THREE.MeshStandardMaterial({
        color: 0xbce6ff,
        transparent: true,
        opacity: 0.42,
        roughness: 0.08,
        metalness: 0.2,
      })
    );
    lens.rotation.x = -Math.PI / 2;
    loupe.add(lens);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.42, 8), cabinetMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(-0.42, 0, 0);
    loupe.add(handle);
    this.worldGroup.add(loupe);
    this.repairKitProps.push(loupe);

    // Extra spare brass gears stacked near the toolkit
    const spareStack = new THREE.Group();
    spareStack.position.set(-4.05, 0.05, -0.85);
    const g1 = buildGearMesh(0.32, 10, 0.05, brassMat);
    const g2 = buildGearMesh(0.22, 8, 0.05, brassMat);
    g2.position.set(0.18, 0.06, 0.12);
    spareStack.add(g1, g2);
    this.worldGroup.add(spareStack);
    this.repairKitProps.push(spareStack);
  }

  private buildGoldenThreadSpools(brassMat: THREE.Material): void {
    const threadMat = new THREE.MeshStandardMaterial({
      color: 0xffdf7a,
      emissive: 0xd99b26,
      emissiveIntensity: 0.72,
      roughness: 0.35,
      metalness: 0.5,
    });
    const positions: Array<[number, number, number]> = [
      [-3.25, 0.18, 2.25],
      [-3.75, 0.18, 2.02],
      [-3.52, 0.18, 2.6],
    ];
    positions.forEach(([x, y, z]) => {
      const sp = new THREE.Group();
      sp.position.set(x, y, z);
      sp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 16), threadMat));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), brassMat);
      top.position.y = 0.15;
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), brassMat);
      bot.position.y = -0.15;
      sp.add(top, bot);
      this.worldGroup.add(sp);
      this.threadSpools.push(sp);
    });
  }

  private buildMemoryJarShelves(brassMat: THREE.Material, shelfMat: THREE.Material): void {
    const shelfL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 4.8), shelfMat);
    shelfL.position.set(-5.75, 2.15, -1.5);
    this.worldGroup.add(shelfL);

    const shelfR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 3.2), shelfMat);
    shelfR.position.set(5.75, 2.15, -0.6);
    this.worldGroup.add(shelfR);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xe6f2ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.15,
    });

    const jarCoords: Array<[number, number, number, number]> = [
      [-5.6, 2.22, -3.2, 0xffd27a],
      [-5.6, 2.22, -2.1, 0xffa6b4],
      [-5.6, 2.22, -1.0, 0x98dbff],
      [-5.6, 2.22, 0.1, 0xffe07d],
      [5.6, 2.22, -1.6, 0xffbe76],
      [5.6, 2.22, -0.3, 0xfff3ba],
    ];

    jarCoords.forEach(([jx, jy, jz, col]) => {
      const g = new THREE.Group();
      g.position.set(jx, jy, jz);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.56, 16), glassMat);
      body.position.y = 0.28;
      g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14), brassMat);
      cap.position.y = 0.6;
      g.add(cap);
      const lightMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.85,
        roughness: 0.3,
      });
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.34, 14), lightMat);
      fill.position.y = 0.2;
      g.add(fill);

      const gl = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: col,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      );
      gl.scale.set(1.05, 1.05, 1);
      gl.position.y = 0.3;
      g.add(gl);

      this.worldGroup.add(g);
      this.memoryJarNodes.push({ group: g, lightMat, glow: gl });
    });
  }

  private buildHourglass(brassMat: THREE.Material): THREE.MeshStandardMaterial {
    this.hourglassGroup.position.set(3.65, 0.02, 0.85);
    this.worldGroup.add(this.hourglassGroup);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.08, 20), brassMat);
    base.position.y = 0.04;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.08, 20), brassMat);
    top.position.y = 1.24;
    this.hourglassGroup.add(base, top);

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.2, 8), brassMat);
      rod.position.set(Math.cos(a) * 0.3, 0.64, Math.sin(a) * 0.3);
      this.hourglassGroup.add(rod);
    }

    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xd99b32,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    const upperCone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 18), sandMat);
    upperCone.rotation.x = Math.PI;
    upperCone.position.y = 0.92;
    const lowerCone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 18), sandMat);
    lowerCone.position.y = 0.36;
    this.hourglassGroup.add(upperCone, lowerCone);

    return sandMat;
  }

  private buildDiaryPhotoFrames(brassMat: THREE.Material): void {
    const spots: Array<[number, number, number, number]> = [
      [3.45, 0.03, 2.25, -0.35],
      [4.15, 0.03, 1.85, -0.62],
      [3.95, 0.03, -0.45, -0.48],
      [-2.85, 0.03, -1.45, 0.42],
      [2.85, 0.03, -1.45, -0.42],
    ];
    const tints = [0x4c6896, 0x8a6d4b, 0x5c7c72, 0x8a5b66, 0x6b6090];

    spots.forEach(([x, y, z, ry], i) => {
      const frame = new THREE.Group();
      frame.position.set(x, y, z);
      frame.rotation.y = ry;
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.025, 0.74),
        new THREE.MeshStandardMaterial({ color: 0xefe4cc, roughness: 0.85 })
      );
      const pic = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.03, 0.48),
        new THREE.MeshStandardMaterial({
          color: tints[i % tints.length],
          emissive: 0x2a1f10,
          emissiveIntensity: 0.25,
          roughness: 0.7,
        })
      );
      pic.position.z = -0.05;
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), brassMat);
      clip.position.z = -0.35;
      frame.add(paper, pic, clip);
      this.worldGroup.add(frame);
      this.diaryPhotoFrames.push(frame);
    });
  }

  public syncUpgrades(state: TokitsugiSaveState): void {
    const u = state.upgrades;
    this.repairKitProps.forEach((p, idx) => {
      p.visible = idx === 0 || u.repairKit >= idx * 2;
    });
    this.grandClockHalo.visible = u.grandClock >= 1;
    this.threadSpools.forEach((sp, idx) => {
      sp.visible = idx === 0 || u.goldenThread >= idx * 2;
    });
    this.memoryJarNodes.forEach((node, idx) => {
      node.group.visible = idx < Math.max(2, u.memoryJars);
    });
    const hgScale = 0.82 + u.hourglass * 0.11;
    this.hourglassGroup.scale.setScalar(hgScale);
    this.hourglassSandMat.emissiveIntensity = 0.55 + u.hourglass * 0.22;
    this.diaryPhotoFrames.forEach((fr, idx) => {
      fr.visible = idx < Math.max(1, u.closetDiary);
    });
  }

  /** Returns local (watchGroup-relative) position for slot 0..11 on the clock face */
  public getSlotLocalPosition(slotIndex: number, yOffset = 0.14): THREE.Vector3 {
    const angle = (slotIndex / CLOCK_SLOTS) * Math.PI * 2;
    const r = CLOCK_RADIUS - 0.28;
    return new THREE.Vector3(Math.sin(angle) * r, yOffset, -Math.cos(angle) * r);
  }

  /** Returns world-space position for slot 0..11 */
  public getSlotWorldPosition(slotIndex: number, yOffset = 0.14): THREE.Vector3 {
    const local = this.getSlotLocalPosition(slotIndex, yOffset);
    return this.watchGroup.localToWorld(local);
  }

  /** Sets the golden timing hand angle in radians (0 = 12 o'clock, clockwise positive) */
  public setHandAngle(angleRad: number): void {
    // In Three.js around Y axis, clockwise from -Z toward +X is negative rotation.y
    this.handPivot.rotation.y = -angleRad;
    this.shortHandPivot.rotation.y = -angleRad / 12;
  }

  public highlightSlot(slotIndex: number | null): void {
    this.slotMarkers.forEach((m, idx) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (idx === slotIndex) {
        mat.emissive.setHex(0xffd26a);
        mat.emissiveIntensity = 1.65;
        m.scale.setScalar(1.24);
      } else {
        mat.emissive.setHex(0x5c3c10);
        mat.emissiveIntensity = 0.35;
        m.scale.setScalar(1.0);
      }
    });
  }

  public triggerMendFlash(): void {
    this.mendFlash = 1.0;
  }

  public triggerRewindEffect(): void {
    this.rewindSpin = 1.0;
  }

  public triggerJarResonance(): void {
    this.jarResonance = 1.0;
  }

  public triggerShake(amount = 0.2): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    viewWidth: number,
    viewHeight: number
  ): { x: number; y: number } {
    const p = worldPos.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * viewWidth,
      y: (-p.y * 0.5 + 0.5) * viewHeight,
    };
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    // Slightly widen FOV on very compact landscape screens so the entire pocket watch + Tokitsugi remain comfortably visible
    this.camera.fov = w / h < 1.55 ? 47 : 42;
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
    this.mendFlash = Math.max(0, this.mendFlash - dt * 1.4);
    this.rewindSpin = Math.max(0, this.rewindSpin - dt * 1.8);
    this.jarResonance = Math.max(0, this.jarResonance - dt * 2.2);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.6);

    const beatPulse = Math.pow(1 - beatPhase, 3);

    // Smooth camera framing between cozy Lobby orbit and crisp Play view
    const desiredPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.25) * 1.35, 4.15 + Math.sin(elapsed * 0.4) * 0.14, 7.35)
        : new THREE.Vector3(0, 5.75, 7.15);
    const desiredLook =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.0, -0.65)
        : new THREE.Vector3(0, 0.65, -0.05);

    const lerpRate = 1 - Math.exp(-4.5 * dt);
    this.camPos.lerp(desiredPos, lerpRate);
    this.camLook.lerp(desiredLook, lerpRate);

    const sx = (Math.random() - 0.5) * this.shakeAmp;
    const sy = (Math.random() - 0.5) * this.shakeAmp;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    // Rotate 3D interlocking gears (spin backward fast during Rewind Stitch!)
    const gearDir = this.rewindSpin > 0.05 ? -4.5 * this.rewindSpin - 0.8 : isFever ? 2.1 : 1.0 + energy * 0.6;
    for (const g of this.gears) {
      g.mesh.rotation.y += dt * g.speed * gearDir;
    }

    // Grand clock pendulum swing
    this.grandClockPendulum.rotation.z = Math.sin(elapsed * 2.4) * 0.2;
    if (this.grandClockHalo.visible) {
      this.grandClockHalo.rotation.z = elapsed * 0.7;
      (this.grandClockHalo.material as THREE.MeshBasicMaterial).opacity =
        0.35 + beatPulse * 0.35 + (isFever ? 0.35 : 0);
    }

    // Pocket watch face magical blue-gold luminescence
    const magicMat = this.watchMagicRing.material as THREE.MeshBasicMaterial;
    magicMat.opacity = 0.24 + beatPulse * 0.22 + this.mendFlash * 0.65 + (isFever ? 0.4 : 0);
    magicMat.color.setHex(isFever ? 0xffe28c : this.mendFlash > 0.2 ? 0x9ae2ff : 0x7fd2ff);

    this.watchFaceMat.emissive.setHex(isFever ? 0x4a3412 : this.mendFlash > 0.15 ? 0x26547a : 0x182644);
    this.watchFaceMat.emissiveIntensity = 0.25 + beatPulse * 0.18 + this.mendFlash * 0.85 + (isFever ? 0.32 : 0);

    // Hand glow & rewind shimmer
    const handGlowScale = (isFever ? 1.25 : 0.88) + beatPulse * 0.28 + this.rewindSpin * 0.45;
    this.handTipGlow.scale.set(handGlowScale, handGlowScale, 1);
    this.handBeamMat.color.setHex(this.rewindSpin > 0.1 ? 0x9ce2ff : isFever ? 0xfff2b2 : 0xffe49c);
    this.handBeamMat.opacity = 0.35 + beatPulse * 0.24 + (isFever ? 0.28 : 0);

    // Closet gap moonlight / Golden Hour radiance
    const gapMat = this.gapGlowSprite.material as THREE.SpriteMaterial;
    gapMat.color.setHex(isFever ? 0xffe598 : 0xffd28a);
    gapMat.opacity = (isFever ? 0.82 : 0.38) + beatPulse * 0.12 + this.mendFlash * 0.3;
    this.gapBeamLight.color.setHex(isFever ? 0xffdc8a : 0x98c8ff);
    this.gapBeamLight.intensity = (isFever ? 3.2 : 1.35) + this.mendFlash * 1.4;
    this.feverLight.intensity += ((isFever ? 2.8 : 0) - this.feverLight.intensity) * lerpRate;

    // Memory Jars resonance glow
    for (const jar of this.memoryJarNodes) {
      if (!jar.group.visible) continue;
      jar.lightMat.emissiveIntensity = 0.72 + this.jarResonance * 1.1 + beatPulse * 0.25;
      const gs = 0.95 + this.jarResonance * 0.45 + (isFever ? 0.25 : 0);
      jar.glow.scale.set(gs, gs, 1);
    }

    // Floating golden dust particles
    const posAttr = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.dustBase.length; i++) {
      const b = this.dustBase[i];
      const y = ((b.y + elapsed * b.speed * (isFever ? 0.65 : 0.22)) % 5.0) + 0.25;
      const x = b.x + Math.sin(elapsed * 0.55 + b.phase) * 0.22;
      const z = b.z + Math.cos(elapsed * 0.45 + b.phase) * 0.18;
      posAttr.setXYZ(i, x, y, z);
    }
    posAttr.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
