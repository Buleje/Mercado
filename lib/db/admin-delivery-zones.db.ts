/**
 * AdminDeliveryZonesDB — acceso canónico a zonas de delivery por tenant.
 * Audit project-wide 2026-05-19: migración desde prisma directo en
 * app/api/admin/delivery-zones/route.ts.
 *
 * Las zonas se persisten como JSON en Settings.deliveryZone. Esta clase
 * abstrae los dos accesos (lectura + upsert) garantizando tenantId siempre.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type DeliveryZone = {
  id: string;
  name: string;
  color: string;
  deliveryFee: number;
  estimatedMin: number;
  neighborhoods: string[];
};

export const DEFAULT_ZONES: DeliveryZone[] = [
  { id: "z-1", name: "Zona Centro", color: "bg-[var(--data-success-500)]", deliveryFee: 3, estimatedMin: 20, neighborhoods: ["Jr. Progreso", "Jr. Inmaculada", "Jr. Ucayali", "Av. Centenario"] },
  { id: "z-2", name: "Zona Norte", color: "bg-green-500", deliveryFee: 4, estimatedMin: 30, neighborhoods: ["Manantay", "San Fernando", "9 de Octubre"] },
  { id: "z-3", name: "Zona Sur", color: "bg-[var(--data-warning-500)]", deliveryFee: 5, estimatedMin: 35, neighborhoods: ["Yarinacocha", "Puerto Callao", "San José"] },
  { id: "z-4", name: "Zona Este", color: "bg-[var(--data-error-500)]", deliveryFee: 5, estimatedMin: 40, neighborhoods: ["Campo Verde", "Nueva Requena"] },
];

export const AdminDeliveryZonesDB = {
  /**
   * Lee las zonas del tenant. Si no existen o el JSON está corrupto,
   * retorna DEFAULT_ZONES.
   */
  async getZones(tenantId: string): Promise<DeliveryZone[]> {
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { deliveryZone: true },
    });

    if (settings?.deliveryZone) {
      try {
        return JSON.parse(settings.deliveryZone) as DeliveryZone[];
      } catch {
        // JSON corrupto — devolver defaults
      }
    }

    return DEFAULT_ZONES;
  },

  /**
   * Persiste el array de zonas (upsert). Siempre requiere tenantId.
   */
  async saveZones(tenantId: string, zones: DeliveryZone[]): Promise<DeliveryZone[]> {
    await prisma.settings.upsert({
      where: { tenantId },
      update: { deliveryZone: JSON.stringify(zones) },
      create: { tenantId, deliveryZone: JSON.stringify(zones) },
    });
    return zones;
  },
};
