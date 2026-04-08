/**
 * game.js — Dashboard pixel-art de agentes con PixiJS 8
 *
 * Sin assets externos. Todos los sprites se dibujan programáticamente con
 * Graphics (rectángulos 1px). 19 agentes caminan por una oficina pixel,
 * se sientan en escritorios cuando trabajan, emiten partículas, y reaccionan
 * cuando les hacés click.
 *
 * PixiJS se carga desde CDN en el index.html.
 */

/* global PIXI */

const AGENTS = [
  { id: "initiative-orchestrator",  name: "Initiative Orchestrator",  role: "Meta-orquestador enterprise",   area: "orch",  special: true },
  { id: "director-orchestrator",    name: "Director Orchestrator",    role: "Director medio (2-4 áreas)",    area: "orch" },
  { id: "solution-architect",       name: "Solution Architect",       role: "Arquitectura de alto impacto",  area: "orch" },
  { id: "database-engineer",        name: "Database Engineer",        role: "Prisma + Supabase + índices",   area: "db" },
  { id: "migration-planner",        name: "Migration Planner",        role: "Planes de migración seguros",   area: "db" },
  { id: "backend-platform-engineer",name: "Backend Platform Engineer",role: "Routes + Auth + DB classes",    area: "back" },
  { id: "frontend-engineer",        name: "Frontend Engineer",        role: "React + Tailwind + a11y",       area: "front" },
  { id: "checkout-specialist",      name: "Checkout Specialist",      role: "CheckoutModal + Pagos",         area: "front" },
  { id: "mobile-engineer",          name: "Mobile Engineer",          role: "Capacitor iOS/Android",         area: "mobile" },
  { id: "product-uiux-strategist",  name: "Product UI/UX Strategist", role: "Flujos y jerarquía visual",     area: "prod" },
  { id: "qa-reliability-engineer",  name: "QA Reliability Engineer",  role: "Tests + Coverage + e2e",        area: "qa" },
  { id: "bug-hunter",               name: "Bug Hunter",               role: "Detección proactiva",           area: "qa" },
  { id: "code-reviewer",            name: "Code Reviewer",            role: "Review pre-merge",              area: "qa" },
  { id: "security-auditor",         name: "Security Auditor",         role: "OWASP + Multi-tenant",          area: "sec" },
  { id: "refactoring-expert",       name: "Refactoring Expert",       role: "Clean code + SOLID",            area: "qa" },
  { id: "integration-specialist",   name: "Integration Specialist",   role: "WhatsApp + SUNAT + Stripe",     area: "integ" },
  { id: "devops-release-engineer",  name: "DevOps Release Engineer",  role: "Deploy + Sentry + Crons",       area: "devops" },
  { id: "performance-engineer",     name: "Performance Engineer",     role: "Core Web Vitals + Bundle",      area: "perf" },
  { id: "data-analyst",             name: "Data Analyst",             role: "KPIs + Dashboards",             area: "data" },
];

const AREA_COLORS = {
  orch:   { shirt: 0x00b4a6, pants: 0x005e58, accent: 0xf97316 }, // teal + orange
  db:     { shirt: 0x2dd4bf, pants: 0x115e59, accent: 0x67e8f9 },
  back:   { shirt: 0x60a5fa, pants: 0x1e40af, accent: 0x93c5fd },
  front:  { shirt: 0xc084fc, pants: 0x6b21a8, accent: 0xddd6fe },
  mobile: { shirt: 0x67e8f9, pants: 0x0e7490, accent: 0xa5f3fc },
  prod:   { shirt: 0xf472b6, pants: 0x9d174d, accent: 0xfbcfe8 },
  qa:     { shirt: 0xa3e635, pants: 0x4d7c0f, accent: 0xd9f99d },
  sec:    { shirt: 0xf87171, pants: 0x991b1b, accent: 0xfca5a5 },
  integ:  { shirt: 0xfacc15, pants: 0x854d0e, accent: 0xfef08a },
  devops: { shirt: 0xfb923c, pants: 0x9a3412, accent: 0xfed7aa },
  perf:   { shirt: 0x34d399, pants: 0x065f46, accent: 0x6ee7b7 },
  data:   { shirt: 0x86efac, pants: 0x166534, accent: 0xbbf7d0 },
};

