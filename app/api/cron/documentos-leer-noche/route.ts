import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { DocumentsDB } from "@/lib/db/documents.db";
import { VERSION_LECTOR_VENCIMIENTO } from "@/lib/documentos/fecha-vencimiento";
import { TOPE_LECTURA_POR_TIENDA, presupuestoDeTienda } from "@/lib/documentos/lectura-nocturna";
import { leerPapelesDeNoche } from "@/lib/documents/leer-noche";
import { logger } from "@/lib/logger";

/**
 * Lectura de la noche (Brandon 24-10: «Leer todo y hallar vencimientos»).
 *
 * 02:45 de Lima, una vez por noche: por negocio, repasa con el lector de fechas
 * de hoy el texto ya guardado y lee hasta 40 papeles sin texto (Esenciales
 * primero) con el OCR del servidor. La fecha encontrada queda SÓLO como
 * sugerencia: el dueño la confirma en «Vencimientos encontrados». No escribe
 * `expiresAt`, no manda WhatsApp ni correo (eso es `documentos-vencimiento`).
 *
 * Reanudable: no guarda dónde quedó, se lo pregunta a la base. Lo que no entró
 * va la noche siguiente; lo que falló 3 noches queda con su motivo.
 *
 * Para probar UNA tienda: `?tenant=<id>&tope=3` (con el mismo Bearer del cron).
 * `ia=0` la apaga aunque haya presupuesto.
 */
export const maxDuration = 300;

/** Techo de la corrida entera: 60 s de margen contra los 300 de la función. */
const PRESUPUESTO_TOTAL_MS = 240_000;
/** Negocios por noche: los de más papeles pendientes primero. */
const MAX_TIENDAS = 20;

const Consulta = z.object({
  tenant: z.string().trim().min(1).max(64).optional(),
  tope: z.coerce.number().int().min(0).max(TOPE_LECTURA_POR_TIENDA).optional(),
  ia: z.enum(["0", "1"]).optional(),
});

export const GET = withCronHealth("documentos-leer-noche", async (req: NextRequest) => {
  const parsed = Consulta.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "parametros_invalidos", detalle: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const { tenant, tope = TOPE_LECTURA_POR_TIENDA, ia } = parsed.data;
  const arranque = Date.now();
  const tenants = tenant ? [tenant] : await DocumentsDB.tenantsParaLecturaNocturna(VERSION_LECTOR_VENCIMIENTO, MAX_TIENDAS);

  const total = {
    tiendas: tenants.length,
    tocadas: 0,
    revisados: 0,
    sugeridasDelTexto: 0,
    leidos: 0,
    sugeridas: 0,
    leidosEsenciales: 0,
    fallidos: 0,
    restantes: 0,
    cortadas: 0,
    conIA: 0,
    errores: 0,
  };

  for (let i = 0; i < tenants.length; i++) {
    const tenantId = tenants[i];
    const restante = PRESUPUESTO_TOTAL_MS - (Date.now() - arranque);
    if (restante <= 0) break;
    try {
      const r = await leerPapelesDeNoche(tenantId, {
        tope,
        presupuestoMs: presupuestoDeTienda(restante, tenants.length - i),
        ia: ia === "0" ? false : "auto",
        actorId: "cron-leer-noche",
      });
      if (r.leidos + r.sugeridasDelTexto + r.fallidos.length > 0) total.tocadas += 1;
      total.revisados += r.revisados;
      total.sugeridasDelTexto += r.sugeridasDelTexto;
      total.leidos += r.leidos;
      total.sugeridas += r.sugeridas;
      total.leidosEsenciales += r.leidosEsenciales;
      total.fallidos += r.fallidos.length;
      total.restantes += r.restantes;
      if (r.cortado) total.cortadas += 1;
      if (r.conIA) total.conIA += 1;
    } catch (err) {
      total.errores += 1;
      logger.error("[cron/documentos-leer-noche] negocio falló", { tenantId, error: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, ...total, ms: Date.now() - arranque });
});
