import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import {
  ESTADOS_PAPEL,
  ETIQUETA_TIPO_PAPEL,
  RE_CLAVE,
  normalizarCodigo,
  planVersiones,
  prefijoDelCodigo,
  totalDosDecimales,
  type EstadoPapel,
  type FiltroPapeles,
  type PapelPublico,
  type RegistroPapel,
  type VersionPapel,
} from "@/lib/papeles/registro";

/**
 * lib/db/papeles-emitidos.db.ts — Papeles emitidos por el programa `papel` (ADR-534).
 *
 * Cada papel (PRO-0002, LIQ-0001…) se registra con su código del pie
 * (BLAS-PRO-0002-7F3A) y la clave de 12 hex que va SOLO dentro del QR. La
 * tabla no guarda datos personales: la página pública del QR (`publico`) no
 * puede mostrar lo que no existe, y el total sale solo con la clave.
 *
 * Versiones: la fila más nueva de un número es la vigente; las anteriores no
 * anuladas pasan a `reemplazado` → código vigente (`planVersiones`, puro).
 * Patrón Buleje: tenantId 1.er parámetro y en TODO where; candado por número
 * dentro de la transacción para que dos versiones a la vez no queden vigentes.
 */

const prefijo = (tenantId: string) => `papeles-emitidos:${tenantId}:`;
const esDuplicado = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
const aEstado = (s: string): EstadoPapel => ((ESTADOS_PAPEL as readonly string[]).includes(s) ? (s as EstadoPapel) : "borrador");
const aFecha = (d: Date) => d.toISOString().slice(0, 10);
const aTotal = (v: { toFixed(n: number): string } | null) => (v == null ? null : v.toFixed(2));

