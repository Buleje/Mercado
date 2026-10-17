"use client";

/**
 * Lo que hay que atender AHORA (no son avisos guardados: es el estado de hoy),
 * armado al abrir el centro de notificaciones: stock bajo, pedidos pendientes,
 * pagos a proveedores vencidos, lotes por vencer y recordatorios.
 *
 * Salió de `NotificationHub` (10-10) con dos arreglos:
 *  - el destino es un `href` del panel; antes mandaba `tabId: "alertas-stock"`
 *    y `"cuentas-pagar"`, que `resolverDestino` no conoce (medido: `null`), así
 *    que «Ver inventario» y «Ver deudas» no llevaban a ningún lado;
 *  - cada alerta sabe su categoría, para mostrarse en su pestaña.
 */
import { useEffect, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";
import type { CategoriaId } from "./notificaciones-categorias";

export interface AlertaAhora {
  id: string;
  categoria: CategoriaId;
  severity: "critical" | "warning";
  title: string;
  description: string;
  action?: { label: string; href: string };
  /** Cuántos son (el número del título): «Reponer 5» lo suma por acción. */
  cantidad?: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

interface Stats {
  lowStockProducts?: number;
  pendingOrders?: number;
  overduePayables?: number;
}

function alertasDeStats(stats: Stats): AlertaAhora[] {
  const out: AlertaAhora[] = [];
  const stock = stats.lowStockProducts ?? 0;
  const pedidos = stats.pendingOrders ?? 0;
  const pagos = stats.overduePayables ?? 0;
  if (pedidos > 0) {
    out.push({
      id: "pedidos-pendientes",
      categoria: "pedidos",
      cantidad: pedidos,
      severity: pedidos > 5 ? "critical" : "warning",
      title: `${pedidos} ${plural(pedidos, "pedido pendiente", "pedidos pendientes")}`,
      description: "Esperan que los confirmes o los despaches.",
      action: { label: "Ver pedidos", href: "/admin?tab=pedidos" },
    });
  }
  if (stock > 0) {
    out.push({
      id: "stock-bajo",
      categoria: "inventario",
      cantidad: stock,
      severity: stock > 10 ? "critical" : "warning",
      title: `${stock} ${plural(stock, "producto con stock bajo", "productos con stock bajo")}`,
      description: "Se están acabando: repónlos antes de quedarte sin nada.",
      action: { label: "Ver stock", href: "/admin?tab=inventario&vista=stock" },
    });
  }
  if (pagos > 0) {
    out.push({
      id: "pagos-vencidos",
      categoria: "plata",
      cantidad: pagos,
      severity: "warning",
      title: `${pagos} ${plural(pagos, "pago a proveedor vencido", "pagos a proveedores vencidos")}`,
      description: "Deudas con proveedores que ya pasaron su fecha.",
      action: { label: "Ver por pagar", href: "/admin?tab=compras&vista=cuentas-por-pagar" },
    });
  }
  return out;
}

function alertasDeLotes(
  items: Array<{ expiryDate?: string; fechaVencimiento?: string }>,
): AlertaAhora[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let criticos = 0;
  let pronto = 0;
  for (const b of items) {
    const dias = Math.round(
      (new Date(b.expiryDate || b.fechaVencimiento || 0).getTime() - hoy.getTime()) / 86_400_000,
    );
    if (dias <= 3) criticos++;
    else if (dias <= 7) pronto++;
  }
  const accion = { label: "Ver lotes", href: "/admin?tab=inventario&vista=lotes" };
  const out: AlertaAhora[] = [];
  if (criticos > 0) {
    out.push({
      id: "vencimiento-critico",
      categoria: "inventario",
      cantidad: criticos,
      severity: "critical",
      title: `${criticos} ${plural(criticos, "producto vence", "productos vencen")} en 3 días o menos`,
      description: "Véndelos o retíralos antes de que venzan.",
      action: accion,
    });
  }
  if (pronto > 0) {
    out.push({
      id: "vencimiento-pronto",
      categoria: "inventario",
      cantidad: pronto,
      severity: "warning",
      title: `${pronto} ${plural(pronto, "producto vence", "productos vencen")} esta semana`,
      description: "Ponlos en oferta para que salgan rápido.",
      action: accion,
    });
  }
  return out;
}

function alertasDeRecordatorios(
  lista: Array<{ status?: string; priority?: string }>,
): AlertaAhora[] {
  const vencidos = lista.filter((r) => r.status === "vencido").length;
  const altos = lista.filter((r) => r.status === "pendiente" && r.priority === "alta").length;
  const out: AlertaAhora[] = [];
  if (vencidos > 0) {
    out.push({
      id: "recordatorios-vencidos",
      categoria: "sistema",
      severity: "critical",
      title: `${vencidos} ${plural(vencidos, "recordatorio vencido", "recordatorios vencidos")}`,
      description: "Tareas que ya pasaron su fecha límite.",
    });
  }
  if (altos > 0) {
    out.push({
      id: "recordatorios-alta",
      categoria: "sistema",
      severity: "warning",
      title: `${altos} ${plural(altos, "recordatorio", "recordatorios")} de alta prioridad`,
      description: "Tareas importantes para hoy.",
    });
  }
  return out;
}

/**
 * Stats y lotes por vencer ya los leyó la campana (cachedJson 30 s): al abrir
 * el centro salen sin pedirlos de nuevo. «Actualizar» (`fresco`) pide de verdad.
 */
function leer(url: string, fresco: boolean): Promise<unknown> {
  if (fresco) invalidateCachedJson(url);
  return cachedJson(url, 30_000);
}

/** Se pide al abrir y con cada «Actualizar» (`recarga`). */
export function useAlertasConsolidadas(abierto: boolean, recarga: number) {
  // /api/admin/stats sólo deja pasar a admin (roles-rutas-panel): sin este gate
  // el almacenero recibía 403 al abrir las notificaciones.
  const rol = useMiRol();
  const puedeStats = puedePedir("/api/admin/stats", rol);
  const [alertas, setAlertas] = useState<AlertaAhora[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setCargando(true);
    const fresco = recarga > 0;
    void Promise.all([
      puedeStats ? leer("/api/admin/stats", fresco) : Promise.resolve(null),
      leer("/api/batches/expiring", fresco),
      leer("/api/reminders", fresco),
    ]).then(([stats, lotes, recordatorios]) => {
      if (!vivo) return;
      const listaLotes = Array.isArray(lotes)
        ? lotes
        : ((lotes as { items?: unknown[] } | null)?.items ?? []);
      const todas = [
        ...(stats && typeof stats === "object" ? alertasDeStats(stats as Stats) : []),
        ...alertasDeLotes(listaLotes as Array<{ expiryDate?: string }>),
        ...alertasDeRecordatorios(Array.isArray(recordatorios) ? recordatorios : []),
      ];
      // Urgente primero; dentro de cada nivel, el orden de arriba.
      todas.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
      setAlertas(todas);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [abierto, recarga, puedeStats]);

  return { alertas, cargando };
}
