"use client";

/**
 * Mira el video de UNA cámara cada `CADA_CUANTO_DETECTAR_MS` (más espaciado si
 * hay muchas cámaras: `intervaloDeteccionMs`) con el detector local (`detector-personas.ts`), decide con `decidirFotoPersona`
 * (lib/camaras/personas) y sube la foto a `POST /api/admin/camaras/[id]/persona`.
 *
 * - Una vuelta a la vez por cámara: el próximo `setTimeout` se agenda recién
 *   cuando terminó la anterior (nunca dos detecciones solapadas).
 * - La subida no frena la vuelta. 429 = el servidor pidió calma: se saltea en
 *   silencio. Otro error: `logger` y sigue mirando.
 * - LÍMITE DE CHROME: con la pestaña oculta los timers se frenan (1 por
 *   segundo y, tras 5 min oculta, 1 por minuto). Con el mosaico en otra
 *   pestaña o minimizado, el detector mira mucho menos seguido: no es un DVR.
 */
import { useEffect, useRef, useState } from "react";
import {
  ESTADO_DETECTOR_INICIAL,
  decidirFotoPersona,
  type EstadoDetector,
  type MetaFotoPersona,
  type RespuestaFotoPersona,
} from "@/lib/camaras/personas";
import { filtrarCajasIgnoradas, type ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  cargarDetectorPersonas,
  componerFoto,
  crearLienzosCuadro,
  detectarPersonas,
  intervaloDeteccionMs,
  leerCuadro,
  retenerDetectorPersonas,
  selloLima,
  soltarLienzosCuadro,
  type CajaPersona,
} from "./detector-personas";

export type EstadoDetectorPersonas = "apagado" | "cargando" | "mirando" | "error";

export interface UltimaFotoPersona {
  /** Miniatura local (object URL o data URL) para la burbuja. */
  miniatura: string;
  at: number;
  personas: number;
}

export interface OpcionesDetectorPersonas {
  camaraId: string;
  nombre: string;
  /** Sólo mira si es `true` (video viendo + detección prendida). */
  activo: boolean;
  /** El `<canvas>`/`<video>` donde EZUIKit pinta el cuadro, o `null` si todavía no hay. */
  leerFuente: () => HTMLCanvasElement | HTMLVideoElement | null;
  /** Respaldo si el lienzo no se deja leer (WebGL en negro): `tomarCuadro` del visor (base64). */
  tomarCuadro?: () => Promise<string | null>;
  /** Cada foto que se guardó (para el contador de la burbuja). */
  onFoto?: (foto: UltimaFotoPersona) => void;
  /**
   * Zonas del cuadro que no se miran (fracciones 0-1): una caja de persona con
   * ≥60 % de su área adentro no cuenta (`lib/camaras/zonas-ignorar.ts`). Se
   * leen en cada mirada: cambiarlas no reinicia el detector.
   */
  zonasIgnorar?: readonly ZonaIgnorada[];
}

export interface DetectorPersonas {
  estado: EstadoDetectorPersonas;
  /** Personas en cuadro en la última mirada (sin las que caen en una zona ignorada). */
  personasAhora: number;
  /** Cajas de «persona» que la última mirada descartó por caer en una zona ignorada. */
  ignoradasAhora: number;
  /** Fotos guardadas desde que se abrió. */
  fotosTomadas: number;
  ultimaFoto: UltimaFotoPersona | null;
  /** Mensaje corto si `estado === "error"`. */
  error: string | null;
}

/** Color de las cajas: token del DS resuelto donde está el video (respeta claro/oscuro del panel). */
function colorDeCajas(cerca: Element | null): string {
  const el = cerca?.isConnected ? cerca : document.documentElement;
  const css = getComputedStyle(el);
  return (
    css.getPropertyValue("--data-warning-500").trim() || css.getPropertyValue("--accent").trim()
  );
}

