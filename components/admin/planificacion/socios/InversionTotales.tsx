"use client";

/**
 * Lo que dice la inversión en cifras (ADR-497): cuánto es, cuánto pusieron
 * los socios, en qué se fue y de dónde salió, y en cuántos meses se recupera
 * con la ganancia que esperas (`totalesInversion()`, lo mismo que lee el
 * Resumen y el plan impreso).
 */
import { useState } from "react";
import { StatCard } from "@buleje/design-system";
import { CalendarClock, PiggyBank, Users } from "@buleje/design-system/icons";
import type { TotalesInversion } from "@/lib/planificacion/calculos";
import { formatCurrency } from "@/lib/format";
import { CAMPO, Campo, leerSoles, mesDentroDe, plural } from "../empresa/campos-plan";

interface Props {
  totales: TotalesInversion;
  ganancia: number | null;
  hoy: string;
  editable: boolean;
  onGanancia: (v: number | null) => void;
}

/** «la recuperas en 14 meses, hacia diciembre de 2027». */
export function fraseRecupero(meses: number, hoy: string): string {
  return `la recuperas en ${plural(meses, "mes", "meses")}, hacia ${mesDentroDe(hoy, meses)}`;
}

export function InversionTotales({ totales: t, ganancia, hoy, editable, onGanancia }: Props) {
  const cubre =
    t.total === 0
      ? "Sin inversión anotada"
      : t.sinCubrirPorSocios > 0
        ? `Faltan ${formatCurrency(t.sinCubrirPorSocios)} de otra fuente`
        : t.sinCubrirPorSocios < 0
          ? `Sobran ${formatCurrency(-t.sinCubrirPorSocios)}`
          : "Cubren toda la inversión";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard density="compact" label="Inversión total" value={formatCurrency(t.total)} icon={PiggyBank} highlight />
        <StatCard density="compact" label="Aportes de socios" value={formatCurrency(t.aportesSocios)} subValue={cubre} icon={Users} />
        <StatCard
          density="compact"
          label="La recuperas en"
          value={t.mesesRecupero ? plural(t.mesesRecupero, "mes", "meses") : "—"}
          subValue={t.mesesRecupero ? `hacia ${mesDentroDe(hoy, t.mesesRecupero)}` : "Escribe cuánto esperas ganar"}
          icon={CalendarClock}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:flex-row sm:items-end">
        <GananciaMensual key={String(ganancia)} valor={ganancia} editable={editable} onGuardar={onGanancia} />
        <span className="text-sm text-[var(--text-secondary)] sm:pb-3">
          {t.mesesRecupero && ganancia
            ? `Con ${formatCurrency(ganancia)} al mes, ${fraseRecupero(t.mesesRecupero, hoy)}.`
            : t.total > 0
              ? "Escribe cuánto esperas ganar al mes y te decimos en cuánto tiempo recuperas la inversión."
              : "Anota primero los gastos de la inversión."}
        </span>
      </div>

      {t.total > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Barras titulo="En qué se fue" filas={t.porCategoria.map((c) => ({ clave: c.categoria, rotulo: c.categoria, monto: c.monto }))} total={t.total} />
          <Barras titulo="De dónde salió" filas={t.porFuente.map((f) => ({ clave: f.fuente, rotulo: f.etiqueta, monto: f.monto }))} total={t.total} />
        </div>
      ) : null}
    </div>
  );
}

function GananciaMensual({ valor, editable, onGuardar }: { valor: number | null; editable: boolean; onGuardar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor));
  const confirmar = () => {
    const v = texto.trim() === "" ? null : leerSoles(texto);
    if (v !== valor && (v !== null || texto.trim() === "")) onGuardar(v);
  };
  return (
    <Campo
      rotulo="¿Cuánto esperas ganar al mes? (S/)"
      ayuda="La ganancia limpia: lo que queda de las ventas después de pagar mercadería, sueldos, alquiler y servicios. No lo que vendes."
      ejemplo="Vendes S/ 15,000 al mes y te quedan S/ 2,500 limpios: escribe 2500."
      className="sm:w-72 sm:shrink-0"
    >
      {(id) => (
        <input
          id={id}
          className={CAMPO}
          inputMode="decimal"
          placeholder="0.00"
          value={texto}
          readOnly={!editable}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
    </Campo>
  );
}

function Barras({ titulo, filas, total }: { titulo: string; filas: { clave: string; rotulo: string; monto: number }[]; total: number }) {
  return (
    <figure className="space-y-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" aria-label={titulo}>
      <figcaption className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</figcaption>
      <ul className="space-y-2">
        {filas.map((f) => {
          const pct = total > 0 ? (f.monto / total) * 100 : 0;
          return (
            <li key={f.clave} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-[var(--text-primary)]">{f.rotulo}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                  {formatCurrency(f.monto)} <span className="text-xs">· {Math.round(pct)} %</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full rounded-full bg-[var(--data-5)]" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
