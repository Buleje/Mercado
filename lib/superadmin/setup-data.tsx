/**
 * lib/superadmin/setup-data.tsx
 *
 * Datos hardcodeados del módulo /superadmin/setup:
 *   - SCORES: scoreboards de buenas prácticas (Excel 2026 + Excel Agentes IA)
 *   - CATEGORY_ICON: mapeo de category → React icon (razón del .tsx)
 *   - SETUP_ITEMS: lista de 15 acciones humanas pendientes con steps
 *
 * Extraído del monstruo page.tsx (948 líneas) como parte del refactor
 * 2026-04-06 para dejar el page como orquestador <300 líneas.
 */

import {
  AlertCircle,
  CreditCard,
  GitPullRequest,
  KeyRound,
  Rocket,
  Shield,
  Wrench,
} from "lucide-react";
import type { Category, ScoreSnapshot, SetupItem } from "./setup-types";

// ─── Score de Buenas Prácticas ────────────────────────────────────────────
//
// Dos scoreboards independientes:
//   1) Excel 2026 — 48 prácticas generales de código (Clean Code, SOLID, DDD, etc)
//   2) Excel Agentes IA — 28 prácticas específicas para sistemas de agentes
//
// Fuente: docs/practicas-2026-audit.md (Excel 2026) + auditoría manual del
// sistema de agentes en lib/agents/* + app/api/ai-assistant/* (Excel Agentes IA).

export const SCORES: ScoreSnapshot[] = [
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
    applied: 13,
    partial: 10,
    missing: 5,
    na: 0,
    link: {
      url: "/superadmin/setup#practicas-agentes-ia",
      label: "Ver mapeo completo abajo",
    },
  },
];

// ─── Category → icon mapping ──────────────────────────────────────────────

export const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  github:  <GitPullRequest className="w-4 h-4" />,
  vercel:  <Rocket className="w-4 h-4" />,
  sentry:  <Shield className="w-4 h-4" />,
  doppler: <KeyRound className="w-4 h-4" />,
  stripe:  <CreditCard className="w-4 h-4" />,
  dev:     <Wrench className="w-4 h-4" />,
  manual:  <AlertCircle className="w-4 h-4" />,
};

// ─── Items pendientes (fuente de verdad) ──────────────────────────────────

export const SETUP_ITEMS: SetupItem[] = [
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
      "Name: 'Claude Buleje Automation'",
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
      "Prefijo de nombres: 'Buleje —' (ej: Buleje — Error Rate Alto)",
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
