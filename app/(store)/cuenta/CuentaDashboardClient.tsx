"use client";

/**
 * CuentaDashboardClient — «Mi cuenta» del cliente en TODAS las tiendas.
 *
 * Rediseño 2026-10-11 (Brandon: «rápido y limpio para que compre mejor, sin
 * mucha distracción visual»). Antes: mosaico de 13 tiles + barra lateral que
 * repetía los mismos 5 accesos, cifras sumadas en el navegador y colores de
 * respaldo de la bodega. Ahora, en el orden de la pregunta del cliente:
 *   1. Saludo + tu último pedido y su estado.
 *   2. Secciones `?sub=`: Pedidos · Puntos · Mis datos · Ayuda (una a la vez).
 * Colores y letras: los del negocio (tokens que pone su tema), sin respaldos fijos.
 */

import { usePathname } from "next/navigation";
import { useCustomer } from "@/contexts/customer-context";
import { CuentaSaludo } from "@/components/store/cuenta/CuentaSaludo";
import { SeccionesCuenta } from "@/components/store/cuenta/SeccionesCuenta";
import { baseDeTienda } from "@/components/store/cuenta/cuenta-rutas";
import { usePedidosCliente } from "@/components/store/cuenta/use-pedidos-cliente";

export function CuentaDashboardClient() {
  const { customer, hydrated } = useCustomer();
  const base = baseDeTienda(usePathname());
  const pedidos = usePedidosCliente(customer?.phone);
  const nombre = customer?.name?.trim() || null;
  const conSesion = Boolean(customer);

  // Mientras se lee la sesión guardada, el esqueleto del saludo (sin parpadear «Entrar»).
  if (!hydrated) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <CuentaSaludo nombre={nombre} conSesion={conSesion} base={base} pedidos={pedidos} />
      <SeccionesCuenta base={base} nombre={nombre} conSesion={conSesion} pedidos={pedidos} />
    </div>
  );
}

export default CuentaDashboardClient;
