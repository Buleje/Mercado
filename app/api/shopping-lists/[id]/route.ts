import { NextResponse, type NextRequest } from "next/server";
import { ShoppingListsDB } from "@/lib/jsondb";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { LEEN_LISTAS, ESCRIBEN_LISTAS, ListaSchema } from "../shared";

// SECURITY (Ley 29733, 17-10): mismo candado que `/api/shopping-lists` —
// roles de la matriz y el negocio de la sesión, nunca del pedido.

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
  const _rl = applyRateLimit(req, "STRICT", "shopping-lists-X"); if (_rl) return _rl;
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
