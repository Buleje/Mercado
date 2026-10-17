/**
 * El ⓘ de la cabecera de Análisis › Predicción, uno por sección. Junta lo que
 * antes explicaba cada tarjeta en su propio ⓘ (cómo se calcula «se agota en»,
 * por qué ese día para el proveedor, qué es «no regresa»…) para que a la vista
 * quede sólo el título, el dato y la acción.
 */

import type { AyudaVista } from "@/components/admin/analisis/CabeceraAnalisis";
import type { Predicciones } from "./use-predicciones";

/** Las secciones de Predicción en `?sub=`. No repiten las de Métricas (`ventas`, `clientes`…). */
export const SECCIONES_PREDICCION = ["pronostico", "reponer", "recuperar", "precios"] as const;
export type SeccionPrediccion = (typeof SECCIONES_PREDICCION)[number];

export function ayudaDeSeccion(seccion: SeccionPrediccion, data: Predicciones | null): AyudaVista {
  switch (seccion) {
    case "pronostico": {
      const tendencia = data
        ? data.trendPct >= 0
          ? "La flecha sube: vendes más que el promedio de las 4 semanas anteriores."
          : "La flecha baja: vendes menos que el promedio de las 4 semanas anteriores."
        : "La flecha compara con el promedio de las 4 semanas anteriores.";
      const hora = data
        ? ` En los últimos 28 días la hora con más ventas fue ${data.peakHour.label}, con ${data.peakHour.salesCount} ${data.peakHour.salesCount === 1 ? "venta" : "ventas"}.`
        : "";
      const dia = data ? ` ${data.bestPurchaseDay.day}: ${data.bestPurchaseDay.reason}.` : "";
      return {
        what: "Cuánto vas a vender la próxima semana, a qué hora llega más gente y qué día conviene ir al proveedor (el más tranquilo: menos clientes esperando mientras recibes mercadería).",
        affects: `Sale de tus ventas de las últimas 4 semanas. ${tendencia}${hora}${dia}`,
        example: "«Ventas próxima semana S/ 4 820, +6 % vs. 4 semanas»: compra un poco más para el sábado.",
      };
    }
    case "reponer":
      return {
        what: "Lo que se acaba según lo que vendes (stock actual ÷ venta diaria promedio) y los 5 productos que más se van a pedir mientras llega tu pedido.",
        affects: "Para generar las órdenes de compra, con auto-reorden, está Compras › Sugerencias (en «Más»).",
        example: "«Arroz Costeño 5 kg — quedan 12 unidades, se agota en 2 días».",
      };
    case "recuperar":
      return {
        what: "Los clientes que no compran hace más de 30 días: son los que más riesgo tienen de no volver.",
        affects: "«WhatsApp» abre el chat con su número para que le escribas.",
        example: "«Rosa Pérez — 42 días sin comprar» → un saludo con una oferta de lo que solía llevar.",
      };
    case "precios":
      return {
        what: "Precios que conviene subir o bajar: demanda alta, stock de más o productos que vencen pronto.",
        affects: "«Aplicar precio» cambia el precio de venta del producto. Calcularlo tarda unos segundos: las demás secciones no lo esperan.",
        example: "«Yogurt 1 L, vence pronto: S/ 6,50 → S/ 5,50 (−15 %)».",
      };
  }
}
