"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, ChevronRight, Package, User } from "@buleje/design-system/icons";
import type { AvisoPedidoDetalle } from "@/lib/superadmin/nivel-aviso";
import { METODO_PAGO } from "./meta";

/** Miniatura del artículo; sin imagen (o si falla) va el ícono del paquete. */
export function MiniaturaArticulo({ src, alt, size = "h-10 w-10" }: { src: string | null; alt: string; size?: string }) {
  const [rota, setRota] = useState(false);
  if (!src || rota) {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]`}
      >
        <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen de OrderItem: URL externa o base64, sin remotePatterns
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setRota(true)}
      className={`${size} shrink-0 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] object-cover`}
    />
  );
}

/**
 * Lo que se despliega bajo un pedido sin atender (Brandon 2026-06-05): los
 * artículos con su imagen, cantidad y precio, cliente, forma de pago y el
 * enlace al pedido completo.
 */
export function DetallePedido({ pedido, href, onIr }: { pedido: AvisoPedidoDetalle; href: string; onIr: () => void }) {
  return (
    <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 px-4 pb-3 sm:pl-[8.5rem]">
      <ul className="divide-y divide-[var(--rule-soft)]">
        {pedido.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-2">
            <MiniaturaArticulo src={it.image} alt={it.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{it.name}</p>
              <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {it.quantity} {it.unit} × S/{Number(it.price).toFixed(2)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">
              S/{(it.quantity * it.price).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          <User className="h-3.5 w-3.5" /> {pedido.customerName}
        </span>
        {pedido.paymentMethod && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
            <Banknote className="h-3.5 w-3.5" /> {METODO_PAGO[pedido.paymentMethod] ?? pedido.paymentMethod}
          </span>
        )}
        <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
          S/{Number(pedido.total).toFixed(2)}
        </span>
        <span className="flex-1" />
        <Link
          href={href}
          onClick={onIr}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--accent-600)]"
        >
          Ver pedido completo
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
