/**
 * Puente de pantalla para cámaras Hik-Connect (ADR-466) — la parte PURA.
 *
 * Una PC con la app del fabricante abierta (BlueStacks o iVMS-4200) captura esa
 * ventana y manda un cuadro por segundo a la entrada de siempre con
 * `?modo=vivo`. De esos cuadros, casi ninguno merece quedar:
 *
 *  · el último vive 60 s para que el panel lo muestre «casi en vivo»;
 *  · pasa al historial (foto `programada`, y la IA la lee) sólo si la imagen
 *    **cambió** respecto de la última guardada, o si pasó un rato sin guardar
 *    nada — y nunca más de un tope por día. A 1 cuadro/s, leer todo con la IA
 *    serían ~US$ 864 por día y por cámara; con el filtro, ≤ 60 lecturas.
 *
 * Acá vive la decisión (qué cambió, cuándo toca, cuánto se lleva el día) y el
 * recorte en fracciones. Sin sharp, sin Redis, sin fetch: se prueba con
 * números y lo puede importar la pantalla.
 */
import {
  FUENTES_CAMARA,
  type AjustesVivo,
  type Camara,
  type FuenteCamara,
  type RecorteCamara,
  type ResultadoCamaras,
} from "@/lib/camaras/camaras";

/** Los valores que rigen cuando la cámara no dice otra cosa. */
export const VIVO_POR_DEFECTO: Readonly<Required<AjustesVivo>> = { umbralPct: 8, cadaMin: 15, maxDia: 60 };

/** Lo que se acepta al configurar (el mismo rango que valida la ruta). */
export const RANGO_VIVO = {
  umbralPct: { min: 1, max: 50 },
  cadaMin: { min: 1, max: 24 * 60 },
  maxDia: { min: 1, max: 200 },
} as const;

/** Cuánto vive el último cuadro: pasado esto, el panel dice «sin señal». */
export const SEGUNDOS_CUADRO = 60;
/** Lado de la huella: 32×32 en gris = 1024 números. */
export const LADO_HUELLA = 32;
/** Un recorte más chico que esto (5 % del lado) es un error de clic, no una cámara. */
export const LADO_MINIMO_RECORTE = 0.05;

export type MotivoPaso = "cambio" | "intervalo" | "sin_cambio" | "tope_del_dia";

/**
 * Lo que se recuerda de la última foto GUARDADA de una cámara (no del último
 * cuadro): contra ella se mide el cambio, desde ella se cuenta el intervalo.
 */
export interface EstadoVivo {
  /** Huella en base64 (1024 bytes). */
  huella: string;
  /** Epoch ms de la última guardada. */
  guardadaEn: number;
  /** Día de Lima (`YYYY-MM-DD`) al que corresponde `cuenta`. */
  dia: string;
  /** Cuántas se guardaron ese día. */
  cuenta: number;
}

/** Los ajustes de la cámara completados con los valores por defecto. */
export function ajustesVivo(camara: Pick<Camara, "vivo">): Required<AjustesVivo> {
  const v = camara.vivo ?? {};
  return {
    umbralPct: v.umbralPct ?? VIVO_POR_DEFECTO.umbralPct,
    cadaMin: v.cadaMin ?? VIVO_POR_DEFECTO.cadaMin,
    maxDia: v.maxDia ?? VIVO_POR_DEFECTO.maxDia,
  };
}

/** Lado de cada bloque de la huella: 8×8 → 16 bloques en la de 32×32. */
const LADO_BLOQUE = 8;

/**
 * Cuánto cambió la imagen, de 0 a 100 (cada punto es un gris 0–255). Cuenta
 * el BLOQUE que más cambió, no el promedio de toda la imagen: una persona o un
 * camión que ocupa el 5 % del cuadro movía el promedio 2–3 % y no pasaba el
 * umbral de 8 % (medido 03-10); en su bloque de 8×8 lo mueve ~40 %. El ruido
 * de compresión cambia cada punto apenas y sigue por debajo. Si las huellas no
 * tienen el mismo largo no se pueden comparar y cuenta como cambio total.
 */
