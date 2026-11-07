"use client";

/**
 * ObjetivosLista — los objetivos del plan con sus filtros pegados (estado,
 * plazo, área), la barra de avance, «atrasado» y las acciones para tildar
 * (ADR-497). `?abrir=<id>` abre la ventana de ese objetivo (lo usa la
 * estrategia que se convierte en objetivo y la línea de tiempo).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { undoToast } from "@buleje/design-system";
import { Plus } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { objetivoAtrasado } from "@/lib/planificacion/calculos";
import { ESTADOS_OBJETIVO, PLAZOS } from "@/lib/planificacion/secciones";
import { cn, limaDateKey } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { CAMPO_ALTO } from "../piezas/clases";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { ObjetivoModal } from "./ObjetivoModal";
import { TarjetaObjetivo } from "./TarjetaObjetivo";
import { ESTADO_OBJETIVO, NOMBRE_PLAZO, objetivoNuevo, type Objetivo } from "./objetivos-config";
import { usePasarATareas } from "./use-pasar-a-tareas";

const MAX_OBJETIVOS = 100;
const RANGO_ESTADO: Readonly<Record<Objetivo["estado"], number>> = { "en-curso": 0, "por-empezar": 0, pausado: 1, hecho: 2 };
const SIN_FILTRO = { estado: "todos", plazo: "todos", area: "todas" } as const;

type Filtros = { estado: string; plazo: string; area: string };

export function ObjetivosLista() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("objetivos");
  const { datos: organizacion } = useSeccionPlan("organizacion");
  const { datos: estrategias } = useSeccionPlan("estrategias");
  const marcarEnviada = useCallback(
    (accionId: string, tareaId: string) =>
      cambiar((prev) => ({
        ...prev,
        items: prev.items.map((o) => ({ ...o, acciones: o.acciones.map((a) => (a.id === accionId ? { ...a, tareaId } : a)) })),
      })),
    [cambiar],
  );
  const { envios, pasar } = usePasarATareas(marcarEnviada);
  const hoy = limaDateKey();
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTRO);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [modal, setModal] = useState<{ inicial: Objetivo; esNuevo: boolean } | null>(null);
  const items = datos.items;

  // `?abrir=<id>`: abre ese objetivo una vez y limpia el parámetro.
  const abrir = useSearchParams().get("abrir");
  const yaAbierto = useRef<string | null>(null);
  useEffect(() => {
    if (!abrir || yaAbierto.current === abrir) return;
    const o = items.find((x) => x.id === abrir);
    if (!o) return;
    yaAbierto.current = abrir;
    setAbiertos((p) => new Set(p).add(o.id));
    if (puedeEditar) setModal({ inicial: o, esNuevo: false });
    const url = new URL(window.location.href);
    url.searchParams.delete("abrir");
    window.history.replaceState(window.history.state, "", url);
  }, [abrir, items, puedeEditar]);

  const areas = useMemo(
    () => [...new Set([...organizacion.areas.map((a) => a.nombre), ...items.map((o) => o.area)].map((a) => a.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [organizacion.areas, items],
  );
  const textoEstrategia = useMemo(() => new Map(estrategias.items.map((e) => [e.id, e.texto])), [estrategias.items]);

  const visibles = useMemo(() => {
    const pasa = (o: Objetivo) =>
      (filtros.estado === "todos" || (filtros.estado === "atrasados" ? objetivoAtrasado(o, hoy) : o.estado === filtros.estado)) &&
      (filtros.plazo === "todos" || o.plazo === filtros.plazo) &&
      (filtros.area === "todas" || o.area.trim() === filtros.area);
    return items
      .filter(pasa)
      .sort((a, b) => RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado] || (a.fin || "9999").localeCompare(b.fin || "9999"));
  }, [items, filtros, hoy]);
  const atrasados = items.filter((o) => objetivoAtrasado(o, hoy)).length;
  const hayFiltro = filtros.estado !== "todos" || filtros.plazo !== "todos" || filtros.area !== "todas";

  const guardar = (o: Objetivo) =>
    cambiar((prev) => ({ ...prev, items: prev.items.some((x) => x.id === o.id) ? prev.items.map((x) => (x.id === o.id ? o : x)) : [...prev.items, o] }));
  const tildar = (objetivoId: string, accionId: string, hecha: boolean) =>
    cambiar((prev) => ({
      ...prev,
      items: prev.items.map((o) => (o.id === objetivoId ? { ...o, acciones: o.acciones.map((a) => (a.id === accionId ? { ...a, hecha } : a)) } : o)),
    }));
  const borrar = (o: Objetivo) => {
    const indice = items.findIndex((x) => x.id === o.id);
    cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== o.id) }));
    undoToast({
      message: "Borraste el objetivo",
      description: o.titulo.slice(0, 80),
      onUndo: () =>
        cambiar((prev) => {
          if (prev.items.some((x) => x.id === o.id)) return prev;
          const lista = [...prev.items];
          lista.splice(Math.min(indice, lista.length), 0, o);
          return { ...prev, items: lista };
        }),
    });
  };
  const alternar = (id: string) =>
    setAbiertos((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const nuevo = () => setModal({ inicial: objetivoNuevo(nuevoId()), esNuevo: true });

  return (
    <div className="space-y-3">
      <CabeceraSeccion
        seccion="objetivos"
        titulo="Objetivos"
        ayuda="Lo que quieres lograr, con plazo, responsable, cómo se mide y sus acciones. El avance sale de las acciones tildadas si no lo escribes."
        ejemplo="Vender S/ 30 000 al mes antes de diciembre; acciones: delivery por WhatsApp, combo de lonchera."
      >
        {puedeEditar && items.length > 0 && (
          <Button onClick={nuevo} disabled={items.length >= MAX_OBJETIVOS}>
            <Plus className="size-4" aria-hidden />
            Nuevo objetivo
          </Button>
        )}
      </CabeceraSeccion>

      {items.length === 0 ? (
        <EstadoVacio frase="Todavía no tienes objetivos: escribe el primero o conviértelo desde una estrategia.">
          {puedeEditar && (
            <Button onClick={nuevo}>
              <Plus className="size-4" aria-hidden />
              Nuevo objetivo
            </Button>
          )}
        </EstadoVacio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar objetivos">
            <select aria-label="Estado" className={cn(CAMPO_ALTO, "flex-1 basis-36 sm:max-w-52")} value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
              <option value="todos">Todos los estados</option>
              {ESTADOS_OBJETIVO.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_OBJETIVO[e].nombre}
                </option>
              ))}
              <option value="atrasados">Atrasados ({atrasados})</option>
            </select>
            <select aria-label="Plazo" className={cn(CAMPO_ALTO, "flex-1 basis-36 sm:max-w-52")} value={filtros.plazo} onChange={(e) => setFiltros((f) => ({ ...f, plazo: e.target.value }))}>
              <option value="todos">Todos los plazos</option>
              {PLAZOS.map((p) => (
                <option key={p} value={p}>
                  {NOMBRE_PLAZO[p]}
                </option>
              ))}
            </select>
            {areas.length > 0 && (
              <select aria-label="Área" className={cn(CAMPO_ALTO, "flex-1 basis-36 sm:max-w-52")} value={filtros.area} onChange={(e) => setFiltros((f) => ({ ...f, area: e.target.value }))}>
                <option value="todas">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
            <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
              {visibles.length} de {items.length}
            </span>
          </div>

          {visibles.length === 0 ? (
            <EstadoVacio frase="Ningún objetivo con esos filtros.">
              {hayFiltro && (
                <Button variant="secondary" onClick={() => setFiltros(SIN_FILTRO)}>
                  Quitar filtros
                </Button>
              )}
            </EstadoVacio>
          ) : (
            <ul className="space-y-2">
              {visibles.map((o) => (
                <TarjetaObjetivo
                  key={o.id}
                  objetivo={o}
                  hoy={hoy}
                  abierto={abiertos.has(o.id)}
                  puedeEditar={puedeEditar}
                  estrategia={o.estrategiaId ? (textoEstrategia.get(o.estrategiaId) ?? null) : null}
                  envios={envios}
                  onAlternar={() => alternar(o.id)}
                  onTildar={(accionId, hecha) => tildar(o.id, accionId, hecha)}
                  onPasarATareas={(a) => void pasar(a, o)}
                  onEditar={() => setModal({ inicial: o, esNuevo: false })}
                  onBorrar={() => borrar(o)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {modal && (
        <ObjetivoModal
          key={modal.inicial.id}
          abierto
          inicial={modal.inicial}
          esNuevo={modal.esNuevo}
          areas={areas}
          onCerrar={() => setModal(null)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}
