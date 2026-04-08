/**
 * game.js v3 — Agent HQ conectado al proyecto real
 *
 * Mejoras sobre v2:
 *   - Sprites MUCHO más grandes (scale 3.2x)
 *   - Textos legibles (14-18pt)
 *   - 15 mesas en War Room (grid 5×3)
 *   - Polling a /api/state del server Node → lee git log real
 *   - Agentes "trabajando" son los REALES derivados de los últimos commits
 *   - Archivos del bubble son los REALES modificados en el commit activo
 *   - Sidebar con tabla de stats grandes + commits + lista de activos
 *   - Layout más profesional: oficinas en perímetro, war room grande central
 *
 * Stack: PixiJS 8 + GSAP 3 (CDN, sin deps npm)
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
  orch:   { shirt: 0x00b4a6, pants: 0x005e58, accent: 0xf97316, wall: 0x162b2a },
  db:     { shirt: 0x2dd4bf, pants: 0x115e59, accent: 0x67e8f9, wall: 0x0d2524 },
  back:   { shirt: 0x60a5fa, pants: 0x1e40af, accent: 0x93c5fd, wall: 0x131e42 },
  front:  { shirt: 0xc084fc, pants: 0x6b21a8, accent: 0xddd6fe, wall: 0x251734 },
  mobile: { shirt: 0x67e8f9, pants: 0x0e7490, accent: 0xa5f3fc, wall: 0x0c232e },
  prod:   { shirt: 0xf472b6, pants: 0x9d174d, accent: 0xfbcfe8, wall: 0x341728 },
  qa:     { shirt: 0xa3e635, pants: 0x4d7c0f, accent: 0xd9f99d, wall: 0x1a240d },
  sec:    { shirt: 0xf87171, pants: 0x991b1b, accent: 0xfca5a5, wall: 0x331414 },
  integ:  { shirt: 0xfacc15, pants: 0x854d0e, accent: 0xfef08a, wall: 0x302208 },
  devops: { shirt: 0xfb923c, pants: 0x9a3412, accent: 0xfed7aa, wall: 0x301a0e },
  perf:   { shirt: 0x34d399, pants: 0x065f46, accent: 0x6ee7b7, wall: 0x0c261d },
  data:   { shirt: 0x86efac, pants: 0x166534, accent: 0xbbf7d0, wall: 0x12261a },
};

const SKIN = 0xfbcfa0;

// ─── App setup ────────────────────────────────────────────────────────────────

const app = new PIXI.Application();
await app.init({
  resizeTo: document.getElementById("game"),
  backgroundColor: 0x070a18,
  antialias: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById("game").appendChild(app.canvas);
app.canvas.style.imageRendering = "pixelated";
document.getElementById("loading").classList.add("hide");

// Layers
const bgLayer = new PIXI.Container();
const officeLayer = new PIXI.Container();
const centralRoomLayer = new PIXI.Container();
const agentLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();
app.stage.addChild(bgLayer, officeLayer, centralRoomLayer, agentLayer, fxLayer);

// ─── Layout ──────────────────────────────────────────────────────────────────

const OFFICE_W_MIN = 200;
const OFFICE_H_MIN = 160;
const AGENT_SCALE = 3.2;

let layout = computeLayout();

function computeLayout() {
  const w = app.screen.width;
  const h = app.screen.height;

  // Cálculo dinámico: intentar que quepan 6 arriba, 3 a cada lado, 7 abajo
  const targetOfficeW = Math.max(OFFICE_W_MIN, Math.min(260, Math.floor((w - 60) / 7)));
  const targetOfficeH = Math.max(OFFICE_H_MIN, Math.floor(targetOfficeW * 0.75));
  const officeW = targetOfficeW;
  const officeH = targetOfficeH;
  const gap = 14;
  const topMargin = 24;
  const bottomMargin = 24;

  // Central room grande en el medio
  const centerW = Math.min(w * 0.56, 900);
  const centerH = Math.min(h * 0.52, 520);
  const centerX = w / 2 - centerW / 2;
  const centerY = h / 2 - centerH / 2;

  // Top row: 6 oficinas
  const topCount = 6;
  const topTotalW = topCount * officeW + (topCount - 1) * gap;
  const topStartX = (w - topTotalW) / 2;
  const topY = topMargin;

  // Bottom row: 7 oficinas
  const botCount = 7;
  const botTotalW = botCount * officeW + (botCount - 1) * gap;
  const botStartX = (w - botTotalW) / 2;
  const botY = h - bottomMargin - officeH;

  // Sides: 3 cada lado
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
  // Total: 6 + 3 + 3 + 7 = 19 ✓

  // 15 escritorios en War Room grid 5×3 (nuevo!)
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

// ─── Background ──────────────────────────────────────────────────────────────

function drawBackground() {
  bgLayer.removeChildren();
  const g = new PIXI.Graphics();
  const w = app.screen.width;
  const h = app.screen.height;
  g.rect(0, 0, w, h).fill(0x070a18);
  for (let x = 0; x < w; x += 50) {
    g.moveTo(x, 0).lineTo(x, h).stroke({ color: 0x0e1330, width: 1 });
  }
  for (let y = 0; y < h; y += 50) {
    g.moveTo(0, y).lineTo(w, y).stroke({ color: 0x0e1330, width: 1 });
  }
  bgLayer.addChild(g);
}

// ─── Private office (grande, con más detalles) ──────────────────────────────

function drawPrivateOffice(office, agentData) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const c = new PIXI.Container();
  c.x = office.x;
  c.y = office.y;

  const g = new PIXI.Graphics();

  // Piso + paredes
  g.rect(0, 0, office.w, office.h).fill(0x181f3a);
  g.rect(3, 3, office.w - 6, office.h - 6).fill(colors.wall);

  // Rodapié
  g.rect(0, office.h - 28, office.w, 6).fill(0x0a0d1c);

  // 2 cuadros más grandes en la pared
  const pic1x = 22;
  const pic1y = 30;
  g.rect(pic1x, pic1y, 22, 16).fill(0x000000);
  g.rect(pic1x + 2, pic1y + 2, 18, 12).fill(colors.accent);
  g.rect(pic1x + 5, pic1y + 4, 12, 7).fill(colors.shirt);

  const pic2x = 52;
  const pic2y = 30;
  g.rect(pic2x, pic2y, 26, 16).fill(0x000000);
  g.rect(pic2x + 2, pic2y + 2, 22, 12).fill(0x1f2937);
  // "wifi bars" más grandes
  g.rect(pic2x + 5, pic2y + 10, 3, 3).fill(colors.accent);
  g.rect(pic2x + 10, pic2y + 7, 3, 6).fill(colors.accent);
  g.rect(pic2x + 15, pic2y + 4, 3, 9).fill(colors.accent);

  // Diploma/tercer cuadro
  const pic3x = 86;
  const pic3y = 30;
  g.rect(pic3x, pic3y, 20, 16).fill(0x000000);
  g.rect(pic3x + 2, pic3y + 2, 16, 12).fill(0xfef3c7);
  g.rect(pic3x + 4, pic3y + 5, 12, 1).fill(0x78350f);
  g.rect(pic3x + 4, pic3y + 8, 10, 1).fill(0x78350f);
  g.rect(pic3x + 4, pic3y + 11, 8, 1).fill(0x78350f);

  // Escritorio grande al fondo
  const deskY = office.h - 64;
  const deskW = 80;
  g.rect(office.w / 2 - deskW / 2, deskY, deskW, 14).fill(0x78350f);
  g.rect(office.w / 2 - deskW / 2, deskY, deskW, 3).fill(0x92400e);
  // Monitor grande
  g.rect(office.w / 2 - 16, deskY - 20, 32, 18).fill(0x1f2937);
  g.rect(office.w / 2 - 15, deskY - 19, 30, 15).fill(colors.shirt);
  // "Código" líneas
  g.rect(office.w / 2 - 12, deskY - 16, 16, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 13, 12, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 10, 14, 2).fill(0x000000);
  g.rect(office.w / 2 - 12, deskY - 7,  10, 2).fill(0x000000);
  // Base del monitor
  g.rect(office.w / 2 - 3, deskY - 4, 6, 3).fill(0x374151);
  // Teclado
  g.rect(office.w / 2 - 10, deskY + 16, 20, 3).fill(0x4b5563);

  // Planta más grande
  const plantX = office.w - 36;
  const plantY = office.h - 50;
  g.rect(plantX, plantY, 16, 12).fill(0x92400e);
  g.rect(plantX + 2, plantY + 2, 12, 2).fill(0x78350f);
  // Hojas
  g.circle(plantX + 8, plantY - 6, 8).fill(0x16a34a);
  g.circle(plantX + 3, plantY - 2, 5).fill(0x22c55e);
  g.circle(plantX + 13, plantY - 2, 5).fill(0x16a34a);
  g.circle(plantX + 8, plantY - 12, 4).fill(0x22c55e);

  // Lámpara grande
  const lampX = 22;
  const lampY = office.h - 66;
  g.rect(lampX, lampY, 3, 20).fill(0x374151);
  g.rect(lampX - 5, lampY - 3, 13, 5).fill(0xfacc15);
  g.circle(lampX + 1, lampY + 3, 18).fill({ color: 0xfacc15, alpha: 0.12 });

  // Silla más grande
  const chairX = office.w / 2;
  const chairY = office.h - 42;
  g.rect(chairX - 10, chairY, 20, 6).fill(0x1f2937);
  g.rect(chairX - 12, chairY - 16, 24, 16).fill(0x374151);
  g.rect(chairX - 12, chairY - 16, 24, 3).fill(colors.accent);

  // Nameplate grande arriba (la puerta)
  g.rect(3, 3, office.w - 6, 24).fill(0x000000);
  g.rect(4, 4, office.w - 8, 22).fill(colors.shirt);
  g.rect(4, 4, office.w - 8, 3).fill(colors.accent);
  g.rect(4, 23, office.w - 8, 3).fill(colors.accent);

  c.addChild(g);

  // Nombre del agente GRANDE
  const name = new PIXI.Text({
    text: agentData.name.toUpperCase(),
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 13,
      fontWeight: "900",
      fill: 0x000000,
      letterSpacing: 0.5,
    },
  });
  name.anchor.set(0.5, 0.5);
  name.x = office.w / 2;
  name.y = 14;
  c.addChild(name);

  return c;
}

// ─── Central room (War Room) — más grande ───────────────────────────────────

function drawCentralRoom() {
  centralRoomLayer.removeChildren();
  const r = layout.centralRoom;
  const g = new PIXI.Graphics();

  // Borde exterior con glow
  g.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12).fill(0x0a0d1c);
  g.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6).fill({ color: 0xf97316, alpha: 0.25 });
  g.rect(r.x, r.y, r.w, r.h).fill(0x1a2a48);

  // Pattern diagonal del piso
  for (let i = -r.h; i < r.w + r.h; i += 30) {
    g.moveTo(r.x + i, r.y).lineTo(r.x + i + r.h, r.y + r.h)
      .stroke({ color: 0x223358, width: 1 });
  }

  // Ornamento arriba: banda naranja con líneas
  g.rect(r.x + r.w / 2 - 100, r.y - 4, 200, 8).fill(0xf97316);
  g.rect(r.x + r.w / 2 - 100, r.y - 2, 200, 2).fill(0xfbbf24);

  // Ornamento abajo
  g.rect(r.x + r.w / 2 - 100, r.y + r.h - 4, 200, 8).fill(0xf97316);

  // 15 escritorios grandes
  for (const desk of layout.centralDesks) {
    // Mesa grande
    g.rect(desk.x - 30, desk.y, 60, 18).fill(0x78350f);
    g.rect(desk.x - 30, desk.y, 60, 4).fill(0x92400e);
    // Monitor grande teal
    g.rect(desk.x - 12, desk.y - 20, 24, 15).fill(0x1f2937);
    g.rect(desk.x - 11, desk.y - 19, 22, 13).fill(0x00b4a6);
    // Código líneas
    g.rect(desk.x - 8, desk.y - 15, 10, 1).fill(0x000000);
    g.rect(desk.x - 8, desk.y - 12, 14, 1).fill(0x000000);
    g.rect(desk.x - 8, desk.y - 9, 8, 1).fill(0x000000);
    // Base del monitor
    g.rect(desk.x - 3, desk.y - 4, 6, 3).fill(0x374151);
    // Teclado
    g.rect(desk.x - 10, desk.y + 20, 20, 3).fill(0x4b5563);
  }

  centralRoomLayer.addChild(g);

  // Label "WAR ROOM" MUY grande
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

  // Subtítulo (cantidad de desks)
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

// ─── Agent sprite (GRANDE) ────────────────────────────────────────────────────

function createAgentSprite(agentData, officeIdx) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const c = new PIXI.Container();
  c.eventMode = "static";
  c.cursor = "pointer";

  // Sombra
  const shadow = new PIXI.Graphics();
  shadow.ellipse(0, 14, 10, 4).fill({ color: 0x000000, alpha: 0.5 });
  c.addChild(shadow);

  const legsG = new PIXI.Graphics();
  c.addChild(legsG);

  const bodyG = new PIXI.Graphics();
  bodyG.rect(-5, -5, 10, 10).fill(colors.shirt);
  bodyG.rect(-5, -5, 10, 3).fill(colors.accent);
  // Botones
  bodyG.rect(-1, -2, 1, 1).fill(0x000000);
  bodyG.rect(-1, 0, 1, 1).fill(0x000000);
  bodyG.rect(-1, 2, 1, 1).fill(0x000000);
  c.addChild(bodyG);

  const armsG = new PIXI.Graphics();
  c.addChild(armsG);

  const headG = new PIXI.Graphics();
  headG.rect(-4, -14, 8, 8).fill(SKIN);
  // Pelo
  headG.rect(-4, -14, 8, 3).fill(0x1f2937);
  headG.rect(-4, -13, 1, 1).fill(0x1f2937);
  headG.rect(3, -13, 1, 1).fill(0x1f2937);
  // Ojos
  headG.rect(-2, -10, 1, 2).fill(0x000000);
  headG.rect(1, -10, 1, 2).fill(0x000000);
  // Boca
  headG.rect(-1, -7, 2, 1).fill(0x78350f);
  c.addChild(headG);

  // Corona del orchestrator
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
  roleLabel.scale.set(0.5); // compensar el scale del container (3.2)
  c.addChild(roleLabel);

  // File bubble (escondido) GRANDE
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
    mode: "sitting_home",
    walkPhase: Math.random() * Math.PI * 2,
    currentDesk: null,
  };

  c.on("pointerover", () => { showTooltip(state); c.scale.set(AGENT_SCALE * 1.18); });
  c.on("pointerout", () => { hideTooltip(); c.scale.set(AGENT_SCALE); });
  c.on("pointermove", (e) => moveTooltip(e));

  const sitPos = homeOfficeSitPosition(state.officeRect);
  c.x = sitPos.x;
  c.y = sitPos.y;
  drawLegs(state, 0, true);
  drawArms(state, 0, true);

  return state;
}

function homeOfficeSitPosition(office) {
  return {
    x: office.x + office.w / 2,
    y: office.y + office.h - 48,
  };
}

function homeOfficeDoorPosition(office) {
  return {
    x: office.x + office.w / 2,
    y: office.y + office.h - 4,
  };
}

function drawLegs(state, phase, sitting) {
  const g = state.legsG;
  g.clear();
  const c = state.colors.pants;
  if (sitting) return;
  const lOff = Math.sin(phase) * 2.5;
  const rOff = -Math.sin(phase) * 2.5;
  g.rect(-4, 5, 3, 7 + lOff).fill(c);
  g.rect(1,  5, 3, 7 + rOff).fill(c);
}

function drawArms(state, phase, sitting) {
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  if (sitting) {
    const off = Math.sin(phase * 3) * 1;
    g.rect(-7, -4 + off, 3, 6).fill(c);
    g.rect(4,  -4 - off, 3, 6).fill(c);
    return;
  }
  const lOff = -Math.sin(phase) * 2.5;
  const rOff = Math.sin(phase) * 2.5;
  g.rect(-7, -4 + lOff, 3, 7).fill(c);
  g.rect(4,  -4 + rOff, 3, 7).fill(c);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

const agents = [];
const agentsById = new Map();
let totalTasks = 0;
const centralOccupancy = new Array(15).fill(null);

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
        drawArms(state, state.walkPhase, false);
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

// ─── Agent Team logic ────────────────────────────────────────────────────────

let currentTeam = [];
/** Archivos actuales de los commits recientes (viene del /api/state) */
let realProjectFiles = [];
/** IDs de los agentes derivados del último commit */
let realActiveAgentIds = [];

