"use client";

/**
 * LothGtfView — Guías de Transporte Forestal (GTF), ADR-126 Fase 4.
 * Emite GTF con lista de trozas + datos de transporte, e imprime el documento.
 * Interna, no oficial (la GTF oficial se emite vía SNIFFS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, FileDown, FileText, Plus, Printer, Ban, Loader2, Search, ShieldCheck, Trash2, Truck, LogIn } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ingresarGtfAlCtp, verIngresosDelCtp } from "./LothGtfCtp";
import { motivoLegible } from "@/lib/forestal/motivo";
import { documentoGtfLoth, type LothGtfCaratula, type LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esc } from "@/lib/forestal/ctp-documento-print";
import VerificarGtfSerfor from "./VerificarGtfSerfor";
import { useLineasDeLaGuia } from "./hooks/use-lineas-de-la-guia";
import { formatDateNumeric } from "@/lib/format";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import { CampoPlaca } from "./ctp-campo-placa";
import { FiltroColumnaMulti, type FacetaOpcion } from "@/components/admin/shared/filtros-columna";
import { CampoDeFiltro } from "./ctp-filtros-panel";
import { useKpisPlegables } from "./kpis-plegables";
import { BotonRestablecerColumnas, EnOrden, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { guiaEsDePlantacion, piezasDeItems, rotuloDelTitulo } from "@/lib/forestal/loth-guia-despacho";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";
import LothDespachoGuiaModal from "./LothDespachoGuiaModal";
import { archivoDeGuiaLoth } from "./LothGuiaRegistrada";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import BotonDeshacerImportacion from "./LothImportarGuiasDeshacer";
import BotonFichaImportada from "./LothImportarGuiasFicha";
import { importacionDeLaGuia } from "@/lib/forestal/loth-importar-guia-deshacer";

/** Las columnas movibles de la tabla de GTF, en su orden de fábrica
 *  (Brandon, 2026-09-26). «Acciones» queda fija al final. */
const ORDEN_GTF_DEFECTO = ["gtf", "fecha", "tipo", "titular", "destino", "volumen", "estado"] as const;

interface GtfItem {
  code?: string | null; species?: string | null; scientific?: string | null; cites?: boolean;
  diamMayorM?: number | null; diamMenorM?: number | null; lengthM?: number | null; volumeM3?: number | null;
}
interface Gtf {
  id: string; gtfNumber: string; gtfDate: string | null; tipo: string;
  titularName: string | null; tituloHabilitante: string | null; parcelaCorta: string | null;
  transportista: string | null; transportistaDoc: string | null; conductor: string | null;
  conductorLicencia: string | null; placaVehiculo: string | null; origen: string | null; destino: string | null;
  items: GtfItem[] | null; volumenTotalM3: string | null; piezasTotal: number | null;
  observations: string | null; status: string; annulledReason: string | null;
  /** Casilleros completos (2)–(38): sólo las guías hechas con «Despachar con guía». */
  gtfDatos?: unknown;
}

const smalian = (dM: number, dm: number, L: number) =>
  dM > 0 && dm > 0 && L > 0 ? Math.round(0.7854 * Math.pow((dM + dm) / 2, 2) * L * 10000) / 10000 : 0;
const fmtDate = (iso: string | null) =>
  iso ? formatDateNumeric(iso, { soloFecha: true }) : "—";
const ETIQUETA_TIPO: Record<string, string> = { trozas: "Trozas", producto: "Producto" };
const ETIQUETA_ESTADO: Record<string, string> = { emitida: "Emitida", anulada: "Anulada", sin_ingresar: "Sin ingresar al CTP" };

