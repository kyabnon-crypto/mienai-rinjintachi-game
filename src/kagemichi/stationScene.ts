import * as THREE from 'three';
import { LANE_POSITIONS } from './config';
import { KagemichiSaveState } from './types';

function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.52)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function createPlatformTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#252b3b';
  g.fillRect(0, 0, 512, 512);

  // Subtle wet concrete tiles & rain sheen
  g.strokeStyle = 'rgba(12, 16, 28, 0.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = i * 128;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(512, p);
    g.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const bright = Math.random() > 0.5;
    g.fillStyle = bright ? 'rgba(205,220,255,0.045)' : 'rgba(8,10,18,0.06)';
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 28);
  return tex;
}

function createStationSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#dfe5f2';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#232c47';
  g.lineWidth = 10;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = '#232c47';
  g.fillRect(10, 182, 492, 10);
  g.textAlign = 'center';
  g.font = '700 80px "Zen Maru Gothic", sans-serif';
  g.fillText('おわりの駅', 256, 112);
  g.font = '700 34px "Zen Maru Gothic", sans-serif';
  g.fillStyle = '#3b4a73';
  g.fillText('終点  OWARI STATION', 256, 162);
  g.fillStyle = '#232c47';
  g.font = '600 28px "Zen Maru Gothic", sans-serif';
  g.fillText('つぎは・・・夢のなかへ →', 256, 228);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createClockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8ecf6';
  g.beginPath();
  g.arc(128, 128, 122, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1e263f';
  g.lineWidth = 8;
  g.stroke();

  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 === 0 ? 96 : 110;
    g.lineWidth = i % 5 === 0 ? 5 : 2;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * r1, 128 - Math.cos(a) * r1);
    g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116);
    g.stroke();
  }
  // Hands frozen just after last train: 0:40
  g.strokeStyle = '#161c30';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.sin(0.35) * 56, 128 - Math.cos(0.35) * 56);
  g.stroke();

  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.sin(-2.1) * 86, 128 - Math.cos(-2.1) * 86);
  g.stroke();

  g.fillStyle = '#c99346';
  g.beginPath();
  g.arc(128, 128, 8, 0, Math.PI * 2);
  g.fill();

  return new THREE.CanvasTexture(c);
}

interface ScrolledChunk {
  group: THREE.Group;
  z: number;
  lampGlow: THREE.Sprite;
  boothWinMat: THREE.MeshStandardMaterial;
  extraLampGroup: THREE.Group;
}

export class StationScene {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public worldGroup = new THREE.Group();
  public glowTex: THREE.CanvasTexture;

  private platformTex: THREE.CanvasTexture;
  private chunks: ScrolledChunk[] = [];
  private chunkSpacing = 18;
  private chunkCount = 7;

  private railLeftMat!: THREE.MeshStandardMaterial;
  private railRightMat!: THREE.MeshStandardMaterial;
  private laneGuideMats: THREE.MeshBasicMaterial[] = [];

  private dreamTrain = new THREE.Group();
  private trainWinMat!: THREE.MeshStandardMaterial;
  private trainHeadGlow!: THREE.Sprite;
  private trainZOffset = -32;

  private starField!: THREE.Points;
  private starBasePos: Float32Array = new Float32Array(0);
  private moonGroup = new THREE.Group();
  private moonGlow!: THREE.Sprite;
  private ambientLight!: THREE.HemisphereLight;
  private moonDirLight!: THREE.DirectionalLight;
  private fogExp!: THREE.FogExp2;

  private dreamBeamParticles: Array<{
    sprite: THREE.Sprite;
    vel: THREE.Vector3;
    life: number;
    maxLife: number;
  }> = [];

