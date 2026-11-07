/**
 * Cuánto salió y cuánto queda de una cubicación (Brandon 28-10: «en Guardados
 * diga cuánto se despachó y cuánto sobra»): chip de estado, barra y una línea
 * «Salió X m³ (N pzas) de Y · Queda Z m³». El m³ sale del PT (÷ 424).
 * Sin estado ni efectos: la usan la tarjeta de Guardadas, su ventana de
 * Salidas y «Guardar cubicación».
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { ETIQUETA_ESTADO_SALIDAS, type EstadoSalidas, type SaldoCubicacion } from "@/lib/forestal/cubicacion-salidas";

const CHIP: Record<EstadoSalidas, string> = {
  "sin-salidas": "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  parcial: "bg-[var(--data-info-50)] text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15",
  completo: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15",
  excedido: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15",
};

const RELLENO: Record<EstadoSalidas, string> = {
  "sin-salidas": "bg-[var(--data-info-500)]",
  parcial: "bg-[var(--data-info-500)]",
  completo: "bg-[var(--data-success-500)]",
  excedido: "bg-[var(--data-error-500)]",
};

export function ChipDeSalidas({ estado }: { estado: EstadoSalidas }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-bold ${CHIP[estado]}`} data-estado-salidas={estado}>
      {ETIQUETA_ESTADO_SALIDAS[estado]}
    </span>
  );
}

const m3 = (v: number) => `${fmtM3(v)} m³`;
/* Cada dato entero en su renglón: en una tarjeta angosta «S/» quedaba arriba y la cifra abajo. */
const NOWRAP = "whitespace-nowrap";
const CIFRA = "font-mono font-bold tabular-nums text-[var(--text-primary)]";

export function BarraDeSaldo({ saldo, conChip = true, accion }: {
  saldo: SaldoCubicacion;
  conChip?: boolean;
  /** Un botón al final de la fila del chip (la tarjeta pone «Salidas»). */
  accion?: ReactNode;
}) {
  const { estado, salio, total, queda, valor, porcentaje, fuera } = saldo;
  const nada = estado === "sin-salidas";
  return (
    <div className="space-y-1.5" data-saldo-salidas={estado} data-queda-pt={queda.pt} data-salio-pt={salio.pt}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {conChip && <ChipDeSalidas estado={estado} />}
        <span className="ml-auto font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{porcentaje} %</span>
        {accion}
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-soft)]"
        role="progressbar"
        aria-label="Cuánto salió de la cubicación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <div className={`h-full rounded-full ${RELLENO[estado]}`} style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {nada ? (
          <>Todavía no salió nada · <span className={NOWRAP}>en patio <span className={CIFRA}>{m3(total.m3)}</span> ({fmtPiezas(total.piezas)} pzas)</span></>
        ) : (
          <>
            <span className={NOWRAP}>Salió <span className={CIFRA}>{m3(salio.m3)}</span> ({fmtPiezas(salio.piezas)} pzas)</span>{" "}
            <span className={NOWRAP}>de {m3(total.m3)}</span>
            {" · "}<span className={NOWRAP}>Queda <span className={CIFRA}>{m3(queda.m3)}</span> ({fmtPiezas(queda.piezas)} pzas)</span>
            {valor.total > 0 && <>{" · "}<span className={NOWRAP}>S/ <span className="font-mono tabular-nums">{fmtSoles(valor.salio)}</span> de {fmtSoles(valor.total)}</span></>}
          </>
        )}
      </p>
      {fuera.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-ink)]" data-aviso="salidas-fuera">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {fuera.length === 1 ? "Una línea de un viaje ya no está" : `${fuera.length} líneas de viajes ya no están`} en la cubicación (se volvió a cubicar): corrige ese viaje.
        </p>
      )}
    </div>
  );
}
