"use client";

/**
 * Paso 1 de «Nueva cotización» (F25): elegir al cliente de tu lista o darlo de
 * alta sin salir de la ventana. Lo escrito no se vuelve a pedir: el nombre
 * pasa al alta y, al guardarlo, queda elegido. Si el RUC/DNI ya es de otro
 * cliente se avisa y se ofrece usarlo; nunca se juntan solos.
 */
import { useState } from "react";
import { Hash, Loader2, User, UserCheck, UserPlus } from "@buleje/design-system/icons";
import ClienteFormModal, { type ClienteGuardado } from "@/components/admin/clientes/ClienteFormModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { nombreDeCliente, type ClienteDeLista } from "./tipos";
import { useBuscarClientes, useClientePorCelular } from "./use-buscar-clientes";
import type { FormNuevaCotizacion } from "./use-nueva-cotizacion";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "mb-1 flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]";
const ICONO = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]";

const soloDigitos = (s: string) => s.replace(/\D/g, "");
const celularCorto = (phone: string) => {
  const d = soloDigitos(phone);
  return d.length > 9 ? d.slice(-9) : d;
};
const docDe = (c: ClienteDeLista) => (c.documento ? `${c.tipoDocumento?.toUpperCase() || "Doc."} ${c.documento}` : "");

function FilaCliente({ c, onUsar }: { c: ClienteDeLista; onUsar: () => void }) {
  const doc = docDe(c);
  return (
    <li>
      <button type="button" onClick={onUsar} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--text-primary)]">{nombreDeCliente(c)}</span>
          <span className="block truncate text-[var(--text-secondary)]">{[doc, `cel. ${celularCorto(c.phone)}`].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="shrink-0 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">Usar</span>
      </button>
    </li>
  );
}

export function PasoCliente({ form }: { form: FormNuevaCotizacion }) {
  const { cliente, clienteNombre, clienteRuc, elegirCliente, soltarCliente } = form;
  const [alta, setAlta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const traerPorCelular = useClientePorCelular();

  const nombres = useBuscarClientes(clienteNombre, !cliente);
  const ruc = soloDigitos(clienteRuc);
  const porDoc = useBuscarClientes(ruc, !cliente && ruc.length >= 8);
  const mismoDoc = !cliente && ruc.length >= 8 ? porDoc.resultados.find((c) => soloDigitos(c.documento ?? "") === ruc) : undefined;

  const alGuardar = async (g?: ClienteGuardado) => {
    if (!g?.phone) return;
    const deLista = await traerPorCelular(g.phone);
    elegirCliente(deLista ?? { phone: g.phone, nombre: g.name, documento: g.documento, tipoDocumento: g.tipoDocumento });
    setAviso(deLista ? null : "Se guardó; si no lo ves en tu lista, actualiza Clientes.");
  };

  if (cliente) {
    const doc = docDe(cliente);
    return (
      <div className="space-y-2">
        <span className={ROTULO}>Cliente</span>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <UserCheck className="h-5 w-5 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--text-primary)]">{clienteNombre || nombreDeCliente(cliente)}</p>
            <p className="truncate text-sm text-[var(--text-secondary)]">
              De tu lista de clientes{doc ? ` · ${doc}` : ""} · cel. {celularCorto(cliente.phone)}
            </p>
          </div>
          <button type="button" onClick={soltarCliente} className={button({ variant: "ghost", className: "rounded-xl px-4" })}>Cambiar</button>
        </div>
        {aviso && <p className="text-sm text-[var(--text-secondary)]">{aviso}</p>}
      </div>
    );
  }

  /* Si escribió un celular en el buscador, el alta lo recibe como celular, no como nombre. */
  const escritoEsCelular = /^\+?[\d\s]{6,}$/.test(clienteNombre.trim());
  const sinResultados = nombres.buscando && !nombres.cargando && !nombres.error && nombres.resultados.length === 0;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={ROTULO}>
            <label htmlFor="cot-cliente">Cliente</label>
            <InfoTip
              title="Cliente de la cotización"
              what="Escribe su nombre, RUC/DNI o celular: aparecen los de tu lista de clientes."
              affects="Elegido de tu lista, la cotización queda unida a su ficha (nombre, documento y celular para recordarle). Si no está, «Nuevo cliente» lo da de alta con lo que ya escribiste."
              example="Escribes «colegio» y eliges «I.E. San Martín»: el RUC se llena solo."
            />
          </span>
          <button type="button" onClick={() => setAlta(true)} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl px-3 text-[var(--accent-ink)] dark:text-[var(--accent)]" })}>
            <UserPlus className="h-4 w-4" aria-hidden /> Nuevo cliente
          </button>
        </div>
        <span className="relative block">
          <User className={ICONO} aria-hidden />
          <input
            id="cot-cliente"
            type="text"
            value={clienteNombre}
            onChange={(e) => form.setClienteNombre(e.target.value)}
            placeholder="Nombre, razón social, RUC/DNI o celular"
            className={INPUT}
            autoComplete="off"
            autoFocus
            aria-describedby="cot-cliente-estado"
          />
          {nombres.cargando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" aria-hidden />}
        </span>
        <div id="cot-cliente-estado" aria-live="polite">
          {nombres.resultados.length > 0 && (
            <ul className="mt-1 max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" aria-label="Clientes de tu lista">
              {nombres.resultados.map((c) => <FilaCliente key={c.phone} c={c} onUsar={() => elegirCliente(c)} />)}
            </ul>
          )}
          {sinResultados && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              No está en tu lista. Puedes seguir con el nombre escrito o{" "}
              <button type="button" onClick={() => setAlta(true)} className="min-h-12 font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]">darlo de alta</button>.
            </p>
          )}
          {nombres.error && <p className="mt-1 text-sm text-[var(--text-secondary)]">No se pudo buscar en tu lista; puedes escribir el nombre igual.</p>}
        </div>
      </div>

      <div>
        <label htmlFor="cot-ruc" className={ROTULO}>RUC o DNI (opcional)</label>
        <span className="relative block">
          <Hash className={ICONO} aria-hidden />
          <input id="cot-ruc" type="text" inputMode="numeric" value={clienteRuc} onChange={(e) => form.setClienteRuc(e.target.value)} placeholder="20XXXXXXXXX" maxLength={20} className={INPUT} />
        </span>
        {mismoDoc && (
          <div role="status" className={cn("mt-2 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm", "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10")}>
            <span className="min-w-0 flex-1 text-[var(--text-primary)]">
              Este documento ya es de <strong>{nombreDeCliente(mismoDoc)}</strong> en tu lista (cel. {celularCorto(mismoDoc.phone)}).
            </span>
            <button type="button" onClick={() => elegirCliente(mismoDoc)} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Usar este</button>
          </div>
        )}
      </div>

      <ClienteFormModal
        isOpen={alta}
        onClose={() => setAlta(false)}
        onSaved={(g) => void alGuardar(g)}
        initialFormat="simple"
        initialName={escritoEsCelular ? "" : clienteNombre.trim()}
        initialPhone={escritoEsCelular ? soloDigitos(clienteNombre).slice(-9) : undefined}
        initialDocumento={ruc}
        aboveModals
      />
    </div>
  );
}
