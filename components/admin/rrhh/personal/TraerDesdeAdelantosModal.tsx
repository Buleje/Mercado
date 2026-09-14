"use client";

/**
 * TraerDesdeAdelantosModal — «Estrenar RRHH con tu gente» (Brandon 2026-09-14).
 *
 * Medido en su negocio real: RRHH arranca en 0, pero Adelantos ya tiene 3
 * personas (2 sin documento ni celular). En vez de tipear todo de nuevo, se
 * eligen de una lista y se crean como `Colaborador` vinculados a su cuenta —
 * el enlace lo hace el servidor (`beneficiarioId`), nunca por nombre.
 *
 * Las de RUC de empresa arrancan SIN marcar (es plata que sale a una empresa,
 * no a una persona que trabaja) — se pueden tildar a mano si corresponde.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Loader2, UserPlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { LoadingState, EmptyState } from "@buleje/design-system";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { formatearPEN, pluralizar } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import FichaColaboradorModal from "./FichaColaboradorModal";
import type { NivelRrhh, ResultadoTraerDesdeAdelantosDTO } from "@/lib/rrhh/tipos";

interface Props {
  open: boolean;
  onClose: () => void;
  nivel: NivelRrhh;
  onCambio: () => void;
  aboveModals?: boolean;
}

/** `omitidos[].motivo` viaja como código (`ResultadoTraerDesdeAdelantosDTO`) — acá se traduce a criollo. */
const MOTIVO_OMITIDO_LABEL: Record<string, string> = {
  ya_vinculado: "ya está vinculada a otra persona de Recursos Humanos",
  documento_duplicado: "ya existe una persona con ese documento",
  no_encontrado: "ya no está en Adelantos",
  es_empresa: "es una empresa, no se trae como persona",
};

/** Salta a Asistencia › Día sin remontar el hub (mismo patrón que `FichaCuenta`/`ContratosDelPersonalView`). */
function irAAsistenciaDeHoy() {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "rrhh", vista: "asistencia" } }));
}

