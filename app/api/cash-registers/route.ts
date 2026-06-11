import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limitParam = searchParams.get("limit");

    if (limitParam !== null || cursor) {
      const limit = Math.min(Math.max(1, parseInt(limitParam ?? "25", 10)), 200);
      const result = await withDbRetry(() => CashRegistersDB.getAllPaginated(auth.tenantId, limit, cursor));
      return NextResponse.json(result);
    }

    return NextResponse.json(await withDbRetry(() => CashRegistersDB.getAll(auth.tenantId)));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  // Y6 FIX 2026-05-07: faltaba await. Sin él applyRateLimit devolvía una
  // Promise (siempre truthy) → el guard cortaba TODOS los POST sin importar
  // el rate actual — ningún cajero podía abrir caja.
  const rateLimitResult = await applyRateLimit(req, "STRICT", "cash-registers-post");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "open") {
      // SECURITY 2026-05-05 (audit POS #6): validar openingAmount.
      // Antes `Number(...) || 0` aceptaba negativos, NaN, y montos
      // arbitrarios — cajero podía abrir caja con S/-1000 y descuadrar.
      const rawAmount = Number(body.openingAmount);
      const openingAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
      if (openingAmount < 0 || openingAmount > 50000) {
        return NextResponse.json(
          { error: "openingAmount fuera de rango (0–50000)" },
          { status: 400 },
        );
      }
      // Check if there's already an open register
      const open = await CashRegistersDB.getOpen(auth.tenantId);
      if (open) {
        return NextResponse.json({ error: "Ya hay una caja abierta" }, { status: 400 });
      }
      // QA Brandon 2026-06-10 #12: el Cuadre (CashAuditTab) deriva el nombre
      // del cajero parseando `notes.split(" (")[0]` — si notes iba vacío
      // mostraba "Cajero" genérico. Ahora el nombre del operador autenticado
      // SIEMPRE encabeza las notes con la convención "Nombre (detalle)".
      const operator = (auth.name?.trim() || auth.username || "").trim();
      const userNotes = typeof body.notes === "string" ? body.notes.trim() : "";
      const notes = operator
        ? userNotes
          ? `${operator} (${userNotes})`
          : operator
        : userNotes || undefined;
      const reg = await CashRegistersDB.open(auth.tenantId, openingAmount, notes);
      return NextResponse.json(reg, { status: 201 });
    }

    return NextResponse.json({ error: "action required (open)" }, { status: 400 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
