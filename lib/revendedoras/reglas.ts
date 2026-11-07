/**
 * Revendedoras (ADR-507): las reglas puras del módulo, para cualquier negocio.
 *
 * Una revendedora es una clienta con `Customer.listaPrecio = "revendedora"`
 * que compra con descuento sobre el precio único del catálogo y revende a ese
 * precio. Las reglas son del negocio (`featureFlagsJson.revendedoras`); sin
 * nada guardado valen las del manual de Musa (§11) con el módulo apagado.
 *
 * Todo en céntimos al sumar. Puro y client-safe: el servidor cobra con esto y
 * la pantalla sólo muestra lo que el servidor devolvió.
 */
import { z } from "zod";

export const CLAVE_REVENDEDORAS = "revendedoras";
/** `featureFlagsJson.revendedorasAltas[customerId] = "AAAA-MM-DD"`: desde cuándo es revendedora. */
export const CLAVE_ALTAS_REVENDEDORAS = "revendedorasAltas";
/** El valor de `Customer.listaPrecio` que la hace revendedora. */
export const LISTA_REVENDEDORA = "revendedora";
/** Quienes ven y cambian el módulo: dueño, admin y encargado. */
export const ROLES_REVENDEDORAS = ["admin", "owner", "manager"] as const;

export interface NivelRevendedora {
  /** Compras del mes (lo que pagó) desde las que rige, en S/. */
  desde: number;
  /** % sobre el precio del catálogo. */
  descuento: number;
}

export interface ConfigRevendedoras {
  activo: boolean;
  niveles: NivelRevendedora[];
  /** S/ por pedido (lo que paga ella); 0 = sin mínimo. */
  pedidoMinimo: number;
  /** S/ desde los que el envío es gratis; null = siempre lo paga ella. */
  envioGratisDesde: number | null;
  /** % de ganancia sobre el precio de venta que ningún descuento rompe. */
  margenMinimo: number;
  /** Categorías que ya son oferta: los descuentos no se suman. */
  categoriasSinDescuento: string[];
  /** Meses sin fiado desde que entra. */
  mesesSinCredito: number;
  /** Cuántas revendedoras activas (con compra en el mes) se buscan. */
  metaActivas: number;
}

const Soles = z.number().finite().min(0, "No puede ser negativo.").max(1_000_000, "Demasiado alto.");
const Pct = z.number().finite().min(0, "No puede ser negativo.").max(90, "Hasta 90 %.");

export const NivelRevendedoraSchema = z.object({ desde: Soles, descuento: Pct });

export const ConfigRevendedorasSchema = z
  .object({
    activo: z.boolean(),
    niveles: z.array(NivelRevendedoraSchema).min(1, "Pon al menos un nivel.").max(4, "Hasta 4 niveles."),
    pedidoMinimo: Soles,
    envioGratisDesde: Soles.nullable(),
    margenMinimo: Pct,
    categoriasSinDescuento: z.array(z.string().trim().min(1).max(60)).max(30),
    mesesSinCredito: z.number().int().min(0).max(24),
    metaActivas: z.number().int().min(0).max(1000),
  })
  .superRefine((c, ctx) => {
    if (c.niveles[0] && c.niveles[0].desde !== 0) {
      ctx.addIssue({ code: "custom", path: ["niveles", 0, "desde"], message: "El primer nivel empieza en S/ 0." });
    }
    for (let i = 1; i < c.niveles.length; i++) {
      const antes = c.niveles[i - 1]!;
      const este = c.niveles[i]!;
      if (este.desde <= antes.desde) {
        ctx.addIssue({ code: "custom", path: ["niveles", i, "desde"], message: "Cada nivel empieza en más compras que el anterior." });
      }
      if (este.descuento < antes.descuento) {
        ctx.addIssue({ code: "custom", path: ["niveles", i, "descuento"], message: "Un nivel más alto no puede dar menos descuento." });
      }
    }
  });

/** Los números del manual de Musa (§10 y §11), apagados: cada negocio los prende y ajusta. */
export const CONFIG_REVENDEDORAS_POR_DEFECTO: Readonly<ConfigRevendedoras> = Object.freeze({
  activo: false,
  niveles: [
    { desde: 0, descuento: 20 },
    { desde: 600, descuento: 25 },
  ],
  pedidoMinimo: 150,
  envioGratisDesde: 300,
  margenMinimo: 30,
  categoriasSinDescuento: [],
  mesesSinCredito: 3,
  metaActivas: 8,
});

