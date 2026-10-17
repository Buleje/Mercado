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
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { LoadingState, EmptyState } from "@buleje/design-system";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { AvisoRrhh, BOTON, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
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

  const todasMarcadas = candidatos.length > 0 && seleccion.size === candidatos.length;
  const alternarTodas = () => setSeleccion(todasMarcadas ? new Set() : new Set(candidatos.map((c) => c.beneficiarioId)));

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
      setErrorEnvio(res.error.message ?? "No se pudo traer a las personas.");
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
  const hayLista = !resultado && !loading && !error && candidatos.length > 0;

  return (
    <AdminModal
      open={open}
      onClose={cerrarTodo}
      title={resultado ? "Personas traídas" : "Traer de Adelantos"}
      description={resultado ? undefined : "Crea en Recursos Humanos a quienes ya tienen cuenta en Adelantos."}
      icon={UserPlus}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        resultado ? (
          <ModalFooter>
            <button type="button" onClick={cerrarTodo} className={BOTON.fantasma}>
              Cerrar
            </button>
            <button type="button" onClick={() => { irAAsistenciaDeHoy(); cerrarTodo(); }} className={BOTON.primario}>
              <CalendarDays className="h-4 w-4" /> Marcar la asistencia de hoy
            </button>
          </ModalFooter>
        ) : (
          <ModalFooter error={errorEnvio} nota={hayLista ? `${seleccion.size} de ${candidatos.length} marcadas` : undefined}>
            <button type="button" onClick={cerrarTodo} className={BOTON.fantasma}>
              Cancelar
            </button>
            {hayLista && (
              <button type="button" disabled={enviando || seleccion.size === 0} onClick={confirmarTraer} className={BOTON.primario}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Traer {pluralizar(seleccion.size, "persona", "personas")}
              </button>
            )}
          </ModalFooter>
        )
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        {resultado ? (
          <>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">{pluralizar(resultado.creados.length, "persona creada", "personas creadas")}</p>
                <p className="text-sm text-[var(--text-tertiary)]">Ya aparecen en Personal, vinculadas a su cuenta de Adelantos.</p>
              </div>
            </div>

            {conFaltantes.length > 0 && (
              <AvisoRrhh tono="aviso" icono={AlertTriangle}>
                <p className="font-semibold">Faltan datos de {pluralizar(conFaltantes.length, "persona", "personas")}</p>
                <ul className="mt-2 space-y-2">
                  {conFaltantes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[var(--text-primary)]">
                        {c.nombre}{" "}
                        <span className="text-xs text-[var(--text-tertiary)]">
                          (falta {[!c.documento && "documento", !c.celular && "celular"].filter(Boolean).join(" y ")})
                        </span>
                      </span>
                      <button type="button" onClick={() => setFichaAbierta(c.id)} className={BOTON.chico}>
                        Completar datos
                      </button>
                    </li>
                  ))}
                </ul>
              </AvisoRrhh>
            )}

            {resultado.omitidos.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">No se trajeron ({resultado.omitidos.length})</p>
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-tertiary)]">
                  {resultado.omitidos.map((o) => (
                    <li key={o.beneficiarioId}>
                      <span className="text-[var(--text-primary)]">{o.nombre}</span> — {MOTIVO_OMITIDO_LABEL[o.motivo] ?? o.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : loading ? (
          <LoadingState message="Buscando personas en Adelantos..." />
        ) : error ? (
          <AvisoRrhh tono="error">{error}</AvisoRrhh>
        ) : candidatos.length === 0 ? (
          <EmptyState icon={UserPlus} title="No hay nadie nuevo en Adelantos" description="Todas las personas de Adelantos ya están en Recursos Humanos, o Adelantos está vacío." />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Field label="Fecha de ingreso para todas" hint="Opcional. Cada una se puede cambiar después." className="w-full sm:w-64">
                {(id) => <input id={id} type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={CLASE_CAMPO} />}
              </Field>
              <button type="button" onClick={alternarTodas} className={BOTON.chicoFantasma}>
                {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>

            <ul className="space-y-2" aria-label="Personas de Adelantos">
              {candidatos.map((c) => {
                const marcada = seleccion.has(c.beneficiarioId);
                return (
                  <li key={c.beneficiarioId}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--accent)]",
                        marcada ? "border-primary bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          marcada ? "border-primary bg-primary text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
                        )}
                      >
                        {marcada && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <input type="checkbox" className="sr-only" checked={marcada} onChange={() => toggle(c.beneficiarioId)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--text-primary)]">{c.nombre}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {!c.documentoEnmascarado && <span className={cn(CLASE_CHIP, "bg-[var(--surface-sunken)] font-semibold text-[var(--text-secondary)]")}>Sin documento</span>}
                          {!c.tieneCelular && <span className={cn(CLASE_CHIP, "bg-[var(--surface-sunken)] font-semibold text-[var(--text-secondary)]")}>Sin celular</span>}
                          {c.esEmpresa && (
                            <span className={cn(CLASE_CHIP, "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
                              Tiene RUC de empresa: ¿es una persona?
                            </span>
                          )}
                        </span>
                      </span>
                      {c.saldoAbierto > 0 && (
                        <span className="shrink-0 text-right text-xs text-[var(--text-tertiary)]">
                          <span className="block text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatearPEN(c.saldoAbierto)}</span>
                          abiertos
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {fichaAbierta && (
        <FichaColaboradorModal open colaboradorId={fichaAbierta} onClose={() => setFichaAbierta(null)} nivel={nivel} onCambio={onCambio} aboveModals />
      )}
    </AdminModal>
  );
}
