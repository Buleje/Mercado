import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isSpecializationEnabled } from "@/lib/specializations";
import { BuscadorPanelDB } from "@/lib/db/buscador-panel.db";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { enStockBajo } from "@/lib/inventario/stock-minimo";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";
import { nivelDeRol } from "@/lib/rrhh/roles";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import {
  GRUPOS_FORESTALES, LIMITE_POR_GRUPO, ROLES_BUSCADOR,
  anexosQueCoinciden, deAnexo, deCliente, deGuia, deLote, deParte, dePedido, deProducto, deProveedor,
  deTrabajadores, deTroza, normalizarConsulta, permisosConRelacionados, porParecido, veGrupo,
  type GrupoRemoto, type GuiaFila, type ResultadoRemoto,
} from "@/lib/admin/busqueda-remota";

/**
 * GET /api/search?q= — lo que el buscador del panel (⌘K) trae del servidor:
 * la bodega (productos, clientes, pedidos, proveedores), el aserradero (guías,
 * Anexos 04, trozas, permisos, lotes, Directorio) y el personal.
 *
 * Cada grupo filtra y limita en la base (`BuscadorPanelDB`) y sólo corre si el
 * rol lo ve con el MISMO criterio que la ruta de ese recurso (`veGrupo`) y, los
 * del aserradero, si el negocio tiene su libro encendido. Hasta 5 por grupo.
 */
const QuerySchema = z.object({ q: z.string().max(200).optional() });

const NO_GUARDAR = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const limited = applyRateLimit(req, "GENEROUS", "search");
    if (limited) return limited;
    const auth = await requireAdmin(req, ROLES_BUSCADOR);
    if (auth instanceof NextResponse) return auth;

    const parsed = QuerySchema.safeParse({ q: req.nextUrl.searchParams.get("q") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: "Consulta inválida" }, { status: 400 });
    const q = normalizarConsulta(parsed.data.q);
    if (q.length < 2) return NextResponse.json({ results: [] }, { headers: NO_GUARDAR });

    const { tenantId, role } = auth;
    const ve = (g: GrupoRemoto) => veGrupo(role, g);
    const algunoForestal = GRUPOS_FORESTALES.some(ve);
    const [conCtp, conLoth] = algunoForestal
      ? await Promise.all([
          isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
          isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"),
        ])
      : [false, false];
    const libroForestal = conCtp || conLoth;

    /** Un grupo que falla no tumba la búsqueda: se registra y sale vacío. */
    const grupo = async (nombre: GrupoRemoto, activo: boolean, buscar: () => Promise<ResultadoRemoto[]>): Promise<ResultadoRemoto[]> => {
      if (!activo || !ve(nombre)) return [];
      try {
        return await buscar();
      } catch (err) {
        logger.error("[search] grupo falló", { grupo: nombre, error: String(err) });
        return [];
      }
    };
    const top = <T,>(filas: T[], claves: (f: T) => (string | null | undefined)[]) => porParecido(filas, q, claves).slice(0, LIMITE_POR_GRUPO);

    /* Guías y anexos se leen una vez: sus filas y, de paso, el permiso de cada una para el grupo Permisos. */
    const sinFallar = <T,>(nombre: string, p: Promise<T[]>): Promise<T[]> =>
      p.catch((err: unknown) => {
        logger.error("[search] grupo falló", { grupo: nombre, error: String(err) });
        return [];
      });
    const guiasP: Promise<GuiaFila[]> = libroForestal && ve("guias")
      ? sinFallar("guias", BuscadorPanelDB.guias(tenantId, q, { conCtp, conLoth }).then((f) => top(f, (g) => [g.gtfNumber])))
      : Promise.resolve([]);
    const anexosP: Promise<AnexoEmitido[]> = conCtp && ve("anexos")
      ? sinFallar("anexos", ForestAnexosDB.list(tenantId).then((l) => anexosQueCoinciden(l, q)))
      : Promise.resolve([]);

    const grupos = await Promise.all([
      grupo("productos", true, async () => {
        const filas = await BuscadorPanelDB.productos(tenantId, q);
        if (filas.length === 0) return [];
        const minimo = await minimoGlobalDelNegocio(tenantId);
        return top(filas, (p) => [p.name, p.category]).map((p) => deProducto({ ...p, stockBajo: enStockBajo(p, minimo) }));
      }),
      grupo("clientes", true, async () => top(await BuscadorPanelDB.clientes(tenantId, q), (c) => [c.name, c.phone]).map(deCliente)),
      grupo("pedidos", true, async () => top(await BuscadorPanelDB.pedidos(tenantId, q, ve("clientes")), (o) => [o.id, o.customerName]).map(dePedido)),
      grupo("proveedores", true, async () => top(await BuscadorPanelDB.proveedores(tenantId, q), (s) => [s.name, s.ruc]).map(deProveedor)),
      grupo("guias", libroForestal, async () => (await guiasP).map((g) => deGuia(g, conLoth))),
      grupo("anexos", conCtp, async () => (await anexosP).map(deAnexo)),
      grupo("trozas", conCtp, async () => top(await BuscadorPanelDB.trozas(tenantId, q), (t) => [t.codificacion, t.codigoPlanta]).map(deTroza)),
      grupo("permisos", conCtp, async () => {
        const [directos, guias, anexos] = await Promise.all([BuscadorPanelDB.permisos(tenantId, q), guiasP, anexosP]);
        const relacionados = await BuscadorPanelDB.permisosRelacionados(
          tenantId,
          guias.map((g) => g.contratoId ?? ""),
          anexos.map((a) => a.permiso ?? ""),
        );
        return permisosConRelacionados(directos, relacionados, q);
      }),
      grupo("lotes", conCtp, async () => top(await BuscadorPanelDB.lotes(tenantId, q), (l) => [l.code, l.permiso]).map(deLote)),
      grupo("partes", libroForestal, async () => top(await BuscadorPanelDB.partes(tenantId, q), (p) => [p.nombre, p.docNumero]).map(deParte)),
      grupo("trabajadores", true, async () => {
        const filas = await BuscadorPanelDB.trabajadores(tenantId, q, nivelDeRol(role) === "completo");
        return deTrabajadores(top(filas, (t) => [t.nombre, t.apodo]), role);
      }),
    ]);

    return NextResponse.json({ results: grupos.flat() }, { headers: NO_GUARDAR });
  } catch (e) {
    logger.error("[search] error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
