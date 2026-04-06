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
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Filter,
  GitPullRequest,
  KeyRound,
  Rocket,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low";
type Category = "github" | "vercel" | "sentry" | "doppler" | "dev" | "manual";
type Status = "pending" | "done" | "blocked";

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
    title: "Investigar deploys del feature branch en ERROR",
    description:
      "Los últimos 2 deploys del feature branch fallaron en Vercel. Hay que ver los logs y arreglar el build antes de mergear el PR.",
    priority: "critical",
    category: "vercel",
    estimatedMinutes: 10,
    link: {
      url: "https://vercel.com/brandon-luis-projects-9cf56555/mercado/deployments?environment=preview",
      label: "Ver deployments",
    },
    steps: [
      "Abre el deployment más reciente del feature branch",
      "Revisa los build logs para ver el error real",
      "Si es por env vars faltantes, agregarlas en Settings → Environment Variables",
      "Si es por código, hacer fix y push",
      "Verificar que el siguiente deploy es READY",
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
