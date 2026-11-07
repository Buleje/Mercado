"use client";

/**
 * Bajar o mandar por WhatsApp el PDF del «Estado de cuenta» de una carga.
 *
 * WhatsApp no acepta un PDF por enlace: donde el equipo deja compartir
 * archivos (el celular, Chrome en Windows) se abre la hoja de compartir con el
 * PDF adjunto y se elige el chat; donde no, se baja el PDF y se abre el chat
 * del cliente con el total escrito, para adjuntarlo con el clip.
 */
import { useState } from "react";
import { logger } from "@/lib/logger";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { soles, type EstadoCuentaCarga } from "@/lib/forestal/estado-cuenta-carga";
import type { CabeceraEstadoCuenta } from "@/lib/forestal/estado-cuenta-carga-pdf";

export type Accion = "bajar" | "whatsapp";

export function textoParaWhatsApp(e: EstadoCuentaCarga, cab: CabeceraEstadoCuenta): string {
  const quien = e.total >= 0 ? "Total que debe" : "Saldo a su favor";
  return `Estado de cuenta${cab.carga ? ` · ${cab.carga}` : ""}\n${quien}: *${soles(e.total)}*\n(${e.enLetras})`;
}

export function usePapelEstadoCuenta() {
  const [ocupado, setOcupado] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const correr = async (accion: Accion, e: EstadoCuentaCarga, cab: CabeceraEstadoCuenta, telefono: string | null) => {
    setOcupado(accion);
    setError(null);
    setAviso(null);
    try {
      const pdf = await import("@/lib/forestal/estado-cuenta-carga-pdf");
      if (accion === "bajar") {
        await pdf.descargarEstadoCuentaCarga(e, cab);
        return;
      }
      const blob = await pdf.descargarEstadoCuentaCarga(e, cab, { comoArchivo: true });
      const archivo = new File([blob], pdf.nombreDelArchivo(cab), { type: "application/pdf" });
      const texto = textoParaWhatsApp(e, cab);
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: texto }).catch((err: unknown) => {
          /* Cerrar la hoja de compartir no es un error. */
          if (err instanceof DOMException && err.name === "AbortError") return;
          throw err;
        });
        return;
      }
      /* Sin compartir archivos: se baja y se abre su chat con el total escrito. */
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: archivo.name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const chat = enlaceWhatsAppConTexto(telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
      window.open(chat, "_blank", "noopener");
      setAviso("El PDF se bajó: adjúntalo en el chat con el clip");
    } catch (err) {
      logger.error("[estado-cuenta-carga] no salió el PDF", { accion, error: String(err) });
      setError("No se pudo armar el PDF. Prueba de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  return { correr, ocupado, error, aviso };
}
