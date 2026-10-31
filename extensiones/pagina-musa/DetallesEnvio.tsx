"use client";

/**
 * «Envío a Constitución · Yape ▾» — el plegable del pie de la bolsa. Cerrado es UNA
 * línea con lo elegido (pueblo y pago ya vienen puestos: Constitución y Yape); abierto,
 * los dos selectores y la letra chica: quién paga la agencia, hasta cuándo hay envíos
 * a provincia para Navidad, la preventa del 10 % y el regalo de la campaña que viene.
 * Contraentrega sólo aparece con Ciudad Constitución (`pagosPara`).
 */
import { useId, type ReactNode } from "react";
import { ChevronDown, MapPin, Truck, Wallet, type LucideIcon } from "@buleje/design-system/icons";
import {
  avanceEnvio,
  avanceRegalo,
  CAMPANA_REGALO,
  ENVIO_GRATIS_DESDE,
  hoyEnLima,
  pagosPara,
  preventaVigente,
  PUEBLO_SIN_COSTO,
  PUEBLOS,
  solesPedido,
  type Pago,
  type Pueblo,
} from "./pedido-whatsapp";
import { avisoEnviosProvincia, NOTA_PREVENTA_10 } from "./preventa";
import type { Pedido } from "./estado-bolsa";

/** Lo que se lee en la lista y en el resumen (a 400 px el nombre entero no entra); el mensaje lleva el completo. */
export const CORTO: Partial<Record<Pueblo, string>> = {
  "Ciudad Constitución": "Constitución",
  "Puerto Bermúdez": "Pto. Bermúdez",
};

const CAMPO =
  "mu-foco h-12 w-full appearance-none rounded-[var(--mu-radio-control)] border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 pr-8 text-base text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:border-[var(--mu-nude-fuerte)] focus:border-[var(--mu-foco)]";

function Selector({
  id,
  etiqueta,
  icono: Icono,
  children,
}: {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">
        {etiqueta}
      </label>
      <div className="relative">
        <Icono
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mu-acento-tinta)]"
          aria-hidden="true"
        />
        {children}
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/** La letra chica del envío, en frases cortas (sin repetir «Drucila te confirma…» en cada una). */
function notasEnvio(pueblo: Pueblo, subtotal: number): string[] {
  const notas: string[] = [];
  if (pueblo === PUEBLO_SIN_COSTO) notas.push("Te lo llevamos gratis hasta tu casa.");
  else if (avanceEnvio(subtotal, pueblo).logrado) notas.push("Envío gratis por agencia.");
  else notas.push(`La agencia la pagas tú (gratis desde ${solesPedido(ENVIO_GRATIS_DESDE)}).`);
  // Fuera de Constitución va por agencia: para Navidad, hasta el 18 dic (manual, «Fechas que más venden»).
  const navidad = pueblo === PUEBLO_SIN_COSTO ? null : avisoEnviosProvincia();
  if (navidad) notas.push(navidad);
  notas.push("Drucila te confirma el envío y el pago por WhatsApp.");
  if (avanceRegalo(subtotal, hoyEnLima())?.estado === "antes")
    notas.push(
      `Del 9 de noviembre al 31 de diciembre, desde ${solesPedido(CAMPANA_REGALO.monto)}: una ${CAMPANA_REGALO.regalo} de regalo.`,
    );
  if (preventaVigente()) notas.push(NOTA_PREVENTA_10);
  return notas;
}

export function DetallesEnvio({ pedido, subtotal }: { pedido: Pedido; subtotal: number }) {
  const id = useId();
  const { pueblo, pago } = pedido;
  return (
    <details className="group rounded-[var(--mu-radio-control)] border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <summary className="mu-foco flex h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
        <Truck className="h-4 w-4 shrink-0 text-[var(--mu-acento-tinta)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          Envío a{" "}
          <strong className="font-semibold text-[var(--text-primary)]">
            {CORTO[pueblo] ?? pueblo}
          </strong>{" "}
          · <strong className="font-semibold text-[var(--text-primary)]">{pago}</strong>
        </span>
        <span className="sr-only">: cambiar dónde y cómo pagas</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-[var(--mu-dur-corto)] group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div data-mu-detalles-envio className="border-t border-[var(--rule-soft)] px-3 pb-3 pt-2.5">
        <div className="grid gap-2.5">
          <Selector id={`${id}-pueblo`} etiqueta="¿A dónde?" icono={MapPin}>
            <select
              id={`${id}-pueblo`}
              value={pueblo}
              onChange={(e) => pedido.setPueblo(e.target.value as Pueblo)}
              className={CAMPO}
            >
              {PUEBLOS.map((p) => (
                <option key={p} value={p}>
                  {CORTO[p] ?? p}
                </option>
              ))}
            </select>
          </Selector>
          <Selector id={`${id}-pago`} etiqueta="¿Cómo pagas?" icono={Wallet}>
            <select
              id={`${id}-pago`}
              value={pago}
              onChange={(e) => pedido.setPago(e.target.value as Pago)}
              className={CAMPO}
            >
              {pagosPara(pueblo).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Selector>
        </div>
        <ul className="mt-2.5 flex flex-col gap-1 text-sm leading-snug text-[var(--text-secondary)]">
          {notasEnvio(pueblo, subtotal).map((n) => (
            <li key={n} data-mu-preventa-10={n === NOTA_PREVENTA_10 || undefined}>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
