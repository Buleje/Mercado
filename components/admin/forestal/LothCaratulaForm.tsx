"use client";

/**
 * LothCaratulaForm — Carátula del libro LO-TH (Anexo 1 RDE 264-2019, ADR-125).
 *
 * «Carátula en 2 minutos» (2026-09-30): cuatro pasos cortos en vez de 16 campos
 * en una columna — (1) título habilitante y resolución, (2) titular, (3) libro y
 * documento de gestión, (4) ubicación y contacto (opcional). Se puede guardar
 * en cualquier paso con sólo el titular y completar después. Lo que el negocio
 * y el plan activo ya saben llega propuesto (con su marca «Propuesto de…»).
 *
 * Se abre desde «Configurar/Editar carátula» del libro y desde «Completar» de la
 * ficha del permiso; en ambos casos cae en el primer paso que falta. La cuenta
 * vive en `lib/forestal/loth-caratula-pasos.ts` (pura, con tests).
 */

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Loader2, X, AlertTriangle, Check, ArrowLeft, ArrowRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AdminModal, { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import DirectorioPicker from "./DirectorioPicker";
import type { Parte } from "@/lib/forestal/directorio";
import LothCaratulaBarra from "./LothCaratulaBarra";
import { PasoContacto, PasoLibro, PasoTitular, PasoTitulo } from "./LothCaratulaPasos";
import { useLothCaratulaPropuesta } from "./hooks/use-loth-caratula-propuesta";
import { useLothCitesPermisos } from "./hooks/use-loth-cites-permisos";
import {
  PASOS_CARATULA,
  completarDesdeDirectorio,
  erroresDeCaratula,
  estadoDePasos,
  primerPasoIncompleto,
  progresoDeCaratula,
  proponerCaratula,
  puedeGuardar,
  queFalta,
  valoresDeCaratula,
  type CampoCaratula,
  type CaratulaGuardada,
  type CaratulaValores,
  type PasoCaratula,
  type Propuestos,
} from "@/lib/forestal/loth-caratula-pasos";

interface Props {
  current: CaratulaGuardada | null;
  /** ¿Asierra dentro del TH? true / false / null = sin responder (KV aparte, ver ForestLothTransformacionDB). */
  transformaEnElTh?: boolean | null;
  /** Paso en el que abre. Sin él: el primero que falta (o el 1 si está todo). */
  pasoInicial?: PasoCaratula;
  onClose: () => void;
  onSaved: () => void;
}

const BTN_BASE = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10";

export default function LothCaratulaForm({ current, transformaEnElTh = null, pasoInicial, onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [enElTh, setEnElTh] = useState<boolean | null>(transformaEnElTh);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<CaratulaValores>(() => valoresDeCaratula(current));
  const [paso, setPaso] = useState<PasoCaratula>(() => pasoInicial ?? primerPasoIncompleto(valoresDeCaratula(current)));
  const [propuestos, setPropuestos] = useState<Propuestos>({});
  const [traido, setTraido] = useState<string | null>(null);
  const cites = useLothCitesPermisos();
  const { propuesta } = useLothCaratulaPropuesta();
  const idEstado = useId();
  const cuerpo = useRef<HTMLDivElement>(null);

  // Lo que el negocio y el plan ya saben: rellena sólo lo vacío, una vez.
  const yaPropuesto = useRef(false);
  const fRef = useRef(f);
  fRef.current = f;
  useEffect(() => {
    if (!propuesta || yaPropuesto.current) return;
    yaPropuesto.current = true;
    const r = proponerCaratula(fRef.current, propuesta.negocio, propuesta.plan);
    setF(r.valores);
    setPropuestos(r.propuestos);
  }, [propuesta]);

  const set = (k: CampoCaratula, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    // Lo que la persona toca ya es suyo: deja de ser «propuesto».
    setPropuestos((p) => {
      if (!(k in p)) return p;
      const { [k]: _quitado, ...resto } = p;
      return resto;
    });
  };

  /** Del Directorio (`ForestParty`): rellena sólo lo vacío, salvo el titular. */
  function traerDelDirectorio(p: Parte) {
    setF((prev) => completarDesdeDirectorio(prev, p));
    setPropuestos((prev) => {
      const { titularName: _t, ...resto } = prev;
      return resto;
    });
    setTraido(p.nombre);
  }

  const errores = erroresDeCaratula(f);
  const valido = puedeGuardar(f);
  const pasos = estadoDePasos(f);
  const progreso = progresoDeCaratula(f);
  const faltas = queFalta(f);
  const tieneErrores = Object.keys(errores).length > 0;

  // Al cambiar de paso, el foco va al primer campo (no al montar: ahí manda el modal).
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    cuerpo.current?.querySelector<HTMLElement>("input:not([type=hidden]), select")?.focus();
  }, [paso]);

  async function guardar() {
    if (submitting || !valido) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = v.trim() === "" ? null : v.trim();
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
        body: JSON.stringify({ permisos: cites.permisos.filter((p) => p.especie.trim() || p.numero.trim()) }),
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

  // Enter avanza de paso; en el último, guarda.
  function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (paso < 4) setPaso((paso + 1) as PasoCaratula);
    else void guardar();
  }

  const camposErrados = (Object.keys(errores) as CampoCaratula[]).map((c) => (c === "ruc" ? "RUC" : c === "dni" ? "DNI" : "fecha"));
  const resumen = !f.titularName.trim()
    ? null
    : tieneErrores
      ? `Corrige: ${camposErrados.join(", ")}`
      : faltas.length === 0
        ? `Listo para ${current ? "actualizar" : "crear"}`
        : `Se guarda ahora. Falta: ${faltas.slice(0, 2).map((x) => x.texto).join(", ")}${faltas.length > 2 ? ` y ${faltas.length - 2} más` : ""}`;

  const props = { f, set, err: errores, propuestos };

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      hideCloseButton
      claveVentana="loth-caratula"
      className="sm:max-w-[44rem]"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p id={idEstado} aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            {resumen ? (
              <>
                {faltas.length === 0 && !tieneErrores && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" aria-hidden="true" />}
                <span className={`min-w-0 ${tieneErrores ? "font-semibold text-[var(--data-error-700)]" : ""}`}>{resumen}</span>
              </>
            ) : (
              <>
                <span>Falta el titular para guardar.</span>
                {paso !== 2 && (
                  <button type="button" onClick={() => setPaso(2)} className="shrink-0 rounded font-bold text-[var(--accent-dark)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]">
                    Ir al paso 2
                  </button>
                )}
              </>
            )}
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {paso > 1 && (
              <button type="button" onClick={() => setPaso((paso - 1) as PasoCaratula)} disabled={submitting} className={`${BTN_BASE} text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Atrás
              </button>
            )}
            {paso < 4 && (
              <button type="submit" form="loth-caratula-form" disabled={submitting} className={`${BTN_BASE} border border-[var(--rule-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]`}>
                Siguiente <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type={paso === 4 ? "submit" : "button"}
              form={paso === 4 ? "loth-caratula-form" : undefined}
              onClick={paso === 4 ? undefined : () => void guardar()}
              disabled={!valido || submitting}
              aria-describedby={idEstado}
              className={`${BTN_BASE} bg-[var(--accent-dark)] text-white hover:opacity-90`}
            >
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Guardando</>) : current ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col bg-[var(--surface-raised)]">
        <CabeceraPropia
          className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 sm:px-6"
          acciones={
            <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-9 sm:w-9">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <CardTitle as="h2" className="truncate text-sm font-bold text-[var(--text-primary)]">Carátula del libro</CardTitle>
              <InfoTip
                title="Carátula del libro"
                what="Los datos del titular y del documento de gestión (Anexo 1 SERFOR): se imprimen en cada hoja del LO-TH. Se guarda con sólo el titular; lo demás se completa después."
                affects="El encabezado de toda GTF y del acta de cierre que salen de este libro."
                example="Título habilitante 10-HUA-PUE/PER-FMP-2026-007, titular, RUC y N° de tomo."
              />
            </span>
          </div>
        </CabeceraPropia>

        <LothCaratulaBarra paso={paso} pasos={pasos} progreso={progreso} onIr={setPaso} />

        <form id="loth-caratula-form" onSubmit={alEnviar} noValidate className="min-w-0 flex-1 space-y-3 px-5 py-4 sm:px-6">
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
              {PASOS_CARATULA[paso - 1].titulo}
              {PASOS_CARATULA[paso - 1].opcional && <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">(opcional)</span>}
            </CardTitle>
            {paso === 2 && (
              <DirectorioPicker rol="proveedor" label="Traer del Directorio" ayuda="El titular del título habilitante: su RUC, domicilio y permiso" onElegir={traerDelDirectorio} />
            )}
          </div>
          {paso === 2 && traido && (
            <p className="text-xs text-[var(--text-tertiary)]">Completado con los datos de {traido} — revisa lo que quedó.</p>
          )}

          <div ref={cuerpo}>
            {paso === 1 && <PasoTitulo {...props} />}
            {paso === 2 && <PasoTitular {...props} />}
            {paso === 3 && <PasoLibro {...props} enElTh={enElTh} setEnElTh={setEnElTh} />}
            {paso === 4 && <PasoContacto {...props} cites={cites} />}
          </div>
        </form>
      </div>
    </AdminModal>
  );
}
