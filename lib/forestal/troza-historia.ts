/**
 * troza-historia — la vida de UNA troza con las fechas que el Libro ya guarda
 * (ADR-465). PURO y client-safe: la consulta la arma `ForestTrozaHistoriaDB` y
 * esto sólo ordena los hechos.
 *
 * Regla del ADR: **no se inventan estaciones**. Cada evento sale de una columna
 * que alguien escribió al hacer la operación del libro — recepción, apartado
 * en un mixto, lote de aserrío, corrida, retrozado, despacho—. Donde el libro
 * no guarda la fecha propia de la pieza se usa la del documento que la contiene
 * y el `detalle` lo dice («fecha de apertura del lote»): un derivado nunca se
 * presenta como el dato.
 *
 * Lo que está ANULADO no es historia viva: una corrida anulada devolvió la
 * madera al patio (mismo criterio que `trozasComoConsumibles`), así que no se
 * cuenta como consumo.
 */

import type { EventoTroza } from "./planta-zona-types";

type Fecha = Date | string | null | undefined;

/** Lo que la consulta trae de una troza, ya aplanado (sin tipos de Prisma). */
export interface FilaHistoriaTroza {
  id: string;
  codigo: string | null;
  fechaRecepcion: Fecha;
  noRecepcionada: boolean;
  reservadaMixtoEn: Fecha;
  fechaConsumo: Fecha;
  fechaDespacho: Fecha;
  fechaRetrozo: Fecha;
  descarte: boolean;
  guia: { numero: string; entryDate: Fecha; fechaRecepcion: Fecha; status: string };
  /** De qué troza se cortó (retrozado). */
  madre: { codigo: string | null } | null;
  /** Los pedazos en que se cortó esta, si es madre. */
  pedazos: { codigo: string | null; fechaRetrozo: Fecha; descarte: boolean }[];
  loteAserrio: {
    code: string;
    fechaApertura: Fecha;
    status: string;
    deletedAt: Fecha;
    mixto: { code: string; repartidoEn: Fecha } | null;
  } | null;
  loteMixto: { code: string; abiertoEn: Fecha; repartidoEn: Fecha; status: string; deletedAt: Fecha } | null;
  /** La corrida que se la comió, con lo que pasó DESPUÉS con su producto. */
  corrida: {
    lineNo: number;
    entryDate: Fecha;
    productType: string | null;
    vigente: boolean;
    apartados: { creadoAt: Fecha; para: string; paquete: string | null; liberadoAt: Fecha }[];
    despachos: { lineNo: number; entryDate: Fecha; gtfNumber: string | null; vigente: boolean }[];
  } | null;
  /** El despacho que se la llevó ENTERA, sin aserrar (ADR-363). */
  despacho: { lineNo: number; entryDate: Fecha; gtfNumber: string | null; destino: string | null; vigente: boolean } | null;
}

