"use client";

/**
 * EnviarPorWhatsApp — manda documentos del Drive por WhatsApp con enlaces que
 * vencen (Brandon 08-10: «escribes el número o eliges un contacto; se crean
 * enlaces que vencen en 7 días y se abre wa.me con el mensaje»).
 *
 * Compartido a propósito: recibe los documentos y el asunto, no sabe de GTF.
 * Lo usa «Documentos del permiso» de la vista GTF del Libro TH y lo puede usar
 * cualquier otra lista de papeles del Drive.
 *
 *   · Los enlaces los crea `contactos-envio` en UN pedido con el share del
 *     Drive (`DocumentShare`): cada uno vence a los 7 días, sólo abre ESE
 *     documento y el servidor no lo crea si el rol no ve la carpeta. El número
 *     se valida ANTES de crear nada, se recuerda como «contacto de envío» y el
 *     envío queda en la auditoría de cada documento con a quién se mandó.
 *   · La pestaña de WhatsApp se abre en el MISMO clic (si no, el navegador la
 *     bloquea por llegar después de la espera); si igual la bloquea, queda el
 *     botón «Abrir WhatsApp» y «Copiar mensaje».
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Search, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  DIAS_ENLACE,
  ETIQUETA_FUENTE,
  diaConNombre,
  enlaceWhatsApp,
  mensajeDeEnvio,
  normalizarTelefono,
  telefonoLegible,
  venceEl,
  type ContactoEnvio,
  type EnvioInput,
} from "@/lib/forestal/contactos-envio";

const RUTA_CONTACTOS = "/api/admin/forestal/contactos-envio";

export interface DocumentoAEnviar {
  id: string;
  nombre: string;
}

/** Crea los enlaces (uno por documento) y registra el envío; devuelve la URL pública de cada uno. */
async function crearEnlaces(cuerpo: EnvioInput): Promise<Map<string, string>> {
  const r = await fetch(RUTA_CONTACTOS, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(cuerpo),
  });
  const j = (await r.json().catch(() => ({}))) as { message?: string; enlaces?: { documentId: string; token: string }[] };
  if (!r.ok || !j.enlaces) {
    throw new Error(
      r.status === 404
        ? "Tu rol no puede compartir uno de los documentos."
        : r.status === 429
          ? "Mandaste muchos envíos seguidos: espera unos minutos."
          : j.message ?? `No se pudieron crear los enlaces (HTTP ${r.status}).`,
    );
  }
  return new Map(j.enlaces.map((e) => [e.documentId, `${window.location.origin}/d/${e.token}`]));
}

