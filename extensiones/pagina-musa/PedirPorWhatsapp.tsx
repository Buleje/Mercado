"use client";

/**
 * «Pedir por WhatsApp» (pie de la bolsa de Musa): nombre, pueblo y forma de
 * pago, y el enlace a `wa.me` con el pedido escrito (`armarMensajePedido`).
 * No crea un pedido en el sistema (decisión de Brandon, 09-10): el pedido
 * llega al WhatsApp de Drucila, que confirma envío y pago.
 *
 * Contraentrega sólo aparece con Ciudad Constitución; si cambian de pueblo
 * con ella elegida, vuelve a Yape. Nombre y pueblo se recuerdan en este
 * navegador para el próximo pedido.
 */
import { useEffect, useId, useState } from "react";
import { MessageCircle } from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";
import {
  armarMensajePedido,
  esPorEncargo,
  pagosPara,
  PUEBLO_SIN_COSTO,
  PUEBLOS,
  type Pago,
  type Pueblo,
} from "./pedido-whatsapp";

/** Código y «por encargo» de cada producto, por id (lo arma el servidor desde la base). */
export type CodigosProductos = Readonly<Record<string, { codigo: string | null; encargo: boolean }>>;

const RECUERDO = "musa-pedido";
/** Lo que se lee en la lista (a 400 px el nombre entero no entra); el mensaje lleva el nombre completo. */
const CORTO: Partial<Record<Pueblo, string>> = { "Ciudad Constitución": "Constitución", "Puerto Bermúdez": "Pto. Bermúdez" };
const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30";
const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-primary)]";
const BOTON =
  "mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] text-base font-semibold text-[var(--surface-canvas)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function PedirPorWhatsapp({ items, codigos }: { items: readonly CartItem[]; codigos: CodigosProductos }) {
  const id = useId();
  const [nombre, setNombre] = useState("");
  const [pueblo, setPueblo] = useState<Pueblo>(PUEBLO_SIN_COSTO);
  const [pago, setPago] = useState<Pago>("Yape");
  const [aviso, setAviso] = useState("");

  // Lo que dejó el pedido anterior en este navegador (sólo nombre y pueblo).
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(RECUERDO) ?? "null") as { nombre?: string; pueblo?: string } | null;
      if (guardado?.nombre) setNombre(guardado.nombre);
      if (guardado?.pueblo && (PUEBLOS as readonly string[]).includes(guardado.pueblo)) setPueblo(guardado.pueblo as Pueblo);
    } catch {
      /* sin almacenamiento (modo privado): se empieza vacío */
    }
  }, []);

  const pagos = pagosPara(pueblo);
  const r = armarMensajePedido({
    lineas: items.map((i) => ({
      nombre: i.name,
      codigo: codigos[String(i.id)]?.codigo ?? null,
      cantidad: i.quantity,
      precio: i.price,
      porEncargo: codigos[String(i.id)]?.encargo ?? esPorEncargo(i.badge),
    })),
    nombre,
    pueblo,
    pago,
  });

  const recordar = () => {
    try {
      localStorage.setItem(RECUERDO, JSON.stringify({ nombre: nombre.trim(), pueblo }));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor={`${id}-nombre`} className={ETIQUETA}>
            Tu nombre
          </label>
          <input
            id={`${id}-nombre`}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setAviso("");
            }}
            autoComplete="given-name"
            maxLength={60}
            placeholder="Ej.: Rosa"
            aria-invalid={aviso ? true : undefined}
            aria-describedby={aviso ? `${id}-aviso` : undefined}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`${id}-pueblo`} className={ETIQUETA}>
            Pueblo
          </label>
          <select
            id={`${id}-pueblo`}
            value={pueblo}
            onChange={(e) => {
              const nuevo = e.target.value as Pueblo;
              setPueblo(nuevo);
              if (!pagosPara(nuevo).includes(pago)) setPago("Yape");
            }}
            className={CAMPO}
          >
            {PUEBLOS.map((p) => (
              <option key={p} value={p}>
                {CORTO[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-pago`} className={ETIQUETA}>
            Forma de pago
          </label>
          <select id={`${id}-pago`} value={pago} onChange={(e) => setPago(e.target.value as Pago)} className={CAMPO}>
            {pagos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {r.ok ? (
        <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={recordar} className={BOTON} data-pedido-whatsapp>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className={BOTON}
          onClick={() => {
            setAviso(r.motivo === "falta_nombre" ? "Escribe tu nombre para que Drucila sepa quién pide." : "Elige otra forma de pago.");
            if (r.motivo === "falta_nombre") document.getElementById(`${id}-nombre`)?.focus();
          }}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
        </button>
      )}
      <p id={`${id}-aviso`} role="status" className="mt-2 min-h-0 text-sm font-semibold text-[var(--mu-acento-tinta)] empty:hidden">
        {aviso}
      </p>
      <p className="mt-2 text-center text-sm leading-snug text-[var(--text-secondary)]">
        Envío gratis en Constitución · fuera, gratis desde S/ 99 · Drucila te confirma el envío y el pago por WhatsApp
      </p>
    </div>
  );
}
