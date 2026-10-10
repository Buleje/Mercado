"use client";
import { AlertCircle, CheckCircle, Save } from "@buleje/design-system/icons";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { Spinner } from "@/components/admin/marketplace/shared";
import CategoryZonePicker from "@/components/admin/unified/marketplace/CategoryZonePicker";
import { TiendaHero } from "@/components/admin/marketplace/tienda/TiendaHero";
import { ListaParaPublicar } from "@/components/admin/marketplace/tienda/ListaParaPublicar";
import { TiendaIdentidad } from "@/components/admin/marketplace/tienda/TiendaIdentidad";
import { TiendaHorario } from "@/components/admin/marketplace/tienda/TiendaHorario";
import { TiendaComisionImagen } from "@/components/admin/marketplace/tienda/TiendaComisionImagen";
import { TiendaAside } from "@/components/admin/marketplace/tienda/TiendaAside";

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda Personal
// Orden por pregunta (ley de la vista): quién soy → qué me falta para
// publicar → editar → guardar. Los bloques viven en ../tienda/.
// ─────────────────────────────────────────────
export function MarketplaceTiendaTab() {
  const { store, setStore, loading, saving, error, saved, handleSave, listaPublicar } = useMarketplaceTienda();

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-24">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border-2 border-[var(--data-error)] rounded-2xl text-base font-medium text-[var(--data-error)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}


      {/* ── HERO BANNER ───────────────────────────────── */}
      <TiendaHero store={store} />

      {/* ── LISTA PARA PUBLICAR (lo que falta, primero) ── */}
      {listaPublicar && (
        <ListaParaPublicar
          lista={listaPublicar}
          publicada={store.isActive}
          publicando={saving}
          onPublicar={() => void handleSave({ isActive: true })}
          onUsarUbicacion={() => void handleSave()}
        />
      )}

      {/* ── LAYOUT 2-COLUMNAS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── COLUMNA PRINCIPAL ────────────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Identidad */}
          <TiendaIdentidad store={store} setStore={setStore} />

          {/* Categoría + subcategoría + zonas de cobertura */}
          <CategoryZonePicker
            value={{
              category: store.category ?? "",
              subcategory: store.subcategory ?? null,
              coverageZones: store.coverageZones ?? [],
              customCategories: store.customCategories ?? [],
            }}
            onChange={(next) =>
              setStore((p) => ({
                ...p,
                category: next.category,
                subcategory: next.subcategory,
                coverageZones: next.coverageZones,
                customCategories: next.customCategories,
                // Mantiene `zone` legacy en sync con el 1er coverageZone marcado.
                zone: next.coverageZones[0] ?? p.zone,
              }))
            }
          />

          {/* Horario de atención (Store.hoursJson) */}
          <TiendaHorario store={store} setStore={setStore} />

          {/* Comisión + Marca visual */}
          <TiendaComisionImagen store={store} setStore={setStore} />
        </div>

        {/* ── ASIDE (sticky) ────────────────────────────── */}
        <TiendaAside store={store} setStore={setStore} />
      </div>

      {/* ── STICKY SAVE BAR ─────────────────────────────── */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur shadow-xl">
        <p className="text-sm text-[var(--text-tertiary)] hidden sm:block font-medium">
          Los cambios se aplican al instante en tu tienda pública.
        </p>
        <div className="flex items-center gap-3 ml-auto">
          {saved && (
            <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--data-success)]">
              <CheckCircle className="h-5 w-5" /> Guardado
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-primary text-white text-base font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {saving ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
