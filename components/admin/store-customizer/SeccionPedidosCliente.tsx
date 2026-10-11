"use client";
/**
 * Apariencia › Pedidos: cuatro interruptores de «cómo te piden» en tu tienda
 * (entrar con Google, pedir celular, pedir ubicación, pedido por WhatsApp en
 * imagen). Se guardan dentro del tema de la tienda, por el mismo «Guardar» y
 * la misma barra «sin guardar» que las demás secciones de Apariencia.
 * Contrato: `lib/tienda-cliente/contrato.ts`.
 */
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { Bloque } from "./Bloque";
import type { ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";

const OPCIONES: { clave: keyof ConfigPedidosCliente; titulo: string; frase: string }[] = [
  { clave: "loginGoogle", titulo: "Entrar con Google", frase: "Tu cliente toca un botón y su nombre se llena solo, sin escribirlo cada vez." },
  { clave: "pedirCelular", titulo: "Pedir el celular", frase: "Antes de mandar el pedido, le pides su número para que puedas escribirle." },
  { clave: "pedirUbicacion", titulo: "Pedir la ubicación en vivo", frase: "Tu cliente comparte dónde está con su celular y tú recibes el punto en el mapa." },
  { clave: "pedidoComoImagen", titulo: "Pedido por WhatsApp como imagen", frase: "Además del texto, el pedido llega como una imagen con productos, precios y datos del cliente." },
];

function Interruptor({ activo, onChange, etiqueta }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onChange(!activo)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        activo ? "border-primary bg-primary" : "border-transparent bg-[var(--surface-sunken)]",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-[var(--surface-raised)] shadow transition-transform duration-[var(--dur-base)]",
          activo ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function SeccionPedidosCliente({
  config,
  whatsapp,
  onChange,
}: {
  config: ConfigPedidosCliente;
  whatsapp: string;
  onChange: (c: ConfigPedidosCliente) => void;
}) {
  const activas = OPCIONES.filter((o) => config[o.clave]).length;
  return (
    <div className="space-y-3">
      {!whatsapp.trim() && (
        <p role="status" className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]">
          Aún no pusiste tu número de WhatsApp, así que los pedidos no tienen a dónde llegar.{" "}
          <EnlacePanel href="/admin?tab=pagina-inicio&vista=apariencia&sub=contacto">Ponlo en Contacto →</EnlacePanel>
        </p>
      )}
      <Bloque
        icon={<MessageSquare className="text-primary" />}
        title="Cómo te piden"
        abierto
        resumen={`${activas} de ${OPCIONES.length} activadas`}
        description="Lo que tu cliente ve y hace en tu tienda al pedirte. Apaga lo que no necesites; se aplica al guardar."
      >
        <ul className="divide-y divide-[var(--rule-soft)]">
          {OPCIONES.map((o) => (
            <li key={o.clave} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{o.titulo}</p>
                <p className="text-sm text-[var(--text-secondary)]">{o.frase}</p>
              </div>
              <Interruptor activo={config[o.clave]} etiqueta={o.titulo} onChange={(v) => onChange({ ...config, [o.clave]: v })} />
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  );
}
