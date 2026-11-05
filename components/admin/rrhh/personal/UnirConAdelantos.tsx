"use client";

/**
 * UnirConAdelantos — «"Chato" de Adelantos es Chato Gallinero de tu equipo»
 * (Brandon 04-11, «unir trabajadores y adelantos»).
 *
 * Medido en Blas: 0 de 11 trabajadores unidos a su cuenta de Adelantos y 10
 * sin DNI, así que la sugerencia por documento nunca salía. El servidor marca
 * `pareceA` (nombre parecido fuerte y sin ambigüedad, `lib/rrhh/parecido-nombre.ts`)
 * y acá se ofrece el «Unir» de un toque. Nunca se une solo: siempre lo
 * confirma la persona, y el servidor vuelve a chequear el documento.
 */

import { useState } from "react";
import { Link2, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { pluralizar } from "../rrhh-ui";
import type { CandidatoDesdeAdelantosDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";

export type UnirFn = (colaboradorId: string, beneficiarioId: string) => Promise<{ ok: true } | { ok: false; error: RrhhApiError }>;

/** Cuántos pares se muestran a la vista; el resto queda en «Traer de Adelantos». */
const MAX_A_LA_VISTA = 3;

/** El código del servidor, en criollo (mismos casos que `FichaCuenta`). */
export function textoErrorUnir(error: RrhhApiError): string {
  if (error.error === "documento_no_coincide") return "Esa cuenta tiene otro documento: no se puede unir.";
  if (error.error === "beneficiario_ya_vinculado") return "Esa cuenta ya está unida a otra persona.";
  if (error.error === "requiere_admin") return "Solo el dueño o un administrador puede unir cuentas.";
  return error.message ?? "No se pudo unir.";
}

export function BotonUnirConAdelantos({
  colaboradorId,
  beneficiarioId,
  onUnir,
  onUnido,
  etiqueta = "Unir",
  ariaLabel,
}: {
  colaboradorId: string;
  beneficiarioId: string;
  onUnir: UnirFn;
  onUnido?: () => void;
  etiqueta?: string;
  /** Con varios «Unir» en pantalla, el lector de pantalla necesita saber cuál es cuál. */
  ariaLabel?: string;
}) {
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unir = async () => {
    setUniendo(true);
    setError(null);
    const res = await onUnir(colaboradorId, beneficiarioId);
    setUniendo(false);
    if (!res.ok) {
      setError(textoErrorUnir(res.error));
      return;
    }
    onUnido?.();
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={uniendo} onClick={unir} className={BOTON.chico} aria-label={ariaLabel}>
        {uniendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {etiqueta}
      </button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** Arriba de la tabla de Equipo: hasta 3 pares «cuenta → trabajador» con su «Unir». */
export function AvisoUnirConAdelantos({
  candidatos,
  onUnir,
  onUnido,
}: {
  candidatos: readonly CandidatoDesdeAdelantosDTO[];
  onUnir: UnirFn;
  onUnido: () => void;
}) {
  const pares = candidatos.filter((c): c is CandidatoDesdeAdelantosDTO & { pareceA: NonNullable<CandidatoDesdeAdelantosDTO["pareceA"]> } => c.pareceA != null);
  if (pares.length === 0) return null;
  const aLaVista = pares.slice(0, MAX_A_LA_VISTA);
  const resto = pares.length - aLaVista.length;

  return (
    <AvisoRrhh tono="info" icono={Link2}>
      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
        {pluralizar(pares.length, "cuenta de Adelantos parece", "cuentas de Adelantos parecen")} de tu equipo
        <InfoTip
          title="Unir con su cuenta de Adelantos"
          what="Tienen casi el mismo nombre y la persona todavía no está unida a ninguna cuenta."
          affects="Al unir, sus adelantos abiertos se ven en su ficha, en Lo ganado y en el pago del sábado. No se mueve plata ni se borra nada."
          example="«Chato» de Adelantos → Chato Gallinero de tu equipo."
        />
      </p>
      <ul className="mt-2 space-y-2">
        {aLaVista.map((c) => (
          <li key={c.beneficiarioId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 text-[var(--text-primary)]">
              «{c.nombre}» de Adelantos <span aria-hidden>→</span>
              <span className="sr-only">es</span> <span className="font-semibold">{c.pareceA.nombre}</span>
            </span>
            <BotonUnirConAdelantos
              colaboradorId={c.pareceA.colaboradorId}
              beneficiarioId={c.beneficiarioId}
              onUnir={onUnir}
              onUnido={onUnido}
              ariaLabel={`Unir «${c.nombre}» con ${c.pareceA.nombre}`}
            />
          </li>
        ))}
      </ul>
      {resto > 0 && <p className="mt-2 text-xs text-[var(--text-tertiary)]">Y {pluralizar(resto, "otra", "otras")} en ⋯ › Traer de Adelantos.</p>}
    </AvisoRrhh>
  );
}
