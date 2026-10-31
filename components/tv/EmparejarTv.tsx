"use client";

/**
 * El TV sin vincular: el código en GRANDE (3-3), el QR que lleva al panel con
 * el código puesto, y en una línea qué hacer. Pregunta solo cada 2 s si ya lo
 * vincularon y cambia el código cuando vence (`useEmparejarTv`).
 */

import { useEffect, useState } from "react";
import { Loader2, Tv } from "@buleje/design-system/icons";
import { TV_CODIGO_VIDA_S, urlVincularDesdeQr } from "@/lib/camaras/pantallas-tv";
import QrImagen from "./QrImagen";
import HoraTv from "./HoraTv";
import { separarCodigo } from "./tv-ui";
import { useEmparejarTv } from "./use-sesion-tv";

export default function EmparejarTv({ onVinculada }: { onVinculada: () => void }) {
  const { codigo, aviso } = useEmparejarTv(true, onVinculada);
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);

  return (
    <main className="flex h-full flex-col px-[5vw] py-[5vh]" data-tv-emparejar>
      <header className="flex items-center gap-4 text-3xl font-bold text-[var(--text-secondary)]">
        <Tv className="h-10 w-10 text-[var(--accent)]" aria-hidden />
        <span className="flex-1">Cámaras en el televisor</span>
        <HoraTv className="tabular-nums" />
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-[6vw]">
        <section className="flex max-w-[40rem] flex-col gap-8" aria-live="polite">
          <p className="text-4xl font-bold leading-tight text-[var(--text-primary)]">
            En tu celular o PC: Cámaras → Ver en otra pantalla → escribe este código
          </p>
          {codigo ? (
            <p
              className="font-mono text-7xl font-bold tracking-widest text-[var(--accent)] tabular-nums"
              aria-label={`Código ${codigo.codigo.split("").join(" ")}`}
              data-tv-codigo
            >
              {separarCodigo(codigo.codigo)}
            </p>
          ) : (
            <p className="flex items-center gap-4 text-4xl text-[var(--text-secondary)]">
              <Loader2 className="h-10 w-10 animate-spin" aria-hidden /> Pidiendo un código…
            </p>
          )}
          <p className="text-2xl text-[var(--text-secondary)]">
            {`Vale ${Math.round(TV_CODIGO_VIDA_S / 60)} minutos; después aparece otro solo.`}
          </p>
          {aviso && <p className="text-2xl font-bold text-[var(--data-warning-500)]">{aviso}</p>}
        </section>

        {codigo && origen && (
          <figure className="flex flex-col items-center gap-4">
            <QrImagen
              texto={urlVincularDesdeQr(origen, codigo.codigo)}
              lado={320}
              alt="QR para vincular este televisor desde tu celular"
              className="h-[min(40vh,20rem)] w-[min(40vh,20rem)] rounded-2xl"
            />
            <figcaption className="text-2xl text-[var(--text-secondary)]">
              O escanéalo con tu celular
            </figcaption>
          </figure>
        )}
      </div>
    </main>
  );
}
