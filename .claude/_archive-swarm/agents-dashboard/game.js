/**
 * game.js v4 — Agent HQ auto-sincronizado con Claude Code
 *
 * Cambios sobre v3 (pedido Brandon 2026-04-08):
 *   - ❌ Quitados botones "Lanzar" y "Volver" — todo es automático
 *   - ✅ Detección automática de commits nuevos (head hash cambió) →
 *         lanza agent team solo con los agentes inferidos del commit
 *   - ✅ Sprites más humanos (cabeza redonda, nariz, orejas, pelo definido)
 *   - ✅ Idle TOTALMENTE inmóvil (sin arms ni bob)
 *   - ✅ Nameplate de oficina sin texto (solo banda decorativa)
 *   - ✅ File labels muestran solo basename (route.ts, page.tsx)
 *   - ✅ Web Audio API con 4 tonos configurables (entrada/salida/completion)
 *   - ✅ Modal de completion al terminar el team
 *   - ✅ Modo día/noche con toggle + localStorage
 *   - ✅ 15 mesas en War Room (del v3)
 *   - ✅ Conectado a /api/state (del v3)
 */

/* global PIXI, gsap */

// ─── Agents catalog ──────────────────────────────────────────────────────────

const AGENTS = [
  { id: "initiative-orchestrator",  name: "Initiative Orchestrator",  shortRole: "Meta",          area: "orch",   special: true },
  { id: "director-orchestrator",    name: "Director",                 shortRole: "Coordina",      area: "orch"   },
  { id: "solution-architect",       name: "Architect",                shortRole: "Arquitectura",  area: "orch"   },
  { id: "database-engineer",        name: "Database Eng.",            shortRole: "Base de datos", area: "db"     },
  { id: "migration-planner",        name: "Migration",                shortRole: "Migra",         area: "db"     },
  { id: "backend-platform-engineer",name: "Backend Eng.",             shortRole: "Backend",       area: "back"   },
  { id: "frontend-engineer",        name: "Frontend Eng.",            shortRole: "Frontend",      area: "front"  },
  { id: "checkout-specialist",      name: "Checkout Specialist",      shortRole: "Pagos",         area: "front"  },
  { id: "mobile-engineer",          name: "Mobile Eng.",              shortRole: "Mobile",        area: "mobile" },
  { id: "product-uiux-strategist",  name: "UX Strategist",            shortRole: "UX",            area: "prod"   },
  { id: "qa-reliability-engineer",  name: "QA Eng.",                  shortRole: "Tests",         area: "qa"     },
  { id: "bug-hunter",               name: "Bug Hunter",               shortRole: "Bugs",          area: "qa"     },
  { id: "code-reviewer",            name: "Code Reviewer",            shortRole: "Review",        area: "qa"     },
  { id: "security-auditor",         name: "Security Auditor",         shortRole: "Seguridad",     area: "sec"    },
  { id: "refactoring-expert",       name: "Refactor",                 shortRole: "Refactor",      area: "qa"     },
  { id: "integration-specialist",   name: "Integration",              shortRole: "Integraciones", area: "integ"  },
  { id: "devops-release-engineer",  name: "DevOps",                   shortRole: "Deploy",        area: "devops" },
  { id: "performance-engineer",     name: "Performance",              shortRole: "Perf",          area: "perf"   },
  { id: "data-analyst",             name: "Data Analyst",             shortRole: "Datos",         area: "data"   },
];

const AREA_COLORS = {
  orch:   { shirt: 0x00b4a6, pants: 0x005e58, accent: 0xf97316, wall: 0x162b2a, skin: 0xfbcfa0, hair: 0x1f2937 },
  db:     { shirt: 0x2dd4bf, pants: 0x115e59, accent: 0x67e8f9, wall: 0x0d2524, skin: 0xfbcfa0, hair: 0x451a03 },
  back:   { shirt: 0x60a5fa, pants: 0x1e40af, accent: 0x93c5fd, wall: 0x131e42, skin: 0xfbcfa0, hair: 0x1f2937 },
  front:  { shirt: 0xc084fc, pants: 0x6b21a8, accent: 0xddd6fe, wall: 0x251734, skin: 0xf5d4a5, hair: 0x92400e },
  mobile: { shirt: 0x67e8f9, pants: 0x0e7490, accent: 0xa5f3fc, wall: 0x0c232e, skin: 0xfbcfa0, hair: 0x1f2937 },
  prod:   { shirt: 0xf472b6, pants: 0x9d174d, accent: 0xfbcfe8, wall: 0x341728, skin: 0xf5d4a5, hair: 0xa16207 },
  qa:     { shirt: 0xa3e635, pants: 0x4d7c0f, accent: 0xd9f99d, wall: 0x1a240d, skin: 0xfbcfa0, hair: 0x1f2937 },
  sec:    { shirt: 0xf87171, pants: 0x991b1b, accent: 0xfca5a5, wall: 0x331414, skin: 0xf5d4a5, hair: 0x0c0a09 },
  integ:  { shirt: 0xfacc15, pants: 0x854d0e, accent: 0xfef08a, wall: 0x302208, skin: 0xfbcfa0, hair: 0x78350f },
  devops: { shirt: 0xfb923c, pants: 0x9a3412, accent: 0xfed7aa, wall: 0x301a0e, skin: 0xf5d4a5, hair: 0x1f2937 },
  perf:   { shirt: 0x34d399, pants: 0x065f46, accent: 0x6ee7b7, wall: 0x0c261d, skin: 0xfbcfa0, hair: 0x451a03 },
  data:   { shirt: 0x86efac, pants: 0x166534, accent: 0xbbf7d0, wall: 0x12261a, skin: 0xfbcfa0, hair: 0x1f2937 },
};

