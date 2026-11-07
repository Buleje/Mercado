"use client";

/**
 * TramiteModal — crear o editar un trámite (ADR-524). Arriba los datos (se
 * guardan con el botón); abajo, ya creado, los requisitos y los papeles (se
 * guardan al toque). Al crear, la ventana se queda abierta en el trámite nuevo
 * para seguir con sus requisitos.
 */
import { useId } from "react";
import { FileCheck, FileText } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { hoyKey } from "../comun/fechas";
import { enlaceDocumento } from "../comun/subir-documento";
import { TramiteCampos } from "./TramiteCampos";
import { TramiteRequisitos } from "./TramiteRequisitos";
import { PLANTILLAS_TRAMITE, entidadDe } from "./tramites-ui";
import { useTramiteForm } from "./use-tramite-form";

interface Props {
  tramite: TramiteDto | null;
  plantilla?: string;
  onGuardado: (t: TramiteDto, eraNuevo: boolean) => void;
  onCerrar: () => void;
}

export function TramiteModal({ tramite, plantilla, onGuardado, onCerrar }: Props) {
  const formId = useId();
  const { partes } = useDirectorioForestal();
  const { b, cambiar, elegirPlantilla, guardar, error, guardando } = useTramiteForm(tramite, plantilla, hoyKey(), onGuardado, onCerrar);
  const conPlantilla = PLANTILLAS_TRAMITE.find((p) => p.id === b.plantilla);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={tramite ? tramite.asunto : "Nuevo trámite"}
      description={tramite ? entidadDe(tramite) : "Con quién, de qué y qué te pidieron"}
      icon={FileCheck}
      size="lg"
      footer={
        <ModalFooter error={error} atajo={!error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            {tramite ? "Cerrar" : "Cancelar"}
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando}>
            {guardando ? "Guardando…" : tramite ? "Guardar cambios" : "Crear trámite"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
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
          <TramiteCampos b={b} cambiar={cambiar} elegirPlantilla={elegirPlantilla} esNuevo={!tramite} partes={partes} parteNombre={tramite?.parteNombre ?? null} />
        </form>

        {tramite ? (
          <>
            <TramiteRequisitos tramite={tramite} onCambiado={(t) => onGuardado(t, false)} />
            {tramite.documentos.length > 0 && (
              <section className="space-y-2 border-t border-[var(--rule-soft)] pt-4" aria-label="Papeles del trámite">
                <CardTitle as="h3">Papeles del trámite</CardTitle>
                <ul className="flex flex-wrap gap-2">
                  {tramite.documentos.map((d) => (
                    <li key={d.id}>
                      <a href={enlaceDocumento(d.id)} target="_blank" rel="noopener noreferrer" className={button({ variant: "secondary", className: "max-w-full gap-2" })}>
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{d.nombre}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">
            {conPlantilla ? `Al crearlo trae los requisitos de «${conPlantilla.texto}».` : "Al crearlo podrás agregar sus requisitos y papeles."}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
