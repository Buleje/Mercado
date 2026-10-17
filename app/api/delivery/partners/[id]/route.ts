/**
 * Editar, pausar y borrar UN repartidor (Reparto › Equipo).
 *
 * 17-10: el panel ya llamaba a esta ruta para editar, para «Desactivar» en
 * lote y para borrar, pero nunca existió: todo devolvía 404 y la pantalla
 * seguía como si se hubiera guardado. Borrar se niega si tiene entregas o
 * retiros (se perdería lo que ganó): se ofrece pausarlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { DeliveryPartnersDB } from "@/lib/db/delivery-partners.db";
import { logger } from "@/lib/logger";
import {
  PartnerCambioSchema,
  camposConError,
  limpiarCorreo,
  mensajeTelefonoRepetido,
} from "@/lib/delivery/partner-admin";

type Ctx = { params: Promise<{ id: string }> };

const NO_ESTA = { error: "Ese repartidor ya no está en tu equipo. Actualiza la lista." };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PartnerCambioSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Revisa los campos marcados.", campos: camposConError(parsed.error.issues) },
        { status: 400 },
      );
    }
    const data = limpiarCorreo(parsed.data);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No mandaste nada que cambiar." }, { status: 400 });
    }

    if (data.phone) {
      const repetido = await DeliveryPartnersDB.findByPhone(auth.tenantId, data.phone, id);
      if (repetido) {
        const msg = mensajeTelefonoRepetido(repetido);
        return NextResponse.json({ error: msg, campos: { phone: msg } }, { status: 409 });
      }
    }

    const partner = await DeliveryPartnersDB.updateForAdmin(auth.tenantId, id, data);
    if (!partner) return NextResponse.json(NO_ESTA, { status: 404 });

    const que =
      Object.keys(data).length === 1 && data.isActive !== undefined
        ? data.isActive ? "activado" : "pausado"
        : "editado";
    logActivity(
      "Editar",
      "deliveryPartner",
      `Repartidor ${que}: ${partner.name}`,
      partner.id,
      auth.username,
    ).catch((err) => logger.error("[delivery/partners/id] activity log failed", { error: String(err) }));

    return NextResponse.json(partner);
  } catch (err) {
    logger.error("[delivery/partners/id] PUT failed", { error: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const partner = await DeliveryPartnersDB.findForAdmin(auth.tenantId, id);
    if (!partner) return NextResponse.json(NO_ESTA, { status: 404 });

    // Sus entregas se borrarían en cascada (con la tarifa ganada) y sus
    // retiros traban el borrado en la base: con historial, se pausa.
    const { entregas, retiros } = await DeliveryPartnersDB.contarHistorial(auth.tenantId, id);
    if (entregas > 0 || retiros > 0) {
      const partes = [
        entregas > 0 ? `${entregas} ${entregas === 1 ? "entrega" : "entregas"}` : null,
        retiros > 0 ? `${retiros} ${retiros === 1 ? "retiro" : "retiros"}` : null,
      ].filter(Boolean);
      return NextResponse.json(
        {
          error: `${partner.name} tiene ${partes.join(" y ")} guardados: si lo borras se pierde lo que ganó. Desactívalo: deja de recibir pedidos y su historial queda.`,
          conHistorial: { entregas, retiros },
        },
        { status: 409 },
      );
    }

    const borrado = await DeliveryPartnersDB.deleteForAdmin(auth.tenantId, id);
    if (!borrado) return NextResponse.json(NO_ESTA, { status: 404 });

    logActivity(
      "Eliminar",
      "deliveryPartner",
      `Repartidor eliminado: ${partner.name} (${partner.zone})`,
      id,
      auth.username,
    ).catch((err) => logger.error("[delivery/partners/id] activity log failed", { error: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[delivery/partners/id] DELETE failed", { error: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
