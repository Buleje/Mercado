import { Metadata } from "next";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl } from "@/lib/documents/storage";
import { logger } from "@/lib/logger";
import { PublicDocumentView } from "./PublicDocumentView";


export const metadata: Metadata = {
  title: "Documento compartido · Buleje",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PublicDocumentPage({ params }: Props) {
  const { token } = await params;

  const found = await DocumentsDB.findByShareToken(token);

  if (!found) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
        <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
          <div className="text-5xl mb-4">⏱</div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">
            Enlace no disponible
          </h1>
          <p className="text-sm text-[var(--text-secondary,#475569)] mt-2">
            Este enlace expiró, fue revocado o nunca existió.
            <br />
            Pedí al remitente que genere uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  // Si tiene password, NO pre-firmamos URL — la página pedirá password y consultará la API pública.
  const signedUrl = found.share.hasPassword
    ? null
    : await getSignedUrl(found.doc.storagePath, 60 * 60);

  // Increment cuenta solo si no hay password (en password lo hace el endpoint)
  if (!found.share.hasPassword) {
    DocumentsDB.incrementShareAccess(found.share.id).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));
  }

  return (
    <PublicDocumentView
      token={token}
      doc={{
        id: found.doc.id,
        name: found.doc.name,
        mimeType: found.doc.mimeType,
        size: found.doc.size,
        uploadedAt: found.doc.uploadedAt,
      }}
      share={{
        expiresAt: found.share.expiresAt,
        hasPassword: found.share.hasPassword,
        accessCount: found.share.accessCount + (found.share.hasPassword ? 0 : 1),
      }}
      initialSignedUrl={signedUrl}
    />
  );
}
