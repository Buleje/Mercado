"use client";

/**
 * Un renglón de la planilla «Anotar D1 y D2»: la pieza, sus dos casillas y lo
 * que dicen mientras se tipea —el Ø medio y si el volumen de Huber con esas
 * puntas se parece al declarado—. Un D1 de 640 en vez de 64 se ve acá, antes
 * de guardarlo, y no en el certificado.
 */

import type { KeyboardEvent } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MAX_DIAMETRO_CM } from "@/lib/forestal/medidas-troza";
import { diametroEquivalenteCm, medidasDePieza, volumenHuberM3 } from "@/lib/forestal/trozas-patio-medidas";
import { n, NUM } from "./ctp-trozas-lista-shared";
import { cm } from "./ctp-trozas-medidas-ui";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface ValoresMedida {
  d1: string;
  d2: string;
}

/** «64», «63,5» o «63.5» → número; vacío → null; basura → NaN (se marca). */
export const leerCm = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number(t);
};

export const medidaInvalida = (v: number | null) => v != null && (!Number.isFinite(v) || v <= 0 || v > MAX_DIAMETRO_CM);

/** Cuánto se aparta el volumen de Huber del declarado, como fracción. */
export function desvioHuber(t: TrozaPatioAPI, d1: number | null, d2: number | null): number | null {
  const h = volumenHuberM3(d1, d2, t.largoM);
  if (h == null || t.volumenM3 == null || t.volumenM3 <= 0) return null;
  return (h - t.volumenM3) / t.volumenM3;
}

const CASILLA =
  "h-9 w-20 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpTrozasMedirFila({
  t, valores, onCambio, indice, error, autoFocus,
}: {
  t: TrozaPatioAPI;
  valores: ValoresMedida;
  onCambio: (v: ValoresMedida) => void;
  /** Posición en la planilla: Enter salta a la casilla siguiente. */
  indice: number;
  /** Lo que el servidor rechazó de esta pieza (mes cerrado, etc.). */
  error?: string;
  autoFocus?: boolean;
}) {
  const ya = medidasDePieza(t);
  const d1 = ya.d1 ?? leerCm(valores.d1);
  const d2 = ya.d2 ?? leerCm(valores.d2);
  const malo1 = ya.d1 == null && medidaInvalida(leerCm(valores.d1));
  const malo2 = ya.d2 == null && medidaInvalida(leerCm(valores.d2));
  const equivalente = diametroEquivalenteCm(t.volumenM3, t.largoM);
  const desvio = !malo1 && !malo2 ? desvioHuber(t, d1, d2) : null;
  const lejos = desvio != null && Math.abs(desvio) > 0.1;

  /* Enter = siguiente casilla, como en una planilla de papel. */
  const alEnter = (ev: KeyboardEvent<HTMLInputElement>, propio: number) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    /* La siguiente casilla QUE EXISTA: si una pieza ya trae su D1, el salto
       pasa directo a su D2. */
    const sig = [...document.querySelectorAll<HTMLInputElement>("[data-medir-idx]")].find(
      (el) => Number(el.dataset.medirIdx) > propio,
    );
    sig?.focus();
    sig?.select();
  };
  const pista = equivalente != null ? `≈${equivalente}` : "cm";
  const titPista = equivalente != null
    ? `Con ${fmtM3(t.volumenM3 ?? 0)} m³ y ${n(t.largoM)} m, el diámetro medio ronda ${equivalente} cm (Huber). Es una pista, no se guarda.`
    : undefined;

  return (
    <tr className={error ? "bg-[var(--data-error-500)]/8" : undefined}>
      <td className="whitespace-nowrap font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</td>
      <td className="whitespace-nowrap text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
      <td className="whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>{n(t.largoM)}</td>
      <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{t.volumenM3 == null ? "—" : fmtM3(t.volumenM3)}</td>
      {(["d1", "d2"] as const).map((k, j) => {
        const fijo = k === "d1" ? ya.d1 : ya.d2;
        const malo = k === "d1" ? malo1 : malo2;
        return (
          <td key={k} className="text-right">
            {fijo != null ? (
              <span className="font-mono tabular-nums text-[var(--text-secondary)]" title="Ya está cargado: no se pisa">{cm(fijo)}</span>
            ) : (
              <input
                inputMode="decimal"
                autoFocus={autoFocus && j === 0}
                data-medir-idx={indice * 2 + j}
                value={valores[k]}
                onChange={(e) => onCambio({ ...valores, [k]: e.target.value })}
                onKeyDown={(e) => alEnter(e, indice * 2 + j)}
                placeholder={pista}
                title={titPista}
                aria-label={`${k.toUpperCase()} en cm de ${t.codificacion ?? t.codigoPlanta ?? "la pieza"}`}
                aria-invalid={malo || undefined}
                className={`${CASILLA} ${malo ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)] focus:border-[var(--accent)]"}`}
              />
            )}
          </td>
        );
      })}
      <td className={`${NUM} text-xs`}>
        {error ? (
          <span className="font-sans font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</span>
        ) : malo1 || malo2 ? (
          <span className="font-sans font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">entre 0 y {MAX_DIAMETRO_CM} cm</span>
        ) : desvio != null ? (
          <span
            title={`Huber con esas puntas da ${fmtM3(volumenHuberM3(d1, d2, t.largoM) ?? 0)} m³ contra ${fmtM3(t.volumenM3 ?? 0)} m³ declarados`}
            className={lejos ? "rounded-md bg-[var(--data-warning-500)]/18 px-1.5 font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}
          >
            {desvio > 0 ? "+" : ""}{Math.round(desvio * 100)} %{lejos ? " · revisa" : ""}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
    </tr>
  );
}
