import { NextResponse, type NextRequest } from "next/server";
import { ShoppingListsDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";
import { requireAdmin } from "@/lib/require-admin";
import { LEEN_LISTAS, ESCRIBEN_LISTAS, ListaSchema } from "./shared";

/**
 * Listas de compra por celular del cliente: SOLO el panel.
 *
 * SECURITY (Ley 29733, 17-10): la ruta no pedía sesión y tomaba el negocio del
 * pedido (`getTenantIdFromRequest`). La salvaba el proxy (`/api/shopping-lists`
 * está en ADMIN_ONLY_API_PREFIXES → 401 sin cookie), pero la sesión de un
 * negocio no se cruzaba con el negocio del host. Ahora: roles de la matriz
 * (`shopping-lists` en role-permissions) y el negocio sale de la sesión.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, LEEN_LISTAS);
  if (auth instanceof NextResponse) return auth;
  try {
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone) return NextResponse.json({ error: "phone requerido" }, { status: 400 });
    const lists = await ShoppingListsDB.getByPhone(auth.tenantId, phone);
    return NextResponse.json(lists);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ESCRIBEN_LISTAS);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "shopping-lists");
  if (rl) return rl;

  try {
    const parsed = ListaSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "customerPhone y name requeridos" }, { status: 400 });
    const { customerPhone, name, items } = parsed.data;
    const list = await ShoppingListsDB.add({ customerPhone, name, items, tenantId: auth.tenantId });
    return NextResponse.json(list, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
