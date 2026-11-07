"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { CarpetaCompartida, PedirClave, abrirCarpetasConClave, errorDeApertura, type DocPublico } from "./partes-carpeta";

interface Props {
  token: string;
  folderName: string;
  docs: DocPublico[];
  expiresAt: string;
  /** El enlace pide clave: la lista llega recién cuando el visitante la acierta. */
  requierePassword?: boolean;
}

export function PublicFolderView({ token, folderName, docs, expiresAt, requierePassword = false }: Props) {
  const [clave, setClave] = useState("");
  const [claveOk, setClaveOk] = useState(!requierePassword);
  const [verificando, setVerificando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [nombre, setNombre] = useState(folderName);
  const [lista, setLista] = useState<DocPublico[]>(docs);

  async function verificarClave(e: React.FormEvent) {
    e.preventDefault();
    if (!clave || verificando) return;
    setVerificando(true);
    setErrorClave(null);
    const r = await abrirCarpetasConClave([token], clave);
    setVerificando(false);
    const carpeta = r.tipo === "ok" ? r.carpetas.get(token) : undefined;
    if (carpeta?.tipo !== "abierta") {
      setErrorClave(errorDeApertura(r.tipo === "ok" ? "rechazada" : r.tipo));
      return;
    }
    setNombre(carpeta.nombre);
    setLista(carpeta.docs);
    // Ya abrió: la clave no se guarda más (ver y bajar van con la cookie).
    setClave("");
    setClaveOk(true);
  }

  if (!claveOk) {
    return (
      <PedirClave
        titulo="Esta carpeta pide una clave"
        boton="Abrir la carpeta"
        etiqueta="Clave de la carpeta"
        clave={clave}
        onClave={setClave}
        verificando={verificando}
        error={errorClave}
        onSubmit={verificarClave}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page,#f5f6f8)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <CarpetaCompartida token={token} nombre={nombre} lista={lista} expiresAt={expiresAt} />

        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary,#94a3b8)]">
          <Shield className="h-3.5 w-3.5" /> Carpeta compartida vía Buleje · expira automáticamente
        </footer>
      </div>
    </main>
  );
}
