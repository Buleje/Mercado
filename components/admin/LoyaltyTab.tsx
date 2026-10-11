"use client";

/**
 * Crecimiento › Puntos. Patrón del panel (11-10): título · Indicadores · Más
 * en una fila; buscador y «Con puntos» pegados a la tabla; la ficha del
 * elegido al lado. 571 → ~130 líneas; la lógica en crecimiento/puntos/.
 *
 * Lo que se fue y por qué (nada con dato real):
 *  · «Vencimiento de puntos» + el select de 3/6/12 meses: inventaba la fecha
 *    («última actividad = hace 30 días») y el select no se guardaba en ningún
 *    lado. El programa no vence puntos.
 *  · «Saldo a favor»: sumaba a `creditBalance`, la columna del FIADO usado
 *    (`updateCreditBalance`: delta > 0 = «gasta más fiado», con tope en el
 *    límite de crédito). «+20 a favor» registraba S/ 20 más de deuda.
 *  · «Notificaciones de puntos» (5 clientes de toda la lista dentro de la
 *    ficha de UNO): queda «Avisarle por WhatsApp» en la ficha y «Copiar
 *    avisos para todos» en Más.
 *  · Contadores de referidos: leían `referralCode` de /api/customers, que no
 *    lo trae (salían 0 siempre).
 */
import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Copy, MoreHorizontal, RefreshCw, Search } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useTenant } from "@/contexts/tenant-context";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FichaPuntos } from "@/components/admin/crecimiento/puntos/FichaPuntos";
import { ListaPuntos } from "@/components/admin/crecimiento/puntos/ListaPuntos";
import { mensajeDePuntos, VALOR_PUNTO } from "@/components/admin/crecimiento/puntos/mensajes";
import { useIndicadoresPuntos } from "@/components/admin/crecimiento/puntos/use-indicadores-puntos";
import { usePuntos } from "@/components/admin/crecimiento/puntos/use-puntos";

const ID_FICHA = "ficha-puntos";

export default function LoyaltyTab() {
  const p = usePuntos();
  const negocio = useTenant().branding.name?.trim() || "nuestra tienda";
  const [busqueda, setBusqueda] = useState("");
  const [soloConPuntos, setSoloConPuntos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const kpis = useIndicadoresPuntos(p.metricas, p.loading);

  const copiar = (texto: string, que = "Copiado") => {
    void navigator.clipboard.writeText(texto).then(() => {
      setAviso(que);
      setTimeout(() => setAviso(null), 2500);
    });
  };

  const elegir = (phone: string) => {
    void p.elegir(phone);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => document.getElementById(ID_FICHA)?.scrollIntoView({ block: "start" }));
    }
  };

  const q = busqueda.trim().toLowerCase();
  const conPuntos = p.clientes.filter((c) => c.loyaltyPoints > 0);
  const filtrados = (soloConPuntos ? conPuntos : p.clientes).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q),
  );

  const acciones: MenuAccion[] = [
    {
      id: "avisos",
      label: "Copiar avisos para todos",
      hint: `Un mensaje por cliente con puntos (${conPuntos.length}), para pegar en WhatsApp`,
      icon: Copy,
      disabled: conPuntos.length === 0,
      onSelect: () => copiar(conPuntos.map((c) => `${c.name} (${c.phone}): ${mensajeDePuntos(c.name, c.loyaltyPoints, negocio)}`).join("\n\n"), `${conPuntos.length} avisos copiados`),
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: p.recargar },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Puntos</SectionTitle>
          <InfoTip
            title="Puntos"
            what={`Cada compra con celular suma puntos; 1 punto vale ${formatCurrency(VALOR_PUNTO)} de descuento al canjear. El nivel (bronce, plata, oro, diamante) sube con lo que el cliente gastó.`}
            affects="Los VIP de Campañas son los de nivel oro y diamante."
            example={`Rosa tiene 120 puntos: puede descontar ${formatCurrency(120 * VALOR_PUNTO)} en su próxima compra.`}
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Copiar avisos y actualizar" />
        </div>
      </div>

      {kpis.panel}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative h-12 min-w-0 grow basis-full sm:basis-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o celular"
            aria-label="Buscar cliente por nombre o celular"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          aria-pressed={soloConPuntos}
          onClick={() => setSoloConPuntos((v) => !v)}
          className={button({
            variant: "secondary",
            className: cn("shrink-0 rounded-xl px-3 text-sm", soloConPuntos ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]"),
          })}
        >
          Con puntos ({conPuntos.length})
        </button>
        {aviso && <span role="status" className="text-sm font-semibold text-[var(--data-success-ink)]">{aviso}</span>}
      </div>

      {p.error && p.clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-[var(--data-error-500)]" aria-hidden />
          <p className="text-sm text-[var(--data-error-ink)]">No se pudieron cargar los clientes.</p>
          <button type="button" onClick={p.recargar} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>Reintentar</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] lg:col-span-2">
            {p.loading && p.clientes.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Cargando clientes…</p>
            ) : filtrados.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--text-secondary)]">{q || soloConPuntos ? "Nadie con ese filtro." : "Aún no tienes clientes."}</p>
            ) : (
              <div className="max-h-[36rem] overflow-y-auto">
                <ListaPuntos clientes={filtrados} elegido={p.elegido?.phone ?? null} onElegir={elegir} />
              </div>
            )}
            {p.hayMas && !q && (
              <button type="button" onClick={() => { void p.cargarMas(); }} disabled={p.cargandoMas} className="h-12 w-full border-t border-[var(--rule-soft)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/5 disabled:opacity-60 dark:text-[var(--accent)]">
                {p.cargandoMas ? "Cargando…" : "Cargar más clientes"}
              </button>
            )}
          </div>
          {/* En el celular la ficha va ARRIBA de la lista: abajo quedaba a 15 tarjetas de distancia. */}
          <div id={ID_FICHA} className="scroll-mt-20 max-lg:order-first">
            <FichaPuntos key={p.elegido?.phone ?? "ninguno"} p={p} negocio={negocio} onCopiar={(t) => copiar(t)} />
          </div>
        </div>
      )}
    </div>
  );
}