// ─── Theme ───────────────────────────────────────────────────────────────────

const storedTheme = localStorage.getItem("bsm-hq-theme") ?? "night";
let currentTheme = storedTheme === "day" ? "day" : "night";
document.documentElement.setAttribute("data-theme", currentTheme);
document.getElementById("theme-toggle").textContent = currentTheme === "day" ? "☀" : "🌙";

function toggleTheme() {
  currentTheme = currentTheme === "night" ? "day" : "night";
  document.documentElement.setAttribute("data-theme", currentTheme);
  document.getElementById("theme-toggle").textContent = currentTheme === "day" ? "☀" : "🌙";
  localStorage.setItem("bsm-hq-theme", currentTheme);
  // Redraw del background del canvas
  drawBackground();
}

document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

// ─── Audio ───────────────────────────────────────────────────────────────────

const audioSettings = {
  enabled: localStorage.getItem("bsm-hq-sound") !== "off",
  volume: Number(localStorage.getItem("bsm-hq-volume") ?? 40) / 100,
  toneIn:   localStorage.getItem("bsm-hq-tone-in")   ?? "chime",
  toneOut:  localStorage.getItem("bsm-hq-tone-out")  ?? "bell",
  toneDone: localStorage.getItem("bsm-hq-tone-done") ?? "arcade",
};

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

const TONE_PRESETS = {
  beep: [
    { freq: 880, duration: 0.1, wave: "square" },
  ],
  chime: [
    { freq: 880, duration: 0.08, wave: "sine" },
    { freq: 1318, duration: 0.08, wave: "sine", delay: 0.08 },
  ],
  bell: [
    { freq: 1047, duration: 0.15, wave: "triangle" },
    { freq: 1568, duration: 0.2,  wave: "triangle", delay: 0.08 },
  ],
  arcade: [
    { freq: 523, duration: 0.07, wave: "square" },
    { freq: 659, duration: 0.07, wave: "square", delay: 0.08 },
    { freq: 784, duration: 0.07, wave: "square", delay: 0.16 },
    { freq: 1047, duration: 0.15, wave: "square", delay: 0.24 },
  ],
};

function playTone(preset) {
  if (!audioSettings.enabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const notes = TONE_PRESETS[preset] ?? TONE_PRESETS.beep;
  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave;
    osc.frequency.value = note.freq;
    const start = now + (note.delay ?? 0);
    // ADSR envelope
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(audioSettings.volume * 0.6, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + note.duration + 0.05);
  }
}

// Audio settings UI
const toggleSound = document.getElementById("toggle-sound");
if (!audioSettings.enabled) toggleSound.classList.remove("on");
toggleSound.addEventListener("click", () => {
  audioSettings.enabled = !audioSettings.enabled;
  toggleSound.classList.toggle("on", audioSettings.enabled);
  localStorage.setItem("bsm-hq-sound", audioSettings.enabled ? "on" : "off");
  if (audioSettings.enabled) playTone(audioSettings.toneIn);
});

const volumeSlider = document.getElementById("volume");
volumeSlider.value = String(audioSettings.volume * 100);
volumeSlider.addEventListener("input", (e) => {
  audioSettings.volume = Number(e.target.value) / 100;
  localStorage.setItem("bsm-hq-volume", String(Number(e.target.value)));
});
volumeSlider.addEventListener("change", () => playTone(audioSettings.toneIn));

for (const [id, key] of [
  ["tone-in", "toneIn"],
  ["tone-out", "toneOut"],
  ["tone-done", "toneDone"],
]) {
  const el = document.getElementById(id);
  el.value = audioSettings[key];
  el.addEventListener("change", (e) => {
    audioSettings[key] = e.target.value;
    localStorage.setItem(`bsm-hq-${id}`, e.target.value);
    playTone(e.target.value);
  });
}

// ─── App setup ───────────────────────────────────────────────────────────────

