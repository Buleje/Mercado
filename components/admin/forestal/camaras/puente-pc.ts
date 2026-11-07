/**
 * El «puente de pantalla» de las cámaras (Brandon 2026-10-03), lo puro.
 *
 * La cámara de la oficina va sólo por 4G (detrás del CGNAT del operador) y la
 * única que la ve es la app Hik-Connect. El puente: en la PC de Brandon corre
 * Hik-Connect dentro de BlueStacks (o el iVMS-4200), un script de PowerShell
 * captura esa ventana y la manda cada segundo al webhook con `modo=vivo`; el
 * servidor guarda —y la IA lee— sólo cuando la imagen cambia.
 *
 * Acá vive lo que la pantalla calcula sin tocar nada: el recorte en fracciones,
 * el «hace 2 s», cuánto esperar entre pedidos y el comando para copiar. Sin
 * React, para que se pruebe solo (`__tests__/camaras-puente-pc.test.ts`).
 */

import type { AjustesVivo, FuenteCamara, RecorteCamara } from "@/lib/camaras/camaras";
import { LADO_MINIMO_RECORTE, RANGO_VIVO, SEGUNDOS_CUADRO, VIVO_POR_DEFECTO } from "@/lib/camaras/vivo";

/* ── Lo que la cámara trae en su JSON (ADR-466, lo define el backend) ────── */

export type { AjustesVivo, FuenteCamara };
/** El pedazo de la captura que es la cámara, en fracciones 0–1 del ancho y del alto. */
export type Recorte = RecorteCamara;

export interface CamposPuente {
  fuente?: FuenteCamara | null;
  recorte?: Recorte | null;
  vivo?: AjustesVivo | null;
}

/* ── Ajustes del modo vivo ───────────────────────────────────────────────── */

/* Los valores y los rangos son los del servidor (`lib/camaras/vivo.ts`): si la
   pantalla tuviera los suyos, un tope de 300 se vería bien acá y el PATCH lo
   rechazaría. */
export { VIVO_POR_DEFECTO };

export const LIMITES_VIVO: Record<keyof AjustesVivo, readonly [number, number]> = {
  umbralPct: [RANGO_VIVO.umbralPct.min, RANGO_VIVO.umbralPct.max],
  cadaMin: [RANGO_VIVO.cadaMin.min, RANGO_VIVO.cadaMin.max],
  maxDia: [RANGO_VIVO.maxDia.min, RANGO_VIVO.maxDia.max],
};

/** Lo que cuesta que la IA lea una foto (medido en `lib/ai/camara-vision.ts`). */
export const COSTO_LECTURA_USD = 0.01;

/** Sin cuadro nuevo en este tiempo, el puente está caído (el servidor lo suelta a los 60 s). */
export const SIN_SENAL_MS = SEGUNDOS_CUADRO * 1000;

export function acotarAjuste(campo: keyof AjustesVivo, valor: number): number {
  const [min, max] = LIMITES_VIVO[campo];
  if (!Number.isFinite(valor)) return VIVO_POR_DEFECTO[campo];
  return Math.min(max, Math.max(min, Math.round(valor)));
}

/** Los tres ajustes, con el valor por defecto donde falte o venga roto. */
export function ajustesConDefectos(v: AjustesVivo | null | undefined): Required<AjustesVivo> {
  const leer = (campo: keyof AjustesVivo) => {
    const x = v?.[campo];
    return typeof x === "number" && Number.isFinite(x) ? acotarAjuste(campo, x) : VIVO_POR_DEFECTO[campo];
  };
  return { umbralPct: leer("umbralPct"), cadaMin: leer("cadaMin"), maxDia: leer("maxDia") };
}

/** Lo más que puede gastar la IA en un día con ese tope (US$). */
export function costoMaximoDia(maxDia: number): number {
  return Math.round(acotarAjuste("maxDia", maxDia) * COSTO_LECTURA_USD * 100) / 100;
}

