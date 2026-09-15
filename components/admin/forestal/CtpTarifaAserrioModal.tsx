"use client";

/**
 * La tarifa de aserrío del CTP (ADR-412): precio por pie tablar, con
 * variaciones por especie, por tipo de pieza y por tramo de largo, versionada
 * por fecha de vigencia.
 *
 * Pedido de Brandon (2026-09-13): al declarar la producción, poner el precio
 * de aserrío «de ese momento» — con variaciones de especie, dimensiones y
 * largo. Esta pantalla es donde se arma esa tabla; `CtpCobroAserrio` es donde
 * se usa al declarar.
 */

import { useState } from "react";
import { Coins, Loader2, Pencil, Plus, Sparkles, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import { versionVigente, type BaseDelBorrador, type VersionTarifa, type VersionTarifaInput } from "@/lib/forestal/tarifa-aserrio";
import { useTarifaAserrio } from "./hooks/use-tarifa-aserrio";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import CtpTarifaAserrioForm from "./CtpTarifaAserrioForm";
import { Btn, ModalBody, formatDate } from "./ctp-shared";

type Editando = VersionTarifa | "nueva" | "borrador" | null;

export default function CtpTarifaAserrioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tarifa = useTarifaAserrio();
  const catalogo = useEspeciesCatalogo();
  const { confirm } = useConfirm();
  /* `"nueva"` arranca desde la vigente de HOY (si hay); `"borrador"` arranca
     con la producción real (`armarConProduccion`); una versión concreta edita
     esa. `null` = la lista. */
  const [editando, setEditando] = useState<Editando>(null);
  const [borradorProduccion, setBorradorProduccion] = useState<{ borrador: VersionTarifaInput; base: BaseDelBorrador } | null>(null);
  const [cargandoBorrador, setCargandoBorrador] = useState(false);

  const hoy = hoyEnLima();
  const vigente = versionVigente(tarifa.tarifario, hoy);
  const versiones = [...tarifa.tarifario.versiones].reverse(); // más reciente primero

  /** «Armar con tu producción» (ADR-412): sin ninguna tarifa cargada todavía,
   *  el punto de partida es lo que este aserradero de verdad trabaja — no un
   *  formulario en blanco ni el catálogo entero. */
  async function armarConProduccion() {
    setCargandoBorrador(true);
    const r = await tarifa.cargarBorrador();
    setCargandoBorrador(false);
    if (!r) return;
    setBorradorProduccion(r);
    setEditando("borrador");
  }

  async function quitar(v: VersionTarifa) {
    const ok = await confirm({
      title: `¿Quitar la tarifa desde ${formatDate(v.vigenteDesde)}?`,
      description:
        "Lo ya cobrado con esta versión no cambia — el precio se congeló en cada corrida al declararla. Sólo deja de regir para lo que se declare de acá en más.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (ok) await tarifa.quitar(v.id);
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Tarifa de aserrío"
      description="Lo que este CTP cobra por asierrar madera de un tercero"
      icon={Coins}
      variant="wide"
      /* Se abre desde «Producir sin lote», el registro de producción y el menú
         de Opciones del libro — todos ya en z-60. */
      aboveModals
      footer={
        !editando && (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">
              {/* `cargando` primero: con `versiones` todavía en `[]` por la
                  carga en curso, "Sin tarifa cargada todavía" salía a la vez
                  que "Buscando la tarifa…" de más arriba (mismo patrón
                  `loading && !X` que ya engañó en otros módulos). Y un
                  `versiones.length === 0` por una LECTURA que falló no es lo
                  mismo que "todavía no hay nada": mirar `tarifa.error` antes
                  de leer eso como "vacío de verdad" (BAJO, revisión
                  2026-09-14). */}
              {tarifa.cargando
                ? "Buscando…"
                : tarifa.error
                  ? "No se pudo leer la tarifa"
                  : versiones.length === 0
                    ? "Sin tarifa cargada todavía"
                    : `${versiones.length} ${versiones.length === 1 ? "versión" : "versiones"}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {/* Sin ninguna tarifa cargada, el punto de partida más útil no es
                  un formulario en blanco: es lo que este aserradero YA está
                  produciendo (Brandon, «estrenarlo con tus corridas»). Pero no
                  si la lectura falló: puede que SÍ haya tarifa y este atajo
                  arme un borrador sobre datos que en realidad no se leyeron. */}
              {!tarifa.cargando && !tarifa.error && versiones.length === 0 && (
                <Btn variant="secondary" onClick={() => void armarConProduccion()} disabled={cargandoBorrador}>
                  {cargandoBorrador ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                  Armar con tu producción
                </Btn>
              )}
              <Btn variant="primary" onClick={() => setEditando("nueva")}>
                <Plus className="h-4 w-4" aria-hidden /> Nueva tarifa desde hoy
              </Btn>
            </div>
          </div>
        )
      }
    >
      <ModalBody>
        <p className="mb-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Precio por pie tablar = <b>base</b> (de la especie, o la general) + <b>ajuste por tipo</b> +{" "}
          <b>ajuste por largo</b>.
        </p>

        {editando ? (
          <CtpTarifaAserrioForm
            key={editando === "nueva" || editando === "borrador" ? editando : editando.id}
            version={editando === "nueva" || editando === "borrador" ? vigente : editando}
            comoNueva={editando === "nueva"}
            vigenteDesdeInicial={
              editando === "borrador" ? (borradorProduccion?.borrador.vigenteDesde ?? hoy) : editando === "nueva" ? hoy : editando.vigenteDesde
            }
            borradorProduccion={editando === "borrador" ? (borradorProduccion ?? undefined) : undefined}
            nombresCatalogo={catalogo.nombres}
            guardando={tarifa.guardando}
            onGuardar={async (input) => {
              const motivo = await tarifa.guardar(input);
              if (!motivo) setEditando(null);
              return motivo;
            }}
            onCancelar={() => setEditando(null)}
          />
        ) : tarifa.cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando la tarifa…
          </p>
        ) : tarifa.error ? null : versiones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
            Todavía no hay ninguna tarifa cargada. «Nueva tarifa desde hoy» arranca una en blanco.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
            {versiones.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    Desde {formatDate(v.vigenteDesde)}
                    {v.id === vigente?.id && (
                      <span className="rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                        Vigente hoy
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    General S/ {Number(v.basePt).toFixed(2)} · {v.especies.length}{" "}
                    {v.especies.length === 1 ? "especie" : "especies"} · {v.tipos.length}{" "}
                    {v.tipos.length === 1 ? "ajuste de tipo" : "ajustes de tipo"} · {v.largos.length}{" "}
                    {v.largos.length === 1 ? "tramo" : "tramos"} de largo
                    {v.nota ? ` · ${v.nota}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditando(v)}
                  aria-label={`Editar la tarifa desde ${formatDate(v.vigenteDesde)}`}
                  title="Editar esta versión"
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void quitar(v)}
                  disabled={tarifa.guardando}
                  aria-label={`Quitar la tarifa desde ${formatDate(v.vigenteDesde)}`}
                  title="Quitar esta versión (pide confirmar)"
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tarifa.error && !editando && (
          <p role="alert" className="mt-2 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {tarifa.error}
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
