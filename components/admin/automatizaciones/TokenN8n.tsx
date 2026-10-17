"use client";

/**
 * TokenN8n — la credencial con la que n8n anota operaciones acá.
 *
 * Es la mitad que se lee UNA vez (copiar el token, pegarlo en n8n) frente a
 * la que se usa siempre (los flujos): una fila con el token y sus dos
 * acciones, y el ejemplo para copiar plegado debajo. Lo que explica —qué nodo
 * de n8n, cómo se confirma— va en los ⓘ, no en párrafos.
 */

import { Check, Copy, KeyRound, RefreshCw } from "@buleje/design-system/icons";
import Plegable from "@/components/admin/shared/Plegable";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { accion48, icono48, LineaAviso } from "./piezas-canal";

interface Props {
  /** `null` cuando falta `AUTH_SECRET` y no hay credencial que emitir. */
  token: string | null;
  ejemploCurl: string;
  /** Clave del último elemento copiado, para el tilde de acuse. */
  copiado: string | null;
  onCopiar: (texto: string, clave: string) => void;
  onRotar: () => void;
}

export default function TokenN8n({ token, ejemploCurl, copiado, onCopiar, onRotar }: Props) {
  if (!token) {
    return (
      <LineaAviso
        titulo="Token para n8n"
        ayuda="Sin AUTH_SECRET en el entorno no se puede emitir el token. Configúralo y recarga."
      >
        Sin token para n8n: falta AUTH_SECRET.
      </LineaAviso>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          <KeyRound aria-hidden="true" className="h-4 w-4" />
          Token
          <InfoTip
            title="Token para n8n"
            what="Pega este token en el nodo HTTP Request de n8n. Con eso, un audio de WhatsApp que n8n transcriba llega acá como operación."
            affects="Te devuelve el resumen para que se lo hagas confirmar a la persona; recién ahí se anota."
            side="bottom"
          />
        </span>
        <code className="min-w-0 flex-1 basis-48 truncate rounded-lg bg-[var(--surface-sunken)] px-3 py-3 font-mono text-sm text-[var(--text-primary)]">
          {token}
        </code>
        <button type="button" onClick={() => onCopiar(token, "token")} aria-label="Copiar token" title="Copiar token" className={icono48}>
          {copiado === "token" ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" /> : <Copy className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onRotar} aria-label="Rotar el token" title="Rotar el token" className={icono48}>
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <Plegable
        clave="asistente-ia:automatizaciones:n8n:ejemplo"
        variante="franja"
        titulo="Ejemplo para copiar"
        acciones={
          <InfoTip
            title="Cómo se confirma"
            what="Devuelve estado «pendiente» con un aprobacionId y el resumen. Para confirmarlo, vuelve a llamar con aprobacionId y decision «aprobar»: tienes 10 minutos."
            example="Si tu flujo ya le preguntó a la persona, manda «confirmar: true» y se anota de una."
            side="left"
          />
        }
      >
        <div className="space-y-2">
          <pre className="overflow-x-auto rounded-lg bg-[var(--surface-sunken)] p-3 font-mono text-sm leading-relaxed text-[var(--text-secondary)]">
            {ejemploCurl}
          </pre>
          <button type="button" onClick={() => onCopiar(ejemploCurl, "curl")} className={accion48}>
            {copiado === "curl" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copiar el ejemplo
          </button>
        </div>
      </Plegable>
    </div>
  );
}
