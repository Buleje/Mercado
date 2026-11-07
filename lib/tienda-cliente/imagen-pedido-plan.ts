/**
 * lib/tienda-cliente/imagen-pedido-plan.ts — la parte PURA de la imagen del
 * pedido: formato de soles, fecha en hora de Lima, cortes de línea y la
 * disposición completa (qué va dónde y cuánto mide de alto). Sin DOM: se prueba
 * con vitest pasándole una función `medir` falsa. El dibujo en canvas vive en
 * `./imagen-pedido.ts` y sólo recorre `PlanImagen.ops`.
 *
 * Legible en el celular: a 1080 px de ancho ninguna letra baja de 32 px
 * (WhatsApp muestra la imagen a ~360 px → 32 px se ven como ~11 px reales).
 *
 * Colores fijos claros a propósito: la imagen se comparte y debe verse igual en
 * el teléfono del negocio aunque el cliente use modo oscuro. Canvas no lee
 * variables CSS, por eso son literales (este archivo no es UI de la tienda).
 */
import type { DatosImagenPedido, LineaImagenPedido } from "./contrato";
import { formatearCelularPe } from "./celular";

export const ANCHO_IMAGEN = 1080;
/** Tope de alto (iOS Safari no crea canvas de más de ~16,7 M de píxeles). */
export const ALTO_MAXIMO = 14_000;
export const LETRA_MINIMA = 32;

export const FAMILIA_LETRA =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const COLORES = {
  fondo: "#ffffff",
  tinta: "#111827",
  gris: "#4b5563",
  caja: "#f3f4f6",
  linea: "#e5e7eb",
  blanco: "#ffffff",
} as const;

export interface Fuente {
  tam: number;
  peso: 400 | 600 | 700;
  cursiva?: boolean;
}

/** `ctx.font` de una fuente. */
export function cssFuente(f: Fuente): string {
  return `${f.cursiva ? "italic " : ""}${f.peso} ${f.tam}px ${FAMILIA_LETRA}`;
}

export type Medir = (texto: string, fuente: Fuente) => number;

export type OpDibujo =
  | { t: "rect"; x: number; y: number; w: number; h: number; color: string; radio?: number }
  | {
      t: "texto";
      x: number;
      y: number;
      texto: string;
      fuente: Fuente;
      color: string;
      alinear?: "left" | "right" | "center";
    }
  | {
      t: "imagen";
      x: number;
      y: number;
      w: number;
      h: number;
      src: string | null;
      inicial: string;
      radio: number;
    };

export interface PlanImagen {
  ancho: number;
  alto: number;
  ops: OpDibujo[];
  /** Productos que no entraron por el tope de alto (se dicen en una fila «y N más»). */
  lineasOmitidas: number;
}

/* ── Formatos ─────────────────────────────────────────────────────────────── */

/** «S/ 1,234.50» (formato peruano; sin Intl para que no cambie por versión de ICU). */
export function formatoSoles(monto: number): string {
  const n = Number.isFinite(monto) ? monto : 0;
  const negativo = n < 0;
  const [entero, dec] = Math.abs(n).toFixed(2).split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negativo ? "-" : ""}S/ ${conMiles}.${dec}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «sábado 11/10 · 3:45 p. m.» en hora de Lima (UTC−5 fijo, Perú no cambia de hora). */
export function fechaPedidoLima(fecha: Date): string {
  const lima = new Date(fecha.getTime() - 5 * 3_600_000);
  const dd = String(lima.getUTCDate()).padStart(2, "0");
  const mm = String(lima.getUTCMonth() + 1).padStart(2, "0");
  const h24 = lima.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(lima.getUTCMinutes()).padStart(2, "0");
  return `${DIAS[lima.getUTCDay()]} ${dd}/${mm} · ${h12}:${min} ${h24 < 12 ? "a. m." : "p. m."}`;
}

/** Primera letra visible para el recuadro sin foto. */
export function inicialDe(nombre: string): string {
  const m = nombre.trim().match(/\p{L}|\p{N}/u);
  return m ? m[0].toLocaleUpperCase("es-PE") : "•";
}

/** Blanco o tinta según qué se lea mejor sobre `color` (#rgb, #rrggbb o rgb[a]()). */
export function textoSobre(color: string): string {
  const rgb = parsearColor(color);
  if (!rgb) return COLORES.blanco;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contraBlanco = 1.05 / (lum + 0.05);
  const contraTinta = (lum + 0.05) / 0.0616; // #111827 ≈ 0,0116 de luminancia
  // Blanco si alcanza 3:1 (AA para letra grande: el encabezado va a ≥ 34 px), como
  // se ve la marca en sus botones; si no, el que más contraste dé.
  return contraBlanco >= 3 || contraBlanco >= contraTinta ? COLORES.blanco : COLORES.tinta;
}

