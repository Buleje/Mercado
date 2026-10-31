"use client";

/**
 * IngresoGoogle — el ingreso con Google de las tiendas con memoria (17-10).
 *
 * Primera vez: el «Continuar con Google» de siempre (`BotonGoogle`).
 * Al volver: «Continuar como Ana · an•••@gmail.com» con su foto, que entra
 * directo con esa cuenta (`login_hint`, sin elegir otra vez); «Usar otra
 * cuenta» abre el selector de Google y la línea «Recordamos tu cuenta en este
 * equipo · Olvidar» (Ley 29733) borra el recuerdo de este
 * equipo (Ley 29733). Lo recordado vive en `lib/tienda-cliente/cuenta-recordada.ts`.
 *
 *   const c = useClienteTienda();
 *   {c.disponible && !c.cliente && <IngresoGoogle entrar={c.entrarConGoogle} className="…" />}
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { olvidarCuenta, type CuentaRecordada } from "@/lib/tienda-cliente/cuenta-recordada";
import { BotonGoogle } from "./BotonGoogle";
import { useCuentaRecordada } from "./use-cuenta-recordada";
import type { OpcionesEntrarGoogle } from "./use-cliente-tienda";

export interface IngresoGoogleProps {
  /** `useClienteTienda().entrarConGoogle` */
  entrar: (volverA?: string, opciones?: OpcionesEntrarGoogle) => Promise<void>;
  /** Adónde volver tras entrar (por defecto, la página actual). */
  volverA?: string;
  /** Botón principal (el mismo `className` que se le da a `BotonGoogle`). */
  className?: string;
  /** Aviso de error bajo el botón. */
  claseError?: string;
  /** «Usar otra cuenta» y «Olvidar». */
  claseEnlace?: string;
}

export function IngresoGoogle(props: IngresoGoogleProps) {
  const cuenta = useCuentaRecordada();
  if (!cuenta) {
    return <BotonGoogle entrar={props.entrar} volverA={props.volverA} className={props.className} claseError={props.claseError} />;
  }
  return <ContinuarComo cuenta={cuenta} {...props} />;
}

function ContinuarComo({
  cuenta,
  entrar,
  volverA,
  className,
  claseError,
  claseEnlace,
}: IngresoGoogleProps & { cuenta: CuentaRecordada }) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState(false);
  const [fotoRota, setFotoRota] = useState(false);
  const primerNombre = cuenta.nombre.split(/\s+/)[0] || cuenta.nombre;

  const ir = (opciones?: OpcionesEntrarGoogle) => {
    setError(false);
    setAbriendo(true);
    entrar(volverA, opciones).catch(() => {
      // El hook ya registró el motivo; al cliente, una línea.
      setError(true);
      setAbriendo(false);
    });
  };

  /* Enlaces dentro de la línea de texto: py-3 con -my-3 dan 44 px de toque sin agrandar la línea. */
  const enlace = cn("-my-3 inline-block rounded-lg px-1 py-3 underline underline-offset-4 disabled:opacity-60", claseEnlace);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => ir({ pista: cuenta.pista })}
        disabled={abriendo}
        aria-busy={abriendo}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-opacity disabled:cursor-wait disabled:opacity-70",
          className,
        )}
      >
        {cuenta.foto && !fotoRota ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto de Google (dominio externo, sin optimizar)
          <img
            src={cuenta.foto}
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
        {/* El nombre puede partirse en dos líneas (panel de 320 px): nunca «Continuar como Bra…». */}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-base font-semibold [overflow-wrap:anywhere]">
            {abriendo ? "Abriendo Google…" : `Continuar como ${primerNombre}`}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de Google (archivo en public/, sus colores no son tokens) */}
            <img src="/marcas/google-g.svg" alt="" aria-hidden="true" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{cuenta.correo ?? "Cuenta de Google"}</span>
          </span>
        </span>
      </button>
      {/* Ley 29733: avisar que se recuerda y dar el «Olvidar» en la misma línea (security 17-10). */}
      <p className="py-1 text-sm leading-6 text-[var(--text-secondary)]">
        Recordamos tu cuenta en este equipo ·{" "}
        <button
          type="button"
          onClick={() => olvidarCuenta()}
          disabled={abriendo}
          aria-label={`Olvidar la cuenta de ${primerNombre} en este equipo`}
          className={enlace}
        >
          Olvidar
        </button>
        {" · "}
        <button type="button" onClick={() => ir()} disabled={abriendo} className={enlace}>
          Usar otra cuenta
        </button>
      </p>
      {error && (
        <p role="alert" className={cn("text-sm", claseError)}>
          No pudimos abrir Google. Prueba de nuevo o escribe tu nombre.
        </p>
      )}
    </div>
  );
}

export default IngresoGoogle;
