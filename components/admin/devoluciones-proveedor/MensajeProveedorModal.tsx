"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle, MessageSquare } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useMembrete } from "@/hooks/use-membrete";
import { cierreDelNegocio, type FirmaNegocio } from "@/lib/admin/membrete";
import { diaYFecha } from "@/lib/compras/devoluciones-proveedor";
import { waLink } from "@/lib/whatsapp-link";
import { cn } from "@/lib/utils";
import { etiquetaValor, type Devolucion, type Proveedor } from "./tipos";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40";

/** El texto que se le manda al proveedor; sin ids técnicos (el WhatsApp automático mandaba el id). */
export function textoParaProveedor(dev: Devolucion, contacto: string | null | undefined, firma: FirmaNegocio | null): string {
  const valor = etiquetaValor(dev.items);
  const cuerpo = [
    `Hola ${contacto?.trim() || dev.proveedorNombre}${firma?.nombre ? `, te escribimos de ${firma.nombre}` : ""}.`,
    `Te devolvemos lo siguiente por «${dev.motivo}» (registrado el ${diaYFecha(dev.createdAt)}):`,
    ...dev.items.map((i) => `- ${i.cantidad} ${i.unidad} ${i.nombre}`),
    valor.pendiente ? "" : `Valor al costo de compra: ${valor.texto}${valor.sinPrecio > 0 ? " (falta valorar parte)" : ""}.`,
    "¿Nos confirmas si nos mandas la nota de crédito o la reposición?",
  ].filter(Boolean);
  return [...cuerpo, "", ...cierreDelNegocio(firma, "Gracias.")].join("\n");
}

/**
 * C53 (17-10): el mensaje al proveedor se prepara, se revisa y lo manda la
 * persona. Antes, marcar «enviada» mandaba un WhatsApp solo, sin ver el texto
 * ni a quién iba.
 */
export function MensajeProveedorModal({ dev, proveedor, onCerrar }: { dev: Devolucion; proveedor: Proveedor | undefined; onCerrar: () => void }) {
  const membrete = useMembrete();
  const [telefono, setTelefono] = useState(proveedor?.phone ?? "");
  const [correo, setCorreo] = useState(proveedor?.email ?? "");
  const [editado, setEditado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const texto = editado ?? textoParaProveedor(dev, proveedor?.personaContacto, membrete);
  const wa = waLink(telefono, texto);
  const asunto = `Devolución${membrete?.nombre ? ` de ${membrete.nombre}` : ""}: ${dev.motivo}`;
  const mail = correo.includes("@") ? `mailto:${encodeURIComponent(correo.trim())}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch (err) {
      console.warn("[MensajeProveedorModal] no se pudo copiar:", String(err));
    }
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Mensaje para el proveedor"
      icon={MessageSquare}
      size="md"
      claveVentana="devoluciones-proveedor-mensaje"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cerrar</button>
          <button type="button" onClick={() => void copiar()} className={button({ variant: "secondary", className: "gap-1.5" })}>
            <Copy className="h-4 w-4" aria-hidden />{copiado ? "Copiado" : "Copiar"}
          </button>
          {mail && (
            <a href={mail} className={button({ variant: "secondary", className: "gap-1.5" })}>
              <Mail className="h-4 w-4" aria-hidden />Correo
            </a>
          )}
          <a
            href={wa ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!wa}
            onClick={(e) => { if (!wa) e.preventDefault(); }}
            className={button({ variant: "primary", className: cn("gap-1.5", !wa && "pointer-events-none opacity-50") })}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
          </a>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          No se envía nada desde aquí: se abre tu WhatsApp o tu correo con este texto y tú lo mandas. Revisa a quién va.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`WhatsApp de ${proveedor?.personaContacto?.trim() || dev.proveedorNombre}`} hint={telefono && !wa ? "Ese número no parece un celular de Perú." : !telefono ? "El proveedor no tiene celular guardado: escríbelo." : undefined}>
            {(id) => <input id={id} inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="9XX XXX XXX" className={CAMPO} />}
          </Field>
          <Field label="Correo" hint={!correo ? "Sin correo guardado." : undefined}>
            {(id) => <input id={id} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="ventas@proveedor.pe" className={CAMPO} />}
          </Field>
        </div>
        <Field label="Texto">
          {(id) => (
            <textarea
              id={id}
              value={texto}
              onChange={(e) => { setEditado(e.target.value); setCopiado(false); }}
              rows={9}
              className="w-full resize-y rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </Field>
      </div>
    </AdminModal>
  );
}
