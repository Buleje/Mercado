"use client";

import { useState } from "react";
import { MessageCircle, Send } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cierreDelNegocio, conNombreDelNegocio, type FirmaNegocio } from "@/lib/admin/membrete";
import type { ModeloRecibo } from "@/lib/recibo/modelo-recibo";

/** El recibo en texto para WhatsApp: los mismos montos guardados que la hoja impresa. */
export function textoWhatsApp(m: ModeloRecibo, firma: FirmaNegocio | null): string {
  const lineas = [
    `🧾 *${conNombreDelNegocio(m.nombreCorto, firma)}*`,
    ...(m.tipo !== "ticket" && m.numero !== "por asignar" ? [`📋 N° ${m.numero}`] : []),
    `📅 ${m.fecha} ${m.hora}`,
    `─────────`,
    m.lineas.map((l) => `  ${l.nombre} x${l.cantidad} — ${formatCurrency(l.importe)}`).join("\n"),
    `─────────`,
    `💰 *Total: ${formatCurrency(m.totales.total)}*`,
  ];
  if (m.totales.descuento) lineas.push(`🏷 Descuento: -${formatCurrency(m.totales.descuento)}`);
  if (m.tipo !== "cotizacion" && m.tipo !== "proforma") lineas.push(`💳 Pagado con: ${m.pago.metodo}`);
  if (m.validoHasta) lineas.push(`⏳ Válida hasta el ${m.validoHasta}`);
  lineas.push(`─────────`, ...cierreDelNegocio(firma, `¡Gracias por tu compra! 😊`));
  return lineas.join("\n");
}

function enlace(telefono: string, texto: string): string {
  const limpio = telefono.replace(/\D/g, "");
  const completo = limpio.startsWith("51") ? limpio : "51" + limpio;
  return `https://wa.me/${completo}?text=${encodeURIComponent(texto)}`;
}

const VERDE = "rounded-xl bg-[var(--accent-dark)] hover:brightness-110 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2";

/** «Enviar por WhatsApp»: al cliente de la venta o a un número que se escribe. */
export default function POSVentaWhatsApp({ modelo, firma, telefono, nombre }: {
  modelo: ModeloRecibo;
  firma: FirmaNegocio | null;
  telefono?: string;
  nombre?: string;
}) {
  const [manual, setManual] = useState("");
  const texto = textoWhatsApp(modelo, firma);
  return (
    <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4">
      <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">Enviar por WhatsApp</p>
      {telefono ? (
        <a href={enlace(telefono, texto)} target="_blank" rel="noopener noreferrer" className={`w-full py-3 ${VERDE}`}>
          <MessageCircle className="h-5 w-5" />
          <span className="truncate">Enviar a {nombre || telefono}</span>
        </a>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm font-semibold">+51</span>
            <input
              type="tel"
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="Número del cliente"
              aria-label="Número de WhatsApp del cliente"
              className="w-full pl-12 pr-3 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          {manual.length >= 9 ? (
            <a href={enlace(manual, texto)} target="_blank" rel="noopener noreferrer" className={`px-5 py-3 shrink-0 ${VERDE}`}>
              <Send className="h-4 w-4" />
              Enviar
            </a>
          ) : (
            <button
              disabled
              className="px-5 py-3 rounded-xl bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] font-semibold text-base cursor-not-allowed flex items-center gap-2 shrink-0"
            >
              <Send className="h-4 w-4" />
              Enviar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
