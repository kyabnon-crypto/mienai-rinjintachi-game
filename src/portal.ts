import './portal.css';

function renderSaveProgress(): void {
  const kgEl = document.getElementById('prog-kagemichi');
  if (kgEl) {
    try {
      const raw = localStorage.getItem('mienai_kagemichi_v1');
      if (raw) {
        const st = JSON.parse(raw);
        const totalLv = Object.values(st.upgrades || {}).reduce(
          (a: number, b: unknown) => a + (typeof b === 'number' ? b : 0),
          0
        );
        const rank = 1 + Math.floor(totalLv / 2);
        const tickets = Number(st.tickets || 0);
        const sent = Number(st.totalDreamsSent || 0);
        kgEl.textContent = `おわりの駅 Lv.${rank} ・ 夢の切符 ${tickets} ・ 夢送り ${sent}回`;
      }
    } catch {
      // Ignore parse errors
    }
  }

  const nmEl = document.getElementById('prog-namidabin');
  if (nmEl) {
    try {
      const raw = localStorage.getItem('namidabin_orgel_save_v1');
      if (raw) {
        const st = JSON.parse(raw);
        const totalLv = Object.values(st.upgrades || {}).reduce(
          (a: number, b: unknown) => a + (typeof b === 'number' ? b : 0),
          0
        );
        const rank = 1 + Math.floor(totalLv / 2);
        const gems = Number(st.gems || 0);
        const crafted = Number(st.totalGemsCrafted || 0);
        nmEl.textContent = `涙蔵 Lv.${rank} ・ 涙の宝石 ${gems} ・ 昇華 ${crafted}個`;
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function startStarCanvas(): void {
  const canvas = document.getElementById('sky-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  let w = window.innerWidth;
  let h = window.innerHeight;

  const stars = Array.from({ length: 110 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.9,
    warm: Math.random() < 0.25,
  }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const draw = (now: number) => {
    requestAnimationFrame(draw);
    const t = now * 0.001;
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.fillStyle = s.warm
        ? `rgba(255, 214, 150, ${alpha.toFixed(3)})`
        : `rgba(212, 226, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  requestAnimationFrame(draw);
}

renderSaveProgress();
startStarCanvas();
