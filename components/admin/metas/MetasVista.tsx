"use client";

/**
 * MetasVista — la vista «Metas» de Metas y logros (ADR-488): la dueña de
 * CREAR y SEGUIR metas de todas las áreas del negocio.
 *
 * Auditoría 10-10 (Brandon: «cada pestaña cumple su tarea, sin repeticiones;
 * compactar, los botones en la misma fila»):
 *  · Una fila de cabecera: «x de y cumplidas» · ⓘ · Indicadores · Plantillas ·
 *    Nueva meta · volver a medir. Antes eran tres filas (chips + área + botón,
 *    «Resumen», y un título por área).
 *  · Sin título por área: repetía el badge de cada tarjeta. Las áreas son
 *    chips de filtro (como en Logros) y las tarjetas van en UNA grilla, lo que
 *    pide atención primero (pasada del tope, atrasada…).
 *  · Las 21 plantillas en un menú (antes 8 chips + «Ver las 21» + una opción
 *    de «Más acciones» que abría el mismo panel).
 *  · Lo nuevo: la vara del período anterior entero en cada tarjeta y en el
 *    modal (sugerencias de objetivo), y el objetivo se toca para ajustarlo.
 * Hoy sigue la meta del día hora a hora y Calendario la del mes día a día: sus
 * tarjetas llevan ahí.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Plus, RefreshCw, Target } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useMetas } from "@/hooks/use-metas";
import { AREAS_META, areaDe, type AreaMeta } from "@/lib/admin/metas-catalogo";
import { PERIODOS_META, type MetaDTO, type PeriodoMeta } from "@/lib/admin/metas-tareas";
import { cn } from "@/lib/utils";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CAMPO, PRIORIDAD_ESTADO, TEXTO_TONO, claseChip } from "./clases-meta";
import { useIndicadoresMetas } from "./IndicadoresMetas";
import { ModalMeta } from "./ModalMeta";
import { MenuPlantillas, PlantillasDestacadas, type PresetMeta } from "./PlantillasMeta";
import { TarjetaMeta } from "./TarjetaMeta";
import { button } from "@/components/ui-system/button-variants";

const BOTON_ICONO =
  button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });
const ENLACE = "inline-flex min-h-12 items-center font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]";

type FiltroPeriodo = PeriodoMeta | "todas";
/** «Día», no «Hoy»: justo arriba está la pestaña «Hoy» y dos «Hoy» llevaban a lugares distintos. */
const PERIODO_FILTRO: Readonly<Record<PeriodoMeta, string>> = {
  diario: "Día",
  semanal: "Semana",
  mensual: "Mes",
  trimestral: "Trimestre",
  anual: "Año",
};
type FiltroArea = AreaMeta | "todas";
interface EstadoModal {
  abierto: boolean;
  meta?: MetaDTO;
  preset?: PresetMeta;
  enfocar?: "objetivo";
}
const ORDEN_AREA = new Map(AREAS_META.map((a, i) => [a.id, i]));
/** El chip dice el nombre corto (el largo va en el tooltip): con los largos, 5 áreas no entraban a 1280. */
const CORTO: Partial<Record<AreaMeta, string>> = { caja: "Caja", compras: "Compras", forestal: "Aserradero", bosque: "Bosque" };

