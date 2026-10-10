"use client";

/**
 * Los controles del aparato en el visor de la nube (ADR-472): mover, foto,
 * detección, micrófono y alarma, contra `/api/admin/camaras/[id]/control`.
 *
 * ## Mover: una cola, como EZUIKit
 *
 * EZVIZ tarda 1-2,5 s en contestar por 4G (medido 05-10) y su doc pide frenar
 * ANTES de cualquier otro movimiento. Si el «frenar» de un toque corto llegara
 * antes que su «empezar», la cámara quedaría girando hasta el tope. Por eso
 * cada pedido sale cuando contestó el anterior. Además, con el botón apretado
 * más de {@link SEGUNDOS_MAX_MOVER} s se frena solo, y al irse (cerrar el
 * visor, pestaña al fondo) también.
 *
 * ## Alarma: «Apagar» no se esconde hasta que la cámara dijo que sí
 *
 * Hoy la alarma está deshabilitada (`alarmaHabilitada` del GET, ADR-472);
 * esto queda listo para cuando se habilite. «Apagar» sigue a la vista hasta
 * que el apagado contestó OK ({@link INTENTOS_APAGAR} intentos con espera);
 * un «sonar» que falló de forma dudosa se trata como sonando; y al cerrar el
 * visor/mosaico o la pestaña se manda el apagado con `keepalive`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { Capacidades, Direccion, EstadoTarjeta } from "@/lib/camaras/ezviz-control";
import { formularioDeAnalisis, imagenDeBase64 } from "./analizar-cuadro";
import { EVENTO_FOTO_NUEVA } from "./use-analizar-cuadro";

export const SEGUNDOS_MAX_MOVER = 8;
/** Opciones de la alarma en la confirmación (segundos). */
export const DURACIONES_ALARMA = [15, 30, 60] as const;
/** Intentos de «apagar» antes de rendirse (y dejar «Apagar» a la vista). */
export const INTENTOS_APAGAR = 3;
const ESPERA_APAGAR_MS = 1500;

export interface DatosControles {
  capacidades: Capacidades;
  deteccion: boolean | null;
  microfono: boolean | null;
  enLinea: boolean | null;
  bateria: number | null;
  tarjeta: EstadoTarjeta | null;
  puedeConfigurar: boolean;
  /** `false` = el botón «Alarma» se ve deshabilitado con su ⓘ. */
  alarmaHabilitada?: boolean;
}

/** La alarma, vista desde la pantalla: hasta cuándo y si es seguro que sonó. */
interface AlarmaEnCurso {
  hasta: number;
  /** El «sonar» falló de forma dudosa: puede estar sonando o no. */
  quiza: boolean;
}

type Ocupado = "deteccion" | "microfono" | "foto" | "alarma" | null;

const esDatos = (j: unknown): j is DatosControles =>
  !!j &&
  typeof j === "object" &&
  "capacidades" in j &&
  typeof (j as DatosControles).capacidades === "object";

async function pedir(
  camaraId: string,
  cuerpo: Record<string, unknown>,
  keepalive = false,
): Promise<{ ok: boolean; json: Record<string, unknown> | null }> {
  try {
    const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/control`, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(cuerpo),
      keepalive,
    });
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: r.ok, json };
  } catch (err) {
    logger.warn("[camaras] control sin respuesta", { error: String(err) });
    return { ok: false, json: null };
  }
}

const mensajeDe = (json: Record<string, unknown> | null, porDefecto: string) =>
  typeof json?.message === "string" && json.message ? json.message : porDefecto;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * «Foto»: primero la que saca la cámara (mejor y sin depender del video); si
 * la cámara no puede (medido: «Entrada» contesta 60017), el cuadro que se ve,
 * por la misma puerta que «Analizar».
 */
async function guardarCuadro(
  camaraId: string,
  tomarCuadro: () => Promise<string | null>,
): Promise<boolean> {
  const b64 = await tomarCuadro();
  const foto = b64 ? imagenDeBase64(b64) : null;
  if (!foto) return false;
  try {
    const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/foto`, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: formularioDeAnalisis(foto),
    });
    return r.ok;
  } catch (err) {
    logger.warn("[camaras] el cuadro no se guardó", { error: String(err) });
    return false;
  }
}

