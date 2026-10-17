"use client";

/** La pestaña «Vista previa»: cómo se verá la receta en el recetario de la tienda. */
import { Clock, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { Ingrediente } from "./recetario-tipos";

interface Props {
  emoji: string;
  nombre: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: string;
  descripcion: string;
  ingredientes: Ingrediente[];
  pasos: string[];
  totalIngredientes: number;
}

export function VistaPreviaRecetario({ emoji, nombre, tiempoMinutos, porciones, dificultad, descripcion, ingredientes, pasos, totalIngredientes }: Props) {
  return (
                    <div className="space-y-6">
                      <p className="text-sm font-bold text-[var(--text-tertiary)]">Vista previa de la receta</p>
                      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden ">
                        <div className="bg-[var(--brand-ink)] p-4 text-[var(--surface-canvas)]">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{emoji || "🍽️"}</span>
                            <div>
                              <p className="text-lg font-bold">{nombre || "Nombre de la receta"}</p>
                              <div className="flex items-center gap-3 text-white/70 text-sm mt-1">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tiempoMinutos} min</span>
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{porciones} porciones</span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-sm font-bold",
                                  dificultad === "Fácil" ? "bg-primary/10" : dificultad === "Media" ? "bg-[var(--data-warning-500)]/30" : "bg-[var(--data-error-500)]/30"
                                )}>{dificultad}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          {descripcion && <p className="text-sm text-[var(--text-secondary)]">{descripcion}</p>}
                          {ingredientes.length > 0 && (
                            <div>
                              <p className="text-sm font-bold text-[var(--text-primary)] mb-2">Ingredientes</p>
                              <div className="space-y-1">
                                {ingredientes.filter(i => i.nombre).map((ing, idx) => (
                                  <div key={idx} className="flex justify-between text-sm text-[var(--text-secondary)]">
                                    <span>{ing.cantidad} {ing.unidad} de {ing.nombre}</span>
                                    <span className="font-bold">{formatCurrency(ing.precio * ing.cantidad)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-sm font-bold text-primary pt-1 border-t border-[var(--rule-soft)]">
                                  <span>Total</span>
                                  <span>{formatCurrency(totalIngredientes)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {pasos.filter(p => p.trim()).length > 0 && (
                            <div>
                              <p className="text-sm font-bold text-[var(--text-primary)] mb-2">Preparacion</p>
                              <ol className="space-y-1.5">
                                {pasos.filter(p => p.trim()).map((p, idx) => (
                                  <li key={idx} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-bold shrink-0">{idx + 1}</span>
                                    {p}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
  );
}
