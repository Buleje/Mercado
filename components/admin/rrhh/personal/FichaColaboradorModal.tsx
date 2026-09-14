"use client";

/**
 * FichaColaboradorModal — cabecera + pestañas internas de UNA persona
 * (ADR-414 §6/§7). Cabecera SIEMPRE sale de la lectura fresca de la ficha,
 * nunca de la fila que abrió el modal (lección liquidar, ADR-413): cada
 * acción interna llama `recargar()` y además avisa `onCambio` para que la
 * lista de afuera también se refresque.
 */

import { useState } from "react";
import { Ban, Loader2, Pencil, RefreshCw, RotateCcw, User } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { LoadingState } from "@buleje/design-system";
import { useRrhhFicha } from "@/hooks/use-rrhh-ficha";
import { COLABORADOR_ESTADO_META, formatearPEN } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import ColaboradorFormModal from "./ColaboradorFormModal";
import CesarColaboradorModal from "./CesarColaboradorModal";
import FichaTarifas from "./FichaTarifas";
import FichaContratos from "./FichaContratos";
import FichaCuenta from "./FichaCuenta";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

type Seccion = "datos" | "tarifas" | "contratos" | "cuenta";

/** Los 4 estados que se cambian por acá. CESADO sale por «Cesar»/«Reingresar», nunca por acá (el servidor tira `EstadoInvalidoError`). */
const ESTADOS_CAMBIABLES = ["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradorId: string;
  nivel: NivelRrhh;
  onCambio?: () => void;
}

