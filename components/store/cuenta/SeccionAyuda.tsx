"use client";

/**
 * «Mi cuenta › Ayuda»: hablar con el negocio por WhatsApp en un toque y los
 * dos atajos que más se preguntan. El número es el del negocio (el de su
 * página propia si la tiene, si no el de su configuración).
 */

import Link from "next/link";
import { ChevronRight, CircleHelp, MessageCircle, Package } from "@buleje/design-system/icons";
import { usePedidosTienda } from "@/components/checkout/hooks/usePedidosTienda";
import { BOTON_PRINCIPAL } from "./EntrarCuenta";
import { DESTINOS, enlaceAyuda, rutaCuenta } from "./cuenta-rutas";
import { useWhatsappDeLaPagina } from "./whatsapp-de-la-pagina";

const FILA =
  "flex min-h-12 items-center gap-3 px-4 text-base text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

export function SeccionAyuda({ base, nombre }: { base: string; nombre: string | null }) {
  const { numeroWhatsapp, nombreNegocio } = usePedidosTienda();
  const deLaPagina = useWhatsappDeLaPagina();
  const enlace = enlaceAyuda(deLaPagina ?? numeroWhatsapp, nombre);

  return (
    <div className="flex flex-col gap-4">
      {enlace ? (
        <a href={enlace} target="_blank" rel="noopener noreferrer" className={`${BOTON_PRINCIPAL} sm:w-auto sm:self-start`}>
          <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          Escribir a {nombreNegocio} por WhatsApp
        </a>
      ) : (
        <p className="text-base text-[var(--text-secondary)]">Este negocio aún no dejó su WhatsApp.</p>
      )}
      <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <li>
          <Link href={rutaCuenta(base, DESTINOS.pedidos)} className={FILA}>
            <Package className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
            <span className="flex-1">¿Dónde está mi pedido?</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          </Link>
        </li>
        <li>
          <Link href={rutaCuenta(base, "/ayuda")} className={FILA}>
            <CircleHelp className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
            <span className="flex-1">Preguntas frecuentes</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
