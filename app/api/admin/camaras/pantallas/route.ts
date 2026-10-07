import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CamarasDB } from "@/lib/db/camaras.db";
import { PantallasTvDB } from "@/lib/db/pantallas-tv.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { nubeFueraDeLaLista } from "@/lib/camaras/tv-camaras.server";
import { marcarParVinculado, tomarParTv } from "@/lib/camaras/tv-emparejar.server";
import { TV_DURACIONES_HORAS, codigoTvValido, normalizarCodigoTv } from "@/lib/camaras/pantallas-tv";

/**
 * /api/admin/camaras/pantallas — los televisores que ven las cámaras (Modo TV,
 * ADR-473). Sólo admin y dueño: conectar una pantalla es mostrar el patio en
 * un lugar que puede ser público (`requireAdmin` deja pasar al encargado: se
 * corta aparte, como en `miradas`).
 *
 * GET    — `{ pantallas: PantallaTv[] }` (las vigentes).
 * POST   — `VincularPantallaInput` `{ codigo, nombre, camaras: string[] | null, horas }`
 *          → 201 `{ pantalla, pantallas, mensaje, aviso? }` (`aviso`: eligió
 *          cámaras de Hik-Connect sueltas, que en el TV no se verán por la nube). El código tiene que estar
 *          esperando (404 vencido · 409 ya usado o vinculándose) y las cámaras
 *          ser de este negocio (404). Máximo 10 pantallas (409).
 * DELETE — `?id=` desconecta: el TV deja de ver en su próximo pedido.
 */

const vincularSchema = z.object({
  codigo: z.string().max(20).transform(normalizarCodigoTv).refine(codigoTvValido),
  nombre: z.string().trim().min(1).max(60),
  camaras: z.array(z.string().trim().min(1).max(64)).min(1).max(50).nullable(),
  horas: z.literal(TV_DURACIONES_HORAS),
});

const json = (cuerpo: unknown, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

async function guardia(req: NextRequest, escritura: boolean) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "conectar pantallas a las cámaras");
  if (prohibido) return prohibido;
  if (escritura) {
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
  }
  const rl = applyRateLimit(req, escritura ? "MODERATE" : "GENEROUS", "camaras-pantallas");
  if (rl) return rl;
  return auth;
}

export const GET = withApiHandler("camaras-pantallas-get", async (req: NextRequest) => {
  const auth = await guardia(req, false);
  if (auth instanceof Response) return auth;
  return json({ pantallas: await PantallasTvDB.listar(auth.tenantId) });
});

export const POST = withApiHandler("camaras-pantallas-post", async (req: NextRequest) => {
  const auth = await guardia(req, true);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const p = vincularSchema.safeParse(body);
  if (!p.success) {
    return json(
      { error: "validation_error", message: "Revisa el código de 6 letras, el nombre y las cámaras." },
      400,
    );
  }
  const { codigo, nombre, camaras, horas } = p.data;
  const user = auth.username ?? "unknown";

  /* Las cámaras se buscan DENTRO de este negocio: un id de otro no existe acá. */
  let aviso: string | null = null;
  if (camaras) {
    const delNegocio = await CamarasDB.list(auth.tenantId);
    const propias = new Set(delNegocio.map((c) => c.id));
    if (camaras.some((id) => !propias.has(id))) {
      return json({ error: "no_encontrada", message: "Alguna de esas cámaras no es de este negocio." }, 404);
    }
    /* La nube sólo va a pantallas con todas las cámaras de Hik-Connect (ADR-473). */
    const enlaces = (await CamarasHikConnectDB.leer(auth.tenantId))?.enlaces ?? {};
    const elegidasDeLaNube = camaras.filter((id) => enlaces[id]);
    if (elegidasDeLaNube.length > 0 && nubeFueraDeLaLista(delNegocio, enlaces, camaras).length > 0) {
      const nombres = delNegocio.filter((c) => elegidasDeLaNube.includes(c.id)).map((c) => c.nombre);
      aviso = `${nombres.join(", ")} ${nombres.length === 1 ? "es" : "son"} de Hik-Connect: en este televisor se ${nombres.length === 1 ? "verá" : "verán"} sólo si eliges todas las cámaras de Hik-Connect (o «todas»).`;
    }
  }

  const toma = await tomarParTv(codigo);
  if (!toma.ok) {
    if (toma.motivo === "vencido")
      return json({ error: "codigo_vencido", message: "Ese código no existe o ya venció. Mira el que muestra el televisor ahora." }, 404);
    return json(
      {
        error: "codigo_usado",
        message: toma.motivo === "ocupado" ? "Ese código se está vinculando en este momento." : "Ese código ya se usó.",
      },
      409,
    );
  }
  try {
    const r = await PantallasTvDB.crear(auth.tenantId, { nombre, camaras: camaras ? [...new Set(camaras)] : null, horas }, user);
    if (!r.ok) return json({ error: "limite", message: r.motivo }, 409);
    const marcado = await marcarParVinculado(codigo, {
      tid: auth.tenantId,
      pid: r.pantalla.id,
      nombre: r.pantalla.nombre,
      expiraEn: r.pantalla.expiraEn,
    });
    if (!marcado) {
      /* El código venció justo entre la toma y la marca: la pantalla no la va
         a recoger nadie, así que no queda creada. */
      await PantallasTvDB.revocar(auth.tenantId, r.pantalla.id, user);
      return json({ error: "codigo_vencido", message: "Ese código venció. Mira el que muestra el televisor ahora." }, 404);
    }
    return json(
      {
        pantalla: r.pantalla,
        pantallas: await PantallasTvDB.listar(auth.tenantId),
        mensaje: `Listo: «${r.pantalla.nombre}» ya puede ver las cámaras.`,
        ...(aviso && { aviso }),
      },
      201,
    );
  } finally {
    await toma.soltar().catch((err) => logger.warn("[tv] no se pudo soltar el código", { error: String(err) }));
  }
});

export const DELETE = withApiHandler("camaras-pantallas-delete", async (req: NextRequest) => {
  const auth = await guardia(req, true);
  if (auth instanceof Response) return auth;
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id || id.length > 64) return json({ error: "validation_error", message: "Falta decir qué pantalla desconectar." }, 400);
  const quitada = await PantallasTvDB.revocar(auth.tenantId, id, auth.username ?? "unknown");
  if (!quitada) return json({ error: "no_encontrada", message: "Esa pantalla ya no está conectada." }, 404);
  return json({ pantallas: await PantallasTvDB.listar(auth.tenantId), mensaje: "Pantalla desconectada." });
});
