"use client";

/**
 * «Papel» y «WhatsApp» de UN viaje (Brandon 28-10). El papel es la constancia
 * de salida para imprimir; WhatsApp abre `wa.me` con el aviso escrito y la
 * persona toca «enviar» (NUNCA envía solo). El número es el celular del
 * comprador del Directorio si hay; si no, wa.me deja elegir el contacto.
 */
import { useState } from "react";
import { FileText, MessageCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useTenant } from "@/contexts/tenant-context";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { textoWhatsAppDeSalida } from "@/lib/forestal/cubicacion-salida-whatsapp";
import type { SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import { celularDelComprador, enlaceWhatsApp, type celularDeParte } from "@/lib/forestal/cubicacion-whatsapp";
import { limaDateKey } from "@/lib/utils";
import { codigoDeHoja } from "./cubicador-papel/papel-cubicador";
import { fechaDeLaGuardada } from "./cubicador-guardadas-fecha";
import { imprimirConstanciaDeSalida } from "./cubicador-salidas-imprimir";

const BOTON = button({ variant: "secondary", className: "gap-1.5 px-3" });
type ParteConCelular = Parameters<typeof celularDeParte>[0] & { id: string; nombre: string; activo?: boolean };

export function AccionesDelViaje({ c, salida, indice, partes }: {
  c: CubicacionRegistro;
  salida: SalidaCubicacion;
  /** Posición del viaje en la lista (0 = el primero). */
  indice: number;
  partes: readonly ParteConCelular[];
}) {
  const { branding } = useTenant();
  const [error, setError] = useState<string | null>(null);
  const fechaTexto = fechaDeLaGuardada(salida.fecha);
  const numero = celularDelComprador(partes, {
    parteId: salida.cliente ? salida.clienteParteId : c.ficha?.clienteParteId,
    nombre: salida.cliente || c.cliente,
  });
  const texto = textoWhatsAppDeSalida(c, salida, indice, fechaTexto, limaDateKey());
  const quien = salida.cliente || c.cliente || "el comprador";

  const imprimir = () => {
    setError(null);
    try {
      imprimirConstanciaDeSalida({ c, salida, indice, fechaTexto, negocio: branding.name ?? undefined, codigoCubicacion: codigoDeHoja("aserrada", c.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5" data-acciones-viaje={salida.id}>
      {error && <p role="alert" className="mr-auto text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
      <button type="button" className={BOTON} onClick={imprimir} data-accion="papel-viaje" title="La constancia de salida de este viaje, para imprimir o guardar en PDF">
        <FileText className="h-4 w-4" aria-hidden /> Papel
      </button>
      <a href={enlaceWhatsApp(texto, numero)} target="_blank" rel="noopener noreferrer" className={BOTON} data-accion="whatsapp-viaje"
        title={numero ? `Abre el chat con ${quien} (+${numero}); tú tocas enviar` : "Abre WhatsApp para que elijas el contacto; tú tocas enviar"}>
        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
      </a>
    </div>
  );
}
