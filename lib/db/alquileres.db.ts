import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { limaDateKey } from "@/lib/utils";
import {
  type AlquilerParaCalculo,
  aCentimos,
  avisoMontoDelPago,
  deCentimos,
  formatoDia,
  formatoMonto,
  periodoEnPlazo,
  resumenAlquiler,
} from "@/lib/admin/alquileres-calculo";
import { tagEntidad } from "@/lib/documentos/enlaces-entidad";
import { CandadoDocumentosDB } from "@/lib/db/candado-documentos.db";
import type {
  AlquilerDto,
  AlquilerPagoDto,
  AlquilerPagoInput,
  Dia,
  EstadoAlquiler,
  MedioPagoAlquiler,
  Moneda,
  NuestroPapel,
} from "@/lib/admin/fichas-tramites-alquileres";

/**
 * AlquileresDB — alquileres de locales y sus pagos mes a mes (ADR-524).
 *
 * Es un REGISTRO: no mueve caja ni tesorería ni el P&L (el local de Drucila no
 * es plata del negocio). Toda la plata se lee y se escribe en céntimos
 * enteros; el resumen (atrasos, deuda, alertas) lo arma
 * `lib/admin/alquileres-calculo.ts` acá, nunca el cliente.
 *
 * Pagos: único `(alquilerId, periodo)`. Registrar dos veces el MISMO pago
 * (periodo + monto + día) = replay → `duplicado: true`; otro pago para un mes
 * ya pagado = `periodo_ya_pagado` (se corrige el que está, no se suma otro).
 *
 * `tenantId` SIEMPRE 1.º y en cada WHERE. Caché `alquileres:<tenantId>:`
 * (60 s, con el día de Lima en la clave: el resumen depende de «hoy»); cada
 * write invalida además las fuentes de la agenda.
 */

const TTL = 60;
const TOPE_LISTA = 300;

const prefijo = (tenantId: string) => `alquileres:${tenantId}:`;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

type FilaAlquiler = Prisma.AlquilerGetPayload<{ include: { pagos: true } }>;
type FilaPago = FilaAlquiler["pagos"][number];

/** Campos editables (null = vacío). Montos con hasta 2 decimales. */
export interface AlquilerCampos {
  nombre: string;
  direccion: string | null;
  partidaSunarp: string | null;
  manzana: string | null;
  lote: string | null;
  areaM2: number | null;
  ubigeo: string | null;
  duenoParteId: string | null;
  duenoTexto: string | null;
  inquilinoParteId: string | null;
  inquilinoTexto: string | null;
  nuestroPapel: NuestroPapel | null;
  rentaMensual: number;
  moneda: Moneda;
  incluyeImpuestos: boolean | null;
  diaPago: number | null;
  garantiaMonto: number | null;
  garantiaPagada: boolean | null;
  garantiaPagadaEl: Dia | null;
  garantiaDevueltaEl: Dia | null;
  inicioEl: Dia;
  finEl: Dia | null;
  renovacionAutomatica: boolean;
  avisoNoRenovarDias: number | null;
  reajuste: string | null;
  contratoDocumentId: string | null;
  cuentaBanco: string | null;
  cuentaCci: string | null;
  cuentaTitular: string | null;
  estado: EstadoAlquiler;
  notas: string | null;
}

export type AlquilerCrear = Partial<AlquilerCampos> & Pick<AlquilerCampos, "nombre" | "rentaMensual" | "inicioEl">;
/** Parcial: ausente = no se toca; `null` = se borra. */
export type AlquilerPatch = { [K in keyof AlquilerCampos]?: AlquilerCampos[K] };
export type PagoPatch = { [K in keyof AlquilerPagoInput]?: AlquilerPagoInput[K] };

type Falla<E extends string> = { ok: false; error: E; message: string };

export type ResultadoAlquiler = { ok: true; alquiler: AlquilerDto } | Falla<"not_found" | "invalid_body">;

