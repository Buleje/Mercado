"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CardTitle, SectionTitle, StatCard } from "@buleje/design-system";
import {
  Coins,
  Users,
  Plus,
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
  Download,
  ChevronLeft,
} from "@buleje/design-system/icons";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { AnalisisView } from "./AnalisisView";
import CrearAdelantoModal from "./CrearAdelantoModal";
import DescuentoPlanillaModal from "./DescuentoPlanillaModal";
import DetalleAdelantoModal from "./detalle/DetalleAdelantoModal";
import TablaAdelantos from "./lista/TablaAdelantos";
import TarjetaPersona from "./personas/TarjetaPersona";
import FichaPersonaModal from "./personas/FichaPersonaModal";
import CobranzaView from "./cobranza/CobranzaView";
import ProximosVencimientos from "./cobranza/ProximosVencimientos";
import CrearPersonaModal from "./personas/CrearPersonaModal";
import { sinTildes, fmtMon, sumByMoneda, fmtMonedas, EmptyState, SkeletonGrid, inputCls, Field, ModalShell, ModalActions, MiniStat, STATUS_BADGE } from "./shared";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { estadoDeCredito, ordenarPorRiesgoDeCredito, requiereAtencion } from "@/lib/adelantos/limite-credito";
import { normalizarBusquedaCodigo } from "@/lib/adelantos/codigo-operacion";
import { descargarCsvAdelantos } from "@/lib/adelantos/exportar-csv";
import { paginar, type ColumnaOrden, type Direccion } from "@/lib/adelantos/ordenar-lista";
import {
  cumpleFiltro,
  ordenarPersonas,
  type FiltroPersonas,
  type OrdenPersonas,
} from "@/lib/adelantos/ordenar-personas";
import { descargarCsvPersonas } from "@/lib/adelantos/exportar-csv";
import { enlaceWhatsApp } from "@/lib/adelantos/contacto";
import {
  deudoresDeCobranza,
  explicarAtraso,
  ordenarPorUrgencia,
  type DeudorCobranza,
} from "@/lib/adelantos/urgencia-cobranza";
import { TRAMOS, tramoDe } from "@/lib/adelantos/gestion-cobranza";
import type { BeneficiarioConSaldo as BeneficiarioConSaldoBase } from "./crear-adelanto/tipos";
import type {
  DbAdelanto,
  DbRecurrente,
  RecurrenteFrecuencia,
} from "@/lib/db/adelantos.db";

/** Single source: la misma forma que consume el alta (ver crear-adelanto/tipos). */
type BeneficiarioConSaldo = BeneficiarioConSaldoBase;

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

/**
 * Filas por página del listado.
 *
 * 25 entra en una pantalla sin scrollear la tabla entera y deja el paginador a
 * la vista. Más alto vuelve al muro que esto vino a resolver.
 */
const POR_PAGINA = 25;

/** Personas por página: 12 llenan tres columnas de cuatro filas sin muro. */
const PERSONAS_POR_PAGINA = 12;


const TABS = [
  { id: "resumen", label: "Resumen", icon: Wallet },
  { id: "lista", label: "Adelantos", icon: Coins },
  { id: "personas", label: "Personas", icon: Users },
  { id: "cobranza", label: "Cobranza", icon: AlertTriangle },
  { id: "recurrentes", label: "Recurrentes", icon: Repeat },
  { id: "actividad", label: "Actividad", icon: Activity },
  { id: "analisis", label: "Análisis", icon: BarChart3 },
];

/** Los ids, DERIVADOS de TABS: listarlos aparte los deja desincronizarse. */
const TAB_IDS = TABS.map((t) => t.id);

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

// ── Multi-moneda (ADR-118): formato por moneda + totales segmentados ───────────
const MONEDAS = ["PEN", "USD"] as const;
// fmtMon, sumByMoneda, fmtMonedas → movidos a ./shared (ADR-121 refactor).