export default function LothGtfView({
  focusGtf,
  onFocusHandled,
  onImportarGuias,
  reloadSignal,
}: {
  /** Guía a resaltar al entrar (se llega acá desde la trazabilidad por árbol). */
  focusGtf?: string | null;
  onFocusHandled?: () => void;
  /** «Importar guías despachadas» (ADR-461): el modal vive en el libro, que recarga todo al terminar. */
  onImportarGuias?: () => void;
  /** Sube tras cada escritura del libro (p. ej. guías importadas): la lista se vuelve a pedir. */
  reloadSignal?: number;
} = {}) {
  const [gtfs, setGtfs] = useState<Gtf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  /** «Despachar con guía»: la guía completa con sus líneas de despacho. */
  const [showDespacho, setShowDespacho] = useState(false);
  /** Los papeles de una guía completa, abiertos en el visor. */
  const [hojas, setHojas] = useState<{ g: Gtf; docs: DocumentoImprimible[]; activo: number } | null>(null);
  /** Cuántas líneas de despacho vivas lleva cada guía: anularla las libera. */
  const [despachosPorGuia, setDespachosPorGuia] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [annulId, setAnnulId] = useState<string | null>(null);
  // Puente inverso: GTF de trozas emitidas que aún no ingresaron al CTP —
  // mismo conjunto que la bandeja del lado planta (single source: ?sinIngresar=1).
  const [sinIngresar, setSinIngresar] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  // Tipo y Estado son columnas de la tabla: su filtro vive en el propio `<th>`
  // (multi-selección, OR adentro — Brandon, 2026-09-24). El buscador de texto
  // es lo único que no es una columna sola y se queda arriba.
  const [estadoFiltro, setEstadoFiltro] = useState<string[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [pagina, setPagina] = useState(0);
  /** Guías que el LIBRO declara y que no están emitidas acá (se piden aparte). */
  const [declaradasSinEmitir, setDeclaradasSinEmitir] = useState<string[]>([]);
  /** Identidad del titular para la hoja oficial (casilleros 6 y 7). */
  const [caratula, setCaratula] = useState<LothGtfCaratula | null>(null);

  /* El permiso del libro (02-10): con uno elegido, la lista trae sólo sus guías (filtro en el servidor). */
  const permiso = useLothPermiso();
  const permisoListo = permiso?.listo ?? true;
  const permisoQuery = permiso?.query ?? "";
  const load = useCallback(async () => {
    if (!permisoListo) return;
    setLoading(true);
    setError(null);
    try {
      const [rGtf, rPend] = await Promise.all([
        fetch(`/api/admin/forestal/gtf${permisoQuery ? `?${permisoQuery}` : ""}`, { credentials: "include" }),
        fetch("/api/admin/forestal/gtf?sinIngresar=1", { credentials: "include" }),
      ]);
      let emitidas: Gtf[] = [];
      if (rGtf.ok) {
        emitidas = ((await rGtf.json()).gtfs ?? []) as Gtf[];
        setGtfs(emitidas);
      } else {
        /* Sin lista no se deja la del filtro anterior a la vista: se vacía y se dice. */
        setGtfs([]);
        setError(`No se pudo leer la lista de guías (HTTP ${rGtf.status}).`);
      }
      if (rPend.ok) {
        const pend = ((await rPend.json()).gtfs ?? []) as { gtfNumber: string }[];
        setSinIngresar(new Set(pend.map((g) => g.gtfNumber)));
      }

      // El cruce inverso: guías que el LIBRO declara en sus despachos y que
      // nadie emitió acá. Hasta ahora sólo se veía en Cumplimiento, que es
      // donde menos sirve — el que puede emitirla está en esta pantalla.
      try {
        const rLib = await fetch(`/api/admin/forestal/loth?limit=500${permisoQuery ? `&${permisoQuery}` : ""}`, { credentials: "include" });
        if (rLib.ok) {
          const lineas = ((await rLib.json()).entries ?? []) as { section: string; gtfNumber: string | null; status: string }[];
          /* El cruce compara contra TODAS las emitidas: una guía vieja sin plan no se acusa de «sin emitir» por el filtro. */
          let paraCruce = emitidas;
          if (permisoQuery) {
            const rTodas = await fetch("/api/admin/forestal/gtf", { credentials: "include" });
            if (!rTodas.ok) throw new Error(`HTTP ${rTodas.status}`);
            paraCruce = ((await rTodas.json()).gtfs ?? []) as Gtf[];
          }
          const vivas = new Set(paraCruce.filter((g) => g.status !== "anulada").map((g) => g.gtfNumber));
          const declaradas = new Set(
            lineas
              .filter((l) => l.status !== "anulado" && (l.section === "despacho_troza" || l.section === "despacho_producto") && l.gtfNumber)
              .map((l) => l.gtfNumber as string),
          );
          setDeclaradasSinEmitir([...declaradas].filter((g) => !vivas.has(g)).sort());
          const porGuia = new Map<string, number>();
          for (const l of lineas) {
            if (l.status === "anulado" || l.section !== "despacho_troza" || !l.gtfNumber) continue;
            porGuia.set(l.gtfNumber, (porGuia.get(l.gtfNumber) ?? 0) + 1);
          }
          setDespachosPorGuia(porGuia);
        }
      } catch (err) {
        // Falla blanda: sin el cruce no se acusa a nadie.
        console.warn("[loth-gtf] no se pudo cruzar el libro contra las guías emitidas", err);
      }
    } catch (e) { setGtfs([]); setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [permisoListo, permisoQuery]);
  useEffect(() => { load(); }, [load, reloadSignal]);

  // La carátula del libro es la identidad legal que va en la hoja: sin ella los
  // casilleros del titular salen vacíos y el papel no sirve en un control.
  useEffect(() => {
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCaratula(j?.active ?? null))
      .catch((err) => console.warn("[loth-gtf] no se pudo leer la carátula", err));
  }, []);

  // Llegar a la guía sin buscarla: al entrar desde «Por árbol» la fila se
  // resalta y la lista se desplaza hasta ella. El foco se consume una vez —si
  // quedara pegado, la próxima visita a esta vista lo repetiría sin motivo.
  const filaEnfocada = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!focusGtf || loading) return;
    // Si la guía no está en la lista, el foco NO se consume: así el aviso de
    // «declarada en el libro pero no emitida acá» queda a la vista.
    if (!filaEnfocada.current) return;
    filaEnfocada.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => onFocusHandled?.(), 4000);
    return () => clearTimeout(t);
  }, [focusGtf, loading, gtfs, onFocusHandled]);

  /** Manda la guía al Libro CTP (el mismo puente que usa el despacho de trozas). */
  const ingresarAlCtp = ingresarGtfAlCtp;

  /**
   * Anular no borra: deja la guía visible con su motivo. Por eso el motivo es
   * obligatorio y se pide en un modal, no en un input de 8rem dentro de la celda
   * (donde no entraba una razón de verdad y se perdía al hacer scroll).
   */
  /** Devuelve el «no» del Libro CTP (la guía ya entró allá) para mostrarlo en el modal, o null. */
  async function annul(id: string, reason: string, conDespachos: boolean): Promise<string | null> {
    /* Con despachos: la guía y sus líneas juntas (las trozas vuelven a quedar
       libres para la guía corregida). Sin: sólo el papel, como siempre. */
    const r = await fetch("/api/admin/forestal/loth/despacho-guia", {
      method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ id, action: "anular", reason, conDespachos }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; ctp?: { estado?: string; mensaje?: string } };
    /* Su madera ya entró al Libro CTP: no se anula (liberaría trozas que allá
       siguen en el libro). El modal queda abierto con el «no» y el camino. */
    if (r.status === 409 && j.error === "guia_ya_en_el_ctp") {
      return j.message ?? "Esta guía ya entró a tu Libro CTP: anula allá sus ingresos primero.";
    }
    if (!r.ok) {
      setError(j.message ?? `No se pudo anular la guía (${r.status})`);
    } else if (j.ctp?.mensaje) {
      /* Lo que pasó en el Libro CTP: la guía por recibir se dio de baja. */
      if (j.ctp.estado === "anulada") toast.success("Guía anulada", { description: j.ctp.mensaje });
      else toast.warning("Guía anulada — revisa tu Libro CTP", { description: j.ctp.mensaje, duration: 12_000 });
    }
    setAnnulId(null); load();
    return null;
  }

  /** Imprime: la guía completa va al visor con su lista; la anotada a mano, a la hoja de siempre. */
  function imprimirHoja(g: Gtf) {
    if (!g.gtfDatos) {
      printGtfOficial(g, caratula);
      return;
    }
    const papeles = papelesGuiaLoth({
      gtfNumber: g.gtfNumber,
      gtfDate: (g.gtfDate ?? "").slice(0, 10),
      titular: g.titularName ?? "",
      datos: leerGtfDatos(g.gtfDatos),
      piezas: piezasDeItems(g.items),
      anulada: g.status === "anulada" ? g.annulledReason ?? "Anulada" : null,
    });
    setHojas({ g, docs: [papeles.gtf, papeles.lista], activo: 0 });
  }

  const gtfAnular = annulId ? gtfs.find((g) => g.id === annulId) ?? null : null;

  /**
   * Se llegó buscando una guía que no está emitida acá. Pasa de verdad: el libro
   * puede declarar un despacho con un N° de GTF que nadie registró en este
   * módulo. Callarlo deja al usuario mirando una lista donde su guía no aparece;
   * decirlo convierte el viaje en un hallazgo de compliance.
   */
  const focoAusente = !!focusGtf && !loading && !gtfs.some((g) => g.gtfNumber === focusGtf);

  // Resumen del período: lo que un titular quiere saber sin leer la tabla.
  const resumen = useMemo(() => {
    const vivas = gtfs.filter((g) => g.status !== "anulada");
    return {
      emitidas: vivas.length,
      anuladas: gtfs.length - vivas.length,
      volumen: vivas.reduce((s, g) => s + Number(g.volumenTotalM3 ?? 0), 0),
      pendientes: vivas.filter((g) => g.tipo !== "producto" && sinIngresar.has(g.gtfNumber)).length,
    };
  }, [gtfs, sinIngresar]);

  /** Las claves de estado que aplican a una guía — una puede ser "emitida" Y
   *  "sin_ingresar" a la vez, no son excluyentes entre sí. */
  const clavesEstado = useCallback(
    (g: Gtf): string[] => {
      const claves = [g.status === "anulada" ? "anulada" : "emitida"];
      if (g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber)) claves.push("sin_ingresar");
      return claves;
    },
    [sinIngresar],
  );

  /** Opciones del autofiltro de Tipo/Estado, con cuántas guías trae cada una —
   *  de TODA la lista, no de lo ya acotado por la otra columna. */
  const opcionesColumna = useMemo(() => {
    const contar = (clave: (g: Gtf) => string[]): FacetaOpcion[] => {
      const map = new Map<string, number>();
      for (const g of gtfs) for (const k of clave(g)) map.set(k, (map.get(k) ?? 0) + 1);
      return [...map.entries()].map(([value, count]) => ({ value, count }));
    };
    return {
      tipo: contar((g) => [g.tipo === "producto" ? "producto" : "trozas"]),
      estado: contar(clavesEstado),
    };
  }, [gtfs, clavesEstado]);

  /** Lo que se está viendo, tras búsqueda y filtros. */
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gtfs.filter((g) => {
      if (q) {
        const heno = [g.gtfNumber, g.titularName, g.destino, g.transportista, g.placaVehiculo, g.origen]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!heno.includes(q)) return false;
      }
      if (tipoFiltro.length > 0 && !tipoFiltro.includes(g.tipo === "producto" ? "producto" : "trozas")) return false;
      if (estadoFiltro.length > 0 && !clavesEstado(g).some((k) => estadoFiltro.includes(k))) return false;
      return true;
    });
  }, [gtfs, busqueda, tipoFiltro, estadoFiltro, clavesEstado]);

  const POR_PAGINA = 25;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = filtradas.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);
  const volumenFiltrado = filtradas.filter((g) => g.status !== "anulada").reduce((a, g) => a + Number(g.volumenTotalM3 ?? 0), 0);

  useEffect(() => setPagina(0), [busqueda, tipoFiltro, estadoFiltro]);
  const orden = useOrdenColumnas("loth-gtf", ORDEN_GTF_DEFECTO);
  /* Las cuatro fichas se pliegan (Brandon 05-10); cerradas dicen lo esencial en el botón. */
  const kpis = useKpisPlegables({
    claveMemoria: "loth-gtf",
    alto: "md",
    resumen: `${resumen.emitidas} ${resumen.emitidas === 1 ? "guía" : "guías"} · ${Number(resumen.volumen).toFixed(3)} m³${resumen.pendientes > 0 ? ` · ${resumen.pendientes} sin ingresar` : ""}`,
    tarjetas: loading || gtfs.length === 0 ? [] : [
      <ResumenChip key="e" valor={resumen.emitidas} label="Guías emitidas" />,
      <ResumenChip key="v" valor={Number(resumen.volumen).toFixed(3)} sufijo="m³" label="Volumen movilizado" />,
      <ResumenChip key="p" valor={resumen.pendientes} label="Sin ingresar al CTP" tono={resumen.pendientes > 0 ? "warning" : undefined} />,
      <ResumenChip key="a" valor={resumen.anuladas} label="Anuladas" tono={resumen.anuladas > 0 ? "danger" : undefined} />,
    ],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Truck className="h-4 w-4" /> Guías de Transporte Forestal · interno (oficial = SNIFFS)</div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ADR-461: las guías que ya salieron (SNIFFS, foto o recibidas en el
              aserradero) entran con sus trozas, su tala y su permiso. */}
          {onImportarGuias && (
            <button
              type="button"
              onClick={onImportarGuias}
              title="Trae guías ya despachadas con sus trozas: por N° de registro SERFOR, foto o las que ya recibió el aserradero"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" /> Importar guías despachadas
            </button>
          )}
          {/* La guía anotada a mano sigue: sirve para las salidas que YA están
              en el libro y no tienen su guía (el aviso rojo de abajo). */}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            title="Para despachos que ya están en el libro y no tienen su guía"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
          >
            <Plus className="h-4 w-4" /> Anotar una guía
          </button>
          <button
            type="button"
            onClick={() => setShowDespacho(true)}
            title="La guía completa con sus trozas: se asienta el despacho en el libro en el mismo paso"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <Truck className="h-4 w-4" /> Despachar con guía
          </button>
        </div>
      </div>

      {/* Las guías que el libro declara y nadie emitió. Acá sí sirve: quien puede
          emitirlas está en esta pantalla. */}
      {declaradasSinEmitir.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4" />
            {declaradasSinEmitir.length === 1
              ? "1 guía está declarada en el libro y no figura acá"
              : `${declaradasSinEmitir.length} guías están declaradas en el libro y no figuran acá`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            El libro ampara salidas con {declaradasSinEmitir.length === 1 ? "este número" : "estos números"}: o la guía se emitió fuera
            del sistema, o el número del libro tiene un error de tipeo. Ante una fiscalización, esa madera viaja sin documento que la
            respalde.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {declaradasSinEmitir.map((g) => (
              <span
                key={g}
                className="rounded-full border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              >
                {g}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Emitir la guía faltante
            </button>
          </div>
        </div>
      )}

      {/* Buscar: Tipo y Estado son columnas de la tabla, se filtran desde su
          propio <th> más abajo. */}
      {!loading && gtfs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {kpis.boton}
          <div className="flex h-11 min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de guía, titular, destino, transportista o placa…"
              className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
            />
          </div>
          <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} />
        </div>
      )}

      {/* En el celular la tabla es tarjetas (`.admin-mobile-cards` esconde el
          <thead>): Tipo y Estado se repiten acá, sólo visibles ahí. */}
      {!loading && gtfs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Tipo</span>
            <CampoDeFiltro label="Tipo" value={tipoFiltro} options={opcionesColumna.tipo} etiqueta={(v) => ETIQUETA_TIPO[v] ?? v} onChange={setTipoFiltro} placeholder="Todos" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Estado</span>
            <CampoDeFiltro label="Estado" value={estadoFiltro} options={opcionesColumna.estado} etiqueta={(v) => ETIQUETA_ESTADO[v] ?? v} onChange={setEstadoFiltro} placeholder="Todos" />
          </div>
        </div>
      )}

      {focoAusente && (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          La guía <b className="font-mono">{focusGtf}</b> está declarada en el Libro de Operaciones pero no figura entre las guías
          emitidas acá. O se emitió fuera del sistema, o el número del libro tiene un error de tipeo.
        </div>
      )}

      {error && <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex h-9 items-center rounded-lg border-2 border-[var(--data-error-500)] px-3 text-xs font-bold hover:bg-[var(--data-error-100)]">Reintentar</button></div>}

      {kpis.panel}

      {/* Emitir: el formulario es un documento (12 campos + lista de trozas), no
          un panel que empuje la tabla — va en modal ancho con footer fijo. */}
      <AdminModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Emitir Guía de Transporte Forestal"
        description="Interna (no oficial). Las trozas deben estar registradas en el Libro de Operaciones."
        icon={Truck}
        variant="info"
      >
        {showForm && <GtfForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      </AdminModal>

      {/* Anular: pide motivo obligatorio y explica que la guía NO se borra. */}
      <AdminModal
        open={!!gtfAnular}
        onClose={() => setAnnulId(null)}
        title={gtfAnular ? `Anular la GTF ${gtfAnular.gtfNumber}` : "Anular GTF"}
        description="La guía queda en el libro con su motivo. No se borra."
        icon={Ban}
      >
        {gtfAnular && (
          <AnularGtfForm
            gtf={gtfAnular}
            despachos={despachosPorGuia.get(gtfAnular.gtfNumber) ?? 0}
            onConfirm={(r, conDespachos) => annul(gtfAnular.id, r, conDespachos)}
            onCancel={() => setAnnulId(null)}
          />
        )}
      </AdminModal>

      {showDespacho && (
        <LothDespachoGuiaModal onClose={() => setShowDespacho(false)} onRegistrada={() => void load()} />
      )}
      {hojas && (
        <CtpDocumentoVisor
          documentos={hojas.docs}
          activo={hojas.activo}
          onActivo={(i) => setHojas((h) => (h ? { ...h, activo: i } : h))}
          onClose={() => setHojas(null)}
          onArchivar={(doc) =>
            archivoDeGuiaLoth(
              { gtfNumber: hojas.g.gtfNumber, titular: hojas.g.titularName ?? "", datos: leerGtfDatos(hojas.g.gtfDatos) },
              doc,
            )
          }
        />
      )}

      {loading && <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

      {!loading && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <DataTable filtrable className="w-full text-sm">
            <thead ref={orden.refCabecera} className="bg-[var(--surface-sunken)] text-left align-top">
              <tr>
                <EnOrden
                  orden={orden.orden}
                  celdas={{
                    gtf: <th data-col="gtf" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">N° GTF</th>,
                    fecha: <th data-col="fecha" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">Fecha</th>,
                    tipo: (
                      <th data-col="tipo" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">
                        <span className="block">Tipo</span>
                        <FiltroColumnaMulti
                          label="Tipo"
                          value={tipoFiltro}
                          options={opcionesColumna.tipo}
                          etiqueta={(v) => ETIQUETA_TIPO[v] ?? v}
                          onChange={setTipoFiltro}
                          placeholder="Todos"
                        />
                      </th>
                    ),
                    titular: <th data-col="titular" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">Titular</th>,
                    destino: <th data-col="destino" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">Destino</th>,
                    volumen: <th data-col="volumen" className="px-4 py-2.5 text-right font-bold text-[var(--text-primary)]">Vol. m³</th>,
                    estado: (
                      <th data-col="estado" className="px-4 py-2.5 font-bold text-[var(--text-primary)]">
                        <span className="block">Estado</span>
                        <FiltroColumnaMulti
                          label="Estado"
                          value={estadoFiltro}
                          options={opcionesColumna.estado}
                          etiqueta={(v) => ETIQUETA_ESTADO[v] ?? v}
                          onChange={setEstadoFiltro}
                          placeholder="Todos"
                        />
                      </th>
                    ),
                  }}
                />
                <th className="px-4 py-2.5 font-bold text-[var(--text-primary)]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {enPagina.map((g) => (
                <tr
                  key={g.id}
                  ref={g.gtfNumber === focusGtf ? filaEnfocada : undefined}
                  className={`border-t border-[var(--rule-soft)] ${g.status === "anulada" ? "opacity-50" : ""} ${
                    g.gtfNumber === focusGtf ? "bg-[var(--data-info-500)]/15 outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]" : ""
                  }`}
                >
                  <EnOrden
                    orden={orden.orden}
                    celdas={{
                      gtf: <td className="px-4 py-2.5"><span className="font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber}</span></td>,
                      fecha: <td className="px-4 py-2.5 text-[var(--text-secondary)]">{fmtDate(g.gtfDate)}</td>,
                      tipo: <td className="px-4 py-2.5"><span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{g.tipo === "producto" ? "Producto" : "Trozas"}</span></td>,
                      titular: <td className="px-4 py-2.5 text-[var(--text-primary)]">{g.titularName ?? "—"}</td>,
                      destino: <td className="px-4 py-2.5 text-[var(--text-secondary)]">{g.destino ?? "—"}</td>,
                      volumen: <td className="px-4 py-2.5 text-right"><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{g.volumenTotalM3 ? fmtM3(Number(g.volumenTotalM3)) : "—"}</span></td>,
                      estado: <td className="px-4 py-2.5">{g.status === "anulada" ? <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">ANULADA</span> : <span className="rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]">Emitida</span>}</td>,
                    }}
                  />
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber) && (
                        <button
                          type="button"
                          onClick={() => ingresarAlCtp(g.gtfNumber)}
                          title="Registrar estas trozas como ingreso en el Libro de Operaciones del CTP"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/15"
                        >
                          <LogIn className="h-3.5 w-3.5" /> Ingresar al CTP
                        </button>
                      )}
                      {/* ADR-461: la guía importada guarda su ficha de SERFOR entera (titular, destinatario, transporte, productos). */}
                      <BotonFichaImportada gtfDatos={g.gtfDatos} gtfNumber={g.gtfNumber} items={g.items} />
                      <button
                        type="button"
                        onClick={() => imprimirHoja(g)}
                        title="Imprimir en la hoja de casilleros SERFOR (mismo formato que el Libro CTP)"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                      >
                        <Printer className="h-3.5 w-3.5" /> Hoja SERFOR
                      </button>
                      <button type="button" onClick={() => printGtf(g)} title="Imprimir el resumen interno" className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-3.5 w-3.5" /> Resumen</button>
                      {/* ADR-461 §12: la guía que asentó una importación se deshace entera (su madera ya estaba en el CTP). */}
                      {g.status !== "anulada" && importacionDeLaGuia(g.observations) && (
                        <BotonDeshacerImportacion compacto gtfId={g.id} gtfNumber={g.gtfNumber} onHecho={() => load()} />
                      )}
                      {g.status !== "anulada" && (
                        <button type="button" onClick={() => setAnnulId(g.id)} title="Anular esta guía" aria-label={`Anular la GTF ${g.gtfNumber}`} className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><Ban className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {gtfs.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-tertiary)]"><FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin GTF emitidas. Haz click en &quot;Emitir GTF&quot;.</td></tr>}
            </tbody>
          </DataTable>
        </div>
      )}
      {!loading && filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {filtradas.length === gtfs.length
              ? `${gtfs.length} guía${gtfs.length === 1 ? "" : "s"}`
              : `${filtradas.length} de ${gtfs.length} guías`}
            {" · "}
            <span className="font-mono tabular-nums">{fmtM3(volumenFiltrado)}</span> m³
            {totalPaginas > 1 && ` · página ${pagActual + 1} de ${totalPaginas}`}
          </p>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagActual === 0}
                className="h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagActual >= totalPaginas - 1}
                className="h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ficha de resumen de la pestaña. */
function ResumenChip({ valor, label, sufijo, tono }: { valor: number | string; label: string; sufijo?: string; tono?: "warning" | "danger" }) {
  const color = tono === "danger"
    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    : tono === "warning"
      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-primary)]";
  const borde = tono === "danger" ? "border-[var(--data-error-500)]" : tono === "warning" ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]";
  return (
    <div className={`rounded-2xl border-2 ${borde} bg-[var(--surface-raised)] px-3.5 py-3`}>
      <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>
        {valor}
        {sufijo && <span className="ml-1 text-sm font-semibold">{sufijo}</span>}
      </div>
      <p className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase leading-tight tracking-wide text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}

