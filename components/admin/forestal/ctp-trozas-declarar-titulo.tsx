"use client";

/**
 * «Declarar título» de UNA guía, dentro del modal «Sin título declarado»
 * (Brandon 05-10). Se elige el permiso de la lista (da código y resolución y
 * deja el ingreso vinculado al permiso) o se escribe el código tal como está
 * en el papel.
 *
 * Escribe por `PATCH /wood-entries/titulo`: sólo los casilleros vacíos de los
 * ingresos de esa guía, con el mes abierto. Lo que NO se pudo se dice ingreso
 * por ingreso (otro título ya declarado, mes cerrado…), no con un «error».
 */

import { useState } from "react";
import { Check, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { Contrato } from "@/lib/forestal/contratos";
import { Btn } from "./ctp-shared";

interface Respuesta {
  originCode: string;
  actualizados: { id: string; especie: string | null }[];
  omitidos: { id: string; especie: string | null; motivo: string }[];
}

const CAMPO =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpTrozasDeclararTitulo({
  gtf, contratos, onDeclarado, onCancelar,
}: {
  gtf: string;
  /** Los permisos del negocio (`GET /contratos`); vacío = sólo se escribe. */
  contratos: readonly Contrato[];
  /** Se declaró en al menos un ingreso: el aviso que el modal deja arriba (la
   *  guía desaparece de la lista al releer el patio, y con ella este bloque). */
  onDeclarado: (aviso: string) => void;
  onCancelar: () => void;
}) {
  const [contratoId, setContratoId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [resolucion, setResolucion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Respuesta | null>(null);
  const elegido = contratos.find((c) => c.id === contratoId) ?? null;
  const listo = Boolean(contratoId) || codigo.trim().length > 0;

  const declarar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/wood-entries/titulo", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          gtfNumber: gtf,
          contratoId: contratoId || null,
          originCode: contratoId ? null : codigo.trim(),
          originSourceNumber: resolucion.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<Respuesta> & { message?: string; error?: string };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      setHecho({ originCode: j.originCode ?? "", actualizados: j.actualizados ?? [], omitidos: j.omitidos ?? [] });
      invalidarCtp("trozas");
      invalidarCtp("wood-entries");
      const n = (j.actualizados ?? []).length;
      if (n > 0) onDeclarado(`Título ${j.originCode} declarado en la guía ${gtf} (${n} ${n === 1 ? "ingreso" : "ingresos"}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo declarar el título.");
    } finally {
      setEnviando(false);
    }
  };

  if (hecho) {
    return (
      <div className="space-y-1 text-sm" role="status">
        <p className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
          <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden="true" />
          {hecho.actualizados.length > 0
            ? `Título ${hecho.originCode} declarado en ${hecho.actualizados.length} ${hecho.actualizados.length === 1 ? "ingreso" : "ingresos"} de la guía ${gtf}.`
            : `No se cambió nada en la guía ${gtf}.`}
        </p>
        {hecho.omitidos.map((o) => (
          <p key={o.id} className="text-xs text-[var(--text-secondary)]">
            {o.especie ?? "Ingreso"}: {o.motivo}.
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {contratos.length > 0 && (
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-bold text-[var(--text-secondary)]">
          Permiso de tu lista
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className={CAMPO}>
            <option value="">— Escribir el código a mano —</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.titularNombre}{c.resolucionNumero ? ` · Res. ${c.resolucionNumero}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {!elegido && (
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-bold text-[var(--text-secondary)]">
          Código del título (como en el papel)
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="CONC-25-001" className={CAMPO} />
        </label>
      )}
      <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-bold text-[var(--text-secondary)]">
        N° de resolución {elegido?.resolucionNumero ? "(de la lista)" : "(opcional)"}
        <input
          value={resolucion}
          onChange={(e) => setResolucion(e.target.value)}
          placeholder={elegido?.resolucionNumero ?? "R.D. 123-2025"}
          className={CAMPO}
        />
      </label>
      <div className="flex items-center gap-2">
        <Btn size="sm" onClick={onCancelar} disabled={enviando}>Cancelar</Btn>
        <Btn size="sm" variant="primary" onClick={() => void declarar()} disabled={!listo || enviando}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Declarar en la guía
        </Btn>
      </div>
      {error && <p className="w-full text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}
