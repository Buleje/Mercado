"use client";

import { useState } from "react";
import { Copy, Check, Loader2, RotateCcw, MessageSquare, ShieldCheck, AlertTriangle } from "@buleje/design-system/icons";
import type { UsuarioCredencial } from "@/lib/superadmin/candado-reglas";
import type { ContrasenaGenerada } from "@/components/superadmin/tenants/useCredencialesTienda";
import { fmtDT } from "@/components/superadmin/tenants/tenant-detalle-shared";

const ROL: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  manager: "Encargado",
  cajero: "Cajero",
  almacenero: "Almacenero",
};

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

/**
 * Un usuario de ingreso de la tienda en la pestaña «Credenciales»: quién es, cómo
 * está su acceso y «Generar contraseña nueva» (pide el código de tu 2FA; la clave
 * se muestra UNA vez con copiar y, si hay teléfono del dueño, enviar por WhatsApp).
 */
export function CredencialUsuario({
  u,
  generada,
  totpActivo,
  telefonoDueno,
  nombreTienda,
  urlIngreso,
  onGenerar,
  onOlvidar,
}: {
  u: UsuarioCredencial;
  generada: ContrasenaGenerada | null;
  /** `null` = todavía no se sabe. */
  totpActivo: boolean | null;
  telefonoDueno: string | null;
  nombreTienda: string;
  urlIngreso: string;
  onGenerar: (adminUserId: string, totpCode: string) => Promise<string | null>;
  onOlvidar: () => void;
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const mia = generada?.adminUserId === u.id ? generada : null;

  const generar = async () => {
    setOcupado(true);
    setError(null);
    const e = await onGenerar(u.id, codigo);
    setOcupado(false);
    if (e) setError(e);
    else {
      setPidiendo(false);
      setCodigo("");
    }
  };

  const copiar = () => {
    if (!mia) return;
    void navigator.clipboard.writeText(mia.clave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <li className="rounded-xl border border-[var(--rule-base)] p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)] select-all">{u.usuario}</span>
            {u.nombre && <span className="text-sm text-[var(--text-secondary)] truncate">{u.nombre}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`${CHIP} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>{ROL[u.rol] ?? u.rol}</span>
            {!u.activo && <span className={`${CHIP} bg-[var(--surface-sunken)] text-[var(--text-tertiary)]`}>Inactivo</span>}
            {u.debeCambiarContrasena && (
              <span className={`${CHIP} bg-[var(--data-warning-50)] text-[var(--data-warning-700)]`}>Debe cambiar la contraseña</span>
            )}
            {u.dobleFactor && (
              <span className={`${CHIP} bg-[var(--data-success-50)] text-[var(--data-success-700)]`}>
                <ShieldCheck className="h-3 w-3" aria-hidden="true" /> 2FA
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {u.correo ?? "Sin correo"} · Último ingreso: {u.ultimoIngreso ? fmtDT(u.ultimoIngreso) : "sin registro"}
          </p>
        </div>
        {u.activo && !pidiendo && !mia && (
          <button
            type="button"
            onClick={() => setPidiendo(true)}
            disabled={totpActivo === false}
            title={totpActivo === false ? "Activa tu 2FA en Seguridad para generar contraseñas" : undefined}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Generar contraseña nueva
          </button>
        )}
      </div>

      {pidiendo && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-sunken)]/60 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(codigo) && !ocupado) void generar();
          }}
        >
          <label htmlFor={`totp-${u.id}`} className="text-xs font-semibold text-[var(--text-secondary)]">
            Código de tu 2FA
          </label>
          <input
            id={`totp-${u.id}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-9 w-28 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-center font-mono text-sm tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!/^\d{6}$/.test(codigo) || ocupado}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-50"
          >
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Generar
          </button>
          <button
            type="button"
            onClick={() => {
              setPidiendo(false);
              setError(null);
            }}
            className="h-9 rounded-lg px-2 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-[var(--data-error-600)]">{error}</p>}

      {mia && (
        <div className="space-y-2 rounded-lg border-2 border-[var(--accent)]/40 bg-[var(--surface-sunken)]/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Contraseña temporal · se muestra una sola vez
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 select-all rounded bg-[var(--surface-raised)] px-2 py-1 font-mono text-sm font-extrabold text-[var(--text-primary)]">
              {mia.clave}
            </code>
            <button type="button" onClick={copiar} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white">
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? "Copiada" : "Copiar"}
            </button>
            <button type="button" onClick={onOlvidar} className="h-8 rounded-lg px-2 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              Ya la entregué
            </button>
          </div>
          {telefonoDueno && (
            <a
              href={`https://wa.me/${telefonoDueno.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Hola, soy del equipo de Buleje. Reseteamos un acceso al panel de ${nombreTienda}.\n\nUsuario: ${mia.usuario}\nContraseña temporal: ${mia.clave}\n\nEntra a ${urlIngreso} y al ingresar te pedirá crear tu propia contraseña. Esta temporal es de un solo uso.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-success-600)] px-3 py-1.5 text-xs font-extrabold text-white hover:opacity-90"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Enviar al dueño por WhatsApp
            </a>
          )}
          <p className="text-xs text-[var(--text-tertiary)]">Al entrar con ella, el sistema le pide crear su propia contraseña.</p>
        </div>
      )}
    </li>
  );
}
