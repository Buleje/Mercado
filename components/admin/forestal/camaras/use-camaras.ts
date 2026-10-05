"use client";

/**
 * useCamaras — los datos de la pantalla de Cámaras y todo lo que los cambia.
 *
 * Un solo dueño de `camaras`, `capturas`, `chalecos` y `colaboradores`: la
 * tarjeta de la foto confirma un cruce, el modal asigna un chaleco y la fila de
 * la cámara prende la pila, y los tres escriben por `escribir`, que aplica lo
 * que devolvió el servidor y recarga en silencio.
 *
 * ## Una carga vieja no pisa un cambio
 *
 * Con el GET del doble montaje o el de «Actualizar» todavía en vuelo, la foto
 * borrada reaparecía y, tras «Cambiar la dirección», volvía la dirección vieja
 * (mismo bug medido en Tareas el 2026-09-14). Sólo se aplica lo que trae la
 * carga más nueva, y sólo si no hubo cambios mientras viajaba.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AvisosCamara, Captura } from "@/lib/camaras/camaras";
import type { CamaraConConexion } from "./ConectarCamaraModal";
import { API_CAMARAS, type ChalecosPantalla, type ColaboradorOpcion } from "./camaras-ui";
import type { CamposPuente } from "./puente-pc";

interface RespuestaGet {
  camaras?: CamaraConConexion[];
  capturas?: Captura[];
  chalecos?: ChalecosPantalla;
  colaboradores?: ColaboradorOpcion[];
}

interface RespuestaEscritura {
  mensaje?: string;
  message?: string;
  error?: string;
  camaras?: CamaraConConexion[];
  captura?: Captura;
  chalecos?: ChalecosPantalla;
}

/**
 * La dirección LOCAL de la puerta de la cámara: la usan las subidas desde este
 * navegador («Subir a mano», «Guardar» del visor). La que se copia en el aparato
 * es otra (la pública, `useDireccionPublica`): mandar la subida por el túnel
 * sería un pedido a otro dominio que el navegador no deja leer.
 */
