"use client";

import { useState } from "react";
import { Files, Lock, Shield } from "lucide-react";
import { fechaConDiaCorta } from "@/lib/documentos/enlace-varias-carpetas";
import { CarpetaCompartida, PedirClave, abrirCarpetasConClave, errorDeApertura, type DocPublico } from "./partes-carpeta";

/**
 * Varias carpetas en un enlace (`/c/<t1>?mas=<t2>,<t3>`). Cada sección es un
 * enlace de carpeta de siempre. Las que piden clave llegan vacías del servidor
 * (igual que una sola): la clave se pide UNA vez y se prueba contra todas en
 * UN pedido (`POST /api/public/folders/varias`, 23-10).
 */

export interface SeccionPublica {
  token: string;
  nombre: string;
  docs: DocPublico[];
  requierePassword: boolean;
}

type Estado =
  | { tipo: "abierta"; nombre: string; docs: DocPublico[] }
  | { tipo: "rechazada" }
  | { tipo: "fallo" };

function estadoInicial(s: SeccionPublica): Estado | null {
  return s.requierePassword ? null : { tipo: "abierta", nombre: s.nombre, docs: s.docs };
}

const CAJA = "rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white p-5 shadow-sm";

export function PublicFoldersView({ secciones, expiresAt }: { secciones: SeccionPublica[]; expiresAt: string }) {
  const conClave = secciones.some((s) => s.requierePassword);
  const [estados, setEstados] = useState<(Estado | null)[]>(() => secciones.map(estadoInicial));
  const [clave, setClave] = useState("");
  const [claveOk, setClaveOk] = useState(!conClave);
  const [verificando, setVerificando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  async function verificarClave(e: React.FormEvent) {
    e.preventDefault();
    if (!clave || verificando) return;
    setVerificando(true);
    setErrorClave(null);
    // Todas en UN pedido: antes era uno por carpeta y un enlace de 10 gastaba
    // 11 de los 20 del tope público (cada 5 min por IP).
    const r = await abrirCarpetasConClave(secciones.filter((s) => s.requierePassword).map((s) => s.token), clave);
    setVerificando(false);
    if (r.tipo !== "ok") {
      setErrorClave(errorDeApertura(r.tipo));
      return;
    }
    // Alguna la aceptó (si no, el servidor responde 401): las que no, lo dicen
    // en su sección; la que no volvió (venció en el medio), «no se pudo abrir».
    setEstados(secciones.map((s, i): Estado | null => (s.requierePassword ? (r.carpetas.get(s.token) ?? { tipo: "fallo" }) : estados[i])));
    setClave("");
    setClaveOk(true);
  }

  if (!claveOk) {
    return (
      <PedirClave
        titulo={`Estas ${secciones.length} carpetas piden una clave`}
        boton="Abrir las carpetas"
        etiqueta="Clave de las carpetas"
        clave={clave}
        onClave={setClave}
        verificando={verificando}
        error={errorClave}
        onSubmit={verificarClave}
      />
    );
  }

  const totalDocs = estados.reduce((n, s) => n + (s?.tipo === "abierta" ? s.docs.length : 0), 0);

  return (
    <main className="min-h-screen bg-[var(--surface-page,#f5f6f8)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className={`mb-6 flex items-center gap-4 ${CAJA}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary,#00a0a0)]/10 text-[var(--color-primary,#00a0a0)]"><Files className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-[var(--text-primary,#0f172a)]">{secciones.length} carpetas compartidas</h1>
            <p className="text-sm tabular-nums text-[var(--text-secondary,#475569)]">
              {totalDocs} documento{totalDocs === 1 ? "" : "s"} · vence el {fechaConDiaCorta(expiresAt)}
            </p>
          </div>
        </header>

        <div className="space-y-8">
          {secciones.map((s, i) => {
            const e = estados[i];
            return (
              <section key={s.token} data-carpeta-compartida={s.token.slice(0, 8)}>
                {e?.tipo === "abierta" ? (
                  <CarpetaCompartida token={s.token} nombre={e.nombre} lista={e.docs} titulo="h2" />
                ) : (
                  <div className={`flex items-center gap-3 text-sm text-[var(--text-secondary,#475569)] ${CAJA}`}>
                    <Lock className="h-5 w-5 shrink-0 text-[var(--text-tertiary,#94a3b8)]" />
                    {e?.tipo === "rechazada"
                      ? "Esta carpeta no acepta la clave que pusiste. Pídele la suya a quien te mandó el enlace."
                      : "Esta carpeta no se pudo abrir ahora. Recarga la página para probar de nuevo."}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary,#94a3b8)]">
          <Shield className="h-3.5 w-3.5" /> Carpetas compartidas vía Buleje · vencen automáticamente
        </footer>
      </div>
    </main>
  );
}
