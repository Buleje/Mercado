import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { consultarInfractores } from "@/lib/integrations/serfor-infractores";
import { consultarOsinfor } from "@/lib/integrations/osinfor";
import { codigoConsultable, type ResumenOsinfor } from "@/lib/forestal/osinfor-supervisiones";
import type { ResumenInfractores } from "@/lib/forestal/serfor-infractores";
import {
  MAX_PERMISOS_OSINFOR,
  agruparPorTitular,
  filasConAlerta,
  resumirRevision,
  revisarGrupo,
  type GrupoRevision,
} from "@/lib/forestal/revision-proveedores";

// ── GET /api/admin/forestal/serfor-infractores/directorio ──
// «Revisar a todos mis proveedores»: cada ficha de la libreta y cada permiso
// contra el Registro de Infractores de SERFOR (lista pública en la memoria del
// servidor) y el mapa de OSINFOR (por código, de a 4, caché 12 h). Solo lee
// el negocio; a OSINFOR solo viaja el código del permiso.

const DE_A = 4;
/** Pasado esto no se piden más permisos a OSINFOR: la función de Vercel corta a los 30 s. */
const PRESUPUESTO_OSINFOR_MS = 20_000;

/** Las búsquedas en SERFOR de una persona: ella misma y cada uno de sus permisos. */
async function serforDelGrupo(g: GrupoRevision): Promise<ResumenInfractores[] | null> {
  const busquedas = [
    ...(g.parteId ? [{ documento: g.documento, nombre: g.nombre }] : []),
    ...g.permisos.map((k) => ({
      codigo: k.codigo,
      documento: k.titularDoc ?? g.documento,
      nombre: k.titularNombre,
    })),
  ];
  const out: ResumenInfractores[] = [];
  for (const b of busquedas) {
    const r = await consultarInfractores(b);
    if (!r) return null;
    out.push(r);
  }
  return out;
}

/** Los códigos que no entran en el mapa no se consultaron (se acabó el tiempo): la fila lo dice. */
async function osinforDeCodigos(
  codigos: string[],
  inicio: number,
): Promise<Map<string, ResumenOsinfor | null>> {
  const res = new Map<string, ResumenOsinfor | null>();
  for (let i = 0; i < codigos.length; i += DE_A) {
    if (Date.now() - inicio > PRESUPUESTO_OSINFOR_MS) break;
    const tanda = codigos.slice(i, i + DE_A);
    const respuestas = await Promise.all(tanda.map((c) => consultarOsinfor(c)));
    tanda.forEach((c, j) => res.set(c, respuestas[j] ?? null));
  }
  return res;
}

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "STRICT", "forestal-revision-proveedores");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const inicio = Date.now();
    const [partes, contratos] = await Promise.all([
      ForestDirectorioDB.listarPartes(auth.tenantId),
      ForestContratoDB.list(auth.tenantId),
    ]);
    const grupos = agruparPorTitular(
      partes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, roles: p.roles })),
      contratos.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        titularNombre: c.titularNombre,
        titularId: c.titularId,
        titularDoc: c.titularDoc,
      })),
    );

    const codigos = [
      ...new Set(
        grupos
          .flatMap((g) => g.permisos.map((k) => codigoConsultable(k.codigo)))
          .filter((c): c is string => Boolean(c)),
      ),
    ];
    const [serfor, osinfor] = await Promise.all([
      Promise.all(grupos.map(serforDelGrupo)),
      osinforDeCodigos(codigos.slice(0, MAX_PERMISOS_OSINFOR), inicio),
    ]);
    if (serfor.some((s) => s == null)) {
      return NextResponse.json(
        { error: "SERFOR no respondió; prueba en unos minutos" },
        { status: 503 },
      );
    }

    const filas = grupos.map((g, i) => revisarGrupo(g, serfor[i] ?? [], osinfor));
    const resumen = resumirRevision(filas);
    const corte = serfor.flat().find((r) => r?.corte)?.corte ?? null;
    logger.info("[revision-proveedores] revisados", {
      tenantId: auth.tenantId,
      grupos: grupos.length,
      permisos: codigos.length,
      sinConsultar: resumen.osinforSinConsultar,
      ms: Date.now() - inicio,
    });
    return NextResponse.json({
      data: {
        resumen,
        filas: filasConAlerta(filas),
        corteSerfor: corte,
        revisadoEn: new Date().toISOString(),
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
