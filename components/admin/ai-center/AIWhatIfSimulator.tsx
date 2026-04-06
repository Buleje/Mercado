"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

/* ── Types ── */
type ScenarioId =
  | "price-increase"
  | "delivery"
  | "drop-category"
  | "second-store"
  | "fiado-digital"
  | "contratar-empleado"
  | "ampliar-horario"
  | "promo-2x1"
  | "whatsapp-store"
  | "cambiar-proveedor";

type ScenarioResult = {
  label: string;
  before: number;
  after: number;
  unit: string;
  positive: boolean;
};

type RiskLevel = "bajo" | "medio" | "alto";
type Difficulty = "facil" | "moderado" | "complejo";

type Scenario = {
  id: ScenarioId;
  title: string;
  emoji: string;
  description: string;
  riskLevel: RiskLevel;
  difficulty: Difficulty;
  timeToResults: string;
  params: { id: string; label: string; min: number; max: number; step: number; default: number; unit: string }[];
};

type SavedScenario = {
  id: string;
  name: string;
  scenarioId: ScenarioId;
  scenarioTitle: string;
  beneficioNeto: number;
  results: ScenarioResult[];
  params: Record<string, number>;
  savedAt: string;
};

const SAVED_KEY = "ai-simulator-saved";
const MAX_SAVED = 8;

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  bajo: { label: "Bajo", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  medio: { label: "Medio", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  alto: { label: "Alto", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
};

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; dots: number }> = {
  facil: { label: "Fácil", dots: 1 },
  moderado: { label: "Moderado", dots: 2 },
  complejo: { label: "Complejo", dots: 3 },
};

/* ── Scenarios ── */
const SCENARIOS: Scenario[] = [
  {
    id: "price-increase",
    title: "Subir precios",
    emoji: "💰",
    description: "Calcula el impacto en margen y volumen estimado si subes precios generales.",
    riskLevel: "medio",
    difficulty: "facil",
    timeToResults: "1-2 semanas",
    params: [
      { id: "pct", label: "Incremento de precio", min: 1, max: 30, step: 1, default: 10, unit: "%" },
      { id: "elasticity", label: "Sensibilidad del cliente (10=muy sensible)", min: 1, max: 10, step: 1, default: 5, unit: "/10" },
    ],
  },
  {
    id: "promo-2x1",
    title: "Promoción 2x1",
    emoji: "🎉",
    description: "Estima el impacto de una promoción 2x1 en productos seleccionados.",
    riskLevel: "bajo",
    difficulty: "facil",
    timeToResults: "1-3 días",
    params: [
      { id: "productsPct", label: "% de productos en promo", min: 5, max: 40, step: 5, default: 15, unit: "%" },
      { id: "volumeIncrease", label: "Aumento de volumen esperado", min: 20, max: 200, step: 10, default: 80, unit: "%" },
      { id: "durationDays", label: "Duración de la promo", min: 1, max: 14, step: 1, default: 3, unit: "días" },
    ],
  },
  {
    id: "delivery",
    title: "Delivery nocturno",
    emoji: "🛵",
    description: "Estima ingresos adicionales si ofreces delivery entre 7pm y 10pm.",
    riskLevel: "medio",
    difficulty: "moderado",
    timeToResults: "2-4 semanas",
    params: [
      { id: "orders_per_night", label: "Pedidos estimados por noche", min: 1, max: 30, step: 1, default: 8, unit: "pedidos" },
      { id: "avg_ticket", label: "Ticket promedio por pedido", min: 20, max: 200, step: 5, default: 45, unit: "S/" },
    ],
  },
  {
    id: "whatsapp-store",
    title: "Tienda WhatsApp",
    emoji: "📱",
    description: "Estima ingresos de vender por WhatsApp con catálogo digital.",
    riskLevel: "bajo",
    difficulty: "moderado",
    timeToResults: "1-2 semanas",
    params: [
      { id: "clientesAlcance", label: "Clientes que recibirán catálogo", min: 20, max: 500, step: 10, default: 100, unit: "clientes" },
      { id: "tasaConversion", label: "% que compra al ver catálogo", min: 2, max: 20, step: 1, default: 8, unit: "%" },
      { id: "ticketPromedio", label: "Ticket promedio WhatsApp", min: 15, max: 150, step: 5, default: 35, unit: "S/" },
    ],
  },
  {
    id: "cambiar-proveedor",
    title: "Cambiar proveedor",
    emoji: "🔄",
    description: "Evalúa el impacto de cambiar de proveedor para mejorar márgenes.",
    riskLevel: "medio",
    difficulty: "moderado",
    timeToResults: "2-4 semanas",
    params: [
      { id: "ahorroCompra", label: "% de ahorro en costo de compra", min: 2, max: 20, step: 1, default: 8, unit: "%" },
      { id: "productosAfectados", label: "% de productos del proveedor", min: 10, max: 80, step: 5, default: 30, unit: "%" },
      { id: "riesgoCalidad", label: "Riesgo de menor calidad (10=alto)", min: 1, max: 10, step: 1, default: 3, unit: "/10" },
    ],
  },
  {
    id: "drop-category",
    title: "Eliminar categoría",
    emoji: "✂️",
    description: "Calcula cuánto revenue perderías al eliminar tu categoría menos rentable.",
    riskLevel: "alto",
    difficulty: "moderado",
    timeToResults: "1-2 meses",
    params: [
      { id: "category_pct", label: "% de ventas de esa categoría", min: 1, max: 50, step: 1, default: 15, unit: "%" },
      { id: "customer_loss", label: "% clientes que compran SOLO eso", min: 0, max: 30, step: 1, default: 8, unit: "%" },
    ],
  },
  {
    id: "second-store",
    title: "Segundo local",
    emoji: "🏪",
    description: "Estima costos de apertura y revenue potencial basado en tu operación actual.",
    riskLevel: "alto",
    difficulty: "complejo",
    timeToResults: "3-6 meses",
    params: [
      { id: "scale", label: "Tamaño relativo al local actual", min: 30, max: 150, step: 10, default: 70, unit: "%" },
      { id: "ramp_months", label: "Meses para alcanzar el 100%", min: 1, max: 12, step: 1, default: 4, unit: "meses" },
    ],
  },
  {
    id: "fiado-digital",
    title: "Fiado digital",
    emoji: "📝",
    description: "Calcula el impacto de ofrecer crédito informal a clientes frecuentes.",
    riskLevel: "medio",
    difficulty: "facil",
    timeToResults: "1-2 semanas",
    params: [
      { id: "porcentajeClientesFiado", label: "% clientes que usarían fiado", min: 5, max: 50, step: 1, default: 20, unit: "%" },
      { id: "ticketPromedioFiado", label: "Monto promedio de fiado", min: 10, max: 100, step: 5, default: 30, unit: "S/" },
      { id: "tasaMorosidad", label: "% que no paga a tiempo", min: 5, max: 30, step: 1, default: 15, unit: "%" },
    ],
  },
  {
    id: "contratar-empleado",
    title: "Contratar empleado",
    emoji: "👤",
    description: "Evalúa si un empleado extra genera más ventas que su costo total.",
    riskLevel: "medio",
    difficulty: "moderado",
    timeToResults: "1-3 meses",
    params: [
      { id: "sueldoMensual", label: "Sueldo mensual", min: 1000, max: 2500, step: 50, default: 1200, unit: "S/" },
      { id: "horasExtra", label: "Horas extra de atención/semana", min: 0, max: 40, step: 2, default: 20, unit: "hrs" },
      { id: "ventasIncrementales", label: "% más ventas por mejor atención", min: 5, max: 30, step: 1, default: 12, unit: "%" },
    ],
  },
  {
    id: "ampliar-horario",
    title: "Ampliar horario",
    emoji: "🕐",
    description: "Estima ingresos extra si abres más horas (nocturno o domingos).",
    riskLevel: "bajo",
    difficulty: "facil",
    timeToResults: "1-2 semanas",
    params: [
      { id: "horasExtra", label: "Horas adicionales por día", min: 1, max: 6, step: 1, default: 3, unit: "hrs" },
      { id: "diasSemana", label: "Días a la semana", min: 1, max: 7, step: 1, default: 5, unit: "días" },
      { id: "porcentajeVentas", label: "% de ventas normales en esas horas", min: 10, max: 50, step: 5, default: 25, unit: "%" },
    ],
  },
];

/* ── Simulation Engine ── */
function simulate(
  scenarioId: ScenarioId,
  params: Record<string, number>,
  data: BusinessData | null
): { results: ScenarioResult[]; verdict: string; confidence: number } {
  if (!data) return { results: [], verdict: "", confidence: 0 };

  const { orders, sales } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const monthRev =
    validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, sl) => s + sl.total, 0);

  const monthTxns =
    validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;

  const avgTicket = monthTxns > 0 ? monthRev / monthTxns : 50;
  const expMonth = data.expenses.totalMonth ?? monthRev * 0.7;
  const currentMargin = monthRev > 0 ? Math.max(0, (monthRev - expMonth) / monthRev) : 0.25;
  const currentProfit = monthRev * currentMargin;
  const totalClientes = data.customers.length || 100;

  let results: ScenarioResult[] = [];
  let verdict = "";
  let confidence = 70;

  switch (scenarioId) {
    case "price-increase": {
      const pct = params.pct / 100;
      const elasticity = params.elasticity / 10;
      const volumeReduction = pct * elasticity * 0.5;
      const newRevenue = monthRev * (1 + pct) * (1 - volumeReduction);
      const newProfit = newRevenue * (currentMargin + pct * 0.8);
      const newTxns = monthTxns * (1 - volumeReduction);
      results = [
        { label: "Ingresos mensuales", before: monthRev, after: newRevenue, unit: "S/", positive: newRevenue > monthRev },
        { label: "Utilidad mensual", before: currentProfit, after: newProfit, unit: "S/", positive: newProfit > currentProfit },
        { label: "Transacciones/mes", before: monthTxns, after: newTxns, unit: "txn", positive: false },
        { label: "Margen estimado", before: currentMargin * 100, after: (newProfit / Math.max(newRevenue, 1)) * 100, unit: "%", positive: true },
      ];
      const netBenefit = newProfit - currentProfit;
      verdict = netBenefit > 0
        ? `Un aumento de ${params.pct}% generaría ~S/${Math.round(netBenefit)}/mes más de utilidad, pero perderías ~${Math.round(volumeReduction * 100)}% de ventas en volumen.`
        : `Con esa sensibilidad de cliente, subir ${params.pct}% no conviene. Perderías más clientes de lo que ganas en margen.`;
      confidence = elasticity < 0.5 ? 80 : 60;
      break;
    }

    case "promo-2x1": {
      const productsPct = params.productsPct / 100;
      const volumeInc = params.volumeIncrease / 100;
      const days = params.durationDays;
      const dailyRev = monthRev / 30;
      const promoRev = dailyRev * productsPct;
      const extraVolume = promoRev * volumeInc * days;
      const costOfPromo = promoRev * 0.5 * days;
      const netBenefit = extraVolume * currentMargin - costOfPromo;
      const newCustomers = Math.round(totalClientes * 0.05 * days);
      results = [
        { label: "Ventas extra en promo", before: 0, after: extraVolume, unit: "S/", positive: true },
        { label: "Costo de la promo (descuento)", before: 0, after: costOfPromo, unit: "S/", positive: false },
        { label: "Beneficio neto de la promo", before: 0, after: netBenefit, unit: "S/", positive: netBenefit > 0 },
        { label: "Clientes nuevos estimados", before: 0, after: newCustomers, unit: "clientes", positive: true },
        { label: "Duración", before: 0, after: days, unit: "días", positive: true },
      ];
      verdict = netBenefit > 0
        ? `La promo 2x1 generaría ~S/${Math.round(netBenefit)} de beneficio neto y atraería ~${newCustomers} clientes nuevos.`
        : `Con esos parámetros el costo supera el beneficio. Reduce el % de productos o la duración.`;
      confidence = 65;
      break;
    }

    case "delivery": {
      const nightly = params.orders_per_night;
      const ticket = params.avg_ticket;
      const deliveryCost = nightly * 5;
      const extraRev = nightly * ticket * 30;
      const extraProfit = extraRev * currentMargin - deliveryCost * 30;
      results = [
        { label: "Ingresos extra/mes", before: 0, after: extraRev, unit: "S/", positive: true },
        { label: "Ingresos totales/mes", before: monthRev, after: monthRev + extraRev, unit: "S/", positive: true },
        { label: "Costo operativo extra/mes", before: 0, after: deliveryCost * 30, unit: "S/", positive: false },
        { label: "Utilidad extra/mes", before: 0, after: Math.max(0, extraProfit), unit: "S/", positive: extraProfit > 0 },
      ];
      verdict = extraProfit > 0
        ? `El delivery nocturno generaría ~S/${Math.round(extraProfit)}/mes de utilidad extra. Necesitas al menos ${Math.ceil(deliveryCost * 30 / (ticket * currentMargin * 30))} pedidos/noche para cubrir costos.`
        : `Con ${nightly} pedidos/noche no cubre los costos de rider. Necesitas al menos ${Math.ceil(deliveryCost * 30 / (ticket * currentMargin * 30))} pedidos/noche.`;
      confidence = 55;
      break;
    }

    case "whatsapp-store": {
      const alcance = params.clientesAlcance;
      const conversion = params.tasaConversion / 100;
      const ticket = params.ticketPromedio;
      const ordersMonth = alcance * conversion * 4;
      const revenueMonth = ordersMonth * ticket;
      const profit = revenueMonth * currentMargin;
      const costSetup = 200;
      const costMonthly = 50;
      results = [
        { label: "Pedidos extras/mes", before: 0, after: Math.round(ordersMonth), unit: "pedidos", positive: true },
        { label: "Ingresos extras/mes", before: 0, after: revenueMonth, unit: "S/", positive: true },
        { label: "Costo mensual (internet/datos)", before: 0, after: costMonthly, unit: "S/", positive: false },
        { label: "Utilidad extra/mes", before: 0, after: profit - costMonthly, unit: "S/", positive: profit > costMonthly },
        { label: "Inversión inicial (catálogo)", before: 0, after: costSetup, unit: "S/", positive: false },
      ];
      verdict = profit > costMonthly
        ? `WhatsApp Store generaría ~S/${Math.round(profit - costMonthly)}/mes con ~${Math.round(ordersMonth)} pedidos adicionales. Inversión mínima de S/${costSetup}.`
        : `Necesitas más alcance o mejor conversión para que sea rentable.`;
      confidence = 60;
      break;
    }

    case "cambiar-proveedor": {
      const ahorro = params.ahorroCompra / 100;
      const productosAf = params.productosAfectados / 100;
      const riesgoCalidad = params.riesgoCalidad / 10;
      const costoCompraActual = monthRev * (1 - currentMargin) * productosAf;
      const ahorroMensual = costoCompraActual * ahorro;
      const perdidaPorCalidad = monthRev * productosAf * riesgoCalidad * 0.05;
      const beneficioNeto = ahorroMensual - perdidaPorCalidad;
      results = [
        { label: "Ahorro en compras/mes", before: 0, after: ahorroMensual, unit: "S/", positive: true },
        { label: "Riesgo pérdida por calidad/mes", before: 0, after: perdidaPorCalidad, unit: "S/", positive: false },
        { label: "Beneficio neto/mes", before: 0, after: beneficioNeto, unit: "S/", positive: beneficioNeto > 0 },
        { label: "Nuevo margen estimado", before: currentMargin * 100, after: (currentMargin + ahorro * productosAf) * 100, unit: "%", positive: true },
      ];
      verdict = beneficioNeto > 0
        ? `Cambiar proveedor ahorraría ~S/${Math.round(beneficioNeto)}/mes. Prueba primero con un lote pequeño para verificar calidad.`
        : `El riesgo de calidad supera el ahorro. Reduce el riesgo o busca un proveedor más confiable.`;
      confidence = riesgoCalidad < 0.3 ? 75 : 50;
      break;
    }

    case "drop-category": {
      const catPct = params.category_pct / 100;
      const customerLossPct = params.customer_loss / 100;
      const lostRev = monthRev * catPct;
      const lostCustomerRev = monthRev * (1 - catPct) * customerLossPct;
      const totalLoss = lostRev + lostCustomerRev;
      const newRev = monthRev - totalLoss;
      const savedCosts = lostRev * 0.6;
      const newProfit = newRev * currentMargin + savedCosts * 0.2;
      results = [
        { label: "Ingresos mensuales", before: monthRev, after: newRev, unit: "S/", positive: false },
        { label: "Pérdida directa", before: 0, after: totalLoss, unit: "S/", positive: false },
        { label: "Ahorro en costos", before: 0, after: savedCosts, unit: "S/", positive: true },
        { label: "Utilidad resultante", before: currentProfit, after: newProfit, unit: "S/", positive: newProfit > currentProfit },
      ];
      verdict = newProfit > currentProfit
        ? `Eliminar la categoría mejoraría la utilidad en S/${Math.round(newProfit - currentProfit)}/mes al ahorrar costos, pero perderías ${Math.round(customerLossPct * 100)}% de clientes.`
        : `No conviene. Perderías S/${Math.round(currentProfit - newProfit)}/mes. Mejor optimiza los márgenes de esa categoría.`;
      confidence = 65;
      break;
    }

    case "second-store": {
      const scale = params.scale / 100;
      const rampMonths = params.ramp_months;
      const setupCost = 15000 * scale;
      const monthlyFixed = 3000 * scale;
      const projectedRev = monthRev * scale;
      const rampedRev = projectedRev * (1 / rampMonths);
      const firstYearRev = rampedRev * rampMonths + projectedRev * (12 - rampMonths);
      const firstYearProfit = firstYearRev * currentMargin - monthlyFixed * 12 - setupCost;
      const breakeven = setupCost / Math.max(1, projectedRev * currentMargin - monthlyFixed);
      results = [
        { label: "Revenue extra primer año", before: 0, after: firstYearRev, unit: "S/", positive: true },
        { label: "Inversión inicial", before: 0, after: setupCost, unit: "S/", positive: false },
        { label: "Costo fijo mensual", before: 0, after: monthlyFixed, unit: "S/", positive: false },
        { label: "Utilidad primer año", before: 0, after: firstYearProfit, unit: "S/", positive: firstYearProfit > 0 },
        { label: "Meses para recuperar inversión", before: 0, after: Math.ceil(breakeven), unit: "meses", positive: breakeven <= 18 },
      ];
      verdict = firstYearProfit > 0
        ? `El segundo local sería rentable al año ${Math.ceil(breakeven) <= 12 ? "y recuperas inversión en " + Math.ceil(breakeven) + " meses" : "pero toma +" + Math.ceil(breakeven) + " meses recuperar inversión"}.`
        : `Con esos números el primer año cierra en pérdida (-S/${Math.abs(Math.round(firstYearProfit))}). Reduce escala o espera más capital.`;
      confidence = 45;
      break;
    }

    case "fiado-digital": {
      const clientesConFiado = totalClientes * params.porcentajeClientesFiado / 100;
      const ventasExtrasMensuales = clientesConFiado * params.ticketPromedioFiado * 4;
      const morosidadMensual = ventasExtrasMensuales * params.tasaMorosidad / 100;
      const beneficioNeto = ventasExtrasMensuales - morosidadMensual;
      results = [
        { label: "Clientes con fiado", before: 0, after: Math.round(clientesConFiado), unit: "clientes", positive: true },
        { label: "Ventas extras mensuales", before: 0, after: ventasExtrasMensuales, unit: "S/", positive: true },
        { label: "Morosidad estimada/mes", before: 0, after: morosidadMensual, unit: "S/", positive: false },
        { label: "Beneficio neto/mes", before: 0, after: beneficioNeto, unit: "S/", positive: beneficioNeto > 0 },
        { label: "Retención estimada", before: 0, after: 15, unit: "%", positive: true },
      ];
      verdict = beneficioNeto > 0
        ? `El fiado digital genera S/${Math.round(beneficioNeto)}/mes extra. Clave: cobrar a tiempo reduce morosidad. Empieza con clientes de confianza.`
        : `La morosidad se come el beneficio. Reduce el % de clientes o el monto promedio.`;
      confidence = 60;
      break;
    }

    case "contratar-empleado": {
      const costoTotal = params.sueldoMensual * 1.45;
      const ingresosExtra = monthRev * params.ventasIncrementales / 100;
      const utilidadExtra = ingresosExtra * currentMargin;
      const beneficioNeto = utilidadExtra - costoTotal;
      const mesesParaRecuperar = costoTotal / Math.max(beneficioNeto, 1);
      results = [
        { label: "Costo total empleado/mes", before: 0, after: costoTotal, unit: "S/", positive: false },
        { label: "Ingresos extra/mes", before: 0, after: ingresosExtra, unit: "S/", positive: true },
        { label: "Utilidad extra/mes", before: 0, after: utilidadExtra, unit: "S/", positive: true },
        { label: "Beneficio neto/mes", before: 0, after: beneficioNeto, unit: "S/", positive: beneficioNeto > 0 },
        { label: "Meses para recuperar", before: 0, after: Math.ceil(Math.abs(mesesParaRecuperar)), unit: "meses", positive: mesesParaRecuperar <= 6 },
      ];
      verdict = beneficioNeto > 0
        ? `El empleado se paga solo en ~${Math.ceil(mesesParaRecuperar)} meses con S/${Math.round(beneficioNeto)}/mes de beneficio neto.`
        : `El empleado costaría S/${Math.round(Math.abs(beneficioNeto))}/mes más de lo que genera. Necesitas al menos ${Math.ceil(costoTotal / (monthRev * currentMargin / 100))}% más en ventas.`;
      confidence = 55;
      break;
    }

    case "ampliar-horario": {
      const ventasDiarias = monthRev / 30;
      const ventasNormalesPorHora = ventasDiarias / 12;
      const ventasExtraPorHora = ventasNormalesPorHora * params.porcentajeVentas / 100;
      const ingresosExtraSemana = ventasExtraPorHora * params.horasExtra * params.diasSemana;
      const costosExtra = params.horasExtra * params.diasSemana * 8;
      const beneficioSemanal = ingresosExtraSemana * currentMargin - costosExtra;
      const beneficioMensual = beneficioSemanal * 4;
      results = [
        { label: "Ingresos extra/semana", before: 0, after: ingresosExtraSemana, unit: "S/", positive: true },
        { label: "Costos extra/semana", before: 0, after: costosExtra, unit: "S/", positive: false },
        { label: "Beneficio semanal", before: 0, after: beneficioSemanal, unit: "S/", positive: beneficioSemanal > 0 },
        { label: "Beneficio mensual", before: 0, after: beneficioMensual, unit: "S/", positive: beneficioMensual > 0 },
      ];
      verdict = beneficioMensual > 0
        ? `Ampliar ${params.horasExtra}h genera ~S/${Math.round(beneficioMensual)}/mes. Es la opción de menor riesgo para crecer.`
        : `Las horas extra no generan suficiente venta (${params.porcentajeVentas}% es muy bajo). Prueba un horario piloto de 1 semana.`;
      confidence = 70;
      break;
    }

    default:
      return { results: [], verdict: "", confidence: 0 };
  }

  return { results, verdict, confidence };
}

