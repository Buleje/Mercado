"use client";

/**
 * CtpRadarCadenaGtf — «esta guía de 12 m³, ¿dónde terminó?».
 *
 * Es la vista que hoy se arma a mano cuando OSINFOR pregunta por un ingreso
 * puntual: una sola cadena aislada, aguas abajo, con el volumen que sobrevive
 * a cada paso y los destinos finales.
 *
 * El dato que evita el error clásico: cuando una corrida mezcla varias guías,
 * el producto que salió NO es todo de esta GTF. Por eso cada paso muestra su
 * aporte real (`aporteGtfPct`) en vez de adjudicarle toda la producción.
 */

import { ArrowRight, Boxes, MapPin, PackageOpen, ShieldAlert, Truck, X as XIcon } from "@buleje/design-system/icons";
import type { CadenaGtf } from "@/lib/forestal/ctp-radar-cadena";
import { resumenCadena } from "@/lib/forestal/ctp-radar-cadena";
import { fechaCorta } from "@/lib/forestal/ctp-radar-tiempo";

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString());

export default function CtpRadarCadenaGtf({
  cadena, onCerrar, onVerNodo,
}: {
  cadena: CadenaGtf;
  onCerrar: () => void;
  onVerNodo: (kind: "ingreso" | "corrida" | "despacho", id: string, gtf?: string) => void;
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-[var(--rule-base)] bg-primary/10 dark:bg-[var(--accent)]/12 px-4 py-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <PackageOpen className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            Seguimiento de la GTF {cadena.gtf}
            {cadena.cites && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" /> CITES
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${cadena.cerrada ? "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"}`}>
              {cadena.cerrada ? "Cadena cerrada" : "Cadena abierta"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {cadena.especie} · ingresó el {fechaCorta(cadena.fecha)} · {resumenCadena(cadena)}
          </p>
        </div>
        <button type="button" onClick={onCerrar} title="Cerrar el seguimiento" aria-label="Cerrar el seguimiento" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">
          <XIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 p-4">
        {/* Paso 0 — el ingreso */}
        <Paso
          icon={PackageOpen}
          color="var(--accent)"
          titulo={`GTF ${cadena.gtf} · ${cadena.especie}`}
          detalle={`${fmt(cadena.volumenM3)} m³ ingresados · ${fmt(cadena.consumidoM3)} m³ a producción${cadena.enPatioM3 > 0 ? ` · ${fmt(cadena.enPatioM3)} m³ en patio` : ""}`}
          onClick={() => onVerNodo("ingreso", cadena.ingresoId, cadena.gtf)}
        />

        {cadena.corridas.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
            Esta guía todavía no entró a ninguna corrida de producción.
          </p>
        ) : (
          cadena.corridas.map((c) => (
            <div key={c.id} className="ml-3 space-y-2 border-l-2 border-dashed border-[var(--rule-base)] pl-4">
              <Paso
                icon={Boxes}
                color="var(--data-info-500)"
                titulo={`Corrida #${c.lineNo} · ${c.etiqueta}`}
                detalle={
                  `${fmt(c.consumidoM3)} m³ de esta guía → ${fmt(c.producido)} ${c.unidad || "u"} producidos` +
                  (c.aporteGtfPct != null && c.aporteGtfPct < 100
                    ? ` · esta GTF aportó el ${c.aporteGtfPct}% de la materia prima (el resto del producto es de otras guías)`
                    : "")
                }
                onClick={() => onVerNodo("corrida", c.id)}
              />
              {c.despachos.length === 0 ? (
                <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                  Esta corrida todavía no tiene despacho atribuido: la cadena se corta acá.
                </p>
              ) : (
                c.despachos.map((d) => (
                  <div key={d.id} className="ml-3 border-l-2 border-dashed border-[var(--rule-base)] pl-4">
                    <Paso
                      icon={Truck}
                      color="var(--data-success-600)"
                      titulo={`Despacho #${d.lineNo} · ${d.destino}`}
                      detalle={`${fmt(d.cantidad)} ${d.unidad || "u"} el ${fechaCorta(d.fecha)}${d.gtfSalida ? ` · GTF de salida ${d.gtfSalida}` : " · sin GTF de salida"}`}
                      onClick={() => onVerNodo("despacho", d.id)}
                    />
                  </div>
                ))
              )}
            </div>
          ))
        )}

        {cadena.pendiente && (
          <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            Para cerrar la cadena: {cadena.pendiente}
          </p>
        )}

        {cadena.destinos.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="font-bold">Destinos finales:</span> {cadena.destinos.join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

function Paso({
  icon: Icon, color, titulo, detalle, onClick,
}: {
  icon: typeof Boxes; color: string; titulo: string; detalle: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-canvas)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        <span className="block font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{detalle}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
    </button>
  );
}
