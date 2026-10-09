import "server-only";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { AvisosCampanaDB } from "@/lib/db/avisos-campana.db";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { logger } from "@/lib/logger";
import { limaDateKey, startOfLimaMonth } from "@/lib/utils";

/**
 * Los avisos que la campana se arma sola (fiado vencido, caja descuadrada,
 * turno sin cerrar…). Lo corre `/api/cron/notifications` por cada negocio.
 *
 * INTEG-01 (09-10): las lecturas van por `AvisosCampanaDB` (antes Prisma
 * directo, y «cliente inactivo» miraba ventas de TODOS los negocios) y cada
 * aviso por `NotificationCenterDB.createOrReuse`: la misma clave (tipo +
 * entidad) se pone al día en vez de sumar una copia por corrida.
 */

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
/** El cron es diario: 20 h deja margen a que el horario se corra un poco. */
const VENTANA_HORAS = 20;
const DIFERENCIA_CAJA_MINIMA = 20;
const DIFERENCIA_CAJA_GRAVE = 50;

type Severidad = "HIGH" | "MEDIUM" | "LOW";

interface Aviso {
  type: string;
  severity: Severidad;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId?: string;
}

export interface ResultadoAvisos {
  /** Avisos nuevos en la ventana (los que se reusaron no cuentan). */
  nuevos: number;
  porTipo: Record<string, number>;
  /** Revisiones que fallaron (las demás siguen). */
  fallos: string[];
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
/** El servidor corre en UTC: sin la zona, una caja cerrada a las 9 p. m. salía «de mañana». */
const fechaLima = (d: Date, opts: Intl.DateTimeFormatOptions = {}) =>
  d.toLocaleDateString("es-PE", { timeZone: "America/Lima", ...opts });
/**
 * Un día de calendario guardado como medianoche UTC (`DailySummary.fecha`, la cuota
 * de un préstamo con fecha de desembolso) se lee en UTC: en Lima caía el día anterior.
 * Si trae hora (cuota de un préstamo sin fecha de desembolso), es un instante: Lima.
 */
const fechaDia = (d: Date, opts: Intl.DateTimeFormatOptions = {}) =>
  d.getTime() % DIA === 0 ? d.toLocaleDateString("es-PE", { timeZone: "UTC", ...opts }) : fechaLima(d, opts);
const horaLima = (d: Date) =>
  d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

export async function generateNotifications(
  tenantId: string,
  opts: { nombreNegocio?: string; ahora?: Date } = {},
): Promise<ResultadoAvisos> {
  const ahora = opts.ahora ?? new Date();
  const res: ResultadoAvisos = { nuevos: 0, porTipo: {}, fallos: [] };

  const avisar = async (a: Aviso) => {
    const { created } = await NotificationCenterDB.createOrReuse({
      tenantId,
      ...a,
      dedupWindowHours: VENTANA_HORAS,
    });
    if (created) {
      res.nuevos += 1;
      res.porTipo[a.type] = (res.porTipo[a.type] ?? 0) + 1;
    }
  };

  // Una revisión que falla no tumba a las otras, pero queda escrita.
  const revisar = async (nombre: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      res.fallos.push(nombre);
      logger.warn("[avisos-campana] falló una revisión", { tenantId, nombre, error: String(err) });
    }
  };

  await revisar("FIADO_VENCIDO", async () => {
    for (const f of await AvisosCampanaDB.fiadosVencidos(tenantId, ahora)) {
      await avisar({
        type: "FIADO_VENCIDO",
        severity: "HIGH",
        title: `Fiado vencido: ${f.cliente}`,
        body: `Debe ${soles(f.saldo)} y ya pasó la fecha de pago.`,
        actionUrl: "/admin?tab=fiados",
        actionLabel: "Ver fiado",
        entityId: f.id,
      });
    }
  });

  // Un solo aviso con el conteo: uno por producto llenaba la campana.
  await revisar("STOCK_CRITICO", async () => {
    const s = await AvisosCampanaDB.stockBajo(tenantId);
    if (s.total === 0) return;
    const nombres = s.muestra.map((p) => `${p.name} (${p.stock})`).join(", ");
    const resto = s.total - s.muestra.length;
    await avisar({
      type: "STOCK_CRITICO",
      severity: s.agotados > 0 ? "HIGH" : "MEDIUM",
      title: `${s.total} ${plural(s.total, "producto", "productos")} con stock bajo`,
      body:
        (s.agotados > 0 ? `${s.agotados} ${plural(s.agotados, "agotado", "agotados")}. ` : "") +
        `${nombres}${resto > 0 ? ` y ${resto} más` : ""}.`,
      actionUrl: "/admin?tab=inventario",
      actionLabel: "Ver stock",
      entityId: "stock-bajo",
    });
  });