/* ── Recommendation Engine ── */
function getRecommendedScenario(data: BusinessData | null): { scenarioId: ScenarioId; reason: string } | null {
  if (!data) return null;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const validOrders = data.orders.filter((o) => o.status !== "cancelado");
  const monthRev =
    validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, o) => s + o.total, 0) +
    data.sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, sl) => s + sl.total, 0);
  const expMonth = data.expenses.totalMonth ?? monthRev * 0.7;
  const margin = monthRev > 0 ? (monthRev - expMonth) / monthRev : 0.25;

  // Low margin → suggest price increase or supplier change
  if (margin < 0.2) {
    return { scenarioId: "cambiar-proveedor", reason: "Tu margen es bajo (<20%). Cambiar proveedor podría mejorar rentabilidad." };
  }

  // Many fiados → suggest fiado digital
  const fiados = data.orders.filter((o) => o.status === "FIADO" || (o as Record<string, unknown>).paymentMethod === "FIADO");
  if (fiados.length > 5) {
    return { scenarioId: "fiado-digital", reason: `Tienes ${fiados.length} fiados pendientes. Digitalizar la cobranza te ayuda a controlarlos.` };
  }

  // few customers → suggest WhatsApp store
  if (data.customers.length < 50) {
    return { scenarioId: "whatsapp-store", reason: "Pocos clientes activos. Una tienda WhatsApp puede expandir tu alcance sin costo fijo." };
  }

  // Good margins → suggest promo
  if (margin > 0.3) {
    return { scenarioId: "promo-2x1", reason: "Tu margen es bueno (>30%). Una promo 2x1 puede atraer nuevos clientes sin afectar mucho la utilidad." };
  }

  return { scenarioId: "ampliar-horario", reason: "Ampliar horario es la forma más segura de crecer con bajo riesgo." };
}

