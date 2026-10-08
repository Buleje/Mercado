import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCubicacionesDB } from "@/lib/db/forest-cubicaciones.db";
import { filtroMismaGuia } from "@/lib/db/guia-cubicacion.db";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { cubicarLineasComercial, cubicarPiezasComercial, piesDeMetros, pulgadasDeMetros } from "@/lib/forestal/cubicacion-comercial";
import {
  piezaComercialSchema,
  type CubicacionExistente,
  type EditarAserradaInput,
  type GuardarAserradaInput,
  type OrigenCubicacion,
  type PiezaComercialEntrada,
  type PrefillOrigenDespacho,
  type PrefillOrigenLoth,
  type PrefillTrozaGtf,
} from "@/lib/forestal/cubicacion-comercial-tipos";
import type { CubicacionTrozasDTO } from "@/lib/forestal/cubicacion-cuenta";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import {
  CubicacionTrozasError,
  aDTO,
  auditar,
  brutoSiCambio,
  comoErrorDeDescuento,
  crearConCodigo,
  despachoDelTenant,
  exigirContrato,
  exigirVolumenNeto,
  explicarNoEditable,
  invalidar,
  lothDelTenant,
  numeroDelLibroCtp,
  origenDeLaFila,
  resolverPersona,
  type ActorCubicacion,
} from "@/lib/db/forest-cubicacion-trozas.db";

/**
 * CubicacionComercialDB — la cubicación COMERCIAL (ADR-483, contrato K7):
 *
 *   - el prellenado de una GTF del Libro TH (trozas con sus 2 Ø pasados a
 *     pulgadas y pies) y de un despacho del Libro CTP (lo que dice el libro y
 *     las cubicaciones guardadas del Cubicador de madera);
 *   - el alta y la corrección de la de **madera aserrada** (uno por uno o
 *     rápida), con sus descuentos.
 *
 * La de trozas se guarda con `ForestCubicacionTrozasDB.guardar` (origen
 * `loth`); aplicar, anular y borrar son los de esa clase para todas: misma
 * tabla, misma plata, mismos frenos (una guía, una plata; un despacho, una
 * cubicación aplicada). `tenantId` 1er parámetro y en todo WHERE; el despacho,
 * la GTF y la persona se releen del MISMO negocio (refs. sin FK, ADR-426).
 */

interface ItemGtf {
  code?: string | null;
  codigoGuia?: string | null;
  species?: string | null;
  diamMayorM?: number | null;
  diamMenorM?: number | null;
  lengthM?: number | null;
  volumeM3?: number | null;
}

const positivo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fechaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** «1-0001, 2-0001 … 10-0001»: el orden en que se cuentan, no el del texto. */
const porCodigo = (a: PrefillTrozaGtf, b: PrefillTrozaGtf) =>
  a.codigo == null ? (b.codigo == null ? 0 : 1) : b.codigo == null ? -1 : a.codigo.localeCompare(b.codigo, "es", { numeric: true });

