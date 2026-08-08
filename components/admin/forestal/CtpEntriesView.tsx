"use client";

/**
 * CtpEntriesView — tabla de Producción/Despacho del Libro CTP (ADR-127).
 * Producción y Despacho comparten esta misma tabla, adaptada por sección.
 * Saldos (balance de planta) vive en CtpSaldosView, componente hermano.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Search, Boxes, Truck, AlertCircle, PackagePlus } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import ActionMenu from "@/components/admin/shared/action-menu";
import { accionesDeLotes, accionesDeSeccion, accionesPorDeclarar } from "./ctp-entries-acciones";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDebounce } from "@/hooks/use-debounce";
import { type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpProduccionImportModal from "./CtpProduccionImportModal";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpEntriesTabla, { type SortKey } from "./CtpEntriesTabla";
import CtpProduccionDeLote from "./CtpProduccionDeLote";
import CtpCorridaSinDeclarar from "./CtpCorridaSinDeclarar";
import CtpSeccionKpis from "./CtpSeccionKpis";
import CtpLotesParaProducir from "./CtpLotesParaProducir";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useCtpSeccion } from "@/hooks/use-ctp-secciones";
import CtpSimuladorModal from "./CtpSimuladorModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpFiltrosPanel, { BotonFiltros } from "./ctp-filtros-panel";
import { nombreArchivoSeccion, seccionACsv } from "@/lib/forestal/ctp-secciones-csv";

// El anexo arrastra jsPDF/exceljs: entra solo cuando alguien lo pide.
const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });
import { type CtpEntry, type CtpSection } from "./ctp-section-shared";
import { TablaSkeleton } from "./ctp-shared";
import { CtpPaginacion, usePaginacion } from "./ctp-tabla";

const SECTION_META: Record<CtpSection, { label: string; icon: typeof Boxes; cta: string; empty: string }> = {
  /* El CTA de Producción ya no abre un formulario en blanco (ADR-349): la
     producción se registra DESDE UN LOTE, con sus trozas a la vista. Ver
     `accionesDeLotes` en `ctp-entries-acciones`. */
  produccion: { label: "Producción", icon: Boxes, cta: "Declarar producción", empty: "Sin transformaciones registradas. Elegí un lote en «Declarar producción»: salen sus trozas para elegir cuáles entran a la sierra." },
  despacho: { label: "Despacho", icon: Truck, cta: "Nuevo despacho", empty: "Sin despachos registrados. Registrá la salida de producto con su GTF." },
};



