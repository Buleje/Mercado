/**
 * Avisos de movimiento de las cámaras en SEGUNDO PLANO (Brandon 2026-10-10:
 * «en el encabezado, en el ícono de cámara, quiero notificaciones de aviso
 * cuando detecta movimiento en segundo plano»).
 *
 * De dónde sale «hubo movimiento» (medido 10-10 en Blas, las 2 cámaras reales):
 * - El servidor NO lo sabe: las cámaras son Hik-Connect (nube), no empujan
 *   fotos al webhook. Historial: 6 capturas en 7 días, las 6 «manual».
 * - El detector LOCAL del mosaico sí: 156 fotos de personas en 3 días
 *   (08-10 → 10-10), todas del mosaico abierto o minimizado en la burbuja,
 *   que sigue mirando en cualquier pestaña del panel (MosaicoGlobalContexto).
 * Así que la fuente es el detector del navegador: cada mirada con movimiento o
 * con alguien nuevo manda una SEÑAL (`emitirSenalCamara`) y la cabecera decide
 * con `registrarSenal` (puro, testeado) si suma al contador y si avisa.
 *
 * Reglas (por cámara):
 * - Movimiento cuenta recién con `SEGUIDAS_MOVIMIENTO` miradas seguidas (una
 *   sola es un parpadeo de luz) y es UN evento hasta que pasa `CALMA_MS` sin
 *   movimiento: una rama que se mueve todo el día es un aviso, no mil.
 * - «Apareció alguien» siempre cuenta, pero el mensaje flotante lo pone el
 *   mosaico (`useAvisoPersonas`, con pitido): acá sólo suma y saca el de
 *   movimiento de esa cámara si lo había (lo reemplaza el de la persona).
 * - Mensaje de movimiento: máximo 1 por cámara cada `AVISO_POR_CAMARA_MS`;
 *   los de varias cámaras dentro de `AGRUPAR_MS` van en el mismo mensaje.
 * - Lo que se ve en el momento (mosaico abierto, visor de Cámaras con la
 *   pestaña a la vista) no suma ni avisa: ya lo estás mirando.
 */

export const EVENTO_SENAL_CAMARA = "camaras:senal";
/** «Ver» del aviso: el mosaico minimizado se abre (lo escucha `MosaicoGlobalContexto`). */
export const EVENTO_EXPANDIR_MOSAICO = "camaras:expandir-mosaico";
/** El mosaico quedó a la vista (se abrió o se expandió): lo que había sin ver ya se vio. */
export const EVENTO_MOSAICO_A_LA_VISTA = "camaras:mosaico-a-la-vista";

/** Sin movimiento este tiempo, el próximo es un evento nuevo. */
export const CALMA_MS = 60_000;
/** Miradas seguidas con movimiento para que cuente (el detector mira ~1 por segundo). */
export const SEGUIDAS_MOVIMIENTO = 2;
/** Dos miradas con movimiento a más de esto no son «seguidas». */
export const HUECO_SEGUIDAS_MS = 5_000;
/** Un mensaje de movimiento por cámara cada 5 min como mucho. */
export const AVISO_POR_CAMARA_MS = 5 * 60_000;
/** Cámaras que se mueven dentro de esta ventana comparten el mensaje. */
export const AGRUPAR_MS = 30_000;
/** Cuántos eventos sin ver se guardan (el contador muestra «9+» desde 10). */
export const TOPE_SIN_VER = 50;

export interface SenalCamara {
  camaraId: string;
  nombre: string;
  /** Epoch ms. */
  at: number;
  /** Hubo manchas de movimiento (fuera de las zonas ignoradas) en esta mirada. */
  movimiento: boolean;
  /** «Apareció alguien» o «llegó otra persona» en esta mirada. */
  aparicion: boolean;
  personas: number;
  /** Quien mira lo tiene a la vista (mosaico expandido o visor, pestaña visible). */
  aLaVista: boolean;
}

export type TipoAvisoCamara = "movimiento" | "persona";

