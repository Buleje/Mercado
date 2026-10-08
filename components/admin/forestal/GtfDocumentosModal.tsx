"use client";

/**
 * «Documentos del permiso» desde el menú ⋯ de una GTF del Libro TH (Brandon
 * 08-10): las carpetas del plan de la guía (ADR-467, por `ForestGtf.planId`)
 * con sus archivos para VER, DESCARGAR, IMPRIMIR o ENVIAR POR WHATSAPP, uno o
 * varios a la vez. Sólo lee: subir y ordenar sigue en Plan › Documentos.
 *
 * La vista la da el servidor (`/api/admin/forestal/plan/documentos`) con su
 * puerta: un rol que no ve las carpetas recibe 403 y acá se dice. El visor es
 * el del Drive (`VistaPreviaDoc`, va `aboveModals`); imprimir carga el archivo
 * del proxy del Drive (mismo origen) en un marco oculto y abre el diálogo de
 * impresión.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MessageCircle,
  Printer,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { ArchivoDelPlan, PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import { carpetasConArchivos, descargar, fecha, imprimirUno } from "./gtf-documentos-acciones";
import { DocumentosNoDisponibles, leerVista } from "./plan-documentos/plan-documentos-api";
import VistaPreviaDoc from "./plan-documentos/VistaPreviaDoc";
import EnviarPorWhatsApp from "./EnviarPorWhatsApp";


const BOTON =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50";
const ICONO =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

export default function GtfDocumentosModal({
  planId,
  permiso,
  gtfNumber,
  onClose,
}: {
  planId: string;
  /** Código del permiso, para el título y el mensaje. */
  permiso: string | null;
  gtfNumber: string;
  onClose: () => void;
}) {
  const [vista, setVista] = useState<PlanDocumentosVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [verId, setVerId] = useState<string | null>(null);
  const [enviar, setEnviar] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerVista(planId)
      .then((v) => vivo && setVista(v))
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(
          e instanceof DocumentosNoDisponibles
            ? e.message
            : `No se pudieron leer los documentos del permiso (${e instanceof Error ? e.message : String(e)}).`,
        );
      });
    return () => {
      vivo = false;
    };
  }, [planId]);

  const carpetas = useMemo(() => (vista ? carpetasConArchivos(vista) : []), [vista]);
  const todos = useMemo(() => carpetas.flatMap((c) => c.archivos), [carpetas]);
  const lista = todos.filter((a) => elegidos.has(a.documentId));
  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function imprimir(docs: readonly ArchivoDelPlan[]) {
    setImprimiendo(true);
    try {
      for (const d of docs) await imprimirUno(d);
    } finally {
      setImprimiendo(false);
    }
  }

  const titulo = permiso ? `Documentos del permiso ${permiso}` : "Documentos del permiso";
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      icon={FolderOpen}
      title="Documentos del permiso"
      /* El código del permiso va acá y no en el título: a 42rem el título largo se cortaba (08-10). */
      description={`${permiso ? `Permiso ${permiso} · ` : ""}GTF ${gtfNumber}`}
      footer={
        todos.length > 0 && !enviar ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <label className="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={lista.length === todos.length}
                onChange={(e) =>
                  setElegidos(
                    e.target.checked ? new Set(todos.map((a) => a.documentId)) : new Set(),
                  )
                }
              />
              {lista.length > 0 ? `${lista.length} de ${todos.length} elegidos` : "Elegir todos"}
            </label>
            <button
              type="button"
              className={BOTON}
              disabled={lista.length === 0}
              onClick={() => descargar(lista)}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Descargar
            </button>
            <button
              type="button"
              className={BOTON}
              disabled={lista.length === 0 || imprimiendo}
              onClick={() => void imprimir(lista)}
            >
              {imprimiendo ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="h-4 w-4" aria-hidden="true" />
              )}{" "}
              Imprimir
            </button>
            <button
              type="button"
              disabled={lista.length === 0}
              onClick={() => setEnviar(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Enviar por WhatsApp
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {error ? (
          <p
            role="alert"
            className="rounded-xl border-2 border-[var(--data-error-500)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          >
            {error}
          </p>
        ) : !vista ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo las carpetas del
            plan…
          </p>
        ) : carpetas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            El plan todavía no tiene carpetas. Créalas en Plan de manejo › Documentos.
          </p>
        ) : (
          <>
            {todos.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                Todavía no hay archivos en estas carpetas: súbelos en Plan de manejo › Documentos.
              </p>
            )}
            {carpetas.map((c) => (
              <section
                key={c.clave}
                aria-label={c.nombre}
                className="rounded-xl border border-[var(--rule-base)]"
              >
                <p className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                  <FolderOpen className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />{" "}
                  {c.nombre}
                  <span className="font-normal text-[var(--text-tertiary)]">
                    · {c.archivos.length}
                  </span>
                </p>
                {c.archivos.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--text-tertiary)]">Sin archivos.</p>
                ) : (
                  <ul className="divide-y divide-[var(--rule-soft)]">
                    {c.archivos.map((a) => (
                      <li key={a.documentId} className="flex items-center gap-2 px-3 py-1">
                        <input
                          type="checkbox"
                          aria-label={`Elegir ${a.nombre}`}
                          className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                          checked={elegidos.has(a.documentId)}
                          onChange={() => alternar(a.documentId)}
                        />
                        <button
                          type="button"
                          onClick={() => setVerId(a.documentId)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--text-primary)] hover:underline"
                        >
                          <FileText
                            className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
                            aria-hidden="true"
                          />
                          <span className="truncate">{a.nombre}</span>
                          <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                            {fecha(a.uploadedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={ICONO}
                          aria-label={`Ver ${a.nombre}`}
                          title="Ver"
                          onClick={() => setVerId(a.documentId)}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={ICONO}
                          aria-label={`Descargar ${a.nombre}`}
                          title="Descargar"
                          onClick={() => descargar([a])}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={ICONO}
                          aria-label={`Imprimir ${a.nombre}`}
                          title="Imprimir"
                          disabled={imprimiendo}
                          onClick={() => void imprimir([a])}
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </>
        )}

        {enviar && lista.length > 0 && (
          <EnviarPorWhatsApp
            documentos={lista.map((a) => ({ id: a.documentId, nombre: a.nombre }))}
            asunto={`${titulo} · GTF ${gtfNumber}`}
            referencia={`GTF ${gtfNumber}${permiso ? ` · permiso ${permiso}` : ""}`}
            onCerrar={() => setEnviar(false)}
          />
        )}
      </div>
      <VistaPreviaDoc docId={verId} onClose={() => setVerId(null)} />
    </AdminModal>
  );
}
