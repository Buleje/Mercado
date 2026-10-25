/**
 * Vistas de fábrica (ronda 5, 25-10) de las tablas de Documentos, Comprobantes e Inventario:
 * un clic en «Vista» deja puestos los filtros de lo que el dueño mira primero. Los ids son
 * los de `COLUMNAS` de cada tabla; las fechas son date-only de Lima (ver fechas-de-vistas).
 */
import type { EstadoFiltros } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { PresetsFiltros } from "@/components/admin/shared/vistas-de-filtros";
import { diaLima, finDeMesLima } from "@/components/admin/shared/fechas-de-vistas";

const f = (facetas: EstadoFiltros["facetas"]): EstadoFiltros => ({ facetas, textos: {} });

/** Papeles con fecha de vencimiento (Archivo y Esenciales difieren en el id de la columna). */
export const presetsPapeles = (col: "vencimiento" | "vence"): PresetsFiltros => [
  { id: "vencidos", nombre: "Vencidos", ayuda: "Su fecha de vencimiento ya pasó", estado: f({ [col]: { min: null, max: diaLima(-1) } }) },
  { id: "vencen-mes", nombre: "Vencen este mes", ayuda: "Vencen de hoy a fin de mes", estado: f({ [col]: { min: diaLima(), max: finDeMesLima() } }) },
];

export const presetsContratos = (): PresetsFiltros => [
  { id: "vencen-30", nombre: "Vencen en 30 días", ayuda: "Su fecha de vencimiento cae de hoy a 30 días", estado: f({ vence: { min: diaLima(), max: diaLima(30) } }) },
  { id: "vencidos", nombre: "Ya vencieron", ayuda: "Su fecha de vencimiento ya pasó", estado: f({ vence: { min: null, max: diaLima(-1) } }) },
];

export const presetsCotizaciones = (): PresetsFiltros => [
  { id: "vencen-semana", nombre: "Por vencer esta semana", ayuda: "Válidas hasta hoy o dentro de 7 días", estado: f({ valido: { min: diaLima(), max: diaLima(7) } }) },
  { id: "vencidas", nombre: "Ya vencidas", ayuda: "Su validez ya pasó", estado: f({ valido: { min: null, max: diaLima(-1) } }) },
];

export const presetsGuias = (): PresetsFiltros => [
  { id: "salen-semana", nombre: "Traslados de esta semana", ayuda: "Fecha de traslado de hoy a 7 días", estado: f({ fecha: { min: diaLima(), max: diaLima(7) } }) },
];

export const presetsPendientes = (): PresetsFiltros => [
  { id: "urgentes", nombre: "Urgentes", ayuda: "Lo que hay que resolver primero", estado: f({ prioridad: ["Urgente"] }) },
  { id: "atrasados", nombre: "Atrasados", ayuda: "Pendientes desde hace más de 7 días", estado: f({ desde: { min: null, max: diaLima(-8) } }) },
];

export const presetsPerdidas = (): PresetsFiltros => [
  { id: "mas-de-50", nombre: "Pérdidas de S/ 50 o más", ayuda: "Las que más duelen", estado: f({ perdida: { min: 50, max: null } }) },
];

export const presetsVencimientos = (): PresetsFiltros => [
  { id: "vencen-30", nombre: "Vencen en 30 días", ayuda: "Lotes que vencen de hoy a 30 días", estado: f({ vence: { min: diaLima(), max: diaLima(30) } }) },
  { id: "vencidos", nombre: "Ya vencidos", ayuda: "Lotes cuya fecha ya pasó", estado: f({ vence: { min: null, max: diaLima(-1) } }) },
];

export const presetsRecetas = (): PresetsFiltros => [
  { id: "falta-algo", nombre: "Les falta algo", ayuda: "Recetas con algún insumo sin stock", estado: f({ insumos: ["Les falta algo"] }) },
  { id: "margen-bajo", nombre: "Margen bajo", ayuda: "Margen de 30 % o menos", estado: f({ margen: { min: null, max: 30 } }) },
];

export const presetsRecetario = (): PresetsFiltros => [
  { id: "ocultas", nombre: "Ocultas", ayuda: "No se muestran en la tienda", estado: f({ estado: ["Oculta"] }) },
];

/* ABC sin vista de fábrica: las tarjetas A/B/C de arriba ya filtran la clase exacta; una vista por
   «acumulado ≤ 70» la aproximaba (un 70,04 de clase B entraba por el redondeo del servidor). */
