import * as THREE from 'three';
import { LETTER_DESK_SPOTS } from './config';
import { HenjiroSaveState } from './types';

interface SpotVisual {
  group: THREE.Group;
  ringFill: THREE.Mesh;
  ringBg: THREE.Mesh;
  letterMesh: THREE.Mesh;
  waxSealMesh: THREE.Mesh;
  halo: THREE.Sprite;
  glowLight: THREE.PointLight;
  dimColor: THREE.Color;
  litColor: THREE.Color;
  pulse: number;
}

interface FlyingLetter {
  group: THREE.Group;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  t: number;
  dur: number;
}

interface HangingNote {
  group: THREE.Group;
  phase: number;
  glow: THREE.Sprite;
}

interface FallingDecorLetter {
  mesh: THREE.Mesh;
  phase: number;
  angle: number;
  radius: number;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export class PostStudyScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpNdc = new THREE.Vector2();

  private cameraMode: 'lobby' | 'play' = 'lobby';
  private camPos = new THREE.Vector3(0, 6.2, 8.8);
  private camTarget = new THREE.Vector3(0, 1.3, -0.8);
  private shakeTimer = 0;
  private shakeIntensity = 0;

  // Lights
  private hemiLight: THREE.HemisphereLight;
  private moonDirLight: THREE.DirectionalLight;
  private studyMainLight: THREE.PointLight;
  private deskLampLight: THREE.PointLight;
  private moonShaftLight: THREE.PointLight;
  private windowGlowLight: THREE.PointLight;

  // Animated study props
  private quillPivot!: THREE.Group;
  private deskFlame!: THREE.Mesh;
  private ceilingGlow!: THREE.Sprite;
  private moonShaftMesh!: THREE.Mesh;
  private moonSpotCircle!: THREE.Mesh;
  private townWindowSprites: THREE.Sprite[] = [];
  private garlandBulbs: { sprite: THREE.Sprite; mesh: THREE.Mesh; phase: number }[] = [];
  private hangingNotes: HangingNote[] = [];
  private fallingDecorLetters: FallingDecorLetter[] = [];
  private dustPoints!: THREE.Points;
  private dustBase: [number, number, number, number][] = [];
  private flyingLetters: FlyingLetter[] = [];

  // Upgrade-responsive 3D prop groups
  private deskExtraGroup = new THREE.Group();
  private garlandGroup = new THREE.Group();
  private clotheslineExtraGroup = new THREE.Group();
  private waxShelfGroup = new THREE.Group();
  private chairPlantsGroup = new THREE.Group();
  private bookshelfFramesGroup = new THREE.Group();

  // Interactive 4 writing spots
  private spotVisuals: SpotVisual[] = [];

  // Shared materials for flying letters
  private envCreamMat: THREE.MeshStandardMaterial;
  private waxRedMat: THREE.MeshStandardMaterial;

