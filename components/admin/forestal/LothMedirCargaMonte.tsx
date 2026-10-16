"use client";

/**
 * «Cargas medidas» en la cola del monte (16-10, F3, `?tab=loth-libro-operaciones&vista=monte`):
 * «Medir una carga» mide por foto y guarda la carga para que la oficina arme
 * la guía con ella. Abajo, las cargas sin usar (se pueden descartar) y lo que
 * pasó con las últimas (usada en tal guía / descartada).
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Camera } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { etiquetaPermiso } from "@/lib/forestal/medicion-carga";
import { Btn } from "./ctp-shared";
import { useCargasMedidas } from "./hooks/use-cargas-medidas";
import LothCargasMedidasTarjeta, { DescartarCarga, EstadoDeCarga } from "./LothCargasMedidasTarjeta";

const LothMedirCargaMonteModal = dynamic(() => import("./LothMedirCargaMonteModal"), { ssr: false });

export default function LothMedirCargaMonte() {
  const cm = useCargasMedidas();
  const [midiendo, setMidiendo] = useState(false);
  const planes = cm.datos?.planes;
  const permisoDe = (id: string | null) => (id ? (etiquetaPermiso(planes?.find((p) => p.id === id)) ?? "otro permiso") : null);
  const cargas = cm.datos?.cargas ?? [];
  const recientes = cm.datos?.recientes ?? [];

  return (
    <section className="space-y-3" data-qa="cargas-monte">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
          Cargas medidas
        </CardTitle>
        <InfoTip
          title="Cargas medidas"
          what="Mide la carga por foto acá en el monte y guárdala: la oficina la usa al armar la guía, sin volver a medir."
          affects="Las fotos quedan en el Drive (carpeta del permiso › Cargas medidas) aunque nadie registre la guía. Al registrarla, la carga queda «usada» con el N° de la guía."
          example="14 trozas · N° 24 a 37 · 3,412 m³ → «Usada en la guía 019-001-0000123»"
          ariaLabel="Qué son las cargas medidas"
        />
        {cargas.length > 0 && <span className="text-sm text-[var(--text-secondary)]">{cargas.length} sin usar</span>}
        <Btn variant="primary" className="ml-auto" onClick={() => setMidiendo(true)} disabled={!cm.datos} data-qa="medir-carga-monte">
          <Camera className="h-4 w-4" aria-hidden="true" /> Medir una carga
        </Btn>
      </div>

      {cm.error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          {cm.error}
        </p>
      )}

      {cargas.map((c) => (
        <LothCargasMedidasTarjeta
          key={c.id}
          c={c}
          permiso={permisoDe(c.planId)}
          acciones={<DescartarCarga onDescartar={(motivo) => cm.descartar(c.id, motivo)} />}
        />
      ))}

      {recientes.length > 0 && (
        <details className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-qa="cargas-terminadas">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold text-[var(--text-primary)]">
            Cargas usadas o descartadas ({recientes.length})
          </summary>
          <ul className="divide-y divide-[var(--rule-soft)] px-4 pb-2">
            {recientes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="font-bold text-[var(--text-primary)]">
                  {c.trozas} {c.trozas === 1 ? "troza" : "trozas"}
                </span>
                <EstadoDeCarga c={c} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {midiendo && <LothMedirCargaMonteModal cm={cm} onClose={() => setMidiendo(false)} />}
    </section>
  );
}