/** Comparación en tiempo constante (largo distinto = no coincide, sin atajos por contenido). */
function claveCoincide(dada: string, guardada: string): boolean {
  const a = Buffer.from(dada, "utf8");
  const b = Buffer.from(guardada, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PapelEmitidoPanel {
  id: string;
  numero: string;
  tipo: string;
  titulo: string;
  fecha: string;
  estado: EstadoPapel;
  codigo: string;
  total: string | null;
  moneda: string;
  hojas: number | null;
  documentId: string | null;
  reemplazadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResultadoRegistro =
  | { ok: true; papel: { numero: string; codigo: string; estado: EstadoPapel }; reemplazados: number }
  | { ok: false; error: "codigo_en_uso" | "documento_no_existe" | "prefijo_de_otro_negocio" | "papel_distinto"; message: string };

type ResultadoInterno =
  | (Extract<ResultadoRegistro, { ok: true }> & { id: string })
  | Extract<ResultadoRegistro, { ok: false }>;

const SELECT_PANEL = {
  id: true,
  numero: true,
  tipo: true,
  titulo: true,
  fecha: true,
  estado: true,
  codigo: true,
  total: true,
  moneda: true,
  hojas: true,
  documentId: true,
  reemplazadoPor: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const PapelesEmitidosDB = {
  /**
   * Registra (o actualiza) un papel por (tenantId, codigo). Mismo código con
   * OTRO número u OTRA clave = `codigo_en_uso` (nunca se pisa). Aplica la regla
   * de versiones sobre las filas del mismo número.
   *
   * Seguridad (revisión ADR-534): el prefijo del código (BLAS) es de UN solo
   * negocio —cualquiera puede darse de alta y registrar «BLAS-…» en el suyo—;
   * un papel ya registrado solo cambia estado y PDF (lo demás está impreso:
   * si difiere es otro papel → `papel_distinto`); el título lo pone el
   * servidor según el tipo (nunca texto libre en la página pública).
   */
  async registrar(tenantId: string, datos: RegistroPapel, user = "admin"): Promise<ResultadoRegistro> {
    let r: ResultadoInterno;
    try {
      r = await prisma.$transaction(async (tx): Promise<ResultadoInterno> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`papel:${datos.numero}`}))`;

        if (datos.documentId) {
          const doc = await tx.document.findFirst({ where: { id: datos.documentId, tenantId }, select: { id: true } });
          if (!doc) {
            return { ok: false, error: "documento_no_existe", message: "Ese PDF no está en los Documentos de este negocio." } as const;
          }
        }

        const pref = prefijoDelCodigo(datos.codigo);
        const deOtro = await tx.papelEmitido.findFirst({
          where: { tenantId: { not: tenantId }, codigo: { startsWith: `${pref}-` } },
          select: { id: true },
        });
        if (deOtro) {
          return {
            ok: false,
            error: "prefijo_de_otro_negocio",
            message: `El prefijo ${pref} ya lo usa otro negocio: cambia el «prefijo» de tu marca.`,
          } as const;
        }

        const existente = await tx.papelEmitido.findUnique({
          where: { tenantId_codigo: { tenantId, codigo: datos.codigo } },
          select: { id: true, numero: true, clave: true, createdAt: true, tipo: true, fecha: true, total: true, moneda: true, hojas: true },
        });
        if (existente && (existente.numero !== datos.numero || !claveCoincide(datos.clave, existente.clave))) {
          return {
            ok: false,
            error: "codigo_en_uso",
            message: `El código ${datos.codigo} ya está registrado con otro papel o con otra clave: no se pisa.`,
          } as const;
        }
        if (existente) {
          const distinto =
            existente.tipo !== datos.tipo ||
            aFecha(existente.fecha) !== datos.fecha ||
            aTotal(existente.total) !== totalDosDecimales(datos.total) ||
            existente.moneda !== datos.moneda ||
            (existente.hojas != null && datos.hojas != null && existente.hojas !== datos.hojas);
          if (distinto) {
            return {
              ok: false,
              error: "papel_distinto",
              message: `El código ${datos.codigo} ya está registrado con otros datos (tipo, fecha, total u hojas): un papel impreso no se reescribe.`,
            } as const;
          }
        }

        const ahora = new Date();
        const otras: VersionPapel[] = (
          await tx.papelEmitido.findMany({
            where: { tenantId, numero: datos.numero, codigo: { not: datos.codigo } },
            select: { codigo: true, estado: true, reemplazadoPor: true, createdAt: true },
          })
        ).map((f) => ({ ...f, estado: aEstado(f.estado) }));
        const plan = planVersiones(otras, {
          codigo: datos.codigo,
          estado: datos.estado,
          createdAt: existente?.createdAt ?? ahora,
        });

        const vivo = {
          estado: plan.estado,
          reemplazadoPor: plan.reemplazadoPor,
          ...(datos.documentId ? { documentId: datos.documentId } : {}),
        };
        const fila = existente
          ? await tx.papelEmitido.update({
              where: { id: existente.id },
              data: { ...vivo, ...(existente.hojas == null && datos.hojas != null ? { hojas: datos.hojas } : {}) },
              select: { id: true },
            })
          : await tx.papelEmitido.create({
              data: {
                tenantId,
                numero: datos.numero,
                codigo: datos.codigo,
                clave: datos.clave,
                createdAt: ahora,
                tipo: datos.tipo,
                titulo: ETIQUETA_TIPO_PAPEL[datos.tipo],
                fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
                total: datos.total ?? null,
                moneda: datos.moneda,
                hojas: datos.hojas ?? null,
                ...vivo,
              },
              select: { id: true },
            });

        if (plan.aReemplazar.length > 0) {
          await tx.papelEmitido.updateMany({
            where: { tenantId, numero: datos.numero, codigo: { in: plan.aReemplazar }, estado: { not: "anulado" } },
            data: { estado: "reemplazado", reemplazadoPor: plan.vigente },
          });
        }
        return {
          ok: true,
          papel: { numero: datos.numero, codigo: datos.codigo, estado: plan.estado },
          reemplazados: plan.nuevosReemplazados,
          id: fila.id,
        } as const;
      });
    } catch (err) {
      if (esDuplicado(err)) {
        return { ok: false, error: "codigo_en_uso", message: `El código ${datos.codigo} ya está registrado: vuelve a intentarlo.` };
      }
      throw err;
    }

    if (r.ok) {
      const extra = r.reemplazados > 0 ? `; reemplazó ${r.reemplazados} versión(es) anterior(es)` : "";
      await logActivity(
        "papel_registrar",
        "papel_emitido",
        `Registró ${ETIQUETA_TIPO_PAPEL[datos.tipo]} ${datos.numero} (${datos.codigo}) en estado ${r.papel.estado}${extra}`,
        r.id,
        user,
        undefined,
        tenantId,
      );
      invalidateByPrefix(prefijo(tenantId));
      return { ok: true, papel: r.papel, reemplazados: r.reemplazados };
    }
    return r;
  },

  /**
   * Lo que ve la página pública del QR: whitelist de campos, nunca la fila
   * entera. `total` solo si la clave coincide (tiempo constante).
   */
  async publico(tenantId: string, codigo: string, clave?: string | null): Promise<PapelPublico | null> {
    const cod = normalizarCodigo(codigo);
    if (!cod) return null;
    const fila = await prisma.papelEmitido.findUnique({
      where: { tenantId_codigo: { tenantId, codigo: cod } },
      select: {
        numero: true,
        codigo: true,
        tipo: true,
        fecha: true,
        estado: true,
        hojas: true,
        total: true,
        moneda: true,
        reemplazadoPor: true,
        clave: true,
      },
    });
    if (!fila) return null;
    const dada = (clave ?? "").trim().slice(0, 64).toLowerCase();
    const conClave = RE_CLAVE.test(dada) && claveCoincide(dada, fila.clave);
    const estado = aEstado(fila.estado);
    return {
      numero: fila.numero,
      codigo: fila.codigo,
      tipo: fila.tipo,
      fecha: aFecha(fila.fecha),
      estado,
      hojas: fila.hojas,
      total: conClave ? aTotal(fila.total) : null,
      moneda: fila.moneda,
      reemplazado: estado === "reemplazado",
      conClave,
    };
  },

  /** Lista para el panel (sin la clave del QR). Más nuevos primero. */
  async listar(tenantId: string, filtro: Partial<FiltroPapeles> = {}): Promise<PapelEmitidoPanel[]> {
    const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 50), 1), 200);
    const numero = filtro.numero ?? null;
    return getOrSet(`${prefijo(tenantId)}lista:${numero ?? "*"}:${limite}`, 60, async () => {
      const filas = await prisma.papelEmitido.findMany({
        where: { tenantId, ...(numero ? { numero } : {}) },
        select: SELECT_PANEL,
        orderBy: [{ createdAt: "desc" }],
        take: limite,
      });
      return filas.map((f) => ({
        ...f,
        estado: aEstado(f.estado),
        fecha: aFecha(f.fecha),
        total: aTotal(f.total),
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      }));
    });
  },
};