/** Las cubicaciones que ya se hicieron de ese origen o de esa guía (por `mismoNumeroGtf`, no por texto). */
async function existentesDe(
  tenantId: string,
  origen: OrigenCubicacion,
  ids: readonly string[],
  gtf: string | null,
): Promise<CubicacionExistente[]> {
  const filtro = gtf ? filtroMismaGuia(gtf) : null;
  const filas = await prisma.forestCubicacionTrozas.findMany({
    where: { tenantId, deletedAt: null, OR: [{ origen, origenId: { in: [...ids] } }, ...(filtro ? [{ gtfNumber: filtro }] : [])] },
    select: { id: true, codigo: true, estado: true, monto: true, personaNombre: true, gtfNumber: true, origen: true, origenId: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return filas
    .filter((f) => (f.origen === origen && f.origenId != null && ids.includes(f.origenId)) || (gtf != null && mismoNumeroGtf(f.gtfNumber, gtf)))
    .map((f) => ({
      id: f.id,
      codigo: f.codigo,
      estado: f.estado === "aplicada" || f.estado === "anulada" ? f.estado : "borrador",
      monto: f.monto == null ? null : Number(f.monto),
      personaNombre: f.personaNombre,
    }));
}

/** El nombre del destinatario de la GTF de salida (`gtfDatos`), o el destino del libro. */
function destinatarioDe(d: { gtfDatos: Prisma.JsonValue | null; destino: string | null }): string | null {
  const datos = d.gtfDatos && typeof d.gtfDatos === "object" && !Array.isArray(d.gtfDatos) ? (d.gtfDatos as { destinatario?: { nombre?: unknown } }) : null;
  const nombre = typeof datos?.destinatario?.nombre === "string" ? datos.destinatario.nombre.trim() : "";
  return nombre || d.destino?.trim() || null;
}

/**
 * Las piezas de una cubicación guardada del Cubicador de madera (KV), como
 * entrada del servidor: con `cubicacionRefId` se cobran ÉSTAS, nunca las que
 * mande el cuerpo. Una medida que no pasa el Zod = 422 con su número.
 */
function piezasDelRegistro(reg: CubicacionRegistro): PiezaComercialEntrada[] {
  if (!reg.piezas?.length) {
    throw new CubicacionTrozasError("CUBICACION_REF_NO_ENCONTRADA", `La cubicación «${reg.nombre}» no tiene piezas: elige otra.`);
  }
  return reg.piezas.map((p, i) => {
    const r = piezaComercialSchema.safeParse({
      especie: p.especie?.trim() || reg.especie?.trim() || "Sin especie",
      cantidad: p.cantidad, espesor: p.espesor, ancho: p.ancho, largo: p.largo,
      uEspesor: p.uEspesor, uAncho: p.uAncho, uLargo: p.uLargo,
    });
    if (!r.success) {
      throw new CubicacionTrozasError(
        "MEDIDA_FUERA_DE_RANGO",
        `La pieza ${i + 1} de «${reg.nombre}» tiene una medida que no sirve (${r.error.issues[0]?.message ?? "revísala"}): corrígela en el Cubicador de madera.`,
        { pieza: i + 1 },
      );
    }
    return r.data;
  });
}

type CuerpoAserrada = GuardarAserradaInput | EditarAserradaInput;

/** El origen de la aserrada: el despacho del negocio (su GTF de salida manda, no la del cuerpo) o libre. */
async function origenAserrada(tenantId: string, input: CuerpoAserrada): Promise<{ origen: OrigenCubicacion; origenId: string | null; gtfNumber: string | null }> {
  if (input.origen === "despacho") {
    const d = await despachoDelTenant(prisma, tenantId, input.origenId);
    return { origen: "despacho", origenId: d.id, gtfNumber: d.gtfNumber?.trim() || null };
  }
  const texto = input.gtfNumber?.trim();
  /* Como una venta de ADR-478: la del Libro CTP si está (los frenos la ven igual), si no, como se escribió. */
  return { origen: "libre", origenId: null, gtfNumber: texto ? ((await numeroDelLibroCtp(tenantId, texto)) ?? texto) : null };
}

/** Las medidas congeladas de la aserrada, su bruto y su neto (el servidor re-cubica todo). */
async function medirAserrada(tenantId: string, input: CuerpoAserrada) {
  try {
    if (input.modo === "total") {
      const r = cubicarLineasComercial(input.lineas ?? [], input.descuentos);
      exigirVolumenNeto(r.neto);
      return { medidas: r.lineas as unknown[], nTrozas: Math.round(r.lineas.reduce((t, l) => t + (l.piezas ?? 0), 0)), bruto: r.bruto, neto: r.neto, cubicacionRefId: null };
    }
    let entrada = input.piezas ?? [];
    let cubicacionRefId: string | null = null;
    if (input.cubicacionRefId) {
      const reg = (await ForestCubicacionesDB.list(tenantId)).find((c) => c.id === input.cubicacionRefId);
      if (!reg) throw new CubicacionTrozasError("CUBICACION_REF_NO_ENCONTRADA", "Esa cubicación guardada ya no está en el Cubicador de madera: elige otra.");
      entrada = piezasDelRegistro(reg);
      cubicacionRefId = reg.id;
    }
    const r = cubicarPiezasComercial(entrada, input.descuentos);
    exigirVolumenNeto(r.neto);
    return { medidas: r.piezas as unknown[], nTrozas: Math.round(r.piezas.reduce((t, p) => t + p.cantidad, 0)), bruto: r.bruto, neto: r.neto, cubicacionRefId };
  } catch (err) {
    throw comoErrorDeDescuento(err);
  }
}

/** Lo que se escribe de la aserrada, igual en el alta y en la corrección. */
async function datosAserrada(tenantId: string, input: CuerpoAserrada) {
  const persona = await resolverPersona(prisma, tenantId, input);
  await exigirContrato(tenantId, input.contratoId);
  const origen = await origenAserrada(tenantId, input);
  const m = await medirAserrada(tenantId, input);
  return {
    fecha: new Date(`${input.fecha}T00:00:00.000Z`),
    formula: "tablar",
    /* Sin sentido en la aserrada: 2 evita el rótulo «medido con 1 Ø» (ADR-483 D2). */
    diametros: 2,
    beneficiarioId: persona.beneficiarioId,
    parteId: persona.parteId,
    personaNombre: persona.nombre,
    sentido: input.sentido,
    gtfNumber: origen.gtfNumber,
    contratoId: input.contratoId || null,
    material: "aserrada",
    modo: input.modo,
    origen: origen.origen,
    origenId: origen.origenId,
    cubicacionRefId: m.cubicacionRefId,
    descuentos: input.descuentos ? (input.descuentos as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    volumenBruto: brutoSiCambio(m.bruto, m.neto, "tablar"),
    trozas: m.medidas as unknown as Prisma.InputJsonValue,
    nTrozas: m.nTrozas,
    volumen: new Prisma.Decimal(m.neto.toFixed(4)),
    notas: input.notas || null,
  } satisfies Prisma.ForestCubicacionTrozasUncheckedUpdateManyInput;
}

export const CubicacionComercialDB = {
  /** (O) La GTF del Libro TH para cubicarla en Oxapampina: sus trozas con 2 Ø de la guía (la cinta manda). */
  async prefillLoth(tenantId: string, gtfId: string): Promise<PrefillOrigenLoth> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = await lothDelTenant(prisma, tenantId, gtfId);
    const items = Array.isArray(gtf.items) ? (gtf.items as unknown as ItemGtf[]) : [];
    const trozas: PrefillTrozaGtf[] = [];
    let sinMedidas = 0;
    for (const it of items) {
      const mayor = positivo(it.diamMayorM);
      const menor = positivo(it.diamMenorM);
      const largo = positivo(it.lengthM);
      if (mayor == null || menor == null || largo == null) {
        sinMedidas += 1;
        continue;
      }
      trozas.push({
        codigo: it.code?.trim() || it.codigoGuia?.trim() || null,
        especie: it.species?.trim() || "Sin especie",
        d1: pulgadasDeMetros(mayor),
        d2: pulgadasDeMetros(menor),
        largo: piesDeMetros(largo),
        m3Guia: positivo(it.volumeM3),
      });
    }
    return {
      tipo: "loth",
      gtfId: gtf.id,
      gtfNumber: gtf.gtfNumber,
      fecha: fechaIso(gtf.gtfDate),
      titular: gtf.titularName,
      tituloHabilitante: gtf.tituloHabilitante,
      smalianDeclaradoM3: gtf.volumenTotalM3 == null ? null : Number(gtf.volumenTotalM3),
      trozas: trozas.sort(porCodigo),
      sinMedidas,
      existentes: await existentesDe(tenantId, "loth", [gtf.id], gtf.gtfNumber),
    };
  },

  /**
   * (A) El despacho del Libro CTP: sus líneas con la misma GTF de salida (o
   * sólo él si no tiene guía), las cubicaciones guardadas del Cubicador de
   * madera (las ligadas a la guía o a las corridas del despacho primero) y el
   * valor de venta del libro (null si a alguna línea le falta: nunca 0).
   */
  async prefillDespacho(tenantId: string, despachoId: string): Promise<PrefillOrigenDespacho> {
    if (!tenantId) throw new Error("tenantId is required");
    const d = await despachoDelTenant(prisma, tenantId, despachoId);
    const gtf = d.gtfNumber?.trim() || null;
    const filtro = gtf ? filtroMismaGuia(gtf) : null;
    const hermanas = filtro
      ? (
          await prisma.forestCtpEntry.findMany({
            where: { tenantId, section: "despacho", deletedAt: null, status: { not: "anulado" }, gtfNumber: filtro },
            select: { id: true, gtfNumber: true, speciesCommon: true, quantity: true, unit: true, pieces: true, valorVenta: true },
            orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
            take: 200,
          })
        ).filter((h) => mismoNumeroGtf(h.gtfNumber, gtf))
      : [];
    const filas = hermanas.some((h) => h.id === d.id) ? hermanas : [d, ...hermanas];
    const ids = filas.map((f) => f.id);

    const corridas = await prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId, despachoEntryId: { in: ids } },
      select: { produccionEntryId: true },
      take: 500,
    });
    const deCorridas = new Set(corridas.map((c) => c.produccionEntryId));
    const ligada = (c: CubicacionRegistro) =>
      (gtf != null && c.gtfNumber != null && mismoNumeroGtf(c.gtfNumber, gtf)) ||
      [...(c.ctpEntryIds ?? []), ...(c.ctpEntryId ? [c.ctpEntryId] : [])].some((id) => deCorridas.has(id));
    const guardadas = (await ForestCubicacionesDB.list(tenantId))
      .map((c) => ({ id: c.id, nombre: c.nombre, fecha: c.fecha, pt: c.totales.pieTablar, piezas: c.totales.piezas, ligada: ligada(c) }))
      .sort((a, b) => Number(b.ligada) - Number(a.ligada))
      .slice(0, 60);

    const conValor = filas.every((f) => f.valorVenta != null);
    return {
      tipo: "despacho",
      despachoId: d.id,
      gtfNumber: gtf,
      fecha: d.entryDate.toISOString().slice(0, 10),
      destinatario: destinatarioDe(d),
      lineas: filas.map((f) => ({
        id: f.id,
        especie: f.speciesCommon?.trim() || "Sin especie",
        /* Lo que dice el LIBRO, en su unidad: el servidor no convierte m³ ↔ PT. */
        m3: f.unit === "m3" && f.quantity != null ? Number(f.quantity) : null,
        piezas: f.pieces,
        ptLibro: f.unit === "pt" && f.quantity != null ? Number(f.quantity) : null,
      })),
      guardadas,
      valorVentaLibro: conValor ? r2(filas.reduce((t, f) => t + Number(f.valorVenta), 0)) : null,
      existentes: await existentesDe(tenantId, "despacho", ids, gtf),
    };
  },

  /** (A) Alta de la aserrada: re-cubica (o copia las piezas del Cubicador de madera), descuenta y numera CUB. */
  async guardarAserrada(tenantId: string, input: GuardarAserradaInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const datos = await datosAserrada(tenantId, input);
    const row = await crearConCodigo(tenantId, input.fecha, { ...datos, createdBy: actor.usuario || "unknown" });
    invalidar(tenantId);
    auditCtp(auditar("ctp_cubicacion_trozas_guardar", tenantId, row, actor, `borrador nuevo · ${input.modo === "total" ? "rápida" : "uno por uno"}`));
    return aDTO(row);
  },

  /** Corrige un BORRADOR de aserrada con la versión que se leyó; una de trozas → 409 `MATERIAL_DISTINTO`. */
  async editarAserrada(tenantId: string, id: string, input: EditarAserradaInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    /* La de un despacho no se suelta como «libre» (quedaría sin frenos): 409 `ORIGEN_DISTINTO`. */
    await origenDeLaFila(tenantId, id, "despacho", input);
    const datos = await datosAserrada(tenantId, input);
    const res = await prisma.forestCubicacionTrozas.updateMany({
      where: { id, tenantId, estado: "borrador", version: input.version, deletedAt: null, material: "aserrada" },
      data: { ...datos, version: { increment: 1 } },
    });
    if (res.count === 0) await explicarNoEditable(tenantId, id, "aserrada");
    const row = await prisma.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
    invalidar(tenantId);
    auditCtp(auditar("ctp_cubicacion_trozas_guardar", tenantId, row, actor, `corregida (versión ${row.version})`));
    return aDTO(row);
  },
};