  await revisar("TURNO_SIN_CERRAR", async () => {
    for (const t of await AvisosCampanaDB.turnosAbiertosAntesDe(tenantId, new Date(ahora.getTime() - 14 * HORA))) {
      const horas = Math.floor((ahora.getTime() - t.abrioEn.getTime()) / HORA);
      await avisar({
        type: "TURNO_SIN_CERRAR",
        severity: "HIGH",
        title: t.quien ? `Turno de ${t.quien} sin cerrar` : "Turno sin cerrar",
        body: `Abierto desde el ${fechaLima(t.abrioEn)} a las ${horaLima(t.abrioEn)} (hace ${horas} h).`,
        actionUrl: "/admin?tab=ventas-caja&vista=turnos",
        actionLabel: "Cerrar turno",
        entityId: t.id,
      });
    }
  });

  await revisar("PROVEEDOR_VENCIDO", async () => {
    for (const p of await AvisosCampanaDB.cuentasPorPagarHasta(tenantId, new Date(ahora.getTime() + 2 * DIA))) {
      const vencida = p.dueDate < ahora;
      await avisar({
        type: "PROVEEDOR_VENCIDO",
        severity: vencida ? "HIGH" : "MEDIUM",
        title: vencida ? `Factura vencida: ${p.supplierName || "Proveedor"}` : `Factura por vencer: ${p.supplierName || "Proveedor"}`,
        body: `${soles(p.amount)}, ${vencida ? "venció" : "vence"} el ${fechaLima(p.dueDate)}.`,
        actionUrl: "/admin?tab=compras",
        actionLabel: "Ver factura",
        entityId: p.id,
      });
    }
  });

  await revisar("DIFERENCIA_CAJA", async () => {
    const desde = new Date(ahora.getTime() - DIA);
    for (const r of await AvisosCampanaDB.cajasCerradasConDiferencia(tenantId, desde)) {
      const diff = r.difference;
      if (Math.abs(diff) <= DIFERENCIA_CAJA_MINIMA) continue;
      await avisar({
        type: "DIFERENCIA_CAJA",
        severity: Math.abs(diff) > DIFERENCIA_CAJA_GRAVE ? "HIGH" : "MEDIUM",
        title: `Caja del ${fechaLima(r.closedAt ?? ahora, { weekday: "long" })}: ${diff < 0 ? "faltan" : "sobran"} ${soles(Math.abs(diff))}`,
        body: `Se cerró el ${fechaLima(r.closedAt ?? ahora)} con ${soles(Math.abs(diff))} ${diff < 0 ? "de menos" : "de más"}.`,
        // `tab=caja` migraba a ventas-caja y abría «Vender»: la diferencia se revisa en Cuadrar caja.
        actionUrl: "/admin?tab=ventas-caja&vista=arqueo",
        actionLabel: "Ver caja",
        entityId: r.id,
      });
    }
    for (const s of await AvisosCampanaDB.resumenesDiariosDesde(tenantId, desde)) {
      const diff = s.diferenciaCaja;
      if (Math.abs(diff) <= DIFERENCIA_CAJA_MINIMA) continue;
      await avisar({
        type: "DIFERENCIA_CAJA",
        severity: Math.abs(diff) > DIFERENCIA_CAJA_GRAVE ? "HIGH" : "MEDIUM",
        title: `Cierre del día: ${diff < 0 ? "faltan" : "sobran"} ${soles(Math.abs(diff))}`,
        body: `Resumen del ${fechaDia(s.fecha)}, lo hizo ${s.creadoPor}.`,
        // El resumen diario vive en Mi Plata › Reportes (Historial de cierres).
        actionUrl: "/admin?tab=plata&vista=reportes",
        actionLabel: "Ver resumen",
        entityId: s.id,
      });
    }
  });

  // Los 10 que más gastan van como urgentes.
  await revisar("CLIENTE_INACTIVO", async () => {
    const vips = await AvisosCampanaDB.clientesVipConUltimaActividad(tenantId, 500);
    const limite = new Date(ahora.getTime() - 15 * DIA);
    for (const [i, c] of vips.entries()) {
      if (c.ultimaActividad && c.ultimaActividad >= limite) continue;
      const top = i < 10;
      const dias = c.ultimaActividad ? Math.floor((ahora.getTime() - c.ultimaActividad.getTime()) / DIA) : null;
      const cuando = dias === null ? "no tiene compras registradas" : `no compra hace ${dias} días`;
      await avisar({
        type: "CLIENTE_INACTIVO",
        severity: top || dias === null || dias > 30 ? "HIGH" : "MEDIUM",
        title: `${top ? "Cliente top" : "Cliente frecuente"} sin volver: ${c.name}`,
        body: `${c.name} ${cuando}. Lleva ${soles(c.totalSpent)} gastados.`,
        actionUrl: `/admin?tab=crm&phone=${encodeURIComponent(c.phone)}`,
        actionLabel: "Contactar",
        entityId: c.phone,
      });
    }
  });

