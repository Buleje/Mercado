"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState } from "react";
import { Play, CheckCircle2, Circle, ChevronRight, Repeat, Package, Zap, Clock, Users, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  module?: string;
  action?: string;
  done: boolean;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  estimatedTime: string;
  steps: Omit<WorkflowStep, "done">[];
}

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "wf-recepcionar",
    name: "Recibir Mercadería",
    description: "Proceso completo de ingreso de productos con proveedor",
    icon: Package,
    color: "text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    estimatedTime: "20 min",
    steps: [
      { id: "s1", title: "Revisar orden de compra", description: "Verificar que el pedido coincide con lo acordado con el proveedor", module: "Proveedores" },
      { id: "s2", title: "Verificar cantidades y precios", description: "Cotejar cada ítem de la factura contra la entrega física", module: "Inventario" },
      { id: "s3", title: "Registrar lotes y vencimientos", description: "Anotar número de lote y fecha de caducidad de cada producto", module: "Inventario", action: "batches" },
      { id: "s4", title: "Actualizar stock en sistema", description: "Ingresar las cantidades recibidas al inventario digital", module: "Inventario" },
      { id: "s5", title: "Guardar factura del proveedor", description: "Archivar o fotografiar el documento de compra", module: "Proveedores" },
      { id: "s6", title: "Confirmar recepción completada", description: "Notificar al encargado que la mercadería fue procesada correctamente" },
    ],
  },
  {
    id: "wf-cierre-dia",
    name: "Cierre de Día",
    description: "Cierre de caja, cuadre y revisión de pendientes",
    icon: Clock,
    color: "text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",
    estimatedTime: "15 min",
    steps: [
      { id: "s1", title: "Revisar ventas del día", description: "Consultar el resumen de ventas por canal y cajero", module: "Ventas" },
      { id: "s2", title: "Contar el efectivo en caja", description: "Realizar arqueo físico del dinero en caja" },
      { id: "s3", title: "Cuadrar con el sistema", description: "Comparar el efectivo real con el monto registrado en ventas", module: "Ventas" },
      { id: "s4", title: "Registrar diferencias si las hay", description: "Anotar cualquier descuadre con su justificación" },
      { id: "s5", title: "Revisar pedidos pendientes", description: "Verificar pedidos sin entregar para el día siguiente", module: "Pedidos" },
      { id: "s6", title: "Revisar alertas de stock bajo", description: "Identificar qué productos necesitan reposición prioritaria", module: "Inventario" },
      { id: "s7", title: "Cerrar turno en sistema", description: "Registrar el cierre oficial del turno con el monto final" },
    ],
  },
  {
    id: "wf-cambio-precios",
    name: "Cambio de Precios",
    description: "Actualización masiva o individual de precios de venta",
    icon: Zap,
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--surface-sunken)]",
    estimatedTime: "30 min",
    steps: [
      { id: "s1", title: "Identificar productos a actualizar", description: "Listar los productos cuyo precio de costo o margen cambió", module: "Inventario" },
      { id: "s2", title: "Verificar margen objetivo", description: "Calcular el precio de venta requerido según el margen deseado" },
      { id: "s3", title: "Actualizar precios en sistema", description: "Editar el precio de venta en cada producto del catálogo", module: "Inventario" },
      { id: "s4", title: "Imprimir nuevas etiquetas", description: "Generar e imprimir etiquetas con el precio actualizado" },
      { id: "s5", title: "Reemplazar etiquetas físicas", description: "Colocar las nuevas etiquetas en góndola o mostrador" },
      { id: "s6", title: "Notificar al equipo de ventas", description: "Informar al personal sobre los nuevos precios antes de abrir" },
    ],
  },
  {
    id: "wf-inventario-fisico",
    name: "Inventario Físico",
    description: "Recuento completo para sincronizar stock real con el sistema",
    icon: Repeat,
    color: "text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    estimatedTime: "2–4 hs",
    steps: [
      { id: "s1", title: "Planificar secciones y equipo", description: "Dividir la tienda en zonas y asignar responsables por sección" },
      { id: "s2", title: "Exportar stock actual del sistema", description: "Generar el reporte de stock por categoría como referencia", module: "Inventario" },
      { id: "s3", title: "Contar productos físicamente", description: "Registrar las cantidades reales por ítem en planilla o app" },
      { id: "s4", title: "Comparar con el sistema", description: "Identificar diferencias positivas y negativas por producto", module: "Inventario" },
      { id: "s5", title: "Corregir stock en sistema", description: "Ajustar los valores en el sistema según el conteo real", module: "Inventario" },
      { id: "s6", title: "Documentar diferencias", description: "Registrar las discrepancias para análisis posterior (mermas, robos)" },
    ],
  },
  {
    id: "wf-nuevo-empleado",
    name: "Incorporar Empleado",
    description: "Alta de usuario, permisos y capacitación en el sistema",
    icon: Users,
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--surface-sunken)]",
    estimatedTime: "1 hora",
    steps: [
      { id: "s1", title: "Crear cuenta en el sistema", description: "Registrar nombre, email y contraseña del nuevo usuario", module: "Usuarios", action: "admin-users" },
      { id: "s2", title: "Asignar rol y permisos", description: "Definir si es cajero, almacenero o administrador", module: "Usuarios" },
      { id: "s3", title: "Capacitar en punto de venta", description: "Guiar al empleado en el flujo de ventas y caja" },
      { id: "s4", title: "Capacitar en inventario", description: "Mostrar cómo registrar ingresos y ajustar stock", module: "Inventario" },
      { id: "s5", title: "Supervisar primeras operaciones", description: "Acompañar al empleado en sus primeras tres transacciones" },
      { id: "s6", title: "Confirmar alta completada", description: "Verificar que el empleado puede operar de forma autónoma" },
    ],
  },
];