export function configPorDefecto(): ConfigRevendedoras {
  const d = CONFIG_REVENDEDORAS_POR_DEFECTO;
  return { ...d, niveles: d.niveles.map((n) => ({ ...n })), categoriasSinDescuento: [...d.categoriasSinDescuento] };
}

/** Lo guardado en los flags del negocio; si falta o no pasa la validación, los de fábrica. */
export function leerConfigRevendedoras(flags: Record<string, unknown> | null | undefined): ConfigRevendedoras {
  const r = ConfigRevendedorasSchema.safeParse(flags?.[CLAVE_REVENDEDORAS]);
  return r.success ? r.data : configPorDefecto();
}

/** `{ customerId: "AAAA-MM-DD" }`; lo que no es fecha se ignora. */
export function leerAltas(flags: Record<string, unknown> | null | undefined): Record<string, string> {
  const crudo = flags?.[CLAVE_ALTAS_REVENDEDORAS];
  if (!crudo || typeof crudo !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[id] = v;
  }
  return out;
}

// ── Plata ────────────────────────────────────────────────────────────────

const aCentimos = (soles: number) => Math.round(soles * 100);
const aSoles = (centimos: number) => centimos / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;

// ── Nivel ────────────────────────────────────────────────────────────────

export interface NivelAlcanzado {
  indice: number;
  descuento: number;
  desde: number;
  /** El nivel que sigue y cuánto le falta comprar este mes; null = ya está en el último. */
  siguiente: { desde: number; descuento: number; falta: number } | null;
}

/** El nivel que da lo comprado en el mes («desde» = desde ese monto, inclusive). */
export function nivelPorCompras(config: ConfigRevendedoras, compradoEnElMes: number): NivelAlcanzado {
  const comprado = aCentimos(Math.max(0, compradoEnElMes));
  let indice = 0;
  config.niveles.forEach((n, i) => {
    if (comprado >= aCentimos(n.desde)) indice = i;
  });
  const n = config.niveles[indice] ?? { desde: 0, descuento: 0 };
  const sig = config.niveles[indice + 1];
  return {
    indice,
    descuento: n.descuento,
    desde: n.desde,
    siguiente: sig ? { desde: sig.desde, descuento: sig.descuento, falta: aSoles(aCentimos(sig.desde) - comprado) } : null,
  };
}

// ── Precio de una unidad ─────────────────────────────────────────────────

export type MotivoPrecio =
  /** Categoría de ofertas: los descuentos no se suman. */
  | "oferta"
  /** El descuento rompía la ganancia mínima: se cobra el piso. */
  | "margen"
  /** Ni el precio del catálogo deja la ganancia mínima: se cobra el catálogo. */
  | "catalogo-bajo-margen";

export interface PrecioRevendedora {
  /** Lo que paga ella por unidad. */
  precio: number;
  /** % que de verdad se descontó (menos que el del nivel si se topó). */
  descuento: number;
  motivo: MotivoPrecio | null;
  /** Sin costo anotado: no se pudo revisar la ganancia. */
  sinCosto: boolean;
  /** (precio − costo) / precio en %; null sin costo. */
  margen: number | null;
}

export function esCategoriaSinDescuento(config: ConfigRevendedoras, categoria: string | null | undefined): boolean {
  const c = (categoria ?? "").trim().toLocaleLowerCase("es");
  return c !== "" && config.categoriasSinDescuento.some((x) => x.trim().toLocaleLowerCase("es") === c);
}

/** El piso de la ganancia mínima: el menor precio que deja `margenMinimo` % (al céntimo, hacia arriba). */
export function pisoPorMargen(costo: number, margenMinimo: number): number {
  if (margenMinimo <= 0) return 0;
  return aSoles(Math.ceil((aCentimos(costo) * 100) / (100 - margenMinimo) - 1e-9));
}

export function precioRevendedora(p: {
  precioCatalogo: number;
  costo: number | null;
  descuento: number;
  margenMinimo: number;
  esOferta: boolean;
}): PrecioRevendedora {
  const catalogo = aCentimos(p.precioCatalogo);
  const costo = p.costo != null && p.costo > 0 ? aCentimos(p.costo) : null;
  let precio = p.esOferta ? catalogo : Math.round((catalogo * (100 - p.descuento)) / 100);
  let motivo: MotivoPrecio | null = p.esOferta ? "oferta" : null;

  if (costo != null && p.margenMinimo > 0) {
    const piso = aCentimos(pisoPorMargen(aSoles(costo), p.margenMinimo));
    if (precio < piso) {
      if (piso > catalogo) {
        precio = catalogo;
        motivo = "catalogo-bajo-margen";
      } else {
        precio = piso;
        motivo = motivo ?? "margen";
      }
    }
  }
  return {
    precio: aSoles(precio),
    descuento: catalogo > 0 ? redondear1(((catalogo - precio) / catalogo) * 100) : 0,
    motivo,
    sinCosto: costo == null,
    margen: costo != null && precio > 0 ? redondear1(((precio - costo) / precio) * 100) : null,
  };
}

