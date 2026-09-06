"use client";

/**
 * CtpRadarCronologia — la cadena de custodia en el tiempo.
 *
 * Tres carriles (ingreso · producción · despacho) sobre un mismo eje de fechas.
 * Lo que se busca de un vistazo es la línea que va HACIA ATRÁS: una corrida a
 * la izquierda de la GTF que la surtió, o un despacho a la izquierda de su
 * corrida. Eso es un imposible físico y es de lo primero que cruza una
 * fiscalización.
 *
 * Todo el cálculo vive en `lib/forestal/ctp-radar-tiempo.ts` (puro, con tests).
 */

import { AlertTriangle, Boxes, Clock, PackageOpen, Truck } from "@buleje/design-system/icons";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";
import {
  fechaCorta,
  posicionEnEje,
  PERMANENCIA_LARGA_DIAS,
  type AnalisisTiempo,
} from "@/lib/forestal/ctp-radar-tiempo";

const W = 1000;
const CARRIL_H = 62;
const PAD_X = 54;
const PAD_Y = 26;
const H = PAD_Y * 2 + CARRIL_H * 3;

const CARRILES = [
  { key: "ingreso", label: "Ingreso", color: "var(--accent)", icon: PackageOpen },
  { key: "corrida", label: "Producción", color: "var(--data-info-500)", icon: Boxes },
  { key: "despacho", label: "Despacho", color: "var(--data-success-600)", icon: Truck },
] as const;

interface Punto {
  id: string;
  carril: number;
  x: number;
  y: number;
  etiqueta: string;
  fecha: string;
  anomalo: boolean;
}

