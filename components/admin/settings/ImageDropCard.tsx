"use client";

/**
 * Tarjeta para subir Logo / Portada / Banner con su mini-maqueta. Salió de
 * `SettingsModule` tal cual estaba.
 */
import Image from "next/image";
import { Loader2, Store, Upload } from "@buleje/design-system/icons";

// ─── Image Drop Card ─────────────────────────────────────────────────────────
//
// Card unificado para subir imágenes (Logo / Portada / Banner). Cada uno
// muestra:
//  - Label + hint del aspect ratio recomendado
//  - Mini-mockup que ANTICIPA dónde va a aparecer la imagen
//  - Dropzone con preview en el aspect-ratio real
//  - Input URL alternativo
//  - Botón "Quitar" sobre el preview

interface ImageDropCardProps {
  label: string;
  hint: string;
  whereVisible: string;
  value: string;
  previewClass: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mockup: React.ReactNode;
}

export function ImageDropCard({
  label,
  hint,
  whereVisible,
  value,
  previewClass,
  inputRef,
  onChange,
  uploading,
  onUpload,
  mockup,
}: ImageDropCardProps) {
  const safeUrl = value && !value.startsWith("data:") ? value : "";
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-extrabold text-[var(--text-primary)] truncate">{label}</h4>
          <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
        </div>
      </div>

      {/* Donde aparece (mini-mockup) */}
      <div className="rounded-xl bg-[var(--surface-sunken)] p-3 border border-[var(--rule-soft)]">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Aparece en
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-2">{whereVisible}</p>
        {mockup}
      </div>

      {/* Preview o dropzone */}
      <div className="space-y-2">
        {value ? (
          <div className={`relative w-full overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] ${previewClass}`}>
            <Image src={value} alt={label} fill className="object-contain" unoptimized onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <button
              onClick={() => onChange("")}
              className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-bold hover:bg-black/90 transition-colors"
            >
              Quitar
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 text-[var(--text-primary)] text-xs font-bold hover:bg-white dark:bg-[var(--color-card)] transition-colors disabled:opacity-60"
            >
              <Upload className="h-3 w-3" />
              Cambiar
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] hover:border-primary text-[var(--text-secondary)] hover:text-primary bg-[var(--surface-sunken)] transition-all disabled:opacity-60 disabled:cursor-wait ${previewClass}`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-bold">Subiendo…</span>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6" />
                <span className="text-sm font-bold">Subir imagen</span>
                <span className="text-xs text-[var(--text-tertiary)]">JPG · PNG · WebP</span>
              </>
            )}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
        <input
          aria-label={`URL de ${label}`}
          value={safeUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="o pega URL: https://…"
          className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  );
}

// ─── Mini-mockups ────────────────────────────────────────────────────────────
// Visualizan dónde aparece cada imagen en su contexto real, en miniatura.

export function MockHeader({ logoUrl }: { logoUrl: string }) {
  return (
    <div className="rounded-md bg-[#0b1f2b] text-white/80 px-2 py-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)]">
      <div className="w-1 h-3 bg-white/15 rounded-sm" />
      <div className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[color-mix(in_oklab,var(--accent)_70%,white)] font-bold">
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="h-3 w-3 rounded object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <Store className="h-2.5 w-2.5" />
        )}
        <span className="truncate max-w-[40px]">Tienda</span>
      </div>
    </div>
  );
}

export function MockStoreCard({ coverUrl, logoUrl, businessName }: { coverUrl: string; logoUrl: string; businessName: string }) {
  return (
    <div className="rounded-md overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] ">
      <div className="aspect-[4/3] bg-linear-to-br from-primary/10 to-primary/30 relative">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">Portada</div>
        )}
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="absolute bottom-1 left-1 h-4 w-4 rounded-md ring-1 ring-white object-cover bg-[var(--surface-raised)] " />
        )}
      </div>
      <div className="px-1.5 py-1">
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] truncate">{businessName || "Tu tienda"}</p>
      </div>
    </div>
  );
}

export function MockStorefront({ bannerUrl, logoUrl, businessName }: { bannerUrl: string; logoUrl: string; businessName: string }) {
  return (
    <div className="rounded-md overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] ">
      <div className="aspect-[16/5] bg-linear-to-r from-primary/15 via-primary/25 to-primary/10 relative">
        {bannerUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={bannerUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">Banner gigante</div>
        )}
      </div>
      <div className="px-1.5 py-1 flex items-center gap-1">
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="h-3 w-3 rounded-sm object-cover" />
        )}
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] truncate">{businessName || "Tu tienda"}</p>
      </div>
    </div>
  );
}