"use client";

/**
 * Verificación de la GTF de salida contra SERFOR (ADR-312).
 *
 * La guía de salida la emite ESTE centro, así que SERFOR no la carga: la
 * verifica. Lo que importa no es llenar campos sino que el documento exista y
 * esté vigente — un despacho amparado por una guía anulada es exactamente lo
 * que una fiscalización busca. El sello (N° de constancia + cuándo se verificó)
 * viaja con la línea: una guía activa hoy puede estar anulada mañana.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldCheck } from "@buleje/design-system/icons";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { I } from "./ctp-shared";

export interface SelloSerfor {
  numeroRegistro: string;
  verificadoEn: string;
}

export default function CtpVerificarGtfSerfor({
  gtfNumber,
  onGuiaVerificada,
  onSello,
}: {
  /** El número tipeado en el formulario, para cotejarlo con el de la guía. */
  gtfNumber: string;
  /** La guía tal como la devuelve SERFOR: el consumidor decide qué copiar. */
  onGuiaVerificada: (g: GtfSerfor) => void;
  onSello: (s: SelloSerfor | null) => void;
}) {
  const [nro, setNro] = useState("");
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function verificar() {
    const n = nro.trim();
    if (!n) { setMsg({ ok: false, text: "Escribí el N° de registro de la guía que emitiste." }); return; }
    setCargando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf/serfor?numeroRegistro=${encodeURIComponent(n)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: j?.message ?? `El servidor respondió ${r.status}` }); onSello(null); return; }
      if (j.estado !== "encontrada" || !j.gtf) {
        setMsg({ ok: false, text: j.mensaje ?? "SERFOR no encontró esa guía." });
        onSello(null);
        return;
      }
      const g = j.gtf as GtfSerfor;
      onGuiaVerificada(g);
      onSello({ numeroRegistro: g.numeroRegistro || n, verificadoEn: new Date().toISOString() });
      const activa = (g.estado ?? "").toUpperCase().startsWith("ACTIVA");
      const distinta = Boolean(g.gtfNumber && gtfNumber.trim() && g.gtfNumber !== gtfNumber.trim());
      setMsg({
        ok: activa && !distinta,
        text: [
          `Guía ${g.gtfNumber ?? n} · ${g.destinatario ?? "sin destinatario"} · ${g.estado ?? "sin estado"}`,
          distinta ? `— el N° de GTF del formulario (${gtfNumber.trim()}) no es el de esta guía` : "",
        ].filter(Boolean).join(" "),
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      onSello(null);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
      <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Verificar la guía en SERFOR (opcional)
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={nro}
          onChange={(e) => { setNro(e.target.value); setMsg(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verificar(); } }}
          placeholder="N° de constancia SNIFFS · 2-25-0002326"
          aria-label="N° de registro SERFOR de la guía emitida"
          className={`${I} w-full flex-1 font-mono sm:w-auto`}
        />
        <button
          type="button"
          onClick={() => void verificar()}
          disabled={cargando || !nro.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-3.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Verificar
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
            msg.ok
              ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
              : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          {msg.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}