export default function CtpRadarCronologia({
  g, t, onVerNodo,
}: {
  g: TrazaGrafo;
  t: AnalisisTiempo;
  onVerNodo: (id: string) => void;
}) {
  const anomalos = new Set(t.anomalias.flatMap((a) => [a.nodoId, a.contraId]));

  // Un punto por línea del libro, ubicado por su fecha. Las que caen el mismo
  // día se escalonan dentro del carril para no quedar una encima de otra.
  const usados = new Map<string, number>();
  const ubicar = (id: string, fecha: string, carril: number, etiqueta: string): Punto | null => {
    const p = posicionEnEje(fecha, t.desde, t.hasta);
    if (p == null) return null;
    const x = PAD_X + p * (W - PAD_X * 2);
    const k = `${carril}:${Math.round(x)}`;
    const n = usados.get(k) ?? 0;
    usados.set(k, n + 1);
    const base = PAD_Y + carril * CARRIL_H + CARRIL_H / 2;
    return { id, carril, x, y: base + (n % 3) * 11 - 11, etiqueta, fecha, anomalo: anomalos.has(id) };
  };

  const puntos: Punto[] = [
    ...g.ingresos.map((w) => ubicar(w.id, w.fecha, 0, `GTF ${w.gtf || "—"}`)),
    ...g.corridas.map((c) => ubicar(c.id, c.fecha, 1, `Corrida #${c.lineNo}`)),
    ...g.despachos.map((d) => ubicar(d.id, d.fecha, 2, `Despacho #${d.lineNo}`)),
  ].filter((p): p is Punto => p !== null);

  const pos = new Map(puntos.map((p) => [p.id, p]));

  if (!t.desde || !t.hasta) {
    return <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">Sin fechas para ubicar en el tiempo.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Resumen temporal */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Ficha
          icon={Clock}
          valor={t.permanenciaMediaDias != null ? `${t.permanenciaMediaDias} d` : "—"}
          label="Permanencia media en planta"
          hint={t.permanenciaMediaDias == null ? "Ninguna cadena llegó todavía a un despacho" : "Del ingreso de la troza a su salida como producto"}
        />
        <Ficha
          icon={AlertTriangle}
          valor={t.dormidos.length}
          tono={t.dormidos.length > 0 ? "warning" : undefined}
          label={`Guías paradas +${PERMANENCIA_LARGA_DIAS} días`}
          hint="Madera que entró y todavía no salió"
        />
        <Ficha
          icon={AlertTriangle}
          valor={t.anomalias.length}
          tono={t.anomalias.length > 0 ? "danger" : undefined}
          label="Fechas imposibles"
          hint="Un eslabón fechado antes que el eslabón del que sale"
        />
      </div>

      {/* Anomalías accionables */}
      {t.anomalias.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 dark:bg-[var(--data-error-500)]/12">
          <p className="mb-1 flex items-center gap-2 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {t.anomalias.length === 1 ? "Una fecha imposible" : `${t.anomalias.length} fechas imposibles`}
          </p>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Un eslabón no puede ser anterior a aquel del que sale. Suele ser un error de tipeo en la fecha, pero es exactamente lo que una fiscalización cruza contra las guías.
          </p>
          <ul className="space-y-2">
            {t.anomalias.map((a, i) => (
              <li key={`${a.nodoId}-${a.contraId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-bold text-[var(--text-primary)]">{a.etiqueta}</span>
                  <span className="text-[var(--text-tertiary)]"> · {a.detalle}</span>
                  <span className="ml-1 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">({a.dias} {a.dias === 1 ? "día" : "días"} al revés)</span>
                </span>
                <button type="button" onClick={() => onVerNodo(a.nodoId)} className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-600)]">
                  Corregir fecha
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Eje */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] to-[var(--surface-sunken)] p-3">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} className="max-w-none" style={{ minWidth: "100%" }} role="img" aria-label="Cronología de la cadena de custodia">
          {CARRILES.map((c, i) => (
            <g key={c.key}>
              <rect x={PAD_X - 8} y={PAD_Y + i * CARRIL_H} width={W - PAD_X * 2 + 16} height={CARRIL_H - 6} rx={10} fill={i % 2 === 0 ? "var(--surface-sunken)" : "transparent"} opacity={0.6} />
              <text x={8} y={PAD_Y + i * CARRIL_H + CARRIL_H / 2 + 3} fontSize={10} fontWeight={700} fill="var(--text-tertiary)">{c.label}</text>
            </g>
          ))}

          {/* Extremos del período */}
          <text x={PAD_X} y={14} fontSize={10} fontWeight={700} fill="var(--text-secondary)" textAnchor="start">{fechaCorta(t.desde)}</text>
          <text x={W - PAD_X} y={14} fontSize={10} fontWeight={700} fill="var(--text-secondary)" textAnchor="end">{fechaCorta(t.hasta)}</text>

          {/* Enlaces normales: tenues, sólo para ver el recorrido. */}
          {[...g.consumos.map((e) => ({ ...e, v: e.volumeM3 })), ...g.origenes.map((e) => ({ ...e, v: e.quantity }))].map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const alRevés = b.x < a.x;
            return (
              <line
                key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={alRevés ? "var(--data-error-500)" : "var(--rule-base)"}
                strokeWidth={alRevés ? 2 : 1}
                strokeDasharray={alRevés ? "4 3" : undefined}
                opacity={alRevés ? 0.9 : 0.5}
              />
            );
          })}

          {puntos.map((p) => (
            <g key={p.id} onClick={() => onVerNodo(p.id)} style={{ cursor: "pointer" }} role="button" aria-label={`${p.etiqueta} — ${fechaCorta(p.fecha)}`}>
              <circle cx={p.x} cy={p.y} r={p.anomalo ? 7 : 5} fill={p.anomalo ? "var(--data-error-500)" : CARRILES[p.carril].color} stroke="var(--surface-raised)" strokeWidth={2} />
              <title>{`${p.etiqueta} · ${fechaCorta(p.fecha)}`}</title>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        Cada punto es una línea del libro en su fecha. Una línea roja punteada va hacia atrás en el tiempo: el eslabón de destino es anterior al de origen.
      </p>
    </div>
  );
}

function Ficha({
  icon: Icon, valor, label, hint, tono,
}: {
  icon: typeof Clock; valor: string | number; label: string; hint: string; tono?: "warning" | "danger";
}) {
  const color = tono === "danger"
    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    : tono === "warning"
      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-primary)]";
  const borde = tono === "danger" ? "border-[var(--data-error-500)]" : tono === "warning" ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]";
  return (
    <div className={`rounded-2xl border-2 ${borde} bg-[var(--surface-raised)] px-3.5 py-3`} title={hint}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
        <span className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>{valor}</span>
      </div>
      <p className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase leading-tight tracking-wide text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}
