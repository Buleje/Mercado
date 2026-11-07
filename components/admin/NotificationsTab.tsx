"use client";

/**
 * Mensajes › Avisos por pedido.
 *
 * Una fila de cabecera (título + ⓘ · «Avisar a un cliente» · Más), una fila de
 * filtros pegada a la tabla y el historial, un aviso por fila con el mensaje en
 * una línea. Avisar se hace en una ventana; el detalle de cada aviso, en otra.
 *
 * Antes (medido 11-10, main): 393 textos < 14 px; «Total enviados 108» contaba
 * también las alertas al dueño, las pendientes y las que fallaron; el buscador
 * de pedidos leía `customerName` de la rama de `/api/orders` que trae `customer.name`
^ * (todos «Sin nombre», sin celular → «Enviar por WhatsApp» no hacía nada), y
 * ese botón era blanco sobre turquesa al 10 %.
 */
import { useMemo, useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertCircle, MoreHorizontal, RefreshCw, Search, Send } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ModalAvisarCliente } from "@/components/admin/avisos/ModalAvisarCliente";
import { ModalDetalleAviso } from "@/components/admin/avisos/ModalDetalleAviso";
import { TablaAvisos } from "@/components/admin/avisos/TablaAvisos";
import { cuando, pasaFiltro, paraQuien, rotuloTipo, type Aviso, type FiltroAvisos } from "@/components/admin/avisos/tipos";
import { useAvisos } from "@/components/admin/avisos/use-avisos";

const POR_PAGINA = 20;

const CHIP = "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

const FILTROS: { clave: FiltroAvisos; rotulo: string }[] = [
  { clave: "clientes", rotulo: "A clientes" },
  { clave: "alertas", rotulo: "Alertas para ti" },
  { clave: "error", rotulo: "Fallaron" },
  { clave: "todos", rotulo: "Todos" },
];

const VACIO: Record<FiltroAvisos, string> = {
  clientes: "Todavía no avisaste a ningún cliente: «Avisar a un cliente» arma el mensaje del estado de su pedido.",
  alertas: "Sin alertas para ti todavía.",
  error: "Ningún aviso falló.",
  todos: "Todavía no salió ningún aviso.",
};

export default function NotificationsTab() {
  const { avisos, error, recargar } = useAvisos();
  const [filtro, setFiltro] = useState<FiltroAvisos>("clientes");
  const [texto, setTexto] = useState("");
  const [cuantos, setCuantos] = useState(POR_PAGINA);
  const [avisando, setAvisando] = useState(false);
  const [viendo, setViendo] = useState<Aviso | null>(null);

  const cuentas = useMemo(() => {
    const c: Record<FiltroAvisos, number> = { clientes: 0, alertas: 0, error: 0, todos: 0 };
    for (const a of avisos ?? []) for (const f of FILTROS) if (pasaFiltro(a, f.clave)) c[f.clave] += 1;
    return c;
  }, [avisos]);

  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (avisos ?? []).filter((a) => pasaFiltro(a, filtro) && (!q || `${a.recipient} ${paraQuien(a.recipient)} ${a.message} ${a.orderId ?? ""} ${rotuloTipo(a.type)}`.toLowerCase().includes(q)));
  }, [avisos, filtro, texto]);

  const ultimo = avisos?.[0];
  const acciones: MenuAccion[] = [{ id: "actualizar", label: "Actualizar", hint: "Vuelve a traer el historial", icon: RefreshCw, onSelect: recargar }];

  return (
    <div className="space-y-3">
      {/* Una fila: título · ⓘ · Avisar a un cliente · Más. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Avisos por pedido</SectionTitle>
          <InfoTip
            title="Avisos por pedido"
            what="El mensaje de WhatsApp que le avisa al cliente cómo va su pedido, y el historial de todo lo que salió: a tus clientes y las alertas que el sistema te manda a ti (stock bajo, reporte diario)."
            affects="Nada sale solo: el mensaje se arma según el estado del pedido y WhatsApp se abre con el texto listo para que lo mandes."
            example={ultimo ? `Último: ${rotuloTipo(ultimo.type)} para ${paraQuien(ultimo.recipient)}, ${cuando(ultimo.createdAt)}.` : "«Tu pedido va en camino» cuando sale el repartidor."}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setAvisando(true)} className={button({ variant: "primary", className: "rounded-xl" })}>
            <Send className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Avisar a un cliente</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar" />
        </div>
      </div>

      {/* Filtros pegados a la tabla: buscador · a quién · los que fallaron. */}
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <label className="relative min-w-0 grow basis-full sm:basis-60">
          <span className="sr-only">Buscar avisos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setCuantos(POR_PAGINA); }}
            placeholder="Buscar por celular, mensaje o N° de pedido…"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </label>
        <div role="group" aria-label="Qué avisos ver" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              aria-pressed={filtro === f.clave}
              onClick={() => { setFiltro(f.clave); setCuantos(POR_PAGINA); }}
              className={cn(CHIP, filtro === f.clave ? CHIP_ON : CHIP_OFF)}
            >
              {f.rotulo}
              {avisos && f.clave !== "todos" && <span className="tabular-nums text-[var(--text-secondary)]">{cuentas[f.clave]}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && !avisos ? (
        <p className="flex items-center gap-2 text-sm text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo traer el historial.
          <button type="button" onClick={recargar} className="font-semibold underline underline-offset-2">Reintentar</button>
        </p>
      ) : !avisos ? (
        <LoadingState />
      ) : filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">{texto.trim() ? `Ningún aviso coincide con «${texto.trim()}».` : VACIO[filtro]}</p>
      ) : (
        <>
          <TablaAvisos avisos={filas.slice(0, cuantos)} onVer={setViendo} />
          {filas.length > cuantos && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[var(--text-secondary)]">{cuantos} de {filas.length}</p>
              <button type="button" onClick={() => setCuantos((n) => n + POR_PAGINA)} className={button({ variant: "secondary", className: "rounded-xl" })}>
                Ver {Math.min(POR_PAGINA, filas.length - cuantos)} más
              </button>
            </div>
          )}
        </>
      )}

      <ModalAvisarCliente abierto={avisando} onCerrar={() => setAvisando(false)} onAvisado={recargar} />
      <ModalDetalleAviso aviso={viendo} onCerrar={() => setViendo(null)} />
    </div>
  );
}
