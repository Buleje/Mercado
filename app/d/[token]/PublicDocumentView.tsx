"use client";

import { useState } from "react";
import { Download, FileText, Lock, Shield } from "lucide-react";

interface Props {
  token: string;
  doc: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  };
  share: {
    expiresAt: string;
    hasPassword: boolean;
    accessCount: number;
  };
  initialSignedUrl: string | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function PublicDocumentView({ token, doc, share, initialSignedUrl }: Props) {
  const [password, setPassword] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPdf = doc.mimeType === "application/pdf";
  const isImage = doc.mimeType.startsWith("image/");

  async function unlock() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/public/documents/${encodeURIComponent(token)}?password=${encodeURIComponent(password)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "password_required" ? "Contraseña incorrecta" : "No se pudo abrir");
        return;
      }
      setSignedUrl(data.signedUrl);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  const fechaExpira = new Date(share.expiresAt).toLocaleDateString("es-PE", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const fechaSubida = new Date(doc.uploadedAt).toLocaleDateString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#f5f6f8] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900 truncate">{doc.name}</h1>
            <p className="text-xs text-slate-500 tabular-nums">
              {formatBytes(doc.size)} · subido {fechaSubida} · expira {fechaExpira} · {share.accessCount} accesos
            </p>
          </div>
          {signedUrl && (
            <a
              href={signedUrl}
              download={doc.name}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Descargar
            </a>
          )}
        </header>

        {/* Body */}
        {!signedUrl && share.hasPassword ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-extrabold text-slate-900">Documento protegido</h2>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Ingresá la contraseña que te dio el remitente para ver el documento.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              placeholder="Contraseña"
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition-all"
            />
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <button
              onClick={unlock}
              disabled={loading || !password}
              className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Verificando…" : "Abrir documento"}
            </button>
          </div>
        ) : signedUrl ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {isPdf ? (
              <iframe
                src={`/api/public/documents/${encodeURIComponent(token)}/raw${share.hasPassword && password ? `?password=${encodeURIComponent(password)}` : ""}`}
                title={doc.name}
                className="w-full h-[80vh] border-0"
              />
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/public/documents/${encodeURIComponent(token)}/raw${share.hasPassword && password ? `?password=${encodeURIComponent(password)}` : ""}`} alt={doc.name} className="w-full h-auto" />
            ) : (
              <div className="p-12 text-center">
                <FileText className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-base font-bold text-slate-700">Vista previa no disponible</p>
                <p className="text-sm text-slate-500 mt-1">Descargá el archivo para verlo en tu equipo.</p>
                <a
                  href={signedUrl}
                  download={doc.name}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Download className="h-4 w-4" /> Descargar archivo
                </a>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Shield className="h-3.5 w-3.5" />
          Enlace compartido vía Buleje · expira automáticamente
        </footer>
      </div>
    </main>
  );
}
