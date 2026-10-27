import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestCtpGuiaSalidaDB } from "@/lib/db/forest-ctp-guia-salida.db";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { formaIdSchema, MENSAJE_ERROR_FORMA } from "@/lib/forestal/gtf-matricial-formas";
import { MENSAJE_ERROR_PERFIL, transformacionDe } from "@/lib/forestal/gtf-matricial-perfiles";
import { entradasDeLaGuia, paginasDe } from "@/lib/forestal/gtf-matricial-valores";
import { escpTalonario, renglonesPruebaEscp, type Agujas } from "@/lib/forestal/gtf-salida-escp";
import { renglonesDeLaPagina } from "@/lib/forestal/gtf-salida-geometria";
import { pdfPrueba, pdfTalonario } from "@/lib/forestal/gtf-salida-pdf";
import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { EntradasGuiaLoth } from "@/lib/forestal/loth-guia-print";
import { duenoSalidaCtp, type DuenoTalonario } from "@/lib/forestal/gtf-matricial-titulares";
import { guardTalonario } from "@/lib/forestal/gtf-matricial-habilitado";
import { guiaDeLosParametros } from "@/lib/forestal/gtf-matricial-fuente";
import { faltanParaImprimir } from "@/lib/forestal/guia-salida-imprimible";
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
 *   · `forma=<id>` (16-10): imprime con esa forma del talonario; sin ella, con
 *     la que se elige sola para la guía (permiso + titular). Una forma pedida que
 *     ya no existe es 404: nunca se cae a otra (gastaría una hoja numerada).
 *   · Header `X-Recortados`: renglones que no entran en el papel/carro.
 *   · `despachoId=<id>` en vez de `gtfId` (27-10): la GTF de SALIDA de ese
 *     despacho del Libro CTP, entera (todas sus líneas), con las entradas de
 *     `ForestCtpGuiaSalidaDB` (las mismas de su hoja SERFOR) y la forma única
 *     del CTP. 409 `SIN_GUIA` si todavía no tiene N°.
 *
 * Disposición = la forma GUARDADA de la guía (la misma que abre el modal);
 * perfil = la calibración guardada de esa impresora. Todo sale del
 * servidor: el cliente no manda valores ni medidas.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const MENSAJE_UNA_GUIA = "Indica una guía del Libro TH (gtfId) o un despacho del Libro CTP (despachoId): uno solo.";

const querySchema = z.object({
  gtfId: z.string().trim().min(1).max(64).optional(),
  despachoId: z.string().trim().min(1).max(64).optional(),
  formato: z.enum(["pdf", "escp"]),
  perfil: z.string().trim().min(1).max(64).default(PERFIL_OFICINA_ID),
  hoja: z.enum(["guia", "lista"]).default("guia"),
  prueba: z.enum(["0", "1"]).default("0"),
  valores: z.enum(["0", "1"]).default("0"),
  agujas: z.enum(["9", "24"]).default("9"),
  forma: formaIdSchema.optional(),
}).refine((v) => !!v.gtfId !== !!v.despachoId, { message: MENSAJE_UNA_GUIA });

const NO_HAY_GUIA = () => NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });

/** Lo que cambia según de qué libro es la guía: su dueño (la forma), su N° y sus valores. */
type GuiaParaSalida = { dueno: DuenoTalonario; numero: string; entradas: () => Promise<EntradasGuiaLoth> };

/** «GTF-019-001-0000772-guia.pdf»: sólo lo que un nombre de archivo admite en cualquier celular. */
const nombreArchivo = (numero: string, partes: string[], ext: "pdf" | "prn"): string =>
  `${["GTF", numero.trim() || "sin-numero", ...partes].join("-").replace(/[^A-Za-z0-9._-]+/g, "-")}.${ext}`;