  private townFlashTimer = 0;

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
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b18);
    this.scene.fog = new THREE.FogExp2(0x070b18, 0.022);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 120);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.glowTex = this.createGlowTexture();
    this.envCreamMat = new THREE.MeshStandardMaterial({
      color: 0xf4ead0,
      roughness: 0.78,
      emissive: 0x3a2814,
      emissiveIntensity: 0.25,
    });
    this.waxRedMat = new THREE.MeshStandardMaterial({
      color: 0xc8372e,
      roughness: 0.36,
      metalness: 0.12,
      emissive: 0x5c110d,
      emissiveIntensity: 0.4,
    });

    this.scene.add(this.worldGroup);

    // Lighting — moonlit blue from above + warm amber desk & post-study glow
    this.hemiLight = new THREE.HemisphereLight(0x9fb4e8, 0x3b1f18, 0.72);
    this.scene.add(this.hemiLight);

    this.moonDirLight = new THREE.DirectionalLight(0xb2c9ff, 0.82);
    this.moonDirLight.position.set(-5, 11, 7);
    this.moonDirLight.castShadow = true;
    this.moonDirLight.shadow.mapSize.set(1024, 1024);
    this.moonDirLight.shadow.camera.near = 1;
    this.moonDirLight.shadow.camera.far = 32;
    const d = 8.5;
    this.moonDirLight.shadow.camera.left = -d;
    this.moonDirLight.shadow.camera.right = d;
    this.moonDirLight.shadow.camera.top = d;
    this.moonDirLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonDirLight);

    this.studyMainLight = new THREE.PointLight(0xffbd70, 2.8, 18, 1.25);
    this.studyMainLight.position.set(0, 5.2, -0.5);
    this.scene.add(this.studyMainLight);

    this.deskLampLight = new THREE.PointLight(0xffc67c, 2.2, 10, 1.35);
    this.deskLampLight.position.set(0.95, 1.9, -2.5);
    this.scene.add(this.deskLampLight);

    this.moonShaftLight = new THREE.PointLight(0x9ec0ff, 1.6, 12, 1.35);
    this.moonShaftLight.position.set(0, 5.8, 0.8);
    this.scene.add(this.moonShaftLight);

    this.windowGlowLight = new THREE.PointLight(0x9fbdf5, 1.0, 9, 1.4);
    this.windowGlowLight.position.set(4.8, 2.8, 0.6);
    this.scene.add(this.windowGlowLight);

    this.buildEnvironment();
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.28, 'rgba(255,255,255,0.52)');
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
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private makePaperTex(lines: string[], w = 256, h = 192, tint = '#f2e6cb'): THREE.CanvasTexture {
    const rnd = createSeededRandom(lines.join('').length * 37 + 11);
    return this.makeCanvasTex(w, h, (g, W, H) => {
      g.fillStyle = tint;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 320; i++) {
        g.fillStyle = `rgba(120, 88, 52, ${(rnd() * 0.08).toFixed(3)})`;
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
      g.strokeStyle = 'rgba(130, 96, 62, 0.25)';
      g.lineWidth = 4;
      g.strokeRect(8, 8, W - 16, H - 16);

      g.fillStyle = '#3a2b3f';
      g.font = `700 ${Math.round(H * 0.16)}px "Zen Maru Gothic", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const step = H / (lines.length + 1);
      lines.forEach((line, i) => {
        g.save();
        g.translate(W * 0.5, step * (i + 1));
        g.rotate(i % 2 === 0 ? -0.015 : 0.015);
        g.fillText(line, 0, 0);
        g.restore();
      });
    });
  }

  private buildEnvironment(): void {
    const rnd = createSeededRandom(606);
    const R = 6.2; // Spacious post-study interior radius
    const H = 6.6;

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a44f,
      metalness: 0.78,
      roughness: 0.3,
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x452b1a,
      roughness: 0.75,
    });
    const warmWoodTex = this.makeCanvasTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 6; i++) {
        const y0 = (i * h) / 6;
        g.fillStyle = `hsl(${24 + rnd() * 6}, ${36 + rnd() * 8}%, ${24 + rnd() * 8}%)`;
        g.fillRect(0, y0, w, h / 6);
        g.fillStyle = 'rgba(15, 7, 3, 0.45)';
        g.fillRect(0, y0, w, 2);
      }
    });
    const woodMat = new THREE.MeshStandardMaterial({ map: warmWoodTex, roughness: 0.72 });

    // ===== 1. Moonlit Night Sky & Distant Tokoyo-cho Town Silhouette =====
    const starCount = 320;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.PI * 0.25 + rnd() * Math.PI * 1.5;
      const elev = 0.08 + rnd() * 0.75;
      const dist = 36 + rnd() * 24;
      starPos[i * 3] = Math.sin(a) * Math.cos(elev) * dist;
      starPos[i * 3 + 1] = 2 + Math.sin(elev) * dist * 0.75;
      starPos[i * 3 + 2] = -Math.abs(Math.cos(a)) * dist - 8;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.worldGroup.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xe4ecff,
          size: 0.26,
          transparent: true,
          opacity: 0.85,
          fog: false,
        })
      )
    );

    // Crescent Moon visible in the upper-left night sky outside the cutaway post
    const moonTex = this.makeCanvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const rg = g.createRadialGradient(128, 128, 24, 128, 128, 120);
      rg.addColorStop(0, 'rgba(255, 244, 200, 0.45)');
      rg.addColorStop(1, 'rgba(255, 244, 200, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff5d1';
      g.beginPath();
      g.arc(128, 128, 48, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(146, 114, 42, 0, Math.PI * 2);
      g.fill();
    });
    const moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonTex, transparent: true, fog: false })
    );
    moonSprite.position.set(-10.5, 9.2, -16);
    moonSprite.scale.set(5.4, 5.4, 1);
    this.worldGroup.add(moonSprite);

    // Distant night town silhouettes flanking the giant red post
    const townMat = new THREE.MeshStandardMaterial({ color: 0x0d1428, roughness: 0.95 });
    const townPlacements: [number, number, number, number][] = [
      [-12.5, -10.5, 3.0, 6.2],
      [-9.8, -11.5, 2.8, 7.4],
      [-7.8, -13.0, 2.6, 5.8],
      [8.2, -12.5, 2.8, 6.8],
      [10.8, -11.0, 3.0, 7.6],
      [13.4, -10.0, 2.8, 5.6],
    ];
    for (const [bx, bz, bw, bh] of townPlacements) {
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 2.4), townMat);
      bldg.position.set(bx, bh / 2 - 1.2, bz);
      this.worldGroup.add(bldg);

      // Little warm town windows that glow brighter when replies are sent!
      for (let w = 0; w < 3; w++) {
        const ws = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowTex,
            color: 0xffd286,
            transparent: true,
            opacity: 0.45 + rnd() * 0.35,
            blending: THREE.AdditiveBlending,
            fog: false,
          })
        );
        ws.position.set(bx + (w - 1) * 0.72, 1.4 + (w % 2) * 1.5 + rnd() * 1.2, bz + 1.35);
        ws.scale.set(0.85, 0.85, 1);
        this.worldGroup.add(ws);
        this.townWindowSprites.push(ws);
      }
    }

    // ===== 2. Red Post Interior Cylinder (Cutaway front so gameplay is crystal clear) =====
    const redWallTex = this.makeCanvasTex(
      256,
      512,
      (g, w, h) => {
        g.fillStyle = '#8b231e';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(i * 32, 0, 3, h);
          g.fillStyle = 'rgba(255,175,140,0.06)';
          g.fillRect(i * 32 + 6, 0, 8, h);
        }
        for (let i = 0; i < 550; i++) {
          g.fillStyle = `rgba(${rnd() < 0.6 ? '28,0,0' : '255,195,165'}, ${(rnd() * 0.1).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 8);
        }
      },
      6,
      1
    );

    const wainTex = this.makeCanvasTex(
      256,
      128,
      (g, w, h) => {
        g.fillStyle = '#1f4c43';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) {
          const x = i * 64;
          g.fillStyle = 'rgba(0,0,0,0.38)';
          g.fillRect(x, 0, 3, h);
          g.strokeStyle = 'rgba(195, 238, 214, 0.25)';
          g.lineWidth = 2;
          g.strokeRect(x + 9, 12, 46, h - 24);
          g.strokeStyle = 'rgba(0,0,0,0.4)';
          g.strokeRect(x + 12, 15, 40, h - 30);
        }
      },
      10,
      1
    );

    // Open arc facing +Z camera: from angle 0.68 rad to 2*PI - 0.68 rad
    const openHalf = 0.72;
    const arcLen = Math.PI * 2 - openHalf * 2;

    const redInMat = new THREE.MeshStandardMaterial({
      map: redWallTex,
      roughness: 0.68,
      metalness: 0.18,
      side: THREE.BackSide,
    });
    const postShell = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, H, 56, 1, true, openHalf, arcLen),
      redInMat
    );
    postShell.position.y = H / 2;
    this.worldGroup.add(postShell);

    // Outer red lip rim around the post cutaway
    const redOutMat = new THREE.MeshStandardMaterial({
      color: 0xb22c23,
      roughness: 0.48,
      metalness: 0.32,
    });
    const postOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.18, R + 0.18, H, 56, 1, true, openHalf, arcLen),
      redOutMat
    );
    postOuter.position.y = H / 2;
    this.worldGroup.add(postOuter);

    // Deep forest-green wainscoting along lower inner wall + brass trim rails
    const wainMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.05, R - 0.05, 1.75, 56, 1, true, openHalf, arcLen),
      new THREE.MeshStandardMaterial({
        map: wainTex,
        roughness: 0.56,
        metalness: 0.12,
        side: THREE.BackSide,
      })
    );
    wainMesh.position.y = 0.88;
    this.worldGroup.add(wainMesh);

    const brassRail = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.08, R - 0.08, 0.09, 56, 1, true, openHalf, arcLen),
      new THREE.MeshStandardMaterial({
        color: 0xd4a44f,
        metalness: 0.76,
        roughness: 0.32,
        side: THREE.DoubleSide,
      })
    );
    brassRail.position.y = 1.78;
    this.worldGroup.add(brassRail);

    // Brass cutaway door-frame pillars + open red post door on the right!
    [-openHalf, openHalf].forEach((ang) => {
      const px = Math.sin(ang) * R;
      const pz = Math.cos(ang) * R;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, H, 0.34), brassMat);
      pillar.position.set(px, H / 2, pz);
      pillar.rotation.y = ang;
      this.worldGroup.add(pillar);
    });

    // Open vintage red post door swung open on the right edge with handwritten sticky notes
    const doorPivot = new THREE.Group();
    doorPivot.position.set(Math.sin(openHalf) * R, 0, Math.cos(openHalf) * R);
    doorPivot.rotation.y = 0.82;
    this.worldGroup.add(doorPivot);
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 4.9, 0.16), redOutMat);
    doorPanel.position.set(1.05, 2.45, 0);
    doorPivot.add(doorPanel);
    const doorHandle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.032, 8, 18), brassMat);
    doorHandle.position.set(1.85, 2.45, 0.12);
    doorPivot.add(doorHandle);
    const doorNote1 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.62),
      new THREE.MeshStandardMaterial({
        map: this.makePaperTex(['好きです。', 'でも言えなくて。'], 256, 184),
        roughness: 0.9,
      })
    );
    doorNote1.position.set(0.95, 3.2, -0.09);
    doorNote1.rotation.y = Math.PI;
    doorNote1.rotation.z = 0.06;
    doorPivot.add(doorNote1);
    const doorNote2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.64),
      new THREE.MeshStandardMaterial({
        map: this.makePaperTex(['元気でいてね。', 'それだけでよかったのに。'], 256, 184),
        roughness: 0.9,
      })
    );
    doorNote2.position.set(1.05, 2.15, -0.09);
    doorNote2.rotation.y = Math.PI;
    doorNote2.rotation.z = -0.05;
    doorPivot.add(doorNote2);

    // Top red post cornice ring + glowing letter slot overhead
    const topRim = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.08, 0.24, 12, 56),
      redOutMat
    );
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = H;
    this.worldGroup.add(topRim);

    // ===== 3. Parquet Wooden Floor & Ornate Circular Navy-Crimson-Gold Rug =====
    const parqTex = this.makeCanvasTex(512, 512, (g, w, h) => {
      const cols = 10;
      const pw = w / cols;
      for (let i = 0; i < cols; i++) {
        let y = -rnd() * 140;
        while (y < h) {
          const len = 120 + rnd() * 150;
          g.fillStyle = `hsl(${26 + rnd() * 5}, ${42 + rnd() * 8}%, ${24 + rnd() * 8}%)`;
          g.fillRect(i * pw, y, pw, len);
          g.fillStyle = 'rgba(22, 10, 4, 0.55)';
          g.fillRect(i * pw, y, pw, 2);
          y += len;
        }
        g.fillStyle = 'rgba(22, 10, 4, 0.6)';
        g.fillRect(i * pw, 0, 2, h);
      }
    });
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R + 0.05, 56),
      new THREE.MeshStandardMaterial({ map: parqTex, roughness: 0.62 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    // Stone cobblestone apron outside the open front edge
    const apron = new THREE.Mesh(
      new THREE.RingGeometry(R + 0.04, 15, 48),
      new THREE.MeshStandardMaterial({ color: 0x13192b, roughness: 0.88 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.04;
    this.worldGroup.add(apron);

    // Ornate circular study rug (from Henjiro's room)
    const rugTex = this.makeCanvasTex(512, 512, (g, w, h) => {
      const c = 256;
      g.clearRect(0, 0, w, h);
      const ring = (rad: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(c, c, rad, 0, Math.PI * 2);
        g.fill();
      };
      ring(250, '#e8dcc0');
      ring(236, '#23335a');
      ring(214, '#d49a3a');
      ring(202, '#23335a');
      ring(176, '#7a2a30');
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.save();
        g.translate(c + Math.cos(a) * 136, c + Math.sin(a) * 136);
        g.rotate(a);
        g.fillStyle = '#e8dcc0';
        g.beginPath();
        g.moveTo(-24, 0);
        g.quadraticCurveTo(0, -11, 24, 0);
        g.quadraticCurveTo(0, 11, -24, 0);
        g.fill();
        g.restore();
      }
      ring(94, '#23335a');
      ring(85, '#d49a3a');
      ring(75, '#7a2a30');
      g.fillStyle = '#e8dcc0';
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rad = i % 2 ? 22 : 58;
        if (i === 0) g.moveTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
        else g.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      }
      g.fill();
    });
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(3.45, 56),
      new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.94, transparent: true })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 0.2);
    rug.receiveShadow = true;
    this.worldGroup.add(rug);

    // ===== 4. Moonlight Shaft from Top Letter Slot =====
    const beamTex = this.makeCanvasTex(16, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(195, 220, 255, 0.85)');
      gr.addColorStop(1, 'rgba(195, 220, 255, 0.04)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    this.moonShaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 2.35, 7.2, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex,
        color: 0xb6d0ff,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.moonShaftMesh.position.set(0, 3.6, 0.55);
    this.worldGroup.add(this.moonShaftMesh);

    this.moonSpotCircle = new THREE.Mesh(
      new THREE.CircleGeometry(2.15, 40),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: 0xa6c4ff,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.moonSpotCircle.rotation.x = -Math.PI / 2;
    this.moonSpotCircle.position.set(0, 0.02, 0.55);
    this.worldGroup.add(this.moonSpotCircle);

    // ===== 5. Back Wooden Writing Desk (Spot 0 centerpiece) =====
    const deskGroup = new THREE.Group();
    deskGroup.position.set(0, 0, -3.55);
    this.worldGroup.add(deskGroup);

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 1.25), woodMat);
    deskTop.position.set(0, 1.05, 0);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    deskGroup.add(deskTop);

    [
      [-1.3, -0.5],
      [1.3, -0.5],
      [-1.3, 0.5],
      [1.3, 0.5],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.05, 0.11), darkWoodMat);
      leg.position.set(lx, 0.525, lz);
      deskGroup.add(leg);
    });

    // Desk drawers & brass knobs
    const drawerL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.04), darkWoodMat);
    drawerL.position.set(-0.68, 0.86, 0.62);
    deskGroup.add(drawerL);
    const drawerR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.04), darkWoodMat);
    drawerR.position.set(0.68, 0.86, 0.62);
    deskGroup.add(drawerR);
    [-0.68, 0.68].forEach((kx) => {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), brassMat);
      knob.position.set(kx, 0.86, 0.66);
      deskGroup.add(knob);
    });

    // Desk name plaque "ヘンジロウ"
    const namePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.24),
      new THREE.MeshStandardMaterial({
        map: this.makePaperTex(['ヘンジロウ'], 220, 72, '#e8d7b4'),
        roughness: 0.78,
      })
    );
    namePlate.position.set(0, 1.15, 0.635);
    deskGroup.add(namePlate);

    // Letter being written on desk
    const deskLetter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.54),
      new THREE.MeshStandardMaterial({
        map: this.makePaperTex(['ちゃんと届きますように', 'ありがとう、をこめて'], 256, 180),
        roughness: 0.9,
      })
    );
    deskLetter.rotation.set(-Math.PI / 2, 0, -0.08);
    deskLetter.position.set(-0.18, 1.106, 0.04);
    deskGroup.add(deskLetter);

    // Glass Inkwell + Feather Quill Pen
    const inkwell = new THREE.Group();
    inkwell.position.set(-0.92, 1.1, -0.05);
    deskGroup.add(inkwell);
    const inkGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.1, 0.16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xdce8f2,
        transparent: true,
        opacity: 0.42,
        roughness: 0.1,
      })
    );
    inkGlass.position.y = 0.08;
    inkwell.add(inkGlass);
    const inkLiquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.085, 0.09, 14),
      new THREE.MeshStandardMaterial({
        color: 0x16224a,
        emissive: 0x1a2d66,
        emissiveIntensity: 0.5,
      })
    );
    inkLiquid.position.y = 0.05;
    inkwell.add(inkLiquid);

    this.quillPivot = new THREE.Group();
    this.quillPivot.position.set(0, 0.15, 0);
    this.quillPivot.rotation.set(0.14, 0.2, -0.45);
    inkwell.add(this.quillPivot);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.68, 6),
      new THREE.MeshStandardMaterial({ color: 0xf4ebd6, roughness: 0.6 })
    );
    shaft.position.y = 0.34;
    this.quillPivot.add(shaft);
    const featherShape = new THREE.Shape();
    featherShape.moveTo(0, 0);
    featherShape.quadraticCurveTo(0.13, 0.22, 0.01, 0.54);
    featherShape.quadraticCurveTo(-0.11, 0.22, 0, 0);
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0xfbf5e6,
      roughness: 0.72,
      emissive: 0x6b5632,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    const f1 = new THREE.Mesh(new THREE.ShapeGeometry(featherShape), featherMat);
    f1.position.y = 0.22;
    f1.rotation.y = 0.25;
    this.quillPivot.add(f1);
    const f2 = new THREE.Mesh(new THREE.ShapeGeometry(featherShape), featherMat);
    f2.position.y = 0.22;
    f2.rotation.y = -0.85;
    this.quillPivot.add(f2);

    // Green-shaded brass desk lantern
    const lampGroup = new THREE.Group();
    lampGroup.position.set(1.06, 1.1, -0.22);
    deskGroup.add(lampGroup);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.16, 16), brassMat);
    lampBase.position.y = 0.08;
    lampGroup.add(lampBase);
    const lampGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.34, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xfff0d4,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      })
    );
    lampGlass.position.y = 0.32;
    lampGroup.add(lampGlass);
    this.deskFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdf96 })
    );
    this.deskFlame.scale.set(1, 1.65, 1);
    this.deskFlame.position.y = 0.28;
    lampGroup.add(this.deskFlame);
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.2, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x2a5c46,
        roughness: 0.45,
        metalness: 0.25,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.y = 0.56;
    lampGroup.add(lampShade);
    const lampGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffc874,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lampGlow.position.y = 0.3;
    lampGlow.scale.set(1.3, 1.3, 1);
    lampGroup.add(lampGlow);

    // Extra desk props unlocked by quillDesk upgrades (wax seal, teacup, bell, stacked letters)
    this.deskExtraGroup.position.copy(deskGroup.position);
    this.worldGroup.add(this.deskExtraGroup);
    const deskWax = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 16), this.waxRedMat);
    deskWax.position.set(0.32, 1.12, -0.24);
    this.deskExtraGroup.add(deskWax);
    const waxStampHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.044, 0.12, 12), darkWoodMat);
    waxStampHandle.position.set(0.46, 1.16, -0.2);
    this.deskExtraGroup.add(waxStampHandle);
    const waxStampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.035, 12), brassMat);
    waxStampHead.position.set(0.46, 1.24, -0.2);
    this.deskExtraGroup.add(waxStampHead);
    // Teacup & brass bell
    const teacup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.06, 0.11, 14),
      new THREE.MeshStandardMaterial({ color: 0xf4eee0, roughness: 0.35 })
    );
    teacup.position.set(-0.56, 1.16, -0.34);
    this.deskExtraGroup.add(teacup);
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.11, 16), brassMat);
    bell.position.set(-0.34, 1.16, -0.38);
    this.deskExtraGroup.add(bell);
    for (let i = 0; i < 4; i++) {
      const stackEnv = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.024, 0.3), this.envCreamMat);
      stackEnv.position.set(0.68, 1.12 + i * 0.026, 0.24);
      stackEnv.rotation.y = 0.08 * i - 0.12;
      this.deskExtraGroup.add(stackEnv);
    }

    // ===== 6. Hanging Green-Shade Ceiling Lamp + Wall Fairy-Bulb Garland =====
    const ceilLamp = new THREE.Group();
    ceilLamp.position.set(0, 5.55, -0.8);
    this.worldGroup.add(ceilLamp);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1512 })
    );
    cord.position.y = 0.6;
    ceilLamp.add(cord);
    const cShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.32, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x2c5c47,
        roughness: 0.45,
        metalness: 0.25,
        side: THREE.DoubleSide,
      })
    );
    ceilLamp.add(cShade);
    const cBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8 })
    );
    cBulb.position.y = -0.14;
    ceilLamp.add(cBulb);
    this.ceilingGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffd288,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.ceilingGlow.position.set(0, -0.18, 0);
    this.ceilingGlow.scale.set(3.8, 3.8, 1);
    ceilLamp.add(this.ceilingGlow);

    // Wall fairy-bulb garland (garlandLamp upgrade)
    this.worldGroup.add(this.garlandGroup);
    const garlR = R - 0.18;
    const swags = 5;
    const aStart = openHalf + 0.18;
    const aEnd = Math.PI * 2 - openHalf - 0.18;
    const bulbColors = [0xffdf94, 0xffbe6b, 0xfff3cc];
    for (let s = 0; s < swags; s++) {
      const sa = aStart + ((aEnd - aStart) * s) / swags;
      const sb = aStart + ((aEnd - aStart) * (s + 1)) / swags;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const a = sa + (sb - sa) * u;
        pts.push(new THREE.Vector3(Math.sin(a) * garlR, 4.95 - Math.sin(u * Math.PI) * 0.55, Math.cos(a) * garlR));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wire = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 14, 0.014, 6, false),
        new THREE.MeshStandardMaterial({ color: 0x1d1612 })
      );
      this.garlandGroup.add(wire);

      for (let i = 2; i <= 8; i += 2) {
        const p = pts[i];
        const col = bulbColors[(i + s) % bulbColors.length];
        const bMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.068, 8, 8),
          new THREE.MeshBasicMaterial({ color: col })
        );
        bMesh.position.set(p.x, p.y - 0.07, p.z);
        this.garlandGroup.add(bMesh);
        const bSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowTex,
            color: col,
            transparent: true,
            opacity: 0.62,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        bSprite.position.set(p.x, p.y - 0.07, p.z);
        bSprite.scale.set(0.68, 0.68, 1);
        this.garlandGroup.add(bSprite);
        this.garlandBulbs.push({ sprite: bSprite, mesh: bMesh, phase: this.garlandBulbs.length * 1.4 });
      }
    }

    // ===== 7. Clothesline with Smoothed Letters overhead (clothesline upgrade) =====
    const ropePts: THREE.Vector3[] = [];
    const ropeZ = -1.15;
    const ropeY = 4.15;
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      ropePts.push(new THREE.Vector3(-4.9 + 9.8 * u, ropeY - Math.sin(u * Math.PI) * 0.36, ropeZ));
    }
    const ropeTube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 20, 0.018, 6, false),
      new THREE.MeshStandardMaterial({ color: 0xd0ba8e, roughness: 0.95 })
    );
    this.worldGroup.add(ropeTube);
    this.worldGroup.add(this.clotheslineExtraGroup);

    const lineWords: string[][] = [
      ['ごめんね'],
      ['ありがとう'],
      ['本当は、', '好きでした'],
      ['またね'],
      ['だいじょうぶ'],
      ['元気でいてね'],
      ['ちゃんと', '届くよ'],
    ];
    lineWords.forEach((lines, idx) => {
      const u = (idx + 0.7) / (lineWords.length + 0.4);
      const x = -4.7 + 9.4 * u;
      const y = ropeY - Math.sin(u * Math.PI) * 0.36;
      const ng = new THREE.Group();
      ng.position.set(x, y, ropeZ);
      const targetParent = idx < 3 ? this.worldGroup : this.clotheslineExtraGroup;
      targetParent.add(ng);

      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.68, 0.88),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTex(lines, 256, 320),
          roughness: 0.88,
          side: THREE.DoubleSide,
        })
      );
      paper.position.y = -0.48;
      ng.add(paper);

      [-0.2, 0.2].forEach((dx) => {
        const peg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.045), woodMat);
        peg.position.set(dx, -0.04, 0);
        ng.add(peg);
      });

      const nGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffe4aa,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      nGlow.position.set(0, -0.45, 0.08);
      nGlow.scale.set(1.2, 1.2, 1);
      ng.add(nGlow);

      this.hangingNotes.push({ group: ng, phase: idx * 1.15, glow: nGlow });
    });

    // ===== 8. Round Brass Porthole Window on Right Wall (Quiet Night Town outside) =====
    const townWindowTex = this.makeCanvasTex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#101d42');
      gr.addColorStop(1, '#30437c');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 42; i++) {
        g.fillStyle = `rgba(255,255,240,${(0.35 + rnd() * 0.65).toFixed(2)})`;
        g.fillRect(rnd() * w, rnd() * h * 0.58, 2, 2);
      }
      g.fillStyle = '#fff2c2';
      g.beginPath();
      g.arc(178, 68, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#13214a';
      g.beginPath();
      g.arc(188, 62, 19, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#090e20';
      for (let i = 0; i < 8; i++) {
        const bw = 30 + rnd() * 18;
        const bh = 55 + rnd() * 68;
        const bx = i * 32 - 4;
        g.fillRect(bx, h - bh, bw, bh);
        g.fillStyle = rnd() < 0.65 ? '#ffd178' : '#1b264d';
        for (let k = 0; k < 3; k++) {
          g.fillRect(bx + 6 + rnd() * 12, h - bh + 12 + k * 20, 7, 10);
        }
        g.fillStyle = '#090e20';
      }
    });

    const portWin = new THREE.Group();
    const winAng = Math.PI * 0.56;
    portWin.position.set(Math.sin(winAng) * (R - 0.14), 3.05, Math.cos(winAng) * (R - 0.14));
    portWin.rotation.y = winAng + Math.PI;
    this.worldGroup.add(portWin);

    portWin.add(new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.095, 12, 40), brassMat));
    const winSceneDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 40),
      new THREE.MeshBasicMaterial({ map: townWindowTex, fog: false })
    );
    winSceneDisc.position.z = -0.02;
    portWin.add(winSceneDisc);
    [0, Math.PI / 2].forEach((rz) => {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.04, 0.04), brassMat);
      mullion.rotation.z = rz;
      mullion.position.z = 0.03;
      portWin.add(mullion);
    });

    // ===== 9. Left Wall Wax-Seal & Stamp Shelf (waxShelf upgrade) =====
    this.worldGroup.add(this.waxShelfGroup);
    const shelfAng = -Math.PI * 0.62;
    const shelfG = new THREE.Group();
    shelfG.position.set(Math.sin(shelfAng) * (R - 0.45), 2.15, Math.cos(shelfAng) * (R - 0.45));
    shelfG.rotation.y = shelfAng + Math.PI;
    this.waxShelfGroup.add(shelfG);

    [0, 0.72].forEach((y) => {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 0.48), woodMat);
      plank.position.y = y;
      shelfG.add(plank);
    });
    [-1.02, 1.02].forEach((x) => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.48), woodMat);
      side.position.set(x, 0.36, 0);
      shelfG.add(side);
    });
    // Wax sticks, stamps, colorful stamp sheet, envelope stacks
    [-0.72, -0.44].forEach((x, i) => {
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10),
        i === 0 ? this.waxRedMat : new THREE.MeshStandardMaterial({ color: 0x2f5494, roughness: 0.45 })
      );
      stick.rotation.z = Math.PI / 2 - 0.18 * i;
      stick.position.set(x, 0.14, 0.04);
      shelfG.add(stick);
    });
    const stampSheetTex = this.makeCanvasTex(128, 96, (g, w, h) => {
      g.fillStyle = '#efe6cf';
      g.fillRect(0, 0, w, h);
      const cols = ['#c9453a', '#3a6aa8', '#4a8a5a', '#d8a83a'];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          g.fillStyle = cols[(r + c) % 4];
          g.fillRect(8 + c * 28, 8 + r * 27, 22, 20);
        }
      }
    });
    const stampSheet = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.34),
      new THREE.MeshStandardMaterial({ map: stampSheetTex, roughness: 0.85 })
    );
    stampSheet.rotation.set(-Math.PI / 2, 0, 0.15);
    stampSheet.position.set(0.12, 0.05, 0.04);
    shelfG.add(stampSheet);
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.26), this.envCreamMat);
      e.position.set(0.7, 0.05 + i * 0.028, 0);
      shelfG.add(e);
    }

    // ===== 10. Cozy Armchair, Round Glasses, Cap & Potted Plants (glassesChair upgrade) =====
    this.worldGroup.add(this.chairPlantsGroup);
    const chairG = new THREE.Group();
    chairG.position.set(-4.05, 0, -2.25);
    chairG.rotation.y = 0.72;
    this.chairPlantsGroup.add(chairG);
    const velvetMat = new THREE.MeshStandardMaterial({ color: 0xc28a32, roughness: 0.92 });
    const velvetDark = new THREE.MeshStandardMaterial({ color: 0x9b6b20, roughness: 0.94 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.98), velvetDark);
    seat.position.y = 0.32;
    chairG.add(seat);
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), velvetMat);
    cushion.scale.set(1.05, 0.38, 0.92);
    cushion.position.set(0, 0.48, 0.04);
    chairG.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.88, 0.22), velvetMat);
    back.position.set(0, 0.88, -0.4);
    back.rotation.x = -0.16;
    chairG.add(back);
    [-0.56, 0.56].forEach((ax) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.46, 0.92), velvetDark);
      arm.position.set(ax, 0.58, 0);
      chairG.add(arm);
    });

    // Potted green plants flanking the study
    const addPlant = (px: number, pz: number, scale = 1) => {
      const pg = new THREE.Group();
      pg.position.set(px, 0, pz);
      pg.scale.setScalar(scale);
      this.chairPlantsGroup.add(pg);
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.22, 0.44, 16),
        new THREE.MeshStandardMaterial({ color: 0xb8623a, roughness: 0.82 })
      );
      pot.position.y = 0.22;
      pg.add(pot);
      const leafMats = [0x2f6a3f, 0x3f8a4f, 0x275a38].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 })
      );
      for (let i = 0; i < 10; i++) {
        const a = i * 2.3;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), leafMats[i % 3]);
        leaf.scale.set(0.55, 2.2, 0.24);
        leaf.position.set(Math.sin(a) * 0.16, 0.62 + (i % 3) * 0.14, Math.cos(a) * 0.16);
        leaf.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
        pg.add(leaf);
      }
    };
    addPlant(-4.65, -0.75, 1.08);
    addPlant(4.65, -1.2, 0.96);

    // ===== 11. Bookshelf, Framed Botanical & Stamp Art, Wall Clock & Parcels (bookshelfWindow upgrade) =====
    this.worldGroup.add(this.bookshelfFramesGroup);
    const bkAng = Math.PI - 0.56;
    const bkG = new THREE.Group();
    bkG.position.set(Math.sin(bkAng) * (R - 0.52), 0, Math.cos(bkAng) * (R - 0.52));
    bkG.rotation.y = bkAng + Math.PI;
    this.bookshelfFramesGroup.add(bkG);

    const bkW = 1.6;
    const bkH = 3.2;
    const bkD = 0.45;
    [-1, 1].forEach((s) => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, bkH, bkD), darkWoodMat);
      side.position.set(s * (bkW / 2 - 0.035), bkH / 2, 0);
      bkG.add(side);
    });
    const bkBack = new THREE.Mesh(
      new THREE.BoxGeometry(bkW, bkH, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x24140a, roughness: 0.9 })
    );
    bkBack.position.set(0, bkH / 2, -bkD / 2 + 0.02);
    bkG.add(bkBack);
    const bookColors = [0x9a2f2a, 0x2f5a4a, 0xd9a441, 0x2b3f66, 0xe8dcc0, 0x6b3a5a, 0xc9703a];
    const bookMats = bookColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78 }));
    [0.1, 0.78, 1.46, 2.14, 2.82, 3.16].forEach((sy, sIdx) => {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(bkW, 0.06, bkD), darkWoodMat);
      sh.position.y = sy;
      bkG.add(sh);
      if (sIdx < 5) {
        let bx = -bkW / 2 + 0.1;
        while (bx < bkW / 2 - 0.18) {
          const bw = 0.07 + rnd() * 0.07;
          const bh = 0.38 + rnd() * 0.18;
          const book = new THREE.Mesh(
            new THREE.BoxGeometry(bw, bh, 0.3),
            bookMats[Math.floor(rnd() * bookMats.length)]
          );
          book.position.set(bx + bw / 2, sy + 0.03 + bh / 2, -0.02);
          bkG.add(book);
          bx += bw + 0.015;
        }
      }
    });

    // Brass Wall Clock & Framed Art behind desk
    const clockTex = this.makeCanvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#f4ecd6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a2616';
      for (let i = 0; i < 12; i++) {
        g.save();
        g.translate(64, 64);
        g.rotate((i / 12) * Math.PI * 2);
        g.fillRect(-2, -54, 4, i % 3 === 0 ? 14 : 8);
        g.restore();
      }
      g.fillStyle = '#261812';
      g.fillRect(62, 24, 4, 40);
      g.fillRect(62, 62, 32, 4);
    });
    const clockG = new THREE.Group();
    const clkAng = Math.PI + 0.38;
    clockG.position.set(Math.sin(clkAng) * (R - 0.18), 3.45, Math.cos(clkAng) * (R - 0.18));
    clockG.rotation.y = clkAng + Math.PI;
    this.bookshelfFramesGroup.add(clockG);
    clockG.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 32), brassMat));
    clockG.add(
      new THREE.Mesh(
        new THREE.CircleGeometry(0.4, 32),
        new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.7 })
      )
    );

    // Kraft parcels near right wall
    const kraftMat = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.88 });
    const twineMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const addParcel = (x: number, y: number, z: number, w: number, h: number, d: number, ry: number) => {
      const pg = new THREE.Group();
      pg.position.set(x, y, z);
      pg.rotation.y = ry;
      this.bookshelfFramesGroup.add(pg);
      pg.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kraftMat)).position.y = h / 2;
      pg.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.015, h + 0.015, 0.03), twineMat)).position.y = h / 2;
      pg.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, h + 0.015, d + 0.015), twineMat)).position.y = h / 2;
    };
    addParcel(4.1, 0, 2.25, 0.82, 0.48, 0.62, -0.35);
    addParcel(4.12, 0.48, 2.25, 0.56, 0.34, 0.46, 0.2);

    // ===== 12. Wall Handwritten Notes & Scattered Background Envelopes =====
    const wallWords = ['ごめんね', 'ありがとう', 'すき', 'またね', 'だいじょうぶ', 'ずっと'];
    for (let i = 0; i < 20; i++) {
      const a = openHalf + 0.35 + rnd() * (arcLen - 0.7);
      if (Math.abs(a - winAng) < 0.32) continue;
      const ny = 2.25 + rnd() * 2.15;
      const note = new THREE.Mesh(
        new THREE.PlaneGeometry(0.44 + rnd() * 0.14, 0.34 + rnd() * 0.1),
        new THREE.MeshStandardMaterial({
          map: this.makePaperTex([wallWords[i % wallWords.length]], 160, 120),
          roughness: 0.9,
          side: THREE.DoubleSide,
        })
      );
      note.position.set(Math.sin(a) * (R - 0.1), ny, Math.cos(a) * (R - 0.1));
      note.rotation.set(0, a + Math.PI, (rnd() - 0.5) * 0.28);
      this.worldGroup.add(note);
    }

    // Pile of unopened envelopes at Spot 1 (left floor pile)
    const envPalette = [0xf2e8cf, 0xf6dad6, 0xdbe7f4, 0xeee5c4];
    const envMats = envPalette.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88 }));
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * 0.85;
      const lay = Math.floor(i / 6);
      const env = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.022, 0.22), envMats[i % envMats.length]);
      env.position.set(-3.05 + Math.cos(a) * rr, 0.02 + lay * 0.025, 0.95 + Math.sin(a) * rr * 0.8);
      env.rotation.y = rnd() * Math.PI;
      this.worldGroup.add(env);
    }

    // ===== 13. Build 4 Interactive Writing Spots (LETTER_DESK_SPOTS) =====
    this.buildInteractiveSpots(brassMat, woodMat);

    // ===== 14. Floating Ambient Letters & Golden Study Dust =====
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.016, 0.2), envMats[i % envMats.length]);
      this.worldGroup.add(m);
      this.fallingDecorLetters.push({
        mesh: m,
        phase: i / 8,
        angle: i * 1.9,
        radius: 0.35 + rnd() * 0.85,
      });
    }

    const dustCount = 120;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * (R - 0.8);
      const bx = Math.sin(a) * rr;
      const by = 0.4 + rnd() * 5.6;
      const bz = Math.cos(a) * rr;
      this.dustBase.push([bx, by, bz, rnd() * Math.PI * 2]);
      dustPositions[i * 3] = bx;
      dustPositions[i * 3 + 1] = by;
      dustPositions[i * 3 + 2] = bz;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        color: 0xffe6b2,
        size: 0.14,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.worldGroup.add(this.dustPoints);
  }

  private buildInteractiveSpots(
    brassMat: THREE.Material,
    woodMat: THREE.Material
  ): void {
    const dimColor = new THREE.Color(0x88a8e8);
    const litColor = new THREE.Color(0xffd27a);

    LETTER_DESK_SPOTS.forEach((spot, idx) => {
      const group = new THREE.Group();
      group.position.set(spot.x, 0, spot.z);
      this.worldGroup.add(group);

      // Small rustic pedestal/mat for non-desk spots so each spot has tactile presence
      if (idx === 2) {
        // Window letter side-table
        const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.48, 0.56, 18), woodMat);
        tbl.position.y = 0.28;
        group.add(tbl);
      } else if (idx === 3) {
        // Wooden stool under the clothesline
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18), woodMat);
        seat.position.y = 0.42;
        group.add(seat);
        for (let l = 0; l < 3; l++) {
          const la = (l / 3) * Math.PI * 2;
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 0.42, 8), woodMat);
          leg.position.set(Math.cos(la) * 0.26, 0.21, Math.sin(la) * 0.26);
          group.add(leg);
        }
      }

      // Floor base ring (subtle moonlight blue when dim, warm gold when lit)
      const ringBg = new THREE.Mesh(
        new THREE.RingGeometry(0.74, 0.92, 40),
        new THREE.MeshBasicMaterial({
          color: 0x4b6496,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ringBg.rotation.x = -Math.PI / 2;
      ringBg.position.y = 0.03;
      group.add(ringBg);

      const ringFill = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 0.95, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ringFill.rotation.x = -Math.PI / 2;
      ringFill.position.y = 0.042;
      group.add(ringFill);

      // Hovering letter envelope above the spot
      const letterY = idx === 0 ? 1.38 : idx === 2 ? 0.88 : idx === 3 ? 0.8 : 0.62;
      const letterMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.04, 0.38),
        new THREE.MeshStandardMaterial({
          color: 0xf7eed8,
          roughness: 0.65,
          emissive: 0x7c5c2e,
          emissiveIntensity: 0.35,
        })
      );
      letterMesh.position.y = letterY;
      letterMesh.rotation.y = spot.rotY;
      group.add(letterMesh);

      // Red wax seal medallion on top of the letter
      const waxSealMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.025, 16),
        this.waxRedMat.clone()
      );
      waxSealMesh.position.set(0, 0.028, 0);
      letterMesh.add(waxSealMesh);

      // Brass accent trim around spot
      const brassTrim = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.018, 6, 36), brassMat);
      brassTrim.rotation.x = Math.PI / 2;
      brassTrim.position.y = 0.025;
      group.add(brassTrim);

      // Soft warm halo sprite
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffd27a,
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.set(0, letterY + 0.12, 0);
      halo.scale.set(1.5, 1.5, 1);
      group.add(halo);

      const glowLight = new THREE.PointLight(0xffcb78, 0.7, 4.2, 1.5);
      glowLight.position.set(0, letterY + 0.35, 0);
      group.add(glowLight);

      this.spotVisuals.push({
        group,
        ringFill,
        ringBg,
        letterMesh,
        waxSealMesh,
        halo,
        glowLight,
        dimColor: dimColor.clone(),
        litColor: litColor.clone(),
        pulse: 0,
      });
    });
  }

  public syncUpgrades(state: HenjiroSaveState): void {
    const u = state.upgrades;
    this.deskExtraGroup.visible = u.quillDesk >= 1;
    this.garlandGroup.visible = u.garlandLamp >= 1;
    this.clotheslineExtraGroup.visible = u.clothesline >= 1;
    this.waxShelfGroup.visible = u.waxShelf >= 1;
    this.chairPlantsGroup.visible = u.glassesChair >= 1;
    this.bookshelfFramesGroup.visible = u.bookshelfWindow >= 1;

    // Gradually illuminate more fairy garland bulbs with garlandLamp level
    const litCount = Math.min(this.garlandBulbs.length, 4 + u.garlandLamp * 4);
    this.garlandBulbs.forEach((b, i) => {
      const on = i < litCount;
      b.mesh.visible = on;
      b.sprite.visible = on;
    });
  }

  public setSpotVisualState(
    spotId: number,
    chargePct: number,
    isWriting: boolean,
    elapsed: number
  ): void {
    const v = this.spotVisuals[spotId];
    if (!v) return;
    const t = Math.max(0, Math.min(1, chargePct / 100));
    const col = v.dimColor.clone().lerp(v.litColor, t);

    const fillMat = v.ringFill.material as THREE.MeshBasicMaterial;
    fillMat.color.copy(col);
    fillMat.opacity = isWriting ? 0.92 : 0.35 + t * 0.52;
    const s = 0.65 + t * 0.42 + (isWriting ? Math.sin(elapsed * 12) * 0.06 : 0);
    v.ringFill.scale.setScalar(s);

    const bgMat = v.ringBg.material as THREE.MeshBasicMaterial;
    bgMat.color.setHex(t < 0.32 ? 0x6d92e8 : 0x7c5e3a);
    bgMat.opacity = t < 0.32 ? 0.56 + Math.sin(elapsed * 8) * 0.2 : 0.32;

    // Hovering letter gently rises and tilts while being written
    const baseY = spotId === 0 ? 1.38 : spotId === 2 ? 0.88 : spotId === 3 ? 0.8 : 0.62;
    v.letterMesh.position.y =
      baseY + Math.sin(elapsed * 2.4 + spotId * 1.4) * 0.08 + (isWriting ? 0.14 : 0);
    v.letterMesh.rotation.z = isWriting ? Math.sin(elapsed * 14) * 0.1 : Math.sin(elapsed * 1.5 + spotId) * 0.05;
    const lMat = v.letterMesh.material as THREE.MeshStandardMaterial;
    lMat.emissive.copy(col);
    lMat.emissiveIntensity = 0.18 + t * 0.62 + (isWriting ? 0.28 : 0);

    // Wax seal pops into view as charge rises
    v.waxSealMesh.scale.setScalar(0.45 + t * 0.72);

    const hMat = v.halo.material as THREE.SpriteMaterial;
    hMat.color.copy(col);
    hMat.opacity = 0.22 + t * 0.54 + (isWriting ? 0.22 : 0);
    const hs = 1.15 + t * 0.85 + (isWriting ? 0.3 : 0);
    v.halo.scale.set(hs, hs, 1);

    v.glowLight.color.copy(col);
    v.glowLight.intensity = 0.45 + t * 1.45 + (isWriting ? 0.55 : 0);

    if (v.pulse > 0) {
      v.pulse = Math.max(0, v.pulse - 0.04);
      v.letterMesh.scale.setScalar(1 + v.pulse * 0.32);
    } else {
      v.letterMesh.scale.setScalar(1);
    }
  }

  public triggerSpotCompleteFX(spotId: number): void {
    const v = this.spotVisuals[spotId];
    if (!v) return;
    v.pulse = 1;
    const spot = LETTER_DESK_SPOTS[spotId];
    this.spawnFlyingReplyLetter(new THREE.Vector3(spot.x, 1.1, spot.z), false);
    this.townFlashTimer = 1.4;
  }

  public spawnFlyingReplyLetter(origin: THREE.Vector3, toMoonShaft = false): void {
    const g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.032, 0.3), this.envCreamMat);
    g.add(env);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.024, 14), this.waxRedMat);
    seal.position.y = 0.022;
    g.add(seal);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe49e,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sp.scale.set(1.25, 1.25, 1);
    g.add(sp);
    g.position.copy(origin);
    this.worldGroup.add(g);

    const end = toMoonShaft
      ? new THREE.Vector3((Math.random() - 0.5) * 1.4, 6.8, 0.4 + (Math.random() - 0.5) * 0.8)
      : new THREE.Vector3(5.8, 3.05, -0.9 + (Math.random() - 0.5) * 0.6); // right porthole window
    const ctrl = origin
      .clone()
      .lerp(end, 0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 2.2, -0.5));

    this.flyingLetters.push({
      group: g,
      start: origin.clone(),
      ctrl,
      end,
      t: 0,
      dur: 1.05 + Math.random() * 0.3,
    });
  }

  public triggerWaxDispatchBurst(origin: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const jitter = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.6 + i * 0.08, (Math.random() - 0.5) * 0.7));
      this.spawnFlyingReplyLetter(jitter, i % 2 === 0);
    }
    this.townFlashTimer = 2.4;
    this.triggerShake(0.24, 0.14);
  }

  public triggerShake(duration: number, intensity: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public setCameraMode(mode: 'lobby' | 'play'): void {
    this.cameraMode = mode;
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.45 ? 50 : 44;
    this.camera.updateProjectionMatrix();
  }

  public screenToFloor(
    virtualX: number,
    virtualY: number,
    width: number,
    height: number,
    out: THREE.Vector3
  ): boolean {
    this.tmpNdc.set((virtualX / Math.max(1, width)) * 2 - 1, -(virtualY / Math.max(1, height)) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpNdc, this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, out) !== null;
  }

  public projectToScreen(
    worldPos: THREE.Vector3,
    width: number,
    height: number
  ): { x: number; y: number; visible: boolean } {
    const p = worldPos.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * width,
      y: (-p.y * 0.5 + 0.5) * height,
      visible: p.z < 1,
    };
  }

  public update(
    elapsed: number,
    dt: number,
    beatPhase: number,
    energy: number,
    isFever: boolean
  ): void {
    const beatPulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

    // Smooth camera transition between lobby overview and gameplay perspective
    const desiredPos =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(Math.sin(elapsed * 0.24) * 1.4, 5.2, 8.6)
        : new THREE.Vector3(0, 6.75, 8.35);
    const desiredTarget =
      this.cameraMode === 'lobby'
        ? new THREE.Vector3(0, 1.6, -1.2)
        : new THREE.Vector3(0, 0.72, -0.35);

    const k = 1 - Math.exp(-4.2 * dt);
    this.camPos.lerp(desiredPos, k);
    this.camTarget.lerp(desiredTarget, k);

    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const amp = this.shakeIntensity * (this.shakeTimer / 0.3);
      sx = (Math.random() - 0.5) * amp;
      sy = (Math.random() - 0.5) * amp;
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camTarget);

    // Warm candlelight flicker + Moonlight Reply fever illumination
    const flicker = 1 + 0.04 * Math.sin(elapsed * 6.8) + 0.025 * Math.sin(elapsed * 12.7);
    if (isFever) {
      this.scene.background = new THREE.Color(0x161932);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x161932);
      this.studyMainLight.color.setHex(0xffe6a6);
      this.studyMainLight.intensity = (3.8 + beatPulse * 1.1) * flicker;
      this.moonShaftLight.color.setHex(0xfff0be);
      this.moonShaftLight.intensity = 2.6 + beatPulse * 0.8;
      (this.moonShaftMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffe6a8);
      (this.moonShaftMesh.material as THREE.MeshBasicMaterial).opacity = 0.26 + beatPulse * 0.08;
      (this.moonSpotCircle.material as THREE.MeshBasicMaterial).color.setHex(0xffdf9a);
      (this.moonSpotCircle.material as THREE.MeshBasicMaterial).opacity = 0.52;
    } else {
      this.scene.background = new THREE.Color(0x070b18);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x070b18);
      this.studyMainLight.color.setHex(0xffbd70);
      this.studyMainLight.intensity = (2.65 + energy * 0.55) * flicker;
      this.moonShaftLight.color.setHex(0x9ec0ff);
      this.moonShaftLight.intensity = 1.5 + beatPulse * 0.35;
      (this.moonShaftMesh.material as THREE.MeshBasicMaterial).color.setHex(0xb6d0ff);
      (this.moonShaftMesh.material as THREE.MeshBasicMaterial).opacity = 0.13 + energy * 0.05;
      (this.moonSpotCircle.material as THREE.MeshBasicMaterial).color.setHex(0xa6c4ff);
      (this.moonSpotCircle.material as THREE.MeshBasicMaterial).opacity = 0.3 + beatPulse * 0.08;
    }

    this.deskLampLight.intensity = (2.1 + beatPulse * 0.4) * flicker;
    this.deskFlame.scale.set(1, 1.65 + Math.sin(elapsed * 11) * 0.18, 1);
    const cgScale = (3.6 + beatPulse * 0.45 + (isFever ? 0.9 : 0)) * flicker;
    this.ceilingGlow.scale.set(cgScale, cgScale, 1);

    // Quill gently writes on the desk
    this.quillPivot.rotation.z = -0.45 + Math.sin(elapsed * 4.4) * 0.09;
    this.quillPivot.rotation.x = 0.14 + Math.cos(elapsed * 3.1) * 0.06;

    // Clothesline notes sway gently
    for (const hn of this.hangingNotes) {
      hn.group.rotation.z = Math.sin(elapsed * 1.15 + hn.phase) * 0.065;
      hn.group.rotation.x = Math.sin(elapsed * 0.85 + hn.phase * 1.7) * 0.04;
      const mat = hn.glow.material as THREE.SpriteMaterial;
      mat.opacity = (isFever ? 0.58 : 0.24) + 0.1 * Math.sin(elapsed * 2.2 + hn.phase);
    }

    // Fairy garland bulbs twinkle
    for (const b of this.garlandBulbs) {
      if (!b.sprite.visible) continue;
      const mat = b.sprite.material as THREE.SpriteMaterial;
      mat.opacity = (isFever ? 0.88 : 0.52) + 0.22 * Math.sin(elapsed * 2.1 + b.phase);
    }

    // Distant town windows warm up when replies arrive
    if (this.townFlashTimer > 0) this.townFlashTimer = Math.max(0, this.townFlashTimer - dt);
    const townBoost = this.townFlashTimer > 0 ? Math.sin(Math.min(1, this.townFlashTimer) * Math.PI) * 0.5 : 0;
    this.townWindowSprites.forEach((ws, i) => {
      const m = ws.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, 0.48 + 0.18 * Math.sin(elapsed * 1.2 + i) + townBoost + (isFever ? 0.25 : 0));
      const s = 0.85 + townBoost * 0.65;
      ws.scale.set(s, s, 1);
    });
    this.windowGlowLight.intensity = 0.95 + townBoost * 1.8 + (isFever ? 0.8 : 0);

    // Ambient letters fluttering down through the top moonlight shaft
    for (const fl of this.fallingDecorLetters) {
      const p = (elapsed * 0.12 + fl.phase) % 1;
      fl.mesh.position.set(
        Math.sin(fl.angle + p * 5.2) * fl.radius * (1 - p * 0.25),
        6.5 - p * 6.3,
        0.55 + Math.cos(fl.angle + p * 4.4) * fl.radius * 0.8
      );
      fl.mesh.rotation.set(p * 5 + fl.angle, p * 4.2, p * 3.4);
      fl.mesh.visible = p < 0.96;
    }

    // Floating golden dust motes
    const posAttr = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.dustBase.length; i++) {
      const [bx, by, bz, ph] = this.dustBase[i];
      posAttr.setXYZ(
        i,
        bx + Math.sin(elapsed * 0.4 + ph) * 0.35,
        0.35 + ((by + elapsed * 0.18) % 5.6),
        bz + Math.cos(elapsed * 0.35 + ph) * 0.35
      );
    }
    posAttr.needsUpdate = true;

    // Flying sealed reply letters soaring to the porthole window & moonlight shaft
    for (let i = this.flyingLetters.length - 1; i >= 0; i--) {
      const fl = this.flyingLetters[i];
      fl.t += dt / fl.dur;
      if (fl.t >= 1) {
        this.worldGroup.remove(fl.group);
        this.flyingLetters.splice(i, 1);
        continue;
      }
      const u = fl.t;
      const inv = 1 - u;
      fl.group.position.set(
        inv * inv * fl.start.x + 2 * inv * u * fl.ctrl.x + u * u * fl.end.x,
        inv * inv * fl.start.y + 2 * inv * u * fl.ctrl.y + u * u * fl.end.y,
        inv * inv * fl.start.z + 2 * inv * u * fl.ctrl.z + u * u * fl.end.z
      );
      fl.group.rotation.set(Math.sin(u * 10) * 0.35, u * Math.PI * 2.5, Math.cos(u * 8) * 0.25);
      fl.group.scale.setScalar(1 - u * 0.35);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
