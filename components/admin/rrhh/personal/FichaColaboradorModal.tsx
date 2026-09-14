"use client";

/**
 * FichaColaboradorModal — cabecera + pestañas internas de UNA persona
 * (ADR-414 §6/§7). Cabecera SIEMPRE sale de la lectura fresca de la ficha,
 * nunca de la fila que abrió el modal (lección liquidar, ADR-413): cada
 * acción interna llama `recargar()` y además avisa `onCambio` para que la
 * lista de afuera también se refresque.
 */

import { useState } from "react";
import { Ban, Pencil, RefreshCw, RotateCcw, Trash2, User } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { LoadingState } from "@buleje/design-system";
import { useRrhhFicha } from "@/hooks/use-rrhh-ficha";
import { cn } from "@/lib/utils";
import { AvisoRrhh, BOTON, CLASE_CHIP } from "../rrhh-form";
import { COLABORADOR_ESTADO_META, etiquetaModalidad, formatearFecha, formatearPEN, iniciales } from "../rrhh-ui";
import ColaboradorFormModal from "./ColaboradorFormModal";
import CesarColaboradorModal from "./CesarColaboradorModal";
import FichaCambioEstado from "./FichaCambioEstado";
import FichaContratos from "./FichaContratos";
import FichaCuenta from "./FichaCuenta";
import FichaDatos from "./FichaDatos";
import FichaTarifas from "./FichaTarifas";
import FichaUsuarioPanel from "./FichaUsuarioPanel";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

type Seccion = "datos" | "tarifas" | "contratos" | "cuenta";

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradorId: string;
  nivel: NivelRrhh;
  onCambio?: () => void;
  /** Se abrió desde otro modal («Traer de Adelantos» → «Completar datos»). */
  aboveModals?: boolean;
}

