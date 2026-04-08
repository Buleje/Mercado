/**
 * game.js v2 — Agent HQ (Bodega San Martín)
 *
 * Cada uno de los 19 agentes tiene su propia oficina privada (silla,
 * escritorio con monitor, cuadros en la pared, planta, lámpara, nameplate
 * con su nombre). Hay una sala central grande en el medio con 8 escritorios.
 * Cuando se lanza un Agent Team, 4 agentes elegidos se levantan de sus
 * oficinas, caminan con tweens GSAP hasta la sala central, se sientan en
 * un escritorio libre y trabajan (con el nombre del archivo flotando
 * sobre la cabeza). Al terminar (o al hacer RESET), vuelven a su oficina.
 *
 * Stack:
 *   - PixiJS 8 (sprites + graphics)
 *   - GSAP 3 (tweens fluidos con easing)
 *   - Sin dependencias npm — todo por CDN
 */

/* global PIXI, gsap */

// ─── Agent definitions ───────────────────────────────────────────────────────

const AGENTS = [
  { id: "initiative-orchestrator",  name: "Initiative Orch.",  shortRole: "Meta",        area: "orch",   special: true },
  { id: "director-orchestrator",    name: "Director",          shortRole: "Coordina",    area: "orch"   },
  { id: "solution-architect",       name: "Architect",         shortRole: "Diseña",      area: "orch"   },
  { id: "database-engineer",        name: "Database Eng.",     shortRole: "SQL",         area: "db"     },
  { id: "migration-planner",        name: "Migration",         shortRole: "Migrate",     area: "db"     },
  { id: "backend-platform-engineer",name: "Backend Eng.",      shortRole: "API",         area: "back"   },
  { id: "frontend-engineer",        name: "Frontend Eng.",     shortRole: "React",       area: "front"  },
  { id: "checkout-specialist",      name: "Checkout Sp.",      shortRole: "Pagos",       area: "front"  },
  { id: "mobile-engineer",          name: "Mobile Eng.",       shortRole: "iOS/And",     area: "mobile" },
  { id: "product-uiux-strategist",  name: "UX Strat.",         shortRole: "Flujos",      area: "prod"   },
  { id: "qa-reliability-engineer",  name: "QA Eng.",           shortRole: "Tests",       area: "qa"     },
  { id: "bug-hunter",               name: "Bug Hunter",        shortRole: "Caza bugs",   area: "qa"     },
  { id: "code-reviewer",            name: "Reviewer",          shortRole: "Review",      area: "qa"     },
  { id: "security-auditor",         name: "Sec. Auditor",      shortRole: "OWASP",       area: "sec"    },
  { id: "refactoring-expert",       name: "Refactor",          shortRole: "Clean",       area: "qa"     },
  { id: "integration-specialist",   name: "Integration",       shortRole: "WhatsApp",    area: "integ"  },
  { id: "devops-release-engineer",  name: "DevOps",            shortRole: "Deploy",      area: "devops" },
  { id: "performance-engineer",     name: "Perf Eng.",         shortRole: "CWV",         area: "perf"   },
  { id: "data-analyst",             name: "Data Analyst",      shortRole: "KPIs",        area: "data"   },
];

