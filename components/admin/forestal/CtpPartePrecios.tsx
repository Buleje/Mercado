"use client";

/**
 * El precio del pie para un cliente, dentro de su ficha del Directorio (ADR-430).
 *
 * Pedido de Brandon (22-09): «para ese cliente, a cuánto se le vende el pie de
 * servicio de aserrío o de venta de madera; por tipo o por especie; Global o
 * por grupos». Decidió que este precio REEMPLAZA a la tarifa de la planta, sin
 * sus recargos: «0.50 toda especie» es 0.50.
 *
 * Cada guardado es una VERSIÓN nueva que rige desde una fecha: lo ya cobrado
 * queda con el trato de su día, y el historial dice cuál rige hoy.
 *
 * Dos momentos, como los permisos de la ficha (ADR-425):
 *  · **Alta** (la ficha todavía no tiene id): lo escrito sube a la ficha como
 *    pendiente y se guarda cuando el servidor devuelve la ficha con su id.
 *  · **Edición**: «Guardar precio» lo guarda en el acto. Lo escrito y sin
 *    guardar también sube: el «Guardar» de la ficha lo guarda, en vez de
 *    cerrar y perderlo.
 */

import { useState } from "react";
import { Loader2, Save } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useTarifasCliente } from "@/hooks/use-tarifas-cliente";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import {
  borradorDesdeTarifa,
  tarifaDelBorrador,
  validarBorrador,
  type BorradorPrecio,
  type PrecioPendiente,
} from "@/lib/forestal/precio-cliente-borrador";
import {
  ETIQUETA_SERVICIO_PRECIO,
  SERVICIOS_PRECIO,
  tarifaVigente,
  type ServicioPrecio,
  type TarifaCliente,
} from "@/lib/forestal/precio-cliente";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { limaDateKey } from "@/lib/utils";
import { Btn } from "./ctp-shared";
import CtpEspeciesGruposModal from "./CtpEspeciesGruposModal";
import CtpPartePrecioForm from "./CtpPartePrecioForm";
import { HistorialPrecios, VistaPreviaPrecio } from "./CtpPartePrecioHistorial";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";

type Borradores = Record<ServicioPrecio, BorradorPrecio | null>;

