import "server-only";
import { prisma } from "@/lib/prisma";
import { createNotification } from "./create-notification";

export async function generateNotifications(tenantId: string): Promise<number> {
  let count = 0;

  // 1. FIADO_VENCIDO: fiados activos con fechaVence < ahora
  try {
    const fiadosVencidos = await prisma.fiado.findMany({
      where: { tenantId, status: "ACTIVO", fechaVence: { lt: new Date() } },
      include: { Customer: { select: { name: true } } },
      take: 10,
    });
    for (const f of fiadosVencidos) {
      await createNotification({
        tenantId,
        type: "FIADO_VENCIDO",
        severity: "HIGH",
        title: `Fiado vencido: ${f.Customer?.name || f.customerId}`,
        body: `Deuda de S/${Number(f.saldo).toFixed(2)} está vencida`,
        actionUrl: "/admin?tab=fiados",
        actionLabel: "Ver fiado",
        entityId: f.id,
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  // 2. STOCK_CRITICO: productos con stock <= stockMin
  try {
    const productos = await prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        stock: { not: null },
        stockMin: { not: null },
      },
    });
    for (const p of productos) {
      if (p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin) {
        await createNotification({
          tenantId,
          type: "STOCK_CRITICO",
          severity: p.stock === 0 ? "HIGH" : "MEDIUM",
          title: `Stock crítico: ${p.name}`,
          body: `Solo ${p.stock} unidad(es) — mínimo: ${p.stockMin}`,
          actionUrl: "/admin?tab=inventario",
          actionLabel: "Ver stock",
          entityId: String(p.id),
        });
        count++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 3. TURNO_SIN_CERRAR: turno abierto hace más de 14 horas
  try {
    const turnosViejos = await prisma.turno.findMany({
      where: {
        tenantId,
        status: "ABIERTO",
        abrioEn: { lt: new Date(Date.now() - 14 * 60 * 60 * 1000) },
      },
    });
    for (const t of turnosViejos) {
      await createNotification({
        tenantId,
        type: "TURNO_SIN_CERRAR",
        severity: "HIGH",
        title: "Turno sin cerrar",
        body: "Turno abierto hace más de 14 horas",
        actionUrl: "/admin?tab=turnos",
        actionLabel: "Cerrar turno",
        entityId: t.id,
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  // 4. PROVEEDOR_VENCIDO: payables vencidas o por vencer en 2 días
  try {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const payables = await prisma.payable.findMany({
      where: {
        tenantId,
        status: { not: "pagado" },
        dueDate: { lte: twoDaysFromNow },
      },
      take: 10,
    });
    for (const p of payables) {
      const isOverdue = p.dueDate < new Date();
      await createNotification({
        tenantId,
        type: "PROVEEDOR_VENCIDO",
        severity: isOverdue ? "HIGH" : "MEDIUM",
        title: isOverdue
          ? `Factura vencida: ${p.supplierName || "Proveedor"}`
          : "Factura por vencer",
        body: `S/${Number(p.amount).toFixed(2)} — vence ${p.dueDate.toLocaleDateString("es-PE")}`,
        actionUrl: "/admin?tab=compras",
        actionLabel: "Ver factura",
        entityId: p.id,
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  // 5. DIFERENCIA_CAJA: cajas cerradas en las ultimas 24h con diferencia significativa
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const closedRegisters = await prisma.cashRegister.findMany({
      where: {
        tenantId,
        status: "cerrada",
        closedAt: { gte: oneDayAgo },
        difference: { not: null },
      },
      take: 10,
    });
    for (const r of closedRegisters) {
      const diff = r.difference ?? 0;
      if (Math.abs(diff) > 20) {
        const severity = Math.abs(diff) > 50 ? "HIGH" as const : "MEDIUM" as const;
        await createNotification({
          tenantId,
          type: "DIFERENCIA_CAJA",
          severity,
          title: `Diferencia de caja: ${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`,
          body: `Caja cerrada el ${r.closedAt?.toLocaleDateString("es-PE") ?? "hoy"} con diferencia ${diff < 0 ? "negativa" : "positiva"} de S/${Math.abs(diff).toFixed(2)}`,
          actionUrl: "/admin?tab=caja",
          actionLabel: "Ver caja",
          entityId: r.id,
        });
        count++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 6. DIFERENCIA_CAJA from DailySummary
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const summaries = await prisma.dailySummary.findMany({
      where: {
        tenantId,
        createdAt: { gte: oneDayAgo },
      },
      take: 5,
    });
    for (const s of summaries) {
      const diff = Number(s.diferenciaCaja);
      if (Math.abs(diff) > 20) {
        const severity = Math.abs(diff) > 50 ? "HIGH" as const : "MEDIUM" as const;
        await createNotification({
          tenantId,
          type: "DIFERENCIA_CAJA",
          severity,
          title: `Diferencia de caja diaria: ${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`,
          body: `Resumen del ${s.fecha.toLocaleDateString("es-PE")} — Creado por: ${s.creadoPor}`,
          actionUrl: "/admin?tab=caja",
          actionLabel: "Ver resumen",
          entityId: s.id,
        });
        count++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 7. CLIENTE_INACTIVO: clientes VIP (totalSpent > 500) que no compran hace 15+ días
  // Mejora 15: Top 10 clientes reciben alerta HIGH con dedup reducida (12h)
  try {
    const vipCustomers = await prisma.customer.findMany({
      where: {
        tenantId,
        totalSpent: { gte: 500 },
      },
      select: {
        phone: true,
        name: true,
        totalSpent: true,
      },
      orderBy: { totalSpent: "desc" },
      take: 50,
    });

    // Top 10 por gasto total — tratamiento especial
    const top10Phones = new Set(vipCustomers.slice(0, 10).map(c => c.phone));
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    for (const customer of vipCustomers) {
      const lastSale = await prisma.sale.findFirst({
        where: { customerPhone: customer.phone },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      const lastOrder = await prisma.order.findFirst({
        where: {
          customerPhone: customer.phone,
          status: { not: "cancelado" },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      const lastActivity = [lastSale?.createdAt, lastOrder?.createdAt]
        .filter(Boolean)
        .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];

      if (!lastActivity || lastActivity < fifteenDaysAgo) {
        const daysSince = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        const isTop10 = top10Phones.has(customer.phone);
        // Top 10: siempre HIGH, entityId con fecha para dedup diaria (12h window)
        const dateSuffix = isTop10 ? `-${new Date().toISOString().slice(0, 10)}` : "";

        await createNotification({
          tenantId,
          type: "CLIENTE_INACTIVO",
          severity: isTop10 ? "HIGH" : (daysSince > 30 ? "HIGH" : "MEDIUM"),
          title: isTop10
            ? `Cliente TOP inactivo: ${customer.name}`
            : `Cliente VIP inactivo: ${customer.name}`,
          body: isTop10
            ? `Gasto S/${Number(customer.totalSpent).toFixed(0)} total. No compra hace ${daysSince} dias. Contactar urgente!`
            : `${customer.name} no compra hace ${daysSince} dias. Gasto S/${Number(customer.totalSpent).toFixed(0)} total.`,
          actionUrl: `/admin?tab=crm&phone=${customer.phone}`,
          actionLabel: "Contactar",
          entityId: `${customer.phone}${dateSuffix}`,
        });
        count++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 8. PRECIO_BAJO: cuando un producto baja de precio (PriceHistory últimas 24h)
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const priceDrops = await prisma.priceHistory.findMany({
      where: {
        changedAt: { gte: oneDayAgo },
        Product: { tenantId, active: true, deletedAt: null },
      },
      include: { Product: { select: { name: true, id: true } } },
      take: 20,
    });
    for (const ph of priceDrops) {
      if (ph.newPrice < ph.oldPrice) {
        await createNotification({
          tenantId,
          type: "PRECIO_BAJO",
          severity: "LOW",
          title: `\u{1F4C9} ${ph.Product.name} bajó de precio`,
          body: `De S/${ph.oldPrice.toFixed(2)} a S/${ph.newPrice.toFixed(2)}. ¡Buen momento para comprar stock!`,
          actionUrl: "/admin?tab=productos",
          actionLabel: "Ver producto",
          entityId: String(ph.Product.id),
        });
        count++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 9. FLUJO_CAJA_CRITICO: Alerta de flujo de caja proyectado
  try {
    // Calcular ventas de la ultima semana
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const salesLastWeek = await prisma.sale.aggregate({
      where: {
        tenantId,
        createdAt: { gte: sevenDaysAgo },
      },
      _sum: { total: true },
    });
    const ventasSemana = Number(salesLastWeek._sum.total ?? 0);

    // Gastos del mes actual (aproximar semanales)
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const expensesMonth = await prisma.expense.aggregate({
      where: {
        tenantId,
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    const gastosMes = Number(expensesMonth._sum.amount ?? 0);
    const diasDelMes = Math.max(1, new Date().getDate());
    const gastosProyectadosSemana = (gastosMes / diasDelMes) * 7;

    // Saldo proyectado a 7 dias
    const saldoActual = ventasSemana - gastosProyectadosSemana;
    const ventasProyectadas = ventasSemana; // asumir continuidad
    const saldoProyectado = saldoActual + ventasProyectadas - gastosProyectadosSemana;

    if (saldoProyectado < 0) {
      await createNotification({
        tenantId,
        type: "FLUJO_CAJA_CRITICO",
        severity: "HIGH",
        title: "Riesgo de quedarse sin efectivo",
        body: `Saldo proyectado en 7 dias: S/${saldoProyectado.toFixed(0)}. Considera cobrar fiados pendientes o reducir gastos.`,
        actionUrl: "/admin?tab=finanzas",
        actionLabel: "Ver finanzas",
      });
      count++;
    } else if (ventasProyectadas > 0 && saldoProyectado < ventasProyectadas * 0.2) {
      await createNotification({
        tenantId,
        type: "FLUJO_CAJA_CRITICO",
        severity: "MEDIUM",
        title: "Flujo de caja ajustado",
        body: `Saldo proyectado en 7 dias: S/${saldoProyectado.toFixed(0)}. El margen es menor al 20% de ventas semanales.`,
        actionUrl: "/admin?tab=finanzas",
        actionLabel: "Ver finanzas",
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  // 10. CUOTA_PROXIMA: cuotas de préstamo que vencen en 2 días
  try {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const cuotasProximas = await prisma.prestamoCuota.findMany({
      where: {
        pagadoEn: null,
        fechaVence: { gte: hoy, lte: twoDaysFromNow },
        Prestamo: { tenantId, status: "ACTIVO" },
      },
      include: {
        Prestamo: {
          include: { Customer: { select: { name: true, phone: true } } },
        },
      },
      take: 15,
    });

    for (const cuota of cuotasProximas) {
      const customerName = cuota.Prestamo?.Customer?.name || cuota.Prestamo?.customerId || "Cliente";
      const monto = Number(cuota.monto).toFixed(2);
      const fecha = cuota.fechaVence.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });

      await createNotification({
        tenantId,
        type: "CUOTA_PROXIMA",
        severity: "MEDIUM",
        title: `Cuota proxima: ${customerName}`,
        body: `Cuota ${cuota.numeroCuota} de S/${monto} vence el ${fecha}`,
        actionUrl: "/admin?tab=prestamos",
        actionLabel: "Ver prestamo",
        entityId: cuota.id,
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  // 11. MARGEN_NEGATIVO: products selling below cost (Mejora 16)
  try {
    const negMarginProducts = await prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        costPrice: { gt: 0 },
      },
      select: { id: true, name: true, price: true, costPrice: true },
      take: 100,
    });
    let negMarginCount = 0;
    for (const p of negMarginProducts) {
      if (negMarginCount >= 5) break;
      const price = Number(p.price);
      const costPrice = Number(p.costPrice);
      if (price < costPrice && costPrice > 0) {
        await createNotification({
          tenantId,
          type: "MARGEN_NEGATIVO",
          severity: "HIGH",
          title: `Perdiendo dinero: ${p.name}`,
          body: `Se vende a S/${price.toFixed(2)} pero cuesta S/${costPrice.toFixed(2)}. Perdida: S/${(costPrice - price).toFixed(2)} por unidad.`,
          actionUrl: "/admin?tab=inventario",
          actionLabel: "Ajustar precio",
          entityId: String(p.id),
        });
        count++;
        negMarginCount++;
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  // 12. AGRADECIMIENTO: after purchases >S/50 (Mejora 17)
  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentSales = await prisma.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: fourHoursAgo },
        total: { gte: 50 },
        customerPhone: { not: null },
      },
      select: {
        id: true,
        total: true,
        customerPhone: true,
        customer: { select: { name: true } },
      },
      take: 10,
    });
    for (const sale of recentSales) {
      const customerName = sale.customer?.name || "Cliente";
      const phone = (sale.customerPhone ?? "").replace(/\D/g, "");
      if (!phone) continue;
      const total = Number(sale.total).toFixed(2);
      const mensaje = `Gracias ${customerName} por tu compra de S/${total} en Buleje! Te esperamos pronto!`;
      await createNotification({
        tenantId,
        type: "AGRADECIMIENTO",
        severity: "LOW",
        title: `Agradecer a ${customerName}`,
        body: `Compro S/${total}. Envia un mensaje de agradecimiento.`,
        actionUrl: `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`,
        actionLabel: "Enviar gracias",
        entityId: sale.id,
      });
      count++;
    }
  } catch {
    /* tabla puede no existir */
  }

  return count;
}
