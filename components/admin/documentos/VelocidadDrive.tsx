"use client";

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, TrendingDown, TrendingUp, Minus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * Cuánto tarda el drive en abrir, medido de verdad.
 *
 * No es un número de laboratorio: lo reporta el navegador de quien lo usa, cada
 * vez que abre la pantalla. Sirve para responder la única pregunta que importa
 * después de una ronda de mejoras — ¿quedó más rápido o me lo estoy imaginando?
 */

interface DiaVelocidad {
  dia: string;
  tramos: Partial<Record<string, { promedio: number; max: number; n: number; docs: number }>>;
}

function segundos(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Verde hasta 1 s, ámbar hasta 3, rojo después: es lo que se siente al usarlo. */
function colorDe(ms: number): string {
  if (ms <= 1000) return "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
  if (ms <= 3000) return "text-[var(--data-warning-500)]";
  return "text-[var(--data-error-500)]";
}

export default function VelocidadDrive() {
  const [dias, setDias] = useState<DiaVelocidad[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/admin/documents/velocidad")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDias(j?.dias ?? []))
      .catch((err) => console.warn("[drive] no se pudo leer el historial de velocidad", err))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Midiendo…
      </div>
    );
  }

  const conListado = (dias ?? []).filter((d) => d.tramos.listado && (d.tramos.listado.n ?? 0) > 0);
  if (conListado.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--rule-base)] dark:border-white/10 p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-1">
          Cuánto tarda en abrir
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)]">
          Todavía no hay mediciones. Se van juntando solas cada vez que abrís esta pantalla.
        </p>
      </div>
    );
  }

  const ultimo = conListado[conListado.length - 1];
  // Los otros dos momentos en que se mira la pantalla sin hacer nada.
  const otrosTramos = ([
    ["visor", "Abrir un documento"],
    ["subida", "Subir un archivo"],
  ] as const)
    .map(([clave, texto]) => {
      const conDato = (dias ?? []).filter((d) => (d.tramos[clave]?.n ?? 0) > 0);
      const ultimoDia = conDato[conDato.length - 1]?.tramos[clave];
      return ultimoDia ? { texto, ms: ultimoDia.promedio, n: ultimoDia.n } : null;
    })
    .filter((x) => x !== null);
  const anterior = conListado.length > 1 ? conListado[conListado.length - 2] : null;
  const hoyMs = ultimo.tramos.listado?.promedio ?? 0;
  const ayerMs = anterior?.tramos.listado?.promedio ?? null;
  // Menos de 10% de diferencia es ruido, no una mejora.
  const delta = ayerMs && ayerMs > 0 ? (hoyMs - ayerMs) / ayerMs : null;
  const tendencia = delta === null ? "igual" : delta < -0.1 ? "mejor" : delta > 0.1 ? "peor" : "igual";

  const maximo = Math.max(...conListado.map((d) => d.tramos.listado?.promedio ?? 0), 1);

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] dark:border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
            Cuánto tarda en abrir
          </CardTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            Medido en tu navegador, cada vez que entrás. Últimos {conListado.length} día(s).
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl font-bold tabular-nums", colorDe(hoyMs))}>{segundos(hoyMs)}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {ultimo.tramos.listado?.n ?? 0} aperturas · {ultimo.tramos.listado?.docs ?? 0} documentos
          </p>
        </div>
      </div>

      {ayerMs !== null && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold",
            tendencia === "mejor"
              ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : tendencia === "peor"
                ? "text-[var(--data-error-500)]"
                : "text-[var(--text-secondary)]",
          )}
        >
          {tendencia === "mejor" ? <TrendingDown className="h-4 w-4" />
            : tendencia === "peor" ? <TrendingUp className="h-4 w-4" />
            : <Minus className="h-4 w-4" />}
          {tendencia === "mejor" ? `Más rápido que el día anterior (${segundos(ayerMs)})`
            : tendencia === "peor" ? `Más lento que el día anterior (${segundos(ayerMs)})`
            : `Igual que el día anterior (${segundos(ayerMs)})`}
        </div>
      )}

      {otrosTramos.length > 0 && (
        <ul className="flex flex-wrap gap-3 border-t border-[var(--rule-soft)] pt-2">
          {otrosTramos.map((t) => (
            <li key={t.texto} className="text-[length:var(--ts-2xs)]">
              <span className="text-[var(--text-tertiary)]">{t.texto}: </span>
              <strong className={cn("tabular-nums", colorDe(t.ms))}>{segundos(t.ms)}</strong>
              <span className="text-[var(--text-tertiary)]"> ({t.n})</span>
            </li>
          ))}
        </ul>
      )}

      {/* Barras simples: la comparación entre días es lo único que hay que leer. */}
      <ul className="space-y-1">
        {conListado.slice(-14).map((d) => {
          const ms = d.tramos.listado?.promedio ?? 0;
          return (
            <li key={d.dia} className="flex items-center gap-2 text-[length:var(--ts-2xs)]">
              <span className="w-12 shrink-0 text-[var(--text-tertiary)] tabular-nums">
                {d.dia.slice(5)}
              </span>
              <span className="flex-1 h-2 rounded-full bg-[var(--surface-sunken)] dark:bg-white/10 overflow-hidden">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    ms <= 1000 ? "bg-[var(--data-success-500)]"
                      : ms <= 3000 ? "bg-[var(--data-warning-500)]"
                      : "bg-[var(--data-error-500)]",
                  )}
                  style={{ width: `${Math.max(3, (ms / maximo) * 100)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-[var(--text-secondary)]">
                {segundos(ms)}
              </span>
            </li>
          );
        })}
      </ul>

      {(ultimo.tramos.listado?.max ?? 0) > (hoyMs * 2) && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          El peor caso de hoy fue {segundos(ultimo.tramos.listado?.max ?? 0)}: alguien esperó bastante
          más que el promedio.
        </p>
      )}
    </div>
  );
}