/** «US$2,00»: el costo como lo lee Brandon (coma decimal, como en la boleta). */
export function textoDolares(usd: number): string {
  return `US$${usd.toFixed(2).replace(".", ",")}`;
}

/* ── Recorte ─────────────────────────────────────────────────────────────── */

/** Más chico que esto es un clic sin arrastrar, no un recorte (el servidor rechaza < 5 %). */
export const RECORTE_MINIMO = LADO_MINIMO_RECORTE;

const acotar01 = (n: number) => Math.min(1, Math.max(0, n));
const redondear = (n: number) => Math.round(n * 10_000) / 10_000;

/** Dónde está el puntero dentro de la caja de la imagen, en fracciones 0–1. */
export function fraccionEnCaja(
  clientX: number,
  clientY: number,
  caja: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  if (caja.width <= 0 || caja.height <= 0) return { x: 0, y: 0 };
  return {
    x: acotar01((clientX - caja.left) / caja.width),
    y: acotar01((clientY - caja.top) / caja.height),
  };
}

/**
 * El rectángulo que arman dos esquinas, en cualquier orden (se puede arrastrar
 * hacia arriba a la izquierda). `null` si quedó más chico que el mínimo.
 */
export function recorteDeArrastre(
  a: { x: number; y: number },
  b: { x: number; y: number },
  minimo = RECORTE_MINIMO,
): Recorte | null {
  const x1 = acotar01(Math.min(a.x, b.x));
  const y1 = acotar01(Math.min(a.y, b.y));
  const w = acotar01(Math.max(a.x, b.x)) - x1;
  const h = acotar01(Math.max(a.y, b.y)) - y1;
  if (w < minimo || h < minimo) return null;
  return { x: redondear(x1), y: redondear(y1), w: redondear(w), h: redondear(h) };
}

/** ¿Es un recorte que se puede guardar? (dentro de la imagen y con tamaño). */
export function recorteValido(r: unknown): r is Recorte {
  if (!r || typeof r !== "object") return false;
  const { x, y, w, h } = r as Record<string, unknown>;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  const [rx, ry, rw, rh] = nums as number[];
  const eps = 1e-6;
  return rx >= 0 && ry >= 0 && rw > 0 && rh > 0 && rx + rw <= 1 + eps && ry + rh <= 1 + eps;
}

/** Un recorte que agarra toda la imagen no recorta nada: se guarda como `null`. */
export function esTodaLaImagen(r: Recorte | null | undefined): boolean {
  if (!r) return true;
  return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
}

/** Los cuatro cuadrantes de la vista de 4 de Hik-Connect, para no tener que arrastrar. */
export const CUADRANTES: readonly { id: string; etiqueta: string; recorte: Recorte }[] = [
  { id: "ai", etiqueta: "Arriba izq.", recorte: { x: 0, y: 0, w: 0.5, h: 0.5 } },
  { id: "ad", etiqueta: "Arriba der.", recorte: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
  { id: "bi", etiqueta: "Abajo izq.", recorte: { x: 0, y: 0.5, w: 0.5, h: 0.5 } },
  { id: "bd", etiqueta: "Abajo der.", recorte: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } },
];

export function mismoRecorte(a: Recorte | null | undefined, b: Recorte | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const cerca = (p: number, q: number) => Math.abs(p - q) < 0.001;
  return cerca(a.x, b.x) && cerca(a.y, b.y) && cerca(a.w, b.w) && cerca(a.h, b.h);
}

/**
 * El cuadro que sirve el panel YA viene recortado con el recorte guardado
 * (`base`: el servidor recorta antes de guardar el cuadro). Lo que se marca
 * encima es un recorte DE ESE recorte, y lo que se guarda tiene que ser de la
 * captura entera: sin esta cuenta, marcar dos veces recortaba cualquier cosa.
 */
export function componerRecorte(base: Recorte | null | undefined, relativo: Recorte): Recorte {
  if (!base) return relativo;
  return {
    x: redondear(base.x + relativo.x * base.w),
    y: redondear(base.y + relativo.y * base.h),
    w: redondear(relativo.w * base.w),
    h: redondear(relativo.h * base.h),
  };
}

