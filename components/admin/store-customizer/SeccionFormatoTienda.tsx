"use client";
/**
 * Apariencia › Identidad: «Formato de tu tienda» (ADR-511). Nuevo = la
 * plantilla nacida de Musa con los datos del negocio; Clásico = la página
 * general de antes. Se guarda en `storeTheme.tiendaPlantilla` con el mismo
 * «Guardar» y la misma barra «sin guardar» que el resto de Apariencia.
 * Contrato: `extensiones/pagina-tienda/config.ts` (`leerPlantilla`).
 * Por dónde llegan los pedidos (WhatsApp o formulario) ya NO va acá (20-10):
 * es `Settings.mode` para los dos formatos, en la tarjeta «Cómo te piden tus
 * clientes» (`TarjetaComoTePiden`) y en Ajustes › Datos del negocio.
 * Con página propia prendida (main, Musa) el formato no se ve hasta apagarla:
 * se avisa arriba y las opciones quedan atenuadas pero elegibles.
 */
import { Info, LayoutTemplate, Store, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlantillaTienda } from "@/extensiones/pagina-tienda/config";
import { usePaginaPropiaTienda } from "@/hooks/use-pagina-propia-tienda";
import { Bloque } from "./Bloque";
import { GrupoOpciones, type OpcionDe } from "./GrupoOpciones";

const FORMATOS: OpcionDe<PlantillaTienda["formato"]>[] = [
  { valor: "tienda", titulo: "Nuevo (como Musa)", frase: "Portada con categorías, catálogo, ficha y bolsa, con tus fotos y precios.", icono: <Sparkles /> },
  { valor: "clasico", titulo: "Clásico", frase: "La de antes, con ventanas emergentes y cuenta regresiva.", icono: <Store /> },
];

export function SeccionFormatoTienda({
  valor,
  onChange,
}: {
  valor: PlantillaTienda;
  onChange: (p: PlantillaTienda) => void;
}) {
  const propia = usePaginaPropiaTienda();
  const elegido = valor.formato !== "clasico" ? "Nuevo" : "Clásico";
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
          <GrupoOpciones etiqueta="Formato" opciones={FORMATOS} valor={valor.formato} onChange={(formato) => onChange({ ...valor, formato })} />
        </div>
      </div>
    </Bloque>
  );
}
