"use client";

/**
 * El pie de la bolsa cuando el negocio recibe los pedidos por WhatsApp
 * (`contenido.pedido = "whatsapp"`, ADR-511; el de Musa sin pueblos ni nombres
 * fijos): el total (vista previa), quién pide (`DatosCliente`), dónde y cómo
 * paga (`DetallesEntrega`) y «Pedir por WhatsApp».
 *
 * El mensaje lo arma `pedido-whatsapp.ts` con el nombre, las zonas y los pagos
 * del negocio. El total que se ve es una vista previa: el negocio lo confirma.
 *
 * · Falta algo → el botón no abre WhatsApp: dice qué falta y lleva el foco ahí.
 * · `pedidoComoImagen` (Ajustes) → `BotonPedidoWhatsapp`: la imagen del pedido
 *   además del texto.
 */
import { useId, useState } from "react";
import { MessageCircle } from "@buleje/design-system/icons";
import { BotonPedidoWhatsapp } from "@/components/store/cliente/BotonPedidoWhatsapp";
import type { CartItem } from "@/contexts/cart-context";
import { formatearCelularPe } from "@/lib/tienda-cliente/celular";
import type { DatosImagenPedido } from "@/lib/tienda-cliente/contrato";
import { DatosCliente, faltaDato } from "./BolsaDatos";
import { DetallesEntrega, textoEnvio } from "./BolsaEntrega";
import type { Pedido } from "./estado-bolsa";
import { armarMensajePedido, costoEnvio, opcionesEntrega, solesPedido } from "./pedido-whatsapp";
import type { DatosBolsa } from "./producto-carrito";
import { BOTON, EXTERNO } from "./ui";

const BOTON_WSP = `${BOTON} w-full`;

export function PedirPorWhatsapp({ items, bolsa, pedido, subtotal }: { items: readonly CartItem[]; bolsa: DatosBolsa; pedido: Pedido; subtotal: number }) {
  const id = useId();
  const [aviso, setAviso] = useState<"nombre" | "celular" | null>(null);
  const config = bolsa.pedidosCliente;
  const falta = faltaDato(pedido, config);
  const celular = config.pedirCelular ? formatearCelularPe(pedido.celular) : null;
  const ubicacion = config.pedirUbicacion ? pedido.gps.ubicacion : null;
  const envio = costoEnvio(pedido.entrega, bolsa.envio, subtotal);
  const lineas = items.map((i) => ({
    nombre: i.name,
    codigo: bolsa.codigos[Number(i.id)] ?? null,
    cantidad: i.quantity,
    precio: i.price,
    imagen: i.image || null,
  }));
  const r = armarMensajePedido(
    { lineas, nombre: pedido.nombre, entrega: pedido.entrega, pago: pedido.pago, envio, celular, ubicacion: ubicacion?.enlaceMapa ?? null },
    { nombre: bolsa.nombre, whatsapp: bolsa.whatsapp },
  );
  const listo = r.ok && falta === null;
  const total = r.ok ? r.total : subtotal + (envio ?? 0);
  const avisos = {
    nombre: `Escribe tu nombre para que ${bolsa.nombre} sepa quién pide.`,
    celular: "Escribe tu celular: 9 dígitos, empieza con 9.",
  } as const;

  // La imagen sólo con todo listo: `BotonPedidoWhatsapp` la dibuja antes del clic.
  const datosImagen: DatosImagenPedido | null =
    listo && r.ok
      ? {
          negocio: { nombre: bolsa.nombre, colorAcento: bolsa.acento, logo: bolsa.logo },
          lineas: lineas.map((l) => ({ ...l, nota: null })),
          total: r.total,
          cliente: { nombre: pedido.nombre.trim(), celular, entrega: pedido.entrega.trim() || null, ubicacion, pago: pedido.pago || null },
          notas: envio === 0 ? ["Envío gratis"] : undefined,
        }
      : null;

  const guiar = () => {
    if (!falta) return;
    setAviso(falta);
    document.getElementById(falta === "nombre" ? `${id}-nombre` : `${id}-celular`)?.focus();
  };

  const etiqueta = (
    <>
      <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
    </>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <dl className="flex flex-col gap-1">
        {envio !== null && (
          <div className="flex items-baseline justify-between gap-3 text-sm text-[var(--ti-texto-2)]">
            <dt>Envío</dt>
            <dd className="tabular-nums">{textoEnvio(envio)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-base font-semibold text-[var(--ti-texto-2)]">
            Total <span className="text-sm font-normal text-[var(--ti-texto-3)]">(vista previa)</span>
          </dt>
          <dd className="ti-nombre text-[1.75rem] leading-none tabular-nums text-[var(--ti-texto)]">{solesPedido(total)}</dd>
        </div>
      </dl>
      <DatosCliente
        pedido={pedido}
        config={config}
        idNombre={`${id}-nombre`}
        idCelular={`${id}-celular`}
        invalido={aviso}
        alEscribir={() => setAviso(null)}
      />
      <DetallesEntrega pedido={pedido} entregas={opcionesEntrega(bolsa.envio.zonas, Boolean(bolsa.direccion))} pagos={bolsa.pagos} envio={bolsa.envio} subtotal={subtotal} />
      {listo && r.ok && config.pedidoComoImagen && bolsa.whatsapp ? (
        <BotonPedidoWhatsapp
          datos={datosImagen}
          comoImagen
          texto={r.mensaje}
          numero={bolsa.whatsapp}
          nombreArchivo={`pedido-${bolsa.slug}.png`}
          className={BOTON_WSP}
          claseAviso="text-center text-sm text-[var(--ti-texto-2)] empty:hidden"
          claseEnlace="text-[var(--ti-texto)] underline"
        >
          Pedir por WhatsApp
        </BotonPedidoWhatsapp>
      ) : listo && r.ok ? (
        <a href={r.url} {...EXTERNO} className={BOTON_WSP} data-pedido-whatsapp>
          {etiqueta}
        </a>
      ) : (
        <button type="button" className={BOTON_WSP} onClick={guiar} aria-describedby={aviso ? `${id}-aviso` : undefined}>
          {etiqueta}
        </button>
      )}
      <p id={`${id}-aviso`} role="status" className="-mt-1 text-center text-sm font-semibold text-[var(--ti-texto)] empty:hidden">
        {aviso ? avisos[aviso] : ""}
      </p>
    </div>
  );
}
