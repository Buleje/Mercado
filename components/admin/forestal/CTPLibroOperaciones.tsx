"use client";

/**
 * CTPLibroOperaciones — Tab del panel admin con Libro de Operaciones del
 * Centro de Transformación Primaria (LOE-CTP SERFOR, ADR-124).
 *
 * Solo se renderiza si el tenant tiene `spec:forestal:ctp-libro` habilitado
 * (gating en app/admin/page.tsx + en el endpoint).
 *
 * Estructura:
 *   1. Header con stats (volumen mes, especies, pendientes validar)
 *   2. Filtros (status, especie, GTF, rango fechas)
 *   3. Tabla de entries
 *   4. Modal form crear/editar
 */
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Filter,
  TreePine,
  AlertCircle,
  CheckCircle2,
  Clock,
  X as XIcon,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
} from "@buleje/design-system/icons";
import WoodEntryForm from "./WoodEntryForm";
import SpeciesAggregateChart from "./SpeciesAggregateChart";

interface WoodEntry {
  id: string;
  entryDate: string;
  gtfNumber: string;
  gtfDate: string | null;
  providerName: string;
  originType: string;
  speciesCommonName: string;
  speciesScientificName: string | null;
  speciesCites: boolean;
  productType: string;
  volumeM3: string;
  pieces: number;
  status: "pendiente" | "validado" | "rechazado" | "procesado" | "anulado";
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
}

interface ListResponse {
  entries: WoodEntry[];
  total: number;
}

const STATUS_META: Record<
  WoodEntry["status"],
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  pendiente: {
    label: "Pendiente",
    color: "data-warning",
    Icon: Clock,
  },
  validado: {
    label: "Validado",
    color: "data-success",
    Icon: CheckCircle2,
  },
  procesado: {
    label: "Procesado",
    color: "data-info",
    Icon: CheckCircle2,
  },
  rechazado: {
    label: "Rechazado",
    color: "data-danger",
    Icon: AlertCircle,
  },
  anulado: {
    label: "Anulado",
    color: "text-tertiary",
    Icon: XIcon,
  },
};

