import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { evaluarReposicion, LEAD_TIME_DEFAULT } from "@/lib/compras/reorden";
import {
  getProductosConStockMin,
  getVentasYDisponibilidad,
  getStockEnTransito,
  getLeadTimePorProveedor,
  getUltimaCompraPorProducto,
} from "@/lib/db/compras-sugerencias.db";

/**
 * GET /api/compras/sugerencias — qué reponer, por qué, y cuánto cuesta.
 *
 * EL CAMBIO DE CRITERIO (ADR-376). Antes la regla era «rellenar hasta
 * `stockMax`»: se sugería todo producto por debajo de su tope, sin mirar si se
 * vendía. Medido en el tenant real daba 52 sugerencias por 944 unidades con
 * CERO ventas en 30 días — una lista de compras de mercadería parada.
 *
 * Ahora manda la ROTACIÓN:
 *
 *   punto de reorden = venta diaria × (días que tarda el proveedor + colchón)
 *
 * Se repone lo que va a faltar antes de que llegue el pedido. Un producto sin
 * ventas en la ventana NO se sugiere: se devuelve aparte, en `sinRotacion`,
 * porque «no compres esto» también es información — y si además está por
 * encima del mínimo, es plata inmovilizada.
 */

/**
 * Ventana de análisis de ventas. Configurable por `?dias=`: un almacén que
 * vende estacional (útiles en marzo, panetón en diciembre) necesita mirar más
 * atrás que 30 días para que la rotación signifique algo.
 */
const VENTANA_DEFAULT = 30;
const VENTANA_MIN = 7;
const VENTANA_MAX = 365;

