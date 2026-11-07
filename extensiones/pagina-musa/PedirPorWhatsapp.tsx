"use client";

/**
 * El pie de la bolsa de Musa: el total, quién pide (de a poco, `DatosCliente`),
 * «Envío a … · …» plegado (`DetallesEnvio`) y UN botón: «Pedir por WhatsApp».
 * No crea un pedido en el sistema (decisión de Brandon, 09-10): llega al WhatsApp
 * de Drucila, que confirma envío y pago. El total es una vista previa.
 *
 * El botón según lo que el negocio prendió en su panel (`ConfigPedidosCliente`):
 * · falta un dato → dice cuál y lleva el foco a ese campo;
 * · `pedidoComoImagen` → `BotonPedidoWhatsapp` (la imagen se dibuja ANTES del clic:
 *   el navegador sólo deja compartir o copiar dentro del gesto);
 * · sin imagen → el enlace a `wa.me` con el texto de `armarMensajePedido` (su
 *   formato lo cuida su test).
 */
import { useId, useState } from "react";
import { MessageCircle } from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";
import { BotonPedidoWhatsapp } from "@/components/store/cliente/BotonPedidoWhatsapp";
import { formatearCelularPe } from "@/lib/tienda-cliente/celular";
import { resolverColorCss } from "@/lib/tienda-cliente/imagen-pedido";
import type { ConfigPedidosCliente, DatosImagenPedido } from "@/lib/tienda-cliente/contrato";
import {
  armarMensajePedido,
  avanceEnvio,
  esPorEncargo,
  NOTA_ENCARGO,
  preventaVigente,
  solesPedido,
  WHATSAPP_MUSA,
} from "./pedido-whatsapp";
import type { Pedido } from "./estado-bolsa";
import { DatosCliente, faltaDato } from "./DatosCliente";
import { DetallesEnvio } from "./DetallesEnvio";
import { imagenDe } from "./imagenes";

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

const BOTON =
  "mu-foco inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--mu-whatsapp-fondo)] text-base font-semibold text-[var(--mu-whatsapp-texto)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[.97]";

const AVISOS = {
  nombre: "Escribe tu nombre para que Drucila sepa quién pide.",
  celular: "Escribe tu celular: 9 dígitos, empieza con 9.",
  contraentrega_fuera: "Elige otra forma de pago en «Envío a…».",
} as const;

/**
 * El color de la marca ya resuelto (el lienzo de la imagen no entiende `var(--x)`).
 * Las variables `--mu-*` viven en el `[data-pagina]` de Musa, no en `<html>`.
 */
function acentoDeLaPagina(): string {
  const raiz = typeof document === "undefined" ? null : document.querySelector("[data-pagina]");
  const musa = raiz ? getComputedStyle(raiz).getPropertyValue("--mu-acento").trim() : "";
  return musa || resolverColorCss("var(--accent)");
}

export function PedirPorWhatsapp({
  items,
  codigos,
  pedido,
  subtotal,
  config,
  negocio,
}: {
  items: readonly CartItem[];
  codigos: CodigosProductos;
  pedido: Pedido;
  subtotal: number;
  config: ConfigPedidosCliente;
  negocio: string;
}) {
  const id = useId();
  const [aviso, setAviso] = useState<keyof typeof AVISOS | null>(null);
  const [acento] = useState(acentoDeLaPagina);
  const falta = faltaDato(pedido, config);
  const celular = config.pedirCelular ? formatearCelularPe(pedido.celular) : null;
  const ubicacion = config.pedirUbicacion ? pedido.gps.ubicacion : null;
  const lineas = items.map((i) => ({
    nombre: i.name,
    codigo: codigos[String(i.id)]?.codigo ?? null,
    cantidad: i.quantity,
    precio: i.price,
    porEncargo: codigos[String(i.id)]?.encargo ?? esPorEncargo(i.badge),
    imagen: imagenDe({ imagen: i.image, codigo: codigos[String(i.id)]?.codigo ?? null }).src,
  }));
  const r = armarMensajePedido({
    lineas,
    nombre: pedido.nombre,
    pueblo: pedido.pueblo,
    pago: pedido.pago,
    preventa10: preventaVigente(),
    celular,
    ubicacion: ubicacion?.enlaceMapa ?? null,
  });
  const listo = r.ok && falta === null;

  // La imagen del pedido: sólo con todo listo. `BotonPedidoWhatsapp` la dibuja antes del
  // clic y no la rehace si los datos son los mismos (compara por contenido, no por objeto).
  const envio = avanceEnvio(subtotal, pedido.pueblo);
  const datosImagen: DatosImagenPedido | null =
    listo && r.ok
      ? {
          negocio: { nombre: negocio, colorAcento: acento },
          lineas: lineas.map((l) => ({
            nombre: l.nombre,
            codigo: l.codigo,
            cantidad: l.cantidad,
            precio: l.precio,
            imagen: l.imagen,
            nota: l.porEncargo ? NOTA_ENCARGO : null,
          })),
          total: r.total,
          cliente: {
            nombre: pedido.nombre.trim(),
            celular,
            entrega: pedido.pueblo,
            ubicacion,
            pago: pedido.pago,
          },
          notas: [
            envio.siempreGratis
              ? "Envío gratis a tu casa"
              : envio.logrado
                ? "Envío gratis por agencia"
                : "Envío por agencia",
          ],
        }
      : null;

  const guiar = () => {
    const motivo = falta ?? (!r.ok && r.motivo === "contraentrega_fuera" ? r.motivo : null);
    if (!motivo) return;
    setAviso(motivo);
    if (motivo !== "contraentrega_fuera")
      document.getElementById(motivo === "nombre" ? `${id}-nombre` : `${id}-celular`)?.focus();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-[var(--text-secondary)]">Total</span>
        <span className="mu-precio text-[2rem] leading-none text-[var(--text-primary)]">
          {solesPedido(subtotal)}
        </span>
      </div>
      <DatosCliente
        pedido={pedido}
        config={config}
        idNombre={`${id}-nombre`}
        idCelular={`${id}-celular`}
        invalido={aviso === "nombre" || aviso === "celular" ? aviso : null}
        alEscribir={() => setAviso(null)}
      />
      <DetallesEnvio pedido={pedido} subtotal={subtotal} />
      {listo && r.ok && config.pedidoComoImagen ? (
        <BotonPedidoWhatsapp
          datos={datosImagen}
          comoImagen
          texto={r.mensaje}
          numero={WHATSAPP_MUSA}
          nombreArchivo={`pedido-${negocio.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          className={`${BOTON} disabled:hover:translate-y-0`}
          claseAviso="text-center text-[var(--text-secondary)] empty:hidden"
          claseEnlace="text-[var(--text-primary)]"
        >
          Pedir por WhatsApp
        </BotonPedidoWhatsapp>
      ) : listo && r.ok ? (
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
          onClick={guiar}
          aria-describedby={aviso ? `${id}-aviso` : undefined}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir por WhatsApp
        </button>
      )}
      <p
        id={`${id}-aviso`}
        role="status"
        className="-mt-1 text-center text-sm font-semibold text-[var(--mu-encargo)] empty:hidden"
      >
        {aviso ? AVISOS[aviso] : ""}
      </p>
    </div>
  );
}
