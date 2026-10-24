"use client";

/**
 * Las reglas de «Trae a una amiga» (ADR-510): qué recibe cada una, cuándo, desde
 * qué compra y si se suma a otras promociones. Sólo el borrador; guarda el modal.
 */
import { useEffect, useState } from "react";
import { Interruptor } from "@/components/ui-system/Interruptor";
import {
  ConfigReferidasSchema,
  configReferidasPorDefecto,
  resumenDelPrograma,
  type ConfigReferidas,
  type CuandoRecibeLaAmiga,
  type TipoPremio,
} from "@/lib/referidas/reglas";

const BASE = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const CAMPO = `${BASE} w-full`;
const ETIQUETA = "text-sm font-semibold text-[var(--text-primary)]";

interface Borrador {
  activo: boolean;
  quienTipo: TipoPremio;
  quienValor: string;
  amigaTipo: TipoPremio;
  amigaValor: string;
  amigaRecibe: CuandoRecibeLaAmiga;
  compraMinima: string;
  acumulable: boolean;
  vigenciaDias: string;
}

const aBorrador = (c: ConfigReferidas): Borrador => ({
  activo: c.activo,
  quienTipo: c.premioQuienRefiere.tipo,
  quienValor: String(c.premioQuienRefiere.valor),
  amigaTipo: c.premioAmiga.tipo,
  amigaValor: String(c.premioAmiga.valor),
  amigaRecibe: c.amigaRecibe,
  compraMinima: c.compraMinima ? String(c.compraMinima) : "",
  acumulable: c.acumulable,
  vigenciaDias: String(c.vigenciaDias),
});

const aConfig = (b: Borrador): ConfigReferidas => ({
  activo: b.activo,
  premioQuienRefiere: { tipo: b.quienTipo, valor: Number(b.quienValor) || 0 },
  premioAmiga: { tipo: b.amigaTipo, valor: Number(b.amigaValor) || 0 },
  amigaRecibe: b.amigaRecibe,
  compraMinima: Number(b.compraMinima) || 0,
  acumulable: b.acumulable,
  vigenciaDias: Number(b.vigenciaDias),
});

/** El borrador vuelve a lo guardado cada vez que se abre la ventana. */
export function useBorradorReferidas(guardada: ConfigReferidas | null, open: boolean) {
  const [b, setB] = useState<Borrador>(() => aBorrador(guardada ?? configReferidasPorDefecto()));
  useEffect(() => {
    if (open) setB(aBorrador(guardada ?? configReferidasPorDefecto()));
  }, [open, guardada]);
  const config = aConfig(b);
  const check = ConfigReferidasSchema.safeParse(config);
  return {
    b,
    cambiar: (c: Partial<Borrador>) => setB((x) => ({ ...x, ...c })),
    config,
    error: check.success ? null : (check.error.issues[0]?.message ?? "Revisa los datos"),
  };
}
export type BorradorReferidas = ReturnType<typeof useBorradorReferidas>;

function CampoPremio({ titulo, tipo, valor, onTipo, onValor }: { titulo: string; tipo: TipoPremio; valor: string; onTipo: (t: TipoPremio) => void; onValor: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <span className={ETIQUETA}>{titulo}</span>
      <div className="flex gap-2">
        <select aria-label={`${titulo}: tipo`} value={tipo} onChange={(e) => onTipo(e.target.value as TipoPremio)} className={`${BASE} w-20 shrink-0`}>
          <option value="monto">S/</option>
          <option value="porcentaje">%</option>
        </select>
        <input aria-label={`${titulo}: valor`} type="number" inputMode="decimal" min={0} step={tipo === "monto" ? "0.5" : "1"} value={valor} onChange={(e) => onValor(e.target.value)} placeholder="0 = nada" className={`${CAMPO} min-w-0`} />
      </div>
    </div>
  );
}

export function FormReferidas({ borrador }: { borrador: BorradorReferidas }) {
  const { b, cambiar, config, error } = borrador;
  return (
    <div className="space-y-4">
      <Interruptor enabled={b.activo} onChange={(activo) => cambiar({ activo })} label="Programa activo" desc="Pausado, los códigos no dan premio y no se anotan amigas nuevas." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoPremio titulo="Para quien recomienda" tipo={b.quienTipo} valor={b.quienValor} onTipo={(quienTipo) => cambiar({ quienTipo })} onValor={(quienValor) => cambiar({ quienValor })} />
        <CampoPremio titulo="Para su amiga" tipo={b.amigaTipo} valor={b.amigaValor} onTipo={(amigaTipo) => cambiar({ amigaTipo })} onValor={(amigaValor) => cambiar({ amigaValor })} />
      </div>
      <label className="block space-y-1.5">
        <span className={ETIQUETA}>La amiga recibe su premio</span>
        <select value={b.amigaRecibe} onChange={(e) => cambiar({ amigaRecibe: e.target.value as CuandoRecibeLaAmiga })} className={CAMPO}>
          <option value="al_usar_codigo">Al usar el código (descuento en su primera compra)</option>
          <option value="tras_primera_compra">Después de su primera compra (para la siguiente)</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className={ETIQUETA}>Compra mínima (S/)</span>
          <input type="number" inputMode="decimal" min={0} step="0.1" value={b.compraMinima} onChange={(e) => cambiar({ compraMinima: e.target.value })} placeholder="Cualquiera" className={CAMPO} />
        </label>
        <label className="space-y-1.5">
          <span className={ETIQUETA}>El premio vale (días)</span>
          <input type="number" inputMode="numeric" min={1} max={365} value={b.vigenciaDias} onChange={(e) => cambiar({ vigenciaDias: e.target.value })} className={CAMPO} />
        </label>
      </div>
      {/* «Se suma a otras promociones» vuelve cuando el cobro de la tienda lo aplique
          (falta `combinarConOtrosDescuentos` en app/api/orders, zona de peligro): un
          interruptor que se guarda y no hace nada promete de más (security 20-10). El
          valor guardado se conserva tal cual. */}
      <p role="status" className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        {error ? <span className="text-[var(--data-error-ink)]">{error}</span> : resumenDelPrograma(config)}
      </p>
    </div>
  );
}
