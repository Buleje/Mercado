/**
 * Lo que la tarjeta ya NO dice y vive en el detalle (17-10, Brandon: «¿la
 * descripción en cada tarjeta, o en el modal?» → en el modal): «Te ayuda a» con
 * la descripción entera, la ficha técnica del panel (Ingredientes, Origen…) y
 * «Cómo usarlo». Lo usan la ficha rápida (cliente) y la ficha completa
 * (servidor): sin estado ni efectos, así sirve en los dos lados.
 */
import { ChevronDown } from "@buleje/design-system/icons";
import { MODO_DE_USO } from "./anuncios-ficha";
import type { ProductoSalon } from "./datos";
import { ETIQUETA_PRESENTACION, type FilaFicha } from "./presentacion";

/** «Ayuda a limpiar sin resecar y a alargar el efecto…» → dos viñetas; lo demás (formato, consejo) va aparte. */
export function beneficiosDe(descripcion: string | null): { puntos: string[]; resto: string | null } | null {
  const frases = (descripcion ?? "").split(/(?<=\.)\s+/).map((f) => f.trim()).filter(Boolean);
  const m = frases[0] ? /^Ayuda a (.+?)\.?$/i.exec(frases[0]) : null;
  if (!m?.[1]) return null;
  const puntos = m[1].split(/\s+y a\s+/).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const resto = frases.slice(1).filter((f) => !/se pide al confirmar/i.test(f)).join(" ");
  return { puntos, resto: resto || null };
}

/** La descripción entera: en viñetas si empieza con «Ayuda a…», si no, el texto tal cual. */
export function TeAyuda({ p, className = "mt-6" }: { p: Pick<ProductoSalon, "descripcion">; className?: string }) {
  const b = beneficiosDe(p.descripcion);
  if (!b) return p.descripcion ? <p className={`${className} max-w-xl text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]`}>{p.descripcion}</p> : null;
  return (
    <div className={className}>
      <p className="mu-kicker text-[var(--mu-acento-tinta)]">Te ayuda a</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {b.puntos.map((x) => (
          <li key={x} className="flex items-start gap-3 text-[length:var(--mu-t-cuerpo)] leading-snug text-[var(--text-primary)]">
            <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--mu-selva-claro)] text-[var(--mu-selva-tinta)]">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.2 5 8.5l4.5-5" />
              </svg>
            </span>
            {x}
          </li>
        ))}
      </ul>
      {b.resto && <p className="mt-3 text-[length:var(--mu-t-chico)] text-[var(--text-secondary)]">{b.resto}</p>}
    </div>
  );
}

/** La ficha técnica del panel, sin la fila de presentación (esa ya va junto al nombre). Sin filas, nada. */
export function FichaTecnica({ filas }: { filas: readonly FilaFicha[] }) {
  const resto = filas.filter((f) => !ETIQUETA_PRESENTACION.test(f.etiqueta));
  if (resto.length === 0) return null;
  return (
    <dl className="mt-5 divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]">
      {resto.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3 py-2.5 text-[length:var(--mu-t-chico)] leading-snug">
          <dt className="text-[var(--text-tertiary)]">{f.etiqueta}</dt>
          <dd className="text-[var(--text-primary)]">{f.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** «Cómo usarlo» plegado (el consejo de la categoría, `MODO_DE_USO`): en la ficha rápida no alarga el modal. */
export function ComoUsarlo({ categoria }: { categoria: string }) {
  const pasos = MODO_DE_USO[categoria] ?? [];
  if (pasos.length === 0) return null;
  return (
    <details className="group/uso mt-5 rounded-[var(--mu-radio-control)] border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <summary className="mu-foco flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--mu-radio-control)] px-4 text-[length:var(--mu-t-cuerpo)] font-medium text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        Cómo usarlo
        <ChevronDown className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 group-open/uso:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="flex flex-col gap-2.5 px-4 pb-4">
        {pasos.map((t, i) => (
          <li key={t} className="flex gap-3 text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--text-secondary)]">
            <span className="w-4 shrink-0 font-semibold tabular-nums text-[var(--text-tertiary)]">{i + 1}.</span>
            {t}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** La presentación como chip, al lado del código («Cód. MU001 · 1000 ml»). */
export function ChipPresentacion({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-sm font-medium tabular-nums text-[var(--text-secondary)]">
      <span className="sr-only">Presentación: </span>
      {texto}
    </span>
  );
}
