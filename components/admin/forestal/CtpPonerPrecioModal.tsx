"use client";

/**
 * «Poner precio a la madera» — Libro CTP → Ingresos → Opciones (2026-09-25).
 *
 * Medido en el tenant real: 0 de 23 guías vivas con precio, así que la Plata de
 * sus permisos decía S/ 0 y el costo por m³ no existía. La pantalla para cargar
 * el costo vivía escondida en Gestión → Rentabilidad y guardaba de a una guía.
 *
 * Dos pestañas sobre las MISMAS guías:
 * · **En tanda** — un precio por m³ por proveedor (y, si hace falta, por
 *   especie), aplicado a todas sus guías SIN precio en una transacción. Las que
 *   ya tienen precio no se pisan salvo que se tilde, y entonces se ve de cuánto
 *   a cuánto cambia cada una.
 * · **Por fila** — la tabla guía por guía de Rentabilidad (`CtpValorizarFilas`).
 *
 * La vista previa corre la misma regla pura que el servidor
 * (`lib/forestal/precio-en-tanda.ts`); lo que queda guardado lo dice el POST.
 */

import { useState } from "react";
import { Coins, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PlanDePrecio } from "@/lib/forestal/precio-en-tanda";
import { requiereCosto } from "@/lib/forestal/madera-de-servicio";
import { formatNumber } from "@/lib/format";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import CtpPrecioTandaGrupos from "./CtpPrecioTandaGrupos";
import CtpPrecioTandaPrevia from "./CtpPrecioTandaPrevia";
import CtpValorizarFilas from "./CtpValorizarFilas";
import { usePrecioEnTanda, type AvisoDeGrupo } from "./hooks/use-precio-en-tanda";
import { usePlanDePrecio } from "./hooks/use-plan-de-precio";

type Pestana = "tanda" | "fila";

