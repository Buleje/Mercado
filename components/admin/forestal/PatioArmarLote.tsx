"use client";

/**
 * «Armar lotes escaneando» en el patio: la tablet frente a la pila mezclada, la
 * pistola o la cámara, y la pila repartida en un lote por especie y permiso
 * para la sierra.
 *
 * Es la misma pieza que la pestaña Lotes (`CtpArmarLoteEscaneando`) a pantalla
 * entera. Crear un lote necesita señal —el servidor revisa pieza por pieza y
 * nada de esto se encola—, así que sin conexión se dice la verdad antes de
 * escanear: no se puede leer el patio ni crear lotes, y lo ya escaneado queda
 * guardado en la tablet (`usePilaEscaneada`).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Layers, WifiOff } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CtpArmarLoteEscaneando, {
  AvisoLotesArmados,
  type LoteArmado,
} from "./CtpArmarLoteEscaneando";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";

const BOTON =
  "inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]";

export default function PatioArmarLote({
  onVolver,
  online,
}: {
  onVolver: () => void;
  online: boolean;
}) {
  const estado = useLotesAserrio();
  /** Todo lo guardado en esta visita, lo último arriba. */
  const [armados, setArmados] = useState<LoteArmado[]>([]);

  return (
    <main className="mx-auto min-h-dvh max-w-[48rem] space-y-4 p-4" data-armar-lote-patio>
      <button type="button" onClick={onVolver} className={BOTON}>
        <ArrowLeft className="h-5 w-5" aria-hidden /> Volver al patio
      </button>

      <header className="flex items-center gap-2">
        <PageTitle className="flex items-center gap-2 text-[length:var(--ts-xl)] sm:text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">
          <Layers className="h-6 w-6 text-[var(--accent)]" aria-hidden /> Armar lotes escaneando
        </PageTitle>
        <InfoTip
          title="Armar lotes escaneando"
          what="Escaneas la pila mezclada y se reparte en un lote por especie y permiso: es lo que Producción consume."
          affects="Un lote no mezcla especies ni permisos, así que cada grupo de la pila se guarda como su propio lote. No entran las trozas ya usadas, apartadas en otro lote o de una guía sin recibir (te dice por qué)."
          example="Escaneas 8 Tornillo y 4 Copaiba → «Crear 2 lotes (12 trozas)» → LA-2026-060 y LA-2026-061, listos para producir."
          side="left"
        />
      </header>

      {!online && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-3 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
        >
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Sin señal: no se puede leer el
          patio ni crear lotes. Lo ya escaneado queda guardado en esta tablet.
        </p>
      )}

      {armados.length > 0 && (
        <div className="space-y-2">
          <AvisoLotesArmados lotes={armados} />
          {armados.some((r) => r.agregadas > 0) && (
            <Link
              href="/admin?tab=ctp-libro-operaciones&vista=lotes"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-base font-bold text-white hover:bg-[var(--accent-600)]"
            >
              <Layers className="h-5 w-5" aria-hidden /> Ver{" "}
              {armados.length === 1 ? "el lote" : "los lotes"} en el libro
            </Link>
          )}
        </div>
      )}

      <CtpArmarLoteEscaneando
        estado={estado}
        sinSenal={!online}
        onArmado={(nuevos) => setArmados((prev) => [...nuevos, ...prev])}
      />
    </main>
  );
}
