"use client";

/**
 * Arriba del cajón de la bolsa: cuánto falta para el envío gratis (S/ 99 fuera de
 * Constitución; en Constitución, siempre gratis y la barra llena) y para el regalo
 * de la campaña (desde S/ 150, del 9 nov al 31 dic). Lee el pueblo del pedido
 * (`usePedido`) y las metas de `pedido-whatsapp.ts`, nunca escritas acá. Al
 * cumplir una meta mientras miras: check selva y tres destellos ✦ oro, una vez.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Check, Gift, Truck, type LucideIcon } from "@buleje/design-system/icons";
import {
  avanceEnvio,
  avanceRegalo,
  CAMPANA_REGALO,
  ENVIO_GRATIS_DESDE,
  hoyEnLima,
  solesPedido,
  type Pueblo,
} from "./pedido-whatsapp";

const TRANSICION = "transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)]";

/** Pista de 6 px con el relleno en degradado y un sello chico en la punta. Decorativa: el texto dice lo mismo. */
function Barra({ fraccion, tono }: { fraccion: number; tono: "envio" | "regalo" }) {
  const relleno =
    tono === "envio"
      ? "from-[var(--mu-oro)] to-[var(--mu-selva-tinta)]"
      : "from-[var(--mu-rosa)] to-[var(--mu-rosa-tinta)]";
  return (
    <div aria-hidden="true" className="relative mt-2 h-1.5 rounded-full bg-[var(--rule-soft)]">
      <div
        className={`absolute inset-0 origin-left rounded-full bg-linear-to-r ${relleno} ${TRANSICION}`}
        style={{ transform: `scaleX(${fraccion})` }}
      />
      {/* El sello viaja entre 8 px y el ancho − 8 px: lleno, queda dentro de la pista y no del borde de la tarjeta. */}
      <div className="absolute inset-y-0 left-2 right-2">
        <div
          className={`absolute inset-0 ${TRANSICION}`}
          style={{ transform: `translateX(${fraccion * 100}%)` }}
        >
          <span className="mu-serif absolute left-0 top-1/2 inline-flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--mu-contador-fondo)] text-[10px] leading-none text-[var(--mu-contador-texto)] ring-2 ring-[var(--surface-raised)]">
            M
          </span>
        </div>
      </div>
    </div>
  );
}

/** Tres destellos ✦ oro, una sola vez, cuando la meta se cumple mientras miras. */
function Destellos() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-1 right-0 flex gap-1 text-[var(--mu-oro)]"
    >
      {[0, 120, 240].map((d) => (
        <span
          key={d}
          className="animate-[mu-destello_var(--mu-dur-largo)_var(--mu-ease)_both] text-sm"
          style={{ animationDelay: `${d}ms` }}
        >
          ✦
        </span>
      ))}
    </span>
  );
}

function Fila({
  icono: Icono,
  logrado,
  celebrar,
  barra,
  children,
}: {
  icono: LucideIcon;
  logrado: boolean;
  celebrar: boolean;
  barra: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <p className="flex items-center gap-2 text-[13px] leading-snug text-[var(--text-secondary)]">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${logrado ? "bg-[var(--mu-exito-fondo)] text-[var(--mu-exito)]" : "bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)]"}`}
        >
          {logrado ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Icono className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
        <span>{children}</span>
      </p>
      {barra}
      {celebrar && <Destellos />}
    </div>
  );
}

/** `true` en el render en que `valor` pasa de falso a verdadero, y por 900 ms. */
function useRecienLogrado(valor: boolean): boolean {
  const [antes, setAntes] = useState(valor);
  const [celebrar, setCelebrar] = useState(false);
  if (valor !== antes) {
    setAntes(valor);
    setCelebrar(valor);
  }
  useEffect(() => {
    if (!celebrar) return;
    const t = setTimeout(() => setCelebrar(false), 900);
    return () => clearTimeout(t);
  }, [celebrar]);
  return celebrar;
}

const Monto = ({ n }: { n: number }) => (
  <strong className="font-semibold tabular-nums text-[var(--text-primary)]">
    {solesPedido(n)}
  </strong>
);

export function AvanceBolsa({ subtotal, pueblo }: { subtotal: number; pueblo: Pueblo }) {
  const envio = avanceEnvio(subtotal, pueblo);
  const regalo = avanceRegalo(subtotal, hoyEnLima());
  const celebrarEnvio = useRecienLogrado(envio.logrado && !envio.siempreGratis);
  const celebrarRegalo = useRecienLogrado(Boolean(regalo?.estado === "activa" && regalo.logrado));

  return (
    <section
      aria-label="Envío y regalo"
      className="flex flex-col gap-3 rounded-[var(--mu-radio-control)] bg-[var(--surface-raised)] p-3.5 ring-1 ring-[var(--rule-soft)]"
    >
      <Fila
        icono={Truck}
        logrado={envio.logrado}
        celebrar={celebrarEnvio}
        barra={<Barra fraccion={envio.fraccion} tono="envio" />}
      >
        {envio.siempreGratis ? (
          <>
            <strong className="font-semibold text-[var(--text-primary)]">
              Envío gratis en Constitución
            </strong>{" "}
            · te lo llevamos hasta tu casa
          </>
        ) : envio.logrado ? (
          <strong className="font-semibold text-[var(--mu-exito)]">
            ¡Listo! Tu envío es gratis
          </strong>
        ) : (
          <>
            Te faltan <Monto n={envio.falta} /> para el envío gratis (fuera de Constitución, desde{" "}
            {solesPedido(ENVIO_GRATIS_DESDE)})
          </>
        )}
      </Fila>
      {regalo && (
        <Fila
          icono={Gift}
          logrado={regalo.estado === "activa" && regalo.logrado}
          celebrar={celebrarRegalo}
          barra={
            regalo.estado === "activa" ? <Barra fraccion={regalo.fraccion} tono="regalo" /> : null
          }
        >
          {regalo.estado === "antes" ? (
            <>
              Del 9 de noviembre al 31 de diciembre: desde {solesPedido(CAMPANA_REGALO.monto)}, una{" "}
              {CAMPANA_REGALO.regalo} de regalo
            </>
          ) : regalo.logrado ? (
            <strong className="font-semibold text-[var(--mu-exito)]">
              ¡Te llevas una {CAMPANA_REGALO.regalo} de regalo!
            </strong>
          ) : (
            <>
              Te faltan <Monto n={regalo.falta} /> para tu {CAMPANA_REGALO.regalo} de regalo
            </>
          )}
        </Fila>
      )}
    </section>
  );
}
