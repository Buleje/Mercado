import "server-only";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSupplierToken,
  getSupplierPayload,
  SUPPLIER_SESSION,
} from "@/lib/supplier-session";
import { toErrorPayload } from "@/lib/api-error";

// ── Schemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  apiKey: z.string().min(1, "apiKey es requerido"),
});

// ── POST /api/supplier/auth — login con API Key ──────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const portal = await prisma.supplierPortal.findUnique({
      where: { apiKey: parsed.data.apiKey },
      include: {
        supplier: {
          select: { id: true, name: true, tenantId: true },
        },
      },
    });

    if (!portal || !portal.isActive) {
      return NextResponse.json({ error: "API Key inválida o portal inactivo" }, { status: 401 });
    }

    const token = await createSupplierToken({
      supplierId: portal.supplier.id,
      supplierName: portal.supplier.name,
      tenantId: portal.supplier.tenantId,
    });

    const res = NextResponse.json({
      supplier: { id: portal.supplier.id, name: portal.supplier.name },
      tenant: { id: portal.supplier.tenantId },
    });

    res.cookies.set(SUPPLIER_SESSION.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SUPPLIER_SESSION.MAX_AGE,
      path: "/",
    });

    return res;
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

// ── GET /api/supplier/auth — verificar sesión activa ─────────────────────────

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SUPPLIER_SESSION.COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const payload = await getSupplierPayload(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      supplier: { id: payload.supplierId, name: payload.supplierName },
      tenant: { id: payload.tenantId },
    });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

// ── DELETE /api/supplier/auth — logout ───────────────────────────────────────

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SUPPLIER_SESSION.COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