export function parsearColor(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/* ── Cortes de línea ──────────────────────────────────────────────────────── */

/**
 * Parte `texto` en renglones que no pasen `anchoMax`. Palabras más largas que
 * el ancho (un enlace, un código) se cortan por letra. Si sobran renglones, el
 * último termina en «…».
 */
export function cortarLineas(
  texto: string,
  anchoMax: number,
  medir: (s: string) => number,
  maxLineas = Number.POSITIVE_INFINITY,
): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const lineas: string[] = [];
  let actual = "";
  const empujarPalabraLarga = (palabra: string) => {
    let trozo = "";
    for (const ch of Array.from(palabra)) {
      if (trozo && medir(trozo + ch) > anchoMax) {
        lineas.push(trozo);
        trozo = ch;
      } else trozo += ch;
    }
    return trozo;
  };
  for (const palabra of limpio.split(" ")) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (medir(candidato) <= anchoMax) {
      actual = candidato;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = medir(palabra) > anchoMax ? empujarPalabraLarga(palabra) : palabra;
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLineas) return lineas;
  const recortadas = lineas.slice(0, maxLineas);
  let ultima = recortadas[maxLineas - 1];
  while (ultima && medir(`${ultima}…`) > anchoMax) ultima = Array.from(ultima).slice(0, -1).join("");
  recortadas[maxLineas - 1] = `${ultima.trimEnd()}…`;
  return recortadas;
}

/* ── Disposición ──────────────────────────────────────────────────────────── */

const M = 64; // margen lateral
const CW = ANCHO_IMAGEN - 2 * M; // ancho útil
const F = {
  negocio: { tam: 56, peso: 700 },
  subtitulo: { tam: 34, peso: 400 },
  fecha: { tam: 32, peso: 400 },
  producto: { tam: 38, peso: 600 },
  detalle: { tam: 32, peso: 400 },
  nota: { tam: 32, peso: 400, cursiva: true },
  precio: { tam: 38, peso: 700 },
  totalEtiqueta: { tam: 40, peso: 700 },
  total: { tam: 72, peso: 700 },
  seccion: { tam: 38, peso: 700 },
  etiqueta: { tam: 32, peso: 400 },
  valor: { tam: 36, peso: 600 },
} satisfies Record<string, Fuente>;
const ALTO_RENGLON = (f: Fuente) => Math.round(f.tam * 1.3);
const FOTO = 132;
const LOGO = 128;

export interface OpcionesPlan {
  /** El logo cargó (si no, el encabezado va sin logo). */
  conLogo?: boolean;
  /** Fuentes de miniaturas que sí cargaron; las demás van con la inicial. */
  fotosOk?: ReadonlySet<string>;
}

/** Disposición completa; recorta productos si la imagen pasaría `ALTO_MAXIMO`. */
export function planificarImagenPedido(
  datos: DatosImagenPedido,
  medir: Medir,
  opciones: OpcionesPlan = {},
): PlanImagen {
  let mostrar = datos.lineas.length;
  let plan = planificarCon(datos, medir, opciones, mostrar);
  while (plan.alto > ALTO_MAXIMO && mostrar > 1) {
    const exceso = plan.alto - ALTO_MAXIMO;
    mostrar = Math.max(1, mostrar - Math.max(1, Math.ceil(exceso / (FOTO + 40))));
    plan = planificarCon(datos, medir, opciones, mostrar);
  }
  return plan;
}