const app = new PIXI.Application();
await app.init({
  resizeTo: document.getElementById("game"),
  backgroundAlpha: 0,
  antialias: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById("game").appendChild(app.canvas);
app.canvas.style.imageRendering = "pixelated";
document.getElementById("loading").classList.add("hide");

const bgLayer = new PIXI.Container();
const officeLayer = new PIXI.Container();
const centralRoomLayer = new PIXI.Container();
const agentLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();
app.stage.addChild(bgLayer, officeLayer, centralRoomLayer, agentLayer, fxLayer);

// ─── Layout ──────────────────────────────────────────────────────────────────

const AGENT_SCALE = 3.4;

let layout = computeLayout();

function computeLayout() {
  const w = app.screen.width;
  const h = app.screen.height;
  const targetOfficeW = Math.max(200, Math.min(260, Math.floor((w - 60) / 7)));
  const targetOfficeH = Math.max(160, Math.floor(targetOfficeW * 0.75));
  const officeW = targetOfficeW;
  const officeH = targetOfficeH;
  const gap = 14;
  const topMargin = 24;
  const bottomMargin = 24;

  const centerW = Math.min(w * 0.56, 900);
  const centerH = Math.min(h * 0.52, 520);
  const centerX = w / 2 - centerW / 2;
  const centerY = h / 2 - centerH / 2;

  const topCount = 6;
  const topTotalW = topCount * officeW + (topCount - 1) * gap;
  const topStartX = (w - topTotalW) / 2;
  const topY = topMargin;

  const botCount = 7;
  const botTotalW = botCount * officeW + (botCount - 1) * gap;
  const botStartX = (w - botTotalW) / 2;
  const botY = h - bottomMargin - officeH;

  const sideCount = 3;
  const sideTotalH = sideCount * officeH + (sideCount - 1) * gap;
  const sideStartY = (h - sideTotalH) / 2;
  const leftX = 24;
  const rightX = w - officeW - 24;

  const offices = [];
  for (let i = 0; i < topCount; i++) offices.push({ x: topStartX + i * (officeW + gap), y: topY, w: officeW, h: officeH });
  for (let i = 0; i < sideCount; i++) offices.push({ x: leftX, y: sideStartY + i * (officeH + gap), w: officeW, h: officeH });
  for (let i = 0; i < sideCount; i++) offices.push({ x: rightX, y: sideStartY + i * (officeH + gap), w: officeW, h: officeH });
  for (let i = 0; i < botCount; i++) offices.push({ x: botStartX + i * (officeW + gap), y: botY, w: officeW, h: officeH });

  // 15 escritorios en War Room grid 5×3
  const DESK_COLS = 5;
  const DESK_ROWS = 3;
  const deskMarginX = 70;
  const deskMarginY = 70;
  const deskGapX = (centerW - 2 * deskMarginX) / (DESK_COLS - 1);
  const deskGapY = (centerH - 2 * deskMarginY) / (DESK_ROWS - 1);
  const centralDesks = [];
  for (let row = 0; row < DESK_ROWS; row++) {
    for (let col = 0; col < DESK_COLS; col++) {
      centralDesks.push({
        x: centerX + deskMarginX + col * deskGapX,
        y: centerY + deskMarginY + row * deskGapY,
      });
    }
  }

  return {
    offices,
    centralRoom: { x: centerX, y: centerY, w: centerW, h: centerH },
    centralDesks,
  };
}

// ─── Theme colors for canvas ─────────────────────────────────────────────────

function getThemeColors() {
  if (currentTheme === "day") {
    return {
      bg: 0xf5f7fb,
      gridLine: 0xdde3f0,
      wallBrighten: 0xffffff,
      officeFloor: 0xe6ecf5,
      officeOutline: 0x94a3b8,
      roomBg: 0xdbe5f7,
      roomPattern: 0xaec4e6,
      deskTop: 0xa87852,
      deskHighlight: 0xc29870,
    };
  }
  return {
    bg: 0x070a18,
    gridLine: 0x0e1330,
    wallBrighten: 0x000000,
    officeFloor: 0x181f3a,
    officeOutline: 0x0a0d1c,
    roomBg: 0x1a2a48,
    roomPattern: 0x223358,
    deskTop: 0x78350f,
    deskHighlight: 0x92400e,
  };
}

// ─── Background ──────────────────────────────────────────────────────────────

function drawBackground() {
  bgLayer.removeChildren();
  const g = new PIXI.Graphics();
  const w = app.screen.width;
  const h = app.screen.height;
  const T = getThemeColors();
  g.rect(0, 0, w, h).fill(T.bg);
  for (let x = 0; x < w; x += 50) {
    g.moveTo(x, 0).lineTo(x, h).stroke({ color: T.gridLine, width: 1 });
  }
  for (let y = 0; y < h; y += 50) {
    g.moveTo(0, y).lineTo(w, y).stroke({ color: T.gridLine, width: 1 });
  }
  bgLayer.addChild(g);

  // Redibujar oficinas y war room para reflejar el tema
  rebuildOfficesAndRoom();
}

// ─── Private office ──────────────────────────────────────────────────────────

function drawPrivateOffice(office, agentData) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const T = getThemeColors();
  const c = new PIXI.Container();
  c.x = office.x;
  c.y = office.y;

  const g = new PIXI.Graphics();

  // Piso + paredes
  g.rect(0, 0, office.w, office.h).fill(T.officeFloor);
  g.rect(3, 3, office.w - 6, office.h - 6).fill(colors.wall);

  // Rodapié
  g.rect(0, office.h - 28, office.w, 6).fill(T.officeOutline);

  // 3 cuadros en la pared
  const pic1x = 22, pic1y = 30;
  g.rect(pic1x, pic1y, 22, 16).fill(0x000000);
  g.rect(pic1x + 2, pic1y + 2, 18, 12).fill(colors.accent);
  g.rect(pic1x + 5, pic1y + 4, 12, 7).fill(colors.shirt);

  const pic2x = 52, pic2y = 30;
  g.rect(pic2x, pic2y, 26, 16).fill(0x000000);
  g.rect(pic2x + 2, pic2y + 2, 22, 12).fill(0x1f2937);
  g.rect(pic2x + 5, pic2y + 10, 3, 3).fill(colors.accent);
  g.rect(pic2x + 10, pic2y + 7, 3, 6).fill(colors.accent);
  g.rect(pic2x + 15, pic2y + 4, 3, 9).fill(colors.accent);

  const pic3x = 86, pic3y = 30;
  g.rect(pic3x, pic3y, 20, 16).fill(0x000000);
  g.rect(pic3x + 2, pic3y + 2, 16, 12).fill(0xfef3c7);
  g.rect(pic3x + 4, pic3y + 5, 12, 1).fill(0x78350f);
  g.rect(pic3x + 4, pic3y + 8, 10, 1).fill(0x78350f);
  g.rect(pic3x + 4, pic3y + 11, 8, 1).fill(0x78350f);

  // Escritorio
  const deskY = office.h - 64;
  const deskW = 80;
  g.rect(office.w / 2 - deskW / 2, deskY, deskW, 14).fill(T.deskTop);
  g.rect(office.w / 2 - deskW / 2, deskY, deskW, 3).fill(T.deskHighlight);
  g.rect(office.w / 2 - 16, deskY - 20, 32, 18).fill(0x1f2937);
  g.rect(office.w / 2 - 15, deskY - 19, 30, 15).fill(colors.shirt);
  g.rect(office.w / 2 - 12, deskY - 16, 16, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 13, 12, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 10, 14, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 7,  10, 2).fill(0x000000);
  g.rect(office.w / 2 - 3, deskY - 4, 6, 3).fill(0x374151);
  g.rect(office.w / 2 - 10, deskY + 16, 20, 3).fill(0x4b5563);

  // Planta
  const plantX = office.w - 36;
  const plantY = office.h - 50;
  g.rect(plantX, plantY, 16, 12).fill(0x92400e);
  g.rect(plantX + 2, plantY + 2, 12, 2).fill(0x78350f);
  g.circle(plantX + 8, plantY - 6, 8).fill(0x16a34a);
  g.circle(plantX + 3, plantY - 2, 5).fill(0x22c55e);
  g.circle(plantX + 13, plantY - 2, 5).fill(0x16a34a);
  g.circle(plantX + 8, plantY - 12, 4).fill(0x22c55e);

  // Lámpara
  const lampX = 22;
  const lampY = office.h - 66;
  g.rect(lampX, lampY, 3, 20).fill(0x374151);
  g.rect(lampX - 5, lampY - 3, 13, 5).fill(0xfacc15);
  g.circle(lampX + 1, lampY + 3, 18).fill({ color: 0xfacc15, alpha: 0.12 });

  // Silla
  const chairX = office.w / 2;
  const chairY = office.h - 42;
  g.rect(chairX - 10, chairY, 20, 6).fill(0x1f2937);
  g.rect(chairX - 12, chairY - 16, 24, 16).fill(0x374151);
  g.rect(chairX - 12, chairY - 16, 24, 3).fill(colors.accent);

  // Banda decorativa arriba (sin texto/nameplate — pedido Brandon)
  g.rect(3, 3, office.w - 6, 8).fill(colors.shirt);
  g.rect(3, 3, office.w - 6, 2).fill(colors.accent);

  c.addChild(g);
  return c;
}

// ─── War Room ────────────────────────────────────────────────────────────────

function drawCentralRoom() {
  centralRoomLayer.removeChildren();
  const r = layout.centralRoom;
  const T = getThemeColors();
  const g = new PIXI.Graphics();

  g.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12).fill(0x0a0d1c);
  g.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6).fill({ color: 0xf97316, alpha: 0.25 });
  g.rect(r.x, r.y, r.w, r.h).fill(T.roomBg);

  for (let i = -r.h; i < r.w + r.h; i += 30) {
    g.moveTo(r.x + i, r.y).lineTo(r.x + i + r.h, r.y + r.h)
      .stroke({ color: T.roomPattern, width: 1 });
  }

  g.rect(r.x + r.w / 2 - 100, r.y - 4, 200, 8).fill(0xf97316);
  g.rect(r.x + r.w / 2 - 100, r.y - 2, 200, 2).fill(0xfbbf24);
  g.rect(r.x + r.w / 2 - 100, r.y + r.h - 4, 200, 8).fill(0xf97316);

  for (const desk of layout.centralDesks) {
    g.rect(desk.x - 30, desk.y, 60, 18).fill(T.deskTop);
    g.rect(desk.x - 30, desk.y, 60, 4).fill(T.deskHighlight);
    g.rect(desk.x - 12, desk.y - 20, 24, 15).fill(0x1f2937);
    g.rect(desk.x - 11, desk.y - 19, 22, 13).fill(0x00b4a6);
    g.rect(desk.x - 8, desk.y - 15, 10, 1).fill(0x000000);
    g.rect(desk.x - 8, desk.y - 12, 14, 1).fill(0x000000);
    g.rect(desk.x - 8, desk.y - 9, 8, 1).fill(0x000000);
    g.rect(desk.x - 3, desk.y - 4, 6, 3).fill(0x374151);
    g.rect(desk.x - 10, desk.y + 20, 20, 3).fill(0x4b5563);
  }

  centralRoomLayer.addChild(g);

  const label = new PIXI.Text({
    text: "◆ WAR ROOM · AGENT TEAM ◆",
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 22,
      fontWeight: "900",
      fill: 0xf97316,
      letterSpacing: 4,
      stroke: { color: 0x000000, width: 5, join: "round" },
    },
  });
  label.anchor.set(0.5, 1);
  label.x = r.x + r.w / 2;
  label.y = r.y - 12;
  centralRoomLayer.addChild(label);

  const subtitle = new PIXI.Text({
    text: `${layout.centralDesks.length} ESTACIONES DE TRABAJO`,
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0xfbbf24,
      letterSpacing: 2,
    },
  });
  subtitle.anchor.set(0.5, 0);
  subtitle.x = r.x + r.w / 2;
  subtitle.y = r.y + r.h + 10;
  centralRoomLayer.addChild(subtitle);
}

