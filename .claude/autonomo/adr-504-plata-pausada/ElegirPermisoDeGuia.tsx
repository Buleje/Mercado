"use client";

/**
 * «¿De qué permiso es la GTF X?» — la ventana que se abre cuando el servidor
 * contesta 409 `GUIA_AMBIGUA` (ADR-504): el mismo N° de guía está en dos
 * talonarios y la pantalla no dijo cuál. Se elige el permiso y el pedido se
 * reintenta solo (`fetchConPermisoDeGuia`).
 *
 * La montan las raíces del módulo forestal, una sola vez; si hay dos montadas,
 * pinta la primera. Va SIEMPRE `aboveModals`: el 409 llega casi siempre desde
 * otra ventana (el alta del ingreso, el costo de la guía, el flete).
 *
 * El permiso del libro (el del chip, ADR-431) va primero y se marca: es el
 * que la pantalla usaría, pero lo confirma quien guarda — nunca «la primera».
 */

import { Check, FileText } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { etiquetaPermiso, ordenarPorPermisoDelLibro, type CandidataDeGuia } from "@/lib/forestal/guia-por-permiso";
import { usePedidoDePermiso } from "./hooks/use-elegir-permiso-de-guia";

export default function ElegirPermisoDeGuia() {
  const pedido = usePedidoDePermiso();
  const { activo } = useContratoActivo();
  const abierto = pedido != null;
  const { candidatas, delLibro } = pedido
    ? ordenarPorPermisoDelLibro(pedido.ambigua.candidatas, activo)
    : { candidatas: [] as CandidataDeGuia[], delLibro: null };
  const gtf = pedido?.ambigua.gtfNumber ?? "";

  return (
    <AdminModal
      open={abierto}
      onClose={() => pedido?.elegir(null)}
      /* Corto: los controles de ventana le quitan ~64 px al título y en `md`
         «¿De qué permiso es la GTF 019-001-000123?» salía cortado justo en el N°.
         El N° va en la línea de abajo y en cada opción. */
      title="¿De qué permiso?"
      description={gtf ? `GTF ${gtf} · está en ${candidatas.length} permisos` : undefined}
      icon={FileText}
      size="md"
      aboveModals
      footer={
        <ModalFooter
          nota={
            <span className="inline-flex items-center gap-1">
              Se guarda en el que elijas
              <InfoTip
                title="Dos talonarios, el mismo N°"
                what="Cada permiso tiene su propio talonario de guías: la GTF 4 de un permiso y la GTF 4 de otro son dos guías distintas."
                affects="Lo que ibas a guardar se guarda en la guía del permiso que elijas. Si cierras sin elegir, no se guarda nada."
                example={pedido?.ambigua.mensaje ?? "La GTF 4 está en el permiso 017 y en el 020: eliges el 017 y se guarda ahí."}
                side="top"
              />
            </span>
          }
        >
          <button type="button" onClick={() => pedido?.elegir(null)} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
        </ModalFooter>
      }
    >
      <ul className={`${MODAL_BODY} space-y-2`} data-elegir-permiso-guia>
        {candidatas.map((c, i) => (
          <li key={`${c.contratoId ?? "sin"}-${i}`}>
            <button
              type="button"
              onClick={() => pedido?.elegir(c)}
              title={c.permiso ?? "Sin permiso"}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:border-[var(--accent)] ${
                delLibro === i
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
              }`}
              data-candidata={c.contratoId ?? "sin-permiso"}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-bold text-[var(--text-primary)]">
                    GTF {c.gtfNumber || gtf} · {etiquetaPermiso(c.permiso)}
                  </span>
                  {delLibro === i && (
                    <span className="rounded-full bg-[var(--accent-dark)] px-2 py-0.5 text-xs font-bold text-white">
                      el del libro
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-[var(--text-secondary)]">
                  {[c.permiso, c.titular, c.especies.join(", ")].filter(Boolean).join(" · ") || "Sin permiso ni titular"}
                </span>
              </span>
              {delLibro === i && <Check className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </AdminModal>
  );
}
