"use client";

/**
 * MetasVista — la vista «Metas» de Metas y logros (ADR-488).
 *
 * Una fila de cabecera (período · área · «Nueva meta» · menú), el resumen
 * plegable y las metas agrupadas por ÁREA: cada una dice a qué parte del
 * negocio pertenece y lleva a su módulo. El avance sale de los datos del
 * período (`useMetas`); acá no se suma nada.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, MoreHorizontal, Plus, RefreshCw, Sparkles, Target } from "@buleje/design-system/icons";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useMetas } from "@/hooks/use-metas";
import { AREAS_META, areaDe, type AreaMeta } from "@/lib/admin/metas-catalogo";
import { PERIODOS_META, type MetaDTO, type PeriodoMeta } from "@/lib/admin/metas-tareas";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CAMPO, PRIORIDAD_ESTADO, TEXTO_TONO, claseChip } from "./clases-meta";
import { GrupoArea } from "./GrupoArea";
import { ModalMeta } from "./ModalMeta";
import { PlantillasMeta, type PresetMeta } from "./PlantillasMeta";
import { ResumenMetas } from "./ResumenMetas";

type FiltroPeriodo = PeriodoMeta | "todas";
/**
 * El chip de las metas diarias dice «Día», no «Hoy»: justo arriba está la
 * pestaña «Hoy» (la meta del día hora a hora) y dos «Hoy» en la misma pantalla
 * llevaban a lugares distintos.
 */
const CHIP: Readonly<Record<PeriodoMeta, string>> = {
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
}

