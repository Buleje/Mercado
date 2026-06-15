import { Truck, Bike, Car, Footprints, Users } from "@buleje/design-system/icons";

/**
 * Helpers compartidos entre las tabs de DeliveryPartnersModule.
 * Extraído (refactor 2026-06-15) — single source, sin cambios de comportamiento.
 */

// ── Tipos compartidos ──
export interface DeliveryPartner {
  id: string;
  name: string;
  phone: string;
  zone: string;
  vehicleType: string;
  fee: number | string;
  rating: number | string;
  isActive: boolean;
  createdAt?: string;
}

// ── Loading skeleton ──
export const TableSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-10 w-10 bg-[var(--rule-base)] rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[var(--rule-base)] rounded w-1/2" />
          <div className="h-3 bg-[var(--rule-base)] rounded w-1/3" />
        </div>
        <div className="h-8 w-24 bg-[var(--rule-base)] rounded-lg" />
      </div>
    ))}
  </div>
);

/**
 * Convierte number | string (Prisma Decimal serializado) | null | undefined a un
 * number seguro. Evita "x.toFixed is not a function" cuando el backend devuelve
 * Decimal como string.
 */
export function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Iconos de vehículo (Lucide, no emojis — CLAUDE.md / bsm-typography-rules).
export type VehicleKind = "moto" | "bici" | "auto" | "pie" | "otro";

export function vehicleKind(t: string): VehicleKind {
  const v = (t ?? "").toLowerCase();
  if (v.includes("moto")) return "moto";
  if (v.includes("bici")) return "bici";
  if (v.includes("auto") || v.includes("car")) return "auto";
  if (v.includes("pie")) return "pie";
  return "otro";
}

export function VehicleIcon({ type, className }: { type: string; className?: string }) {
  const k = vehicleKind(type);
  const cls = className ?? "h-4 w-4";
  if (k === "moto") return <Truck className={cls} aria-label="Moto" />;
  if (k === "bici") return <Bike className={cls} aria-label="Bicicleta" />;
  if (k === "auto") return <Car className={cls} aria-label="Auto" />;
  if (k === "pie")  return <Footprints className={cls} aria-label="A pie" />;
  return <Users className={cls} aria-label="Vehículo" />;
}

export function vehicleLabel(t: string): string {
  const k = vehicleKind(t);
  if (k === "moto") return "Moto";
  if (k === "bici") return "Bicicleta";
  if (k === "auto") return "Auto";
  if (k === "pie")  return "A pie";
  return t || "Vehículo";
}