export default function TraerDesdeAdelantosModal({ open, onClose, nivel, onCambio, aboveModals }: Props) {
  const { candidatos, loading, error, traer } = useRrhhDesdeAdelantos();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const inicializadoRef = useRef(false);
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoTraerDesdeAdelantosDTO | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);

  // Las que NO son empresa arrancan marcadas — sólo una vez, cuando llegan los datos.
  useEffect(() => {
    if (inicializadoRef.current || candidatos.length === 0) return;
    inicializadoRef.current = true;
    setSeleccion(new Set(candidatos.filter((c) => !c.esEmpresa).map((c) => c.beneficiarioId)));
  }, [candidatos]);

  const toggle = (id: string) => {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const confirmarTraer = async () => {
    setEnviando(true);
    setErrorEnvio(null);
    const idsSeleccionados = [...seleccion];
    // Tildar la casilla de una empresa no alcanza: el servidor la omite con
    // `es_empresa` igual si su id no viaja TAMBIÉN en `incluirEmpresas`.
    const idsEmpresaSeleccionados = candidatos.filter((c) => c.esEmpresa && seleccion.has(c.beneficiarioId)).map((c) => c.beneficiarioId);
    const res = await traer(idsSeleccionados, fechaIngreso || undefined, idsEmpresaSeleccionados);
    setEnviando(false);
    if (!res.ok) {
      setErrorEnvio(res.error.message ?? "No se pudo traer a las personas");
      return;
    }
    setResultado(res);
    onCambio();
  };

  const cerrarTodo = () => {
    setResultado(null);
    onClose();
  };

  // `creados` es `ColaboradorDTO[]` completo — «falta» se deriva de sus
  // propios campos nulos, no de una bandera aparte del servidor.
  const conFaltantes = resultado?.creados.filter((c) => !c.documento || !c.celular) ?? [];

  return (
    <AdminModal
      open={open}
      onClose={cerrarTodo}
      title={resultado ? "Personas traídas" : "Traer de Adelantos"}
      icon={UserPlus}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        resultado ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={cerrarTodo} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cerrar</button>
            <button
              type="button"
              onClick={() => { irAAsistenciaDeHoy(); cerrarTodo(); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110"
            >
              <CalendarDays className="h-4 w-4" /> Marcar la asistencia de hoy
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cancelar</button>
            <button
              type="button"
              disabled={enviando || seleccion.size === 0}
              onClick={confirmarTraer}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Traer {seleccion.size} {seleccion.size === 1 ? "persona" : "personas"}
            </button>
          </div>
        )
      }
    >
      {resultado ? (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {pluralizar(resultado.creados.length, "persona creada", "personas creadas")}
          </p>

          {conFaltantes.length > 0 && (
            <div className="rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="h-3.5 w-3.5" /> Faltan datos de {pluralizar(conFaltantes.length, "persona", "personas")}
              </p>
              <ul className="mt-2 space-y-1.5">
                {conFaltantes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--text-primary)]">
                      {c.nombre}{" "}
                      <span className="text-xs text-[var(--text-tertiary)]">
                        (falta {[!c.documento && "documento", !c.celular && "celular"].filter(Boolean).join(" y ")})
                      </span>
                    </span>
                    <button type="button" onClick={() => setFichaAbierta(c.id)} className="shrink-0 text-xs font-bold text-primary hover:underline">
                      Completar datos
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultado.omitidos.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)]">No se trajeron ({resultado.omitidos.length})</p>
              <ul className="mt-1 space-y-1 text-xs text-[var(--text-tertiary)]">
                {resultado.omitidos.map((o) => (
                  <li key={o.beneficiarioId}>{o.nombre} — {MOTIVO_OMITIDO_LABEL[o.motivo] ?? o.motivo}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : loading ? (
        <LoadingState message="Buscando personas en Adelantos..." />
      ) : error ? (
        <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      ) : candidatos.length === 0 ? (
        <EmptyState icon={UserPlus} title="No hay nadie nuevo en Adelantos" description="Todas las personas de Adelantos ya están en Recursos Humanos, o Adelantos está vacío." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            De Adelantos, {pluralizar(candidatos.length, "persona", "personas")}. Las de RUC de empresa arrancan sin marcar.
          </p>
          <div>
            <label htmlFor="rrhh-desde-adelantos-ingreso" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Fecha de ingreso (opcional, para todas)</label>
            <input
              id="rrhh-desde-adelantos-ingreso"
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="h-10 w-48 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]"
            />
          </div>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {candidatos.map((c) => {
              const marcada = seleccion.has(c.beneficiarioId);
              return (
                <li key={c.beneficiarioId}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      marcada ? "border-primary bg-primary/5" : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                      marcada ? "border-primary bg-primary text-white" : "border-[var(--rule-base)]",
                    )}>
                      {marcada && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <input type="checkbox" className="sr-only" checked={marcada} onChange={() => toggle(c.beneficiarioId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{c.nombre}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {!c.documentoEnmascarado && <Chip texto="Sin documento" />}
                        {!c.tieneCelular && <Chip texto="Sin celular" />}
                        {c.esEmpresa && (
                          <span className="rounded-full bg-[var(--data-warning-500)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            Tiene RUC de empresa — ¿es una persona?
                          </span>
                        )}
                        {c.saldoAbierto > 0 && (
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{formatearPEN(c.saldoAbierto)} abiertos en Adelantos</span>
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {errorEnvio && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorEnvio}</p>}
        </div>
      )}

      {fichaAbierta && (
        <FichaColaboradorModal
          open
          colaboradorId={fichaAbierta}
          onClose={() => setFichaAbierta(null)}
          nivel={nivel}
          onCambio={onCambio}
        />
      )}
    </AdminModal>
  );
}

function Chip({ texto }: { texto: string }) {
  return (
    <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
      {texto}
    </span>
  );
}
