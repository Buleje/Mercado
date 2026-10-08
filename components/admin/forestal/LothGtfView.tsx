"use client";

/**
 * LothGtfView — Guías de Transporte Forestal (GTF), ADR-126 Fase 4.
 * Emite GTF con lista de trozas + datos de transporte, e imprime el documento.
 * Interna, no oficial (la GTF oficial se emite vía SNIFFS).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Loader2, Search, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ingresarGtfAlCtp } from "./LothGtfCtp";
import {
  BotonColumnasVisibles,
  BotonRestablecerColumnas,
  useOrdenColumnas,
  useVisibilidadColumnas,
} from "@/components/admin/shared/columnas-ordenables";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import LothDespachoGuiaModal from "./LothDespachoGuiaModal";
import type { PlanDeLaGuia } from "@/lib/forestal/gtf-columnas";
import LothGtfTabla from "./LothGtfTabla";
import LothGtfBajas from "./LothGtfBajas";
import CtpApartados, { CtpApartadoPanel } from "./ctp-apartados";
import { useGtfBajas } from "./hooks/use-gtf-bajas";
import { COLUMNAS_GTF, ORDEN_GTF_DEFECTO } from "./gtf-tabla-columnas";
import { useSeleccionGuias } from "./hooks/use-seleccion-guias";
import LothGtfSeleccionBarra from "./LothGtfSeleccionBarra";
import LothGtfForm from "./LothGtfForm";
import AnularGtfForm, { anularGtf } from "./LothGtfAnular";
import { useLothGtfLista } from "./hooks/use-loth-gtf-lista";
import { usePapelesGtf } from "./hooks/use-papeles-gtf";
import { useLothGtfKpis } from "./hooks/use-loth-gtf-kpis";
import LothGtfCabecera from "./LothGtfCabecera";
import { AvisoFocoAusente, AvisoGuiasSinEmitir } from "./LothGtfAvisos";

/* Las columnas, su autofiltro y sus celdas viven en `gtf-tabla-columnas`; la tabla, en `LothGtfTabla` (07-10).
   Salieron de acá el 08-10: el formulario «Anotar una guía» (`LothGtfForm`), la anulación
   (`LothGtfAnular`), la carga (`use-loth-gtf-lista`), los papeles y el resumen interno
   (`use-papeles-gtf`), las fichas (`use-loth-gtf-kpis`), la cabecera y los avisos. */
