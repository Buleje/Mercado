"use client";

/**
 * «Mandar por WhatsApp» y «Copiar el texto» del detalle de una guardada.
 * NUNCA envía nada: el botón es un enlace `wa.me` que abre WhatsApp en otra
 * pestaña con el texto escrito; la persona toca «enviar». Si la ficha del
 * comprador en el Directorio tiene celular, abre su chat; si no, deja elegir
 * el contacto.
 */
import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { celularDeParte, enlaceWhatsApp, textoWhatsAppDeGuardada } from "@/lib/forestal/cubicacion-whatsapp";
import { normalizarNombreFicha } from "@/lib/forestal/cubicacion-por-ficha";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { logger } from "@/lib/logger";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";

export function AccionesWhatsAppDeGuardada({ c }: { c: CubicacionRegistro }) {
  const idComprador = c.ficha?.clienteParteId;
  const dir = useDirectorioForestal({ activo: Boolean(idComprador || c.cliente?.trim()) });
  const [copiado, setCopiado] = useState(false);

  const texto = useMemo(() => textoWhatsAppDeGuardada(c, fechaDeLaGuardada(c.fecha)), [c]);
  const numero = useMemo(() => {
    const nombre = c.cliente ? normalizarNombreFicha(c.cliente) : "";
    const parte =
      (idComprador ? dir.partes.find((p) => p.id === idComprador) : undefined) ??
      (nombre ? dir.partes.find((p) => p.activo && normalizarNombreFicha(p.nombre) === nombre) : undefined);
    return celularDeParte(parte);
  }, [dir.partes, idComprador, c.cliente]);

  const copiar = () => {
    navigator.clipboard
      ?.writeText(texto)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      })
      .catch((err: unknown) => logger.warn("[cubicador] no se pudo copiar el texto", { error: String(err) }));
  };

  return (
    <>
      <button type="button" onClick={copiar} className={button({ variant: "secondary" })} data-accion="copiar-texto-whatsapp">
        {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copiado ? "Copiado" : "Copiar el texto"}
      </button>
      <a
        href={enlaceWhatsApp(texto, numero)}
        target="_blank"
        rel="noopener noreferrer"
        className={button({ variant: "secondary" })}
        data-accion="mandar-whatsapp"
        title={numero ? `Abre el chat con ${c.cliente ?? "el comprador"} (+${numero}); tú tocas enviar` : "Abre WhatsApp para que elijas el contacto; tú tocas enviar"}
      >
        <MessageCircle className="h-4 w-4" aria-hidden /> Mandar por WhatsApp
      </a>
    </>
  );
}