/**
 * Al revés: dónde cae un recorte de la captura entera sobre el cuadro ya
 * recortado con `base`. `null` = no hay recorte (o no cae adentro).
 */
export function relativoA(base: Recorte | null | undefined, absoluto: Recorte | null | undefined): Recorte | null {
  if (!absoluto) return null;
  if (!base) return absoluto;
  const x1 = acotar01((absoluto.x - base.x) / base.w);
  const y1 = acotar01((absoluto.y - base.y) / base.h);
  const x2 = acotar01((absoluto.x + absoluto.w - base.x) / base.w);
  const y2 = acotar01((absoluto.y + absoluto.h - base.y) / base.h);
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null;
  return { x: redondear(x1), y: redondear(y1), w: redondear(x2 - x1), h: redondear(y2 - y1) };
}

const pct = (n: number) => `${redondear(n * 100)}%`;

/** Dónde dibujar el rectángulo sobre la imagen, en porcentajes de la caja. */
export function estiloRecorte(r: Recorte): { left: string; top: string; width: string; height: string } {
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

/**
 * Para MOSTRAR sólo lo recortado sin pedir otra imagen: la caja toma la
 * proporción del recorte y la imagen entera se agranda y se corre adentro
 * (con `overflow: hidden`, lo que sobra no se ve).
 */
export function vistaRecortada(
  r: Recorte,
  anchoNatural: number,
  altoNatural: number,
): { aspectRatio: string; img: { width: string; height: string; left: string; top: string } } {
  const ancho = Math.max(1, anchoNatural) * r.w;
  const alto = Math.max(1, altoNatural) * r.h;
  return {
    aspectRatio: `${Math.round(ancho)} / ${Math.round(alto)}`,
    img: {
      width: pct(1 / r.w),
      height: pct(1 / r.h),
      left: pct(-r.x / r.w),
      top: pct(-r.y / r.h),
    },
  };
}

/** «1180 × 664 px»: el tamaño real del recorte sobre la captura. */
export function tamanoRecorte(r: Recorte, ancho: number, alto: number): string {
  return `${Math.round(r.w * ancho)} × ${Math.round(r.h * alto)} px`;
}

/* ── «hace 2 s» y la señal del puente ────────────────────────────────────── */

/** «hace 2 s» · «hace 1 min» · «hace 3 h» · «hace 2 días». */
export function textoHace(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 1) return "hace un instante";
  if (s < 60) return `hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/**
 * La hora del cuadro que manda el servidor en `X-Cuadro-Ts`: milisegundos,
 * segundos o una fecha ISO — se acepta cualquiera de las tres.
 */
export function leerTsCuadro(cabecera: string | null | undefined): number | null {
  const v = (cabecera ?? "").trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Qué tan viejo es el cuadro, con el reloj del SERVIDOR (la cabecera `Date`)
 * y no con el de esta compu: un reloj adelantado 40 s decía «sin señal» con el
 * puente andando. Sin `Date`, se usa el reloj local.
 */
export function edadDelCuadro(
  tsCuadro: number | null,
  fechaServidor: string | null | undefined,
  ahoraCliente: number,
): number | null {
  if (tsCuadro === null) return null;
  const servidor = fechaServidor ? Date.parse(fechaServidor) : Number.NaN;
  const ahora = Number.isFinite(servidor) ? servidor : ahoraCliente;
  /* `Date` tiene resolución de segundo: un cuadro de hace 300 ms puede salir
     «del futuro». Se lo trata como recién llegado. */
  return Math.max(0, ahora - tsCuadro);
}

export type SenalPuente = "esperando" | "vivo" | "sin_senal" | "error";

/** La señal según la edad del último cuadro. */
export function senalPorEdad(edadMs: number | null): SenalPuente {
  if (edadMs === null) return "sin_senal";
  return edadMs > SIN_SENAL_MS ? "sin_senal" : "vivo";
}

/** Lo que dice el visor al pie: «en vivo · hace 2 s» / «sin señal desde hace 1 min». */
export function textoSenal(senal: SenalPuente, edadMs: number | null): string {
  if (senal === "vivo") return `En vivo · ${textoHace(edadMs ?? 0)}`;
  if (senal === "sin_senal") {
    return edadMs !== null
      ? `Sin señal desde ${textoHace(edadMs)}`
      : "Sin señal: la PC todavía no mandó ninguna imagen";
  }
  if (senal === "error") return "No se pudo preguntar al panel";
  return "Conectando…";
}

/** Lo corto, para la pastilla de la lista. */
export function textoPastilla(senal: SenalPuente): string {
  if (senal === "vivo") return "Puente PC · en vivo";
  if (senal === "sin_senal") return "Puente PC · sin señal";
  if (senal === "error") return "Puente PC · sin respuesta";
  return "Puente PC";
}

/** Tope de la espera tras errores seguidos: más que esto y el visor parece muerto. */
export const ESPERA_MAXIMA_MS = 30_000;

/**
 * Cuánto esperar antes del pedido siguiente. Con señal, al ritmo; sin señal,
 * más tranquilo (nadie manda nada); con errores de red, el doble cada vez
 * (1 s, 2 s, 4 s… hasta 30 s): sin eso, un servidor caído recibe un pedido por
 * segundo de cada pestaña abierta.
 */
export function esperaSiguiente(senal: SenalPuente, fallosSeguidos: number, ritmoMs = 1000): number {
  if (senal === "error") {
    const n = Math.max(1, fallosSeguidos);
    return Math.min(ESPERA_MAXIMA_MS, Math.max(ritmoMs, 1000) * 2 ** (n - 1));
  }
  if (senal === "sin_senal") return Math.max(ritmoMs, 3000);
  return ritmoMs;
}

/* ── El comando y la configuración para la PC ────────────────────────────── */

export const VENTANAS_PUENTE = ["BlueStacks", "iVMS-4200"] as const;
export type VentanaPuente = (typeof VENTANAS_PUENTE)[number];

/** La dirección base del webhook; el script le agrega `?k=<token>&modo=vivo`. */
export function urlPuente(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/webhooks/camara`;
}

