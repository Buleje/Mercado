"use client";

/**
 * Alta y edición de una persona.
 *
 * El documento manda: al completar 8 dígitos se consulta RENIEC y al completar
 * 11 se consulta SUNAT, sin botón ni selector previo — quien atiende escribe el
 * número que le dictaron, no elige un padrón. De ahí bajan el nombre (o la
 * razón social), la dirección y el ubigeo, cada uno a su campo.
 *
 * Va en dos columnas y no en una tira porque son catorce campos: en una sola
 * columna había que scrollear tres pantallas para llegar al botón de guardar.
 *
 * Los avisos —documento imposible, persona repetida, RUC no habido— avisan y no
 * bloquean: en el mostrador puede haber un caso raro, y frenar la carga es peor
 * que un dato imperfecto.
 */

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle, Info, Loader2, RefreshCw, User } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { avisoDeSunat, normalizarNumero, type ResultadoDocumento } from "@/lib/documento/tipos";
import {
  avisoDeDuplicado,
  buscarDuplicado,
  revisarDocumento,
  revisarTelefono,
} from "@/lib/adelantos/persona-validacion";
import { useLookupDocumento } from "@/hooks/use-lookup-documento";
import { Field, ModalActions, ModalShell, inputCls } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

/** Los bancos donde de verdad se cobra un adelanto en Perú. */
const BANCOS = ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Caja Huancayo", "Mibanco", "Yape", "Plin", "Otro"];

type Hallado = Extract<ResultadoDocumento, { encontrado: true }>;