const SKIN = 0xfbcfa0;

// ─── App setup ────────────────────────────────────────────────────────────────

const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x0b0e1a,
  antialias: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
// Hacer que PIXI use nearest para mantener el look pixel-art al escalar
if (app.renderer && app.renderer.textureGC) {
  // no-op, Graphics no usa texturas caché
}

document.getElementById("game").appendChild(app.canvas);

// Crisp pixels
app.canvas.style.imageRendering = "pixelated";

// Esconder loading
document.getElementById("loading").classList.add("hide");

// ─── Background scene (grid + desks) ──────────────────────────────────────────

const bgLayer = new PIXI.Container();
const deskLayer = new PIXI.Container();
const agentLayer = new PIXI.Container();
const particleLayer = new PIXI.Container();
app.stage.addChild(bgLayer);
app.stage.addChild(deskLayer);
app.stage.addChild(agentLayer);
app.stage.addChild(particleLayer);

function drawBackground() {
  bgLayer.removeChildren();
  const g = new PIXI.Graphics();
  const w = app.screen.width;
  const h = app.screen.height;

  // Gradient background
  g.rect(0, 0, w, h).fill(0x0b0e1a);

  // Grid floor — líneas verdes oscuras cada 40px
  const gridColor = 0x1a2142;
  for (let x = 0; x < w; x += 40) {
    g.moveTo(x, 0).lineTo(x, h).stroke({ color: gridColor, width: 1 });
  }
  for (let y = 0; y < h; y += 40) {
    g.moveTo(0, y).lineTo(w, y).stroke({ color: gridColor, width: 1 });
  }

  // Gradiente radial fake con overlays circulares
  const cx = w / 2;
  const cy = h / 2;
  for (let r = 600; r > 100; r -= 100) {
    g.circle(cx, cy, r).fill({ color: 0x131833, alpha: 0.08 });
  }

  bgLayer.addChild(g);
}

// ─── Desk sprites ─────────────────────────────────────────────────────────────

const desks = [];

function spawnDesks(count) {
  deskLayer.removeChildren();
  desks.length = 0;
  const w = app.screen.width;
  const h = app.screen.height;
  const marginTop = 90;
  const marginBottom = 90;

  for (let i = 0; i < count; i++) {
    const x = 80 + Math.random() * (w - 160);
    const y = marginTop + Math.random() * (h - marginTop - marginBottom);
    const desk = drawDesk(x, y);
    deskLayer.addChild(desk);
    desks.push({ sprite: desk, x, y, occupied: null });
  }
}

function drawDesk(x, y) {
  const g = new PIXI.Graphics();
  // Mesa (vista top-down pixel)
  g.rect(-14, -4, 28, 8).fill(0x78350f); // madera
  g.rect(-14, -4, 28, 2).fill(0x92400e); // top highlight
  // Monitor
  g.rect(-6, -10, 12, 7).fill(0x1f2937); // carcasa
  g.rect(-5, -9,  10, 5).fill(0x00b4a6); // pantalla verde
  g.rect(-2, -6,   6, 1).fill(0x000000); // "texto"
  g.rect(-2, -5,   4, 1).fill(0x000000);
  // Base del monitor
  g.rect(-2, -3, 4, 1).fill(0x374151);
  g.x = x;
  g.y = y;
  return g;
}

// ─── Agent sprite factory ─────────────────────────────────────────────────────

/**
 * Crea un sprite pixel-art de un agente. El sprite es un Container que
 * contiene varios Graphics. Guardamos referencias para animar cada parte.
 */
