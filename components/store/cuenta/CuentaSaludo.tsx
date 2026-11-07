"use client";

/**
 * Lo primero de «Mi cuenta»: el saludo y, debajo, tu último pedido con su
 * estado (la pregunta con la que casi todos entran). Sin sesión: un título y
 * entrar en dos toques.
 */

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, ShoppingBag } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { EntrarCuenta } from "./EntrarCuenta";
import { EstadoPedido } from "./EstadoPedido";
import { DESTINOS, fechaCorta, primerNombre, rutaCuenta } from "./cuenta-rutas";
import { piezasDe, type PedidosCliente } from "./use-pedidos-cliente";

export interface CuentaSaludoProps {
  nombre: string | null;
  conSesion: boolean;
  base: string;
  pedidos: PedidosCliente;
}

export function CuentaSaludo({ nombre, conSesion, base, pedidos }: CuentaSaludoProps) {
  if (!conSesion) {
    return (
      <header className="flex flex-col gap-4">
        <PageTitle>Mi cuenta</PageTitle>
        <EntrarCuenta titulo="Entra para ver tus pedidos, tus puntos y tus datos." className="max-w-sm" />
      </header>
    );
  }

  const ultimo = pedidos.pedidos[0];
  const piezas = ultimo ? piezasDe(ultimo) : 0;
  const foto = ultimo?.items?.find((i) => i.image)?.image ?? null;
  return (
    <header className="flex flex-col gap-4">
      <PageTitle>¡Hola, {primerNombre(nombre) ?? "de nuevo"}!</PageTitle>
      {pedidos.cargando ? (
        <div aria-hidden="true" className="h-20 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      ) : ultimo ? (
        <Link
          href={rutaCuenta(base, `${DESTINOS.pedidos}?order=${encodeURIComponent(ultimo.id)}`)}
          className="group flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 transition-colors duration-[var(--dur-fast)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:p-4"
        >
          <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
            {foto ? (
              <Image src={foto} alt="" fill sizes="56px" className="object-cover" unoptimized />
            ) : (
              <ShoppingBag className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden="true" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-[var(--text-primary)]">Tu último pedido</span>
              <EstadoPedido status={ultimo.status} />
            </span>
            <span className="truncate text-sm text-[var(--text-secondary)]">
              {[fechaCorta(ultimo.createdAt), piezas ? `${piezas} ${piezas === 1 ? "producto" : "productos"}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          {typeof ultimo.total === "number" && (
            <span className="shrink-0 text-base font-semibold tabular-nums text-[var(--text-primary)]">
              {formatCurrency(ultimo.total)}
            </span>
          )}
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        </Link>
      ) : null}
    </header>
  );
}
