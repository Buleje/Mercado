import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { consultarInfractores } from "@/lib/integrations/serfor-infractores";
import { consultarOsinfor } from "@/lib/integrations/osinfor";
import { codigoConsultable, type ResumenOsinfor } from "@/lib/forestal/osinfor-supervisiones";
import type { BusquedaInfractor, ResumenInfractores } from "@/lib/forestal/serfor-infractores";
import { revisarGrupo, type GrupoRevision } from "@/lib/forestal/revision-proveedores";
import { armarAviso, consultaDeProveedor } from "@/lib/forestal/aviso-proveedor";

// ── GET /api/admin/forestal/serfor-infractores/proveedor?nombre=…&doc=…&codigo=…&contratoId=… ──
// El aviso que sale SOLO al registrar o recepcionar un ingreso: el titular de la
// guía y su permiso contra el Registro de Infractores de SERFOR (lista pública en
// la memoria del servidor) y el mapa de OSINFOR (por código, caché 12 h). Mismo
// cálculo que «Revisar a todos» (`revisarGrupo`), para UN proveedor. Solo lee;
// a OSINFOR solo viaja el código del permiso. Nunca bloquea nada: avisa.

const texto = (max: number) =>
  z
    .string()
    .max(max, "Demasiado largo")
    .transform((s) => s.trim())
    .optional();

const consulta = z.object({
  doc: texto(20),
  nombre: texto(160),
  codigo: texto(60),
  contratoId: texto(40),
});

export async function GET(req: NextRequest) {
  // El aviso se pide solo mientras escriben (con pausa y caché en el navegador): POLL = 60 cada 5 min.
  const rateLimitResponse = applyRateLimit(req, "POLL", "forestal-aviso-proveedor");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const leido = consulta.safeParse({
      doc: sp.get("doc") ?? undefined,
      nombre: sp.get("nombre") ?? undefined,
      codigo: sp.get("codigo") ?? undefined,
      contratoId: sp.get("contratoId") ?? undefined,
    });
    if (!leido.success) {
      return NextResponse.json({ error: leido.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
    }
    const q = consultaDeProveedor({
      nombre: leido.data.nombre,
      documento: leido.data.doc,
      codigo: leido.data.codigo,
      contratoId: leido.data.contratoId,
    });
    if (!q) return NextResponse.json({ data: null });

    const inicio = Date.now();
    // El permiso del negocio al que se imputa la guía: su código y su titular también se revisan.
    const contrato = q.contratoId ? await ForestContratoDB.get(auth.tenantId, q.contratoId) : null;

    const codigos = [
      ...new Set(
        [q.codigo, contrato?.codigo]
          .map((c) => codigoConsultable(c))
          .filter((c): c is string => Boolean(c)),
      ),
    ];
    const busquedas: BusquedaInfractor[] = [
      { documento: q.documento, nombre: q.nombre, codigo: q.codigo },
      ...(contrato && codigoConsultable(contrato.codigo) !== codigoConsultable(q.codigo)
        ? [{ codigo: contrato.codigo, documento: contrato.titularDoc ?? q.documento, nombre: contrato.titularNombre }]
        : []),
    ];

    const [serfor, osinfor] = await Promise.all([
      Promise.all(busquedas.map((b) => consultarInfractores(b))),
      Promise.all(codigos.map((c) => consultarOsinfor(c))),
    ]);
    const serforRespondio = serfor.every((r) => r != null);
    const resumenes = serfor.filter((r): r is ResumenInfractores => r != null);
    const mapa = new Map<string, ResumenOsinfor | null>(codigos.map((c, i) => [c, osinfor[i] ?? null]));

    const grupo: GrupoRevision = {
      clave: "aviso",
      parteId: null,
      nombre: q.nombre ?? contrato?.titularNombre ?? q.codigo ?? "",
      documento: q.documento,
      permisos: codigos.map((codigo, i) => ({
        id: `p${i}`,
        codigo,
        titularNombre: "",
        titularId: null,
        titularDoc: null,
      })),
    };
    const fila = revisarGrupo(grupo, resumenes, mapa);
    if (fila.nivel === "sin_datos" && serforRespondio) return NextResponse.json({ data: null });

    // La fecha del dato de OSINFOR = la consulta más vieja (puede venir de la caché de 12 h).
    const consultas = osinfor.map((o) => o?.consultadoEn).filter((f): f is string => Boolean(f)).sort();
    const revisadoEn = new Date().toISOString();
    const aviso = armarAviso(fila, {
      corteSerfor: resumenes.find((r) => r.corte)?.corte ?? null,
      serforRespondio,
      consultadoEn: consultas[0] ?? revisadoEn,
    });
    logger.info("[aviso-proveedor] revisado", {
      tenantId: auth.tenantId,
      tono: aviso.tono,
      permisos: codigos.length,
      ms: Date.now() - inicio,
    });
    return NextResponse.json({ data: { aviso, revisadoEn } });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