export function CtpEntriesView({
  section,
  period,
  presetProducto,
  presetEspecie,
  presetLoteAserrioId,
  onPresetUsado,
  onIr,
}: {
  section: CtpSection;
  period: CtpPeriod;
  /** Producto que llega desde el stock de Saldos: abre el formulario ya cargado. */
  presetProducto?: string | null;
  presetEspecie?: string | null;
  /** Lote de aserrío elegido en la pestaña Lotes (ADR-334): abre la corrida con él. */
  presetLoteAserrioId?: string | null;
  /** Aviso al shell de que ya se consumió el preset (producto o lote). */
  onPresetUsado?: () => void;
  /** Saltar a otra vista del libro (hoy: a Lotes, cuando no hay ninguno abierto). */
  onIr?: (vista: string) => void;
}) {
  const meta = SECTION_META[section];
  /** Bandeja de anexos emitidos abierta desde la barra (consulta, sin despacho). */
  const [verBandeja, setVerBandeja] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  // Sin debounce, `load` se re-creaba en cada tecla → un fetch por caracter.
  const search = useDebounce(searchInput, 350);

  /** Todo lo que se SABE de la sección: fetch, filtros, orden y derivados. */
  const {
    entries, loading, error, setError, recargar: load,
    conAnexo, totalAnexos, recargarAnexos: cargarAnexos, sinAnexo,
    statusFilter, setStatusFilter, soloSinAnexo, setSoloSinAnexo,
    sort, setSort, facetas, setFacetas, activos, panelId, abierto, alternar, opciones,
    visible, totalesVista, kpis, statusCounts,
  } = useCtpSeccion(section, period, search);
  /** Despacho para el que se está emitiendo el ANEXO N° 04 de la GTF. */
  const [anexoEntry, setAnexoEntry] = useState<CtpEntry | null>(null);
  // Los avisos del anexo (descargó, no se pudo, cargué el ya emitido) necesitan
  // dónde salir: sin esto el modal hablaba solo cuando se abría desde el Libro.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [showForm, setShowForm] = useState(false);
  /** Carga masiva del parte de turno (ADR-323), sólo en Producción. */
  const [importarParte, setImportarParte] = useState(false);
  /** Con qué producto abrir el formulario (viene de Saldos; se consume una vez). */
  const [productoDelStock, setProductoDelStock] = useState<{ producto: string; especie: string | null } | null>(null);

  // El producto que llega desde el stock abre el formulario una sola vez: se
  // avisa al padre para que lo limpie y volver a Saldos → Despacho no reabra
  // el modal con lo de la vez pasada.
  useEffect(() => {
    /* Sólo Despacho: en Producción no queda formulario que abrir y `showForm`
       en true apagaría los atajos de la vista sin dibujar nada. */
    if (!presetProducto || section !== "despacho") return;
    setProductoDelStock({ producto: presetProducto, especie: presetEspecie ?? null });
    setShowForm(true);
    onPresetUsado?.();
  }, [presetProducto, presetEspecie, onPresetUsado, section]);

  /**
   * La corrida sin declarar cuyo panel está abierto arriba de la tabla.
   *
   * Se guarda el ID y no la fila: así el panel se cierra solo cuando esa corrida
   * deja de estar pendiente (se declaró, se anuló) en vez de quedar mostrando
   * una copia vieja de algo que ya no existe.
   */
  const [corridaAbiertaId, setCorridaAbiertaId] = useState<string | null>(null);
  /** El lote que se está produciendo (ADR-349): su tabla de trozas se abre debajo. */
  const [loteProd, setLoteProd] = useState("");
  const lotes = useLotesAserrio();
  /** Los lotes que se pueden aserrar hoy, con lo que tienen esperando: se elige
   *  por peso (piezas y m³), no por nombre — el código del lote no dice nada. */
  const lotesConMadera = useMemo(
    () =>
      lotes.lotes
        .filter((l) => l.status === "abierto")
        .map((l) => {
          /* Las piezas APARTADAS en el lote, no el patio de su especie: la
             tarjeta promete lo que se va a ver al abrirla. Con `trozasDelLote`
             un lote de 6 anunciaba «26 pza» —las 26 Tornillo del patio— y la
             tabla de abajo mostraba otra cosa. */
          const suyas = lotes.trozas.filter((t) => t.loteAserrioId === l.id && !t.consumidaEnId);
          return {
            lote: l,
            piezas: suyas.length,
            volumenM3: Math.round(suyas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
          };
        })
        .filter((x) => x.piezas > 0 || x.lote.piezas > 0),
    [lotes.lotes, lotes.trozas],
  );
  /* Se busca en TODOS los lotes y no sólo en los que tienen madera: el que llega
     desde la pestaña Lotes puede estar vacío todavía, y el panel sabe decir «no
     hay piezas» mucho mejor que una pantalla que no abre nada. */
  const loteElegido = useMemo(
    () => lotes.lotes.find((l) => l.id === loteProd) ?? null,
    [lotes.lotes, loteProd],
  );
  /**
   * Las corridas que consumieron y todavía no dijeron qué salió (ADR-340).
   * `quantity == null` es exactamente eso: materia prima adentro, producto sin
   * declarar. No es lo mismo que producir cero.
   */
  /* La sección se pagina del lado del cliente sobre el set del período, con la
     MISMA barra que el resto de las tablas del libro (ADR-344). */
  const { visibles: filasEnPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(visible);
  const enProceso = useMemo(
    () => (section === "produccion" ? entries.filter((e) => e.status === "registrado" && e.quantity == null) : []),
    [entries, section],
  );
  /** La corrida del panel, releída de la lista: si ya se declaró, desaparece. */
  const corridaAbierta = useMemo(
    () => enProceso.find((e) => e.id === corridaAbiertaId) ?? null,
    [enProceso, corridaAbiertaId],
  );
  /**
   * Las piezas que ESA corrida se comió (ADR-326). Salen del mismo patio que
   * alimenta los lotes —`trozasDelPatio` trae también las consumidas— así que no
   * hay una segunda lectura de la misma madera que pueda decir otra cosa.
   */
  const trozasDeLaCorrida = useMemo(
    () => (corridaAbiertaId ? lotes.trozas.filter((t) => t.consumidaEnId === corridaAbiertaId) : []),
    [lotes.trozas, corridaAbiertaId],
  );
  /** El lote del que salió, si todavía existe: le da sus fechas al formulario. */
  const loteDeLaCorrida = useMemo(
    () =>
      corridaAbierta?.materiaPrimaRef
        ? (lotes.lotes.find((l) => l.code === corridaAbierta.materiaPrimaRef) ?? null)
        : null,
    [corridaAbierta, lotes.lotes],
  );
  /**
   * Lo que le quedó al lote de esa corrida: es lo único que todavía se elige.
   * Van las PIEZAS y no su cuenta — el panel las tilda una por una (ADR-364).
   */
  const restoDelLote = useMemo(() => {
    if (!loteDeLaCorrida || loteDeLaCorrida.status !== "abierto") return null;
    const libres = lotes.trozas.filter((t) => t.loteAserrioId === loteDeLaCorrida.id && !t.consumidaEnId);
    if (libres.length === 0) return null;
    return {
      loteId: loteDeLaCorrida.id,
      code: loteDeLaCorrida.code,
      trozas: libres,
      volumenM3: Math.round(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    };
  }, [loteDeLaCorrida, lotes.trozas]);
  /* «Producir este lote» abre el panel del lote, no un formulario en blanco: es
     el mismo camino que elegirlo desde el CTA (ADR-349). */
  useEffect(() => {
    if (!presetLoteAserrioId) return;
    setLoteProd(presetLoteAserrioId);
    /* Y se cierra el panel de la corrida: los dos se dibujan en el mismo lugar
       y llegar desde Lotes con uno abierto apilaba dos tablas de trozas. */
    setCorridaAbiertaId(null);
    onPresetUsado?.();
  }, [presetLoteAserrioId, onPresetUsado]);
  const [showSim, setShowSim] = useState(false);
  /** Cada incremento abre el menú de lotes (lo dispara la tecla `N`). */
  const [abrirLotes, setAbrirLotes] = useState(0);
  /** Ídem para el de corridas sin declarar: lo dispara su KPI. */
  const [abrirDeclarar, setAbrirDeclarar] = useState(0);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [pending, setPending] = useState(false);
  const [toProductId, setToProductId] = useState<string | null>(null);
  const [toProductMsg, setToProductMsg] = useState<string | null>(null);
  // Cadena de custodia (solo despacho): trazabilidad + COGS + certificado.
  const [chainEntry, setChainEntry] = useState<CtpEntry | null>(null);
  // Filtro por estado (chips, como Ingresos) + orden por columna, client-side
  // sobre el set completo del período (search es server-side, sin paginación).
  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    setPending(true);
    try {
      const r = await fetch("/api/admin/forestal/ctp", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ id: annulId, action: "annul", reason: annulReason.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); setAnnulReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  }

  async function sendToInventory(entryId: string) {
    setToProductId(entryId);
    setToProductMsg(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/to-product", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ entryId }),
      });
      const json: { ok?: boolean; message?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setToProductMsg(json.message ?? "Creado como borrador en inventario.");
    } catch (e) {
      setToProductMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToProductId(null);
    }
  }


  /**
   * Atajos de la vista, los mismos que en Ingresos para no tener que aprender
   * dos teclados: `N` abre el alta, `/` va al buscador, `R` recarga. Se apagan
   * mientras se escribe, con modal abierto y con cualquier modificador (Ctrl+N
   * del navegador no se toca).
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (showForm || showSim || anexoEntry || chainEntry || verBandeja || annulId) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        /* En Producción `N` abre el MISMO menú de lotes que el CTA: si abriera
           otra cosa, serían dos caminos para el mismo acto. */
        if (section === "produccion") setAbrirLotes((n) => n + 1);
        else setShowForm(true);
      } else if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById(`ctp-search-${section}`)?.focus();
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, load, showForm, showSim, anexoEntry, chainEntry, verBandeja, annulId]);

  /** Opciones de los selectores: salen de lo cargado, no de un catálogo. */
  /** Descarga lo filtrado, con las columnas de la sección. */
  function descargarCsv() {
    const csv = seccionACsv(section, visible);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion(section, period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    pushToast({
      tono: "success",
      msg: `${visible.length} ${visible.length === 1 ? "línea descargada" : "líneas descargadas"}`,
      detail: "Se abre en Excel con las columnas ya separadas.",
    });
  }

  const toggleSort = (by: SortKey) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "desc" }));

  /**
   * Los tres menús de la barra (ADR-360). Su contenido vive en
   * `ctp-entries-acciones`: son configuración —qué se ofrece, con qué
   * explicación y con qué cifra— y acá sólo se les atan los estados.
   *
   * La barra llegó a tener nueve controles en un renglón —buscar, filtros,
   * descargar, recargar, simular, parte de turno, dos selectores y el CTA— y a
   * 1280px envolvía a tres filas.
   */
  const opcionesMenu = useMemo(
    () =>
      accionesDeSeccion({
        section,
        visibles: visible.length,
        cargando: loading,
        totalAnexos,
        onDescargar: descargarCsv,
        onRecargar: () => void load(),
        onSimular: () => setShowSim(true),
        onParteDeTurno: () => setImportarParte(true),
        onAnexos: () => setVerBandeja(true),
      }),
    // `descargarCsv` se redefine en cada render (cierra sobre `visible`): lo que
    // realmente cambia el menú es la sección, lo filtrado y lo que está en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, visible.length, loading, totalAnexos, load],
  );

  const lotesMenu = useMemo(
    () =>
      accionesDeLotes({
        lotes: lotesConMadera,
        loteAbierto: loteProd,
        /* Volver a elegir el lote abierto cierra su panel: el mismo gesto que
           lo abrió, que es lo que se espera de una opción marcada. */
        onElegir: (id) =>
          setLoteProd((actual) => {
            /* Dos paneles distintos sobre la misma tabla se pisarían: abrir uno
               cierra el otro. */
            if (actual !== id) setCorridaAbiertaId(null);
            return actual === id ? "" : id;
          }),
        onIr,
      }),
    [lotesConMadera, loteProd, onIr],
  );

  const declararMenu = useMemo(
    () =>
      accionesPorDeclarar(
        enProceso,
        (c) =>
          setCorridaAbiertaId((actual) => {
            if (actual !== c.id) setLoteProd("");
            return actual === c.id ? null : c.id;
          }),
        corridaAbiertaId,
      ),
    [enProceso, corridaAbiertaId],
  );
  const Icon = meta.icon;
  return (
    <div className="space-y-3">
      {/* Ocho KPIs y no tres (`CtpSeccionKpis`): los m³ de materia prima eran el
          subtítulo de otra tarjeta, y merma, stock en planta, corridas sin
          declarar y materia prima sin origen no estaban en ningún lado. */}
      <CtpSeccionKpis
        section={section}
        kpis={kpis}
        soloVigentes={statusFilter === "registrado"}
        onSoloVigentes={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))}
        sinAnexo={sinAnexo}
        soloSinAnexo={soloSinAnexo}
        onSoloSinAnexo={() => setSoloSinAnexo((v) => !v)}
        /* La deuda lleva a resolverla: la tarjeta abre el mismo menú del botón. */
        onVerPendientes={() => setAbrirDeclarar((n) => n + 1)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <label htmlFor={`ctp-search-${section}`} className="sr-only">Buscar en {meta.label}</label>
          <input id={`ctp-search-${section}`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por especie, producto o GTF..." className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        {/* Tres controles y no nueve (ADR-360): filtrar, el resto plegado en
            «Opciones», y el CTA. Lo pendiente —declarar una corrida abierta—
            tiene su propio botón porque es deuda del libro, no una opción. */}
        <div className="flex items-center gap-2">
          <BotonFiltros activos={activos} abierto={abierto} panelId={panelId} onToggle={alternar} />
          <ActionMenu
            label="Opciones"
            title="Descargar, recargar y las tareas del período"
            actions={opcionesMenu}
            size="md"
            compactoEnMovil
          />
          {section === "produccion" && declararMenu.length > 0 && (
            <ActionMenu
              label="Corridas sin declarar"
              title="Corridas que ya consumieron su madera y todavía no dijeron qué salió de la sierra (ADR-340). No es por acá que se produce un lote."
              actions={declararMenu}
              badge={declararMenu.length}
              variant="accent"
              icon={Boxes}
              size="md"
              compactoEnMovil
              abrirSignal={abrirDeclarar}
            />
          )}
          {section === "produccion" ? (
            <ActionMenu
              label={meta.cta}
              title="Elegí el lote: abajo salen sus trozas para tildar cuáles entran a la sierra (atajo: N)"
              actions={lotesMenu}
              icon={Boxes}
              variant="primary"
              size="md"
              className="max-sm:flex-1"
              abrirSignal={abrirLotes}
              vacio="No hay lotes abiertos con madera. Armá uno en la pestaña Lotes."
            />
          ) : (
            <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110 sm:flex-none">
              <Plus className="h-5 w-5" /> {meta.cta}
            </button>
          )}
        </div>
      </div>
      {showSim && section === "produccion" && <CtpSimuladorModal onClose={() => setShowSim(false)} />}

      {/* La corrida que ya consumió, con SUS TROZAS arriba de la tabla del
          libro: se elige en «Corridas sin declarar» y hasta ahora abría un
          formulario en blanco, sin mostrar la madera contra la que se declara. */}
      {section === "produccion" && corridaAbierta && (
        <CtpCorridaSinDeclarar
          corrida={corridaAbierta}
          trozas={trozasDeLaCorrida}
          lote={loteDeLaCorrida}
          resto={restoDelLote}
          cargando={lotes.cargando}
          /* Lo que todavía se ELIGE es lo que le queda al lote: el atajo cierra
             esta corrida y abre el panel donde se tildan sus trozas. */
          onProducirResto={(loteId) => { setCorridaAbiertaId(null); setLoteProd(loteId); }}
          onCerrar={() => setCorridaAbiertaId(null)}
          /* Sumar piezas engorda la corrida pero NO la cierra: se recarga la
             tabla (su volumen consumido cambió) y el panel se queda abierto
             para declarar lo que salga (ADR-364). */
          onSumarPiezas={({ loteId, trozaIds }) =>
            lotes.sumarACorrida({ loteId, corridaId: corridaAbierta.id, trozaIds })
          }
          onQuitarPiezas={({ trozaIds }) =>
            lotes.quitarDeCorrida({ corridaId: corridaAbierta.id, trozaIds })
          }
          onAviso={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            void load();
          }}
          onListo={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            setCorridaAbiertaId(null);
            void load();
          }}
          onError={(msg) => {
            pushToast({ tono: "warning", msg: "La producción no se pudo declarar", detail: msg });
            void load();
          }}
        />
      )}

      {/* El bloque de Producción con la forma del LO-CTP: la barra (lote, fecha
          de consumo, registrar) y debajo la lista de trozas de ESE lote para
          elegir cuáles entran a la sierra. Se muestra apenas hay un lote
          abierto — sin él no hay nada que producir. */}
      {section === "produccion" && !loteElegido && !corridaAbierta && lotesConMadera.length > 0 && (
        <CtpLotesParaProducir
          lotes={lotesConMadera}
          cargando={lotes.cargando}
          elegido={loteProd}
          onElegir={(id) => setLoteProd((actual) => (actual === id ? "" : id))}
          onIrALotes={onIr ? () => onIr("lotes") : undefined}
        />
      )}
      {section === "produccion" && !loteElegido && !corridaAbierta && lotesConMadera.length === 0 && (
        <CtpLotesParaProducir
          lotes={[]}
          cargando={lotes.cargando}
          elegido=""
          onElegir={() => {}}
          onIrALotes={onIr ? () => onIr("lotes") : undefined}
        />
      )}

      {section === "produccion" && loteElegido && (
        <CtpProduccionDeLote
          lote={loteElegido}
          lotes={lotesConMadera.map((x) => x.lote)}
          onLote={setLoteProd}
          estado={lotes}
          onCerrar={() => setLoteProd("")}
          onListo={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            setLoteProd("");
            void load();
          }}
          onError={(msg) => {
            /* Toast y no cartel: si el consumo salió y la declaración no, este
               bloque se desmonta —el lote ya no está abierto— y el aviso se iría
               con él. */
            pushToast({ tono: "warning", msg: "La producción no se pudo declarar", detail: msg });
            void load();
          }}
        />
      )}

      {/* Filtro por estado (chips, consistente con Ingresos): oculta anulados de un clic. */}
      {statusCounts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <EntryChip label="Todos" count={statusCounts.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          {section === "despacho" && sinAnexo > 0 && (
            <EntryChip
              label="Sin anexo 04"
              count={sinAnexo}
              active={soloSinAnexo}
              tone="muted"
              onClick={() => setSoloSinAnexo((v) => !v)}
            />
          )}
          <EntryChip label="Registrados" count={statusCounts.registrado} active={statusFilter === "registrado"} onClick={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))} />
          {statusCounts.anulado > 0 && (
            <EntryChip label="Anulados" count={statusCounts.anulado} active={statusFilter === "anulado"} tone="muted" onClick={() => setStatusFilter((f) => (f === "anulado" ? "" : "anulado"))} />
          )}
        </div>
      )}

      {abierto && (
        <CtpFiltrosPanel
          id={panelId}
          activos={activos}
          selects={[
            { id: "species", label: "Especie", value: facetas.species ?? "", options: opciones.species },
            { id: "product", label: "Producto", value: facetas.product ?? "", options: opciones.products },
            ...(section === "despacho"
              ? [{ id: "destino", label: "Destino", value: facetas.destino ?? "", options: opciones.destinos }]
              : []),
          ]}
          toggles={[{ id: "cites", label: "CITES", on: facetas.cites === true }]}
          onSelect={(id, valor) => setFacetas((f) => ({ ...f, [id]: valor || undefined }))}
          onToggle={() => setFacetas((f) => ({ ...f, cites: f.cites === true ? undefined : true }))}
          onLimpiar={() => setFacetas({})}
        />
      )}

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {toProductMsg && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border-2 p-4 text-sm ${toProductMsg.startsWith("Error") ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"}`}>
          <div className="flex items-start gap-2"><PackagePlus className="mt-0.5 h-5 w-5 shrink-0" /><span>{toProductMsg}</span></div>
          <button type="button" onClick={() => setToProductMsg(null)} className="shrink-0 text-xs font-bold underline opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      )}

      {/* Las filas viven aparte (CtpEntriesTabla): acá quedan el estado, los
          KPIs, los filtros y los modales. */}
      <CtpEntriesTabla
        section={section}
        visible={filasEnPagina}
        sort={sort}
        onSort={toggleSort}
        conAnexo={conAnexo}
        toProductId={toProductId}
        onChain={setChainEntry}
        onAnexo={setAnexoEntry}
        onSendInventory={sendToInventory}
        onAnnul={(id) => { setAnnulId(id); setAnnulReason(""); }}
        totalesVista={totalesVista}
      />

      {visible.length > 0 && (
        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo={section === "produccion" ? "corrida" : "despacho"}
          plural={section === "produccion" ? "corridas" : "despachos"}
        />
      )}

      {/* Filtro activo sin resultados (pero sí hay datos): distinto de "sin datos". */}
      {!loading && entries.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          Ninguna línea {statusFilter === "anulado" ? "anulada" : statusFilter === "registrado" ? "registrada" : ""} en {period.label}.
        </div>
      )}

      {/* ── Estados compartidos (vacío / cargando) ── */}
      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <Icon className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">{search.trim() ? "Ninguna línea coincide con la búsqueda." : meta.empty}</p>
          {!search.trim() && period.from && (
            <p className="mt-1 text-sm">Mostrando {period.label} — puede haber líneas fuera de este período.</p>
          )}
        </div>
      )}
      {loading && <TablaSkeleton filas={4} columnas={section === "produccion" ? 8 : 9} />}

      {importarParte && (
        <CtpProduccionImportModal
          onListo={() => { void load(); }}
          onClose={() => setImportarParte(false)}
        />
      )}
      {/* Sólo Despacho: la producción se registra desde el lote (ADR-349) y el
          formulario en blanco pedía a mano lo que el lote ya sabe.
          El alta es la GUÍA completa (ADR-362): sus datos y su lista de
          productos, que se convierte en una línea del libro por producto. */}
      {showForm && section === "despacho" && (
        <CtpDespachoGuiaModal
          presetProducto={productoDelStock?.producto ?? null}
          presetEspecie={productoDelStock?.especie ?? null}
          onClose={() => { setShowForm(false); setProductoDelStock(null); }}
          onSaved={({ lineas, offline }) => {
            setShowForm(false);
            setProductoDelStock(null);
            void load();
            if (offline) {
              pushToast({
                tono: "warning",
                msg: "Sin señal: quedó anotado en el patio",
                detail: `${lineas} producto${lineas === 1 ? "" : "s"} todavía NO están en el libro. Suben solos cuando vuelva la conexión.`,
              });
            } else {
              pushToast({
                tono: "success",
                msg: `Guía registrada · ${lineas} ${lineas === 1 ? "línea" : "líneas"}`,
                detail: "Ya se puede emitir el anexo 04 y el certificado desde la ficha del despacho.",
              });
            }
          }}
        />
      )}
      {verBandeja && (
        <Anexo04Modal
          rows={[]}
          abrirHistorial
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => { setVerBandeja(false); cargarAnexos(); }}
        />
      )}

      {anexoEntry && (
        <Anexo04Modal
          rows={[]}
          especieGlobal={anexoEntry.speciesCommon ?? undefined}
          ctpEntryId={anexoEntry.id}
          declarado={{ cantidad: Number(anexoEntry.quantity ?? 0), unidad: anexoEntry.unit, piezas: anexoEntry.pieces }}
          // El anexo y la guía son los dos papeles del mismo camión: se miran
          // en el mismo modal en vez de en dos pantallas.
          despacho={anexoEntry.section === "despacho" ? anexoEntry : undefined}
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => { setAnexoEntry(null); cargarAnexos(); }}
        />
      )}

      <ActionToasts toasts={toasts} onDismiss={dismissToast} />

      {/* Al cerrar se recarga: en la ficha se emite la GTF y se edita la atribución,
          y sin esto la fila seguía mostrando el número y el origen viejos. */}
      {chainEntry && section === "despacho" && (
        <CtpDespachoDetalleModal entry={chainEntry} onClose={() => { setChainEntry(null); void load(); }} />
      )}
      {chainEntry && section === "produccion" && <CtpProduccionDetalleModal entry={chainEntry} onClose={() => setChainEntry(null)} />}

      {annulId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAnnulId(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Anular línea</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Indicá el motivo (queda en el historial, no se borra).</p>
            <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (min 3 caracteres)" className="mt-3 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm outline-none focus:border-[var(--data-error-500)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3 || pending} onClick={annul} className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirmar anulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Celda de rendimiento con alerta de sobre-declaración vs. el referencial SERFOR. */

/** Encabezado de columna ordenable: click alterna asc/desc; indica el estado con flecha. */

/** Chip de filtro por estado (mismo lenguaje que los de Ingresos). */
function EntryChip({ label, count, active, onClick, tone = "accent" }: {
  label: string; count: number; active: boolean; onClick: () => void; tone?: "accent" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${
        active
          ? tone === "muted"
            ? "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${active ? "bg-[var(--surface-raised)]/70" : "bg-[var(--surface-sunken)]"}`}>{count}</span>
    </button>
  );
}
