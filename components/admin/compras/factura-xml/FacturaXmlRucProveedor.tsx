"use client";

/** Una línea bajo el RUC del proveedor: qué dice SUNAT hoy (activo/habido, de baja, no habido). */
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { leerRucProveedor, useRucProveedor, type NivelRuc } from "./use-ruc-proveedor";

const TINTA: Record<NivelRuc, string> = {
  bien: "text-[var(--data-success-ink)]",
  cuidado: "text-[var(--data-warning-ink)]",
  grave: "text-[var(--data-error-ink)]",
  "sin-dato": "text-[var(--text-secondary)]",
};

export default function FacturaXmlRucProveedor({ ruc, fechaFactura }: { ruc: string; fechaFactura: string }) {
  const estado = useRucProveedor(ruc);
  const l = leerRucProveedor(estado, fechaFactura);
  const Icono = estado.fase === "cargando" ? Loader2 : l.nivel === "bien" ? ShieldCheck : l.nivel === "grave" ? ShieldAlert : AlertTriangle;
  return (
    <p className={`flex items-center gap-1.5 text-xs font-semibold ${TINTA[l.nivel]}`} data-ruc-sunat={l.nivel} role={l.nivel === "grave" ? "alert" : undefined}>
      <Icono className={`h-4 w-4 shrink-0 ${estado.fase === "cargando" ? "animate-spin" : ""}`} aria-hidden />
      <span>{l.titulo}</span>
      {l.detalle && <InfoTip title="RUC del proveedor en SUNAT" what={l.detalle} side="bottom" ariaLabel="Qué significa" />}
    </p>
  );
}
