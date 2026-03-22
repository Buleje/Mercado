import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  Settings as PSettings,
} from "@/lib/generated/prisma/client";
import {
  type DbSettings,
  type StoreMode,
  type NavLinkItem,
} from "./misc.db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapSettings(s: PSettings): DbSettings {
  let navLinks: NavLinkItem[] | undefined;
  if (s.navLinksJson) {
    try { navLinks = JSON.parse(s.navLinksJson); } catch { /* ignore */ }
  }
  let parsedComboTemplates: DbSettings["comboTemplates"] | undefined;
  if ((s as Record<string, unknown>).comboTemplatesJson) {
    try { parsedComboTemplates = JSON.parse((s as Record<string, unknown>).comboTemplatesJson as string); } catch { /* ignore */ }
  }
  return {
    mode: s.mode as StoreMode,
    ...(s.businessName != null && { businessName: s.businessName }),
    ...(s.businessPhone != null && { businessPhone: s.businessPhone }),
    ...(s.businessAddress != null && { businessAddress: s.businessAddress }),
    ...(s.businessLat != null && { businessLat: s.businessLat }),
    ...(s.businessLon != null && { businessLon: s.businessLon }),
    ...(s.logoUrl != null && { logoUrl: s.logoUrl }),
    ...(s.description != null && { description: s.description }),
    ...(s.hours != null && { hours: s.hours }),
    ...(s.deliveryZone != null && { deliveryZone: s.deliveryZone }),
    yapeEnabled: s.yapeEnabled,
    ...(s.yapeImage != null && { yapeImage: s.yapeImage }),
    ...(s.yapeName != null && { yapeName: s.yapeName }),
    ...(s.yapePhone != null && { yapePhone: s.yapePhone }),
    cashEnabled: s.cashEnabled,
    ...(navLinks && { navLinks }),
    ...(s.adminPassword != null && { adminPassword: s.adminPassword }),
    maintenanceMode: s.maintenanceMode,
    ...(s.maintenanceMessage != null && { maintenanceMessage: s.maintenanceMessage }),
    adminBypassLogin: s.adminBypassLogin,
    ...(parsedComboTemplates && { comboTemplates: parsedComboTemplates }),
  };
}

// ── Settings DB ───────────────────────────────────────────────────────────────

export const SettingsDB = {
  async get(): Promise<DbSettings> {
    try {
      const row = await prisma.settings.findUnique({ where: { id: 1 } });
      if (!row) return { mode: "whatsapp", adminBypassLogin: false };
      return mapSettings(row);
    } catch (error) {
      console.warn("[settings] falling back to defaults:", error instanceof Error ? error.message : String(error));
      return { mode: "whatsapp", adminBypassLogin: false };
    }
  },
  async set(s: DbSettings): Promise<DbSettings> {
    const d = {
      mode: s.mode, businessName: s.businessName, businessPhone: s.businessPhone,
      businessAddress: s.businessAddress, logoUrl: s.logoUrl, description: s.description,
      hours: s.hours, deliveryZone: s.deliveryZone, yapeEnabled: s.yapeEnabled ?? false,
      yapeImage: s.yapeImage, yapeName: s.yapeName, yapePhone: s.yapePhone,
      cashEnabled: s.cashEnabled ?? true,
      ...(s.navLinks !== undefined && { navLinksJson: JSON.stringify(s.navLinks) }),
      ...(s.businessLat !== undefined && { businessLat: s.businessLat }),
      ...(s.businessLon !== undefined && { businessLon: s.businessLon }),
      ...(s.adminPassword !== undefined && { adminPassword: s.adminPassword }),
      ...(s.maintenanceMode !== undefined && { maintenanceMode: s.maintenanceMode }),
      ...(s.maintenanceMessage !== undefined && { maintenanceMessage: s.maintenanceMessage }),
      ...(s.adminBypassLogin !== undefined && { adminBypassLogin: s.adminBypassLogin }),
      ...(s.comboTemplates !== undefined && { comboTemplatesJson: JSON.stringify(s.comboTemplates) }),
    };
    const row = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, ...d }, update: d });
    return mapSettings(row);
  },
};