export default function FichaColaboradorModal({ open, onClose, colaboradorId, nivel, onCambio, aboveModals }: Props) {
  const { ficha, loading, error, guardando, recargar, eliminar, guardarTarifa, quitarTarifa, accion } = useRrhhFicha(open ? colaboradorId : null);
  const { confirm } = useConfirm();
  const [seccion, setSeccion] = useState<Seccion>("datos");
  const [editando, setEditando] = useState(false);
  const [cesarAbierto, setCesarAbierto] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const puedeCompleto = nivel === "completo";
  // Cesar/Reingresar/cambiar_estado sólo piden RRHH_GESTION en el servidor
  // (`app/api/rrhh/colaboradores/[id]/route.ts`) — manager (gestion) también
  // puede, no sólo admin/owner (completo).
  const puedeGestionar = nivel === "gestion" || nivel === "completo";
  const avisar = () => {
    recargar();
    onCambio?.();
  };

  const c = ficha?.colaborador;

  const eliminarPersona = async () => {
    if (!c) return;
    const ok = await confirm({
      title: `¿Eliminar a ${c.nombre}?`,
      description: "Sus marcas y tarifas quedan fuera de toda vista. Se puede restaurar después.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    });
    if (!ok) return;
    setErrorEliminar(null);
    const res = await eliminar();
    // Antes se cerraba igual aunque el servidor dijera que no: parecía borrada y seguía ahí.
    if (!res.ok) {
      setErrorEliminar(res.error.message ?? "No se pudo eliminar a la persona.");
      return;
    }
    onCambio?.();
    onClose();
  };

  const tabs: { id: Seccion; label: string; n?: number }[] = ficha
    ? [
        { id: "datos", label: "Datos" },
        ...(puedeCompleto ? [{ id: "tarifas" as const, label: "Tarifas", n: ficha.tarifas?.length ?? 0 }] : []),
        { id: "contratos", label: "Contratos", n: ficha.contratos.length },
        ...(puedeCompleto ? [{ id: "cuenta" as const, label: "Cuenta y usuario" }] : []),
      ]
    : [];

  const meta = c ? COLABORADOR_ESTADO_META[c.estado] : null;
  const resumen = c
    ? [
        c.puesto?.nombre ?? "Sin puesto",
        c.fechaIngreso ? `desde el ${formatearFecha(c.fechaIngreso)}` : null,
        puedeCompleto && c.tarifaVigente ? `${formatearPEN(c.tarifaVigente.monto)} ${etiquetaModalidad(c.tarifaVigente.modalidad)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={c?.nombre ?? "Ficha"}
      icon={User}
      variant="info"
      aboveModals={aboveModals}
      footer={
        c ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {puedeCompleto ? (
              <button
                type="button"
                disabled={guardando}
                onClick={eliminarPersona}
                className={cn(BOTON.chicoFantasma, "text-[var(--data-error-700)] hover:text-[var(--data-error-700)] dark:text-[var(--data-error-500)] dark:hover:text-[var(--data-error-500)]")}
              >
                <Trash2 className="h-4 w-4" /> Eliminar persona
              </button>
            ) : (
              <span />
            )}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
              {errorEliminar && (
                <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {errorEliminar}
                </p>
              )}
              <button type="button" onClick={onClose} className={BOTON.secundario}>
                Cerrar
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className={cn(MODAL_BODY, "space-y-6")}>
        {loading && !ficha && <LoadingState message="Cargando la ficha..." />}
        {error && !ficha && (
          <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
            {error}
          </AvisoRrhh>
        )}

        {ficha && c && meta && (
          <>
            <header className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:flex-row sm:items-center sm:p-5">
              <span
                aria-hidden
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 font-display text-2xl text-[var(--accent-ink)] dark:text-[var(--accent)]"
              >
                {iniciales(c.nombre)}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(CLASE_CHIP, meta.claseChip)}>{meta.label}</span>
                  {c.apodo && <span className="text-sm text-[var(--text-secondary)]">«{c.apodo}»</span>}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{resumen}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditando(true)} className={BOTON.chico}>
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                {puedeGestionar && c.estado !== "CESADO" && (
                  <>
                    <button type="button" onClick={() => setCambiandoEstado((v) => !v)} aria-expanded={cambiandoEstado} className={BOTON.chico}>
                      <RefreshCw className="h-4 w-4" /> Cambiar estado
                    </button>
                    <button type="button" onClick={() => setCesarAbierto(true)} className={BOTON.chicoPeligro}>
                      <Ban className="h-4 w-4" /> Cesar
                    </button>
                  </>
                )}
                {puedeGestionar && c.estado === "CESADO" && (
                  <button type="button" onClick={() => setCesarAbierto(true)} className={BOTON.chicoPrimario}>
                    <RotateCcw className="h-4 w-4" /> Reingresar
                  </button>
                )}
              </div>
            </header>

            {cambiandoEstado && c.estado !== "CESADO" && (
              <FichaCambioEstado
                estadoActual={c.estado}
                guardando={guardando}
                accion={accion}
                onCancelar={() => setCambiandoEstado(false)}
                onListo={() => {
                  setCambiandoEstado(false);
                  avisar();
                }}
              />
            )}

            <div role="tablist" aria-label="Secciones de la ficha" className="flex gap-1 overflow-x-auto border-b border-[var(--rule-base)]">
              {tabs.map((t) => {
                const activa = seccion === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`rrhh-ficha-tab-${t.id}`}
                    aria-selected={activa}
                    aria-controls="rrhh-ficha-panel"
                    onClick={() => setSeccion(t.id)}
                    className={cn(
                      "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]",
                      activa ? "border-primary text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {t.label}
                    {t.n !== undefined && (
                      <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">{t.n}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" id="rrhh-ficha-panel" aria-labelledby={`rrhh-ficha-tab-${seccion}`}>
              {seccion === "datos" && <FichaDatos colaborador={c} mostrarTarifa={puedeCompleto} />}
              {seccion === "tarifas" && puedeCompleto && (
                <FichaTarifas tarifas={ficha.tarifas ?? []} guardando={guardando} onGuardar={guardarTarifa} onQuitar={quitarTarifa} onCambio={avisar} />
              )}
              {seccion === "contratos" && (
                <FichaContratos colaboradorId={colaboradorId} contratos={ficha.contratos} sugeridos={ficha.contratosSugeridos} onCambio={avisar} />
              )}
              {seccion === "cuenta" && puedeCompleto && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <FichaCuenta
                    vinculo={ficha.vinculo}
                    cuenta={ficha.cuenta ?? null}
                    guardando={guardando}
                    onVincular={(id) => accion({ action: "vincular_beneficiario", beneficiarioId: id })}
                    onCambio={avisar}
                  />
                  <FichaUsuarioPanel adminUser={ficha.vinculo.adminUser} guardando={guardando} accion={accion} onCambio={avisar} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editando && ficha && (
        <ColaboradorFormModal
          open={editando}
          onClose={() => setEditando(false)}
          nivel={nivel}
          colaboradorId={colaboradorId}
          initial={ficha.colaborador}
          aboveModals
          onGuardado={() => {
            setEditando(false);
            avisar();
          }}
        />
      )}
      {cesarAbierto && ficha && (
        <CesarColaboradorModal
          open={cesarAbierto}
          onClose={() => setCesarAbierto(false)}
          colaboradorId={colaboradorId}
          colaborador={ficha.colaborador}
          nivel={nivel}
          aboveModals
          onGuardado={() => {
            setCesarAbierto(false);
            avisar();
          }}
        />
      )}
    </AdminModal>
  );
}