function createAgentSprite(agentData) {
  const colors = AREA_COLORS[agentData.area] ?? AREA_COLORS.orch;
  const container = new PIXI.Container();
  container.eventMode = "static";
  container.cursor = "pointer";

  // Shadow (ellipse bajo el personaje)
  const shadow = new PIXI.Graphics();
  shadow.ellipse(0, 14, 8, 3).fill({ color: 0x000000, alpha: 0.4 });
  container.addChild(shadow);

  // Legs (dos rectángulos que se animan con walking cycle)
  const legsG = new PIXI.Graphics();
  container.addChild(legsG);

  // Body (torso con color del área)
  const bodyG = new PIXI.Graphics();
  bodyG.rect(-4, -4, 8, 8).fill(colors.shirt);
  bodyG.rect(-4, -4, 8, 2).fill(colors.accent); // banda top
  container.addChild(bodyG);

  // Arms
  const armsG = new PIXI.Graphics();
  container.addChild(armsG);

  // Head (cara pixel)
  const headG = new PIXI.Graphics();
  headG.rect(-3, -12, 6, 6).fill(SKIN);
  // Pelo
  headG.rect(-3, -12, 6, 2).fill(0x1f2937);
  headG.rect(-3, -11, 1, 1).fill(0x1f2937);
  headG.rect(2, -11, 1, 1).fill(0x1f2937);
  // Ojos
  headG.rect(-2, -9, 1, 1).fill(0x000000);
  headG.rect(1, -9, 1, 1).fill(0x000000);
  container.addChild(headG);

  // Corona (para el initiative-orchestrator — agente especial)
  if (agentData.special) {
    const crown = new PIXI.Graphics();
    crown.rect(-3, -15, 6, 1).fill(0xfacc15);
    crown.rect(-3, -16, 1, 1).fill(0xfacc15);
    crown.rect(-1, -16, 1, 1).fill(0xfacc15);
    crown.rect(1, -16, 1, 1).fill(0xfacc15);
    crown.rect(3, -16, 0, 0);
    container.addChild(crown);
  }

  // Hitbox
  container.hitArea = new PIXI.Rectangle(-8, -16, 16, 32);

  container.scale.set(2); // Zoom 2x para que se vea más grande

  // Estado interno del agente
  const state = {
    data: agentData,
    colors,
    bodyG, armsG, legsG, headG, shadow,
    x: 0, y: 0,
    vx: 0, vy: 0,
    targetX: 0,
    targetY: 0,
    walkPhase: Math.random() * Math.PI * 2,
    mode: "walking", // walking | working | reacting
    workTimer: 0,
    reactTimer: 0,
    speed: 0.6 + Math.random() * 0.6,
    desk: null,
    bobPhase: Math.random() * Math.PI * 2,
    container,
  };

  container.on("pointerover", () => showTooltip(state));
  container.on("pointerout", () => hideTooltip());
  container.on("pointermove", (e) => moveTooltip(e));
  container.on("pointertap", () => {
    assignWorkToAgent(state);
  });

  return state;
}

function drawLegs(state, phase) {
  const g = state.legsG;
  g.clear();
  const c = state.colors.pants;
  if (state.mode === "working") {
    // Sentado — no se ven las piernas
    return;
  }
  // Walking cycle
  const lOff = Math.sin(phase) * 2;
  const rOff = -Math.sin(phase) * 2;
  g.rect(-3, 4, 2, 6 + lOff).fill(c);
  g.rect(1,  4, 2, 6 + rOff).fill(c);
}

function drawArms(state, phase) {
  const g = state.armsG;
  g.clear();
  const c = state.colors.shirt;
  if (state.mode === "working") {
    // Brazos extendidos al frente
    const off = Math.sin(phase * 3) * 1;
    g.rect(-6, -3 + off, 2, 5).fill(c);
    g.rect(4,  -3 - off, 2, 5).fill(c);
    return;
  }
  // Walking arms
  const lOff = -Math.sin(phase) * 2;
  const rOff = Math.sin(phase) * 2;
  g.rect(-6, -3 + lOff, 2, 6).fill(c);
  g.rect(4,  -3 + rOff, 2, 6).fill(c);
}