type Urgency = "CRITICO" | "URGENTE" | "PLANIFICAR";
const urgencyOrder: Record<Urgency, number> = { CRITICO: 0, URGENTE: 1, PLANIFICAR: 2 };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const pedidos = Number(new URL(req.url).searchParams.get("dias"));
    const VENTANA_DIAS = Number.isFinite(pedidos) && pedidos > 0
      ? Math.min(Math.max(Math.round(pedidos), VENTANA_MIN), VENTANA_MAX)
      : VENTANA_DEFAULT;
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - VENTANA_DIAS * 86_400_000);

    const products = await getProductosConStockMin(tenantId);
    if (products.length === 0) {
      return NextResponse.json({
        sugerencias: [], sinRotacion: [],
        resumen: { costoEstimado: 0, unidades: 0, sinPrecio: 0, enTransito: 0 },
        avisos: [],
      });
    }

    const productIds = products.map((p) => p.id);
    const avisos: string[] = [];

    const [ventas, transito, leadTimes, ultimaCompra] = await Promise.all([
      getVentasYDisponibilidad(tenantId, products, desde, hasta),
      getStockEnTransito(tenantId, productIds).catch((e) => {
        // Si no se puede saber qué viene en camino, se dice: sugerir sin ese
        // dato lleva a pedir dos veces lo mismo.
        logger.warn("[compras/sugerencias] sin datos de tránsito", { err: String(e) });
        avisos.push("No se pudo leer qué órdenes están en camino: puede haber productos ya pedidos en esta lista.");
        return new Map<number, number>();
      }),
      getLeadTimePorProveedor(tenantId),
      getUltimaCompraPorProducto(tenantId, productIds),
    ]);

    if (ultimaCompra.fallo) {
      avisos.push("No se pudo leer el historial de compras: falta el proveedor y el precio de referencia.");
    }

    const sugerencias: Array<Record<string, unknown>> = [];
    const sinRotacion: Array<Record<string, unknown>> = [];

    for (const p of products) {
      const stockActual = p.stock ?? 0;
      const enCamino = transito.get(p.id) ?? 0;
      // Lo que realmente vas a tener: lo que hay más lo que ya pediste.
      const disponible = stockActual + enCamino;

      const venta = ventas.get(p.id) ?? { vendido: 0, diasConStock: VENTANA_DIAS };
      const compra = ultimaCompra.mapa.get(p.id);
      const lead = compra ? leadTimes.get(compra.supplierId) : undefined;
      const leadTimeDias = lead?.dias ?? LEAD_TIME_DEFAULT;

      // La regla vive en `lib/compras/reorden.ts`, no acá: decide si el negocio
      // gasta plata y tiene que poder probarse sin levantar el endpoint.
      const decision = evaluarReposicion({
        stock: stockActual,
        enTransito: enCamino,
        stockMin: p.stockMin ?? 0,
        vendido: venta.vendido,
        diasConStock: venta.diasConStock,
        leadTimeDias,
      });
      const ventaDiaria = decision.ventaDiaria;

      const base = {
        productId: p.id,
        productName: p.name,
        category: p.category,
        currentStock: stockActual,
        stockMin: p.stockMin ?? 0,
        enTransito: enCamino,
        dailyAvg: ventaDiaria,
        diasConStock: Math.round(venta.diasConStock * 10) / 10,
        vendidoEnVentana: venta.vendido,
        // `condicionPago` viaja con el proveedor para que la OC generada desde
        // acá nazca con la forma de pago pactada (ADR-377).
        suggestedSupplier: compra
          ? { id: compra.supplierId, name: compra.supplierName, condicionPago: lead?.condicionPago ?? null }
          : null,
        lastPrice: compra?.lastPrice ?? null,
        leadTimeDias,
        leadTimeOrigen: lead?.origen ?? "default",
      };

      // No se vendió una sola unidad. Reponerlo es comprar algo que ya está
      // parado; se informa aparte, con el exceso sobre el mínimo.
      if (decision.tipo === "sin_rotacion") {
        sinRotacion.push({
          ...base,
          excesoSobreMinimo: decision.excesoSobreMinimo,
          motivo: decision.excesoSobreMinimo > 0
            ? `No se vendió nada en ${VENTANA_DIAS} días y tenés ${stockActual} en stock`
            : `No se vendió nada en ${VENTANA_DIAS} días`,
        });
        continue;
      }

      // Lo que hay más lo que viene alcanza hasta la próxima entrega.
      if (decision.tipo === "suficiente") continue;

      sugerencias.push({
        ...base,
        daysOfStock: decision.diasRestantes === Infinity ? 9999 : decision.diasRestantes,
        puntoReorden: decision.puntoReorden,
        suggestedQty: decision.cantidad,
        urgency: decision.urgencia,
        motivo:
          disponible <= 0
            ? "Sin stock" + (enCamino > 0 ? ` (${enCamino} en camino)` : "")
            : `Se vende ${ventaDiaria}/día y el proveedor tarda ${leadTimeDias} días${lead ? "" : " (estimado)"}`,
      });
    }

    sugerencias.sort((a, b) => {
      const ua = urgencyOrder[a.urgency as Urgency];
      const ub = urgencyOrder[b.urgency as Urgency];
      if (ua !== ub) return ua - ub;
      return (a.daysOfStock as number) - (b.daysOfStock as number);
    });
    sinRotacion.sort((a, b) => (b.excesoSobreMinimo as number) - (a.excesoSobreMinimo as number));

    // El costo se calcula acá, no en el cliente. `sinPrecio` es la parte que el
    // total NO cubre: mostrar «S/1.200» cuando falta el precio de la mitad de
    // los productos sería peor que mostrar el hueco.
    const conPrecio = sugerencias.filter((s) => s.lastPrice != null);
    const costoEstimado = conPrecio.reduce(
      (acc, s) => acc + (s.lastPrice as number) * (s.suggestedQty as number), 0,
    );

    return NextResponse.json({
      sugerencias,
      sinRotacion,
      ventanaDias: VENTANA_DIAS,
      resumen: {
        costoEstimado: Math.round(costoEstimado * 100) / 100,
        unidades: sugerencias.reduce((acc, s) => acc + (s.suggestedQty as number), 0),
        sinPrecio: sugerencias.length - conPrecio.length,
        enTransito: sugerencias.filter((s) => (s.enTransito as number) > 0).length,
      },
      avisos,
    });
  } catch (e) {
    logger.error("[compras/sugerencias] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error calculando sugerencias" }, { status: 500 });
  }
}
