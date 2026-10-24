"use client";
/** El SEO de una categoría: título, descripción, palabras clave, slug, imagen y canónica + vista previa en Google. */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, Globe, Link2, Search, Sparkles, Tag } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { puntajeSeo, ROTULO_SEO, type FilaCategoria, type SeoCategoria } from "./tipos";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

function Rotulo({ icono, texto, cuenta, excede }: { icono: ReactNode; texto: string; cuenta?: string; excede?: boolean }) {
  return (
    <span className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5">{icono}{texto}</span>
      {cuenta && <span className={cn("font-mono", excede ? "text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]")}>{cuenta}</span>}
    </span>
  );
}

export function PanelSeo({ cat, onCambiar, onGenerar }: {
  cat: FilaCategoria;
  onCambiar: (campo: keyof SeoCategoria, valor: string | string[]) => void;
  onGenerar: () => void;
}) {
  const seo = cat.seo ?? {};
  const puntaje = puntajeSeo(cat);
  const titulo = seo.metaTitle ?? "";
  const descripcion = seo.metaDescription ?? "";
  const faltas = [
    !titulo && "Falta el título",
    titulo && titulo.length < 30 && "Título corto (mínimo 30 caracteres)",
    titulo.length > 60 && "Título largo (máximo 60 caracteres)",
    !descripcion && "Falta la descripción",
    descripcion && descripcion.length < 120 && "Descripción corta (mínimo 120 caracteres)",
    descripcion.length > 160 && "Descripción larga (máximo 160 caracteres)",
    (!seo.keywords || seo.keywords.length < 3) && "Agrega al menos 3 palabras clave",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Globe className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          SEO de «{cat.label}»
        </CardTitle>
        <button
          type="button"
          onClick={onGenerar}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]"
        >
          <Sparkles className="h-4 w-4" aria-hidden /> Auto-generar
        </button>
      </div>

      <Field label={<Rotulo icono={<FileText className="h-4 w-4" aria-hidden />} texto="Título" cuenta={`${titulo.length}/60`} excede={titulo.length > 60} />} labelClassName="mb-1 block">
        <input value={titulo} onChange={(e) => onCambiar("metaTitle", e.target.value)} placeholder={`${cat.label} - tu tienda`} className={CAMPO} maxLength={70} />
      </Field>

      <Field label={<Rotulo icono={<FileText className="h-4 w-4" aria-hidden />} texto="Descripción" cuenta={`${descripcion.length}/160`} excede={descripcion.length > 160} />} labelClassName="mb-1 block">
        <textarea
          value={descripcion}
          onChange={(e) => onCambiar("metaDescription", e.target.value)}
          placeholder={`Compra ${cat.label.toLowerCase()} frescos en línea...`}
          className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          rows={3}
          maxLength={170}
        />
      </Field>

      <Field label={<Rotulo icono={<Tag className="h-4 w-4" aria-hidden />} texto="Palabras clave (separadas por coma, máx. 10)" cuenta={`${seo.keywords?.length ?? 0}/10`} />} labelClassName="mb-1 block">
        <input
          value={seo.keywords?.join(", ") ?? ""}
          onChange={(e) => onCambiar("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10))}
          placeholder="delivery, compra online…"
          className={CAMPO}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={<Rotulo icono={<Link2 className="h-4 w-4" aria-hidden />} texto="Slug" />} labelClassName="mb-1 block">
          <input
            value={seo.slug ?? ""}
            onChange={(e) => onCambiar("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="abarrotes"
            className={cn(CAMPO, "font-mono")}
          />
        </Field>
        <Field label={<Rotulo icono={<FileText className="h-4 w-4" aria-hidden />} texto="Imagen para redes (opcional)" />} labelClassName="mb-1 block">
          <input value={seo.ogImage ?? ""} onChange={(e) => onCambiar("ogImage", e.target.value)} placeholder="https://..." className={CAMPO} />
        </Field>
      </div>

      <Field label={<Rotulo icono={<Link2 className="h-4 w-4" aria-hidden />} texto="URL canónica (opcional)" />} labelClassName="mb-1 block">
        <input value={seo.canonical ?? ""} onChange={(e) => onCambiar("canonical", e.target.value)} placeholder="https://…/categoria/..." className={CAMPO} />
      </Field>

      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          <Search className="h-4 w-4" aria-hidden /> Vista previa en Google
        </p>
        <p className="text-sm text-[var(--data-success-ink)]">› categoria › {seo.slug || cat.id}</p>
        <p className="text-lg font-medium leading-snug text-[var(--accent-ink)] dark:text-[var(--accent)]">{titulo || cat.label}</p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{descripcion || `Compra ${cat.label.toLowerCase()} en tu tienda.`}</p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 text-sm" role="status">
        <span className={cn(
          "font-semibold",
          puntaje === "good" && "text-[var(--data-success-ink)]",
          puntaje === "warning" && "text-[var(--data-warning-ink)]",
          puntaje === "error" && "text-[var(--data-error-ink)]",
        )}>
          {ROTULO_SEO[puntaje]}
        </span>
        {faltas.length > 0 && <span className="text-[var(--text-secondary)]">· {faltas.join(" · ")}</span>}
      </div>
    </div>
  );
}
