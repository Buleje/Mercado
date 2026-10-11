"use client";

/**
 * Arriba del cajón de la bolsa, en UNA línea de chips: el envío gratis (S/ 99 fuera de
 * Constitución; en Constitución, siempre) y, durante la campaña (9 nov – 31 dic), el
 * regalo desde S/ 150. El chip se va llenando por dentro mientras falta (la barra de
 * avance, sin texto extra) y al cumplir la meta pasa a check selva con tres destellos ✦
 * oro, una vez. Antes de la campaña el regalo no sale acá: lo cuenta «Detalles de envío».
 * Lee el pueblo del pedido y las metas de `pedido-whatsapp.ts`, nunca escritas acá.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Check, Gift, Truck, type LucideIcon } from "@buleje/design-system/icons";
import { avanceEnvio, avanceRegalo, hoyEnLima, solesPedido, type Pueblo } from "./pedido-whatsapp";

/** Tres destellos ✦ oro, una sola vez, cuando la meta se cumple mientras miras. */
function Destellos() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-2 right-1 flex gap-1 text-[var(--mu-oro)]"
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

/** Un chip de 32 px: ícono + texto corto; mientras falta, un relleno suave de izquierda a derecha. */
function Chip({
  icono: Icono,
  logrado,
  fraccion,
  celebrar,
  children,
}: {
  icono: LucideIcon;
  logrado: boolean;
  fraccion: number;
  celebrar: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={`relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full px-3 text-sm font-medium ${
        logrado
          ? "bg-[var(--mu-exito-fondo)] text-[var(--mu-exito)]"
          : "bg-[var(--mu-nude-claro)] text-[var(--text-primary)]"
      }`}
    >
      {!logrado && (
        <span
          aria-hidden="true"
          className="absolute inset-0 origin-left bg-[var(--mu-oro-claro)] transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)]"
          style={{ transform: `scaleX(${fraccion})` }}
        />
      )}
      {logrado ? (
        <Check className="relative h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      ) : (
        <Icono
          className="relative h-4 w-4 shrink-0 text-[var(--mu-acento-tinta)]"
          aria-hidden="true"
        />
      )}
      <span className="relative whitespace-nowrap">{children}</span>
      {celebrar && <Destellos />}
    </li>
  );
}

export function AvanceBolsa({ subtotal, pueblo }: { subtotal: number; pueblo: Pueblo }) {
  const envio = avanceEnvio(subtotal, pueblo);
  const regalo = avanceRegalo(subtotal, hoyEnLima());
  const activa = regalo?.estado === "activa" ? regalo : null;
  const celebrarEnvio = useRecienLogrado(envio.logrado && !envio.siempreGratis);
  const celebrarRegalo = useRecienLogrado(Boolean(activa?.logrado));

  return (
    <ul aria-label="Envío y regalo" className="flex flex-wrap gap-2">
      <Chip
        icono={Truck}
        logrado={envio.logrado}
        fraccion={envio.fraccion}
        celebrar={celebrarEnvio}
      >
        {envio.logrado ? "Envío gratis" : `Faltan ${solesPedido(envio.falta)} para envío gratis`}
      </Chip>
      {activa && (
        <Chip
          icono={Gift}
          logrado={activa.logrado}
          fraccion={activa.fraccion}
          celebrar={celebrarRegalo}
        >
          {activa.logrado ? "Con regalo" : `Faltan ${solesPedido(activa.falta)} para tu regalo`}
        </Chip>
      )}
    </ul>
  );
}
