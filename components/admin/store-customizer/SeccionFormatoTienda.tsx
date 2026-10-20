"use client";
/**
 * Apariencia › Identidad: «Formato de tu tienda» (ADR-511). Nuevo = la
 * plantilla nacida de Musa con los datos del negocio; Clásico = la página
 * general de antes. Y, en el nuevo, por dónde llegan los pedidos (checkout o
 * WhatsApp). Se guarda en `storeTheme.tiendaPlantilla` con el mismo «Guardar»
 * y la misma barra «sin guardar» que el resto de Apariencia.
 * Contrato: `extensiones/pagina-tienda/config.ts` (`leerPlantilla`).
 * Con página propia prendida (main, Musa) el formato no se ve hasta apagarla:
 * se avisa arriba y las opciones quedan atenuadas pero elegibles.
 */
import type { ReactNode } from "react";
import { Check, Info, LayoutTemplate, MessageCircle, ShoppingCart, Store, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import type { PlantillaTienda } from "@/extensiones/pagina-tienda/config";
import { usePaginaPropiaTienda } from "@/hooks/use-pagina-propia-tienda";
import { Bloque } from "./Bloque";

interface OpcionDe<V extends string> {
  valor: V;
  titulo: string;
  frase: string;
  icono: ReactNode;
}

const FORMATOS: OpcionDe<PlantillaTienda["formato"]>[] = [
  { valor: "tienda", titulo: "Nuevo (como Musa)", frase: "Portada con categorías, catálogo, ficha y bolsa, con tus fotos y precios.", icono: <Sparkles /> },
  { valor: "clasico", titulo: "Clásico", frase: "La de antes, con ventanas emergentes y cuenta regresiva.", icono: <Store /> },
];

const PEDIDOS: OpcionDe<PlantillaTienda["pedido"]>[] = [
  { valor: "checkout", titulo: "Checkout", frase: "Tu cliente deja sus datos y elige cómo pagar en tu tienda.", icono: <ShoppingCart /> },
  { valor: "whatsapp", titulo: "WhatsApp", frase: "La bolsa arma el pedido y te llega a tu WhatsApp.", icono: <MessageCircle /> },
];

function Grupo<V extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  opciones: OpcionDe<V>[];
  valor: V;
  onChange: (v: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="space-y-2">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{etiqueta}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => onChange(o.valor)}
              className={cn(
                "flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&>svg]:mt-0.5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0",
                activo ? "border-primary bg-[var(--surface-sunken)]" : "border-[var(--rule-base)] hover:border-primary",
              )}
            >
              {o.icono}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{o.titulo}</span>
                <span className="block text-sm text-[var(--text-secondary)]">{o.frase}</span>
              </span>
              {activo && <Check aria-hidden className="text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SeccionFormatoTienda({
  valor,
  whatsapp,
  onChange,
}: {
  valor: PlantillaTienda;
  whatsapp: string;
  onChange: (p: PlantillaTienda) => void;
}) {
  const propia = usePaginaPropiaTienda();
  const nuevo = valor.formato !== "clasico";
  const elegido = nuevo ? `Nuevo · pedidos por ${valor.pedido === "whatsapp" ? "WhatsApp" : "checkout"}` : "Clásico";
  const resumen = propia ? `Página propia · si la apagas: ${elegido}` : elegido;
  return (
    <Bloque
      icon={<LayoutTemplate className="text-primary" />}
      title="Formato de tu tienda"
      abierto
      resumen={resumen}
      description="Nuevo: tu tienda con el diseño de Musa (portada, categorías en círculos, catálogo, ficha y bolsa) y TUS datos. Clásico: la página de antes; las ventanas emergentes y la cuenta regresiva sólo se ven ahí. Se aplica al guardar."
    >
      <div className="space-y-4">
        {propia && (
          <p
            role="status"
            data-testid="formato-pagina-propia"
            className="flex items-start gap-2 rounded-xl border border-[var(--data-info-500)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]"
          >
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-info-500)]" />
            <span>
              Tu tienda usa su página propia ({propia.nombre}). Este formato se usa si la apagas.
            </span>
          </p>
        )}
        <div className={cn("space-y-4", propia && "opacity-70")}>
          <Grupo etiqueta="Formato" opciones={FORMATOS} valor={valor.formato} onChange={(formato) => onChange({ ...valor, formato })} />
          {nuevo && (
            <Grupo etiqueta="Pedidos por" opciones={PEDIDOS} valor={valor.pedido} onChange={(pedido) => onChange({ ...valor, pedido })} />
          )}
        </div>
        {nuevo && valor.pedido === "whatsapp" && !whatsapp.trim() && (
          <p role="status" className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]">
            Pon el WhatsApp de la tienda: ahí llegan los pedidos (sin él, se usa el teléfono del negocio, si hay).{" "}
            <EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=contacto">Ponlo en Contacto →</EnlacePanel>
          </p>
        )}
      </div>
    </Bloque>
  );
}
