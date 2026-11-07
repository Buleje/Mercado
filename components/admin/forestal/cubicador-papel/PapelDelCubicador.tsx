"use client";

/**
 * Formato de papel + papel vinculado de una cubicación (Brandon 23-10: «que
 * tengan su formato ahí para descargar y cubicador con ese papel vinculado
 * para que se haga más fácil buscar»).
 * CONTRATO: lo montan el cubicador de madera (carril «cubicador-secciones») y
 * el de trozas; no cambiar esta firma.
 *
 * - «Formato»: la planilla de campo que va con el cubicador (aserrada = pie
 *   tablar; trozas = Smalian u Oxapampina), para imprimir o en Excel. Desde
 *   una guardada sale con su código («CUB-2026-0003» / «MA-7K3QX»).
 * - «Papel»: la foto o el PDF de la hoja llena, en el Archivo («Cubicador/
 *   Papeles», etiquetas `papel-cubicador` + `cubicacion:<id>` + el código).
 *   Buscar la cubicación por el código de su hoja: `filtrarPorHoja`
 *   (`./papel-cubicador`); marcar las que tienen papel: `usePapelesDeCubicaciones`.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import FormatoDelPapel from "./FormatoDelPapel";
import HojasDelPapel from "./HojasDelPapel";
import { useFichaDelPapel } from "./use-ficha-del-papel";
import { usePapelDeCubicacion, type PapelDeCubicacion } from "./use-papel";

export type TipoCubicacionPapel = "aserrada" | "trozas";

export interface PapelDelCubicadorProps {
  tipo: TipoCubicacionPapel;
  /** Id de la cubicación guardada (cubicaciones o cubicaciones-trozas); null = sin guardar: sólo se baja el formato. */
  cubicacionId?: string | null;
  /** Nombre del lote para el encabezado del formato. */
  etiqueta?: string;
  /** «barra» = botones compactos para una cabecera; «tarjeta» = bloque dentro de una tarjeta de guardadas. */
  variante?: "barra" | "tarjeta";
}

const BOTON_BARRA = button({ variant: "secondary", className: "rounded-xl px-3" });

function Contenido({ tipo, cubicacionId, etiqueta, papel }: { tipo: TipoCubicacionPapel; cubicacionId: string | null; etiqueta?: string; papel: PapelDeCubicacion }) {
  const ficha = useFichaDelPapel(cubicacionId, tipo === "aserrada");
  return (
    <div className="space-y-4">
      {cubicacionId && papel.codigo && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          Código de la hoja
          <span className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-base font-bold text-[var(--text-primary)]" data-codigo-hoja>
            {papel.codigo}
          </span>
          <InfoTip
            what="Va impreso arriba a la derecha y al pie de la hoja que bajas desde aquí."
            affects="Escribe ese código en el buscador de «Guardadas» (o en el del Archivo) y aparece esta cubicación con su papel."
            example={`Buscas «${papel.codigo.slice(-4)}» y sale ${papel.codigo}.`}
          />
        </p>
      )}
      <section className="space-y-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Formato para llenar a mano</CardTitle>
        <FormatoDelPapel tipo={tipo} formula={papel.formula} codigo={cubicacionId ? papel.codigo : null} lote={etiqueta || papel.persona || undefined} ficha={ficha} />
      </section>
      <section className="space-y-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Papel lleno</CardTitle>
        {cubicacionId ? (
          <HojasDelPapel papel={papel} cubicacionId={cubicacionId} />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Guarda la cubicación y aquí le vinculas la foto de su hoja.</p>
        )}
      </section>
    </div>
  );
}

export function PapelDelCubicador({ tipo, cubicacionId = null, etiqueta, variante = "barra" }: PapelDelCubicadorProps) {
  const id = cubicacionId?.trim() || null;
  const papel = usePapelDeCubicacion(tipo, id, etiqueta);
  const [abierto, setAbierto] = useState(false);
  const n = papel.hojas.length;

  if (variante === "tarjeta") {
    return (
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4" data-vista="papel-tarjeta">
        <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <FileText className="h-4 w-4 text-[var(--accent)]" /> Papel de la hoja
          {n > 0 && <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">{n}</span>}
        </CardTitle>
        <Contenido tipo={tipo} cubicacionId={id} etiqueta={etiqueta} papel={papel} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(BOTON_BARRA, "gap-1.5")}
        onClick={() => setAbierto(true)}
        title={id ? "El formato para imprimir y la foto de la hoja llena de esta cubicación" : "El formato de papel para llenar a mano"}
        data-accion="papel-del-cubicador"
      >
        <FileText className="h-4 w-4" /> {id ? "Papel" : "Formato"}
        {id && n > 0 && <span className="rounded-md bg-[var(--accent-soft)] px-1.5 text-xs font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{n}</span>}
      </button>
      {abierto && (
        <AdminModal
          open
          onClose={() => setAbierto(false)}
          aboveModals
          size="md"
          icon={FileText}
          title={id && papel.codigo ? `Papel · ${papel.codigo}` : "Formato de papel"}
          description={etiqueta || undefined}
          claveVentana="cubicador-papel"
          footer={<div className="flex justify-end"><button type="button" className={BOTON_BARRA} onClick={() => setAbierto(false)}>Cerrar</button></div>}
        >
          <div className={MODAL_BODY}>
            <Contenido tipo={tipo} cubicacionId={id} etiqueta={etiqueta} papel={papel} />
          </div>
        </AdminModal>
      )}
    </>
  );
}