export default function CrearPersonaModal({
  persona,
  personasExistentes,
  onClose,
  onCreated,
}: {
  persona?: BeneficiarioConSaldo;
  /** Para avisar si ya está cargada. */
  personasExistentes: readonly BeneficiarioConSaldo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const editando = !!persona;
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [documento, setDocumento] = useState(persona?.documento ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [email, setEmail] = useState(persona?.email ?? "");
  const [direccion, setDireccion] = useState(persona?.direccion ?? "");
  const [departamento, setDepartamento] = useState(persona?.departamento ?? "");
  const [provincia, setProvincia] = useState(persona?.provincia ?? "");
  const [distrito, setDistrito] = useState(persona?.distrito ?? "");
  const [notas, setNotas] = useState(persona?.notas ?? "");
  const [limite, setLimite] = useState(persona?.limiteCredito != null ? String(persona.limiteCredito) : "");
  const [banco, setBanco] = useState(persona?.banco ?? "");
  const [cuentaBancaria, setCuentaBancaria] = useState(persona?.cuentaBancaria ?? "");
  const [cci, setCci] = useState(persona?.cci ?? "");
  /** Lo que dijo el padrón; viaja al backend junto con lo demás. */
  const [oficial, setOficial] = useState<Hallado | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Rellenar sin pisar lo escrito a mano: si alguien ya tipeó un nombre —el
   * apodo con el que se lo conoce— la razón social no puede borrárselo.
   */
  const rellenar = useCallback((r: Hallado) => {
    setOficial(r);
    const soloSiVacio = (set: (f: (v: string) => string) => void, valor?: string) => {
      if (valor) set((actual) => (actual.trim() ? actual : valor));
    };
    soloSiVacio(setNombre, r.nombre);
    soloSiVacio(setDireccion, r.direccion);
    soloSiVacio(setDepartamento, r.departamento);
    soloSiVacio(setProvincia, r.provincia);
    soloSiVacio(setDistrito, r.distrito);
  }, []);

  const { estado, reintentar } = useLookupDocumento(documento, rellenar);

  const avisoDoc = revisarDocumento(documento);
  const avisoTel = revisarTelefono(telefono);
  const duplicado = useMemo(
    () => buscarDuplicado({ nombre, documento, telefono }, personasExistentes, persona?.id),
    [nombre, documento, telefono, personasExistentes, persona?.id],
  );
  const avisoSunat = oficial ? avisoDeSunat(oficial) : null;

  const submit = async () => {
    setErr(null);
    if (!nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    const lim = limite.trim() ? Number(limite) : null;
    setSaving(true);
    try {
      const res = await fetch(
        editando ? `/api/adelantos/beneficiarios/${persona!.id}` : "/api/adelantos/beneficiarios",
        {
          method: editando ? "PATCH" : "POST",
          headers: jsonHeaders(),
          credentials: "include",
          body: JSON.stringify({
            nombre: nombre.trim(),
            documento: normalizarNumero(documento) || undefined,
            telefono: telefono.trim() || undefined,
            notas: notas.trim() || undefined,
            limiteCredito: lim && lim > 0 ? lim : null,
            email: email.trim() || null,
            direccion: direccion.trim() || null,
            departamento: departamento.trim() || null,
            provincia: provincia.trim() || null,
            distrito: distrito.trim() || null,
            banco: banco || null,
            cuentaBancaria: cuentaBancaria.trim() || null,
            cci: cci.trim() || null,
            /* Sólo si el padrón contestó DE VERDAD en esta edición. Un dato de
               demostración no puede quedar guardado como «verificado». */
            ...(oficial && !oficial.demo
              ? {
                  tipoDocumento: oficial.tipo,
                  razonSocial: oficial.razonSocial ?? null,
                  estadoSunat: oficial.estado ?? null,
                  condicionSunat: oficial.condicion ?? null,
                  verificadoEn: new Date().toISOString(),
                }
              : oficial
                ? { tipoDocumento: oficial.tipo }
                : {}),
          }),
        },
      );
      if (res.ok) {
        onCreated();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? (editando ? "No se pudo guardar los cambios." : "No se pudo crear la persona."));
    } catch (e) {
      logger.error("[adelantos] no se pudo guardar la persona", { error: String(e) });
      setErr("No se pudo guardar. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={editando ? "Editar persona" : "Nueva persona"}
      subtitle="Escribí el DNI o el RUC y los datos se completan solos."
      onClose={onClose}
      size="xl"
      footer={<ModalActions onClose={onClose} onSubmit={submit} saving={saving} label={editando ? "Guardar cambios" : "Crear persona"} />}
    >
      {/* ── El documento manda: ocupa el ancho porque es lo primero ─────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field label="DNI o RUC" hint={avisoDoc ?? "8 dígitos consultan RENIEC · 11 consultan SUNAT"}>
          <div className="relative">
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              inputMode="numeric"
              autoFocus={!editando}
              placeholder="12345678"
              aria-label="DNI o RUC"
              className={`${inputCls} pr-12 text-lg tabular-nums ${avisoDoc ? "border-[var(--data-warning)]" : ""}`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              {estado.fase === "consultando" ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" aria-label="Consultando" />
              ) : estado.fase === "listo" && estado.resultado.encontrado ? (
                <CheckCircle className="h-5 w-5 text-[var(--data-success)]" aria-label="Encontrado" />
              ) : null}
            </span>
          </div>
        </Field>
        <div className="flex items-end">
          <div className="w-full">
            <EstadoDelPadron estado={estado} onReintentar={reintentar} />
          </div>
        </div>
      </div>

      {avisoSunat && <Aviso>{avisoSunat}</Aviso>}

      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {/* ── Quién es ─────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <Titulo>Quién es</Titulo>
          <Field label={oficial?.tipo === "RUC" ? "Nombre comercial o razón social" : "Nombre"}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
          </Field>
          {duplicado && <Aviso>{avisoDeDuplicado(duplicado)}</Aviso>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teléfono" hint={avisoTel ?? undefined}>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                placeholder="9XX XXX XXX"
                className={`${inputCls} tabular-nums ${avisoTel ? "border-[var(--data-warning)]" : ""}`}
              />
            </Field>
            <Field label="Correo (opcional)">
              <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="nombre@correo.com" className={inputCls} />
            </Field>
          </div>

          <Field label="Dirección (opcional)">
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="La trae SUNAT si cargás el RUC"
              className={inputCls}
            />
          </Field>

          {/* Cada uno a su campo: SUNAT los manda separados, y pegados dentro
              de la dirección no se puede filtrar ni imprimir donde va. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Departamento">
              <input value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Provincia">
              <input value={provincia} onChange={(e) => setProvincia(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Distrito">
              <input value={distrito} onChange={(e) => setDistrito(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </section>

        {/* ── Cómo se le paga y cuánto ─────────────────────────────────── */}
        <section className="space-y-4">
          <Titulo>Plata</Titulo>
          <Field
            label="Límite de crédito S/ (opcional)"
            hint="Cuánto puede deber a la vez. Al pasarlo, el sistema avisa antes de dar el adelanto."
          >
            <input
              type="number"
              min={0}
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              placeholder="Sin límite"
              className={`${inputCls} tabular-nums`}
            />
          </Field>

          {/* Dónde cobra: si el adelanto sale por transferencia, el número
              estaba en un WhatsApp viejo y había que buscarlo cada vez. */}
          <Field label="Banco (opcional)">
            <select value={banco} onChange={(e) => setBanco(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {BANCOS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="N° de cuenta">
              <input value={cuentaBancaria} onChange={(e) => setCuentaBancaria(e.target.value)} inputMode="numeric" className={`${inputCls} tabular-nums`} />
            </Field>
            <Field label="CCI (interbancario)" hint="20 dígitos">
              <input value={cci} onChange={(e) => setCci(e.target.value)} inputMode="numeric" maxLength={20} className={`${inputCls} tabular-nums`} />
            </Field>
          </div>

          <Field label="Notas (opcional)">
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={`${inputCls} h-auto py-3`} />
          </Field>
        </section>
      </div>

      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
    </ModalShell>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--rule-soft)] pb-2 text-sm font-extrabold uppercase tracking-wide text-[var(--text-tertiary)]">
      {children}
    </div>
  );
}

/** Qué está pasando con la consulta al padrón, en una línea. */
function EstadoDelPadron({
  estado,
  onReintentar,
}: {
  estado: ReturnType<typeof useLookupDocumento>["estado"];
  onReintentar: () => void;
}) {
  if (estado.fase === "quieto") return null;

  if (estado.fase === "consultando") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Consultando {estado.tipo === "DNI" ? "RENIEC" : "SUNAT"}…
      </p>
    );
  }

  const r = estado.resultado;
  if (!r.encontrado) {
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-warning)]/10 px-3.5 py-2.5 text-sm font-semibold text-[var(--data-warning)]">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{r.motivo}</span>
        {r.tipo && (
          <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1 font-bold underline-offset-2 hover:underline">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reintentar
          </button>
        )}
      </p>
    );
  }

  /**
   * De dónde salió el dato. Cuando es de demostración se dice en amarillo y con
   * qué arreglar: un dato inventado disfrazado de SUNAT es peor que no tener
   * ninguno, porque termina impreso en un comprobante.
   */
  const tono = r.demo
    ? "bg-[var(--data-warning)]/10 text-[var(--data-warning)]"
    : "bg-[var(--data-success)]/10 text-[var(--data-success)]";
  return (
    <div className={`rounded-xl px-3.5 py-2.5 ${tono}`}>
      <p className="flex items-center gap-2 text-sm font-bold">
        {r.demo ? (
          <Info className="h-4 w-4 shrink-0" aria-hidden />
        ) : r.tipo === "RUC" ? (
          <Building2 className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <User className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 truncate">{r.nombre}</span>
      </p>
      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
        Según {r.fuente}
        {r.estado && ` · ${r.estado}`}
        {r.condicion && ` · ${r.condicion}`}
        {r.avisoConfig && <span className="block font-semibold">{r.avisoConfig}</span>}
      </p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning)]/10 px-3.5 py-2.5 text-sm font-semibold text-[var(--data-warning)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
