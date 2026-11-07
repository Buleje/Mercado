"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "@buleje/design-system/icons";
import { BadgeStatus, SectionTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatTime } from "@/lib/format";
import { diaCorto, ESTADO_INSPECCION } from "../formato";
import type { InspeccionDeLaPantalla } from "./inspeccion-datos";

/** Planta, día, inspector, estado y desde cuándo está congelado el libro contra el que se compara. */
export function InspeccionCabecera({ insp, onImprimir }: { insp: InspeccionDeLaPantalla; onImprimir: () => void }) {
  const nombre = insp.planta?.nombre ?? insp.plantaNombre ?? null;
  const estado = ESTADO_INSPECCION[insp.estado];
  return (
    <div className="space-y-3">
      <Link
        href={`/superadmin/plantas/${encodeURIComponent(insp.tenantId)}?sub=seguimiento`}
        className="inline-flex min-h-10 items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la ficha
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle className="min-w-0 break-words">{nombre ?? "Planta sin nombre"}</SectionTitle>
            <BadgeStatus variant={estado.variante} label={estado.rotulo} size="md" />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
            <span className="first-letter:uppercase">{diaCorto(insp.fecha)}</span>
            <span aria-hidden>·</span>
            <span>{insp.inspector}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              Libro congelado a las {formatTime(insp.libro.tomadaEn)}
              <InfoTip
                title="Libro congelado"
                what="Al abrir la inspección se guardó una foto del libro de la planta: trozas, aserrada e incoherencias de ese momento."
                affects="Todo lo que cuentas se compara contra esa foto, aunque la planta siga registrando."
              />
            </span>
          </div>
        </div>
        <Button variant="secondary" onClick={onImprimir}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir acta
        </Button>
      </div>
    </div>
  );
}
