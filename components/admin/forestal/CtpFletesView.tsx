"use client";

/**
 * CtpFletesView — los viajes que traen la madera (ADR-318).
 *
 * En un aserradero de selva el transporte es el segundo costo después de la
 * madera y hasta acá vivía en un cuaderno. Esta vista responde tres preguntas
 * que se hacen todas las semanas:
 *
 *   · ¿cuánto me está saliendo el m³ traído?
 *   · ¿a qué transportista le debo?
 *   · ¿qué fletes le descuento a cada proveedor?
 *
 * Un viaje sin monto **no cuenta como 0**: se muestra aparte y queda fuera de
 * los promedios (misma regla que el costo de materia prima, ADR-134).
 */

import { useMemo, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { Check, Coins, Loader2, Pencil, Plus, Trash2, Truck, Wallet } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { useFletesForestales } from "@/hooks/use-fletes-forestales";
import { formatearPlaca } from "@/lib/forestal/directorio";
import {
  PAGADOR_LABEL,
  TIPO_FLETE_LABEL,
  costoPorM3,
  porProveedor,
  porTransportista,
  type CandidatoFlete,
  type CuentaFletes,
  type Flete,
} from "@/lib/forestal/fletes";
import CtpFleteModal from "./CtpFleteModal";
import CtpFletesCandidatosBanner from "./CtpFletesCandidatosBanner";
import CtpCuentaCorriente from "./CtpCuentaCorriente";
import { Btn, IconAction, TablaSkeleton, VistaHeader } from "./ctp-shared";

type Pestaña = "viajes" | "transportistas" | "proveedores" | "cuenta";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Fecha date-only en UTC: sin esto, un viaje del día 1 se muestra el 31 en Lima. */
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });

export default function CtpFletesView({ period }: { period: CtpPeriod }) {
  const { fletes, candidatos, resumen, cargando, error, guardar, marcarPago, eliminar } = useFletesForestales(period);
  const [pestaña, setPestaña] = useState<Pestaña>("viajes");
  const [editando, setEditando] = useState<{ flete: Flete | null; prellenado?: CandidatoFlete | null } | null>(null);
  // Resto de un "Anotar las N" en curso: lo que falta después del que está
  // abierto ahora mismo. `colaInfo` guarda el total y el fletero para el "2 de 3".
  const [cola, setCola] = useState<CandidatoFlete[]>([]);
  const [colaInfo, setColaInfo] = useState<{ total: number; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cuentasTransportista = useMemo(() => porTransportista(fletes), [fletes]);
  const cuentasProveedor = useMemo(() => porProveedor(fletes), [fletes]);

  async function conBloqueo(id: string, fn: () => Promise<void>) {
    setOcupado(id);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
  }

  /** Abre el modal para UN viaje suelto — corta cualquier cola que hubiera quedado a medias. */
  function abrirIndividual(payload: { flete: Flete | null; prellenado?: CandidatoFlete | null }) {
    setColaInfo(null);
    setCola([]);
    setEditando(payload);
  }

  /** "Anotar las N": encadena el modal para cada guía del mismo fletero, una tras otra. */
  function anotarGrupo(items: CandidatoFlete[]) {
    if (items.length === 0) return;
    const [primero, ...resto] = items;
    setColaInfo({ total: items.length, nombre: primero.transportistaNombre ?? "Sin transportista" });
    setCola(resto);
    setEditando({ flete: null, prellenado: primero });
  }

  /** Se llama tras guardar CON ÉXITO cuando hay una cola activa: pasa a la
   *  siguiente guía o cierra si ya no queda ninguna. */
  function avanzarCola() {
    setCola((prev) => {
      if (prev.length === 0) {
        setEditando(null);
        setColaInfo(null);
        return prev;
      }
      const [siguiente, ...resto] = prev;
      setEditando({ flete: null, prellenado: siguiente });
      return resto;
    });
  }

  const progreso = colaInfo ? { actual: colaInfo.total - cola.length, total: colaInfo.total, grupo: colaInfo.nombre } : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          density="compact"
          label="Gasto del CTP"
          value={soles(resumen.gastoCtp)}
          subValue={`${resumen.viajesCtp} de ${resumen.viajes} viaje${resumen.viajes === 1 ? "" : "s"} salen de su caja`}
          icon={Coins}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Pendiente de pago"
          value={soles(resumen.pendiente)}
          subValue={resumen.pendiente > 0 ? "Deuda con transportistas" : "Todo saldado"}
          icon={Wallet}
          emphasis={resumen.pendiente > 0 ? "warning" : "success"}
        />
        <StatCard
          density="compact"
          label="Costo por m³"
          value={resumen.costoPorM3 == null ? "—" : soles(resumen.costoPorM3)}
          subValue={
            resumen.costoPorM3 == null
              ? "Falta monto o volumen"
              : `ponderado · ${Number(resumen.volumen).toFixed(4)} m³ movidos`
          }
          icon={Truck}
          emphasis="success"
        />
        <StatCard
          density="compact"
          label="Sin monto"
          value={String(resumen.sinMonto)}
          subValue={resumen.sinMonto > 0 ? "No entran en los promedios" : "Todos con precio cerrado"}
          icon={Coins}
          emphasis={resumen.sinMonto > 0 ? "warning" : "neutral"}
        />
      </div>

      <VistaHeader
        titulo="Fletes"
        meta={period.label}
        hint="El viaje que trae la madera y el que se lleva el producto. Un flete sin monto no vale 0: queda pendiente de cerrar."
      >
        <Btn size="sm" variant="primary" onClick={() => abrirIndividual({ flete: null })}>
          <Plus className="h-4 w-4" />
          Anotar viaje
        </Btn>
      </VistaHeader>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "viajes", label: "Viajes", n: fletes.length },
            { id: "transportistas", label: "Por transportista", n: cuentasTransportista.length },
            { id: "proveedores", label: "A cargo del proveedor", n: cuentasProveedor.length },
            { id: "cuenta", label: "Cuenta corriente", n: 0 },
          ] as { id: Pestaña; label: string; n: number }[]
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pestaña === p.id}
            onClick={() => setPestaña(p.id)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-bold transition-colors ${
              pestaña === p.id
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
            }`}
          >
            {p.label}
            {p.n > 0 && (
              <span className="rounded bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums">{p.n}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      <CtpFletesCandidatosBanner
        candidatos={candidatos}
        onAnotar={(c) => abrirIndividual({ flete: null, prellenado: c })}
        onAnotarGrupo={anotarGrupo}
      />

      {cargando ? (
        <TablaSkeleton />
      ) : pestaña === "cuenta" ? (
        <CtpCuentaCorriente fletes={fletes} />
      ) : pestaña === "viajes" ? (
        <ListaViajes
          fletes={fletes}
          ocupado={ocupado}
          onEditar={(f) => abrirIndividual({ flete: f })}
          onPago={(f) => void conBloqueo(f.id, () => marcarPago(f.id, f.estadoPago === "pagado" ? "pendiente" : "pagado"))}
          onBorrar={(f) => {
            if (!window.confirm(`¿Borrar el viaje del ${fecha(f.fecha)}? El gasto deja de contarse en el período.`)) return;
            void conBloqueo(f.id, () => eliminar(f.id));
          }}
        />
      ) : (
        <Cuentas
          cuentas={pestaña === "transportistas" ? cuentasTransportista : cuentasProveedor}
          vacio={
            pestaña === "transportistas"
              ? "Todavía no hay viajes anotados en el período."
              : "Ningún flete quedó a cargo de un proveedor en este período."
          }
          pieDePagina={
            pestaña === "proveedores"
              ? "Esto es lo que se le descuenta al liquidarle su madera."
              : "Lo pendiente es lo que falta pagarle."
          }
        />
      )}

      {editando && (
        <CtpFleteModal
          key={editando.flete?.id ?? editando.prellenado?.gtfNumber ?? "nuevo"}
          flete={editando.flete}
          prellenado={editando.prellenado}
          progreso={progreso}
          onGuardar={async (input) => {
            await guardar(input);
          }}
          onGuardado={colaInfo ? avanzarCola : undefined}
          onClose={() => {
            setEditando(null);
            setCola([]);
            setColaInfo(null);
          }}
        />
      )}
    </div>
  );
}

function ListaViajes({
  fletes,
  ocupado,
  onEditar,
  onPago,
  onBorrar,
}: {
  fletes: Flete[];
  ocupado: string | null;
  onEditar: (f: Flete) => void;
  onPago: (f: Flete) => void;
  onBorrar: (f: Flete) => void;
}) {
  if (fletes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
        Todavía no hay viajes anotados en el período. Anotá el primero cuando llegue el camión — el precio se puede cerrar después.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {fletes.map((f) => {
        const unitario = costoPorM3(f);
        const pagado = f.estadoPago === "pagado";
        return (
          <li
            key={f.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
          >
            <span className="w-16 shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {fecha(f.fecha)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                  {f.placa ? formatearPlaca(f.placa) : "sin placa"}
                </span>
                <span className="truncate text-sm text-[var(--text-secondary)]">
                  {f.transportistaNombre ?? "sin transportista"}
                </span>
                {f.gtfNumber && <span className="font-mono text-xs text-[var(--text-tertiary)]">GTF {f.gtfNumber}</span>}
              </div>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {[
                  TIPO_FLETE_LABEL[f.tipo],
                  f.volumenM3 != null ? `${Number(f.volumenM3).toFixed(4)} m³` : null,
                  unitario != null ? `${soles(unitario)}/m³` : null,
                  PAGADOR_LABEL[f.pagaQuien],
                  f.proveedorNombre,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="shrink-0 text-right">
              {f.monto == null ? (
                <span className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  sin monto
                </span>
              ) : (
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{soles(f.monto)}</span>
              )}
              <span
                className={`block text-xs font-bold ${
                  pagado
                    ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : "text-[var(--text-tertiary)]"
                }`}
              >
                {pagado ? "pagado" : "pendiente"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {ocupado === f.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
              ) : (
                <>
                  <IconAction
                    icon={Check}
                    label={pagado ? "Marcar como pendiente" : "Marcar como pagado"}
                    tone={pagado ? "muted" : "success"}
                    onClick={() => onPago(f)}
                  />
                  <IconAction icon={Pencil} label="Editar" tone="info" onClick={() => onEditar(f)} />
                  <IconAction icon={Trash2} label="Borrar" tone="danger" onClick={() => onBorrar(f)} />
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Cuentas({ cuentas, vacio, pieDePagina }: { cuentas: CuentaFletes[]; vacio: string; pieDePagina: string }) {
  if (cuentas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
        {vacio}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {cuentas.map((c) => (
          <li
            key={c.clave}
            className="flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
              <span className="block text-xs text-[var(--text-tertiary)]">
                {c.viajes} viaje{c.viajes === 1 ? "" : "s"}
                {c.sinMonto > 0 ? ` · ${c.sinMonto} sin monto cerrado` : ""}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{soles(c.total)}</span>
              {c.pendiente > 0 && (
                <span className="block text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {soles(c.pendiente)} pendiente
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--text-tertiary)]">{pieDePagina}</p>
    </div>
  );
}
