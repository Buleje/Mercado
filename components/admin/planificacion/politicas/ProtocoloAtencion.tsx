"use client";

/**
 * Políticas › Protocolo de atención (ADR-497): los pasos para atender a un
 * cliente, en orden. Se escriben en su lugar, se suben o bajan con las
 * flechas (o desde «⋯» en el celular) y se borran con deshacer.
 */
import { useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@buleje/design-system";
import { ArrowDown, ArrowUp, ListChecks, MoreHorizontal, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { normalizarTitulo, protocoloTipico, type PlantillaPaso, type RubroPlantilla } from "@/lib/planificacion/plantillas-politicas";
import { cn } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { AgregarTipicasModal } from "../piezas/AgregarTipicasModal";
import { CAMPO_ALTO, EN_LUGAR, TARJETA } from "../piezas/clases";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { useRubroPlan } from "../piezas/use-rubro-plan";
import { MAX_PASOS, yaEstan, type PasoAtencion } from "./politicas-config";

export function ProtocoloAtencion() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("politicas");
  const rubro = useRubroPlan();
  const [nuevo, setNuevo] = useState("");
  const [tipicas, setTipicas] = useState(false);
  const pasos = datos.protocolo;
  const lleno = pasos.length >= MAX_PASOS;

  const editar = (id: string, cambio: Partial<PasoAtencion>) =>
    cambiar((prev) => ({ ...prev, protocolo: prev.protocolo.map((p) => (p.id === id ? { ...p, ...cambio } : p)) }));

  const mover = (id: string, delta: -1 | 1) =>
    cambiar((prev) => {
      const lista = [...prev.protocolo];
      const i = lista.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= lista.length) return prev;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...prev, protocolo: lista };
    });

  const borrar = (p: PasoAtencion, avisar = true) => {
    const indice = pasos.findIndex((x) => x.id === p.id);
    cambiar((prev) => ({ ...prev, protocolo: prev.protocolo.filter((x) => x.id !== p.id) }));
    if (!avisar) return;
    undoToast({
      message: `Borraste el paso ${p.paso}`,
      onUndo: () =>
        cambiar((prev) => {
          if (prev.protocolo.some((x) => x.id === p.id)) return prev;
          const lista = [...prev.protocolo];
          lista.splice(Math.min(indice, lista.length), 0, p);
          return { ...prev, protocolo: lista };
        }),
    });
  };

  const agregar = () => {
    const paso = nuevo.trim();
    if (!paso || lleno) return;
    cambiar((prev) => ({ ...prev, protocolo: [...prev.protocolo, { id: nuevoId(), paso, detalle: "" }] }));
    setNuevo("");
  };

  const faltan = (r: RubroPlantilla) => {
    const estan = yaEstan(pasos.map((p) => p.paso));
    return protocoloTipico(r)
      .filter((t) => !estan.has(normalizarTitulo(t.paso)))
      .map((t) => ({ titulo: t.paso, detalle: t.detalle, dato: t }));
  };
  const agregarTipicos = (elegidos: PlantillaPaso[]) => {
    cambiar((prev) => {
      const estan = yaEstan(prev.protocolo.map((p) => p.paso));
      const nuevos = elegidos.filter((t) => !estan.has(normalizarTitulo(t.paso))).map((t) => ({ id: nuevoId(), paso: t.paso, detalle: t.detalle }));
      return { ...prev, protocolo: [...prev.protocolo, ...nuevos].slice(0, MAX_PASOS) };
    });
    toast.success(`${elegidos.length} ${elegidos.length === 1 ? "paso agregado" : "pasos agregados"}`);
  };

  return (
    <div className="space-y-4">
      <CabeceraSeccion
        seccion="politicas"
        titulo="Protocolo de atención"
        ayuda="Los pasos para atender a cada cliente, en orden. Sirve para enseñar a alguien nuevo y para que todos atiendan igual."
        ejemplo="Saluda → Escucha → Ofrece → Cobra y da comprobante → Despide."
        acciones={puedeEditar ? [{ id: "tipicas", label: "Agregar los típicos", hint: "Los pasos de tu rubro que todavía no tienes", icon: ListChecks, onSelect: () => setTipicas(true) }] : []}
      />

      {pasos.length === 0 ? (
        <EstadoVacio frase="Sin pasos: empieza con el protocolo típico de tu rubro o escribe el primero abajo.">
          {puedeEditar && (
            <Button onClick={() => setTipicas(true)}>
              <ListChecks className="size-4" aria-hidden />
              Agregar los típicos
            </Button>
          )}
        </EstadoVacio>
      ) : (
        <ol className="space-y-2">
          {pasos.map((p, i) => {
            const menu: MenuAccion[] = [
              { id: "subir", label: "Subir", icon: ArrowUp, disabled: i === 0, onSelect: () => mover(p.id, -1) },
              { id: "bajar", label: "Bajar", icon: ArrowDown, disabled: i === pasos.length - 1, onSelect: () => mover(p.id, 1) },
              { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: () => borrar(p) },
            ];
            return (
              <li key={p.id} className={cn(TARJETA, "flex items-start gap-2 p-2")}>
                <span className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-ink)] tabular-nums dark:text-[var(--accent)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {puedeEditar ? (
                    <>
                      <textarea
                        rows={1}
                        value={p.paso}
                        maxLength={160}
                        aria-label={`Paso ${i + 1}`}
                        className={cn(EN_LUGAR, "font-semibold")}
                        onChange={(e) => editar(p.id, { paso: e.target.value.replace(/\n/g, " ") })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={(e) => {
                          if (!e.target.value.trim() && !p.detalle.trim()) borrar(p, false);
                        }}
                      />
                      <textarea
                        rows={1}
                        value={p.detalle}
                        maxLength={600}
                        aria-label={`Detalle del paso ${i + 1}`}
                        placeholder="Cómo se hace, qué decir"
                        className={cn(EN_LUGAR, "text-[var(--text-secondary)]")}
                        onChange={(e) => editar(p.id, { detalle: e.target.value })}
                      />
                    </>
                  ) : (
                    <div className="px-2 py-2">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{p.paso}</span>
                      {p.detalle && <span className="block text-sm whitespace-pre-line text-[var(--text-secondary)]">{p.detalle}</span>}
                    </div>
                  )}
                </div>
                {puedeEditar && (
                  <div className="flex shrink-0 items-center">
                    <button type="button" className={cn(button({ variant: "ghost", size: "icon" }), "hidden sm:inline-flex")} aria-label={`Subir el paso ${i + 1}`} title="Subir" disabled={i === 0} onClick={() => mover(p.id, -1)}>
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(button({ variant: "ghost", size: "icon" }), "hidden sm:inline-flex")}
                      aria-label={`Bajar el paso ${i + 1}`}
                      title="Bajar"
                      disabled={i === pasos.length - 1}
                      onClick={() => mover(p.id, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <ActionMenu label={`Opciones del paso ${i + 1}`} icon={MoreHorizontal} actions={menu} soloIcono size="md" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {puedeEditar && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nuevo}
            maxLength={160}
            enterKeyHint="done"
            disabled={lleno}
            aria-label="Nuevo paso"
            placeholder={pasos.length === 0 ? "Primer paso y Enter: «Saluda»" : "Otro paso y Enter"}
            className={cn(CAMPO_ALTO, "flex-1 sm:max-w-md")}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
          />
          <button type="button" className={button({ variant: "secondary", size: "icon" })} aria-label="Agregar paso" title="Agregar paso" disabled={!nuevo.trim() || lleno} onClick={agregar}>
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      )}

      {tipicas && (
        <AgregarTipicasModal abierto titulo="Agregar los pasos típicos" yaTodas="Ya tienes todos los pasos típicos de este rubro." rubroInicial={rubro} faltan={faltan} lugar={MAX_PASOS - pasos.length} onCerrar={() => setTipicas(false)} onAgregar={agregarTipicos} />
      )}
    </div>
  );
}
