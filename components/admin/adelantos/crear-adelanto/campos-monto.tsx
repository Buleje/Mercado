"use client";

/**
 * Monto, fecha y caja del alta de adelanto — lo que se repite todos los días
 * tiene que estar a UN toque (los montos redondos, «hoy», «efectivo»), y lo
 * raro tiene que seguir siendo posible (cualquier monto, cualquier fecha, no
 * mover caja). Salió de `campos.tsx` (510 líneas) sin cambiar comportamiento.
 */

import {
  ArrowRightLeft,
  Banknote,
  Ban,
  CreditCard,
  Smartphone,
} from "@buleje/design-system/icons";
import { inputCls } from "../shared";
import { formatNumber } from "@/lib/format";

/**
 * De dónde sale la plata. Decide si se anota un egreso en la caja del día.
 *
 * «No mover la caja» existe porque no todo adelanto sale del cajón: una
 * transferencia desde el banco no toca el efectivo, y a veces se carga un
 * adelanto de ayer, cuando esa caja ya cerró. Anotarlo igual descuadraría el
 * arqueo de hoy — que es el problema que esto vino a resolver.
 */
export const ORIGENES_CAJA = [
  { id: "efectivo", label: "Efectivo", Icon: Banknote },
  { id: "yape", label: "Yape", Icon: Smartphone },
  { id: "plin", label: "Plin", Icon: Smartphone },
  { id: "tarjeta", label: "Tarjeta", Icon: CreditCard },
  { id: "transferencia", label: "Transferencia", Icon: ArrowRightLeft },
  { id: "", label: "No mover la caja", Icon: Ban },
] as const;

/** Los montos que se piden de verdad en una bodega, a un toque. */
const MONTOS_RAPIDOS = [50, 100, 200, 500, 1000];

/**
 * Un chip de opción.
 *
 * El estado se dice con RELLENO, no con un borde gris de 2 px: doce chips
 * delineados en la misma pantalla se leen como una reja. El no-elegido vive
 * sobre el fondo hundido y sin borde propio; el elegido se pinta con el color
 * de marca y un anillo fino, que es la única línea que hace falta.
 */
export const chipCls = (activo: boolean) =>
  `inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-base font-bold transition-colors ${
    activo
      ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40"
      : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/60 hover:text-[var(--text-primary)]"
  }`;

// ── Monto ────────────────────────────────────────────────────────────────────
export function MontoRapido({ monto, onCambiar }: { monto: string; onCambiar: (v: string) => void }) {
  return (
    /* Los seis se reparten el ancho de la columna en UNA fila: con `px` fijo
       el último caía solo a un segundo renglón, que se lee como si fuera otra
       cosa. `flex-1` los estira parejo y quedan alineados con el campo. */
    <div className="flex gap-1">
      {MONTOS_RAPIDOS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onCambiar(String(m))}
          className={`h-9 flex-1 rounded-lg px-1 text-sm font-bold tabular-nums transition-colors ${
            Number(monto) === m
              ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {formatNumber(m)}
        </button>
      ))}
      {/* Sumar en vez de reemplazar: «500 y 200 más» es como se arma un monto
          hablando, y obliga a menos tecleo que borrar y reescribir. */}
      <button
        type="button"
        onClick={() => onCambiar(String((Number(monto) || 0) + 100))}
        className="h-9 flex-1 rounded-lg border border-dashed border-[var(--rule-base)] px-1 text-sm font-bold text-[var(--text-tertiary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)]"
      >
        +100
      </button>
    </div>
  );
}

// ── Fecha ────────────────────────────────────────────────────────────────────
const isoDia = (d: Date) => {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
};
export const HOY = () => isoDia(new Date());
const AYER = () => isoDia(new Date(Date.now() - 86_400_000));

/**
 * Cuándo salió la plata.
 *
 * El backend ya aceptaba `fechaAdelanto` y la pantalla no lo exponía: todo
 * quedaba con fecha de hoy. Un adelanto de ayer cargado hoy corría el reloj de
 * la cobranza un día, y en el libro aparecía en el día equivocado.
 */
export function FechaAdelanto({ fecha, onCambiar }: { fecha: string; onCambiar: (v: string) => void }) {
  const hoy = HOY();
  const ayer = AYER();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onCambiar(hoy)} className={chipCls(fecha === hoy)}>
          Hoy
        </button>
        <button type="button" onClick={() => onCambiar(ayer)} className={chipCls(fecha === ayer)}>
          Ayer
        </button>
      </div>
      {/* El calendario en su propia fila y a lo ancho: al lado de los chips el
          control nativo quedaba estrujado y la fecha se leía cortada. */}
      <input
        type="date"
        value={fecha}
        max={hoy}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label="Fecha del adelanto"
        className={`${inputCls} h-11 tabular-nums`}
      />
    </div>
  );
}

// ── Origen de la plata ───────────────────────────────────────────────────────
export function OrigenCaja({ metodo, onCambiar }: { metodo: string; onCambiar: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORIGENES_CAJA.map((o) => (
        <button key={o.id || "sin-caja"} type="button" onClick={() => onCambiar(o.id)} className={chipCls(metodo === o.id)}>
          <o.Icon className="h-4 w-4 shrink-0" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}