/** ISO de una fecha de la base (Date o string); `null` si no hay o no se entiende. */
export function iso(f: Fecha): string | null {
  if (f == null) return null;
  const d = f instanceof Date ? f : new Date(f);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fecha corta para el `detalle` (día UTC: las date-only del libro corren un día en Lima). */
const dia = (f: Fecha): string => {
  const s = iso(f);
  return s ? new Date(s).toLocaleDateString("es-PE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
};

/** Orden del flujo para eventos del MISMO instante (recepción antes que lote, etc.). */
const ORDEN: Record<EventoTroza["tipo"], number> = {
  recepcion: 0,
  lote_mixto: 1,
  lote: 2,
  retrozado: 3,
  descarte: 4,
  consumo: 5,
  apartado: 6,
  despacho: 7,
};

/** Tope de eventos derivados de la corrida (apartados y despachos de su producto). */
const MAX_DERIVADOS = 10;

export function armarHistoriaTroza(t: FilaHistoriaTroza): EventoTroza[] {
  const ev: EventoTroza[] = [];
  const push = (tipo: EventoTroza["tipo"], f: Fecha, ref: string | null, detalle: string | null) => {
    const fecha = iso(f);
    if (fecha) ev.push({ tipo, fecha, ref, detalle });
  };
  const guia = t.guia.numero?.trim() || null;

  // ── Recepción ─────────────────────────────────────────────────────────
  const muerta =
    t.guia.status === "anulado" ? " · la guía está anulada" : t.guia.status === "rechazado" ? " · la guía está rechazada" : "";
  if (t.noRecepcionada) {
    push("recepcion", t.guia.entryDate, guia, `La guía la declara, pero no llegó al patio (fecha del asiento de la guía)${muerta}`);
  } else {
    const propia = iso(t.fechaRecepcion);
    const deGuia = iso(t.guia.fechaRecepcion);
    if (propia) push("recepcion", propia, guia, `Bajó del camión${muerta}`);
    else if (deGuia) push("recepcion", deGuia, guia, `Recepción de su guía${muerta}`);
    else push("recepcion", t.guia.entryDate, guia, `Guía asentada, todavía sin recepcionar (fecha del asiento)${muerta}`);
  }

  // ── Lote mixto (apartada en la pila escaneada, ADR-441) ───────────────
  const mixto = t.loteMixto && !t.loteMixto.deletedAt ? t.loteMixto : null;
  const mixtoDelLote = t.loteAserrio?.mixto ?? null;
  const codMixto = mixto?.code ?? mixtoDelLote?.code ?? null;
  if (codMixto) {
    const repartido = mixto?.repartidoEn ?? mixtoDelLote?.repartidoEn ?? null;
    const sufijo = repartido ? ` · repartido el ${dia(repartido)}` : "";
    const anulado = mixto?.status === "anulado" ? " · el mixto se anuló y la troza volvió al patio" : "";
    if (iso(t.reservadaMixtoEn)) push("lote_mixto", t.reservadaMixtoEn, codMixto, `Apartada en el lote mixto${sufijo}${anulado}`);
    else if (mixto) push("lote_mixto", mixto.abiertoEn, codMixto, `En el lote mixto (fecha de apertura del mixto)${sufijo}${anulado}`);
  }

  // ── Lote de aserrío ───────────────────────────────────────────────────
  const lote = t.loteAserrio && !t.loteAserrio.deletedAt ? t.loteAserrio : null;
  if (lote) {
    if (lote.mixto && iso(lote.mixto.repartidoEn)) {
      push("lote", lote.mixto.repartidoEn, lote.code, `Entró al lote de aserrío al repartir el mixto ${lote.mixto.code}`);
    } else {
      push("lote", lote.fechaApertura, lote.code, "En el lote de aserrío (fecha de apertura del lote)");
    }
  }

  // ── Retrozado y descarte (ADR-313) ────────────────────────────────────
  if (t.madre) {
    push("retrozado", t.fechaRetrozo, t.madre.codigo, `Se cortó de la troza ${t.madre.codigo ?? "sin código"}`);
  }
  if (t.pedazos.length > 0) {
    const fechas = t.pedazos.map((p) => iso(p.fechaRetrozo)).filter((f): f is string => !!f).sort();
    const cods = t.pedazos.map((p) => p.codigo ?? "s/c");
    const nombres = cods.slice(0, 6).join(", ") + (cods.length > 6 ? ` y ${cods.length - 6} más` : "");
    push("retrozado", fechas[0] ?? null, null, `Se cortó en ${t.pedazos.length} pedazo(s): ${nombres}`);
  }
  if (t.descarte) push("descarte", t.fechaRetrozo, t.madre?.codigo ?? null, "Pedazo de descarte del retrozado: no es producto");

  // ── Consumo (la corrida que se la comió) ──────────────────────────────
  const c = t.corrida && t.corrida.vigente ? t.corrida : null;
  if (c) {
    const ref = `Corrida N° ${c.lineNo}`;
    if (iso(t.fechaConsumo)) push("consumo", t.fechaConsumo, ref, c.productType ? `Entró a la sierra · ${c.productType}` : "Entró a la sierra");
    else push("consumo", c.entryDate, ref, "Entró a la sierra (fecha de la corrida)");

    // Lo que pasó con el PRODUCTO de esa corrida: es de la corrida, no sólo de
    // esta pieza, y así se rotula.
    for (const a of c.apartados.slice(0, MAX_DERIVADOS)) {
      const que = a.paquete ? `el paquete ${a.paquete}` : "el producto";
      const lib = a.liberadoAt ? ` · liberado el ${dia(a.liberadoAt)}` : "";
      push("apartado", a.creadoAt, a.para, `Se apartó ${que} de su corrida N° ${c.lineNo} para ${a.para}${lib}`);
    }
    for (const d of c.despachos.filter((x) => x.vigente).slice(0, MAX_DERIVADOS)) {
      push("despacho", d.entryDate, d.gtfNumber ?? `Despacho N° ${d.lineNo}`, `Salió producto de su corrida N° ${c.lineNo}`);
    }
  }

  // ── Despacho entero (sin aserrar, ADR-363) ────────────────────────────
  const d = t.despacho && t.despacho.vigente ? t.despacho : null;
  if (d) {
    const ref = d.gtfNumber ?? `Despacho N° ${d.lineNo}`;
    const fecha = iso(t.fechaDespacho) ? t.fechaDespacho : d.entryDate;
    push("despacho", fecha, ref, `Salió entera, sin aserrar${d.destino ? ` · ${d.destino}` : ""}`);
  }

  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN[a.tipo] - ORDEN[b.tipo]);
}
