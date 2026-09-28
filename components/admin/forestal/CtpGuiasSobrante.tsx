"use client";

/**
 * «Lo que sobró del inventario» en «Guías sin registrar» (ADR-446, decisiones
 * 4 y 6): las corridas marcadas «usado» a las que les queda madera.
 *
 * Dos casos distintos, y la pantalla no los mezcla:
 *  · las que alguna guía toma como origen: el servidor devuelve su resto a
 *    Productos disponibles al registrar la ÚLTIMA guía que las usa;
 *  · las que ninguna guía usa: se quedan marcadas, salvo que el dueño las
 *    marque acá (viajan con el próximo registro como `liberarUsadas`).
 */
import { CardTitle } from "@buleje/design-system";
import { Check } from "@buleje/design-system/icons";
import type { UsadaLiberada } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { TOL_RESTO_M3 } from "@/lib/forestal/anexo-a-despacho";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

type Resto = { corridaId: string; lineNo: number; restoM3: number };

/** Menos de 5 litros no es madera que volver a ofrecer: el servidor tampoco la libera. */
const conResto = (xs: readonly Resto[]) => xs.filter((x) => x.restoM3 >= TOL_RESTO_M3);
const total = (xs: readonly Resto[]) => xs.reduce((a, x) => a + x.restoM3, 0);

export default function CtpGuiasSobrante({
  usadasConResto,
  usadasSinGuia,
  liberar,
  liberadas,
  bloqueado,
  onAlternar,
}: {
  usadasConResto: readonly Resto[];
  usadasSinGuia: readonly Resto[];
  liberar: ReadonlySet<string>;
  liberadas: readonly UsadaLiberada[];
  bloqueado: boolean;
  onAlternar: (corridaId: string) => void;
}) {
  const yaLiberadas = new Set(liberadas.map((l) => l.corridaId));
  const vuelven = conResto(usadasConResto).filter((u) => !yaLiberadas.has(u.corridaId));
  const quedan = conResto(usadasSinGuia).filter((u) => !yaLiberadas.has(u.corridaId));
  if (vuelven.length === 0 && quedan.length === 0 && liberadas.length === 0) return null;

  return (
    <section aria-label="Lo que sobró del inventario" className="space-y-2 rounded-xl border border-[var(--rule-base)] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Lo que sobró del inventario
        </CardTitle>
        <InfoTip
          title="Lo que sobró"
          what="Corridas marcadas «usado»: el libro dijo que salieron sin guía. Si una guía explica sólo una parte, el resto sigue en el patio."
          affects="Las que usa una guía vuelven solas a Productos disponibles al registrar la última guía que las usa. Las que ninguna guía usa se quedan marcadas, salvo que las elijas acá."
          example="La N° 16 del 1 de agosto tiene madera que ninguna guía se llevó: si sigue en el patio, márcala."
        />
      </div>

      {vuelven.length > 0 && (
        <p className="text-xs tabular-nums text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Vuelven solas al registrar su última guía:</span>{" "}
          {vuelven.map((u) => `N° ${u.lineNo} · ${fmtM3(u.restoM3)} m³`).join(" · ")}
        </p>
      )}

      {quedan.length > 0 && (
        <fieldset disabled={bloqueado} className="space-y-1">
          <legend className="text-xs font-semibold text-[var(--text-primary)]">
            Ninguna guía las usa · {fmtM3(total(quedan))} m³ — devolver al patio con el próximo registro:
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {quedan.map((u) => (
              <label
                key={u.corridaId}
                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border-2 px-2.5 text-sm tabular-nums ${liberar.has(u.corridaId) ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}
              >
                <input
                  type="checkbox"
                  checked={liberar.has(u.corridaId)}
                  onChange={() => onAlternar(u.corridaId)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                N° {u.lineNo} · {fmtM3(u.restoM3)} m³
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {liberadas.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-xs tabular-nums text-[var(--data-success-ink)]">
          <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Volvieron a Productos disponibles: {liberadas.map((l) => `N° ${l.lineNo} (${fmtM3(l.restoM3)} m³)`).join(" · ")}
          </span>
        </p>
      )}
    </section>
  );
}
