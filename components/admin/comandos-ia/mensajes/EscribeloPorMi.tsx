"use client";
/**
 * «Escríbelo por mí» — una línea con lo que quieres avisar + dónde va
 * (WhatsApp, cartel A4 o texto para la tienda). La IA lo redacta con los datos
 * del negocio leídos en el servidor; se abre la vista previa. No guarda nada.
 */
import { useRef, useState, type FormEvent } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, Loader2, MessageCircle, Store, WandSparkles, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import CartelVistaPrevia from "./CartelVistaPrevia";
import { BOTON_PRIMARIO, CHIP_ACTIVO, CHIP_BASE, CHIP_INACTIVO, costoTexto, pedirEscrito, textoDeError, type Escrito, type Salida } from "./use-mensajes";

const SALIDAS: { id: Salida; label: string; icon: LucideIcon }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "cartel", label: "Cartel A4", icon: FileText },
  { id: "tienda", label: "Para la tienda", icon: Store },
];

/** Misma cuenta que `escribir/route.ts` usa para pedir permiso al tope. */
const COSTO_ESTIMADO = (450 + 700) * 0.000001;

export default function EscribeloPorMi({ vacio }: { vacio?: boolean }) {
  const [pedido, setPedido] = useState("");
  const [salida, setSalida] = useState<Salida>("whatsapp");
  const [escribiendo, setEscribiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escrito, setEscrito] = useState<Escrito | null>(null);
  // «Escribir» se deshabilita mientras la IA trabaja y suelta el foco: al cerrar
  // la vista previa vuelve al campo, listo para el siguiente aviso.
  const campo = useRef<HTMLInputElement>(null);
  const cerrarVista = () => {
    setEscrito(null);
    window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 0);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const t = pedido.trim();
    if (t.length < 3 || escribiendo) return;
    setEscribiendo(true);
    setError(null);
    try {
      setEscrito(await pedirEscrito(t, salida));
    } catch (err) {
      setError(textoDeError(err, "No pude escribirlo."));
    } finally {
      setEscribiendo(false);
    }
  };

  return (
    <section
      aria-labelledby="ci-escribelo-titulo"
      className={cn(
        "rounded-2xl border p-3 sm:p-4",
        vacio ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      <div className="flex items-center gap-2">
        <WandSparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <CardTitle id="ci-escribelo-titulo" as="h3">Escríbelo por mí</CardTitle>
        <InfoTip
          title="Escríbelo por mí"
          what="Dile qué quieres avisar y la IA lo escribe con el nombre, horario, Yape y dirección de tu negocio."
          affects="No guarda nada: lo copias, lo imprimes o abres WhatsApp. No hace formatos oficiales (guías, libros, liquidaciones)."
          example="«cerramos el domingo 12 por inventario» → cartel A4 listo para imprimir."
          side="bottom"
        />
      </div>

      <form onSubmit={enviar} className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          ref={campo}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          maxLength={300}
          placeholder="Ej.: cerramos el domingo 12 por inventario"
          aria-label="Qué quieres avisar"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          data-escribelo-pedido
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Dónde va" className="flex flex-wrap gap-1.5">
            {SALIDAS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={salida === id}
                onClick={() => setSalida(id)}
                className={cn(CHIP_BASE, salida === id ? CHIP_ACTIVO : CHIP_INACTIVO)}
                data-salida={id}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs tabular-nums text-[var(--text-tertiary)] lg:ml-0">IA ≈ {costoTexto(COSTO_ESTIMADO)}</span>
          <button type="submit" className={BOTON_PRIMARIO} disabled={escribiendo || pedido.trim().length < 3} data-escribelo-enviar>
            {escribiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <WandSparkles className="h-4 w-4" aria-hidden />}
            Escribir
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      )}

      {escrito && <CartelVistaPrevia key={`${escrito.salida}-${escrito.texto.length}`} escrito={escrito} onCerrar={cerrarVista} />}
    </section>
  );
}
