/**
 * Tema de la tienda de cada negocio (ADR-511). Puro, sin servidor: lo usan
 * `datos.ts` (el tema elegido) y las piezas (la hoja de variables `--ti-*`).
 *
 * Regla de Musa (rediseño minimalista del 16-10): blanco, texto casi negro, UN
 * gris y UN acento. Si el negocio nunca cambió el verde/turquesa de fábrica del
 * sistema, su acento es casi negro (como Musa); si eligió un color propio, ese
 * color — oscurecido lo justo para que el texto con él pase 4,5:1 sobre blanco.
 */
import { carasDe, familiaDe } from "./letras";
import { LETRAS_TIENDA, type TemaTienda } from "./contenido";

export const ID_PAGINA_TIENDA = "pagina-tienda";

/** Casi negro de Musa: el acento de quien no eligió color. */
export const ACENTO_NEUTRO = "#1a1a1a";

/** Colores que el sistema pone solo (columna `primaryColor` y diseño base del editor): no son una elección del dueño. */
export const COLORES_DE_FABRICA: readonly string[] = ["#2d6a4f", "#00b4a6", "#00a0a0"];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc`/`#aabbcc` → `#aabbcc` en minúscula; `null` si no es un hex. */
export function normalizarHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!HEX.test(t)) return null;
  const h = t.slice(1).toLowerCase();
  return `#${h.length === 3 ? h.replace(/./g, (c) => c + c) : h}`;
}

const canales = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

const aHex = (c: [number, number, number]) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;

/** Luminancia relativa WCAG 2.x. */
export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Mezcla `hex` con `con` (0 = hex, 1 = con). */
function mezclar(hex: string, con: string, t: number): string {
  const a = canales(hex);
  const b = canales(con);
  return aHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** Oscurece `hex` hacia negro hasta que `contraste(hex, fondo) ≥ minimo`. */
export function oscurecerHasta(hex: string, minimo = 4.5, fondo = "#ffffff"): string {
  let h = hex;
  for (let paso = 1; contraste(h, fondo) < minimo && paso <= 40; paso++) h = mezclar(hex, "#000000", paso * 0.025);
  return h;
}

/** Aclara `hex` hacia blanco hasta que pase `minimo` sobre un fondo oscuro. */
export function aclararHasta(hex: string, minimo = 4.5, fondo = "#141312"): string {
  let h = hex;
  for (let paso = 1; contraste(h, fondo) < minimo && paso <= 40; paso++) h = mezclar(hex, "#ffffff", paso * 0.025);
  return h;
}

/** El acento de la tienda: color propio con contraste ≥ 4,5:1 sobre blanco, o casi negro si es el de fábrica / no hay / no es un hex. */
export function acentoDe(color: unknown): string {
  const hex = normalizarHex(color);
  if (!hex || COLORES_DE_FABRICA.includes(hex)) return ACENTO_NEUTRO;
  return oscurecerHasta(hex);
}

/** `fontFamily` del editor (`inter`, `poppins`, `geist`…) → una de las 3 letras auto-alojadas. */
export function letraDe(fuente: unknown): TemaTienda["letra"] {
  const f = typeof fuente === "string" ? fuente.trim().toLowerCase() : "";
  if ((LETRAS_TIENDA as readonly string[]).includes(f)) return f as TemaTienda["letra"];
  if (f === "manrope" || f === "montserrat" || f === "raleway" || f === "nunito") return "manrope";
  if (f === "inter" || f === "geist" || f === "roboto" || f === "opensans" || f === "lato" || f === "sistema") return "inter";
  return "jakarta";
}

/** Forma de botones y tarjetas desde el editor (`buttonStyle`, `borderRadius`). */
export function radioDe(boton: unknown, redondeo: unknown): TemaTienda["radio"] {
  if (boton === "pill") return "pildora";
  if (typeof redondeo === "number" && redondeo >= 20) return "redondo";
  return "suave";
}

/** El tema de un negocio a partir de sus ajustes (`primaryColor` de la fila + `storeTheme` del editor). */
export function temaDe(settings: { primaryColor?: unknown; storeTheme?: Record<string, unknown> | null } | null | undefined): TemaTienda {
  const st = settings?.storeTheme ?? {};
  // El editor manda sobre la columna (misma precedencia que la tienda general).
  const color = normalizarHex(st.primaryColor) ?? normalizarHex(settings?.primaryColor);
  return {
    acento: acentoDe(color),
    letra: letraDe(st.fontFamily),
    radio: radioDe(st.buttonStyle, st.borderRadius),
  };
}

const RADIOS: Record<TemaTienda["radio"], { tarjeta: string; control: string }> = {
  suave: { tarjeta: "16px", control: "12px" },
  redondo: { tarjeta: "24px", control: "16px" },
  pildora: { tarjeta: "20px", control: "999px" },
};

/**
 * Las variables `--ti-*` de la tienda, encerradas en `[data-pagina="pagina-tienda"]`
 * (claro) y `.dark [data-pagina…]` (oscuro). Las piezas usan `var(--ti-*)`, sin hex.
 */
export function cssTema(tema: TemaTienda): string {
  const sel = `[data-pagina="${ID_PAGINA_TIENDA}"]`;
  const r = RADIOS[tema.radio];
  const claro = tema.acento;
  const oscuro = luminancia(claro) < 0.02 ? "#f5f4f2" : aclararHasta(claro);
  const fuente = familiaDe(tema.letra);
  return `${carasDe(tema.letra)}
${sel}{--ti-fuente:${fuente};--ti-radio-tarjeta:${r.tarjeta};--ti-radio-control:${r.control};--ti-radio-pill:999px;
--ti-blanco:#ffffff;--ti-fondo:#ffffff;--ti-suave:#f5f4f2;--ti-linea:#dedbd7;--ti-linea-suave:#ecebe8;
--ti-texto:#1a1a1a;--ti-texto-2:#4a4642;--ti-texto-3:#6b6661;
--ti-acento:${claro};--ti-sobre-acento:#ffffff;--ti-acento-suave:color-mix(in srgb,${claro} 8%,#ffffff);
--ti-sombra-tarjeta:0 1px 2px rgb(0 0 0/.04);--ti-sombra-flotante:0 12px 32px -12px rgb(0 0 0/.18);
background:var(--ti-fondo);color:var(--ti-texto);font-family:var(--ti-fuente)}
.dark ${sel}{--ti-fondo:#141312;--ti-suave:#1f1e1c;--ti-linea:#3a3734;--ti-linea-suave:#2a2826;
--ti-texto:#f5f4f2;--ti-texto-2:#cfcac4;--ti-texto-3:#a8a29b;
--ti-acento:${oscuro};--ti-sobre-acento:#141312;--ti-acento-suave:color-mix(in srgb,${oscuro} 10%,#141312);
--ti-sombra-tarjeta:0 1px 2px rgb(0 0 0/.3);--ti-sombra-flotante:0 16px 40px -16px rgb(0 0 0/.6)}
`;
}
