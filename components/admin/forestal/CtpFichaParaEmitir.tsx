"use client";

/**
 * CtpFichaParaEmitir — la pared del despacho, ANTES de chocarla.
 *
 * Hasta acá el operador cargaba la guía entera —productos, destinatario,
 * transportista, placa— y recién al apretar «Emitir GTF» el servidor contestaba
 * `serie_no_configurada`: sin la serie del talonario en la Ficha del CTP no hay
 * número que asignarle, así que el papel no sale. Y aun con serie, con la Ficha
 * vacía la guía sale **anónima**: no dice qué centro la emitió ni con qué RUC.
 *
 * Esto se dibuja arriba del formulario, antes de cargar nada, y deja completar
 * lo que bloquea SIN salir del despacho. Se piden sólo los campos que faltan
 * (`faltantesDeFichaParaGuia`), no la Ficha entera: `CtpFichaEditor` es la
 * pantalla completa —títulos habilitantes, permisos CITES, logo, contacto— y
 * abrirla acá obligaría a abandonar la guía a medio cargar para volver después.
 *
 * NO inventa datos: lo que no se tipea queda vacío. El único autocompletado es
 * el padrón de SUNAT, que responde con lo que SUNAT tiene registrado.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, Search, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { rucValido, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import {
  faltantesDeFichaParaGuia,
  resumenFaltantesDeFicha,
  type CampoFichaEnGuia,
  type GravedadFicha,
} from "@/lib/forestal/ficha-para-guia";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import { Btn, Field, I } from "./ctp-shared";

/** Qué se le pone de ayuda a cada campo del mini-formulario. */
const PLACEHOLDER: Partial<Record<CampoFichaEnGuia, string>> = {
  gtfSerie: "GTF-001",
  codigoCtp: "el que te asignó la ARFFS",
  arffs: "GORE Ucayali · DRSAFFS",
};

const TITULO: Record<GravedadFicha, string> = {
  numero: "La guía no se va a poder numerar",
  identidad: "La guía va a salir sin decir quién la emite",
  casillero: "Casilleros del formato que van a salir en blanco",
};

