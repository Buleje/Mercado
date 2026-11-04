import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit-logger";
import { LibrosContadorDB } from "@/lib/db/libros-contador.db";
import { rangoDelPeriodo } from "@/lib/contabilidad/libros/comun";
import { armarRegistroVentas } from "@/lib/contabilidad/libros/registro-ventas";
import { cruzarConPropuesta, leerArchivoPropuesta, parsearPropuestaRvie, TOPE_ARCHIVO_BYTES } from "@/lib/contabilidad/libros/sire-cruce";

/**
 * POST /api/admin/contabilidad/sire-cruce (multipart: `periodo` AAAA-MM + `archivo` .zip/.txt)
 *
 * Cruza la PROPUESTA del Registro de Ventas que arma SUNAT en el SIRE (RVIE) con el libro 14.1
 * del mismo mes, armado acá igual que el de «Para el contador» (`/api/admin/contabilidad/libros`).
 * Devuelve lo que SUNAT tiene y el libro no, lo que el libro tiene y SUNAT no, y lo que está en
 * los dos con base, IGV o total distintos en más de S/ 0,01. El archivo no se guarda: se lee y se
 * descarta. Error del archivo = 422 `{ error }` con la frase para el dueño.
 *
 * Roles: los mismos que bajan el libro de ventas (admin y dueño; el encargado entra por el bypass
 * de gestión de `requireAdmin`).
 */

const Formulario = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "periodo debe ser AAAA-MM"),
});

export async function POST(req: NextRequest) {
  const limitado = applyRateLimit(req, "MODERATE", "sire-cruce");
  if (limitado) return limitado;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  // Antes de leer el cuerpo: formData() lo guarda entero en memoria (el proxy deja pasar 50 MB).
  if (Number(req.headers.get("content-length") ?? 0) > TOPE_ARCHIVO_BYTES + 65_536) {
    return NextResponse.json({ error: "El archivo pesa más de 4 MB. Sube el .zip que da el SIRE, sin descomprimir." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Sube el archivo de la propuesta (.zip o .txt) junto con el mes." }, { status: 400 });
  }
  const parsed = Formulario.safeParse({ periodo: form.get("periodo") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Consulta inválida", detalle: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const { periodo } = parsed.data;
  const rango = rangoDelPeriodo(periodo);
  if (!rango) return NextResponse.json({ error: "periodo debe ser AAAA-MM" }, { status: 400 });

  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo de la propuesta (.zip o .txt)." }, { status: 400 });
  if (archivo.size > TOPE_ARCHIVO_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 4 MB. Sube el .zip que da el SIRE, sin descomprimir." }, { status: 413 });
  }

  try {
    const leido = leerArchivoPropuesta(new Uint8Array(await archivo.arrayBuffer()), archivo.name);
    if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 422 });
    const propuesta = parsearPropuestaRvie(leido.texto);
    if (!propuesta.ok) return NextResponse.json({ error: propuesta.error }, { status: 422 });

    const [entrada, cabecera] = await Promise.all([LibrosContadorDB.ventas(auth.tenantId, rango), LibrosContadorDB.cabecera(auth.tenantId)]);
    const cruce = cruzarConPropuesta(propuesta, armarRegistroVentas(entrada).filas, { ruc: cabecera.ruc, periodo });
    if (!cruce.ok) return NextResponse.json({ error: cruce.error }, { status: 422 });

    logAudit({
      req,
      action: "VIEW",
      entity: "Sale",
      detail: `Cruce SIRE RVIE ${periodo} (${(leido.nombre ?? "archivo").slice(0, 80)}): ${cruce.resumen.soloSunat} solo SUNAT, ${cruce.resumen.soloLibro} solo libro, ${cruce.resumen.importes} con importes distintos, ${cruce.resumen.iguales} iguales`,
      user: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(cruce, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[api/admin/contabilidad/sire-cruce] POST falló", { tenantId: auth.tenantId, periodo, error: String(err) });
    return NextResponse.json({ error: "No se pudo cruzar la propuesta. Intenta de nuevo." }, { status: 500 });
  }
}
