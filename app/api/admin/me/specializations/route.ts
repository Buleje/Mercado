import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listEnabledSpecializations, SPECIALIZATIONS } from "@/lib/specializations";
import { piezasDelPanel } from "@/lib/extensiones/resolver";
import { MODULO_A_MEDIDA } from "@/extensiones/_contrato";

/**
 * GET /api/admin/me/specializations
 *
 * Lista las especializaciones HABILITADAS para el tenant del admin actual.
 * Usado por el sidebar admin (hook useEnabledSpecs) para mostrar/ocultar
 * tabs de especialización (ADR-124).
 *
 * ADR-457 suma las PIEZAS prendidas del negocio (sólo las suyas: el tenant
 * sale del JWT, nunca del header ni de la query) y, si alguna llena
 * `panel.pestana`, el módulo `a-medida` en `moduleIds` — así los consumidores
 * que ya gatean por módulo muestran la pestaña sin cambiar nada.
 *
 * Todos los roles del panel lo leen (el sidebar del cajero también se arma
 * con esto): por eso `requireAdmin(req)` sin lista de roles.
 *
 * Response:
 *   {
 *     keys: string[], moduleIds: string[],
 *     piezas: { piezaId, enchufe, opciones, version, orden }[],
 *     negocio: { tenantId, slug } | null
 *   }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // `piezasDelPanel` nunca tira (falla cerrado a []): una tabla de piezas
  // caída no puede esconderle al negocio sus módulos de siempre.
  const [keys, panel] = await Promise.all([
    listEnabledSpecializations(auth.tenantId),
    piezasDelPanel(auth.tenantId),
  ]);
  const moduleIds = keys
    .map((k) => SPECIALIZATIONS[k]?.moduleId)
    .filter((m): m is string => Boolean(m));
  if (panel.piezas.some((p) => p.enchufe === "panel.pestana")) moduleIds.push(MODULO_A_MEDIDA);

  return NextResponse.json({ keys, moduleIds, piezas: panel.piezas, negocio: panel.negocio });
}