export default function AdelantosModule() {
  /**
   * La sub-vista vive en `?sub=` y no en `?vista=`: este módulo se renderiza
   * DENTRO de Mi Plata, que ya es dueño de ese parámetro. Antes era un
   * `useState` pelado — ni se compartía por link, ni recordaba, ni el atrás la
   * recorría.
   */
  const { vista: tab, irA: setTab } = useSubvistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [adelantos, setAdelantos] = useState<DbAdelanto[]>([]);
  const [beneficiarios, setBeneficiarios] = useState<BeneficiarioConSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * El alta vive acá arriba y no dentro de la lista porque la dispara el botón
   * de la barra de pestañas, que está visible desde cualquier sub-vista. Antes
   * ese botón sólo cambiaba de pestaña: decía «Nuevo adelanto» y había que
   * buscar y apretar OTRO botón igual, ya adentro.
   */
  const [creando, setCreando] = useState(false);

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
      {/* SIN encabezado propio: lo pinta Mi Plata, que ya sabe que estás en
          Adelantos (ver CABECERA en FinanzasModule). Antes había dos títulos y
          dos descripciones apilados, y la acción primaria competía con la del
          padre por el mismo peso visual. La de acá va en la barra de pestañas,
          pegada a lo que se está mirando. */}

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
        rightSlot={
          <button
            onClick={() => {
              if (sinPersonas) { setTab("personas"); return; }
              setTab("lista");
              setCreando(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            {sinPersonas ? "Agregar persona" : "Nuevo adelanto"}
          </button>
        }
      >
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
              creando={creando}
              onCreando={setCreando}
            />
          )}
          {tab === "personas" && (
            <PersonasView beneficiarios={beneficiarios} adelantos={adelantos} loading={loading} onChange={reload} />
          )}
          {tab === "cobranza" && <CobranzaView adelantos={adelantos} loading={loading} onGoTab={setTab} onRecordado={() => void reload()} />}
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
  const abiertos = adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);

  /**
   * Quién te debe — antes era la lista de ADELANTOS abiertos (una fila por
   * cada uno, aunque sean tres de la misma persona) ordenada sólo por monto.
   * `deudoresDeCobranza` agrupa por PERSONA y `ordenarPorUrgencia` prioriza el
   * compromiso roto (una pactada o un vencimiento incumplido) sobre la mera
   * antigüedad — es la misma regla que usa la pestaña Cobranza, no una nueva.
   */
  const deudores: DeudorCobranza[] = ordenarPorUrgencia(deudoresDeCobranza(abiertos));
  const porTramo = TRAMOS.map((t) => ({ ...t, n: deudores.filter((d) => tramoDe(d.dias) === t.id).length })).filter(
    (t) => t.n > 0,
  );

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

  /* Donut de "% recuperado": una sola dona en vez de dos categorías — el
     resto (surface-sunken) es sólo el fondo del medidor, no una segunda
     serie que compita en el tooltip. */
  const donutData = [
    { name: "Recuperado", value: pct, color: "var(--data-success)" },
    { name: "Pendiente", value: 100 - pct, color: "var(--surface-sunken)" },
  ];

  return (
    <div className="space-y-5">
      {/* Hero saldo + dona de recuperación */}
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
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative h-[140px] w-[140px] shrink-0">
              <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={64}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{pct}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Recuperación de adelantos</CardTitle>
              <p className="mt-2 text-base text-[var(--text-secondary)]">
                Recuperaste <span className="font-bold text-[var(--text-primary)]">{fmtMonedas(liquidadoMap)}</span> de{" "}
                <span className="font-bold text-[var(--text-primary)]">{fmtMonedas(adelantadoMap)}</span> adelantados.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ProximosVencimientos adelantos={adelantos} />

      {/* Quién te debe — deudores (no adelantos sueltos) ordenados por urgencia real */}
      {deudores.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Quién te debe ({deudores.length})</CardTitle>
            <button onClick={() => onGoTab("cobranza")} className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">
              Ver todos <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Distribución por antigüedad — mismos tramos y colores que Cobranza */}
          {porTramo.length > 1 && (
            <div className="mb-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                {porTramo.map((t) => (
                  <div
                    key={t.id}
                    style={{ width: `${(t.n / deudores.length) * 100}%`, backgroundColor: t.tono }}
                    title={`${t.label}: ${t.n}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {porTramo.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.tono }} />
                    {t.label}: <strong className="text-[var(--text-secondary)]">{t.n}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <ul className="divide-y divide-[var(--rule-soft)]">
            {deudores.slice(0, 5).map((d) => {
              const tramo = TRAMOS.find((t) => t.id === tramoDe(d.dias)) ?? TRAMOS[0];
              const wa = enlaceWhatsApp(d.telefono, d.nombre, d.saldo);
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <button
                    onClick={() => onGoTab("cobranza")}
                    className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--surface-sunken)]/50"
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      {d.nombre.charAt(0).toUpperCase()}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface-raised)]"
                        style={{ backgroundColor: tramo.tono }}
                        title={tramo.label}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold text-[var(--text-primary)]">{d.nombre}</span>
                      <span className="block truncate text-sm text-[var(--text-tertiary)]">{explicarAtraso(d)}</span>
                    </span>
                  </button>
                  <span className="shrink-0 tabular-nums text-base font-extrabold text-[var(--data-warning)]">{fmtMon(d.saldo)}</span>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Recordarle a ${d.nombre} por WhatsApp`}
                      aria-label={`Recordarle a ${d.nombre} por WhatsApp`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
                  )}
                </li>
              );
            })}
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
  creando,
  onCreando,
}: {
  adelantos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  loading: boolean;
  onChange: () => void;
  /** El alta la controla el módulo: la abre el botón de la barra de pestañas. */
  creando: boolean;
  onCreando: (v: boolean) => void;
}) {
  const [detalle, setDetalle] = useState<DbAdelanto | null>(null);
  /** Los descuentos de planilla del período, en una pasada. */
  const [planilla, setPlanilla] = useState(false);
  const [filtro, setFiltro] = useState<string>("TODOS");
  const [q, setQ] = useState("");
  /** Lo más reciente primero: es lo que uno viene a mirar al abrir la lista. */
  const [orden, setOrden] = useState<{ columna: ColumnaOrden; direccion: Direccion }>({
    columna: "fecha",
    direccion: "desc",
  });
  const [pagina, setPagina] = useState(1);

  const counts = adelantos.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const estadosPresentes = (["ABIERTO", "LIQUIDADO", "EXCEDIDO", "CANCELADO"] as const).filter((e) => counts[e]);

  const filtrados = adelantos.filter((a) => {
    const okEstado = filtro === "TODOS" || a.status === filtro;
    const texto = q.trim().toLowerCase();
    /**
     * Se busca por lo que una persona tiene a mano: el nombre, el código de
     * operación —dictado como sea: «2026-7», «adl-2026-7»— o el número del
     * recibo de papel. Filtrar sólo por nombre obligaba a saber a quién
     * pertenece un recibo antes de poder encontrarlo.
     */
    const codigoBuscado = normalizarBusquedaCodigo(q);
    const okQ =
      !texto ||
      (a.beneficiario?.nombre ?? "").toLowerCase().includes(texto) ||
      (a.reciboManual ?? "").toLowerCase().includes(texto) ||
      (codigoBuscado
        ? a.codigoOperacion === codigoBuscado
        : (a.codigoOperacion ?? "").toLowerCase().includes(texto));
    return okEstado && okQ;
  });

  /**
   * Filtrar o buscar vuelve a la página 1: quedarse en la 4 después de achicar
   * el resultado a 12 filas muestra una tabla vacía que parece un error.
   */
  useEffect(() => setPagina(1), [filtro, q, orden.columna, orden.direccion]);

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
        ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {adelantos.length} adelanto{adelantos.length === 1 ? "" : "s"}
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* Sólo si hay adelantos de planilla abiertos: un botón que abre una
              lista vacía es un botón que enseña a no confiar en los botones. */}
          {adelantos.some((a) => a.modalidad === "DESCUENTO_PLANILLA" && a.status === "ABIERTO" && a.saldoPendiente > 0) && (
            <button
              onClick={() => setPlanilla(true)}
              title="Descontar los adelantos de sueldo del período, todos de una"
              className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <Users className="h-5 w-5" /> Descuentos de planilla
            </button>
          )}
          {/* El alta la abre el botón de la barra de pestañas, que está visible
              desde cualquier sub-vista. Repetirlo acá dejaba dos botones
              idénticos a diez centímetros uno del otro. */}
          <button
            onClick={() => onCreando(true)}
            disabled={beneficiarios.length === 0}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 lg:hidden"
            title={beneficiarios.length === 0 ? "Creá primero una persona" : undefined}
          >
            <Plus className="h-5 w-5" /> Nuevo adelanto
          </button>
        </div>
      </div>

      {planilla && (
        <DescuentoPlanillaModal
          adelantos={adelantos}
          onClose={() => setPlanilla(false)}
          onAplicado={onChange}
        />
      )}

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
            {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
            <div className="relative ml-auto flex-1 sm:flex-none" style={{ minWidth: 220 }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por persona, código (ADL-2026-7) o recibo…"
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Totales de la vista filtrada + export de LO FILTRADO */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-base text-[var(--text-secondary)]">
            <span>Adelantado <strong className="tabular-nums text-[var(--text-primary)]">{fmtMonedas(tot.adelantado)}</strong></span>
            <span>Liquidado <strong className="tabular-nums text-[var(--data-success)]">{fmtMonedas(tot.liquidado)}</strong></span>
            <span>Por recuperar <strong className="tabular-nums text-[var(--data-warning)]">{fmtMonedas(tot.porRecuperar)}</strong></span>
            <button
              onClick={() => descargarCsvAdelantos(filtrados, `adelantos-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={filtrados.length === 0}
              title="Baja exactamente lo que estás viendo, con filtro y búsqueda aplicados"
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
            >
              <Download className="h-4 w-4" /> CSV ({filtrados.length})
            </button>
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
        <TablaAdelantos
          adelantos={filtrados}
          orden={orden}
          onOrden={setOrden}
          pagina={pagina}
          onPagina={setPagina}
          porPagina={POR_PAGINA}
          onVerDetalle={setDetalle}
        />
      )}

      {creando && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          adelantos={adelantos}
          onPersonaCreada={onChange}
          onClose={() => onCreando(false)}
          onCreated={() => {
            onCreando(false);
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
  const [ficha, setFicha] = useState<BeneficiarioConSaldo | null>(null);
  const [detalleAdelanto, setDetalleAdelanto] = useState<DbAdelanto | null>(null);
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenPersonas>("saldo");
  const [filtro, setFiltro] = useState<FiltroPersonas>("todas");
  const [pagina, setPagina] = useState(1);

  /**
   * Se busca por nombre, documento Y teléfono, sin tildes: antes sólo por
   * nombre y con acento exacto, así que «maria» no encontraba a «María» y un
   * número de teléfono a mano no servía para nada.
   */
  const filtradas = useMemo(() => {
    const t = sinTildes(q);
    const soloDigitos = t.replace(/\D/g, "");
    return beneficiarios.filter((b) => {
      if (!cumpleFiltro(b, filtro)) return false;
      if (!t) return true;
      return (
        sinTildes(b.nombre).includes(t) ||
        (b.documento ?? "").includes(t) ||
        (!!soloDigitos && (b.telefono ?? "").replace(/\D/g, "").includes(soloDigitos))
      );
    });
  }, [beneficiarios, q, filtro]);

  const ordenados = useMemo(() => ordenarPersonas(filtradas, orden), [filtradas, orden]);
  const pag = paginar(ordenados, pagina, PERSONAS_POR_PAGINA);

  /** Cambiar de filtro con la página 4 abierta dejaba una grilla en blanco. */
  useEffect(() => setPagina(1), [q, orden, filtro]);

  /**
   * Los totales de la cartera, con la MISMA definición que la pestaña
   * Adelantos: los cancelados no se cobran. Antes acá se sumaba todo y las dos
   * pestañas mostraban cifras distintas para la misma pregunta.
   */
  const tot = beneficiarios.reduce(
    (acc, b) => {
      acc.adelantado += b.totalAdelantado;
      acc.entregado += b.totalEntregado;
      acc.porRecuperar += b.saldoPendiente;
      acc.aFavor += b.saldoAFavor;
      return acc;
    },
    { adelantado: 0, entregado: 0, porRecuperar: 0, aFavor: 0 },
  );
  const conSaldo = beneficiarios.filter((b) => b.saldoPendiente > 0).length;
  const enRiesgo = beneficiarios.filter((b) => requiereAtencion(estadoDeCredito(b.limiteCredito, b.saldoPendiente))).length;
  const hayTopes = beneficiarios.some((b) => (b.limiteCredito ?? 0) > 0);

  const chip = (activo: boolean) =>
    `h-10 px-3.5 rounded-full border-2 text-sm font-bold transition-colors ${
      activo
        ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">
          {beneficiarios.length} persona{beneficiarios.length === 1 ? "" : "s"}
          {conSaldo > 0 && <span className="font-semibold text-[var(--text-tertiary)]"> · {conSaldo} con saldo</span>}
        </CardTitle>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" /> Nueva persona
        </button>
      </div>

      {beneficiarios.length > 0 && (
        <>
          {/* Filtros por situación + búsqueda + orden */}
          <div className="flex flex-wrap items-center gap-2">
            {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
            <div className="relative flex-1 sm:max-w-sm" style={{ minWidth: 240 }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, documento o teléfono…"
                aria-label="Buscar persona"
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={chip(filtro === "todas")} onClick={() => setFiltro("todas")}>
                Todas {beneficiarios.length}
              </button>
              {conSaldo > 0 && (
                <button className={chip(filtro === "deben")} onClick={() => setFiltro("deben")}>
                  Deben {conSaldo}
                </button>
              )}
              <button className={chip(filtro === "al-dia")} onClick={() => setFiltro("al-dia")}>
                Al día {beneficiarios.length - conSaldo}
              </button>
              {/* Sólo si hay topes cargados: un filtro que siempre da cero
                  enseña a no confiar en los filtros. */}
              {hayTopes && enRiesgo > 0 && (
                <button className={chip(filtro === "riesgo")} onClick={() => setFiltro("riesgo")}>
                  Sin margen {enRiesgo}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-tertiary)]">Orden:</span>
            <button className={chip(orden === "saldo")} onClick={() => setOrden("saldo")}>Saldo</button>
            {hayTopes && (
              <button
                className={chip(orden === "riesgo")}
                onClick={() => setOrden("riesgo")}
                title="Primero quien está más cerca de su límite de crédito"
              >
                Cerca del tope
              </button>
            )}
            <button className={chip(orden === "nombre")} onClick={() => setOrden("nombre")}>Nombre</button>
            <button className={chip(orden === "adelantado")} onClick={() => setOrden("adelantado")}>Adelantado</button>
            <button
              className={chip(orden === "cumplimiento")}
              onClick={() => setOrden("cumplimiento")}
              title="Primero quien menos devolvió de lo que sacó"
            >
              Cumplimiento
            </button>
            <button className={chip(orden === "reciente")} onClick={() => setOrden("reciente")}>Último adelanto</button>
          </div>

          {/* Totales de la cartera + export de lo filtrado */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-base text-[var(--text-secondary)]">
            <span>Adelantado <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(tot.adelantado)}</strong></span>
            <span>Devuelto <strong className="tabular-nums text-[var(--data-success)]">{formatCurrency(tot.entregado)}</strong></span>
            <span>Por recuperar <strong className="tabular-nums text-[var(--data-warning)]">{formatCurrency(tot.porRecuperar)}</strong></span>
            {tot.aFavor > 0 && (
              <span>A favor de ellos <strong className="tabular-nums text-[var(--data-info)]">{formatCurrency(tot.aFavor)}</strong></span>
            )}
            <button
              onClick={() => descargarCsvPersonas(ordenados, `personas-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={ordenados.length === 0}
              title="Baja exactamente lo que estás viendo, con filtro y búsqueda aplicados"
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
            >
              <Download className="h-4 w-4" /> CSV ({ordenados.length})
            </button>
          </div>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agregá a quién le das adelantos." />
      ) : ordenados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Probá con otro nombre, documento o filtro." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pag.items.map((b) => (
              <TarjetaPersona
                key={b.id}
                persona={b}
                onVerFicha={() => setFicha(b)}
                onEditar={() => setEditPersona(b)}
                onEliminar={() => setDeletePersona(b)}
                onAdelanto={() => setAdelantoPara(b.id)}
              />
            ))}
          </div>
          {pag.totalPaginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                {pag.desde}–{pag.hasta} de {pag.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPagina(pag.pagina - 1)}
                  disabled={pag.pagina <= 1}
                  aria-label="Página anterior"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {pag.pagina} / {pag.totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(pag.pagina + 1)}
                  disabled={pag.pagina >= pag.totalPaginas}
                  aria-label="Página siguiente"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CrearPersonaModal
          personasExistentes={beneficiarios}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onChange(); }}
        />
      )}
      {editPersona && (
        <CrearPersonaModal
          persona={editPersona}
          personasExistentes={beneficiarios}
          onClose={() => setEditPersona(null)}
          onCreated={() => { setEditPersona(null); onChange(); }}
        />
      )}
      {deletePersona && (
        <EliminarPersonaModal persona={deletePersona} onClose={() => setDeletePersona(null)} onDeleted={() => { setDeletePersona(null); onChange(); }} />
      )}
      {adelantoPara && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          adelantos={adelantos}
          initialBeneficiarioId={adelantoPara}
          onPersonaCreada={onChange}
          onClose={() => setAdelantoPara(null)}
          onCreated={() => { setAdelantoPara(null); onChange(); }}
        />
      )}
      {ficha && (
        <FichaPersonaModal
          persona={ficha}
          adelantos={adelantos}
          onClose={() => setFicha(null)}
          onEditar={() => { setEditPersona(ficha); setFicha(null); }}
          onNuevoAdelanto={() => { setAdelantoPara(ficha.id); setFicha(null); }}
          onVerAdelanto={(a) => { setDetalleAdelanto(a); setFicha(null); }}
        />
      )}
      {detalleAdelanto && (
        <DetalleAdelantoModal
          adelantoId={detalleAdelanto.id}
          onClose={() => setDetalleAdelanto(null)}
          onChange={onChange}
        />
      )}
    </div>
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
    `h-10 px-4 rounded-full border-2 text-base font-bold transition-colors ${active ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`;
  const rangoChip = (active: boolean) =>
    `h-9 px-3 rounded-full border-2 text-sm font-bold transition-colors ${active ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`;

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
        {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
        <div className="relative ml-auto flex-1 sm:flex-none" style={{ minWidth: 200 }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por persona, código (ADL-2026-7) o recibo…" className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary" />
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
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"><Repeat className="h-3.5 w-3.5" /> {FREC_LABEL[r.frecuencia]}</span>
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
            <button key={f} type="button" onClick={() => setFrecuencia(f)} className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${frecuencia === f ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>{FREC_LABEL[f]}</button>
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






// EmptyState, SkeletonGrid → movidos a ./shared (ADR-121 refactor).
