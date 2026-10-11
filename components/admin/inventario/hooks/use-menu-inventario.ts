import {
  Download, FileSpreadsheet, LayoutGrid, LayoutList, Layers, Maximize2, RefreshCw, RotateCcw,
  ScanBarcode, Sparkles, Timer, TrendingUp, Upload,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { DbProduct } from "@/lib/jsondb";
import { exportToCSV } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const hoy = () => new Date().toISOString().slice(0, 10);

function descargarCsv(lista: DbProduct[]) {
  exportToCSV(lista.map(p => ({
    nombre: p.name, categoria: p.category, precio: p.price,
    costo: p.costPrice ?? "", stock: p.stock ?? "",
    stockMin: p.stockMin ?? "", stockMax: p.stockMax ?? "",
    unidad: p.unit, codigo: p.barcode ?? "", activo: p.active ? "Si" : "No",
  })), `inventario_${hoy()}.csv`);
}

function descargarExcel(lista: DbProduct[]) {
  exportToExcel(lista.map(p => ({
    Nombre: p.name, Categoria: p.category, "Precio (S/)": p.price,
    "Costo (S/)": p.costPrice ?? "", Stock: p.stock ?? "",
    "Stock Min": p.stockMin ?? "", "Stock Max": p.stockMax ?? "",
    Unidad: p.unit, Codigo: p.barcode ?? "", Activo: p.active ? "Si" : "No",
  })), `inventario-${hoy()}`, "Inventario");
}

/**
 * El «⋯» de Productos y stock (10-10): todo lo que se usa de vez en cuando.
 *
 * Juntó tres lugares: «Más acciones» (las del hub, kanban, escanear,
 * actualizar), el panel «Filtros» —que en realidad era de vista e
 * importar/exportar: Más columnas, Expandir tabla, Ajuste %, Añadir IMG
 * Amplio, CSV, Excel, Subir CSV— y el contador de actualización de la banda.
 * Las descargas llevan LO QUE VES (con todos tus filtros); antes sólo miraban
 * categoría y búsqueda.
 */
export function menuDeInventario(inv: Inventario, { conFoco }: { conFoco: (accion: () => void) => () => void }): MenuAccion[] {
  const {
    headerActions, view, setView, viewMode, setViewMode, showExtendedCols, setShowExtendedCols, orden,
    setShowExpandedTable, setBulkField, setBulkValue, setBulkModal, setShowBulkImageAssign, noImageCount,
    filteredProducts, csvImportRef, csvImporting, setCsvResult, setShowScanner, scanLoading, load, loading,
    autoActivo, alternarAuto,
  } = inv;
  const verVista = (modo: "table" | "cards" | "kanban") => {
    if (modo === "kanban") { setView("kanban"); return; }
    setView("productos");
    setViewMode(modo);
  };
  const vistaActual = view === "kanban" ? "kanban" : viewMode;
  const n = filteredProducts.length;
  return [
    ...headerActions.map((a, i): MenuAccion => ({
      id: `hub-${i}`, label: a.label, hint: a.description, icon: a.icon ?? Layers, disabled: a.disabled,
      onSelect: conFoco(() => a.onClick?.()), seccion: "Inventario",
    })),
    { id: "nuevo-escaner", label: scanLoading ? "Buscando…" : "Crear con el escáner", hint: "Lee el código de barras y arma el alta", icon: ScanBarcode, busy: scanLoading, onSelect: () => setShowScanner(true), seccion: headerActions.length ? undefined : "Inventario" },
    { id: "ajuste", label: "Subir o bajar precios en %", hint: "A los productos que elijas, de una vez", icon: TrendingUp, onSelect: conFoco(() => { setBulkField("pricePercent"); setBulkValue(""); setBulkModal(true); }), seccion: "Catálogo" },
    { id: "imagenes", label: "Asignar fotos", hint: noImageCount > 0 ? `${noImageCount} sin foto · del banco de imágenes, a varios a la vez` : "Del banco de imágenes, a varios a la vez", icon: Sparkles, meta: noImageCount > 0 ? String(noImageCount) : undefined, onSelect: conFoco(() => setShowBulkImageAssign(true)) },
    { id: "csv", label: "Descargar CSV", hint: `Los ${n} productos que ves, con tus filtros`, icon: Download, disabled: n === 0, onSelect: () => descargarCsv(filteredProducts) },
    { id: "excel", label: "Descargar Excel", hint: `Los ${n} productos que ves, con tus filtros`, icon: FileSpreadsheet, disabled: n === 0, onSelect: () => descargarExcel(filteredProducts) },
    { id: "subir", label: csvImporting ? "Subiendo…" : "Subir CSV", hint: "Alta de muchos productos desde una planilla", icon: Upload, busy: csvImporting, onSelect: () => { setCsvResult(null); csvImportRef.current?.click(); } },
    { id: "v-tabla", label: "Tabla", icon: LayoutList, activo: vistaActual === "table", onSelect: () => verVista("table"), seccion: "Vista" },
    { id: "v-tarjetas", label: "Tarjetas", icon: LayoutGrid, activo: vistaActual === "cards", onSelect: () => verVista("cards") },
    { id: "v-tablero", label: "Tablero por nivel de stock", hint: "Agotado, pocas existencias, normal y exceso", icon: Layers, activo: vistaActual === "kanban", onSelect: () => verVista("kanban") },
    {
      id: "columnas", label: showExtendedCols ? "Menos columnas" : "Más columnas", hint: "Historial, badge, costo, rotación, cambio en 30 días y vencimiento",
      icon: Layers, activo: showExtendedCols,
      onSelect: () => { const next = !showExtendedCols; setShowExtendedCols(next); try { localStorage.setItem("inv-extended-cols", String(next)); } catch { /* cuota */ } },
    },
    ...(orden.cambiado ? [{ id: "orden", label: "Restablecer el orden de columnas", icon: RotateCcw, onSelect: orden.restablecer }] : []),
    { id: "expandir", label: "Tabla a pantalla completa", icon: Maximize2, onSelect: conFoco(() => setShowExpandedTable(true)) },
    { id: "actualizar", label: loading ? "Actualizando…" : "Actualizar", hint: "Trae otra vez productos y stock", icon: RefreshCw, busy: loading, onSelect: () => { void load(); }, seccion: "Datos" },
    { id: "auto", label: "Actualizar solo cada 5 min", hint: autoActivo ? "Encendido: las ventas del día bajan el stock sin recargar" : "Apagado", icon: Timer, activo: autoActivo, onSelect: alternarAuto },
  ];
}