export interface EventoCamara {
  camaraId: string;
  nombre: string;
  at: number;
  tipo: TipoAvisoCamara;
  personas: number;
}

interface EstadoCamara {
  /** Última mirada CON movimiento (o persona). */
  ultimaSenal: number;
  seguidas: number;
  /** Hay un evento en curso: hasta `CALMA_MS` de calma no se cuenta otro. */
  enCurso: boolean;
  /** Último mensaje flotante de esta cámara (el de movimiento o el de persona del mosaico). */
  ultimoAviso: number;
}

export interface MensajeMovimiento {
  camaras: { id: string; nombre: string }[];
  at: number;
}

export interface EstadoAvisos {
  camaras: Readonly<Record<string, EstadoCamara>>;
  /** Eventos desde la última vez que se miró, del más nuevo al más viejo. */
  sinVer: readonly EventoCamara[];
  /** El mensaje de movimiento que está a la vista (o el último). */
  mensaje: MensajeMovimiento | null;
}

export const ESTADO_AVISOS_INICIAL: EstadoAvisos = { camaras: {}, sinVer: [], mensaje: null };

export interface DecisionAviso {
  estado: EstadoAvisos;
  /** Evento nuevo (sumó al contador), o `null`. */
  evento: EventoCamara | null;
  /** Mostrar (o actualizar) el mensaje de movimiento con estas cámaras; `null` = no tocarlo. */
  mensaje: MensajeMovimiento | null;
  /** Sacar el mensaje de movimiento (lo reemplazó el de la persona del mosaico). */
  quitarMensaje: boolean;
}

const NUNCA = Number.NEGATIVE_INFINITY;

/**
 * Una señal del detector → qué cambia. `silencioHasta` (epoch ms) apaga los
 * mensajes de movimiento, no el contador.
 */
export function registrarSenal(
  estado: EstadoAvisos,
  s: SenalCamara,
  silencioHasta = 0,
): DecisionAviso {
  const previo = estado.camaras[s.camaraId] ?? {
    ultimaSenal: NUNCA,
    seguidas: 0,
    enCurso: false,
    ultimoAviso: NUNCA,
  };
  const sinNovedad: DecisionAviso = { estado, evento: null, mensaje: null, quitarMensaje: false };
  if (!s.movimiento && !s.aparicion) return sinNovedad;

  const hueco = s.at - previo.ultimaSenal;
  const calma = hueco > CALMA_MS;
  const seguidas = hueco <= HUECO_SEGUIDAS_MS ? previo.seguidas + 1 : 1;
  let cam: EstadoCamara = {
    ...previo,
    ultimaSenal: s.at,
    seguidas,
    enCurso: calma ? false : previo.enCurso,
  };

  let tipo: TipoAvisoCamara | null = null;
  if (s.aparicion) tipo = "persona";
  else if (!cam.enCurso && seguidas >= SEGUIDAS_MOVIMIENTO) tipo = "movimiento";
  if (tipo) cam = { ...cam, enCurso: true };

  const camaras = { ...estado.camaras, [s.camaraId]: cam };
  /* A la vista: se actualiza el estado (el evento en curso no salta al
     minimizar) pero no suma ni avisa. */
  if (!tipo || s.aLaVista) return { ...sinNovedad, estado: { ...estado, camaras } };

  const evento: EventoCamara = { camaraId: s.camaraId, nombre: s.nombre, at: s.at, tipo, personas: s.personas };
  const sinVer = [evento, ...estado.sinVer].slice(0, TOPE_SIN_VER);

  if (tipo === "persona") {
    /* El mosaico ya puso «Apareció…» (con pitido): cuenta como el aviso de la
       cámara, y si estaba en el mensaje de movimiento, sale de ahí. */
    camaras[s.camaraId] = { ...cam, ultimoAviso: s.at };
    const m = estado.mensaje;
    const estaba = m !== null && s.at - m.at <= AGRUPAR_MS * 2 && m.camaras.some((c) => c.id === s.camaraId);
    if (!estaba) return { estado: { ...estado, camaras, sinVer }, evento, mensaje: null, quitarMensaje: false };
    const quedan = m.camaras.filter((c) => c.id !== s.camaraId);
    const mensaje = quedan.length > 0 ? { camaras: quedan, at: m.at } : null;
    return { estado: { camaras, sinVer, mensaje }, evento, mensaje, quitarMensaje: mensaje === null };
  }

  if (s.at < silencioHasta || s.at - cam.ultimoAviso < AVISO_POR_CAMARA_MS) {
    return { estado: { ...estado, camaras, sinVer }, evento, mensaje: null, quitarMensaje: false };
  }
  camaras[s.camaraId] = { ...cam, ultimoAviso: s.at };
  const m = estado.mensaje;
  const otras = m && s.at - m.at <= AGRUPAR_MS ? m.camaras.filter((c) => c.id !== s.camaraId) : [];
  const mensaje: MensajeMovimiento = { camaras: [...otras, { id: s.camaraId, nombre: s.nombre }], at: s.at };
  return { estado: { camaras, sinVer, mensaje }, evento, mensaje, quitarMensaje: false };
}

