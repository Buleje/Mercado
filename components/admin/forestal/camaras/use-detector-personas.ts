"use client";

/**
 * Mira el video de UNA cámara cada `CADA_CUANTO_DETECTAR_MS` (más espaciado si
 * hay muchas cámaras o el detector tarda) con el vigía (`vigia-camara.ts`:
 * movimiento + zoom + D-FINE, ADR-475), sigue a cada persona con su número
 * (`lib/camaras/seguimiento.ts`), decide con `decidirFotoPersona`
 * (lib/camaras/personas) y sube la foto con dónde estaba cada persona
 * (`subir-foto-persona.ts` → `POST /api/admin/camaras/[id]/persona`, ADR-479).
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
  CADA_CUANTO_DETECTAR_MS,
  ESTADO_DETECTOR_INICIAL,
  VENTANA_CONFIRMAR_PERSONA_MS,
  decidirFotoPersona,
  type EstadoDetector,
  type MetaFotoPersona,
} from "@/lib/camaras/personas";
import { filtrarCajasIgnoradas, type ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import type { AparicionPersona, CajaFraccion, MotorDetector, PersonaEnVivo } from "@/lib/camaras/vigia";
import { logger } from "@/lib/logger";
import { OLVIDAR_PERSONA_MS, crearSeguimiento, seguir } from "@/lib/camaras/seguimiento";
import {
  componerFoto,
  crearLienzosCuadro,
  intervaloDeteccionMs,
  leerCuadro,
  selloLima,
  soltarLienzosCuadro,
  type CajaPersona,
} from "./detector-personas";
import { cajasEnFraccion, subirFotoPersona } from "./subir-foto-persona";
import { crearVigia } from "./vigia-camara";

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
  /** Personas seguidas en la última mirada, con su número (para dibujarlas sobre el video). */
  personasEnVivo: PersonaEnVivo[];
  /** Zonas del cuadro con movimiento en la última mirada. */
  movimientoEnVivo: CajaFraccion[];
  /** La última vez que apareció gente (dispara el aviso); `null` si todavía no. */
  aparicion: AparicionPersona | null;
  /** Con qué motor está mirando; `null` mientras carga. */
  motor: MotorDetector | null;
}

/** Color de las cajas: token del DS resuelto donde está el video (respeta claro/oscuro del panel). */
function colorDeCajas(cerca: Element | null): string {
  const el = cerca?.isConnected ? cerca : document.documentElement;
  const css = getComputedStyle(el);
  return (
    css.getPropertyValue("--data-warning-500").trim() || css.getPropertyValue("--accent").trim()
  );
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
  const [personasEnVivo, setPersonasEnVivo] = useState<PersonaEnVivo[]>([]);
  const [movimientoEnVivo, setMovimientoEnVivo] = useState<CajaFraccion[]>([]);
  const [aparicion, setAparicion] = useState<AparicionPersona | null>(null);
  const [motor, setMotor] = useState<MotorDetector | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let decision: EstadoDetector = ESTADO_DETECTOR_INICIAL;
    let subiendo = false;
    const vigia = crearVigia();
    const seguimiento = crearSeguimiento();
    let seguidas: PersonaEnVivo[] = [];
    /** Lo que tardó la última vuelta (ms): estira la ventana de «apareció». */
    let msVuelta = 0;
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
      const enFraccion = cajasEnFraccion(cajas, lienzos.chico.width, lienzos.chico.height);
      void subirFotoPersona(camaraId, hecha.jpeg, meta, at, enFraccion)
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
      const zonas = ultimas.current.zonasIgnorar ?? [];
      const mirada = await vigia.mirar(lienzos, seguidas, zonas);
      if (!vivo) return;
      setMotor(vigia.motor());
      /* Zonas a ignorar ANTES de decidir: una caja descartada no confirma
         «apareció», no suma a «llegó otra» ni sostiene «sigue en cuadro». Las
         cajas y las zonas van en fracciones (ancho = alto = 1). El movimiento
         dentro de una zona tampoco se dibuja (una lona que flamea). */
      const { quedan, ignoradas } = filtrarCajasIgnoradas(mirada.personas, 1, 1, zonas);
      const movimiento = filtrarCajasIgnoradas(mirada.movimiento, 1, 1, zonas).quedan;
      const at = Date.now();
      /* Quien mira lento estira las esperas: la ventana de «apareció» (y con
         ella la ausencia) y el olvido del seguimiento. */
      const ventana = Math.max(VENTANA_CONFIRMAR_PERSONA_MS, Math.round(msVuelta * 2.5));
      const enVivo = seguir(seguimiento, quedan, at, Math.max(OLVIDAR_PERSONA_MS, Math.round(ventana * 1.6)));
      seguidas = enVivo;
      /* Sin nada antes ni ahora no se re-dibuja el cuadro (una vuelta por segundo). */
      setPersonasEnVivo((antes) => (antes.length === 0 && enVivo.length === 0 ? antes : enVivo));
      setMovimientoEnVivo((antes) => (antes.length === 0 && movimiento.length === 0 ? antes : movimiento));
      setPersonasAhora(enVivo.length);
      setIgnoradasAhora(ignoradas.length);
      /* Para decidir la foto cuentan sólo las que el detector VIO en esta
         mirada: las «estimadas» confirmarían solas un «apareció» falso. */
      const { width: cw, height: ch } = lienzos.chico;
      const r = {
        personas: quedan.length,
        confianza: quedan.reduce((m, k) => Math.max(m, k.confianza), 0),
        cajas: quedan.map(
          (k): CajaPersona => ({ x: k.x * cw, y: k.y * ch, ancho: k.ancho * cw, alto: k.alto * ch, confianza: k.confianza }),
        ),
      };
      const d = decidirFotoPersona(decision, r.personas, at, {
        ventanaConfirmarMs: ventana,
        /* «Apareció» sólo si alguien visto ahora ya se vio antes en el mismo lugar. */
        mismaPersona: enVivo.some((p) => !p.estimada && p.vistas >= 2),
      });
      if (d.foto === "aparecio" || d.foto === "mas_gente")
        setAparicion({ camaraId, nombre: ultimas.current.nombre, at, personas: enVivo.length });
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
      msVuelta = performance.now() - t0;
      if (!vivo) return;
      /* Con D-FINE el ritmo lo da lo que tardó la mirada (está en un worker);
         con MediaPipe, el presupuesto del hilo principal. El motor es el de
         ESTA cámara: otra puede haber pasado al detector liviano. */
      const intervalo = vigia.motor() === "mediapipe" ? intervaloDeteccionMs() : CADA_CUANTO_DETECTAR_MS;
      reloj = setTimeout(vuelta, Math.max(0, intervalo - (performance.now() - t0)));
    };

    vigia.cargar().then(
      (m) => {
        if (!vivo) return;
        setMotor(m);
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
      vigia.soltar();
      soltarLienzosCuadro(lienzos);
      setPersonasAhora(0);
      setIgnoradasAhora(0);
      setPersonasEnVivo([]);
      setMovimientoEnVivo([]);
    };
  }, [activo, camaraId]);

  return {
    estado: activo ? fase : "apagado",
    personasAhora: activo ? personasAhora : 0,
    ignoradasAhora: activo ? ignoradasAhora : 0,
    fotosTomadas,
    ultimaFoto,
    error: activo ? error : null,
    personasEnVivo: activo ? personasEnVivo : [],
    movimientoEnVivo: activo ? movimientoEnVivo : [],
    aparicion,
    motor: activo ? motor : null,
  };
}
