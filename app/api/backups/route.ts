import { NextRequest, NextResponse } from "next/server";
import { BackupsDB } from "@/lib/db/backups.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";

export type BackupEntry = {
  id: string; name: string; type: "manual" | "auto";
  size: string; sizeBytes: number; modules: string[];
  createdAt: string; status: "completado" | "en-progreso" | "fallido";
  retention: string; downloadUrl?: string;
};

const DEMO_BACKUPS: BackupEntry[] = [
  { id: "bk1", name: "Backup automático diario", type: "auto", size: "4.2 MB", sizeBytes: 4404019, modules: ["Productos", "Pedidos", "Clientes", "Ventas"], createdAt: "2026-03-22T03:00:00Z", status: "completado", retention: "30 días" },
  { id: "bk2", name: "Backup automático diario", type: "auto", size: "4.1 MB", sizeBytes: 4300000, modules: ["Productos", "Pedidos", "Clientes", "Ventas"], createdAt: "2026-03-21T03:00:00Z", status: "completado", retention: "30 días" },
  { id: "bk3", name: "Backup manual — previo a migración", type: "manual", size: "4.0 MB", sizeBytes: 4194304, modules: ["Completo"], createdAt: "2026-03-20T14:35:00Z", status: "completado", retention: "90 días" },
  { id: "bk4", name: "Backup automático diario", type: "auto", size: "3.9 MB", sizeBytes: 4090000, modules: ["Productos", "Pedidos", "Clientes", "Ventas"], createdAt: "2026-03-20T03:00:00Z", status: "completado", retention: "30 días" },
  { id: "bk5", name: "Backup automático diario", type: "auto", size: "—", sizeBytes: 0, modules: ["Productos", "Pedidos", "Clientes", "Ventas"], createdAt: "2026-03-19T03:00:00Z", status: "fallido", retention: "30 días" },
  { id: "bk6", name: "Backup semanal", type: "auto", size: "3.8 MB", sizeBytes: 3984588, modules: ["Completo"], createdAt: "2026-03-16T03:00:00Z", status: "completado", retention: "90 días" },
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // El sistema de backup real usa el endpoint /api/backup (descarga JSON).
  // Este endpoint devuelve el historial de backups registrados en actividad.
  try {
    const entries = await BackupsDB.listFromActivityLog(auth.tenantId);
    const totalSizeBytes = entries.reduce((s, b) => s + b.sizeBytes, 0);
    return NextResponse.json({ backups: entries, totalSizeBytes });
  } catch {
    const totalSizeBytes = DEMO_BACKUPS.reduce((s, b) => s + b.sizeBytes, 0);
    return NextResponse.json({ backups: DEMO_BACKUPS, totalSizeBytes, demo: true });
  }
}

export async function POST(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "backups-post");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("Backup", "configuracion", "Backup manual iniciado desde panel", undefined, auth.username ?? "admin", requestId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  // Disparar la descarga del backup real en el cliente redirigiendo a /api/backup
  return NextResponse.json({ ok: true, downloadUrl: "/api/backup", message: "Backup iniciado correctamente" });
}
