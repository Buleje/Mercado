"use client";

import { useState } from "react";
import { FolderArchive, FileText, Image as ImageIcon, Download, Eye, Shield, FileArchive, Loader2 } from "lucide-react";

interface Doc { id: string; name: string; mimeType: string; size: number; uploadedAt: string }
interface Props { token: string; folderName: string; docs: Doc[]; expiresAt: string }

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function PublicFolderView({ token, folderName, docs, expiresAt }: Props) {
  const [zipping, setZipping] = useState(false);
  const rawUrl = (id: string) => `/api/public/folders/${encodeURIComponent(token)}/docs/${id}/raw`;
  const fechaExpira = new Date(expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  async function downloadAllZip() {
    if (zipping || docs.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const seen = new Map<string, number>();
      for (const d of docs) {
        const res = await fetch(rawUrl(d.id));
        if (!res.ok) continue;
        const blob = await res.blob();
        let name = d.name || `documento-${d.id}`;
        const dup = seen.get(name) ?? 0;
        seen.set(name, dup + 1);
        if (dup > 0) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${dup})${name.slice(dot)}` : `${name} (${dup})`;
        }
        zip.file(name, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName.replace(/[^\w.-]+/g, "_") || "carpeta"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page,#f5f6f8)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center gap-4 rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white p-5 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary,#00a0a0)]/10 text-[var(--color-primary,#00a0a0)]"><FolderArchive className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-[var(--text-primary,#0f172a)]">{folderName}</h1>
            <p className="text-xs tabular-nums text-[var(--text-tertiary,#94a3b8)]">{docs.length} documento{docs.length === 1 ? "" : "s"} · expira {fechaExpira}</p>
          </div>
          {docs.length > 0 && (
            <button
              onClick={downloadAllZip}
              disabled={zipping}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary,#00a0a0)] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />} {zipping ? "Comprimiendo…" : "Descargar todo (ZIP)"}
            </button>
          )}
        </header>

        {docs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white p-10 text-center text-sm text-[var(--text-tertiary,#94a3b8)]">
            Esta carpeta no tiene documentos.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-base,#eef1f4)] overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white shadow-sm">
            {docs.map((d) => {
              const isImage = d.mimeType.startsWith("image/");
              const Icon = isImage ? ImageIcon : FileText;
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken,#f1f5f9)] text-[var(--text-tertiary,#94a3b8)]"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-primary,#0f172a)]">{d.name}</p>
                    <p className="text-xs tabular-nums text-[var(--text-tertiary,#94a3b8)]">{formatBytes(d.size)}</p>
                  </div>
                  <a href={rawUrl(d.id)} target="_blank" rel="noopener" className="rounded-md p-2 text-[var(--text-tertiary,#94a3b8)] hover:bg-[var(--surface-sunken,#f1f5f9)] hover:text-[var(--color-primary,#00a0a0)]" title="Ver" aria-label={`Ver ${d.name}`}><Eye className="h-4 w-4" /></a>
                  <a href={`${rawUrl(d.id)}?download=1`} className="rounded-md p-2 text-[var(--text-tertiary,#94a3b8)] hover:bg-[var(--surface-sunken,#f1f5f9)] hover:text-[var(--color-primary,#00a0a0)]" title="Descargar" aria-label={`Descargar ${d.name}`}><Download className="h-4 w-4" /></a>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary,#94a3b8)]">
          <Shield className="h-3.5 w-3.5" /> Carpeta compartida vía Buleje · expira automáticamente
        </footer>
      </div>
    </main>
  );
}
