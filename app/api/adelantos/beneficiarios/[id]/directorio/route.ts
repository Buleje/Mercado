import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { armarUnionDirectorio } from "@/lib/adelantos/union-directorio";
import { ptEquivalente, ultimoPrecioPt } from "@/lib/adelantos/madera-adelanto";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { isSpecializationEnabled } from "@/lib/specializations";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/adelantos/beneficiarios/[id]/directorio?q=texto (Brandon 25-10:
 * «adelanto de madera que baja solo»).
 *
 * Para unir a la persona de Adelantos con su ficha del Directorio forestal UNA
 * vez desde su ficha: a quién está unida, a quién se parece (`sugerirVinculo`,
 * ADR-449) y qué fichas calzan con lo que escribes (nombre, RUC o DNI). Con
 * eso, cuando su guía se recibe o su cubicación se aplica, el descuento del
 * adelanto se ofrece solo.
 *
 * Sólo LEE. Unir y soltar van por el PATCH `vincular_parte` de siempre
 * (`../route.ts`, sólo admin o dueño): un solo camino de escritura del vínculo.
 *
 * `madera`: lo que te debe en soles y su equivalente en pt AL PRECIO DE SU
 * ÚLTIMA MADERA (cubicación aplicada en pt) — un derivado, rotulado así en la
 * pantalla; sin precio conocido no hay pt (nunca un precio inventado).
 *
 * Mismos roles que sus hermanas (`requireAdmin` + matriz `adelantos` read). Una
 * persona de otro negocio da 404: el `tenantId` va en cada consulta.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const tenantId = auth.tenantId;
  try {
    const { id } = await params;
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
    const persona = await AdelantosDB.getBeneficiario(tenantId, id);
    if (!persona) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });

    const forestal = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
    if (!forestal) return NextResponse.json({ forestal: false, unida: null, sugerida: null, resultados: [], madera: null });

    const [partes, beneficiarios, propias, deLaParte] = await Promise.all([
      ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }),
      AdelantosDB.listBeneficiarios(tenantId),
      ForestCubicacionTrozasDB.list(tenantId, { beneficiarioId: id, estado: "aplicada", material: "todas" }),
      persona.forestPartyId
        ? ForestCubicacionTrozasDB.list(tenantId, {
            parteId: persona.forestPartyId,
            conBeneficiarioDeLaParte: true,
            estado: "aplicada",
            material: "todas",
          })
        : Promise.resolve([]),
    ]);

    const unidas = new Map<string, string>();
    for (const b of beneficiarios) if (b.forestPartyId && b.id !== id) unidas.set(b.forestPartyId, b.nombre);
    const union = armarUnionDirectorio(
      { id, nombre: persona.nombre, documento: persona.documento ?? null, forestPartyId: persona.forestPartyId ?? null },
      partes.map((p) => ({ id: p.id, nombre: p.nombre, docTipo: p.docTipo, docNumero: p.docNumero, activo: p.activo })),
      unidas,
      q,
    );

    /* Lo que te debe de adelantos DADOS y ABIERTOS en soles: la misma cifra que la ficha (`resumirPersona`). */
    const teDebe = beneficiarios.find((b) => b.id === id)?.saldoPendiente?.PEN ?? 0;
    const porCodigo = new Map([...propias, ...deLaParte].map((c) => [c.codigo, c]));
    const precio = ultimoPrecioPt([...porCodigo.values()]);
    const madera = precio
      ? { teDebe, precioPt: precio.precioPt, codigo: precio.codigo, fecha: precio.fecha, pt: ptEquivalente(teDebe, precio.precioPt) }
      : { teDebe, precioPt: null, codigo: null, fecha: null, pt: null };

    return NextResponse.json({ forestal: true, ...union, madera }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[adelantos/beneficiarios/id/directorio] GET error", { err: e instanceof Error ? e.message : String(e), tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
