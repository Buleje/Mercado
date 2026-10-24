"use client";

/**
 * BotonPedidoWhatsapp — el botón «Enviar pedido por WhatsApp» que ya resuelve
 * la parte delicada: la imagen se dibuja ANTES del clic (`useImagenPedido`) y
 * el clic llama directo a `enviarPedidoWhatsapp` (el navegador sólo deja
 * compartir o abrir otra pestaña dentro del gesto). Después muestra una línea
 * de ayuda según cómo salió. Sin colores fijos: la tienda lo viste.
 *
 *   <BotonPedidoWhatsapp
 *     datos={listo ? datosImagen : null}   // null = falta algo: botón apagado
 *     comoImagen={config.pedidoComoImagen}
 *     texto={mensaje} numero={whatsappDelNegocio}
 *     className="…" claseAviso="…" />
 */

import { useState, type ReactNode } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatosImagenPedido, ResultadoEnvio } from "@/lib/tienda-cliente/contrato";
import { avisoDelEnvio, enlaceWhatsapp, enviarPedidoWhatsapp } from "@/lib/tienda-cliente/compartir";
import { useImagenPedido } from "./use-imagen-pedido";

export interface BotonPedidoWhatsappProps {
  /** Datos completos del pedido; `null` mientras falte algo (el botón se apaga). */
  datos: DatosImagenPedido | null;
  /** Config del negocio `pedidoComoImagen`: false = sólo texto. */
  comoImagen: boolean;
  /** Mensaje del pedido (va siempre, es el respaldo de la imagen). */
  texto: string;
  /** WhatsApp del negocio. */
  numero: string;
  nombreArchivo?: string;
  children?: ReactNode;
  className?: string;
  /** Línea de ayuda bajo el botón (copiada, cancelado, abre su chat). */
  claseAviso?: string;
  /** Enlace «abre su chat» que sale tras compartir. */
  claseEnlace?: string;
  onEnviado?: (r: ResultadoEnvio) => void;
}

export function BotonPedidoWhatsapp({
  datos,
  comoImagen,
  texto,
  numero,
  nombreArchivo,
  children = "Enviar pedido por WhatsApp",
  className,
  claseAviso,
  claseEnlace,
  onEnviado,
}: BotonPedidoWhatsappProps) {
  const { blob, generando } = useImagenPedido(comoImagen ? datos : null);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  // Primera imagen todavía en camino: se espera (≤ 1 s) para no mandar sólo texto.
  const preparando = comoImagen && datos !== null && generando && !blob;
  const apagado = datos === null || preparando;

  const alTocar = () => {
    // Nada de `await` antes de esta llamada: el gesto tiene que seguir vigente.
    enviarPedidoWhatsapp({ blob: comoImagen ? blob : null, texto, numero, nombreArchivo })
      .then((r) => {
        setResultado(r);
        onEnviado?.(r);
      })
      .catch(() => setResultado({ via: "texto", descargada: false }));
  };

  const aviso = resultado ? avisoDelEnvio(resultado) : null;
  const negocio = datos?.negocio.nombre;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={alTocar}
        disabled={apagado}
        aria-busy={preparando}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {preparando ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        )}
        {preparando ? "Preparando la imagen…" : children}
      </button>
      <p aria-live="polite" className={cn("text-sm", claseAviso)}>
        {aviso}
        {resultado?.via === "compartir" && (
          <>
            ¿No te sale {negocio ?? "el negocio"} en WhatsApp?{" "}
            <a
              href={enlaceWhatsapp(numero, texto)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("font-semibold underline underline-offset-4", claseEnlace)}
            >
              Abre su chat
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export default BotonPedidoWhatsapp;
