"use client";

/**
 * Caja › Hoy › Cuadrar: contar billetes y monedas contra el esperado de la
 * caja abierta. Es la mitad de arriba de lo que era la sección «Cuadrar»
 * (`CashAuditTab`) hasta el 10-10: el contador es de HOY y la tabla de cuadres
 * es historial (Historial › Por caja). Mismo hook (`useArqueos`) y mismo
 * contador: no cambia ninguna cuenta.
 *
 * «Viene del turno de…» (`?turno=`) va arriba: Turnos manda acá al cerrar.
 */
import { useState } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import ContadorEfectivo from "@/components/admin/arqueo/ContadorEfectivo";
import DesdeTurno from "@/components/admin/arqueo/DesdeTurno";
import { useArqueos } from "@/components/admin/arqueo/use-arqueos";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useCierreACiegas } from "@/components/admin/turnos/cierre-a-ciegas";

export function CajaContar({ onIrACaja }: { onIrACaja: () => void }) {
  const { loading, error, reload, openRegister, openAudit, openExpectedAmount } = useArqueos();
  /* En su propia sección el contador arranca abierto: es lo único que hay. */
  const [abierto, setAbierto] = useState(true);
  /* Cierre a ciegas (Configuración › Cobros): el cajero cuenta sin ver lo esperado hasta guardar. */
  const { ciego } = useCierreACiegas();

  return (
    <div className="space-y-3">
      <DesdeTurno />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] py-1 pl-4 pr-1 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          <button type="button" onClick={reload} className="ml-auto min-h-12 rounded-xl px-3 font-bold underline">
            Reintentar
          </button>
        </div>
      ) : loading && !openRegister ? (
        <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8" role="status" aria-label="Cargando la caja">
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <ContadorEfectivo
          expectedAmount={openExpectedAmount}
          registerId={openRegister?.id ?? null}
          abiertaDesde={openRegister?.openedAt ?? null}
          ultimoConteo={openAudit?.conteos[0] ?? null}
          abierto={abierto}
          onAlternar={() => setAbierto((v) => !v)}
          onSaved={reload}
          onIrACaja={onIrACaja}
          ciego={ciego}
        />
      )}
    </div>
  );
}