// ── Pedido ───────────────────────────────────────────────────────────────

export interface LineaPedido {
  productId: number;
  nombre: string;
  categoria: string;
  precioCatalogo: number;
  costo: number | null;
  cantidad: number;
}

export interface LineaCotizada extends LineaPedido, PrecioRevendedora {
  subtotal: number;
  subtotalCatalogo: number;
}

export interface CotizacionRevendedora {
  /** El nivel con el que se cobra este pedido. */
  nivel: NivelAlcanzado;
  /** Este pedido la hizo pasar al nivel siguiente. */
  subeDeNivel: boolean;
  compradoEnElMes: number;
  lineas: LineaCotizada[];
  /** Lo que valdría a precio de catálogo (lo que ella cobra al revender). */
  catalogo: number;
  /** Lo que paga ella. */
  total: number;
  /** Lo que gana ella si revende todo al catálogo. */
  ellaGana: number;
  /** Lo que gana el negocio; null si falta el costo de algún producto. */
  ganancia: number | null;
  margen: number | null;
  pedidoMinimo: number;
  cumpleMinimo: boolean;
  faltaMinimo: number;
  envioGratis: boolean;
  /** null = este negocio no da envío gratis. */
  faltaEnvioGratis: number | null;
  avisos: string[];
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

function cotizarLineas(config: ConfigRevendedoras, lineas: LineaPedido[], descuento: number): LineaCotizada[] {
  return lineas.map((l) => {
    const p = precioRevendedora({
      precioCatalogo: l.precioCatalogo,
      costo: l.costo,
      descuento,
      margenMinimo: config.margenMinimo,
      esOferta: esCategoriaSinDescuento(config, l.categoria),
    });
    return {
      ...l,
      ...p,
      subtotal: aSoles(aCentimos(p.precio) * l.cantidad),
      subtotalCatalogo: aSoles(aCentimos(l.precioCatalogo) * l.cantidad),
    };
  });
}

const sumaCentimos = (xs: number[]) => xs.reduce((s, x) => s + aCentimos(x), 0);

/**
 * El pedido de una revendedora. El nivel se decide con lo comprado en el mes
 * MÁS este pedido contado al nivel que ya tenía: el pedido que la hace pasar
 * los S/ 600 ya sale al 25 % (y el cálculo no oscila al bajar el total).
 */
export function cotizarPedido(
  config: ConfigRevendedoras,
  entrada: { compradoEnElMes: number; lineas: LineaPedido[] },
): CotizacionRevendedora {
  const lineasVivas = entrada.lineas.filter((l) => l.cantidad > 0);
  const base = nivelPorCompras(config, entrada.compradoEnElMes);
  const alBase = cotizarLineas(config, lineasVivas, base.descuento);
  const conEste = nivelPorCompras(config, aSoles(aCentimos(entrada.compradoEnElMes) + sumaCentimos(alBase.map((l) => l.subtotal))));
  const subeDeNivel = conEste.indice > base.indice;
  const nivel = subeDeNivel ? conEste : base;
  const lineas = subeDeNivel ? cotizarLineas(config, lineasVivas, nivel.descuento) : alBase;

  const total = sumaCentimos(lineas.map((l) => l.subtotal));
  const catalogo = sumaCentimos(lineas.map((l) => l.subtotalCatalogo));
  const todasConCosto = lineas.length > 0 && lineas.every((l) => !l.sinCosto);
  const costoTotal = todasConCosto ? lineas.reduce((s, l) => s + aCentimos(l.costo ?? 0) * l.cantidad, 0) : null;
  const minimo = aCentimos(config.pedidoMinimo);
  const envio = config.envioGratisDesde == null ? null : aCentimos(config.envioGratisDesde);

  const avisos: string[] = [];
  for (const l of lineas) {
    if (l.motivo === "margen") {
      avisos.push(`${l.nombre}: se cobra ${soles(l.precio)} (${l.descuento} % de descuento) para no bajar del ${config.margenMinimo} % de ganancia.`);
    } else if (l.motivo === "catalogo-bajo-margen") {
      avisos.push(`${l.nombre}: el precio del catálogo ya deja menos de ${config.margenMinimo} % de ganancia; va sin descuento.`);
    } else if (l.motivo === "oferta") {
      avisos.push(`${l.nombre}: es oferta (${l.categoria}); los descuentos no se suman.`);
    }
    if (l.sinCosto) avisos.push(`${l.nombre}: sin costo anotado, no se pudo revisar la ganancia.`);
  }
  if (lineas.length > 0 && total < minimo) {
    avisos.push(`Le faltan ${soles(aSoles(minimo - total))} para el pedido mínimo de ${soles(config.pedidoMinimo)}.`);
  }

  return {
    nivel,
    subeDeNivel,
    compradoEnElMes: entrada.compradoEnElMes,
    lineas,
    catalogo: aSoles(catalogo),
    total: aSoles(total),
    ellaGana: aSoles(catalogo - total),
    ganancia: costoTotal == null ? null : aSoles(total - costoTotal),
    margen: costoTotal == null || total === 0 ? null : redondear1(((total - costoTotal) / total) * 100),
    pedidoMinimo: config.pedidoMinimo,
    cumpleMinimo: total >= minimo,
    faltaMinimo: aSoles(Math.max(0, minimo - total)),
    envioGratis: envio != null && lineas.length > 0 && total >= envio,
    faltaEnvioGratis: envio == null ? null : aSoles(Math.max(0, envio - total)),
    avisos,
  };
}

// ── Fechas (Lima, UTC−5 sin horario de verano) ───────────────────────────

const LIMA_MS = 5 * 3_600_000;

/** El mes calendario de Lima que contiene `ahora`, como rango UTC [desde, hasta). */
export function mesDeLima(ahora: Date = new Date()): { clave: string; desde: Date; hasta: Date } {
  const l = new Date(ahora.getTime() - LIMA_MS);
  const y = l.getUTCFullYear();
  const m = l.getUTCMonth();
  return {
    clave: `${y}-${String(m + 1).padStart(2, "0")}`,
    desde: new Date(Date.UTC(y, m, 1) + LIMA_MS),
    hasta: new Date(Date.UTC(y, m + 1, 1) + LIMA_MS),
  };
}

/** «2026-11-20» + 3 meses = «2027-02-20» (fin de mes recortado: 31-ene + 1 = 28-feb). */
export function sinCreditoHasta(alta: string, meses: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(alta);
  if (!m || meses <= 0) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]) - 1 + meses;
  const dia = Number(m[3]);
  const ultimo = new Date(Date.UTC(y, mes + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, mes, Math.min(dia, ultimo)));
  return d.toISOString().slice(0, 10);
}