// ─── World ────────────────────────────────────────────────────────────────────

const agents = [];
let totalTasks = 0;

function initWorld() {
  drawBackground();
  spawnDesks(8);

  // Crear los 19 agentes
  agents.length = 0;
  agentLayer.removeChildren();
  for (const data of AGENTS) {
    const s = createAgentSprite(data);
    agents.push(s);
    agentLayer.addChild(s.container);
    teleportToRandomPoint(s);
    pickNewTarget(s);
  }
  updateStats();
}

function teleportToRandomPoint(state) {
  const w = app.screen.width;
  const h = app.screen.height;
  state.x = 60 + Math.random() * (w - 120);
  state.y = 120 + Math.random() * (h - 240);
  state.container.x = state.x;
  state.container.y = state.y;
}

function pickNewTarget(state) {
  const w = app.screen.width;
  const h = app.screen.height;
  state.targetX = 60 + Math.random() * (w - 120);
  state.targetY = 120 + Math.random() * (h - 240);
}

function findFreeDesk() {
  for (const d of desks) {
    if (!d.occupied) return d;
  }
  return null;
}

function assignWorkToAgent(state) {
  if (state.mode === "working") return;
  const desk = findFreeDesk();
  if (!desk) {
    // No hay escritorios, hacer una reacción de "no puedo"
    reactJump(state);
    return;
  }
  desk.occupied = state.data.id;
  state.desk = desk;
  state.targetX = desk.x;
  state.targetY = desk.y - 8;
  state.mode = "walking_to_work"; // sub-estado
  totalTasks += 1;
  updateStats();
}

function assignRandomWork() {
  const idle = agents.filter((a) => a.mode === "walking" && !a.desk);
  if (idle.length === 0) return;
  const victim = idle[Math.floor(Math.random() * idle.length)];
  assignWorkToAgent(victim);
}

function resetAllWork() {
  for (const a of agents) {
    a.mode = "walking";
    a.workTimer = 0;
    if (a.desk) {
      a.desk.occupied = null;
      a.desk = null;
    }
    pickNewTarget(a);
  }
  updateStats();
}

function reactJump(state) {
  state.mode = "reacting";
  state.reactTimer = 25;
}

// ─── Particles ────────────────────────────────────────────────────────────────

const particles = [];

