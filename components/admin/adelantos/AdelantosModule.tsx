"use client";

import { useState, useEffect, useCallback } from "react";
import { CardTitle, SectionTitle, StatCard } from "@buleje/design-system";
import {
  Coins,
  Users,
  Plus,
  X,
  TrendingDown,
  TrendingUp,
  Wallet,
  CheckCircle,
  Clock,
  Package,
  Ban,
  ChevronRight,
  Search,
  MessageCircle,
  Pencil,
  Trash2,
  BarChart3,
  Activity,
  AlertTriangle,
  FileText,
  Repeat,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { AnalisisView } from "./AnalisisView";
import { fmtMon, sumByMoneda, fmtMonedas, EmptyState, SkeletonGrid } from "./shared";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import type {
  DbAdelanto,
  DbBeneficiario,
  AdelantoModalidad,
  DbRecurrente,
  RecurrenteFrecuencia,
} from "@/lib/db/adelantos.db";

type BeneficiarioConSaldo = DbBeneficiario & {
  totalAdelantado: number;
  saldoPendiente: number;
  adelantosAbiertos: number;
};

type Resumen = {
  totalAdelantado: number;
  totalLiquidado: number;
  saldoPendiente: number;
  excedente: number;
  adelantosAbiertos: number;
  adelantosLiquidados: number;
  beneficiarios: number;
};

const MODULE_ID = "adelantos";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTO: { label: "Abierto", className: "bg-[var(--data-warning)]/15 text-[var(--data-warning)]" },
  LIQUIDADO: { label: "Liquidado", className: "bg-[var(--data-success)]/15 text-[var(--data-success)]" },
  EXCEDIDO: { label: "Excedido", className: "bg-[var(--data-info)]/15 text-[var(--data-info)]" },
  CANCELADO: { label: "Cancelado", className: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
};

const TABS = [
  { id: "resumen", label: "Resumen", icon: Wallet },
  { id: "lista", label: "Adelantos", icon: Coins },
  { id: "personas", label: "Personas", icon: Users },
  { id: "cobranza", label: "Cobranza", icon: AlertTriangle },
  { id: "recurrentes", label: "Recurrentes", icon: Repeat },
  { id: "actividad", label: "Actividad", icon: Activity },
  { id: "analisis", label: "Análisis", icon: BarChart3 },
];

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

// ── Multi-moneda (ADR-118): formato por moneda + totales segmentados ───────────
const MONEDAS = ["PEN", "USD"] as const;
// fmtMon, sumByMoneda, fmtMonedas → movidos a ./shared (ADR-121 refactor).

export default function AdelantosModule() {
  const [tab, setTab] = useState("resumen");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [adelantos, setAdelantos] = useState<DbAdelanto[]>([]);
  const [beneficiarios, setBeneficiarios] = useState<BeneficiarioConSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, a, b] = await Promise.all([
        fetch("/api/adelantos/resumen", { credentials: "include" }).then((x) => (x.ok ? x.json() : null)),
        fetch("/api/adelantos", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])),
        fetch("/api/adelantos/beneficiarios", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])),
      ]);
      setResumen(r);
      setAdelantos(Array.isArray(a) ? a : []);
      setBeneficiarios(Array.isArray(b) ? b : []);
    } catch {
      setError("No se pudo cargar los adelantos");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const sinPersonas = beneficiarios.length === 0;

  return (
    <div>
      <AdminModuleHeader
        as="h2"
        eyebrow="Finanzas · Adelantos"
        title="Adelantos & Liquidaciones"
        description="Adelantos de dinero a personas por servicios. Se liquidan con lo que te entregan (producto o servicio)."
        icon={Coins}
      >
        <button
          onClick={() => setTab(sinPersonas ? "personas" : "lista")}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-5 w-5" />
          {sinPersonas ? "Agregar persona" : "Nuevo adelanto"}
        </button>
      </AdminModuleHeader>

      <AdminTabBar tabs={TABS} activeTab={tab} onTabChange={setTab} moduleId={MODULE_ID}>
        <div className="pt-5 lg:pt-6">
          {error && (
            <div className="mb-4 rounded-xl border border-[var(--data-error)]/30 bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
              {error}
            </div>
          )}

          {tab === "resumen" && <ResumenView resumen={resumen} adelantos={adelantos} loading={loading} onGoTab={setTab} />}
          {tab === "lista" && (
            <AdelantosView
              adelantos={adelantos}
              beneficiarios={beneficiarios}
              loading={loading}
              onChange={reload}
            />
          )}
          {tab === "personas" && (
            <PersonasView beneficiarios={beneficiarios} adelantos={adelantos} loading={loading} onChange={reload} />
          )}
          {tab === "cobranza" && <CobranzaView adelantos={adelantos} loading={loading} onGoTab={setTab} />}
          {tab === "recurrentes" && <RecurrentesView beneficiarios={beneficiarios} onChange={reload} />}
          {tab === "actividad" && <ActividadView adelantos={adelantos} loading={loading} />}
          {tab === "analisis" && <AnalisisView adelantos={adelantos} loading={loading} />}
        </div>
      </AdminTabBar>
    </div>
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
function ResumenView({
  resumen,
  adelantos,
  loading,
  onGoTab,
}: {
  resumen: Resumen | null;
  adelantos: DbAdelanto[];
  loading: boolean;
  onGoTab: (tab: string) => void;
}) {
  if (loading) return <SkeletonGrid />;
  if (!resumen) return <EmptyState icon={Wallet} title="Sin datos aún" hint="Creá tu primer adelanto en la pestaña Adelantos." />;

  // Sin actividad todavía → guía de 2 pasos en vez del muro de ceros.
  const sinActividad =
    resumen.beneficiarios === 0 &&
    resumen.adelantosAbiertos === 0 &&
    resumen.adelantosLiquidados === 0;

  if (sinActividad) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Coins className="h-8 w-8 text-primary" />
        </div>
        <SectionTitle className="text-2xl">Empezá a registrar adelantos</SectionTitle>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Un adelanto es plata que le das a alguien y se va liquidando con lo que te entrega (producto o servicio).
        </p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">1</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Agregá una persona</p>
            <p className="text-sm text-[var(--text-secondary)]">A quién le vas a adelantar plata.</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">2</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Registrá el adelanto</p>
            <p className="text-sm text-[var(--text-secondary)]">El monto y cómo se va a liquidar.</p>
          </div>
        </div>
        <button
          onClick={() => onGoTab("personas")}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" /> Agregar primera persona
        </button>
      </div>
    );
  }

  const adelantado = resumen.totalAdelantado;
  const liquidado = resumen.totalLiquidado;
  const pct = adelantado > 0 ? Math.min(100, Math.round((liquidado / adelantado) * 100)) : 0;
  const abiertos = adelantos
    .filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0)
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente);

  // Cifras segmentadas por moneda (ADR-118) — desde el listado (que trae moneda)
  const activos = adelantos.filter((a) => a.status !== "CANCELADO");
  const saldoMap = sumByMoneda(abiertos.map((a) => ({ monto: a.saldoPendiente, moneda: a.moneda })));
  const adelantadoMap = sumByMoneda(activos.map((a) => ({ monto: a.montoAdelantado, moneda: a.moneda })));
  const liquidadoMap = sumByMoneda(activos.map((a) => ({ monto: Math.max(0, a.montoAdelantado - a.saldoPendiente), moneda: a.moneda })));
  const excedenteMap = sumByMoneda(adelantos.filter((a) => a.status === "EXCEDIDO").map((a) => ({ monto: -a.saldoPendiente, moneda: a.moneda })));
  const hayExcedente = Object.values(excedenteMap).some((v) => v > 0);

  // Mensaje de salud: prioriza lo que te deben; si nada, todo al día; si excedente, a favor de ellos.
  const health =
    resumen.saldoPendiente > 0
      ? { cls: "text-[var(--data-warning)]", Icon: Clock, text: `Te faltan ${fmtMonedas(saldoMap)} por recuperar.` }
      : hayExcedente
        ? { cls: "text-[var(--data-info)]", Icon: Coins, text: `Te entregaron ${fmtMonedas(excedenteMap)} de más.` }
        : { cls: "text-[var(--data-success)]", Icon: CheckCircle, text: "Todo al día — nadie te debe nada." };

  return (
    <div className="space-y-5">
      {/* Hero saldo + barra de progreso de recuperación */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Saldo pendiente</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmtMonedas(saldoMap)}</p>
          <div className={`mt-3 flex items-center gap-2 text-base font-semibold ${health.cls}`}>
            <health.Icon className="h-5 w-5 shrink-0" />
            <span>{health.text}</span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Recuperación de adelantos</CardTitle>
            <span className="text-2xl font-extrabold tabular-nums text-[var(--data-success)]">{pct}%</span>
          </div>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--data-success)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            Recuperaste <span className="font-bold text-[var(--text-primary)]">{fmtMonedas(liquidadoMap)}</span> de{" "}
            <span className="font-bold text-[var(--text-primary)]">{fmtMonedas(adelantadoMap)}</span> adelantados.
          </p>
        </div>
      </div>

      {/* Quién te debe — lista accionable de adelantos abiertos */}
      {abiertos.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Quién te debe ({abiertos.length})</CardTitle>
            <button onClick={() => onGoTab("lista")} className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">
              Ver todos <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {abiertos.slice(0, 5).map((a) => (
              <li key={a.id}>
                <button onClick={() => onGoTab("lista")} className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-primary">
                    {(a.beneficiario?.nombre ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-base font-bold text-[var(--text-primary)]">{a.beneficiario?.nombre ?? "—"}</span>
                  <span className="tabular-nums text-base font-extrabold text-[var(--data-warning)]">{fmtMon(a.saldoPendiente, a.moneda)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--rule-base)] pt-3">
            <span className="text-base font-bold text-[var(--text-secondary)]">Total por recuperar</span>
            <span className="tabular-nums text-lg font-extrabold text-[var(--data-warning)]">{fmtMonedas(saldoMap)}</span>
          </div>
        </div>
      )}

      {/* Plata (secundario) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total adelantado" value={fmtMonedas(adelantadoMap)} icon={TrendingDown} subValue="Plata que diste" />
        <StatCard label="Total liquidado" value={fmtMonedas(liquidadoMap)} icon={TrendingUp} emphasis="success" subValue="Recuperado en entregas" />
        <StatCard label="A favor de ellos" value={fmtMonedas(excedenteMap)} icon={Coins} emphasis={hayExcedente ? "error" : "neutral"} subValue="Entregaron de más" />
      </div>

      {/* Contadores clickeables → llevan a la lista/personas filtrada */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Adelantos abiertos" value={String(resumen.adelantosAbiertos)} icon={Coins} density="compact" onClick={() => onGoTab("lista")} />
        <StatCard label="Liquidados" value={String(resumen.adelantosLiquidados)} icon={CheckCircle} density="compact" onClick={() => onGoTab("lista")} />
        <StatCard label="Personas" value={String(resumen.beneficiarios)} icon={Users} density="compact" onClick={() => onGoTab("personas")} />
      </div>
    </div>
  );
}

// ── Adelantos ────────────────────────────────────────────────────────────────
function AdelantosView({
  adelantos,
  beneficiarios,
  loading,
  onChange,
}: {
  adelantos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  loading: boolean;
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [detalle, setDetalle] = useState<DbAdelanto | null>(null);
  const [filtro, setFiltro] = useState<string>("TODOS");
  const [q, setQ] = useState("");

  const counts = adelantos.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const estadosPresentes = (["ABIERTO", "LIQUIDADO", "EXCEDIDO", "CANCELADO"] as const).filter((e) => counts[e]);

  const filtrados = adelantos.filter((a) => {
    const okEstado = filtro === "TODOS" || a.status === filtro;
    const okQ = !q.trim() || (a.beneficiario?.nombre ?? "").toLowerCase().includes(q.trim().toLowerCase());
    return okEstado && okQ;
  });

  // Totales de la vista filtrada — segmentados por moneda (ADR-118)
  const tot = filtrados.reduce(
    (acc, a) => {
      const cur = a.moneda || "PEN";
      acc.adelantado[cur] = (acc.adelantado[cur] ?? 0) + a.montoAdelantado;
      acc.liquidado[cur] = (acc.liquidado[cur] ?? 0) + Math.max(0, a.montoAdelantado - a.saldoPendiente);
      if (a.status === "ABIERTO") acc.porRecuperar[cur] = (acc.porRecuperar[cur] ?? 0) + a.saldoPendiente;
      return acc;
    },
    { adelantado: {} as Record<string, number>, liquidado: {} as Record<string, number>, porRecuperar: {} as Record<string, number> },
  );

  const chipCls = (active: boolean) =>
    `h-10 px-4 rounded-full border-2 text-base font-bold transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {adelantos.length} adelanto{adelantos.length === 1 ? "" : "s"}
        </CardTitle>
        <button
          onClick={() => setShowCreate(true)}
          disabled={beneficiarios.length === 0}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          title={beneficiarios.length === 0 ? "Creá primero una persona" : undefined}
        >
          <Plus className="h-5 w-5" /> Nuevo adelanto
        </button>
      </div>

      {adelantos.length > 0 && (
        <>
          {/* Filtros por estado + búsqueda */}
          <div className="flex flex-wrap items-center gap-2">
            <button className={chipCls(filtro === "TODOS")} onClick={() => setFiltro("TODOS")}>Todos {adelantos.length}</button>
            {estadosPresentes.map((e) => (
              <button key={e} className={chipCls(filtro === e)} onClick={() => setFiltro(e)}>
                {STATUS_BADGE[e].label} {counts[e]}
              </button>
            ))}
            <div className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar persona..."
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Totales de la vista filtrada */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-base text-[var(--text-secondary)]">
            <span>Adelantado <strong className="tabular-nums text-[var(--text-primary)]">{fmtMonedas(tot.adelantado)}</strong></span>
            <span>Liquidado <strong className="tabular-nums text-[var(--data-success)]">{fmtMonedas(tot.liquidado)}</strong></span>
            <span>Por recuperar <strong className="tabular-nums text-[var(--data-warning)]">{fmtMonedas(tot.porRecuperar)}</strong></span>
          </div>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : adelantos.length === 0 ? (
        <EmptyState icon={Coins} title="Sin adelantos" hint={beneficiarios.length === 0 ? "Primero creá una persona en la pestaña Personas." : "Registrá tu primer adelanto."} />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Probá con otro filtro o búsqueda." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <table className="w-full text-base">
            <thead className="bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Persona</th>
                <th className="px-4 py-3 font-bold">Adelantado</th>
                <th className="px-4 py-3 font-bold">Liquidación</th>
                <th className="px-4 py-3 font-bold">Saldo</th>
                <th className="px-4 py-3 font-bold">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filtrados.map((a) => {
                const badge = STATUS_BADGE[a.status];
                const pct = a.montoAdelantado > 0 ? Math.min(100, Math.max(0, Math.round(((a.montoAdelantado - a.saldoPendiente) / a.montoAdelantado) * 100))) : 0;
                return (
                  <tr key={a.id} onClick={() => setDetalle(a)} className="cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{a.beneficiario?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{fmtMon(a.montoAdelantado, a.moneda)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-24 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                          <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular-nums text-sm font-semibold text-[var(--text-tertiary)]">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-bold text-[var(--text-primary)]">{fmtMon(a.saldoPendiente, a.moneda)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label ?? a.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.status === "ABIERTO" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetalle(a); }}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border-2 border-primary text-primary text-sm font-bold hover:bg-primary/10 transition-colors"
                        >
                          <Plus className="h-4 w-4" /> Registrar entrega
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            onChange();
          }}
        />
      )}
      {detalle && (
        <DetalleAdelantoModal
          adelantoId={detalle.id}
          onClose={() => setDetalle(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function CrearAdelantoModal({
  beneficiarios,
  initialBeneficiarioId,
  onClose,
  onCreated,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  initialBeneficiarioId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [beneficiarioId, setBeneficiarioId] = useState(initialBeneficiarioId ?? beneficiarios[0]?.id ?? "");
  const [modalidad, setModalidad] = useState<AdelantoModalidad>("CUENTA_CORRIENTE");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [notas, setNotas] = useState("");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const m = Number(monto);
    if (!beneficiarioId || !m || m <= 0) {
      setErr("Elegí una persona y un monto válido.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ beneficiarioId, modalidad, montoAdelantado: m, moneda, notas: notas.trim() || undefined, comprobanteUrl: comprobante || undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else {
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo crear el adelanto.");
    }
  };

  return (
    <ModalShell title="Nuevo adelanto" onClose={onClose}>
      <Field label="Persona">
        <select value={beneficiarioId} onChange={(e) => setBeneficiarioId(e.target.value)} className={inputCls}>
          {beneficiarios.map((b) => (
            <option key={b.id} value={b.id}>{b.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="Modalidad">
        <div className="grid grid-cols-2 gap-2">
          {([["CUENTA_CORRIENTE", "Cuenta corriente"], ["ENTREGAS_PACTADAS", "Entregas pactadas"]] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setModalidad(val)}
              className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${modalidad === val ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="Monto adelantado">
            <input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="500.00" className={inputCls + " tabular-nums"} />
          </Field>
        </div>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD")} className={inputCls}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m === "PEN" ? "S/ Soles" : "$ Dólares"}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas (opcional)">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputCls + " py-3"} />
      </Field>
      <Field label="Comprobante (opcional)"><ComprobanteUpload url={comprobante} onChange={setComprobante} /></Field>
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label="Crear adelanto" />
    </ModalShell>
  );
}

function DetalleAdelantoModal({
  adelantoId,
  onClose,
  onChange,
}: {
  adelantoId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(null);
  const [loading, setLoading] = useState(true);
  // form entrega
  const [tipo, setTipo] = useState<"LIBRE" | "PRODUCTO">("LIBRE");
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [productId, setProductId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [sumarAStock, setSumarAStock] = useState(false);
  const [entregaComp, setEntregaComp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [productos, setProductos] = useState<{ id: number; name: string; price: number; stock?: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/adelantos/${adelantoId}`, { credentials: "include" });
    setA(res.ok ? await res.json() : null);
    setLoading(false);
  }, [adelantoId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/products", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => setProductos(Array.isArray(d) ? d.map((p: { id: number; name: string; price?: number; stock?: number }) => ({ id: p.id, name: p.name, price: Number(p.price ?? 0), stock: p.stock })) : []))
      .catch((err) => console.warn("[adelantos] /api/products failed:", err));
  }, []);

  const prodSel = productos.find((p) => String(p.id) === productId);

  const registrar = async () => {
    setErr(null);
    const body: Record<string, unknown> = { tipo, notas: descripcion.trim() || undefined, comprobanteUrl: entregaComp || undefined };
    if (tipo === "LIBRE") {
      const v = Number(valor);
      if (!descripcion.trim() || !v || v <= 0) { setErr("Describí la entrega y poné un valor."); return; }
      body.descripcion = descripcion.trim();
      body.valorManual = v;
    } else {
      const pid = Number(productId);
      if (!pid) { setErr("Elegí un producto del catálogo."); return; }
      body.productId = pid;
      body.descripcion = descripcion.trim() || undefined;
      if (cantidad) body.cantidad = Number(cantidad);
      if (valor) body.valorManual = Number(valor);
      body.sumarAStock = sumarAStock;
    }
    setSaving(true);
    const res = await fetch(`/api/adelantos/${adelantoId}/entregas`, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setDescripcion(""); setValor(""); setProductId(""); setCantidad(""); setSumarAStock(false); setEntregaComp(null);
      await load();
      onChange();
    } else {
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo registrar la entrega.");
    }
  };

  const cancelar = async () => {
    if (!confirm("¿Cancelar este adelanto? No se borra el historial.")) return;
    await fetch(`/api/adelantos/${adelantoId}`, { method: "PATCH", headers: jsonHeaders(), credentials: "include", body: JSON.stringify({ cancelar: true }) });
    await load();
    onChange();
  };

  const badge = a ? STATUS_BADGE[a.status] : null;

  return (
    <ModalShell title={a ? `Adelanto · ${a.beneficiario?.nombre ?? ""}` : "Adelanto"} onClose={onClose} wide>
      {loading || !a ? (
        <SkeletonGrid />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Adelantado" value={fmtMon(a.montoAdelantado, a.moneda)} />
            <MiniStat label="Entregado" value={fmtMon(a.totalEntregado, a.moneda)} tone="success" />
            <MiniStat label="Saldo" value={fmtMon(a.saldoPendiente, a.moneda)} tone={a.saldoPendiente > 0 ? "warning" : "neutral"} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label}</span>
            {a.comprobanteUrl && (
              <a href={a.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                <img src={a.comprobanteUrl} alt="comprobante" className="h-7 w-7 rounded-md object-cover border border-[var(--rule-base)]" /> Comprobante
              </a>
            )}
            {a.status !== "CANCELADO" && (
              <button onClick={cancelar} className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error)] hover:underline">
                <Ban className="h-4 w-4" /> Cancelar adelanto
              </button>
            )}
          </div>

          {a.status !== "CANCELADO" && (
            <div className="rounded-2xl border-2 border-[var(--rule-base)] p-4 space-y-3">
              <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Registrar entrega</CardTitle>
              <div className="grid grid-cols-2 gap-2">
                {(["LIBRE", "PRODUCTO"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTipo(t)} className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${tipo === t ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>
                    {t === "LIBRE" ? "Servicio / libre" : "Producto"}
                  </button>
                ))}
              </div>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={tipo === "LIBRE" ? "Ej: reparación del local" : "Descripción (opcional)"} className={inputCls} />
              {tipo === "PRODUCTO" && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}>
                    <option value="">Elegí un producto…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}{p.stock != null ? ` · stock ${p.stock}` : ""}</option>
                    ))}
                  </select>
                  <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" className={inputCls + " tabular-nums"} />
                </div>
              )}
              {tipo === "PRODUCTO" && prodSel && cantidad && Number(cantidad) > 0 && !valor && (
                <p className="text-sm text-[var(--text-secondary)]">Valor estimado: <strong className="text-[var(--text-primary)]">{formatCurrency(prodSel.price * Number(cantidad))}</strong> ({Number(cantidad)} × {formatCurrency(prodSel.price)})</p>
              )}
              <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "LIBRE" ? "Valor en S/" : "Valor S/ (vacío = precio × cantidad)"} className={inputCls + " tabular-nums"} />
              {tipo === "PRODUCTO" && (
                <label className="flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={sumarAStock} onChange={(e) => setSumarAStock(e.target.checked)} className="h-5 w-5" />
                  Sumar al stock del inventario
                </label>
              )}
              <ComprobanteUpload url={entregaComp} onChange={setEntregaComp} />
              {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
              <button onClick={registrar} disabled={saving} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-[var(--data-success)] text-white text-base font-bold hover:opacity-90 transition disabled:opacity-50">
                <CheckCircle className="h-5 w-5" /> {saving ? "Registrando…" : "Registrar entrega"}
              </button>
            </div>
          )}

          <div>
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-2">Historial de entregas ({a.entregas.length})</CardTitle>
            {a.entregas.length === 0 ? (
              <p className="text-base text-[var(--text-tertiary)]">Todavía no hay entregas.</p>
            ) : (
              <ul className="space-y-2">
                {a.entregas.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-soft)] px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)] shrink-0">
                      {e.tipo === "PRODUCTO" ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-[var(--text-primary)] truncate">{e.descripcion || (e.tipo === "PRODUCTO" ? `Producto #${e.productId}` : "Entrega")}</p>
                      <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{new Date(e.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    {e.comprobanteUrl && (
                      <a href={e.comprobanteUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                        <img src={e.comprobanteUrl} alt="comprobante" className="h-9 w-9 rounded-lg object-cover border border-[var(--rule-base)]" />
                      </a>
                    )}
                    <span className="text-base font-extrabold tabular-nums text-[var(--data-success)] shrink-0">{fmtMon(e.valor, a.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Personas ─────────────────────────────────────────────────────────────────
function PersonasView({
  beneficiarios,
  adelantos,
  loading,
  onChange,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  adelantos: DbAdelanto[];
  loading: boolean;
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editPersona, setEditPersona] = useState<BeneficiarioConSaldo | null>(null);
  const [deletePersona, setDeletePersona] = useState<BeneficiarioConSaldo | null>(null);
  const [adelantoPara, setAdelantoPara] = useState<string | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<BeneficiarioConSaldo | null>(null);
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<"saldo" | "nombre" | "adelantado">("saldo");

  const ordenados = beneficiarios
    .filter((b) => !q.trim() || b.nombre.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
      if (orden === "adelantado") return b.totalAdelantado - a.totalAdelantado;
      return b.saldoPendiente - a.saldoPendiente;
    });
  const conSaldo = beneficiarios.filter((b) => b.saldoPendiente > 0).length;

  // Totales de toda la cartera de personas
  const tot = beneficiarios.reduce(
    (acc, b) => { acc.adelantado += b.totalAdelantado; acc.porRecuperar += b.saldoPendiente; return acc; },
    { adelantado: 0, porRecuperar: 0 },
  );
  const entregado = Math.max(0, tot.adelantado - tot.porRecuperar);

  // Recordatorio por WhatsApp (con saldo si debe).
  const waLink = (b: BeneficiarioConSaldo) => {
    const digits = (b.telefono ?? "").replace(/\D/g, "");
    const phone = digits.length === 9 ? `51${digits}` : digits;
    const msg =
      b.saldoPendiente > 0
        ? `Hola ${b.nombre}, te recuerdo que tenés un saldo pendiente de ${formatCurrency(b.saldoPendiente)} por liquidar. ¡Gracias!`
        : `Hola ${b.nombre}, ¿cómo estás?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const ordenChip = (val: typeof orden, label: string) =>
    `h-10 px-3 rounded-full border-2 text-sm font-bold transition-colors ${
      orden === val ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {beneficiarios.length} persona{beneficiarios.length === 1 ? "" : "s"}
          {conSaldo > 0 && <span className="font-semibold text-[var(--text-tertiary)]"> · {conSaldo} con saldo</span>}
        </CardTitle>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors">
          <Plus className="h-5 w-5" /> Nueva persona
        </button>
      </div>

      {beneficiarios.length > 0 && (
        <>
          {/* Búsqueda + orden */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar persona..."
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[var(--text-tertiary)]">Orden:</span>
              <button className={ordenChip("saldo", "")} onClick={() => setOrden("saldo")}>Saldo</button>
              <button className={ordenChip("nombre", "")} onClick={() => setOrden("nombre")}>Nombre</button>
              <button className={ordenChip("adelantado", "")} onClick={() => setOrden("adelantado")}>Adelantado</button>
            </div>
          </div>

          {/* Totales de la cartera */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-base text-[var(--text-secondary)]">
            <span>Adelantado <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(tot.adelantado)}</strong></span>
            <span>Entregado <strong className="tabular-nums text-[var(--data-success)]">{formatCurrency(entregado)}</strong></span>
            <span>Por recuperar <strong className="tabular-nums text-[var(--data-warning)]">{formatCurrency(tot.porRecuperar)}</strong></span>
          </div>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agregá a quién le das adelantos." />
      ) : ordenados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Probá con otro nombre." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ordenados.map((b) => {
            const debe = b.saldoPendiente > 0;
            return (
              <div key={b.id} className="relative flex flex-col rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                {/* Acciones editar / eliminar */}
                <div className="absolute right-3 top-3 flex gap-1">
                  <button onClick={() => setEditPersona(b)} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeletePersona(b)} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error)]/10 hover:text-[var(--data-error)] transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <button onClick={() => setEstadoCuenta(b)} className="flex items-start gap-3 pr-16 text-left group" title="Ver estado de cuenta">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-extrabold text-primary">
                    {b.nombre.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold text-[var(--text-primary)] truncate group-hover:text-primary transition-colors">{b.nombre}</p>
                    {b.documento && <p className="text-sm text-[var(--text-tertiary)] tabular-nums truncate">{b.documento}</p>}
                    {b.telefono && <p className="text-sm text-[var(--text-tertiary)] tabular-nums truncate">{b.telefono}</p>}
                  </div>
                </button>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t-2 border-[var(--rule-soft)] pt-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-tertiary)]">Adelantado</p>
                    <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(b.totalAdelantado)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--text-tertiary)]">Saldo</p>
                    <p className={`text-base font-extrabold tabular-nums ${debe ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>{formatCurrency(b.saldoPendiente)}</p>
                  </div>
                </div>
                {b.limiteCredito != null && b.limiteCredito > 0 && (
                  <p className={`mt-1.5 text-sm font-semibold ${b.saldoPendiente >= b.limiteCredito ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}`}>
                    Límite de crédito: {formatCurrency(b.limiteCredito)}
                    {b.saldoPendiente >= b.limiteCredito && " · alcanzado"}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {debe ? (
                    <span className="inline-flex items-center rounded-full bg-[var(--data-warning)]/15 px-3 py-1 text-sm font-bold text-[var(--data-warning)]">
                      {b.adelantosAbiertos} abierto{b.adelantosAbiertos === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success)]/15 px-3 py-1 text-sm font-bold text-[var(--data-success)]">
                      <CheckCircle className="h-4 w-4" /> Al día
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdelantoPara(b.id)}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border-2 border-primary text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="h-4 w-4" /> Adelanto
                    </button>
                    {b.telefono && (
                      <a
                        href={waLink(b)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
                        title={debe ? "Recordar saldo por WhatsApp" : "Escribir por WhatsApp"}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CrearPersonaModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); onChange(); }} />
      )}
      {editPersona && (
        <CrearPersonaModal persona={editPersona} onClose={() => setEditPersona(null)} onCreated={() => { setEditPersona(null); onChange(); }} />
      )}
      {deletePersona && (
        <EliminarPersonaModal persona={deletePersona} onClose={() => setDeletePersona(null)} onDeleted={() => { setDeletePersona(null); onChange(); }} />
      )}
      {adelantoPara && (
        <CrearAdelantoModal beneficiarios={beneficiarios} initialBeneficiarioId={adelantoPara} onClose={() => setAdelantoPara(null)} onCreated={() => { setAdelantoPara(null); onChange(); }} />
      )}
      {estadoCuenta && (
        <EstadoCuentaModal persona={estadoCuenta} adelantos={adelantos} onClose={() => setEstadoCuenta(null)} />
      )}
    </div>
  );
}

function CrearPersonaModal({ persona, onClose, onCreated }: { persona?: BeneficiarioConSaldo; onClose: () => void; onCreated: () => void }) {
  const editing = !!persona;
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [documento, setDocumento] = useState(persona?.documento ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [notas, setNotas] = useState(persona?.notas ?? "");
  const [limite, setLimite] = useState(persona?.limiteCredito != null ? String(persona.limiteCredito) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    const lim = limite.trim() ? Number(limite) : null;
    setSaving(true);
    const res = await fetch(
      editing ? `/api/adelantos/beneficiarios/${persona!.id}` : "/api/adelantos/beneficiarios",
      {
        method: editing ? "PATCH" : "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ nombre: nombre.trim(), documento: documento.trim() || undefined, telefono: telefono.trim() || undefined, notas: notas.trim() || undefined, limiteCredito: lim && lim > 0 ? lim : null }),
      },
    );
    setSaving(false);
    if (res.ok) onCreated();
    else setErr(editing ? "No se pudo guardar los cambios." : "No se pudo crear la persona.");
  };

  return (
    <ModalShell title={editing ? "Editar persona" : "Nueva persona"} onClose={onClose}>
      <Field label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} /></Field>
      <Field label="DNI / RUC (opcional)"><input value={documento} onChange={(e) => setDocumento(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      <Field label="Teléfono (opcional)"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      <Field label="Límite de crédito S/ (opcional)"><input type="number" min={0} value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sin límite" className={inputCls + " tabular-nums"} /></Field>
      <Field label="Notas (opcional)"><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputCls + " py-3"} /></Field>
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label={editing ? "Guardar cambios" : "Crear persona"} />
    </ModalShell>
  );
}

function EliminarPersonaModal({ persona, onClose, onDeleted }: { persona: BeneficiarioConSaldo; onClose: () => void; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    setSaving(true);
    const res = await fetch(`/api/adelantos/beneficiarios/${persona.id}`, { method: "DELETE", headers: jsonHeaders(), credentials: "include" });
    setSaving(false);
    if (res.ok) { onDeleted(); return; }
    const body = await res.json().catch(() => null);
    setErr(body?.error ?? "No se pudo eliminar la persona.");
  };
  return (
    <ModalShell title="Eliminar persona" onClose={onClose}>
      <p className="text-base text-[var(--text-secondary)]">
        ¿Seguro que querés eliminar a <strong className="text-[var(--text-primary)]">{persona.nombre}</strong>? Esta acción no se puede deshacer.
      </p>
      {err && <p className="mt-3 text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button onClick={submit} disabled={saving} className="h-12 px-5 rounded-2xl bg-[var(--data-error)] text-white text-base font-bold hover:opacity-90 disabled:opacity-50">
          {saving ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Estado de cuenta por persona (libro mayor + WhatsApp + PDF) ────────────────
function EstadoCuentaModal({ persona, adelantos, onClose }: { persona: BeneficiarioConSaldo; adelantos: DbAdelanto[]; onClose: () => void }) {
  const mios = adelantos.filter((a) => a.beneficiarioId === persona.id && a.status !== "CANCELADO");
  const movs: { fecha: string; concepto: string; monto: number }[] = [];
  for (const a of mios) {
    movs.push({ fecha: a.fechaAdelanto, concepto: "Adelanto", monto: a.montoAdelantado });
    for (const e of a.entregas) movs.push({ fecha: e.fecha, concepto: e.descripcion || "Entrega", monto: -e.valor });
  }
  movs.sort((x, y) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());
  let acc = 0;
  const rows = movs.map((m) => { acc += m.monto; return { ...m, saldo: acc }; });
  const saldoFinal = acc;
  const fmt = (f: string) => new Date(f).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
  const signo = (n: number) => (n >= 0 ? "+" : "−") + formatCurrency(Math.abs(n));

  const texto = () => {
    const lineas = rows.map((r) => `${fmt(r.fecha)} · ${r.concepto}: ${signo(r.monto)}`).join("\n");
    return `*Estado de cuenta*\n${persona.nombre}\n━━━━━━━━━━━━━━━━━━━\n${lineas}\n━━━━━━━━━━━━━━━━━━━\n*Saldo pendiente: ${formatCurrency(saldoFinal)}*`;
  };
  const waLink = () => {
    const digits = (persona.telefono ?? "").replace(/\D/g, "");
    const phone = digits.length === 9 ? `51${digits}` : digits;
    return `https://wa.me/${phone}?text=${encodeURIComponent(texto())}`;
  };
  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Estado de cuenta", 14, 18);
    doc.setFontSize(11); doc.text(persona.nombre, 14, 26);
    if (persona.documento) doc.text(`Doc: ${persona.documento}`, 14, 32);
    if (persona.telefono) doc.text(`Tel: ${persona.telefono}`, 14, persona.documento ? 38 : 32);
    autoTable(doc, {
      startY: persona.documento ? 44 : 38,
      head: [["Fecha", "Concepto", "Monto", "Saldo"]],
      body: rows.map((r) => [fmt(r.fecha), r.concepto, signo(r.monto), formatCurrency(r.saldo)]),
      foot: [["", "", "Saldo pendiente", formatCurrency(saldoFinal)]],
    });
    doc.save(`estado-cuenta-${persona.nombre.replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <ModalShell title="Estado de cuenta" onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold text-[var(--text-primary)] truncate">{persona.nombre}</p>
          {persona.telefono && <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{persona.telefono}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">Saldo pendiente</p>
          <p className={`text-2xl font-extrabold tabular-nums ${saldoFinal > 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>{formatCurrency(saldoFinal)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="Sin movimientos" hint="Esta persona no tiene adelantos registrados." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
          <table className="w-full text-base">
            <thead className="bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-bold">Fecha</th>
                <th className="px-3 py-2 font-bold">Concepto</th>
                <th className="px-3 py-2 font-bold text-right">Monto</th>
                <th className="px-3 py-2 font-bold text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">{fmt(r.fecha)}</td>
                  <td className="px-3 py-2 text-[var(--text-primary)]">{r.concepto}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.monto >= 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>{signo(r.monto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--text-primary)]">{formatCurrency(r.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={exportarPdf} className="inline-flex items-center gap-1 h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors">
          <FileText className="h-5 w-5" /> Descargar PDF
        </button>
        {persona.telefono && (
          <a href={waLink()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors">
            <MessageCircle className="h-5 w-5" /> Enviar por WhatsApp
          </a>
        )}
      </div>
    </ModalShell>
  );
}

// ── Cobranza ─────────────────────────────────────────────────────────────────
type DeudorCobranza = { id: string; nombre: string; telefono: string | null; saldo: number; dias: number };

function CobranzaView({ adelantos, loading, onGoTab }: { adelantos: DbAdelanto[]; loading: boolean; onGoTab: (t: string) => void }) {
  const [filtro, setFiltro] = useState<"todos" | "d0" | "d30" | "d60">("todos");
  const [recordados, setRecordados] = useState<Record<string, number>>({});
  const now = Date.now();
  const abiertos = adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);

  // Cargar "recordados" de localStorage
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const a of adelantos) {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(`adelanto-recordatorio-${a.beneficiarioId}`) : null;
      if (raw) map[a.beneficiarioId] = Number(raw);
    }
    setRecordados(map);
  }, [adelantos]);

  const bucketOf = (dias: number): "d0" | "d30" | "d60" => (dias > 60 ? "d60" : dias > 30 ? "d30" : "d0");
  const BUCKETS = [
    { id: "d0" as const, label: "Al día (0-30 días)", tone: "var(--data-success)" },
    { id: "d30" as const, label: "Vencido (31-60 días)", tone: "var(--data-warning)" },
    { id: "d60" as const, label: "Crítico (+60 días)", tone: "var(--data-error)" },
  ];

  // Deudores con saldo + días de atraso (adelanto abierto más antiguo)
  const dmap: Record<string, DeudorCobranza & { oldest: number }> = {};
  for (const a of abiertos) {
    const k = a.beneficiarioId;
    const t = new Date(a.fechaAdelanto).getTime();
    if (!dmap[k]) dmap[k] = { id: k, nombre: a.beneficiario?.nombre ?? "—", telefono: a.beneficiario?.telefono ?? null, saldo: 0, dias: 0, oldest: t };
    dmap[k].saldo += a.saldoPendiente;
    if (t < dmap[k].oldest) dmap[k].oldest = t;
  }
  const deudores: DeudorCobranza[] = Object.values(dmap).map((d) => ({ id: d.id, nombre: d.nombre, telefono: d.telefono, saldo: d.saldo, dias: Math.floor((now - d.oldest) / 86_400_000) }));

  const bucketTotals = { d0: { total: 0, n: 0 }, d30: { total: 0, n: 0 }, d60: { total: 0, n: 0 } };
  for (const d of deudores) { const b = bucketTotals[bucketOf(d.dias)]; b.total += d.saldo; b.n += 1; }

  const totalPorCobrar = deudores.reduce((s, d) => s + d.saldo, 0);
  const vencidoTotal = bucketTotals.d30.total + bucketTotals.d60.total;
  const pctVencido = totalPorCobrar > 0 ? Math.round((vencidoTotal / totalPorCobrar) * 100) : 0;
  const masAntiguo = [...deudores].sort((a, b) => b.dias - a.dias)[0];

  const pactadas = abiertos
    .filter((a) => a.modalidad === "ENTREGAS_PACTADAS")
    .flatMap((a) => a.entregasPactadas.filter((p) => p.fechaEsperada).map((p) => ({ persona: a.beneficiario?.nombre ?? "—", desc: p.descripcionEsperada, valor: p.valorEsperado, fecha: p.fechaEsperada! })))
    .sort((x, y) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

  const filtrados = (filtro === "todos" ? deudores : deudores.filter((d) => bucketOf(d.dias) === filtro)).sort((a, b) => b.dias - a.dias);

  const waLink = (d: DeudorCobranza) => {
    const digits = (d.telefono ?? "").replace(/\D/g, "");
    const phone = digits.length === 9 ? `51${digits}` : digits;
    return `https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${d.nombre}, te recuerdo que tenés un saldo pendiente de ${formatCurrency(d.saldo)} por liquidar. ¡Gracias!`)}`;
  };
  const marcarRecordado = (id: string) => {
    const ts = Date.now();
    window.localStorage.setItem(`adelanto-recordatorio-${id}`, String(ts));
    setRecordados((r) => ({ ...r, [id]: ts }));
  };
  const haceTexto = (dias: number) => (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`);
  const recordadoHace = (ts: number) => { const d = Math.floor((now - ts) / 86_400_000); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Lista de cobranza", 14, 18);
    doc.setFontSize(10); doc.text(`Total por cobrar: ${formatCurrency(totalPorCobrar)} · ${deudores.length} deudores · ${new Date().toLocaleDateString("es-PE")}`, 14, 25);
    autoTable(doc, {
      startY: 31,
      head: [["Persona", "Saldo", "Atraso", "Teléfono"]],
      body: [...deudores].sort((a, b) => b.dias - a.dias).map((d) => [d.nombre, formatCurrency(d.saldo), `${d.dias} días`, d.telefono ?? "—"]),
    });
    doc.save(`cobranza-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) return <SkeletonGrid />;
  if (abiertos.length === 0) return <EmptyState icon={CheckCircle} title="Nada por cobrar" hint="No hay adelantos abiertos con saldo pendiente." />;

  return (
    <div className="space-y-5">
      {/* KPIs de cobranza */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Total por cobrar</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--data-warning)]">{formatCurrency(totalPorCobrar)}</p>
          <p className="text-sm text-[var(--text-secondary)]">{deudores.length} deudor{deudores.length === 1 ? "" : "es"}</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cartera vencida</p>
          <p className={`mt-1 text-2xl font-extrabold tabular-nums ${pctVencido > 0 ? "text-[var(--data-error)]" : "text-[var(--data-success)]"}`}>{pctVencido}%</p>
          <p className="text-sm text-[var(--text-secondary)]">{formatCurrency(vencidoTotal)} con atraso</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Deuda más antigua</p>
          <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)] truncate">{masAntiguo?.nombre ?? "—"}</p>
          <p className="text-sm text-[var(--text-secondary)]">{masAntiguo ? haceTexto(masAntiguo.dias) : "—"}</p>
        </div>
      </div>

      {/* Antigüedad de saldos — clickeable para filtrar */}
      <div className="grid gap-3 sm:grid-cols-3">
        {BUCKETS.map((b) => {
          const activo = filtro === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setFiltro(activo ? "todos" : b.id)}
              className={`text-left rounded-xl border bg-[var(--surface-raised)] p-4 transition-all ${activo ? "ring-2 ring-primary border-primary" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"}`}
              style={{ borderLeftWidth: 6, borderLeftColor: b.tone }}
            >
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{b.label}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(bucketTotals[b.id].total)}</p>
              <p className="text-sm text-[var(--text-secondary)]">{bucketTotals[b.id].n} deudor{bucketTotals[b.id].n === 1 ? "" : "es"}</p>
            </button>
          );
        })}
      </div>

      {/* Entregas pactadas pendientes */}
      {pactadas.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-2">Entregas pactadas pendientes</CardTitle>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {pactadas.slice(0, 8).map((p, i) => {
              const vencida = new Date(p.fecha).getTime() < now;
              return (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-base font-semibold text-[var(--text-primary)] truncate">{p.persona} · <span className="font-normal text-[var(--text-secondary)]">{p.desc}</span></span>
                  <span className="tabular-nums text-base font-bold text-[var(--text-primary)]">{formatCurrency(p.valor)}</span>
                  <span className={`tabular-nums text-sm font-bold ${vencida ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}`}>{new Date(p.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recordatorios de cobranza */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
            Recordatorios ({filtrados.length}{filtro !== "todos" ? ` de ${deudores.length}` : ""})
          </CardTitle>
          <button onClick={exportarPdf} className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors">
            <FileText className="h-4 w-4" /> Descargar lista (PDF)
          </button>
        </div>
        <ul className="divide-y divide-[var(--rule-soft)]">
          {filtrados.map((d) => {
            const ts = recordados[d.id];
            const vencido = d.dias > 30;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-primary">{d.nombre.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-[var(--text-primary)] truncate">{d.nombre}</p>
                  <p className={`text-sm ${vencido ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}`}>
                    {haceTexto(d.dias)}{ts ? ` · recordado ${recordadoHace(ts)}` : ""}
                  </p>
                </div>
                <span className="tabular-nums text-base font-extrabold text-[var(--data-warning)]">{formatCurrency(d.saldo)}</span>
                {d.telefono ? (
                  <a
                    href={waLink(d)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => marcarRecordado(d.id)}
                    className={`inline-flex items-center gap-1 h-9 px-3 rounded-xl border text-sm font-bold transition-colors ${ts ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary" : "border-primary text-primary hover:bg-primary/10"}`}
                  >
                    <MessageCircle className="h-4 w-4" /> {ts ? "Recordar de nuevo" : "Recordar"}
                  </a>
                ) : (
                  <span className="text-sm text-[var(--text-tertiary)]">sin teléfono</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Actividad ────────────────────────────────────────────────────────────────
type ActEvento = { fecha: string; tipo: "adelanto" | "entrega"; persona: string; monto: number; moneda?: string | null; desc?: string };

function ActividadView({ adelantos, loading }: { adelantos: DbAdelanto[]; loading: boolean }) {
  const [tipo, setTipo] = useState<"todo" | "adelanto" | "entrega">("todo");
  const [rango, setRango] = useState<"hoy" | "semana" | "mes" | "todo">("mes");
  const [q, setQ] = useState("");

  const eventos: ActEvento[] = [];
  for (const a of adelantos) {
    const persona = a.beneficiario?.nombre ?? "—";
    if (a.status !== "CANCELADO") eventos.push({ fecha: a.fechaAdelanto, tipo: "adelanto", persona, monto: a.montoAdelantado, moneda: a.moneda });
    for (const e of a.entregas) eventos.push({ fecha: e.fecha, tipo: "entrega", persona, monto: e.valor, moneda: a.moneda, desc: e.descripcion ?? undefined });
  }
  eventos.sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());

  const now = Date.now();
  const cutoff = rango === "hoy" ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    : rango === "semana" ? now - 7 * 86_400_000
    : rango === "mes" ? now - 30 * 86_400_000
    : 0;
  const ql = q.trim().toLowerCase();
  const filtrados = eventos.filter((e) =>
    new Date(e.fecha).getTime() >= cutoff &&
    (tipo === "todo" || e.tipo === tipo) &&
    (!ql || e.persona.toLowerCase().includes(ql)),
  );

  const resumen = filtrados.reduce((a, e) => { if (e.tipo === "adelanto") a.adel += e.monto; else a.liq += e.monto; return a; }, { adel: 0, liq: 0 });

  // Agrupar por día (local)
  const localKey = (f: string) => { const d = new Date(f); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const hoyK = localKey(new Date().toISOString());
  const ayerK = localKey(new Date(Date.now() - 86_400_000).toISOString());
  const dayLabel = (k: string) => (k === hoyK ? "Hoy" : k === ayerK ? "Ayer" : new Date(k + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "long" }));
  const grupos: { key: string; eventos: ActEvento[]; adel: number; liq: number }[] = [];
  for (const e of filtrados) {
    const k = localKey(e.fecha);
    let g = grupos[grupos.length - 1];
    if (!g || g.key !== k) { g = { key: k, eventos: [], adel: 0, liq: 0 }; grupos.push(g); }
    g.eventos.push(e);
    if (e.tipo === "adelanto") g.adel += e.monto; else g.liq += e.monto;
  }

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Historial de actividad", 14, 18);
    doc.setFontSize(10); doc.text(`${filtrados.length} movimientos · +${formatCurrency(resumen.adel)} adelantado · −${formatCurrency(resumen.liq)} liquidado`, 14, 25);
    autoTable(doc, {
      startY: 31,
      head: [["Fecha", "Tipo", "Persona", "Detalle", "Monto"]],
      body: filtrados.map((e) => [new Date(e.fecha).toLocaleDateString("es-PE"), e.tipo === "adelanto" ? "Adelanto" : "Entrega", e.persona, e.desc ?? "", `${e.tipo === "adelanto" ? "+" : "-"}${fmtMon(e.monto, e.moneda)}`]),
    });
    doc.save(`actividad-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) return <SkeletonGrid />;
  if (eventos.length === 0) return <EmptyState icon={Activity} title="Sin actividad" hint="Acá aparecen adelantos y entregas a medida que ocurren." />;

  const chip = (active: boolean) =>
    `h-10 px-4 rounded-full border-2 text-base font-bold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`;
  const rangoChip = (active: boolean) =>
    `h-9 px-3 rounded-full border-2 text-sm font-bold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`;

  return (
    <div className="space-y-4">
      {/* Rango + resumen del periodo */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          {([["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["todo", "Todo"]] as const).map(([v, l]) => (
            <button key={v} className={rangoChip(rango === v)} onClick={() => setRango(v)}>{l}</button>
          ))}
        </div>
        <p className="text-base text-[var(--text-secondary)]">
          <span className="font-bold text-[var(--data-warning)]">+{formatCurrency(resumen.adel)}</span> adelantado ·{" "}
          <span className="font-bold text-[var(--data-success)]">−{formatCurrency(resumen.liq)}</span> liquidado ·{" "}
          <span className="font-bold text-[var(--text-primary)]">{filtrados.length}</span> movs
        </p>
      </div>

      {/* Filtros por tipo + búsqueda + PDF */}
      <div className="flex flex-wrap items-center gap-2">
        <button className={chip(tipo === "todo")} onClick={() => setTipo("todo")}>Todo</button>
        <button className={chip(tipo === "adelanto")} onClick={() => setTipo("adelanto")}>Adelantos</button>
        <button className={chip(tipo === "entrega")} onClick={() => setTipo("entrega")}>Entregas</button>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona..." className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary" />
        </div>
        <button onClick={exportarPdf} disabled={filtrados.length === 0} className="inline-flex items-center gap-1 h-12 px-4 rounded-xl border border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          <FileText className="h-5 w-5" /> PDF
        </button>
      </div>

      {/* Feed agrupado por día */}
      {grupos.length === 0 ? (
        <EmptyState icon={Search} title="Sin movimientos" hint="Probá con otro filtro o rango." />
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.key} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2">
                <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">{dayLabel(g.key)}</span>
                <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
                  {g.adel > 0 && <span className="font-bold text-[var(--data-warning)]">+{formatCurrency(g.adel)}</span>}
                  {g.adel > 0 && g.liq > 0 && " · "}
                  {g.liq > 0 && <span className="font-bold text-[var(--data-success)]">−{formatCurrency(g.liq)}</span>}
                </span>
              </div>
              <ul>
                {g.eventos.map((e, i) => {
                  const esAdelanto = e.tipo === "adelanto";
                  return (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--rule-soft)] last:border-0">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${esAdelanto ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]" : "bg-[var(--data-success)]/15 text-[var(--data-success)]"}`}>
                        {esAdelanto ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-[var(--text-primary)] truncate">{esAdelanto ? "Adelanto" : "Entrega"} · {e.persona}</p>
                        {e.desc && <p className="text-sm text-[var(--text-tertiary)] truncate">{e.desc}</p>}
                      </div>
                      <span className={`tabular-nums text-base font-extrabold ${esAdelanto ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>{esAdelanto ? "+" : "−"}{fmtMon(e.monto, e.moneda)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Recurrentes (ADR-118): plantillas de adelantos automáticos ────────────────
const FREC_LABEL: Record<RecurrenteFrecuencia, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };

function RecurrentesView({ beneficiarios, onChange }: { beneficiarios: BeneficiarioConSaldo[]; onChange: () => void }) {
  const [recs, setRecs] = useState<DbRecurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/adelantos/recurrentes", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
    setRecs(Array.isArray(r) ? r : []);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const toggle = async (r: DbRecurrente) => {
    await fetch(`/api/adelantos/recurrentes/${r.id}`, { method: "PATCH", headers: jsonHeaders(), credentials: "include", body: JSON.stringify({ activo: !r.activo }) });
    reload();
  };
  const borrar = async (r: DbRecurrente) => {
    await fetch(`/api/adelantos/recurrentes/${r.id}`, { method: "DELETE", headers: jsonHeaders(), credentials: "include" });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">{recs.length} recurrente{recs.length === 1 ? "" : "s"}</CardTitle>
        <button onClick={() => setShowCreate(true)} disabled={beneficiarios.length === 0} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors disabled:opacity-50">
          <Plus className="h-5 w-5" /> Nueva recurrente
        </button>
      </div>
      <p className="text-base text-[var(--text-secondary)]">Plantillas que crean un adelanto automáticamente cada cierto tiempo (un cron diario las materializa).</p>

      {loading ? (
        <SkeletonGrid />
      ) : recs.length === 0 ? (
        <EmptyState icon={Repeat} title="Sin recurrentes" hint={beneficiarios.length === 0 ? "Primero creá una persona." : "Programá un adelanto que se repita solo."} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recs.map((r) => (
            <div key={r.id} className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 ${!r.activo ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{r.beneficiarioNombre ?? "—"}</p>
                <button onClick={() => borrar(r)} title="Eliminar" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--data-error)]"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmtMon(r.monto, r.moneda)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-bold text-primary"><Repeat className="h-3.5 w-3.5" /> {FREC_LABEL[r.frecuencia]}</span>
                {r.proximaEjecucion && <span className="text-[var(--text-tertiary)]">Próx.: {new Date(r.proximaEjecucion).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>}
              </div>
              <button onClick={() => toggle(r)} className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${r.activo ? "bg-[var(--data-success)]/15 text-[var(--data-success)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
                {r.activo ? <><CheckCircle className="h-4 w-4" /> Activo</> : <><Ban className="h-4 w-4" /> Pausado</>}
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CrearRecurrenteModal beneficiarios={beneficiarios} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); reload(); onChange(); }} />
      )}
    </div>
  );
}

function CrearRecurrenteModal({ beneficiarios, onClose, onCreated }: { beneficiarios: BeneficiarioConSaldo[]; onClose: () => void; onCreated: () => void }) {
  const [beneficiarioId, setBeneficiarioId] = useState(beneficiarios[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [frecuencia, setFrecuencia] = useState<RecurrenteFrecuencia>("mensual");
  const [diaMes, setDiaMes] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const m = Number(monto);
    if (!beneficiarioId || !m || m <= 0) { setErr("Elegí persona y un monto válido."); return; }
    setSaving(true);
    const res = await fetch("/api/adelantos/recurrentes", {
      method: "POST", headers: jsonHeaders(), credentials: "include",
      body: JSON.stringify({ beneficiarioId, monto: m, moneda, frecuencia, diaMes: frecuencia === "mensual" ? Number(diaMes) : undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else { const j = await res.json().catch(() => null); setErr(j?.error ?? "No se pudo crear la recurrente."); }
  };

  return (
    <ModalShell title="Nueva recurrente" onClose={onClose}>
      <Field label="Persona">
        <select value={beneficiarioId} onChange={(e) => setBeneficiarioId(e.target.value)} className={inputCls}>
          {beneficiarios.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="Monto"><input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="200.00" className={inputCls + " tabular-nums"} /></Field>
        </div>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD")} className={inputCls}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m === "PEN" ? "S/" : "$"}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Frecuencia">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["semanal", "quincenal", "mensual"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFrecuencia(f)} className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${frecuencia === f ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>{FREC_LABEL[f]}</button>
          ))}
        </div>
      </Field>
      {frecuencia === "mensual" && (
        <Field label="Día del mes (1-28)"><input type="number" min={1} max={28} value={diaMes} onChange={(e) => setDiaMes(e.target.value)} className={inputCls + " tabular-nums"} /></Field>
      )}
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label="Crear recurrente" />
    </ModalShell>
  );
}

// ── Comprobante (subida de foto/recibo) ───────────────────────────────────────
function ComprobanteUpload({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) {
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setUp(true);
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "media");
    const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
    setUp(false);
    if (res.ok) { const j = await res.json().catch(() => null); if (j?.url) onChange(j.url); }
    else { const j = await res.json().catch(() => null); setErr(j?.error ?? "No se pudo subir la imagen."); }
  };
  return (
    <div>
      {url ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail de comprobante desde Supabase Storage */}
          <img src={url} alt="comprobante" className="h-12 w-12 rounded-lg object-cover border border-[var(--rule-base)]" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary hover:underline">Ver</a>
          <button type="button" onClick={() => onChange(null)} className="text-sm font-bold text-[var(--data-error)] hover:underline">Quitar</button>
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary cursor-pointer transition-colors">
          <FileText className="h-4 w-4" /> {up ? "Subiendo…" : "Adjuntar comprobante"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handle} className="hidden" disabled={up} />
        </label>
      )}
      {err && <p className="mt-1 text-sm text-[var(--data-error)]">{err}</p>}
    </div>
  );
}

// ── Primitivos compartidos ─────────────────────────────────────────────────────
const inputCls =
  "w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-xl)]`}>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">{title}</CardTitle>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onClose} className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="flex-1 h-12 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark disabled:opacity-50">{saving ? "Guardando…" : label}</button>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-[var(--data-success)]" : tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] p-3 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// EmptyState, SkeletonGrid → movidos a ./shared (ADR-121 refactor).
