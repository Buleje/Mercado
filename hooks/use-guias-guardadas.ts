"use client";

/**
 * use-guias-guardadas — las guías que se guardan ANTES del ingreso (ADR-442):
 * la lista (por ingresar / ya ingresadas / todas), una guía con su ficha, y
 * las escrituras (guardar, editar, eliminar, buscar por N° de registro o GTF).
 *
 * Sólo habla con `/api/admin/forestal/guias/guardadas`. Los papeles de cada
 * guía NO pasan por acá: son los casilleros de ADR-438 (`use-documentos-guia`),
 * atados a la guía por su N° de GTF.
 *
 * Las escrituras son funciones sueltas (sin estado de React) para que la vista
 * de Ingresos pueda pedir el detalle de una guía justo antes de abrir el alta
 * de ingreso, sin montar un hook para eso.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type {
  EstadoLista,
  GuiaGuardadaDetalle,
  GuiaGuardadaInput,
  GuiaGuardadaVista,
  ListaGuiasGuardadas,
} from "@/lib/forestal/guias-guardadas";

const RUTA = "/api/admin/forestal/guias/guardadas";

interface CuerpoDeError {
  error?: string;
  message?: string;
  id?: string;
}

async function leerCuerpo<T>(res: Response): Promise<T | null> {
  return (await res.json().catch((err: unknown) => {
    logger.warn("[guias-guardadas] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as T | null;
}

/** Lo que el servidor contesta al guardar o editar. */
export type ResultadoGuiaGuardada =
  | { ok: true; guia: GuiaGuardadaDetalle; corregidos: string[]; aviso: string | null }
  | {
      ok: false;
      status: number;
      /** `ya_guardada`, `ya_ingresada`, `guia_no_encontrada`, `falta_gtf`… */
      codigo: string | null;
      mensaje: string;
      /** Con `ya_guardada`: la guía que ya existe, para abrirla. */
      idExistente: string | null;
    };

/** Mensaje de respaldo por código, si el servidor no mandó el suyo. */
const POR_CODIGO: Record<string, string> = {
  ya_guardada: "Esa guía ya está guardada.",
  ya_ingresada: "Esa GTF ya está en el libro: regístrala desde el ingreso.",
  guia_no_encontrada:
    "SERFOR no encontró una guía con ese N° de registro. Revisa el número o guárdala a mano con su N° de GTF.",
  falta_gtf: "Falta el N° de GTF: escríbelo o busca la guía en SERFOR con su N° de registro.",
  numero_invalido: "El número no tiene la forma de un N° de registro o de GTF.",
  invalid_body: "Revisa los datos: alguno no tiene la forma esperada.",
};

async function escribir(
  url: string,
  method: "POST" | "PATCH",
  input: GuiaGuardadaInput,
): Promise<ResultadoGuiaGuardada> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    const j = await leerCuerpo<
      CuerpoDeError & { guia?: GuiaGuardadaDetalle; corregidos?: string[]; aviso?: string | null }
    >(res);
    if (res.ok && j?.guia) {
      return { ok: true, guia: j.guia, corregidos: j.corregidos ?? [], aviso: j.aviso ?? null };
    }
    const codigo = j?.error ?? null;
    /* «No encontrada» se dice con nuestras palabras: el servidor pasa el texto
       crudo de SERFOR, que arrastra el pie de su página («2026 Servicio
       Nacional Forestal… V2.5.6», medido 27-09). */
    const propio = codigo === "guia_no_encontrada" ? POR_CODIGO[codigo] : undefined;
    return {
      ok: false,
      status: res.status,
      codigo,
      mensaje:
        propio ??
        j?.message ??
        (codigo ? POR_CODIGO[codigo] : undefined) ??
        `No se pudo guardar la guía (HTTP ${res.status}).`,
      idExistente: codigo === "ya_guardada" && typeof j?.id === "string" ? j.id : null,
    };
  } catch (e) {
    logger.error("[guias-guardadas] guardar failed", { method, error: String(e) });
    return {
      ok: false,
      status: 0,
      codigo: null,
      mensaje: "No se pudo guardar la guía. Revisa la señal y prueba de nuevo.",
      idExistente: null,
    };
  }
}

export const crearGuiaGuardada = (input: GuiaGuardadaInput) => escribir(RUTA, "POST", input);

export const editarGuiaGuardada = (id: string, input: GuiaGuardadaInput) =>
  escribir(`${RUTA}/${encodeURIComponent(id)}`, "PATCH", input);

/** Una guía con su ficha, o `null` si no se pudo leer (el error queda en el log). */
export async function obtenerGuiaGuardada(id: string): Promise<GuiaGuardadaDetalle | null> {
  try {
    const res = await fetch(`${RUTA}/${encodeURIComponent(id)}`, { credentials: "include" });
    if (!res.ok) {
      logger.warn("[guias-guardadas] obtener", { id, status: res.status });
      return null;
    }
    return (await leerCuerpo<{ guia?: GuiaGuardadaDetalle }>(res))?.guia ?? null;
  } catch (e) {
    logger.error("[guias-guardadas] obtener failed", { id, error: String(e) });
    return null;
  }
}