/** Sube la foto. `true` = guardada. */
async function subirFoto(
  camaraId: string,
  jpeg: Blob,
  meta: MetaFotoPersona,
  at: number,
): Promise<boolean> {
  const fd = new FormData();
  fd.append("file", new File([jpeg], `persona-${at}.jpg`, { type: "image/jpeg" }));
  fd.append("motivo", meta.motivo);
  fd.append("personas", String(meta.personas));
  fd.append("confianza", meta.confianza.toFixed(3));
  try {
    const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/persona`, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: fd,
    });
    if (r.status === 429) return false;
    const j = (await r.json().catch(() => null)) as RespuestaFotoPersona | null;
    if (r.ok && j?.ok) return true;
    logger.warn("[camaras] la foto de persona no se guardó", {
      status: r.status,
      error: j && !j.ok ? j.error : null,
    });
  } catch (err) {
    logger.warn("[camaras] la foto de persona no se subió", { error: String(err) });
  }
  return false;
}

export function useDetectorPersonas(opciones: OpcionesDetectorPersonas): DetectorPersonas {
  const { camaraId, activo } = opciones;
  /* Las funciones del visor cambian de identidad en cada render: el bucle lee
     siempre las últimas sin reiniciarse. */
  const ultimas = useRef(opciones);
  useEffect(() => {
    ultimas.current = opciones;
  });

  const [fase, setFase] = useState<Exclude<EstadoDetectorPersonas, "apagado">>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [personasAhora, setPersonasAhora] = useState(0);
  const [ignoradasAhora, setIgnoradasAhora] = useState(0);
  const [fotosTomadas, setFotosTomadas] = useState(0);
  const [ultimaFoto, setUltimaFoto] = useState<UltimaFotoPersona | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let decision: EstadoDetector = ESTADO_DETECTOR_INICIAL;
    let subiendo = false;
    const soltar = retenerDetectorPersonas();
    const lienzos = crearLienzosCuadro();
    setFase("cargando");
    setError(null);

    const guardar = async (
      meta: MetaFotoPersona,
      cajas: CajaPersona[],
      at: number,
      alFallar: () => void,
    ) => {
      const o = ultimas.current;
      const hecha = await componerFoto(
        lienzos,
        cajas,
        `${o.nombre} · ${selloLima(at)}`,
        colorDeCajas(o.leerFuente()),
      );
      if (!hecha) {
        alFallar();
        return;
      }
      subiendo = true;
      void subirFoto(camaraId, hecha.jpeg, meta, at)
        .then((ok) => {
          subiendo = false;
          if (!ok) alFallar();
          if (!ok || !vivo) return;
          const foto: UltimaFotoPersona = {
            miniatura: hecha.miniatura,
            at,
            personas: meta.personas,
          };
          setFotosTomadas((n) => n + 1);
          setUltimaFoto(foto);
          ultimas.current.onFoto?.(foto);
        })
        .catch((err: unknown) =>
          logger.warn("[camaras] falló el aviso de foto de persona", { error: String(err) }),
        );
    };

    const mirar = async () => {
      const o = ultimas.current;
      const cuadro = await leerCuadro(lienzos, o.leerFuente, o.tomarCuadro);
      /* Trabado (mismo cuadro una y otra vez): ni se mira ni se decide, si no
         saldría una «sigue» por minuto de una imagen quieta. */
      if (cuadro !== "nuevo" || !vivo) return;
      const crudo = await detectarPersonas(lienzos.chico);
      if (!vivo) return;
      /* Zonas a ignorar ANTES de decidir: una caja descartada no confirma
         «apareció», no suma a «llegó otra» ni sostiene «sigue en cuadro». Las
         cajas vienen en píxeles de `chico`; las zonas, en fracciones. */
      const { quedan, ignoradas } = filtrarCajasIgnoradas(
        crudo.cajas,
        lienzos.chico.width,
        lienzos.chico.height,
        ultimas.current.zonasIgnorar ?? [],
      );
      const r = {
        personas: quedan.length,
        confianza: quedan.reduce((m, k) => Math.max(m, k.confianza), 0),
        cajas: quedan,
      };
      setPersonasAhora(r.personas);
      setIgnoradasAhora(ignoradas.length);
      const at = Date.now();
      const d = decidirFotoPersona(decision, r.personas, at);
      if (d.foto && subiendo) {
        /* Subida anterior en curso (4G lento): esta foto no sale, pero tampoco
           cuenta como tomada; se anota que se vio gente y la próxima mirada decide. */
        decision = { ...decision, ultimaVistaEn: at };
        return;
      }
      const previo = decision;
      decision = d.estado;
      if (d.foto) {
        await guardar(
          { motivo: d.foto, personas: r.personas, confianza: r.confianza },
          r.cajas,
          at,
          () => {
            /* No se guardó (429, red, cuadro vacío): se deshace SÓLO la foto —lo que
               se vio después queda— para que la próxima mirada la vuelva a pedir.
               Sin esto, un «Apareció alguien» fallido recién se reponía al minuto. */
            if (decision.ultimaFotoEn !== at) return;
            decision = { ...decision, presentes: previo.presentes, ultimaFotoEn: previo.ultimaFotoEn };
          },
        );
      }
    };

    const vuelta = async () => {
      if (!vivo) return;
      const t0 = performance.now();
      try {
        await mirar();
      } catch (err) {
        logger.warn("[camaras] el detector de personas falló en un cuadro", { error: String(err) });
      }
      if (!vivo) return;
      reloj = setTimeout(vuelta, Math.max(0, intervaloDeteccionMs() - (performance.now() - t0)));
    };

    cargarDetectorPersonas().then(
      () => {
        if (!vivo) return;
        setFase("mirando");
        void vuelta();
      },
      (err: unknown) => {
        logger.warn("[camaras] no cargó el detector de personas", { error: String(err) });
        if (!vivo) return;
        setFase("error");
        setError("No se pudo cargar el detector de personas. Recarga la página.");
      },
    );

    return () => {
      vivo = false;
      clearTimeout(reloj);
      soltar();
      soltarLienzosCuadro(lienzos);
      setPersonasAhora(0);
      setIgnoradasAhora(0);
    };
  }, [activo, camaraId]);

  return {
    estado: activo ? fase : "apagado",
    personasAhora: activo ? personasAhora : 0,
    ignoradasAhora: activo ? ignoradasAhora : 0,
    fotosTomadas,
    ultimaFoto,
    error: activo ? error : null,
  };
}
