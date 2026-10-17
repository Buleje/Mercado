"use client";

/**
 * Una inspección abierta en el celular del inspector (fase 3, 17-10).
 *
 * Guardado automático: cada cambio marca su campo como «sucio» y, 1,2 s después
 * del último, va un PATCH sólo con esos campos. Mientras viaja, lo nuevo se
 * acumula y sale en el siguiente. Sin conexión se reintenta solo (al volver la
 * red o cada 20 s) y al salir de la página se avisa. Al ocultar la pestaña
 * (bloquear el celular, abrir la cámara) se manda lo pendiente con `keepalive`.
 *
 * El conteo de trozas vive además en el equipo (localStorage por inspección):
 * el servidor guarda su acta, no cada lectura, y sin esto recargar la página
 * perdía lo contado.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";
import type { EditarInspeccion } from "@/lib/superadmin/plantas-forestales/schemas";
import { mensajeDeError } from "../use-carga";
import { escribirLocal, leerLocal } from "./almacen-local";
import {
  borradorDe,
  claveConteoLocal,
  conteoNuevo,
  conteoParaRetomar,
  type Borrador,
  type CampoGuardable,
  type EstadoGuardado,
  type InspeccionDeLaPantalla,
} from "./inspeccion-datos";

const ESPERA_MS = 1200;
const REINTENTO_MS = 20_000;
/* `keepalive` no acepta cuerpos de más de 64 KB: un conteo grande va sin él. */
const KEEPALIVE_MAX = 60_000;
const SIN_CONEXION = "Sin conexión con el servidor. Revisa tu internet: se vuelve a intentar solo.";
const POR_ESTADO = { 404: "Esa inspección no existe en esta planta." };
const JSON_HEADERS = { "Content-Type": "application/json" };

interface Actual {
  insp: InspeccionDeLaPantalla | null;
  borrador: Borrador | null;
  conteo: ConteoPatio | null;
}

function cuerpo(campos: readonly CampoGuardable[], a: Actual): EditarInspeccion {
  const b: EditarInspeccion = {};
  for (const c of campos) {
    if (c === "conteoPatio") {
      /* Sin las trozas: el servidor pone las del libro congelado (`conteoDeLaInspeccion`).
         Con 6.000 trozas cada guardado pesaría ~1 MB; en el equipo quedan enteras. */
      if (a.conteo) b.conteoPatio = { ...a.conteo, trozas: [] };
    } else if (a.borrador) {
      if (c === "hallazgos") b.hallazgos = a.borrador.hallazgos;
      if (c === "aserrada") b.aserrada = a.borrador.aserrada;
      if (c === "conclusion") b.conclusion = a.borrador.conclusion;
      if (c === "responsablePlanta") b.responsablePlanta = a.borrador.responsablePlanta;
    }
  }
  return b;
}

