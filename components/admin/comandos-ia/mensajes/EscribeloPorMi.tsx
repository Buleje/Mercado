"use client";
/**
 * «Escríbelo por mí» — una línea con lo que quieres avisar + dónde va
 * (WhatsApp, cartel A4 o texto para la tienda). La IA lo redacta con los datos
 * del negocio leídos en el servidor; se abre la vista previa. No guarda nada.
 *
 * 10-10: segunda acción del MISMO bloque, «Ofrécele algo» (viene de la vieja
 * Sugerencias IA › Para clientes): eliges un cliente y sale qué ofrecerle con
 * el mensaje. Es de su propio carril (./OfreceleAlgo, sin props); acá sólo se
 * elige cuál de las dos se ve, sin otra tarjeta.
 */
import { useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { FileText, Gift, Loader2, MessageCircle, Store, WandSparkles, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import CartelVistaPrevia from "./CartelVistaPrevia";
import { BOTON_PRIMARIO, CHIP_ACTIVO, CHIP_BASE, CHIP_INACTIVO, costoTexto, pedirEscrito, textoDeError, type Escrito, type Salida } from "./use-mensajes";

const SALIDAS: { id: Salida; label: string; icon: LucideIcon }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "cartel", label: "Cartel A4", icon: FileText },
  { id: "tienda", label: "Para la tienda", icon: Store },
];

const OfreceleAlgo = dynamic(() => import("./OfreceleAlgo"), {
  loading: () => <div className="mt-3 h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" aria-busy />,
});

type Accion = "escribir" | "ofrecer";
const ACCIONES: { id: Accion; label: string; icon: LucideIcon }[] = [
  { id: "escribir", label: "Escríbelo por mí", icon: WandSparkles },
  { id: "ofrecer", label: "Ofrécele algo", icon: Gift },
];
const AYUDA: Record<Accion, { what: string; affects: string; example: string }> = {
  escribir: {
    what: "Dile qué quieres avisar y la IA lo escribe con el nombre, horario, Yape y dirección de tu negocio.",
    affects: "No guarda nada: lo copias, lo imprimes o abres WhatsApp. No hace formatos oficiales (guías, libros, liquidaciones).",
    example: "«cerramos el domingo 12 por inventario» → cartel A4 listo para imprimir.",
  },
  ofrecer: {
    what: "Elige a un cliente y te digo qué ofrecerle: lo que llevan los clientes que compran lo mismo que él o lo de sus categorías favoritas; si es nuevo, lo más vendido. Con el mensaje listo.",
    affects: "No usa IA ni envía nada solo: lo copias o abres WhatsApp tú.",
    example: "Rosa lleva leche cada semana → le ofreces el pan y el queso que llevan quienes también compran leche.",
  },
};

/** Misma cuenta que `escribir/route.ts` usa para pedir permiso al tope. */
const COSTO_ESTIMADO = (450 + 700) * 0.000001;

export default function EscribeloPorMi({ vacio }: { vacio?: boolean }) {
  const [pedido, setPedido] = useState("");
  const [salida, setSalida] = useState<Salida>("whatsapp");
  const [escribiendo, setEscribiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escrito, setEscrito] = useState<Escrito | null>(null);
  const [accion, setAccion] = useState<Accion>("escribir");
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
      aria-label="Escribir un mensaje"
      className={cn(
        "rounded-2xl border p-3 sm:p-4",
        vacio ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      {/* Las dos acciones son el título del bloque: una sola fila, la elegida resaltada. */}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Qué escribir" className="inline-flex min-w-0 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {ACCIONES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={accion === id}
              onClick={() => setAccion(id)}
              className={cn(
                "inline-flex h-12 min-w-0 items-center gap-2 px-3 text-sm font-semibold transition-colors sm:px-4",
                accion === id ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
              data-accion-mensaje={id}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <InfoTip title={ACCIONES.find((a) => a.id === accion)?.label} {...AYUDA[accion]} side="bottom" className="shrink-0" />
      </div>

      {accion === "ofrecer" ? (
        <div className="mt-3">
          <OfreceleAlgo />
        </div>
      ) : (
      <form onSubmit={enviar} className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          ref={campo}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          maxLength={300}
          placeholder="Ej.: cerramos el domingo 12 por inventario"
          aria-label="Qué quieres avisar"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
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
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-sm tabular-nums text-[var(--text-tertiary)] lg:ml-0">IA ≈ {costoTexto(COSTO_ESTIMADO)}</span>
          <button type="submit" className={BOTON_PRIMARIO} disabled={escribiendo || pedido.trim().length < 3} data-escribelo-enviar>
            {escribiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <WandSparkles className="h-4 w-4" aria-hidden />}
            Escribir
          </button>
        </div>
      </form>
      )}
      {error && accion === "escribir" && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      )}

      {escrito && <CartelVistaPrevia key={`${escrito.salida}-${escrito.texto.length}`} escrito={escrito} onCerrar={cerrarVista} />}
    </section>
  );
}
