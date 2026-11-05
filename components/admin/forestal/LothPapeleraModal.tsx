"use client";

/**
 * LothPapeleraModal — la papelera del Libro TH: lo que se borró, agrupado por
 * momento, y cómo recuperarlo (04-11-2026, Brandon: «mejora mi panel»).
 *
 * Borrar una línea del libro es soft-delete y antes no había dónde verlo ni
 * cómo devolverlo. Acá se marca un borrado entero o líneas sueltas; mientras
 * tanto el servidor responde la VISTA PREVIA exacta (vuelve a pasar las reglas
 * del libro de hoy) y dice qué líneas no vuelven y por qué. El botón es
 * turquesa, no rojo: recuperar se deshace borrando otra vez.
 */

import { Loader2, RotateCcw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import {
  MOTIVO_NO_RECUPERA_TEXTO,
  type LineaNoRecuperada,
  type ResultadoRecuperar,
} from "@/lib/forestal/loth-papelera";
import { cn } from "@/lib/utils";
import { useLothPapelera } from "./hooks/use-loth-papelera";
import LothPapeleraGrupo from "./LothPapeleraGrupo";
import { nombreSeccion, pluralN } from "./loth-borrar-piezas";

const etiquetaLinea = (n: LineaNoRecuperada) =>
  `N.º ${n.lineNo} ${nombreSeccion(n.section)}${n.codigo ? ` ${n.codigo}` : ""}`;

/** El aviso final: lo que volvió y, aparte, lo que se quedó en la papelera con su motivo. */
function avisarRecuperado(r: ResultadoRecuperar): void {
  const arboles =
    r.arbolesTalados > 0
      ? ` ${pluralN(r.arbolesTalados, "árbol volvió", "árboles volvieron")} a «talado» en el censo.`
      : "";
  const titulo =
    r.recuperadas > 0
      ? `Se ${r.recuperadas === 1 ? "recuperó" : "recuperaron"} ${pluralN(r.recuperadas, "línea", "líneas")} (${formatNumber(r.m3, 3)} m³).${arboles}`
      : "No se recuperó ninguna línea.";
  const quedan = r.noRecuperadas.map((n) => `${etiquetaLinea(n)}: ${MOTIVO_NO_RECUPERA_TEXTO[n.motivo]}`);
  if (quedan.length === 0) {
    toast.success(titulo);
    return;
  }
  const resto = quedan.length > 4 ? ` · y ${quedan.length - 4} más` : "";
  toast.warning(titulo, { description: `${quedan.slice(0, 4).join(" · ")}${resto}`, duration: 12_000 });
}

export default function LothPapeleraModal({
  onClose,
  onRecuperado,
}: {
  onClose: () => void;
  /** Se recuperó algo: el libro se relee. */
  onRecuperado: () => void;
}) {
  const p = useLothPapelera();
  const { vista } = p;
  const aRecuperar = vista?.recuperadas ?? 0;
  const totalLineas = p.grupos?.reduce((a, g) => a + g.lineas.length, 0) ?? 0;

  async function recuperar() {
    const r = await p.recuperar();
    if (!r) return;
    avisarRecuperado(r);
    // Si no volvió nada, la ventana queda abierta con la lista al día (el aviso dice por qué).
    if (r.recuperadas > 0) onRecuperado();
    else p.releer();
  }

  return (
    <AdminModal
      open
      onClose={p.busy ? () => undefined : onClose}
      title="Papelera del libro"
      description="Lo que se borró del libro de operaciones, por momento."
      icon={RotateCcw}
      size="xl"
      footer={
        <ModalFooter error={p.error}>
          <button type="button" onClick={onClose} disabled={p.busy} className={button({ variant: "ghost" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void recuperar()}
            disabled={p.busy || !p.vistaAlDia || aRecuperar === 0}
            className={cn(button({ variant: "accent" }), "gap-2")}
          >
            {p.busy || (p.seleccion.size > 0 && !p.vistaAlDia && !p.vistaFallida) ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
            {p.vistaAlDia && aRecuperar > 0
              ? `Recuperar ${pluralN(aRecuperar, "línea", "líneas")}`
              : "Recuperar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {p.grupos && p.grupos.length > 0 && (
          <div className="flex items-center gap-2">
            <p className="text-sm text-[var(--text-secondary)]">
              {pluralN(totalLineas, "línea borrada", "líneas borradas")} en{" "}
              {pluralN(p.grupos.length, "momento", "momentos")}
              {p.total > totalLineas && ` · se muestran las más recientes de ${formatNumber(p.total)}`}
            </p>
            <InfoTip
              title="Papelera del libro"
              what="Lo que se borra del libro queda acá."
              affects="Recuperar vuelve a pasar las reglas del libro de hoy: si el árbol ya se taló con otra línea o el mes está cerrado, esa línea no vuelve y te dice por qué."
              example="Borraste 44 trozados y despachos el 06/10: márcalos y recupéralos de un clic."
              side="right"
            />
          </div>
        )}

        {p.cargando && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando lo borrado…
          </p>
        )}

        {p.grupos === null && p.error && (
          <button type="button" onClick={p.reintentar} className={button({ variant: "secondary" })}>
            Reintentar
          </button>
        )}

        {p.grupos?.length === 0 && (
          <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
            No hay nada borrado en el libro.
          </p>
        )}

        {p.grupos && p.grupos.length > 0 && (
          <ul className="space-y-3">
            {p.grupos.map((g) => (
              <LothPapeleraGrupo
                key={g.clave}
                grupo={g}
                seleccion={p.seleccion}
                deshabilitado={p.busy}
                onAlternarGrupo={p.alternarGrupo}
                onAlternarLinea={p.alternarLinea}
              />
            ))}
          </ul>
        )}

        {vista && p.seleccion.size > 0 && (
          <div
            aria-live="polite"
            aria-busy={!p.vistaAlDia}
            className={cn("space-y-3 transition-opacity", !p.vistaAlDia && "opacity-60")}
          >
            <div className="rounded-xl border border-[var(--rule-base)]">
              <p className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                {vista.recuperadas > 0
                  ? `Se recuperan ${pluralN(vista.recuperadas, "línea", "líneas")} (${formatNumber(vista.m3, 3)} m³)`
                  : "Con lo marcado no vuelve ninguna línea"}
              </p>
              {vista.porSeccion.length > 0 && (
                <ul className="divide-y divide-[var(--rule-base)]">
                  {vista.porSeccion.map((s) => (
                    <li key={s.section} className="flex items-start gap-3 px-3 py-2 text-sm text-[var(--text-primary)]">
                      <span className="min-w-0 flex-1 font-semibold">{nombreSeccion(s.section)}</span>
                      <span className="shrink-0 text-right font-mono tabular-nums">
                        {pluralN(s.recuperadas, "línea", "líneas")}
                        {s.m3 > 0 && ` · ${formatNumber(s.m3, 3)} m³`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {vista.noRecuperadas.length > 0 && (
              <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--text-primary)]">
                <p className="font-semibold">No vuelven: {formatNumber(vista.noRecuperadas.length)}</p>
                <ul className="mt-1 max-h-48 space-y-1.5 overflow-y-auto">
                  {vista.noRecuperadas.map((n) => (
                    <li key={n.id}>
                      <b>{etiquetaLinea(n)}</b> — {MOTIVO_NO_RECUPERA_TEXTO[n.motivo]}
                      {n.mensaje && (
                        <span className="block text-[var(--text-secondary)]">{n.mensaje}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
