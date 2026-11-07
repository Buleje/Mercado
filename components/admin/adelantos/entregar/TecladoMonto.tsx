"use client";

/**
 * Paso 2 de «Entregar adelanto»: cuánto y con qué. La cifra grande arriba, los
 * montos de siempre en chips (50/100/200 y el último de la persona) y un
 * teclado de 3×4 con teclas de 56 px: se usa con el pulgar, sin el teclado del
 * celular tapando media pantalla. En la PC también se puede tipear sobre la
 * cifra (números, punto, borrar).
 *
 * El punto decimal es «.»: así escribe la plata el resto del panel (S/ 120.50).
 */

import { ArrowLeft, Banknote, CreditCard, Landmark, Smartphone, Wallet } from "@buleje/design-system/icons";
import { montoConMoneda } from "@/lib/adelantos/comprobante";
import { METODOS_ENTREGA, type MetodoEntrega } from "@/lib/adelantos/entregar-tipos";
import { CabezaPaso } from "./PasoPersona";
import type { EntregaAdelanto } from "./use-entregar-adelanto";

const MAX_ENTEROS = 7;
const BORRAR = "borrar";

/** El texto del monto después de una tecla (`0-9`, `.` o `borrar`). Puro: lo prueba el test. */
export function teclear(texto: string, tecla: string): string {
  if (tecla === BORRAR) return texto.slice(0, -1);
  if (tecla === "." || tecla === ",") {
    if (texto.includes(".")) return texto;
    return texto === "" ? "0." : `${texto}.`;
  }
  if (!/^\d$/.test(tecla)) return texto;
  const [enteros, decimales] = texto.split(".");
  if (decimales != null) return decimales.length >= 2 ? texto : texto + tecla;
  if (enteros === "0") return tecla;
  return (enteros ?? "").length >= MAX_ENTEROS ? texto : texto + tecla;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", BORRAR] as const;
const CHIPS = [50, 100, 200] as const;

const ICONO: Record<MetodoEntrega, typeof Banknote> = {
  efectivo: Banknote,
  yape: Smartphone,
  plin: Smartphone,
  tarjeta: CreditCard,
  transferencia: Landmark,
};
const ETIQUETA: Record<MetodoEntrega, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

const CHIP =
  "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors disabled:opacity-50";
const chipCls = (activo: boolean) =>
  `${CHIP} ${activo ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-raised)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-secondary)]"}`;

export default function TecladoMonto({ e }: { e: EntregaAdelanto }) {
  /* Respuesta incierta: el monto y el método quedan fijos hasta saber si la entrega salió. */
  const ocupado = e.fase === "guardando" || e.incierto;
  const pasaTope = e.tope != null && e.monto > e.tope;
  const ultimo = e.persona?.ultimoMonto ?? null;
  const metodos: (MetodoEntrega | null)[] = e.ctx?.restringido ? [...METODOS_ENTREGA] : [...METODOS_ENTREGA, null];
  const pulsar = (tecla: string) => e.setMontoTexto((t) => teclear(t, tecla));

  return (
    <section className="space-y-3" aria-label="Cuánto entregas">
      <CabezaPaso
        n={2}
        extra={
          e.tope != null ? (
            <span className={`text-sm font-semibold tabular-nums ${pasaTope ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}`} data-tope-cajero>
              Hasta {montoConMoneda(e.tope)}
            </span>
          ) : undefined
        }
      >
        ¿Cuánto?
      </CabezaPaso>

      <input
        readOnly
        inputMode="none"
        aria-label="Monto a entregar"
        value={`S/ ${e.montoTexto || "0"}`}
        onKeyDown={(ev) => {
          const tecla = ev.key === "Backspace" ? BORRAR : ev.key;
          if (tecla !== BORRAR && !/^[\d.,]$/.test(tecla)) return;
          ev.preventDefault();
          if (!ocupado) pulsar(tecla);
        }}
        className={`h-16 w-full rounded-2xl bg-[var(--surface-sunken)] px-4 text-right font-mono text-4xl font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent-muted)] ${
          e.montoTexto ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
        } ${pasaTope ? "ring-2 ring-[var(--data-error)]" : ""}`}
        data-monto-cifra
      />

      <div className="flex flex-wrap gap-2" aria-label="Montos rápidos">
        {CHIPS.map((n) => (
          <button key={n} type="button" disabled={ocupado} onClick={() => e.setMontoTexto(String(n))} className={chipCls(e.monto === n)}>
            S/ {n}
          </button>
        ))}
        {ultimo != null && !CHIPS.includes(ultimo as (typeof CHIPS)[number]) && (
          <button type="button" disabled={ocupado} onClick={() => e.setMontoTexto(String(ultimo))} className={chipCls(e.monto === ultimo)} data-chip-ultimo>
            Último {montoConMoneda(ultimo)}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado del monto">
        {TECLAS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={ocupado}
            onClick={() => pulsar(t)}
            aria-label={t === BORRAR ? "Borrar un número" : t === "." ? "Punto decimal" : undefined}
            className="flex min-h-14 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-2xl font-bold tabular-nums text-[var(--text-primary)] transition-colors hover:bg-[var(--rule-soft)] active:bg-[var(--rule-base)] disabled:opacity-50"
            data-tecla={t}
          >
            {t === BORRAR ? <ArrowLeft className="h-6 w-6" aria-hidden /> : t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-[var(--text-secondary)]">Con qué</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Con qué entregas">
          {metodos.map((m) => {
            const Icono = m ? ICONO[m] : Wallet;
            const activo = e.metodo === m;
            return (
              <button
                key={m ?? "sin-caja"}
                type="button"
                aria-pressed={activo}
                disabled={ocupado}
                onClick={() => e.setMetodo(m)}
                className={chipCls(activo)}
                data-metodo={m ?? "sin-caja"}
              >
                <Icono className="h-4 w-4" aria-hidden /> {m ? ETIQUETA[m] : "No sale de la caja"}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
