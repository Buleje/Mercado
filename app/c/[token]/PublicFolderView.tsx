"use client";

import { useState } from "react";
import { FolderArchive, FileText, Image as ImageIcon, Download, Eye, Shield, FileArchive, Loader2, Lock } from "lucide-react";

interface Doc { id: string; name: string; mimeType: string; size: number; uploadedAt: string }
interface Props {
  token: string;
  folderName: string;
  docs: Doc[];
  expiresAt: string;
  /** El enlace pide clave: la lista llega recién cuando el visitante la acierta. */
  requierePassword?: boolean;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function PublicFolderView({ token, folderName, docs, expiresAt, requierePassword = false }: Props) {
  const [zipping, setZipping] = useState(false);
  const [clave, setClave] = useState("");
  const [claveOk, setClaveOk] = useState(!requierePassword);
  const [verificando, setVerificando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [nombre, setNombre] = useState(folderName);
  const [lista, setLista] = useState<Doc[]>(docs);

  const sufijoClave = claveOk && clave ? `?password=${encodeURIComponent(clave)}` : "";
  const rawUrl = (id: string) => `/api/public/folders/${encodeURIComponent(token)}/docs/${id}/raw${sufijoClave}`;
  const urlDescarga = (id: string) =>
    `/api/public/folders/${encodeURIComponent(token)}/docs/${id}/raw?download=1${claveOk && clave ? `&password=${encodeURIComponent(clave)}` : ""}`;
  const fechaExpira = new Date(expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  async function verificarClave(e: React.FormEvent) {
    e.preventDefault();
    if (!clave || verificando) return;
    setVerificando(true);
    setErrorClave(null);
    try {
      const res = await fetch(`/api/public/folders/${encodeURIComponent(token)}?password=${encodeURIComponent(clave)}`);
      if (!res.ok) {
        setErrorClave(res.status === 401 ? "La clave no es correcta." : "No se pudo abrir la carpeta.");
        return;
      }
      const data = await res.json();
      setNombre(data.folder?.name ?? "");
      setLista(data.docs ?? []);
      setClaveOk(true);
    } catch {
      setErrorClave("No se pudo conectar. Probá de nuevo.");
    } finally {
      setVerificando(false);
    }
  }

  if (!claveOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
        <form onSubmit={verificarClave} className="w-full max-w-sm rounded-3xl border border-[var(--rule-base,#e5e7eb)] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken,#f1f5f9)] text-[var(--text-tertiary,#94a3b8)]">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold text-[var(--text-primary,#0f172a)]">Esta carpeta pide una clave</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary,#475569)]">Pedísela a quien te mandó el enlace.</p>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Clave"
            aria-label="Clave de la carpeta"
            className="mt-5 h-12 w-full rounded-xl border-2 border-[var(--rule-base,#e5e7eb)] px-3 text-center text-base text-[var(--text-primary,#0f172a)] focus:border-[var(--color-primary,#00a0a0)] focus:outline-none"
          />
          {errorClave && <p className="mt-2 text-sm font-bold text-[#b91c1c]">{errorClave}</p>}
          <button
            type="submit"
            disabled={!clave || verificando}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary,#00a0a0)] text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Abrir la carpeta
          </button>
        </form>
      </main>
    );
  }

  async function downloadAllZip() {
    if (zipping || lista.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const seen = new Map<string, number>();
      for (const d of lista) {
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
      a.download = `${nombre.replace(/[^\w.-]+/g, "_") || "carpeta"}.zip`;
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
            <h1 className="truncate text-lg font-extrabold text-[var(--text-primary,#0f172a)]">{nombre}</h1>
            <p className="text-xs tabular-nums text-[var(--text-tertiary,#94a3b8)]">{lista.length} documento{lista.length === 1 ? "" : "s"} · expira {fechaExpira}</p>
          </div>
          {lista.length > 0 && (
            <button
              onClick={downloadAllZip}
              disabled={zipping}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary,#00a0a0)] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />} {zipping ? "Comprimiendo…" : "Descargar todo (ZIP)"}
            </button>
          )}
        </header>

        {lista.length === 0 ? (
          <div className="rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white p-10 text-center text-sm text-[var(--text-tertiary,#94a3b8)]">
            Esta carpeta no tiene documentos.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-base,#eef1f4)] overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white shadow-sm">
            {lista.map((d) => {
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
                  <a href={urlDescarga(d.id)} className="rounded-md p-2 text-[var(--text-tertiary,#94a3b8)] hover:bg-[var(--surface-sunken,#f1f5f9)] hover:text-[var(--color-primary,#00a0a0)]" title="Descargar" aria-label={`Descargar ${d.name}`}><Download className="h-4 w-4" /></a>
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