/* ── Bar Chart ── */
function BarChart({ results }: { results: ScenarioResult[] }) {
  if (results.length === 0) return null;
  const allValues = results.flatMap((r) => [Math.abs(r.before), Math.abs(r.after)]);
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className="mt-4 space-y-3">
      {results.map((r) => {
        const beforePct = (Math.abs(r.before) / maxVal) * 100;
        const afterPct = (Math.abs(r.after) / maxVal) * 100;
        const fmt = (v: number) => {
          if (r.unit === "S/") return `S/${Math.round(v).toLocaleString("es-PE")}`;
          if (r.unit === "%") return `${v.toFixed(1)}%`;
          return `${Math.round(v)} ${r.unit}`;
        };
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 dark:text-gray-400">{r.label}</span>
            </div>
            {r.before > 0 && (
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-12 text-right">Antes</span>
                <div className="flex-1 h-3.5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  <div className="h-full bg-gray-300 dark:bg-gray-600 rounded" style={{ width: `${beforePct}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 w-24 text-right">{fmt(r.before)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-12 text-right">{r.before > 0 ? "Después" : "Resultado"}</span>
              <div className="flex-1 h-3.5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                <div
                  className={cn("h-full rounded transition-all duration-600", r.positive ? "bg-[#00B4A6]" : "bg-red-400 dark:bg-red-600")}
                  style={{ width: `${afterPct}%` }}
                />
              </div>
              <span className={cn("text-[10px] font-semibold w-24 text-right", r.positive ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400")}>
                {fmt(r.after)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Component ── */
interface Props {
  data: BusinessData | null;
}

export default function AIWhatIfSimulator({ data }: Props) {
  const [activeScenario, setActiveScenario] = useState<ScenarioId>("price-increase");
  const scenario = SCENARIOS.find((s) => s.id === activeScenario)!;
  const [params, setParams] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {};
    SCENARIOS.forEach((s) => s.params.forEach((param) => { p[`${s.id}-${param.id}`] = param.default; }));
    return p;
  });

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_KEY);
      if (stored) setSavedScenarios(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const persistSaved = useCallback((updated: SavedScenario[]) => {
    setSavedScenarios(updated);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(updated)); } catch { /* */ }
  }, []);

  const getParam = (paramId: string) => params[`${activeScenario}-${paramId}`] ?? scenario.params.find((p) => p.id === paramId)!.default;
  const setParam = (paramId: string, value: number) => {
    setParams((prev) => ({ ...prev, [`${activeScenario}-${paramId}`]: value }));
  };

  const currentParams = Object.fromEntries(scenario.params.map((p) => [p.id, getParam(p.id)]));
  const { results, verdict, confidence } = useMemo(
    () => simulate(activeScenario, currentParams, data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeScenario, JSON.stringify(currentParams), data]
  );

  const recommendation = useMemo(() => getRecommendedScenario(data), [data]);

  const handleSave = () => {
    if (savedScenarios.length >= MAX_SAVED) return;
    const beneficio = results.find((r) => r.label.toLowerCase().includes("beneficio") || r.label.toLowerCase().includes("utilidad"));
    const saved: SavedScenario = {
      id: `saved-${Date.now()}`,
      name: `${scenario.title} — ${new Date().toLocaleDateString("es-PE")}`,
      scenarioId: activeScenario,
      scenarioTitle: scenario.title,
      beneficioNeto: beneficio?.after ?? 0,
      results,
      params: currentParams,
      savedAt: new Date().toISOString(),
    };
    persistSaved([saved, ...savedScenarios].slice(0, MAX_SAVED));
  };

  const handleDeleteSaved = (id: string) => {
    persistSaved(savedScenarios.filter((s) => s.id !== id));
    setCompareIds((prev) => prev.filter((cid) => cid !== id));
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const shareWhatsApp = useCallback(() => {
    let msg = `🔮 *Simulación: ${scenario.title}*\n\n`;
    msg += `📊 Parámetros:\n`;
    scenario.params.forEach((p) => {
      const v = getParam(p.id);
      msg += `• ${p.label}: ${p.unit === "S/" ? `S/${v}` : `${v} ${p.unit}`}\n`;
    });
    msg += `\n📈 Resultados:\n`;
    results.forEach((r) => {
      const fmt = (v: number) => r.unit === "S/" ? `S/${Math.round(v).toLocaleString("es-PE")}` : r.unit === "%" ? `${v.toFixed(1)}%` : `${Math.round(v)} ${r.unit}`;
      msg += `${r.positive ? "✅" : "⚠️"} ${r.label}: ${fmt(r.after)}${r.before > 0 ? ` (antes: ${fmt(r.before)})` : ""}\n`;
    });
    if (verdict) msg += `\n💡 *Veredicto:* ${verdict}`;
    msg += `\n\n🎯 Confianza: ${confidence}%`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, results, verdict, confidence]);

  const riskCfg = RISK_CONFIG[scenario.riskLevel];
  const diffCfg = DIFFICULTY_CONFIG[scenario.difficulty];

  return (
    <div className="space-y-4">
      {/* Recommendation banner */}
      {recommendation && activeScenario !== recommendation.scenarioId && (
        <button
          onClick={() => setActiveScenario(recommendation.scenarioId)}
          className="w-full text-left p-3 rounded-lg bg-[#f97316]/10 dark:bg-[#f97316]/5 border border-[#f97316]/30 hover:bg-[#f97316]/15 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">💡</span>
            <span className="text-xs font-medium text-[#f97316]">Recomendado para tu negocio</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{recommendation.reason}</p>
        </button>
      )}

      {/* Saved scenarios */}
      {savedScenarios.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Guardados ({savedScenarios.length}/{MAX_SAVED})
            </h3>
            {compareIds.length >= 2 && (
              <button
                onClick={() => setShowCompare(!showCompare)}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[#f97316] text-white hover:bg-[#e8944f] transition-colors"
              >
                {showCompare ? "Ocultar" : `Comparar (${compareIds.length})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {savedScenarios.map((s) => {
              const sc = SCENARIOS.find((sc) => sc.id === s.scenarioId);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border p-3 transition-all",
                    compareIds.includes(s.id) ? "border-[#f97316] bg-[#f97316]/5" : "border-gray-200 dark:border-gray-700"
                  )}
                >
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                    {sc?.emoji ?? ""} {s.scenarioTitle}
                  </p>
                  <p className={cn("text-sm font-bold mt-0.5", s.beneficioNeto >= 0 ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400")}>
                    {s.beneficioNeto >= 0 ? "+" : ""}S/{Math.round(s.beneficioNeto).toLocaleString("es-PE")}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{new Date(s.savedAt).toLocaleDateString("es-PE")}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => toggleCompare(s.id)} className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors", compareIds.includes(s.id) ? "bg-[#f97316] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200")}>
                      {compareIds.includes(s.id) ? "✓" : "Comparar"}
                    </button>
                    <button onClick={() => handleDeleteSaved(s.id)} className="px-2 py-0.5 rounded text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showCompare && compareIds.length >= 2 && (
            <div className="mt-4 rounded-lg border border-[#f97316]/30 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f97316]/10">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Métrica</th>
                    {compareIds.map((cid) => {
                      const s = savedScenarios.find((sc) => sc.id === cid);
                      return <th key={cid} className="text-right px-3 py-2 text-xs font-semibold text-[#f97316]">{s?.scenarioTitle ?? "—"}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const allLabels = Array.from(new Set(compareIds.flatMap((cid) => savedScenarios.find((sc) => sc.id === cid)?.results.map((r) => r.label) ?? []))).filter(Boolean);
                    return allLabels.map((label, idx) => (
                      <tr key={`metric-${idx}`} className={cn("border-t border-gray-100 dark:border-gray-800", idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/30")}>
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{label}</td>
                        {compareIds.map((cid) => {
                          const s = savedScenarios.find((sc) => sc.id === cid);
                          const r = s?.results.find((res) => res.label === label);
                          if (!r) return <td key={cid} className="px-3 py-2 text-xs text-gray-400 text-right">—</td>;
                          const fmt = (v: number) => r.unit === "S/" ? `S/${Math.round(v).toLocaleString("es-PE")}` : r.unit === "%" ? `${v.toFixed(1)}%` : `${Math.round(v)} ${r.unit}`;
                          return <td key={cid} className={cn("px-3 py-2 text-xs font-semibold text-right", r.positive ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400")}>{fmt(r.after)}</td>;
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Main simulator */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Simulador de Escenarios
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Explora qué pasaría si cambias una variable. Basado en datos reales.
            </p>
          </div>
          <button
            onClick={shareWhatsApp}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 transition-colors px-2 py-1 rounded-md hover:bg-green-50 dark:hover:bg-green-950/30"
          >
            📱 WhatsApp
          </button>
        </div>

        {/* Scenario selector - grid with emojis */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveScenario(s.id)}
              className={cn(
                "p-2.5 rounded-lg border text-xs font-medium text-left transition-all",
                activeScenario === s.id
                  ? "bg-[#00B4A6] text-white border-[#00B4A6] shadow-sm"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]/50"
              )}
            >
              <span className="text-base mr-1">{s.emoji}</span> {s.title}
              {recommendation?.scenarioId === s.id && activeScenario !== s.id && (
                <span className="ml-1 text-[9px] bg-[#f97316] text-white px-1 rounded">💡</span>
              )}
            </button>
          ))}
        </div>

        {/* Scenario metadata badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", riskCfg.color, riskCfg.bg)}>
            Riesgo: {riskCfg.label}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            Dificultad: {diffCfg.label} {"●".repeat(diffCfg.dots)}{"○".repeat(3 - diffCfg.dots)}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">
            ⏱ Resultados: {scenario.timeToResults}
          </span>
          {confidence > 0 && (
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              confidence >= 70 ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" :
              confidence >= 50 ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" :
              "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
            )}>
              Confianza: {confidence}%
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              {scenario.emoji} {scenario.title}
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{scenario.description}</p>
            <div className="flex flex-col gap-5">
              {scenario.params.map((p) => {
                const val = getParam(p.id);
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-700 dark:text-gray-300 font-medium">{p.label}</label>
                      <span className="text-sm font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
                        {p.unit === "S/" ? `S/ ${val}` : `${val} ${p.unit}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={val}
                      onChange={(e) => setParam(p.id, Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-gray-200 dark:bg-gray-700 accent-[#00B4A6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>{p.unit === "S/" ? `S/ ${p.min}` : `${p.min} ${p.unit}`}</span>
                      <span>{p.unit === "S/" ? `S/ ${p.max}` : `${p.max} ${p.unit}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Results */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Resultado proyectado
            </h3>

            {/* Verdict box */}
            {verdict && (
              <div className={cn(
                "p-3 rounded-lg mb-3 text-xs",
                results.some((r) => r.label.toLowerCase().includes("beneficio") && r.positive)
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300"
              )}>
                <span className="font-semibold">💡 Veredicto: </span>{verdict}
              </div>
            )}

            {/* Table */}
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden mb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Métrica</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Antes</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Después</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const diff = r.after - r.before;
                    const fmt = (v: number) => {
                      if (r.unit === "S/") return `S/${Math.abs(Math.round(v)).toLocaleString("es-PE")}`;
                      if (r.unit === "%") return `${Math.abs(v).toFixed(1)}%`;
                      return `${Math.abs(Math.round(v))} ${r.unit}`;
                    };
                    return (
                      <tr key={r.label} className={cn("border-t border-gray-50 dark:border-gray-800", i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/30")}>
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{r.label}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 text-right">{r.before > 0 ? fmt(r.before) : "—"}</td>
                        <td className={cn("px-3 py-2 text-xs font-semibold text-right", r.positive ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400")}>
                          {fmt(r.after)}
                        </td>
                        <td className={cn("px-3 py-2 text-xs font-medium text-right", diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                          {diff !== 0 ? `${diff >= 0 ? "+" : "-"}${fmt(Math.abs(diff))}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <BarChart results={results} />

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={savedScenarios.length >= MAX_SAVED}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                  savedScenarios.length >= MAX_SAVED
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-[#00B4A6] text-white hover:bg-[#009690]"
                )}
              >
                {savedScenarios.length >= MAX_SAVED ? `Máximo ${MAX_SAVED}` : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}