// ─── Human-ish agent sprite ──────────────────────────────────────────────────

function createAgentSprite(agentData, officeIdx) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const c = new PIXI.Container();
  c.eventMode = "static";
  c.cursor = "pointer";

  // Sombra
  const shadow = new PIXI.Graphics();
  shadow.ellipse(0, 15, 11, 4).fill({ color: 0x000000, alpha: 0.5 });
  c.addChild(shadow);

  const legsG = new PIXI.Graphics();
  c.addChild(legsG);

  // CUERPO — más proporcional a persona
  const bodyG = new PIXI.Graphics();
  // Torso (camisa)
  bodyG.rect(-5, -4, 10, 11).fill(colors.shirt);
  // Cuello
  bodyG.rect(-2, -6, 4, 2).fill(colors.skin);
  // Banda del cuello (camisa con color accent)
  bodyG.rect(-5, -4, 10, 2).fill(colors.accent);
  // Botones centro
  bodyG.rect(0, -2, 1, 1).fill(0x000000);
  bodyG.rect(0, 0, 1, 1).fill(0x000000);
  bodyG.rect(0, 2, 1, 1).fill(0x000000);
  bodyG.rect(0, 4, 1, 1).fill(0x000000);
  // Cintura (línea más oscura del pantalón)
  bodyG.rect(-5, 6, 10, 1).fill(colors.pants);
  c.addChild(bodyG);

  const armsG = new PIXI.Graphics();
  c.addChild(armsG);

  // CABEZA — más redonda y humana
  const headG = new PIXI.Graphics();
  // Cuello-barbilla
  headG.rect(-2, -7, 4, 1).fill(colors.skin);
  // Cabeza redonda (8x8 con esquinas pixel)
  headG.rect(-3, -14, 6, 7).fill(colors.skin); // cara principal
  headG.rect(-4, -13, 1, 5).fill(colors.skin); // lado izq
  headG.rect(3,  -13, 1, 5).fill(colors.skin); // lado der
  // Pelo (cubre la parte de arriba)
  headG.rect(-4, -14, 8, 3).fill(colors.hair);
  headG.rect(-4, -11, 1, 1).fill(colors.hair);
  headG.rect(3, -11, 1, 1).fill(colors.hair);
  // Orejas
  headG.rect(-5, -11, 1, 2).fill(colors.skin);
  headG.rect(4, -11, 1, 2).fill(colors.skin);
  // Ojos (más grandes y expresivos)
  headG.rect(-2, -10, 1, 2).fill(0xffffff);
  headG.rect(1, -10, 1, 2).fill(0xffffff);
  headG.rect(-2, -9, 1, 1).fill(0x000000);
  headG.rect(1, -9, 1, 1).fill(0x000000);
  // Nariz (puntito más oscuro)
  headG.rect(0, -8, 1, 1).fill(0xd4926a);
  // Boca (línea)
  headG.rect(-1, -7, 2, 1).fill(0x78350f);
  c.addChild(headG);

  // Corona del initiative-orchestrator
  if (agentData.special) {
    const crown = new PIXI.Graphics();
    crown.rect(-4, -17, 8, 1).fill(0xfacc15);
    crown.rect(-4, -19, 2, 2).fill(0xfacc15);
    crown.rect(-1, -19, 2, 2).fill(0xfacc15);
    crown.rect(2, -19, 2, 2).fill(0xfacc15);
    c.addChild(crown);
  }

  c.hitArea = new PIXI.Rectangle(-12, -22, 24, 40);
  c.scale.set(AGENT_SCALE);

  // Name label (rol) permanente GRANDE
  const roleLabel = new PIXI.Text({
    text: agentData.shortRole,
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 14,
      fontWeight: "900",
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 4, join: "round" },
      letterSpacing: 0.5,
    },
  });
  roleLabel.anchor.set(0.5, 1);
  roleLabel.y = -22;
  roleLabel.scale.set(0.5);
  c.addChild(roleLabel);

  // File bubble (escondido)
  const fileLabelBg = new PIXI.Graphics();
  fileLabelBg.visible = false;
  c.addChild(fileLabelBg);

  const fileLabel = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 13,
      fontWeight: "900",
      fill: 0xf97316,
      stroke: { color: 0x000000, width: 4, join: "round" },
    },
  });
  fileLabel.anchor.set(0.5, 1);
  fileLabel.y = -32;
  fileLabel.scale.set(0.5);
  fileLabel.visible = false;
  c.addChild(fileLabel);

  const state = {
    data: agentData,
    colors,
    container: c,
    bodyG, armsG, legsG, headG, shadow,
    fileLabel, fileLabelBg, roleLabel,
    officeIdx,
    officeRect: layout.offices[officeIdx],
    mode: "sitting_home", // sitting_home | walking | sitting_central
    walkPhase: 0,
    currentDesk: null,
  };

  c.on("pointerover", () => { showTooltip(state); c.scale.set(AGENT_SCALE * 1.18); });
  c.on("pointerout", () => { hideTooltip(); c.scale.set(AGENT_SCALE); });
  c.on("pointermove", (e) => moveTooltip(e));

  const sitPos = homeOfficeSitPosition(state.officeRect);
  c.x = sitPos.x;
  c.y = sitPos.y;
  // IDLE = inmóvil, brazos estáticos en reposo sobre el escritorio
  drawLegs(state, 0, true);
  drawArmsStatic(state);

  return state;
}