type PlanDeLaGuiaConId = PlanDeLaGuia & { id: string };
const SIN_PLANES: readonly PlanDeLaGuiaConId[] = [];

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
  const [showForm, setShowForm] = useState(false);
  /** «Despachar con guía»: la guía completa con sus líneas de despacho. */
  const [showDespacho, setShowDespacho] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  // Cada columna lleva su autofiltro en el `<th>` (LothGtfTabla, 07-10). El
  // buscador de texto es lo único que no es una columna sola y se queda arriba.
  const [busqueda, setBusqueda] = useState("");

  /* El permiso del libro (02-10): con uno elegido, la lista trae sólo sus guías (filtro en el servidor). */
  const permiso = useLothPermiso();
  const permisoListo = permiso?.listo ?? true;
  const permisoQuery = permiso?.query ?? "";
  /* «Guías» (vigentes) y «Anuladas y otras» (Brandon 07-10): la anulada ya no
     comparte tabla con las vigentes. Las bajas (anuladas + borradas) las trae
     `?estado=bajas`; `escrituras` sube tras anular o deshacer desde esta vista. */
  const [seccion, setSeccion] = useState<"guias" | "bajas">("guias");
  const [escrituras, setEscrituras] = useState(0);
  const bajas = useGtfBajas(permisoListo, permisoQuery, (reloadSignal ?? 0) + escrituras);
  const tras = () => setEscrituras((n) => n + 1);
  const { gtfs, loading, error, setError, sinIngresar, declaradasSinEmitir, despachosPorGuia, load } = useLothGtfLista(permisoListo, permisoQuery, reloadSignal);
  /* La hoja SERFOR, la de casilleros y el «resumen interno» (R1-R4), en el mismo visor. */
  const papeles = usePapelesGtf();

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

  /**
   * Anular no borra: deja la guía visible con su motivo. Por eso el motivo es
   * obligatorio y se pide en un modal, no en un input de 8rem dentro de la celda
   * (donde no entraba una razón de verdad y se perdía al hacer scroll).
   * Devuelve el «no» del Libro CTP (la guía ya entró allá) para el modal, o null.
   */
  async function annul(id: string, reason: string, conDespachos: boolean): Promise<string | null> {
    const r = await anularGtf(id, reason, conDespachos);
    if (r.bloqueo) return r.bloqueo;
    setAnnulId(null); tras();
    /* El error va DESPUÉS de recargar: `load` lo limpia al empezar y el «no se pudo anular» no se veía. */
    await load();
    if (r.error) setError(r.error);
    return null;
  }

  const gtfAnular = annulId ? gtfs.find((g) => g.id === annulId) ?? null : null;

  /* Se llegó buscando una guía que no está emitida acá (`AvisoFocoAusente`). */
  const focoAusente = !!focusGtf && !loading && !bajas.cargando
    && !gtfs.some((g) => g.gtfNumber === focusGtf) && !bajas.bajas.some((g) => g.gtfNumber === focusGtf);
  /* Se llegó buscando una guía que está anulada: se abre «Anuladas y otras». */
  const vigentes = useMemo(() => gtfs.filter((g) => g.status !== "anulada"), [gtfs]);
  /* Tildadas para un trámite (07-10): vigentes y anuladas; una borrada no se declara. */
  const seleccion = useSeleccionGuias();
  const elegidas = useMemo(
    () => [...vigentes, ...bajas.bajas.filter((g) => !g.deletedAt)].filter((g) => seleccion.ids.has(g.id)),
    [vigentes, bajas.bajas, seleccion.ids],
  );
  useEffect(() => {
    if (!focusGtf || loading || bajas.cargando) return;
    if (!vigentes.some((g) => g.gtfNumber === focusGtf) && bajas.bajas.some((g) => g.gtfNumber === focusGtf)) setSeccion("bajas");
  }, [focusGtf, loading, vigentes, bajas.cargando, bajas.bajas]);

  const orden = useOrdenColumnas("loth-gtf", ORDEN_GTF_DEFECTO);
  /* Ocultar y mostrar columnas (Brandon 07-10), recordado en este navegador. */
  const columnasVisibles = useVisibilidadColumnas("loth-gtf", COLUMNAS_GTF);
  /* Las cuatro fichas se pliegan (Brandon 05-10); cerradas dicen lo esencial en el botón. */
  const kpis = useLothGtfKpis({ vigentes, bajas: bajas.bajas.length, sinIngresar, sinFichas: loading || gtfs.length === 0 });

  return (
    <div className="space-y-5">
      <LothGtfCabecera
        botonIndicadores={!loading && gtfs.length > 0 && kpis.boton}
        onImportarGuias={onImportarGuias}
        onAnotar={() => setShowForm(true)}
        onDespachar={() => setShowDespacho(true)}
      />

      <AvisoGuiasSinEmitir numeros={declaradasSinEmitir} onEmitir={() => setShowForm(true)} />

      {/* Buscar: Tipo y Estado son columnas de la tabla, se filtran desde su
          propio <th> más abajo. */}
      {/* Dos pestañas: las vigentes y las dadas de baja (anuladas + borradas). */}
      {!loading && (gtfs.length > 0 || bajas.bajas.length > 0) && (
        <CtpApartados
          apartados={[
            { id: "guias", label: "Guías", contador: vigentes.length, unidad: vigentes.length === 1 ? "vigente" : "vigentes" },
            { id: "bajas", label: "Anuladas y otras", contador: bajas.cargando ? "…" : bajas.bajas.length, hint: "Las guías anuladas y las eliminadas, sólo para consulta" },
          ]}
          activo={seccion}
          onIr={(id) => setSeccion(id === "bajas" ? "bajas" : "guias")}
          idBase="loth-gtf-seccion"
          etiqueta="Guías vigentes o dadas de baja"
        />
      )}

      {!loading && gtfs.length > 0 && seccion === "guias" && (
        <div className="flex flex-wrap items-center gap-2">
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
          <BotonColumnasVisibles vis={columnasVisibles} />
          <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} />
        </div>
      )}

      {focoAusente && focusGtf && <AvisoFocoAusente gtfNumber={focusGtf} />}

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
        {showForm && <LothGtfForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}
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
      {papeles.visor}

      {loading && <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

      {!loading && seccion === "guias" && (
        <CtpApartadoPanel idBase="loth-gtf-seccion" id="guias">
          <LothGtfTabla
            gtfs={vigentes}
            planes={permiso?.planes ?? SIN_PLANES}
            busqueda={busqueda}
            sinIngresar={sinIngresar}
            focusGtf={focusGtf}
            filaEnfocada={filaEnfocada}
            orden={orden}
            vis={columnasVisibles}
            onIngresarCtp={ingresarGtfAlCtp}
            onHoja={papeles.imprimir}
            onResumen={papeles.resumen}
            onAnular={setAnnulId}
            onRecargar={() => { void load(); tras(); }}
            seleccion={seleccion}
          />
        </CtpApartadoPanel>
      )}
      {!loading && seccion === "bajas" && (
        <CtpApartadoPanel idBase="loth-gtf-seccion" id="bajas">
          <LothGtfBajas
            bajas={bajas.bajas}
            cargando={bajas.cargando}
            error={bajas.error}
            focusGtf={focusGtf}
            onReintentar={bajas.recargar}
            onHoja={papeles.imprimir}
            onResumen={papeles.resumen}
            seleccion={seleccion}
          />
        </CtpApartadoPanel>
      )}
      <LothGtfSeleccionBarra elegidas={elegidas} onLimpiar={seleccion.limpiar} />
    </div>
  );
}
