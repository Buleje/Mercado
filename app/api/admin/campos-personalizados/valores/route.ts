import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamposPersonalizadosDB } from "@/lib/db/campos-personalizados.db";
import { nombreDelFormulario, puedeEscribirFormulario } from "@/lib/campos-personalizados";

/**
 * /api/admin/campos-personalizados/valores — lo contestado en un registro (ADR-427).
 *
 * PUT { registroId, valores: [{ campoId, valor }] } → { guardados }
 *
 * Una sola llamada por formulario, no una por celda: guardar un registro es un
 * acto, y N requests dejarían mitad escrito si el segundo falla. Los `campoId`
 * que no son de este negocio (o que son temporales de OTRO registro) no se
 * escriben y vuelven contados en `ignorados`; los que apuntan a un registro que
 * no existe, en `rechazados`.
 *
 * Quién puede: **quien puede escribir en el módulo del formulario**, no
 * cualquiera que tenga sesión. El rol se chequea contra el formulario REAL de
 * los campos (el que dice la base), nunca contra uno que mande el cliente.
 */

/* Puerta de entrada: los roles que pueden llenar ALGÚN formulario. La puerta
   que decide de verdad es `puedeEscribirFormulario`, más abajo: ésta sólo evita
   que un rol sin nada que hacer acá (proveedor, delivery) llegue a consultar la
   base. */
const ROLES_ESCRITURA = ["admin", "owner", "manager", "almacenero", "cajero"] as const;

const putSchema = z.object({
  registroId: z.string().trim().min(1).max(40),
  valores: z
    .array(
      z.object({
        campoId: z.string().trim().min(1).max(40),
        valor: z.string().max(4000).nullable(),
      }),
    )
    .max(200),
});

export const PUT = withApiHandler("campos-personalizados-valores-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_ESCRITURA);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "campos-personalizados");
  if (rl) return rl;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    /* El permiso sale del FORMULARIO, y el formulario sale de la base: el
       cliente manda `campoId`, no la pantalla. Una consulta con `distinct`
       antes de escribir — en la práctica devuelve un solo formulario. */
    const formularios = await CamposPersonalizadosDB.formulariosDeCampos(
      auth.tenantId,
      parsed.data.valores.map((v) => v.campoId),
    );
    const vedado = formularios.find((f) => !puedeEscribirFormulario(auth.role, f));
    if (vedado) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `Tu rol no puede llenar campos de ${nombreDelFormulario(vedado)}.`,
        },
        { status: 403 },
      );
    }

    const r = await CamposPersonalizadosDB.guardarValores(
      auth.tenantId,
      parsed.data.registroId,
      parsed.data.valores,
      auth.username ?? "unknown",
    );
    /* Si NO se escribió nada y todo se rechazó, el registro no existe en este
       negocio. Un 200 con `rechazados: 5` diría la verdad, pero la pantalla
       mostraría «guardado» sobre un guardado que no pasó: cuando no quedó nada
       escrito, el cliente se tiene que enterar. */
    if (r.rechazados > 0 && r.guardados === 0 && r.borrados === 0) {
      return NextResponse.json(
        {
          error: "registro_desconocido",
          message: "Ese registro ya no existe en este negocio: no hay dónde guardar lo escrito.",
          ...r,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(r);
  } catch (err) {
    logger.error("[campos-personalizados-valores.PUT] failed", {
      error: String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
