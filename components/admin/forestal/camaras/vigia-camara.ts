/**
 * Cómo mira UNA cámara del mosaico (ADR-475, 2026-10-08): movimiento primero,
 * zoom donde algo se mueve, y el modelo fuerte sólo ahí.
 *
 * Medido sobre 8 cuadros reales de Blas (personas de 10-25 px en 768×432):
 * - MediaPipe EfficientDet-Lite0 entero (lo de antes): 0 personas en 8.
 * - D-FINE-S entero a 640: confianza ≤0,5 en casi todas.
 * - Movimiento + recorte con zoom + D-FINE-S a 320: 0,55-0,67 (~0,5 s por
 *   recorte en el procesador).
 *
 * Cada mirada: (1) el cuadro en gris a 192 px de ancho contra el fondo
 * aprendido (`lib/camaras/movimiento.ts`); (2) hasta `MAX_RECORTES` recortes
 * cuadrados a `LADO_RECORTE` elegidos por `elegirRecortes` (personas seguidas
 * que se movieron hace poco, turnándose, y manchas fuera de las zonas
 * ignoradas); (3) cada `CADA_COMPLETO_MS`, el cuadro entero a `LADO_COMPLETO`
 * (en SD casi nunca ve a nadie y cuesta 1,3 s en el procesador: es un barrido
 * de seguridad). Si D-FINE no carga, o queda en pausa por fallos seguidos,
 * usa MediaPipe sobre el cuadro entero como antes.
 */
