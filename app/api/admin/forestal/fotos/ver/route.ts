import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { esPathDeCargaDelTenant } from "@/lib/forestal/fotos-carga";
import { firmarFotoCarga } from "@/lib/forestal/fotos-carga-storage";
import { isSpecializationEnabled } from "@/lib/specializations";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { cacheStore } from "@/lib/cache";

/**
 * GET /api/admin/forestal/fotos/ver?p=<tenantId>/forestal-carga/<uuid>.webp
 *
 * La puerta de las fotos PRIVADAS de la carga: sesión del libro + el path tiene
 * que ser de la carpeta de ESTE tenant (sin `..`, un solo tramo) → 302 a una URL
 * firmada de 10 min. Otro tenant o un path raro → 404 (no 403: no se confirma
 * que exista). `<img src>` sigue el redirect solo, así que el cliente usa esta
 * ruta directo como `src` (ver `srcDeFoto`).
 *
 * `Cache-Control: private, max-age=300`: el navegador reusa el redirect 5 min
 * (menos que los 10 de la firma, para no servir una vencida) y ningún proxy
 * compartido lo guarda.
 *
 * Cada vista queda en el registro de actividad (Ley 29733): la foto muestra
 * dónde estaba el teléfono y el nombre de quien la sacó — un dato personal que
 * se consulta deja rastro de quién lo consultó. Una vez por persona y foto por
 * hora (la ficha pide la misma miniatura en cada render): sin eso, 40
 * miniaturas × cada apertura inundaban el log y lo volvían ilegible.
 */

/** Una vista por persona+foto cada hora. Por instancia: basta para no inundar. */
const DEDUPE_VISTA_SEG = 60 * 60;
export const GET = withApiHandler("forestal-fotos-ver", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Una ficha con 40 miniaturas son 40 pedidos: el preset de LECTURA del drive. */
  const rl = await applyRateLimit(req, "DRIVE_READ", "forestal-fotos-ver");
  if (rl) return rl;

  /* Mismo candado que el resto del libro: con el módulo apagado, sus fotos
     tampoco se sirven. */
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
      { status: 403 },
    );
  }

  const p = req.nextUrl.searchParams.get("p") ?? "";
  if (!esPathDeCargaDelTenant(p, auth.tenantId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const firmada = await firmarFotoCarga(p);
  if (!firmada) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const quien = auth.username || "unknown";
  const clave = `forestal-foto-vista:${auth.tenantId}:${quien}:${p}`;
  if (cacheStore.get<true>(clave) == null) {
    cacheStore.set(clave, true, DEDUPE_VISTA_SEG);
    auditCtp({
      tenantId: auth.tenantId,
      action: "ctp_foto_ver",
      entity: "WoodEntry",
      entityId: p.slice(p.lastIndexOf("/") + 1),
      detail: `Vio la foto de la carga ${p.slice(p.lastIndexOf("/") + 1)} (incluye ubicación y nombre de quien la sacó)`,
      user: quien,
    });
  }

  return new NextResponse(null, {
    status: 302,
    headers: { Location: firmada, "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer" },
  });
});
