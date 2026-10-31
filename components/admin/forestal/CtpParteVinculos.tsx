"use client";

/**
 * Con quién está vinculada esta parte (ADR-430): otra parte del Directorio o
 * un permiso.
 *
 * Pedido de Brandon (22-09): «vincular ese directorio a otro que sea un permiso
 * o un tercero, e hipervincular todo con la cuenta o saldo». El vínculo NO mueve
 * deuda —la deuda va siempre al cliente (decisión 4)—: deja ver, al lado, el
 * saldo de cada vinculado en su propia libreta.
 *
 * La otra parte se elige de la libreta que la ficha ya tiene (`existentes`), en
 * un `<select>` dentro de la sección: el `DirectorioPicker` busca UN papel, abre
 * su propio editor de partes —una ficha dentro de otra ficha— y su menú flota en
 * `absolute`, que dentro de un modal queda recortado.
 */

import { useMemo, useState } from "react";
import { Link2, Loader2, Plus, Trash2 } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { useVinculosParte, type VinculoPendiente } from "@/hooks/use-vinculos-parte";
import type { Parte } from "@/lib/forestal/directorio";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import {
  ETIQUETA_RELACION_INVERSA,
  vinculoParteInputSchema,
  type SaldoConsolidado,
} from "@/lib/forestal/vinculos-parte";
import { Btn } from "./ctp-shared";
import { claseSaldo, textoSaldo } from "./CtpParteSaldo";
import FormularioVinculo, {
  VACIO,
  aVinculoInput,
  fraseVinculo,
  type Formulario,
} from "./CtpParteVinculoForm";

let secuencia = 0;

const fecha = (iso: string | null | undefined) => (iso ? etiquetaLarga(iso.slice(0, 10)) : null);

