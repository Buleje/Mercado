"use client";

/**
 * Alta y edición de una licencia o permiso (ADR-497). El papel se adjunta
 * subiendo la foto (`/api/upload`, carpeta del plan) o pegando el enlace del
 * PDF en el Drive. Se monta con `key` = id: cada apertura parte de la licencia.
 */
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FileCheck, Link2, Upload, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { nuevoId } from "@/hooks/use-plan-empresa";
import { CAMPO, CAMPO_AREA, Campo } from "./campos-plan";
import { subirArchivoPlan, type Licencia } from "./licencias-util";

interface Props {
  abierto: boolean;
  /** `null` = nueva. */
  inicial: Licencia | null;
  onCerrar: () => void;
  onGuardar: (l: Licencia) => void;
}

const VACIA: Omit<Licencia, "id"> = {
  nombre: "",
  entidad: "",
  numero: "",
  emitida: "",
  vence: "",
  tramitada: true,
  nota: "",
  archivoUrl: "",
};

export function LicenciaModal({ abierto, inicial, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [f, setF] = useState<Licencia>(() => inicial ?? { id: nuevoId(), ...VACIA });
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const poner = <K extends keyof Licencia>(k: K, v: Licencia[K]) => setF((p) => ({ ...p, [k]: v }));

  const guardar = () => {
    const nombre = f.nombre.trim();
    if (!nombre) return setError("Escribe el nombre de la licencia.");
    if (f.emitida && f.vence && f.vence < f.emitida) return setError("La fecha de vencimiento es anterior a la de emisión.");
    onGuardar({ ...f, nombre });
    onCerrar();
  };

  const subir = async (file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    try {
      poner("archivoUrl", await subirArchivoPlan(file));
      toast.success("Foto adjunta");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={inicial ? "Editar licencia" : "Nueva licencia"}
      icon={FileCheck}
      size="lg"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={subiendo}>
            {inicial ? "Guardar cambios" : "Agregar"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        noValidate
        className={`${MODAL_BODY} grid grid-cols-1 gap-4 sm:grid-cols-2`}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <Campo rotulo="Nombre" className="sm:col-span-2">
          {(id) => (
            <input
              id={id}
              className={CAMPO}
              value={f.nombre}
              maxLength={160}
              placeholder="Licencia municipal de funcionamiento"
              onChange={(e) => poner("nombre", e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Entidad" ayuda="Quién la da: SUNAT, municipalidad, INDECOPI, DIGESA, SERFOR…">
          {(id) => (
            <input id={id} className={CAMPO} value={f.entidad} maxLength={160} onChange={(e) => poner("entidad", e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Número">
          {(id) => <input id={id} className={CAMPO} value={f.numero} maxLength={160} onChange={(e) => poner("numero", e.target.value)} />}
        </Campo>
        <div className="sm:col-span-2">
          <Interruptor
            variante="fila"
            enabled={f.tramitada}
            onChange={(v) => poner("tramitada", v)}
            label="Ya la tienes"
            desc="Apágalo si todavía falta tramitarla: queda como pendiente en el Resumen."
          />
        </div>
        <Campo rotulo="Emitida">
          {(id) => <input id={id} type="date" className={CAMPO} value={f.emitida} onChange={(e) => poner("emitida", e.target.value)} />}
        </Campo>
        <Campo rotulo="Vence" ayuda="Déjalo vacío si no vence (el RUC, por ejemplo). Te avisamos 30 días antes.">
          {(id) => <input id={id} type="date" className={CAMPO} value={f.vence} onChange={(e) => poner("vence", e.target.value)} />}
        </Campo>
        <Campo rotulo="Papel" ayuda="Sube una foto (JPG, PNG o WebP de hasta 5 MB) o pega el enlace del PDF en tu Drive." className="sm:col-span-2">
          {(id) => (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  id={id}
                  type="url"
                  className={`${CAMPO} pr-11 pl-9`}
                  value={f.archivoUrl}
                  maxLength={600}
                  placeholder="https://…"
                  onChange={(e) => poner("archivoUrl", e.target.value.trim())}
                />
                {f.archivoUrl ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                    aria-label="Quitar el papel"
                    title="Quitar"
                    onClick={() => poner("archivoUrl", "")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <input
                ref={archivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => void subir(e.target.files?.[0])}
              />
              <button
                type="button"
                className={button({ variant: "secondary" })}
                disabled={subiendo}
                onClick={() => archivoRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {subiendo ? "Subiendo…" : "Subir foto"}
              </button>
            </div>
          )}
        </Campo>
        <Campo rotulo="Nota" className="sm:col-span-2">
          {(id) => (
            <textarea id={id} className={CAMPO_AREA} rows={3} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />
          )}
        </Campo>
      </form>
    </AdminModal>
  );
}
