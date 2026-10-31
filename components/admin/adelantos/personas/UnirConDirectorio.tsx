"use client";

/**
 * «Su ficha del Directorio forestal» dentro de la ficha de la persona (Brandon
 * 25-10: «adelanto de madera que baja solo»). Se une UNA vez: desde ahí, al
 * recibir su guía o aplicar su cubicación el sistema pregunta «¿descontar del
 * adelanto?» y el saldo baja solo.
 *
 * Lee `GET …/beneficiarios/[id]/directorio` (unida, parecida, búsqueda por
 * nombre/RUC/DNI y su madera en pt) y escribe con el PATCH `vincular_parte` de
 * siempre: un solo camino para el vínculo (ADR-412 §5, ADR-449). Unir o soltar
 * es de admin o dueño; los demás ven a quién está unida.
 */

import { cn } from "@/lib/utils";
import { CAMPO } from "./crear-persona/clases";
import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Link2, Link2Off, Search } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fmtPt } from "@/lib/adelantos/madera-adelanto";
import { unirConFicha } from "@/lib/adelantos/unir-con-ficha";
import type { ParteCorta, UnionDirectorio } from "@/lib/adelantos/union-directorio";
import { fmtMon } from "../shared";

type Respuesta = UnionDirectorio & {
  forestal: boolean;
  madera: { teDebe: number; precioPt: number | null; codigo: string | null; fecha: string | null; pt: number | null } | null;
};

const base = (id: string) => `/api/adelantos/beneficiarios/${encodeURIComponent(id)}`;

/**
 * La lectura, con la búsqueda esperando a que dejes de escribir. `forestPartyId`
 * en las dependencias: si la ficha cambió por fuera (Cuentas por persona), se relee.
 */
function useUnionDirectorio(beneficiarioId: string, forestPartyId: string | null, q: string) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`${base(beneficiarioId)}/directorio?q=${encodeURIComponent(q.trim())}`, { credentials: "include", cache: "no-store" })
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as Partial<Respuesta> & { error?: string };
          if (!vivo) return;
          if (r.ok) { setDatos(j as Respuesta); setError(null); }
          else setError(j.error ?? "No se pudo leer el directorio.");
        })
        .catch((err) => {
          logger.warn("[adelantos] no se pudo leer la ficha del directorio", { error: String(err) });
          if (vivo) setError("Sin conexión: no se pudo leer el directorio.");
        });
    }, q.trim() ? 250 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [beneficiarioId, forestPartyId, q, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, recargar };
}

function NombreParte({ p }: { p: ParteCorta }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="font-semibold text-[var(--text-primary)]">{p.nombre}</span>
      {p.documento && <span className="text-[var(--text-secondary)]"> · {p.documento}</span>}
      {!p.activo && <span className="text-[var(--text-secondary)]"> · dada de baja</span>}
    </span>
  );
}