export default function CtpPartePrecios({
  parteId,
  onPendientes,
}: {
  /** `null` = alta: lo escrito espera a la ficha. */
  parteId: string | null;
  onPendientes: (p: PrecioPendiente[]) => void;
}) {
  const { confirm } = useConfirm();
  const tarifas = useTarifasCliente(parteId);
  const cat = useEspeciesCatalogo();
  const hoy = limaDateKey();
  const [servicio, setServicio] = useState<ServicioPrecio>("aserrio");
  /** `null` = sin tocar: se muestra la versión vigente. */
  const [borradores, setBorradores] = useState<Borradores>({ aserrio: null, venta: null });
  const [estado, setEstado] = useState<"idle" | "guardando">("idle");
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editandoGrupos, setEditandoGrupos] = useState(false);

  const especies = especiesDisponibles(cat.catalogo);
  const vigente = (s: ServicioPrecio) => tarifaVigente(tarifas.tarifas, s, hoy);
  const base = (s: ServicioPrecio) => borradorDesdeTarifa(vigente(s), s, hoy);
  const sucio = (bs: Borradores, s: ServicioPrecio) =>
    bs[s] != null && JSON.stringify(bs[s]) !== JSON.stringify(base(s));
  const borrador = borradores[servicio] ?? base(servicio);

  /** Recalcula lo pendiente y lo sube a la ficha. En el gesto, no en un efecto. */
  function publicar(bs: Borradores) {
    onPendientes(
      SERVICIOS_PRECIO.filter((s) => sucio(bs, s)).map((s) => ({
        servicio: s,
        resultado: validarBorrador(parteId ?? "pendiente", bs[s]!, cat.grupos),
      })),
    );
  }

  function cambiar(b: BorradorPrecio) {
    const bs = { ...borradores, [servicio]: b };
    setBorradores(bs);
    setError(null);
    setAviso(null);
    publicar(bs);
  }

  function descartar() {
    const bs = { ...borradores, [servicio]: null };
    setBorradores(bs);
    setError(null);
    publicar(bs);
  }

  async function guardarAhora() {
    if (!parteId) return;
    const r = validarBorrador(parteId, borrador, cat.grupos);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEstado("guardando");
    setError(null);
    /* El servidor guarda UNA versión por cliente, servicio y día: la del mismo
       día se corrige (responde 200, no 201). Se dice así, o el historial
       mostraría una sola versión y parecería que la anterior se perdió. */
    const corrige = tarifas
      .deServicio(servicio)
      .some((t) => t.vigenteDesde === r.input.vigenteDesde);
    try {
      await tarifas.guardar(r.input);
      const dia = etiquetaLarga(r.input.vigenteDesde, hoy);
      setAviso(
        corrige
          ? `Corregiste el precio que rige desde el ${dia}: hay una sola versión por día.`
          : `Precio guardado: rige desde el ${dia}.`,
      );
      descartar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  async function quitar(t: TarifaCliente) {
    const ok = await confirm({
      title: "¿Dar de baja este precio?",
      description:
        "Lo ya cobrado con este precio no cambia. Desde ahora rige la versión anterior, o la tarifa de la planta si no hay otra.",
      intent: "danger",
      confirmLabel: "Sí, dar de baja",
    });
    if (!ok) return;
    setQuitando(t.id);
    setError(null);
    try {
      await tarifas.quitar(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuitando(null);
    }
  }

  const hayCambios = sucio(borradores, servicio);

  return (
    <div className="sm:col-span-12 space-y-3">
      <div role="group" aria-label="Qué se le cobra" className="flex flex-wrap gap-2">
        {SERVICIOS_PRECIO.map((s) => {
          const on = s === servicio;
          const tiene = vigente(s) != null || sucio(borradores, s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setServicio(s)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
                on
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              {ETIQUETA_SERVICIO_PRECIO[s]}
              {tiene && (
                <>
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full bg-[var(--data-success-500)]"
                  />
                  <span className="sr-only">(tiene precio)</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {tarifas.error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {tarifas.error}
        </p>
      )}
      {tarifas.cargando && tarifas.tarifas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando sus precios…
        </p>
      ) : (
        <>
          <CtpPartePrecioForm
            borrador={borrador}
            notaFecha={
              tarifas.deServicio(servicio).some((t) => t.vigenteDesde === borrador.vigenteDesde)
                ? "Ya hay una versión desde ese día: guardar la corrige."
                : "Lo ya cobrado antes de esa fecha no cambia."
            }
            onCambio={cambiar}
            grupos={cat.grupos}
            especies={especies}
            onEditarGrupos={() => setEditandoGrupos(true)}
          />
          <VistaPreviaPrecio
            tarifa={tarifaDelBorrador(borrador, cat.grupos)}
            grupos={cat.grupos}
            especies={especies.map((e) => e.nombre)}
          />
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {error}
        </p>
      )}
      {aviso && !error && (
        <p
          role="status"
          className="text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        >
          {aviso}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {parteId ? (
          <>
            {hayCambios && (
              <Btn variant="ghost" onClick={descartar}>
                Descartar
              </Btn>
            )}
            <Btn
              variant="primary"
              disabled={!hayCambios || estado === "guardando"}
              onClick={() => void guardarAhora()}
            >
              {estado === "guardando" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Guardar precio
            </Btn>
          </>
        ) : (
          <span className="text-sm text-[var(--text-tertiary)]">Se guarda junto con la ficha.</span>
        )}
      </div>

      <HistorialPrecios
        versiones={tarifas.deServicio(servicio)}
        vigenteId={vigente(servicio)?.id ?? null}
        hoy={hoy}
        grupos={cat.grupos}
        quitando={quitando}
        onQuitar={(t) => void quitar(t)}
      />

      {editandoGrupos && (
        <CtpEspeciesGruposModal
          onClose={() => setEditandoGrupos(false)}
          onCambio={() => void cat.recargar()}
        />
      )}
    </div>
  );
}