const AREA_COLORS = {
  orch:   { shirt: 0x00b4a6, pants: 0x005e58, accent: 0xf97316, wall: 0x1a3a36 },
  db:     { shirt: 0x2dd4bf, pants: 0x115e59, accent: 0x67e8f9, wall: 0x0f2d2a },
  back:   { shirt: 0x60a5fa, pants: 0x1e40af, accent: 0x93c5fd, wall: 0x15214a },
  front:  { shirt: 0xc084fc, pants: 0x6b21a8, accent: 0xddd6fe, wall: 0x2b1a3d },
  mobile: { shirt: 0x67e8f9, pants: 0x0e7490, accent: 0xa5f3fc, wall: 0x0e2a35 },
  prod:   { shirt: 0xf472b6, pants: 0x9d174d, accent: 0xfbcfe8, wall: 0x3d1a2c },
  qa:     { shirt: 0xa3e635, pants: 0x4d7c0f, accent: 0xd9f99d, wall: 0x1f2a0f },
  sec:    { shirt: 0xf87171, pants: 0x991b1b, accent: 0xfca5a5, wall: 0x3d1717 },
  integ:  { shirt: 0xfacc15, pants: 0x854d0e, accent: 0xfef08a, wall: 0x3a2a0a },
  devops: { shirt: 0xfb923c, pants: 0x9a3412, accent: 0xfed7aa, wall: 0x3a2010 },
  perf:   { shirt: 0x34d399, pants: 0x065f46, accent: 0x6ee7b7, wall: 0x0e2e22 },
  data:   { shirt: 0x86efac, pants: 0x166534, accent: 0xbbf7d0, wall: 0x152e1d },
};

const SKIN = 0xfbcfa0;

// Archivos reales del proyecto que los agentes "trabajan"
const PROJECT_FILES = [
  "lib/db/delivery.db.ts",
  "lib/db/chat.db.ts",
  "components/admin/ChatTab/index.tsx",
  "components/admin/DeliveryTab/LiveMap.tsx",
  "app/api/admin/chat/threads/route.ts",
  "app/api/track/[orderId]/route.ts",
  "prisma/schema.prisma",
  "lib/queue/chat-notifications-worker.ts",
  "lib/queue/delivery-notifications-worker.ts",
  "lib/integrations/whatsapp-chat-templates.ts",
  "components/checkout/CheckoutModal.tsx",
  "app/admin/_components/TabRouter.tsx",
  "lib/feature-flags.ts",
  "__tests__/chat-db.test.ts",
  "__tests__/delivery-db.test.ts",
  "docs/adr/012-chat-polling-vs-realtime.md",
  "middleware.ts",
  "lib/cache.ts",
  "lib/db/orders.db.ts",
  "app/api/chat/public/route.ts",
  "components/CartSidebar.tsx",
  "app/admin/page.tsx",
];

// ─── App setup ────────────────────────────────────────────────────────────────

const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x070a18,
  antialias: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});

document.getElementById("game").appendChild(app.canvas);
app.canvas.style.imageRendering = "pixelated";
document.getElementById("loading").classList.add("hide");

// ─── Layers ──────────────────────────────────────────────────────────────────

const bgLayer = new PIXI.Container();
const officeLayer = new PIXI.Container();
const centralRoomLayer = new PIXI.Container();
const agentLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();
app.stage.addChild(bgLayer, officeLayer, centralRoomLayer, agentLayer, fxLayer);

// ─── Layout ──────────────────────────────────────────────────────────────────

let layout = computeLayout();

