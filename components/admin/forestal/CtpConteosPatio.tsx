"use client";

/**
 * «Último conteo: sábado 26/09 · faltaron 3» — el conteo físico del patio,
 * visto desde el libro (Brandon 2026-09-26).
 *
 * El conteo se hace en el modo patio con la pistola (`PatioConteo`) y al
 * terminar su acta se guarda en el servidor. Acá, en la pestaña Trozas, una
 * línea dice cómo salió el último; al tocarla se abre el historial (quién,
 * cuántas se esperaban y se encontraron, qué faltó y qué sobró) y cada acta se
 * puede reimprimir tal cual salió en la tablet.
 */

import { useState } from "react";
import { ArrowLeft, ClipboardList, Loader2, Printer } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import { actaDelConteo } from "@/lib/forestal/conteo-patio-acta";
import { diaDelConteo, fraseDelConteo } from "@/lib/forestal/conteo-patio-historial";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import { Btn, ModalFooter } from "./ctp-shared";
import { Cargando, DetalleConteo, ErrorConReintento, HistorialConteos } from "./ctp-conteos-patio-partes";
import { useActaConteo, useHistorialConteos, useNombreDelNegocio, useUltimoConteo } from "./hooks/use-conteos-patio";

function ConteosPatioModal({ onClose }: { onClose: () => void }) {
  const historial = useHistorialConteos(true);
  const [elegida, setElegida] = useState<string | null>(null);
  const detalle = useActaConteo(elegida);
  const negocio = useNombreDelNegocio(true);
  const [errorImprimir, setErrorImprimir] = useState<string | null>(null);

  /* El acta ya está cargada cuando se ve el botón: la ventana se abre en el
     MISMO clic, sin `await` de por medio (si no, el navegador la bloquea). */
  const imprimir = () => {
    if (!detalle.acta?.conteo) return;
    try {
      openCtpReport(actaDelConteo(detalle.acta.conteo, negocio));
      setErrorImprimir(null);
    } catch (e) {
      setErrorImprimir(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Conteos del patio"
      description="Las actas de «Contar el patio», del modo patio."
      icon={ClipboardList}
      className="sm:max-w-[56rem]"
      footer={
        <ModalFooter>
          {elegida ? (
            <>
              <Btn onClick={() => setElegida(null)}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Todos los conteos
              </Btn>
              <Btn
                variant="primary"
                onClick={imprimir}
                disabled={!detalle.acta?.conteo}
                title={detalle.acta && !detalle.acta.conteo ? "Esta acta no guardó el conteo completo" : undefined}
              >
                <Printer className="h-4 w-4" aria-hidden /> Imprimir el acta
              </Btn>
            </>
          ) : (
            <Btn onClick={onClose}>Cerrar</Btn>
          )}
        </ModalFooter>
      }
    >
      <div className={cn("space-y-3", MODAL_BODY)}>
        {errorImprimir && (
          <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            {errorImprimir}
          </p>
        )}
        {elegida ? (
          detalle.error ? (
            <ErrorConReintento error={detalle.error} onReintentar={detalle.recargar} />
          ) : detalle.acta ? (
            <DetalleConteo acta={detalle.acta} />
          ) : (
            <Cargando texto="Trayendo el acta…" />
          )
        ) : historial.error ? (
          <ErrorConReintento error={historial.error} onReintentar={historial.recargar} />
        ) : !historial.conteos ? (
          <Cargando texto="Trayendo los conteos…" />
        ) : historial.conteos.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            Todavía no hay conteos guardados: se hacen en el modo patio, con «Contar el patio».
          </p>
        ) : (
          <HistorialConteos conteos={historial.conteos} onVer={setElegida} />
        )}
      </div>
    </AdminModal>
  );
}

export default function CtpConteosPatio() {
  const { ultimo, cargando, error, recargar } = useUltimoConteo();
  const [abierto, setAbierto] = useState(false);

  /* Faltó o sobró algo: la línea va en el color del aviso. */
  const pideMirar = ultimo ? ultimo.faltan + ultimo.sobrantes + ultimo.sorpresas > 0 : false;
  const texto = ultimo
    ? `Último conteo: ${diaDelConteo(ultimo.fecha)} · ${fraseDelConteo(ultimo)}`
    : cargando
      ? "Último conteo…"
      : error
        ? "Conteos del patio"
        : "Conteos del patio: ninguno todavía";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-left text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
        data-ultimo-conteo
      >
        {cargando && !ultimo ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <ClipboardList className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        )}
        <span className={cn("min-w-0", pideMirar && "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]")}>
          {texto}
        </span>
      </button>
      {abierto && (
        <ConteosPatioModal
          onClose={() => {
            setAbierto(false);
            /* Mientras estaba abierto pudo llegar un acta nueva desde el patio. */
            recargar();
          }}
        />
      )}
    </>
  );
}
