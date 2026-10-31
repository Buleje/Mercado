"use client";

/**
 * «Revisar pendientes» (C64): lo que en Compras necesita una mano, agrupado por
 * tipo. Cada caso dice la diferencia, quién pidió o recibió y a dónde ir a
 * arreglarlo. «Ya lo revisé» lo saca de la cuenta en este navegador; vuelve si
 * cambia lo que dice. Nada de acá escribe en tus datos.
 */
import { useState } from "react";
import { CheckCheck, ListChecks, RefreshCw, Undo2 } from "@buleje/design-system/icons";
import { BlockTitle, LoadingState } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import type { Excepcion } from "@/lib/compras/excepciones-compras";
import { estaRevisada, type useExcepcionesCompras } from "./use-excepciones-compras";

type Bandeja = ReturnType<typeof useExcepcionesCompras>;

export default function RevisarPendientesModal({
  open,
  onClose,
  onIr,
  datos,
}: {
  open: boolean;
  onClose: () => void;
  onIr: (href: string) => void;
  datos: Bandeja;
}) {
  const { bandeja, cargando, error, recargar, revisadas, alternarRevisada, sinRevisar } = datos;
  const [verRevisadas, setVerRevisadas] = useState(false);
  const cuantasRevisadas = bandeja ? bandeja.grupos.reduce((s, g) => s + g.excepciones.filter((e) => estaRevisada(e, revisadas)).length, 0) : 0;
  const ir = (href: string) => {
    onClose();
    onIr(href);
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Revisar pendientes"
      description="Costos sin anotar, entregas atrasadas, comprobantes repetidos y saldos que no cuadran."
      icon={ListChecks}
      size="lg"
      ayuda={
        <InfoTip
          title="Revisar pendientes"
          what="Junta lo que en Compras quedó a medias: cada caso dice la diferencia, quién lo pidió o recibió y a dónde ir a arreglarlo."
          affects="Sólo lee tus datos. «Ya lo revisé» lo saca de la cuenta en este navegador; si el caso cambia (otra diferencia), vuelve."
          example="La orden #8-CDLA5J tiene la leche sin costo: entras a la orden, anotas el precio y deja de salir acá."
          side="bottom"
        />
      }
      footer={
        <ModalFooter
          nota={
            cuantasRevisadas > 0 ? (
              <button type="button" onClick={() => setVerRevisadas((v) => !v)} className="text-sm font-semibold text-[var(--text-secondary)] underline-offset-4 hover:underline">
                {verRevisadas ? "Ocultar las revisadas" : `Mostrar las revisadas (${cuantasRevisadas})`}
              </button>
            ) : undefined
          }
        >
          <button type="button" onClick={() => void recargar()} disabled={cargando} className={button({ variant: "secondary", className: "rounded-xl" })}>
            <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
            Actualizar
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-5")}>
        {error && (
          <div role="alert" className="rounded-xl bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
            {error}
          </div>
        )}
        {!bandeja && !error && <LoadingState message="Revisando órdenes, cuentas y devoluciones..." />}
        {bandeja && sinRevisar === 0 && !verRevisadas && (
          <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
            {bandeja.total === 0 ? "Nada pendiente: costos, entregas, comprobantes y saldos están en orden." : "Ya revisaste todo lo pendiente."}
          </div>
        )}
        {bandeja?.grupos.map((g) => {
          const visibles = g.excepciones.filter((e) => verRevisadas || !estaRevisada(e, revisadas));
          if (visibles.length === 0) return null;
          return (
            <section key={g.tipo} className="space-y-2">
              <div className="flex items-center gap-2">
                <BlockTitle className="text-[var(--text-primary)]">
                  {g.rotulo} <span className="text-sm font-normal text-[var(--text-tertiary)]">{g.total > g.excepciones.length ? `${g.excepciones.length} de ${g.total}` : visibles.length}</span>
                </BlockTitle>
                <InfoTip title={g.rotulo} what={g.ayuda} side="bottom" />
              </div>
              <ul className="space-y-2">
                {visibles.map((e) => (
                  <FilaExcepcion key={e.id} e={e} revisada={estaRevisada(e, revisadas)} onIr={ir} onAlternar={() => alternarRevisada(e)} />
                ))}
              </ul>
            </section>
          );
        })}
        {bandeja?.plataOculta && (
          <div className="text-xs text-[var(--text-tertiary)]">Los saldos por pagar los revisa quien gestiona la plata.</div>
        )}
      </div>
    </AdminModal>
  );
}

function FilaExcepcion({ e, revisada, onIr, onAlternar }: { e: Excepcion; revisada: boolean; onIr: (href: string) => void; onAlternar: () => void }) {
  return (
    <li className={cn("rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3", revisada && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-[var(--text-primary)]">{e.titulo}</span>
        {e.fecha && <span className="text-xs text-[var(--text-tertiary)]">{diaCorto(e.fecha)}</span>}
      </div>
      <div className="text-sm text-[var(--text-primary)]">{e.diferencia}</div>
      <div className="text-xs text-[var(--text-secondary)]">{e.responsable}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {e.enlaces.map((l, i) => (
          <button key={l.href} type="button" onClick={() => onIr(l.href)} className={button({ variant: i === 0 ? "secondary" : "ghost", className: "rounded-xl" })}>
            {l.rotulo}
          </button>
        ))}
        <button type="button" onClick={onAlternar} className={button({ variant: "ghost", className: "rounded-xl" })}>
          {revisada ? <Undo2 className="h-4 w-4" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />}
          {revisada ? "Volver a pendiente" : "Ya lo revisé"}
        </button>
      </div>
    </li>
  );
}