function homeOfficeSitPosition(office) {
  return { x: office.x + office.w / 2, y: office.y + office.h - 48 };
}

function homeOfficeDoorPosition(office) {
  return { x: office.x + office.w / 2, y: office.y + office.h - 4 };
}

function drawLegs(state, phase, sitting) {
  const g = state.legsG;
  g.clear();
  const c = state.colors.pants;
  if (sitting) return;
  const lOff = Math.sin(phase) * 2.5;
  const rOff = -Math.sin(phase) * 2.5;
  g.rect(-4, 6, 3, 7 + lOff).fill(c);
  g.rect(1,  6, 3, 7 + rOff).fill(c);
}

function drawArmsStatic(state) {
  // Brazos descansando — SIN animación
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  g.rect(-7, -4, 3, 8).fill(c);
  g.rect(4,  -4, 3, 8).fill(c);
}

function drawArmsWalking(state, phase) {
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  const lOff = -Math.sin(phase) * 2.5;
  const rOff = Math.sin(phase) * 2.5;
  g.rect(-7, -4 + lOff, 3, 8).fill(c);
  g.rect(4,  -4 + rOff, 3, 8).fill(c);
}

function drawArmsWorking(state) {
  // Brazos extendidos al frente como tecleando
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  g.rect(-7, -3, 3, 4).fill(c);
  g.rect(4,  -3, 3, 4).fill(c);
  // Manos sobre el "teclado"
  g.rect(-7, 1, 3, 2).fill(state.colors.skin);
  g.rect(4,  1, 3, 2).fill(state.colors.skin);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

const agents = [];
const agentsById = new Map();
const centralOccupancy = new Array(15).fill(null);
let currentTeam = [];

function spawnAgents() {
  agents.length = 0;
  agentsById.clear();
  agentLayer.removeChildren();
  for (let i = 0; i < AGENTS.length; i++) {
    const s = createAgentSprite(AGENTS[i], i);
    agents.push(s);
    agentsById.set(s.data.id, s);
    agentLayer.addChild(s.container);
  }
}

function rebuildOfficesAndRoom() {
  officeLayer.removeChildren();
  for (let i = 0; i < AGENTS.length; i++) {
    const office = drawPrivateOffice(layout.offices[i], AGENTS[i]);
    officeLayer.addChild(office);
  }
  drawCentralRoom();
}

// ─── Tweens ──────────────────────────────────────────────────────────────────

function tweenAgentTo(state, targetX, targetY, duration = 1.6) {
  return new Promise((resolve) => {
    state.mode = "walking";
    state.container.scale.x = targetX < state.container.x ? -AGENT_SCALE : AGENT_SCALE;

    const phaseTicker = { value: state.walkPhase };
    const walkTween = gsap.to(phaseTicker, {
      value: phaseTicker.value + Math.PI * 2 * (duration * 2.5),
      duration,
      ease: "none",
      onUpdate: () => {
        state.walkPhase = phaseTicker.value;
        drawLegs(state, state.walkPhase, false);
        drawArmsWalking(state, state.walkPhase);
      },
    });

    gsap.to(state.container, {
      x: targetX,
      y: targetY,
      duration,
      ease: "power1.inOut",
      onComplete: () => {
        walkTween.kill();
        resolve();
      },
    });
  });
}

// ─── Agent Team logic (automático) ───────────────────────────────────────────

async function launchAgentTeam(pickedIds) {
  if (currentTeam.length > 0) {
    await sendTeamHome();
  }

  let picked;
  if (pickedIds && pickedIds.length > 0) {
    picked = pickedIds
      .map((id) => agentsById.get(id))
      .filter((a) => a && a.mode === "sitting_home");
  } else {
    return; // v4: sin fallback random. Si no hay commits con agentes, nadie trabaja.
  }

  if (picked.length === 0) return;

  currentTeam = picked;
  updateSidebarStats();

  const freeDesks = [];
  for (let i = 0; i < centralOccupancy.length; i++) {
    if (centralOccupancy[i] === null) freeDesks.push(i);
  }

  const promises = picked.map(async (state, n) => {
    if (n >= freeDesks.length) return;
    const deskIdx = freeDesks[n];
    centralOccupancy[deskIdx] = state.data.id;
    state.currentDesk = deskIdx;

    await new Promise((r) => setTimeout(r, n * 220));

    // Sonido de entrada cuando sale de su oficina
    playTone(audioSettings.toneIn);

    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 0.7);

    const desk = layout.centralDesks[deskIdx];
    await tweenAgentTo(state, desk.x, desk.y - 6, 1.4 + Math.random() * 0.6);

    state.mode = "sitting_central";
    drawLegs(state, 0, true);
    drawArmsWorking(state);
    showWorkingFile(state);
  });

  await Promise.all(promises);
  updateSidebarStats();
}

