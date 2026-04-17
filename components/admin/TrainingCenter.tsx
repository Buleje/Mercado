"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { CheckCircle, Circle, ChevronDown, ChevronRight, Award } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Step = {
  id: number;
  text: string;
};

type Tutorial = {
  id: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  steps: Step[];
};

// ── Data ─────────────────────────────────────────────────────────────────────

const TUTORIALS: Tutorial[] = [
  {
    id: 1,
    title: "Como abrir caja",
    description: "Pasos para iniciar el turno y abrir la caja registradora",
    estimatedMinutes: 5,
    steps: [
      { id: 1, text: "Llega al local 10 minutos antes del horario de apertura." },
      { id: 2, text: "Revisa que el local este limpio y ordenado." },
      { id: 3, text: "Enciende el equipo y espera que cargue el sistema." },
      { id: 4, text: "Inicia sesion con tu usuario y contrasena." },
      { id: 5, text: "Ve a Caja > Apertura de caja e ingresa el monto inicial en efectivo." },
      { id: 6, text: "Confirma el monto y presiona 'Abrir caja'." },
      { id: 7, text: "Verifica que el cajero de ventas este en cero y listo para operar." },
    ],
  },
  {
    id: 2,
    title: "Como procesar un pedido Yape",
    description: "Registro de pagos con Yape desde el panel de pedidos",
    estimatedMinutes: 3,
    steps: [
      { id: 1, text: "Abre el modulo de Pedidos en el panel de administracion." },
      { id: 2, text: "Busca el pedido del cliente por nombre o numero de pedido." },
      { id: 3, text: "Haz clic en el pedido para ver el detalle." },
      { id: 4, text: "Pide al cliente que te muestre el comprobante de Yape." },
      { id: 5, text: "Verifica que el monto del Yape coincide con el total del pedido." },
      { id: 6, text: "Selecciona 'Yape' como metodo de pago y registra el numero de operacion." },
      { id: 7, text: "Cambia el estado del pedido a 'Pagado' y confirma." },
      { id: 8, text: "Entrega el pedido al cliente y solicita su firma si aplica." },
    ],
  },
  {
    id: 3,
    title: "Como hacer un conteo de inventario",
    description: "Procedimiento para el conteo fisico y actualizacion de stock",
    estimatedMinutes: 30,
    steps: [
      { id: 1, text: "Descarga la lista de inventario actual desde Inventario > Exportar." },
      { id: 2, text: "Imprime la lista o tenla visible en la pantalla." },
      { id: 3, text: "Empieza por la primera estanteria de izquierda a derecha." },
      { id: 4, text: "Cuenta unidad por unidad cada producto y anota la cantidad real." },
      { id: 5, text: "Si hay diferencia, marca el producto para investigar despues." },
      { id: 6, text: "Al terminar el conteo, ingresa al sistema: Inventario > Ajuste de stock." },
      { id: 7, text: "Actualiza las cantidades reales para cada producto contado." },
      { id: 8, text: "Guarda el ajuste y revisa el reporte de diferencias generado." },
    ],
  },
  {
    id: 4,
    title: "Como registrar un egreso",
    description: "Registro correcto de gastos y salidas de dinero",
    estimatedMinutes: 5,
    steps: [
      { id: 1, text: "Ve a Finanzas > Egresos en el panel." },
      { id: 2, text: "Haz clic en 'Nuevo egreso'." },
      { id: 3, text: "Selecciona la categoria del gasto (servicios, compras, transporte, etc.)." },
      { id: 4, text: "Ingresa el monto exacto en soles." },
      { id: 5, text: "Escribe una descripcion clara: a quien se le pago y por que." },
      { id: 6, text: "Adjunta la foto del comprobante si tienes uno." },
      { id: 7, text: "Selecciona el medio de pago usado (efectivo, Yape, transferencia)." },
      { id: 8, text: "Confirma y guarda. El egreso quedara registrado en el historial." },
    ],
  },
  {
    id: 5,
    title: "Como crear una oferta",
    description: "Activar descuentos y ofertas del dia para productos",
    estimatedMinutes: 5,
    steps: [
      { id: 1, text: "Ve a Productos > Ofertas en el panel de administracion." },
      { id: 2, text: "Haz clic en 'Nueva oferta'." },
      { id: 3, text: "Busca el producto al que quieres aplicar el descuento." },
      { id: 4, text: "Ingresa el precio de oferta o el porcentaje de descuento." },
      { id: 5, text: "Configura las fechas de inicio y fin de la oferta." },
      { id: 6, text: "Agrega una etiqueta visible (ej: 'Oferta del dia')." },
      { id: 7, text: "Activa la oferta y verifica que aparece en la tienda virtual." },
      { id: 8, text: "Comparte la oferta en redes usando el Generador de Posts." },
    ],
  },
];