function computeLayout() {
  const w = app.screen.width;
  const h = app.screen.height;
  const officeW = Math.max(170, Math.min(210, Math.floor((w - 80) / 7)));
  const officeH = Math.max(110, Math.min(140, Math.floor(officeW * 0.7)));
  const gap = 12;
  const topMargin = 90;
  const bottomMargin = 90;

  // Central room en el medio
  const centerW = Math.min(w * 0.44, 680);
  const centerH = Math.min(h * 0.42, 380);
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

  // Side columns: 3 cada lado (6 total)
  const sideCount = 3;
  const sideTotalH = sideCount * officeH + (sideCount - 1) * gap;
  const sideStartY = (h - sideTotalH) / 2;
  const leftX = 20;
  const rightX = w - officeW - 20;

  const offices = [];
  // Top row
  for (let i = 0; i < topCount; i++) {
    offices.push({ x: topStartX + i * (officeW + gap), y: topY, w: officeW, h: officeH });
  }
  // Left column
  for (let i = 0; i < sideCount; i++) {
    offices.push({ x: leftX, y: sideStartY + i * (officeH + gap), w: officeW, h: officeH });
  }
  // Right column
  for (let i = 0; i < sideCount; i++) {
    offices.push({ x: rightX, y: sideStartY + i * (officeH + gap), w: officeW, h: officeH });
  }
  // Bottom row
  for (let i = 0; i < botCount; i++) {
    offices.push({ x: botStartX + i * (officeW + gap), y: botY, w: officeW, h: officeH });
  }
  // Total: 6 + 3 + 3 + 7 = 19

  // 8 central desks en grid 4x2 dentro de la sala central
  const deskMarginX = 80;
  const deskMarginY = 60;
  const dw = (centerW - 2 * deskMarginX) / 3; // 4 columnas
  const dh = (centerH - 2 * deskMarginY);      // 2 filas
  const centralDesks = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      centralDesks.push({
        x: centerX + deskMarginX + col * dw,
        y: centerY + deskMarginY + row * (dh / 2 + 20),
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

  // Grid sutil de oficina
  for (let x = 0; x < w; x += 40) {
    g.moveTo(x, 0).lineTo(x, h).stroke({ color: 0x101630, width: 1 });
  }
  for (let y = 0; y < h; y += 40) {
    g.moveTo(0, y).lineTo(w, y).stroke({ color: 0x101630, width: 1 });
  }
  bgLayer.addChild(g);
}

// ─── Private offices ─────────────────────────────────────────────────────────

function drawPrivateOffice(office, agentData) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const c = new PIXI.Container();
  c.x = office.x;
  c.y = office.y;

  const g = new PIXI.Graphics();

  // Piso (gradiente fake con 2 rects)
  g.rect(0, 0, office.w, office.h).fill(0x151a30);
  g.rect(2, 2, office.w - 4, office.h - 4).fill(colors.wall);

  // Línea horizontal del "rodapié"
  g.rect(0, office.h - 20, office.w, 4).fill(0x0a0d1c);

  // Cuadros en la pared (2 cuadros random con colores del área)
  const pic1x = 14;
  const pic1y = 10;
  g.rect(pic1x, pic1y, 14, 10).fill(0x000000);
  g.rect(pic1x + 1, pic1y + 1, 12, 8).fill(colors.accent);
  g.rect(pic1x + 3, pic1y + 3, 8, 4).fill(colors.shirt);

  const pic2x = 34;
  const pic2y = 10;
  g.rect(pic2x, pic2y, 16, 10).fill(0x000000);
  g.rect(pic2x + 1, pic2y + 1, 14, 8).fill(0x1f2937);
  // "wifi bars" en el segundo cuadro
  g.rect(pic2x + 3, pic2y + 6, 2, 2).fill(colors.accent);
  g.rect(pic2x + 6, pic2y + 4, 2, 4).fill(colors.accent);
  g.rect(pic2x + 9, pic2y + 2, 2, 6).fill(colors.accent);

  // Escritorio al fondo (mesa horizontal)
  const deskY = office.h - 48;
  g.rect(office.w / 2 - 28, deskY, 56, 10).fill(0x78350f);
  g.rect(office.w / 2 - 28, deskY, 56, 2).fill(0x92400e);
  // Monitor
  g.rect(office.w / 2 - 10, deskY - 14, 20, 12).fill(0x1f2937);
  g.rect(office.w / 2 - 9,  deskY - 13, 18, 10).fill(colors.shirt);
  // "Código" en el monitor
  g.rect(office.w / 2 - 7, deskY - 11, 10, 1).fill(0x000000);
  g.rect(office.w / 2 - 7, deskY - 9,  8, 1).fill(0x000000);
  g.rect(office.w / 2 - 7, deskY - 7,  6, 1).fill(0x000000);
  // Base del monitor
  g.rect(office.w / 2 - 2, deskY - 2, 4, 2).fill(0x374151);

  // Planta a la derecha del escritorio
  const plantX = office.w - 24;
  const plantY = office.h - 38;
  g.rect(plantX, plantY, 10, 8).fill(0x92400e);
  g.rect(plantX + 1, plantY + 1, 8, 1).fill(0x78350f);
  // Hojas
  g.circle(plantX + 5, plantY - 4, 5).fill(0x16a34a);
  g.circle(plantX + 2, plantY - 2, 3).fill(0x22c55e);
  g.circle(plantX + 8, plantY - 2, 3).fill(0x16a34a);

  // Lámpara a la izquierda
  const lampX = 16;
  const lampY = office.h - 50;
  g.rect(lampX, lampY, 2, 14).fill(0x374151); // poste
  g.rect(lampX - 3, lampY - 2, 8, 3).fill(0xfacc15); // pantalla
  // Halo de luz
  g.circle(lampX + 1, lampY + 2, 12).fill({ color: 0xfacc15, alpha: 0.08 });

  // Silla (vista frontal, detrás del escritorio)
  const chairX = office.w / 2;
  const chairY = office.h - 30;
  g.rect(chairX - 6, chairY, 12, 4).fill(0x1f2937); // asiento
  g.rect(chairX - 7, chairY - 10, 14, 10).fill(0x374151); // respaldo

  // Nameplate en la parte de arriba (la "puerta")
  g.rect(2, 0, office.w - 4, 18).fill(0x000000);
  g.rect(3, 1, office.w - 6, 16).fill(colors.shirt);
  g.rect(3, 1, office.w - 6, 2).fill(colors.accent);

  c.addChild(g);

  // Nombre del agente (PIXI.Text)
  const name = new PIXI.Text({
    text: agentData.name.toUpperCase(),
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 9,
      fontWeight: "bold",
      fill: 0x000000,
      letterSpacing: 0.5,
    },
  });
  name.anchor.set(0.5, 0.5);
  name.x = office.w / 2;
  name.y = 9;
  c.addChild(name);

  return c;
}