export default function EnviarPorWhatsApp({
  documentos,
  asunto,
  referencia,
  onCerrar,
}: {
  documentos: readonly DocumentoAEnviar[];
  /** Primera línea del mensaje («Documentos del permiso …»). */
  asunto: string;
  /** Para la auditoría («GTF 019-001-0000001»). */
  referencia: string;
  onCerrar: () => void;
}) {
  const [contactos, setContactos] = useState<ContactoEnvio[] | null>(null);
  const [errorContactos, setErrorContactos] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  /* De dónde salió el número: el contacto elegido; escribirlo a mano lo vuelve «manual» (decide quién lo vuelve a ver). */
  const [fuente, setFuente] = useState<NonNullable<EnvioInput["fuente"]>>("manual");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ url: string; mensaje: string; abierto: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch(RUTA_CONTACTOS, { credentials: "include", signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()) as { contactos?: ContactoEnvio[] }).contactos ?? [];
      })
      .then(setContactos)
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setContactos([]);
        setErrorContactos(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, []);

  const telefono = normalizarTelefono(numero);
  const filtro = numero.trim().toLowerCase();
  const sugeridos = useMemo(() => {
    const xs = contactos ?? [];
    if (!filtro) return xs.slice(0, 8);
    const digitos = filtro.replace(/\D/g, "");
    return xs.filter((c) => c.nombre.toLowerCase().includes(filtro) || (digitos.length >= 3 && c.telefono.includes(digitos))).slice(0, 8);
  }, [contactos, filtro]);
  const vence = venceEl(limaDateKey());

  async function enviar() {
    if (!telefono || enviando || documentos.length === 0) return;
    /* La pestaña se abre YA, dentro del clic: después de esperar los enlaces el navegador la bloquearía. */
    const ventana = window.open("about:blank", "_blank");
    /* WhatsApp no necesita volver a esta pestaña: sin `opener` no puede tocarla. */
    if (ventana) ventana.opener = null;
    setEnviando(true);
    setError(null);
    try {
      const urls = await crearEnlaces({ telefono, nombre: nombre.trim() || undefined, fuente, documentos: documentos.map((d) => d.id), referencia });
      const enlaces = documentos.flatMap((d) => {
        const url = urls.get(d.id);
        return url ? [{ nombre: d.nombre, url }] : [];
      });
      const mensaje = mensajeDeEnvio({ asunto, enlaces, vence });
      /* `telefono` ya trae su código de país (`normalizarTelefono`): `waLink` le pondría otro 51 a uno de afuera. */
      const url = enlaceWhatsApp(telefono, mensaje);
      let abierto = false;
      if (ventana && !ventana.closed) {
        ventana.location.href = url;
        abierto = true;
      }
      setListo({ url, mensaje, abierto });
    } catch (e) {
      ventana?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Enviar por WhatsApp" className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <MessageCircle className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          Enviar {documentos.length === 1 ? "1 documento" : `${documentos.length} documentos`} por WhatsApp
          <InfoTip
            title="Enlaces que vencen"
            what={`Se crea un enlace por documento. Vence el ${diaConNombre(vence)} (${DIAS_ENLACE} días) y abre sólo ese documento.`}
            affects="Queda registrado en cada documento a qué número se mandó. Son papeles con DNI: mándalos sólo a quien corresponde."
            example="Al representante: la resolución y el DNI del jefe."
          />
        </p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar envío" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {listo ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <Check className="h-4 w-4" aria-hidden="true" />
            {listo.abierto ? "Se abrió WhatsApp con el mensaje: sólo falta enviarlo." : "Enlaces listos: abre WhatsApp para mandarlos."}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={listo.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:brightness-110">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir WhatsApp
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(listo.mensaje).then(() => setCopiado(true), (err: unknown) => console.warn("[enviar-whatsapp] no se pudo copiar", err));
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copiado ? "Copiado" : "Copiar mensaje"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Número o nombre</span>
              <span className="flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 focus-within:border-[var(--accent)]">
                <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                {/* autoFocus: la sección se abre al pie de la lista de carpetas; el foco la trae a la vista. */}
                <input
                  autoFocus
                  value={numero}
                  onChange={(e) => { setNumero(e.target.value); setFuente("manual"); }}
                  inputMode="tel"
                  placeholder="987 654 321 o busca un contacto"
                  className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Nombre (para recordarlo)</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Opcional"
                className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-tertiary)]"
              />
            </label>
          </div>

          {contactos === null ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Buscando contactos…</p>
          ) : sugeridos.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Contactos">
              {sugeridos.map((c) => (
                <li key={c.telefono}>
                  <button
                    type="button"
                    onClick={() => { setNumero(c.telefono.replace(/^51(?=\d{9}$)/, "")); setNombre(c.nombre); setFuente(c.fuente); }}
                    title={ETIQUETA_FUENTE[c.fuente]}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
                  >
                    {c.nombre} <span className="font-mono font-normal text-[var(--text-tertiary)]">{telefonoLegible(c.telefono)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">{errorContactos ? `No se pudieron leer los contactos (${errorContactos}): escribe el número.` : "Sin contactos con ese dato: escribe el número."}</p>
          )}

          {error && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {numero.trim() && !telefono && <span className="mr-auto text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Escribe 9 dígitos de celular.</span>}
            <button type="button" onClick={onCerrar} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!telefono || enviando}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
              Crear enlaces y abrir WhatsApp
            </button>
          </div>
        </>
      )}
    </section>
  );
}
