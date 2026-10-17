"use client";

import { useState } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldAlert, Smartphone } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import QrImagen from "@/components/tv/QrImagen";
import { useDosPasos } from "./use-dos-pasos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const LIMA_MS = 5 * 60 * 60 * 1000;

function fechaLima(iso: string): string {
  const d = new Date(new Date(iso).getTime() - LIMA_MS);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** «JBSWY3DPEHPK3PXP» → «JBSW Y3DP EHPK 3PXP»: se copia a mano sin perderse. */
function enGrupos(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

const PROTEGE =
  "Purgar o borrar una tienda, resetear la clave de un admin y quitarle el 2 pasos a un admin piden el código de tu app. Sin 2 pasos activos esas acciones quedan bloqueadas (412).";

export function DosPasosTab() {
  const { estado, alta, ocupado, error, empezar, confirmar, cancelar } = useDosPasos();
  const [codigo, setCodigo] = useState("");
  const [copiado, setCopiado] = useState(false);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <SectionTitle>Dos pasos</SectionTitle>
        <InfoTip
          title="Verificación en dos pasos"
          what="Además de la clave, un código de 6 números que cambia cada 30 segundos en tu celular (Google Authenticator, Microsoft Authenticator, 1Password)."
          affects={PROTEGE}
          example="Te roban la clave del superadmin: sin tu celular no pueden purgar ninguna tienda."
        />
        {estado && <span className="ml-auto text-xs text-[var(--text-tertiary)]">Cuenta: {estado.usuario}</span>}
      </header>

      {!estado && !error && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo tu estado…
        </p>
      )}

      {estado?.activo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-[var(--data-success-500)]" aria-hidden />
          <span className="font-bold text-[var(--text-primary)]">
            Activo desde {estado.desde ? fechaLima(estado.desde) : "—"}
          </span>
          <InfoTip
            title="Cambiar de celular"
            what="Agrega la misma clave manual a la app del celular nuevo antes de borrar la del viejo."
            affects="Rotar la clave desde aquí no está disponible: el alta la reemplazaría antes de confirmar el código nuevo y te dejaría sin acceso a las acciones protegidas."
          />
        </div>
      )}

      {estado && !estado.activo && !alta && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--surface-raised)] px-3 py-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          <span className="min-w-0 flex-1 basis-60 text-sm font-bold text-[var(--text-primary)]">
            Sin 2 pasos: purgar, borrar tiendas y resetear claves están bloqueados
          </span>
          <button
            type="button"
            onClick={() => void empezar()}
            disabled={ocupado}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            Activar 2 pasos
          </button>
        </div>
      )}

      {alta && (
        <section className="grid gap-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <QrImagen texto={alta.otpauthUrl} lado={200} alt="Código QR para tu app de autenticación" className="h-[200px] w-[200px] rounded-lg bg-white p-1" />
            <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
              <Smartphone className="h-3.5 w-3.5" aria-hidden /> Escanéalo con tu app
            </span>
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>1. Agrega la cuenta</CardTitle>
                <InfoTip
                  title="Clave manual"
                  what="Si la cámara no lee el QR, escribe esta clave en la app (tipo: basada en tiempo)."
                  affects="Guárdala en un lugar seguro: es tu respaldo para pasar los 2 pasos a otro celular. No hay códigos de respaldo aparte."
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-lg bg-[var(--surface-sunken)] px-2 py-1 font-mono text-sm text-[var(--text-primary)]">
                  {enGrupos(alta.secret)}
                </code>
                <button
                  type="button"
                  onClick={() => void copiar(alta.secret)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> {copiado ? "Copiada" : "Copiar"}
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar(codigo).then((ok) => ok && setCodigo(""));
              }}
            >
              <CardTitle>2. Escribe el código de 6 números</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  aria-label="Código de 6 números"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-10 w-36 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-center font-mono text-lg tracking-[0.3em] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={ocupado || codigo.length !== 6}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Confirmar y activar
                </button>
                <button type="button" onClick={cancelar} className="h-10 rounded-lg px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-600,var(--data-error-500))]">
          {error}
        </p>
      )}
    </div>
  );
}
