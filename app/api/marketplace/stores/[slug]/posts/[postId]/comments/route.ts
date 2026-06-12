import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { StorePostsDB } from "@/lib/db/store-posts.db";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * Comentario de un vecino en una publicación de tienda (ADR-130).
 * POST — requiere sesión de cliente (el nombre sale de la sesión, no del body).
 */

const schema = z.object({
  body: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const rl = applyRateLimit(req, "STRICT", "marketplace-post-comments-create");
  if (rl) return rl;

  try {
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
    if (!session?.name) {
      return NextResponse.json(
        { error: "Iniciá sesión para comentar" },
        { status: 401 },
      );
    }

    const { slug, postId } = await params;
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const created = await StorePostsDB.addComment(store.tenantId, store.id, postId, {
      authorName: session.name,
      body: parsed.data.body,
      customerId: session.customerId ?? null,
    });
    if (!created) {
      return NextResponse.json(
        { error: "No se pudo comentar (publicación no encontrada)" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        data: {
          id: created.id,
          authorName: session.name,
          body: parsed.data.body,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[STORE-POST-COMMENTS] POST error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