export default function MetasVista() {
  const { metas, avances, hoy, cargando, error, avanceCaido, recargar, borrar } = useMetas();
  const { confirm } = useConfirm();
  const [periodo, setPeriodo] = useState<FiltroPeriodo>("todas");
  const [area, setArea] = useState<FiltroArea>("todas");
  const [modal, setModal] = useState<EstadoModal>({ abierto: false });
  const [verPlantillas, setVerPlantillas] = useState(false);

  const delArea = useMemo(() => metas.filter((m) => area === "todas" || areaDe(m.category).id === area), [metas, area]);
  const filtradas = useMemo(() => delArea.filter((m) => periodo === "todas" || m.period === periodo), [delArea, periodo]);
  const grupos = useMemo(() => {
    const prioridad = (m: MetaDTO) => PRIORIDAD_ESTADO[avances.get(m.id)?.estado ?? "sin_dato"];
    return AREAS_META.map((a) => ({
      area: a,
      metas: filtradas.filter((m) => areaDe(m.category).id === a.id).sort((x, y) => prioridad(x) - prioridad(y)),
    })).filter((g) => g.metas.length > 0);
  }, [filtradas, avances]);
  /* Un filtro que no separa nada es ruido: sólo los períodos con metas, y el
     grupo entero sólo si hay más de uno (el elegido siempre queda, para volver). */
  const periodosConMetas = useMemo(
    () => PERIODOS_META.filter((p) => p === periodo || delArea.some((m) => m.period === p)),
    [delArea, periodo],
  );
  const verChips = periodo !== "todas" || periodosConMetas.length > 1;
  const areasConMetas = useMemo(() => new Set(metas.map((m) => areaDe(m.category).id)), [metas]);
  const verArea = area !== "todas" || areasConMetas.size > 1;
  const porArea = useMemo(() => {
    const cuenta = new Map<AreaMeta, number>();
    for (const m of metas) if (periodo === "todas" || m.period === periodo) cuenta.set(areaDe(m.category).id, (cuenta.get(areaDe(m.category).id) ?? 0) + 1);
    return cuenta;
  }, [metas, periodo]);

  const abrirNueva = (preset?: PresetMeta) => setModal({ abierto: true, preset });
  const editar = (meta: MetaDTO) => setModal({ abierto: true, meta });
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

  const cabecera = (
    <div className="flex flex-wrap items-center gap-2">
      {metas.length > 0 && verChips && (
      <div role="group" aria-label="Período" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5 max-sm:w-full">
        {(["todas", ...periodosConMetas] as const).map((p) => {
          const n = p === "todas" ? delArea.length : delArea.filter((m) => m.period === p).length;
          return (
            <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)} className={claseChip(periodo === p)}>
              {p === "todas" ? "Todas" : CHIP[p]}
              {n > 0 && <span className="tabular-nums text-xs opacity-75">{n}</span>}
            </button>
          );
        })}
      </div>
      )}
      <div className="ml-auto flex items-center gap-2 max-sm:w-full">
        {metas.length > 0 && verArea && (
        <select
          aria-label="Área"
          value={area}
          onChange={(e) => setArea(e.target.value as FiltroArea)}
          className={`${CAMPO} h-10 min-w-0 sm:w-48 max-sm:flex-1`}
        >
          <option value="todas">Todas las áreas</option>
          {AREAS_META.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {porArea.get(a.id) ? ` (${porArea.get(a.id)})` : ""}
            </option>
          ))}
        </select>
        )}
        <button type="button" onClick={() => abrirNueva()} className={`${BOTON_PRIMARIO} max-sm:flex-1`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva meta
        </button>
        <ActionMenu
          label="Más acciones de metas"
          title="Más acciones"
          icon={MoreHorizontal}
          soloIcono
          size="sm"
          actions={[
            {
              id: "actualizar",
              label: "Medir de nuevo",
              hint: "Vuelve a leer tus datos sin esperar el minuto",
              icon: RefreshCw,
              onSelect: () => void recargar(true),
            },
            {
              id: "plantillas",
              label: verPlantillas ? "Ocultar plantillas" : "Metas listas por área",
              hint: "Una meta sugerida para cada cosa que se puede medir",
              icon: Sparkles,
              onSelect: () => setVerPlantillas((v) => !v),
            },
          ]}
        />
      </div>
    </div>
  );

  let cuerpo: ReactNode;
  if (error) {
    cuerpo = (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <AlertTriangle className={`h-5 w-5 shrink-0 ${TEXTO_TONO.error}`} aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{error}</span>
        <button type="button" onClick={() => void recargar()} className={BOTON_SECUNDARIO}>
          Reintentar
        </button>
      </div>
    );
  } else if (cargando && metas.length === 0) {
    cuerpo = (
      <div aria-busy="true" aria-label="Cargando tus metas" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-[var(--surface-sunken)] motion-reduce:animate-none" />
        ))}
      </div>
    );
  } else if (metas.length === 0) {
    cuerpo = (
      <section aria-label="Metas para empezar" className="space-y-3 rounded-2xl border border-dashed border-[var(--rule-base)] p-4 sm:p-5">
        <p className="flex items-start gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
          Todavía no tienes metas. Elige una lista para empezar o crea la tuya: el avance sale solo de tus datos.
        </p>
        <PlantillasMeta onElegir={abrirNueva} area={area} />
      </section>
    );
  } else {
    cuerpo = (
      <>
        <ResumenMetas metas={filtradas} avances={avances} />
        {avanceCaido && (
          <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${TEXTO_TONO.aviso}`}>
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            No se pudo medir el avance ahora.
            <button type="button" onClick={() => void recargar(true)} className="inline-flex min-h-10 items-center underline underline-offset-2">
              Reintentar
            </button>
          </p>
        )}
        {verPlantillas && (
          <section aria-label="Metas listas por área" className="rounded-2xl border border-dashed border-[var(--rule-base)] p-4">
            <PlantillasMeta onElegir={abrirNueva} area={area} />
          </section>
        )}
        {grupos.length === 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            No tienes metas con este filtro.
            <button
              type="button"
              onClick={() => {
                setPeriodo("todas");
                setArea("todas");
              }}
              className="inline-flex min-h-10 items-center font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              Ver todas
            </button>
          </p>
        ) : (
          /* Columnas, no grilla: las áreas con 1-2 metas se apilan una debajo de la otra
             en vez de dejar dos tercios de fila en blanco (ver `GrupoArea`). */
          <div className={grupos.length > 1 ? "gap-3 md:columns-2 xl:columns-3" : undefined}>
            {grupos.map((g) => (
            <GrupoArea
              key={g.area.id}
              area={g.area}
              metas={g.metas}
              avances={avances}
              hoy={hoy}
              onEditar={editar}
              onBorrar={(m) => void pedirBorrar(m)}
              sola={grupos.length === 1}
            />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {cabecera}
      {cuerpo}
      <ModalMeta
        abierto={modal.abierto}
        meta={modal.meta}
        preset={modal.preset}
        onCerrar={() => setModal((m) => ({ ...m, abierto: false }))}
        onGuardada={() => void recargar()}
      />
    </div>
  );
}