import {
  compararConFondo,
  crearFondo,
  elegirRecortes,
  iou,
  type FondoMovimiento,
} from "@/lib/camaras/movimiento";
import type { DeteccionPersona } from "@/lib/camaras/seguimiento";
import type { CajaFraccion, MotorDetector, PersonaEnVivo } from "@/lib/camaras/vigia";
import type { ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import { logger } from "@/lib/logger";
import {
  cargarDetectorPersonas,
  detectarPersonas,
  retenerDetectorPersonas,
  type LienzosCuadro,
} from "./detector-personas";
import {
  cargarMotorDfine,
  detectarEnRecortes,
  motorDfineEnPausa,
  retenerMotorDfine,
  type RecortePedido,
} from "./motor-dfine";
import type { LectorMarcadoresVivo } from "./lector-marcadores-vivo";

const ANCHO_GRILLA = 192;
const MAX_RECORTES = 4;
const LADO_RECORTE = 320;
const LADO_COMPLETO = 640;
/** Cada cuánto se barre el cuadro entero, haya o no recortes. */
const CADA_COMPLETO_MS = 30_000;
/** Una persona seguida que el movimiento no toca hace más que esto deja de mirarse con zoom. */
const QUIETA_MAX_MS = 45_000;
/** Confianza mínima de D-FINE (las personas reales midieron 0,55-0,67). */
export const CONFIANZA_DFINE = 0.5;

export interface MiradaVigia {
  personas: DeteccionPersona[];
  movimiento: CajaFraccion[];
}

export interface Vigia {
  /** Carga D-FINE (o MediaPipe si D-FINE no carga) y dice con cuál mira. */
  cargar(): Promise<MotorDetector>;
  /**
   * `seguidas` = las personas que ya se están siguiendo; `zonas` = las que se
   * ignoran (no gastan recortes). Devuelve el movimiento SIN filtrar por zonas.
   */
  mirar(
    l: LienzosCuadro,
    seguidas: readonly PersonaEnVivo[],
    zonas: readonly ZonaIgnorada[],
  ): Promise<MiradaVigia>;
  /** El motor con el que mira ahora (puede pasar a MediaPipe en marcha). */
  motor(): MotorDetector | null;
  soltar(): void;
}

/** Junta cajas repetidas (la misma persona vista en dos recortes que se pisan). */
function sinRepetidas(cajas: DeteccionPersona[]): DeteccionPersona[] {
  const out: DeteccionPersona[] = [];
  for (const c of [...cajas].sort((a, b) => b.confianza - a.confianza))
    if (!out.some((o) => iou(o, c) > 0.45)) out.push(c);
  return out;
}

const seTocan = (a: CajaFraccion, b: CajaFraccion) =>
  a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

/**
 * `marcadores` (ADR-480): si la cámara lee marcadores de troza, el mismo
 * cuadro se le ofrece al lector cuando no hay movimiento. Sin él, nada cambia.
 */
export function crearVigia(opciones: { marcadores?: LectorMarcadoresVivo } = {}): Vigia {
  let motor: MotorDetector | null = null;
  let soltarMotor: (() => void) | null = null;
  let soltado = false;
  let fondo: FondoMovimiento | null = null;
  let ultimoCompleto = 0;
  let turno = 0;
  /** id de persona seguida → última vez que una mancha la tocó (ms). */
  const movidaEn = new Map<number, number>();
  const gris = document.createElement("canvas");

  /** El cuadro chico en gris (1 byte por punto) a `ANCHO_GRILLA` de ancho. */
  function leerGris(l: LienzosCuadro): Uint8Array | null {
    const { width: w, height: h } = l.chico;
    if (!w || !h) return null;
    const gw = ANCHO_GRILLA;
    const gh = Math.max(1, Math.round((ANCHO_GRILLA * h) / w));
    if (gris.width !== gw) gris.width = gw;
    if (gris.height !== gh) gris.height = gh;
    const ctx = gris.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(l.chico, 0, 0, gw, gh);
    const px = ctx.getImageData(0, 0, gw, gh).data;
    const g = new Uint8Array(gw * gh);
    for (let i = 0; i < g.length; i++)
      g[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
    if (!fondo || fondo.ancho !== gw || fondo.alto !== gh) fondo = crearFondo(gw, gh);
    return g;
  }

  /** Suelta D-FINE y retiene MediaPipe (salvo que la cámara ya se haya cerrado). */
  async function pasarAMediapipe(): Promise<MotorDetector> {
    soltarMotor?.();
    soltarMotor = null;
    if (soltado) throw new Error("vigía soltado");
    soltarMotor = retenerDetectorPersonas();
    await cargarDetectorPersonas();
    motor = "mediapipe";
    return motor;
  }

  /** Las seguidas que conviene mirar, turnándose, con cuánto hace que se movieron. */
  function seguidasParaRecorte(seguidas: readonly PersonaEnVivo[], manchas: readonly CajaFraccion[], ahora: number) {
    const ids = new Set(seguidas.map((p) => p.id));
    for (const id of movidaEn.keys()) if (!ids.has(id)) movidaEn.delete(id);
    for (const p of seguidas)
      if (!movidaEn.has(p.id) || manchas.some((m) => seTocan(m, p))) movidaEn.set(p.id, ahora);
    const lista = seguidas.map((p) => ({ ...p, movidaHaceMs: ahora - (movidaEn.get(p.id) ?? ahora) }));
    const k = lista.length ? turno++ % lista.length : 0;
    return [...lista.slice(k), ...lista.slice(0, k)];
  }

  return {
    async cargar() {
      try {
        soltarMotor = retenerMotorDfine();
        const info = await cargarMotorDfine();
        motor = info.backend === "webgpu" ? "dfine-webgpu" : "dfine-wasm";
        return motor;
      } catch (err) {
        if (soltado) throw err;
        logger.warn("[camaras] D-FINE no cargó; queda el detector liviano", { error: String(err) });
        return pasarAMediapipe();
      }
    },

    async mirar(l, seguidas, zonas) {
      const g = leerGris(l);
      const mov = g && fondo ? compararConFondo(fondo, g) : { manchas: [], reiniciado: true };
      const movimiento = mov.manchas;
      opciones.marcadores?.ofrecer(l.foto, movimiento.length === 0 && !mov.reiniciado);

      if (motor === "mediapipe") {
        const r = await detectarPersonas(l.chico);
        const { width: w, height: h } = l.chico;
        return {
          movimiento,
          personas: r.cajas.map((c) => ({
            x: c.x / w,
            y: c.y / h,
            ancho: c.ancho / w,
            alto: c.alto / h,
            confianza: c.confianza,
          })),
        };
      }

      const ahora = Date.now();
      const aspecto = l.foto.width / Math.max(1, l.foto.height);
      const recortes: RecortePedido[] = elegirRecortes(movimiento, seguidasParaRecorte(seguidas, movimiento, ahora), {
        aspecto,
        max: MAX_RECORTES,
        zonas,
        quietaMaxMs: QUIETA_MAX_MS,
      }).map((r) => ({ ...r, lado: LADO_RECORTE }));
      if (ahora - ultimoCompleto >= CADA_COMPLETO_MS || mov.reiniciado) {
        recortes.push({ x: 0, y: 0, ancho: 1, alto: 1, lado: LADO_COMPLETO });
        ultimoCompleto = ahora;
      }
      if (recortes.length === 0) return { movimiento, personas: [] };
      try {
        const personas = await detectarEnRecortes(l.foto, recortes, CONFIANZA_DFINE);
        return { movimiento, personas: sinRepetidas(personas) };
      } catch (err) {
        /* Tres fallos seguidos ponen a D-FINE en pausa (motor-dfine.ts): esta
           cámara sigue con el detector liviano en vez de quedar «mirando» sin ver. */
        if (motorDfineEnPausa() && !soltado) {
          logger.warn("[camaras] D-FINE en pausa; esta cámara sigue con el detector liviano", {
            error: String(err),
          });
          await pasarAMediapipe();
        }
        throw err;
      }
    },

    motor: () => motor,

    soltar() {
      soltado = true;
      opciones.marcadores?.soltar();
      soltarMotor?.();
      soltarMotor = null;
      gris.width = 0;
      gris.height = 0;
    },
  };
}
