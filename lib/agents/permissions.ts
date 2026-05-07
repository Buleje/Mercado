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
