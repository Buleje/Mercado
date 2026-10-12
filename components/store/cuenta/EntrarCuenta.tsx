"use client";

/**
 * Entrar a la cuenta, en dos toques como máximo: Google arriba (un toque, sólo
 * para que la tienda te salude y rellene tu nombre al pedir) y «Entrar con mi
 * celular» (código por SMS/WhatsApp: la sesión que de verdad abre pedidos,
 * puntos y datos).
 *
 * La consulta a Google (`/api/tienda-cliente/yo`) sale recién cuando esto se
 * dibuja —al abrir el menú o en «Mi cuenta» sin sesión—, nunca en cada página.
 */

import { useEffect, useState } from "react";
import { Smartphone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BotonGoogle } from "@/components/store/cliente/BotonGoogle";
import { useClienteTienda } from "@/components/store/cliente/use-cliente-tienda";
import { primerNombre, rutaEntrar } from "./cuenta-rutas";

/** Botón principal de la cuenta: tinta sobre fondo, contraste máximo en cualquier tema y negocio. */
export const BOTON_PRINCIPAL =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 text-base font-semibold text-[var(--surface-canvas)] transition-opacity duration-[var(--dur-fast)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export interface EntrarCuentaProps {
  /** Línea de arriba; por defecto saluda y dice para qué entrar. */
  titulo?: string;
  className?: string;
}

export function EntrarCuenta({ titulo, className }: EntrarCuentaProps) {
  const { cliente, disponible, entrarConGoogle } = useClienteTienda();
  // La vuelta del ingreso: la página actual (se lee al dibujar, no en el servidor).
  const [aqui, setAqui] = useState("/");
  useEffect(() => {
    setAqui(`${window.location.pathname}${window.location.search}`);
  }, []);

  const nombre = primerNombre(cliente?.nombre);
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p className="text-base font-semibold text-[var(--text-primary)]">
        {titulo ?? (nombre ? `Hola, ${nombre}. Entra para ver tus pedidos.` : "¡Hola! Entra y sigue tus pedidos.")}
      </p>
      {disponible && !cliente && (
        <BotonGoogle
          entrar={entrarConGoogle}
          className="border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          claseError="text-sm text-[var(--data-error-700)]"
        />
      )}
      <a href={rutaEntrar(aqui)} className={BOTON_PRINCIPAL}>
        <Smartphone className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        Entrar con mi celular
      </a>
    </div>
  );
}
