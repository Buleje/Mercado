"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import {
  Coins,
  Users,
  Plus,
  Wallet,
  Search,
  BarChart3,
  AlertTriangle,
  Repeat,
  Download,
  HandCoins,
  MoreHorizontal,
  FileText,
  TrendingUp,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { SegundoNivelEnElHub, useRanuraDelSegundoNivel } from "@/components/admin/unified/finanzas/segundo-nivel";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { AnalisisView } from "./AnalisisView";
import { ActividadView } from "./ActividadView";
import SelectorListaHistorial, { type SeccionAdelantos } from "./lista/SelectorListaHistorial";
import { esDeuda, etiquetaEstado } from "./lista/estado-visible";
import { HojaDeFirmasModal } from "./firma/HojaDeFirmasModal";
import AdelantosFijosModal from "./recurrentes/AdelantosFijosModal";
import CrearAdelantoModal from "./CrearAdelantoModal";
import DescuentoPlanillaModal from "./DescuentoPlanillaModal";
import DetalleAdelantoModal from "./detalle/DetalleAdelantoModal";
import TablaAdelantos from "./lista/TablaAdelantos";
import { COLUMNAS_FILTRO_ADELANTOS } from "./lista/filtros-columnas-adelantos";
import { BarraFiltrosTabla, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import FiltrosRecibo from "./lista/FiltrosRecibo";
import { useEstadoRecibos } from "./lista/use-estado-recibos";
import { useFiltroRecibos } from "./lista/use-filtro-recibos";
import { ESTADO_VACIO } from "@/lib/adelantos/recibo-whatsapp";
import { SIN_FILTRO_RECIBOS, contarRecibos, pasaFiltroRecibos } from "@/lib/adelantos/filtro-recibos";
import PersonasView from "./personas/PersonasView";
import CobranzaView from "./cobranza/CobranzaView";
import ResumenView from "./resumen/ResumenView";
import type { Resumen } from "./resumen/tipos";
import { leerPedidoLiquidar } from "./cuentas/liquidar-por-url";
import { borrarPedidoEntregar, leerPedidoEntregar, useAdelantoEnUrl } from "./hooks/use-adelanto-en-url";
import { button } from "@/components/ui-system/button-variants";
import { adelantosDe } from "@/lib/adelantos/sugerencias";
import type { PersonaEntregar } from "@/lib/adelantos/entregar-tipos";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { PARAM_ADELANTO } from "@/lib/adelantos/enlace-adelanto";
import { fmtMonedas, EmptyState, SkeletonGrid } from "./shared";
import { normalizarBusquedaCodigo } from "@/lib/adelantos/codigo-operacion";
import { descargarCsvAdelantos } from "@/lib/adelantos/exportar-csv";
import { type ColumnaOrden, type Direccion } from "@/lib/adelantos/ordenar-lista";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import type { BeneficiarioConSaldo as BeneficiarioConSaldoBase } from "./crear-adelanto/tipos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

/** Single source: la misma forma que consume el alta (ver crear-adelanto/tipos). */
type BeneficiarioConSaldo = BeneficiarioConSaldoBase;

const MODULE_ID = "adelantos";

/** «Entregar adelanto» (ADR-491) baja sólo al abrirse: lienzo, cámara y PDF no pesan en la lista. */
const EntregarAdelantoModal = dynamic(() => import("./entregar/EntregarAdelantoModal"), { ssr: false });

/** La persona de Adelantos como la pide «Entregar»: con su último monto dado y lo que debe en soles. */
function personaParaEntregar(b: BeneficiarioConSaldo, adelantos: readonly DbAdelanto[]): PersonaEntregar {
  return {
    id: b.id,
    nombre: b.nombre,
    documentoFinal: b.documento?.trim() || null,
    tieneTelefono: !!b.telefono?.trim(),
    ultimoMonto: adelantosDe(adelantos, b.id)[0]?.montoAdelantado ?? null,
    saldo: b.saldoPendiente?.PEN ?? 0,
  };
}

/**
 * Filas por página del listado.
 *
 * 25-10: filas de ~52 px (antes ~86), así que 20 por página caben en menos de
 * dos pantallas a 1280×900. Más alto vuelve al muro que esto vino a resolver.
 */
const POR_PAGINA = 20;

const TABS = [
  { id: "resumen", label: "Resumen", icon: Wallet },
  { id: "lista", label: "Adelantos", icon: Coins },
  { id: "personas", label: "Personas", icon: Users },
  { id: "cobranza", label: "Cobranza", icon: AlertTriangle },
  { id: "analisis", label: "Análisis", icon: BarChart3 },
];

/** Los ids, DERIVADOS de TABS: listarlos aparte los deja desincronizarse. */
const TAB_IDS = TABS.map((t) => t.id);

/**
 * Dentro de Mi Plata la pastilla «Resumen» quedaba al lado del título y de la
 * pestaña «Resumen» del propio hub: dos «Resumen» que no son lo mismo. Ahí se
 * dice de qué es (a 400 px no entra: queda «Resumen», en otra fila que la del
 * hub). Fuera del hub, la barra propia ya dice «Adelantos».
 */
const TABS_EN_EL_HUB = TABS.map((t) =>
  t.id === "resumen" ? { ...t, label: "Resumen de adelantos", angosto: "Resumen" } : t,
);

/** Las pestañas que se fundieron (25-10): «Actividad» es el Historial de Adelantos; «Recurrentes», la ventana Adelantos fijos. */
const ALIAS_PESTAÑAS = { actividad: "lista", recurrentes: "lista" } as const;

/** `?estado=abierto|liquidado|excedido|cancelado|todos`; sin el parámetro, «Abiertos». */
function estadoDeUrl(): string {
  if (typeof window === "undefined") return "ABIERTO";
  const v = new URLSearchParams(window.location.search).get("estado")?.toLowerCase();
  if (v === "todos" || v === "todo") return "TODOS";
  const mapa: Record<string, string> = { abierto: "ABIERTO", liquidado: "LIQUIDADO", pagado: "LIQUIDADO", excedido: "EXCEDIDO", cancelado: "CANCELADO", anulado: "CANCELADO" };
  return (v && mapa[v]) || "ABIERTO";
}

function escribirEstadoEnUrl(estado: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("estado", estado.toLowerCase());
    window.history.replaceState(null, "", url.toString());
  } catch {
    // history no disponible: el filtro igual funciona
  }
}

