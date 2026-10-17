import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { ultimos4 } from "@/lib/camaras/hik-connect-api";
import { listarCamarasHik } from "@/lib/camaras/hik-connect-api.server";

/**
 * GET /api/admin/camaras/hik-connect/camaras — las cámaras de la cuenta de
 * Hik-Connect for Teams, para enlazar cada una con una cámara del sistema
 * (ADR-471). Sólo admin/dueño: es la pantalla de configuración.
 *
 * `{ camaras: [{ resourceId, nombre, serieFinal, enLinea, enlazadaA }] }` —
 * `enlazadaA` = id de la cámara del sistema que ya la usa (o `null`). La serie
 * va recortada: la completa sólo hace falta en el servidor.
 */
export const GET = withApiHandler("camaras-hik-lista", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role, "ver las cámaras de Hik-Connect");
  if (rol) return rol;
  const rl = applyRateLimit(req, "MODERATE", "camaras-hik-lista");
  if (rl) return rl;

  const cred = await CamarasHikConnectDB.credenciales(auth.tenantId);
  if (!cred.ok)
    return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });
  const [lista, cuenta] = await Promise.all([
    listarCamarasHik(auth.tenantId, cred.valor),
    CamarasHikConnectDB.leer(auth.tenantId),
  ]);
  if (!lista.ok) {
    const e = lista.error;
    return NextResponse.json(
      { error: "hikvision", codigo: e.codigo, message: e.mensaje },
      { status: e.tipo === "red" ? 502 : e.tipo === "limite" ? 429 : 422 },
    );
  }
  const enlazadaA = new Map(
    Object.entries(cuenta?.enlaces ?? {}).map(([id, e]) => [e.resourceId, id] as const),
  );
  return NextResponse.json({
    camaras: lista.valor.map((c) => ({
      resourceId: c.resourceId,
      nombre: c.nombre,
      serieFinal: ultimos4(c.deviceSerial),
      enLinea: c.enLinea,
      enlazadaA: enlazadaA.get(c.resourceId) ?? null,
    })),
  });
});