  private camMode: 'lobby' | 'run' = 'lobby';
  private camBlend = 0;
  private camTargetX = 0;
  private shakeAmp = 0;
  private scrollDistance = 0;
  private upgradeState = {
    lantern: 0,
    sortingShelf: 0,
    clock: 0,
    jarShelf: 0,
    streetlamp: 0,
    memoryBox: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d1b);
    this.fogExp = new THREE.FogExp2(0x0a0f20, 0.0155);
    this.scene.fog = this.fogExp;

    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 180);
    this.camera.position.set(1.9, 2.0, 5.2);
    this.camera.lookAt(0, 1.35, -1.5);

    this.glowTex = createGlowTexture();
    this.platformTex = createPlatformTexture();
    this.scene.add(this.worldGroup);

    this.setupLights();
    this.buildSkyAndMoon();
    this.buildBasePlatformAndTracks();
    this.buildScrollingStationChunks();
    this.buildDreamTrain();
  }

  private setupLights(): void {
    this.ambientLight = new THREE.HemisphereLight(0x8da4d6, 0x111524, 0.55);
    this.scene.add(this.ambientLight);

    this.moonDirLight = new THREE.DirectionalLight(0xa8c2f0, 0.65);
    this.moonDirLight.position.set(-14, 24, -22);
    this.scene.add(this.moonDirLight);

    const fill = new THREE.DirectionalLight(0xffcb8a, 0.25);
    fill.position.set(8, 6, 12);
    this.scene.add(fill);
  }

  private buildSkyAndMoon(): void {
    // Glowing crescent/full moon above the horizon of the endless railway
    this.moonGroup.position.set(11, 21, -92);
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4.4, 28, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff5db, fog: false })
    );
    this.moonGroup.add(moonMesh);

    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xdbe7ff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonGlow.scale.set(28, 28, 1);
    this.moonGroup.add(this.moonGlow);
    this.scene.add(this.moonGroup);

    // Distant night city skyline lights
    const cityGroup = new THREE.Group();
    cityGroup.position.set(0, -1, -108);
    const bldMat = new THREE.MeshBasicMaterial({ color: 0x101629, fog: false });
    const winWarm = new THREE.MeshBasicMaterial({ color: 0xffd28e, fog: false });
    const winCool = new THREE.MeshBasicMaterial({ color: 0x9ab8ee, fog: false });
    for (let i = -18; i <= 18; i++) {
      if (Math.abs(i) < 2) continue;
      const w = 2.4 + ((Math.abs(i * 17) % 5) * 0.55);
      const h = 5 + ((Math.abs(i * 31) % 13) * 1.1);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), bldMat);
      b.position.set(i * 4.4, h * 0.5 - 2, (i % 3) * 3);
      cityGroup.add(b);
      if (i % 2 === 0) {
        const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), i % 4 === 0 ? winWarm : winCool);
        dot.position.set(b.position.x, h * 0.7 - 1.5, b.position.z + 1.6);
        cityGroup.add(dot);
      }
    }
    this.scene.add(cityGroup);

    // Starfield + drifting dream motes
    const starCount = 260;
    const positions = new Float32Array(starCount * 3);
    this.starBasePos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const x = (Math.random() - 0.5) * 90;
      const y = 1.5 + Math.random() * 34;
      const z = 8 - Math.random() * 125;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this.starBasePos[i * 3] = x;
      this.starBasePos[i * 3 + 1] = y;
      this.starBasePos[i * 3 + 2] = z;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        map: this.glowTex,
        color: 0xe6efff,
        size: 0.42,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.scene.add(this.starField);
  }

  private buildBasePlatformAndTracks(): void {
    // Wide wet platform deck supporting all 3 lanes (-2.25, 0, +2.25)
    const platMat = new THREE.MeshStandardMaterial({
      map: this.platformTex,
      roughness: 0.42,
      metalness: 0.14,
    });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.8, 150), platMat);
    platform.position.set(-0.3, -0.4, -58);
    platform.receiveShadow = true;
    this.worldGroup.add(platform);

    // Yellow tactile safety paving strip near platform edge (right side)
    const tactileMat = new THREE.MeshStandardMaterial({
      color: 0xd9b84e,
      emissive: 0x3b2c0a,
      emissiveIntensity: 0.35,
      roughness: 0.72,
    });
    const tactile = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 150), tactileMat);
    tactile.position.set(3.45, 0.012, -58);
    this.worldGroup.add(tactile);

    // Subtle white safety line
    const whiteLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.015, 150),
      new THREE.MeshBasicMaterial({ color: 0xb9c5dc, transparent: true, opacity: 0.55 })
    );
    whiteLine.position.set(3.85, 0.01, -58);
    this.worldGroup.add(whiteLine);

    // Subtle lane glow strips for crystal-clear readability
    LANE_POSITIONS.forEach((lx) => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8ea9dc,
        transparent: true,
        opacity: 0.14,
      });
      this.laneGuideMats.push(mat);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 140), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(lx, 0.016, -56);
      this.worldGroup.add(strip);
    });

    // Track bed (right side of platform)
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.4, 150),
      new THREE.MeshStandardMaterial({ color: 0x131722, roughness: 0.95 })
    );
    ballast.position.set(7.4, -0.95, -58);
    this.worldGroup.add(ballast);

    // Twin steel rails (light up into golden-silver Invisible Rails during DREAM EXPRESS!)
    this.railLeftMat = new THREE.MeshStandardMaterial({
      color: 0x8e99ad,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x1d2d52,
      emissiveIntensity: 0.25,
    });
    this.railRightMat = this.railLeftMat.clone();

    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 150), this.railLeftMat);
    railL.position.set(5.45, -0.68, -58);
    this.worldGroup.add(railL);

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 150), this.railRightMat);
    railR.position.set(7.25, -0.68, -58);
    this.worldGroup.add(railR);

    // Platform roof canopy beams (left side overhang)
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x262e42, metalness: 0.6, roughness: 0.45 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.16, 150), steelMat);
    canopy.position.set(-4.2, 5.2, -58);
    canopy.rotation.z = -0.08;
    this.worldGroup.add(canopy);
  }

  private buildScrollingStationChunks(): void {
    const signTex = createStationSignTexture();
    const clockTex = createClockTexture();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x343e54, metalness: 0.65, roughness: 0.42 });
    const wallUpperMat = new THREE.MeshStandardMaterial({ color: 0x454f64, roughness: 0.88 });
    const wallLowerMat = new THREE.MeshStandardMaterial({ color: 0x1a223a, roughness: 0.72 });
    const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x383e4e, roughness: 0.65 });
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 0.92 });

    for (let i = 0; i < this.chunkCount; i++) {
      const g = new THREE.Group();
      const z = 12 - i * this.chunkSpacing;
      g.position.z = z;

      // Railway sleepers inside this chunk
      for (let s = 0; s < 12; s++) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.24), sleeperMat);
        tie.position.set(6.35, -0.74, -s * 1.5);
        g.add(tie);
      }

      // Canopy pillar
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 5.2, 10), steelMat);
      pillar.position.set(-4.35, 2.6, 0);
      g.add(pillar);

      // Cold station streetlamp on platform left edge
      const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8), steelMat);
      lampPost.position.set(-4.1, 2.3, -6);
      g.add(lampPost);
      const lampBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xd9e8ff })
      );
      lampBulb.position.set(-4.1, 4.65, -6);
      g.add(lampBulb);

      const lampGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0x9cb8f0,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        })
      );
      lampGlow.scale.set(3.4, 3.4, 1);
      lampGlow.position.set(-4.1, 4.65, -6);
      g.add(lampGlow);

      // Station office booth (カゲミチの詰め所) on left wall
      const boothWinMat = new THREE.MeshStandardMaterial({
        color: 0xffd79e,
        emissive: 0xffb865,
        emissiveIntensity: 0.55,
        roughness: 0.25,
      });

      if (i % 2 === 0) {
        const wallUp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.6, 8.2), wallUpperMat);
        wallUp.position.set(-5.25, 2.8, -2);
        g.add(wallUp);
        const wallLow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.35, 8.2), wallLowerMat);
        wallLow.position.set(-5.22, 0.68, -2);
        g.add(wallLow);

        // Warm lit window looking into Kagemichi's office
        const win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.75), boothWinMat);
        win.position.set(-4.97, 2.35, -2);
        win.rotation.y = Math.PI / 2;
        g.add(win);

        // Window mullion frame
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 4.6), steelMat);
        frameTop.position.set(-4.96, 3.25, -2);
        g.add(frameTop);
        const frameBot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 4.6), steelMat);
        frameBot.position.set(-4.92, 1.45, -2);
        g.add(frameBot);

        // Station clock (0:40) mounted near office
        const clockFrame = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.06, 8, 24), steelMat);
        clockFrame.position.set(-4.45, 3.85, 1.5);
        clockFrame.rotation.y = Math.PI / 2;
        g.add(clockFrame);
        const clockFace = new THREE.Mesh(
          new THREE.CircleGeometry(0.46, 24),
          new THREE.MeshBasicMaterial({ map: clockTex })
        );
        clockFace.position.set(-4.42, 3.85, 1.5);
        clockFace.rotation.y = Math.PI / 2;
        g.add(clockFace);
      } else {
        // Station sign "おわりの駅 — つぎは・・・夢のなかへ →"
        const signPostA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8), steelMat);
        signPostA.position.set(-4.35, 1.65, -1.2);
        g.add(signPostA);
        const signPostB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8), steelMat);
        signPostB.position.set(-4.35, 1.65, -3.6);
        g.add(signPostB);
        const signBoard = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 1.3),
          new THREE.MeshStandardMaterial({
            map: signTex,
            emissive: 0xdbe6ff,
            emissiveMap: signTex,
            emissiveIntensity: 0.32,
            roughness: 0.55,
          })
        );
        signBoard.position.set(-4.3, 2.85, -2.4);
        signBoard.rotation.y = Math.PI / 2;
        g.add(signBoard);

        // Waiting bench
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 2.2), benchWoodMat);
        seat.position.set(-4.15, 0.5, -2.4);
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 2.2), benchWoodMat);
        back.position.set(-4.42, 0.82, -2.4);
        g.add(back);
      }

      // Upgradeable extra warm lantern post on right track side (appears when streetlamp upgraded!)
      const extraLampGroup = new THREE.Group();
      const rPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8), steelMat);
      rPost.position.set(8.8, 1.4, -3);
      extraLampGroup.add(rPost);
      const rOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd79b })
      );
      rOrb.position.set(8.8, 3.6, -3);
      extraLampGroup.add(rOrb);
      const rGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffbe6b,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        })
      );
      rGlow.scale.set(3.2, 3.2, 1);
      rGlow.position.set(8.8, 3.6, -3);
      extraLampGroup.add(rGlow);
      extraLampGroup.visible = false;
      g.add(extraLampGroup);

      this.worldGroup.add(g);
      this.chunks.push({ group: g, z, lampGlow, boothWinMat, extraLampGroup });
    }
  }

  private buildDreamTrain(): void {
    this.dreamTrain.position.set(6.35, -0.58, this.trainZOffset);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a233d,
      metalness: 0.45,
      roughness: 0.38,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xdcb46b,
      metalness: 0.72,
      roughness: 0.28,
    });
    this.trainWinMat = new THREE.MeshStandardMaterial({
      color: 0xffe4b3,
      emissive: 0xffc66e,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    // 2 articulated glowing vintage dream carriages
    for (let car = 0; car < 2; car++) {
      const cz = -car * 17.6;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 16.6), bodyMat);
      hull.position.set(0, 1.55, cz);
      this.dreamTrain.add(hull);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.28, 16.4), trimMat);
      roof.position.set(0, 3.08, cz);
      this.dreamTrain.add(roof);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.16, 16.62), trimMat);
      stripe.position.set(0, 0.82, cz);
      this.dreamTrain.add(stripe);

      // Warm illuminated windows facing the platform (-X)
      for (let w = 0; w < 7; w++) {
        const wz = cz - 6.3 + w * 2.1;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.92), this.trainWinMat);
        win.position.set(-1.26, 1.95, wz);
        win.rotation.y = -Math.PI / 2;
        this.dreamTrain.add(win);
      }
    }

    // Front headlight glow (pointing forward -Z)
    this.trainHeadGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe2a8,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    this.trainHeadGlow.scale.set(6.5, 6.5, 1);
    this.trainHeadGlow.position.set(-0.6, 1.8, -26.5);
    this.dreamTrain.add(this.trainHeadGlow);

    this.worldGroup.add(this.dreamTrain);
  }

  public setCameraMode(mode: 'lobby' | 'run'): void {
    this.camMode = mode;
  }

  public setFocusX(x: number): void {
    this.camTargetX = x;
  }

  public triggerShake(amount = 0.22): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  public spawnDreamAscendBurst(origin: THREE.Vector3): void {
    const colors = [0xffcf82, 0xfff0a6, 0xd9e8ff, 0xffb39e];
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: colors[i % colors.length],
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      const scale = 0.45 + Math.random() * 0.65;
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(origin);
      sprite.position.y += 0.9;
      this.worldGroup.add(sprite);

      const angle = (i / 24) * Math.PI * 2;
      this.dreamBeamParticles.push({
        sprite,
        vel: new THREE.Vector3(
          Math.cos(angle) * (1.8 + Math.random() * 2.5) + 0.9,
          4.2 + Math.random() * 4.5,
          -6.0 - Math.random() * 6.0
        ),
        life: 0,
        maxLife: 1.2 + Math.random() * 0.65,
      });
    }
  }

  public syncUpgrades(state: KagemichiSaveState): void {
    this.upgradeState = { ...state.upgrades };
    const lampLv = state.upgrades.streetlamp;
    const boxLv = state.upgrades.memoryBox;
    const jarLv = state.upgrades.jarShelf;

    this.chunks.forEach((ch, idx) => {
      ch.extraLampGroup.visible = lampLv > 0 && idx % Math.max(1, 3 - Math.floor(lampLv / 2)) === 0;
      ch.boothWinMat.emissiveIntensity = 0.45 + boxLv * 0.16 + jarLv * 0.08;
    });
  }

  public resize(width: number, height: number): void {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    this.camera.aspect = safeW / safeH;
    this.camera.fov = safeW / safeH < 1.35 ? 60 : 53;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeW, safeH, false);
  }

  public update(
    elapsed: number,
    dt: number,
    scrollSpeed: number,
    beatPhase: number,
    energy: number,
    isExpress: boolean
  ): void {
    const beatPulse = Math.pow(1 - beatPhase, 2.8);

    // Scroll platform texture and station chunks seamlessly
    const moveZ = scrollSpeed * dt;
    this.scrollDistance += moveZ;
    this.platformTex.offset.y = -(this.scrollDistance * 0.145) % 1;

    const totalLen = this.chunkCount * this.chunkSpacing;
    for (const ch of this.chunks) {
      ch.z += moveZ;
      if (ch.z > 22) {
        ch.z -= totalLen;
      }
      ch.group.position.z = ch.z;

      const lampScale = (isExpress ? 4.4 : 3.2) + beatPulse * 0.65 + this.upgradeState.streetlamp * 0.25;
      ch.lampGlow.scale.set(lampScale, lampScale, 1);
      (ch.lampGlow.material as THREE.SpriteMaterial).color.setHex(isExpress ? 0xffd799 : 0x9cb8f0);
    }

    // Invisible Rails & Lane Guides glow dramatically during DREAM EXPRESS
    this.railLeftMat.emissive.setHex(isExpress ? 0xffc66e : 0x1d2d52);
    this.railLeftMat.emissiveIntensity = isExpress ? 1.15 + beatPulse * 0.7 : 0.22 + beatPulse * 0.2;
    this.railRightMat.emissive.copy(this.railLeftMat.emissive);
    this.railRightMat.emissiveIntensity = this.railLeftMat.emissiveIntensity;

    this.laneGuideMats.forEach((mat) => {
      mat.color.setHex(isExpress ? 0xffd58e : 0x8ea9dc);
      mat.opacity = isExpress ? 0.34 + beatPulse * 0.15 : 0.12 + beatPulse * 0.05;
    });

    // Dream Express Train glides alongside platform during fever, rests subtly in distance otherwise
    const targetTrainZ = isExpress ? 2.5 + Math.sin(elapsed * 1.4) * 1.8 : -44;
    this.trainZOffset += (targetTrainZ - this.trainZOffset) * Math.min(1, dt * (isExpress ? 2.2 : 1.1));
    this.dreamTrain.position.z = this.trainZOffset;
    this.dreamTrain.position.y = -0.58 + (isExpress ? Math.sin(elapsed * 18) * 0.025 : 0);
    this.trainWinMat.emissiveIntensity = isExpress ? 1.55 + beatPulse * 0.55 : 0.65;
    this.trainHeadGlow.scale.setScalar(isExpress ? 9.5 + beatPulse * 2 : 5.5);

    // Moon & atmosphere breathing
    const moonScale = (isExpress ? 36 : 26) + energy * 7;
    this.moonGlow.scale.set(moonScale, moonScale, 1);
    (this.moonGlow.material as THREE.SpriteMaterial).color.setHex(isExpress ? 0xffe4aa : 0xdbe7ff);
    this.fogExp.density = isExpress ? 0.011 : 0.0155;
    this.ambientLight.intensity = isExpress ? 0.85 : 0.55;

    // Starfield streams past faster during DREAM EXPRESS
    const posAttr = this.starField.geometry.getAttribute('position') as THREE.BufferAttribute;
    const starSpeed = isExpress ? 32 : scrollSpeed * 0.45;
    for (let i = 0; i < posAttr.count; i++) {
      let z = posAttr.getZ(i) + starSpeed * dt;
      if (z > 12) z -= 130;
      const bx = this.starBasePos[i * 3];
      const by = this.starBasePos[i * 3 + 1];
      posAttr.setXYZ(i, bx + Math.sin(elapsed * 0.5 + i) * 0.25, by, z);
    }
    posAttr.needsUpdate = true;

    // Dream ascend particles soaring toward the moon
    for (let i = this.dreamBeamParticles.length - 1; i >= 0; i--) {
      const p = this.dreamBeamParticles[i];
      p.life += dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.y += 2.2 * dt;
      const t = p.life / p.maxLife;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t);
      if (p.life >= p.maxLife) {
        this.worldGroup.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.dreamBeamParticles.splice(i, 1);
      }
    }

    // Smooth camera transition between Lobby (front-angle showcase) and Run (dynamic behind-shoulder runner)
    const targetBlend = this.camMode === 'run' ? 1 : 0;
    this.camBlend += (targetBlend - this.camBlend) * Math.min(1, dt * 3.8);

    const lobbyPos = new THREE.Vector3(
      2.1 + Math.sin(elapsed * 0.35) * 0.45,
      1.95 + Math.sin(elapsed * 0.55) * 0.08,
      4.65
    );
    const lobbyLook = new THREE.Vector3(-0.2, 1.3, -1.2);

    const runPos = new THREE.Vector3(
      this.camTargetX * 0.52,
      3.55 + (isExpress ? 0.3 : 0),
      6.65 + (isExpress ? 0.55 : 0)
    );
    const runLook = new THREE.Vector3(this.camTargetX * 0.35, 1.35, -9.5);

    this.camera.position.lerpVectors(lobbyPos, runPos, this.camBlend);
    const look = new THREE.Vector3().lerpVectors(lobbyLook, runLook, this.camBlend);

    if (this.shakeAmp > 0.004) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmp * 0.7;
      this.shakeAmp *= Math.pow(0.06, dt);
    } else {
      this.shakeAmp = 0;
    }

    this.camera.lookAt(look);
    this.renderer.render(this.scene, this.camera);
  }
}