export function UnirConDirectorio({
  beneficiarioId,
  nombre,
  forestPartyId,
  onCambio,
}: {
  beneficiarioId: string;
  nombre: string;
  forestPartyId: string | null;
  onCambio?: () => void;
}) {
  const rol = useMiRol();
  const puede = rol === "admin" || rol === "owner";
  const [q, setQ] = useState("");
  const { datos, error, recargar } = useUnionDirectorio(beneficiarioId, forestPartyId, q);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [soltando, setSoltando] = useState(false);

  async function unir(parteId: string | null) {
    setGuardando(parteId ?? "soltar");
    setFallo(null);
    const r = await unirConFicha(beneficiarioId, parteId);
    setGuardando(null);
    if (!r.ok) { setFallo(r.mensaje); return; }
    setQ("");
    setSoltando(false);
    recargar();
    onCambio?.();
  }

  if (datos && !datos.forestal) return null;
  const m = datos?.madera;

  return (
    <section className="space-y-2" data-unir-directorio>
      <div className="flex items-center gap-2">
        <CardTitle>Su ficha del Directorio forestal</CardTitle>
        <InfoTip
          title="Unir con su ficha del Directorio"
          what={`Une a ${nombre} con su ficha del Directorio forestal una sola vez. Desde ahí, cuando recibes su guía o aplicas su cubicación, te pregunta si descuentas esa madera de su adelanto y el saldo baja solo.`}
          affects="Sólo el administrador o el dueño la unen o la sueltan. Soltarla no borra nada: deja de cruzar su madera con sus adelantos."
          example="«Wasaco» (Adelantos) y «WASACO» (Directorio) son la misma empresa: únelas y su próxima guía de S/ 800 te ofrece bajar S/ 800 del adelanto."
        />
      </div>

      {!datos && !error && <p className="text-sm text-[var(--text-secondary)]">Buscando su ficha…</p>}

      {datos?.unida && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-sm">
          <Link2 className="h-5 w-5 shrink-0 text-[var(--data-success)]" aria-hidden />
          <span className="text-[var(--text-secondary)]">Unida a</span>
          <NombreParte p={datos.unida} />
          {puede && !soltando && (
            <button type="button" className={button({ variant: "ghost" })} onClick={() => setSoltando(true)} data-soltar-directorio>
              <Link2Off className="h-4 w-4" aria-hidden /> Soltar
            </button>
          )}
          {puede && soltando && (
            <span className="inline-flex items-center gap-2">
              <span className="text-[var(--text-secondary)]">¿Soltarla?</span>
              <button type="button" className={button({ variant: "secondary" })} disabled={guardando !== null} onClick={() => void unir(null)}>
                {guardando === "soltar" ? "Soltando…" : "Sí, soltar"}
              </button>
              <button type="button" className={button({ variant: "ghost" })} onClick={() => setSoltando(false)}>No</button>
            </span>
          )}
        </div>
      )}

      {m && m.teDebe > 0.005 && (
        <p className="text-sm text-[var(--text-secondary)]" data-madera-pt>
          Te debe <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmtMon(m.teDebe)}</span>
          {m.pt != null && m.precioPt != null ? (
            <>
              {" "}≈ <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(m.pt)}</span> a {fmtMon(m.precioPt)} el pt
              {" "}(su última madera, {m.codigo})
            </>
          ) : datos?.unida ? (
            " · los pt salen con el precio de su primera guía o cubicación"
          ) : null}
        </p>
      )}

      {datos && !datos.unida && datos.sugerida && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--data-info)]/10 px-3 py-2 text-sm" data-sugerida-directorio>
          <span className="text-[var(--text-secondary)]">¿Es</span>
          <NombreParte p={datos.sugerida.parte} />
          <span className="text-[var(--text-secondary)]">
            ({datos.sugerida.motivo === "mismo-documento" ? "mismo documento" : "mismo nombre"})
          </span>
          {puede && (
            <button
              type="button"
              className={button({ variant: "secondary" })}
              disabled={guardando !== null}
              onClick={() => void unir(datos.sugerida?.parte.id ?? null)}
            >
              {guardando === datos.sugerida.parte.id ? "Uniendo…" : "Sí, unir"}
            </button>
          )}
        </div>
      )}

      {datos && !datos.unida && puede && (
        <div className="space-y-2">
          <label className="relative block">
            <span className="sr-only">Busca su ficha por nombre, RUC o DNI</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca su ficha por nombre, RUC o DNI"
              className={cn(CAMPO, "pl-10")}
              data-buscar-directorio
            />
          </label>
          {datos.resultados.length > 0 && (
            <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
              {datos.resultados.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <NombreParte p={p} />
                  {p.unidaA ? (
                    <span className="text-[var(--text-secondary)]">ya es de {p.unidaA}</span>
                  ) : (
                    <button type="button" className={button({ variant: "secondary" })} disabled={guardando !== null} onClick={() => void unir(p.id)}>
                      {guardando === p.id ? "Uniendo…" : "Unir"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && datos.resultados.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">Ninguna ficha calza con «{q.trim()}». Si no está, créala en Directorio forestal.</p>
          )}
        </div>
      )}

      {datos && !datos.unida && !puede && (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no está unida. La une el administrador o el dueño.</p>
      )}

      {(fallo || error) && (
        <p role="alert" className="text-sm font-medium text-[var(--data-error-ink,var(--data-error-700))]">
          {fallo ?? error}
        </p>
      )}
    </section>
  );
}

export default UnirConDirectorio;
