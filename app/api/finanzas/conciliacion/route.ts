import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { ConciliacionBancariaDB } from "@/lib/db/conciliacion-bancaria.db";
import { leerArchivoDelBanco, tipoDeExtracto } from "@/lib/finance/leer-extracto-banco";
import {
  TOLERANCIA_DIAS,
  cuadrarConElBanco,
  periodoDelExtracto,
  resumirCuadre,
  sumarDias,
} from "@/lib/finance/bank-reconciliation";

/**
 * POST /api/finanzas/conciliacion — cuadrar el extracto del banco (multipart).
 *
 * Campos: `archivo` (CSV, TXT o XLSX del BCP, Interbank, BBVA…), `cuentaId`
 * (opcional: una cuenta de Tesorería; sin ella, todas las de banco) y
 * `conVentas` ("1" por defecto: suma los cobros digitales de ventas, caja y pedidos).
 *
 * NO guarda nada: lee el archivo, trae lo del sistema del período del extracto
 * (más 3 días a cada lado, para cruzar lo que el banco anotó tarde) y devuelve
 * los cuatro grupos con su cantidad y monto (los suma el servidor) y las filas.
 * Sólo administrador o dueño: muestra la plata del banco del negocio.
 */

/** 4 MB: Vercel corta el cuerpo a 4,5 MB con su propio 413 (sin JSON: la pantalla no podía decir qué pasó). */
export const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILAS_BANCO = 5000;
/** Filas por grupo en la respuesta: la tabla del modal no muestra más (los totales sí cuentan todas). */
const MAX_FILAS_POR_GRUPO = 500;

const CamposSchema = z.object({
  cuentaId: z.string().trim().min(1).max(64).nullable(),
  conVentas: z.enum(["0", "1"]),
});

const error = (status: number, mensaje: string) => NextResponse.json({ error: mensaje }, { status });

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "finanzas-conciliacion");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const noEsDueno = soloAdminODueno(auth.role, "cuadrar el banco");
  if (noEsDueno) return noEsDueno;
  const tenantId = auth.tenantId;

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES + 64 * 1024) return error(413, "El archivo pesa más de 4 MB: bájalo de a un mes.");

  const form = await req.formData().catch(() => null);
  if (!form) return error(400, "Manda el archivo del banco como multipart.");
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return error(400, "Falta el archivo del banco.");
  if (archivo.size > MAX_BYTES) return error(413, "El archivo pesa más de 4 MB: bájalo de a un mes.");
  const tipo = tipoDeExtracto(archivo.name);
  if (tipo === "xls") return error(415, "Ese Excel es del formato viejo (.xls): ábrelo y guárdalo como .xlsx o CSV.");
  if (tipo === "otro") return error(415, "Sube el extracto en CSV, TXT o Excel (.xlsx).");

  const cuentaCruda = form.get("cuentaId");
  const campos = CamposSchema.safeParse({
    cuentaId: typeof cuentaCruda === "string" && cuentaCruda.trim() ? cuentaCruda : null,
    conVentas: form.get("conVentas") ?? "1",
  });
  if (!campos.success) return error(400, "Datos inválidos.");
  const { cuentaId, conVentas } = campos.data;

  try {
    if (cuentaId && !(await TreasuryDB.getCuenta(tenantId, cuentaId))) return error(404, "Esa cuenta no existe.");

    let extracto;
    try {
      extracto = await leerArchivoDelBanco(archivo.name, await archivo.arrayBuffer());
    } catch (err) {
      logger.warn("[finanzas/conciliacion] archivo ilegible", { tenantId, error: String(err) });
      return error(422, "No se pudo leer el archivo. Bájalo de nuevo del banco o guárdalo como CSV.");
    }
    const periodo = periodoDelExtracto(extracto.filas);
    if (!periodo) {
      return error(422, "No encontramos movimientos con fecha y monto en el archivo. ¿Es el extracto de la cuenta?");
    }
    if (extracto.filas.length > MAX_FILAS_BANCO) {
      return error(422, `El extracto trae ${extracto.filas.length} movimientos; súbelo de a un mes (hasta ${MAX_FILAS_BANCO}).`);
    }

    const sistema = await ConciliacionBancariaDB.movimientosDelSistema(tenantId, {
      desde: sumarDias(periodo.desde, -TOLERANCIA_DIAS),
      hasta: sumarDias(periodo.hasta, TOLERANCIA_DIAS),
      cuentaId,
      conVentas: conVentas === "1",
    });
    const cuadre = cuadrarConElBanco(extracto.filas, sistema.pagos);
    // Lo del sistema traído por el margen de días sólo sirve para cruzar: fuera
    // del período del extracto no es «falta en el banco».
    cuadre.soloSistema = cuadre.soloSistema.filter((s) => s.date >= periodo.desde && s.date <= periodo.hasta);
    const resumen = resumirCuadre(cuadre);

    return NextResponse.json({
      periodo,
      banco: { movimientos: extracto.filas.length, descartadas: extracto.descartadas, formato: extracto.formato },
      sistema: { movimientos: sistema.pagos.length, porFuente: sistema.porFuente, recortado: sistema.recortado },
      resumen,
      grupos: {
        coinciden: cuadre.coinciden.slice(0, MAX_FILAS_POR_GRUPO),
        conDiferencia: cuadre.conDiferencia.slice(0, MAX_FILAS_POR_GRUPO),
        soloBanco: cuadre.soloBanco.slice(0, MAX_FILAS_POR_GRUPO),
        soloSistema: cuadre.soloSistema.slice(0, MAX_FILAS_POR_GRUPO),
      },
    });
  } catch (err) {
    logger.error("[finanzas/conciliacion] error", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return error(500, "No se pudo cuadrar con el banco.");
  }
}
