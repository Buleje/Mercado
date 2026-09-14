"use client";

/**
 * ColaboradorFormModal — alta y edición de una persona (ADR-414 §1/§7).
 *
 * Alta: `POST /api/rrhh/colaboradores` (con tarifa inicial si nivel completo).
 * Edición: `PATCH .../[id]` con `action: "editar"` (ausente = mantener, ADR-412).
 *
 * Tres bloques —quién es, contacto, trabajo— en lugar de trece campos
 * seguidos pegados al borde (Brandon 2026-09-14: «muy apegados y mal
 * distribuidos»). El documento va primero: con un DNI, la lupa de RENIEC
 * completa el nombre.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, Pencil, Plus, Search, UserPlus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { crearColaborador } from "@/hooks/use-rrhh-colaboradores";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { esDniValido } from "@/lib/rrhh/documento";
import { cn, limaDateKey } from "@/lib/utils";
import { BOTON, CLASE_AREA, CLASE_CAMPO, SeccionForm } from "../rrhh-form";
import { etiquetaModalidad, formatearPEN } from "../rrhh-ui";
import type { ColaboradorDTO, Modalidad, NivelRrhh, PuestoDTO, TipoDocumento } from "@/lib/rrhh/tipos";

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

const FORM_ID = "rrhh-form-colaborador";
type ModalidadPagada = Exclude<Modalidad, "SIN_PAGO">;
const MODALIDADES: ModalidadPagada[] = ["HORA", "DIA", "SEMANA", "MES"];

export default function ColaboradorFormModal({ open, onClose, nivel, onGuardado, colaboradorId, initial, aboveModals }: Props) {
  const editando = Boolean(colaboradorId);
  const conTarifaInicial = nivel === "completo" && !editando;
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Puesto, con alta en línea ─────────────────────────────────────────────
  const [puestoRecien, setPuestoRecien] = useState<PuestoDTO | null>(null);
  const [nuevoPuestoAbierto, setNuevoPuestoAbierto] = useState(false);
  const [nuevoPuesto, setNuevoPuesto] = useState("");
  const [creandoPuesto, setCreandoPuesto] = useState(false);
  const nuevoPuestoRef = useRef<HTMLInputElement>(null);
  // El puesto recién creado llega en la recarga de la lista un momento
  // después: se ofrece igual para que el select no vuelva a «Sin puesto».
  const opcionesPuesto = useMemo(
    () => (puestoRecien && !puestos.some((p) => p.id === puestoRecien.id) ? [...puestos, puestoRecien] : puestos),
    [puestos, puestoRecien],
  );
  const puestoElegido = useMemo(() => opcionesPuesto.find((p) => p.id === puestoId), [opcionesPuesto, puestoId]);

  useEffect(() => {
    if (nuevoPuestoAbierto) nuevoPuestoRef.current?.focus();
  }, [nuevoPuestoAbierto]);

  // ── Tarifa inicial: la sugiere el puesto mientras nadie la toque ──────────
  const [tarifaModalidad, setTarifaModalidad] = useState<ModalidadPagada>("DIA");
  const [tarifaMonto, setTarifaMonto] = useState("");
  const [tarifaTocada, setTarifaTocada] = useState(false);
  const [tarifaHoras, setTarifaHoras] = useState("8");
  useEffect(() => {
    // Antes sólo prellenaba con el monto vacío: elegir un puesto y después
    // otro dejaba la tarifa del primero.
    if (!conTarifaInicial || tarifaTocada) return;
    // La jornada sale del puesto (8 h por defecto en la base), tenga o no tarifa sugerida.
    if (puestoElegido) setTarifaHoras(String(puestoElegido.horasJornada));
    if (!puestoElegido?.tarifaSugerida) {
      setTarifaMonto("");
      return;
    }
    setTarifaModalidad(puestoElegido.tarifaSugerida.modalidad);
    setTarifaMonto(String(puestoElegido.tarifaSugerida.monto));
  }, [conTarifaInicial, tarifaTocada, puestoElegido]);

  // ── RENIEC ────────────────────────────────────────────────────────────────
  const [dni, setDni] = useState<{ cargando: boolean; msg: string; esError: boolean }>({ cargando: false, msg: "", esError: false });
  const dniListo = tipoDocumento === "DNI" && esDniValido(documento);

  const buscarDni = async () => {
    if (!dniListo) return;
    setDni({ cargando: true, msg: "", esError: false });
    try {
      const res = await fetch(`/api/reniec/lookup?dni=${encodeURIComponent(documento.trim())}`);
      const data = (await res.json().catch(() => ({}))) as { nombreCompleto?: string; error?: string; _mock?: boolean };
      if (!res.ok || data.error || !data.nombreCompleto) {
        setDni({ cargando: false, msg: data.error ?? "RENIEC no devolvió un nombre para ese DNI.", esError: true });
        return;
      }
      setNombre(data.nombreCompleto);
      setDni({ cargando: false, msg: data._mock ? "Nombre de prueba: RENIEC no está conectado." : "Nombre traído de RENIEC.", esError: false });
    } catch {
      setDni({ cargando: false, msg: "No se pudo consultar RENIEC. Escribe el nombre a mano.", esError: true });
    }
  };

  const crearPuestoEnLinea = async () => {
    const nombrePuesto = nuevoPuesto.trim();
    if (nombrePuesto.length < 2 || creandoPuesto) return;
    setCreandoPuesto(true);
    setError(null);
    const res = await crearPuesto({ nombre: nombrePuesto });
    setCreandoPuesto(false);
    if (!res.ok) {
      setError(
        res.error.error === "nombre_duplicado"
          ? `Ya existe el puesto «${nombrePuesto}»: elígelo en la lista.`
          : (res.error.message ?? "No se pudo crear el puesto."),
      );
      return;
    }
    // Antes se buscaba el puesto nuevo en la lista vieja (la de antes de
    // recargar) y nunca se encontraba: quedaba creado pero sin elegir.
    if (res.puesto) {
      setPuestoRecien(res.puesto);
      setPuestoId(res.puesto.id);
    }
    setNuevoPuesto("");
    setNuevoPuestoAbierto(false);
  };

  const teclaPuestoNuevo = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter crea el puesto, no manda el formulario entero.
    if (e.key !== "Enter") return;
    e.preventDefault();
    void crearPuestoEnLinea();
  };

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (guardando) return;
    if (nombre.trim().length < 2) {
      setError("Escribe el nombre (mínimo 2 letras).");
      return;
    }
    if (tipoDocumento === "DNI" && documento.trim() && !esDniValido(documento)) {
      setError("El DNI tiene 8 dígitos: revisa el número.");
      return;
    }
    const montoNum = Number(tarifaMonto);
    if (conTarifaInicial && tarifaMonto && !(montoNum > 0)) {
      setError("El monto de la tarifa tiene que ser mayor a 0.");
      return;
    }
    const horasNum = Number(tarifaHoras);
    if (conTarifaInicial && tarifaMonto && tarifaModalidad === "HORA" && !(horasNum > 0 && horasNum <= 24)) {
      setError("La jornada tiene que ser de más de 0 y hasta 24 horas.");
      return;
    }
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
          const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string; nombre?: string };
          setError(err.error === "documento_duplicado" ? `Ese documento ya es de ${err.nombre}.` : (err.message ?? "No se pudo guardar."));
          return;
        }
      } else {
        // Dos fallas medidas el 2026-09-14: sin `vigenteDesde` el servidor respondía 422 y
        // agregar a alguien con monto nunca guardaba; y la clave presente (aunque sea `null`)
        // con un nivel que no es completo es 403 `tarifa_requiere_admin` — un manager no
        // podía agregar a nadie. La tarifa vale desde el ingreso, o desde hoy si no se sabe.
        const tarifaInicial = tarifaMonto
          ? {
              modalidad: tarifaModalidad,
              monto: montoNum,
              vigenteDesde: fechaIngreso || limaDateKey(),
              ...(tarifaModalidad === "HORA" ? { horasJornada: horasNum } : {}),
            }
          : null;
        const res = await crearColaborador({ ...campos, ...(conTarifaInicial ? { tarifaInicial } : {}) });
        if (!res.ok) {
          setError(res.error.error === "documento_duplicado" ? `Ese documento ya es de ${res.error.nombre}.` : (res.error.message ?? "No se pudo guardar."));
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
      description={editando ? initial?.nombre : "Lo único obligatorio es el nombre; el resto se completa cuando quieras."}
      icon={editando ? Pencil : UserPlus}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Guardar cambios" : "Agregar persona"}
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={guardar} noValidate className={cn(MODAL_BODY, "space-y-8")}>
        <SeccionForm titulo="Quién es">
          <Field
            label="Documento"
            className="sm:col-span-2"
            error={dni.esError ? dni.msg : undefined}
            hint={!dni.esError && dni.msg ? dni.msg : tipoDocumento === "DNI" ? "Con los 8 dígitos, el botón RENIEC trae el nombre." : undefined}
          >
            {(id) => (
              <div className="flex gap-2">
                <select
                  aria-label="Tipo de documento"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                  className={cn(CLASE_CAMPO, "w-28 shrink-0 sm:w-32")}
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="OTRO">Otro</option>
                </select>
                <input
                  id={id}
                  value={documento}
                  onChange={(e) => {
                    setDocumento(e.target.value);
                    if (dni.msg) setDni({ cargando: false, msg: "", esError: false });
                  }}
                  inputMode={tipoDocumento === "DNI" ? "numeric" : "text"}
                  maxLength={tipoDocumento === "DNI" ? 8 : 20}
                  autoComplete="off"
                  placeholder={tipoDocumento === "DNI" ? "8 dígitos" : undefined}
                  className={cn(CLASE_CAMPO, "tabular-nums")}
                />
                {tipoDocumento === "DNI" && (
                  <button
                    type="button"
                    onClick={buscarDni}
                    disabled={!dniListo || dni.cargando}
                    className={BOTON.secundario}
                    aria-label="Traer el nombre de RENIEC"
                  >
                    {dni.cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="hidden sm:inline">RENIEC</span>
                  </button>
                )}
              </div>
            )}
          </Field>
          <Field label="Nombre y apellidos" required>
            {(id) => (
              <input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoComplete="off" className={CLASE_CAMPO} placeholder="Ej. María Torres Ramírez" />
            )}
          </Field>
          <Field label="Apodo" hint="Cómo le dicen en el trabajo.">
            {(id) => (
              <input id={id} value={apodo} onChange={(e) => setApodo(e.target.value)} maxLength={40} autoComplete="off" className={CLASE_CAMPO} placeholder="Ej. Mari" />
            )}
          </Field>
        </SeccionForm>

        <SeccionForm titulo="Contacto">
          <Field label="Celular">
            {(id) => (
              <input id={id} type="tel" inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} maxLength={20} autoComplete="off" className={CLASE_CAMPO} placeholder="Ej. 987 654 321" />
            )}
          </Field>
          <Field label="Dirección">
            {(id) => (
              <input id={id} value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={300} autoComplete="off" className={CLASE_CAMPO} placeholder="Jr., Av., caserío…" />
            )}
          </Field>
          <Field label="Contacto de emergencia">
            {(id) => (
              <input id={id} value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} maxLength={120} autoComplete="off" className={CLASE_CAMPO} placeholder="Nombre y parentesco" />
            )}
          </Field>
          <Field label="Celular del contacto">
            {(id) => (
              <input id={id} type="tel" inputMode="tel" value={contactoCelular} onChange={(e) => setContactoCelular(e.target.value)} maxLength={20} autoComplete="off" className={CLASE_CAMPO} />
            )}
          </Field>
        </SeccionForm>

        <SeccionForm titulo="Trabajo">
          <Field
            label="Puesto"
            hint={
              conTarifaInicial && puestoElegido?.tarifaSugerida
                ? `Sugiere ${formatearPEN(puestoElegido.tarifaSugerida.monto)} ${etiquetaModalidad(puestoElegido.tarifaSugerida.modalidad)}.`
                : undefined
            }
          >
            {(id) => (
              <div className="space-y-2">
                <select id={id} value={puestoId} onChange={(e) => setPuestoId(e.target.value)} className={CLASE_CAMPO}>
                  <option value="">Sin puesto</option>
                  {opcionesPuesto.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                {nuevoPuestoAbierto ? (
                  <div className="flex gap-2">
                    <input
                      ref={nuevoPuestoRef}
                      aria-label="Nombre del puesto nuevo"
                      value={nuevoPuesto}
                      onChange={(e) => setNuevoPuesto(e.target.value)}
                      onKeyDown={teclaPuestoNuevo}
                      maxLength={80}
                      autoComplete="off"
                      placeholder="Ej. Motosierrista"
                      className={CLASE_CAMPO}
                    />
                    <button type="button" onClick={crearPuestoEnLinea} disabled={creandoPuesto || nuevoPuesto.trim().length < 2} className={BOTON.secundario}>
                      {creandoPuesto ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setNuevoPuestoAbierto(true)} className={cn(BOTON.chicoFantasma, "-ml-2 text-[var(--accent-ink)] dark:text-[var(--accent)]")}>
                    <Plus className="h-4 w-4" /> Crear un puesto nuevo
                  </button>
                )}
              </div>
            )}
          </Field>
          <Field label="Fecha de ingreso" hint="Desde cuándo trabaja contigo.">
            {(id) => <input id={id} type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={CLASE_CAMPO} />}
          </Field>

          {conTarifaInicial && (
            <>
              <Field label="Se le paga">
                {(id) => (
                  <select
                    id={id}
                    value={tarifaModalidad}
                    onChange={(e) => {
                      setTarifaModalidad(e.target.value as ModalidadPagada);
                      setTarifaTocada(true);
                    }}
                    className={CLASE_CAMPO}
                  >
                    {MODALIDADES.map((m) => (
                      <option key={m} value={m}>
                        {etiquetaModalidad(m)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Monto (S/)" hint="Opcional. Se cambia después desde la ficha.">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={tarifaMonto}
                    onChange={(e) => {
                      setTarifaMonto(e.target.value);
                      setTarifaTocada(true);
                    }}
                    placeholder="0.00"
                    className={cn(CLASE_CAMPO, "tabular-nums")}
                  />
                )}
              </Field>
              {tarifaModalidad === "HORA" && (
                <Field label="Horas de la jornada" hint="Para estimar las horas de los días sin entrada ni salida.">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={24}
                      step="0.5"
                      value={tarifaHoras}
                      onChange={(e) => {
                        setTarifaHoras(e.target.value);
                        setTarifaTocada(true);
                      }}
                      className={cn(CLASE_CAMPO, "tabular-nums")}
                    />
                  )}
                </Field>
              )}
            </>
          )}

          <Field label="Observaciones" className="sm:col-span-2">
            {(id) => (
              <textarea
                id={id}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Algo que convenga saber (opcional)."
                className={CLASE_AREA}
              />
            )}
          </Field>
        </SeccionForm>
      </form>
    </AdminModal>
  );
}
