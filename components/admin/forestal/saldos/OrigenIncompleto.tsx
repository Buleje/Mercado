"use client";

/**
 * Qué parte del depósito no se puede certificar, con el remedio al lado.
 *
 * Lo que este bloque NO hace: bloquear. El libro admite huecos; el certificado
 * no. Acá se dice cuánto es el hueco, en m³ y en plata de venta (pt), y se
 * abre la ficha donde se arregla — atar los ingresos de los que salió la madera
 * (I1/I2 validan) o completar el título de la guía.
 *
 * El diagnóstico lo arma `lib/forestal/origen-incompleto.ts`, el mismo que va al
 * CSV y al PDF de existencias.
 */

import { CardTitle } from "@buleje/design-system";
import { ChevronRight, ShieldAlert } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fechaLegible } from "@/lib/forestal/capacidad-de-planta";
import {
  MOTIVO_LABEL,
  MOTIVO_REMEDIO,
  type CorridaSinOrigen,
  type ResumenOrigen,
} from "@/lib/forestal/origen-incompleto";

export default function OrigenIncompleto({
  resumen,
  onAbrirCorrida,
}: {
  resumen: ResumenOrigen;
  /** Abre la ficha de la corrida, donde se ata la materia prima. */
  onAbrirCorrida: (c: CorridaSinOrigen) => void;
}) {
  const { corridas, m3SinCertificar, fraccion, porMotivo } = resumen;
  if (corridas.length === 0) return null;
  const pct = Math.round(fraccion * 100);

  return (
    <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            Origen incompleto
          </p>
          <CardTitle
            as="h3"
            className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
          >
            {fmtM3(m3SinCertificar)} m³ del depósito no se pueden certificar
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Es el {pct} % de lo disponible hoy. El libro lo admite; el certificado de origen no.
            Cada fila dice por qué y dónde se arregla.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 text-right text-xs">
          {(Object.keys(porMotivo) as (keyof typeof porMotivo)[])
            .filter((m) => porMotivo[m].corridas > 0)
            .map((m) => (
              <div key={m}>
                <dt className="text-[var(--text-tertiary)]">{MOTIVO_LABEL[m]}</dt>
                <dd className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {fmtM3(porMotivo[m].m3)} m³ · {porMotivo[m].corridas}
                </dd>
              </div>
            ))}
        </dl>
      </div>

      <ul className="mt-4 divide-y divide-[var(--rule-soft)]">
        {corridas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="w-24 shrink-0 text-xs text-[var(--text-tertiary)]">
              {fechaLegible(c.fecha, true)}
            </span>
            <span className="min-w-[7rem] font-mono text-sm font-bold text-[var(--text-primary)]">
              {c.lote ?? "sin lote"}
            </span>
            <span className="min-w-[12rem] text-sm text-[var(--text-secondary)]">
              {c.producto ?? "—"}
              {c.especie && <span className="text-[var(--text-tertiary)]"> · {c.especie}</span>}
            </span>
            <span className="ml-auto font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {c.unidad === "m3" ? `${fmtM3(c.disponible)} m³` : `${c.disponible} ${c.unidad}`}
            </span>
            <span className="w-24 shrink-0 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
              {c.pt == null ? "—" : `${c.pt.toLocaleString("es-PE")} pt`}
            </span>
            <button
              type="button"
              onClick={() => onAbrirCorrida(c)}
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-[var(--accent-dark)] hover:bg-primary/10 dark:hover:bg-primary/20 dark:text-[var(--accent)]"
            >
              {c.motivo === "sin_materia_prima" ? "Atar materia prima" : "Abrir corrida"}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {/* El porqué y el remedio, en la misma fila: un aviso sin salida es
                un aviso que se aprende a ignorar. */}
            <span className="w-full text-xs text-[var(--text-tertiary)]">
              <strong className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                {MOTIVO_LABEL[c.motivo]}.
              </strong>{" "}
              {MOTIVO_REMEDIO[c.motivo]}
              {c.motivo === "ingreso_sin_titulo" &&
                c.guias.length > 0 &&
                ` — guía ${c.guias.join(", ")}`}
              {c.motivo === "sin_materia_prima" &&
                (c.piezasLibresDelLote > 0
                  ? ` · el lote ${c.lote} tiene ${c.piezasLibresDelLote} pieza${c.piezasLibresDelLote === 1 ? "" : "s"} libre${c.piezasLibresDelLote === 1 ? "" : "s"} (${fmtM3(c.m3LibresDelLote)} m³) para atar`
                  : c.lote
                    ? ` · el lote ${c.lote} no tiene piezas libres: su madera ya está atada a otra corrida o el lote nació como inventario`
                    : "")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
