"use client";

import Link from "next/link";
import { Receipt, Store, CheckCircle2, XCircle } from "lucide-react";
import type { MockCupon } from "@/lib/mocks/cupones.mock";

type Props = {
  cupones: MockCupon[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function discountLabel(cupon: MockCupon): string {
  if (cupon.discountType === "shipping") return "Envio gratis";
  if (cupon.discountType === "percent") return `${cupon.discountValue}%`;
  return `S/ ${cupon.discountValue}`;
}

export default function CuponesHistorial({ cupones }: Props) {
  if (cupones.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        Tu historial aparecera aca cuando uses o venzan tus cupones.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {cupones.map((cupon) => {
          const wasUsed = cupon.status === "usado";
          return (
            <li
              key={cupon.id}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
            >
              <span
                className={[
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  wasUsed
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                ].join(" ")}
              >
                {wasUsed ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <span className="truncate">{cupon.title}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {cupon.code}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{wasUsed ? "Usado" : "Expirado"}</span>
                  <span>·</span>
                  <span>{fmtDate(cupon.usedAt ?? cupon.expiresAt)}</span>
                  {cupon.storeName && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Store className="h-3 w-3" aria-hidden="true" />
                        {cupon.storeName}
                      </span>
                    </>
                  )}
                  {cupon.orderNumber && (
                    <>
                      <span>·</span>
                      <Link
                        href={`/mis-pedidos?pedido=${cupon.orderNumber}`}
                        className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white"
                      >
                        <Receipt className="h-3 w-3" aria-hidden="true" />
                        {cupon.orderNumber}
                      </Link>
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {discountLabel(cupon)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