function spawnParticle(x, y, color) {
  const g = new PIXI.Graphics();
  g.rect(-1, -1, 2, 2).fill(color);
  g.x = x;
  g.y = y;
  particleLayer.addChild(g);
  particles.push({
    g,
    vx: (Math.random() - 0.5) * 2,
    vy: -1 - Math.random() * 2,
    life: 30 + Math.random() * 20,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.g.x += p.vx;
    p.g.y += p.vy;
    p.vy += 0.1;
    p.life--;
    p.g.alpha = Math.max(0, p.life / 40);
    if (p.life <= 0) {
      particleLayer.removeChild(p.g);
      p.g.destroy();
      particles.splice(i, 1);
    }
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

app.ticker.add(() => {
  for (const state of agents) {
    tickAgent(state);
  }
  updateParticles();
});

function tickAgent(state) {
  // Modo reacción (salto después de click cuando no puede)
  if (state.mode === "reacting") {
    state.reactTimer--;
    state.container.y = state.y - Math.abs(Math.sin(state.reactTimer * 0.25)) * 10;
    if (state.reactTimer <= 0) {
      state.mode = "walking";
      state.container.y = state.y;
    }
    return;
  }

  // Modo trabajando en un desk
  if (state.mode === "working") {
    state.workTimer--;
    state.walkPhase += 0.3;
    drawArms(state, state.walkPhase);
    // Bob leve
    const bob = Math.sin(state.walkPhase * 0.5) * 0.5;
    state.container.y = state.y + bob;

    // Particles de "código" saliendo del desk
    if (Math.random() < 0.25) {
      spawnParticle(
        state.x + (Math.random() - 0.5) * 20,
        state.y - 10,
        [0x00b4a6, 0xf97316, 0xfacc15, 0xa3e635][Math.floor(Math.random() * 4)],
      );
    }

    if (state.workTimer <= 0) {
      // Terminar trabajo
      state.mode = "walking";
      if (state.desk) {
        state.desk.occupied = null;
        state.desk = null;
      }
      pickNewTarget(state);
      updateStats();
    }
    return;
  }

  // Movimiento hacia target
  const dx = state.targetX - state.x;
  const dy = state.targetY - state.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 3) {
    // Llegó al target
    if (state.mode === "walking_to_work") {
      // Sentarse y empezar a trabajar
      state.mode = "working";
      state.workTimer = 200 + Math.random() * 300;
      updateStats();
      return;
    }
    // Elegir nuevo target al azar
    pickNewTarget(state);
    return;
  }

  // Moverse
  const nx = dx / dist;
  const ny = dy / dist;
  state.x += nx * state.speed;
  state.y += ny * state.speed;
  state.container.x = state.x;

  // Bob idle
  const bob = Math.sin(state.bobPhase) * 0.5;
  state.bobPhase += 0.15;
  state.container.y = state.y + bob;

  // Flip horizontal según dirección
  state.container.scale.x = nx < 0 ? -2 : 2;

  // Walking cycle
  state.walkPhase += 0.3;
  drawLegs(state, state.walkPhase);
  drawArms(state, state.walkPhase);
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const tooltipEl = document.getElementById("tooltip");
const tooltipName = tooltipEl.querySelector(".tt-name");
const tooltipRole = tooltipEl.querySelector(".tt-role");
const tooltipStatus = tooltipEl.querySelector(".tt-status");
let hoveredState = null;

function showTooltip(state) {
  hoveredState = state;
  tooltipName.textContent = "▸ " + state.data.name;
  tooltipRole.textContent = state.data.role;
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
  if (state.mode === "working") return "● TRABAJANDO EN UNA TAREA";
  if (state.mode === "walking_to_work") return "▶ YENDO AL ESCRITORIO";
  if (state.mode === "reacting") return "! REACCIONANDO";
  return "○ DISPONIBLE · CLIC PARA ASIGNAR TAREA";
}

// ─── HUD stats ────────────────────────────────────────────────────────────────

const statTotal = document.getElementById("stat-total");
const statWorking = document.getElementById("stat-working");
const statTasks = document.getElementById("stat-tasks");
const clockEl = document.getElementById("clock");

function updateStats() {
  statTotal.textContent = String(agents.length);
  const working = agents.filter((a) => a.mode === "working" || a.mode === "walking_to_work").length;
  statWorking.textContent = String(working);
  statTasks.textContent = String(totalTasks);
  if (hoveredState) {
    tooltipStatus.textContent = statusText(hoveredState);
  }
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
// Actualizar stats 4 veces/s
setInterval(updateStats, 250);

// ─── Actions ──────────────────────────────────────────────────────────────────

document.getElementById("btn-assign").addEventListener("click", () => {
  assignRandomWork();
});
document.getElementById("btn-reset").addEventListener("click", () => {
  resetAllWork();
});

// ─── Resize handling ──────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
  drawBackground();
  // No rehacemos desks para no reubicar a los trabajadores
});

// ─── Auto-assign aleatorio cada cierto tiempo para dar vida ──────────────────

setInterval(() => {
  if (Math.random() < 0.5) assignRandomWork();
}, 2500);

// ─── Kickoff ──────────────────────────────────────────────────────────────────

initWorld();

console.log("[AgentTown] 🎮 Dashboard listo · 19 agentes en vivo");
