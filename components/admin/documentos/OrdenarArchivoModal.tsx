"use client";

import { useMemo } from "react";
import { CheckCircle2, Loader2, RotateCcw, Undo2, Wand2 } from "@buleje/design-system/icons";
import { ErrorAlert, LoadingState, SuccessAlert, WarningAlert } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { textoConteo, type Propuesta, type TipoPropuesta } from "@/lib/documentos/ordenar-archivo";
import { SeccionPropuestas } from "./ordenar/SeccionPropuestas";
import { useOrdenarArchivo } from "./ordenar/use-ordenar-archivo";

/**
 * «Ordenar mi Archivo» (22-10, pedido de Brandon): nombres claros, basura y
 * carpetas vacías, repetidos y lo que la IA ya sugirió, en una sola revisión.
 * Todo viene marcado; desmarcas lo que no quieras y aplicas. Los papeles van a
 * la papelera; las carpetas vacías se borran de verdad. «Deshacer» devuelve
 * todo como estaba (las carpetas, recreadas) mientras la ventana siga abierta.
 */

const ORDEN: readonly TipoPropuesta[] = ["nombre", "basura", "carpeta", "duplicado", "ia"];

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function OrdenarArchivoModal({
  onClose,
  onCambio,
  descartadas = [],
}: {
  onClose: () => void;
  /** Algo cambió (aplicar o deshacer): refrescar la lista del Archivo. */
  onCambio?: () => void;
  /** Sugerencias de la IA que descartaste en el aviso del Archivo. */
  descartadas?: readonly string[];
}) {
  const o = useOrdenarArchivo({ descartadas, onCambio });
  const ocupado = o.fase === "aplicando" || o.fase === "deshaciendo";

  const porTipo = useMemo(() => {
    const m = new Map<TipoPropuesta, Propuesta[]>();
    for (const p of o.plan?.propuestas ?? []) m.set(p.tipo, [...(m.get(p.tipo) ?? []), p]);
    return m;
  }, [o.plan]);
  const total = o.plan?.propuestas.length ?? 0;
  const resumen = ORDEN.filter((t) => (o.plan?.conteo[t] ?? 0) > 0)
    .map((t) => textoConteo(t, o.plan?.conteo[t] ?? 0))
    .join(" · ");

  const pie =
    o.fase === "hecho" ? (
      <ModalFooter error={o.error}>
        <button
          type="button"
          onClick={() => void o.deshacer()}
          disabled={!o.resultado || o.resultado.aplicados === 0}
          className={button({ variant: "secondary" })}
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
        </button>
        <button type="button" onClick={onClose} className={button({ variant: "primary" })}>
          Cerrar
        </button>
      </ModalFooter>
    ) : o.fase === "deshecho" || o.fase === "deshaciendo" ? (
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={ocupado} className={button({ variant: "primary" })}>
          Cerrar
        </button>
      </ModalFooter>
    ) : (
      <ModalFooter
        error={o.fase === "aplicando" ? null : o.error}
        nota={total > 0 ? <span className="tabular-nums">{o.marcadas} de {total} marcados</span> : undefined}
      >
        <button type="button" onClick={onClose} disabled={ocupado} className={button({ variant: "secondary" })}>
          {total === 0 && o.fase === "listo" ? "Cerrar" : "Cancelar"}
        </button>
        {total > 0 && (
          <button
            type="button"
            onClick={() => void o.aplicar()}
            disabled={o.fase !== "listo" || o.marcadas === 0}
            className={button({ variant: "primary" })}
          >
            {o.fase === "aplicando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
            {o.fase === "aplicando" ? "Aplicando…" : `Aplicar ${plural(o.marcadas, "cambio", "cambios")}`}
          </button>
        )}
      </ModalFooter>
    );

  return (
    <AdminModal
      open
      onClose={ocupado ? () => undefined : onClose}
      title="Ordenar mi Archivo"
      description={o.fase === "listo" && total > 0 ? resumen : "Nombres claros, basura, carpetas vacías y repetidos"}
      icon={Wand2}
      size="lg"
      claveVentana="ordenar-archivo"
      footer={pie}
    >
      <div className={`flex flex-col gap-4 ${MODAL_BODY}`}>
        {o.fase === "cargando" ? (
          <LoadingState size="lg" message="Revisando tu Archivo… (comparar los repetidos tarda unos segundos)" />
        ) : o.fase === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorAlert title="No se pudo revisar el Archivo" description={o.error ?? undefined} />
            <button type="button" onClick={o.recargar} className={button({ variant: "secondary" })}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
            </button>
          </div>
        ) : o.fase === "aplicando" ? (
          <Avance hechos={o.avance.hechos} total={o.avance.total} />
        ) : o.fase === "hecho" && o.resultado ? (
          <Hecho
            aplicados={o.resultado.aplicados}
            fallidos={o.resultado.fallidos}
            carpetas={o.resultado.deshacer.carpetas.length}
            revertidos={o.revertidos}
          />
        ) : o.fase === "deshaciendo" ? (
          <LoadingState size="lg" message="Devolviendo todo como estaba…" />
        ) : o.fase === "deshecho" ? (
          <SuccessAlert
            title={`Volvió como estaba: ${plural(o.revertidos, "cambio deshecho", "cambios deshechos")}`}
            description="Los nombres vuelven a ser los de antes y lo que fue a la papelera volvió a su carpeta. Las carpetas vacías se crearon de nuevo, también vacías."
          />
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--data-success-ink)]" aria-hidden />
            <p className="text-base font-semibold text-[var(--text-primary)]">Tu Archivo ya está ordenado</p>
            <p className="text-sm text-[var(--text-secondary)]">No hay nombres para limpiar, basura, carpetas vacías ni repetidos.</p>
          </div>
        ) : (
          ORDEN.filter((t) => porTipo.has(t)).map((t) => (
            <SeccionPropuestas
              key={t}
              tipo={t}
              propuestas={porTipo.get(t) ?? []}
              elegidas={o.elegidas}
              onAlternar={o.alternar}
              onMarcarTodas={o.marcarSeccion}
            />
          ))
        )}
      </div>
    </AdminModal>
  );
}

function Avance({ hechos, total }: { hechos: number; total: number }) {
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 py-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]" role="status">
        Aplicando {plural(total, "cambio", "cambios")}… no cierres esta ventana
      </p>
      <div
        role="progressbar"
        aria-label="Avance"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={hechos}
        className="h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      >
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
        {hechos} de {total}
      </p>
    </div>
  );
}

function Hecho({ aplicados, fallidos, carpetas, revertidos }: { aplicados: number; fallidos: number; carpetas: number; revertidos: number }) {
  return (
    <div className="flex flex-col gap-3">
      <SuccessAlert
        title={`Listo: ${plural(aplicados, "cambio", "cambios")}${revertidos > 0 ? ` (${revertidos} ya deshechos)` : ""}`}
        description={`Lo que fue a la papelera se puede recuperar desde ahí.${carpetas > 0 ? " Las carpetas vacías se borraron." : ""} Si algo no te gustó, «Deshacer» vuelve todo como estaba mientras esta ventana siga abierta.`}
      />
      {fallidos > 0 && (
        <WarningAlert
          title={`${plural(fallidos, "cambio no se aplicó", "cambios no se aplicaron")}`}
          description="Alguien los cambió mientras tanto o ya no estaban. Vuelve a abrir «Ordenar mi Archivo» para verlos de nuevo."
        />
      )}
    </div>
  );
}