export default function MetasVista() {
  const { metas, avances, hoy, cargando, error, avanceCaido, recargar, borrar } = useMetas({ conAnterior: true });
  const { confirm } = useConfirm();
  const [periodo, setPeriodo] = useState<FiltroPeriodo>("todas");
  const [area, setArea] = useState<FiltroArea>("todas");
  const [modal, setModal] = useState<EstadoModal>({ abierto: false });

  const delPeriodo = useMemo(() => metas.filter((m) => periodo === "todas" || m.period === periodo), [metas, periodo]);
  const filtradas = useMemo(() => delPeriodo.filter((m) => area === "todas" || areaDe(m.category).id === area), [delPeriodo, area]);
  /* Lo que pide atención primero (pasada del tope, atrasada…); a igual estado, el orden de las áreas. */
  const ordenadas = useMemo(() => {
    const prioridad = (m: MetaDTO) => PRIORIDAD_ESTADO[avances.get(m.id)?.estado ?? "sin_dato"];
    const orden = (m: MetaDTO) => ORDEN_AREA.get(areaDe(m.category).id) ?? 99;
    return [...filtradas].sort((x, y) => prioridad(x) - prioridad(y) || orden(x) - orden(y));
  }, [filtradas, avances]);
  /* Un filtro que no separa nada es ruido: chips sólo con 2+ áreas, período sólo con 2+ períodos (el elegido queda, para volver). */
  const areas = useMemo(
    () =>
      AREAS_META.map((a) => {
        const suyas = delPeriodo.filter((m) => areaDe(m.category).id === a.id);
        return { a, total: suyas.length, cumplidas: suyas.filter((m) => avances.get(m.id)?.estado === "cumplida").length };
      }).filter((x) => x.total > 0 || x.a.id === area),
    [delPeriodo, avances, area],
  );
  const periodos = useMemo(() => {
    const delArea = metas.filter((m) => area === "todas" || areaDe(m.category).id === area);
    return PERIODOS_META.map((p) => ({ p, n: delArea.filter((m) => m.period === p).length })).filter((x) => x.n > 0 || x.p === periodo);
  }, [metas, area, periodo]);
  const cumplidas = filtradas.filter((m) => avances.get(m.id)?.estado === "cumplida").length;
  const indicadores = useIndicadoresMetas({ metas: filtradas, avances, listo: !cargando });

  const abrirNueva = (preset?: PresetMeta) => setModal({ abierto: true, preset });
  const editar = (meta: MetaDTO) => setModal({ abierto: true, meta });
  const ajustar = (meta: MetaDTO) => setModal({ abierto: true, meta, enfocar: "objetivo" });
  const pedirBorrar = async (meta: MetaDTO) => {
    // El ⋯ de la tarjeta (la tarjeta lo enfoca antes de pedir): la confirmación no devuelve el foco sola.
    const disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ok = await confirm({
      title: `¿Eliminar «${meta.name}»?`,
      description: "Se borra sólo la meta: tus ventas, compras y demás datos no cambian.",
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) {
      requestAnimationFrame(() => {
        if (disparador?.isConnected) disparador.focus({ preventScroll: true });
      });
      return;
    }
    const r = await borrar(meta.id);
    if (r.ok) toast.success("Meta eliminada");
    else toast.error(r.error ?? "No se pudo eliminar la meta.");
  };
  const verTodas = () => {
    setPeriodo("todas");
    setArea("todas");
  };

  const hayMetas = metas.length > 0;
  const titulo = cargando ? "Metas" : "Todavía no tienes metas";

  const cabecera = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Target aria-hidden="true" className="hidden h-5 w-5 shrink-0 text-[var(--accent-ink)] sm:block dark:text-[var(--accent)]" />
      <CardTitle className="text-sm font-bold tabular-nums">
        {hayMetas ? (
          <>
            {/* A 400 px «1/7» deja la cabecera en UNA fila con sus botones. */}
            <span className="sm:hidden">
              {cumplidas}/{filtradas.length}
            </span>
            <span className="max-sm:hidden">
              {cumplidas} de {filtradas.length}
            </span>{" "}
            cumplida{filtradas.length === 1 ? "" : "s"}
          </>
        ) : (
          titulo
        )}
      </CardTitle>
      <InfoTip
        title="Metas"
        what="Cada meta mide una parte del negocio con tus datos del período: el avance sale solo (salvo en la meta a mano). Arriba van las que piden atención; toca un área para ver sólo las suyas."
        body="La línea del reloj es el período anterior entero: la vara para saber si tu objetivo es realista. Toca el objetivo («de S/ 30,000») para ajustarlo con una sugerencia. Hoy sigue la meta del día hora a hora; Calendario, la del mes día a día; Logros, lo que ganaste."
        example="«Setiembre: S/ 24,100 · meta +24 %»: tu meta de octubre pide 24 % más de lo que vendiste en todo setiembre."
      />
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {hayMetas && indicadores.boton}
        {hayMetas && <MenuPlantillas onElegir={abrirNueva} />}
        <button
          type="button"
          onClick={() => abrirNueva()}
          aria-label="Nueva meta"
          className={cn(BOTON_PRIMARIO, "max-sm:w-12 max-sm:px-0")}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="max-sm:hidden">Nueva meta</span>
        </button>
        {/* A 400 px no entra en la fila: ahí se mide solo cada minuto y al volver a la pestaña. */}
        <button
          type="button"
          className={cn(BOTON_ICONO, "max-sm:hidden")}
          aria-label="Volver a medir"
          title="Volver a medir: lee tus datos sin esperar el minuto"
          disabled={cargando}
          onClick={() => void recargar(true)}
        >
          <RefreshCw aria-hidden="true" className={cn("h-4 w-4", cargando && "animate-spin motion-reduce:animate-none")} />
        </button>
      </span>
    </div>
  );

  /* Pegados a la grilla que filtran: áreas en chips (se desliza a 400 px) y el período al lado. */
  const filtros =
    hayMetas && (areas.length > 1 || periodos.length > 1) ? (
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:thin]">
        {areas.length > 1 && (
          <div role="group" aria-label="Metas por área" className="flex shrink-0 gap-1.5">
            <button type="button" aria-pressed={area === "todas"} className={claseChip(area === "todas")} onClick={() => setArea("todas")}>
              Todas
            </button>
            {areas.map(({ a, total, cumplidas: ok }) => {
              const Icono = a.icono;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={area === a.id}
                  aria-label={`${a.nombre}: ${ok} de ${total} cumplidas`}
                  title={a.nombre}
                  className={claseChip(area === a.id)}
                  style={{ "--area": a.color } as CSSProperties}
                  onClick={() => setArea(area === a.id ? "todas" : a.id)}
                >
                  <Icono aria-hidden="true" className="h-4 w-4 text-[var(--area)]" />
                  {CORTO[a.id] ?? a.nombre}
                  <span className="tabular-nums">
                    {ok}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {periodos.length > 1 && (
          <select
            aria-label="Período"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as FiltroPeriodo)}
            className={cn(CAMPO, "ml-auto h-12 w-auto shrink-0 font-semibold")}
          >
            <option value="todas">Período</option>
            {periodos.map(({ p, n }) => (
              <option key={p} value={p}>
                {PERIODO_FILTRO[p]} ({n})
              </option>
            ))}
          </select>
        )}
      </div>
    ) : null;

  let cuerpo: ReactNode;
  if (error) {
    cuerpo = (
      <p role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm font-semibold", TEXTO_TONO.error)}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {error}
        <button type="button" onClick={() => void recargar()} className={BOTON_SECUNDARIO}>
          Reintentar
        </button>
      </p>
    );
  } else if (cargando && !hayMetas) {
    cuerpo = (
      <div aria-busy="true" aria-label="Cargando tus metas" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-[var(--surface-sunken)] motion-reduce:animate-none" />
        ))}
      </div>
    );
  } else if (!hayMetas) {
    cuerpo = <PlantillasDestacadas onElegir={abrirNueva} />;
  } else {
    cuerpo = (
      <>
        {indicadores.panel}
        {avanceCaido && (
          <p className={cn("flex flex-wrap items-center gap-2 text-sm font-semibold", TEXTO_TONO.aviso)}>
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            No se pudo medir el avance ahora.
            <button type="button" onClick={() => void recargar(true)} className={ENLACE}>
              Reintentar
            </button>
          </p>
        )}
        {ordenadas.length === 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            No tienes metas con este filtro.
            <button type="button" onClick={verTodas} className={ENLACE}>
              Ver todas
            </button>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ordenadas.map((m) => (
              <TarjetaMeta
                key={m.id}
                meta={m}
                avance={avances.get(m.id)}
                hoy={hoy}
                onEditar={editar}
                onAjustar={ajustar}
                onBorrar={(x) => void pedirBorrar(x)}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div data-metas-vista className="space-y-3">
      {cabecera}
      {filtros}
      {cuerpo}
      <ModalMeta
        abierto={modal.abierto}
        meta={modal.meta}
        preset={modal.preset}
        enfocar={modal.enfocar}
        onCerrar={() => setModal((m) => ({ ...m, abierto: false }))}
        onGuardada={() => void recargar()}
      />
    </div>
  );
}
