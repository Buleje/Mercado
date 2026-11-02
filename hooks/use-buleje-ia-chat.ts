"use client";

/**
 * Una conversación de Buleje IA (ADR-528): cargar, mandar con fotos, reintentar
 * y resolver las tarjetas «¿Confirmas?». Contrato: carril 3
 * (`POST /api/admin/ia/chat`, `GET /api/admin/ia/conversaciones/[id]`,
 * `POST /api/admin/ia/confirmar`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MensajeApp } from "@/lib/ia-proveedores/tipos";
import { pedirIa } from "@/components/admin/buleje-ia/api";
import { achicarFoto, armarFormData } from "@/components/admin/buleje-ia/fotos";
import {
  ID_TEMPORAL,
  confirmarEnvio,
  hayEnvioEnCurso,
  marcarEnviando,
  marcarFallo,
  mensajeOptimista,
  quitarMensaje,
  urlsLocales,
  type MensajeVista,
  type Resolucion,
} from "@/components/admin/buleje-ia/optimista";

interface RespuestaChat {
  conversacionId: string;
  usuario: MensajeApp;
  asistente: MensajeApp;
}

interface Opciones {
  conversacionId: string | null;
  /** La primera respuesta trae el id de la conversación nueva: la pantalla lo pone en la URL. */
  alCrear: (id: string) => void;
  /** Para refrescar la lista de la barra lateral (título, último mensaje). */
  alCambiar?: () => void;
}

export function useBulejeIaChat({ conversacionId, alCrear, alCambiar }: Opciones) {
  const [mensajes, setMensajes] = useState<MensajeVista[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [resueltas, setResueltas] = useState<Record<string, Resolucion>>({});
  const [vuelta, setVuelta] = useState(0);
  /** Lo que hace falta para reintentar un envío fallido (las fotos ya achicadas). */
  const reintentos = useRef(new Map<string, { texto: string; fotos: File[] }>());
  /** La conversación que ESTA pantalla acaba de crear: no se recarga del servidor (pisaría lo optimista). */
  const creadaAqui = useRef<string | null>(null);
  const idActual = useRef(conversacionId);
  idActual.current = conversacionId;
  const contador = useRef(0);

  useEffect(() => {
    if (!conversacionId) {
      creadaAqui.current = null;
      setMensajes([]);
      setErrorCarga(null);
      setResueltas({});
      return;
    }
    if (creadaAqui.current === conversacionId) return;
    creadaAqui.current = null;
    const ctrl = new AbortController();
    setCargando(true);
    setErrorCarga(null);
    setMensajes([]);
    setResueltas({});
    pedirIa<{ mensajes: MensajeApp[] }>(`/api/admin/ia/conversaciones/${encodeURIComponent(conversacionId)}`, { signal: ctrl.signal })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (r.ok) setMensajes(r.data.mensajes ?? []);
        else setErrorCarga(r.error);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setErrorCarga("No pude abrir la conversación.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [conversacionId, vuelta]);

  const despachar = useCallback(
    async (idTemporal: string, texto: string, fotos: File[]) => {
      const desde = idActual.current;
      const r = await pedirIa<RespuestaChat>("/api/admin/ia/chat", { method: "POST", form: armarFormData(texto, desde, fotos) });
      // Si mientras pensaba cambiaste a otra conversación, la respuesta no se mezcla con esa.
      if (idActual.current !== desde) return;
      if (!r.ok) {
        setMensajes((l) => marcarFallo(l, idTemporal, r.error));
        return;
      }
      reintentos.current.delete(idTemporal);
      setMensajes((l) => {
        for (const u of urlsLocales(l.find((m) => m.id === idTemporal))) URL.revokeObjectURL(u);
        return confirmarEnvio(l, idTemporal, r.data.usuario, r.data.asistente);
      });
      if (!desde && r.data.conversacionId) {
        creadaAqui.current = r.data.conversacionId;
        alCrear(r.data.conversacionId);
      }
      alCambiar?.();
    },
    [alCrear, alCambiar],
  );

  /** Manda texto + fotos. Devuelve un error de las fotos (para el compositor) o null. */
  const enviar = useCallback(
    async (texto: string, fotosCrudas: File[]): Promise<string | null> => {
      const limpio = texto.trim();
      if (!limpio && fotosCrudas.length === 0) return null;
      let fotos: File[];
      try {
        fotos = await Promise.all(fotosCrudas.map((f) => achicarFoto(f)));
      } catch (err) {
        return err instanceof Error ? err.message : "No pude preparar las fotos.";
      }
      const id = `${ID_TEMPORAL}${Date.now()}-${++contador.current}`;
      const textoFinal = limpio || "Te mando esta foto.";
      reintentos.current.set(id, { texto: textoFinal, fotos });
      const locales = fotos.map((f) => ({ nombre: f.name, url: URL.createObjectURL(f) }));
      setMensajes((l) => [...l, mensajeOptimista(id, textoFinal, locales)]);
      void despachar(id, textoFinal, fotos);
      return null;
    },
    [despachar],
  );

  const reintentar = useCallback(
    (idTemporal: string) => {
      const r = reintentos.current.get(idTemporal);
      if (!r) return;
      setMensajes((l) => marcarEnviando(l, idTemporal));
      void despachar(idTemporal, r.texto, r.fotos);
    },
    [despachar],
  );

  const descartar = useCallback((idTemporal: string) => {
    reintentos.current.delete(idTemporal);
    setMensajes((l) => {
      for (const u of urlsLocales(l.find((m) => m.id === idTemporal))) URL.revokeObjectURL(u);
      return quitarMensaje(l, idTemporal);
    });
  }, []);

  const resolver = useCallback(async (aprobacionId: string, decision: "aprobar" | "rechazar") => {
    const desde = idActual.current;
    if (!desde) return;
    setResueltas((s) => ({ ...s, [aprobacionId]: { estado: "enCurso", decision } }));
    const r = await pedirIa<{ mensaje: MensajeApp }>("/api/admin/ia/confirmar", {
      method: "POST",
      json: { conversacionId: desde, aprobacionId, decision },
    });
    if (!r.ok) {
      setResueltas((s) => ({ ...s, [aprobacionId]: { estado: "error", detalle: r.error } }));
      return;
    }
    setResueltas((s) => ({
      ...s,
      [aprobacionId]: decision === "aprobar" ? { estado: "aprobada", detalle: r.data.mensaje?.texto ?? "" } : { estado: "rechazada" },
    }));
    if (idActual.current === desde && r.data.mensaje) setMensajes((l) => [...l, r.data.mensaje]);
  }, []);

  return {
    mensajes,
    cargando,
    errorCarga,
    recargar: () => {
      creadaAqui.current = null;
      setVuelta((v) => v + 1);
    },
    pensando: hayEnvioEnCurso(mensajes),
    enviar,
    reintentar,
    descartar,
    resolver,
    resueltas,
  };
}

export type BulejeIaChat = ReturnType<typeof useBulejeIaChat>;