export const GET = withApiHandler("forestal-loth-gtf-matricial-salida", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.safeParse(Object.fromEntries(["gtfId", "despachoId", "formato", "perfil", "hoja", "prueba", "valores", "agujas", "forma"].map((k) => [k, sp.get(k) ?? undefined])));
  if (!q.success) {
    const una = q.error.issues.some((i) => i.message === MENSAJE_UNA_GUIA);
    return NextResponse.json({ error: "validation_error", ...(una ? { message: MENSAJE_UNA_GUIA } : {}), issues: q.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { gtfId, despachoId, formato, perfil: perfilId, hoja: formatoHoja } = q.data;
  const guard = await guardTalonario(auth.tenantId, guiaDeLosParametros(gtfId, despachoId));
  if (guard) return guard;
  const prueba = q.data.prueba === "1";
  const agujas: Agujas = q.data.agujas === "24" ? 24 : 9;
  try {
    let deLaGuia: GuiaParaSalida;
    if (despachoId) {
      /* La GTF de SALIDA del CTP: la guía entera con las entradas de su hoja
         SERFOR, y la forma única del talonario del CTP (su razón social). */
      const r = await ForestCtpGuiaSalidaDB.guiaSalidaDeDespacho(auth.tenantId, despachoId);
      if (!r.ok && r.error === "NO_EXISTE") return NO_HAY_GUIA();
      if (!r.ok) return NextResponse.json({ error: "SIN_GUIA", message: "Emite la guía primero: botón Guía de la fila." }, { status: 409 });
      if (r.guia.anulada && !prueba) {
        return NextResponse.json({ error: "anulada", message: "Esa guía está anulada: no se imprime en el talonario." }, { status: 409 });
      }
      const faltan = faltanParaImprimir(r.guia);
      if (faltan && !prueba) return NextResponse.json({ error: "FALTAN_DATOS", message: faltan }, { status: 409 });
      deLaGuia = { dueno: duenoSalidaCtp(r.guia.titular), numero: r.guia.gtfNumber, entradas: async () => r.entradas };
    } else {
      const g = await ForestGtfDB.getById(auth.tenantId, gtfId ?? "");
      if (!g) return NO_HAY_GUIA();
      if (g.status === "anulada" && !prueba) {
        return NextResponse.json({ error: "anulada", message: "Esa guía está anulada: no se imprime en el talonario." }, { status: 409 });
      }
      deLaGuia = {
        dueno: { titular: g.titularName ?? null, permiso: g.tituloHabilitante ?? null, planId: g.planId ?? null },
        numero: g.gtfNumber,
        entradas: async () => {
          const caratula: LothGtfCaratula | null = g.gtfDatos ? null : await ForestLothDB.getActiveCaratula(auth.tenantId);
          // Fechas y decimales como los ve el cliente (ISO y texto): la misma entrada que el modal.
          return entradasDeLaGuia(JSON.parse(JSON.stringify(g)) as LothGtfDoc, caratula);
        },
      };
    }
    const { disposicion, perfil } = await ForestGtfMatricialDB.paraSalida(auth.tenantId, deLaGuia.dueno, perfilId, q.data.forma);
    if (!disposicion) return NextResponse.json({ error: "forma_no_existe", message: MENSAJE_ERROR_FORMA.no_existe }, { status: 404 });
    if (!perfil) return NextResponse.json({ error: "perfil_no_existe", message: MENSAJE_ERROR_PERFIL["no-existe"] }, { status: 404 });

    const hoja = disposicion[formatoHoja];
    const t = transformacionDe(hoja, perfil);
    const paginas = paginasDe(formatoHoja, await deLaGuia.entradas(), hoja);
    const cat = CATALOGO[formatoHoja];
    const renglones = paginas.map((p) => renglonesDeLaPagina(hoja, cat, p, t));

    const numero = deLaGuia.numero;
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
    logger.error("[loth.gtf-matricial.salida] failed", { error: String(err), tenantId: auth.tenantId, gtfId, despachoId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