// ─── Central room ────────────────────────────────────────────────────────────

function drawCentralRoom() {
  centralRoomLayer.removeChildren();
  const r = layout.centralRoom;
  const g = new PIXI.Graphics();

  // Borde "sala" con color más cálido (teal dashboard color)
  g.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8).fill(0x0a0d1c);
  g.rect(r.x, r.y, r.w, r.h).fill(0x1a2a48);

  // Pattern de piso diagonal
  for (let i = -r.h; i < r.w + r.h; i += 24) {
    g.moveTo(r.x + i, r.y).lineTo(r.x + i + r.h, r.y + r.h).stroke({ color: 0x223358, width: 1 });
  }

  // "WAR ROOM" header
  g.rect(r.x + r.w / 2 - 60, r.y - 2, 120, 4).fill(0xf97316);

  // 8 escritorios en 4x2
  for (const desk of layout.centralDesks) {
    // Mesa grande
    g.rect(desk.x - 20, desk.y, 40, 12).fill(0x78350f);
    g.rect(desk.x - 20, desk.y, 40, 3).fill(0x92400e);
    // Monitor
    g.rect(desk.x - 8, desk.y - 14, 16, 10).fill(0x1f2937);
    g.rect(desk.x - 7, desk.y - 13, 14, 8).fill(0x00b4a6);
    // Base
    g.rect(desk.x - 2, desk.y - 2, 4, 2).fill(0x374151);
    // "Teclado"
    g.rect(desk.x - 6, desk.y + 6, 12, 2).fill(0x4b5563);
  }

  centralRoomLayer.addChild(g);

  // Label "WAR ROOM"
  const label = new PIXI.Text({
    text: "◆ WAR ROOM · AGENT TEAM ◆",
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xf97316,
      letterSpacing: 2,
    },
  });
  label.anchor.set(0.5, 1);
  label.x = r.x + r.w / 2;
  label.y = r.y - 6;
  centralRoomLayer.addChild(label);
}