/**
 * Cuerpo del modal de anulación. El motivo va a `annulledReason` y queda en el
 * libro: es lo que lee un fiscalizador para entender por qué esa guía no vale.
 */
function AnularGtfForm({
  gtf,
  despachos: porNumero,
  onConfirm,
  onCancel,
}: {
  gtf: Gtf;
  /** Líneas de despacho vivas con el N° de esta guía. */
  despachos: number;
  /** Devuelve el «no» del Libro CTP para mostrarlo acá, o null si se anuló. */
  onConfirm: (r: string, conDespachos: boolean) => Promise<string | null>;
  onCancel: () => void;
}) {
  /* Sólo las líneas de ESTA guía (el servidor): otro titular puede tener el mismo N°. */
  const despachos = useLineasDeLaGuia(gtf.id, porNumero);
  const [r, setR] = useState("");
  const [conDespachos, setConDespachos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  /* La misma regla del servidor (`motivo.ts`): tres letras, sin invisibles. */
  const valido = motivoLegible(r);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido || busy) return;
        setBusy(true);
        void onConfirm(r.trim(), despachos > 0 && conDespachos).then((no) => {
          setBusy(false);
          setBloqueo(no);
        });
      }}
      className="space-y-4 p-5"
    >
      {bloqueo && (
        <div
          role="alert"
          data-testid="anular-guia-bloqueo-ctp"
          className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 basis-60">{bloqueo}</span>
          <button
            type="button"
            onClick={verIngresosDelCtp}
            className="inline-flex h-11 shrink-0 items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] sm:h-9"
          >
            Ir a Ingresos del CTP
          </button>
        </div>
      )}
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Se anulan <strong>{gtf.volumenTotalM3 ? fmtM3(Number(gtf.volumenTotalM3)) : "—"} m³</strong>
          {gtf.destino ? <> con destino <strong>{gtf.destino}</strong></> : null}. La guía sigue apareciendo en el libro, marcada como anulada.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Motivo de la anulación *</span>
        <textarea
          value={r}
          onChange={(e) => setR(e.target.value)}
          rows={3}
          placeholder="Ej.: error en la placa del vehículo; se reemplaza por la GTF 001-0000126."
          className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Al menos 3 letras. Queda registrado en el libro.</span>
      </label>
      {despachos > 0 && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={conDespachos} onChange={(e) => setConDespachos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--data-error-600)]" />
          <span>
            Anular también {despachos === 1 ? "la línea" : `las ${despachos} líneas`} de despacho de esta guía.
            <span className="block text-xs text-[var(--text-secondary)]">Las trozas vuelven a quedar libres para ir en la guía corregida. Si la guía ya entró a tu Libro CTP, primero se anulan allá sus ingresos.</span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={!valido || busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Anular la guía
        </button>
      </div>
    </form>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────
function GtfForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const permiso = useLothPermiso();
  const planElegido = permiso?.plan ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    gtfNumber: "", gtfDate: new Date().toISOString().slice(0, 10), tipo: "trozas",
    titularName: "", tituloHabilitante: "", parcelaCorta: "",
    transportista: "", transportistaDoc: "", conductor: "", conductorLicencia: "", placaVehiculo: "",
    origen: "", destino: "", observations: "",
  });
  const [items, setItems] = useState<GtfItem[]>([]);
  const [it, setIt] = useState({ code: "", species: "", diamMayorM: "", diamMenorM: "", lengthM: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (k: keyof typeof it, v: string) => setIt((p) => ({ ...p, [k]: v }));
  // Verificación SERFOR (informativa, ADR-312): esta GTF interna no tiene hoy
  // dónde guardar el sello (ForestGtf no trae esas columnas), así que confirma
  // en el momento y no se persiste — igual que el resto del form, que tampoco
  // valida contra la GTF oficial más allá de esto.
  const [selloSerfor, setSelloSerfor] = useState<{ numeroRegistro: string; verificadoEn: string } | null>(null);

  // ── Validación GTF ↔ Libro de Operaciones ──────────────────────────────
  // codesInLibro: set de códigos registrados en el libro (sección trozado/despacho).
  // null = cargando todavía; Set vacío podría significar "no hay trozas aún".
  const [codesInLibro, setCodesInLibro] = useState<Set<string> | null>(null);
  const [libroErr, setLibroErr] = useState<string | null>(null);

  useEffect(() => {
    // OJO: NO usar `?available=despacho_troza` acá — esa fuente EXCLUYE a
    // propósito las trozas ya despachadas (es el picker para crear un despacho
    // nuevo), y "Cargar trozas despachadas" abajo carga justamente las YA
    // despachadas → toda troza cargada daba "no está en el libro". `trozaCodes`
    // trae TODAS las registradas en Trozado, despachadas o no.
    fetch("/api/admin/forestal/loth?trozaCodes=1", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const codes = new Set<string>(
          ((j.codes ?? []) as Array<string | null>)
            .map((x) => x?.trim() ?? "")
            .filter(Boolean)
        );
        setCodesInLibro(codes);
      })
      .catch((e: unknown) => {
        // Si el endpoint falla no bloqueamos al usuario, pero avisamos.
        setLibroErr(e instanceof Error ? e.message : String(e));
        setCodesInLibro(new Set()); // tratar como "sin datos" para no bloquear indefinidamente
      });
  }, []);

  // Índice: para cada troza con código, ¿está en el libro?
  // Solo aplica cuando codesInLibro ya cargó y la troza tiene código.
  const invalidCodes: Set<number> = new Set(
    items.reduce<number[]>((acc, x, i) => {
      if (codesInLibro !== null && x.code && x.code.trim() !== "" && !codesInLibro.has(x.code.trim())) {
        acc.push(i);
      }
      return acc;
    }, [])
  );
  const hasInvalidItems = invalidCodes.size > 0;

  // Prefill titular/título: el plan ELEGIDO en el libro si hay uno; si no, el plan activo.
  useEffect(() => {
    if (planElegido) {
      setF((s) => ({ ...s, titularName: planElegido.titularName ?? "", tituloHabilitante: planElegido.tituloHabilitante ?? "" }));
      /* La parcela de corta no viaja en la lista del libro: se lee del plan elegido, como con el plan activo. */
      const ac = new AbortController();
      fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planElegido.id)}`, { credentials: "include", signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { const pc = j?.plan?.parcelaCorta; if (typeof pc === "string" && pc) setF((s) => ({ ...s, parcelaCorta: pc })); })
        .catch((err) => { if (!ac.signal.aborted) console.warn("[loth-gtf] no se pudo precargar la parcela del plan elegido", err); });
      return () => ac.abort();
    }
    fetch("/api/admin/forestal/plan?active=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const p = j?.active; if (p) setF((s) => ({ ...s, titularName: p.titularName ?? "", tituloHabilitante: p.tituloHabilitante ?? "", parcelaCorta: p.parcelaCorta ?? "" })); })
      // Prefill best-effort: si no hay plan activo, el usuario completa a mano.
      .catch((err) => console.warn("[loth-gtf] no se pudo precargar el plan activo", err));
  }, [planElegido]);

  const autoVol = smalian(Number(it.diamMayorM), Number(it.diamMenorM), Number(it.lengthM));
  function addItem() {
    if (!it.code.trim() && !it.species.trim()) return;
    const m = findSpeciesByCommonName(it.species);
    setItems((arr) => [...arr, {
      code: it.code.trim() || null, species: it.species.trim() || null, scientific: m?.scientificName ?? null, cites: m?.cites ?? false,
      diamMayorM: it.diamMayorM ? Number(it.diamMayorM) : null, diamMenorM: it.diamMenorM ? Number(it.diamMenorM) : null,
      lengthM: it.lengthM ? Number(it.lengthM) : null, volumeM3: autoVol || null,
    }]);
    setIt({ code: "", species: it.species, diamMayorM: "", diamMenorM: "", lengthM: "" });
  }
  async function loadDespachadas() {
    try {
      const r = await fetch("/api/admin/forestal/loth?despachables=1", { credentials: "include" });
      if (!r.ok) return;
      const fetched = ((await r.json()).items ?? []) as GtfItem[];
      const existing = new Set(items.map((x) => x.code));
      const nuevos = fetched.filter((x) => x.code && !existing.has(x.code));
      if (nuevos.length) setItems((arr) => [...arr, ...nuevos]);
    } catch { /* best-effort: si falla, el usuario carga manual */ }
  }
  const totalVol = items.reduce((a, i) => a + Number(i.volumeM3 ?? 0), 0);
  // Sin estos tres, un puesto de control no puede cruzar quién transporta la
  // madera contra este registro interno (mismo requisito que exige el backend).
  const hasMissingRequired = !f.transportista.trim() || !f.conductor.trim() || !f.placaVehiculo.trim();
  /* La guía la emite el bosque: una placa que no puede existir no sale (la
     misma regla que «Despachar con guía»; el servidor también la rechaza). */
  const lecturaPlaca = leerPlaca(f.placaVehiculo);
  const placaInvalida = lecturaPlaca.estado === "invalida" ? lecturaPlaca.motivo : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired || placaInvalida) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { items };
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.gtfNumber = f.gtfNumber.trim();
      /* La guía nueva queda atada al permiso elegido: así el filtro del libro la encuentra. */
      if (planElegido) body.planId = planElegido.id;
      const r = await fetch("/api/admin/forestal/gtf", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  // Vive dentro de AdminModal: el padding y el footer los pone el form, y el
  // footer va `sticky` para que "Emitir" no quede debajo de la lista de trozas.
  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{err}</div>}
      {libroErr && (
        <div className="rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)]">
          No se pudo cargar el Libro de Operaciones ({libroErr}). La validación GTF ↔ libro está desactivada temporalmente.
        </div>
      )}
      {hasInvalidItems && (
        <div className="rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-medium text-[var(--data-error-700)]">
          Hay trozas que no figuran en el Libro de Operaciones. Registralas en Trozado/Despacho antes de emitir la GTF.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="N° GTF *"><input value={f.gtfNumber} onChange={(e) => set("gtfNumber", e.target.value)} placeholder="001-0000125" className={I} /></Field>
        <Field label="Fecha"><input type="date" value={f.gtfDate} onChange={(e) => set("gtfDate", e.target.value)} className={I} /></Field>
        <Field label="Tipo"><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className={I}><option value="trozas">Trozas</option><option value="producto">Producto</option></select></Field>
        <Field label="Titular"><input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} className={I} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Transportista *"><input value={f.transportista} onChange={(e) => set("transportista", e.target.value)} className={I} /></Field>
        <Field label="Doc. transportista"><input value={f.transportistaDoc} onChange={(e) => set("transportistaDoc", e.target.value)} className={I} /></Field>
        <Field label="Conductor *"><input value={f.conductor} onChange={(e) => set("conductor", e.target.value)} className={I} /></Field>
        <CampoPlaca label="Placa vehículo" required valor={f.placaVehiculo} onCambio={(v) => set("placaVehiculo", v)} />
      </div>

      <VerificarGtfSerfor
        gtfNumber={f.gtfNumber}
        onSello={setSelloSerfor}
        onGuiaVerificada={(g) => {
          // Lo que la guía trae y el operador todavía no tipeó se copia; lo
          // tipeado no se pisa. SERFOR no publica un nombre de conductor
          // separado del transportista, así que ese campo sigue manual.
          setF((p) => ({
            ...p,
            gtfNumber: p.gtfNumber.trim() || g.gtfNumber || p.gtfNumber,
            titularName: p.titularName.trim() || g.titular || p.titularName,
            transportista: p.transportista.trim() || g.transportista || p.transportista,
            transportistaDoc: p.transportistaDoc.trim() || g.transportistaDni || p.transportistaDoc,
            conductorLicencia: p.conductorLicencia.trim() || g.licenciaConducir || p.conductorLicencia,
            placaVehiculo: p.placaVehiculo.trim() || g.placa || p.placaVehiculo,
          }));
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origen"><input value={f.origen} onChange={(e) => set("origen", e.target.value)} placeholder="PC 12 — bosque" className={I} /></Field>
        <Field label="Destino"><input value={f.destino} onChange={(e) => set("destino", e.target.value)} placeholder="CTP / aserradero" className={I} /></Field>
      </div>

      {/* Lista de trozas */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Lista de trozas / productos</p>
          <button type="button" onClick={loadDespachadas} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <Plus className="h-3.5 w-3.5" /> Cargar trozas despachadas
          </button>
        </div>
        <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-6">
          <Field label="Código"><input value={it.code} onChange={(e) => setItem("code", e.target.value)} placeholder="85-TOR-A" className={I} /></Field>
          <Field label="Especie"><input value={it.species} onChange={(e) => setItem("species", e.target.value)} placeholder="Tornillo" className={I} /></Field>
          <Field label="Ø mayor"><input type="number" step="0.001" value={it.diamMayorM} onChange={(e) => setItem("diamMayorM", e.target.value)} className={I} /></Field>
          <Field label="Ø menor"><input type="number" step="0.001" value={it.diamMenorM} onChange={(e) => setItem("diamMenorM", e.target.value)} className={I} /></Field>
          <Field label={`Long. ${autoVol > 0 ? `→ ${fmtM3(autoVol)}` : ""}`}><input type="number" step="0.01" value={it.lengthM} onChange={(e) => setItem("lengthM", e.target.value)} className={I} /></Field>
          <button type="button" onClick={addItem} className="h-10 rounded-xl bg-[var(--accent-dark)] text-sm font-semibold text-white hover:brightness-110">+ Agregar</button>
        </div>
        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--text-tertiary)]"><tr><th className="py-1">Código</th><th>Especie</th><th className="text-right">Ø may</th><th className="text-right">Ø men</th><th className="text-right">Long.</th><th className="text-right">Vol. m³</th><th></th></tr></thead>
              <tbody>
                {items.map((x, i) => (
                  <tr key={i} className={`border-t border-[var(--rule-soft)] ${invalidCodes.has(i) ? "bg-[var(--data-error-50)]" : ""}`}>
                    <td className="py-1.5 font-mono font-bold text-[var(--text-primary)]">
                      {x.code ?? "—"}
                      {invalidCodes.has(i) && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--data-error-600)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-white leading-none">
                          no está en el libro
                        </span>
                      )}
                    </td>
                    <td>{x.species ?? "—"}{x.cites && <span className="ml-1 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMayorM != null ? Number(x.diamMayorM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMenorM != null ? Number(x.diamMenorM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.lengthM != null ? Number(x.lengthM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums font-bold">{x.volumeM3 != null ? fmtM3(x.volumeM3) : "—"}</td>
                    <td className="text-right"><button aria-label="Eliminar" type="button" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="text-[var(--data-error-600)]"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--rule-base)] font-bold"><td colSpan={5} className="py-1.5 text-right">Volumen total</td><td className="text-right font-mono tabular-nums text-[var(--data-success-700)]">{fmtM3(totalVol)}</td><td></td></tr>
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">
          {items.length} {items.length === 1 ? "ítem" : "ítems"} · <span className="font-mono tabular-nums">{fmtM3(totalVol)}</span> m³
          {items.length === 0 && <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— agrega al menos una troza</span>}
          {items.length > 0 && hasMissingRequired && (
            <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— completa transportista, conductor y placa</span>
          )}
          {!hasMissingRequired && placaInvalida && (
            <span className="ml-2 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">— la placa no es válida: {placaInvalida}</span>
          )}
          {selloSerfor && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <ShieldCheck className="h-3.5 w-3.5" /> verificada en SERFOR ({selloSerfor.numeroRegistro})
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" disabled={busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired || Boolean(placaInvalida)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Emitir GTF</button>
        </div>
      </div>
    </form>
  );
}

// ─── Impresión (ventana nueva, aislada) — QR real vía lazy-import ───────────

/**
 * ⛔ Todo lo que se imprime en estas dos funciones —titular, transportista,
 * placa, observaciones, el motivo de anulación, el código y la especie de cada
 * troza— lo tipea una persona en el formulario y llega acá desde la base SIN
 * pasar por React, que es lo que normalmente escapa por nosotros. Un
 * `<img onerror=...>` en «observaciones» se ejecutaba al imprimir la guía, en
 * una ventana con el mismo origen que el panel.
 *
 * Se usa el `esc()` compartido (`ctp-documento-print`), el mismo que ya protegía
 * la hoja oficial del CTP: un escape propio acá sería una segunda versión que
 * mañana se arregla en un lado y no en el otro.
 *
 * NO se aplica al SVG del QR ni al CSS: eso es markup a propósito, generado por
 * nosotros, no texto de nadie.
 */
/**
 * Imprime la guía en la hoja de casilleros SERFOR — la MISMA que usa el Libro
 * CTP. Antes cada libro tenía su papel: el del título habilitante, que es el que
 * viaja con la madera desde el bosque, era el peor de los dos.
 */
function printGtfOficial(g: Gtf, caratula: LothGtfCaratula | null) {
  const { cuerpo, css, titulo } = documentoGtfLoth(g as unknown as LothGtfDoc, caratula);
  const w = window.open("", "_blank", "width=920,height=1000");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${css}</style></head><body>${cuerpo}</body></html>`,
  );
  w.document.close();
}

