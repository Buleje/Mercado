import { Metadata } from "next";
import { FolderArchive } from "lucide-react";
import { DocumentsDB } from "@/lib/db/documents.db";
import { PublicFolderView } from "./PublicFolderView";

export const metadata: Metadata = {
  title: "Carpeta compartida · Buleje",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PublicFolderPage({ params }: Props) {
  const { token } = await params;
  const found = await DocumentsDB.findByFolderShareToken(token);

  if (!found) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
        <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken,#f1f5f9)] text-[var(--text-tertiary,#94a3b8)]">
            <FolderArchive className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">Carpeta no disponible</h1>
          <p className="text-sm text-[var(--text-secondary,#475569)] mt-2">Este enlace de carpeta expiró, fue revocado o nunca existió. Pedí al remitente que genere uno nuevo.</p>
        </div>
      </main>
    );
  }

  return (
    <PublicFolderView token={token} folderName={found.folder.name} docs={found.docs} expiresAt={found.expiresAt} />
  );
}
