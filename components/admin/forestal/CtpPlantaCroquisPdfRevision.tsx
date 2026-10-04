"use client";

/**
 * Revisar los componentes que salieron del PDF del croquis antes de crearlos
 * (ADR-465): cada renglón de la leyenda ubicado en el plano, con su tipo
 * sugerido (se puede cambiar), su forma (el contorno del plano o un cuadrado)
 * con el área, y si entra o no. Lo que ya tiene zona en el croquis entra sin
 * marcar y lo dice; los números repetidos con otra letra (rótulos de rutas)
 * también. Al lado, la vista previa de lo que se va a crear.
 */

import { useState } from "react";
import { AlertTriangle, FileText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { ZONA_TIPOS, isZonaTipo } from "@/lib/forestal/planta-zona-types";
import { areaComponenteM2, ladoMarcaM, type ComponentePdf } from "@/lib/forestal/croquis-desde-pdf";
import type { CroquisPdfEstado } from "./hooks/use-croquis-pdf";
import CtpPlantaCroquisPdfVista from "./CtpPlantaCroquisPdfVista";

const CHIP = "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold";
/* Propio y no `I` de ctp-shared: con `I h-9` gana su h-11 (orden del CSS) y cada renglón medía 56 px. */
const SELECT = "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] sm:w-40";
const m1 = (n: number) => formatNumber(n, { max: 1 });
/* Sobre el lienzo y no sobre el tinte: --accent-dark en --accent-soft da 4,4:1; en --surface-canvas, 4,6:1 (medido 03-10). */
const CHIP_CONTORNO = `${CHIP} bg-[var(--surface-canvas)] text-[var(--accent-dark)] ring-1 ring-inset ring-[var(--accent-muted)] dark:text-[var(--accent)]`;
const CHIP_NEUTRO = `${CHIP} bg-[var(--surface-canvas)] text-[var(--text-secondary)]`;
const CHIP_AVISO = `${CHIP} bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]`;
const DE_TEXTO: Record<NonNullable<ComponentePdf["contornoDe"]>, string> = { adentro: "contorno", al_lado: "contorno al lado", grande: "contorno grande" };

export default function CtpPlantaCroquisPdfRevision({ pdf, terreno }: {
  pdf: CroquisPdfEstado;
  /** Medidas tipeadas ahora (null si no son válidas): para mostrar dónde cae cada uno. */
  terreno: { anchoM: number; altoM: number } | null;
}) {
  const [resaltada, setResaltada] = useState<string | null>(null);
  const p = pdf.propuesta;
  if (!p) return null;
  const lado = terreno ? ladoMarcaM(terreno.anchoM, terreno.altoM) : 2;
  const escala = p.escala === "ejes"
    ? `Ejes en metros${p.anchoM && p.altoM ? ` · ${m1(p.anchoM)} × ${m1(p.altoM)} m ${p.medidasDe === "texto" || p.medidasDe === "cotas" ? "(de la lámina)" : p.medidasDe === "ejes" ? "(último número de cada eje)" : "(lo tipeado)"}` : ""}`
    : "Sin ejes: la hoja entera es el terreno";

  return (
    <section aria-label="Componentes del PDF" className="@container rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3" data-croquis-pdf="">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">Componentes del PDF</p>
        <InfoTip
          title="Componentes del PDF"
          what={`Leí la leyenda (número + nombre) y busqué cada número en el plano. Cada uno marcado se crea como zona con el código del tipo y el número: con el contorno del plano que encierra su número (o el que está pegado a él), y si no hay, un cuadrado de ${m1(lado)} × ${m1(lado)} m en su lugar.`}
          affects="Un número que aparece varias veces da varios puntos; si tiene otra letra (rótulos de rutas) queda sin marcar. Lo que ya tiene zona en el croquis no se toca y lo de fuera del cerco va al borde. Un contorno que no te convence vuelve al cuadrado con «Usar cuadrado»."
          example="3 Ramada de calamina → PP-03 con su contorno de 163 m² (encierra también el 4, 5 y 7); 22 Coche de la cinta, lejos de su dibujo → sin contorno, cuadrado de 2 × 2 m."
        />
        {!p.escaneado && (
          <span className="ml-auto text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {pdf.elegidos.length} de {p.componentes.length} marcados
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {escala}{p.leyenda ? ` · leyenda de ${p.leyenda}` : ""}
        {p.componentes.length > 0 && ` · ${p.componentes.filter((c) => c.contorno).length} con contorno del plano`}
      </p>

      {p.avisos.map((a) => (
        <p key={a} className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{a}
        </p>
      ))}

      {p.componentes.length > 0 && (
        /* La vista previa arriba; al costado recién con el modal agrandado (la lista necesita ~36rem). */
        <div className="mt-2 grid gap-3 @[56rem]:grid-cols-[minmax(0,1fr)_18rem] @[56rem]:items-start">
          {p.vistaPrevia && (
            <div className="@[56rem]:order-2">
              <CtpPlantaCroquisPdfVista propuesta={p} filas={pdf.filas} terreno={terreno} resaltada={resaltada} />
            </div>
          )}
          <div className="min-w-0 @[56rem]:order-1">
          <div className="flex gap-2">
            <button type="button" onClick={() => pdf.marcarTodas(true)} className="h-9 rounded-lg px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Marcar todos</button>
            <button type="button" onClick={() => pdf.marcarTodas(false)} className="h-9 rounded-lg px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Ninguno</button>
          </div>
          <ul className="mt-1 max-h-[20rem] space-y-0.5 overflow-y-auto pr-1">
            {p.componentes.map((c) => {
              const fila = pdf.filas[c.clave];
              const ya = pdf.yaEnCroquis.get(c.numero);
              const conContorno = !!c.contorno && fila?.forma === "contorno";
              const area = terreno ? areaComponenteM2({ contorno: conContorno ? c.contorno : null }, terreno) : null;
              return (
                <li
                  key={c.clave}
                  data-clave={c.clave}
                  onPointerEnter={() => setResaltada(c.clave)}
                  onPointerLeave={() => setResaltada((r) => (r === c.clave ? null : r))}
                  onFocus={() => setResaltada(c.clave)}
                  onBlur={() => setResaltada((r) => (r === c.clave ? null : r))}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-canvas)] ${resaltada === c.clave ? "bg-[var(--surface-canvas)]" : ""}`}
                >
                  <label className="flex min-w-0 grow basis-[16rem] cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={!!fila?.incluir} onChange={(e) => pdf.cambiarFila(c.clave, { incluir: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                    <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-[var(--text-primary)] px-1 text-xs font-bold tabular-nums text-[var(--surface-canvas)]">{c.numero}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--text-primary)]">{c.nombre}</span>
                      <span className="flex flex-wrap gap-1">
                        {terreno && <span className="text-xs tabular-nums text-[var(--text-tertiary)]">x {m1(c.fx * terreno.anchoM)} · y {m1(c.fy * terreno.altoM)} m</span>}
                        {area != null && <span className="text-xs font-bold tabular-nums text-[var(--text-secondary)]" data-area="">{m1(area)} m²</span>}
                        {conContorno && c.contornoDe
                          ? <span className={CHIP_CONTORNO}>{DE_TEXTO[c.contornoDe]}</span>
                          : <span className={c.contorno ? CHIP_NEUTRO : CHIP_AVISO}>{c.contorno ? "cuadrado" : "sin contorno"}</span>}
                        {conContorno && c.encierra.length > 0 && <span className={CHIP_NEUTRO}>encierra también {c.encierra.join(", ")}</span>}
                        {c.puntos > 1 && <span className={CHIP_NEUTRO}>punto {c.punto} de {c.puntos}</span>}
                        {c.puntos > 1 && !c.sugerido && <span className={CHIP_NEUTRO}>¿rótulo de ruta?</span>}
                        {c.fuera && <span className={CHIP_AVISO}>fuera del cerco</span>}
                        {ya && <span className={CHIP_AVISO}>ya existe {ya}</span>}
                      </span>
                    </span>
                  </label>
                  <select
                    value={fila?.tipo ?? c.tipo}
                    onChange={(e) => { if (isZonaTipo(e.target.value)) pdf.cambiarFila(c.clave, { tipo: e.target.value }); }}
                    aria-label={`Tipo de zona para ${c.numero} ${c.nombre}`}
                    className={SELECT}
                  >
                    {ZONA_TIPOS.map((z) => <option key={z.tipo} value={z.tipo}>{z.label}</option>)}
                  </select>
                  {c.contorno && (
                    <button
                      type="button"
                      onClick={() => pdf.cambiarFila(c.clave, { forma: conContorno ? "cuadrado" : "contorno" })}
                      aria-label={`${conContorno ? "Usar cuadrado" : "Usar contorno"} para ${c.numero} ${c.nombre}`}
                      className="h-9 shrink-0 rounded-lg px-2 text-xs font-bold text-[var(--accent-dark)] hover:bg-[var(--surface-canvas)] dark:text-[var(--accent)]"
                    >
                      {conContorno ? "Usar cuadrado" : "Usar contorno"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          </div>
        </div>
      )}

      {p.sinUbicar.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          No los encontré en el plano: {p.sinUbicar.map((s) => s.numero).join(", ")}
          <InfoTip title="Sin ubicar" what="Están en la leyenda pero su número no aparece suelto en el plano (o está dibujado como curva). Créalos a mano con «Dibujar zona»." example={p.sinUbicar.slice(0, 6).map((s) => `${s.numero} ${s.nombre}`).join(" · ")} />
        </p>
      )}
    </section>
  );
}
