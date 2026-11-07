"use client";

/**
 * NotaDelDiaModal — una nota pegada a un día del calendario. Es una nota de
 * siempre (`/api/notes`, la misma lista de Notas) con `fecha` (ADR-501 §6):
 * sale en ese día del calendario y en el feed para Google/Outlook.
 */
import { useId, useState } from "react";
import { StickyNote, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { AREA_TEXTO, CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { cn } from "@/lib/utils";
import type { FechaKey, NotaDelDia } from "@/lib/agenda/tipos";
import { borrarNota, crearNota, editarNota } from "../agenda-api";
import { COLORES_NOTA, PALETA_NOTA, colorNota, type ColorNota } from "../comun/colores-nota";
import { fechaLarga } from "../comun/fechas";

const MAX_TITULO = 200;
const MAX_CONTENIDO = 5000;

interface Props {
  fecha: FechaKey;
  nota: NotaDelDia | null;
  onCerrar: () => void;
}

export function NotaDelDiaModal({ fecha: fechaInicial, nota, onCerrar }: Props) {
  const { refrescar } = useAgenda();
  const formId = useId();
  const [titulo, setTitulo] = useState(nota?.titulo ?? "");
  const [contenido, setContenido] = useState(nota?.contenido ?? "");
  const [color, setColor] = useState<ColorNota>(colorNota(nota?.color ?? "yellow"));
  const [fecha, setFecha] = useState<FechaKey>(nota?.fecha ?? fechaInicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const t = titulo.trim();
    if (!t) return setError("Ponle un título a la nota.");
    if (!fecha) return setError("Elige el día de la nota.");
    setGuardando(true);
    const datos = { title: t, content: contenido.trim(), color, fecha };
    const r = nota ? await editarNota(nota.id, datos) : await crearNota(datos);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    refrescar();
    onCerrar();
  };

  const borrar = async () => {
    if (!nota) return;
    setGuardando(true);
    const r = await borrarNota(nota.id);
    setGuardando(false);
    if (!r.ok && r.status !== 404) return setError(r.error);
    refrescar();
    onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={nota ? "Nota del día" : "Nueva nota del día"}
      description={fechaLarga(fecha)}
      icon={StickyNote}
      size="md"
      footer={
        <ModalFooter error={error} atajo={!error}>
          {nota && (
            <button type="button" className={button({ variant: "ghost", className: "mr-auto" })} onClick={() => void borrar()} disabled={guardando}>
              <Trash2 className="size-4" aria-hidden="true" />
              Borrar
            </button>
          )}
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar nota"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={`${MODAL_BODY} space-y-4`}
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
        <Field label="Título" required>
          <input
            type="text"
            className={CAMPO_ALTO}
            value={titulo}
            maxLength={MAX_TITULO}
            placeholder="Ej.: llamar al contador"
            onChange={(e) => {
              setTitulo(e.target.value);
              setError(null);
            }}
            autoFocus
          />
        </Field>
        <Field label="Detalle (opcional)">
          <textarea className={AREA_TEXTO} value={contenido} maxLength={MAX_CONTENIDO} onChange={(e) => setContenido(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Día">
            <input type="date" className={CAMPO_ALTO} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]" id={`${formId}-color`}>
              Color
            </span>
            <div role="radiogroup" aria-labelledby={`${formId}-color`} className="flex flex-wrap gap-1">
              {COLORES_NOTA.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={PALETA_NOTA[c].nombre}
                  title={PALETA_NOTA[c].nombre}
                  onClick={() => setColor(c)}
                  className={cn(
                    "inline-flex size-12 items-center justify-center rounded-full border-2 transition-colors",
                    color === c ? "border-[var(--text-primary)]" : "border-transparent hover:border-[var(--rule-strong)]",
                  )}
                >
                  <span className={cn("size-6 rounded-full", PALETA_NOTA[c].punto)} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>
    </AdminModal>
  );
}
