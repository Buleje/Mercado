"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { CardTitle } from "@buleje/design-system";
import {
  Coins,
  Users,
  Plus,
  Wallet,
  CheckCircle,
  Ban,
  ChevronRight,
  Search,
  Trash2,
  BarChart3,
  Activity,
  AlertTriangle,
  Repeat,
  Download,
  ChevronLeft,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { AnalisisView } from "./AnalisisView";
import { ActividadView } from "./ActividadView";
import CrearAdelantoModal from "./CrearAdelantoModal";
import DescuentoPlanillaModal from "./DescuentoPlanillaModal";
import DetalleAdelantoModal from "./detalle/DetalleAdelantoModal";
import TablaAdelantos from "./lista/TablaAdelantos";
import TarjetaPersona from "./personas/TarjetaPersona";
import FichaPersonaModal from "./personas/FichaPersonaModal";
import CobranzaView from "./cobranza/CobranzaView";
import ResumenView from "./resumen/ResumenView";
import type { Resumen } from "./resumen/tipos";
import CrearPersonaModal from "./personas/CrearPersonaModal";
import { leerPedidoLiquidar } from "./cuentas/liquidar-por-url";
import { sinTildes, fmtMon, sumByMoneda, fmtMonedas, EmptyState, SkeletonGrid, inputCls, Field, ModalShell, ModalActions, STATUS_BADGE } from "./shared";
import { csrfHeaders } from "@/lib/csrf-client";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
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
import { cuentaDePersona, leerDireccion } from "@/lib/adelantos/modos-alta";
import type { BeneficiarioConSaldo as BeneficiarioConSaldoBase } from "./crear-adelanto/tipos";
import type {
  DbAdelanto,
  DbRecurrente,
  RecurrenteFrecuencia,
} from "@/lib/db/adelantos.db";
import { formatDateShort } from "@/lib/format";

/** Single source: la misma forma que consume el alta (ver crear-adelanto/tipos). */
type BeneficiarioConSaldo = BeneficiarioConSaldoBase;

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
  /* `?accion=liquidar` (la Caja de Mi Plata): Liquidar vive en «Cuenta por
     persona», que está en Resumen. Desde otra sub-vista, primero se va ahí. */
  useEffect(() => {
    if (leerPedidoLiquidar() && tab !== "resumen") setTab("resumen");
  }, [tab, setTab]);
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
        /* `no-store`: la ruta manda `max-age=30`, y después de registrar una
           entrega el navegador devolvía el resumen de antes (el aviso de
           «sin control» seguía mostrando el adelanto que se acaba de mover). */
        fetch("/api/adelantos/resumen", { credentials: "include", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)),
        /* `todas`: la lista muestra lo dado Y lo recibido (ADR-448). Las vistas
           que cuentan plata por cobrar reciben sólo lo dado (`dados`, abajo). */
        fetch("/api/adelantos?direccion=todas", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])),
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

  /**
   * Lo dado y lo recibido, separados UNA vez acá (ADR-448). Resumen, Cobranza,
   * Actividad y Análisis cuentan «lo que te deben»: con un recibido adentro,
   * los S/ 3 031 que el negocio le debe a WASACO se sumarían como por cobrar.
   * La lista, las personas y el alta ven todo, con su dirección.
   */
  const dados = useMemo(() => adelantos.filter((a) => leerDireccion(a).direccion === "DADO"), [adelantos]);
  const recibidos = useMemo(() => adelantos.filter((a) => leerDireccion(a).direccion === "RECIBIDO"), [adelantos]);
  /* El servidor ya guarda la dirección: sin eso, lo recibido se guardaría como dado. */
  const admiteRecibido = resumen?.recibido != null || adelantos.some((a) => "direccion" in a);

  return (
    <div>
      {/* SIN encabezado propio: la pestaña «Adelantos» de Mi Plata ya dice
          dónde estás (Brandon 2026-09-07: el segundo nivel no repite su
          título — un header anidado no se dibuja, ver AdminModuleHeader).
          La acción primaria va en la barra de pestañas, pegada a lo que se
          está mirando. */}
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
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
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

          {tab === "resumen" && (
            <ResumenView resumen={resumen} adelantos={dados} recibidos={recibidos} loading={loading} onGoTab={setTab} onChange={reload} />
          )}
          {tab === "lista" && (
            <AdelantosView
              adelantos={adelantos}
              beneficiarios={beneficiarios}
              admiteRecibido={admiteRecibido}
              loading={loading}
              onChange={reload}
              creando={creando}
              onCreando={setCreando}
            />
          )}
          {tab === "personas" && (
            <PersonasView beneficiarios={beneficiarios} adelantos={adelantos} admiteRecibido={admiteRecibido} loading={loading} onChange={reload} />
          )}
          {tab === "cobranza" && (
            <CobranzaView
              adelantos={dados}
              beneficiarios={beneficiarios}
              loading={loading}
              onRecordado={() => void reload()}
            />
          )}
          {tab === "recurrentes" && <RecurrentesView beneficiarios={beneficiarios} onChange={reload} />}
          {/* Actividad es un HISTORIAL, no un saldo: a diferencia de Resumen/
              Cobranza/Análisis (que cuentan «lo que te deben» y por eso sólo
              ven `dados`), acá tiene que aparecer todo con su dirección — ver
              ActividadView.tsx. */}
          {tab === "actividad" && <ActividadView adelantos={adelantos} loading={loading} />}
          {tab === "analisis" && <AnalisisView adelantos={dados} recibidos={recibidos} loading={loading} />}
        </div>
      </AdminTabBar>
    </div>
  );
}