function planificarCon(
  datos: DatosImagenPedido,
  medir: Medir,
  { conLogo = false, fotosOk }: OpcionesPlan,
  mostrar: number,
): PlanImagen {
  const ops: OpDibujo[] = [];
  const texto = (x: number, y: number, t: string, fuente: Fuente, color: string, alinear?: "left" | "right" | "center") =>
    ops.push({ t: "texto", x, y, texto: t, fuente, color, alinear });
  const cortar = (t: string, ancho: number, f: Fuente, max?: number) =>
    cortarLineas(t, ancho, (s) => medir(s, f), max);

  // 1. Encabezado del negocio sobre su color.
  const acento = datos.negocio.colorAcento;
  const sobreAcento = textoSobre(acento);
  const xNombre = conLogo ? M + LOGO + 32 : M;
  const lineasNegocio = cortar(datos.negocio.nombre || "Pedido", ANCHO_IMAGEN - M - xNombre, F.negocio, 2);
  const altoTextoCab = lineasNegocio.length * ALTO_RENGLON(F.negocio) + 8 + ALTO_RENGLON(F.subtitulo);
  const altoCab = Math.max(conLogo ? LOGO : 0, altoTextoCab) + 2 * 48;
  ops.push({ t: "rect", x: 0, y: 0, w: ANCHO_IMAGEN, h: altoCab, color: acento });
  if (conLogo && datos.negocio.logo) {
    ops.push({ t: "imagen", x: M, y: (altoCab - LOGO) / 2, w: LOGO, h: LOGO, src: datos.negocio.logo, inicial: inicialDe(datos.negocio.nombre), radio: 24 });
  }
  let y = (altoCab - altoTextoCab) / 2;
  for (const l of lineasNegocio) {
    texto(xNombre, y, l, F.negocio, sobreAcento);
    y += ALTO_RENGLON(F.negocio);
  }
  texto(xNombre, y + 8, "Nuevo pedido", F.subtitulo, sobreAcento);
  y = altoCab + 40;

  // 2. Fecha + cuántos productos.
  const unidades = datos.lineas.reduce((s, l) => s + Math.max(0, l.cantidad), 0);
  texto(M, y, fechaPedidoLima(datos.fecha ?? new Date()), F.fecha, COLORES.gris);
  texto(ANCHO_IMAGEN - M, y, `${unidades} ${unidades === 1 ? "producto" : "productos"}`, F.fecha, COLORES.gris, "right");
  y += ALTO_RENGLON(F.fecha) + 28;
  ops.push({ t: "rect", x: M, y, w: CW, h: 2, color: COLORES.linea });
  y += 32;

  // 3. Productos.
  for (const linea of datos.lineas.slice(0, mostrar)) {
    y = planificarLinea(linea, y, ops, medir, fotosOk) + 28;
    ops.push({ t: "rect", x: M, y, w: CW, h: 2, color: COLORES.linea });
    y += 32;
  }
  const omitidas = datos.lineas.length - mostrar;
  if (omitidas > 0) {
    texto(M, y, `y ${omitidas} ${omitidas === 1 ? "producto más" : "productos más"} (van en el mensaje)`, F.detalle, COLORES.gris);
    y += ALTO_RENGLON(F.detalle) + 32;
  }

  // 4. Total grande.
  const altoTotal = ALTO_RENGLON(F.total) + 2 * 32;
  ops.push({ t: "rect", x: M, y, w: CW, h: altoTotal, color: COLORES.caja, radio: 24 });
  const yEtiqueta = y + (altoTotal - ALTO_RENGLON(F.totalEtiqueta) - ALTO_RENGLON(F.detalle)) / 2;
  texto(M + 32, yEtiqueta, "Total", F.totalEtiqueta, COLORES.tinta);
  texto(M + 32, yEtiqueta + ALTO_RENGLON(F.totalEtiqueta), "lo confirma el negocio", F.detalle, COLORES.gris);
  texto(ANCHO_IMAGEN - M - 32, y + 32, formatoSoles(datos.total), F.total, COLORES.tinta, "right");
  y += altoTotal + 24;
  for (const nota of datos.notas ?? []) {
    for (const l of cortar(`• ${nota}`, CW, F.detalle, 2)) {
      texto(M, y, l, F.detalle, COLORES.gris);
      y += ALTO_RENGLON(F.detalle);
    }
  }
  y += 32;

  // 5. Datos del cliente.
  y = planificarCliente(datos.cliente, y, ops, medir);

  // 6. Pie.
  y += 36;
  ops.push({ t: "rect", x: M, y, w: CW, h: 2, color: COLORES.linea });
  y += 28;
  for (const l of cortar("Precios de la tienda en línea: el negocio te confirma el total y la entrega por WhatsApp.", CW, F.detalle, 3)) {
    texto(ANCHO_IMAGEN / 2, y, l, F.detalle, COLORES.gris, "center");
    y += ALTO_RENGLON(F.detalle);
  }
  y += 56;

  return { ancho: ANCHO_IMAGEN, alto: Math.ceil(y), ops, lineasOmitidas: omitidas };
}

