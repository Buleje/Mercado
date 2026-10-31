"use client";

import { Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { POSVoiceInputProps } from "@/components/admin/pos/voz/voz-shared";
import type { DictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";

/** Lo dictado, resuelto en vivo contra el inventario: listo, sin stock, ambiguo o no encontrado. */
export default function DictadoLineas({
  voz,
  onAddToCart,
}: {
  voz: DictadoVoz;
  onAddToCart: POSVoiceInputProps["onAddToCart"];
}) {
  const { lineas, lineasRef, setLineas } = voz;
  return (
    <>
              {/* Lo dictado, resuelto en vivo contra el inventario */}
              {lineas.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {lineas.filter((l) => l.estado === "listo").length} de {lineas.length} listo
                      {lineas.filter((l) => l.estado === "listo").length === 1 ? "" : "s"} para agregar
                    </p>
                    <button
                      type="button"
                      onClick={() => { lineasRef.current = []; setLineas([]); }}
                      className="text-[length:var(--ts-2xs,0.6875rem)] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      Limpiar
                    </button>
                  </div>

                  {lineas.map((l) => {
                    const p = l.elegido;
                    const tono =
                      l.estado === "listo"
                        ? "border-primary/40 bg-primary/5"
                        : l.estado === "sin_stock"
                          ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10"
                          : l.estado === "ambiguo"
                            ? "border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/10"
                            : "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10";
                    return (
                      <div key={l.id} className={cn("rounded-xl border-2 px-3 py-2", tono)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)]">
                              <span className="font-mono">{l.pedido.cantidad}</span>
                              {l.pedido.unidad ? ` ${l.pedido.unidad}` : ""} ·{" "}
                              {p ? p.name : <span className="italic">«{l.pedido.crudo}»</span>}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {l.estado === "listo" && p && (
                                <>
                                  {formatCurrency(p.price * l.pedido.cantidad)}
                                  {p.stock != null && ` · quedan ${p.stock}`}
                                </>
                              )}
                              {l.estado === "sin_stock" && p && (
                                <>Sin stock suficiente: hay {p.stock ?? 0} y se pidieron {l.pedido.cantidad}</>
                              )}
                              {l.estado === "ambiguo" && <>¿Cuál de estos?</>}
                              {l.estado === "no_encontrado" && <>No está en el inventario: repítelo o búscalo a mano</>}
                            </p>
                            {l.estado === "ambiguo" && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {l.candidatos.map((c) => (
                                  <button
                                    key={c.producto.id}
                                    type="button"
                                    onClick={() => {
                                      lineasRef.current = lineasRef.current.map((x) =>
                                        x.id === l.id ? { ...x, elegido: c.producto, estado: "listo" as const } : x,
                                      );
                                      setLineas([...lineasRef.current]);
                                    }}
                                    className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-bold text-[var(--text-primary)] hover:border-primary"
                                  >
                                    {c.producto.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {l.estado !== "no_encontrado" && p && (
                            <button
                              type="button"
                              onClick={() => {
                                onAddToCart(p.id, l.pedido.cantidad);
                                lineasRef.current = lineasRef.current.filter((x) => x.id !== l.id);
                                setLineas([...lineasRef.current]);
                              }}
                              title="Agregar al carrito"
                              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-white hover:opacity-90"
                            >
                              <Plus className="h-3.5 w-3.5" /> Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {lineas.some((l) => l.estado === "listo") && (
                    <button
                      type="button"
                      onClick={() => {
                        for (const l of lineasRef.current) {
                          if (l.estado === "listo" && l.elegido) onAddToCart(l.elegido.id, l.pedido.cantidad);
                        }
                        lineasRef.current = lineasRef.current.filter((l) => l.estado !== "listo");
                        setLineas([...lineasRef.current]);
                      }}
                      className="w-full rounded-xl bg-primary min-h-11 text-sm font-semibold text-white hover:opacity-90"
                    >
                      {lineas.filter((l) => l.estado === "listo").length === 1
                        ? "Agregar 1 al carrito"
                        : `Agregar los ${lineas.filter((l) => l.estado === "listo").length} al carrito`}
                    </button>
                  )}
                </div>
              )}
    </>
  );
}
