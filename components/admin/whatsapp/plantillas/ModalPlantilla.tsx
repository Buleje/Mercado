"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { QuickReply } from "@/components/admin/whatsapp/inbox/quick-replies";
import { BurbujaWhatsApp } from "./BurbujaWhatsApp";

export type ModoPlantilla =
  | { tipo: "ver"; plantilla: QuickReply }
  | { tipo: "editar"; plantilla: QuickReply }
  | { tipo: "nueva"; base?: QuickReply };

interface Props {
  modo: ModoPlantilla | null;
  copiado: boolean;
  onCerrar: () => void;
  onCopiar: (p: QuickReply) => void;
  /** `id` presente = editar esa; ausente = crear una nueva. */
  onGuardar: (nombre: string, texto: string, id?: string) => void;
  onCambiarModo: (m: ModoPlantilla) => void;
}

/** Las que más se usan al escribirle a un cliente; cualquier `{palabra}` sirve igual. */
const VARIABLES = ["nombre", "monto", "pedido", "producto"] as const;

const CAMPO = "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Ver una plantilla (globo de WhatsApp + Copiar) o crearla/editarla con su vista previa al lado. */
export function ModalPlantilla({ modo: pedido, copiado, onCerrar, onCopiar, onGuardar, onCambiarModo }: Props) {
  const idForm = useId();
  /* Al cerrar se sigue dibujando el último (con `open` en falso): desmontar la
     ventana se salta el `onCloseAutoFocus` de Radix y el foco caería a <body>. */
  const ultimo = useRef<ModoPlantilla | null>(null);
  if (pedido) ultimo.current = pedido;
  const modo = pedido ?? ultimo.current;
  const abierto = !!pedido;
  if (!modo) return null;

  if (modo.tipo === "ver") {
    const p = modo.plantilla;
    return (
      <AdminModal
        open={abierto}
        onClose={onCerrar}
        title={p.nombre}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => onCambiarModo(p.custom ? { tipo: "editar", plantilla: p } : { tipo: "nueva", base: p })} className={button({ variant: "secondary", className: "rounded-xl" })}>
              {p.custom ? <Pencil className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {p.custom ? "Editar" : "Usar como base"}
            </button>
            <button type="button" onClick={() => onCopiar(p)} className={button({ variant: "primary", className: "rounded-xl" })}>
              {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copiado ? "Copiado" : "Copiar mensaje"}
            </button>
          </div>
        }
      >
        <div className={cn(MODAL_BODY, "space-y-2")}>
          <BurbujaWhatsApp texto={p.texto} />
          {p.variables.length > 0 && (
            <p className="text-sm text-[var(--text-secondary)]">Cambia {p.variables.map((v) => `{${v}}`).join(", ")} antes de mandarlo.</p>
          )}
        </div>
      </AdminModal>
    );
  }

  const editando = modo.tipo === "editar" ? modo.plantilla : null;
  const base = modo.tipo === "editar" ? modo.plantilla : modo.base;
  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      variant="wide"
      title={editando ? "Editar plantilla" : "Nueva plantilla"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary", className: "rounded-xl" })}>Cancelar</button>
          <button type="submit" form={idForm} className={button({ variant: "primary", className: "rounded-xl" })}>
            {editando ? "Guardar cambios" : "Crear plantilla"}
          </button>
        </div>
      }
    >
      <FormPlantilla
        key={editando?.id ?? base?.id ?? "nueva"}
        idForm={idForm}
        nombreInicial={editando ? editando.nombre : base ? `${base.nombre} (mía)` : ""}
        textoInicial={base?.texto ?? ""}
        onGuardar={(n, t) => onGuardar(n, t, editando?.id)}
      />
    </AdminModal>
  );
}

function FormPlantilla({ idForm, nombreInicial, textoInicial, onGuardar }: { idForm: string; nombreInicial: string; textoInicial: string; onGuardar: (nombre: string, texto: string) => void }) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [texto, setTexto] = useState(textoInicial);
  const [intento, setIntento] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const insertar = (v: string) => {
    const el = area.current;
    const marca = `{${v}}`;
    const ini = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + marca + texto.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  };

  const falta = !nombre.trim() || !texto.trim();
  return (
    <form
      id={idForm}
      onSubmit={(e) => {
        e.preventDefault();
        setIntento(true);
        if (!falta) onGuardar(nombre.trim(), texto.trim());
      }}
      className={cn(MODAL_BODY, "grid gap-4 sm:grid-cols-2")}
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Recordatorio de pago" className={cn(CAMPO, "h-12")} autoFocus />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Mensaje</span>
          <textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder="Hola {nombre}, …" className={cn(CAMPO, "resize-y py-2 leading-relaxed")} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Insertar una variable">
          <span className="text-sm text-[var(--text-secondary)]">Insertar:</span>
          {VARIABLES.map((v) => (
            <button key={v} type="button" onClick={() => insertar(v)} className="h-12 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
              {`{${v}}`}
            </button>
          ))}
        </div>
        {intento && falta && <p className="text-sm text-[var(--data-error-ink)]">Ponle un nombre y escribe el mensaje.</p>}
      </div>
      <div className="space-y-1">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Así se ve en WhatsApp</span>
        <BurbujaWhatsApp texto={texto} className="min-h-40" />
      </div>
    </form>
  );
}
