"use client";

/**
 * «Lo que se declara»: el resumen por especie (con su precio) y el detalle
 * paquete por paquete, en dos pestañas (ADR-429).
 *
 * Brandon (22-09): «la tabla de detalle en otra sección, bien ordenada». Las
 * dos tablas hablan de lo mismo —una suma, la otra lista—, así que van juntas
 * y se alternan: apiladas empujaban el precio, que es lo que se viene a poner,
 * debajo de un listado de paquetes. El contador va en la pestaña: se ve cuánto
 * hay sin entrar.
 */
import { useId, useState } from "react";
import type {
  PaqueteDeclarable,
  ResumenEspecieTipo,
  TipoServicio,
} from "@/lib/forestal/declarar-produccion";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { PrecioDeEspecie } from "./hooks/declarar-produccion-pantalla";
import CtpDetallePaquetes from "./CtpDetallePaquetes";
import CtpResumenEspecieTipo from "./CtpResumenEspecieTipo";

type Vista = "resumen" | "detalle";

export default function CtpLoQueSeDeclara({
  resumen,
  paquetes,
  servicio,
  lineas,
  onPrecio,
}: {
  resumen: ResumenEspecieTipo;
  paquetes: readonly PaqueteDeclarable[];
  servicio: TipoServicio | null;
  lineas: readonly PrecioDeEspecie[];
  onPrecio: (clave: string, texto: string) => void;
}) {
  const [vista, setVista] = useState<Vista>("resumen");
  const id = useId();
  /* Lo «sin especie» no es una especie ni será una corrida: no se cuenta como tal. */
  const especies = resumen.especies.filter((e) => claveEspecie(e.especie)).length;
  const pestanas: { id: Vista; label: string; detalle: string }[] = [
    {
      id: "resumen",
      label: "Resumen por especie",
      detalle: `${especies} ${especies === 1 ? "especie" : "especies"}`,
    },
    {
      id: "detalle",
      label: "Detalle",
      detalle: `${paquetes.length} ${paquetes.length === 1 ? "paquete" : "paquetes"}`,
    },
  ];

  return (
    <>
      <div
        role="tablist"
        aria-label="Lo que se declara"
        className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 sm:col-span-12"
      >
        {pestanas.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={vista === t.id}
            aria-controls={`${id}-panel`}
            onClick={() => setVista(t.id)}
            className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${
              vista === t.id
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}{" "}
            <span className="text-xs font-normal text-[var(--text-tertiary)]">{t.detalle}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${vista}`}
        className="min-w-0 sm:col-span-12"
      >
        {vista === "resumen" ? (
          <CtpResumenEspecieTipo
            resumen={resumen}
            servicio={servicio}
            lineas={lineas}
            onPrecio={onPrecio}
          />
        ) : (
          <CtpDetallePaquetes paquetes={paquetes} />
        )}
      </div>
    </>
  );
}