async function sendTeamHome() {
  const team = currentTeam.slice();
  currentTeam = [];
  const teamNames = team.map((s) => s.data.name);

  const promises = team.map(async (state, n) => {
    if (state.currentDesk !== null && state.currentDesk !== undefined) {
      centralOccupancy[state.currentDesk] = null;
      state.currentDesk = null;
    }
    hideWorkingFile(state);
    await new Promise((r) => setTimeout(r, n * 180));

    playTone(audioSettings.toneOut);

    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 1.5 + Math.random() * 0.4);

    const sit = homeOfficeSitPosition(state.officeRect);
    await tweenAgentTo(state, sit.x, sit.y, 0.7);

    state.mode = "sitting_home";
    drawLegs(state, 0, true);
    drawArmsStatic(state);
  });

  await Promise.all(promises);
  updateSidebarStats();

  if (teamNames.length > 0) {
    showCompletionModal(teamNames);
  }
}

// ─── Completion modal ───────────────────────────────────────────────────────

function showCompletionModal(teamNames) {
  const overlay = document.getElementById("modal-overlay");
  const badges = document.getElementById("modal-badges");
  const subtitle = document.getElementById("modal-subtitle");
  subtitle.textContent = `${teamNames.length} agente(s) completaron y volvieron a sus oficinas`;
  badges.innerHTML = teamNames
    .map((n) => `<span class="badge">${escapeHtml(n)}</span>`)
    .join("");
  overlay.classList.add("show");
  playTone(audioSettings.toneDone);
}

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("modal-overlay").classList.remove("show");
});
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById("modal-overlay").classList.remove("show");
  }
});