export default function CtpFichaParaEmitir({
  ficha,
  onFichaGuardada,
}: {
  /** `null` mientras se trae: no se afirma que falte algo sin haber mirado. */
  ficha: FichaCtp | null;
  /** La Ficha ya guardada, para que el resto del modal la use sin recargar. */
  onFichaGuardada: (f: CtpFicha) => void;
}) {
  const faltan = useMemo(() => faltantesDeFichaParaGuia(ficha), [ficha]);
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Partial<Record<CampoFichaEnGuia, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [padron, setPadron] = useState<{ cargando: boolean; mensaje: string | null; malo: boolean }>({
    cargando: false,
    mensaje: null,
    malo: false,
  });

  /* Silencio cuando la Ficha alcanza: un aviso que aparece siempre se vuelve
     parte del fondo y deja de leerse el día que dice algo. */
  if (!ficha || faltan.length === 0) return null;

  const val = (c: CampoFichaEnGuia) => borrador[c] ?? "";
  const set = (c: CampoFichaEnGuia, v: string) => setBorrador((p) => ({ ...p, [c]: v }));
  const ruc = val("ruc");
  const rucIncompleto = ruc.length > 0 && ruc.length !== 11;
  const rucNoCierra = ruc.length === 11 && !rucValido(ruc);
  const pideRuc = faltan.some((f) => f.campo === "ruc");

  /** Razón social y domicilio fiscal desde el padrón: el mismo texto que SUNAT. */
  async function traerDeSunat() {
    setPadron({ cargando: true, mensaje: null, malo: false });
    try {
      const d = await consultarDocumento("RUC", ruc);
      if (!d) {
        setPadron({ cargando: false, malo: true, mensaje: "SUNAT no devuelve nada para ese RUC. Cárgalo a mano." });
        return;
      }
      setBorrador((p) => ({
        ...p,
        razonSocial: p.razonSocial || d.nombre || "",
        direccion: p.direccion || d.direccion || "",
        region: p.region || d.region || "",
        provincia: p.provincia || d.provincia || "",
        distrito: p.distrito || d.distrito || "",
      }));
      const baja = Boolean(d.estado) && !/activo/i.test(d.estado ?? "");
      setPadron({
        cargando: false,
        malo: baja,
        mensaje: baja
          ? `SUNAT lo devuelve en estado «${d.estado}». Revísalo antes de emitir con él.`
          : `Traído de SUNAT: ${d.nombre}.`,
      });
    } catch (e) {
      setPadron({ cargando: false, malo: true, mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  async function guardar() {
    if (rucIncompleto) {
      setError("El RUC tiene 11 dígitos. Complétalo o déjalo vacío.");
      return;
    }
    /* Sólo lo que se tipeó: el servidor mergea sobre lo guardado
       (`ForestCtpFichaDB.set`), así que un campo que no viaja queda como está. */
    const cambios = Object.fromEntries(
      Object.entries(borrador)
        .map(([k, v]) => [k, (v ?? "").trim()])
        .filter(([, v]) => v.length > 0),
    );
    if (Object.keys(cambios).length === 0) {
      setError("Todavía no cargaste ningún dato.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp-ficha", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(cambios),
      });
      const body = (await r.json().catch(() => ({}))) as {
        ficha?: CtpFicha;
        message?: string;
        issues?: { message: string }[];
      };
      if (!r.ok || !body.ficha) {
        throw new Error(body.issues?.[0]?.message ?? body.message ?? `No se pudo guardar la Ficha (${r.status}).`);
      }
      onFichaGuardada(body.ficha);
      setBorrador({});
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const grave = faltan.some((f) => f.gravedad === "numero" || f.gravedad === "identidad");
  const grupos = (["numero", "identidad", "casillero"] as const)
    .map((g) => ({ gravedad: g, items: faltan.filter((f) => f.gravedad === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <section
      aria-label="Lo que le falta a la Ficha del CTP para emitir esta guía"
      className={`rounded-2xl border-2 px-4 py-3 ${
        grave
          ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10"
          : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10"
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            grave
              ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Antes de registrar: la Ficha del CTP está incompleta
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{resumenFaltantesDeFicha(faltan)}</p>
        </div>
        <Btn size="sm" variant={abierto ? "dark" : "primary"} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          {abierto ? <X className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {abierto ? "Cerrar" : "Completar acá"}
        </Btn>
      </div>

      <ul className="mt-2 space-y-1">
        {grupos.map((g) => (
          <li key={g.gravedad} className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{TITULO[g.gravedad]}:</span>{" "}
            {g.items.map((f) => f.label).join(", ")}.
            <span className="block pl-0 text-xs text-[var(--text-tertiary)]">{g.items[0]!.motivo}</span>
          </li>
        ))}
      </ul>

      {abierto && (
        <div className="mt-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="mb-2 text-xs text-[var(--text-tertiary)]">
            Se piden sólo los datos que faltan. Se guardan en la Ficha del CTP —una sola vez, sirven para todas las
            guías, el certificado y el export del Libro—. Lo que no sepas, déjalo vacío: un dato inventado en un
            documento oficial es peor que un casillero en blanco.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {faltan.map((f) => (
              <Field
                key={f.campo}
                label={f.label}
                hint={f.campo === "gtfSerie" ? "La serie del talonario que autorizó la ARFFS" : undefined}
              >
                {f.campo === "ruc" ? (
                  <div className="flex gap-2">
                    <input
                      className={I}
                      inputMode="numeric"
                      placeholder="20512345671"
                      value={ruc}
                      aria-invalid={rucNoCierra || undefined}
                      onChange={(e) => {
                        set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11));
                        setPadron({ cargando: false, mensaje: null, malo: false });
                      }}
                    />
                    <Btn
                      variant="secondary"
                      className="shrink-0"
                      disabled={ruc.length !== 11 || padron.cargando}
                      onClick={() => void traerDeSunat()}
                      title="Traer razón social y domicilio fiscal del padrón de SUNAT"
                    >
                      {padron.cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      SUNAT
                    </Btn>
                  </div>
                ) : (
                  <input
                    className={f.campo === "gtfSerie" ? `${I} font-mono uppercase` : I}
                    placeholder={PLACEHOLDER[f.campo]}
                    value={val(f.campo)}
                    onChange={(e) =>
                      set(f.campo, f.campo === "gtfSerie" ? e.target.value.toUpperCase().slice(0, 20) : e.target.value)
                    }
                  />
                )}
              </Field>
            ))}
          </div>

          {pideRuc && rucNoCierra && (
            <p className="mt-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Ese RUC no pasa el dígito verificador de SUNAT. Revisa que no falte o sobre un número.
            </p>
          )}
          {padron.mensaje && (
            <p
              className={`mt-2 text-sm font-medium ${
                padron.malo
                  ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              }`}
            >
              {padron.malo ? (
                <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden />
              ) : (
                <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />
              )}
              {padron.mensaje}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-[var(--text-tertiary)]">
              Los títulos habilitantes, los permisos CITES y el logo se cargan en la pestaña Ficha del CTP.
            </span>
            <Btn variant="ghost" size="sm" onClick={() => setAbierto(false)} disabled={guardando}>
              Ahora no
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar en la Ficha
            </Btn>
          </div>
        </div>
      )}
    </section>
  );
}