// ─── Agent sprite ────────────────────────────────────────────────────────────

function createAgentSprite(agentData, officeIdx) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const c = new PIXI.Container();
  c.eventMode = "static";
  c.cursor = "pointer";

  // Sombra
  const shadow = new PIXI.Graphics();
  shadow.ellipse(0, 14, 8, 3).fill({ color: 0x000000, alpha: 0.4 });
  c.addChild(shadow);

  // Legs
  const legsG = new PIXI.Graphics();
  c.addChild(legsG);

  // Body
  const bodyG = new PIXI.Graphics();
  bodyG.rect(-4, -4, 8, 8).fill(colors.shirt);
  bodyG.rect(-4, -4, 8, 2).fill(colors.accent);
  c.addChild(bodyG);

  // Arms
  const armsG = new PIXI.Graphics();
  c.addChild(armsG);

  // Head
  const headG = new PIXI.Graphics();
  headG.rect(-3, -12, 6, 6).fill(SKIN);
  headG.rect(-3, -12, 6, 2).fill(0x1f2937); // pelo
  headG.rect(-3, -11, 1, 1).fill(0x1f2937);
  headG.rect(2, -11, 1, 1).fill(0x1f2937);
  headG.rect(-2, -9, 1, 1).fill(0x000000); // ojos
  headG.rect(1, -9, 1, 1).fill(0x000000);
  c.addChild(headG);

  // Corona si es special (initiative-orchestrator)
  if (agentData.special) {
    const crown = new PIXI.Graphics();
    crown.rect(-3, -15, 6, 1).fill(0xfacc15);
    crown.rect(-3, -16, 1, 1).fill(0xfacc15);
    crown.rect(-1, -16, 1, 1).fill(0xfacc15);
    crown.rect(1, -16, 1, 1).fill(0xfacc15);
    c.addChild(crown);
  }

  c.hitArea = new PIXI.Rectangle(-10, -18, 20, 34);
  c.scale.set(1.6);

  // Etiqueta del rol sobre la cabeza (siempre visible)
  const roleLabel = new PIXI.Text({
    text: agentData.shortRole,
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 8,
      fontWeight: "bold",
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, join: "round" },
      letterSpacing: 0.3,
    },
  });
  roleLabel.anchor.set(0.5, 1);
  roleLabel.y = -20;
  roleLabel.scale.set(0.7);
  c.addChild(roleLabel);

  // Bubble de "archivo trabajando" (escondido por default)
  const fileLabelBg = new PIXI.Graphics();
  fileLabelBg.visible = false;
  c.addChild(fileLabelBg);

  const fileLabel = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Courier New, monospace",
      fontSize: 7,
      fontWeight: "bold",
      fill: 0xf97316,
      stroke: { color: 0x000000, width: 3, join: "round" },
    },
  });
  fileLabel.anchor.set(0.5, 1);
  fileLabel.y = -30;
  fileLabel.scale.set(0.75);
  fileLabel.visible = false;
  c.addChild(fileLabel);

  // Estado interno
  const state = {
    data: agentData,
    colors,
    container: c,
    bodyG, armsG, legsG, headG, shadow,
    fileLabel, fileLabelBg, roleLabel,
    officeIdx,
    officeRect: layout.offices[officeIdx],
    mode: "sitting_home", // sitting_home | walking | sitting_central | reacting
    walkPhase: Math.random() * Math.PI * 2,
    currentDesk: null,
    reactTimer: 0,
  };

  // Event handlers
  c.on("pointerover", () => { showTooltip(state); c.scale.set(1.9); });
  c.on("pointerout", () => { hideTooltip(); c.scale.set(1.6); });
  c.on("pointermove", (e) => moveTooltip(e));

  // Posición inicial: sentado en la silla de su oficina
  const sitPos = homeOfficeSitPosition(state.officeRect);
  c.x = sitPos.x;
  c.y = sitPos.y;
  drawLegs(state, 0, /* sitting */ true);
  drawArms(state, 0, /* sitting */ true);

  return state;
}

