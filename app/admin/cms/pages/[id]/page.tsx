"use client";

import { CardTitle } from "@buleje/design-system";
// ═══════════════════════════════════════════════════════
// CMS PAGE BUILDER - Simple Editor
// ═══════════════════════════════════════════════════════


import { useState, useEffect, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Save,
  Eye,
  Trash2,
  ArrowLeft,
  Type,
  Image as ImageIcon,
  Link as LinkIcon,
  ToggleLeft,
  Palette,
  Sparkles,
  BookOpenText,
  Zap,
  Phone,
  ShoppingCart,
  CircleHelp,
  Megaphone,
} from "@buleje/design-system/icons";
import HeroBlock from "@/components/blocks/HeroBlock";
import AboutBlock from "@/components/blocks/AboutBlock";
import BenefitsBlock from "@/components/blocks/BenefitsBlock";
import ContactBlock from "@/components/blocks/ContactBlock";
import ProductsBlock from "@/components/blocks/ProductsBlock";
import FAQBlock from "@/components/blocks/FAQBlock";
import CTABlock from "@/components/blocks/CTABlock";

interface Block {
  id: string;
  type: string;
  order: number;
  visible: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
}

interface Page {
  id: string;
  slug: string;
  title: string;
  status: string;
  blocks: Block[];
}

const AVAILABLE_BLOCKS = [
  { type: "hero", name: "Hero Principal", icon: Sparkles },
  { type: "about", name: "Nosotros", icon: BookOpenText },
  { type: "benefits", name: "Beneficios", icon: Zap },
  { type: "contact", name: "Contacto", icon: Phone },
  { type: "products", name: "Productos", icon: ShoppingCart },
  { type: "faq", name: "Preguntas Frecuentes", icon: CircleHelp },
  { type: "cta", name: "Llamada a la Acción", icon: Megaphone },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: HeroBlock,
  about: AboutBlock,
  benefits: BenefitsBlock,
  contact: ContactBlock,
  products: ProductsBlock,
  faq: FAQBlock,
  cta: CTABlock,
};

// ── Field definitions per block type ────────────────────
type FieldType = "text" | "textarea" | "url" | "color" | "boolean" | "link";
interface FieldDef { key: string; label: string; type: FieldType; placeholder?: string; }