async function launchAgentTeam(pickedIds) {
  if (currentTeam.length > 0) {
    await sendTeamHome();
  }

  // Si nos pasaron IDs (desde /api/state), usamos esos. Si no, tomamos random.
  let picked;
  if (pickedIds && pickedIds.length > 0) {
    picked = pickedIds
      .map((id) => agentsById.get(id))
      .filter((a) => a && a.mode === "sitting_home");
  } else {
    const available = agents.filter((a) => a.mode === "sitting_home");
    const pool = [...available];
    picked = [];
    const count = Math.min(6 + Math.floor(Math.random() * 4), pool.length); // 6-9 agents
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
  }

  currentTeam = picked;
  totalTasks += picked.length;
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

    await new Promise((r) => setTimeout(r, n * 200));

    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 0.7);

    const desk = layout.centralDesks[deskIdx];
    const sitX = desk.x;
    const sitY = desk.y - 6;
    await tweenAgentTo(state, sitX, sitY, 1.4 + Math.random() * 0.6);

    state.mode = "sitting_central";
    drawLegs(state, 0, true);
    drawArms(state, 0, true);
    showWorkingFile(state);
  });

  await Promise.all(promises);
  updateSidebarStats();
}

async function sendTeamHome() {
  const team = currentTeam.slice();
  currentTeam = [];

  const promises = team.map(async (state, n) => {
    if (state.currentDesk !== null && state.currentDesk !== undefined) {
      centralOccupancy[state.currentDesk] = null;
      state.currentDesk = null;
    }
    hideWorkingFile(state);
    await new Promise((r) => setTimeout(r, n * 180));

    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 1.5 + Math.random() * 0.4);

    const sit = homeOfficeSitPosition(state.officeRect);
    await tweenAgentTo(state, sit.x, sit.y, 0.7);

    state.mode = "sitting_home";
    drawLegs(state, 0, true);
    drawArms(state, 0, true);
  });

  await Promise.all(promises);
  updateSidebarStats();
}

