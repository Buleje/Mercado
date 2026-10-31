"use client";

/**
 * La bolsa de la plantilla de tienda (ADR-511): el cajón, la píldora «Ver
 * bolsa» del celular y el aviso «No pudimos agregar…». (El botón del
 * encabezado con su contador vive en `EncabezadoVivo.tsx`: sólo la abre.)
 *
 * Usa el CARRITO DE LA TIENDA (`useCart`): el mismo guardado en el navegador
 * y el mismo canal entre pestañas que el resto de la tienda. NUNCA monta un
 * `CartProvider`: usa el que ya está arriba.
 *
 * · En el marco (catálogo, ficha, cuenta…): `crearMarco((ctx) => <BolsaDeLaTienda ctx={ctx} />)`.
 *   El carrito y el checkout son los del layout de la tienda.
 * · En la portada: `<PaginaTienda bolsa={<BolsaDeLaTienda ctx={ctx} enPortada />} />`.
 *   El carrito es el `CartProvider` de `PaginaTienda`; si el negocio cobra con
 *   el checkout, `ProveedorCheckout` lo baja y lo abre ahí mismo (sin cambiar
 *   de página) al tocar «Finalizar compra».
 *
 * `bolsa.pedido` decide el pie: «Finalizar compra» (el checkout de siempre,
 * sin tocarlo) o «Pedir por WhatsApp» (el mensaje armado con los datos del
 * negocio). Los totales de acá son vista previa: el que vale lo pone el
 * checkout (el servidor) o el negocio.
 */
import { AvisoFlotante, AvisoNoAgregado } from "./BolsaAvisos";
import { ProveedorCheckout } from "./BolsaCheckoutPortada";
import { Cajon } from "./Cajon";
import type { DatosBolsa } from "./producto-carrito";

export function PartesBolsa({ bolsa, enPortada = false }: { bolsa: DatosBolsa; enPortada?: boolean }) {
  return (
    <>
      <Cajon bolsa={bolsa} enPortada={enPortada} />
      <AvisoFlotante />
      <AvisoNoAgregado negocio={bolsa.nombre} whatsapp={bolsa.whatsapp} />
      {enPortada && bolsa.pedido === "checkout" && <ProveedorCheckout slug={bolsa.slug} pagar={`${bolsa.catalogo}?carrito=abrir`} />}
    </>
  );
}