function planificarLinea(
  linea: LineaImagenPedido,
  yInicio: number,
  ops: OpDibujo[],
  medir: Medir,
  fotosOk?: ReadonlySet<string>,
): number {
  const src = linea.imagen && fotosOk?.has(linea.imagen) ? linea.imagen : null;
  ops.push({ t: "imagen", x: M, y: yInicio, w: FOTO, h: FOTO, src, inicial: inicialDe(linea.nombre), radio: 20 });
  const subtotal = formatoSoles(linea.precio * linea.cantidad);
  const unitario = linea.cantidad > 1 ? `${formatoSoles(linea.precio)} c/u` : "";
  const anchoPrecio = Math.max(medir(subtotal, F.precio), unitario ? medir(unitario, F.detalle) : 0);
  const xTexto = M + FOTO + 28;
  const anchoTexto = ANCHO_IMAGEN - M - anchoPrecio - 24 - xTexto;
  let y = yInicio;
  for (const l of cortarLineas(`${linea.cantidad} × ${linea.nombre}`, anchoTexto, (s) => medir(s, F.producto), 3)) {
    ops.push({ t: "texto", x: xTexto, y, texto: l, fuente: F.producto, color: COLORES.tinta });
    y += ALTO_RENGLON(F.producto);
  }
  if (linea.codigo) {
    y += 4;
    for (const l of cortarLineas(`Cód. ${linea.codigo}`, anchoTexto, (s) => medir(s, F.detalle), 1)) {
      ops.push({ t: "texto", x: xTexto, y, texto: l, fuente: F.detalle, color: COLORES.gris });
      y += ALTO_RENGLON(F.detalle);
    }
  }
  if (linea.nota) {
    y += 4;
    for (const l of cortarLineas(linea.nota, anchoTexto, (s) => medir(s, F.nota), 2)) {
      ops.push({ t: "texto", x: xTexto, y, texto: l, fuente: F.nota, color: COLORES.gris });
      y += ALTO_RENGLON(F.nota);
    }
  }
  ops.push({ t: "texto", x: ANCHO_IMAGEN - M, y: yInicio, texto: subtotal, fuente: F.precio, color: COLORES.tinta, alinear: "right" });
  if (unitario) {
    ops.push({ t: "texto", x: ANCHO_IMAGEN - M, y: yInicio + ALTO_RENGLON(F.precio) + 4, texto: unitario, fuente: F.detalle, color: COLORES.gris, alinear: "right" });
  }
  return Math.max(yInicio + FOTO, y);
}

function planificarCliente(
  cliente: DatosImagenPedido["cliente"],
  yInicio: number,
  ops: OpDibujo[],
  medir: Medir,
): number {
  const filas: Array<[string, string]> = [["Nombre", cliente.nombre.trim() || "—"]];
  if (cliente.celular) filas.push(["Celular", formatearCelularPe(cliente.celular)]);
  if (cliente.entrega) filas.push(["Entrega", cliente.entrega]);
  if (cliente.ubicacion) {
    const u = cliente.ubicacion;
    filas.push(["Ubicación", `${u.enlaceMapa.replace(/^https?:\/\//, "")}${u.precision > 0 ? ` (±${Math.round(u.precision)} m)` : ""}`]);
  }
  if (cliente.pago) filas.push(["Pago", cliente.pago]);

  const ANCHO_ETIQUETA = 200;
  const xValor = M + 32 + ANCHO_ETIQUETA;
  const anchoValor = ANCHO_IMAGEN - M - 32 - xValor;
  const renglones = filas.map(([, v]) => cortarLineas(v, anchoValor, (s) => medir(s, F.valor), 4));
  const altoFilas = renglones.reduce((s, r) => s + Math.max(1, r.length) * ALTO_RENGLON(F.valor) + 16, 0);
  const alto = 32 + ALTO_RENGLON(F.seccion) + 20 + altoFilas + 16;
  ops.push({ t: "rect", x: M, y: yInicio, w: CW, h: alto, color: COLORES.caja, radio: 24 });
  let y = yInicio + 32;
  ops.push({ t: "texto", x: M + 32, y, texto: "Datos del cliente", fuente: F.seccion, color: COLORES.tinta });
  y += ALTO_RENGLON(F.seccion) + 20;
  filas.forEach(([etiqueta], i) => {
    ops.push({ t: "texto", x: M + 32, y: y + 3, texto: etiqueta, fuente: F.etiqueta, color: COLORES.gris });
    for (const l of renglones[i]) {
      ops.push({ t: "texto", x: xValor, y, texto: l, fuente: F.valor, color: COLORES.tinta });
      y += ALTO_RENGLON(F.valor);
    }
    if (renglones[i].length === 0) y += ALTO_RENGLON(F.valor);
    y += 16;
  });
  return yInicio + alto;
}
