"use client";

/**
 * useResumenInternoGtf — «Imprimir resumen interno» de una GTF del Libro TH
 * (Brandon 08-10): pide R1-R4 ya calculados al servidor
 * (`/api/admin/forestal/gtf/resumen-interno`, regla 6), arma la hoja
 * (`gtf-resumen-interno-print`) y se la entrega al visor de documentos de la
 * vista, el mismo de la hoja SERFOR (ver, imprimir, PDF, archivar).
 *
 * Lo que el servidor no pudo leer no frena la hoja: sale «sin dato» y se avisa.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { obtenerBaseVerificacion } from "@/lib/base-verificacion-cliente";
import { listaTrozasDeLaGuia, type RespuestaResumenInterno } from "@/lib/forestal/gtf-resumen-interno-datos";
import { hojaResumenInterno, contenidoQrResumen, type HojaResumenInterno } from "@/lib/forestal/gtf-resumen-interno-print";
import { permisoDeLaGuiaGtf } from "../gtf-acciones-menu";
import type { Gtf } from "../gtf-tabla-columnas";

export function useResumenInternoGtf(onListo: (g: Gtf, hoja: HojaResumenInterno) => void) {
  const [cargando, setCargando] = useState<string | null>(null);

  const abrir = useCallback(
    async (g: Gtf) => {
      if (cargando) return;
      setCargando(g.id);
      const aviso = toast.loading(`Armando el resumen interno de la GTF ${g.gtfNumber}…`);
      try {
        const res = await fetch(`/api/admin/forestal/gtf/resumen-interno?id=${encodeURIComponent(g.id)}`, { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as Partial<RespuestaResumenInterno> & { message?: string };
        if (!res.ok || !j.resumen) throw new Error(j.message ?? `HTTP ${res.status}`);
        const datos = { lineaDespachoId: j.lineaDespachoId ?? null, avisos: j.avisos ?? [] };
        const r = j.resumen;
        /* QR: la lista pública de la guía con la base del negocio (dominio propio > subdominio > /t/slug);
           sin despacho en el Libro o sin base, la cadena de verificación interna de siempre. */
        let qr = "";
        try {
          const base = await obtenerBaseVerificacion().catch((err: unknown) => {
            console.warn("[loth-gtf] sin base pública para el QR del resumen interno", err);
            return null;
          });
          const QRCode = (await import("qrcode")).default;
          qr = await QRCode.toString(contenidoQrResumen(g, Number(g.volumenTotalM3 ?? 0), { base, lineaDespachoId: datos.lineaDespachoId }), { type: "svg", margin: 1, width: 118, errorCorrectionLevel: "M" });
        } catch (err) {
          console.warn("[loth-gtf] no se pudo armar el QR del resumen interno", err);
        }
        const hoja = hojaResumenInterno(
          {
            gtfNumber: g.gtfNumber,
            gtfDate: g.gtfDate,
            titular: g.titularName,
            permiso: permisoDeLaGuiaGtf(g),
            listaTrozasNro: listaTrozasDeLaGuia(g.gtfDatos),
            destino: g.destino,
            anulada: g.status === "anulada" ? g.annulledReason ?? "Anulada" : g.deletedAt ? "Eliminada del libro" : null,
          },
          r,
          qr,
        );
        onListo(g, hoja);
        toast.dismiss(aviso);
        if (datos.avisos.length > 0) toast.warning("El resumen salió con datos faltantes", { description: datos.avisos.join(" "), duration: 10_000 });
      } catch (e) {
        toast.error("No se pudo armar el resumen interno", { id: aviso, description: e instanceof Error ? e.message : String(e) });
      } finally {
        setCargando(null);
      }
    },
    [cargando, onListo],
  );

  return { abrir, cargando };
}
