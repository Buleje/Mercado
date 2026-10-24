import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { nombreCarpetaCamara } from "@/lib/camaras/personas-drive.server";
import { arbolPersonas, armarGaleria, diaDeLima, rangoDiaLima } from "@/lib/camaras/personas-galeria";

/**
 * GET /api/admin/camaras/personas/fotos?dia=YYYY-MM-DD&camara=<id> — la galería
 * «Personas» de Cámaras: las fotos que el detector del mosaico guardó en el
 * Drive ese día (Lima; default hoy), con las cifras ya armadas (por hora,
 * primera y última, cámara con más). Sólo lee: no crea carpetas.
 *
 * Las imágenes NO se hacen públicas: la pantalla las pide a los endpoints del
 * Drive (`/api/admin/documents/<id>/thumbnail` y `/raw`), que vuelven a
 * chequear sesión, negocio y los roles de toda la cadena de carpetas.
 * Mismos roles que el video en vivo y la carpeta «Personas».
 */
const fechaValida = (f: string) =>
  !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && new Date(`${f}T12:00:00Z`).toISOString().startsWith(f);

const querySchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(fechaValida).optional(),
  camara: z.string().trim().min(1).max(80).optional(),
});

/** Un día muy movido (4 cámaras, «sigue en cuadro» cada minuto) ronda las 2.000. */
const TOPE_FOTOS = 2000;

export const GET = withApiHandler("camaras-personas-fotos", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "camaras-personas-fotos");
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.safeParse({ dia: sp.get("dia") ?? undefined, camara: sp.get("camara") ?? undefined });
  if (!q.success) {
    return NextResponse.json(
      { error: "validation_error", message: "El día tiene que ser AAAA-MM-DD." },
      { status: 400 },
    );
  }
  const dia = q.data.dia ?? diaDeLima(new Date());
  const camara = q.data.camara ?? null;

  const [camaras, carpetas] = await Promise.all([
    CamarasDB.list(auth.tenantId),
    DocumentsDB.listFolders(auth.tenantId, auth.role),
  ]);
  const camarasGaleria = camaras.map((c) => ({ id: c.id, nombre: c.nombre, carpeta: nombreCarpetaCamara(c.nombre) }));
  const arbol = arbolPersonas(carpetas);
  if (!arbol) {
    return NextResponse.json(
      armarGaleria({ dia, camara, carpetas: [], personasId: null, docs: [], camaras: camarasGaleria }),
    );
  }

  const { desde, hasta } = rangoDiaLima(dia);
  const [docs, antes, despues] = await Promise.all([
    DocumentsDB.listImagenesEnRango(auth.tenantId, arbol.ids, { desde, hasta }, auth.role, TOPE_FOTOS),
    DocumentsDB.imagenVecina(auth.tenantId, arbol.ids, desde, "antes", auth.role),
    DocumentsDB.imagenVecina(auth.tenantId, arbol.ids, hasta, "despues", auth.role),
  ]);

  return NextResponse.json(
    armarGaleria({
      dia,
      camara,
      carpetas,
      personasId: arbol.personasId,
      docs: docs.slice(0, TOPE_FOTOS),
      camaras: camarasGaleria,
      anteriorConFotos: antes ? diaDeLima(antes) : null,
      siguienteConFotos: despues ? diaDeLima(despues) : null,
      truncado: docs.length > TOPE_FOTOS,
    }),
  );
});
