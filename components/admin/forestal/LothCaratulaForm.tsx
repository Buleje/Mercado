"use client";

/**
 * LothCaratulaForm — Carátula del libro LO-TH (Anexo 1 RDE 264-2019, ADR-125).
 * Crea o edita los datos del titular / documento de gestión / tomo.
 */

import { useEffect, useId, useState } from "react";
import { FileText, Loader2, X, AlertTriangle, Check, Plus, Trash2, ShieldAlert } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AdminModal, { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { estadoVencimiento, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import DirectorioPicker from "./DirectorioPicker";
import type { Parte } from "@/lib/forestal/directorio";

interface Caratula {
  id: string;
  registroNumber: string | null;
  tomo: string | null;
  titularName: string;
  representanteLegal?: string | null;
  tituloHabilitante: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefono?: string | null;
  email?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

interface Props {
  current: Caratula | null;
  /** ¿Asierra dentro del TH? true / false / null = sin responder (KV aparte, ver ForestLothTransformacionDB). */
  transformaEnElTh?: boolean | null;
  onClose: () => void;
  onSaved: () => void;
}

const REGIONS_PE = ["Loreto", "Ucayali", "Madre de Dios", "San Martín", "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra"];

/** Las dos respuestas, en el orden en que se dan: la mayoría lleva la troza a una planta. */
const OPCIONES_TRANSFORMA: { valor: boolean; label: string }[] = [
  { valor: false, label: "No, la llevo a una planta" },
  { valor: true, label: "Sí, asierro en el bosque" },
];

export default function LothCaratulaForm({ current, transformaEnElTh = null, onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [enElTh, setEnElTh] = useState<boolean | null>(transformaEnElTh);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    registroNumber: current?.registroNumber ?? "",
    tomo: current?.tomo ?? "",
    titularName: current?.titularName ?? "",
    representanteLegal: current?.representanteLegal ?? "",
    tituloHabilitante: current?.tituloHabilitante ?? "",
    ruc: current?.ruc ?? "",
    dni: current?.dni ?? "",
    domicilio: current?.domicilio ?? "",
    departamento: current?.departamento ?? "Ucayali",
    provincia: current?.provincia ?? "",
    distrito: current?.distrito ?? "",
    telefono: current?.telefono ?? "",
    email: current?.email ?? "",
    docGestionType: current?.docGestionType ?? "PO",
    docGestionName: current?.docGestionName ?? "",
    resolucionNumber: current?.resolucionNumber ?? "",
  });

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isValid = f.titularName.trim().length >= 2;
  const idEstado = useId();

  /**
   * El titular del libro se tipeaba a mano, con el RUC, el domicilio y el
   * título habilitante al lado — los mismos datos que ya están en el Directorio
   * (`ForestParty`) y que se imprimen en CADA hoja del LO-TH. Escribirlos dos
   * veces es cómo «Maderera El Aguajal SAC» y «MADERERA EL AGUAJAL S.A.C.»
   * terminan siendo dos titulares distintos entre la carátula y las guías.
   *
   * No pisa lo que ya está escrito: rellena sólo los campos vacíos.
   */
  const [traido, setTraido] = useState<string | null>(null);
  function traerDelDirectorio(p: Parte) {
    setF((prev) => {
      const sinPisar = (actual: string, nuevo: string | null | undefined) => (actual.trim() ? actual : (nuevo ?? ""));
      return {
        ...prev,
        titularName: p.nombre || prev.titularName,
        representanteLegal: sinPisar(prev.representanteLegal, p.representante),
        ruc: sinPisar(prev.ruc, p.docTipo === "RUC" ? p.docNumero : null),
        dni: sinPisar(prev.dni, p.representanteDni ?? (p.docTipo === "DNI" ? p.docNumero : null)),
        tituloHabilitante: sinPisar(prev.tituloHabilitante, p.tituloHabilitante),
        resolucionNumber: sinPisar(prev.resolucionNumber, p.resolucion),
        domicilio: sinPisar(prev.domicilio, p.direccion),
        // El departamento arranca en «Ucayali» por default: eso no es un dato
        // cargado, así que el del Directorio sí puede completarlo.
        departamento: sinPisar(prev.departamento === "Ucayali" ? "" : prev.departamento, p.region) || prev.departamento,
        provincia: sinPisar(prev.provincia, p.provincia),
        distrito: sinPisar(prev.distrito, p.distrito),
        telefono: sinPisar(prev.telefono, p.telefono ?? p.whatsapp),
        email: sinPisar(prev.email, p.email),
      };
    });
    setTraido(p.nombre);
  }

  // ── Catálogo de permisos CITES (KV, sin migración) ─────────────────────────
  const [permisos, setPermisos] = useState<LothCitesPermiso[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/loth/cites", { credentials: "include" });
        if (!r.ok || cancel) return;
        const cat = (await r.json()).catalogo;
        if (!cancel) setPermisos(cat?.permisos ?? []);
      } catch {
        /* el catálogo es best-effort: sin él, la carátula igual se edita */
      }
    })();
    return () => { cancel = true; };
  }, []);
  const addPermiso = () => setPermisos((p) => [...p, { especie: "", numero: "", vencimiento: "" }]);
  const rmPermiso = (i: number) => setPermisos((p) => p.filter((_, j) => j !== i));
  const updPermiso = (i: number, k: keyof LothCitesPermiso, v: string) =>
    setPermisos((p) => p.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = typeof v === "string" && v.trim() === "" ? null : v;
      body.titularName = f.titularName.trim();
      body.transformaEnElTh = enElTh;

      const res = await fetch("/api/admin/forestal/loth/caratula", {
        method: current ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(current ? { id: current.id, ...body } : body),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }

      // Guardar el catálogo CITES (KV, independiente de la carátula Prisma).
      const cRes = await fetch("/api/admin/forestal/loth/cites", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ permisos: permisos.filter((p) => p.especie.trim() || p.numero.trim()) }),
      });
      if (!cRes.ok) {
        const r = await cRes.json().catch(() => ({}));
        throw new Error(r.message ?? r.error ?? `No se pudieron guardar los permisos CITES (HTTP ${cRes.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      hideCloseButton
      claveVentana="loth-caratula"
      // Mismo formato que «Nueva línea» (28-09): una columna, sin vista previa
      // (repetía lo que ya se lee en el formulario) y el pie fuera del scroll.
      className="sm:max-w-[44rem]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p id={idEstado} className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-[var(--text-tertiary)] sm:flex">
            {isValid ? (
              <><Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" /><span>Listo para {current ? "actualizar" : "crear"}</span></>
            ) : (
              <span>Falta el titular</span>
            )}
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
              Cancelar
            </button>
            <button
              type="submit"
              form="loth-caratula-form"
              disabled={!isValid || submitting}
              aria-describedby={idEstado}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Guardando</>) : current ? "Actualizar carátula" : "Crear carátula"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col bg-[var(--surface-raised)]">
        <CabeceraPropia
          className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 sm:px-6"
          acciones={
            <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <span className="flex items-center gap-1.5">
                <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">Carátula del libro</CardTitle>
                <InfoTip
                  title="Carátula del libro"
                  what="Los datos del titular y del documento de gestión (Anexo 1 SERFOR): se imprimen en cada hoja del LO-TH."
                  affects="El encabezado de toda GTF y del acta de cierre que salen de este libro."
                  example="Titular, RUC, título habilitante 17-CPO/C-J-001-02 y N° de tomo."
                />
              </span>
            </div>
          </div>
        </CabeceraPropia>

        <form id="loth-caratula-form" onSubmit={submit} className="min-w-0 flex-1 px-5 py-4 sm:px-6 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3 sm:content-start [&>*]:min-w-0 max-sm:space-y-3">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-xs text-[var(--text-tertiary)]">
              {traido
                ? `Completado con los datos de ${traido} — revisa lo que quedó y corrige lo que haga falta.`
                : "El titular ya puede estar en el Directorio con su RUC, domicilio y título."}
            </p>
            <DirectorioPicker
              rol="proveedor"
              label="Traer del Directorio"
              ayuda="El titular del título habilitante: su RUC, domicilio y permiso"
              onElegir={traerDelDirectorio}
            />
          </div>

          <Field label="Titular del título habilitante" required>
            <input type="text" value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera El Aguajal SAC" required className={cls.input} />
          </Field>
          <Field label="Representante legal" hint="Si el titular es persona jurídica">
            <input type="text" value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Pedro Rinconada Pariachi" className={cls.input} />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="RUC"><input type="text" value={f.ruc} onChange={(e) => set("ruc", e.target.value)} placeholder="20XXXXXXXXX" className={cls.input} /></Field>
            <Field label="DNI (rep. legal)"><input type="text" value={f.dni} onChange={(e) => set("dni", e.target.value)} placeholder="05040151" className={cls.input} /></Field>
          </div>

          <Field label="N° de título habilitante"><input type="text" value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls.input} /></Field>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="N° de registro del libro" hint="Otorgado por la ARFFS"><input type="text" value={f.registroNumber} onChange={(e) => set("registroNumber", e.target.value)} placeholder="001-GOREU-..." className={cls.input} /></Field>
            <Field label="N° de tomo"><input type="text" value={f.tomo} onChange={(e) => set("tomo", e.target.value)} placeholder="PO 12 - Tomo I" className={cls.input} /></Field>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 sm:col-span-2">
            <Field label="Documento de gestión">
              <select value={f.docGestionType} onChange={(e) => set("docGestionType", e.target.value)} className={cls.input}>
                <option value="PO">PO</option>
                <option value="PMFI">PMFI</option>
                <option value="DEMA">DEMA</option>
              </select>
            </Field>
            <Field label="Nombre/periodo"><input type="text" value={f.docGestionName} onChange={(e) => set("docGestionName", e.target.value)} placeholder="Plan Operativo 2019-2020" className={cls.input} /></Field>
            <Field label="N° resolución"><input type="text" value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2019..." className={cls.input} /></Field>
          </div>

          {/* Decide si las secciones 4-6 se muestran: ver ForestLothTransformacionDB. */}
          <div className="sm:col-span-2">
            <span id="loth-transforma-rotulo" className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
              ¿Asierras la madera dentro del título habilitante?
              <InfoTip
                title="Consumo, producto y despacho (secciones 4 a 6)"
                what="Sólo se llenan si transformas la madera dentro del título habilitante. Si la llevas a una planta, eso se registra en el Libro CTP."
                affects="Con «No», esas tres secciones se esconden de la pantalla. En el libro impreso salen en blanco, como pide SERFOR."
                example="Si tus trozas salen con GTF a tu aserradero: «No, la llevo a una planta»."
              />
            </span>
            <div role="radiogroup" aria-labelledby="loth-transforma-rotulo" className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
              {OPCIONES_TRANSFORMA.map((o) => {
                const elegida = enElTh === o.valor;
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={elegida}
                    onClick={() => setEnElTh(elegida ? null : o.valor)}
                    className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center text-sm font-medium leading-snug transition-colors ${
                      elegida
                        ? "border-[var(--data-success-600)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    {elegida && <Check className="h-4 w-4 shrink-0" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Domicilio"><input type="text" value={f.domicilio} onChange={(e) => set("domicilio", e.target.value)} placeholder="Coronel Portillo Km 15" className={cls.input} /></Field>

          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 sm:col-span-2">
            <Field label="Departamento">
              <select value={f.departamento} onChange={(e) => set("departamento", e.target.value)} className={cls.input}>
                {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Provincia"><input type="text" value={f.provincia} onChange={(e) => set("provincia", e.target.value)} placeholder="Coronel Portillo" className={cls.input} /></Field>
            <Field label="Distrito"><input type="text" value={f.distrito} onChange={(e) => set("distrito", e.target.value)} placeholder="Callería" className={cls.input} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="Teléfono"><input type="text" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="992696555" className={cls.input} /></Field>
            <Field label="Correo electrónico"><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="titular@correo.com" className={cls.input} /></Field>
          </div>

          {/* Permisos CITES — acreditan la legalidad de las especies protegidas (ADR-305). */}
          <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <ShieldAlert className="h-4 w-4 text-[var(--data-error-600)]" />
                  Permisos CITES <span className="font-normal text-[var(--text-tertiary)]">(especies protegidas)</span>
                </CardTitle>
                <InfoTip
                  title="Permisos CITES"
                  what="Una especie CITES (caoba, cedro, shihuahuaco) es legal con su permiso archivado — el booleano de cada línea no alcanza."
                  affects="Acredita el origen de esas especies ante OSINFOR."
                  example="Carga el N° de permiso y su vencimiento por cada especie protegida que aprovechas."
                />
              </span>
              <button
                type="button"
                onClick={addPermiso}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            {permisos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]">
                Sin permisos cargados. Agrega uno si aprovechas especies CITES.
              </p>
            ) : (
              <div className="space-y-2">
                {permisos.map((p, i) => {
                  const est = estadoVencimiento(p.vencimiento);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={p.especie}
                        onChange={(e) => updPermiso(i, "especie", e.target.value)}
                        placeholder="Especie (Caoba)"
                        className={`${cls.input} h-9 min-w-[8rem] flex-1`}
                      />
                      <input
                        type="text"
                        value={p.numero}
                        onChange={(e) => updPermiso(i, "numero", e.target.value)}
                        placeholder="N° permiso CITES"
                        className={`${cls.input} h-9 min-w-[8rem] flex-1 font-mono`}
                      />
                      <input
                        type="date"
                        value={p.vencimiento}
                        onChange={(e) => updPermiso(i, "vencimiento", e.target.value)}
                        className={`${cls.input} h-9 w-40`}
                        aria-label="Vencimiento del permiso"
                      />
                      {est === "vencido" && (
                        <span className="rounded-full bg-[var(--data-error-100)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-error-700)]">vencido</span>
                      )}
                      {est === "por_vencer" && (
                        <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)]">por vencer</span>
                      )}
                      <button
                        type="button"
                        onClick={() => rmPermiso(i)}
                        aria-label="Quitar permiso"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-600)] transition-colors hover:bg-[var(--data-error-50)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

      </div>
    </AdminModal>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-[var(--data-error-600)]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]",
};
