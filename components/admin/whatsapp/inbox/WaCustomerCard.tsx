"use client";

import { ShoppingBag, Wallet, UserCircle, ReceiptText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { WaCustomerContext } from "./useWhatsAppInbox";

function fmtSoles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/**
 * WaCustomerCard — ficha CRM del cliente del hilo: pedidos, gasto total y
 * fiado pendiente (para cobrar sin salir del chat). Best-effort: si no carga,
 * el chat funciona igual.
 */
export default function WaCustomerCard({ context }: { context: WaCustomerContext | null }) {
  if (!context) return null;
  const { customer, ordersCount, totalSpent, lastOrderAt, fiadoSaldo } = context;
  const isKnown = customer !== null || ordersCount > 0 || fiadoSaldo > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      {!isKnown ? (
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-slate-400">
          <UserCircle className="h-3.5 w-3.5" />
          Aún no es cliente registrado
        </span>
      ) : (
        <>
          {customer && (
            <a
              href={`/admin?tab=clientes&q=${encodeURIComponent(customer.name)}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-primary underline-offset-2 hover:underline"
              title="Ver ficha completa en Clientes"
            >
              <UserCircle className="h-3.5 w-3.5" />
              {customer.name}
            </a>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ShoppingBag className="h-3.5 w-3.5" />
            {ordersCount} pedido{ordersCount === 1 ? "" : "s"}
            {totalSpent > 0 && ` · ${fmtSoles(totalSpent)}`}
          </span>
          {lastOrderAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ReceiptText className="h-3.5 w-3.5" />
              último {fmtDate(lastOrderAt)}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-xs)] font-bold",
              fiadoSaldo > 0
                ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
                : "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
            )}
            title={fiadoSaldo > 0 ? "Tiene fiado pendiente — usá la respuesta rápida Cobrar fiado ⚡" : "Sin fiado pendiente"}
          >
            <Wallet className="h-3.5 w-3.5" />
            {fiadoSaldo > 0 ? `Fiado ${fmtSoles(fiadoSaldo)}` : "Sin fiado"}
          </span>
        </>
      )}
    </div>
  );
}