  await revisar("PRECIO_BAJO", async () => {
    for (const p of await AvisosCampanaDB.bajadasDePrecio(tenantId, new Date(ahora.getTime() - DIA))) {
      await avisar({
        type: "PRECIO_BAJO",
        severity: "LOW",
        title: `${p.name} bajó de precio`,
        body: `Pasó de ${soles(p.oldPrice)} a ${soles(p.newPrice)}.`,
        actionUrl: "/admin?tab=productos",
        actionLabel: "Ver producto",
        entityId: String(p.productId),
      });
    }
  });

  // Proyección a 7 días con las ventas de la semana y el gasto diario del mes.
  await revisar("FLUJO_CAJA_CRITICO", async () => {
    // Mes y día de Lima: con el calendario del servidor (UTC) el mes arrancaba el último día a las 19:00.
    const inicioMes = new Date(startOfLimaMonth(0, ahora));
    const { ventas, gastos } = await AvisosCampanaDB.ventasYGastos(tenantId, new Date(ahora.getTime() - 7 * DIA), inicioMes);
    const gastosSemana = (gastos / Math.max(1, Number(limaDateKey(ahora).slice(8)))) * 7;
    const saldoProyectado = 2 * (ventas - gastosSemana);
    if (saldoProyectado < 0) {
      await avisar({
        type: "FLUJO_CAJA_CRITICO",
        severity: "HIGH",
        title: "Riesgo de quedarte sin efectivo",
        body: `Saldo proyectado a 7 días: S/ ${saldoProyectado.toFixed(0)}. Cobra fiados pendientes o recorta gastos.`,
        actionUrl: "/admin?tab=plata",
        actionLabel: "Ver Mi Plata",
      });
    } else if (ventas > 0 && saldoProyectado < ventas * 0.2) {
      await avisar({
        type: "FLUJO_CAJA_CRITICO",
        severity: "MEDIUM",
        title: "Flujo de caja ajustado",
        body: `Saldo proyectado a 7 días: S/ ${saldoProyectado.toFixed(0)}, menos del 20 % de lo que vendes en una semana.`,
        actionUrl: "/admin?tab=plata",
        actionLabel: "Ver Mi Plata",
      });
    }
  });

  await revisar("CUOTA_PROXIMA", async () => {
    const { proximas } = await PrestamosDB.getCuotasProximas(tenantId, 2);
    for (const c of proximas.slice(0, 15)) {
      const monto = c.moneda === "USD" ? `$ ${c.monto.toFixed(2)}` : soles(c.monto);
      await avisar({
        type: "CUOTA_PROXIMA",
        severity: "MEDIUM",
        title: `Cuota próxima: ${c.nombre}`,
        body: `Cuota ${c.numeroCuota} de ${monto} vence el ${fechaDia(new Date(c.fechaVence), { day: "numeric", month: "long" })}.`,
        actionUrl: "/admin?tab=prestamos",
        actionLabel: "Ver préstamo",
        entityId: c.cuotaId,
      });
    }
  });

  await revisar("MARGEN_NEGATIVO", async () => {
    for (const p of await AvisosCampanaDB.productosBajoCosto(tenantId)) {
      await avisar({
        type: "MARGEN_NEGATIVO",
        severity: "HIGH",
        title: `Pierdes plata con ${p.name}`,
        body: `Lo vendes a ${soles(p.price)} y te cuesta ${soles(p.costPrice)}: pierdes ${soles(p.costPrice - p.price)} por unidad.`,
        actionUrl: "/admin?tab=inventario",
        actionLabel: "Ajustar precio",
        entityId: String(p.id),
      });
    }
  });

  await revisar("AGRADECIMIENTO", async () => {
    const negocio = opts.nombreNegocio?.trim() || "nuestra tienda";
    for (const v of await AvisosCampanaDB.ventasParaAgradecer(tenantId, new Date(ahora.getTime() - 4 * HORA), 50)) {
      if (!v.phone) continue;
      const mensaje = `Gracias ${v.cliente} por tu compra de ${soles(v.total)} en ${negocio}. ¡Te esperamos pronto!`;
      await avisar({
        type: "AGRADECIMIENTO",
        severity: "LOW",
        title: `Agradece a ${v.cliente}`,
        body: `Compró ${soles(v.total)}. Mándale un mensaje de agradecimiento.`,
        actionUrl: `https://wa.me/${v.phone}?text=${encodeURIComponent(mensaje)}`,
        actionLabel: "Enviar gracias",
        entityId: v.id,
      });
    }
  });

  return res;
}
