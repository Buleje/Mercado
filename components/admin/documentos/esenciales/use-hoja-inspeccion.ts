"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import { armarEnlaceVariasCarpetas, fechaConDiaCorta } from "@/lib/documentos/enlace-varias-carpetas";
import type { CarpetaDeLaHoja } from "@/lib/documentos/inspeccion-indice";
import { logger } from "@/lib/logger";
import { crearEnlacesDeCarpetas } from "./crear-enlaces-carpetas";

/**
 * Arma la hoja «Para inspección»: 1) el enlace de esas carpetas (share-lote, el
 * mismo de «Compartir»), 2) si se pidió, el expediente con los papeles
 * completos (el de siempre: queda guardado en el Archivo), 3) la hoja con el QR
 * y 4) las une en un PDF. Si el expediente falla, la hoja sale sola y se avisa.
 */

export type PasoHoja = "enlace" | "papeles" | "hoja";

export interface HojaLista {
  url: string;
  nombreArchivo: string;
  paginas: number;
  enlace: string;
  vence: string;
  conPapeles: boolean;
}

async function motivoExpediente(r: Response): Promise<string> {
  const j = (await r.json().catch(() => null)) as { mensaje?: string } | null;
  if (j?.mensaje) return j.mensaje;
  if (r.status === 429) return "armaste varios seguidos; espera unos minutos";
  return `el servidor respondió ${r.status}`;
}

/** Los papeles completos en un PDF (el expediente de siempre); `null` + motivo si no se pudo. */
async function bajarExpediente(ids: string[], titulo: string): Promise<{ bytes: ArrayBuffer } | { error: string }> {
  try {
    const r = await fetch("/api/admin/documents/expediente", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ids, titulo }),
    });
    if (!r.ok) return { error: await motivoExpediente(r) };
    const d = (await r.json()) as { document?: { id?: string } };
    if (!d.document?.id) return { error: "el servidor no devolvió el expediente" };
    const raw = await fetch(`/api/admin/documents/${encodeURIComponent(d.document.id)}/raw`, { credentials: "include" });
    if (!raw.ok) return { error: "el expediente quedó en el Archivo pero no se pudo bajar" };
    return { bytes: await raw.arrayBuffer() };
  } catch {
    return { error: "se cortó la conexión" };
  }
}

export function useHojaInspeccion() {
  const [paso, setPaso] = useState<PasoHoja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lista, setLista] = useState<HojaLista | null>(null);

  // El PDF vive en memoria del navegador hasta que se suelta.
  useEffect(() => () => {
    if (lista) URL.revokeObjectURL(lista.url);
  }, [lista]);

  const armar = useCallback(async (o: { carpetas: CarpetaDeLaHoja[]; dias: number; clave?: string; conPapeles: boolean }) => {
    setError(null);
    setAviso(null);
    setPaso("enlace");
    try {
      const r = await crearEnlacesDeCarpetas(o.carpetas.map((c) => ({ id: c.id, name: c.nombre })), { dias: o.dias, clave: o.clave }, () => undefined);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const enlace = armarEnlaceVariasCarpetas(window.location.origin, r.tokens);
      const hoy = limaDateKey();

      let expediente: ArrayBuffer | null = null;
      const ids = o.carpetas.flatMap((c) => c.papeles.map((p) => p.id));
      if (o.conPapeles && ids.length > 0) {
        setPaso("papeles");
        const e = await bajarExpediente(ids, `Para inspección ${hoy}`);
        if ("bytes" in e) expediente = e.bytes;
        else setAviso(`La hoja salió sin los papeles completos: ${e.error}.`);
      }

      setPaso("hoja");
      const { armarHojaInspeccion, unirConExpediente } = await import("@/lib/documentos/inspeccion-pdf");
      const hoja = await armarHojaInspeccion({ carpetas: o.carpetas, enlace, venceEnlace: r.vence, conClave: !!o.clave, conPapeles: !!expediente });
      let bytes: BlobPart = hoja.bytes;
      let paginas = hoja.paginas;
      if (expediente) {
        try {
          const unido = await unirConExpediente(hoja.bytes, expediente);
          bytes = unido.bytes as BlobPart;
          paginas = unido.paginas;
        } catch (err) {
          logger.warn("[esenciales] no se pudo unir la hoja con el expediente", { err: String(err) });
          setAviso("La hoja salió sola: el expediente quedó guardado en el Archivo.");
        }
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setLista({ url, nombreArchivo: `para-inspeccion-${hoy}.pdf`, paginas, enlace, vence: r.vence, conPapeles: !!expediente });
    } catch (err) {
      logger.error("[esenciales] hoja para inspección", { err: String(err) });
      setError("No se pudo armar la hoja. Vuelve a intentar.");
    } finally {
      setPaso(null);
    }
  }, []);

  const otra = useCallback(() => {
    setLista(null);
    setError(null);
    setAviso(null);
  }, []);

  const nota = lista ? `${lista.paginas} página${lista.paginas === 1 ? "" : "s"} · el QR abre hasta el ${fechaConDiaCorta(lista.vence)}` : null;
  return { paso, error, aviso, lista, armar, otra, nota };
}
