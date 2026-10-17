"use client";

/**
 * Bloque 1 del alta: ¿quién pone la plata? (ADR-448).
 *
 * Es la decisión que gobierna al resto —hacia dónde va la caja, qué cifra de
 * la persona se mueve, qué se pregunta después— y por eso va primero y en
 * tarjetas grandes. El modal viejo no decía en ninguna parte si la plata salía
 * o entraba: en Blas, dos pagos por aserrío (S/ 3 031) quedaron cargados como
 * plata dada, sin ingreso en la caja.
 */

import { Axe, HandCoins, Landmark, Wallet } from "@buleje/design-system/icons";
import { MODO, MODOS_ALTA, type ModoAlta } from "@/lib/adelantos/modos-alta";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import { CLASE_BLOQUE, ChipCaja, MarcaSeleccion, claseOpcion } from "./piezas";

const ICONO: Record<ModoAlta, typeof HandCoins> = {
  dar: HandCoins,
  abono: Wallet,
  servicio: Axe,
  prestamo: Landmark,
};

export default function QuienPone({ modo, onCambiar }: { modo: ModoAlta; onCambiar: (m: ModoAlta) => void }) {
  return (
    <SeccionForm
      numero={1}
      titulo="¿Quién pone la plata?"
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={{
        what: "Dice de qué lado está la plata. Si la das, sale de tu caja y la persona te la devuelve. Si la recibes, entra a tu caja y tú se la devuelves.",
        affects: "La caja del día, lo que te debe o le debes a la persona, y lo que se pregunta abajo.",
        example: "WASACO te paga S/ 1 731 por el aserrío que le vas a hacer: elige «Me adelantan por un servicio».",
      }}
    >
      <div role="group" aria-label="¿Quién pone la plata?" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {MODOS_ALTA.map((id) => {
          const def = MODO[id];
          const activa = id === modo;
          const Icono = ICONO[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={activa}
              onClick={() => onCambiar(id)}
              /* En el celular una fila (ícono · nombre y caja · marca): cuatro
                 tarjetas altas apiladas eran 720 px antes de llegar a la persona. */
              className={claseOpcion(activa, true, "flex w-full items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2.5")}
            >
              <span className="flex shrink-0 items-start justify-between gap-2 sm:w-full">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    activa ? "bg-primary/15 text-[var(--accent-ink)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  }`}
                >
                  <Icono className="h-5 w-5" aria-hidden />
                </span>
                <span className="hidden sm:block">
                  <MarcaSeleccion activa={activa} />
                </span>
              </span>
              <span className="block min-w-0 flex-1 sm:flex-none">
                <span className="block text-base font-bold leading-snug text-[var(--text-primary)]">{def.titulo}</span>
                <span className="mt-0.5 hidden text-sm font-medium text-[var(--text-secondary)] sm:block">{def.pista}</span>
                <ChipCaja tipo={def.caja} className="mt-1.5 sm:hidden" />
              </span>
              <ChipCaja tipo={def.caja} className="mt-auto hidden self-start sm:inline-flex" />
              <span className="sm:hidden">
                <MarcaSeleccion activa={activa} />
              </span>
            </button>
          );
        })}
      </div>
    </SeccionForm>
  );
}