// ─── Working file bubbles ────────────────────────────────────────────────────

function pickFileForAgent() {
  if (realProjectFiles.length > 0) {
    return realProjectFiles[Math.floor(Math.random() * realProjectFiles.length)];
  }
  // Fallback si no hay /api/state respondiendo
  return "lib/db/chat.db.ts";
}

function showWorkingFile(state) {
  state.fileLabel.text = pickFileForAgent();
  state.fileLabel.visible = true;

  redrawFileBubble(state);

  state.fileLabelBg.alpha = 0;
  state.fileLabel.alpha = 0;
  gsap.to([state.fileLabelBg, state.fileLabel], { alpha: 1, duration: 0.5, ease: "power1.out" });

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

// ─── Main loop ───────────────────────────────────────────────────────────────

app.ticker.add(() => {
  for (const state of agents) {
    if (state.mode === "sitting_home" || state.mode === "sitting_central") {
      state.walkPhase += 0.08;
      drawArms(state, state.walkPhase, true);

      if (state.mode === "sitting_central" && Math.random() < 0.15) {
        const colors = [0x00b4a6, 0xf97316, 0xfacc15, 0xa3e635];
        spawnParticle(
          state.container.x + (Math.random() - 0.5) * 18,
          state.container.y - 18,
          colors[Math.floor(Math.random() * colors.length)],
        );
      }
    }
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

  // Active agents list
  const active = agents.filter((a) => a.mode === "sitting_central" || a.mode === "walking");
  if (active.length === 0) {
    activeAgentsList.innerHTML = `
      <div style="font-size: 11px; color: var(--muted); padding: 10px; text-align: center;">
        Ningún agente trabajando aún
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

// ─── /api/state polling ──────────────────────────────────────────────────────

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    offlineBadge.classList.remove("show");

    // Branch + head
    if (state.repo) {
      branchName.textContent = state.repo.branch;
      headHash.textContent = state.repo.head;
    }

    // Stats
    statCommits.textContent = String(state.commits?.length ?? 0);
    statFiles.textContent = String(state.modified?.length ?? 0);

    // Archivos reales para los file bubbles
    const allFiles = new Set();
    for (const c of state.commits ?? []) {
      for (const f of c.files ?? []) allFiles.add(f);
    }
    for (const m of state.modified ?? []) allFiles.add(m.path);
    realProjectFiles = Array.from(allFiles).slice(0, 40);

    // Agentes reales derivados del último commit
    realActiveAgentIds = state.currentAgentTeam ?? [];

    // Render commits en el sidebar
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

// Fetch inmediato + polling cada 10s
fetchState();
setInterval(fetchState, 10_000);

// ─── Actions ─────────────────────────────────────────────────────────────────

document.getElementById("btn-assign").addEventListener("click", () => {
  // Si hay agentes reales del último commit, lanzarlos a ellos
  const pickedIds = realActiveAgentIds.length > 0 ? realActiveAgentIds : null;
  launchAgentTeam(pickedIds).catch((e) => console.error("[AgentHQ] launch failed", e));
});
document.getElementById("btn-reset").addEventListener("click", () => {
  sendTeamHome().catch((e) => console.error("[AgentHQ] send home failed", e));
});

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
  officeLayer.removeChildren();
  for (let i = 0; i < AGENTS.length; i++) {
    const office = drawPrivateOffice(layout.offices[i], AGENTS[i]);
    officeLayer.addChild(office);
  }
  drawCentralRoom();

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

// ─── Auto-launch ─────────────────────────────────────────────────────────────

setInterval(() => {
  if (currentTeam.length === 0) {
    launchAgentTeam(realActiveAgentIds.length > 0 ? realActiveAgentIds : null).catch(() => {});
  }
}, 25000);

// ─── Init ────────────────────────────────────────────────────────────────────

drawBackground();
for (let i = 0; i < AGENTS.length; i++) {
  const office = drawPrivateOffice(layout.offices[i], AGENTS[i]);
  officeLayer.addChild(office);
}
drawCentralRoom();
spawnAgents();
updateSidebarStats();

console.log("[AgentHQ v3] 🏢 Dashboard listo · 19 agentes · 15 mesas · conectado a /api/state");
