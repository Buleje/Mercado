"use client";

/**
 * Las guías del Libro TH: «Guías» (vigentes) y «Anuladas y otras». Era el
 * cuerpo de `LothGtfView`; desde la compactación del 17-10 la vista es sólo el
 * armazón de pestañas (`?sub=`) y «Por imprimir» es la tercera.
 *
 * Las columnas, su autofiltro y sus celdas viven en `gtf-tabla-columnas`; la tabla, en `LothGtfTabla` (07-10).
 * Salieron de acá el 08-10: el formulario «Anotar una guía» (`LothGtfForm`), la anulación
 * (`LothGtfAnular`), la carga (`use-loth-gtf-lista`), los papeles y el resumen interno
 * (`use-papeles-gtf`), las fichas (`use-loth-gtf-kpis`), la cabecera y los avisos.
 * El buscador general se fue el 17-10: cada columna se filtra en su título.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Loader2, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useOrdenColumnas, useVisibilidadColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { PlanDeLaGuia } from "@/lib/forestal/gtf-columnas";
import { ingresarGtfAlCtp } from "./LothGtfCtp";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import LothDespachoGuiaModal from "./LothDespachoGuiaModal";
import LothGtfTabla from "./LothGtfTabla";
import LothGtfBajas from "./LothGtfBajas";
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
import AvisoRegistroAusente from "@/components/admin/shared/AvisoRegistroAusente";
import { useCorreccionesDeGuias } from "./hooks/use-correcciones-de-guias";
import { CorreccionesGuiasProvider } from "./correccion-guia/contexto";

type PlanDeLaGuiaConId = PlanDeLaGuia & { id: string };
const SIN_PLANES: readonly PlanDeLaGuiaConId[] = [];

export interface LothGtfGuiasProps {
  /** Guía a resaltar al entrar (se llega acá desde la trazabilidad por árbol). */
  focusGtf?: string | null;
  onFocusHandled?: () => void;
  /** El foco viene de ⌘K (`?gtf=`): si la guía no está, se dice «ya no existe» en vez del aviso de «Por árbol». */
  focoDeBusqueda?: boolean;
  /** «Importar guías despachadas» (ADR-461): el modal vive en el libro, que recarga todo al terminar. */
  onImportarGuias?: () => void;
  /** Sube tras cada escritura del libro (p. ej. guías importadas): la lista se vuelve a pedir. */
  reloadSignal?: number;
}

export default function LothGtfGuias({
  focusGtf,
  onFocusHandled,
  focoDeBusqueda = false,
  onImportarGuias,
  reloadSignal,
  seccion,
  onSeccion,
  onCuentas,
}: LothGtfGuiasProps & {
  /** «Guías» (vigentes) o «Anuladas y otras» (Brandon 07-10): la pestaña de la vista. */
  seccion: "guias" | "bajas";
  onSeccion: (s: "guias" | "bajas") => void;
  /** Cuántas vigentes y cuántas bajas, para la pestaña. */
  onCuentas?: (c: { guias: number; bajas: number }) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  /** «Despachar con guía»: la guía completa con sus líneas de despacho. */
  const [showDespacho, setShowDespacho] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);

  /* El permiso del libro (02-10): con uno elegido, la lista trae sólo sus guías (filtro en el servidor). */
  const permiso = useLothPermiso();
  const permisoListo = permiso?.listo ?? true;
  const permisoQuery = permiso?.query ?? "";
  /* La anulada ya no comparte tabla con las vigentes. Las bajas (anuladas +
     borradas) las trae `?estado=bajas`; `escrituras` sube tras anular o
     deshacer desde esta vista. */
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
  /* Buscada con ⌘K y ausente: el aviso dura lo que el de cualquier búsqueda y suelta el foco. */
  useEffect(() => {
    if (!focoDeBusqueda || !focoAusente) return;
    const t = setTimeout(() => onFocusHandled?.(), 5000);
    return () => clearTimeout(t);
  }, [focoDeBusqueda, focoAusente, onFocusHandled]);
  const vigentes = useMemo(() => gtfs.filter((g) => g.status !== "anulada"), [gtfs]);
  /* Tildadas para un trámite (07-10): vigentes y anuladas; una borrada no se declara. */
  const seleccion = useSeleccionGuias();
  const elegidas = useMemo(
    () => [...vigentes, ...bajas.bajas.filter((g) => !g.deletedAt)].filter((g) => seleccion.ids.has(g.id)),
    [vigentes, bajas.bajas, seleccion.ids],
  );
  /* Se llegó buscando una guía que está anulada: se abre «Anuladas y otras». */
  useEffect(() => {
    if (!focusGtf || loading || bajas.cargando) return;
    if (!vigentes.some((g) => g.gtfNumber === focusGtf) && bajas.bajas.some((g) => g.gtfNumber === focusGtf)) onSeccion("bajas");
  }, [focusGtf, loading, vigentes, bajas.cargando, bajas.bajas, onSeccion]);

  /* Al recargar, la pestaña conserva la cuenta anterior hasta tener la nueva (no parpadea). */
  const listas = !loading && !bajas.cargando;
  useEffect(() => {
    if (listas) onCuentas?.({ guias: vigentes.length, bajas: bajas.bajas.length });
  }, [listas, vigentes.length, bajas.bajas.length, onCuentas]);

  const orden = useOrdenColumnas("loth-gtf", ORDEN_GTF_DEFECTO);
  /* Ocultar y mostrar columnas (Brandon 07-10), recordado en este navegador. */
  const columnasVisibles = useVisibilidadColumnas("loth-gtf", COLUMNAS_GTF);
  /* Las cuatro fichas se pliegan (Brandon 05-10); cerradas dicen lo esencial en el botón (que va solo al riel). */
  const kpis = useLothGtfKpis({ vigentes, bajas: bajas.bajas.length, sinIngresar, sinFichas: loading || gtfs.length === 0 });
  const conTabla = !loading && gtfs.length > 0 && seccion === "guias";
  /* ADR-512: el estado de los pedidos de corrección de TODAS las filas, en una llamada. */
  const correcciones = useCorreccionesDeGuias("loth_gtf", conTabla);

  return (
    <div className="space-y-3">
      <LothGtfCabecera
        onImportarGuias={onImportarGuias}
        onAnotar={() => setShowForm(true)}
        onDespachar={() => setShowDespacho(true)}
        columnas={conTabla ? { vis: columnasVisibles, orden } : null}
      />

      <AvisoGuiasSinEmitir numeros={declaradasSinEmitir} onEmitir={() => setShowForm(true)} />

      {focoAusente && focusGtf && (focoDeBusqueda ? <AvisoRegistroAusente que="Esa GTF" /> : <AvisoFocoAusente gtfNumber={focusGtf} />)}

      {error && <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex h-12 items-center rounded-lg border-2 border-[var(--data-error-500)] px-3 text-xs font-bold hover:bg-[var(--data-error-100)]">Reintentar</button></div>}

      {/* «Indicadores» se va solo al riel del libro (fuera del libro, acá). */}
      {kpis.boton}
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
        {showForm && <LothGtfForm guias={gtfs} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}
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
        <CorreccionesGuiasProvider value={correcciones}>
        <LothGtfTabla
          gtfs={vigentes}
          planes={permiso?.planes ?? SIN_PLANES}
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
        </CorreccionesGuiasProvider>
      )}
      {!loading && seccion === "bajas" && (
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
      )}
      <LothGtfSeleccionBarra elegidas={elegidas} onLimpiar={seleccion.limpiar} />
    </div>
  );
}
