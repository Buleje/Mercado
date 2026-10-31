"use client";

/**
 * ADR-513 — las huellas de celular (passkeys) que la persona registró desde el
 * enlace de firma. Se ve en qué celular y dominio, cuándo se usó, y el
 * admin/dueño la revoca si perdió o cambió el teléfono (el servidor decide el
 * permiso: a otro rol le contesta 403). Revocar no borra: lo firmado sigue
 * verificable. Sin passkeys no dibuja nada.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Fingerprint } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PasskeyDeLaPersona } from "@/lib/adelantos/passkey-tipos";

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export default function PasskeysDeLaPersona({ personaId, nombre }: { personaId: string; nombre: string }) {
  const { confirm } = useConfirm();
  const [lista, setLista] = useState<PasskeyDeLaPersona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);
  const base = `/api/adelantos/beneficiarios/${encodeURIComponent(personaId)}/passkeys`;

  const cargar = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json().catch(() => ({}))) as { passkeys?: PasskeyDeLaPersona[] };
    setLista(json.passkeys ?? []);
  }, [base]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (lista.length === 0) return null;

  async function revocar(p: PasskeyDeLaPersona) {
    const ok = await confirm({
      title: "¿Revocar la huella de su celular?",
      description: `${nombre} ya no podrá confirmar recibos con ese celular (registrado el ${fecha(p.creadaEn)}). Lo que ya firmó sigue valiendo. Después podrá registrar otro desde el próximo enlace de firma.`,
      intent: "danger",
      confirmLabel: "Revocar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setError(null);
    setRevocando(p.id);
    try {
      const res = await fetch(`${base}/${encodeURIComponent(p.id)}`, { method: "DELETE", headers: csrfHeaders() });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(res.status === 403 ? "Sólo el administrador o el dueño pueden revocarla." : (json.error ?? "No se pudo revocar."));
      await cargar();
    } finally {
      setRevocando(null);
    }
  }

  return (
    <section className="space-y-2" data-passkeys-persona>
      <div className="flex items-center gap-2">
        <CardTitle>Huella de su celular</CardTitle>
        <InfoTip
          title="Huella de su celular (passkey)"
          what="Se registró desde un enlace de firma, con el DNI de la persona: ese celular guarda una llave que sólo se abre con la huella o el PIN con que se desbloquea. El enlace registra un celular SÓLO si la persona no tiene ninguno."
          affects="Prueba que lo confirmó el aparato registrado para esta persona; no es su huella ante RENIEC y la página nunca la recibe. Quien tenía el enlace y el DNI pudo registrarlo: si no lo reconoces, revócalo. «Según su navegador» lo declara el propio navegador y se puede fingir."
          example="Perdió el celular o cambió de dominio: revoca el anterior y en el próximo enlace registra el nuevo."
        />
      </div>
      <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
        {lista.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <Fingerprint className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-[var(--text-primary)]">Celular registrado</span>
              <span className="text-[var(--text-secondary)]">
                {" "}
                · {p.rpId} · registrado {fecha(p.creadaEn)}
                {p.usadaEn ? ` · usado ${fecha(p.usadaEn)}` : ""}
                {p.navegador ? ` · según su navegador: ${p.navegador}` : ""}
                {p.nombrePuesto ? ` · nombre que puso quien lo registró: «${p.nombrePuesto}»` : ""}
              </span>
            </span>
            {p.revocadaEn ? (
              <span className="text-[var(--text-secondary)]">Revocada {fecha(p.revocadaEn)}</span>
            ) : (
              <button type="button" onClick={() => void revocar(p)} disabled={revocando === p.id} className={button({ variant: "secondary" })} data-revocar-passkey>
                {revocando === p.id ? "Revocando…" : "Revocar"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--data-error-ink,var(--data-error-700))]">
          {error}
        </p>
      )}
    </section>
  );
}
