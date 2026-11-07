"use client";

/**
 * Estado de la hoja de firmas (25-10): los adelantos sin firma, cuáles van, el
 * código de la hoja, imprimirla y subir la foto firmada. La hoja impresa se
 * recuerda en este navegador (código + adelantos) para poder subir la foto otro
 * día sin perder cuáles eran. Sólo la última carga escribe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ADELANTOS_POR_HOJA, codigoDeHoja, type AdelantoParaHoja } from "@/lib/adelantos/hoja-firmas";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { imprimirHojaDeFirmas } from "./hoja-firmas-pdf";

const CLAVE = "adelantos:hoja-firmas:impresa";
type Impresa = { codigo: string; ids: string[] };

function leerImpresa(): Impresa | null {
  try {
    const j = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null") as Impresa | null;
    return j && typeof j.codigo === "string" && Array.isArray(j.ids) ? j : null;
  } catch {
    return null;
  }
}

export function useHojaFirmas(open: boolean, onListo?: () => void) {
  const [lista, setLista] = useState<AdelantoParaHoja[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [carga, setCarga] = useState<"cargando" | "listo" | "error">("cargando");
  const [codigo, setCodigo] = useState(() => codigoDeHoja(new Date()));
  const [impresa, setImpresa] = useState(false);
  const [trabajando, setTrabajando] = useState<"imprimiendo" | "subiendo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeSubir, setPuedeSubir] = useState(true);
  const [subida, setSubida] = useState<{ codigo: string; n: number } | null>(null);
  const turno = useRef(0);

  const cargar = useCallback(() => {
    const mio = ++turno.current;
    setCarga("cargando");
    fetch("/api/adelantos/hoja-firmas", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const j = await leerJson<{ adelantos?: AdelantoParaHoja[]; puedeSubir?: boolean }>(res);
        if (mio !== turno.current) return;
        if (!res.ok || !j?.adelantos) {
          logger.warn("[adelantos] hoja de firmas: no se pudo leer", { status: res.status });
          return setCarga("error");
        }
        const items = j.adelantos;
        setPuedeSubir(j.puedeSubir !== false);
        const previa = leerImpresa();
        const vigentes = previa ? previa.ids.filter((id) => items.some((a) => a.id === id)) : [];
        if (previa && vigentes.length > 0) {
          setCodigo(previa.codigo);
          setElegidos(new Set(vigentes));
          setImpresa(true);
        } else {
          setElegidos(new Set(items.slice(0, MAX_ADELANTOS_POR_HOJA).map((a) => a.id)));
          setImpresa(false);
        }
        setLista(items);
        setCarga("listo");
      })
      .catch((err) => {
        logger.error("[adelantos] hoja de firmas: no se pudo leer", { error: String(err) });
        if (mio === turno.current) setCarga("error");
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubida(null);
    cargar();
  }, [open, cargar]);

  const alternar = (id: string) => {
    setImpresa(false); // otra selección = otra hoja
    setCodigo(codigoDeHoja(new Date()));
    setElegidos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX_ADELANTOS_POR_HOJA) n.add(id);
      return n;
    });
  };
  const todos = (marcar: boolean) => {
    setImpresa(false);
    setCodigo(codigoDeHoja(new Date()));
    setElegidos(new Set(marcar ? lista.slice(0, MAX_ADELANTOS_POR_HOJA).map((a) => a.id) : []));
  };

  const imprimir = async () => {
    const filas = lista.filter((a) => elegidos.has(a.id));
    if (filas.length === 0) return setError("Marca al menos un adelanto.");
    setTrabajando("imprimiendo");
    setError(null);
    try {
      await imprimirHojaDeFirmas(codigo, filas);
      window.localStorage.setItem(CLAVE, JSON.stringify({ codigo, ids: filas.map((a) => a.id) } satisfies Impresa));
      setImpresa(true);
    } catch (e) {
      logger.error("[adelantos] hoja de firmas: no se pudo armar el PDF", { error: String(e) });
      setError("No se pudo armar la hoja. Vuelve a intentarlo.");
    } finally {
      setTrabajando(null);
    }
  };

  const subirFoto = async (foto: Blob, nombre: string) => {
    const ids = lista.filter((a) => elegidos.has(a.id)).map((a) => a.id);
    if (ids.length === 0) return setError("Marca los adelantos que firmaron en esta hoja.");
    setTrabajando("subiendo");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("datos", JSON.stringify({ codigo, adelantoIds: ids }));
      fd.append("file", new File([foto], nombre, { type: foto.type || "image/jpeg" }));
      const res = await fetch("/api/adelantos/hoja-firmas", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<{ error?: string; message?: string; adelantos?: number }>(res);
      if (res.ok) {
        window.localStorage.removeItem(CLAVE);
        setSubida({ codigo, n: j?.adelantos ?? ids.length });
        cargar();
        onListo?.();
        return;
      }
      setError([j?.message, j?.error].find((t) => !!t && /\s/.test(t)) ?? "La foto no se guardó. Vuelve a intentarlo.");
    } catch (e) {
      logger.error("[adelantos] hoja de firmas: no se pudo subir la foto", { error: String(e) });
      setError("La foto no se guardó. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setTrabajando(null);
    }
  };

  return { lista, elegidos, carga, codigo, impresa, trabajando, error, subida, puedeSubir, cargar, alternar, todos, imprimir, subirFoto };
}
