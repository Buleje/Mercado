"use client";

/**
 * ColaboradorFormModal — alta y edición de una persona (ADR-414 §1/§7).
 *
 * Alta: `POST /api/rrhh/colaboradores` (con tarifa inicial si nivel completo).
 * Edición: `PATCH .../[id]` con `action: "editar"` — sólo los campos que
 * cambiaron, no el objeto entero (ausente = mantener, ADR-412).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { crearColaborador } from "@/hooks/use-rrhh-colaboradores";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { esDniValido } from "@/lib/rrhh/documento";
import { etiquetaModalidad } from "../rrhh-ui";
import type { ColaboradorDTO, Modalidad, NivelRrhh, TipoDocumento } from "@/lib/rrhh/tipos";

interface Props {
  open: boolean;
  onClose: () => void;
  nivel: NivelRrhh;
  onGuardado: () => void;
  /** Presente = edición. */
  colaboradorId?: string;
  initial?: ColaboradorDTO;
  aboveModals?: boolean;
}

const input = "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]";
const label = "mb-1 block text-xs font-bold text-[var(--text-secondary)]";

export default function ColaboradorFormModal({ open, onClose, nivel, onGuardado, colaboradorId, initial, aboveModals }: Props) {
  const editando = Boolean(colaboradorId);
  const puedeCompleto = nivel === "completo";
  const { puestos, crear: crearPuesto } = useRrhhPuestos();

  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [apodo, setApodo] = useState(initial?.apodo ?? "");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | "">(initial?.tipoDocumento ?? "DNI");
  const [documento, setDocumento] = useState(initial?.documento ?? "");
  const [celular, setCelular] = useState(initial?.celular ?? "");
  const [direccion, setDireccion] = useState(initial?.direccion ?? "");
  const [contactoNombre, setContactoNombre] = useState(initial?.contactoEmergencia.nombre ?? "");
  const [contactoCelular, setContactoCelular] = useState(initial?.contactoEmergencia.celular ?? "");
  const [puestoId, setPuestoId] = useState(initial?.puesto?.id ?? "");
  const [fechaIngreso, setFechaIngreso] = useState(initial?.fechaIngreso ?? "");
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");
  const [nuevoPuesto, setNuevoPuesto] = useState("");
  const [creandoPuesto, setCreandoPuesto] = useState(false);

  const puestoElegido = useMemo(() => puestos.find((p) => p.id === puestoId), [puestos, puestoId]);
  const [tarifaModalidad, setTarifaModalidad] = useState<Exclude<Modalidad, "SIN_PAGO">>("DIA");
  const [tarifaMonto, setTarifaMonto] = useState("");
  // Prellenar la tarifa con la sugerida del puesto — sólo si la persona no tipeó nada todavía.
  useEffect(() => {
    if (editando || !puestoElegido?.tarifaSugerida || tarifaMonto) return;
    setTarifaModalidad(puestoElegido.tarifaSugerida.modalidad);
    setTarifaMonto(String(puestoElegido.tarifaSugerida.monto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestoElegido]);

  const [dniLoading, setDniLoading] = useState(false);
  const [dniMsg, setDniMsg] = useState("");
  const buscarDni = async () => {
    if (!esDniValido(documento)) return;
    setDniLoading(true);
    setDniMsg("");
    try {
      const res = await fetch(`/api/reniec/lookup?dni=${documento}`);
      const data = (await res.json()) as { nombreCompleto?: string; error?: string; _mock?: boolean };
      if (!res.ok || data.error) { setDniMsg(data.error ?? "No se pudo consultar"); return; }
      if (data.nombreCompleto) {
        setNombre(data.nombreCompleto);
        setDniMsg(data._mock ? "Dato de prueba" : "Nombre completado automáticamente");
      }
    } catch { setDniMsg("No se pudo consultar"); } finally { setDniLoading(false); }
  };

  const crearPuestoEnLinea = async () => {
    if (!nuevoPuesto.trim()) return;
    setCreandoPuesto(true);
    const res = await crearPuesto({ nombre: nuevoPuesto.trim() });
    setCreandoPuesto(false);
    if (res.ok) {
      setNuevoPuesto("");
      // El puesto recién creado aparece en `puestos` tras recargar el hook; se
      // selecciona por nombre porque el POST no devuelve el row acá.
      const encontrado = puestos.find((p) => p.nombre.toLowerCase() === nuevoPuesto.trim().toLowerCase());
      if (encontrado) setPuestoId(encontrado.id);
    } else {
      setError(res.error.message ?? "No se pudo crear el puesto");
    }
  };

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (nombre.trim().length < 2) { setError("El nombre es muy corto"); return; }
    setGuardando(true);
    setError(null);
    const campos = {
      nombre: nombre.trim(),
      apodo: apodo.trim() || null,
      tipoDocumento: tipoDocumento || null,
      documento: documento.trim() || null,
      celular: celular.trim() || null,
      direccion: direccion.trim() || null,
      contactoEmergenciaNombre: contactoNombre.trim() || null,
      contactoEmergenciaCelular: contactoCelular.trim() || null,
      puestoId: puestoId || null,
      fechaIngreso: fechaIngreso || null,
      observaciones: observaciones.trim() || null,
    };
    try {
      if (editando && colaboradorId) {
        const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "editar", ...campos }),
          credentials: "include",
        });
        if (!res.ok) {
          const e = (await res.json().catch(() => ({}))) as { error?: string; message?: string; colaboradorId?: string; nombre?: string };
          setError(e.error === "documento_duplicado" ? `Ya está registrado como ${e.nombre}.` : (e.message ?? "No se pudo guardar"));
          return;
        }
      } else {
        const tarifaInicial = puedeCompleto && tarifaMonto ? { modalidad: tarifaModalidad, monto: Number(tarifaMonto) } : null;
        const res = await crearColaborador({ ...campos, tarifaInicial });
        if (!res.ok) {
          setError(res.error.error === "documento_duplicado" ? `Ya está registrado como ${res.error.nombre}.` : (res.error.message ?? "No se pudo guardar"));
          return;
        }
      }
      onGuardado();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={editando ? "Editar persona" : "Agregar persona"}
      icon={UserPlus}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cancelar</button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || nombre.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} {editando ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="rrhh-nombre" className={label}>Nombre *</label>
          <input id="rrhh-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} placeholder="Como se le conoce" />
        </div>
        <div>
          <label htmlFor="rrhh-apodo" className={label}>Apodo</label>
          <input id="rrhh-apodo" value={apodo} onChange={(e) => setApodo(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="rrhh-puesto" className={label}>Puesto</label>
          <select id="rrhh-puesto" value={puestoId} onChange={(e) => setPuestoId(e.target.value)} className={input}>
            <option value="">Sin puesto</option>
            {puestos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="rrhh-puesto-nuevo" className={label}>…o crea un puesto nuevo</label>
            <input id="rrhh-puesto-nuevo" value={nuevoPuesto} onChange={(e) => setNuevoPuesto(e.target.value)} className={input} />
          </div>
          <button type="button" onClick={crearPuestoEnLinea} disabled={creandoPuesto || !nuevoPuesto.trim()} className="h-10 shrink-0 rounded-xl border border-[var(--rule-base)] px-3 text-xs font-bold disabled:opacity-50">
            {creandoPuesto ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
          </button>
        </div>

        <div>
          <label htmlFor="rrhh-documento" className={label}>Documento</label>
          <div className="flex gap-1.5">
            <label className="sr-only" htmlFor="rrhh-tipo-documento">Tipo de documento</label>
            <select id="rrhh-tipo-documento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)} className="h-10 w-24 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 text-xs">
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
              <option value="PASAPORTE">Pasaporte</option>
              <option value="OTRO">Otro</option>
            </select>
            <input id="rrhh-documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className={input} />
            {tipoDocumento === "DNI" && (
              <button type="button" onClick={buscarDni} disabled={!esDniValido(documento) || dniLoading} className="h-10 w-10 shrink-0 rounded-xl border border-[var(--rule-base)] disabled:opacity-40" title="Buscar en RENIEC">
                {dniLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <Search className="mx-auto h-4 w-4" />}
              </button>
            )}
          </div>
          {dniMsg && <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{dniMsg}</p>}
        </div>
        <div>
          <label htmlFor="rrhh-celular" className={label}>Celular</label>
          <input id="rrhh-celular" value={celular} onChange={(e) => setCelular(e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rrhh-direccion" className={label}>Dirección</label>
          <input id="rrhh-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="rrhh-contacto-nombre" className={label}>Contacto de emergencia</label>
          <input id="rrhh-contacto-nombre" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} className={input} placeholder="Nombre" />
        </div>
        <div>
          <label htmlFor="rrhh-contacto-celular" className={label}>Celular del contacto</label>
          <input id="rrhh-contacto-celular" value={contactoCelular} onChange={(e) => setContactoCelular(e.target.value)} className={input} placeholder="Celular" />
        </div>
        <div>
          <label htmlFor="rrhh-fecha-ingreso" className={label}>Fecha de ingreso</label>
          <input id="rrhh-fecha-ingreso" type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={input} />
        </div>

        {puedeCompleto && !editando && (
          <>
            <div>
              <label htmlFor="rrhh-tarifa-modalidad" className={label}>Tarifa inicial</label>
              <select id="rrhh-tarifa-modalidad" value={tarifaModalidad} onChange={(e) => setTarifaModalidad(e.target.value as Exclude<Modalidad, "SIN_PAGO">)} className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm">
                {(["HORA", "DIA", "SEMANA", "MES"] as const).map((m) => <option key={m} value={m}>{etiquetaModalidad(m)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rrhh-tarifa-monto" className={label}>Monto (S/)</label>
              <input id="rrhh-tarifa-monto" type="number" min={0} step="0.01" value={tarifaMonto} onChange={(e) => setTarifaMonto(e.target.value)} className={input} placeholder="0.00" />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="rrhh-observaciones" className={label}>Observaciones</label>
          <textarea id="rrhh-observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} maxLength={2000} className={`${input} h-auto py-2`} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </AdminModal>
  );
}