export type ResultadoPago =
  /** `aviso`: el monto no es la renta (R2): «pagado en parte, falta S/ X» o el exceso. */
  | { ok: true; pago: AlquilerPagoDto; alquiler: AlquilerDto; duplicado: boolean; aviso?: string }
  | Falla<"not_found" | "periodo_fuera_de_plazo">
  | (Falla<"periodo_ya_pagado"> & { pago: AlquilerPagoDto });

export type ResultadoBorrar = { ok: true } | Falla<"not_found"> | (Falla<"tiene_pagos"> & { pagos: number });

const CAMPOS_DIA = ["garantiaPagadaEl", "garantiaDevueltaEl", "inicioEl", "finEl"] as const;
const CAMPOS_MONTO = ["rentaMensual", "garantiaMonto", "areaM2"] as const;

const aFecha = (d: Dia) => new Date(`${d}T00:00:00Z`);
const deFecha = (d: Date): Dia => d.toISOString().slice(0, 10);
const deFechaN = (d: Date | null): Dia | null => (d ? deFecha(d) : null);

/** Decimal de Prisma → céntimos enteros (Decimal(12,2): el string es exacto). */
const centimosDe = (d: Prisma.Decimal | null): number | null => (d == null ? null : aCentimos(Number(d.toString())));
const montoDe = (d: Prisma.Decimal | null): number | null => {
  const c = centimosDe(d);
  return c == null ? null : deCentimos(c);
};
/** Monto → string con 2 decimales para la columna Decimal (redondeado en el backend). */
const aDecimal = (m: number) => (aCentimos(m) / 100).toFixed(2);

function esP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function datosDe(patch: AlquilerPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if ((CAMPOS_DIA as readonly string[]).includes(k)) data[k] = typeof v === "string" ? aFecha(v) : null;
    else if ((CAMPOS_MONTO as readonly string[]).includes(k)) data[k] = typeof v === "number" ? aDecimal(v) : null;
    else data[k] = v;
  }
  return data;
}

function paraCalculo(f: FilaAlquiler | Omit<FilaAlquiler, "pagos">): AlquilerParaCalculo {
  return {
    rentaMensual: montoDe(f.rentaMensual) ?? 0,
    moneda: (f.moneda as Moneda) ?? "PEN",
    diaPago: f.diaPago,
    inicioEl: deFecha(f.inicioEl),
    finEl: deFechaN(f.finEl),
    estado: f.estado as EstadoAlquiler,
    renovacionAutomatica: f.renovacionAutomatica,
    avisoNoRenovarDias: f.avisoNoRenovarDias,
    garantiaMonto: montoDe(f.garantiaMonto),
    garantiaPagada: f.garantiaPagada,
    garantiaDevueltaEl: deFechaN(f.garantiaDevueltaEl),
  };
}

function aPago(p: FilaPago): AlquilerPagoDto {
  return {
    id: p.id,
    periodo: p.periodo,
    monto: montoDe(p.monto) ?? 0,
    pagadoEl: deFecha(p.pagadoEl),
    medio: p.medio as MedioPagoAlquiler,
    numeroOperacion: p.numeroOperacion,
    comprobanteDocumentId: p.comprobanteDocumentId,
    notas: p.notas,
    registradoPor: p.registradoPor,
    createdAt: p.createdAt.toISOString(),
  };
}

