"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock, Copy, Check, ExternalLink, LogIn, Loader2, Link as LinkIcon } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCredencialesTienda } from "@/components/superadmin/tenants/useCredencialesTienda";
import { CandadoCredenciales } from "@/components/superadmin/tenants/CandadoCredenciales";
import { CredencialUsuario } from "@/components/superadmin/tenants/CredencialUsuario";

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Pestaña «Credenciales» de la ficha de una tienda (detrás del candado del
 * superadmin): dirección del panel, «Entrar como esta tienda» y los usuarios de
 * ingreso con «Generar contraseña nueva». Las contraseñas actuales no se pueden
 * leer: se guardan con bcrypt, sin vuelta atrás.
 */
export function TenantDetalleCredenciales({ t }: { t: TenantRow }) {
  const c = useCredencialesTienda(t.slug);
  const [cambiando, setCambiando] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [errorEntrar, setErrorEntrar] = useState<string | null>(null);
  const [totpActivo, setTotpActivo] = useState<boolean | null>(null);

  const abierto = c.estado.fase === "abierto";
  // Si el candado se cierra a mitad de un cambio, al reabrir se vuelve a la lista.
  useEffect(() => {
    if (!abierto) setCambiando(false);
  }, [abierto]);
  useEffect(() => {
    if (!abierto || totpActivo !== null) return;
    fetch("/api/superadmin/totp/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { activo?: boolean } | null) => setTotpActivo(d?.activo ?? false))
      .catch(() => setTotpActivo(false));
  }, [abierto, totpActivo]);

  if (c.estado.fase === "cargando") {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Cargando…</p>;
  }
  if (c.estado.fase === "error") {
    return <p role="alert" className="py-8 text-center text-sm text-[var(--data-error-600)]">{c.estado.mensaje}</p>;
  }
  if (c.estado.fase === "cerrado") {
    const k = c.estado.candado;
    return (
      <CandadoCredenciales
        key={`${k.configurado}-${k.bloqueadoHasta ?? 0}`}
        candado={k}
        onAbrir={c.abrir}
        onConfigurar={c.configurar}
      />
    );
  }

  const { datos } = c.estado;
  if (cambiando) {
    return (
      <CandadoCredenciales
        candado={{ configurado: true, tipo: datos.tipoCandado, bloqueadoHasta: null, totpActivo: totpActivo ?? false }}
        cambiar
        onAbrir={c.abrir}
        onConfigurar={async (tipo, secreto, actual) => {
          const e = await c.configurar(tipo, secreto, actual);
          if (!e) setCambiando(false);
          return e;
        }}
        onCancelar={() => setCambiando(false)}
      />
    );
  }

  const entrar = async () => {
    setEntrando(true);
    setErrorEntrar(null);
    setErrorEntrar(await c.entrar());
    setEntrando(false);
  };

  return (
    <div className="space-y-4">
      {/* Estado del candado en una fila: cuánto le queda y cómo cerrarlo o cambiarlo. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)]/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Unlock className="h-3.5 w-3.5 text-[var(--data-success-600)]" aria-hidden="true" />
          Candado abierto · se cierra en <span className="font-mono tabular-nums">{reloj(c.segundosRestantes)}</span>
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCambiando(true)}
            className="h-8 rounded-lg px-2.5 text-xs font-semibold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
          >
            Cambiar candado
          </button>
          <button
            type="button"
            onClick={() => void c.cerrar()}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <Lock className="h-3.5 w-3.5" /> Cerrar candado
          </button>
        </div>
      </div>

      {/* Dónde se entra y entrar como la tienda. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] p-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" /> Dirección del panel
          </p>
          <p className="mt-0.5 truncate font-mono text-sm font-semibold text-[var(--text-primary)] select-all">{datos.ingreso.url}</p>
        </div>
        <button
          type="button"
          aria-label="Copiar la dirección"
          title="Copiar"
          onClick={() => {
            void navigator.clipboard.writeText(datos.ingreso.url);
            setCopiada(true);
            setTimeout(() => setCopiada(false), 2000);
          }}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
        >
          {copiada ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={datos.ingreso.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir la dirección"
          title="Abrir"
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={() => void entrar()}
          disabled={entrando || !datos.tienda.activa}
          title={!datos.tienda.activa ? "La tienda está inactiva" : "Abre su panel en otra pestaña (10 min, queda en la auditoría)"}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {entrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Entrar como esta tienda
        </button>
      </div>
      {errorEntrar && <p role="alert" className="text-xs font-semibold text-[var(--data-error-600)]">{errorEntrar}</p>}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-[var(--text-tertiary)]">Usuarios de ingreso ({datos.usuarios.length})</h3>
          <InfoTip
            title="Contraseñas"
            what="Las contraseñas se guardan cifradas sin vuelta atrás: nadie puede leer la actual, ni tú."
            affects="«Generar contraseña nueva» pide el código de tu 2FA, reemplaza la de ese usuario por una temporal, avisa al dueño y la muestra una sola vez."
            example="Al entrar con la temporal, el sistema le pide crear su propia contraseña."
          />
        </div>
        {totpActivo === false && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Para generar contraseñas activa tu 2FA en{" "}
            <a href="/superadmin/security" className="font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] underline">
              Seguridad
            </a>
            .
          </p>
        )}
        {datos.usuarios.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">Esta tienda no tiene usuarios de ingreso.</p>
        ) : (
          <ul className="space-y-2">
            {datos.usuarios.map((u) => (
              <CredencialUsuario
                key={u.id}
                u={u}
                generada={c.generada}
                totpActivo={totpActivo}
                telefonoDueno={datos.tienda.telefonoDueno}
                nombreTienda={datos.tienda.nombre}
                urlIngreso={datos.ingreso.url}
                onGenerar={c.generar}
                onOlvidar={c.olvidarGenerada}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