function homeOfficeSitPosition(office) {
  // En su silla, centrado horizontalmente, un poco más abajo que el centro
  return {
    x: office.x + office.w / 2,
    y: office.y + office.h - 36,
  };
}

function homeOfficeDoorPosition(office) {
  // Salida: abajo-centro de la oficina
  return {
    x: office.x + office.w / 2,
    y: office.y + office.h - 4,
  };
}

function drawLegs(state, phase, sitting) {
  const g = state.legsG;
  g.clear();
  const c = state.colors.pants;
  if (sitting) return; // sentado no muestra piernas
  const lOff = Math.sin(phase) * 2;
  const rOff = -Math.sin(phase) * 2;
  g.rect(-3, 4, 2, 6 + lOff).fill(c);
  g.rect(1,  4, 2, 6 + rOff).fill(c);
}

function drawArms(state, phase, sitting) {
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  if (sitting) {
    // brazos adelante (sobre el escritorio/teclado)
    const off = Math.sin(phase * 3) * 0.8;
    g.rect(-6, -3 + off, 2, 5).fill(c);
    g.rect(4,  -3 - off, 2, 5).fill(c);
    return;
  }
  const lOff = -Math.sin(phase) * 2;
  const rOff = Math.sin(phase) * 2;
  g.rect(-6, -3 + lOff, 2, 6).fill(c);
  g.rect(4,  -3 + rOff, 2, 6).fill(c);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

const agents = [];
let totalTasks = 0;
const centralOccupancy = new Array(8).fill(null); // idx de agent o null

function spawnAgents() {
  agents.length = 0;
  agentLayer.removeChildren();
  for (let i = 0; i < AGENTS.length; i++) {
    const s = createAgentSprite(AGENTS[i], i);
    agents.push(s);
    agentLayer.addChild(s.container);
  }
}

// ─── Tween helpers (GSAP) ────────────────────────────────────────────────────

/**
 * Mueve un agente del punto actual al target con GSAP, animando legs/arms
 * mientras está en ruta. Resuelve cuando llega.
 */
function tweenAgentTo(state, targetX, targetY, duration = 1.6) {
  return new Promise((resolve) => {
    state.mode = "walking";
    // Flip según dirección
    state.container.scale.x = targetX < state.container.x ? -1.6 : 1.6;

    const walkPhaseTicker = { value: state.walkPhase };
    const walkTween = gsap.to(walkPhaseTicker, {
      value: walkPhaseTicker.value + Math.PI * 2 * (duration * 2),
      duration,
      ease: "none",
      onUpdate: () => {
        state.walkPhase = walkPhaseTicker.value;
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

async function launchAgentTeam() {
  // Si ya hay team trabajando, primero mandarlos a casa
  if (currentTeam.length > 0) {
    await sendTeamHome();
  }

  // Elegir 4 agentes random disponibles
  const available = agents.filter((a) => a.mode === "sitting_home");
  const picked = [];
  const pool = [...available];
  for (let i = 0; i < 4 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  currentTeam = picked;
  totalTasks += picked.length;
  updateStats();

  // Asignar desks
  const freeDesks = [];
  for (let i = 0; i < centralOccupancy.length; i++) {
    if (centralOccupancy[i] === null) freeDesks.push(i);
  }

  // Cada uno hace: standup → door → walk to central → sit
  const promises = picked.map(async (state, n) => {
    if (n >= freeDesks.length) return;
    const deskIdx = freeDesks[n];
    centralOccupancy[deskIdx] = state.data.id;
    state.currentDesk = deskIdx;

    // Stagger del inicio para que no salgan todos a la vez
    await new Promise((r) => setTimeout(r, n * 250));

    // 1. Caminar de la silla a la puerta de su oficina
    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 0.6);

    // 2. Caminar desde la puerta al desk central
    const desk = layout.centralDesks[deskIdx];
    // Punto "sentado": justo detrás del desk
    const sitX = desk.x;
    const sitY = desk.y - 4;
    await tweenAgentTo(state, sitX, sitY, 1.4 + Math.random() * 0.6);

    // 3. Sentarse y empezar a trabajar
    state.mode = "sitting_central";
    drawLegs(state, 0, true);
    drawArms(state, 0, true);
    showWorkingFile(state);
  });

  await Promise.all(promises);
  updateStats();
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

    await new Promise((r) => setTimeout(r, n * 200));

    // 1. Salir del central room hacia la puerta de su oficina
    const door = homeOfficeDoorPosition(state.officeRect);
    await tweenAgentTo(state, door.x, door.y, 1.4 + Math.random() * 0.4);

    // 2. De la puerta a la silla
    const sit = homeOfficeSitPosition(state.officeRect);
    await tweenAgentTo(state, sit.x, sit.y, 0.6);

    // 3. Sentarse
    state.mode = "sitting_home";
    drawLegs(state, 0, true);
    drawArms(state, 0, true);
  });

  await Promise.all(promises);
  updateStats();
}

// ─── Working file bubbles ────────────────────────────────────────────────────

function showWorkingFile(state) {
  const file = PROJECT_FILES[Math.floor(Math.random() * PROJECT_FILES.length)];
  state.fileLabel.text = file;
  state.fileLabel.visible = true;

  // Bubble background (dibujado según el ancho del texto)
  const w = state.fileLabel.width + 6;
  const h = state.fileLabel.height + 4;
  const bg = state.fileLabelBg;
  bg.clear();
  bg.roundRect(-w / 2 - 0.5, -30 - h - 2, w + 1, h + 1, 2).fill(0x000000);
  bg.roundRect(-w / 2, -30 - h, w, h, 2).fill(0x111827);
  bg.rect(-w / 2, -30 - h, w, 1).fill(0xf97316);
  // Tail (tiny triangle pointing down)
  bg.moveTo(-2, -30).lineTo(2, -30).lineTo(0, -28).lineTo(-2, -30).fill(0x111827);
  bg.visible = true;

  // Fade in
  bg.alpha = 0;
  state.fileLabel.alpha = 0;
  gsap.to([bg, state.fileLabel], { alpha: 1, duration: 0.4, ease: "power1.out" });

  // Cambiar el archivo cada cierto tiempo para dar vida
  if (state._fileInterval) clearInterval(state._fileInterval);
  state._fileInterval = setInterval(() => {
    if (state.mode !== "sitting_central") return;
    const newFile = PROJECT_FILES[Math.floor(Math.random() * PROJECT_FILES.length)];
    gsap.to([bg, state.fileLabel], {
      alpha: 0,
      duration: 0.2,
      onComplete: () => {
        state.fileLabel.text = newFile;
        const nw = state.fileLabel.width + 6;
        const nh = state.fileLabel.height + 4;
        bg.clear();
        bg.roundRect(-nw / 2 - 0.5, -30 - nh - 2, nw + 1, nh + 1, 2).fill(0x000000);
        bg.roundRect(-nw / 2, -30 - nh, nw, nh, 2).fill(0x111827);
        bg.rect(-nw / 2, -30 - nh, nw, 1).fill(0xf97316);
        bg.moveTo(-2, -30).lineTo(2, -30).lineTo(0, -28).lineTo(-2, -30).fill(0x111827);
        gsap.to([bg, state.fileLabel], { alpha: 1, duration: 0.3 });
      },
    });
  }, 3000 + Math.random() * 3000);
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
  g.rect(-1, -1, 2, 2).fill(color);
  g.x = x;
  g.y = y;
  fxLayer.addChild(g);
  particles.push({
    g,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -1 - Math.random() * 1.5,
    life: 40 + Math.random() * 20,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.g.x += p.vx;
    p.g.y += p.vy;
    p.vy += 0.08;
    p.life--;
    p.g.alpha = Math.max(0, p.life / 50);
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

      // Particles cuando trabaja en central room
      if (state.mode === "sitting_central" && Math.random() < 0.12) {
        const colors = [0x00b4a6, 0xf97316, 0xfacc15, 0xa3e635];
        spawnParticle(
          state.container.x + (Math.random() - 0.5) * 14,
          state.container.y - 14,
          colors[Math.floor(Math.random() * colors.length)],
        );
      }

      // Bob sutil
      const bob = Math.sin(state.walkPhase * 0.8) * 0.3;
      // Solo aplicar si no está siendo tweenseado activamente
      if (state._lastY !== undefined) {
        state.container.y = state._lastY + bob;
      } else {
        state._lastY = state.container.y;
      }
    } else if (state.mode !== "walking") {
      // idle en tránsito, nada
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
  tooltipEl.style.left = Math.min(x + 14, window.innerWidth - 260) + "px";
  tooltipEl.style.top = Math.min(y + 14, window.innerHeight - 80) + "px";
}

function statusText(state) {
  if (state.mode === "sitting_central") {
    return "● EN WAR ROOM · " + (state.fileLabel.text || "trabajando");
  }
  if (state.mode === "walking") return "▶ EN TRÁNSITO";
  if (state.mode === "sitting_home") return "○ EN SU OFICINA · DISPONIBLE";
  return "";
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

const statTotal = document.getElementById("stat-total");
const statWorking = document.getElementById("stat-working");
const statTasks = document.getElementById("stat-tasks");
const clockEl = document.getElementById("clock");

function updateStats() {
  statTotal.textContent = String(agents.length);
  const working = agents.filter((a) => a.mode === "sitting_central" || a.mode === "walking").length;
  statWorking.textContent = String(working);
  statTasks.textContent = String(totalTasks);
  if (hoveredState) tooltipStatus.textContent = statusText(hoveredState);
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
tickClock();
setInterval(tickClock, 1000);
setInterval(updateStats, 250);

// ─── Actions ─────────────────────────────────────────────────────────────────

document.getElementById("btn-assign").addEventListener("click", () => {
  launchAgentTeam().catch((e) => console.error("[AgentHQ] launch failed", e));
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
  }, 200);
});

function rebuildScene() {
  drawBackground();

  // Redibujar oficinas
  officeLayer.removeChildren();
  for (let i = 0; i < AGENTS.length; i++) {
    const office = drawPrivateOffice(layout.offices[i], AGENTS[i]);
    officeLayer.addChild(office);
  }

  drawCentralRoom();

  // Actualizar posiciones de agentes según su estado
  for (const s of agents) {
    s.officeRect = layout.offices[s.officeIdx];
    if (s.mode === "sitting_home") {
      const sit = homeOfficeSitPosition(s.officeRect);
      s.container.x = sit.x;
      s.container.y = sit.y;
      s._lastY = sit.y;
    } else if (s.mode === "sitting_central" && s.currentDesk !== null) {
      const desk = layout.centralDesks[s.currentDesk];
      s.container.x = desk.x;
      s.container.y = desk.y - 4;
      s._lastY = desk.y - 4;
    }
  }
}

// ─── Auto-launch cada 20s para mantener el mundo vivo ──────────────────────

setInterval(() => {
  if (currentTeam.length === 0) {
    launchAgentTeam().catch(() => {});
  }
}, 20000);

// ─── Init ────────────────────────────────────────────────────────────────────

drawBackground();
// Dibujar oficinas
for (let i = 0; i < AGENTS.length; i++) {
  const office = drawPrivateOffice(layout.offices[i], AGENTS[i]);
  officeLayer.addChild(office);
}
drawCentralRoom();
spawnAgents();
updateStats();

console.log("[AgentHQ v2] 🏢 Dashboard listo · 19 agentes en sus oficinas · lanzá un team con el botón");
