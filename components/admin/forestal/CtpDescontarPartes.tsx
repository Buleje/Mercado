"use client";

/**
 * Las piezas chicas de «Descontar la madera usada»: el reparto corrida por
 * corrida, lo que frena una especie y lo que queda fuera de todas las tandas.
 * Una línea por cosa + ⓘ con el detalle (Brandon, 24-09: «mucho texto»).
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";
import type { CorridaDelReparto, PlanDescontar } from "@/lib/forestal/vincular-desde-permiso";
import type { LineaDeFreno } from "@/lib/forestal/vincular-desde-permiso-frenos";
import { plural } from "./permiso-volumen-ui";

const FRENO_CORTO = {
  fecha: "entró después",
  "sin-trozas": "sin trozas",
  "se-acabo": "sin madera",
  regla: "no cuadra",
} as const;

/**
 * Cada corrida con lo que le tocaría: su rendimiento, o por qué no va. La que
 * pasa el 56 % lo dice en palabras —se firma igual (es aviso), pero se ve antes.
 */
export function ChipsDelReparto({ reparto }: { reparto: readonly CorridaDelReparto[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Qué le toca a cada corrida">
      {reparto.map((r) => {
        const tono = r.frena
          ? "border-[var(--rule-base)] text-[var(--text-tertiary)]"
          : r.pasaElTope
            ? "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]"
            : "border-[var(--rule-soft)] text-[var(--text-secondary)]";
        return (
          <li key={r.corrida.id} className={`rounded-lg border px-2 py-1 text-xs tabular-nums ${tono}`}>
            <b className="font-mono">N° {r.corrida.lineNo ?? "—"}</b> ·{" "}
            {r.frena
              ? FRENO_CORTO[r.frena]
              : r.rendimientoPct != null
                ? `rinde ${fmtPct(r.rendimientoPct)} %${r.pasaElTope ? ` · pasa el ${TOPE_RENDIMIENTO_PCT} %` : ""}`
                : "—"}
          </li>
        );
      })}
    </ul>
  );
}

/** Lo que frena a una especie: una línea por causa, con el camino para arreglarlo. */
export function LineasDeFreno({ lineas }: { lineas: readonly LineaDeFreno[] }) {
  if (lineas.length === 0) return null;
  return (
    <ul className="space-y-1">
      {lineas.map((l) => (
        <li key={l.clave} className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1">{l.texto}</span>
          {l.detalle.length > 0 && (
            <InfoTip
              title="Cuáles"
              side="left"
              ariaLabel={`Detalle: ${l.texto.slice(0, 60)}`}
              body={
                <>
                  {l.detalle.slice(0, 14).map((d) => (
                    <span key={d} className="block font-mono text-xs tabular-nums">
                      {d}
                    </span>
                  ))}
                  {l.detalle.length > 14 && <span className="block text-xs">y {l.detalle.length - 14} más</span>}
                </>
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lo que queda fuera de las tandas, en una línea cada cosa + ⓘ: corridas sin m³
 * o sin especie, trozas del permiso sin corrida de su especie, y el patio que
 * no entró entero en la lectura. Nada se esconde: se dice y se explica al lado.
 */
export function NotasDelPlan({
  plan,
  truncado,
}: {
  plan: PlanDescontar;
  truncado: { hay: number; leidas: number } | null;
}) {
  return (
    <>
      {truncado && (
        <p className="text-sm text-[var(--data-warning-ink)]">
          Se leyeron {truncado.leidas} de {truncado.hay} trozas: puede faltar alguna.
        </p>
      )}
      {plan.apartadas.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span className="min-w-0 flex-1">
            {plural(plan.apartadas.length, "corrida no entra", "corridas no entran")} acá: sin m³ o sin especie.
          </span>
          <InfoTip
            title="Corrígelas en Producción"
            what="Una corrida en kg o unidades, o sin especie, no se puede comparar con la troza."
            side="left"
            body={plan.apartadas.map((a) => (
              <span key={a.id} className="block font-mono text-xs">
                N° {a.lineNo ?? "—"} · {a.especie ?? "sin especie"} · {a.motivo === "sin-volumen" ? "sin m³" : "sin especie"}
              </span>
            ))}
          />
        </p>
      )}
      {plan.trozasSinCorrida.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span className="min-w-0 flex-1">
            {plural(
              plan.trozasSinCorrida.reduce((a, t) => a + t.trozas, 0),
              "troza libre del permiso",
              "trozas libres del permiso",
            )}{" "}
            sin corrida de su especie.
          </span>
          <InfoTip
            title="Trozas sin corrida de su especie"
            what="Si alguna es la misma madera con otro nombre, corrige la especie y aparece arriba."
            side="left"
            body={plan.trozasSinCorrida.map((t) => (
              <span key={t.especie} className="block font-mono text-xs tabular-nums">
                {t.especie} · {t.trozas} · {fmtM3(t.m3)} m³
              </span>
            ))}
          />
        </p>
      )}
    </>
  );
}