export default function AdelantosModule() {
  /**
   * La sub-vista vive en `?sub=` y no en `?vista=`: este módulo se renderiza
   * DENTRO de Mi Plata, que ya es dueño de ese parámetro. Antes era un
   * `useState` pelado — ni se compartía por link, ni recordaba, ni el atrás la
   * recorría.
   */
  const { vista: tab, irA: setTab } = useSubvistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], undefined, { alias: ALIAS_PESTAÑAS });
  /* Un link viejo (`sub=actividad`, `sub=recurrentes`) se lee UNA vez, antes de que el hook reescriba la URL. */
  const [subViejo] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sub")));
  const [seccion, setSeccion] = useState<SeccionAdelantos>(subViejo === "actividad" ? "historial" : "lista");
  const [fijosAbierto, setFijosAbierto] = useState(subViejo === "recurrentes");
  /* «Imprimir hoja de firmas»: del menú ⋯ o de `?accion=hoja-de-firmas` (el Resumen). Al cerrar, la URL se limpia. */
  /* Firma, huella, hoja y envío de cada fila: UNA llamada para la tabla, los chips y el modal de la hoja. */
  const recibos = useEstadoRecibos();
  const recargarRecibos = recibos.recargar;
  const [hojaAbierta, setHojaAbierta] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("accion") === "hoja-de-firmas");
  const cerrarHoja = useCallback(() => {
    setHojaAbierta(false);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("accion") === "hoja-de-firmas") {
        url.searchParams.delete("accion");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // sin history: la ventana igual se cierra
    }
  }, []);
  /* El Resumen manda a la lista con la acción ya en la URL. */
  useEffect(() => {
    const onPop = () => setHojaAbierta(new URLSearchParams(window.location.search).get("accion") === "hoja-de-firmas");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const enHub = useRanuraDelSegundoNivel();
  /* `?accion=liquidar` (la Caja de Mi Plata): Liquidar vive en «Cuenta por
     persona», que está en Resumen. Desde otra sub-vista, primero se va ahí. */
  useEffect(() => {
    if (leerPedidoLiquidar() && tab !== "resumen") setTab("resumen");
  }, [tab, setTab]);
  /* `?adelanto=<código>` (Resultado del negocio, link copiado): la ficha vive en
     la lista. Sólo al llegar —depende del pedido, no de la sub-vista—: con la
     ficha abierta, ir a Resumen no te devuelve a la lista. */
  const adelantoPedido = useFichaEnUrl(PARAM_ADELANTO).id;
  useEffect(() => {
    if (adelantoPedido) {
      setTab("lista");
      setSeccion("lista");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adelantoPedido]);
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
  /** «Entregar adelanto» abierto, con la persona ya elegida si vino en la URL. */
  const [entregando, setEntregando] = useState<{ persona: PersonaEntregar | null } | null>(null);

  /** El adelanto recién dado: la lista lo ubica y lo resalta (23-10). */
  const [recienId, setRecienId] = useState<string | null>(null);
  /** Sólo la última carga escribe: una vieja que llega tarde no pisa a la nueva. */
  const turno = useRef(0);

  /**
   * `silencioso`: sin el esqueleto de carga. Es la recarga de «acaba de quedar
   * guardado» con la ventana todavía abierta: la tabla de atrás se pone al día
   * sin parpadear.
   */
  const cargar = useCallback(async (silencioso: boolean) => {
    const mio = ++turno.current;
    if (!silencioso) setLoading(true);
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
      if (mio !== turno.current) return;
      setResumen(r);
      setAdelantos(Array.isArray(a) ? a : []);
      setBeneficiarios(Array.isArray(b) ? b : []);
    } catch {
      if (mio === turno.current) setError("No se pudo cargar los adelantos");
    }
    if (mio === turno.current) setLoading(false);
  }, []);
  const reload = useCallback(() => cargar(false), [cargar]);
  /** Guardado en el servidor: la lista lo muestra ya, aunque la ventana siga abierta. */
  const alRegistrar = useCallback(
    (id: string | null) => {
      if (id) setRecienId(id);
      void cargar(true);
    },
    [cargar],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const sinPersonas = beneficiarios.length === 0;

  /* `?accion=nuevo[&persona=<id>]` (ADR-491): abre «Entregar» una vez cargadas
     las personas, y el pedido se borra de la URL. Sin personas, primero hay
     que crear una. */
  useEffect(() => {
    if (loading) return;
    const pedido = leerPedidoEntregar();
    if (!pedido) return;
    borrarPedidoEntregar();
    if (sinPersonas) {
      setTab("personas");
      return;
    }
    const b = pedido.persona ? beneficiarios.find((x) => x.id === pedido.persona) : undefined;
    setEntregando({ persona: b ? personaParaEntregar(b, adelantos) : null });
  }, [loading, sinPersonas, beneficiarios, adelantos, setTab]);

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

  /* «Entregar» (ADR-491) es lo de todos los días: persona, monto y firma en un
     paso. «Nuevo adelanto» queda para lo que pide el formulario completo
     (plan de cuotas, permiso, lo que te adelantan a ti). */
  const botonNuevo = sinPersonas ? (
    <button type="button" onClick={() => setTab("personas")} className={button({ variant: "primary", className: "h-12 rounded-xl" })}>
      <Plus className="h-4 w-4" aria-hidden /> Agregar persona
    </button>
  ) : (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setTab("lista");
          setCreando(true);
        }}
        aria-label="Nuevo adelanto"
        className={button({ variant: "secondary", className: "h-12 rounded-xl px-4" })}
      >
        {/* A 400 px «Nuevo adelanto» empujaba el menú «⋯» a una fila sola. */}
        <Plus className="h-4 w-4" aria-hidden /> Nuevo<span className="max-sm:hidden"> adelanto</span>
      </button>
      <button type="button" onClick={() => setEntregando({ persona: null })} className={button({ variant: "primary", className: "h-12 rounded-xl px-4" })} data-abrir-entregar>
        <HandCoins className="h-4 w-4" aria-hidden /> Entregar
      </button>
      {/* El menú ⋯ del módulo: aquí van las cosas que no se usan todos los días. */}
      <ActionMenu
        label="Más de Adelantos"
        icon={MoreHorizontal}
        soloIcono
        size="md"
        className="w-12 shrink-0"
        title="Adelantos fijos y más"
        actions={[
          {
            id: "fijos",
            label: "Adelantos fijos",
            hint: "Los que se crean solos cada semana, quincena o mes",
            icon: Repeat,
            onSelect: () => setFijosAbierto(true),
          },
          {
            id: "hoja-de-firmas",
            label: "Imprimir hoja de firmas",
            hint: "Una hoja con los adelantos que esperan firma, para firmar en papel y subir la foto",
            icon: FileText,
            onSelect: () => setHojaAbierta(true),
          },
        ]}
      />
    </div>
  );

  const vistas = (
    <VistasDeAdelantos
      recibos={recibos} tab={tab} setTab={setTab} seccion={seccion} setSeccion={setSeccion} error={error} resumen={resumen} adelantos={adelantos} dados={dados}
      recibidos={recibidos} beneficiarios={beneficiarios} admiteRecibido={admiteRecibido} loading={loading}
      reload={reload} creando={creando} setCreando={setCreando} recienId={recienId} onRegistrado={alRegistrar}
      onEntregar={(persona) => setEntregando({ persona })}
    />
  );

  return (
    <div>
      {/* SIN encabezado propio: la pestaña «Adelantos» de Mi Plata ya dice
          dónde estás (Brandon 2026-09-07: el segundo nivel no repite su
          título — un header anidado no se dibuja, ver AdminModuleHeader).
          La acción primaria va en la barra de pestañas, pegada a lo que se
          está mirando. */}
      {/* Dentro de Mi Plata (ola 3, 2026-10-10) las 7 pestañas son el segundo
          nivel del hub, en la fila de abajo de su banda (23-10: antes en la del
          título, y a 1280 px quedaban encima de las de Mi Plata), con «Nuevo adelanto» al lado:
          ya no hay una barra propia debajo de la de Mi Plata. */}
      {enHub && (
        <SegundoNivelEnElHub
          ranura={enHub.ranura}
          items={TABS_EN_EL_HUB}
          activa={tab}
          onIr={setTab}
          etiqueta="Pestañas de Adelantos"
          acciones={botonNuevo}
        />
      )}
      {enHub ? vistas : (
        <AdminTabBar tabs={TABS} activeTab={tab} onTabChange={setTab} moduleId={MODULE_ID} rightSlot={botonNuevo}>
          <div className="pt-5 lg:pt-6">{vistas}</div>
        </AdminTabBar>
      )}
      {hojaAbierta && <HojaDeFirmasModal open onClose={cerrarHoja} onListo={() => { void cargar(true); recargarRecibos(); }} />}
      {fijosAbierto && <AdelantosFijosModal beneficiarios={beneficiarios} onClose={() => setFijosAbierto(false)} onChange={reload} />}
      {entregando && (
        <EntregarAdelantoModal personaInicial={entregando.persona} onClose={() => setEntregando(null)} onEntregado={(r) => alRegistrar(r?.adelanto?.id ?? null)} />
      )}
    </div>
  );
}

