import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { SuperadminCredencialesDB } from "@/lib/db/superadmin-credenciales.db";
import { desbloqueoVigente, estadoCandado, totpActivo } from "@/lib/superadmin/candado";
import type { CredencialesRespuesta } from "@/lib/superadmin/candado-reglas";
import { baseVerificacion } from "@/lib/tenant-url-publica";
import { ROOT_DOMAIN } from "@/lib/middleware/constants";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/[slug]/credenciales
 *
 * Quién entra a la tienda: usuario de ingreso, correo, rol, último ingreso, si
 * debe cambiar la contraseña, y la dirección del panel. Detrás del candado del
 * superadmin:
 *   401 sin sesión de plataforma
 *   423 sin desbloqueo vigente (`{ error: "candado_cerrado", configurado, tipo }`)
 *   404 tienda inexistente
 * Nunca devuelve hashes ni secretos de 2FA. Cada vista queda en el registro de
 * auditoría (Ley 29733).
 */

const SlugSchema = z.string().trim().min(1).max(100);
const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const slugOk = SlugSchema.safeParse((await params).slug);
  if (!slugOk.success) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  const slug = slugOk.data;

  try {
    const desb = await desbloqueoVigente(req, auth.username);
    if (!desb) {
      const estado = await estadoCandado(auth.username);
      return NextResponse.json(
        {
          error: "candado_cerrado",
          configurado: estado.configurado,
          tipo: estado.tipo,
          bloqueadoHasta: estado.bloqueadoHasta,
          totpActivo: await totpActivo(auth.username),
        },
        { status: 423, headers: NO_STORE },
      );
    }

    const tienda = await SuperadminCredencialesDB.tiendaPorSlug(slug);
    if (!tienda) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404, headers: NO_STORE });

    const usuarios = await SuperadminCredencialesDB.usuarios(tienda.id);
    const ingresos = await SuperadminCredencialesDB.ultimosIngresos(
      tienda.id,
      usuarios.map((u) => u.username),
    );
    const principalId = usuarios.find((u) => u.active)?.id ?? null;
    const { base, fuente } = baseVerificacion({
      slug: tienda.slug,
      customDomain: tienda.customDomain,
      rootDomain: ROOT_DOMAIN,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL?.trim() || req.nextUrl.origin,
    });

    await logSuperadminAction(
      "credenciales_ver",
      `Vio las credenciales de ${tienda.slug} (${tienda.name}): ${usuarios.length} usuario(s)`,
      { tenantSlug: tienda.slug, tenantId: tienda.id, usuarios: usuarios.length },
      auth.username,
    );

    const body: CredencialesRespuesta = {
      tienda: { slug: tienda.slug, nombre: tienda.name, activa: tienda.active, telefonoDueno: tienda.ownerPhone },
      ingreso: { url: `${base}/admin`, fuente },
      usuarios: usuarios.map((u) => ({
        id: u.id,
        usuario: u.username,
        nombre: u.name,
        rol: u.role,
        activo: u.active,
        // AdminUser no tiene correo: el único que hay es el del dueño (Tenant.ownerEmail),
        // y va en la fila del admin principal.
        correo: u.id === principalId ? tienda.ownerEmail : null,
        debeCambiarContrasena: u.mustChangePassword,
        dobleFactor: u.dobleFactor,
        ultimoIngreso: ingresos.get(u.username)?.toISOString() ?? null,
        principal: u.id === principalId,
      })),
      desbloqueadoHasta: desb.vence,
      tipoCandado: desb.estado.tipo,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/credenciales] GET", { err: e instanceof Error ? e.message : String(e), slug });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
