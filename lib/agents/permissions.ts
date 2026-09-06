/**
 * lib/agents/permissions.ts
 *
 * SECURITY 2026-05-06 (audit AI #1 — CRITICAL): mapa de permisos por
 * (domain, action) para gatear `orchestrator.executeSync()` con RBAC.
 *
 * Antes el orchestrator ejecutaba cualquier action de cualquier dominio
 * sin validar el rol del actor. Un cajero podía llamar `pricing_margin_check`
 * o `customers_segmentation` que en UI normal no podría ver.
 *
 * Cualquier action sin entrada aquí se rechaza por default (deny-by-default).
 */

import type { Resource, Action } from "@/lib/auth/role-permissions";
import type { AgentDomain } from "./types";

export interface ActionPermission {
  resource: Resource;
  action: Action;
}

export const AGENT_ACTION_PERMISSIONS: Record<
  AgentDomain,
  Record<string, ActionPermission>
> = {
  inventory: {
    "check-stock":          { resource: "inventory",            action: "read" },
    "fefo-audit":           { resource: "inventory",            action: "read" },
    "reorder-suggestions":  { resource: "auto-reorder",         action: "read" },
    "stock-valuation":      { resource: "inventory",            action: "read" },
    "movement-summary":     { resource: "inventory-movements",  action: "read" },
    "buscar-producto":      { resource: "products",             action: "read" },
    // ESCRITURA: además del permiso, el tool pide aprobación humana en el chat
    // (ver `requiresApproval` en tool-definitions).
    "ajustar-stock":        { resource: "inventory",            action: "write" },
  },
  orders: {
    "pending-summary":      { resource: "orders",         action: "read" },
    "delivery-schedule":    { resource: "delivery-slots", action: "read" },
    "returns-analysis":     { resource: "returns",        action: "read" },
    "status-overview":      { resource: "orders",         action: "read" },
    "daily-sales-report":   { resource: "sales",          action: "read" },
  },
  customers: {
    "segmentation":         { resource: "customers", action: "read" },
    "top-customers":        { resource: "customers", action: "read" },
    "churn-risk":           { resource: "customers", action: "read" },
    "birthday-upcoming":    { resource: "customers", action: "read" },
    "customer-360":         { resource: "customers", action: "read" },
  },
  analytics: {
    "daily-kpis":           { resource: "analytics", action: "read" },
    "product-performance":  { resource: "analytics", action: "read" },
    "margin-analysis":      { resource: "analytics", action: "read" },
    "sales-trend":          { resource: "analytics", action: "read" },
    "category-breakdown":   { resource: "analytics", action: "read" },
    "avisos":               { resource: "analytics", action: "read" },
  },
  /**
   * El libro forestal no tiene Resource propio en el RBAC (26 recursos, ninguno
   * forestal) y agregarlo toca `role-permissions.ts`, que es zona de peligro.
   * Se gatea con `inventory:read`: el Libro de Operaciones ES el inventario de
   * la madera, y todas estas acciones son de lectura.
   */
  forestal: {
    "existencias":          { resource: "inventory", action: "read" },
    "buscar-guia":          { resource: "inventory", action: "read" },
    "buscar-troza":         { resource: "inventory", action: "read" },
    "pendientes":           { resource: "inventory", action: "read" },
  },
  documentos: {
    "buscar":               { resource: "settings",       action: "read" },
    "por-vencer":           { resource: "settings",       action: "read" },
  },
  caja: {
    "estado":               { resource: "cash-registers", action: "read" },
  },
  cobranzas: {
    // Dos deudas distintas, dos recursos distintos: quien ve fiados no
    // necesariamente ve la planilla de adelantos.
    "fiados":               { resource: "sales",          action: "read" },
    "adelantos":            { resource: "adelantos",      action: "read" },
  },
  /**
   * Abrir una pantalla no lee ni escribe datos: el módulo destino aplica su
   * propio RBAC cuando carga. Se gatea con el permiso más básico que tiene
   * cualquier rol del panel.
   */
  ui: {
    "abrir":                { resource: "analytics", action: "read" },
  },
  /**
   * Anotar plata dictada. Cada acción se gatea con el MISMO recurso que la
   * pantalla donde se hace a mano — que el asistente sea un atajo no puede
   * volverlo una puerta lateral al RBAC.
   *
   * Los activos (camiones, maquinaria) no tienen Resource propio y viven
   * dentro de Mi Plata: el gasto de una máquina es un gasto, así que va por
   * `expenses`. El ingreso por alquiler entra por caja o por el libro del
   * activo, y en los dos casos es plata que entra: `cash-registers`.
   */
  plata: {
    "buscar-maquina":       { resource: "expenses",       action: "read"  },
    "buscar-persona":       { resource: "adelantos",      action: "read"  },
    "buscar-deuda":         { resource: "sales",          action: "read"  },
    "buscar-proveedor":     { resource: "suppliers",      action: "read"  },
    "buscar-cuenta":        { resource: "cash-registers", action: "read"  },
    // Los lotes forestales no tienen Resource propio (igual que el libro CTP);
    // buscar el código de uno es leer inventario de madera.
    "buscar-lote":          { resource: "inventory",      action: "read"  },
    // ESCRITURA: además del permiso, cada tool pide confirmación humana en el
    // chat (`requiresApproval` en tool-definitions).
    "registrar-gasto":      { resource: "expenses",       action: "write" },
    "registrar-ingreso":    { resource: "cash-registers", action: "write" },
    "registrar-adelanto":   { resource: "adelantos",      action: "write" },
    "cobrar-fiado":         { resource: "sales",          action: "write" },
    "liquidar-adelanto":    { resource: "adelantos",      action: "write" },
    // La OC queda PENDIENTE: es el documento de compra, no el ingreso de stock
    // (recibirla, que sí mueve inventario, se hace en Compras).
    "registrar-compra":     { resource: "purchases",      action: "write" },
    "mover-tesoreria":      { resource: "cash-registers", action: "write" },
    // Un flete es un gasto del viaje; se gatea como el resto de los gastos.
    "registrar-flete":      { resource: "expenses",       action: "write" },
  },
  /**
   * Actividades y citas. No hay un Resource propio para recordatorios: un
   * recordatorio ES un aviso de algo que vence, así que se gatea con
   * `notifications` —el mismo permiso que ya cubre lo que el sistema avisa
   * solo— en vez de inventar un recurso que ningún rol tendría asignado.
   */
  agenda: {
    "ver":                  { resource: "notifications",  action: "read"  },
    // ESCRITURA: además del permiso, pide confirmación humana.
    "agendar":              { resource: "notifications",  action: "write" },
    "completar":            { resource: "notifications",  action: "write" },
  },
  /**
   * Disparar un flujo de n8n manda datos del negocio a un servidor de afuera.
   * Los flujos los configura el dueño en Automatizaciones (`settings:write`),
   * así que dispararlos se gatea con el mismo permiso que configurarlos: quien
   * no puede elegir a dónde va la información tampoco puede mandarla.
   */
  n8n: {
    "listar-flujos":        { resource: "settings", action: "read"  },
    "disparar-flujo":       { resource: "settings", action: "write" },
  },
  notifications: {
    "send-order-update":    { resource: "notifications", action: "write" },
    "send-stock-alert":     { resource: "notifications", action: "write" },
    "send-expiry-warning":  { resource: "notifications", action: "write" },
    "send-promotion":       { resource: "notifications", action: "write" },
    "digest-pending":       { resource: "notifications", action: "read" },
  },
  pricing: {
    "margin-check":         { resource: "analytics",     action: "read" },
    "competitor-gap":       { resource: "analytics",     action: "read" },
    "promotion-candidates": { resource: "promotions",    action: "read" },
    "bundle-suggestions":   { resource: "bundles",       action: "read" },
    "price-history":        { resource: "price-history", action: "read" },
  },
};
