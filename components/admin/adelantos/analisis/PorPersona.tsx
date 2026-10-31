"use client";

/**
 * Los dos bloques por persona del análisis, con el nombre COMPLETO y su plata
 * (el «Top 5 deudores» de antes cortaba el nombre a 14 letras y no decía
 * cuánto): «Cuánto de lo que diste ya volvió» (quién debe más va primero, así
 * que también es el «a quién cobrarle») y «Quién tarda más en devolver».
 * Se ven las primeras 6; el resto con «Ver las N».
 */
import { useState, type ReactNode } from "react";
import type { PersonaRecupero, PersonaTardanza } from "@/lib/adelantos/analisis";
import { TRAMOS, tramoDe } from "@/lib/adelantos/gestion-cobranza";
import { button } from "@/components/ui-system/button-variants";
import { fmtMon } from "../shared";
import { dias, montoEnFrase } from "./formato";

const VISIBLES = 6;
/** Desde esta parte de lo que te deben, la persona se nombra arriba del bloque. */
const CONCENTRA = 40;

function Lista<T>({ items, render, nombre }: { items: T[]; render: (x: T) => ReactNode; nombre: string }) {
  const [todas, setTodas] = useState(false);
  const vistas = todas ? items : items.slice(0, VISIBLES);
  return (
    <>
      <ul className="divide-y divide-[var(--rule-soft)]" aria-label={nombre}>{vistas.map(render)}</ul>
      {items.length > VISIBLES && (
        <button type="button" onClick={() => setTodas((v) => !v)} className={button({ variant: "ghost", className: "mt-2 w-full" })}>
          {todas ? "Ver menos" : `Ver las ${items.length} personas`}
        </button>
      )}
    </>
  );
}

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

export function VolvioPorPersona({ personas, moneda }: { personas: PersonaRecupero[]; moneda: string }) {
  if (personas.length === 0) return <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no diste nada en esta moneda.</p>;
  const primera = personas[0];
  return (
    <>
      {primera.debe > 0 && primera.pctDeLoQueTeDeben >= CONCENTRA && (
        <p className="mb-3 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)]">
          <strong className="font-bold">{primera.nombre}</strong> tiene el <strong className="font-bold">{primera.pctDeLoQueTeDeben}&nbsp;%</strong> de lo que te deben ({montoEnFrase(primera.debe, moneda)}).
        </p>
      )}
      <Lista
        nombre="Lo que volvió, por persona"
        items={personas}
        render={(p) => (
          <li key={p.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
              <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {p.debe > 0 ? `Te debe ${fmtMon(p.debe, moneda)}` : "Al día"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <Barra pct={p.pctVolvio} color="var(--data-success-500)" />
              <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">{p.pctVolvio} % volvió</span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Le diste {montoEnFrase(p.diste, moneda)} · te devolvió {montoEnFrase(p.devolvio, moneda)}
              {p.debe > 0 && <> · <strong className="font-semibold text-[var(--text-primary)]">{p.pctDeLoQueTeDeben}&nbsp;% de lo que te deben</strong></>}
            </p>
          </li>
        )}
      />
    </>
  );
}

const TONO = Object.fromEntries(TRAMOS.map((t) => [t.id, t.tono]));

function detalleTardanza(t: PersonaTardanza): string {
  const partes: string[] = [];
  if (t.abiertos > 0 && t.diasQuieto !== null) {
    partes.push(t.abiertos === 1 ? `1 abierto, sin moverse hace ${dias(t.diasQuieto)}` : `${t.abiertos} abiertos, el más quieto hace ${dias(t.diasQuieto)}`);
  }
  if (t.pagados > 0 && t.diasPagados !== null) {
    partes.push(t.pagados === 1 ? `pagó 1 en ${dias(t.diasPagados)}` : `pagó ${t.pagados} en ${dias(t.diasPagados)} en promedio`);
  }
  const txt = partes.join(" · ");
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function TardaPorPersona({ tardanza }: { tardanza: PersonaTardanza[] }) {
  if (tardanza.length === 0) return <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Sin adelantos para medir.</p>;
  const max = Math.max(1, ...tardanza.map((t) => t.diasPromedio));
  return (
    <Lista
      nombre="Días promedio en devolver, por persona"
      items={tardanza}
      render={(t) => (
        <li key={t.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-sm font-semibold text-[var(--text-primary)]">{t.nombre}</span>
            <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text-primary)]">{dias(t.diasPromedio)}</span>
          </div>
          <div className="mt-1.5 flex">
            <Barra pct={Math.round((t.diasPromedio / max) * 100)} color={TONO[tramoDe(t.diasPromedio)]} />
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{detalleTardanza(t)}</p>
        </li>
      )}
    />
  );
}