const BLOCK_FIELDS: Record<string, FieldDef[]> = {
  hero: [
    { key: "title", label: "Título principal", type: "text", placeholder: "Bienvenido a..." },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Productos frescos..." },
    { key: "description", label: "Descripción", type: "textarea", placeholder: "Texto descriptivo..." },
    { key: "ctaText", label: "Botón principal (texto)", type: "text", placeholder: "Ver productos" },
    { key: "ctaLink", label: "Botón principal (enlace)", type: "link", placeholder: "/tienda" },
    { key: "secondaryCTAText", label: "Botón secundario (texto)", type: "text", placeholder: "Hacer pedido" },
    { key: "secondaryCTALink", label: "Botón secundario (enlace)", type: "link", placeholder: "#contacto" },
    { key: "showBadge", label: "Mostrar badge de envío", type: "boolean" },
    { key: "badgeText", label: "Texto del badge", type: "text", placeholder: "Envio gratis desde S/ 50" },
    { key: "backgroundImage", label: "Imagen de fondo (URL)", type: "url", placeholder: "https://..." },
    { key: "backgroundColor", label: "Color de fondo", type: "color" },
    { key: "showStats", label: "Mostrar estadísticas", type: "boolean" },
    { key: "showAnimations", label: "Mostrar animaciones", type: "boolean" },
  ],
  about: [
    { key: "title", label: "Título", type: "text", placeholder: "Nuestra historia" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Quiénes somos" },
    { key: "description", label: "Descripción", type: "textarea", placeholder: "Historia de la bodega..." },
    { key: "image", label: "Imagen (URL)", type: "url", placeholder: "https://..." },
    { key: "founded", label: "Año de fundación", type: "text", placeholder: "2010" },
    { key: "mission", label: "Misión", type: "textarea", placeholder: "Nuestra misión..." },
  ],
  benefits: [
    { key: "title", label: "Título de sección", type: "text", placeholder: "¿Por qué elegirnos?" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Todo lo que necesitas" },
  ],
  contact: [
    { key: "title", label: "Título", type: "text", placeholder: "Contáctanos" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Estamos para ayudarte" },
    { key: "phone", label: "Teléfono / WhatsApp", type: "text", placeholder: "+51 999 999 999" },
    { key: "address", label: "Dirección", type: "text", placeholder: "Calle..." },
    { key: "hours", label: "Horario", type: "text", placeholder: "Lun-Dom 7am-10pm" },
    { key: "email", label: "Email", type: "text", placeholder: "contacto@..." },
  ],
  products: [
    { key: "title", label: "Título de sección", type: "text", placeholder: "Nuestros productos" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Frescos y de calidad" },
    { key: "showSearch", label: "Mostrar barra de búsqueda", type: "boolean" },
  ],
  faq: [
    { key: "title", label: "Título de sección", type: "text", placeholder: "Preguntas frecuentes" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Resolvemos tus dudas" },
  ],
  cta: [
    { key: "title", label: "Título", type: "text", placeholder: "¡Pide ahora!" },
    { key: "subtitle", label: "Subtítulo", type: "text", placeholder: "Delivery en 30-45 min" },
    { key: "ctaText", label: "Botón (texto)", type: "text", placeholder: "Hacer pedido" },
    { key: "ctaLink", label: "Botón (enlace)", type: "link", placeholder: "#contacto" },
    { key: "backgroundImage", label: "Imagen de fondo (URL)", type: "url", placeholder: "https://..." },
    { key: "backgroundColor", label: "Color de fondo", type: "color" },
  ],
};

const FIELD_TYPE_ICON: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  textarea: Type,
  url: ImageIcon,
  color: Palette,
  boolean: ToggleLeft,
  link: LinkIcon,
};


export default function PageBuilder({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [page, setPage] = useState<Page | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draftProps, setDraftProps] = useState<Record<string, any>>({});
  const [savingProps, setSavingProps] = useState(false);

  const fetchPage = useCallback(async () => {
    try {
      const res = await fetch(`/api/cms/pages/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setPage(data);
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id !== "new") {
      fetchPage();
    } else {
      // New page
      setPage({
        id: "",
        slug: "",
        title: "Nueva página",
        status: "DRAFT",
        blocks: [],
      });
    }
  }, [params.id, fetchPage]);

  async function savePage() {
    if (!page) return;

    setSaving(true);
    try {
      const url =
        params.id === "new"
          ? "/api/cms/pages"
          : `/api/cms/pages/${params.id}`;
      const method = params.id === "new" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: page.slug,
          title: page.title,
          status: page.status,
        }),
      });

      if (res.ok) {
        const savedPage = await res.json();
        if (params.id === "new") {
          router.push(`/admin/cms/pages/${savedPage.id}`);
        }
        alert("Página guardada");
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
      alert("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function addBlock(type: string) {
    if (!page || params.id === "new") {
      alert("Guarda la página primero");
      return;
    }

    try {
      const res = await fetch(`/api/cms/pages/${params.id}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          order: page.blocks.length,
          visible: true,
          props: {},
        }),
      });

      if (res.ok) {
        fetchPage();
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async function deleteBlock(blockId: string) {
    if (!confirm("¿Eliminar este bloque?")) return;

    try {
      const res = await fetch(
        `/api/cms/pages/${params.id}/blocks?blockId=${blockId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        fetchPage();
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async function toggleBlockVisibility(blockId: string, visible: boolean) {
    try {
      const res = await fetch(
        `/api/cms/pages/${params.id}/blocks?blockId=${blockId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible }),
        }
      );

      if (res.ok) {
        fetchPage();
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async function saveBlockProps() {
    if (!selectedBlock || !page) return;
    setSavingProps(true);
    try {
      const res = await fetch(
        `/api/cms/pages/${params.id}/blocks?blockId=${selectedBlock}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ props: draftProps }),
        }
      );
      if (res.ok) {
        await fetchPage();
      } else {
        alert("Error al guardar propiedades");
      }
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
      alert("Error al guardar propiedades");
    } finally {
      setSavingProps(false);
    }
  }

  // When selectedBlock changes, load its current props into draftProps
  useEffect(() => {
    if (!selectedBlock || !page) return;
    const block = page.blocks.find((b) => b.id === selectedBlock);
    if (block) setDraftProps({ ...block.props });
  }, [selectedBlock, page]);

  if (!page) {
    return <div className="p-8 text-center">Cargando...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/cms")}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={page.title}
              onChange={(e) => setPage({ ...page, title: e.target.value })}
              className="text-xl font-bold border-b-2 border-transparent hover:border-gray-300 focus:border-[var(--data-success-500)]/30 outline-none"
            />
            <p className="text-sm text-[var(--text-secondary)]">/{page.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`/cms/${page.slug}`, "_blank")}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
            disabled={!page.id}
          >
            <Eye className="w-4 h-4" />
            Vista previa
          </button>
          <button
            onClick={savePage}
            disabled={saving}
            className="px-4 py-2 bg-[var(--accent-soft)] text-white rounded-lg hover:bg-[var(--accent-soft)] flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Blocks */}
        <div className="w-64 bg-gray-50 border-r overflow-y-auto">
          <div className="p-4">
            <CardTitle className="font-bold mb-3">Bloques disponibles</CardTitle>
            <div className="space-y-2">
              {AVAILABLE_BLOCKS.map((block) => (
                <button
                  key={block.type}
                  onClick={() => addBlock(block.type)}
                  className="w-full p-3 bg-white border rounded-lg hover:bg-[var(--accent-soft)] hover:border-[var(--data-success-500)]/30 text-left flex items-center gap-2"
                >
                  <block.icon className="h-5 w-5 text-[var(--data-success-500)]" />
                  <span className="font-medium">{block.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t p-4">
            <CardTitle className="font-bold mb-3">Bloques activos</CardTitle>
            <div className="space-y-2">
              {page.blocks
                .sort((a: Block, b: Block) => a.order - b.order)
                .map((block: Block) => (
                  <div
                    key={block.id}
                    className={`p-2 bg-white border rounded cursor-pointer ${
                      selectedBlock === block.id
                        ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)]"
                        : ""
                    }`}
                    onClick={() => setSelectedBlock(block.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium capitalize">
                        {block.type}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBlockVisibility(block.id, !block.visible);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          title={block.visible ? "Ocultar" : "Mostrar"}
                        >
                          <Eye
                            className={`w-4 h-4 ${
                              block.visible ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"
                            }`}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(block.id);
                          }}
                          className="p-1 hover:bg-[var(--data-error-100)] rounded"
                        >
                          <Trash2 className="w-4 h-4 text-[var(--data-error-500)]" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
          <div className="max-w-6xl mx-auto bg-white">
            {page.blocks.length === 0 ? (
              <div className="p-16 text-center text-[var(--text-secondary)]">
                <p className="text-xl mb-2">No hay bloques</p>
                <p>Agrega bloques desde la barra lateral</p>
              </div>
            ) : (
              page.blocks
                .filter((block) => block.visible)
                .sort((a, b) => a.order - b.order)
                .map((block) => {
                  const Component = BLOCK_COMPONENTS[block.type];
                  if (!Component) return null;

                  return (
                    <div
                      key={block.id}
                      className={`relative ${
                        selectedBlock === block.id
                          ? "ring-4 ring-[var(--data-success-500)]/40"
                          : ""
                      }`}
                      onClick={() => setSelectedBlock(block.id)}
                    >
                      <Component {...block.props} />
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Properties panel */}
        {selectedBlock && (() => {
          const block = page.blocks.find((b) => b.id === selectedBlock);
          if (!block) return null;
          const fields = BLOCK_FIELDS[block.type] ?? [];
          return (
            <div className="w-80 bg-white border-l overflow-y-auto flex flex-col">
              {/* Panel header */}
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                <div>
                  <CardTitle className="font-bold text-sm">Editar bloque</CardTitle>
                  <p className="text-xs text-[var(--text-secondary)] capitalize">{block.type}</p>
                </div>
                <button
                  onClick={saveBlockProps}
                  disabled={savingProps}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-soft)] text-white text-xs font-bold rounded-lg hover:bg-[var(--accent-soft)] disabled:opacity-60 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingProps ? "Guardando..." : "Guardar"}
                </button>
              </div>

              {/* Fields */}
              <div className="p-4 space-y-4 flex-1">
                {fields.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">No hay campos editables para este bloque.</p>
                ) : (
                  fields.map((field) => {
                    const FieldIcon = FIELD_TYPE_ICON[field.type];
                    const val = draftProps[field.key];

                    return (
                      <div key={field.key}>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                          <FieldIcon className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                          {field.label}
                        </label>

                        {field.type === "boolean" ? (
                          <button
                            onClick={() => setDraftProps((p) => ({ ...p, [field.key]: !val }))}
                            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                              val ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "border-[var(--rule-base)] bg-gray-50 text-[var(--text-secondary)]"
                            }`}
                          >
                            <span className={`w-9 h-5 rounded-full transition-colors relative ${val ? "bg-[var(--accent-soft)]" : "bg-gray-300"}`}>
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${val ? "left-4" : "left-0.5"}`} />
                            </span>
                            {val ? "Activado" : "Desactivado"}
                          </button>
                        ) : field.type === "color" ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={val ?? "#312e81"}
                              onChange={(e) => setDraftProps((p) => ({ ...p, [field.key]: e.target.value }))}
                              className="h-9 w-16 rounded border border-[var(--rule-base)] cursor-pointer"
                            />
                            <input
                              type="text"
                              value={val ?? ""}
                              onChange={(e) => setDraftProps((p) => ({ ...p, [field.key]: e.target.value }))}
                              placeholder="#312e81"
                              className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40 focus:border-[var(--data-success-500)]/30 font-mono"
                            />
                          </div>
                        ) : field.type === "textarea" ? (
                          <textarea
                            value={val ?? ""}
                            onChange={(e) => setDraftProps((p) => ({ ...p, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40 focus:border-[var(--data-success-500)]/30 resize-y"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val ?? ""}
                            onChange={(e) => setDraftProps((p) => ({ ...p, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40 focus:border-[var(--data-success-500)]/30"
                          />
                        )}

                        {/* Image preview */}
                        {field.type === "url" && val && (
                          <div className="relative mt-2 w-full h-24 rounded-lg overflow-hidden border border-[var(--rule-base)]">
                            <Image src={val} alt="preview" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer save button */}
              <div className="px-4 py-3 border-t bg-gray-50 sticky bottom-0">
                <button
                  onClick={saveBlockProps}
                  disabled={savingProps}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent-soft)] text-white text-sm font-bold rounded-lg hover:bg-[var(--accent-soft)] disabled:opacity-60 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingProps ? "Guardando cambios..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