// ── Adelantos ────────────────────────────────────────────────────────────────
function AdelantosView({
  adelantos,
  beneficiarios,
  admiteRecibido,
  loading,
  onChange,
  creando,
  onCreando,
}: {
  adelantos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  admiteRecibido: boolean;
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

  // Totales de la vista filtrada — segmentados por moneda (ADR-118). Lo
  // RECIBIDO va aparte (ADR-448): sumado a «por recuperar» contaría como por
  // cobrar la plata que el negocio debe.
  const tot = filtrados.reduce(
    (acc, a) => {
      const cur = a.moneda || "PEN";
      if (leerDireccion(a).direccion === "RECIBIDO") {
        if (a.status === "ABIERTO") acc.leDebes[cur] = (acc.leDebes[cur] ?? 0) + a.saldoPendiente;
        return acc;
      }
      acc.adelantado[cur] = (acc.adelantado[cur] ?? 0) + a.montoAdelantado;
      acc.liquidado[cur] = (acc.liquidado[cur] ?? 0) + Math.max(0, a.montoAdelantado - a.saldoPendiente);
      if (a.status === "ABIERTO") acc.porRecuperar[cur] = (acc.porRecuperar[cur] ?? 0) + a.saldoPendiente;
      return acc;
    },
    {
      adelantado: {} as Record<string, number>,
      liquidado: {} as Record<string, number>,
      porRecuperar: {} as Record<string, number>,
      leDebes: {} as Record<string, number>,
    },
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
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
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
            className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 lg:hidden"
            title={beneficiarios.length === 0 ? "Crea primero una persona" : undefined}
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
            {Object.values(tot.leDebes).some((v) => v > 0) && (
              <span>Le debes <strong className="tabular-nums text-[var(--data-info-ink)]">{fmtMonedas(tot.leDebes)}</strong></span>
            )}
            <button
              onClick={() => descargarCsvAdelantos(filtrados, `adelantos-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={filtrados.length === 0}
              title="Baja exactamente lo que estás viendo, con filtro y búsqueda aplicados"
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
            >
              <Download className="h-4 w-4" /> CSV ({filtrados.length})
            </button>
          </div>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : adelantos.length === 0 ? (
        <EmptyState icon={Coins} title="Sin adelantos" hint={beneficiarios.length === 0 ? "Primero crea una persona en la pestaña Personas." : "Registra tu primer adelanto."} />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro filtro o búsqueda." />
      ) : (
        <TablaAdelantos
          adelantos={filtrados}
          orden={orden}
          onOrden={setOrden}
          pagina={pagina}
          onPagina={setPagina}
          porPagina={POR_PAGINA}
          onVerDetalle={setDetalle}
          onChange={onChange}
        />
      )}

      {creando && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          adelantos={adelantos}
          admiteRecibido={admiteRecibido}
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
  admiteRecibido,
  loading,
  onChange,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  adelantos: DbAdelanto[];
  admiteRecibido: boolean;
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
  /** Cada total ya viene por persona segmentado por moneda — mergear los mapas, no sumar números crudos. */
  const mergear = (map: Record<string, number>, otro: Record<string, number>) => {
    for (const [moneda, monto] of Object.entries(otro)) map[moneda] = (map[moneda] ?? 0) + monto;
  };
  const tot = beneficiarios.reduce(
    (acc, b) => {
      mergear(acc.adelantado, b.totalAdelantado);
      mergear(acc.entregado, b.totalEntregado);
      mergear(acc.porRecuperar, b.saldoPendiente);
      /* «Le debes» = entregó de más + lo que te dio y devuelves (ADR-448 §2.6). */
      mergear(acc.aFavor, cuentaDePersona(b).leDebes);
      return acc;
    },
    { adelantado: {} as Record<string, number>, entregado: {} as Record<string, number>, porRecuperar: {} as Record<string, number>, aFavor: {} as Record<string, number> },
  );
  const conSaldo = beneficiarios.filter((b) => Object.values(b.saldoPendiente).some((v) => v > 0)).length;
  const enRiesgo = beneficiarios.filter((b) => requiereAtencion(estadoDeCredito(b.limiteCredito, saldoParaLimite(b.saldoPendiente)))).length;
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
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
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
            <span>Adelantado <strong className="tabular-nums text-[var(--text-primary)]">{fmtMonedas(tot.adelantado)}</strong></span>
            <span>Devuelto <strong className="tabular-nums text-[var(--data-success)]">{fmtMonedas(tot.entregado)}</strong></span>
            <span>Por recuperar <strong className="tabular-nums text-[var(--data-warning)]">{fmtMonedas(tot.porRecuperar)}</strong></span>
            {Object.values(tot.aFavor).some((v) => v > 0) && (
              <span>Le debes <strong className="tabular-nums text-[var(--data-info-ink)]">{fmtMonedas(tot.aFavor)}</strong></span>
            )}
            <button
              onClick={() => descargarCsvPersonas(ordenados, `personas-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={ordenados.length === 0}
              title="Baja exactamente lo que estás viendo, con filtro y búsqueda aplicados"
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
            >
              <Download className="h-4 w-4" /> CSV ({ordenados.length})
            </button>
          </div>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agrega a quién le das adelantos." />
      ) : ordenados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro nombre, documento o filtro." />
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
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
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
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
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
          admiteRecibido={admiteRecibido}
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
    const body = await leerJson<{ error?: string }>(res);
    setErr(body?.error ?? "No se pudo eliminar la persona.");
  };
  return (
    <ModalShell title="Eliminar persona" onClose={onClose}>
      <p className="text-base text-[var(--text-secondary)]">
        ¿Seguro que quieres eliminar a <strong className="text-[var(--text-primary)]">{persona.nombre}</strong>? Esta acción no se puede deshacer.
      </p>
      {err && <p className="mt-3 text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-12 px-5 rounded-2xl border border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button onClick={submit} disabled={saving} className="h-12 px-5 rounded-2xl bg-[var(--data-error)] text-white text-base font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </ModalShell>
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
        <button onClick={() => setShowCreate(true)} disabled={beneficiarios.length === 0} className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50">
          <Plus className="h-5 w-5" /> Nueva recurrente
        </button>
      </div>
      <p className="text-base text-[var(--text-secondary)]">Plantillas que crean un adelanto automáticamente cada cierto tiempo (un cron diario las materializa).</p>

      {loading ? (
        <SkeletonGrid />
      ) : recs.length === 0 ? (
        <EmptyState icon={Repeat} title="Sin recurrentes" hint={beneficiarios.length === 0 ? "Primero crea una persona." : "Programa un adelanto que se repita solo."} />
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
                {r.proximaEjecucion && <span className="text-[var(--text-tertiary)]">Próx.: {formatDateShort(r.proximaEjecucion)}</span>}
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
    if (!beneficiarioId || !m || m <= 0) { setErr("Elige persona y un monto válido."); return; }
    setSaving(true);
    const res = await fetch("/api/adelantos/recurrentes", {
      method: "POST", headers: jsonHeaders(), credentials: "include",
      body: JSON.stringify({ beneficiarioId, monto: m, moneda, frecuencia, diaMes: frecuencia === "mensual" ? Number(diaMes) : undefined }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else { const j = await leerJson<{ error?: string }>(res); setErr(j?.error ?? "No se pudo crear la recurrente."); }
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
            <button key={f} type="button" onClick={() => setFrecuencia(f)} className={`h-12 rounded-2xl border-2 text-base font-semibold transition-colors ${frecuencia === f ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>{FREC_LABEL[f]}</button>
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

// EmptyState, SkeletonGrid → movidos a ./shared (ADR-121 refactor).
