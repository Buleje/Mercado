"use client";

/**
 * Las piezas visuales que comparten el panorama del patio y su lista.
 *
 * Vivían dentro de `CtpTrozasPatio`, que ya pasaba de 400 líneas y del que la
 * lista importaba `puntoDeTono` —una tabla dependiendo de un panel de KPIs sólo
 * para saber de qué color es un punto—. Acá quedan los tres primitivos que las
 * dos pantallas usan y nada más: el color por tono, la pastilla de un corte y
 * la cifra con su desglose colgando.
 */

import type { ComponentType, ReactNode } from "react";
import { Kicker } from "@buleje/design-system";
import { formatNumber } from "@/lib/format";

/** Un icono de Lucide tal como lo re-exporta el DS. */
type IconoDS = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export const n2 = (v: number) => formatNumber(v, { max: 2 });

/** Color por tono, con los tokens del DS (siguen el tema). */
const TONO = {
  ok: { texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", punto: "var(--data-success-500)" },
  info: { texto: "text-[var(--accent-ink)] dark:text-[var(--accent)]", punto: "var(--data-6)" },
  warn: { texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", punto: "var(--data-warning-500)" },
  danger: { texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", punto: "var(--data-error-500)" },
  muted: { texto: "text-[var(--text-secondary)]", punto: "var(--rule-strong)" },
} as const;

export type TonoPatio = keyof typeof TONO;
export const puntoDeTono = (t: TonoPatio) => TONO[t].punto;

/**
 * Un corte del patio, clickeable: filtra la lista de abajo.
 *
 * El punto de color lleva el tono y el número va en el token de texto — medido:
 * `--data-warning-700` da 3.68:1 en light y el número queda ilegible. El color
 * es una marca, no un dato.
 *
 * Borde de 1px en los dos estados: en el panel el grosor es uno solo (ADR-068)
 * y, además, cambiarlo al activarse movía la fila entera un pixel.
 */
export function Pastilla({ activo, punto, label, piezas, m3, titulo, onClick }: {
  activo: boolean; punto: string; label: string; piezas: number; m3: number; titulo?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors ${
        activo
          ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: punto }} aria-hidden="true" />
      <span className="text-xs font-bold text-[var(--text-primary)]">{label}</span>
      <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{piezas}</span>
      <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{n2(m3)} m³</span>
    </button>
  );
}

/**
 * Un número del panorama **con su desglose colgando**.
 *
 * Antes las pastillas («en qué anda», «paradas hace») eran tres filas sueltas
 * debajo de cuatro tarjetas: nada decía que «Libre en patio 45» es de qué está
 * hecho el 45 de la tarjeta, ni que los tramos explican «la más vieja». Ahora
 * el desglose vive DENTRO de la cifra que explica, que es la única forma de que
 * se lean juntos.
 *
 * `heroe` es el que la pantalla contesta primero —«¿cuánta madera tengo parada
 * hoy?»— y por eso pesa distinto. El tinte va con alpha sobre la superficie
 * (`--accent`/8) y no con `--accent-soft`: ese token resuelve a un menta FIJO
 * dentro del panel y en oscuro pintaba un bloque claro con el rótulo gris
 * encima, ilegible.
 */
export function CifraPatio({
  label, valor, nota, tono = "muted", icono: Icono, heroe = false, desglose, explicacion, children,
}: {
  label: string;
  valor: string;
  nota: string;
  tono?: TonoPatio;
  icono?: IconoDS;
  heroe?: boolean;
  /** Cómo se llama lo que cuelga: «En qué anda», «Paradas hace». */
  desglose?: string;
  explicacion?: string;
  children?: ReactNode;
}) {
  const t = TONO[tono];
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        heroe
          ? "border-[var(--accent)] bg-[var(--accent)]/8"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <Kicker as="p" className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        {Icono && <Icono className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </Kicker>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`font-mono font-bold leading-none tabular-nums ${heroe ? "text-3xl" : "text-2xl"} ${
            heroe ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : tono === "muted" ? "text-[var(--text-primary)]" : t.texto
          }`}
        >
          {valor}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">{nota}</span>
      </p>
      {children && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2">
          {desglose && (
            <Kicker as="span" title={explicacion} className="mr-0.5">
              {desglose}
            </Kicker>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Una cifra de apoyo, en una línea: el hueco de trazabilidad y el tamaño de lo
 * leído no merecen una tarjeta cada uno, pero tampoco desaparecer.
 */
export function MicroCifra({ label, valor, nota, tono = "muted", icono: Icono, conteoId }: {
  label: string; valor: string; nota?: string; tono?: TonoPatio; icono?: IconoDS;
  /** Marca la cifra para poder cruzarla contra la lista (`data-conteo`). */
  conteoId?: string;
}) {
  const t = TONO[tono];
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {Icono && <Icono className={`h-3.5 w-3.5 self-center ${t.texto}`} aria-hidden="true" />}
      <Kicker as="span">{label}</Kicker>
      <span
        data-conteo={conteoId}
        className={`font-mono text-sm font-bold tabular-nums ${tono === "muted" ? "text-[var(--text-primary)]" : t.texto}`}
      >
        {valor}
      </span>
      {nota && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{nota}</span>}
    </span>
  );
}