/** Las cinco vistas de Adelantos (dentro o fuera de Mi Plata, son las mismas). */
function VistasDeAdelantos({
  recibos, tab, setTab, seccion, setSeccion, error, resumen, adelantos, dados, recibidos, beneficiarios, admiteRecibido, loading, reload, creando, setCreando, recienId, onRegistrado, onEntregar,
}: {
  recibos: ReturnType<typeof useEstadoRecibos>;
  tab: string;
  setTab: (v: string) => void;
  seccion: SeccionAdelantos;
  setSeccion: (v: SeccionAdelantos) => void;
  error: string | null;
  resumen: Resumen | null;
  adelantos: DbAdelanto[];
  dados: DbAdelanto[];
  recibidos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  admiteRecibido: boolean;
  loading: boolean;
  reload: () => Promise<void>;
  creando: boolean;
  setCreando: React.Dispatch<React.SetStateAction<boolean>>;
  recienId: string | null;
  onRegistrado: (id: string | null) => void;
  /** Abre «Entregar» (ADR-491) con esa persona ya elegida. */
  onEntregar: (persona: PersonaEntregar) => void;
}) {
  return (
        <div>
          {error && (
            <div className="mb-4 rounded-xl border border-[var(--data-error)]/30 bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
              {error}
            </div>
          )}

          {tab === "resumen" && (
            <ResumenView resumen={resumen} adelantos={dados} recibidos={recibidos} loading={loading} onGoTab={setTab} onChange={reload} />
          )}
          {tab === "lista" && seccion === "historial" && (
            /* Un HISTORIAL, no un saldo: a diferencia de Resumen/Cobranza/Análisis
               (que sólo ven `dados`) tiene que mostrar todo con su dirección. */
            <ActividadView adelantos={adelantos} loading={loading} selector={<SelectorListaHistorial valor={seccion} onCambio={setSeccion} />} />
          )}
          {tab === "lista" && seccion === "lista" && (
            <AdelantosView
              recibos={recibos}
              selector={<SelectorListaHistorial valor={seccion} onCambio={setSeccion} />}
              adelantos={adelantos}
              beneficiarios={beneficiarios}
              admiteRecibido={admiteRecibido}
              loading={loading}
              onChange={reload}
              creando={creando}
              onCreando={setCreando}
              recienId={recienId}
              onRegistrado={onRegistrado}
            />
          )}
          {tab === "personas" && (
            <PersonasView
              beneficiarios={beneficiarios} adelantos={adelantos} admiteRecibido={admiteRecibido} loading={loading} onChange={reload}
              onRegistrado={onRegistrado}
              onEntregar={(b) => onEntregar(personaParaEntregar(b, adelantos))}
            />
          )}
          {tab === "cobranza" && (
            <CobranzaView
              adelantos={dados}
              beneficiarios={beneficiarios}
              loading={loading}
              onRecordado={() => void reload()}
            />
          )}
          {tab === "analisis" && <AnalisisView adelantos={dados} recibidos={recibidos} loading={loading} />}
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
  recienId,
  onRegistrado,
  selector,
  recibos,
}: {
  recibos: ReturnType<typeof useEstadoRecibos>;
  /** «Lista | Historial», junto al título. */
  selector: React.ReactNode;
  adelantos: DbAdelanto[];
  beneficiarios: BeneficiarioConSaldo[];
  admiteRecibido: boolean;
  loading: boolean;
  onChange: () => void;
  /** El alta la controla el módulo: la abre el botón de la barra de pestañas. */
  creando: boolean;
  onCreando: (v: boolean) => void;
  /** El recién dado (alta o «Entregar»): la lista salta a su página y lo resalta. */
  recienId: string | null;
  onRegistrado: (id: string | null) => void;
}) {
  /** Los descuentos de planilla del período, en una pasada. */
  const [planilla, setPlanilla] = useState(false);
  /* Abre en «Abiertos» (25-10): es lo que se viene a mirar. `?estado=` lo manda
     (`todos` y los demás estados también); «Todos» sigue a un clic. */
  const [filtroElegido, setFiltroElegido] = useState<string>(() => estadoDeUrl());
  /* El link copiado dice qué se ve: si la URL no trae `?estado=`, se escribe el de hoy. */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("estado")) escribirEstadoEnUrl(filtroElegido);
    // Sólo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setFiltro = useCallback((v: string) => {
    setFiltroElegido(v);
    escribirEstadoEnUrl(v);
  }, []);
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
  /* Sin ningún abierto, «Abiertos» sería una tabla vacía: se muestra todo. */
  const filtro = filtroElegido !== "TODOS" && adelantos.length > 0 && !counts[filtroElegido] ? "TODOS" : filtroElegido;

  /* Firma, huella y envío de cada fila: UNA llamada para la tabla y para los chips «Sin firma» / «Sin enviar». */
  const [filtroRecibos, cambiarFiltroRecibos] = useFiltroRecibos();

  const conEstadoYBusqueda = adelantos.filter((a) => {
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
  /* Firmado en una hoja (foto) cuenta como firmado: «Sin firma» no lo persigue. */
  const estadosParaFiltro = useMemo(() => {
    const m = { ...recibos.estados };
    for (const [id, h] of Object.entries(recibos.hojas)) m[id] = { ...(m[id] ?? ESTADO_VACIO), firma: m[id]?.firma ?? h.en };
    return m;
  }, [recibos.estados, recibos.hojas]);
  const cuentaRecibos = contarRecibos(conEstadoYBusqueda, estadosParaFiltro, filtroRecibos);
  const conRecibos = conEstadoYBusqueda.filter((a) => pasaFiltroRecibos(a, estadosParaFiltro, filtroRecibos));
  /* Autofiltros de Excel en la cabecera de la tabla (Brandon 23-10): van DESPUÉS
     de chips y buscador, y los totales y el CSV salen de lo que queda a la vista. */
  const ft = useFiltrosTabla(conRecibos, COLUMNAS_FILTRO_ADELANTOS);
  const filtrados = ft.filtradas;
  const limpiarColumnas = ft.limpiar;

  /**
   * Filtrar o buscar vuelve a la página 1: quedarse en la 4 después de achicar
   * el resultado a 12 filas muestra una tabla vacía que parece un error.
   */
  useEffect(() => setPagina(1), [filtro, filtroRecibos, q, orden.columna, orden.direccion, ft.facetas, ft.textos]);

  /* Si la ficha pedida estaba escondida, se limpian también los chips de recibo (estable: el hook lo usa como dependencia). */
  const alLimpiarFiltros = useCallback(
    (v: string) => {
      setFiltro(v);
      cambiarFiltroRecibos(SIN_FILTRO_RECIBOS);
      limpiarColumnas();
    },
    [cambiarFiltroRecibos, limpiarColumnas],
  );

  /* La ficha abierta vive en `?adelanto=` (el «atrás» la cierra; el Resultado
     del negocio la abre): va DESPUÉS del `setPagina(1)` de arriba. */
  const ficha = useAdelantoEnUrl({ adelantos, filtrados, loading, orden, porPagina: POR_PAGINA, setFiltro: alLimpiarFiltros, setQ, setPagina, ubicarId: recienId });

  // Totales de la vista filtrada — segmentados por moneda (ADR-118). Lo
  // RECIBIDO va aparte (ADR-448): sumado a «por recuperar» contaría como por
  // cobrar la plata que el negocio debe.
  const tot = filtrados.reduce(
    (acc, a) => {
      /* Un anulado no se cobra: no suma a lo adelantado ni a lo recuperado. */
      if (!esDeuda(a.status)) return acc;
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

  const hayPlanillaAbierta = adelantos.some((a) => a.modalidad === "DESCUENTO_PLANILLA" && a.status === "ABIERTO" && a.saldoPendiente > 0);

  const hayLeDebesLista = Object.values(tot.leDebes).some((v) => v > 0);
  /* Indicadores plegables (patrón del panel, 11-10): los totales de lo
     filtrado eran una línea de cuatro cifras al lado del título. Plegados
     dicen lo adelantado; «Por recuperar» es la cifra del Resumen y no se
     repite a la vista. */
  const kpis = useKpisPlegables({
    claveMemoria: "adelantos-lista",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && adelantos.length === 0,
    resumen: `${filtrados.length} · ${fmtMonedas(tot.adelantado)}`,
    tarjetas: [
      <TarjetaIndicador key="adelantado" rotulo="Adelantado" valor={fmtMonedas(tot.adelantado)} detalle={`${filtrados.length} adelanto${filtrados.length === 1 ? "" : "s"} con el filtro de abajo`} icono={Coins} tono="destacado" />,
      <TarjetaIndicador key="liquidado" rotulo="Liquidado" valor={fmtMonedas(tot.liquidado)} detalle="Recuperado en entregas y pagos" icono={TrendingUp} />,
      <TarjetaIndicador key="recuperar" rotulo="Por recuperar" valor={fmtMonedas(tot.porRecuperar)} detalle="De los abiertos de esta lista" icono={Wallet} />,
      ...(hayLeDebesLista ? [<TarjetaIndicador key="le-debes" rotulo="Le debes" valor={fmtMonedas(tot.leDebes)} detalle="Te pagaron antes o te entregaron de más" icono={Users} />] : []),
    ],
  });

  /* h-12 y texto de 14 px, como los filtros del resto del panel. */
  const chipCls = (active: boolean) =>
    `h-12 shrink-0 px-4 rounded-xl border-2 text-sm font-bold transition-colors ${
      active
        ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

  return (
    <div className="space-y-3">
      {/* Título · Indicadores · «⋯» en UNA fila. «Nuevo adelanto» y «Entregar»
          viven en la fila del hub, visibles desde cualquier sub-vista. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Adelantos</SectionTitle>
          {selector}
          <InfoTip
            title="Adelantos"
            what="Cada adelanto que diste o te dieron, con su código, cuánto se recuperó y su estado. Toca una fila para ver su ficha, registrar una entrega o firmar."
            affects="Indicadores suma lo que ves con el filtro y la búsqueda aplicados. Los cancelados no se cobran."
            example="Busca ADL-2026-7 o el nombre de la persona para ir directo a su adelanto."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {adelantos.length > 0 && kpis.boton}
          {adelantos.length > 0 && (
            <ActionMenu
              label="Más"
              icon={MoreHorizontal}
              soloIcono
              size="md"
              className="w-12 shrink-0"
              title="Descuentos de planilla y CSV"
              actions={[
                /* Sólo si hay adelantos de planilla abiertos: una acción que
                   abre una lista vacía enseña a no confiar en el menú. */
                ...(hayPlanillaAbierta
                  ? [{
                      id: "planilla",
                      label: "Descuentos de planilla",
                      hint: "Descontar los adelantos de sueldo del período, todos de una",
                      icon: Users,
                      onSelect: () => setPlanilla(true),
                    }]
                  : []),
                {
                  id: "csv",
                  label: `Descargar CSV (${filtrados.length})`,
                  hint: "Baja exactamente lo que estás viendo, con filtro y búsqueda aplicados",
                  icon: Download,
                  disabled: filtrados.length === 0,
                  onSelect: () => descargarCsvAdelantos(filtrados, `adelantos-${new Date().toISOString().slice(0, 10)}.csv`),
                },
              ]}
            />
          )}
          {/* A pantalla chica la fila del hub no lleva el alta. */}
          <button
            onClick={() => onCreando(true)}
            disabled={beneficiarios.length === 0}
            className="inline-flex items-center gap-2 h-12 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 lg:hidden"
            title={beneficiarios.length === 0 ? "Crea primero una persona" : undefined}
          >
            <Plus className="h-4 w-4" aria-hidden /> Nuevo
          </button>
        </div>
      </div>

      {adelantos.length > 0 && kpis.panel}

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
            <button type="button" aria-pressed={filtro === "TODOS"} className={chipCls(filtro === "TODOS")} onClick={() => setFiltro("TODOS")}>Todos {adelantos.length}</button>
            {estadosPresentes.map((e) => (
              <button key={e} type="button" aria-pressed={filtro === e} className={chipCls(filtro === e)} onClick={() => setFiltro(e)}>
                {etiquetaEstado(e)}{e === "ABIERTO" ? "s" : ""} {counts[e]}
              </button>
            ))}
            <FiltrosRecibo filtro={filtroRecibos} onCambio={cambiarFiltroRecibos} cuenta={cuentaRecibos} carga={recibos.carga} chipCls={chipCls} />
            {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
            <div className="relative ml-auto flex-1 sm:flex-none" style={{ minWidth: 220 }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Persona, código o recibo…"
                aria-label="Buscar por persona, código (ADL-2026-7) o recibo"
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
          </div>
        </>
      )}

      {ficha.noEncontrado && (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5 text-sm text-[var(--text-secondary)]">
          <span>
            No encontré el adelanto <span className="font-mono font-bold text-[var(--text-primary)]">{ficha.noEncontrado}</span> en esta lista.
          </span>
          <button type="button" onClick={ficha.cerrar} className="shrink-0 text-sm font-semibold text-[var(--accent-ink)] hover:underline">
            Entendido
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : adelantos.length === 0 ? (
        <EmptyState icon={Coins} title="Sin adelantos" hint={beneficiarios.length === 0 ? "Primero crea una persona en la pestaña Personas." : "Registra tu primer adelanto."} />
      ) : filtrados.length === 0 && ft.activos === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro filtro o búsqueda." />
      ) : (
        <div>
        {/* En el celular las columnas no entran: «Filtros por columna» + chips con ×.
            En un <div> propio: suelta en el space-y-3, la barra vacía sumaba 12 px. */}
        <BarraFiltrosTabla vistas="adelantos" f={ft} sinConteo className="max-sm:mb-2 has-[[role=list]]:mb-2" />
        <TablaAdelantos
          adelantos={filtrados}
          filtros={ft}
          orden={orden}
          onOrden={setOrden}
          pagina={pagina}
          onPagina={setPagina}
          porPagina={POR_PAGINA}
          recibos={recibos}
          onVerDetalle={ficha.abrir}
          resaltadoId={ficha.resaltadoId}
          /* Relectura SIN esqueleto: con `reload` la tabla se desmontaba y se llevaba
             el modal de la fila abierto (mandar para firmar, WhatsApp). */
          onChange={() => onRegistrado(null)}
        />
        </div>
      )}

      {creando && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          adelantos={adelantos}
          admiteRecibido={admiteRecibido}
          onPersonaCreada={onChange}
          onRegistrado={onRegistrado}
          onClose={() => onCreando(false)}
          onCreated={() => {
            onCreando(false);
            onChange();
          }}
        />
      )}
      {ficha.abierto && (
        <DetalleAdelantoModal
          adelantoId={ficha.abierto.id}
          onClose={ficha.cerrar}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// EmptyState, SkeletonGrid → movidos a ./shared (ADR-121 refactor).
