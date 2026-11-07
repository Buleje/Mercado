"use client";

/**
 * BotonGoogle + ChipCliente — «Continuar con Google» y el saludo cuando ya
 * entró. Sin colores de marca fijos: cada tienda los viste con `className`
 * (Musa con sus variables `--mu-*`, la tienda genérica con tokens del DS).
 * La lógica vive en `useClienteTienda`; aquí sólo el botón.
 *
 *   const c = useClienteTienda();
 *   {c.disponible && !c.cliente && <BotonGoogle entrar={c.entrarConGoogle} className="…" />}
 *   {c.cliente && <ChipCliente cliente={c.cliente} onSalir={c.salir} className="…" />}
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClienteTienda } from "@/lib/tienda-cliente/contrato";

export interface BotonGoogleProps {
  /** `useClienteTienda().entrarConGoogle` */
  entrar: (volverA?: string) => Promise<void>;
  /** Adónde volver tras elegir la cuenta (por defecto, la página actual). */
  volverA?: string;
  texto?: string;
  className?: string;
  /** Clase del aviso de error bajo el botón. */
  claseError?: string;
}

export function BotonGoogle({
  entrar,
  volverA,
  texto = "Continuar con Google",
  className,
  claseError,
}: BotonGoogleProps) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState(false);

  const alTocar = () => {
    setError(false);
    setAbriendo(true);
    entrar(volverA).catch(() => {
      // El hook ya registró el motivo; al cliente, una línea.
      setError(true);
      setAbriendo(false);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={alTocar}
        disabled={abriendo}
        aria-busy={abriendo}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border px-5 text-base font-semibold transition-opacity disabled:cursor-wait disabled:opacity-70",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de Google (archivo en public/, sus colores no son tokens) */}
        <img src="/marcas/google-g.svg" alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5 shrink-0" />
        <span>{abriendo ? "Abriendo Google…" : texto}</span>
      </button>
      {error && (
        <p role="alert" className={cn("text-sm", claseError)}>
          No pudimos abrir Google. Prueba de nuevo o escribe tu nombre.
        </p>
      )}
    </div>
  );
}

export interface ChipClienteProps {
  cliente: ClienteTienda;
  /** `useClienteTienda().salir`; sin esto no aparece «No soy yo». */
  onSalir?: () => Promise<void> | void;
  className?: string;
  /** Clase del botón «No soy yo». */
  claseSalir?: string;
}

/** «Hola, Ana» con la foto de Google y un «No soy yo» para cambiar de cuenta. */
export function ChipCliente({ cliente, onSalir, className, claseSalir }: ChipClienteProps) {
  const primerNombre = cliente.nombre.split(/\s+/)[0] || cliente.nombre;
  const [fotoRota, setFotoRota] = useState(false);
  return (
    <div className={cn("flex min-h-12 items-center gap-3", className)}>
      {cliente.avatar && !fotoRota ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de Google (dominio externo, sin optimizar)
        <img
          src={cliente.avatar}
          alt=""
          width={36}
          height={36}
          referrerPolicy="no-referrer"
          onError={() => setFotoRota(true)}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold">
          {primerNombre.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-base">
        Hola, <strong className="font-semibold">{primerNombre}</strong>
      </span>
      {onSalir && (
        <button
          type="button"
          onClick={() => void onSalir()}
          className={cn("h-12 shrink-0 px-2 text-sm underline underline-offset-4", claseSalir)}
        >
          No soy yo
        </button>
      )}
    </div>
  );
}

export default BotonGoogle;
