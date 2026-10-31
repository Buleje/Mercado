import { Metadata } from "next";
import { headers } from "next/headers";
import { applyRateLimit } from "@/lib/rate-limit";
import { FolderArchive } from "lucide-react";
import { DocumentsDB } from "@/lib/db/documents.db";
import { leerTokensMas } from "@/lib/documentos/enlace-varias-carpetas";
import { PublicFolderView } from "./PublicFolderView";
import { PublicFoldersView } from "./PublicFoldersView";

export const metadata: Metadata = {
  title: "Carpeta compartida · Buleje",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mas?: string | string[] }>;
};

type Encontrada = NonNullable<Awaited<ReturnType<typeof DocumentsDB.findByFolderShareToken>>>;

function NoDisponible() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
      <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken,#f1f5f9)] text-[var(--text-tertiary,#94a3b8)]">
          <FolderArchive className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">Carpeta no disponible</h1>
        <p className="text-sm text-[var(--text-secondary,#475569)] mt-2">Este enlace de carpeta expiró, fue revocado o nunca existió. Pídele a quien te lo mandó que genere uno nuevo.</p>
      </div>
    </main>
  );
}

function MuchasVisitas() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
      <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">Espera unos minutos</h1>
        <p className="text-sm text-[var(--text-secondary,#475569)] mt-2">Se abrió este enlace muchas veces seguidas. Vuelve a intentarlo en 5 minutos.</p>
      </div>
    </main>
  );
}

// Con clave, el servidor NO entrega la lista: la pide el cliente contra la API
// pública mandando la clave. Si no, el listado viajaría en el HTML igual.
function UnaCarpeta({ token, found }: { token: string; found: Encontrada }) {
  return (
    <PublicFolderView
      token={token}
      folderName={found.hasPassword ? "" : found.folder.name}
      docs={found.hasPassword ? [] : found.docs}
      expiresAt={found.expiresAt}
      requierePassword={found.hasPassword}
    />
  );
}

export default async function PublicFolderPage({ params, searchParams }: Props) {
  const { token } = await params;
  const extras = leerTokensMas((await searchParams).mas, token);

  if (extras.length === 0) {
    const found = await DocumentsDB.findByFolderShareToken(token);
    return found ? <UnaCarpeta token={token} found={found} /> : <NoDisponible />;
  }

  // Varias carpetas: cada visita consulta hasta 10 enlaces. Tope propio por IP
  // (revisión de seguridad 23-10); el enlace de una sola carpeta queda como siempre.
  if (applyRateLimit({ headers: await headers() }, "MODERATE", "public:folders:varias")) return <MuchasVisitas />;

  // Varias carpetas (`?mas=`): cada token se resuelve como si llegara solo; los
  // vencidos, revocados o inexistentes se omiten en silencio.
  const tokens = [token, ...extras];
  const resueltas = await Promise.all(tokens.map((t) => DocumentsDB.findByFolderShareToken(t)));
  const vivas = tokens
    .map((t, i) => ({ token: t, found: resueltas[i] }))
    .filter((x): x is { token: string; found: Encontrada } => x.found !== null);
  if (vivas.length === 0) return <NoDisponible />;

  // Un enlace no mezcla negocios: sólo las del mismo negocio que la primera viva.
  const negocio = vivas[0].found.tenantId;
  const juntas = vivas.filter((x) => x.found.tenantId === negocio);
  if (juntas.length === 1) return <UnaCarpeta token={juntas[0].token} found={juntas[0].found} />;

  const vence = juntas.map((x) => x.found.expiresAt).sort()[0];
  return (
    <PublicFoldersView
      expiresAt={vence}
      secciones={juntas.map(({ token: t, found }) => ({
        token: t,
        nombre: found.hasPassword ? "" : found.folder.name,
        docs: found.hasPassword ? [] : found.docs,
        requierePassword: found.hasPassword,
      }))}
    />
  );
}