async function aDtos(tenantId: string, filas: FilaAlquiler[], hoy: Dia): Promise<AlquilerDto[]> {
  if (filas.length === 0) return [];
  const ids = [...new Set(filas.flatMap((f) => [f.duenoParteId, f.inquilinoParteId]).filter((x): x is string => !!x))];
  const partes = ids.length
    ? await prisma.forestParty.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nombre: true } })
    : [];
  const nombre = new Map(partes.map((p) => [p.id, p.nombre]));
  return filas.map((f) => {
    const pagos = [...f.pagos].sort((a, b) => a.periodo.localeCompare(b.periodo)).map(aPago);
    return {
      id: f.id,
      nombre: f.nombre,
      direccion: f.direccion,
      partidaSunarp: f.partidaSunarp,
      manzana: f.manzana,
      lote: f.lote,
      areaM2: montoDe(f.areaM2),
      ubigeo: f.ubigeo,
      duenoParteId: f.duenoParteId,
      duenoNombre: f.duenoParteId ? (nombre.get(f.duenoParteId) ?? null) : null,
      duenoTexto: f.duenoTexto,
      inquilinoParteId: f.inquilinoParteId,
      inquilinoNombre: f.inquilinoParteId ? (nombre.get(f.inquilinoParteId) ?? null) : null,
      inquilinoTexto: f.inquilinoTexto,
      nuestroPapel: (f.nuestroPapel as NuestroPapel | null) ?? null,
      rentaMensual: montoDe(f.rentaMensual) ?? 0,
      moneda: f.moneda as Moneda,
      incluyeImpuestos: f.incluyeImpuestos,
      diaPago: f.diaPago,
      garantiaMonto: montoDe(f.garantiaMonto),
      garantiaPagada: f.garantiaPagada,
      garantiaPagadaEl: deFechaN(f.garantiaPagadaEl),
      garantiaDevueltaEl: deFechaN(f.garantiaDevueltaEl),
      inicioEl: deFecha(f.inicioEl),
      finEl: deFechaN(f.finEl),
      renovacionAutomatica: f.renovacionAutomatica,
      avisoNoRenovarDias: f.avisoNoRenovarDias,
      reajuste: f.reajuste,
      contratoDocumentId: f.contratoDocumentId,
      cuentaBanco: f.cuentaBanco,
      cuentaCci: f.cuentaCci,
      cuentaTitular: f.cuentaTitular,
      estado: f.estado as EstadoAlquiler,
      notas: f.notas,
      pagos,
      resumen: resumenAlquiler(paraCalculo(f), pagos, hoy),
    };
  });
}

/** «renta: S/ 1,500.00 → S/ 1,600.00; finEl: 2027-10-31 → —» para la auditoría (antes/después). */
function cambios(antes: Record<string, unknown>, patch: Record<string, unknown>, moneda: Moneda): string {
  const partes: string[] = [];
  const texto = (k: string, v: unknown): string => {
    if (v == null) return "—";
    if (v instanceof Date) return deFecha(v);
    if ((CAMPOS_MONTO as readonly string[]).includes(k) && k !== "areaM2") {
      const c = typeof v === "number" ? aCentimos(v) : aCentimos(Number(String(v)));
      return formatoMonto(c, moneda);
    }
    return String(v);
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const a = texto(k, antes[k]);
    const d = texto(k, v);
    if (a !== d) partes.push(`${k}: ${a} → ${d}`);
  }
  return partes.join("; ");
}

/** El fin no puede quedar antes del inicio (con lo que ya hay + lo que llega). */
function plazoInvalido(inicioEl: Dia, finEl: Dia | null): string | null {
  return finEl && finEl < inicioEl ? `El contrato termina (${formatoDia(finEl)}) antes de empezar (${formatoDia(inicioEl)}).` : null;
}

/** R4: un alquiler terminado necesita su fecha de fin (sin ella, la deuda no sabe hasta dónde contar). */
export const MENSAJE_TERMINADO_SIN_FIN = "Para dar por terminado el alquiler, pon la fecha de fin.";
export function terminadoSinFin(estado: EstadoAlquiler | null | undefined, finEl: Dia | null | undefined): boolean {
  return estado === "terminado" && !finEl;
}

/** Contrato o comprobante enlazado: tag `alquiler:<id>` + candado de dueños si no tenía roles (S4/R6). */
function atarPapel(tenantId: string, alquilerId: string, documentId: string | null | undefined): Promise<unknown> {
  return documentId ? CandadoDocumentosDB.atar(tenantId, [documentId], tagEntidad("alquiler", alquilerId)) : Promise.resolve();
}

