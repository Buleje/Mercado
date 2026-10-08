/**
 * Fotos de personas del mosaico «Ver todas en vivo» (Brandon 2026-10-07).
 *
 * El navegador mira cada cámara en vivo con un detector LOCAL (sin IA paga):
 * cuando aparece gente toma una foto al instante; si la gente sigue en cuadro,
 * a lo sumo una cada minuto. Las fotos van a la carpeta «Cámaras / Personas»
 * del Drive, NO al historial de la cámara (tope de 800 compartido y cada foto
 * pasa por la IA paga).
 *
 * Contrato compartido entre el detector (cliente) y `POST /api/admin/camaras/[id]/persona`.
 */

/** Por qué se tomó la foto. */
export const MOTIVOS_FOTO_PERSONA = ["aparecio", "mas_gente", "sigue"] as const;
export type MotivoFotoPersona = (typeof MOTIVOS_FOTO_PERSONA)[number];

export const MOTIVO_FOTO_PERSONA_LABEL: Record<MotivoFotoPersona, string> = {
  aparecio: "Apareció alguien",
  mas_gente: "Llegó otra persona",
  sigue: "Sigue en cuadro",
};

/** Mientras la gente sigue en cuadro: una foto cada este tiempo, como mucho. */
export const INTERVALO_FOTO_PERSONA_MS = 60_000;
/** Sin ver a nadie durante este tiempo, la próxima persona cuenta como «apareció». */
export const AUSENCIA_PERSONA_MS = 8_000;
/** Cada cuánto mira el detector cada cámara. */
export const CADA_CUANTO_DETECTAR_MS = 1_000;
/** Debajo de esta confianza no cuenta como persona. */
export const CONFIANZA_MINIMA_PERSONA = 0.5;

/** Carpeta del Drive (ruta lógica, `/` separa niveles). */
export const CARPETA_PERSONAS = ["Cámaras", "Personas"] as const;

/** Lo que el cliente manda junto con la foto. */
export interface MetaFotoPersona {
  motivo: MotivoFotoPersona;
  /** Cuántas personas había en el cuadro. */
  personas: number;
  /** La confianza más alta del cuadro (0-1). */
  confianza: number;
}

/** Respuesta de `POST /api/admin/camaras/[id]/persona`. */
export type RespuestaFotoPersona =
  | { ok: true; documentId: string; carpetaId: string | null }
  | { ok: false; error: string };

/** Estado del detector de UNA cámara (lo lleva el cliente entre cuadros). */
export interface EstadoDetector {
  /** Personas que se consideran en cuadro ahora (0 = nadie). */
  presentes: number;
  /** Última vez (ms) que se vio al menos una persona. */
  ultimaVistaEn: number | null;
  /** Última foto tomada (ms). */
  ultimaFotoEn: number | null;
}

export const ESTADO_DETECTOR_INICIAL: EstadoDetector = {
  presentes: 0,
  ultimaVistaEn: null,
  ultimaFotoEn: null,
};

export interface DecisionFoto {
  estado: EstadoDetector;
  /** `null` = no tomar foto en este cuadro. */
  foto: MotivoFotoPersona | null;
}

/**
 * Para que una persona «aparezca» hay que verla en DOS miradas dentro de esta
 * ventana (a 1 cuadro por segundo, 2 de 5). Un solo cuadro con «persona»
 * —compresión del 4G, una sombra, el borrón de un pájaro— no saca foto. Cuesta
 * ~1 s de demora en la primera foto; alguien que cruza el cuadro en menos de
 * 2 s no queda (en el patio nadie cruza tan rápido). 5 s y no 3: la captura de
 * respaldo de EZUIKit puede tardar segundos y estirar la vuelta. Tiene que
 * quedar por debajo de `AUSENCIA_PERSONA_MS`.
 */
export const VENTANA_CONFIRMAR_PERSONA_MS = 5_000;
/** Nunca dos fotos de la misma cámara más cerca que esto (frena el parpadeo 1→2→1→2). */
export const HUECO_MINIMO_FOTO_MS = 10_000;

