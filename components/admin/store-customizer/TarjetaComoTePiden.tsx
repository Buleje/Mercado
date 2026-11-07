"use client";
/**
 * Arriba de Tienda online › Apariencia (Identidad y Pedidos): «Cómo te piden
 * tus clientes» — WhatsApp o Formulario de compra (Brandon 20-10: «en qué
 * parte se pone para activar si la tienda sea tipo WhatsApp o de tienda»).
 * Es el MISMO ajuste que Ajustes › Datos del negocio (`Settings.mode`, única
 * fuente, `use-modo-pedido.ts`): vale para el formato Nuevo y el Clásico y se
 * guarda al elegir. Con página propia (main, Musa) la decide esa página: se
 * avisa y la elección queda para cuando la apagues.
 */
import { Info, MessageCircle, ShoppingCart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { usePaginaPropiaTienda } from "@/hooks/use-pagina-propia-tienda";
import { Bloque } from "./Bloque";
import { GrupoOpciones, type OpcionDe } from "./GrupoOpciones";
import { useModoPedido, type ModoPedido } from "./use-modo-pedido";

const MODOS: OpcionDe<ModoPedido>[] = [
  { valor: "whatsapp", titulo: "WhatsApp", frase: "La bolsa arma el pedido y te llega a tu WhatsApp.", icono: <MessageCircle /> },
  { valor: "checkout", titulo: "Formulario de compra", frase: "Tu cliente deja sus datos y elige cómo pagar en tu tienda.", icono: <ShoppingCart /> },
];

const AYUDA =
  "WhatsApp: el cliente arma su bolsa y te manda el pedido a tu WhatsApp. Formulario de compra: deja nombre, dirección y forma de pago sin salir de tu tienda. Vale para el formato Nuevo y el Clásico, es el mismo ajuste de Ajustes › Datos del negocio y se guarda al elegir.";

const AVISO = "flex items-start gap-2 rounded-xl border bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]";

export function TarjetaComoTePiden({ whatsapp, enPedidos = false }: { whatsapp: string; enPedidos?: boolean }) {
  const propia = usePaginaPropiaTienda();
  const { modo, estado, error, cambiar, reintentar } = useModoPedido();
  // En Pedidos, `SeccionPedidosCliente` ya avisa si falta el número: no dos avisos iguales.
  const sinNumero = !enPedidos && modo === "whatsapp" && !whatsapp.trim();

  return (
    <div data-testid="tarjeta-como-te-piden">
      <Bloque icon={<MessageCircle className="text-primary" />} title="Cómo te piden tus clientes" description={AYUDA} fijo>
        <div className="space-y-3">
          {propia && (
            <p role="status" data-testid="como-te-piden-pagina-propia" className={cn(AVISO, "border-[var(--data-info-500)]")}>
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-info-500)]" />
              <span>Tu tienda usa su página propia ({propia.nombre}): ella decide cómo te piden. Esto vale si la apagas.</span>
            </p>
          )}
          {estado === "error" && modo === null ? (
            <p role="alert" className={cn(AVISO, "border-[var(--data-error-500)]")}>
              <span className="flex-1">{error}</span>
              <button type="button" onClick={reintentar} className="shrink-0 font-semibold text-[var(--accent-ink)] underline underline-offset-2">
                Reintentar
              </button>
            </p>
          ) : (
            <div className={cn(propia && "opacity-70")}>
              <GrupoOpciones
                etiqueta="Cómo te piden tus clientes"
                ocultarEtiqueta
                opciones={MODOS}
                valor={modo}
                onChange={(m) => void cambiar(m)}
                deshabilitado={estado === "cargando" || estado === "guardando"}
              />
            </div>
          )}
          <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
            {estado === "cargando" && <span>Cargando…</span>}
            {estado === "guardando" && <span>Guardando…</span>}
            {estado === "guardado" && <span className="font-semibold text-[var(--data-success-ink)]">Guardado</span>}
            {estado === "error" && modo !== null && <span className="text-[var(--data-error-ink)]">{error}</span>}
            {!enPedidos && (
              <EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=pedidos">Qué datos pedir →</EnlacePanel>
            )}
          </p>
          {sinNumero && (
            <p role="status" className={cn(AVISO, "border-[var(--data-warning-500)]")}>
              <span>
                Pon el WhatsApp de la tienda: ahí llegan los pedidos (sin él, se usa el teléfono del negocio, si hay).{" "}
                <EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=contacto">Ponlo en Contacto →</EnlacePanel>
              </span>
            </p>
          )}
        </div>
      </Bloque>
    </div>
  );
}
