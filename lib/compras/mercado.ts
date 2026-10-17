/**
 * Precios del mercado (C38): lo que cobra la COMPETENCIA, anotado a mano.
 *
 * Es una REFERENCIA: sirve para ubicar tu precio de venta. No es una oferta de
 * un proveedor (eso va en Cotizaciones) ni lo que pagaste (sale de tus órdenes,
 * «Precio por producto»), y no cambia ningún precio ni costo del sistema.
 *
 * Cada precio guarda de dónde salió: fecha, fuente, moneda y quién lo vio. Un
 * precio sin fecha o de hace más de `DIAS_VIGENCIA_MERCADO` días se muestra,
 * pero no entra en las cuentas («¿soy más barato?», sugerencias): no se sabe
 * si sigue. Uno en otra moneda tampoco: tu precio está en soles.
 *
 * Los datos viven en el navegador o, si lo eliges, en el negocio para todo tu
 * equipo (`lib/db/compras-mercado.db.ts`). Las formas viejas del navegador
 * (precio suelto, sin origen) se leen igual: `normalizarMercado`.
 */
import { z } from "zod";

export const MONEDAS_MERCADO = ["PEN", "USD"] as const;
export type MonedaMercado = (typeof MONEDAS_MERCADO)[number];

export const FUENTES_MERCADO = [
  { value: "visita", label: "Lo vi en su tienda" },
  { value: "foto", label: "Foto, volante o lista" },
  { value: "web", label: "Web o redes" },
  { value: "llamada", label: "Llamada o WhatsApp" },
  { value: "cliente", label: "Me lo dijo un cliente" },
  { value: "otro", label: "Otro" },
] as const;
export type FuenteMercado = (typeof FUENTES_MERCADO)[number]["value"];
const VALORES_FUENTE = FUENTES_MERCADO.map((f) => f.value) as [FuenteMercado, ...FuenteMercado[]];

/** Pasado esto, el precio se muestra como viejo y no entra en las cuentas. */
export const DIAS_VIGENCIA_MERCADO = 30;

export interface PrecioVisto {
  precio: number;
  moneda: MonedaMercado;
  /** Día en que se vio (YYYY-MM-DD). `null` = anotado antes de que se guardara la fecha. */
  fecha: string | null;
  fuente: FuenteMercado;
  /** Quién lo vio (lo escribe la persona). */
  responsable?: string;
  /** Quién lo anotó en la lista compartida (lo pone el servidor). */
  registradoPor?: string;
  nota?: string;
}

export interface CompetidorMercado {
  id: string;
  name: string;
}

export interface ProductoMercado {
  productId: string;
  productName: string;
  /** Tu precio de VENTA, en soles. */
  myPrice: number;
  prices: Record<string, PrecioVisto | null>;
}

export interface DatosMercado {
  competitors: CompetidorMercado[];
  products: ProductoMercado[];
}

export const MERCADO_VACIO: DatosMercado = { competitors: [], products: [] };

const texto = (max: number) => z.string().trim().max(max);
const PrecioVistoSchema = z.object({
  precio: z.number().finite().nonnegative().max(1_000_000),
  moneda: z.enum(MONEDAS_MERCADO),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fuente: z.enum(VALORES_FUENTE),
  responsable: texto(80).optional(),
  registradoPor: texto(80).optional(),
  nota: texto(200).optional(),
});

/** Lo que acepta el servidor: topes para que una lista no crezca sin control. */
export const DatosMercadoSchema = z.object({
  competitors: z.array(z.object({ id: texto(60).min(1), name: texto(80).min(1) })).max(50),
  products: z
    .array(
      z.object({
        productId: texto(60).min(1),
        productName: texto(120).min(1),
        myPrice: z.number().finite().nonnegative().max(1_000_000),
        prices: z.record(z.string().max(60), PrecioVistoSchema.nullable()),
      }),
    )
    .max(500),
});

