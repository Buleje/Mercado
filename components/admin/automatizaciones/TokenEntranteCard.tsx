"use client";

/**
 * TokenEntranteCard — la credencial con la que n8n anota operaciones acá.
 *
 * Se llama «Token para n8n» y no «Anotar desde afuera» porque eso último ya lo
 * dice el encabezado del módulo: dos títulos iguales en la misma pantalla hacen
 * dudar de si son la misma cosa.
 *
 * Separada del panel porque es la mitad que se lee UNA vez (copiar el token,
 * pegarlo en n8n) frente a la que se usa siempre (los flujos). Juntas, la
 * pantalla arrancaba con tres párrafos de configuración antes de lo operativo.
 */

import { KeyRound, Copy, Check, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, WarningAlert } from "@buleje/design-system";

interface Props {
  /** `null` cuando falta `AUTH_SECRET` y no hay credencial que emitir. */
  token: string | null;
  ejemploCurl: string;
  /** Clave del último elemento copiado, para el tilde de acuse. */
  copiado: string | null;
  onCopiar: (texto: string, clave: string) => void;
  onRotar: () => void;
}

export default function TokenEntranteCard({ token, ejemploCurl, copiado, onCopiar, onRotar }: Props) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
          <CardTitle className="font-extrabold">Token para n8n</CardTitle>
        </div>
        <button
          type="button"
          onClick={onRotar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rotar token
        </button>
      </div>

      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        Pegá este token en el nodo <strong>HTTP Request</strong> de n8n. Con eso, un audio de
        WhatsApp que n8n transcriba llega acá como operación: te devuelve el resumen para que se
        lo hagas confirmar a la persona, y recién ahí se anota.
      </p>

      {token ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-3 py-2.5 font-mono text-[length:var(--ts-xs)] text-[var(--text-primary)]">
              {token}
            </code>
            <button
              type="button"
              onClick={() => onCopiar(token, "token")}
              aria-label="Copiar token"
              className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] hover:border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {copiado === "token" ? <Check className="h-4 w-4 text-[var(--data-success-500)]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <details className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
            <summary className="cursor-pointer px-3 py-2.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Cómo se llama (copiar y pegar)
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)] leading-relaxed">
{ejemploCurl}
              </pre>
              <button
                type="button"
                onClick={() => onCopiar(ejemploCurl, "curl")}
                className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {copiado === "curl" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copiar el ejemplo
              </button>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-relaxed">
                Devuelve <code className="font-mono">estado: &quot;pendiente&quot;</code> con un{" "}
                <code className="font-mono">aprobacionId</code> y el resumen. Para confirmarlo, volvé a
                llamar con <code className="font-mono">{`{"aprobacionId":"…","decision":"aprobar"}`}</code>{" "}
                — tenés 10 minutos. Si tu flujo ya le preguntó a la persona, mandá{" "}
                <code className="font-mono">{`"confirmar": true`}</code> y se anota de una.
              </p>
            </div>
          </details>
        </>
      ) : (
        <WarningAlert>
          No se puede emitir el token porque falta <code className="font-mono">AUTH_SECRET</code> en el
          entorno. Configuralo y recargá.
        </WarningAlert>
      )}
    </section>
  );
}