// ─── Working file bubbles (basename only) ───────────────────────────────────

function basename(path) {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

let realProjectFiles = [];

function pickFileForAgent() {
  if (realProjectFiles.length > 0) {
    return basename(realProjectFiles[Math.floor(Math.random() * realProjectFiles.length)]);
  }
  return "route.ts";
}

function showWorkingFile(state) {
  state.fileLabel.text = pickFileForAgent();
  state.fileLabel.visible = true;
  redrawFileBubble(state);
  state.fileLabelBg.alpha = 0;
  state.fileLabel.alpha = 0;
  gsap.to([state.fileLabelBg, state.fileLabel], { alpha: 1, duration: 0.5 });

  if (state._fileInterval) clearInterval(state._fileInterval);
  state._fileInterval = setInterval(() => {
    if (state.mode !== "sitting_central") return;
    const newFile = pickFileForAgent();
    gsap.to([state.fileLabelBg, state.fileLabel], {
      alpha: 0,
      duration: 0.25,
      onComplete: () => {
        state.fileLabel.text = newFile;
        redrawFileBubble(state);
        gsap.to([state.fileLabelBg, state.fileLabel], { alpha: 1, duration: 0.35 });
      },
    });
  }, 4000 + Math.random() * 3000);
}

function redrawFileBubble(state) {
  const bg = state.fileLabelBg;
  const w = state.fileLabel.width + 10;
  const h = state.fileLabel.height + 6;
  bg.clear();
  bg.roundRect(-w / 2 - 1, -32 - h - 2, w + 2, h + 2, 3).fill(0x000000);
  bg.roundRect(-w / 2, -32 - h, w, h, 3).fill(0x111827);
  bg.rect(-w / 2, -32 - h, w, 1.5).fill(0xf97316);
  bg.rect(-w / 2, -32 - 1.5, w, 1.5).fill(0xf97316);
  bg.moveTo(-3, -32).lineTo(3, -32).lineTo(0, -29).lineTo(-3, -32).fill(0x111827);
  bg.visible = true;
}

function hideWorkingFile(state) {
  if (state._fileInterval) {
    clearInterval(state._fileInterval);
    state._fileInterval = null;
  }
  gsap.to([state.fileLabelBg, state.fileLabel], {
    alpha: 0,
    duration: 0.3,
    onComplete: () => {
      state.fileLabelBg.visible = false;
      state.fileLabel.visible = false;
    },
  });
}

// ─── Particles ───────────────────────────────────────────────────────────────

const particles = [];

function spawnParticle(x, y, color) {
  const g = new PIXI.Graphics();
  g.rect(-1.5, -1.5, 3, 3).fill(color);
  g.x = x;
  g.y = y;
  fxLayer.addChild(g);
  particles.push({
    g,
    vx: (Math.random() - 0.5) * 2,
    vy: -1.5 - Math.random() * 2,
    life: 50 + Math.random() * 20,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.g.x += p.vx;
    p.g.y += p.vy;
    p.vy += 0.1;
    p.life--;
    p.g.alpha = Math.max(0, p.life / 60);
    if (p.life <= 0) {
      fxLayer.removeChild(p.g);
      p.g.destroy();
      particles.splice(i, 1);
    }
  }
}

// ─── Main loop ──────────────────────────────────────────────────────────────
// IDLE = inmóvil (nada se actualiza)
// sitting_central = arms working animation + particles

app.ticker.add(() => {
  for (const state of agents) {
    if (state.mode === "sitting_central") {
      if (Math.random() < 0.15) {
        const colors = [0x00b4a6, 0xf97316, 0xfacc15, 0xa3e635];
        spawnParticle(
          state.container.x + (Math.random() - 0.5) * 18,
          state.container.y - 18,
          colors[Math.floor(Math.random() * colors.length)],
        );
      }
    }
    // sitting_home NO hace nada — totalmente inmóvil
  }
  updateParticles();
});

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const tooltipEl = document.getElementById("tooltip");
const tooltipName = tooltipEl.querySelector(".tt-name");
const tooltipRole = tooltipEl.querySelector(".tt-role");
const tooltipStatus = tooltipEl.querySelector(".tt-status");
let hoveredState = null;

function showTooltip(state) {
  hoveredState = state;
  tooltipName.textContent = "▸ " + state.data.name;
  tooltipRole.textContent = state.data.area.toUpperCase() + " · " + state.data.shortRole;
  tooltipStatus.textContent = statusText(state);
  tooltipEl.classList.add("show");
}

function hideTooltip() {
  hoveredState = null;
  tooltipEl.classList.remove("show");
}

function moveTooltip(e) {
  const x = e.global?.x ?? 0;
  const y = e.global?.y ?? 0;
  tooltipEl.style.left = Math.min(x + 16, window.innerWidth - 320) + "px";
  tooltipEl.style.top = Math.min(y + 16, window.innerHeight - 120) + "px";
}

function statusText(state) {
  if (state.mode === "sitting_central") {
    return "● EN WAR ROOM · " + (state.fileLabel.text || "trabajando");
  }
  if (state.mode === "walking") return "▶ EN TRÁNSITO";
  return "○ EN SU OFICINA · DISPONIBLE";
}

// ─── HUD + Sidebar stats ─────────────────────────────────────────────────────

const statTotal = document.getElementById("stat-total");
const statWorking = document.getElementById("stat-working");
const statCommits = document.getElementById("stat-commits");
const statFiles = document.getElementById("stat-files");
const clockEl = document.getElementById("clock");
const branchName = document.getElementById("branch-name");
const headHash = document.getElementById("head-hash");
const activeAgentsList = document.getElementById("active-agents-list");
const commitsList = document.getElementById("commits-list");
const offlineBadge = document.getElementById("offline");

function updateSidebarStats() {
  statTotal.textContent = String(agents.length);
  const working = agents.filter((a) => a.mode === "sitting_central" || a.mode === "walking").length;
  statWorking.textContent = String(working);

  const active = agents.filter((a) => a.mode === "sitting_central" || a.mode === "walking");
  if (active.length === 0) {
    activeAgentsList.innerHTML = `
      <div style="font-size: 11px; color: var(--muted); padding: 10px; text-align: center;">
        Esperando commit nuevo…
      </div>
    `;
  } else {
    activeAgentsList.innerHTML = active
      .map(
        (a) => `
      <div class="active-agent-row">
        <div class="dot"></div>
        <div class="name">${escapeHtml(a.data.name)}</div>
        <div class="role">${a.data.area}</div>
      </div>
    `,
      )
      .join("");
  }

  if (hoveredState) tooltipStatus.textContent = statusText(hoveredState);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
tickClock();
setInterval(tickClock, 1000);
setInterval(updateSidebarStats, 300);

// ─── /api/state polling + auto-launch ───────────────────────────────────────

let lastHeadHash = null;

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    offlineBadge.classList.remove("show");

    if (state.repo) {
      branchName.textContent = state.repo.branch;
      headHash.textContent = state.repo.head;
    }

    statCommits.textContent = String(state.commits?.length ?? 0);
    statFiles.textContent = String(state.modified?.length ?? 0);

    // Archivos reales
    const allFiles = new Set();
    for (const c of state.commits ?? []) {
      for (const f of c.files ?? []) allFiles.add(f);
    }
    for (const m of state.modified ?? []) allFiles.add(m.path);
    realProjectFiles = Array.from(allFiles).slice(0, 60);

    // AUTO-DETECT: si el head hash cambió, lanzar agent team automáticamente
    const newHead = state.repo?.head;
    if (newHead && newHead !== lastHeadHash && lastHeadHash !== null) {
      // Commit nuevo detectado → lanzar los agentes del nuevo commit
      const agentIds = state.currentAgentTeam ?? [];
      if (agentIds.length > 0) {
        launchAgentTeam(agentIds).catch((e) => console.error("[AgentHQ] auto launch failed", e));
      }
    }
    lastHeadHash = newHead;

    // Commits en el sidebar
    const commits = state.commits ?? [];
    if (commits.length === 0) {
      commitsList.innerHTML = `<div style="font-size: 11px; color: var(--muted); padding: 8px;">Sin commits recientes</div>`;
    } else {
      commitsList.innerHTML = commits
        .slice(0, 8)
        .map((c, i) => {
          const agentBadges = (c.agents ?? [])
            .slice(0, 5)
            .map((a) => `<span>${escapeHtml(a.replace("-", " ").slice(0, 18))}</span>`)
            .join("");
          return `
          <div class="commit-row ${i === 0 ? "active" : ""}">
            <div><span class="commit-hash">${escapeHtml(c.hash)}</span></div>
            <div class="commit-subject">${escapeHtml(c.subject.slice(0, 80))}</div>
            <div class="commit-agents">${agentBadges}</div>
          </div>
        `;
        })
        .join("");
    }
  } catch {
    offlineBadge.classList.add("show");
  }
}

// Fetch inmediato + polling cada 6s (más agresivo para detectar commits rápido)
fetchState();
setInterval(fetchState, 6000);

// Auto-send-home después de 90s de trabajo — simula que "el team terminó"
setInterval(() => {
  if (currentTeam.length > 0) {
    sendTeamHome().catch(() => {});
  }
}, 90000);

// ─── Resize ──────────────────────────────────────────────────────────────────

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    layout = computeLayout();
    rebuildScene();
  }, 250);
});

function rebuildScene() {
  drawBackground();
  for (const s of agents) {
    s.officeRect = layout.offices[s.officeIdx];
    if (s.mode === "sitting_home") {
      const sit = homeOfficeSitPosition(s.officeRect);
      s.container.x = sit.x;
      s.container.y = sit.y;
    } else if (s.mode === "sitting_central" && s.currentDesk !== null) {
      const desk = layout.centralDesks[s.currentDesk];
      s.container.x = desk.x;
      s.container.y = desk.y - 6;
    }
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

drawBackground();
spawnAgents();
updateSidebarStats();

console.log("[AgentHQ v4] 🏢 Listo · auto-sync con Claude Code · modo " + currentTheme);