export default function CtpPonerPrecioModal({
  permiso,
  onClose,
  onGuardado,
}: {
  /** Código del permiso: sólo sus guías (desde la ficha del permiso). Sin él, todas. */
  permiso?: string | null;
  onClose: () => void;
  /** Después de escribir: quien abrió recarga su lista. */
  onGuardado?: () => void;
}) {
  const { datos, error: errorCarga, recargar, guardar } = usePrecioEnTanda(permiso);
  const [pestana, setPestana] = useState<Pestana>("tanda");
  const [precioProv, setPrecioProv] = useState<Record<string, string>>({});
  const [precioEsp, setPrecioEsp] = useState<Record<string, string>>({});
  const [tambienConPrecio, setTambienConPrecio] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [avisosServidor, setAvisosServidor] = useState<AvisoDeGrupo[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<PlanDePrecio | null>(null);
  const [verTodasFilas, setVerTodasFilas] = useState(false);

  const { pedidos, vistos, plan, avisosProv, avisosEsp, hayAvisos } = usePlanDePrecio(
    datos,
    precioProv,
    precioEsp,
    tambienConPrecio,
  );

  const necesitaConfirmar = hayAvisos || (avisosServidor?.length ?? 0) > 0;
  const puedeGuardar =
    !!plan && plan.totales.filas > 0 && !guardando && (!necesitaConfirmar || confirmado);

  function cambiar(set: typeof setPrecioProv, clave: string, v: string) {
    set((s) => ({ ...s, [clave]: v }));
    setConfirmado(false);
    setAvisosServidor(null);
    setError(null);
  }

  async function onGuardar() {
    if (!plan || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const r = await guardar({
      precios: pedidos,
      vistos,
      tambienConPrecio,
      confirmarAvisos: confirmado,
    });
    setGuardando(false);
    if (r.tipo === "avisos") {
      setAvisosServidor(r.avisos);
      setConfirmado(false);
      return;
    }
    if (r.tipo === "error") {
      setError(r.mensaje);
      return;
    }
    setHecho({ cambios: r.cambios, saltadas: r.saltadas, totales: r.totales });
    setPrecioProv({});
    setPrecioEsp({});
    recargar();
    onGuardado?.();
  }

  const sinPrecio = datos?.grupos.reduce((a, p) => a + p.sinPrecio, 0) ?? 0;
  const m3SinPrecio = datos?.grupos.reduce((a, p) => a + p.m3SinPrecio, 0) ?? 0;
  /* Sólo las que llevan precio (ADR-437 §1): la madera de servicio no se
     compró y una anulada no cuenta — ofrecerlas en «Por fila» terminaba en un
     409 al guardar y engordaba el «de N guías». Misma regla que los grupos. */
  const llevanPrecio = (datos?.filas ?? []).filter((f) => requiereCosto(f));
  const deServicio = (datos?.filas ?? []).filter((f) => f.maderaDeTercero === true).length;
  const filasPorFila = llevanPrecio.filter((f) => verTodasFilas || f.costoTotal == null);

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="wide"
      icon={Coins}
      title="Poner precio a la madera"
      description={
        datos
          ? `${permiso ? `${permiso} · ` : ""}${sinPrecio} de ${llevanPrecio.length} guías sin precio · ${formatNumber(m3SinPrecio, 2)} m³${deServicio > 0 ? ` · ${deServicio} de servicio, sin precio` : ""}`
          : "Cargando las guías…"
      }
      footer={
        <ModalFooter
          error={error ?? errorCarga}
          /* Lo que va a quedar guardado, SIEMPRE a la vista: la lista de
             proveedores es larga y el detalle de abajo se pierde con el scroll. */
          nota={
            !hecho && pestana === "tanda" && plan && plan.totales.filas > 0 ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[var(--text-secondary)]">
                  {plan.totales.filas === 1 ? "1 guía" : `${plan.totales.filas} guías`} ·{" "}
                  {formatNumber(plan.totales.m3, { max: 3 })} m³ ·{" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">
                    S/ {formatNumber(plan.totales.soles, 2)}
                  </b>
                </span>
                {necesitaConfirmar && (
                  <label className="inline-flex items-center gap-1.5 font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <input
                      type="checkbox"
                      checked={confirmado}
                      onChange={(e) => setConfirmado(e.target.checked)}
                      className="h-4 w-4 accent-[var(--brand-ink)]"
                    />
                    Revisé el precio: guárdalo igual
                  </label>
                )}
              </span>
            ) : undefined
          }
        >
          {hecho ? (
            <Btn variant="primary" onClick={onClose}>
              Listo
            </Btn>
          ) : (
            <>
              <Btn variant="secondary" onClick={onClose} disabled={guardando}>
                Cancelar
              </Btn>
              {pestana === "tanda" && (
                <Btn variant="primary" onClick={() => void onGuardar()} disabled={!puedeGuardar}>
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden />
                  )}
                  {plan && plan.totales.filas > 0
                    ? `Guardar ${plan.totales.filas === 1 ? "1 precio" : `${plan.totales.filas} precios`}`
                    : "Guardar precios"}
                </Btn>
              )}
            </>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* Con el resultado a la vista las pestañas no llevan a nada: se ocultan. */}
        {!hecho && (
          <div
            role="tablist"
            aria-label="Cómo poner el precio"
            className="inline-flex items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-0.5"
          >
            {(
              [
                {
                  v: "tanda",
                  label: "En tanda",
                  hint: "Un precio por m³ para todas las guías de un proveedor y especie",
                },
                { v: "fila", label: "Por fila", hint: "El costo total de cada guía, una por una" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                role="tab"
                aria-selected={pestana === o.v}
                title={o.hint}
                onClick={() => setPestana(o.v)}
                className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-bold transition-colors ${
                  pestana === o.v
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {!datos ? (
          errorCarga ? null : (
            <div className="h-40 animate-pulse rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
          )
        ) : hecho ? (
          <CtpPrecioTandaPrevia plan={hecho} hecho />
        ) : pestana === "fila" ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setVerTodasFilas((v) => !v)}
              className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            >
              {verTodasFilas ? "Ver sólo las que faltan" : `Ver todas (${llevanPrecio.length})`}
            </button>
            {filasPorFila.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">
                Todas las guías tienen su costo cargado.
              </p>
            ) : (
              <CtpValorizarFilas
                filas={filasPorFila}
                onGuardado={() => {
                  recargar();
                  onGuardado?.();
                }}
              />
            )}
          </div>
        ) : datos.grupos.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">No hay guías vivas para valorizar.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={tambienConPrecio}
                  onChange={(e) => {
                    setTambienConPrecio(e.target.checked);
                    setConfirmado(false);
                  }}
                  className="h-4 w-4 accent-[var(--brand-ink)]"
                />
                También las que ya tienen precio
              </label>
              <InfoTip
                title="Cómo se calcula"
                what="Precio por m³ × el volumen de cada guía, redondeado al céntimo, en soles. Se guarda el total de cada guía."
                affects="La Plata y el costo por m³ de la ficha de cada permiso, y el margen de Rentabilidad."
                example="Santos Muñoz a S/ 180 el m³: una guía de 9,42 m³ queda en S/ 1 695,60."
              />
            </div>

            <CtpPrecioTandaGrupos
              grupos={datos.grupos}
              precioProv={precioProv}
              precioEsp={precioEsp}
              onPrecioProv={(k, v) => cambiar(setPrecioProv, k, v)}
              onPrecioEsp={(k, v) => cambiar(setPrecioEsp, k, v)}
              avisosProv={avisosProv}
              avisosEsp={avisosEsp}
            />

            {avisosServidor && avisosServidor.length > 0 && (
              <p
                role="alert"
                className="text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                {avisosServidor
                  .map((a) => `${a.proveedor} · ${a.especie}: ${a.avisos[0]}`)
                  .join(" ")}
              </p>
            )}

            {plan && pedidos.length > 0 && <CtpPrecioTandaPrevia plan={plan} />}
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
