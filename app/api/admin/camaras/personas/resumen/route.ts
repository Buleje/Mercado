import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ROLES_CARPETA_PERSONAS, nombreCarpetaCamara } from "@/lib/camaras/personas-drive.server";
import { arbolPersonas, armarGaleria, diaDeLima, leerMetaFoto, rangoDiaLima } from "@/lib/camaras/personas-galeria";
import { agruparPersonasDelDia, type FotoConCajas } from "@/lib/camaras/visitantes";

/**
 * GET /api/admin/camaras/personas/resumen?dia=YYYY-MM-DD — personas DISTINTAS
 * del día (ADR-479): «Hoy: 6 personas, 4 con chaleco · aprox.», el conteo por
 * hora y «Visitante A, B…» con su portada.
 *
 * Sólo lee. Las cajas y la firma de la ropa viven dentro de cada foto del
 * Drive (`ocrMetadata.cajas`, la calcula el servidor al guardar); acá se
 * agrupan al leer y no se guarda nada: «Visitante A» vale sólo para ese día.
 * Lee la `ocrMetadata` COMPLETA (`listImagenesEnRango`; `list()` la recorta).
 * Mismos roles que la carpeta «Personas» y el video en vivo.
 */
const fechaValida = (f: string) =>
  !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && new Date(`${f}T12:00:00Z`).toISOString().startsWith(f);

const querySchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(fechaValida).optional(),
});

/** El mismo tope que la galería: un día muy movido ronda las 2.000 fotos. */
const TOPE_FOTOS = 2000;

export const GET = withApiHandler("camaras-personas-resumen", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES_CARPETA_PERSONAS]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "camaras-personas-resumen");
  if (rl) return rl;

  const q = querySchema.safeParse({ dia: req.nextUrl.searchParams.get("dia") ?? undefined });
  if (!q.success) {
    return NextResponse.json(
      { error: "validation_error", message: "El día tiene que ser AAAA-MM-DD." },
      { status: 400 },
    );
  }
  const dia = q.data.dia ?? diaDeLima(new Date());

  const [camaras, carpetas] = await Promise.all([
    CamarasDB.list(auth.tenantId),
    DocumentsDB.listFolders(auth.tenantId, auth.role),
  ]);
  const arbol = arbolPersonas(carpetas);
  if (!arbol) return NextResponse.json({ ok: true, ...agruparPersonasDelDia(dia, []) });

  const { desde, hasta } = rangoDiaLima(dia);
  // Trae una de más para saber si hubo más que el tope (las más nuevas primero).
  const crudas = await DocumentsDB.listImagenesEnRango(auth.tenantId, arbol.ids, { desde, hasta }, auth.role, TOPE_FOTOS);
  const docs = crudas.slice(0, TOPE_FOTOS);
  // La galería ya sabe de qué cámara es cada foto (también las de una cámara renombrada o quitada).
  const galeria = armarGaleria({
    dia,
    camara: null,
    carpetas,
    personasId: arbol.personasId,
    docs,
    camaras: camaras.map((c) => ({ id: c.id, nombre: c.nombre, carpeta: nombreCarpetaCamara(c.nombre) })),
  });
  const cajasPorDoc = new Map(docs.map((d) => [d.id, leerMetaFoto(d).cajas]));
  const fotos: FotoConCajas[] = galeria.fotos.map((f) => ({
    docId: f.id,
    at: f.en,
    camaraId: f.camara.startsWith("carpeta:") ? null : f.camara,
    camaraNombre: f.camaraNombre,
    cajas: cajasPorDoc.get(f.id) ?? null,
  }));

  return NextResponse.json({ ok: true, ...agruparPersonasDelDia(dia, fotos), truncado: crudas.length > TOPE_FOTOS });
});
