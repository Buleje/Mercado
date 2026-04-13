"use client";

/**
 * app/admin/_hooks/useDocumentTitle.ts
 *
 * Hook que mantiene el `document.title` sincronizado con la tab activa
 * y el nombre del tenant. También hace scroll suave al top al cambiar
 * de módulo (mejora UX).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect } from "react";

const TAB_LABELS: Record<string, string> = {
  inventario: "Inventario",
  productos: "Productos",
  compras: "Compras",
  plata: "Finanzas",
  clientes: "CRM",
  fiados: "Fiados",
  turnos: "Turnos",
  recetas: "Recetas",
  prestamos: "Préstamos",
  pedidos: "Pedidos",
  "analytics-pro": "Analytics",
  config: "Configuración",
  "asistente-ia": "Asistente IA",
  cotizaciones: "Cotizaciones",
  "guias-remision": "Guías Remisión",
  "notas-credito": "Notas Crédito",
  contratos: "Contratos",
  plan: "Plan",
};

const FALLBACK_TENANT_NAME = "Mi Bodega";

export function useDocumentTitle(tab: string, tenantName: string | null): void {
  // Scroll suave al top al cambiar de tab
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  // Título dinámico del navegador
  useEffect(() => {
    const label = TAB_LABELS[tab] || "Panel";
    const tenant = tenantName || FALLBACK_TENANT_NAME;
    document.title = `${label} — ${tenant}`;
  }, [tab, tenantName]);
}
