"use client";

/**
 * La ficha del cliente elegido en Puntos: sus cifras, avisarle por WhatsApp y
 * canjear a la vista; notas, referido y niveles plegados (antes: siete
 * tarjetas apiladas, una con un vencimiento inventado y otra con la lista de
 * TODOS los clientes, que no era de esta ficha).
 */
import { useState, type ReactNode } from "react";
import { Award, ChevronDown, Copy, MessageCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChipNivel } from "./ListaPuntos";
import { enlaceWhatsApp, mensajeDePuntos, mensajeDeReferido, solesDePuntos, VALOR_PUNTO } from "./mensajes";
import type { Puntos } from "./use-puntos";

const CAMPO = "h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";

function Plegable({ titulo, abierto: inicial = false, children }: { titulo: ReactNode; abierto?: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(inicial);
  return (
    <div className="border-t border-[var(--rule-soft)]">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className="flex min-h-12 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[var(--text-primary)]">
        {titulo}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>
      {abierto && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}

export function FichaPuntos({ p, negocio, onCopiar }: { p: Puntos; negocio: string; onCopiar: (texto: string) => void }) {
  const c = p.elegido;
  const [canje, setCanje] = useState("");
  const [notas, setNotas] = useState(c?.privateNotes ?? "");
  const [guardando, setGuardando] = useState(false);

  if (!c) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <Award className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Toca un cliente para ver sus puntos.</p>
      </div>
    );
  }

  const pts = Number(canje);
  const canjeValido = canje !== "" && pts > 0 && pts <= c.loyaltyPoints;
  const wa = c.loyaltyPoints > 0 ? enlaceWhatsApp(c.phone, mensajeDePuntos(c.name, c.loyaltyPoints, negocio)) : null;

  const canjear = async () => {
    if (await p.canjear(pts)) setCanje("");
  };
  const guardar = async () => {
    setGuardando(true);
    await p.guardarNotas(notas);
    setGuardando(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--text-primary)]">{c.name}</p>
          <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{c.phone}</p>
        </div>
        <ChipNivel nivel={c.loyaltyTier} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Puntos</dt>
          <dd className="text-lg font-extrabold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {formatNumber(c.loyaltyPoints)} <span className="text-sm font-semibold text-[var(--text-tertiary)]">≈ {solesDePuntos(c.loyaltyPoints)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-secondary)]">Gastó</dt>
          <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(c.totalSpent ?? 0)}</dd>
        </div>
      </dl>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={button({ variant: "secondary", className: "w-full gap-1.5 rounded-xl text-sm" })}>
          <MessageCircle className="h-4 w-4" aria-hidden /> Avisarle por WhatsApp
        </a>
      )}

      <div className="space-y-1.5 border-t border-[var(--rule-soft)] pt-3">
        <label htmlFor={`canje-${c.phone}`} className="text-sm font-semibold text-[var(--text-primary)]">Canjear puntos</label>
        <div className="flex gap-2">
          <input id={`canje-${c.phone}`} type="number" inputMode="numeric" min={1} max={c.loyaltyPoints} value={canje} onChange={(e) => setCanje(e.target.value)} placeholder={`Hasta ${c.loyaltyPoints}`} className={CAMPO} />
          <button type="button" onClick={canjear} disabled={!canjeValido} className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4 text-sm" })}>Canjear</button>
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          {canjeValido ? `Descuento: ${formatCurrency(pts * VALOR_PUNTO)}` : `1 punto = ${formatCurrency(VALOR_PUNTO)} de descuento`}
        </p>
      </div>

      <Plegable titulo={`Notas privadas${c.privateNotes ? " · con notas" : ""}`} abierto={!!c.privateNotes}>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} aria-label="Notas privadas" placeholder="Sólo las ve tu equipo, no el cliente." className={cn(CAMPO, "h-auto w-full resize-none py-2")} />
        <button type="button" onClick={guardar} disabled={guardando || notas === (c.privateNotes ?? "")} className={button({ variant: "secondary", className: "rounded-xl text-sm" })}>
          {guardando ? "Guardando…" : "Guardar notas"}
        </button>
      </Plegable>

      <Plegable titulo={c.referralCode ? `Código de referido · ${c.referralCode}` : "Código de referido"}>
        {c.referralCode ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onCopiar(c.referralCode ?? "")} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl text-sm" })}>
              <Copy className="h-4 w-4" aria-hidden /> Copiar código
            </button>
            <button type="button" onClick={() => onCopiar(mensajeDeReferido(c.referralCode ?? "", negocio))} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl text-sm" })}>
              <Copy className="h-4 w-4" aria-hidden /> Copiar invitación
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => { void p.generarReferido(); }} className={button({ variant: "secondary", className: "rounded-xl text-sm" })}>Generar código</button>
        )}
      </Plegable>

      {p.niveles.length > 0 && (
        <Plegable titulo="Niveles">
          <ul className="space-y-1">
            {p.niveles.map((t) => (
              <li key={t.name} className={cn("flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm", c.loyaltyTier === t.name ? "bg-primary/10 font-semibold" : "bg-[var(--surface-sunken)]")}>
                <span className="capitalize text-[var(--text-primary)]">{t.name}</span>
                <span className="tabular-nums text-[var(--text-secondary)]">desde {formatCurrency(t.minSpent)} gastado{t.pointsMultiplier ? ` · ${t.pointsMultiplier}× puntos` : ""}</span>
              </li>
            ))}
          </ul>
        </Plegable>
      )}
    </div>
  );
}
