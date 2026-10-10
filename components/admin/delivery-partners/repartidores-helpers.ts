/**
 * Lo que la tabla de Equipo (Reparto) usa y no es React: el color del avatar
 * por zona, la descarga en CSV y el enlace de WhatsApp. Sacado de
 * `tabs/RepartidoresTab.tsx` el 10-10, mismo comportamiento.
 */
import { toNum, vehicleLabel, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";

/**
 * Brandon mayo 2026 v7: helpers para mejoras de RepartidoresTab.
 *  - zoneColor: hash determinístico zona → color de avatar (5 paletas).
 *  - downloadCSV: export plano para SUNAT/contabilidad/pagos.
 *  - waLink: link wa.me con template auto en español-PE.
 */
export const ZONE_PALETTE = [
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-teal-100 dark:bg-teal-900/40",       text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-orange-100 dark:bg-orange-900/40",   text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40",       text: "text-cyan-700 dark:text-cyan-300" },
] as const;

export function zoneColor(zone: string): (typeof ZONE_PALETTE)[number] {
  const z = (zone ?? "").toLowerCase().trim() || "default";
  let hash = 0;
  for (let i = 0; i < z.length; i++) hash = ((hash << 5) - hash) + z.charCodeAt(i);
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}

export function downloadCSV(rows: DeliveryPartner[]) {
  const header = ["Nombre", "Telefono", "Zona", "Vehiculo", "Tarifa (S/)", "Rating", "Estado"];
  const lines = rows.map((p) => [
    p.name,
    p.phone ?? "",
    p.zone,
    vehicleLabel(p.vehicleType),
    toNum(p.fee).toFixed(2),
    toNum(p.rating).toFixed(1),
    p.isActive ? "Activo" : "Inactivo",
  ]);
  const all = [header, ...lines].map((r) =>
    r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","),
  );
  const csv = "﻿" + all.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `repartidores-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function waLink(phone: string, name: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  const intl = digits.length === 9 ? `51${digits}` : digits;
  const text = `Hola ${name}, te escribo del negocio. ¿Estás disponible para una entrega ahora?`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