export function useControlesCamara(
  camaraId: string,
  activo: boolean,
  tomarCuadro?: () => Promise<string | null>,
) {
  const [datos, setDatos] = useState<DatosControles | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [moviendo, setMoviendo] = useState<Direccion | null>(null);
  const [alarma, setAlarma] = useState<AlarmaEnCurso | null>(null);
  const [apagando, setApagando] = useState(false);
  const [fotoGuardada, setFotoGuardada] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const direccionRef = useRef<Direccion | null>(null);
  const tope = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Puede estar sonando (lo leen el cierre y `pagehide`, fuera de React). */
  const sonandoRef = useRef(false);
  const apagandoRef = useRef(false);
  /** El apagado automático del final de la cuenta ya se intentó. */
  const vencidaRef = useRef(false);

  /* Qué sabe hacer la cámara: se pregunta UNA vez, cuando el video ya se ve. */
  useEffect(() => {
    if (!activo || datos) return;
    const control = new AbortController();
    fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/control`, {
      credentials: "include",
      signal: control.signal,
    })
      .then((r) => r.json())
      .then((j: unknown) => {
        if (esDatos(j)) setDatos(j);
      })
      .catch((err: unknown) => {
        if (!control.signal.aborted)
          logger.warn("[camaras] no se leyeron los controles", { error: String(err) });
      });
    return () => control.abort();
  }, [activo, camaraId, datos]);

  /* El aviso se va solo. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const encolar = useCallback((tarea: () => Promise<unknown>) => {
    cola.current = cola.current.then(tarea, tarea);
  }, []);

  /** Manda el freno SIEMPRE (el cuadradito del medio: por si un freno se perdió). */
  const frenar = useCallback(() => {
    const d = direccionRef.current;
    direccionRef.current = null;
    setMoviendo(null);
    if (tope.current) clearTimeout(tope.current);
    encolar(() => pedir(camaraId, { accion: "ptz", direccion: "stop", ...(d && { ultima: d }) }));
  }, [camaraId, encolar]);

  /** Soltar: frena sólo si se estaba moviendo (pasear el mouse no manda nada). */
  const parar = useCallback(() => {
    if (direccionRef.current) frenar();
  }, [frenar]);

  const mover = useCallback(
    (d: Direccion) => {
      if (direccionRef.current === d) return;
      const anterior = direccionRef.current;
      direccionRef.current = d;
      setMoviendo(d);
      if (anterior)
        encolar(() => pedir(camaraId, { accion: "ptz", direccion: "stop", ultima: anterior }));
      encolar(async () => {
        const r = await pedir(camaraId, { accion: "ptz", direccion: d, velocidad: 1 });
        if (!r.ok) {
          setAviso(mensajeDe(r.json, "La cámara no se movió."));
          if (direccionRef.current === d) {
            direccionRef.current = null;
            setMoviendo(null);
          }
        }
      });
      if (tope.current) clearTimeout(tope.current);
      tope.current = setTimeout(parar, SEGUNDOS_MAX_MOVER * 1000);
    },
    [camaraId, encolar, parar],
  );

  /* Irse con la cámara girando = que gire hasta el tope: se frena al salir. */
  useEffect(() => {
    const alFondo = () => {
      if (document.visibilityState === "hidden") parar();
    };
    document.addEventListener("visibilitychange", alFondo);
    return () => {
      document.removeEventListener("visibilitychange", alFondo);
      const d = direccionRef.current;
      if (d) {
        direccionRef.current = null;
        void pedir(camaraId, { accion: "ptz", direccion: "stop", ultima: d }, true);
      }
      if (tope.current) clearTimeout(tope.current);
    };
  }, [camaraId, parar]);

  const alternar = useCallback(
    async (accion: "deteccion" | "microfono") => {
      const actual = datos?.[accion];
      if (actual === undefined) return;
      setOcupado(accion);
      const r = await pedir(camaraId, { accion, activa: !actual });
      setOcupado(null);
      if (!r.ok) {
        setAviso(mensajeDe(r.json, "La cámara no tomó el cambio."));
        return;
      }
      const nuevo = r.json?.[accion];
      setDatos((x) => (x ? { ...x, [accion]: typeof nuevo === "boolean" ? nuevo : !actual } : x));
    },
    [camaraId, datos],
  );

  const sacarFoto = useCallback(async () => {
    setOcupado("foto");
    setFotoGuardada(false);
    const r = await pedir(camaraId, { accion: "captura" });
    let ok = r.ok;
    if (!ok && r.json?.error === "hikvision" && tomarCuadro) {
      ok = await guardarCuadro(camaraId, tomarCuadro);
      if (ok) setAviso("La cámara no pudo sacar la foto: se guardó el cuadro del video.");
    }
    setOcupado(null);
    if (!ok) {
      setAviso(mensajeDe(r.json, "La cámara no sacó la foto."));
      return;
    }
    setFotoGuardada(true);
    window.dispatchEvent(new CustomEvent(EVENTO_FOTO_NUEVA, { detail: { camaraId } }));
  }, [camaraId, tomarCuadro]);

  /** Apaga con reintentos; «Apagar» se esconde SÓLO cuando contestó OK. */
  const apagarAlarma = useCallback(async () => {
    if (apagandoRef.current) return;
    apagandoRef.current = true;
    setApagando(true);
    let r: Awaited<ReturnType<typeof pedir>> = { ok: false, json: null };
    for (let i = 0; i < INTENTOS_APAGAR && !r.ok; i++) {
      if (i > 0) await esperar(ESPERA_APAGAR_MS * i);
      r = await pedir(camaraId, { accion: "alarma", activa: false });
    }
    apagandoRef.current = false;
    setApagando(false);
    if (!r.ok) {
      setAviso(mensajeDe(r.json, "No se pudo apagar la alarma: vuelve a tocar «Apagar»."));
      return;
    }
    sonandoRef.current = false;
    setAlarma(null);
  }, [camaraId]);

  const sonarAlarma = useCallback(
    async (segundos: number) => {
      setOcupado("alarma");
      const r = await pedir(camaraId, { accion: "alarma", activa: true, duracion: segundos });
      setOcupado(null);
      /* Dudoso = el servidor no sabe si sonó, o el pedido ni contestó (pudo
         llegar igual): se trata como sonando y se ofrece «Apagar». */
      const quiza = r.json?.estado === "quiza_sonando" || (!r.ok && r.json === null);
      if (!r.ok && !quiza) {
        setAviso(mensajeDe(r.json, "La alarma no sonó."));
        return;
      }
      if (quiza) setAviso("No se sabe si la alarma sonó: si la oyes, toca «Apagar».");
      sonandoRef.current = true;
      vencidaRef.current = false;
      setAhora(Date.now());
      setAlarma({ hasta: Date.now() + segundos * 1000, quiza });
    },
    [camaraId],
  );

  /* Cuenta regresiva; al llegar a 0 el visor la apaga UNA vez (con sus
     reintentos). Si no pudo, «Apagar» queda a la vista con el aviso. */
  useEffect(() => {
    if (!alarma) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAhora(n);
      if (n >= alarma.hasta && !vencidaRef.current) {
        vencidaRef.current = true;
        void apagarAlarma();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [alarma, apagarAlarma]);

  /* Cerrar el visor/mosaico o la pestaña con la alarma sonando = apagarla.
     `keepalive`: el pedido sale aunque la página ya se esté yendo. */
  useEffect(() => {
    const alIrse = () => {
      if (!sonandoRef.current) return;
      sonandoRef.current = false;
      void pedir(camaraId, { accion: "alarma", activa: false }, true);
    };
    window.addEventListener("pagehide", alIrse);
    return () => {
      window.removeEventListener("pagehide", alIrse);
      alIrse();
    };
  }, [camaraId]);

  return {
    datos,
    aviso,
    ocupado,
    moviendo,
    mover,
    parar,
    frenar,
    alternarDeteccion: () => void alternar("deteccion"),
    alternarMicrofono: () => void alternar("microfono"),
    sacarFoto,
    fotoGuardada,
    sonarAlarma,
    apagarAlarma,
    /** Sonando (o quizá): «Apagar» a la vista, aunque el video se caiga. */
    alarmaActiva: alarma !== null,
    alarmaQuiza: alarma?.quiza ?? false,
    apagandoAlarma: apagando,
    segundosAlarma: alarma ? Math.max(0, Math.ceil((alarma.hasta - ahora) / 1000)) : 0,
  };
}

export type ControlesCamaraEstado = ReturnType<typeof useControlesCamara>;
