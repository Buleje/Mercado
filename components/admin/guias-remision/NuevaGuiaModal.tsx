"use client";

/**
 * «Nueva guía de remisión» en 5 etapas (F18): Origen → Destino → Transporte →
 * Carga → Revisar. Se salta a cualquiera sin perder nada; la línea de resumen
 * acompaña todas; «Crear guía» espera a que no falte nada. Lo escrito queda
 * como borrador en este navegador.
 */
import { Check, History, Loader2, Truck } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { diaYFecha } from "@/components/admin/einvoice/emision-reglas";
import { EtapasGuia } from "./guia-piezas";
import { resumenGuia } from "./guia-reglas";
import { GuiaItemsEditor } from "./GuiaItemsEditor";
import { GuiaPasoDestino } from "./GuiaPasoDestino";
import { GuiaPasoOrigen } from "./GuiaPasoOrigen";
import { GuiaPasoRevisar } from "./GuiaPasoRevisar";
import { GuiaPasoTransporte } from "./GuiaPasoTransporte";
import type { NuevaGuia } from "./use-nueva-guia";

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
};

export function NuevaGuiaModal({ g }: { g: NuevaGuia }) {
  const { paso, pendientes, creating } = g;
  const resumen = resumenGuia(g.form, g.items, g.pedido);
  const ultimo = paso === "revisar";
  const faltan = pendientes.length;

  const pie = (
    <ModalFooter
      error={g.error}
      nota={faltan > 0 ? `${faltan === 1 ? "Falta 1 dato" : `Faltan ${faltan} datos`} · se guarda solo como borrador` : "Se guarda solo como borrador"}
    >
      {paso === "origen" ? (
        <button type="button" onClick={g.cerrar} className={button({ variant: "secondary" })}>Cancelar</button>
      ) : (
        <button type="button" onClick={g.atras} className={button({ variant: "secondary" })}>Atrás</button>
      )}
      {ultimo ? (
        <button
          type="button"
          onClick={() => void g.crear()}
          disabled={creating || faltan > 0}
          title={faltan > 0 ? "Completa lo que falta para crear la guía" : undefined}
          data-qa="guia-crear"
          className={button({ variant: "primary", className: "px-6" })}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Crear guía
        </button>
      ) : (
        <button type="button" onClick={g.siguiente} data-qa="guia-siguiente" className={button({ variant: "primary", className: "px-6" })}>
          Siguiente
        </button>
      )}
    </ModalFooter>
  );

  return (
    <AdminModal open={g.abierto} onClose={g.cerrar} title="Nueva guía de remisión" icon={Truck} size="lg" claveVentana="guias-remision-nueva" footer={pie}>
      <div className={cn("space-y-4", MODAL_BODY)}>
        <EtapasGuia paso={paso} pendientes={pendientes} onIr={g.irA} />
        {resumen.length > 0 && (
          <p className="truncate text-sm text-[var(--text-secondary)]" data-qa="guia-resumen" title={resumen.join(" · ")}>
            {resumen.join(" · ")}
          </p>
        )}
        {g.recuperado && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--data-info-100)] px-3 py-1 text-sm text-[var(--data-info-ink)]">
            <History className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Seguimos tu borrador del {diaYFecha(g.recuperado)}, {hora(g.recuperado)}.</span>
            <button type="button" onClick={g.empezarDeCero} className={button({ variant: "ghost", className: "rounded-xl" })}>
              Empezar de cero
            </button>
          </div>
        )}

        {paso === "origen" && <GuiaPasoOrigen g={g} />}
        {paso === "destino" && <GuiaPasoDestino g={g} />}
        {paso === "transporte" && <GuiaPasoTransporte g={g} />}
        {paso === "carga" && <GuiaItemsEditor g={g} />}
        {ultimo && <GuiaPasoRevisar g={g} />}
      </div>
    </AdminModal>
  );
}