// ── Lo que viaja a la pantalla ───────────────────────────────────────────

export interface RevendedoraFila {
  customerId: string;
  nombre: string;
  celular: string;
  pueblo: string;
  /** Lo que pagó este mes (ventas del POS + pedidos no cancelados). */
  compradoMes: number;
  comprasMes: number;
  ultimaCompra: string | null;
  nivel: NivelAlcanzado;
  alta: string | null;
  sinCreditoHasta: string | null;
}

export interface ResumenRevendedoras {
  mes: string;
  activas: number;
  total: number;
  meta: number;
  vendidoMes: number;
}

export interface ProductoPrecios {
  productId: number;
  nombre: string;
  codigo: string | null;
  categoria: string;
  precioCatalogo: number;
  costo: number | null;
  /** Precio por nivel, en el orden de `config.niveles`. */
  porNivel: PrecioRevendedora[];
}

/** La lista de precios por nivel de todos los productos (lo que la revendedora ve en su catálogo). */
export function preciosPorNivel(
  config: ConfigRevendedoras,
  productos: { productId: number; nombre: string; codigo: string | null; categoria: string; precioCatalogo: number; costo: number | null }[],
): ProductoPrecios[] {
  return productos.map((p) => ({
    ...p,
    porNivel: config.niveles.map((n) =>
      precioRevendedora({
        precioCatalogo: p.precioCatalogo,
        costo: p.costo,
        descuento: n.descuento,
        margenMinimo: config.margenMinimo,
        esOferta: esCategoriaSinDescuento(config, p.categoria),
      }),
    ),
  }));
}