async function printGtf(g: Gtf) {
  const items = Array.isArray(g.items) ? g.items : [];
  const rows = items.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.code)}</td><td>${esc(x.species)}${x.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${x.diamMayorM != null ? Number(x.diamMayorM).toFixed(2) : ""}</td><td style="text-align:right">${x.diamMenorM != null ? Number(x.diamMenorM).toFixed(2) : ""}</td><td style="text-align:right">${x.lengthM != null ? Number(x.lengthM).toFixed(2) : ""}</td><td style="text-align:right">${x.volumeM3 != null ? fmtM3(x.volumeM3) : ""}</td></tr>`).join("");
  const vol = g.volumenTotalM3 ? Number(g.volumenTotalM3).toFixed(4) : "0";

  // QR real: codifica una cadena de verificación interna escaneable
  let qrSvg = "";
  try {
    const QRCode = (await import("qrcode")).default;
    const payload = `BSM-GTF|N:${g.gtfNumber}|TIT:${g.titularName ?? ""}|TH:${g.tituloHabilitante ?? ""}|VOL:${vol}m3|F:${fmtDate(g.gtfDate)}`;
    qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 118, errorCorrectionLevel: "M" });
  } catch {
    qrSvg = `<div style="font-family:monospace">◫◫◫</div>`;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GTF ${esc(g.gtfNumber)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;font-size:12px}
    h1{font-size:16px;margin:0} .sub{color:#555;font-size:11px}
    .box{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-top:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
    .k{color:#666} .v{font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
    th,td{border:1px solid #ccc;padding:4px 6px} th{background:#f0f0f0;text-align:left}
    .tot{text-align:right;font-weight:bold;margin-top:6px;font-size:13px}
    .qr{float:right;border:2px solid #111;border-radius:8px;padding:8px;text-align:center;font-family:monospace;font-size:10px;width:120px}
    .dj{margin-top:14px;font-size:10px;color:#444;border-top:1px dashed #999;padding-top:8px}
    .anul{color:#b00;font-weight:bold;border:2px solid #b00;display:inline-block;padding:2px 8px;border-radius:4px}
  </style></head><body onload="window.print()">
    <div class="qr">${qrSvg}<div style="font-size:9px;margin-top:4px">verif. interna</div></div>
    <h1>GUÍA DE TRANSPORTE FORESTAL</h1>
    <div class="sub">Documento interno de gestión — no oficial (la GTF oficial se emite por SNIFFS)</div>
    ${g.status === "anulada" ? `<div class="anul">ANULADA — ${esc(g.annulledReason)}</div>` : ""}
    <div class="box"><div class="grid">
      <div><span class="k">N° GTF:</span> <span class="v">${esc(g.gtfNumber)}</span></div>
      <div><span class="k">Fecha:</span> <span class="v">${fmtDate(g.gtfDate)}</span></div>
      <div><span class="k">Titular:</span> <span class="v">${esc(g.titularName ?? "—")}</span></div>
      <div><span class="k">${esc(rotuloDelTitulo(guiaEsDePlantacion({ titulos: [g.tituloHabilitante ?? ""], guia: leerGtfDatos(g.gtfDatos).guia })))}:</span> <span class="v">${esc(g.tituloHabilitante ?? "—")}</span></div>
      <div><span class="k">Parcela de corta:</span> <span class="v">${esc(g.parcelaCorta ?? "—")}</span></div>
      <div><span class="k">Tipo:</span> <span class="v">${g.tipo === "producto" ? "Producto terminado" : "Trozas"}</span></div>
    </div></div>
    <div class="box"><div class="grid">
      <div><span class="k">Transportista:</span> <span class="v">${esc(g.transportista ?? "—")}</span> ${g.transportistaDoc ? `(${esc(g.transportistaDoc)})` : ""}</div>
      <div><span class="k">Conductor:</span> <span class="v">${esc(g.conductor ?? "—")}</span> ${g.conductorLicencia ? `Lic. ${esc(g.conductorLicencia)}` : ""}</div>
      <div><span class="k">Placa:</span> <span class="v">${esc(g.placaVehiculo ?? "—")}</span></div>
      <div><span class="k">Origen → Destino:</span> <span class="v">${esc(g.origen ?? "—")} → ${esc(g.destino ?? "—")}</span></div>
    </div></div>
    <h3 style="margin:14px 0 0">Lista de trozas / productos</h3>
    <table><thead><tr><th>N°</th><th>Código</th><th>Especie</th><th>Ø may (m)</th><th>Ø men (m)</th><th>Long. (m)</th><th>Vol. (m³)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">Volumen total: ${vol} m³ · ${items.length} piezas</div>
    ${g.observations ? `<div class="box"><span class="k">Observaciones:</span> ${esc(g.observations)}</div>` : ""}
    <div class="dj">Declaración jurada: la información consignada es veraz y los productos provienen del título habilitante señalado. La presente guía no presenta enmendaduras ni alteraciones.</div>
    <div style="margin-top:30px;display:flex;justify-content:space-between"><div>______________________<br>Firma del emisor</div><div>______________________<br>Sello</div></div>
  </body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (w) { w.document.write(html); w.document.close(); }
}

const I = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}
