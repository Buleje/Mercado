"use client";

/**
 * ADR-513 — «Confirmar con mi huella»: la huella del celular (la que desbloquea
 * el teléfono) como passkey de la persona. La página nunca recibe la huella:
 * el celular la mira y firma un reto atado a ESTE adelanto y monto.
 *
 * Sin llave → la crea (create) y enseguida confirma (get); con llave → sólo
 * confirma. Si la persona ya tiene OTRO celular registrado, el enlace no suma
 * uno nuevo: el servidor contesta «pídele al administrador que revoque el
 * anterior» (revisión de seguridad 23-10). La confirmación viaja con «Firmar».
 */

import { useEffect, useState } from "react";
import {
  WebAuthnError,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { CheckCircle2, Fingerprint } from "@buleje/design-system/icons";
import { TEXTO_CONSENTIMIENTO_PASSKEY, type OpcionesPasskeyRespuesta } from "@/lib/adelantos/passkey-tipos";

class FalloServidor extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

async function pedir(token: string, paso: "opciones" | "registrar", cuerpo: unknown): Promise<OpcionesPasskeyRespuesta> {
  const res = await fetch(`/api/public/adelantos/${encodeURIComponent(token)}/passkey/${paso}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const json: Record<string, unknown> = await res.json().catch(() => ({}));
  if (res.status === 429) throw new FalloServidor("Hiciste muchos intentos. Espera unos minutos y vuelve a probar.", null);
  if (!res.ok) throw new FalloServidor(typeof json.error === "string" ? json.error : "No se pudo usar la huella del celular.", typeof json.code === "string" ? json.code : null);
  return json as unknown as OpcionesPasskeyRespuesta;
}

export default function PasskeyPublica({
  token,
  documento,
  confirmada,
  onConfirmada,
  deshabilitado,
}: {
  token: string;
  documento: string;
  confirmada: boolean;
  onConfirmada: (r: AuthenticationResponseJSON | null) => void;
  deshabilitado: boolean;
}) {
  const [puede, setPuede] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!browserSupportsWebAuthn()) return;
    platformAuthenticatorIsAvailable()
      .then((si) => vivo && setPuede(si))
      .catch(() => vivo && setPuede(false));
    return () => {
      vivo = false;
    };
  }, []);

  if (!puede) return null;

  async function confirmar() {
    setAviso(null);
    setTrabajando(true);
    let modo: "registrar" | "confirmar" = "registrar";
    try {
      let r = await pedir(token, "opciones", { documento });
      modo = r.modo;
      if (r.modo === "registrar") {
        try {
          const reg = await startRegistration({ optionsJSON: r.opciones as unknown as PublicKeyCredentialCreationOptionsJSON });
          r = await pedir(token, "registrar", { respuesta: reg });
        } catch (e) {
          /* Este celular ya tenía su llave: se confirma con ella. */
          if (!(e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")) throw e;
          r = await pedir(token, "opciones", { documento });
        }
      }
      modo = "confirmar";
      const auth = await startAuthentication({ optionsJSON: r.opciones as unknown as PublicKeyCredentialRequestOptionsJSON });
      onConfirmada(auth);
    } catch (e) {
      onConfirmada(null);
      if (e instanceof FalloServidor) return setAviso(e.message);
      const nombre = e instanceof Error ? e.name : "";
      /* NotAllowed = canceló, venció, o la llave registrada está en OTRO celular. */
      if (nombre === "NotAllowedError" || (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED")) {
        return setAviso(
          modo === "confirmar"
            ? "El celular no lo confirmó. Vuelve a tocar el botón. Si cambiaste de celular, pídele al administrador que revoque el anterior; mientras tanto usa la foto de tu huella."
            : "El celular no lo confirmó. Vuelve a tocar el botón.",
        );
      }
      setAviso("Este celular no pudo usar tu huella. Usa la foto de tu huella.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section aria-labelledby="passkey-titulo" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <h2 id="passkey-titulo" className="text-lg font-bold text-[var(--text-primary)]">
        Tu huella con el celular
      </h2>
      {confirmada ? (
        <p role="status" className="flex items-center gap-2 text-base font-semibold text-[var(--data-success-ink,var(--data-success))]">
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
          Tu celular lo confirmó. Ahora toca «Firmar».
        </p>
      ) : (
        <>
          <p className="text-base text-[var(--text-secondary)]">Pon tu dedo donde desbloqueas el celular. {TEXTO_CONSENTIMIENTO_PASSKEY}</p>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={deshabilitado || trabajando}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-lg font-bold text-white disabled:opacity-60"
          >
            <Fingerprint className="h-6 w-6" aria-hidden />
            {trabajando ? "Esperando al celular…" : "Confirmar con mi huella"}
          </button>
        </>
      )}
      {aviso && (
        <p role="alert" className="text-base font-medium text-[var(--data-error-ink,var(--data-error-700))]">
          {aviso}
        </p>
      )}
    </section>
  );
}
