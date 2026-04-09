import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// GET /api/promotions/active — retorna promociones activas para el POS
// Por ahora las promociones viven en localStorage del admin.
// Este endpoint sirve como placeholder para cuando se migren a BD.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Por ahora, las promociones viven en localStorage del admin.
    // Este endpoint sirve como placeholder para cuando se migren a BD.
    // El POS consultará este endpoint para saber qué promos aplicar.
    return NextResponse.json({
      promotions: [],
      message: "Endpoint listo. Las promociones se migrarán a BD próximamente.",
    });
  } catch (e) {
    console.error("[promotions] GET error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
