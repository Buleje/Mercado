"use client";

/**
 * La tarjeta de una máquina: quién es, sus avisos, la ganancia y su uso, y las
 * acciones. A la vista, las dos de todos los días (Alquiler y Gasto, 48 px);
 * checklist, contrato, editar y la tienda, en el «⋯».
 *
 * Antes (medido 11-10): rótulos de 10-11 px en mayúsculas, un botón de tienda
 * suelto y tres íconos de 36 px por tarjeta.
 */
import { ClipboardCheck, CreditCard, FileText, Fuel, MoreHorizontal, Pencil, Store, TrendingUp, Wrench } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { fmt, STATUS_META, typeIcon, typeLabel, type AssetStats } from "./tipos";

function Aviso({ icon: Icon, tone, children }: { icon: React.ComponentType<{ className?: string }>; tone: "warning" | "error" | "accent"; children: React.ReactNode }) {
  const cls =
    tone === "error" ? "bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]"
    : tone === "warning" ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]"
    : "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold", cls)}><Icon className="h-3.5 w-3.5" aria-hidden /> {children}</span>;
}

export default function AssetCard({ asset, onRent, onExpense, onEdit, onDetail, onContract, onChecklist, onPublish }: {
  asset: AssetStats; onRent: () => void; onExpense: () => void; onEdit: () => void; onDetail: () => void; onContract: () => void; onChecklist: () => void; onPublish: () => void;
}) {
  const Icon = typeIcon(asset.type);
  const st = STATUS_META[asset.status] ?? STATUS_META.operativo;
  const total = asset.totalIncome + asset.totalExpense;
  const incPct = total > 0 ? (asset.totalIncome / total) * 100 : 0;
  const uso = asset.utilizationPct != null ? Math.round(asset.utilizationPct) : null;
  const enTienda = Boolean(asset.publishedProductId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-colors hover:border-[var(--accent)]/40">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onDetail} aria-label={`Ver detalle de ${asset.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onDetail} className="block max-w-full truncate text-base font-bold text-[var(--text-primary)] hover:text-[var(--accent-ink)]">{asset.name}</button>
          <p className="truncate text-sm text-[var(--text-secondary)]">{typeLabel(asset.type)}{asset.plate ? ` · ${asset.plate}` : ""}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold", st.chip)}>{st.label}</span>
      </div>

      {(enTienda || asset.maintenanceDue > 0 || asset.maintenanceSoon > 0 || asset.fuelAlert || asset.pendingAmount > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {enTienda && <Aviso icon={Store} tone="accent">En tu tienda</Aviso>}
          {asset.maintenanceDue > 0 && <Aviso icon={Wrench} tone="error">{asset.maintenanceDue} mantto. vencido</Aviso>}
          {asset.maintenanceDue === 0 && asset.maintenanceSoon > 0 && <Aviso icon={Wrench} tone="warning">{asset.maintenanceSoon} mantto. pronto</Aviso>}
          {asset.fuelAlert && <Aviso icon={Fuel} tone="warning">consume de más</Aviso>}
          {asset.pendingAmount > 0 && <Aviso icon={CreditCard} tone="warning">por cobrar {fmt(asset.pendingAmount)}</Aviso>}
        </div>
      )}

      {/* Ganancia: el número de la tarjeta; debajo, de dónde sale */}
      <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Ganancia</span>
          <span className={cn("whitespace-nowrap text-lg font-bold tabular-nums", asset.profit >= 0 ? "text-[var(--text-primary)]" : "text-[var(--data-error-ink)]")}>{fmt(asset.profit)}</span>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]" aria-hidden>
          <span className="bg-[var(--accent)]" style={{ width: `${incPct}%` }} />
          <span className="bg-[var(--rule-base)]" style={{ width: `${100 - incPct}%` }} />
        </div>
        <p className="mt-1.5 flex justify-between text-sm tabular-nums text-[var(--text-secondary)]">
          <span>Entró {fmt(asset.totalIncome)}</span>
          <span>Salió {fmt(asset.totalExpense)}</span>
        </p>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        Costo por {asset.rateUnit}: <strong className="tabular-nums text-[var(--text-primary)]">{asset.costPerUnit != null ? fmt(asset.costPerUnit) : "—"}</strong>
        {" · "}Uso 30 días: <strong className="tabular-nums text-[var(--text-primary)]">{uso != null ? `${uso} %` : "—"}</strong>
        <span className="tabular-nums"> ({asset.units30d}/{(asset.capacityPerDay ?? 8) * 30})</span>
      </p>

      <div className="mt-auto flex items-center gap-2">
        <button type="button" onClick={onRent} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 text-sm font-bold text-white hover:brightness-110">
          <TrendingUp className="h-4 w-4" aria-hidden /> Alquiler
        </button>
        <button type="button" onClick={onExpense} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]">
          <Fuel className="h-4 w-4" aria-hidden /> Gasto
        </button>
        <ActionMenu
          label={`Más de ${asset.name}`}
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title="Checklist, contrato, editar y tienda"
          actions={[
            { id: "checklist", label: "Checklist antes de alquilar", icon: ClipboardCheck, onSelect: onChecklist },
            { id: "contrato", label: "Contrato o cotización", hint: "En PDF", icon: FileText, onSelect: onContract },
            { id: "editar", label: "Editar máquina", icon: Pencil, onSelect: onEdit },
            { id: "tienda", label: enTienda ? "Quitar de la tienda" : "Publicar en tu tienda", hint: enTienda ? "Deja de mostrarse como servicio de alquiler" : "Como servicio de alquiler; no entra a inventario", icon: Store, onSelect: onPublish },
          ]}
        />
      </div>
    </div>
  );
}