export default function FichaColaboradorModal({ open, onClose, colaboradorId, nivel, onCambio }: Props) {
  const { ficha, loading, error, guardando, recargar, eliminar, guardarTarifa, quitarTarifa, accion } = useRrhhFicha(open ? colaboradorId : null);
  const { confirm } = useConfirm();
  const [seccion, setSeccion] = useState<Seccion>("datos");
  const [editando, setEditando] = useState(false);
  const [cesarAbierto, setCesarAbierto] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<(typeof ESTADOS_CAMBIABLES)[number]>("ACTIVO");
  const [sinPagoDesde, setSinPagoDesde] = useState("");
  const [conSinPago, setConSinPago] = useState(false);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [vinculandoUsuario, setVinculandoUsuario] = useState(false);
  const [usuariosPanel, setUsuariosPanel] = useState<{ id: string; username: string; role: string }[]>([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null);

  const puedeCompleto = nivel === "completo";
  // Cesar/Reingresar/cambiar_estado sólo piden RRHH_GESTION en el servidor
  // (`app/api/rrhh/colaboradores/[id]/route.ts`) — manager (gestion) también
  // puede, no sólo admin/owner (completo). Ocultarlas tras `puedeCompleto`
  // las volvía inalcanzables para manager sin motivo.
  const puedeGestionar = nivel === "gestion" || nivel === "completo";
  const avisar = () => { recargar(); onCambio?.(); };

  const abrirCambioEstado = () => {
    const disponible = ESTADOS_CAMBIABLES.find((e) => e !== ficha?.colaborador.estado) ?? "ACTIVO";
    setNuevoEstado(disponible);
    setConSinPago(false);
    setSinPagoDesde("");
    setErrorEstado(null);
    setCambiandoEstado(true);
  };

  const guardarCambioEstado = async () => {
    setErrorEstado(null);
    const res = await accion({
      action: "cambiar_estado",
      estado: nuevoEstado,
      sinPagoDesde: nuevoEstado === "SUSPENDIDO" && conSinPago && sinPagoDesde ? sinPagoDesde : undefined,
    });
    if (!res.ok) { setErrorEstado(res.error.message ?? "No se pudo cambiar el estado"); return; }
    setCambiandoEstado(false);
    avisar();
  };

  const abrirVincularUsuario = async () => {
    setVinculandoUsuario(true);
    setCargandoUsuarios(true);
    setErrorUsuarios(null);
    try {
      const res = await fetch("/api/admin-users", { credentials: "include" });
      // `/api/admin-users` exige rol admin (no owner) — un owner de nivel
      // completo puede llegar hasta acá y recibir 403. No es nuestra ruta
      // (backend), así que se explica en vez de mostrar un error crudo.
      if (res.status === 403) { setErrorUsuarios("Sólo un administrador puede vincular un usuario del panel."); return; }
      if (!res.ok) { setErrorUsuarios("No se pudo cargar la lista de usuarios."); return; }
      setUsuariosPanel((await res.json()) as { id: string; username: string; role: string }[]);
    } catch {
      setErrorUsuarios("No se pudo cargar la lista de usuarios.");
    } finally {
      setCargandoUsuarios(false);
    }
  };

  const vincularUsuario = async (adminUserId: string | null) => {
    const res = await accion({ action: "vincular_usuario", adminUserId });
    if (res.ok) { setVinculandoUsuario(false); avisar(); }
  };

  const tabs: { id: Seccion; label: string }[] = [
    { id: "datos", label: "Datos" },
    ...(puedeCompleto ? [{ id: "tarifas" as const, label: "Tarifas" }] : []),
    { id: "contratos", label: "Contratos" },
    ...(puedeCompleto ? [{ id: "cuenta" as const, label: "Cuenta" }] : []),
  ];

  return (
    <AdminModal open={open} onClose={onClose} title={ficha?.colaborador.nombre ?? "Ficha"} icon={User} variant="info">
      {loading && <LoadingState message="Cargando la ficha..." />}
      {error && !loading && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}

      {ficha && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", COLABORADOR_ESTADO_META[ficha.colaborador.estado].claseChip)}>
                {COLABORADOR_ESTADO_META[ficha.colaborador.estado].label}
              </span>
              {ficha.colaborador.puesto && <span className="text-sm text-[var(--text-secondary)]">{ficha.colaborador.puesto.nombre}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
              {puedeGestionar && ficha.colaborador.estado !== "CESADO" && (
                <button type="button" onClick={abrirCambioEstado} className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]">
                  <RefreshCw className="h-3.5 w-3.5" /> Cambiar estado
                </button>
              )}
              {puedeGestionar && ficha.colaborador.estado !== "CESADO" && (
                <button type="button" onClick={() => setCesarAbierto(true)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/5">
                  <Ban className="h-3.5 w-3.5" /> Cesar
                </button>
              )}
              {puedeGestionar && ficha.colaborador.estado === "CESADO" && (
                <button type="button" onClick={() => setCesarAbierto(true)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  <RotateCcw className="h-3.5 w-3.5" /> Reingresar
                </button>
              )}
            </div>
          </div>

          {cambiandoEstado && (
            <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="rrhh-nuevo-estado" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Nuevo estado</label>
                  <select
                    id="rrhh-nuevo-estado"
                    value={nuevoEstado}
                    onChange={(e) => setNuevoEstado(e.target.value as (typeof ESTADOS_CAMBIABLES)[number])}
                    className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
                  >
                    {ESTADOS_CAMBIABLES.filter((e) => e !== ficha.colaborador.estado).map((e) => (
                      <option key={e} value={e}>{COLABORADOR_ESTADO_META[e].label}</option>
                    ))}
                  </select>
                </div>
                <button type="button" disabled={guardando} onClick={guardarCambioEstado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
                </button>
                <button type="button" onClick={() => setCambiandoEstado(false)} className="text-xs font-semibold text-[var(--text-tertiary)]">Cancelar</button>
              </div>
              {nuevoEstado === "SUSPENDIDO" && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={conSinPago} onChange={(e) => setConSinPago(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)]" />
                    Sin goce de sueldo desde
                  </label>
                  {conSinPago && (
                    <input
                      type="date"
                      aria-label="Sin pago desde"
                      value={sinPagoDesde}
                      onChange={(e) => setSinPagoDesde(e.target.value)}
                      className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
                    />
                  )}
                </div>
              )}
              {errorEstado && <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorEstado}</p>}
            </div>
          )}

          <div className="flex gap-1 border-b border-[var(--rule-base)]">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSeccion(t.id)}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                  seccion === t.id ? "border-primary text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-transparent text-[var(--text-secondary)]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {seccion === "datos" && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Dato k="Apodo" v={ficha.colaborador.apodo} />
              <Dato k="Documento" v={ficha.colaborador.documento ? `${ficha.colaborador.tipoDocumento ?? ""} ${ficha.colaborador.documento}` : null} />
              <Dato k="Celular" v={ficha.colaborador.celular} />
              <Dato k="Dirección" v={ficha.colaborador.direccion} />
              <Dato k="Contacto de emergencia" v={ficha.colaborador.contactoEmergencia.nombre ? `${ficha.colaborador.contactoEmergencia.nombre} · ${ficha.colaborador.contactoEmergencia.celular ?? "sin celular"}` : null} />
              <Dato k="Ingreso" v={ficha.colaborador.fechaIngreso} />
              {ficha.colaborador.fechaCese && <Dato k="Cese" v={`${ficha.colaborador.fechaCese}${ficha.colaborador.motivoCese ? ` — ${ficha.colaborador.motivoCese}` : ""}`} />}
              <Dato k="Observaciones" v={ficha.colaborador.observaciones} full />
              {puedeCompleto && (
                <Dato
                  k="Tarifa vigente"
                  v={ficha.colaborador.tarifaVigente ? `${formatearPEN(ficha.colaborador.tarifaVigente.monto)} (${ficha.colaborador.tarifaVigente.modalidad.toLowerCase()})` : "Sin tarifa"}
                />
              )}
            </dl>
          )}

          {seccion === "tarifas" && puedeCompleto && (
            <FichaTarifas tarifas={ficha.tarifas ?? []} guardando={guardando} onGuardar={guardarTarifa} onQuitar={quitarTarifa} onCambio={avisar} />
          )}
          {seccion === "contratos" && (
            <FichaContratos colaboradorId={colaboradorId} contratos={ficha.contratos} sugeridos={ficha.contratosSugeridos} onCambio={avisar} />
          )}
          {seccion === "cuenta" && puedeCompleto && (
            <div className="space-y-4">
              <FichaCuenta vinculo={ficha.vinculo} cuenta={ficha.cuenta ?? null} guardando={guardando} onVincular={(id) => accion({ action: "vincular_beneficiario", beneficiarioId: id })} onCambio={avisar} />

              <div className="border-t border-[var(--rule-soft)] pt-3">
                <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Usuario del panel</p>
                {ficha.vinculo.adminUser ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--text-primary)]">{ficha.vinculo.adminUser.username} <span className="text-[var(--text-tertiary)]">· {ficha.vinculo.adminUser.role}</span></span>
                    <button type="button" disabled={guardando} onClick={() => vincularUsuario(null)} className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]">Desvincular</button>
                  </div>
                ) : !vinculandoUsuario ? (
                  <button type="button" onClick={abrirVincularUsuario} className="text-xs font-bold text-primary hover:underline">
                    Vincular a un usuario del panel (el cajero que además es empleado)
                  </button>
                ) : errorUsuarios ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-[var(--text-tertiary)]">{errorUsuarios}</p>
                    <button type="button" onClick={() => setVinculandoUsuario(false)} className="text-xs font-semibold text-[var(--text-tertiary)]">Cerrar</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {cargandoUsuarios ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : (
                      <label>
                        <span className="sr-only">Elegir usuario del panel</span>
                        <select
                          disabled={guardando}
                          defaultValue=""
                          onChange={(e) => { if (e.target.value) vincularUsuario(e.target.value); }}
                          className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
                        >
                          <option value="" disabled>Elegir…</option>
                          {usuariosPanel.map((u) => <option key={u.id} value={u.id}>{u.username} · {u.role}</option>)}
                        </select>
                      </label>
                    )}
                    <button type="button" onClick={() => setVinculandoUsuario(false)} className="text-xs font-semibold text-[var(--text-tertiary)]">Cancelar</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {puedeCompleto && (
            <div className="border-t border-[var(--rule-soft)] pt-3">
              <button
                type="button"
                disabled={guardando}
                onClick={async () => {
                  const ok = await confirm({
                    title: `¿Eliminar a ${ficha.colaborador.nombre}?`,
                    description: "Sus marcas y tarifas quedan fuera de toda vista. Se puede restaurar después.",
                    intent: "danger",
                    confirmLabel: "Sí, eliminar",
                  });
                  if (!ok) return;
                  await eliminar();
                  avisar();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
              >
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Eliminar persona
              </button>
            </div>
          )}
        </div>
      )}

      {editando && ficha && (
        <ColaboradorFormModal
          open={editando}
          onClose={() => setEditando(false)}
          nivel={nivel}
          colaboradorId={colaboradorId}
          initial={ficha.colaborador}
          aboveModals
          onGuardado={() => { setEditando(false); avisar(); }}
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
          onGuardado={() => { setCesarAbierto(false); avisar(); }}
        />
      )}
    </AdminModal>
  );
}

function Dato({ k, v, full }: { k: string; v: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{k}</dt>
      <dd className="text-[var(--text-primary)]">{v || <span className="text-[var(--text-tertiary)]">—</span>}</dd>
    </div>
  );
}
