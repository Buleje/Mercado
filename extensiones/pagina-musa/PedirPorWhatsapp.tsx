"use client";

/**
 * El pedido de la bolsa de Musa. No crea un pedido en el sistema (decisión de
 * Brandon, 09-10): llega al WhatsApp de Drucila, que confirma envío y pago.
 *
 * · El estado (nombre, pueblo y pago) es `usePedido` de `estado-bolsa.ts`: vive
 *   en el cajón porque el pueblo lo leen la barra de envío y el formulario.
 * · (La barra de envío gratis y del regalo, arriba del cajón, es `AvanceBolsa.tsx`.)
 * · `PedirPorWhatsapp` — el formulario compacto y el enlace a `wa.me` con el
 *   mensaje de `armarMensajePedido` (su formato no cambia: lo cuida su test).
 *
 * Contraentrega sólo aparece con Ciudad Constitución; si cambian de pueblo con
 * ella elegida, vuelve a Yape.
 */
import { useId, useState, type ReactNode } from "react";
import {
  ChevronDown,
  MapPin,
  MessageCircle,
  User,
  Wallet,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";
import {
  armarMensajePedido,
  avanceEnvio,
  ENVIO_GRATIS_DESDE,
  esPorEncargo,
  pagosPara,
  PUEBLO_SIN_COSTO,
  preventaVigente,
  PUEBLOS,
  solesPedido,
  type Pago,
  type Pueblo,
} from "./pedido-whatsapp";
import { avisoEnviosProvincia, NOTA_PREVENTA_10 } from "./preventa";
import type { Pedido } from "./estado-bolsa";

/**
 * Lo que el servidor sabe de cada producto, por id (`cargarMarco().codigos`). `codigo`
 * y `encargo` escriben el pedido; el resto (opcional) dibuja «Drucila te sugiere»:
 * con `componentes` el producto es un kit o dúo.
 */
export interface InfoProducto {
  codigo: string | null;
  encargo: boolean;
  nombre?: string;
  precio?: number;
  imagen?: string;
  categoria?: string;
  unidad?: string;
  componentes?: readonly string[];
}
export type CodigosProductos = Readonly<Record<string, InfoProducto>>;

/** Lo que se lee en la lista (a 400 px el nombre entero no entra); el mensaje lleva el nombre completo. */
const CORTO: Partial<Record<Pueblo, string>> = {
  "Ciudad Constitución": "Constitución",
  "Puerto Bermúdez": "Pto. Bermúdez",
};

/* ── El formulario y el botón ─────────────────────────────────────────────── */

const CAMPO =
  "h-12 w-full appearance-none rounded-[var(--mu-radio-control)] border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 text-base text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] placeholder:text-[var(--text-tertiary)] hover:border-[var(--mu-nude-fuerte)] focus:border-[var(--mu-foco)] aria-invalid:border-[var(--mu-encargo)] mu-foco";

function Campo({
  id,
  etiqueta,
  icono: Icono,
  flecha = false,
  className = "",
  children,
}: {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  flecha?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">
        {etiqueta}
      </label>
      <div className="relative">
        <Icono
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mu-acento-tinta)]"
          aria-hidden="true"
        />
        {children}
        {flecha && (
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

const BOTON =
  "mu-foco mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--mu-whatsapp-fondo)] text-base font-semibold text-[var(--mu-whatsapp-texto)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[.97]";

function notaEnvio(pueblo: Pueblo, subtotal: number): string {
  if (pueblo === PUEBLO_SIN_COSTO)
    return "Te lo llevamos gratis. Drucila te confirma el pago por WhatsApp.";
  // Fuera de Constitución va por agencia: para Navidad, hasta el 18 dic (manual, «Fechas que más venden»).
  const navidad = avisoEnviosProvincia();
  const fin = navidad ? ` ${navidad}` : "";
  if (avanceEnvio(subtotal, pueblo).logrado)
    return `Envío gratis por agencia. Drucila te confirma el envío y el pago por WhatsApp.${fin}`;
  return `La agencia la pagas tú (gratis desde ${solesPedido(ENVIO_GRATIS_DESDE)}). Drucila te confirma el envío y el pago por WhatsApp.${fin}`;
}

export function PedirPorWhatsapp({
  items,
  codigos,
  pedido,
  subtotal,
}: {
  items: readonly CartItem[];
  codigos: CodigosProductos;
  pedido: Pedido;
  subtotal: number;
}) {
  const id = useId();
  const [aviso, setAviso] = useState("");
  const { nombre, pueblo, pago } = pedido;
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
    preventa10: preventaVigente(),
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        <Campo id={`${id}-nombre`} etiqueta="Tu nombre" icono={User} className="col-span-2">
          <input
            id={`${id}-nombre`}
            value={nombre}
            onChange={(e) => {
              pedido.setNombre(e.target.value);
              setAviso("");
            }}
            autoComplete="given-name"
            maxLength={60}
            placeholder="Para que Drucila sepa quién pide"
            aria-invalid={aviso ? true : undefined}
            aria-describedby={aviso ? `${id}-aviso` : undefined}
            className={`${CAMPO} pr-3`}
          />
        </Campo>
        <Campo id={`${id}-pueblo`} etiqueta="¿A dónde te lo enviamos?" icono={MapPin} flecha>
          <select
            id={`${id}-pueblo`}
            value={pueblo}
            onChange={(e) => pedido.setPueblo(e.target.value as Pueblo)}
            className={`${CAMPO} pr-8`}
          >
            {PUEBLOS.map((p) => (
              <option key={p} value={p}>
                {CORTO[p] ?? p}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={`${id}-pago`} etiqueta="¿Cómo pagas?" icono={Wallet} flecha>
          <select
            id={`${id}-pago`}
            value={pago}
            onChange={(e) => pedido.setPago(e.target.value as Pago)}
            className={`${CAMPO} pr-8`}
          >
            {pagosPara(pueblo).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {r.ok ? (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className={BOTON}
          data-pedido-whatsapp
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className={BOTON}
          onClick={() => {
            setAviso(
              r.motivo === "falta_nombre"
                ? "Escribe tu nombre para que Drucila sepa quién pide."
                : "Elige otra forma de pago.",
            );
            if (r.motivo === "falta_nombre") document.getElementById(`${id}-nombre`)?.focus();
          }}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
        </button>
      )}
      <p
        id={`${id}-aviso`}
        role="status"
        className="mt-2 text-sm font-semibold text-[var(--mu-encargo)] empty:hidden"
      >
        {aviso}
      </p>
      <p className="mt-2 text-center text-base leading-snug text-[var(--text-secondary)]">
        {notaEnvio(pueblo, subtotal)}
      </p>
      {preventaVigente() && (
        <p data-mu-preventa-10 className="mt-2 text-center text-base leading-snug text-[var(--text-secondary)]">
          {NOTA_PREVENTA_10}
        </p>
      )}
    </div>
  );
}
