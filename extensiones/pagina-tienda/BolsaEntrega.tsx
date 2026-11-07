"use client";

/**
 * «Entrega y pago: Centro · Yape» plegado (pie de la bolsa en modo WhatsApp,
 * ADR-511; el «Envío a…» de Musa sin pueblos fijos). Adentro:
 *
 * · ¿Dónde lo recibes? — las zonas de reparto del negocio (Ajustes › Envío) con
 *   su costo, «Otro lugar» y «Recojo en el local» si tiene dirección. Sin zonas,
 *   un campo libre («Jr. Ucayali 123, frente al parque»).
 * · ¿Cómo pagas? — los medios que el negocio prendió (Ajustes › Pagos). Con uno
 *   solo, una línea; sin ninguno, nada (se acuerda por WhatsApp).
 *
 * Los costos son los que el negocio cargó: una vista previa; el negocio confirma.
 */
import { useId, useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { CAMPO } from "./BolsaDatos";
import type { MedioDePago, NegocioTienda } from "./contenido";
import type { Pedido } from "./estado-bolsa";
import { costoEnvio, OTRO_LUGAR, RECOJO, solesPedido } from "./pedido-whatsapp";
import { listaY } from "./armado";

const ETIQUETA = "text-sm font-semibold text-[var(--ti-texto-2)]";

/** «S/ 5», «gratis» o nada (no se sabe: lo dice el negocio). */
export const textoEnvio = (costo: number | null): string | null => (costo === null ? null : costo === 0 ? "gratis" : solesPedido(costo));

function rotulo(entrega: string, envio: NegocioTienda["envio"], subtotal: number): string {
  if (entrega === RECOJO) return `${entrega} · sin costo`;
  if (entrega === OTRO_LUGAR) return `${entrega} · costo a coordinar`;
  const t = textoEnvio(costoEnvio(entrega, envio, subtotal));
  return t ? `${entrega} · ${t}` : entrega;
}

export function DetallesEntrega({
  pedido,
  entregas,
  pagos,
  envio,
  subtotal,
}: {
  pedido: Pedido;
  entregas: readonly string[];
  pagos: readonly MedioDePago[];
  envio: NegocioTienda["envio"];
  subtotal: number;
}) {
  const id = useId();
  // Sin zonas y sin dirección escrita: abierto de entrada (el campo es lo primero que falta).
  const [abierto] = useState(() => entregas.length === 0 && !pedido.entrega.trim());
  const resumen = [pedido.entrega.trim() || "dónde lo recibes", pedido.pago].filter(Boolean).join(" · ");

  return (
    <details data-ti-entrega open={abierto || undefined} className="group rounded-[var(--ti-radio-control)] border border-[var(--ti-linea-suave)]">
      <summary className="ti-foco flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[var(--ti-radio-control)] px-4 text-sm [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate text-[var(--ti-texto-2)]">
          <span className="font-semibold text-[var(--ti-texto)]">Entrega y pago:</span> {resumen}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ti-texto-2)] transition-transform duration-[var(--ti-dur-corto)] group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
        {entregas.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>¿Dónde lo recibes?</span>
            <select value={pedido.entrega} onChange={(e) => pedido.setEntrega(e.target.value)} className={CAMPO}>
              {entregas.map((e) => (
                <option key={e} value={e}>
                  {rotulo(e, envio, subtotal)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>¿Dónde lo recibes?</span>
            <input
              value={pedido.entrega}
              onChange={(e) => pedido.setEntrega(e.target.value)}
              maxLength={120}
              autoComplete="street-address"
              placeholder="Tu dirección o una referencia"
              className={CAMPO}
            />
          </label>
        )}
        {pedido.entrega === OTRO_LUGAR && <p className="-mt-1 text-sm text-[var(--ti-texto-2)]">Te dicen el costo del envío por WhatsApp.</p>}

        {pagos.length > 1 ? (
          <fieldset>
            <legend className={ETIQUETA}>¿Cómo pagas?</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {pagos.map((p) => (
                <label key={p} className="relative">
                  <input type="radio" name={`${id}-pago`} value={p} checked={pedido.pago === p} onChange={() => pedido.setPago(p)} className="peer sr-only" />
                  <span className="inline-flex h-12 cursor-pointer items-center rounded-full border border-[var(--ti-linea)] px-4 text-base font-medium text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)] peer-checked:border-[var(--ti-texto)] peer-checked:bg-[var(--ti-texto)] peer-checked:text-[var(--ti-fondo)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ti-texto)]">
                    {p}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : pagos.length === 1 ? (
          <p className="text-sm text-[var(--ti-texto-2)]">Pagas con {listaY(pagos)}.</p>
        ) : null}
      </div>
    </details>
  );
}
