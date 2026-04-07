"use client";

/**
 * /superadmin/setup
 *
 * Panel central de "Setup Pendiente": lista todas las acciones que solo
 * un humano puede hacer (generar tokens, aprobar OAuth, mergear PRs,
 * configurar dashboards externos) y lleva el estado en localStorage.
 *
 * Cada item tiene: título, descripción, prioridad, link de acción,
 * pasos exactos y checkbox de "ya lo hice".
 *
 * Cuando todos los items están done → el panel muestra "Todo listo ✨".
 */

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  ExternalLink,
  Filter,
  GitPullRequest,
  KeyRound,
  Rocket,
  Shield,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low";
type Category = "github" | "vercel" | "sentry" | "doppler" | "stripe" | "dev" | "manual";
type Status = "pending" | "done" | "blocked";

// ─── Score de Buenas Prácticas (sesión 2026-04-06) ────────────────────────────
//
// Dos scoreboards independientes:
//   1) Excel 2026 — 48 prácticas generales de código (Clean Code, SOLID, DDD, etc)
//   2) Excel Agentes IA — 28 prácticas específicas para sistemas de agentes
//
// Fuente: docs/practicas-2026-audit.md (Excel 2026) + auditoría manual del
// sistema de agentes en lib/agents/* + app/api/ai-assistant/* (Excel Agentes IA).

interface ScoreSnapshot {
  label: string;
  total: number;
  applied: number;       // ✅
  partial: number;       // ⚠️
  missing: number;       // ❌
  na: number;            // ➖ (excluidas conscientemente)
  link?: { url: string; label: string };
}

const SCORES: ScoreSnapshot[] = [
  {
    label: "Excel 2026 — Buenas prácticas de código (48)",
    total: 48,
    applied: 28,
    partial: 13,
    missing: 3,
    na: 4,
    link: {
      url: "/superadmin/setup#practicas-2026",
      label: "Ver detalle en docs/practicas-2026-audit.md",
    },
  },
  {
    label: "Excel Agentes IA — Prácticas para sistemas de agentes (28)",
    total: 28,
    // 2026-04-06 noche: TD-024 (router LLM), TD-025 (HITL completo) y TD-022
    // (structured output vía prompt-based) resueltos o parciales.
    // Movimientos desde el audit inicial:
    //   +#7 Temperaturas diferenciadas (❌ → ✅)
    //   +#10 HITL (⚠️ → ✅)
    //   +#23 Router LLM mixto (❌ → ✅)
    //   #9 Structured output: ❌ → ⚠️ (3 endpoints migrados con safeParseJSON)
    applied: 13,   // +2: #10 HITL + #23 Router
    partial: 10,   // +1 neto: #9 entró de ❌ a ⚠️
    missing: 5,    // -3: #7, #10, #23 ya no faltan
    na: 0,
    link: {
      url: "/superadmin/setup#practicas-agentes-ia",
      label: "Ver mapeo completo abajo",
    },
  },
];

function calcScore(s: ScoreSnapshot) {
  const denom = s.total - s.na;
  const solid = (s.applied + s.partial * 0.5) / denom;
  const perfect = s.applied / denom;
  return {
    solidPct: Math.round(solid * 1000) / 10,
    perfectPct: Math.round(perfect * 1000) / 10,
    solidBar: "█".repeat(Math.round(solid * 20)) + "░".repeat(20 - Math.round(solid * 20)),
    perfectBar: "█".repeat(Math.round(perfect * 20)) + "░".repeat(20 - Math.round(perfect * 20)),
  };
}

interface SetupItem {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  estimatedMinutes: number;
  link?: { url: string; label: string };
  steps: string[];
  blockedReason?: string;
}

// ─── Items pendientes (fuente de verdad) ──────────────────────────────────────