export default function CtpParteVinculos({
  parteId,
  existentes,
  saldo,
  pendientes,
  onPendientes,
  onCambio,
}: {
  /** `null` = alta: los vínculos esperan a la ficha. */
  parteId: string | null;
  /** La libreta del Directorio (la misma que ya recibe la ficha). */
  existentes: readonly Parte[];
  saldo: SaldoConsolidado | null;
  pendientes: VinculoPendiente[];
  onPendientes: (p: VinculoPendiente[]) => void;
  /** Tras crear o quitar uno guardado: el saldo de los vinculados cambia. */
  onCambio?: () => void;
}) {
  const { confirm } = useConfirm();
  const vinc = useVinculosParte(parteId);
  const [f, setF] = useState<Formulario | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const permisos = usePermisosForestal({ activo: f?.con === "permiso" });

  const otras = useMemo(
    () =>
      existentes
        .filter((p) => p.activo && p.id !== parteId)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [existentes, parteId],
  );
  const set = (v: Partial<Formulario>) => setF((x) => (x ? { ...x, ...v } : x));

  async function vincular() {
    if (!f) return;
    const input = aVinculoInput(parteId ?? "pendiente", f);
    const v = vinculoParteInputSchema.safeParse(input);
    if (!v.success) {
      setError(v.error.issues[0]?.message ?? "El vínculo no se puede guardar así.");
      return;
    }
    setError(null);
    if (!parteId) {
      const otra =
        f.con === "parte"
          ? otras.find((p) => p.id === f.vinculadaParteId)?.nombre
          : permisos.contratos.find((c) => c.id === f.contratoId)?.codigo;
      const { parteId: _p, ...resto } = v.data;
      secuencia += 1;
      onPendientes([
        ...pendientes,
        {
          ...resto,
          clave: `v${secuencia}`,
          etiqueta: `${fraseVinculo(f.relacion, f.con === "permiso")} ${otra ?? ""}`.trim(),
        },
      ]);
      setF(null);
      return;
    }
    setOcupado("nuevo");
    const e = await vinc.crear(v.data);
    setOcupado(null);
    if (e) return setError(e);
    setF(null);
    onCambio?.();
  }

  async function quitar(id: string, nombre: string) {
    const ok = await confirm({
      title: `¿Quitar el vínculo con ${nombre}?`,
      description:
        "Sólo se deshace el vínculo: los cargos y abonos de cada uno siguen en su cuenta.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    setOcupado(id);
    const e = await vinc.quitar(id);
    setOcupado(null);
    setError(e);
    if (!e) onCambio?.();
  }

  const saldoDe = (id: string | null) =>
    id ? saldo?.vinculados.find((x) => x.parteId === id) : undefined;

  return (
    <div className="sm:col-span-12 space-y-2">
      {(vinc.error || error) && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {error ?? vinc.error}
        </p>
      )}
      {vinc.cargando && vinc.vinculos.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando sus vínculos…
        </p>
      )}

      {(vinc.vinculos.length > 0 || pendientes.length > 0) && (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
          {vinc.vinculos.map((v) => {
            const vigencia = [
              fecha(v.desde) && `desde el ${fecha(v.desde)}`,
              fecha(v.hasta) && `hasta el ${fecha(v.hasta)}`,
            ]
              .filter(Boolean)
              .join(" ");
            /* Fase 2 (ADR-430): lo que OTRA parte anotó apuntando a ésta se ve
               igual —el backend no distingue quién lo anotó al dar de baja
               (decisión: se puede quitar desde cualquiera de las dos fichas)—
               pero en voz inversa: «Juan es su representante», no «Representa
               a Juan» (esa frase es de quien lo anotó). Nunca es un permiso: un
               `ForestContrato` no tiene ficha que liste lo que le "entra". */
            if (v.sentido === "entra") {
              const nombre = v.parteNombre ?? "—";
              const s = saldoDe(v.parteId);
              return (
                <li key={v.id} className="flex items-start gap-2 px-3 py-2">
                  <Link2
                    className="mt-1 h-4 w-4 shrink-0 -scale-x-100 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--text-primary)]">
                      <b>{nombre}</b> {ETIQUETA_RELACION_INVERSA[v.relacion]}
                    </span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {[vigencia, v.notas].filter(Boolean).join(" · ") || "Anotado desde su ficha"}
                    </span>
                    {s && (
                      <span
                        className={`block text-xs font-semibold tabular-nums ${claseSaldo(s.saldo)}`}
                      >
                        {textoSaldo(s.saldo)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void quitar(v.id, nombre)}
                    disabled={ocupado === v.id}
                    aria-label={`Quitar el vínculo con ${nombre}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] disabled:opacity-50 dark:hover:text-[var(--data-error-500)]"
                  >
                    {ocupado === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </li>
              );
            }

            const esPermiso = !v.vinculadaParteId && !!v.contratoCodigo;
            const destino = v.vinculadaNombre ?? v.contratoCodigo ?? "—";
            const nombre = esPermiso ? `el permiso ${destino}` : destino;
            const s = saldoDe(v.vinculadaParteId);
            return (
              <li key={v.id} className="flex items-start gap-2 px-3 py-2">
                <Link2 className="mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text-primary)]">
                    {fraseVinculo(v.relacion, esPermiso)} <b>{destino}</b>
                  </span>
                  {(vigencia || v.notas) && (
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {[vigencia, v.notas].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {s && (
                    <span
                      className={`block text-xs font-semibold tabular-nums ${claseSaldo(s.saldo)}`}
                    >
                      {textoSaldo(s.saldo)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void quitar(v.id, nombre)}
                  disabled={ocupado === v.id}
                  aria-label={`Quitar el vínculo con ${nombre}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] disabled:opacity-50 dark:hover:text-[var(--data-error-500)]"
                >
                  {ocupado === v.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
          {pendientes.map((p) => (
            <li key={p.clave} className="flex items-center gap-2 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
                {p.etiqueta}{" "}
                <span className="text-xs text-[var(--text-tertiary)]">
                  · se guarda con la ficha
                </span>
              </span>
              <button
                type="button"
                onClick={() => onPendientes(pendientes.filter((x) => x.clave !== p.clave))}
                aria-label={`Quitar «${p.etiqueta}»`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {f ? (
        <FormularioVinculo
          f={f}
          set={set}
          otras={otras}
          permisos={permisos}
          ocupado={ocupado === "nuevo"}
          onVincular={() => void vincular()}
          onCancelar={() => {
            setF(null);
            setError(null);
          }}
        />
      ) : (
        <Btn onClick={() => setF({ ...VACIO })}>
          <Plus className="h-4 w-4" aria-hidden />
          Vincular con otra parte o un permiso
        </Btn>
      )}
    </div>
  );
}
