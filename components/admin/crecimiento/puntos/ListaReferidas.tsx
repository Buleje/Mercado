"use client";

/**
 * Quién trajo a quién (ADR-510): anotar «a esta clienta la trajo Rosa» y ver
 * los premios de cada vínculo. El manual de Musa: «se anota en la hoja de
 * clientas quién trajo a quién». Los cupones los emite el servidor.
 */
import { useState } from "react";
import { Copy, Trash2, UserPlus } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CuponEntregado, FilaReferida } from "@/lib/referidas/reglas";
import type { Referidas } from "./use-referidas";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";

const valorDe = (c: CuponEntregado) => (c.discountType === "percent" ? `${c.discountValue} %` : formatCurrency(c.discountValue));

function Cupon({ c, para, onCopiar }: { c: CuponEntregado; para: string; onCopiar: (t: string) => void }) {
  const estado = c.usado ? "usado" : !c.activo ? "anulado" : `vale hasta ${formatDateShort(c.expiresAt)}`;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 grow truncate text-[var(--text-secondary)]">
        {para}: <strong className="text-[var(--text-primary)]">{valorDe(c)}</strong> · <span className="font-mono">{c.code}</span> · {estado}
      </span>
      {!c.usado && c.activo && (
        <button type="button" onClick={() => onCopiar(c.code)} title="Copiar el código del cupón" aria-label={`Copiar cupón ${c.code}`} className={button({ variant: "ghost", className: "h-12 w-12 shrink-0 rounded-xl p-0" })}>
          <Copy className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

function Fila({ f, onCopiar, onQuitar }: { f: FilaReferida; onCopiar: (t: string) => void; onQuitar: (celular: string) => void }) {
  const amiga = f.amiga.nombre || `…${f.amiga.celular.slice(-3)}`;
  const quien = f.quienRefiere.nombre || `…${f.quienRefiere.celular.slice(-3)}`;
  const algunoUsado = f.cupones.some((c) => c.usado);
  /* Dos pasos: quitar anula los cupones que aún no se usaron. */
  const [seguro, setSeguro] = useState(false);
  return (
    <li className="space-y-1 border-b border-[var(--rule-soft)] py-3 last:border-0">
      <div className="flex items-center gap-2">
        <p className="min-w-0 grow text-sm text-[var(--text-primary)]">
          <strong>{amiga}</strong> <span className="text-[var(--text-secondary)]">la trajo</span> <strong>{quien}</strong>
          <span className="text-[var(--text-tertiary)]"> · {formatDateShort(f.desde)} · </span>
          <span className={cn(f.compro ? "text-[var(--data-success-ink)]" : "text-[var(--text-tertiary)]")}>{f.compro ? "ya compró" : "aún no compra"}</span>
        </p>
        {!algunoUsado &&
          (seguro ? (
            <button type="button" onClick={() => onQuitar(f.amiga.celular)} onBlur={() => setSeguro(false)} autoFocus className={button({ variant: "secondary", className: "shrink-0 rounded-xl px-3 text-sm text-[var(--data-error-ink)]" })}>
              Sí, quitar
            </button>
          ) : (
            <button type="button" onClick={() => setSeguro(true)} title="Quitar: se anotó por error (anula sus cupones sin usar)" aria-label={`Quitar la recomendación de ${amiga}`} className={button({ variant: "ghost", className: "h-12 w-12 shrink-0 rounded-xl p-0 text-[var(--data-error-ink)]" })}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          ))}
      </div>
      {f.cupones.length > 0 && (
        <ul className="space-y-0.5 pl-1">
          {f.cupones.map((c) => (
            <Cupon key={c.code} c={c} para={c.rol === "amiga" ? amiga : quien} onCopiar={onCopiar} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ListaReferidas({ r, onCopiar }: { r: Referidas; onCopiar: (t: string) => void }) {
  const [amiga, setAmiga] = useState("");
  const [de, setDe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const filas = r.resumen?.filas ?? [];
  const valido = amiga.replace(/\D/g, "").length >= 6 && de.trim().length >= 3;

  const anotar = async () => {
    if (!valido) return;
    setEnviando(true);
    const res = await r.anotar(amiga, de);
    setEnviando(false);
    if (res.error) setAviso({ ok: false, texto: res.error });
    else {
      setAviso({ ok: true, texto: res.mensaje ?? "Anotado" });
      setAmiga("");
      setDe("");
    }
  };

  const quitar = async (celular: string) => {
    const e = await r.quitar(celular);
    setAviso(e ? { ok: false, texto: e } : { ok: true, texto: "Quitado" });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label="Celular de la amiga" inputMode="tel" value={amiga} onChange={(e) => setAmiga(e.target.value)} placeholder="Celular de la amiga" className={CAMPO} />
        <input aria-label="Quién la recomendó: celular o código" value={de} onChange={(e) => setDe(e.target.value)} placeholder="La trajo: celular o código" className={CAMPO} />
        <button type="button" onClick={() => void anotar()} disabled={!valido || enviando} className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-4 text-sm" })}>
          <UserPlus className="h-4 w-4" aria-hidden /> {enviando ? "Anotando…" : "Anotar"}
        </button>
      </div>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={cn("text-sm", aviso.ok ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
          {aviso.texto}
        </p>
      )}
      {r.resumen && (
        <p className="text-sm text-[var(--text-secondary)]">
          {r.resumen.totales.vinculos} recomendadas · {r.resumen.totales.compraron} ya compraron · {r.resumen.totales.cuponesEntregados} premios entregados ({r.resumen.totales.cuponesUsados} usados)
        </p>
      )}
      {r.cargando && !r.resumen ? (
        <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--text-secondary)]">Aún no anotas a ninguna amiga recomendada.</p>
      ) : (
        <ul className="max-h-[22rem] overflow-y-auto">
          {filas.map((f) => (
            <Fila key={f.amiga.celular} f={f} onCopiar={onCopiar} onQuitar={(c) => void quitar(c)} />
          ))}
        </ul>
      )}
    </div>
  );
}