export function diferenciaPct(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return 100;
  const global = (() => {
    let suma = 0;
    for (let i = 0; i < a.length; i++) suma += Math.abs(a[i]! - b[i]!);
    return (suma / a.length / 255) * 100;
  })();
  if (a.length !== LADO_HUELLA * LADO_HUELLA) return global;
  let maxBloque = 0;
  for (let by = 0; by < LADO_HUELLA; by += LADO_BLOQUE) {
    for (let bx = 0; bx < LADO_HUELLA; bx += LADO_BLOQUE) {
      let suma = 0;
      for (let y = by; y < by + LADO_BLOQUE; y++) {
        for (let x = bx; x < bx + LADO_BLOQUE; x++) suma += Math.abs(a[y * LADO_HUELLA + x]! - b[y * LADO_HUELLA + x]!);
      }
      maxBloque = Math.max(maxBloque, (suma / (LADO_BLOQUE * LADO_BLOQUE) / 255) * 100);
    }
  }
  return Math.max(global, maxBloque);
}

const DIA_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** El día del patio, no el del servidor: el tope diario se reinicia a medianoche de Pucallpa. */
export function diaDeLima(ms: number): string {
  return DIA_LIMA.format(new Date(ms));
}

/** Cuántas lleva guardadas HOY (día de Lima). Un estado de ayer cuenta cero. */
export function cuentaDelDia(estado: Pick<EstadoVivo, "dia" | "cuenta"> | null, ahora: number): number {
  return estado && estado.dia === diaDeLima(ahora) ? estado.cuenta : 0;
}

/**
 * ¿Este cuadro pasa al historial?
 *
 * Sin una guardada anterior, el primero entra como `cambio` (no hay contra qué
 * medir y la cámara recién aparece). El cambio se mide contra la última
 * GUARDADA, no contra el cuadro anterior: un cambio lento (la luz de la tarde,
 * una pila que crece) se acumula hasta pasar el umbral en vez de perderse de a
 * poco. El tope del día gana a todo.
 */
export function decidirPaso(entrada: {
  huella: Uint8Array;
  anterior: { huella: Uint8Array; guardadaEn: number } | null;
  cuentaHoy: number;
  ahora: number;
  ajustes: Required<AjustesVivo>;
}): { guardar: boolean; motivo: MotivoPaso; diferenciaPct: number | null } {
  const { huella, anterior, cuentaHoy, ahora, ajustes } = entrada;
  const diferencia = anterior ? diferenciaPct(huella, anterior.huella) : null;
  let motivo: MotivoPaso = "sin_cambio";
  if (diferencia === null || diferencia > ajustes.umbralPct) motivo = "cambio";
  else if (ahora - anterior!.guardadaEn >= ajustes.cadaMin * 60_000) motivo = "intervalo";
  if (motivo === "sin_cambio") return { guardar: false, motivo, diferenciaPct: diferencia };
  if (cuentaHoy >= ajustes.maxDia) return { guardar: false, motivo: "tope_del_dia", diferenciaPct: diferencia };
  return { guardar: true, motivo, diferenciaPct: diferencia };
}

/** El estado después de guardar una foto: huella nueva, hora nueva, uno más en el día. */
export function estadoTrasGuardar(estado: EstadoVivo | null, huella: string, ahora: number): EstadoVivo {
  return { huella, guardadaEn: ahora, dia: diaDeLima(ahora), cuenta: cuentaDelDia(estado, ahora) + 1 };
}