export function useInspeccion(tenantId: string, id: string) {
  const url = `/api/superadmin/plantas/${encodeURIComponent(tenantId)}/inspecciones/${encodeURIComponent(id)}`;
  const [insp, setInsp] = useState<InspeccionDeLaPantalla | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [conteo, setConteo] = useState<ConteoPatio | null>(null);
  const [estado, setEstado] = useState<EstadoGuardado>("guardado");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [accion, setAccion] = useState<"cerrar" | "anular" | null>(null);

  const actual = useRef<Actual>({ insp: null, borrador: null, conteo: null });
  const sucios = useRef(new Set<CampoGuardable>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef<Promise<boolean> | null>(null);

  const aplicar = useCallback((d: InspeccionDeLaPantalla, reemplazar: boolean) => {
    actual.current.insp = d;
    setInsp(d);
    if (reemplazar || !actual.current.borrador) {
      const b = borradorDe(d);
      actual.current.borrador = b;
      setBorrador(b);
    }
    if (!actual.current.conteo) {
      const c = conteoParaRetomar(leerLocal(claveConteoLocal(d.id)), d);
      if (c) {
        actual.current.conteo = c;
        setConteo(c);
      }
    }
  }, []);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const res = await fetchSuperadmin(url);
      if (!res.ok) {
        setErrorCarga(await mensajeDeError(res, POR_ESTADO));
        return;
      }
      aplicar((await res.json()) as InspeccionDeLaPantalla, sucios.current.size === 0);
    } catch {
      setErrorCarga(SIN_CONEXION);
    }
  }, [url, aplicar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (o?: { keepalive?: boolean }): Promise<boolean> => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      while (enVuelo.current) await enVuelo.current;
      if (sucios.current.size === 0) return true;
      const campos = [...sucios.current];
      sucios.current.clear();
      const json = JSON.stringify(cuerpo(campos, actual.current));
      setEstado("guardando");
      const vuelo = (async (): Promise<boolean> => {
        try {
          const res = await fetchSuperadmin(url, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: json,
            keepalive: Boolean(o?.keepalive) && json.length < KEEPALIVE_MAX,
          });
          if (res.ok) {
            aplicar((await res.json()) as InspeccionDeLaPantalla, false);
            setGuardadoEn(new Date().toISOString());
            setMensaje(null);
            setEstado(sucios.current.size > 0 ? "pendiente" : "guardado");
            return true;
          }
          if (res.status === 409) {
            /* Cerrada o anulada (en otro equipo): lo último ya no entra. Se relee y queda de sólo lectura. */
            setMensaje(await mensajeDeError(res));
            setEstado("bloqueada");
            sucios.current.clear();
            void cargar();
            return false;
          }
          campos.forEach((c) => sucios.current.add(c));
          setMensaje(await mensajeDeError(res));
          setEstado("error");
          return false;
        } catch {
          campos.forEach((c) => sucios.current.add(c));
          setMensaje(SIN_CONEXION);
          setEstado("sin-conexion");
          return false;
        }
      })();
      enVuelo.current = vuelo;
      try {
        return await vuelo;
      } finally {
        enVuelo.current = null;
      }
    },
    [url, aplicar, cargar],
  );

  const marcar = useCallback(
    (campo: CampoGuardable) => {
      sucios.current.add(campo);
      setEstado((e) => (e === "guardando" || e === "bloqueada" ? e : "pendiente"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void guardar();
      }, ESPERA_MS);
    },
    [guardar],
  );

  const cambiar = useCallback(
    <K extends keyof Borrador>(campo: K, f: (prev: Borrador[K]) => Borrador[K]) => {
      const b = actual.current.borrador;
      if (!b) return;
      const sig: Borrador = { ...b, [campo]: f(b[campo]) };
      actual.current.borrador = sig;
      setBorrador(sig);
      marcar(campo);
    },
    [marcar],
  );

  /** El conteo nace con la primera lectura, contra las trozas del libro congelado. */
  const cambiarConteo = useCallback(
    (f: (c: ConteoPatio) => ConteoPatio) => {
      const i = actual.current.insp;
      const base = actual.current.conteo ?? (i ? conteoNuevo(i) : null);
      if (!base) return;
      const sig = f(base);
      if (sig === actual.current.conteo) return;
      actual.current.conteo = sig;
      setConteo(sig);
      escribirLocal(claveConteoLocal(id), JSON.stringify(sig));
      marcar("conteoPatio");
    },
    [id, marcar],
  );

  // Aviso al salir con cambios sin guardar; envío al ocultar; reintento al volver la red.
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      if (sucios.current.size === 0 && !enVuelo.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const alOcultar = () => {
      if (document.visibilityState === "hidden" && sucios.current.size > 0) void guardar({ keepalive: true });
    };
    const alVolverLaRed = () => {
      if (sucios.current.size > 0) void guardar();
    };
    window.addEventListener("beforeunload", avisar);
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("online", alVolverLaRed);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("online", alVolverLaRed);
      /* Navegar dentro de la app no dispara `beforeunload`: lo pendiente sale al desmontar. */
      if (sucios.current.size > 0) void guardar({ keepalive: true });
    };
  }, [guardar]);

  useEffect(() => {
    if (estado !== "sin-conexion") return;
    const t = setTimeout(() => void guardar(), REINTENTO_MS);
    return () => clearTimeout(t);
  }, [estado, guardar]);

  /** PATCH de cierre o anulación: devuelve el error legible o null. */
  const terminar = useCallback(
    async (cual: "cerrar" | "anular", body: EditarInspeccion): Promise<string | null> => {
      setAccion(cual);
      try {
        const pendiente = await guardar();
        if (!pendiente && cual === "cerrar") {
          return "No se pudo guardar lo último antes de cerrar. Revisa tu conexión y vuelve a intentar.";
        }
        const res = await fetchSuperadmin(url, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
        if (!res.ok) return await mensajeDeError(res);
        sucios.current.clear();
        aplicar((await res.json()) as InspeccionDeLaPantalla, true);
        setEstado("guardado");
        setMensaje(null);
        setGuardadoEn(new Date().toISOString());
        return null;
      } catch {
        return SIN_CONEXION;
      } finally {
        setAccion(null);
      }
    },
    [url, guardar, aplicar],
  );

  const cerrar = useCallback(() => terminar("cerrar", { cerrar: true }), [terminar]);
  const anular = useCallback((motivo: string) => terminar("anular", { anular: motivo.trim() }), [terminar]);

  const editable = insp?.estado === "abierta" && estado !== "bloqueada";
  return {
    insp,
    errorCarga,
    recargar: cargar,
    borrador,
    conteo,
    editable,
    estado,
    mensaje,
    guardadoEn,
    accion,
    cambiar,
    cambiarConteo,
    guardarYa: guardar,
    cerrar,
    anular,
  };
}

export type Inspeccion = ReturnType<typeof useInspeccion>;
