"use client";

import {
  BreadcrumbEditorial,
  QuickActionsFab,
  AdminInsightCard,
  OnboardingChecklist,
  undoToast,
} from "@/components/admin/ux";
import { TodayHub } from "@/components/admin/hoy/TodayHub";
import { Toaster } from "sonner";

/**
 * /design-system/admin — demo viva de Ola 4 UX primitives.
 * Muestra: Breadcrumb + AdminInsightCard + OnboardingChecklist + QuickActionsFab + UndoToast.
 */
export default function AdminUXDemoPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <Toaster position="bottom-center" />

      {/* Hero demo header */}
      <section
        className="py-16 sm:py-20 border-b border-[var(--rule-base)]"
        style={{ background: "var(--brand-ink)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
            Ola 4 · Admin UX primitives
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            Supervisión <span className="text-white/45">sin fricción</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            Primitives UX para el panel admin: breadcrumbs, insight cards con IA,
            checklist onboarding, FAB flotante con atajos de teclado, undo toast.
          </p>
        </div>
      </section>

      {/* Breadcrumb demo */}
      <section className="py-10 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            01 · BreadcrumbEditorial
          </p>
          <h2 className="text-fs-h2 mb-6">Breadcrumbs kicker-style</h2>
          <div className="space-y-4 p-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <BreadcrumbEditorial items={[{ label: "Inventario", href: "#" }, { label: "Producto nuevo" }]} />
            <BreadcrumbEditorial items={[{ label: "Finanzas", href: "#" }, { label: "Facturación", href: "#" }, { label: "Boleta #123" }]} />
            <BreadcrumbEditorial rootLabel={false} items={[{ label: "Pedido #456" }]} />
          </div>
        </div>
      </section>

      {/* TodayHub — hub unificado Ola B ─────── */}
      <section className="py-12 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            ★ · TodayHub (ADR-064 Ola B)
          </p>
          <h2 className="text-fs-h2 mb-3">Hub unificado &ldquo;Hoy&rdquo;</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            Reemplaza 4 componentes duplicados. 1 fetch único a <code className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] font-mono text-xs">/api/admin/overview</code>.
            Requiere login admin para ver data real — en demo pública muestra error (comportamiento esperado).
          </p>
          <TodayHub greeting="Buen día, Brandon" />
        </div>
      </section>

      {/* Insight card demo */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            02 · AdminInsightCard
          </p>
          <h2 className="text-fs-h2 mb-6">Hero card del home admin</h2>
          <AdminInsightCard
            greeting="Buen día, Brandon"
            heroLabel="Ventas de hoy"
            heroValue={4520}
            heroPrefix="S/ "
            heroDelta={12.5}
            heroDeltaLabel="vs ayer"
            trend={[200, 180, 340, 420, 380, 450, 520]}
            insight={{
              type: "opportunity",
              text: "Tus ventas de la tarde cayeron 20%. Podemos crear una promo flash de 2×1 en bebidas para recuperar el ritmo.",
              cta: { label: "Crear promo", href: "#" },
            }}
            contextualMetrics={[
              { label: "Pedidos", value: 34, delta: 5.2 },
              { label: "Clientes nuevos", value: 7, delta: 40 },
              { label: "Ticket promedio", value: 47.8, prefix: "S/ ", delta: -2.1, decimals: 2 },
              { label: "Stock crítico", value: 3, status: "warning" },
            ]}
          />
        </div>
      </section>

      {/* Onboarding checklist demo */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            03 · OnboardingChecklist
          </p>
          <h2 className="text-fs-h2 mb-6">Primeros pasos persistentes</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <OnboardingChecklist
              storageKey="demo-onboarding-1"
              items={[
                { id: "store", label: "Configurá tu tienda", description: "Logo, colores, datos de contacto.", done: true, href: "#" },
                { id: "product", label: "Crea tu primer producto", description: "Al menos 10 productos para abrir.", done: true, href: "#" },
                { id: "whatsapp", label: "Conectá WhatsApp", description: "Los pedidos te llegan directo al chat.", done: false, href: "#" },
                { id: "payment", label: "Configurá pagos", description: "Yape, Plin o efectivo.", done: false, href: "#" },
                { id: "delivery", label: "Definí tus zonas de delivery", done: false, href: "#" },
                { id: "invite", label: "Invitá a 3 amigos", description: "Ganás 1 mes gratis por cada uno.", done: false, href: "#" },
              ]}
            />
            <OnboardingChecklist
              storageKey="demo-onboarding-complete"
              items={[
                { id: "a", label: "Completaste todo", done: true },
                { id: "b", label: "Tu tienda está lista", done: true },
                { id: "c", label: "Ya puedes vender", done: true },
              ]}
            />
          </div>
        </div>
      </section>

      {/* UndoToast demo */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            04 · UndoToast
          </p>
          <h2 className="text-fs-h2 mb-3">Destructive action con deshacer</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            Patrón UX: en vez de dialog &ldquo;¿Estás seguro?&rdquo;, ejecutá la acción y ofrecé 5s para deshacer.
            Reduce friction en acciones frecuentes y destructivas.
          </p>
          <button
            onClick={() =>
              undoToast({
                message: "Producto eliminado",
                description: "Jabón Bolivar — 3 unidades en stock.",
                onUndo: () => console.log("Deshecho"),
              })
            }
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Eliminar producto (simular)
          </button>
        </div>
      </section>

      {/* QuickActionsFab demo instructions */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            05 · QuickActionsFab
          </p>
          <h2 className="text-fs-h2 mb-3">FAB flotante con atajos</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
            Tocá el botón <kbd className="inline-flex items-center justify-center h-5 w-5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] font-mono text-xs">+</kbd> en la esquina inferior derecha, o presioná{" "}
            <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] font-mono text-xs">⌘K</kbd>
            {" "}/ <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] font-mono text-xs">Ctrl+K</kbd>
            {" "}para abrir el menú de acciones rápidas. Con el menú abierto, presioná P/V/C/F para atajos directos a cada acción.
          </p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
            {[
              { key: "P", label: "Nuevo producto" },
              { key: "V", label: "Registrar venta" },
              { key: "C", label: "Nuevo cliente" },
              { key: "F", label: "Dar fiado" },
            ].map((k) => (
              <div key={k.key} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-center gap-3">
                <kbd className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] font-mono tabular-nums text-sm font-bold">
                  {k.key}
                </kbd>
                <span className="text-sm text-[var(--text-primary)] font-semibold">{k.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAB siempre visible */}
      <QuickActionsFab />
    </main>
  );
}