export default function CTPLibroOperaciones() {
  const [entries, setEntries] = useState<WoodEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Modal form
  const [showForm, setShowForm] = useState(false);

  // Row actions
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Dashboard toggle
  const [showDashboard, setShowDashboard] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("limit", "100");

      const res = await fetch(
        `/api/admin/forestal/wood-entries?${params.toString()}`,
        { credentials: "include" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.message ?? data.error ?? `HTTP ${res.status}`,
        );
      }

      const data: ListResponse = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function doAction(id: string, action: "validate" | "reject" | "delete", reason?: string) {
    setActionPending(`${id}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forestal/wood-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      await load();
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(null);
    }
  }

  // KPIs derivados
  const kpis = useMemo(() => {
    const totalVolume = entries.reduce(
      (acc, e) => acc + Number(e.volumeM3 ?? 0),
      0,
    );
    const pendingCount = entries.filter((e) => e.status === "pendiente").length;
    const citesCount = entries.filter((e) => e.speciesCites).length;
    const speciesSet = new Set(entries.map((e) => e.speciesCommonName));
    return {
      totalVolume,
      pendingCount,
      citesCount,
      speciesCount: speciesSet.size,
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Header con stats */}
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-extrabold text-[var(--text-primary)]">
              <TreePine className="h-6 w-6 text-[var(--data-success-600)]" />
              Libro de Operaciones CTP
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Registro de ingresos de madera al Centro de Transformación Primaria.
              Compatible con LOE-CTP SERFOR (interno, no oficial).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDashboard((v) => !v)}
              className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition ${
                showDashboard
                  ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              }`}
              aria-label="Dashboard de agregados"
            >
              <BarChart3 className="h-4 w-4" />
              <span>{showDashboard ? "Cerrar dashboard" : "Ver dashboard"}</span>
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              aria-label="Recargar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>Recargar</span>
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-5 w-5" />
              Nuevo ingreso
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Total registros"
            value={total.toString()}
            sublabel={`${entries.length} visibles`}
          />
          <KpiCard
            label="Volumen total (m³)"
            value={kpis.totalVolume.toFixed(2)}
            sublabel={`${kpis.speciesCount} especies`}
          />
          <KpiCard
            label="Pendientes validar"
            value={kpis.pendingCount.toString()}
            sublabel="Requieren acción"
            tone={kpis.pendingCount > 0 ? "warning" : undefined}
          />
          <KpiCard
            label="Especies CITES"
            value={kpis.citesCount.toString()}
            sublabel="Protección internacional"
            tone={kpis.citesCount > 0 ? "danger" : undefined}
          />
        </div>
      </header>

      {/* Dashboard agregados */}
      {showDashboard && <SpeciesAggregateChart />}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-12">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Buscar por GTF, proveedor o especie..."
            className="w-full bg-transparent outline-none text-base text-[var(--text-primary)]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-12">
          <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-base font-medium text-[var(--text-primary)] outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="validado">Validados</option>
            <option value="procesado">Procesados</option>
            <option value="rechazado">Rechazados</option>
            <option value="anulado">Anulados</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-[var(--data-danger-900)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Fecha</Th>
              <Th>GTF</Th>
              <Th>Proveedor / Origen</Th>
              <Th>Especie</Th>
              <Th>Producto</Th>
              <Th className="text-right">Volumen (m³)</Th>
              <Th className="text-right">Piezas</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40"
              >
                <Td>
                  <div className="font-bold text-[var(--text-primary)]">
                    {formatDate(e.entryDate)}
                  </div>
                </Td>
                <Td>
                  <div className="font-mono text-xs font-bold text-[var(--text-primary)]">
                    {e.gtfNumber}
                  </div>
                  {e.gtfDate && (
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {formatDate(e.gtfDate)}
                    </div>
                  )}
                </Td>
                <Td>
                  <div className="font-medium text-[var(--text-primary)]">
                    {e.providerName}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    {originLabel(e.originType)}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {e.speciesCommonName}
                    </span>
                    {e.speciesCites && (
                      <span
                        title="Especie protegida CITES"
                        className="rounded-full bg-[var(--data-danger-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]"
                      >
                        CITES
                      </span>
                    )}
                  </div>
                  {e.speciesScientificName && (
                    <div className="text-xs italic text-[var(--text-tertiary)]">
                      {e.speciesScientificName}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                    {productLabel(e.productType)}
                  </span>
                </Td>
                <Td className="text-right">
                  <div className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {Number(e.volumeM3).toFixed(4)}
                  </div>
                </Td>
                <Td className="text-right">
                  <div className="font-mono tabular-nums text-[var(--text-primary)]">
                    {e.pieces}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={e.status} />
                  {e.rejectionReason && (
                    <div className="mt-1 text-xs text-[var(--data-danger-700)]">
                      {e.rejectionReason}
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  {e.status === "pendiente" ? (
                    rejectingId === e.id ? (
                      <div className="inline-flex flex-col items-end gap-2">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(ev) => setRejectReason(ev.target.value)}
                          placeholder="Motivo (min 3 chars)"
                          className="h-9 w-48 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm outline-none focus:border-[var(--data-danger-500)]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              rejectReason.trim().length < 3 ||
                              actionPending === `${e.id}:reject`
                            }
                            onClick={() => doAction(e.id, "reject", rejectReason.trim())}
                            className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-danger-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Confirmar rechazo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason("");
                            }}
                            className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          disabled={actionPending === `${e.id}:validate`}
                          onClick={() => doAction(e.id, "validate")}
                          title="Validar ingreso"
                          className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-success-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          <ThumbsUp className="h-3 w-3" />
                          Validar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(e.id);
                            setRejectReason("");
                          }}
                          title="Rechazar"
                          className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] px-3 text-xs font-bold text-[var(--data-danger-900)] hover:bg-[var(--data-danger-100)]"
                        >
                          <ThumbsDown className="h-3 w-3" />
                          Rechazar
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && entries.length === 0 && (
          <div className="p-12 text-center text-[var(--text-tertiary)]">
            <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-base font-medium">
              Sin ingresos registrados aún.
            </p>
            <p className="mt-1 text-sm">
              Hacé click en &quot;Nuevo ingreso&quot; para registrar el primer movimiento de madera.
            </p>
          </div>
        )}

        {loading && (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Cargando registros...</p>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <WoodEntryForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

function KpiCard({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "warning" | "danger";
}) {
  const accent =
    tone === "danger"
      ? "border-[var(--data-danger-300)] bg-[var(--data-danger-50)]"
      : tone === "warning"
        ? "border-[var(--data-warning-300)] bg-[var(--data-warning-50)]"
        : "border-[var(--rule-base)] bg-[var(--surface-raised)]";

  return (
    <div className={`rounded-2xl border-2 ${accent} p-4`}>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      {sublabel && (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{sublabel}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WoodEntry["status"] }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--${meta.color}-100)] px-2.5 py-1 text-xs font-bold text-[var(--${meta.color}-900)]`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function originLabel(type: string) {
  const labels: Record<string, string> = {
    concesion: "Concesión forestal",
    predio_privado: "Predio privado",
    comunidad_nativa: "Comunidad nativa",
    reforestacion: "Reforestación",
    retroaserradero: "Re-entrada CTP",
    otro: "Otro",
  };
  return labels[type] ?? type;
}

function productLabel(type: string) {
  const labels: Record<string, string> = {
    rolliza: "Rolliza",
    aserrada: "Aserrada",
    tablones: "Tablones",
    listones: "Listones",
    durmientes: "Durmientes",
    pulgada: "Pulgada",
    carbon: "Carbón",
    lena: "Leña",
    otro: "Otro",
  };
  return labels[type] ?? type;
}
