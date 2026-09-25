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
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fechaLegible } from "@/lib/forestal/capacidad-de-planta";
import {
  MOTIVO_LABEL,
  MOTIVO_REMEDIO,
  type CorridaSinOrigen,
  type ResumenOrigen,
} from "@/lib/forestal/origen-incompleto";
import { formatNumber } from "@/lib/format";

export default function OrigenIncompleto({
  resumen,
  onAbrirCorrida,
  onDeclararApertura,
}: {
  resumen: ResumenOrigen;
  /** Abre la ficha de la corrida, donde se ata la materia prima. */
  onAbrirCorrida: (c: CorridaSinOrigen) => void;
  /** Declara (o deshace) que la corrida es existencia de apertura (ADR-394). */
  onDeclararApertura?: (c: CorridaSinOrigen, deshacer: boolean) => void;
}) {
  const { corridas, apertura, m3SinCertificar, m3Apertura, fraccion, porMotivo } = resumen;
  if (corridas.length === 0 && apertura.length === 0) return null;
  const pct = Math.round(fraccion * 100);

  /* Sólo apertura: no hay hueco que corregir; se dice en calma, sin rojo. */
  if (corridas.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle
          as="h3"
          className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
        >
          Origen completo, salvo la existencia de apertura
        </CardTitle>
        <ListaApertura
          apertura={apertura}
          m3Apertura={m3Apertura}
          onDeclararApertura={onDeclararApertura}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-ink)]">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            Origen incompleto
          </p>
          <div className="flex items-center gap-1.5">
            <CardTitle
              as="h3"
              className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
            >
              {fmtM3(m3SinCertificar)} m³ del depósito no se pueden certificar
            </CardTitle>
            <InfoTip
              title="Origen incompleto"
              what="El libro admite huecos; el certificado de origen no."
              affects="Cada fila dice por qué y dónde se arregla."
            />
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Es el {pct} % de lo disponible hoy.</p>
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
              {c.pt == null ? "—" : `${formatNumber(c.pt)} pt`}
            </span>
            <button
              type="button"
              onClick={() => onAbrirCorrida(c)}
              className="inline-flex min-h-8 items-center gap-0.5 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
            >
              {c.motivo === "sin_materia_prima" ? "Atar materia prima" : "Abrir corrida"}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            {/* La otra salida honesta cuando no hay qué atar: declarar que la
                madera es anterior al libro (ADR-394). Sólo para corridas sin
                consumos — con guía atada tienen origen. */}
            {onDeclararApertura && c.motivo === "sin_materia_prima" && (
              <button
                type="button"
                onClick={() => onDeclararApertura(c, false)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                Es existencia de apertura
              </button>
            )}
            {/* El porqué y el remedio, en la misma fila: un aviso sin salida es
                un aviso que se aprende a ignorar. */}
            <span className="w-full text-xs text-[var(--text-tertiary)]">
              <strong className="text-[var(--data-warning-ink)]">{MOTIVO_LABEL[c.motivo]}.</strong>{" "}
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

      {apertura.length > 0 && (
        <ListaApertura
          apertura={apertura}
          m3Apertura={m3Apertura}
          onDeclararApertura={onDeclararApertura}
        />
      )}
    </div>
  );
}

/**
 * Las existencias de apertura: aparte y sin rojo. No son un hueco a corregir,
 * son madera anterior al libro — pero tampoco se certifican, y se dice.
 */
function ListaApertura({
  apertura,
  m3Apertura,
  onDeclararApertura,
}: {
  apertura: CorridaSinOrigen[];
  m3Apertura: number;
  onDeclararApertura?: (c: CorridaSinOrigen, deshacer: boolean) => void;
}) {
  if (apertura.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Existencia de apertura · {fmtM3(m3Apertura)} m³ en {apertura.length}{" "}
        {apertura.length === 1 ? "corrida" : "corridas"}
        <InfoTip
          icono="ayuda"
          title="Existencia de apertura"
          what="Madera anterior al libro: no hay guía ni piezas que atar."
          affects="No es un hueco a corregir, pero tampoco se puede certificar desde este libro (ADR-394)."
        />
      </p>
      <ul className="mt-2 divide-y divide-[var(--rule-soft)]">
        {apertura.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
            <span className="w-24 shrink-0 text-xs text-[var(--text-tertiary)]">
              {fechaLegible(c.fecha, true)}
            </span>
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {c.lote ?? "sin lote"}
            </span>
            <span className="text-[var(--text-secondary)]">{c.producto ?? "—"}</span>
            <span className="ml-auto font-mono tabular-nums text-[var(--text-primary)]">
              {c.unidad === "m3" ? `${fmtM3(c.disponible)} m³` : `${c.disponible} ${c.unidad}`}
            </span>
            <span className="w-full text-xs text-[var(--text-tertiary)]">
              {c.apertura?.importada
                ? "Importada del libro SNIFFS como inventario de apertura"
                : `Declarada${c.apertura?.por ? ` por ${c.apertura.por}` : ""}${c.apertura?.el ? ` el ${fechaLegible(c.apertura.el, false)}` : ""}${c.apertura?.motivo ? ` · ${c.apertura.motivo}` : ""}`}
              {onDeclararApertura && !c.apertura?.importada && (
                <button
                  type="button"
                  onClick={() => onDeclararApertura(c, true)}
                  aria-label={`Quitar la existencia de apertura de la corrida ${c.lote ?? ""}`.trim()}
                  className="ml-2 inline-flex min-h-6 items-center rounded px-1.5 font-bold underline underline-offset-2 hover:bg-[var(--surface-sunken)]"
                >
                  quitar
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
