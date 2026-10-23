"use client";

import { useState, type FormEvent } from "react";
import { Bell, BellOff, ChevronDown, Loader2, Mail, Search } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ChipEstado } from "@/components/superadmin/tenants/TenantDetalleChip";
import { useCorreosPlataforma } from "@/components/superadmin/tenants/useCorreosPlataforma";
import { csrfHeaders } from "@/lib/csrf-client";
import type { TiendaCorreoEstado } from "@/lib/avisos-correo-plataforma-tipos";

const CAJA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

/** Una tienda cuyo dueño tiene el correo buscado, con su interruptor general (el de la pestaña Avisos por correo). */
function FilaTienda({ t, onCambio }: { t: TiendaCorreoEstado; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);
  const cambiar = async () => {
    setGuardando(true);
    setError(false);
    try {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(t.slug)}/avisos-correo`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pausado: !t.pausado }),
      });
      if (!res.ok) setError(true);
      else onCambio();
    } catch {
      setError(true);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">{t.name}</p>
        <p className="truncate text-xs text-[var(--text-secondary)]">
          {t.slug} · {t.pausado ? "Avisos pausados" : "Avisos activos"}
          {error && <span className="ml-2 font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">No se guardó</span>}
        </p>
      </div>
      <ChipEstado tono={t.pausado ? "alerta" : "ok"}>{t.pausado ? "Pausados" : "Activos"}</ChipEstado>
      <button type="button" onClick={() => void cambiar()} disabled={guardando} className={button({ variant: t.pausado ? "primary" : "secondary", size: "md" })}>
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : t.pausado ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        {t.pausado ? "Habilitar" : "Deshabilitar"}
      </button>
    </li>
  );
}

/** Bloque «Correos que te llegan»: lo que la plataforma manda a tu correo, con interruptor por correo y un buscador por dirección. */
export function CorreosPlataforma() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const { datos, cargando, error, errorGuardar, guardando, recargar, cambiarGeneral, cambiarTipo } = useCorreosPlataforma(buscado);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setBuscado(texto.trim());
  };

  const encendidos = datos ? (datos.pausado ? 0 : datos.tipos.filter((t) => t.activo).length) : 0;
  const resumen = !datos ? (error ?? "Cargando…") : datos.pausado ? "Todos pausados" : `${encendidos} de ${datos.tipos.length} activos`;

  return (
    <section className={`${CAJA} overflow-hidden`} aria-label="Correos que te llegan">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Mail className={`h-5 w-5 shrink-0 ${datos?.pausado ? "text-[var(--text-tertiary)]" : "text-[var(--accent)]"}`} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <CardTitle>Correos que te llegan</CardTitle>
          <InfoTip
            title="Correos de la plataforma"
            what="Los correos que la plataforma te manda a ti (no a los dueños de las tiendas): precio del cacao, carritos abandonados, resumen diario, cierres de caja y alertas del sistema."
            affects="Si apagas uno, deja de salir en el acto. Los avisos de cada tienda a su dueño se manejan en la ficha de la tienda."
            example="Apaga «Precio del cacao» y mañana a las 7:00 ya no te llega."
          />
          <span className="truncate text-xs text-[var(--text-secondary)]">{resumen}</span>
        </div>
        {datos && (
          <button
            type="button"
            onClick={() => void cambiarGeneral(!datos.pausado)}
            disabled={guardando !== null}
            className={button({ variant: datos.pausado ? "primary" : "secondary", size: "md" })}
          >
            {guardando === "general" ? <Loader2 className="h-4 w-4 animate-spin" /> : datos.pausado ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {datos.pausado ? "Habilitar todos" : "Deshabilitar todos"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? "Ocultar detalle" : "Ver detalle"}
          className={button({ variant: "ghost", size: "md" })}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </button>
      </div>

      {abierto && (
        <div className="space-y-5 border-t border-[var(--rule-soft)] p-4">
          {error && !datos && <p role="alert" className="text-sm font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{error}</p>}
          {errorGuardar && <p role="alert" className="text-sm font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{errorGuardar}</p>}

          {datos && (
            <div className={`space-y-2 ${datos.pausado ? "opacity-70" : ""}`}>
              {datos.tipos.map((x) => (
                <Interruptor
                  key={x.tipo}
                  label={x.nombre}
                  enabled={x.activo}
                  disabled={guardando !== null}
                  onChange={(v) => void cambiarTipo(x.tipo, v)}
                  desc={
                    <>
                      {x.descripcion}
                      <span className="mt-0.5 block text-[var(--text-tertiary)]">{x.destino ? `Llega a ${x.destino}` : "Sin correo configurado: no sale"}</span>
                    </>
                  }
                />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <CardTitle>¿Qué le llega a este correo?</CardTitle>
              <InfoTip
                title="Buscar por correo"
                what="Escribe un correo y verás qué correos de la plataforma van a esa dirección y qué tiendas lo tienen como correo del dueño, cada una con su interruptor."
                example="bulejelauea@gmail.com: el precio del cacao, el resumen diario y las tiendas luis y buleje."
              />
            </div>
            <form onSubmit={buscar} className="flex flex-wrap gap-2">
              <input
                type="email"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Correo de la plataforma"
                aria-label="Correo a buscar"
                className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
              />
              <button type="submit" className={button({ variant: "secondary", size: "md" })}>
                <Search className="h-4 w-4" /> Buscar
              </button>
            </form>
            {cargando && !datos && <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>}
            {datos && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  <span className="font-bold text-[var(--text-primary)]">{datos.consulta ?? "Sin correo"}</span>
                  {datos.tiposALaConsulta.length > 0
                    ? ` recibe ${datos.tiposALaConsulta.length} de la plataforma: ${datos.tipos.filter((t) => datos.tiposALaConsulta.includes(t.tipo)).map((t) => t.nombre).join(", ")}.`
                    : " no recibe correos de la plataforma."}
                </p>
                {datos.tiendas.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Ninguna tienda tiene ese correo como dueño.</p>
                ) : (
                  <ul className={`${CAJA} divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]`}>
                    {datos.tiendas.map((t) => (
                      <FilaTienda key={t.id} t={t} onCambio={() => void recargar()} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
