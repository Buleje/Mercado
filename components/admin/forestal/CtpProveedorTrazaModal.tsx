"use client";

/**
 * CtpProveedorTrazaModal — la hoja de vida de un titular (ADR-319).
 *
 * Qué trajo, qué se usó, qué se produjo con eso y a dónde fue. Es la pregunta
 * del fiscalizador ("¿de dónde salió esta madera?") y la del dueño ("¿este
 * proveedor me rinde?") en la misma pantalla.
 *
 * Los huecos van ARRIBA, no al pie: si una corrida mezcló madera de dos
 * titulares, lo producido no es todo de éste y eso hay que leerlo antes que los
 * números, no después.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Share2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import {
  costoPorM3Proveedor,
  type TrazabilidadProveedor,
} from "@/lib/forestal/proveedor-trazabilidad";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Producido/despachado suman corridas y despachos que pueden estar en m³,
 *  pies tablares o unidades (`FilaCorridaProveedor.unit`): a diferencia de los
 *  campos `*M3` del balance, acá NO se puede asumir m³ sin mentir la unidad. */
const n4 = (n: number) => n.toFixed(4);
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });

export default function CtpProveedorTrazaModal({ proveedor, onClose }: { proveedor: string; onClose: () => void }) {
  const [datos, setDatos] = useState<TrazabilidadProveedor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    fetch(`/api/admin/forestal/directorio/trazabilidad?proveedor=${encodeURIComponent(proveedor)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer la trazabilidad (${r.status})`);
        return (await r.json()) as { trazabilidad: TrazabilidadProveedor };
      })
      .then((j) => { if (vivo) setDatos(j.trazabilidad); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [proveedor]);

  const b = datos?.balance;
  const unitario = b ? costoPorM3Proveedor(b) : null;

  return (
    <AdminModal
      open
      onClose={onClose}
      title={proveedor}
      description="Cadena de custodia de lo que entregó"
      icon={Share2}
      variant="info"
      footer={
        <ModalFooter nota={b ? `${b.guias} guía(s) de este titular en el libro.` : undefined}>
          <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {!datos && !error && (
          <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Recorriendo la cadena…
          </p>
        )}

        {datos && b && (
          <>
            {datos.huecos.length > 0 && (
              <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3">
                <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-warning-700)]">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Leé esto antes de los números
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-secondary)]">
                  {datos.huecos.map((h) => <li key={h}>· {h}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Dato label="Guías" valor={String(b.guias)} pie={`${fmtM3(b.ingresadoM3)} m³ ingresados`} />
              <Dato label="Consumido" valor={`${fmtM3(b.consumidoM3)} m³`} pie={`${fmtM3(b.enPatioM3)} m³ siguen en patio`} />
              <Dato
                label="Rendimiento"
                valor={b.rendimientoPct == null ? "—" : `${Number(b.rendimientoPct).toFixed(1)}%`}
                pie={b.rendimientoPct == null ? "todavía no se procesó" : `${n4(b.producido)} producido`}
                tono={b.rendimientoPct == null ? "muted" : "ok"}
              />
              <Dato label="Despachado" valor={n4(b.despachado)} pie={`${datos.salidas.length} salida(s)`} />
              <Dato
                label="Costo de compra"
                valor={b.costoTotal == null ? "—" : soles(b.costoTotal)}
                pie={
                  b.costoTotal == null
                    ? "sin factura cargada"
                    : b.guiasSinCosto > 0
                      ? `${b.guiasSinCosto} guía(s) sin factura`
                      : "todas facturadas"
                }
                tono={b.costoTotal == null ? "muted" : "ok"}
              />
              <Dato
                label="S/ por m³"
                valor={unitario == null ? "—" : soles(unitario)}
                pie={unitario == null ? "falta factura" : `sobre ${fmtM3(b.volumenConCostoM3)} m³ facturados`}
                tono={unitario == null ? "muted" : "ok"}
              />
            </div>

            {datos.porEspecie.length > 0 && (
              <Bloque titulo="Qué especies trae">
                <ul className="space-y-1">
                  {datos.porEspecie.map((e) => (
                    <li key={e.especie} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
                        {e.especie}
                        {e.cites && (
                          <span className="ml-1.5 rounded bg-[var(--surface-sunken)] px-1.5 text-xs font-bold text-[var(--text-tertiary)]">
                            CITES
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{e.guias} guía(s)</span>
                      <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {fmtM3(e.ingresadoM3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}

            <Bloque titulo={`Guías del titular (${datos.guias.length})`}>
              {datos.guias.length === 0 ? (
                <Vacio texto="Todavía no ingresó madera de este titular." />
              ) : (
                <>
                  {/* Dos columnas de m³ sin rótulo se leen como un error de
                      tipeo: la primera es lo que trajo, la segunda lo que queda. */}
                  <div className="mb-1 flex items-center gap-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    <span className="w-16 shrink-0">Fecha</span>
                    <span className="w-32 shrink-0">Guía</span>
                    <span className="min-w-0 flex-1">Especie</span>
                    <span className="w-20 text-right">Ingresó</span>
                    <span className="w-20 text-right">En patio</span>
                  </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {datos.guias.map((g) => (
                    <li key={g.woodEntryId} className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {fecha(g.entryDate)}
                      </span>
                      <span className="w-32 shrink-0 truncate font-mono text-xs text-[var(--text-primary)]">{g.gtfNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{g.especie}</span>
                      <span className="w-20 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(g.volumeM3)}</span>
                      <span
                        className="w-20 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]"
                        title="Lo que sigue en el patio de esta guía"
                      >
                        {fmtM3(g.saldoM3)}
                      </span>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </Bloque>

            {datos.salidas.length > 0 && (
              <Bloque titulo={`A dónde fue (${datos.salidas.length})`}>
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {datos.salidas.map((s) => (
                    <li key={`${s.despachoEntryId}-${s.fecha}`} className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {fecha(s.fecha)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                        {s.destino ?? "sin destino"}
                        {s.compartida && (
                          <span className="ml-1.5 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            corrida compartida
                          </span>
                        )}
                      </span>
                      {s.gtfNumber && <span className="font-mono text-xs text-[var(--text-tertiary)]">{s.gtfNumber}</span>}
                      <span className="w-20 text-right font-mono tabular-nums text-[var(--text-primary)]">{n4(s.cantidad)}</span>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}
          </>
        )}

      </ModalBody>
    </AdminModal>
  );
}

function Dato({ label, valor, pie, tono = "ok" }: { label: string; valor: string; pie: string; tono?: "ok" | "muted" }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <span className="block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </span>
      <span
        className={`mt-0.5 block font-mono text-lg font-bold tabular-nums ${
          tono === "muted" ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
        }`}
      >
        {valor}
      </span>
      <span className="block text-xs text-[var(--text-tertiary)]">{pie}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <CardTitle as="h3" className="mb-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {titulo}
      </CardTitle>
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">{children}</div>
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-2 text-center text-sm text-[var(--text-tertiary)]">{texto}</p>;
}
