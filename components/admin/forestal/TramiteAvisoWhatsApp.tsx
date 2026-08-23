"use client";

/**
 * TramiteAvisoWhatsApp — el aviso de "vence pronto" ya se ve en el catálogo
 * (banner rojo/ámbar), pero solo si alguien entra a mirar. Este botón manda
 * el MISMO listado por WhatsApp, para que el aviso llegue sin depender de
 * abrir el panel. El mensaje se arma acá, con los mismos `porVencer` que ya
 * están en pantalla — nunca un recálculo aparte que pudiera decir otra cosa.
 *
 * El número de destino no vive en ningún lado del sistema (la Ficha CTP no
 * tiene teléfono): se pide una vez y se recuerda en este navegador
 * (localStorage) para no volver a tipearlo cada vez.
 */

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "@buleje/design-system/icons";
import type { TramiteRegistro } from "@/lib/forestal/tramites-registro";
import { csrfHeaders } from "@/lib/csrf-client";

const CLAVE_TELEFONO = "tramites-aviso-whatsapp-telefono";

function mensajeDeAviso(porVencer: (TramiteRegistro & { diasRestantes: number })[]): string {
  const lineas = porVencer.map((t) => {
    const cuando =
      t.diasRestantes < 0
        ? `venció hace ${Math.abs(t.diasRestantes)} ${Math.abs(t.diasRestantes) === 1 ? "día" : "días"}`
        : t.diasRestantes === 0
          ? "vence hoy"
          : `vence en ${t.diasRestantes} ${t.diasRestantes === 1 ? "día" : "días"}`;
    return `• ${t.formatoNombre}${t.expedienteAutoridad ? ` (${t.expedienteAutoridad})` : ""} — ${cuando}`;
  });
  return [
    `⏰ Trámites que vencen pronto (${porVencer.length}):`,
    "",
    ...lineas,
    "",
    "Revisalos en el panel → Trámites y Oficios.",
  ].join("\n");
}

export default function TramiteAvisoWhatsApp({
  porVencer,
}: {
  porVencer: (TramiteRegistro & { diasRestantes: number })[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [telefono, setTelefono] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_TELEFONO) ?? "";
    } catch {
      return "";
    }
  });
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar() {
    const limpio = telefono.trim();
    if (!limpio) {
      setAviso("Poné el número de WhatsApp que recibe el aviso.");
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      try {
        localStorage.setItem(CLAVE_TELEFONO, limpio);
      } catch { /* localStorage bloqueado: igual se manda, solo no se recuerda */ }
      const r = await fetch("/api/admin/forestal/tramites/avisar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ telefono: limpio, mensaje: mensajeDeAviso(porVencer) }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setAviso(data.message ?? "No se pudo mandar el aviso.");
        return;
      }
      setAviso("Aviso enviado.");
      setAbierto(false);
    } catch {
      setAviso("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--data-success-500)] hover:text-[var(--data-success-700)] dark:hover:text-[var(--data-success-500)]"
      >
        <MessageCircle className="h-3.5 w-3.5" /> Avisar por WhatsApp
      </button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
      <input
        type="text"
        value={telefono}
        onChange={(e) => { setTelefono(e.target.value); setAviso(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void enviar(); } }}
        placeholder="Número de WhatsApp — 9XX XXX XXX"
        className="h-9 min-w-[180px] flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-success-500)]"
      />
      <button
        type="button"
        onClick={() => void enviar()}
        disabled={enviando}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-[var(--data-success-500)]"
      >
        {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {enviando ? "Mandando…" : "Mandar"}
      </button>
      <button
        type="button"
        onClick={() => { setAbierto(false); setAviso(null); }}
        className="inline-flex h-9 shrink-0 items-center px-2 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        Cancelar
      </button>
      {aviso && <p className="w-full text-xs font-semibold text-[var(--text-secondary)]">{aviso}</p>}
    </div>
  );
}
