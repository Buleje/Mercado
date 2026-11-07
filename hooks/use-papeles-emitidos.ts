"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { enlaceVerificacion, mensajeDelPapel, type PapelDelPanel } from "@/lib/papeles/vista-panel";
import type { DbDocument } from "@/lib/types/documents";

/** El tope que acepta la ruta (`FiltroPapelesSchema`): los 200 más nuevos. */
const LIMITE = 200;

export type ErrorPapeles = "sin_permiso" | "fallo";

/**
 * Los papeles que emitió el negocio (`GET /api/admin/papeles`, ADR-534), sin la
 * clave del QR. `papeles` es `null` mientras carga.
 */
export function usePapelesEmitidos() {
  const [papeles, setPapeles] = useState<PapelDelPanel[] | null>(null);
  const [error, setError] = useState<ErrorPapeles | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/papeles?limite=${LIMITE}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) throw new ErrorDeRuta("sin_permiso");
        if (!r.ok) throw new ErrorDeRuta("fallo", `HTTP ${r.status}`);
        return (await r.json()) as { papeles?: unknown };
      })
      .then((j) => {
        if (!vivo) return;
        setPapeles(Array.isArray(j.papeles) ? (j.papeles as PapelDelPanel[]) : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        const tipo = err instanceof ErrorDeRuta ? err.tipo : "fallo";
        if (tipo === "fallo") logger.warn("[papeles] no se pudo leer la lista", { error: String(err) });
        setError(tipo);
      });
    return () => {
      vivo = false;
    };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { papeles, error, recargar };
}

class ErrorDeRuta extends Error {
  constructor(
    readonly tipo: ErrorPapeles,
    detalle?: string,
  ) {
    super(detalle ?? tipo);
  }
}

export interface EnvioDePapel {
  doc: DbDocument;
  mensaje: string;
}

/**
 * «Mandar por WhatsApp» de un papel: trae su PDF del Archivo (el envío manda el
 * archivo, no un enlace) y arma el mensaje con el enlace de comprobación.
 * `preparando` = id del papel mientras se trae su documento.
 */
export function useMandarPapel(baseQr: string | null) {
  const [envio, setEnvio] = useState<EnvioDePapel | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mandar = useCallback(
    async (p: PapelDelPanel) => {
      if (!p.documentId) return;
      setPreparando(p.id);
      setError(null);
      try {
        const r = await fetch(`/api/admin/documents/${encodeURIComponent(p.documentId)}`, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { document } = (await r.json()) as { document?: DbDocument };
        if (!document) throw new Error("el Archivo no devolvió el documento");
        setEnvio({ doc: document, mensaje: mensajeDelPapel(p, baseQr ? enlaceVerificacion(baseQr, p.codigo) : null) });
      } catch (err) {
        logger.warn("[papeles] no se pudo preparar el envío", { error: String(err), numero: p.numero });
        setError(`No se pudo preparar el PDF de ${p.numero} para mandarlo. Prueba abrirlo con «Ver PDF».`);
      } finally {
        setPreparando(null);
      }
    },
    [baseQr],
  );

  const cerrar = useCallback(() => setEnvio(null), []);
  return { envio, preparando, error, mandar, cerrar };
}
