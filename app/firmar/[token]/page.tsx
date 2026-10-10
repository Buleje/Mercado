import { Metadata } from "next";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl } from "@/lib/documents/storage";
import { SignDocumentView } from "./SignDocumentView";

export const metadata: Metadata = {
  title: "Firmar documento · Buleje",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
      <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
        <div className="text-5xl mb-4">✍️</div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">{title}</h1>
        <p className="text-sm text-[var(--text-secondary,#475569)] mt-2">{body}</p>
      </div>
    </main>
  );
}

export default async function SignDocumentPage({ params }: Props) {
  const { token } = await params;
  const found = await DocumentsDB.findByShareToken(token);

  if (!found) {
    return <ErrorShell title="Enlace no disponible" body="Este enlace de firma expiró, fue revocado o nunca existió. Pedí al remitente que genere uno nuevo." />;
  }
  if (found.doc.mimeType !== "application/pdf") {
    return <ErrorShell title="No se puede firmar" body="Solo se pueden firmar documentos PDF. Pedí al remitente que lo envíe en ese formato." />;
  }

  const signedUrl = found.share.hasPassword ? null : await getSignedUrl(found.doc.storagePath, 60 * 60);

  return (
    <SignDocumentView
      token={token}
      doc={{ name: found.doc.name, size: found.doc.size }}
      hasPassword={found.share.hasPassword}
      initialSignedUrl={signedUrl}
    />
  );
}
