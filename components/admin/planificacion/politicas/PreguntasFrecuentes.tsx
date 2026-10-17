"use client";

/**
 * Políticas › Preguntas frecuentes (ADR-497): lo que más preguntan los
 * clientes con la respuesta del negocio, escrito en su lugar. Agregar una
 * pregunta lleva el cursor a su respuesta; cada una se copia para WhatsApp.
 */
import { useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@buleje/design-system";
import { Check, Copy, ListChecks, MoreHorizontal, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { normalizarTitulo, preguntasTipicas, type PlantillaPregunta, type RubroPlantilla } from "@/lib/planificacion/plantillas-politicas";
import { cn } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { AgregarTipicasModal } from "../piezas/AgregarTipicasModal";
import { CAMPO_ALTO, EN_LUGAR, PASTILLA, PASTILLA_TONO, TARJETA } from "../piezas/clases";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { useCopiar } from "../piezas/use-copiar";
import { useRubroPlan } from "../piezas/use-rubro-plan";
import { MAX_PREGUNTAS, textoWhatsApp, tieneHuecos, yaEstan, type Pregunta } from "./politicas-config";

export function PreguntasFrecuentes() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("politicas");
  const rubro = useRubroPlan();
  const { copiado, copiar } = useCopiar();
  const [nueva, setNueva] = useState("");
  const [recien, setRecien] = useState<string | null>(null);
  const [tipicas, setTipicas] = useState(false);
  const preguntas = datos.preguntas;
  const lleno = preguntas.length >= MAX_PREGUNTAS;

  const editar = (id: string, cambio: Partial<Pregunta>) =>
    cambiar((prev) => ({ ...prev, preguntas: prev.preguntas.map((p) => (p.id === id ? { ...p, ...cambio } : p)) }));

  const borrar = (p: Pregunta, avisar = true) => {
    const indice = preguntas.findIndex((x) => x.id === p.id);
    cambiar((prev) => ({ ...prev, preguntas: prev.preguntas.filter((x) => x.id !== p.id) }));
    if (!avisar) return;
    undoToast({
      message: "Borraste la pregunta",
      onUndo: () =>
        cambiar((prev) => {
          if (prev.preguntas.some((x) => x.id === p.id)) return prev;
          const lista = [...prev.preguntas];
          lista.splice(Math.min(indice, lista.length), 0, p);
          return { ...prev, preguntas: lista };
        }),
    });
  };

  const agregar = () => {
    const pregunta = nueva.trim();
    if (!pregunta || lleno) return;
    const id = nuevoId();
    cambiar((prev) => ({ ...prev, preguntas: [...prev.preguntas, { id, pregunta, respuesta: "" }] }));
    setRecien(id);
    setNueva("");
  };

  const copiarPregunta = async (p: Pregunta) => {
    if (!(await copiar(p.id, textoWhatsApp(p.pregunta, p.respuesta)))) return;
    if (tieneHuecos(p.respuesta)) toast.warning("Copiada, pero la respuesta tiene partes por completar entre corchetes.");
    else if (puedeEditar) toast.success("Copiada: pégala en WhatsApp.");
  };

  const faltan = (r: RubroPlantilla) => {
    const estan = yaEstan(preguntas.map((p) => p.pregunta));
    return preguntasTipicas(r)
      .filter((t) => !estan.has(normalizarTitulo(t.pregunta)))
      .map((t) => ({ titulo: t.pregunta, detalle: t.respuesta, dato: t }));
  };
  const agregarTipicas = (elegidas: PlantillaPregunta[]) => {
    cambiar((prev) => {
      const estan = yaEstan(prev.preguntas.map((p) => p.pregunta));
      const nuevas = elegidas.filter((t) => !estan.has(normalizarTitulo(t.pregunta))).map((t) => ({ id: nuevoId(), pregunta: t.pregunta, respuesta: t.respuesta }));
      return { ...prev, preguntas: [...prev.preguntas, ...nuevas].slice(0, MAX_PREGUNTAS) };
    });
    toast.success(`${elegidas.length} ${elegidas.length === 1 ? "pregunta agregada" : "preguntas agregadas"}: completa lo que está entre corchetes.`);
  };

  return (
    <div className="space-y-4">
      <CabeceraSeccion
        seccion="politicas"
        titulo="Preguntas frecuentes"
        ayuda="Lo que más te preguntan los clientes, con la respuesta del negocio. Para que cualquiera del equipo conteste igual y la copies por WhatsApp."
        ejemplo="¿Hacen delivery? Sí, en Constitución, de 9 a 7, con un recargo de S/ 3."
        acciones={puedeEditar ? [{ id: "tipicas", label: "Agregar las típicas", hint: "Las de tu rubro que todavía no tienes", icon: ListChecks, onSelect: () => setTipicas(true) }] : []}
      />

      {preguntas.length === 0 ? (
        <EstadoVacio frase="Sin preguntas: agrega las típicas de tu rubro o escribe la primera abajo.">
          {puedeEditar && (
            <Button onClick={() => setTipicas(true)}>
              <ListChecks className="size-4" aria-hidden />
              Agregar las típicas
            </Button>
          )}
        </EstadoVacio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {preguntas.map((p, i) => {
            const menu: MenuAccion[] = [
              { id: "copiar", label: "Copiar para WhatsApp", icon: Copy, onSelect: () => void copiarPregunta(p) },
              { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: () => borrar(p) },
            ];
            return (
              <li key={p.id} className={cn(TARJETA, "flex items-start gap-1 p-2")}>
                <div className="min-w-0 flex-1">
                  {puedeEditar ? (
                    <>
                      <textarea
                        rows={1}
                        value={p.pregunta}
                        maxLength={600}
                        aria-label={`Pregunta ${i + 1}`}
                        className={cn(EN_LUGAR, "font-semibold")}
                        onChange={(e) => editar(p.id, { pregunta: e.target.value.replace(/\n/g, " ") })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={(e) => {
                          if (!e.target.value.trim() && !p.respuesta.trim()) borrar(p, false);
                        }}
                      />
                      <textarea
                        rows={1}
                        value={p.respuesta}
                        maxLength={4000}
                        ref={recien === p.id ? (el) => el?.focus() : undefined}
                        aria-label={`Respuesta a la pregunta ${i + 1}`}
                        placeholder="La respuesta del negocio"
                        className={cn(EN_LUGAR, "text-[var(--text-secondary)]")}
                        onChange={(e) => editar(p.id, { respuesta: e.target.value })}
                        onBlur={() => recien === p.id && setRecien(null)}
                      />
                    </>
                  ) : (
                    <div className="px-2 py-2">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{p.pregunta}</span>
                      <span className="block text-sm whitespace-pre-line text-[var(--text-secondary)]">{p.respuesta || "Sin respuesta todavía."}</span>
                    </div>
                  )}
                  {tieneHuecos(p.respuesta) && <span className={cn(PASTILLA, PASTILLA_TONO.info, "ml-2")}>Por completar</span>}
                </div>
                {puedeEditar ? (
                  <div className="shrink-0">
                    <ActionMenu label={`Opciones de la pregunta ${i + 1}`} icon={MoreHorizontal} actions={menu} soloIcono size="md" />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(button({ variant: "ghost", size: "icon" }), "shrink-0")}
                    aria-label={copiado === p.id ? "Copiado" : "Copiar para WhatsApp"}
                    title="Copiar para WhatsApp"
                    onClick={() => void copiarPregunta(p)}
                  >
                    {copiado === p.id ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {puedeEditar && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nueva}
            maxLength={600}
            enterKeyHint="done"
            disabled={lleno}
            aria-label="Nueva pregunta"
            placeholder={preguntas.length === 0 ? "Primera pregunta y Enter: «¿Hacen delivery?»" : "Otra pregunta y Enter"}
            className={cn(CAMPO_ALTO, "flex-1 sm:max-w-md")}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
          />
          <button type="button" className={button({ variant: "secondary", size: "icon" })} aria-label="Agregar pregunta" title="Agregar pregunta" disabled={!nueva.trim() || lleno} onClick={agregar}>
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      )}

      {tipicas && (
        <AgregarTipicasModal
          abierto
          titulo="Agregar las preguntas típicas"
          yaTodas="Ya tienes todas las preguntas típicas de este rubro."
          rubroInicial={rubro}
          faltan={faltan}
          lugar={MAX_PREGUNTAS - preguntas.length}
          onCerrar={() => setTipicas(false)}
          onAgregar={agregarTipicas}
        />
      )}
    </div>
  );
}
