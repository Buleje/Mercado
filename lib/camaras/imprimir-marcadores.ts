/**
 * Imprimir los marcadores de troza (ADR-480): la hoja A4 por troza (formato
 * «Marcador A4 · cámara» de las etiquetas) y la hoja de prueba de distancia.
 *
 * Antes de imprimir se ASIGNAN en el servidor (`PATCH /api/admin/camaras/
 * marcadores`): la troza que ya tenía uno lo conserva, las demás reciben los
 * libres más bajos. Así la hoja impresa y lo que lee la cámara dicen lo mismo.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import { cssMarcadorA4, htmlHojaMarcador, htmlHojasDePrueba } from "@/lib/camaras/marcador-a4";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import { urlCortaDeTroza } from "@/lib/forestal/ctp-troza-url";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { codigoDeEtiqueta } from "@/lib/forestal/ficha-texto-troza";

interface RespuestaAsignar {
  asignados?: { marcador: number; trozaId: string }[];
  rechazados?: { trozaId: string; motivo: string }[];
  message?: string;
}

export interface ImpresionMarcadores {
  impresas: number;
  rechazados: { trozaId: string; motivo: string }[];
}

/** Asigna e imprime una hoja A4 por troza. `origin` = base del enlace del QR chico. */
export async function imprimirMarcadoresDeTrozas(
  trozas: readonly TrozaConsumible[],
  opts: { origin: string; ventana?: Window | null },
): Promise<ImpresionMarcadores> {
  if (trozas.length === 0) return { impresas: 0, rechazados: [] };
  const r = await fetch("/api/admin/camaras/marcadores", {
    method: "PATCH",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ accion: "asignar", trozaIds: trozas.slice(0, 200).map((t) => t.id) }),
  });
  const j = (await r.json().catch(() => ({}))) as RespuestaAsignar;
  if (!r.ok) throw new Error(j.message ?? `No se pudieron asignar los marcadores (${r.status}).`);
  const porId = new Map(trozas.map((t) => [t.id, t]));
  const QR = (await import("qrcode")).default;
  const hojas = await Promise.all(
    (j.asignados ?? []).map(async (a) => {
      const t = porId.get(a.trozaId);
      const qrSvg = await QR.toString(urlCortaDeTroza(opts.origin, a.trozaId), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      return htmlHojaMarcador({
        marcador: a.marcador,
        codigo: t ? codigoDeEtiqueta(t) : a.trozaId.slice(-6),
        especie: t?.especieComun ?? null,
        volumen: t?.volumenM3 ? `${formatNumber(t.volumenM3, { min: 3, max: 3 })} m³` : null,
        qrSvg,
      });
    }),
  );
  if (hojas.length)
    openCtpReport({
      title: `Marcadores de trozas · A4 (${hojas.length})`,
      css: cssMarcadorA4(),
      body: hojas.join(""),
      ventana: opts.ventana,
    });
  return { impresas: hojas.length, rechazados: j.rechazados ?? [] };
}

/** La hoja de prueba de 3/5/8 m (no asigna nada: los ids 245-247 son de prueba). */
export function imprimirHojaDePrueba(): void {
  openCtpReport({ title: "Prueba de marcadores · 3, 5 y 8 m", css: cssMarcadorA4(), body: htmlHojasDePrueba() });
}