const esFuente = (v: unknown): v is FuenteMercado => typeof v === "string" && (VALORES_FUENTE as readonly string[]).includes(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

function precioDe(raw: unknown): PrecioVisto | null {
  // Forma vieja del navegador: el precio suelto, sin origen.
  const suelto = num(raw);
  if (suelto !== null) return { precio: suelto, moneda: "PEN", fecha: null, fuente: "otro" };
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const precio = num(r.precio);
  if (precio === null) return null;
  const fecha = typeof r.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null;
  return {
    precio,
    moneda: r.moneda === "USD" ? "USD" : "PEN",
    fecha,
    fuente: esFuente(r.fuente) ? r.fuente : "otro",
    ...(str(r.responsable, 80) ? { responsable: str(r.responsable, 80) } : {}),
    ...(str(r.registradoPor, 80) ? { registradoPor: str(r.registradoPor, 80) } : {}),
    ...(str(r.nota, 200) ? { nota: str(r.nota, 200) } : {}),
  };
}

/** Lee cualquier forma guardada (navegador viejo, servidor) sin romperse con basura. */
export function normalizarMercado(raw: unknown): DatosMercado {
  if (!raw || typeof raw !== "object") return { competitors: [], products: [] };
  const r = raw as Record<string, unknown>;
  const competitors: CompetidorMercado[] = Array.isArray(r.competitors)
    ? r.competitors.flatMap((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        const id = str(o.id, 60);
        const name = str(o.name, 80);
        return id && name ? [{ id, name }] : [];
      })
    : [];
  const ids = new Set(competitors.map((c) => c.id));
  const products: ProductoMercado[] = Array.isArray(r.products)
    ? r.products.flatMap((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const productId = str(o.productId, 60);
        const productName = str(o.productName, 120);
        if (!productId || !productName) return [];
        const prices: Record<string, PrecioVisto | null> = {};
        if (o.prices && typeof o.prices === "object") {
          for (const [k, v] of Object.entries(o.prices as Record<string, unknown>)) {
            if (ids.has(k)) prices[k] = precioDe(v);
          }
        }
        return [{ productId, productName, myPrice: num(o.myPrice) ?? 0, prices }];
      })
    : [];
  return { competitors, products };
}

/** Días entre dos fechas YYYY-MM-DD (aritmética en UTC: no se corre por la zona). */
function diasEntreClaves(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Días desde que se vio el precio; `null` si no tiene fecha. */
export function antiguedad(p: Pick<PrecioVisto, "fecha">, hoy: string): number | null {
  return p.fecha ? Math.max(0, diasEntreClaves(p.fecha, hoy)) : null;
}

/** ¿Entra en las cuentas? En soles, con fecha y de hace `DIAS_VIGENCIA_MERCADO` días o menos. */
export function precioVigente(p: PrecioVisto | null | undefined, hoy: string): p is PrecioVisto {
  if (!p || p.precio <= 0 || p.moneda !== "PEN") return false;
  const dias = antiguedad(p, hoy);
  return dias !== null && dias <= DIAS_VIGENCIA_MERCADO;
}

/** Cuánto más caro (+) o barato (−) está el competidor que tú, en %. `null` si no se puede comparar. */
export function diferenciaPct(miPrecio: number, suyo: number): number | null {
  if (miPrecio <= 0 || suyo <= 0) return null;
  return Math.round(((suyo - miPrecio) / miPrecio) * 100);
}

export interface ResumenMercado {
  /** Comparaciones vigentes (producto × competidor). */
  comparadas: number;
  /** En cuántas de ellas eres más barato. */
  masBarato: number;
  /** Precios anotados que no entran en las cuentas (viejos, sin fecha u otra moneda). */
  fueraDeCuenta: number;
  /** Donde más margen tienes para subir sin pasar al competidor más barato. */
  oportunidad: { producto: string; diferencia: number } | null;
}

export function resumirMercado(d: DatosMercado, hoy: string): ResumenMercado {
  let comparadas = 0;
  let masBarato = 0;
  let fueraDeCuenta = 0;
  let oportunidad: ResumenMercado["oportunidad"] = null;
  for (const p of d.products) {
    for (const c of d.competitors) {
      const visto = p.prices[c.id];
      if (!visto) continue;
      if (!precioVigente(visto, hoy)) { fueraDeCuenta++; continue; }
      if (p.myPrice <= 0) continue;
      comparadas++;
      if (p.myPrice < visto.precio) masBarato++;
    }
    // La oportunidad se mide contra el MÁS BARATO vigente: subir hasta ahí sigue siendo competitivo.
    const vigentes = d.competitors.map((c) => p.prices[c.id]).filter((v): v is PrecioVisto => precioVigente(v, hoy));
    if (p.myPrice > 0 && vigentes.length > 0) {
      const minimo = Math.min(...vigentes.map((v) => v.precio));
      const diferencia = Math.round((minimo - p.myPrice) * 100) / 100;
      if (diferencia > 0 && (!oportunidad || diferencia > oportunidad.diferencia)) oportunidad = { producto: p.productName, diferencia };
    }
  }
  return { comparadas, masBarato, fueraDeCuenta, oportunidad };
}

export interface SugerenciaMercado {
  productId: string;
  productName: string;
  myPrice: number;
  promedio: number;
  /** Cuántos precios vigentes entran en el promedio. */
  muestra: number;
  /** Tu precio − el promedio: + = estás más caro. */
  diferencia: number;
  estado: "caro" | "barato" | "alineado";
  /** 50 céntimos debajo del promedio (nunca negativo). */
  sugerido: number;
}

/** Por producto: tu precio frente al promedio VIGENTE de la competencia (±S/ 1 = alineado). */
export function sugerenciasMercado(d: DatosMercado, hoy: string): SugerenciaMercado[] {
  return d.products.flatMap((p) => {
    const vigentes = d.competitors.map((c) => p.prices[c.id]).filter((v): v is PrecioVisto => precioVigente(v, hoy));
    if (vigentes.length === 0 || p.myPrice <= 0) return [];
    const promedio = Math.round((vigentes.reduce((s, v) => s + v.precio, 0) / vigentes.length) * 100) / 100;
    const diferencia = Math.round((p.myPrice - promedio) * 100) / 100;
    return [{
      productId: p.productId,
      productName: p.productName,
      myPrice: p.myPrice,
      promedio,
      muestra: vigentes.length,
      diferencia,
      estado: diferencia > 1 ? "caro" : diferencia < -1 ? "barato" : "alineado",
      sugerido: Math.max(0, Math.round((promedio - 0.5) * 100) / 100),
    }];
  });
}

const llaveNombre = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** El más nuevo de dos precios vistos (sin fecha pierde contra con fecha). */
function masNuevo(a: PrecioVisto | null | undefined, b: PrecioVisto | null | undefined): PrecioVisto | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return (b.fecha ?? "") > (a.fecha ?? "") ? b : a;
}

/**
 * Junta la lista de este navegador con la del equipo al empezar a compartir:
 * competidores y productos por nombre (sin tildes ni mayúsculas), y en cada
 * casilla gana el precio visto más nuevo. Nada se pierde de ninguno de los dos.
 */
export function fusionarMercado(equipo: DatosMercado, local: DatosMercado): DatosMercado {
  const competitors = [...equipo.competitors];
  const idDeLocal = new Map<string, string>();
  for (const c of local.competitors) {
    const ya = competitors.find((e) => llaveNombre(e.name) === llaveNombre(c.name));
    if (ya) idDeLocal.set(c.id, ya.id);
    else {
      const id = competitors.some((e) => e.id === c.id) ? `${c.id}-l` : c.id;
      competitors.push({ id, name: c.name });
      idDeLocal.set(c.id, id);
    }
  }
  const products = equipo.products.map((p) => ({ ...p, prices: { ...p.prices } }));
  for (const lp of local.products) {
    let destino = products.find((p) => llaveNombre(p.productName) === llaveNombre(lp.productName));
    if (!destino) {
      const productId = products.some((p) => p.productId === lp.productId) ? `${lp.productId}-l` : lp.productId;
      destino = { productId, productName: lp.productName, myPrice: lp.myPrice, prices: {} };
      products.push(destino);
    } else if (destino.myPrice <= 0 && lp.myPrice > 0) {
      destino.myPrice = lp.myPrice;
    }
    for (const [cid, visto] of Object.entries(lp.prices)) {
      const id = idDeLocal.get(cid);
      if (!id) continue;
      destino.prices[id] = masNuevo(destino.prices[id], visto);
    }
  }
  return { competitors, products };
}

/**
 * Antes de guardar en el equipo: cada precio nuevo o cambiado (precio, moneda,
 * fecha o fuente distintos) queda firmado por quien lo anotó.
 */
export function firmarCambios(anterior: DatosMercado, nuevo: DatosMercado, usuario: string): DatosMercado {
  const previo = new Map(anterior.products.map((p) => [p.productId, p.prices]));
  return {
    competitors: nuevo.competitors,
    products: nuevo.products.map((p) => {
      const antes = previo.get(p.productId) ?? {};
      const prices: Record<string, PrecioVisto | null> = {};
      for (const [cid, v] of Object.entries(p.prices)) {
        const a = antes[cid];
        const igual = !!a && !!v && a.precio === v.precio && a.moneda === v.moneda && a.fecha === v.fecha && a.fuente === v.fuente;
        prices[cid] = v ? { ...v, registradoPor: igual ? a?.registradoPor ?? v.registradoPor : usuario } : null;
      }
      return { ...p, prices };
    }),
  };
}
