"use client";

/**
 * PoliticaModal — alta y edición de una política (ADR-497): título,
 * categoría, el texto, desde cuándo rige y cuándo revisarla (con atajos de
 * 6 meses y 1 año). Se monta con `key`: cada apertura parte de `inicial`.
 */
import { useId, useState } from "react";
import { ScrollText } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { CATEGORIAS_POLITICA } from "@/lib/planificacion/secciones";
import { cn, limaDateKey } from "@/lib/utils";
import { AREA_TEXTO, CAMPO_ALTO, claseChip } from "../piezas/clases";
import { sumarMeses } from "../piezas/fechas";
import { HUECO, tieneHuecos, type CategoriaPolitica, type Politica } from "./politicas-config";

const ATAJOS = [
  { meses: 6, rotulo: "En 6 meses" },
  { meses: 12, rotulo: "En 1 año" },
] as const;

interface Props {
  abierto: boolean;
  inicial: Politica;
  esNueva: boolean;
  onCerrar: () => void;
  onGuardar: (p: Politica) => void;
}

export function PoliticaModal({ abierto, inicial, esNueva, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [f, setF] = useState<Politica>(inicial);
  const [error, setError] = useState<string | null>(null);
  const hoy = limaDateKey();
  const base = f.vigenteDesde || hoy;
  const poner = <K extends keyof Politica>(k: K, v: Politica[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  const guardar = () => {
    const titulo = f.titulo.trim();
    if (!titulo) return setError("Escribe el título de la política.");
    if (f.vigenteDesde && f.revisar && f.revisar < f.vigenteDesde) return setError("La fecha de revisión es anterior a la de inicio.");
    onGuardar({ ...f, titulo, texto: f.texto.trim() });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNueva ? "Nueva política" : "Editar política"}
      icon={ScrollText}
      size="lg"
      footer={
        <ModalFooter error={error} aviso={tieneHuecos(f.texto) ? `Completa lo que dice ${HUECO} antes de compartirla.` : undefined}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })}>
            {esNueva ? "Agregar" : "Guardar cambios"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={cn(MODAL_BODY, "space-y-5")}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Título" required>
            <input type="text" className={CAMPO_ALTO} value={f.titulo} maxLength={160} placeholder="Cambios y devoluciones" onChange={(e) => poner("titulo", e.target.value)} />
          </Field>
          <Field label="Categoría">
            <select className={CAMPO_ALTO} value={f.categoria} onChange={(e) => poner("categoria", e.target.value as CategoriaPolitica)}>
              {CATEGORIAS_POLITICA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Qué dice" hint="Escríbela como se la dirías al cliente o al equipo.">
          <textarea
            className={AREA_TEXTO}
            rows={7}
            value={f.texto}
            maxLength={4000}
            placeholder="Aceptamos cambios dentro de los 7 días con la boleta y el producto sin abrir."
            onChange={(e) => poner("texto", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rige desde">
            <input type="date" className={CAMPO_ALTO} value={f.vigenteDesde} onChange={(e) => poner("vigenteDesde", e.target.value)} />
          </Field>
          <Field label="Revisarla el" hint="Te la marcamos cuando llegue la fecha.">
            <input type="date" className={CAMPO_ALTO} value={f.revisar} min={f.vigenteDesde || undefined} onChange={(e) => poner("revisar", e.target.value)} />
          </Field>
        </div>
        <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="Atajos para la revisión">
          {ATAJOS.map((a) => {
            const fecha = sumarMeses(base, a.meses);
            return (
              <button key={a.meses} type="button" className={claseChip(f.revisar === fecha)} onClick={() => poner("revisar", fecha)}>
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </form>
    </AdminModal>
  );
}
