"use client";

/**
 * CuentaLayoutShell — marco de «Mi cuenta».
 *
 * 2026-10-11: sin barra lateral ni pestañas de arriba. Repetían los mismos
 * accesos que el panel (Direcciones, Pagos, Cupones… dos veces en la misma
 * pantalla); ahora viven en «Mis datos» y el menú de cuenta de la cabecera.
 * Una columna angosta: se lee de un vistazo en la compu y en el celular.
 * El fondo es el del negocio (`--surface-canvas` de su tema).
 */

import dynamic from "next/dynamic";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));

export interface CuentaLayoutShellProps {
  children: React.ReactNode;
}

export function CuentaLayoutShell({ children }: CuentaLayoutShellProps) {
  return (
    <div className="min-h-[70vh] bg-[var(--surface-canvas)]">
      <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        {children}
      </main>
      <CartSidebar />
    </div>
  );
}

export default CuentaLayoutShell;