/**
 * Ya se miró: el contador vuelve a cero y el mensaje se suelta (el próximo no
 * vuelve a nombrar cámaras que ya se vieron). El turno de cada cámara sigue.
 */
export const marcarVisto = (estado: EstadoAvisos): EstadoAvisos =>
  estado.sinVer.length === 0 && estado.mensaje === null ? estado : { ...estado, sinVer: [], mensaje: null };

/** El mensaje se cerró (a mano o por tiempo): el próximo empieza su propio grupo. */
export const soltarMensaje = (estado: EstadoAvisos, at: number): EstadoAvisos =>
  estado.mensaje?.at === at ? { ...estado, mensaje: null } : estado;

/** «Movimiento en Patio de trozas» · «… en Patio de trozas y Entrada» · «… en 3 cámaras». */
export function textoMovimiento(nombres: readonly string[]): string {
  if (nombres.length <= 1) return `Movimiento en ${nombres[0] ?? "una cámara"}`;
  if (nombres.length === 2) return `Movimiento en ${nombres[0]} y ${nombres[1]}`;
  return `Movimiento en ${nombres.length} cámaras`;
}

/** «14:05» en hora de Lima (como las fotos del Drive). */
export const horaLima = (at: number): string =>
  new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  }).format(at);

/** «3 avisos sin ver · el último, movimiento en Entrada a las 14:05». */
export function resumenSinVer(sinVer: readonly EventoCamara[]): string | null {
  const ultimo = sinVer[0];
  if (!ultimo) return null;
  const que = ultimo.tipo === "persona" ? "alguien en" : "movimiento en";
  const cuantos = sinVer.length === 1 ? "1 aviso sin ver" : `${sinVer.length} avisos sin ver`;
  return `${cuantos} · el último, ${que} ${ultimo.nombre} a las ${horaLima(ultimo.at)}`;
}

/**
 * ¿Lo que mira esta fuente está a la vista? Dentro del mosaico manda su
 * estado (`data-mosaico-panel`); fuera (visor de Cámaras), estar en la página.
 * Con la pestaña del navegador oculta, nada está a la vista.
 */
export function fuenteALaVista(fuente: Element | null): boolean {
  if (typeof document === "undefined" || document.hidden) return false;
  if (!fuente?.isConnected) return false;
  const panel = fuente.closest("[data-mosaico-panel]");
  return panel ? panel.getAttribute("data-mosaico-panel") !== "minimizado" : true;
}

/** Lo llama el detector en cada mirada con movimiento o con alguien nuevo. No hace nada sin `window`. */
export function emitirSenalCamara(senal: Omit<SenalCamara, "aLaVista">, fuente: Element | null): void {
  if (typeof window === "undefined") return;
  const detail: SenalCamara = { ...senal, aLaVista: fuenteALaVista(fuente) };
  window.dispatchEvent(new CustomEvent<SenalCamara>(EVENTO_SENAL_CAMARA, { detail }));
}
