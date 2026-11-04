"use client";

/**
 * AlquilerModal — crear o abrir un alquiler (ADR-524). Ya creado, se ve en dos
 * secciones: «Pagos» (las cifras del `resumen` del servidor y la grilla mes a
 * mes) y «Datos del contrato» (los 4 bloques: inmueble, partes, plata, plazo,
 * más el contrato escaneado). Es un registro: no mueve caja.
 */
import { useId, useRef, useState } from "react";
import { Building2, FileText, Upload } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { AlquilerDto } from "@/lib/admin/fichas-tramites-alquileres";
import { hoyKey } from "../comun/fechas";
import { enlaceDocumento } from "../comun/subir-documento";
import { AlquilerCamposContrato } from "./AlquilerCamposContrato";
import { AlquilerCamposLocal } from "./AlquilerCamposLocal";
import { AlquilerPagos } from "./AlquilerPagos";
import { AlquilerResumen } from "./AlquilerResumen";
import { inquilinoDe } from "./alquileres-ui";
import { colgarContrato } from "./papeles-alquiler";
import { useAlquilerForm } from "./use-alquiler-form";

type Seccion = "pagos" | "datos";
const SECCIONES: { value: Seccion; label: string }[] = [
  { value: "pagos", label: "Pagos" },
  { value: "datos", label: "Datos del contrato" },
];

interface Props {
  alquiler: AlquilerDto | null;
  onGuardado: (a: AlquilerDto, eraNuevo: boolean) => void;
  onCerrar: () => void;
}

export function AlquilerModal({ alquiler, onGuardado, onCerrar }: Props) {
  const formId = useId();
  const { partes } = useDirectorioForestal();
  const { b, cambiar, guardar, error, guardando } = useAlquilerForm(alquiler, hoyKey(), onGuardado, onCerrar);
  const [seccion, setSeccion] = useState<Seccion>(alquiler ? "pagos" : "datos");
  const enDatos = !alquiler || seccion === "datos";
  const cambiado = (a: AlquilerDto) => onGuardado(a, false);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={alquiler ? alquiler.nombre : "Nuevo alquiler"}
      description={alquiler ? inquilinoDe(alquiler) || alquiler.direccion || "Alquiler" : "El local, quién alquila, la renta y el plazo"}
      icon={Building2}
      size="lg"
      footer={
        <ModalFooter error={enDatos ? error : null} nota="Registro, no mueve caja." atajo={false}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            {alquiler ? "Cerrar" : "Cancelar"}
          </button>
          {enDatos && (
            <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando}>
              {guardando ? "Guardando…" : alquiler ? "Guardar cambios" : "Crear alquiler"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {alquiler && <SegmentedControl<Seccion> value={seccion} onChange={setSeccion} options={SECCIONES} size="xl" label="Secciones del alquiler" />}

        {alquiler && seccion === "pagos" ? (
          <>
            <AlquilerResumen a={alquiler} />
            <AlquilerPagos a={alquiler} onCambiado={cambiado} />
          </>
        ) : (
          <>
            <form
              id={formId}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void guardar();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void guardar();
                }
              }}
            >
              <AlquilerCamposLocal b={b} cambiar={cambiar} partes={partes} duenoNombre={alquiler?.duenoNombre ?? null} inquilinoNombre={alquiler?.inquilinoNombre ?? null} />
              <AlquilerCamposContrato b={b} cambiar={cambiar} />
            </form>
            {alquiler ? <ContratoEscaneado a={alquiler} onCambiado={cambiado} /> : <p className="text-sm text-[var(--text-tertiary)]">Al crearlo podrás registrar los pagos y adjuntar el contrato.</p>}
          </>
        )}
      </div>
    </AdminModal>
  );
}

function ContratoEscaneado({ a, onCambiado }: { a: AlquilerDto; onCambiado: (a: AlquilerDto) => void }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (archivo: File | undefined) => {
    if (archivoRef.current) archivoRef.current.value = "";
    if (!archivo) return;
    setSubiendo(true);
    const r = await colgarContrato(a, archivo);
    setSubiendo(false);
    if (!r.ok) return void toast.error(r.error);
    onCambiado(r.alquiler);
    toast.success("Contrato adjuntado");
  };

  return (
    <section className="space-y-2 border-t border-[var(--rule-soft)] pt-4" aria-label="Contrato">
      <CardTitle as="h3">Contrato</CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        {a.contratoDocumentId ? (
          <a href={enlaceDocumento(a.contratoDocumentId)} target="_blank" rel="noopener noreferrer" className={button({ variant: "secondary", className: "gap-2" })}>
            <FileText className="size-4" aria-hidden="true" />
            Ver el contrato
          </a>
        ) : (
          <span className="text-sm text-[var(--text-tertiary)]">Todavía no se adjuntó el contrato.</span>
        )}
        <input ref={archivoRef} type="file" className="sr-only" tabIndex={-1} accept="image/*,application/pdf" onChange={(e) => void subir(e.target.files?.[0])} />
        <button type="button" className={button({ variant: a.contratoDocumentId ? "ghost" : "primary" })} disabled={subiendo} onClick={() => archivoRef.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {subiendo ? "Subiendo…" : a.contratoDocumentId ? "Cambiar el contrato" : "Adjuntar el contrato"}
        </button>
      </div>
    </section>
  );
}