/** El comando listo para pegar en PowerShell, parado en la carpeta del script. */
export function comandoPuente(p: { url: string; token: string; ventana?: string }): string {
  const partes = [
    "powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1",
    `-Url "${p.url}"`,
    `-Token "${p.token}"`,
  ];
  if (p.ventana && p.ventana !== "BlueStacks") partes.push(`-Ventana "${p.ventana}"`);
  return partes.join(" ");
}

/** El archivo `camaras-puente-pc.json` que el script lee si no le pasan nada. */
export function configPuente(p: { url: string; token: string; ventana?: string; cadaSeg?: number }): string {
  return `${JSON.stringify(
    { Url: p.url, Token: p.token, Ventana: p.ventana ?? "BlueStacks", CadaSeg: p.cadaSeg ?? 1 },
    null,
    2,
  )}\n`;
}

/* ── La última foto guardada de una cámara ───────────────────────────────── */

export function ultimaCapturaDe<T extends { camaraId: string; at: string }>(
  capturas: readonly T[],
  camaraId: string,
): T | null {
  let mejor: T | null = null;
  for (const c of capturas) {
    if (c.camaraId !== camaraId) continue;
    if (!mejor || Date.parse(c.at) > Date.parse(mejor.at)) mejor = c;
  }
  return mejor;
}

/** Los campos del puente de una cámara, con lo que traiga su JSON (puede no traer nada). */
export function camposPuente(camara: object): CamposPuente {
  const c = camara as CamposPuente;
  return {
    fuente: c.fuente ?? null,
    recorte: recorteValido(c.recorte) ? c.recorte : null,
    vivo: c.vivo ?? null,
  };
}
