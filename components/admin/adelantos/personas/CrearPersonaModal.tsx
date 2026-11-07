"use client";

/**
 * Alta y edición de una persona (ADR-489: campos, botones y tarjetas del panel).
 *
 * De arriba abajo, por pregunta: el DNI o RUC grande (con la tarjeta de lo que
 * contestó RENIEC o SUNAT, que llena el resto), «Quién es» siempre abierto, y
 * lo opcional en tarjetas plegables y recordadas: Contacto y referencia,
 * Ubicación, Cobro y banco, Notas. El alta rápida es DNI + celular + Crear.
 *
 * Los avisos —documento imposible, persona repetida, RUC no habido, CCI de otro
 * banco— avisan y no bloquean: en el mostrador puede haber un caso raro, y
 * frenar la carga es peor que un dato imperfecto. Sólo frena lo que el servidor
 * rechazaría (un Yape o una fecha que no pueden ser).
 *
 * Las piezas viven en `crear-persona/`; el estado, en `use-persona-form`.
 */
import { useEffect, useRef } from "react";
import { HandCoins, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { ModalShell } from "../shared";
import BuscadorDocumento from "./crear-persona/BuscadorDocumento";
import SeccionQuienEs from "./crear-persona/SeccionQuienEs";
import SeccionContacto from "./crear-persona/SeccionContacto";
import SeccionUbicacion from "./crear-persona/SeccionUbicacion";
import SeccionCobro, { SeccionNotas } from "./crear-persona/SeccionCobro";
import { usePersonaForm } from "./crear-persona/use-persona-form";
import type { PersonaEditable } from "./crear-persona/datos";

const FORM_ID = "alta-persona-adelantos";

export default function CrearPersonaModal({
  persona,
  personasExistentes,
  onClose,
  onCreated,
}: {
  persona?: PersonaEditable;
  /** Para avisar si ya está cargada (y abrirla en vez de repetirla). */
  personasExistentes: readonly PersonaEditable[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const f = usePersonaForm({ persona, personasExistentes, onCreated });

  /* Al dar de alta, el foco va al DNI/RUC — sin `autoFocus` (jsx-a11y/no-autofocus).
     En un rAF: useModalAccesible (en ModalShell) enfoca la X en el suyo,
     que se programa antes (mismo arreglo que ActivosModule). */
  const documentoRef = useRef<HTMLInputElement>(null);
  const alAbrirEditando = !!persona;
  useEffect(() => {
    if (alAbrirEditando) return;
    const id = requestAnimationFrame(() => documentoRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [alAbrirEditando]);

  const footer = (
    <ModalFooter error={f.err}>
      <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
        Cancelar
      </button>
      {!f.editando && (
        <button
          type="button"
          onClick={() => void f.guardar(true)}
          disabled={f.saving}
          className={button({ variant: "secondary" })}
        >
          <HandCoins className="h-4 w-4" aria-hidden /> Crear y dar adelanto
        </button>
      )}
      <button type="submit" form={FORM_ID} disabled={f.saving} className={button({ variant: "primary" })}>
        {f.saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {f.saving ? "Guardando…" : f.editando ? "Guardar cambios" : "Crear persona"}
      </button>
    </ModalFooter>
  );

  return (
    <ModalShell
      title={f.editando ? "Editar persona" : "Nueva persona"}
      subtitle={f.editando && f.actual ? f.actual.nombre : undefined}
      onClose={onClose}
      size="md"
      cuerpo="hundido"
      footer={footer}
    >
      {/* Un `<form>`: Enter en cualquier campo crea (menos en el DNI, que consulta). */}
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void f.guardar(false);
        }}
        className="space-y-4"
      >
        <BuscadorDocumento
          ref={documentoRef}
          documento={f.d.documento}
          onDocumento={(v) => f.set("documento", v)}
          estado={f.lookup.estado}
          onReintentar={f.lookup.reintentar}
          nombreEscrito={f.d.nombre}
          onUsarNombre={(n) => f.set("nombre", n)}
          duplicado={f.duplicado}
          onAbrirExistente={f.abrirExistente}
        />
        <SeccionQuienEs f={f} />
        <SeccionContacto d={f.d} set={f.set} />
        <SeccionUbicacion d={f.d} set={f.set} />
        <SeccionCobro d={f.d} set={f.set} />
        <SeccionNotas d={f.d} set={f.set} />
      </form>
    </ModalShell>
  );
}
