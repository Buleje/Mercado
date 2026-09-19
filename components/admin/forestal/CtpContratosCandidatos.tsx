"use client";

/**
 * «Estos permisos ya están escritos en tu libro y todavía no son contrato»
 * (ADR-421).
 *
 * El código del permiso lleva años escrito a mano en los ingresos, en las
 * corridas y en los lotes. Pedirle a Brandon que los vuelva a tipear uno por
 * uno para «dar de alta el contrato» sería hacerle copiar lo que el sistema ya
 * tiene — el mismo criterio con el que el catálogo de especies se siembra solo.
 *
 * Lo único que NO se siembra en tanda son los códigos que no parecen un
 * permiso: en los datos reales hay un `99-XXX/NO-EXISTE-2026-999` y un
 * `AUDIT-PERMISO-INVENTADO`. Sembrarlos les daría ficha, balance y apariencia
 * de papel legal a un typo. Van aparte, con aviso, y sólo entran si alguien lo
 * confirma a mano.
 */

import { AlertTriangle, Leaf, Loader2, Wand2 } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CandidatoContrato } from "@/hooks/use-contratos";
import { TIPO_LABEL } from "./contratos-ui";

/** Qué trae ese código escrito en el libro, en una línea. */
function detalle(c: CandidatoContrato): string {
  const filas = `${c.filas} ${c.filas === 1 ? "registro" : "registros"}`;
  const volumen = c.m3 > 0 ? ` · ${fmtM3(c.m3)} m³` : "";
  const titular = c.titularSugerido ? ` · ${c.titularSugerido}` : " · sin titular en el libro";
  return `${filas}${volumen}${titular}`;
}

export default function CtpContratosCandidatos({
  candidatos,
  sembrando,
  onSembrar,
}: {
  candidatos: CandidatoContrato[];
  sembrando: boolean;
  onSembrar: (elegidos: CandidatoContrato[]) => void;
}) {
  const { confirm } = useConfirm();
  const reales = candidatos.filter((c) => !c.sospechoso);
  const dudosos = candidatos.filter((c) => c.sospechoso);
  if (candidatos.length === 0) return null;

  const sembrarDudoso = async (c: CandidatoContrato) => {
    const ok = await confirm({
      title: `¿Crear «${c.codigo}» como contrato?`,
      description:
        "Ese código no parece un permiso de verdad (tiene forma de prueba o de error de tipeo). Si lo creas, va a tener ficha y balance propios como cualquier otro papel.",
      intent: "danger",
      confirmLabel: "Sí, crearlo igual",
    });
    if (ok) onSembrar([c]);
  };

  return (
    <div className="space-y-3">
      {reales.length > 0 && (
        <section className="rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <BlockTitle as="h3" className="flex items-center gap-2">
                <Leaf
                  className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]"
                  aria-hidden
                />
                Hay {reales.length} {reales.length === 1 ? "permiso escrito" : "permisos escritos"}{" "}
                en tu libro que todavía no {reales.length === 1 ? "es contrato" : "son contrato"}
              </BlockTitle>
              <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
                Al crearlos, cada ingreso, corrida y lote que ya trae ese código queda atado al
                contrato — y recién ahí puedes ver su balance. No se toca nada de lo ya registrado:
                el código sigue escrito igual en el libro que se presenta a SERFOR.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSembrar(reales)}
              disabled={sembrando}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent)] px-4 text-base font-bold text-white transition-[filter] hover:brightness-95 disabled:opacity-60"
            >
              {sembrando ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="h-5 w-5" aria-hidden />
              )}
              {sembrando
                ? "Creando…"
                : `Crear ${reales.length === 1 ? "el contrato" : `los ${reales.length} contratos`}`}
            </button>
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {reales.map((c) => (
              <li
                key={c.codigoNorm}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">
                    {c.codigo}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {TIPO_LABEL[c.tipo]} · {detalle(c)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSembrar([c])}
                  disabled={sembrando}
                  className="h-10 shrink-0 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  Crear
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dudosos.length > 0 && (
        <section className="rounded-2xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/[0.08] p-4">
          <BlockTitle as="h3" className="flex items-center gap-2">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              aria-hidden
            />
            {dudosos.length} {dudosos.length === 1 ? "código no parece" : "códigos no parecen"} un
            permiso de verdad
          </BlockTitle>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            Tienen forma de prueba o de error de tipeo, así que quedan fuera del alta en tanda. Lo
            que hay que hacer con ellos es corregir el código en el registro donde está escrito, no
            crearles un contrato.
          </p>
          <ul className="mt-3 space-y-2">
            {dudosos.map((c) => (
              <li
                key={c.codigoNorm}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">
                    {c.codigo}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">{detalle(c)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void sembrarDudoso(c)}
                  disabled={sembrando}
                  className="h-10 shrink-0 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-warning-500)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  Crear igual
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