/** `Infinity` = «nunca» o el reloj volvió atrás: cuenta como hace mucho. */
function desde(ahora: number, t: number | null): number {
  return t === null || ahora < t ? Number.POSITIVE_INFINITY : ahora - t;
}

/**
 * Decide si este cuadro saca foto. Pura: no muta `estado`.
 *
 * `estado.presentes` = cuántas había en la ÚLTIMA FOTO (0 = nadie confirmado),
 * no lo que dijo el último cuadro: así el parpadeo del detector no cuenta como
 * «llegó otra persona» cada vez que vuelve a subir.
 *
 * - Nadie en cuadro y alguien aparece: 1.ª mirada = candidato (sin foto); 2.ª
 *   dentro de `VENTANA_CONFIRMAR_PERSONA_MS` = «aparecio».
 * - Sigue gente: «sigue» a lo sumo cada `INTERVALO_FOTO_PERSONA_MS`.
 * - Hay más que en la última foto: «mas_gente», respetando `HUECO_MINIMO_FOTO_MS`
 *   (si el hueco no da, espera; si la persona sigue al cumplirse, sale la foto).
 * - Sin ver a nadie menos de `AUSENCIA_PERSONA_MS`: parpadeo, no se reinicia.
 *   Pasada la ausencia, la próxima persona vuelve a ser «aparecio».
 */
export function decidirFotoPersona(
  estado: EstadoDetector,
  personas: number,
  ahora: number,
): DecisionFoto {
  const n = Number.isFinite(personas) && personas > 0 ? Math.floor(personas) : 0;
  const desdeVista = desde(ahora, estado.ultimaVistaEn);
  const desdeFoto = desde(ahora, estado.ultimaFotoEn);

  if (n === 0) {
    if (estado.presentes > 0 && desdeVista >= AUSENCIA_PERSONA_MS) {
      return { estado: { ...estado, presentes: 0 }, foto: null };
    }
    return { estado, foto: null };
  }

  const foto = (motivo: MotivoFotoPersona): DecisionFoto => ({
    estado: { presentes: n, ultimaVistaEn: ahora, ultimaFotoEn: ahora },
    foto: motivo,
  });
  const sinFoto: DecisionFoto = { estado: { ...estado, ultimaVistaEn: ahora }, foto: null };

  if (estado.presentes === 0) {
    const confirmada = desdeVista <= VENTANA_CONFIRMAR_PERSONA_MS;
    return confirmada && desdeFoto >= HUECO_MINIMO_FOTO_MS ? foto("aparecio") : sinFoto;
  }
  if (n > estado.presentes && desdeFoto >= HUECO_MINIMO_FOTO_MS) return foto("mas_gente");
  if (desdeFoto >= INTERVALO_FOTO_PERSONA_MS) return foto("sigue");
  return sinFoto;
}

/* ── La miniatura de la burbuja envejece (2026-10-08) ─────────────────────── */

/** Desde esta edad la miniatura de la burbuja se atenúa: ya no es «lo que pasa ahora». */
export const MINIATURA_VIEJA_MS = 30 * 60_000;
/** Un cuadro del video más nuevo que esto no dice su edad (se renueva cada minuto). */
export const MINIATURA_FRESCA_MS = 2 * 60_000;

export interface EdadMiniatura {
  /** «recién» · «hace 3 min» · «hace 2 h» · «hace 1 día». */
  texto: string;
  /** ≥ `MINIATURA_VIEJA_MS`: la burbuja la atenúa. */
  vieja: boolean;
}

/** Cuánto hace de la miniatura. Un `at` en el futuro (relojes que no coinciden) cuenta como «recién». */
export function edadMiniatura(at: number, ahora: number): EdadMiniatura {
  const ms = Math.max(0, ahora - at);
  const min = Math.floor(ms / 60_000);
  let texto: string;
  if (min < 1) texto = "recién";
  else if (min < 60) texto = `hace ${min} min`;
  else if (min < 24 * 60) texto = `hace ${Math.floor(min / 60)} h`;
  else {
    const d = Math.floor(min / (24 * 60));
    texto = d === 1 ? "hace 1 día" : `hace ${d} días`;
  }
  return { texto, vieja: ms >= MINIATURA_VIEJA_MS };
}