export const direccionLocal = (token: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/camara?k=${token}`;

function conAvisoPrevio(
  nuevas: CamaraConConexion[],
  previas: CamaraConConexion[],
): CamaraConConexion[] {
  const aviso = new Map(previas.map((c) => [c.id, c.ultimoAviso] as const));
  return nuevas.map((c) =>
    c.ultimoAviso === undefined ? { ...c, ultimoAviso: aviso.get(c.id) ?? null } : c,
  );
}

export function useCamaras() {
  const [camaras, setCamaras] = useState<CamaraConConexion[]>([]);
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [chalecos, setChalecos] = useState<ChalecosPantalla>({});
  const [colaboradores, setColaboradores] = useState<ColaboradorOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cargasRef = useRef({ ultima: 0, cambios: 0 });

  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    const vigente = () => esta === cargasRef.current.ultima;
    if (!opciones?.silenciosa) setCargando(true);
    try {
      const r = await fetch(API_CAMARAS, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as RespuestaGet;
      if (vigente() && cambiosAlSalir === cargasRef.current.cambios) {
        setCamaras(j.camaras ?? []);
        setCapturas(j.capturas ?? []);
        setChalecos(j.chalecos ?? {});
        setColaboradores(j.colaboradores ?? []);
      }
      // La silenciosa no borra el error de la escritura que la disparó.
      if (vigente() && !opciones?.silenciosa) setError(null);
    } catch {
      if (vigente() && !opciones?.silenciosa) setError("No se pudo leer las cámaras.");
    } finally {
      if (vigente()) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Cuenta un cambio en curso: la carga que ya salió no lo va a pisar. */
  const marcarCambio = useCallback(() => {
    cargasRef.current.cambios += 1;
  }, []);

  /** Escribe, aplica lo que vuelve y recarga en silencio. `null` = falló (el error ya quedó a la vista). */
  const escribir = useCallback(
    async (init: RequestInit & { url?: string }): Promise<RespuestaEscritura | null> => {
      setGuardando(true);
      setError(null);
      cargasRef.current.cambios += 1;
      try {
        const r = await fetch(init.url ?? API_CAMARAS, {
          ...init,
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
        });
        const j = (await r.json().catch(() => ({}))) as RespuestaEscritura;
        if (!r.ok || j.error)
          throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
        const llegadas = j.camaras;
        /* Las escrituras devuelven la lista sin `ultimoAviso` (lo arma el GET):
           se conserva el que había para que no parpadee «nunca». */
        if (llegadas) setCamaras((prev) => conAvisoPrevio(llegadas, prev));
        if (j.chalecos) setChalecos(j.chalecos);
        const nueva = j.captura;
        if (nueva) setCapturas((prev) => prev.map((c) => (c.id === nueva.id ? nueva : c)));
        if (j.mensaje) setAviso(j.mensaje);
        return j;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setGuardando(false);
        void cargar({ silenciosa: true });
      }
    },
    [cargar],
  );

  const patch = useCallback(
    (cuerpo: Record<string, unknown>) =>
      escribir({ method: "PATCH", body: JSON.stringify(cuerpo) }),
    [escribir],
  );

  /** Devuelve el id de la cámara creada (o `null`): «Enlazar» de Hik-Connect la crea y la
   *  enlaza en un toque (05-10). Quien sólo preguntaba si salió sigue leyendo un valor truthy. */
  const crear = async (nombre: string, lugar: string): Promise<string | null> => {
    if (!nombre.trim()) return null;
    const antes = new Set(camaras.map((c) => c.id));
    const ok = await escribir({ method: "POST", body: JSON.stringify({ nombre, lugar }) });
    if (!ok) return null;
    await cargar();
    return ok.camaras?.find((c) => !antes.has(c.id))?.id ?? null;
  };

  const borrarCaptura = async (id: string) => {
    if (
      await escribir({ method: "DELETE", url: `${API_CAMARAS}?captura=${encodeURIComponent(id)}` })
    ) {
      setCapturas((prev) => prev.filter((x) => x.id !== id));
    }
  };

  /**
   * Subir una foto a mano por la MISMA puerta que usa la cámara (2026-09-12):
   * sirve para ver cómo queda el historial y probar la lectura de la IA antes
   * de que el aparato esté conectado. Entra como evento «manual».
   */
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const subirAMano = async (c: CamaraConConexion, archivo: File) => {
    setSubiendo(c.id);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", archivo);
      /* Con la sesión, sin el token de la cámara (que sólo ven admin y dueño):
         el almacenero también sube a mano (revisión de seguridad 03-10). */
      const r = await fetch(`/api/admin/camaras/${encodeURIComponent(c.id)}/foto`, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: form,
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        throw new Error(
          j.error === "muy_grande"
            ? "La foto pesa más de lo permitido: sácale una captura o bájale la calidad."
            : `La cámara no la aceptó (${j.error ?? r.status}).`,
        );
      }
      setAviso("Foto guardada. La lectura de la IA aparece en unos segundos.");
      await cargar();
      /* La IA lee DESPUÉS de guardar (medido: ~2-3 s). Una recarga silenciosa
         trae la lectura sin que haya que tocar «Actualizar». */
      setTimeout(() => void cargar({ silenciosa: true }), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(null);
    }
  };

  return {
    camaras,
    setCamaras,
    capturas,
    chalecos,
    colaboradores,
    cargando,
    error,
    setError,
    aviso,
    setAviso,
    guardando,
    subiendo,
    cargar,
    marcarCambio,
    escribir,
    crear,
    borrarCaptura,
    subirAMano,
    rotar: (id: string) => patch({ id, accion: "rotar" }),
    quitar: (id: string) =>
      escribir({ method: "DELETE", url: `${API_CAMARAS}?id=${encodeURIComponent(id)}` }),
    desconectar: (id: string) => patch({ id, accion: "desconectar" }),
    guardarAvisos: (id: string, whatsapp: string, cuando: AvisosCamara["cuando"]) =>
      patch({ id, accion: "avisos", whatsapp, cuando }),
    vigilarPila: (id: string, activa: boolean) => patch({ id, accion: "vigila-pila", activa }),
    /** El puente de pantalla (ADR-466): fuente, recorte y ajustes del modo vivo. `fuente: null` lo apaga. */
    ajustarPuente: async (id: string, campos: CamposPuente) =>
      Boolean(await patch({ id, accion: "puente", ...campos })),
    asignarChaleco: (numero: string, colaboradorId: string | null) =>
      patch({ accion: "chalecos", numero, colaboradorId }),
    confirmarCruce: (capturaId: string, refId: string) =>
      patch({ accion: "confirmar-cruce", capturaId, refId }),
  };
}

export type DatosCamaras = ReturnType<typeof useCamaras>;
