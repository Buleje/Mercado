"use client";

/**
 * Un mensaje de Buleje IA: el texto (Markdown en las respuestas), las fotos en
 * miniatura, lo que quedó anotado, las tarjetas «¿Confirmas?», los papeles y,
 * en chiquito, qué modelo contestó.
 */
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { MarkdownContent } from "@/components/admin/chat-ia/MarkdownContent";
import { horaLima } from "./formato";
import type { MensajeVista, Resolucion } from "./optimista";
import { TarjetaPapel, TarjetaPendiente } from "./TarjetasIa";

function Miniaturas({ fotos }: { fotos: Array<{ nombre: string; url: string }> }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Fotos adjuntas">
      {fotos.map((f) => (
        <li key={f.url}>
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="block" title={f.nombre}>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: local o la ruta de Documentos con la sesión */}
            <img src={f.url} alt={f.nombre} className="h-20 w-20 rounded-lg border border-[var(--rule-base)] object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}


/** El texto del mensaje solo repite lo que ya dice la tarjeta de lo anotado. */
function repiteRegistrada(m: MensajeVista): boolean {
  const regs = m.registradas ?? [];
  if (regs.length === 0) return false;
  const texto = m.texto.replace(/^[^\p{L}\d]+/u, "").trim();
  return regs.some((r) => texto === r.resumen.trim() || texto.includes(r.resumen.trim()));
}

export function MensajeIa({
  mensaje: m,
  resueltas,
  onResolver,
  onReintentar,
  onDescartar,
}: {
  mensaje: MensajeVista;
  resueltas: Record<string, Resolucion>;
  onResolver: (id: string, decision: "aprobar" | "rechazar") => void;
  onReintentar: (id: string) => void;
  onDescartar: (id: string) => void;
}) {
  const esUsuario = m.rol === "user";
  const fotos = m.fotosLocales ?? m.adjuntos?.map((a) => ({ nombre: a.nombre, url: a.url })) ?? [];

  if (esUsuario) {
    return (
      <div className="flex flex-col items-end">
        <div
          className={`max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 ${
            m.estado === "error"
              ? "border-2 border-[var(--data-error-500)] bg-[var(--surface-raised)]"
              : "bg-[var(--accent-dark)] text-white"
          } ${m.estado === "enviando" ? "opacity-80" : ""}`}
        >
          {fotos.length > 0 && <Miniaturas fotos={fotos} />}
          <p className="whitespace-pre-wrap break-words text-sm">{m.texto}</p>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          {m.estado === "enviando" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Mandando…
            </>
          ) : m.estado === "error" ? null : (
            horaLima(m.creadoEl)
          )}
        </p>
        {m.estado === "error" && (
          <div className="mt-1 flex max-w-[85%] flex-col items-end gap-2" role="alert">
            <p className="flex items-start gap-1.5 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> No se mandó: {m.error}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => onReintentar(m.id)}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
              </Button>
              <Button variant="ghost" onClick={() => onDescartar(m.id)}>
                <X className="h-4 w-4" aria-hidden /> Quitar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-primary)]">
        {fotos.length > 0 && <Miniaturas fotos={fotos} />}
        {/* Tras confirmar, el texto («✅ Anotado: …») repite la tarjeta verde: va solo la tarjeta. */}
        {!repiteRegistrada(m) && <MarkdownContent text={m.texto} />}

        {m.registradas && m.registradas.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {m.registradas.map((r, i) => (
              <li
                key={`${r.resumen}-${i}`}
                className="flex items-start gap-2 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] px-3 py-2 text-sm text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {!/^anotad[oa]\b/i.test(r.resumen) && <strong>Anotado. </strong>}
                  {r.resumen}
                  {r.pantalla && <span className="block text-xs opacity-80">Lo ves en: {r.pantalla}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {m.pendientes && m.pendientes.length > 0 && (
          <div className="mt-3 space-y-2">
            {m.pendientes.map((p) => (
              <TarjetaPendiente key={p.id} pendiente={p} resolucion={resueltas[p.id]} onResolver={onResolver} />
            ))}
          </div>
        )}

        {m.papeles && m.papeles.length > 0 && (
          <div className="mt-3 space-y-2">
            {m.papeles.map((p) => (
              <TarjetaPapel key={`${p.url}-${p.titulo}`} papel={p} />
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
        {horaLima(m.creadoEl)}
        {m.modelo && (
          <>
            {" · "}
            {m.modelo.deLaPlataforma ? `IA de la plataforma (${m.modelo.modelo})` : `${m.modelo.proveedor} · ${m.modelo.modelo}`}
          </>
        )}
      </p>
    </div>
  );
}