const SETUP_ITEMS: SetupItem[] = [
  {
    id: "merge-pr-3",
    title: "Mergear PR #3 — Refactor admin (23 hooks + 5 componentes)",
    description:
      "PR enorme (1613 archivos) con todo el trabajo de refactor del admin. Una vez mergeado, release-please correrá automáticamente.",
    priority: "critical",
    category: "github",
    estimatedMinutes: 2,
    link: {
      url: "https://github.com/Buleje/Mercado/pull/3",
      label: "Abrir PR #3",
    },
    steps: [
      "Abre el PR en GitHub",
      "Revisa los cambios principales (admin/page.tsx -53%)",
      "Click 'Merge pull request' → 'Confirm merge'",
      "Verifica que el workflow Release Please corre en Actions",
    ],
  },
  {
    id: "vercel-rolling-releases",
    title: "Activar Rolling Releases en Vercel",
    description:
      "El plan actual es Hobby. Rolling Releases requiere upgrade a Pro ($20/mes). El config en vercel.json ya está listo (10% → 50% → 100%).",
    priority: "medium",
    category: "vercel",
    estimatedMinutes: 5,
    link: {
      url: "https://vercel.com/brandon-luis-projects-9cf56555/mercado/settings/rolling-releases",
      label: "Settings → Rolling Releases",
    },
    steps: [
      "Upgrade a plan Pro si quieres canary deploys ($20/mes)",
      "Settings → Rolling Releases → toggle Enable",
      "Confirmar que detecta la config de vercel.json",
      "Próximo deploy a producción usará rolling release automáticamente",
    ],
    blockedReason: "Plan Hobby — requiere upgrade a Pro",
  },
  {
    id: "fix-vercel-deploy-error",
    title: "✅ ARREGLADO — deploys del feature branch en ERROR",
    description:
      "Causa: vercel.json tenía 'rollingRelease' (feature Pro) + 5 crons multi-diarios — Hobby los rechaza. Fix en commit fac06a1 (quitar rollingRelease + normalizar crons a 1x día). Deploy verificado READY.",
    priority: "low",
    category: "vercel",
    estimatedMinutes: 0,
    link: {
      url: "https://vercel.com/brandon-luis-projects-9cf56555/mercado/deployments?environment=preview",
      label: "Ver deploy verde",
    },
    steps: [
      "Ya no requiere acción humana — solo marcar como hecho",
      "El fix está en commit fac06a1 del feature branch",
      "Deploy de prueba: dpl_Gs9VKYSHph7yQvYaDFbNBZgnrVZx (READY)",
    ],
  },
  {
    id: "sentry-token",
    title: "Generar SENTRY_AUTH_TOKEN para script de alertas",
    description:
      "El script scripts/setup-sentry-alerts.ts (480 líneas) ya está listo. Solo falta el token para crear las 4 reglas de alerta automáticamente.",
    priority: "high",
    category: "sentry",
    estimatedMinutes: 3,
    link: {
      url: "https://sentry.io/settings/",
      label: "Sentry → Settings",
    },
    steps: [
      "Settings → Developer Settings → New Internal Integration",
      "Name: 'Claude BSM Automation'",
      "Permissions: Project Admin + Alerts Admin",
      "Copia el token (sntrys_...)",
      "Pega en .env.local: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT",
      "Ejecuta: npx tsx scripts/setup-sentry-alerts.ts",
    ],
  },
  {
    id: "doppler-account",
    title: "Crear cuenta Doppler + proyecto + Service Token",
    description:
      "Migración de secrets a Doppler está documentada en docs/doppler.md. Sin tu cuenta, los secrets siguen en .env.local + Vercel manual.",
    priority: "high",
    category: "doppler",
    estimatedMinutes: 5,
    link: {
      url: "https://dashboard.doppler.com/signup",
      label: "Doppler signup",
    },
    steps: [
      "Crear cuenta gratis (Team — hasta 5 usuarios)",
      "New Project → 'bodega-san-martin'",
      "Doppler crea automáticamente configs: dev, stg, prd",
      "Access → Service Tokens → Generate",
      "Scope: dev | Permissions: Read/Write",
      "Copia el token (dp.st.dev.XXXXX)",
      "Pega en .env.local: DOPPLER_TOKEN",
      "Avísame: yo me encargo del resto (Fases 2-6 del docs/doppler.md)",
    ],
  },
  {
    id: "github-pat-fine-grained",
    title: "(OPCIONAL) Personal Access Token de GitHub fine-grained",
    description:
      "Ya estoy autenticado con device flow, pero un PAT fine-grained es más seguro para integraciones a largo plazo. No es urgente.",
    priority: "low",
    category: "github",
    estimatedMinutes: 2,
    link: {
      url: "https://github.com/settings/tokens?type=beta",
      label: "Generate PAT",
    },
    steps: [
      "Generate new token (Fine-grained)",
      "Repository access: Mercado + bodega-san-martin-workspace",
      "Permissions: Contents/PRs/Actions = Read and write",
      "Copia y pega en .env.local: GITHUB_TOKEN",
    ],
  },
  {
    id: "test-admin-manually",
    title: "Probar manualmente el panel /admin después del refactor",
    description:
      "El refactor extrajo 23 hooks + 5 componentes JSX. Aunque los tests pasan, conviene un smoke test manual de cada tab del admin.",
    priority: "high",
    category: "dev",
    estimatedMinutes: 10,
    link: {
      url: "http://localhost:3000/admin",
      label: "Abrir /admin local",
    },
    steps: [
      "npm run dev en bodega-san-martin/",
      "Abre http://localhost:3000/admin",
      "Verifica: login funciona, tabs cargan, no hay errores en console",
      "Prueba shortcuts (Ctrl+K, Alt+1..9, Ctrl+Shift+P)",
      "Prueba el modal de 'Gestionar módulos' (extraído en este refactor)",
      "Prueba el flujo de 'Limpiar datos' (extraído en este refactor)",
      "Reporta bugs si encuentras alguno",
    ],
  },
  {
    id: "instalar-gh-cli-prod",
    title: "Configurar gh CLI en máquina de producción/CI",
    description:
      "gh CLI está instalado en tu máquina local. Si quieres que CI use gh para crear PRs automáticos de release-please, hay que configurar GH_PAT en GitHub Secrets.",
    priority: "low",
    category: "github",
    estimatedMinutes: 3,
    link: {
      url: "https://github.com/Buleje/Mercado/settings/secrets/actions",
      label: "Repo Secrets",
    },
    steps: [
      "Genera un PAT (puede ser el mismo del item GitHub PAT)",
      "GitHub repo → Settings → Secrets → Actions → New repository secret",
      "Name: GH_PAT, Value: el token",
      "release-please-action lo usará automáticamente si no hay GITHUB_TOKEN",
    ],
  },
  {
    id: "verificar-release-please",
    title: "Verificar que release-please corrió tras mergear PR #3",
    description:
      "Una vez mergees el PR #3 a master, GitHub Actions debería ejecutar el workflow Release Please automáticamente. Crea un PR de release con CHANGELOG generado.",
    priority: "high",
    category: "github",
    estimatedMinutes: 2,
    link: {
      url: "https://github.com/Buleje/Mercado/actions/workflows/release-please.yml",
      label: "Ver workflow",
    },
    steps: [
      "Después del merge del PR #3, esperar ~30 segundos",
      "Abrir el link → debería verse un run nuevo en la lista",
      "Si el run falla, revisar logs (probablemente permisos o config)",
      "Si pasa, ver el nuevo PR de release en /pulls",
    ],
  },
  {
    id: "agregar-env-vars-vercel",
    title: "Agregar env vars críticas a Vercel (DATABASE_URL, AUTH_SECRET, etc)",
    description:
      "Vercel solo tiene 2 env vars (las de Supabase). Faltan DATABASE_URL, AUTH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CRON_SECRET. El build pasa pero el runtime fallará si lib/env.ts las valida en producción.",
    priority: "high",
    category: "vercel",
    estimatedMinutes: 5,
    link: {
      url: "https://vercel.com/brandon-luis-projects-9cf56555/mercado/settings/environment-variables",
      label: "Vercel Env Vars",
    },
    steps: [
      "Settings → Environment Variables",
      "Agregar DATABASE_URL (Supabase pooler URL)",
      "Agregar AUTH_SECRET (32+ bytes, generar con openssl rand -hex 32)",
      "Agregar STRIPE_SECRET_KEY (sk_test_ o sk_live_)",
      "Agregar STRIPE_WEBHOOK_SECRET (whsec_)",
      "Agregar CRON_SECRET (32+ bytes)",
      "(Alternativa: avísame con 'agrega env vars X=Y a Vercel' y lo hago via API)",
    ],
  },
  {
    id: "verificar-pr3-deploy",
    title: "Verificar que el último deploy del PR #3 sale READY",
    description:
      "Después del fix de vercel.json (commit fac06a1), el siguiente deploy del feature branch debe pasar. Confirmar antes de mergear.",
    priority: "high",
    category: "vercel",
    estimatedMinutes: 1,
    link: {
      url: "https://vercel.com/brandon-luis-projects-9cf56555/mercado/deployments?environment=preview",
      label: "Ver deployments",
    },
    steps: [
      "Abrir el link",
      "Buscar deploy del commit fac06a1 (o más reciente)",
      "Confirmar status = READY (no ERROR)",
      "Si está READY, mergear PR #3 con confianza",
    ],
  },
  // ── Pendientes de la sesión 2026-04-06 (sync env + audit Supabase) ────────
  {
    id: "stripe-keys-rotation",
    title: "🔴 Rotar Stripe placeholders por keys reales (BLOQUEA PAGOS PROD)",
    description:
      "Vercel production tiene STRIPE_SECRET_KEY=sk_test_PLACEHOLDER_REEMPLAZAR_CON_REAL y STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER_REEMPLAZAR_CON_REAL. Cualquier llamada a /api/billing crashea con 'Invalid API Key'. Hay un script que automatiza la rotación.",
    priority: "critical",
    category: "stripe",
    estimatedMinutes: 5,
    link: {
      url: "https://dashboard.stripe.com/apikeys",
      label: "Stripe Dashboard → API keys",
    },
    steps: [
      "Abre el Stripe Dashboard y copia tu Secret key (sk_live_ o sk_test_)",
      "Abre https://dashboard.stripe.com/webhooks → click endpoint → Reveal y copia el whsec_",
      "Desde bodega-san-martin/ corre: bash scripts/rotate-stripe-keys.sh",
      "Pega la secret key cuando te la pida (no se muestra en pantalla, read -rs)",
      "Pega el webhook secret cuando te lo pida",
      "El script actualiza Vercel (prod+preview+dev) + .env.local en una sola pasada",
      "Trigger un deploy a producción para que las nuevas keys tomen efecto",
    ],
  },
  {
    id: "sentry-alert-rules-manual",
    title: "Crear las 4 reglas de alerta en el dashboard de Sentry",
    description:
      "El script con SENTRY_AUTH_TOKEN crea las reglas automáticamente, pero si no quieres generar el token, las puedes crear a mano en 10 minutos. Doc completa con razones por regla en docs/sentry-alert-setup.md.",
    priority: "high",
    category: "sentry",
    estimatedMinutes: 10,
    link: {
      url: "https://sentry.io/organizations/sentry/alerts/rules/",
      label: "Sentry → Alerts",
    },
    steps: [
      "Regla 1 (Error Rate Alto): Issue Alert → 'Number of events is more than 10 in 1 hour' → filtro is:unresolved → email + Slack #alertas-bsm",
      "Regla 2 (Latencia P95 > 500ms): Metric Alert → transaction.duration P95 → warning 500ms / critical 1000ms → ventana 5 min",
      "Regla 3 (Excepción No Manejada): Issue Alert → 'A new issue is created' → filtro handled:no → notif inmediata",
      "Regla 4 (Tasa Fallos > 5%): Metric Alert → transaction.failure_rate → warning 5% / critical 10% → ventana 10 min",
      "Prefijo de nombres: 'BSM —' (ej: BSM — Error Rate Alto)",
      "Si no tienes Slack integration, cae a email-only por ahora",
    ],
  },
  {
    id: "next-session-sprint-c",
    title: "📋 Próxima sesión: Sprint C — cerrar 469 TS errors",
    description:
      "Es el gate de calidad fundacional. Antes que A (admin refactor) y B (Float→Decimal). Plan exacto en docs/ts-errors-baseline-2026-04-06.md con 4 oleadas. 152 errores son TS7006 (implicit any) — mecánicos. Top 7 archivos = 167 errores (Dashboard family).",
    priority: "high",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Requiere sesión Agent Team dedicada (3-5 sesiones para llegar a 0)",
    steps: [
      "Comando exacto: /agent-team Sprint C: Wave 1 — cerrar 167 TS errors del Dashboard family según docs/ts-errors-baseline-2026-04-06.md",
      "Re-medir baseline al final de cada wave: npx tsc --noEmit | grep -c \"error TS\"",
      "Después del 0: flipear ignoreBuildErrors=false en next.config.ts",
      "Crear ADR 008: docs/adr/008-typescript-strict-gate.md",
      "Commit: feat(types): enable strict TypeScript gate (closes TD-012)",
    ],
  },
  {
    id: "next-session-sprint-a",
    title: "📋 Sesión futura: Sprint A — refactor app/admin/page.tsx 4-7",
    description:
      "Después del Sprint C. Baseline actual: 1256 líneas (tras Sesiones 1-2 ya hechas). Target: <300 líneas. Plan exacto en docs/refactor-giant-files-plan.md (Pasos 4-7).",
    priority: "medium",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Bloqueado hasta cerrar Sprint C (sin gate de tipos los refactors meten regresiones invisibles)",
    steps: [
      "Pre-requisito: Sprint C debe estar en 0 TS errors",
      "Comando: /agent-team Sprint A: refactor admin/page.tsx Pasos 4-7 según docs/refactor-giant-files-plan.md, baseline 1256, target <300",
      "Estimado: 4-6 sesiones de Agent Team con frontend-engineer",
    ],
  },
  {
    id: "next-session-sprint-b",
    title: "📋 Sesión futura: Sprint B — TD-018 Float→Decimal Strategy B",
    description:
      "Después de Sprints C y A. Plan del migration-planner: 47 campos MONEY, 22 DB classes, patrón toNum() ya existe en 4 clases (fiados, prestamos, recetas, turnos) — solo extender. Tablas vacías → data risk = 0. Riesgo regresión: ~5%.",
    priority: "medium",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Bloqueado hasta Sprints C + A (mismo set de archivos del dashboard se tocaría)",
    steps: [
      "Pre-requisito: Sprints C y A completos",
      "Comando: /agent-team Sprint B: ejecutar TD-018 Float→Decimal Strategy B, 47 campos en 22 DB classes",
      "Estimado: 3 días según migration-planner",
      "Resuelve bug latente de SUNAT/IGV con redondeo Float",
    ],
  },
  // ── Excel Agentes IA — brechas accionables (sesión 2026-04-06) ──────────
  {
    id: "td-022-adr-009-structured-output",
    title: "📋 ADR 009: Estrategia de structured output dado el bloqueo de Groq",
    description:
      "Groq NO soporta response_format:json_object con tools ni con streaming. Modelo actual llama-3.3-70b-versatile no soporta structured outputs. Excel Agentes IA práctica #9 está bloqueada por plataforma. Hay que elegir entre 3 opciones: (A) migrar el modelo de tool-calling a llama-4-scout-17b-16e-instruct que sí soporta structured outputs, (B) prompt-based JSON enforcement con parsing + fallback, (C) mover endpoints críticos a Claude/OpenAI directo.",
    priority: "medium",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Requiere decisión arquitectónica (ADR)",
    steps: [
      "Medir costo y latencia de cada opción (A/B/C) en un spike de 1 hora",
      "Crear docs/adr/009-structured-output-strategy.md con la decisión",
      "Implementar la opción ganadora en una sesión posterior",
      "Actualizar TD-022 en docs/TECH-DEBT.md con el resultado",
      "Mueve Excel Agentes IA práctica #9 de ❌ a ✅ cuando se implemente",
    ],
  },
  {
    id: "td-024-adr-010-llm-router",
    title: "📋 ADR 010 + sesión: Router LLM mixto (Groq + Claude/OpenAI)",
    description:
      "Excel Agentes IA práctica #23. Hoy solo Groq llama-3.3-70b-versatile para todo. Un router por complejidad (Groq tier barato para queries simples, Claude/GPT-4o para decisiones críticas) proyecta -40% costo. Ya hay API keys de Groq. Falta integrar segundo provider con fallback.",
    priority: "medium",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Requiere ADR + 1 sesión implementación",
    steps: [
      "Crear docs/adr/010-llm-router-strategy.md",
      "Definir función pickModel(query, context): 'simple' | 'complex' | 'critical'",
      "Agregar provider abstraction en lib/llm-providers/ (groq.ts + claude.ts)",
      "Reemplazar fetchGroqWithRetry por fetchLLMWithRouter en ai-assistant/*",
      "Medir costo antes/después con lib/ai-usage-tracker.ts",
      "Mueve Excel Agentes IA práctica #23 de ❌ a ✅",
    ],
  },
  {
    id: "td-025-hitl-modal",
    title: "📋 Sesión: Human-in-the-Loop modal para tools high-risk",
    description:
      "Excel Agentes IA práctica #10. Hoy el agente ejecuta cualquier tool sin gate previo. Requiere: definir lista de tools high-risk (comprar, rematar, aplicar descuento >20%, crear combo) en tool-definitions.ts + modal de confirmación en AICommandCenter.tsx antes de ejecutar esos tools.",
    priority: "high",
    category: "dev",
    estimatedMinutes: 0,
    blockedReason: "Requiere 1 sesión (UI + backend + lista de tools)",
    steps: [
      "Agregar campo 'requiresApproval: boolean' a las tool definitions en lib/agents/tool-definitions.ts",
      "Marcar los tools críticos: comprar_stock, rematar_producto, aplicar_descuento_grande, crear_combo, cancelar_pedido_masivo",
      "En el orchestrator: interceptar tools con requiresApproval y devolver un 'pendingApproval' event",
      "En AICommandCenter.tsx: escuchar pendingApproval y mostrar modal con botones Aprobar / Rechazar",
      "Al aprobar: emit 'approved' event al orchestrator para que continúe",
      "Agregar tests de los 5 tools críticos",
      "Mueve Excel Agentes IA práctica #10 de ⚠️ a ✅",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  high:     { label: "Alto",    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  medium:   { label: "Medio",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  low:      { label: "Bajo",    cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  github:  <GitPullRequest className="w-4 h-4" />,
  vercel:  <Rocket className="w-4 h-4" />,
  sentry:  <Shield className="w-4 h-4" />,
  doppler: <KeyRound className="w-4 h-4" />,
  stripe:  <CreditCard className="w-4 h-4" />,
  dev:     <Wrench className="w-4 h-4" />,
  manual:  <AlertCircle className="w-4 h-4" />,
};

const STORAGE_KEY = "superadmin-setup-status";

function loadStatuses(): Record<string, Status> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Status>) : {};
  } catch {
    return {};
  }
}

function saveStatuses(statuses: Record<string, Status>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  } catch {}
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuperAdminSetupPage() {
  // Inicializa con loader (typeof window check evita SSR mismatch)
  const [statuses, setStatuses] = useState<Record<string, Status>>(() => loadStatuses());
  const [filter, setFilter] = useState<"all" | Status>("all");

  const toggleStatus = (id: string) => {
    setStatuses((prev) => {
      const current = prev[id] ?? "pending";
      const next: Status = current === "done" ? "pending" : "done";
      const updated = { ...prev, [id]: next };
      saveStatuses(updated);
      return updated;
    });
  };

  const setBlocked = (id: string, blocked: boolean) => {
    setStatuses((prev) => {
      const updated = { ...prev, [id]: blocked ? "blocked" : "pending" } as Record<string, Status>;
      saveStatuses(updated);
      return updated;
    });
  };

  const filteredItems = useMemo(() => {
    if (filter === "all") return SETUP_ITEMS;
    return SETUP_ITEMS.filter((item) => (statuses[item.id] ?? "pending") === filter);
  }, [filter, statuses]);

  const stats = useMemo(() => {
    let pending = 0;
    let done = 0;
    let blocked = 0;
    let totalMinutes = 0;
    let pendingMinutes = 0;

    for (const item of SETUP_ITEMS) {
      const status = statuses[item.id] ?? "pending";
      totalMinutes += item.estimatedMinutes;
      if (status === "done") done++;
      else if (status === "blocked") blocked++;
      else {
        pending++;
        pendingMinutes += item.estimatedMinutes;
      }
    }

    return { pending, done, blocked, total: SETUP_ITEMS.length, totalMinutes, pendingMinutes };
  }, [statuses]);

  const allDone = stats.done === stats.total;
  const progressPct = Math.round((stats.done / stats.total) * 100);

  // Sort: críticos pendientes primero, luego high, luego done al final
  const sortedItems = [...filteredItems].sort((a, b) => {
    const sa = statuses[a.id] ?? "pending";
    const sb = statuses[b.id] ?? "pending";

    // Done al final
    if (sa === "done" && sb !== "done") return 1;
    if (sb === "done" && sa !== "done") return -1;

    // Por prioridad
    const order: Priority[] = ["critical", "high", "medium", "low"];
    return order.indexOf(a.priority) - order.indexOf(b.priority);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600/10 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Setup Pendiente</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Acciones que solo tú puedes hacer (tokens, OAuth, dashboards externos)
            </p>
          </div>
        </div>
      </div>

      {/* Stats card */}
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Progreso global
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {stats.done} de {stats.total} completados
            </span>
          </div>
          <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">{progressPct}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="text-center">
            <div className="text-xl font-extrabold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Total</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-orange-500">{stats.pending}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Pendientes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-emerald-500">{stats.done}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Hechos</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-amber-500">{stats.blocked}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Bloqueados</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>
            Tiempo estimado restante: <strong>{stats.pendingMinutes} minutos</strong>
            {stats.pendingMinutes > 0 && " (de tu tiempo, no del mío)"}
          </span>
        </div>
      </div>

      {/* All done celebration */}
      {allDone && (
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl p-6 flex items-center gap-4">
          <Sparkles className="w-10 h-10 shrink-0" />
          <div>
            <h2 className="text-xl font-bold">¡Setup completo!</h2>
            <p className="text-sm opacity-90 mt-0.5">
              Todas las acciones humanas pendientes están hechas. Claude tiene acceso completo.
            </p>
          </div>
        </div>
      )}

      {/* Score de Buenas Prácticas — Excel 2026 + Excel Agentes IA */}
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            Score de Buenas Prácticas
          </h2>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide ml-auto">
            Actualizado 2026-04-06
          </span>
        </div>

        <div className="space-y-4">
          {SCORES.map((score) => {
            const c = calcScore(score);
            const isAgentIA = score.label.includes("Agentes IA");
            return (
              <div
                key={score.label}
                id={isAgentIA ? "practicas-agentes-ia" : "practicas-2026"}
                className="border border-gray-100 dark:border-gray-900 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  {isAgentIA ? (
                    <Bot className="w-4 h-4 text-purple-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-teal-500" />
                  )}
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {score.label}
                  </span>
                </div>

                {/* Buckets */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center">
                    <div className="text-lg font-extrabold text-emerald-500">{score.applied}</div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">✅ Aplicadas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-extrabold text-amber-500">{score.partial}</div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">⚠️ Parciales</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-extrabold text-red-500">{score.missing}</div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">❌ Faltan</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-extrabold text-gray-400">{score.na}</div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">➖ N/A</div>
                  </div>
                </div>

                {/* Score sólido */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Score sólido (✅ + ⚠️×0.5)
                    </span>
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                      {c.solidPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-500"
                      style={{ width: `${c.solidPct}%` }}
                    />
                  </div>
                </div>

                {/* Score perfecto */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Score perfecto (solo ✅)
                    </span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {c.perfectPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                      style={{ width: `${c.perfectPct}%` }}
                    />
                  </div>
                </div>

                {score.link && (
                  <a
                    href={score.link.url}
                    className="inline-flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 hover:underline mt-3"
                  >
                    {score.link.label}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-3 leading-relaxed">
          <strong>Techo realista del Excel 2026:</strong> 87.5% sólido / 77% perfecto (las 3 ❌ y 4 ➖ son decisiones conscientes de NO aplicar — Scrum, Service Mesh, Sharding, Monorepo, Factory DI, Hexagonal completa, Terraform).
          <br />
          <strong>Path al máximo Excel Agentes IA:</strong> faltan RAG vectorial, structured output JSON, modelo mixto (router LLM), temperaturas diferenciadas por agente, LangSmith/Helicone, LlamaGuard.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Filtrar:</span>
        {(["all", "pending", "done", "blocked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
              filter === f
                ? "bg-teal-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
            ].join(" ")}
          >
            {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "done" ? "Hechos" : "Bloqueados"}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {sortedItems.map((item) => {
          const status = statuses[item.id] ?? "pending";
          const isDone = status === "done";
          const isBlocked = status === "blocked";
          const pCfg = PRIORITY_CONFIG[item.priority];

          return (
            <div
              key={item.id}
              className={[
                "bg-white dark:bg-gray-950 border rounded-2xl p-5 transition-all",
                isDone
                  ? "border-emerald-200 dark:border-emerald-900/40 opacity-60"
                  : isBlocked
                    ? "border-amber-200 dark:border-amber-900/40"
                    : "border-gray-200 dark:border-gray-800 hover:border-teal-300 dark:hover:border-teal-700",
              ].join(" ")}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggleStatus(item.id)}
                  className="mt-0.5 shrink-0"
                  title={isDone ? "Marcar como pendiente" : "Marcar como hecho"}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600 hover:text-teal-500" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3
                      className={[
                        "text-base font-bold",
                        isDone
                          ? "text-gray-400 line-through"
                          : "text-gray-900 dark:text-white",
                      ].join(" ")}
                    >
                      {item.title}
                    </h3>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pCfg.cls}`}
                      >
                        {pCfg.label}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {CATEGORY_ICON[item.category]}
                        {item.category}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        <Clock className="w-2.5 h-2.5" />
                        {item.estimatedMinutes}m
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {item.description}
                  </p>

                  {/* Blocked reason */}
                  {item.blockedReason && (
                    <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {item.blockedReason}
                    </div>
                  )}

                  {/* Steps */}
                  {!isDone && (
                    <details className="mb-3 group">
                      <summary className="text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-teal-600 list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                        Pasos exactos ({item.steps.length})
                      </summary>
                      <ol className="mt-2 ml-4 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        {item.steps.map((step, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-teal-600 dark:text-teal-400 font-bold shrink-0">
                              {idx + 1}.
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2">
                    {item.link && !isDone && (
                      <a
                        href={item.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors"
                      >
                        {item.link.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {!isDone && (
                      <button
                        onClick={() => setBlocked(item.id, !isBlocked)}
                        className={[
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          isBlocked
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200",
                        ].join(" ")}
                      >
                        {isBlocked ? "✓ Bloqueado" : "Marcar bloqueado"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="text-xs text-gray-400 dark:text-gray-600 text-center pt-4 border-t border-gray-100 dark:border-gray-900">
        El estado de cada item se guarda en tu navegador (localStorage) — no se sincroniza entre dispositivos.
      </div>
    </div>
  );
}
