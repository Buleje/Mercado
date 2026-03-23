export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export type SecurityLogEntry = {
  id: string; timestamp: string; actor: string; action: string;
  category: "auth" | "data" | "config" | "security";
  severity: "info" | "warning" | "critical";
  ip: string; details: string; success: boolean;
};

const DEMO_LOGS: SecurityLogEntry[] = [
  { id: "sl1", timestamp: "2026-03-22T08:15:00Z", actor: "admin", action: "Inicio de sesión", category: "auth", severity: "info", ip: "192.168.1.10", details: "Acceso exitoso al panel de administración", success: true },
  { id: "sl2", timestamp: "2026-03-22T08:32:00Z", actor: "cajero1", action: "Inicio de sesión", category: "auth", severity: "info", ip: "192.168.1.11", details: "Acceso exitoso al sistema de caja", success: true },
  { id: "sl3", timestamp: "2026-03-22T09:05:00Z", actor: "desconocido", action: "Intento de acceso fallido", category: "auth", severity: "warning", ip: "45.33.21.87", details: "3 intentos fallidos con usuario 'admin' desde IP externa", success: false },
  { id: "sl4", timestamp: "2026-03-22T09:20:00Z", actor: "admin", action: "Cambio de permisos", category: "config", severity: "warning", ip: "192.168.1.10", details: "Rol de 'cajero2' actualizado de 'cajero' a 'almacenero'", success: true },
  { id: "sl5", timestamp: "2026-03-22T10:00:00Z", actor: "admin", action: "Exportación de datos", category: "data", severity: "info", ip: "192.168.1.10", details: "Exportación CSV de clientes — 247 registros", success: true },
  { id: "sl6", timestamp: "2026-03-22T10:45:00Z", actor: "almacenero1", action: "Acceso denegado", category: "security", severity: "warning", ip: "192.168.1.12", details: "Intento de acceder a módulo de finanzas sin permisos", success: false },
  { id: "sl7", timestamp: "2026-03-22T11:30:00Z", actor: "admin", action: "Backup manual", category: "config", severity: "info", ip: "192.168.1.10", details: "Backup completo iniciado manualmente por administrador", success: true },
  { id: "sl8", timestamp: "2026-03-22T13:15:00Z", actor: "desconocido", action: "Intento de acceso fallido", category: "auth", severity: "critical", ip: "185.220.101.5", details: "50+ intentos de fuerza bruta desde IP de Tor — bloqueada", success: false },
  { id: "sl9", timestamp: "2026-03-22T14:00:00Z", actor: "cajero1", action: "Cierre de sesión", category: "auth", severity: "info", ip: "192.168.1.11", details: "Sesión cerrada correctamente", success: true },
  { id: "sl10", timestamp: "2026-03-21T20:30:00Z", actor: "admin", action: "Cambio de contraseña", category: "security", severity: "info", ip: "192.168.1.10", details: "Contraseña de cuenta admin actualizada exitosamente", success: true },
  { id: "sl11", timestamp: "2026-03-21T18:00:00Z", actor: "cajero2", action: "Inicio de sesión", category: "auth", severity: "info", ip: "192.168.1.13", details: "Acceso exitoso", success: true },
  { id: "sl12", timestamp: "2026-03-21T16:45:00Z", actor: "admin", action: "Eliminación de producto", category: "data", severity: "warning", ip: "192.168.1.10", details: "Producto 'Aceite Vegetal 500ml' eliminado del catálogo", success: true },
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const severity = req.nextUrl.searchParams.get("severity") ?? undefined;
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;

  try {
    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(category && { entity: category }),
        ...(from && { createdAt: { gte: new Date(from) } }),
        ...(to && { createdAt: { lte: new Date(to) } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (rows.length === 0) throw new Error("empty");

    const entries: SecurityLogEntry[] = rows.map((r) => ({
      id: r.id, timestamp: r.createdAt.toISOString(), actor: r.user,
      action: r.action, category: (r.entity as SecurityLogEntry["category"]) ?? "auth",
      severity: "info", ip: "—", details: r.detail, success: true,
    }));

    // Filtro severidad en memoria si viene del log de actividad
    const filtered = severity ? entries.filter((e) => e.severity === severity) : entries;
    return NextResponse.json({ logs: filtered, total: filtered.length });
  } catch {
    let demo = DEMO_LOGS;
    if (category) demo = demo.filter((l) => l.category === category);
    if (severity) demo = demo.filter((l) => l.severity === severity);
    if (from) demo = demo.filter((l) => l.timestamp >= from);
    if (to) demo = demo.filter((l) => l.timestamp <= to);
    return NextResponse.json({ logs: demo.slice(0, limit), total: demo.length, demo: true });
  }
}
