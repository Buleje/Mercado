"use client";

/** Una línea bajo «N° de GTF»: qué pasó al buscar la guía (Cubicador, 24-10). */
import { Check, Loader2, Info } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { CampoLlenable } from "@/lib/forestal/cubicacion-desde-guia";
import type { AvisoDeGuia } from "./hooks/use-ficha-desde-guia";

const NOMBRE: Record<CampoLlenable, string> = {
  comunidad: "CCNN", tituloHabilitante: "permiso", placa: "placa", chofer: "chofer", destino: "destino",
};
const DESHACER = button({ variant: "ghost", className: "h-9 rounded-md px-2 font-bold underline underline-offset-2" });
const LINEA = "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm";

export default function AvisoDeLaGuia({ aviso, onDeshacer }: { aviso: AvisoDeGuia | null; onDeshacer: () => void }) {
  if (!aviso) return null;
  if (aviso.tipo === "buscando") {
    return <p className={`${LINEA} text-[var(--text-secondary)]`} role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando la guía…</p>;
  }
  if (aviso.tipo === "llenado") {
    return (
      <p className={`${LINEA} text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`} role="status" data-aviso-guia="llenado">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        <span>Llenado desde la GTF {aviso.numero}: {aviso.campos.map((c) => NOMBRE[c]).join(", ")}.</span>
        <button type="button" onClick={onDeshacer} className={DESHACER}>Deshacer</button>
      </p>
    );
  }
  const texto = aviso.tipo === "no-esta"
    ? `No encontré la guía ${aviso.numero} entre las que emitiste: escribe los datos a mano.`
    : aviso.tipo === "nada-que-llenar"
      ? `La guía ${aviso.numero} existe, pero ya tienes escrito lo que ella trae.`
      : "No se pudo buscar la guía. Prueba de nuevo al salir del campo.";
  return <p className={`${LINEA} text-[var(--text-secondary)]`} role="status" data-aviso-guia={aviso.tipo}><Info className="h-4 w-4 shrink-0" aria-hidden /> {texto}</p>;
}