interface RunningFlow {
  template: WorkflowTemplate;
  steps: WorkflowStep[];
}

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function WorkflowTemplatesTab({ onNavigate }: Props) {
  const [running, setRunning] = useState<RunningFlow | null>(null);

  const startFlow = (t: WorkflowTemplate) => {
    setRunning({
      template: t,
      steps: t.steps.map(s => ({ ...s, done: false })),
    });
  };

  const toggleStep = (id: string) => {
    setRunning(r => r ? { ...r, steps: r.steps.map(s => s.id === id ? { ...s, done: !s.done } : s) } : null);
  };

  const doneCount = running?.steps.filter(s => s.done).length ?? 0;
  const totalSteps = running?.steps.length ?? 0;
  const allDone = doneCount === totalSteps && totalSteps > 0;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div>
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Flujos de Trabajo</SectionTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Procesos paso a paso para las tareas más comunes de la tienda</p>
      </div>

      {/* Active flow */}
      {running && (
        <div className="bg-white dark:bg-card border-2 border-primary/30 rounded-xl overflow-hidden ">
          <div className="px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", running.template.bg)}>
                <running.template.icon className={cn("h-5 w-5", running.template.color)} />
              </div>
              <div>
                <p className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground">{running.template.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{doneCount} de {totalSteps} pasos completados</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-2 w-24 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-[var(--dur-slow)]" style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }} />
              </div>
              <button onClick={() => setRunning(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {running.steps.map((step, i) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border transition-all",
                  step.done
                    ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                    : "bg-gray-50 dark:bg-surface border-[var(--rule-base)] dark:border-card-border"
                )}
              >
                <button onClick={() => toggleStep(step.id)} className={cn("mt-0.5 w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-all", step.done ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)]" : "border-[var(--rule-base)] dark:border-card-border hover:border-[var(--data-success-500)]/30")}>
                  {step.done && <CheckCircle2 className="h-4 w-4 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">Paso {i + 1}</span>
                    {step.done && <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">✓ Listo</span>}
                  </div>
                  <p className={cn("font-semibold text-sm mt-0.5", step.done ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)] line-through" : "text-[var(--text-primary)] dark:text-foreground")}>{step.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 leading-relaxed">{step.description}</p>
                  {step.module && onNavigate && !step.done && (
                    <button onClick={() => { onNavigate(step.module!); toggleStep(step.id); }} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      Ir a {step.module} <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {allDone && (
              <div className="rounded-xl bg-[var(--accent-soft)] text-white p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                <p className="font-extrabold text-base">¡Flujo completado!</p>
                <p className="text-[var(--data-success-500)] text-sm mt-0.5">Todos los pasos de &ldquo;{running.template.name}&rdquo; están listos.</p>
                <button onClick={() => setRunning(null)} className="mt-3 px-5 py-2 rounded-lg bg-white text-[var(--data-success-500)] font-bold text-sm hover:bg-[var(--accent-soft)] transition-colors">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {TEMPLATES.map(t => (
          <div key={t.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-3 hover:shadow-sm transition-shadow flex flex-col">
            <div className="flex flex-wrap items-start gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", t.bg)}>
                <t.icon className={cn("h-5 w-5", t.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground leading-tight">{t.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5 line-clamp-2">{t.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)] dark:text-muted">
              <span className="flex items-center gap-1"><Circle className="h-3 w-3" />{t.steps.length} pasos</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.estimatedTime}</span>
            </div>

            <div className="flex-1" />
            <button
              onClick={() => startFlow(t)}
              disabled={running?.template.id === t.id}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors",
                running?.template.id === t.id
                  ? "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary/90"
              )}
            >
              <Play className="h-4 w-4" />
              {running?.template.id === t.id ? "En progreso…" : "Iniciar flujo"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