const LS_PREFIX = "buleje_training_";

// ── Component ────────────────────────────────────────────────────────────────

export default function TrainingCenter() {
  const [user, setUser] = useState("empleado");
  const [completed, setCompleted] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const lsKey = `${LS_PREFIX}${user}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) setCompleted(JSON.parse(raw));
    } catch {}
  }, [lsKey]);

  const toggleCompleted = (id: number) => {
    const next = completed.includes(id)
      ? completed.filter((c) => c !== id)
      : [...completed, id];
    setCompleted(next);
    try {
      localStorage.setItem(lsKey, JSON.stringify(next));
    } catch {}
  };

  const progress = completed.length;
  const total = TUTORIALS.length;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const allDone = progress === total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Centro de Capacitacion
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tutoriales paso a paso para el personal de la bodega
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">
            Usuario:
          </label>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value.trim() || "empleado")}
            className="rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-1.5 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
            placeholder="Tu nombre"
          />
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award
              className={cn(
                "h-5 w-5",
                allDone ? "text-amber-500" : "text-gray-300 dark:text-gray-600"
              )}
            />
            <span className="font-semibold text-gray-800 dark:text-white">
              Progreso de {user}
            </span>
          </div>
          <span
            className={cn(
              "text-sm font-semibold",
              allDone ? "text-amber-500" : "text-[#00B4A6]"
            )}
          >
            {progress} de {total} completados
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={cn(
              "h-full transition-all duration-[var(--dur-slow)]",
              allDone ? "bg-amber-400" : "bg-[#00B4A6]"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {allDone && (
          <p className="mt-2 text-center text-sm font-semibold text-amber-600">
            Todos los tutoriales completados. Excelente trabajo!
          </p>
        )}
      </div>

      {/* Tutorial list */}
      <div className="space-y-3">
        {TUTORIALS.map((tutorial) => {
          const isDone = completed.includes(tutorial.id);
          const isExpanded = expanded === tutorial.id;

          return (
            <div
              key={tutorial.id}
              className={cn(
                "rounded-xl border transition",
                isDone
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10"
                  : "border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900"
              )}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggleCompleted(tutorial.id)}
                  className="shrink-0"
                  title={isDone ? "Marcar como pendiente" : "Marcar como completado"}
                >
                  {isDone ? (
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-semibold",
                        isDone
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {tutorial.title}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      ~{tutorial.estimatedMinutes} min
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {tutorial.description}
                  </p>
                </div>

                <button
                  onClick={() =>
                    setExpanded(isExpanded ? null : tutorial.id)
                  }
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Steps */}
              {isExpanded && (
                <div className="border-t border-[var(--rule-soft)] px-4 py-4 dark:border-[var(--rule-base)]">
                  <ol className="space-y-3">
                    {tutorial.steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00B4A6]/10 text-xs font-bold text-[#00B4A6] dark:bg-[#00B4A6]/20 dark:text-emerald-400">
                          {step.id}
                        </span>
                        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          {step.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <button
                    onClick={() => {
                      toggleCompleted(tutorial.id);
                      setExpanded(null);
                    }}
                    className={cn(
                      "mt-4 w-full rounded-lg py-2 text-sm font-semibold transition",
                      isDone
                        ? "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                        : "bg-[#00B4A6] text-white hover:bg-[#009690]"
                    )}
                  >
                    {isDone
                      ? "Marcar como pendiente"
                      : "Marcar como completado"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