export const AlquileresDB = {
  async listar(tenantId: string, filtro: { estado?: EstadoAlquiler; duenoParteId?: string } = {}): Promise<AlquilerDto[]> {
    exigirTenant(tenantId);
    const hoy = limaDateKey();
    return getOrSet(`${prefijo(tenantId)}lista:${hoy}:${filtro.estado ?? ""}:${filtro.duenoParteId ?? ""}`, TTL, async () => {
      const filas = await prisma.alquiler.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(filtro.estado ? { estado: filtro.estado } : {}),
          ...(filtro.duenoParteId ? { duenoParteId: filtro.duenoParteId } : {}),
        },
        include: { pagos: true },
        orderBy: [{ estado: "desc" }, { nombre: "asc" }],
        take: TOPE_LISTA,
      });
      return aDtos(tenantId, filas, hoy);
    });
  },

  async obtener(tenantId: string, id: string): Promise<AlquilerDto | null> {
    exigirTenant(tenantId);
    const hoy = limaDateKey();
    const r = await getOrSet(`${prefijo(tenantId)}uno:${id}:${hoy}`, TTL, async () => {
      const fila = await prisma.alquiler.findFirst({ where: { tenantId, id, deletedAt: null }, include: { pagos: true } });
      return { v: fila ? ((await aDtos(tenantId, [fila], hoy))[0] ?? null) : null };
    });
    return r.v;
  },

  /** Fichas y documentos nombrados tienen que ser de ESTE negocio. */
  async verificarReferencias(
    tenantId: string,
    refs: { parteIds?: (string | null | undefined)[]; documentIds?: (string | null | undefined)[] },
  ): Promise<string | null> {
    exigirTenant(tenantId);
    const partes = [...new Set((refs.parteIds ?? []).filter((x): x is string => !!x))];
    if (partes.length) {
      const hay = await prisma.forestParty.findMany({ where: { tenantId, id: { in: partes } }, select: { id: true } });
      const falta = partes.find((p) => !hay.some((h) => h.id === p));
      if (falta) return `La ficha ${falta} no está en el directorio de este negocio.`;
    }
    const docs = [...new Set((refs.documentIds ?? []).filter((x): x is string => !!x))];
    if (docs.length) {
      const hay = await prisma.document.findMany({ where: { tenantId, id: { in: docs }, deletedAt: null }, select: { id: true } });
      const falta = docs.find((d) => !hay.some((h) => h.id === d));
      if (falta) return `El documento ${falta} no está en el Drive de este negocio.`;
    }
    return null;
  },

  async crear(tenantId: string, input: AlquilerCrear, user: string): Promise<ResultadoAlquiler> {
    exigirTenant(tenantId);
    const malPlazo = plazoInvalido(input.inicioEl, input.finEl ?? null);
    if (malPlazo) return { ok: false, error: "invalid_body", message: malPlazo };
    if (terminadoSinFin(input.estado, input.finEl)) return { ok: false, error: "invalid_body", message: MENSAJE_TERMINADO_SIN_FIN };
    const motivo = await this.verificarReferencias(tenantId, {
      parteIds: [input.duenoParteId, input.inquilinoParteId],
      documentIds: [input.contratoDocumentId],
    });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const fila = await prisma.alquiler.create({
      data: {
        ...(datosDe(input) as Prisma.AlquilerUncheckedCreateInput),
        nombre: input.nombre,
        rentaMensual: aDecimal(input.rentaMensual),
        inicioEl: aFecha(input.inicioEl),
        tenantId,
        creadoPor: user,
      },
      select: { id: true },
    });
    await atarPapel(tenantId, fila.id, input.contratoDocumentId);
    const moneda = input.moneda ?? "PEN";
    const garantia = input.garantiaMonto != null ? `, garantía ${formatoMonto(aCentimos(input.garantiaMonto), moneda)}` : "";
    await logActivity(
      "alquiler_crear",
      "alquiler",
      `Registró el alquiler «${input.nombre}»: renta ${formatoMonto(aCentimos(input.rentaMensual), moneda)}${garantia}, desde ${formatoDia(input.inicioEl)}${input.finEl ? ` hasta ${formatoDia(input.finEl)}` : ""}`,
      fila.id,
      user,
      undefined,
      tenantId,
    );
    this.olvidar(tenantId);
    const alquiler = await this.obtener(tenantId, fila.id);
    return alquiler ? { ok: true, alquiler } : { ok: false, error: "not_found", message: "El alquiler no se pudo leer." };
  },

  async actualizar(tenantId: string, id: string, patch: AlquilerPatch, user: string): Promise<ResultadoAlquiler> {
    exigirTenant(tenantId);
    const antes = await prisma.alquiler.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!antes) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    const malPlazo = plazoInvalido(
      patch.inicioEl ?? deFecha(antes.inicioEl),
      patch.finEl !== undefined ? patch.finEl : deFechaN(antes.finEl),
    );
    if (malPlazo) return { ok: false, error: "invalid_body", message: malPlazo };
    // Solo si el patch toca estado o fin: una fila vieja «terminado» sin fin se sigue pudiendo editar.
    if (
      (patch.estado !== undefined || patch.finEl !== undefined) &&
      terminadoSinFin(patch.estado ?? (antes.estado as EstadoAlquiler), patch.finEl !== undefined ? patch.finEl : deFechaN(antes.finEl))
    ) {
      return { ok: false, error: "invalid_body", message: MENSAJE_TERMINADO_SIN_FIN };
    }
    const motivo = await this.verificarReferencias(tenantId, {
      parteIds: [patch.duenoParteId, patch.inquilinoParteId],
      documentIds: [patch.contratoDocumentId],
    });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const detalle = cambios(antes as unknown as Record<string, unknown>, patch, (patch.moneda ?? antes.moneda) as Moneda);
    if (detalle) {
      const r = await prisma.alquiler.updateMany({
        where: { tenantId, id, deletedAt: null },
        data: datosDe(patch) as Prisma.AlquilerUncheckedUpdateManyInput,
      });
      if (r.count === 0) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
      await atarPapel(tenantId, id, patch.contratoDocumentId);
      await logActivity("alquiler_editar", "alquiler", `Editó el alquiler «${antes.nombre}»: ${detalle}`, id, user, undefined, tenantId);
      this.olvidar(tenantId);
    }
    const alquiler = await this.obtener(tenantId, id);
    return alquiler ? { ok: true, alquiler } : { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
  },

  /** Suave. Con pagos registrados pide `forzar` (la ruta solo lo deja al dueño). */
  async borrar(tenantId: string, id: string, user: string, opciones: { forzar?: boolean } = {}): Promise<ResultadoBorrar> {
    exigirTenant(tenantId);
    const antes = await prisma.alquiler.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: { nombre: true, _count: { select: { pagos: true } } },
    });
    if (!antes) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    const n = antes._count.pagos;
    if (n > 0 && !opciones.forzar) {
      return {
        ok: false,
        error: "tiene_pagos",
        pagos: n,
        message: `«${antes.nombre}» tiene ${n} pago(s) registrado(s). Si de verdad fue un error, el dueño puede borrarlo igual.`,
      };
    }
    const r = await prisma.alquiler.updateMany({ where: { tenantId, id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    await logActivity(
      "alquiler_borrar",
      "alquiler",
      `Borró el alquiler «${antes.nombre}»${n > 0 ? ` (con ${n} pago(s), forzado)` : ""}`,
      id,
      user,
      undefined,
      tenantId,
    );
    this.olvidar(tenantId);
    return { ok: true };
  },

  /**
   * Registra el pago de un mes. INSERT directo: el único `(alquilerId,
   * periodo)` decide la carrera (dos pestañas o el MCP reintentando). Si choca
   * se lee el que está: mismo monto y mismo día = el mismo pago repetido
   * (`duplicado`, sin auditar de nuevo); otro = `periodo_ya_pagado`.
   */
  async registrarPago(tenantId: string, alquilerId: string, input: AlquilerPagoInput, user: string): Promise<ResultadoPago> {
    exigirTenant(tenantId);
    const a = await prisma.alquiler.findFirst({ where: { tenantId, id: alquilerId, deletedAt: null } });
    if (!a) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    const calc = paraCalculo(a);
    const hoy = limaDateKey();
    if (!periodoEnPlazo(calc, input.periodo, hoy)) {
      return {
        ok: false,
        error: "periodo_fuera_de_plazo",
        message: `El mes ${input.periodo} está fuera del contrato (${formatoDia(calc.inicioEl)}${calc.finEl ? ` al ${formatoDia(calc.finEl)}` : ", sin fin: hasta 12 meses adelante"}).`,
      };
    }
    const motivo = await this.verificarReferencias(tenantId, { documentIds: [input.comprobanteDocumentId] });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const centimos = aCentimos(input.monto);
    const moneda = calc.moneda;
    const aviso = avisoMontoDelPago(calc.rentaMensual, input.monto, moneda, input.periodo);
    const conAviso = aviso ? { aviso } : {};
    try {
      const pago = await prisma.alquilerPago.create({
        data: {
          tenantId,
          alquilerId,
          periodo: input.periodo,
          monto: aDecimal(input.monto),
          pagadoEl: aFecha(input.pagadoEl),
          medio: input.medio,
          numeroOperacion: input.numeroOperacion ?? null,
          comprobanteDocumentId: input.comprobanteDocumentId ?? null,
          notas: input.notas ?? null,
          registradoPor: user,
        },
      });
      await atarPapel(tenantId, alquilerId, input.comprobanteDocumentId);
      await logActivity(
        "alquiler_pago_registrar",
        "alquiler",
        `Pago de «${a.nombre}» ${input.periodo}: ${formatoMonto(centimos, moneda)} el ${formatoDia(input.pagadoEl)} (${input.medio}${input.numeroOperacion ? `, op. ${input.numeroOperacion}` : ""})`,
        alquilerId,
        user,
        undefined,
        tenantId,
      );
      this.olvidar(tenantId);
      const alquiler = await this.obtener(tenantId, alquilerId);
      if (!alquiler) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
      return { ok: true, pago: aPago(pago), alquiler, duplicado: false, ...conAviso };
    } catch (err) {
      if (!esP2002(err)) throw err;
      const previo = await prisma.alquilerPago.findFirst({ where: { tenantId, alquilerId, periodo: input.periodo } });
      if (!previo) throw err;
      const igual = centimosDe(previo.monto) === centimos && deFecha(previo.pagadoEl) === input.pagadoEl;
      if (!igual) {
        return {
          ok: false,
          error: "periodo_ya_pagado",
          pago: aPago(previo),
          message: `${input.periodo} ya tiene un pago de ${formatoMonto(centimosDe(previo.monto) ?? 0, moneda)} del ${formatoDia(deFecha(previo.pagadoEl))}. Si estaba mal, corrige ese pago.`,
        };
      }
      const alquiler = await this.obtener(tenantId, alquilerId);
      if (!alquiler) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
      return { ok: true, pago: aPago(previo), alquiler, duplicado: true, ...conAviso };
    }
  },

  /** Corrige un pago (auditoría antes → después). Cambiar el mes a uno ya pagado = `periodo_ya_pagado`. */
  async corregirPago(tenantId: string, alquilerId: string, pagoId: string, patch: PagoPatch, user: string): Promise<ResultadoPago> {
    exigirTenant(tenantId);
    const a = await prisma.alquiler.findFirst({ where: { tenantId, id: alquilerId, deletedAt: null } });
    if (!a) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    const antes = await prisma.alquilerPago.findFirst({ where: { tenantId, alquilerId, id: pagoId } });
    if (!antes) return { ok: false, error: "not_found", message: "Ese pago no es de este alquiler." };
    const calc = paraCalculo(a);
    if (patch.periodo && patch.periodo !== antes.periodo && !periodoEnPlazo(calc, patch.periodo, limaDateKey())) {
      return { ok: false, error: "periodo_fuera_de_plazo", message: `El mes ${patch.periodo} está fuera del contrato.` };
    }
    const motivo = await this.verificarReferencias(tenantId, { documentIds: [patch.comprobanteDocumentId] });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const data: Prisma.AlquilerPagoUncheckedUpdateManyInput = {};
    if (patch.periodo !== undefined) data.periodo = patch.periodo;
    if (patch.monto !== undefined) data.monto = aDecimal(patch.monto);
    if (patch.pagadoEl !== undefined) data.pagadoEl = aFecha(patch.pagadoEl);
    if (patch.medio !== undefined) data.medio = patch.medio;
    if (patch.numeroOperacion !== undefined) data.numeroOperacion = patch.numeroOperacion;
    if (patch.comprobanteDocumentId !== undefined) data.comprobanteDocumentId = patch.comprobanteDocumentId;
    if (patch.notas !== undefined) data.notas = patch.notas;

    const moneda = calc.moneda;
    const detalle = [
      patch.periodo !== undefined && patch.periodo !== antes.periodo ? `mes ${antes.periodo} → ${patch.periodo}` : null,
      patch.monto !== undefined && aCentimos(patch.monto) !== centimosDe(antes.monto)
        ? `monto ${formatoMonto(centimosDe(antes.monto) ?? 0, moneda)} → ${formatoMonto(aCentimos(patch.monto), moneda)}`
        : null,
      patch.pagadoEl !== undefined && patch.pagadoEl !== deFecha(antes.pagadoEl)
        ? `día ${formatoDia(deFecha(antes.pagadoEl))} → ${formatoDia(patch.pagadoEl)}`
        : null,
      patch.medio !== undefined && patch.medio !== antes.medio ? `medio ${antes.medio} → ${patch.medio}` : null,
      patch.numeroOperacion !== undefined && patch.numeroOperacion !== antes.numeroOperacion
        ? `op. ${antes.numeroOperacion ?? "—"} → ${patch.numeroOperacion ?? "—"}`
        : null,
      patch.comprobanteDocumentId !== undefined && patch.comprobanteDocumentId !== antes.comprobanteDocumentId ? "comprobante" : null,
      patch.notas !== undefined && patch.notas !== antes.notas ? "notas" : null,
    ]
      .filter(Boolean)
      .join("; ");

    if (detalle) {
      try {
        const r = await prisma.alquilerPago.updateMany({ where: { tenantId, alquilerId, id: pagoId }, data });
        if (r.count === 0) return { ok: false, error: "not_found", message: "Ese pago no es de este alquiler." };
      } catch (err) {
        if (!esP2002(err)) throw err;
        const otro = await prisma.alquilerPago.findFirst({ where: { tenantId, alquilerId, periodo: patch.periodo ?? antes.periodo } });
        if (!otro) throw err;
        return { ok: false, error: "periodo_ya_pagado", pago: aPago(otro), message: `${otro.periodo} ya tiene otro pago registrado.` };
      }
      await atarPapel(tenantId, alquilerId, patch.comprobanteDocumentId);
      await logActivity("alquiler_pago_corregir", "alquiler", `Corrigió el pago ${antes.periodo} de «${a.nombre}»: ${detalle}`, alquilerId, user, undefined, tenantId);
      this.olvidar(tenantId);
    }
    const [pago, alquiler] = await Promise.all([
      prisma.alquilerPago.findFirst({ where: { tenantId, alquilerId, id: pagoId } }),
      this.obtener(tenantId, alquilerId),
    ]);
    if (!pago || !alquiler) return { ok: false, error: "not_found", message: "Ese pago no es de este alquiler." };
    const aviso = patch.monto !== undefined ? avisoMontoDelPago(calc.rentaMensual, patch.monto, moneda, pago.periodo) : null;
    return { ok: true, pago: aPago(pago), alquiler, duplicado: false, ...(aviso ? { aviso } : {}) };
  },

  /** Borra un pago mal registrado (queda en la auditoría con su monto). */
  async borrarPago(tenantId: string, alquilerId: string, pagoId: string, user: string): Promise<ResultadoPago> {
    exigirTenant(tenantId);
    const a = await prisma.alquiler.findFirst({ where: { tenantId, id: alquilerId, deletedAt: null }, select: { nombre: true, moneda: true } });
    if (!a) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    const antes = await prisma.alquilerPago.findFirst({ where: { tenantId, alquilerId, id: pagoId } });
    if (!antes) return { ok: false, error: "not_found", message: "Ese pago no es de este alquiler." };
    const r = await prisma.alquilerPago.deleteMany({ where: { tenantId, alquilerId, id: pagoId } });
    if (r.count === 0) return { ok: false, error: "not_found", message: "Ese pago no es de este alquiler." };
    await logActivity(
      "alquiler_pago_borrar",
      "alquiler",
      `Borró el pago ${antes.periodo} de «${a.nombre}»: ${formatoMonto(centimosDe(antes.monto) ?? 0, a.moneda as Moneda)} del ${formatoDia(deFecha(antes.pagadoEl))} (${antes.medio})`,
      alquilerId,
      user,
      undefined,
      tenantId,
    );
    this.olvidar(tenantId);
    const alquiler = await this.obtener(tenantId, alquilerId);
    if (!alquiler) return { ok: false, error: "not_found", message: "Ese alquiler no existe en este negocio." };
    return { ok: true, pago: aPago(antes), alquiler, duplicado: false };
  },

  /**
   * El primer papel que se sube a un alquiler sin contrato queda como contrato
   * (ADR-524 §3.1). La condición va en el WHERE: dos subidas a la vez no se
   * pisan (gana la primera). Cambiar un contrato que ya está = PATCH explícito.
   * @returns true si lo puso.
   */
  async ponerContratoSiFalta(tenantId: string, id: string, documentId: string, user: string): Promise<boolean> {
    exigirTenant(tenantId);
    if (await this.verificarReferencias(tenantId, { parteIds: [], documentIds: [documentId] })) return false;
    const r = await prisma.alquiler.updateMany({
      where: { tenantId, id, deletedAt: null, contratoDocumentId: null },
      data: { contratoDocumentId: documentId },
    });
    if (r.count === 0) return false;
    await atarPapel(tenantId, id, documentId);
    await logActivity("alquiler_editar", "alquiler", `Colgó el contrato del alquiler (documento ${documentId})`, id, user, undefined, tenantId);
    this.olvidar(tenantId);
    return true;
  },

  /**
   * De qué alquiler es un pago (la subida con `vinculoTipo: "pago_alquiler"`
   * manda solo el id del pago). Tenant en el WHERE y alquiler vivo; si no, null.
   */
  async alquilerDelPago(tenantId: string, pagoId: string): Promise<{ alquilerId: string; periodo: string } | null> {
    exigirTenant(tenantId);
    const p = await prisma.alquilerPago.findFirst({
      where: { tenantId, id: pagoId, alquiler: { tenantId, deletedAt: null } },
      select: { alquilerId: true, periodo: true },
    });
    return p ?? null;
  },

  /** Alquileres + fuentes de la agenda (vencimientos de pago/fin/aviso) + agenda. */
  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(prefijo(tenantId));
    invalidateByPrefix(`agenda-fuentes:${tenantId}:`);
    invalidateByPrefix(`agenda:${tenantId}:`);
  },
};
