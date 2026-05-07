import { NextResponse, type NextRequest } from "next/server";
import { BundlesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";


export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.BUNDLES_READ);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    return NextResponse.json(activeOnly ? await BundlesDB.getActive(auth.tenantId) : await BundlesDB.getAll(auth.tenantId));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "bundles"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ALLOWED_ROLES.BUNDLES_WRITE);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    if (!body.name || !body.price || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "name, price, and items required" }, { status: 400 });
    }
    const bundle = await BundlesDB.add({
      name: body.name,
      description: body.description,
      price: Number(body.price),
      image: body.image,
      tenantId: auth.tenantId,
      items: body.items.map((i: { productId: number; quantity: number }) => ({
        productId: Number(i.productId),
        quantity: Number(i.quantity) || 1,
      })),
    });
    return NextResponse.json(bundle, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
