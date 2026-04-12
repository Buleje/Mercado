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

// ── Tipos de estado de los paneles ────────────────────────────────────────────

interface IdentidadState {
  nombre: string;
  slogan: string;
  logoUrl: string;
}

interface ColoresState {
  primario: string;
  acento: string;
}

interface HeroState {
  titulo: string;
  subtitulo: string;
  imagenUrl: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface ContactoState {
  whatsapp: string;
  email: string;
  direccion: string;
}

interface EstilosState {
  tamanoFuente: "small" | "medium" | "large";
  borderRadius: number;
}

interface SeccionesState {
  hero: boolean;
  productos: boolean;
  promociones: boolean;
  about: boolean;
  contacto: boolean;
}

interface ContenidoState {
  aboutTitulo: string;
  aboutCuerpo: string;
}

interface AvanzadoState {
  metaTitulo: string;
  metaDescripcion: string;
  ogImageUrl: string;
}

// ── Estilos compartidos ───────────────────────────────────────────────────────

const INPUT_CLASS =
  "rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 w-full focus:outline-none focus:border-teal-500 transition-colors placeholder:text-gray-600";

const LABEL_CLASS =
  "block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1";

const FIELD_CLASS = "space-y-1";

// ── Sub-componentes de panel ──────────────────────────────────────────────────

function PanelIdentidad({
  state,
  onChange,
}: {
  state: IdentidadState;
  onChange: (s: IdentidadState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Nombre de la tienda</label>
        <input
          type="text"
          value={state.nombre}
          onChange={(e) => onChange({ ...state, nombre: e.target.value })}
          placeholder="Bodega San Martín"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Eslogan</label>
        <input
          type="text"
          value={state.slogan}
          onChange={(e) => onChange({ ...state, slogan: e.target.value })}
          placeholder="Tu tienda de confianza"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>URL del logo</label>
        <input
          type="text"
          value={state.logoUrl}
          onChange={(e) => onChange({ ...state, logoUrl: e.target.value })}
          placeholder="https://..."
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValidHex ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer p-0.5 shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#2d6a4f"
          maxLength={7}
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function PanelColores({
  state,
  onChange,
}: {
  state: ColoresState;
  onChange: (s: ColoresState) => void;
}) {
  return (
    <div className="space-y-3">
      <ColorField
        label="Color primario"
        value={state.primario}
        onChange={(v) => onChange({ ...state, primario: v })}
      />
      <ColorField
        label="Color de acento"
        value={state.acento}
        onChange={(v) => onChange({ ...state, acento: v })}
      />
    </div>
  );
}

function PanelHero({
  state,
  onChange,
}: {
  state: HeroState;
  onChange: (s: HeroState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Titulo principal</label>
        <input
          type="text"
          value={state.titulo}
          onChange={(e) => onChange({ ...state, titulo: e.target.value })}
          placeholder="Bienvenido a nuestra tienda"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Subtitulo</label>
        <input
          type="text"
          value={state.subtitulo}
          onChange={(e) => onChange({ ...state, subtitulo: e.target.value })}
          placeholder="Los mejores productos al mejor precio"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>URL de imagen hero</label>
        <input
          type="text"
          value={state.imagenUrl}
          onChange={(e) => onChange({ ...state, imagenUrl: e.target.value })}
          placeholder="https://..."
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Texto del boton CTA</label>
        <input
          type="text"
          value={state.ctaLabel}
          onChange={(e) => onChange({ ...state, ctaLabel: e.target.value })}
          placeholder="Ver productos"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>URL del boton CTA</label>
        <input
          type="text"
          value={state.ctaUrl}
          onChange={(e) => onChange({ ...state, ctaUrl: e.target.value })}
          placeholder="/productos"
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function PanelContacto({
  state,
  onChange,
}: {
  state: ContactoState;
  onChange: (s: ContactoState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Telefono WhatsApp</label>
        <input
          type="text"
          value={state.whatsapp}
          onChange={(e) => onChange({ ...state, whatsapp: e.target.value })}
          placeholder="+51 999 999 999"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Correo electronico</label>
        <input
          type="text"
          value={state.email}
          onChange={(e) => onChange({ ...state, email: e.target.value })}
          placeholder="tienda@ejemplo.com"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Direccion</label>
        <input
          type="text"
          value={state.direccion}
          onChange={(e) => onChange({ ...state, direccion: e.target.value })}
          placeholder="Jr. Lima 123, Pucallpa"
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function PanelEstilos({
  state,
  onChange,
}: {
  state: EstilosState;
  onChange: (s: EstilosState) => void;
}) {
  return (
    <div className="space-y-4">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Tamano de fuente</label>
        <select
          value={state.tamanoFuente}
          onChange={(e) =>
            onChange({ ...state, tamanoFuente: e.target.value as EstilosState["tamanoFuente"] })
          }
          className={INPUT_CLASS}
        >
          <option value="small">Pequeno</option>
          <option value="medium">Mediano</option>
          <option value="large">Grande</option>
        </select>
      </div>
      <div className={FIELD_CLASS}>
        <div className="flex items-center justify-between mb-1">
          <label className={cn(LABEL_CLASS, "mb-0")}>Redondez de bordes</label>
          <span className="text-[11px] font-bold text-teal-400">{state.borderRadius}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={24}
          value={state.borderRadius}
          onChange={(e) => onChange({ ...state, borderRadius: Number(e.target.value) })}
          className="w-full accent-teal-500"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-600">Cuadrado</span>
          <span className="text-[10px] text-gray-600">Redondeado</span>
        </div>
      </div>
    </div>
  );
}

const SECCIONES_CONFIG: { key: keyof SeccionesState; label: string }[] = [
  { key: "hero", label: "Hero / Banner" },
  { key: "productos", label: "Productos" },
  { key: "promociones", label: "Promociones" },
  { key: "about", label: "Acerca de" },
  { key: "contacto", label: "Contacto" },
];

function PanelSecciones({
  state,
  onChange,
}: {
  state: SeccionesState;
  onChange: (s: SeccionesState) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500 mb-3">
        Activa o desactiva las secciones visibles en tu tienda.
      </p>
      {SECCIONES_CONFIG.map(({ key, label }) => (
        <label
          key={key}
          className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-gray-800/60 border border-gray-700/60 cursor-pointer hover:bg-gray-800 transition-colors"
        >
          <span className="text-sm text-gray-300">{label}</span>
          <input
            type="checkbox"
            checked={state[key]}
            onChange={(e) => onChange({ ...state, [key]: e.target.checked })}
            className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
          />
        </label>
      ))}
    </div>
  );
}

function PanelContenido({
  state,
  onChange,
}: {
  state: ContenidoState;
  onChange: (s: ContenidoState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Titulo de la seccion</label>
        <input
          type="text"
          value={state.aboutTitulo}
          onChange={(e) => onChange({ ...state, aboutTitulo: e.target.value })}
          placeholder="Quienes somos"
          className={INPUT_CLASS}
        />
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Descripcion</label>
        <textarea
          value={state.aboutCuerpo}
          onChange={(e) => onChange({ ...state, aboutCuerpo: e.target.value })}
          placeholder="Somos una bodega familiar con mas de 10 anos en el mercado..."
          rows={5}
          className={cn(INPUT_CLASS, "resize-none leading-relaxed")}
        />
      </div>
    </div>
  );
}

function PanelAvanzado({
  state,
  onChange,
}: {
  state: AvanzadoState;
  onChange: (s: AvanzadoState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Meta titulo (SEO)</label>
        <input
          type="text"
          value={state.metaTitulo}
          onChange={(e) => onChange({ ...state, metaTitulo: e.target.value })}
          placeholder="Tienda Online — Bodega San Martín"
          className={INPUT_CLASS}
        />
        <p className="text-[10px] text-gray-600 mt-1">Recomendado: 50–60 caracteres</p>
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Meta descripcion (SEO)</label>
        <textarea
          value={state.metaDescripcion}
          onChange={(e) => onChange({ ...state, metaDescripcion: e.target.value })}
          placeholder="Compra abarrotes, bebidas y mas al mejor precio en Pucallpa."
          rows={3}
          className={cn(INPUT_CLASS, "resize-none")}
        />
        <p className="text-[10px] text-gray-600 mt-1">Recomendado: 120–160 caracteres</p>
      </div>
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>URL imagen OG (redes sociales)</label>
        <input
          type="text"
          value={state.ogImageUrl}
          onChange={(e) => onChange({ ...state, ogImageUrl: e.target.value })}
          placeholder="https://..."
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

// ── Tipos principales ─────────────────────────────────────────────────────────

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

  // ── Estado local de cada panel ──────────────────────────────────────────────
  const [identidad, setIdentidad] = useState<IdentidadState>({
    nombre: "",
    slogan: "",
    logoUrl: "",
  });
  const [colores, setColores] = useState<ColoresState>({
    primario: "#2d6a4f",
    acento: "#f4a261",
  });
  const [hero, setHero] = useState<HeroState>({
    titulo: "",
    subtitulo: "",
    imagenUrl: "",
    ctaLabel: "",
    ctaUrl: "",
  });
  const [contacto, setContacto] = useState<ContactoState>({
    whatsapp: "",
    email: "",
    direccion: "",
  });
  const [estilos, setEstilos] = useState<EstilosState>({
    tamanoFuente: "medium",
    borderRadius: 8,
  });
  const [secciones, setSecciones] = useState<SeccionesState>({
    hero: true,
    productos: true,
    promociones: true,
    about: true,
    contacto: true,
  });
  const [contenido, setContenido] = useState<ContenidoState>({
    aboutTitulo: "",
    aboutCuerpo: "",
  });
  const [avanzado, setAvanzado] = useState<AvanzadoState>({
    metaTitulo: "",
    metaDescripcion: "",
    ogImageUrl: "",
  });

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

          {/* Tool panel — controles reales */}
          <div className="p-3 border-t border-gray-800 mt-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              {TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === activeTool)?.label}
            </p>

            {activeTool === "identidad" && (
              <PanelIdentidad state={identidad} onChange={setIdentidad} />
            )}
            {activeTool === "colores" && (
              <PanelColores state={colores} onChange={setColores} />
            )}
            {activeTool === "hero" && (
              <PanelHero state={hero} onChange={setHero} />
            )}
            {activeTool === "contacto" && (
              <PanelContacto state={contacto} onChange={setContacto} />
            )}
            {activeTool === "estilos" && (
              <PanelEstilos state={estilos} onChange={setEstilos} />
            )}
            {activeTool === "secciones" && (
              <PanelSecciones state={secciones} onChange={setSecciones} />
            )}
            {activeTool === "contenido" && (
              <PanelContenido state={contenido} onChange={setContenido} />
            )}
            {activeTool === "avanzado" && (
              <PanelAvanzado state={avanzado} onChange={setAvanzado} />
            )}
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