/**
 * El detalle FRESCO (con la ficha) justo antes de abrir el alta de ingreso.
 * Se pide siempre: el que tiene la pantalla puede ser de antes de subir un
 * papel (medido 27-09: el alta decía «0 de 6 documentos» con la factura ya
 * subida). Si el pedido falla, sirve el que ya se tenía si trae la ficha.
 */
export async function detalleDeGuia(
  g: GuiaGuardadaVista | GuiaGuardadaDetalle,
): Promise<GuiaGuardadaDetalle | null> {
  const fresco = await obtenerGuiaGuardada(g.id);
  return fresco ?? ("serforGtf" in g ? g : null);
}

/** La guía guardada con ese N° de registro o de GTF, o `null` si no hay. */
export async function buscarGuiaGuardada(numero: string): Promise<GuiaGuardadaDetalle | null> {
  const q = numero.trim();
  if (!q) return null;
  try {
    const res = await fetch(`${RUTA}?buscar=${encodeURIComponent(q)}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await leerCuerpo<{ guia?: GuiaGuardadaDetalle | null }>(res))?.guia ?? null;
  } catch (e) {
    logger.warn("[guias-guardadas] buscar failed", { error: String(e) });
    return null;
  }
}

/** Elimina la guía guardada. Sus papeles se QUEDAN en Documentos. Devuelve el error o `null`. */
export async function eliminarGuiaGuardada(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${RUTA}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
    });
    if (res.ok) return null;
    const j = await leerCuerpo<CuerpoDeError>(res);
    if (res.status === 403 && !j?.message)
      return "Sólo el administrador o el dueño pueden eliminar una guía guardada.";
    return j?.message ?? `No se pudo eliminar la guía (HTTP ${res.status}).`;
  } catch (e) {
    logger.error("[guias-guardadas] eliminar failed", { id, error: String(e) });
    return "No se pudo eliminar la guía. Revisa la señal y prueba de nuevo.";
  }
}

/**
 * La lista, con su estado. `recargarKey` la vuelve a pedir desde afuera (la
 * vista la sube después de registrar un ingreso: la guía pasa a «ingresada»).
 */
export function useGuiasGuardadas({
  estado,
  activo = true,
  recargarKey = 0,
}: {
  estado: EstadoLista;
  activo?: boolean;
  recargarKey?: number;
}) {
  const [datos, setDatos] = useState<ListaGuiasGuardadas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* El GET del doble montaje (o el de un filtro anterior) puede volver tarde y
     pisar la lista nueva: sólo vale el último pedido (memoria «carga vieja
     pisa lo optimista»). */
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    if (!activo) return;
    const mio = ++turno.current;
    setCargando(true);
    try {
      const res = await fetch(`${RUTA}?estado=${estado}`, { credentials: "include" });
      if (!res.ok) {
        const j = await leerCuerpo<CuerpoDeError>(res);
        throw new Error(j?.message ?? "No se pudieron leer las guías guardadas.");
      }
      const d = await leerCuerpo<ListaGuiasGuardadas>(res);
      if (mio === turno.current) {
        setDatos(d ?? { guias: [], porIngresar: 0, total: 0 });
        setError(null);
      }
    } catch (e) {
      if (mio === turno.current)
        setError(e instanceof Error ? e.message : "No se pudieron leer las guías guardadas.");
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [estado, activo]);

  useEffect(() => {
    void recargar();
  }, [recargar, recargarKey]);

  return { datos, cargando, error, recargar };
}

/**
 * UNA guía para su modal: la lee por id (si hay) y guarda o edita. Después de
 * escribir, lo que vuelve del servidor es la verdad: puede traer la GTF, el
 * titular o el permiso que puso la ficha de SERFOR en vez de lo tipeado.
 */
export function useGuiaGuardada(idInicial: string | null) {
  const [id, setId] = useState<string | null>(idInicial);
  const [guia, setGuia] = useState<GuiaGuardadaDetalle | null>(null);
  const [cargando, setCargando] = useState(Boolean(idInicial));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<"guardar" | "serfor" | null>(null);
  const turno = useRef(0);
  /** La guía que ya está en `guia`: al crear, el id nuevo no se vuelve a pedir. */
  const cargado = useRef<string | null>(null);

  useEffect(() => {
    if (!id || cargado.current === id) return;
    const mio = ++turno.current;
    setCargando(true);
    void obtenerGuiaGuardada(id).then((g) => {
      if (mio !== turno.current) return;
      setCargando(false);
      if (g) {
        cargado.current = g.id;
        setGuia(g);
        setError(null);
      } else setError("No se pudo leer la guía guardada.");
    });
  }, [id]);

  const guardar = useCallback(
    async (input: GuiaGuardadaInput): Promise<ResultadoGuiaGuardada> => {
      ++turno.current; // un GET en vuelo ya no vale
      setGuardando(input.consultarSerfor ? "serfor" : "guardar");
      try {
        const r = id ? await editarGuiaGuardada(id, input) : await crearGuiaGuardada(input);
        if (r.ok) {
          cargado.current = r.guia.id;
          setGuia(r.guia);
          setId(r.guia.id);
          setError(null);
        }
        return r;
      } finally {
        setGuardando(null);
        setCargando(false);
      }
    },
    [id],
  );

  return { id, abrir: setId, guia, cargando, error, guardando, guardar };
}
