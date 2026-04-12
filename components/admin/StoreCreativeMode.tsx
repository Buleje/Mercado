"use client";

import { useState, useCallback } from "react";
import {
  X,
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Save,
  RotateCcw,
  Palette,
  Store,
  ImageIcon,
  FileText,
  Phone,
  Paintbrush,
  Settings2,
  Layout,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CreativeTab = "identidad" | "colores" | "estilos" | "hero" | "secciones" | "contenido" | "contacto" | "avanzado";

const TOOL_GROUPS: { group: string; tools: { id: CreativeTab; label: string; icon: typeof Palette }[] }[] = [
  {
    group: "Apariencia",
    tools: [
      { id: "identidad", label: "Identidad", icon: Store },
      { id: "colores", label: "Colores", icon: Palette },
      { id: "estilos", label: "Estilos", icon: Paintbrush },
    ],
  },
  {
    group: "Contenido",
    tools: [
      { id: "hero", label: "Hero", icon: ImageIcon },
      { id: "secciones", label: "Secciones", icon: Layout },
      { id: "contenido", label: "Textos", icon: FileText },
    ],
  },
  {
    group: "Negocio",
    tools: [
      { id: "contacto", label: "Contacto", icon: Phone },
    ],
  },
  {
    group: "Avanzado",
    tools: [
      { id: "avanzado", label: "Avanzado", icon: Settings2 },
    ],
  },
];

type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORTS: { id: Viewport; icon: typeof Monitor; width: string; label: string }[] = [
  { id: "desktop", icon: Monitor, width: "100%", label: "Escritorio" },
  { id: "tablet", icon: Tablet, width: "768px", label: "Tablet" },
  { id: "mobile", icon: Smartphone, width: "375px", label: "Movil" },
];

interface StoreCreativeModeProps {
  tenantSlug: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}

export default function StoreCreativeMode({ tenantSlug, onClose, onSave }: StoreCreativeModeProps) {
  const [activeTool, setActiveTool] = useState<CreativeTab>("identidad");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [saving, setSaving] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const activeViewport = VIEWPORTS.find((v) => v.id === viewport)!;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="flex items-center justify-between h-12 px-4 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs font-medium"
          >
            <X className="h-4 w-4" />
            Salir
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-xs font-bold text-teal-400">Modo Creativo</span>
        </div>

        {/* Viewport selector */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              onClick={() => setViewport(vp.id)}
              title={vp.label}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewport === vp.id
                  ? "bg-teal-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              )}
            >
              <vp.icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-500 transition-colors disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Tool sidebar ──────────────────────────────────────── */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0">
          <nav className="p-2 space-y-1">
            {TOOL_GROUPS.map((group, gi) => (
              <div key={group.group}>
                {gi > 0 && <div className="border-t border-gray-800 my-2" />}
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-2.5 pt-1 pb-1">
                  {group.group}
                </p>
                {group.tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left",
                      activeTool === tool.id
                        ? "bg-teal-600/20 text-teal-400 font-semibold"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    )}
                  >
                    <tool.icon className="h-4 w-4 shrink-0" />
                    {tool.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Tool panel placeholder */}
          <div className="p-3 border-t border-gray-800 mt-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">
              {TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === activeTool)?.label}
            </p>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 rounded-lg bg-gray-800/50 border border-gray-800" />
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-3">
              Los controles de edicion apareceran aqui.
              Edita desde Mi Tienda y los cambios se reflejan en vivo.
            </p>
          </div>
        </aside>

        {/* ── Preview area ──────────────────────────────────────── */}
        <main className="flex-1 bg-gray-950 flex items-start justify-center p-4 overflow-auto">
          <div
            className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
            style={{
              width: activeViewport.width,
              maxWidth: "100%",
              height: "calc(100vh - 80px)",
            }}
          >
            <iframe
              key={iframeKey}
              src={`/t/${tenantSlug}?preview=true`}
              className="w-full h-full border-0"
              title="Vista previa de la tienda"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
