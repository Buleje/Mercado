"use client";

/**
 * resumen-hero — la cabecera de la pestaña Resúmenes: qué lote es, cuánto suma
 * y en qué se fue el volumen.
 *
 * Vive aparte de `CubicacionResumenes` porque el contenedor se quedó con el
 * estado (lote, vistas, exports) y acá está el dibujo. Es la primera pantalla
 * que ve el maderero: el número grande y una frase que dice qué tiene, antes de
 * cualquier tabla.
 */

import type { ReactNode } from "react";
import { BarChart3, Boxes, Coins, Layers, Ruler } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { ResumenLote } from "@/lib/forestal/cubicacion-resumen";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { BarraComposicion } from "./resumen-vistas";
import { KpiResumen } from "./resumen-tabla";

/**
 * Una frase que resume el lote antes de la primera tabla: qué madera manda y
 * qué producto salió. Es lo que el maderero diría por teléfono.
 */
function lecturaCorta(porEspecie: ResumenLote, porTipo: ResumenLote): string | null {
  const esp = porEspecie.grupos[0];
  const tipo = porTipo.grupos[0];
  if (!esp || !tipo) return null;
  const mezcla = porEspecie.grupos.length === 1
    ? `Todo el lote es ${esp.label}`
    : `Encabeza ${esp.label} con ${fmtPct(esp.pctPt)} % del pie tablar`;
  return `${mezcla} · el grueso salió ${tipo.label.toLowerCase()} (${fmtPct(tipo.pctPt)} %).`;
}

export function HeroResumen({ total, renglones, porEspecie, porTipo, conValor, acciones, fecha }: {
  total: ResumenLote["total"];
  /** Renglones del cubicador (no piezas): dice cuánto se tipeó. */
  renglones: number;
  porEspecie: ResumenLote;
  porTipo: ResumenLote;
  conValor: boolean;
  acciones: ReactNode;
  /** Fecha de emisión — sólo se ve en el papel. */
  fecha: string;
}) {
  const frase = lecturaCorta(porEspecie, porTipo);
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* Velo de acento: da profundidad a la cabecera sin teñir el texto.
          `pointer-events-none` porque tapa los botones si no. */}
      {/* `bg-linear-to-b` es el prefijo de Tailwind 4; el de v3 lo marca el gate
          de diseño como error — y lo marca hasta dentro de un comentario. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-[var(--accent-soft)] to-transparent" />

      <div className="relative p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
              Cubicación · lote en curso
            </div>
            <CardTitle as="h3" className="flex items-center gap-2.5 font-display text-3xl font-normal leading-tight text-[var(--text-primary)]">
              <BarChart3 className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden /> Resúmenes del lote
            </CardTitle>
            {frase && <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">{frase}</p>}
            <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
              {porEspecie.grupos.length} {porEspecie.grupos.length === 1 ? "especie" : "especies"} ·{" "}
              {porTipo.grupos.length} {porTipo.grupos.length === 1 ? "tipo" : "tipos"} ·{" "}
              {renglones} {renglones === 1 ? "renglón" : "renglones"} del cubicador
            </p>
            {/* Sólo en el papel: un resumen sin fecha no sirve para mandarlo. */}
            <p className="hidden text-sm text-[var(--text-tertiary)] print:block">Emitido el {fecha}</p>
          </div>
          <div className="flex flex-wrap gap-2">{acciones}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiResumen label="Piezas" value={String(total.cantidad)} icon={Boxes} hint={`${renglones} renglones`} />
          <KpiResumen label="Pie tablar" value={fmtPt(total.pieTablar)} unidad="PT" icon={Layers} hint="entero, como se vende" />
          <KpiResumen label="Volumen" value={fmtM3(total.m3)} unidad="m³" icon={Ruler} hint="3 decimales, como se declara" />
          <KpiResumen
            label="Valor del lote"
            value={conValor ? `S/ ${fmtSoles(total.valor)}` : "—"}
            icon={Coins}
            destacado={conValor}
            hint={conValor && total.pieTablar > 0 ? `S/ ${fmtSoles(total.valor / total.pieTablar)} por PT` : "cargá el precio en el cubicador"}
          />
        </div>

        {/* En qué se fue el volumen: dos barras que se leen de un vistazo */}
        <div className="mt-5 grid gap-4 border-t border-[var(--rule-soft)] pt-4 sm:grid-cols-2">
          <BarraComposicion grupos={porTipo.grupos} titulo="Composición por tipo (del pie tablar)" />
          <BarraComposicion grupos={porEspecie.grupos} titulo="Composición por especie (del pie tablar)" />
        </div>
      </div>
    </div>
  );
}

/**
 * Dónde está el volumen: las cinco medidas que más pesan, con su barra.
 *
 * Responde la pregunta con la que se sale a vender —«¿qué tengo para ofrecer en
 * cantidad?»— sin obligar a abrir el agrupado libre y elegir la dimensión.
 */
export function DondeEstaElVolumen({ porMedida, conValor }: { porMedida: ResumenLote; conValor: boolean }) {
  const top = porMedida.grupos.slice(0, 5);
  if (top.length === 0) return null;
  const resto = porMedida.grupos.length - top.length;
  return (
    <ul className="space-y-2.5">
      {top.map((g, i) => (
        <li key={g.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-5 shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{g.label}</span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {g.cantidad} pzas · {fmtPt(g.pieTablar)} PT · {fmtM3(g.m3)} m³
            {conValor && <span className="text-[var(--accent-ink)] dark:text-[var(--accent)]"> · S/ {fmtSoles(g.valor)}</span>}
          </span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:w-40">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, g.pctPt)}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fmtPct(g.pctPt)}%</span>
        </li>
      ))}
      {resto > 0 && (
        <li className="text-sm text-[var(--text-tertiary)]">
          y {resto} {resto === 1 ? "medida más" : "medidas más"} — están todas en <b className="text-[var(--text-secondary)]">Tablas → Agrupado libre</b>.
        </li>
      )}
    </ul>
  );
}
