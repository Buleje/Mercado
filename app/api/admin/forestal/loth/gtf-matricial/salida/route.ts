import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { MENSAJE_ERROR_PERFIL, transformacionDe } from "@/lib/forestal/gtf-matricial-perfiles";
import { entradasDeLaGuia, paginasDe } from "@/lib/forestal/gtf-matricial-valores";
import { escpTalonario, renglonesPruebaEscp, type Agujas } from "@/lib/forestal/gtf-salida-escp";
import { renglonesDeLaPagina } from "@/lib/forestal/gtf-salida-geometria";
import { pdfPrueba, pdfTalonario } from "@/lib/forestal/gtf-salida-pdf";
import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/admin/forestal/loth/gtf-matricial/salida — la guía lista para el
 * talonario de la matricial SIN pasar por el navegador (16-10, contrato
 * `gtf-salida-tipos.ts`): para mandarla al monte, donde sólo hay un celular.
 *
 *   ?gtfId=<id>&formato=pdf|escp&perfil=<perfilId>[&hoja=guia|lista]
 *   · pdf  → PDF del tamaño exacto del talonario (imprimir a tamaño real).
 *   · escp → bytes ESC/P para la Epson (.prn), cada valor en su mm.
 * Adiciones (no rompen el contrato):
 *   · `prueba=1` → la hoja de prueba con el perfil (para calibrar esa impresora);
 *     `valores=1` le suma encima los valores de la guía.
 *   · `agujas=9|24` (ESC/P): la unidad del avance fino cambia (1/216″ o 1/180″).
 *   · Header `X-Recortados`: renglones que no entran en el papel/carro.
 *
 * Disposición = la GUARDADA del titular de la guía (la misma que abre el
 * modal); perfil = la calibración guardada de esa impresora. Todo sale del
 * servidor: el cliente no manda valores ni medidas.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const querySchema = z.object({
  gtfId: z.string().trim().min(1).max(64),
  formato: z.enum(["pdf", "escp"]),
  perfil: z.string().trim().min(1).max(64).default(PERFIL_OFICINA_ID),
  hoja: z.enum(["guia", "lista"]).default("guia"),
  prueba: z.enum(["0", "1"]).default("0"),
  valores: z.enum(["0", "1"]).default("0"),
  agujas: z.enum(["9", "24"]).default("9"),
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** «GTF-019-001-0000772-guia.pdf»: sólo lo que un nombre de archivo admite en cualquier celular. */
const nombreArchivo = (numero: string, partes: string[], ext: "pdf" | "prn"): string =>
  `${["GTF", numero.trim() || "sin-numero", ...partes].join("-").replace(/[^A-Za-z0-9._-]+/g, "-")}.${ext}`;

export const GET = withApiHandler("forestal-loth-gtf-matricial-salida", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.safeParse(Object.fromEntries(["gtfId", "formato", "perfil", "hoja", "prueba", "valores", "agujas"].map((k) => [k, sp.get(k) ?? undefined])));
  if (!q.success) return NextResponse.json({ error: "validation_error", issues: q.error.issues.slice(0, 5) }, { status: 400 });
  const { gtfId, formato, perfil: perfilId, hoja: formatoHoja } = q.data;
  const prueba = q.data.prueba === "1";
  const agujas: Agujas = q.data.agujas === "24" ? 24 : 9;

  try {
    const g = await ForestGtfDB.getById(auth.tenantId, gtfId);
    if (!g) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
    if (g.status === "anulada" && !prueba) {
      return NextResponse.json({ error: "anulada", message: "Esa guía está anulada: no se imprime en el talonario." }, { status: 409 });
    }
    const dueno = { titular: g.titularName ?? null, permiso: g.tituloHabilitante ?? null, planId: g.planId ?? null };
    const { disposicion, perfil } = await ForestGtfMatricialDB.paraSalida(auth.tenantId, dueno, perfilId);
    if (!perfil) return NextResponse.json({ error: "perfil_no_existe", message: MENSAJE_ERROR_PERFIL["no-existe"] }, { status: 404 });

    const hoja = disposicion[formatoHoja];
    const t = transformacionDe(hoja, perfil);
    const caratula: LothGtfCaratula | null = g.gtfDatos ? null : await ForestLothDB.getActiveCaratula(auth.tenantId);
    // Fechas y decimales como los ve el cliente (ISO y texto): la misma entrada que el modal.
    const doc = JSON.parse(JSON.stringify(g)) as LothGtfDoc;
    const paginas = paginasDe(formatoHoja, entradasDeLaGuia(doc, caratula), hoja);
    const cat = CATALOGO[formatoHoja];
    const renglones = paginas.map((p) => renglonesDeLaPagina(hoja, cat, p, t));

    const numero = g.gtfNumber;
    const partes = prueba ? [formatoHoja, "prueba", perfil.id] : [formatoHoja];
    let cuerpo: Uint8Array;
    let recortados = 0;
    let tipo: string;
    if (formato === "pdf") {
      const titulo = prueba ? `Prueba del talonario (${perfil.nombre}) — GTF ${numero}` : `GTF ${numero} — imprimir a tamaño real`;
      cuerpo = prueba ? await pdfPrueba(hoja, t, titulo, q.data.valores === "1" ? (renglones[0] ?? []) : []) : await pdfTalonario(hoja, renglones, titulo);
      tipo = "application/pdf";
    } else {
      const hojas = prueba ? [[...renglonesPruebaEscp(hoja, t, agujas), ...(q.data.valores === "1" ? (renglones[0] ?? []) : [])]] : renglones;
      const r = escpTalonario(hoja, hojas, agujas);
      cuerpo = r.bytes;
      recortados = r.recortados;
      tipo = "application/octet-stream";
    }
    const nombre = nombreArchivo(numero, partes, formato === "pdf" ? "pdf" : "prn");
    return new NextResponse(Buffer.from(cuerpo), {
      status: 200,
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
        "X-Recortados": String(recortados),
        "X-Hojas": String(renglones.length),
      },
    });
  } catch (err) {
    logger.error("[loth.gtf-matricial.salida] failed", { error: String(err), tenantId: auth.tenantId, gtfId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
