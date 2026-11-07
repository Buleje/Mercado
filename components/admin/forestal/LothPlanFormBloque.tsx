import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** Un paso del formulario, numerado: el alta tiene un orden, no doce campos sueltos. */
export default function Bloque({
  n,
  titulo,
  children,
  accion,
  ayuda,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
  /** Algo a la derecha del título (por ejemplo, traer datos del Directorio). */
  accion?: React.ReactNode;
  /** Consejo del bloque, en el ⓘ junto al título (Brandon 2026-09-24: nada de párrafos sueltos). */
  ayuda?: { what: React.ReactNode; example?: React.ReactNode };
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
              {n}
            </span>
            {titulo}
          </CardTitle>
          {ayuda && <InfoTip icono="ayuda" title={titulo} what={ayuda.what} example={ayuda.example} />}
        </span>
        {accion}
      </div>
      {children}
    </section>
  );
}