/** Lo que vino de Redis, sólo si tiene la forma esperada. Basura = como si no hubiera nada. */
export function estadoDe(raw: unknown): EstadoVivo | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.huella !== "string" || typeof e.dia !== "string") return null;
  if (typeof e.guardadaEn !== "number" || !Number.isFinite(e.guardadaEn)) return null;
  if (typeof e.cuenta !== "number" || !Number.isFinite(e.cuenta) || e.cuenta < 0) return null;
  return { huella: e.huella, guardadaEn: e.guardadaEn, dia: e.dia, cuenta: Math.floor(e.cuenta) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Recorte
 * ──────────────────────────────────────────────────────────────────────────── */

const redondo = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * ¿Es un recorte que se puede aplicar? Fracciones 0–1, dentro de la imagen y
 * no más chico que el 5 % de cada lado. Devuelve los valores redondeados a 4
 * decimales (una diezmilésima de una ventana de 1920 px es 0,2 px).
 */
export function validarRecorte(r: RecorteCamara): { ok: true; recorte: RecorteCamara } | { ok: false; motivo: string } {
  const { x, y, w, h } = r;
  if (![x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return { ok: false, motivo: "El recorte tiene que ser cuatro números." };
  }
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return { ok: false, motivo: "El recorte empieza fuera de la imagen." };
  if (w < LADO_MINIMO_RECORTE || h < LADO_MINIMO_RECORTE) {
    return { ok: false, motivo: "El recorte es demasiado chico: marca al menos el 5 % de cada lado." };
  }
  /* Medio píxel de holgura sobre el borde: el arrastre del ratón da 0,50001 + 0,5. */
  if (x + w > 1.0005 || y + h > 1.0005) return { ok: false, motivo: "El recorte se sale de la imagen." };
  return {
    ok: true,
    recorte: { x: redondo(x), y: redondo(y), w: redondo(Math.min(w, 1 - x)), h: redondo(Math.min(h, 1 - y)) },
  };
}

/**
 * El recorte en píxeles de una imagen de `ancho`×`alto`, listo para
 * `sharp().extract()`. `null` = no hay que recortar (sin recorte, o la imagen
 * entera). Siempre queda dentro de la imagen y con al menos 1 px por lado.
 */
export function recorteEnPixeles(
  r: RecorteCamara | null | undefined,
  ancho: number,
  alto: number,
): { left: number; top: number; width: number; height: number } | null {
  if (!r || ancho < 1 || alto < 1) return null;
  if (r.x <= 0 && r.y <= 0 && r.w >= 1 && r.h >= 1) return null;
  const left = Math.min(Math.max(Math.round(r.x * ancho), 0), ancho - 1);
  const top = Math.min(Math.max(Math.round(r.y * alto), 0), alto - 1);
  const width = Math.min(Math.max(Math.round(r.w * ancho), 1), ancho - left);
  const height = Math.min(Math.max(Math.round(r.h * alto), 1), alto - top);
  return { left, top, width, height };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Configuración del puente
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Lo que se cambia del puente. En cada campo: `undefined` = no tocar, `null` =
 * volver a lo de siempre. `vivo` se MEZCLA con lo guardado (mandar sólo el
 * umbral no borra el intervalo).
 */
export interface CambiosPuente {
  fuente?: FuenteCamara | null;
  recorte?: RecorteCamara | null;
  vivo?: AjustesVivo | null;
}

function ajusteFuera(v: AjustesVivo): string | null {
  for (const campo of ["umbralPct", "cadaMin", "maxDia"] as const) {
    const valor = v[campo];
    if (valor === undefined) continue;
    const { min, max } = RANGO_VIVO[campo];
    if (!Number.isFinite(valor) || valor < min || valor > max) return `${campo} tiene que estar entre ${min} y ${max}.`;
    if (campo !== "umbralPct" && !Number.isInteger(valor)) return `${campo} tiene que ser un número entero.`;
  }
  return null;
}

/** Guarda la fuente, el recorte y los ajustes del puente de UNA cámara. */
export function configurarPuente(camaras: readonly Camara[], id: string, cambios: CambiosPuente): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  const siguiente: Camara = { ...camara };

  if (cambios.fuente !== undefined) {
    if (cambios.fuente === null) delete siguiente.fuente;
    else if ((FUENTES_CAMARA as readonly string[]).includes(cambios.fuente)) siguiente.fuente = cambios.fuente;
    else return { ok: false, motivo: "No se reconoce de dónde salen las imágenes." };
  }
  if (cambios.recorte !== undefined) {
    if (cambios.recorte === null) delete siguiente.recorte;
    else {
      const r = validarRecorte(cambios.recorte);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      siguiente.recorte = r.recorte;
    }
  }
  if (cambios.vivo !== undefined) {
    if (cambios.vivo === null) delete siguiente.vivo;
    else {
      const fuera = ajusteFuera(cambios.vivo);
      if (fuera) return { ok: false, motivo: fuera };
      const mezcla: AjustesVivo = { ...(camara.vivo ?? {}) };
      for (const campo of ["umbralPct", "cadaMin", "maxDia"] as const) {
        const valor = cambios.vivo[campo];
        if (valor !== undefined) mezcla[campo] = valor;
      }
      siguiente.vivo = mezcla;
    }
  }

  const a = ajustesVivo(siguiente);
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? siguiente : c)),
    mensaje:
      `«${camara.nombre}»: el cuadro en vivo pasa al historial si cambia más del ${a.umbralPct} % ` +
      `o cada ${a.cadaMin} min, hasta ${a.maxDia} por día.`,
  };
}
