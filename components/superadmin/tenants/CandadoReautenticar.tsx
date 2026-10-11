"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "@buleje/design-system/icons";
import type { ReauthEntrada } from "@/lib/superadmin/candado-reglas";

/**
 * «Confirma que eres tú»: la contraseña de superadmin y, si tiene 2FA, el código.
 * La piden configurar el candado por primera vez y «Olvidé mi candado»: con la
 * sesión sola (robada) no alcanza.
 */
export function CandadoReautenticar({
  totpActivo,
  textoBoton,
  ocupado,
  onListo,
}: {
  totpActivo: boolean;
  textoBoton: string;
  ocupado: boolean;
  onListo: (r: ReauthEntrada) => void;
}) {
  const [contrasena, setContrasena] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [ver, setVer] = useState(false);
  const listo = contrasena.length > 0 && (!totpActivo || /^\d{6}$/.test(totpCode));
  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo && !ocupado) onListo(totpActivo ? { contrasena, totpCode } : { contrasena });
      }}
    >
      <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="candado-reauth-clave">
        Tu contraseña de superadmin
      </label>
      <div className="relative">
        <input
          id="candado-reauth-clave"
          type={ver ? "text" : "password"}
          autoComplete="current-password"
          autoFocus
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar" : "Mostrar"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-tertiary)] hover:text-[var(--accent)]"
        >
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {totpActivo && (
        <>
          <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="candado-reauth-totp">
            Código de tu 2FA
          </label>
          <input
            id="candado-reauth-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-center font-mono text-base tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </>
      )}
      <button
        type="submit"
        disabled={!listo || ocupado}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} {textoBoton}
      </button>
    </form>
  );
}
