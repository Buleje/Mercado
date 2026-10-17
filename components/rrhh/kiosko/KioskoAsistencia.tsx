"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { RespuestaKiosko, TipoMarcaKiosko } from "@/lib/rrhh/kiosko";
import { AvisoKiosko, BotonesTipo, FormCodigo, RelojKiosko, ResultadoKiosko } from "./KioskoPartes";
import { useCamaraKiosko } from "./use-camara-kiosko";
import { useEmparejarKiosko } from "./use-emparejar-kiosko";

/**
 * La pantalla del kiosko de asistencia (`/kiosko/asistencia/<token>`): la
 * tablet del local, sin sesión. Elegir ENTRADA/SALIDA → mostrar el QR del
 * fotocheck (o tipear el DNI) → la cámara toma la foto → «¡Listo, Ana! 07:42».
 * Vuelve sola al inicio. Al abrir, ata el enlace a esta tablet (otro aparato
 * ve un aviso y no marca). Contrato en `lib/rrhh/kiosko.ts` y `kiosko-aparato.ts`.
 */

type Paso =
  | { id: "elegir" }
  | { id: "escanear"; tipo: TipoMarcaKiosko }
  | { id: "enviando"; tipo: TipoMarcaKiosko }
  | { id: "resultado"; r: RespuestaKiosko };

const VUELVE_SOLO_MS = 30_000;
const RESULTADO_MS = 5_000;
/** Tras leer el QR, un respiro para que la persona baje el fotocheck y salga en la foto. */
const PAUSA_FOTO_MS = 900;

export default function KioskoAsistencia({ token }: { token: string }) {
  const vinculo = useEmparejarKiosko(token);
  if (vinculo.id === "cargando") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-12 w-12 animate-spin text-[var(--text-tertiary)]" aria-label="Abriendo el kiosko" />
      </main>
    );
  }
  if (vinculo.id === "error") return <AvisoKiosko mensaje={vinculo.message} />;
  /* La cámara se prende recién con la tablet atada: el <video> tiene que existir cuando llega el stream. */
  return <PantallaKiosko token={token} fotoObligatoria={vinculo.fotoObligatoria} />;
}

function PantallaKiosko({ token, fotoObligatoria }: { token: string; fotoObligatoria: boolean }) {
  const [paso, setPaso] = useState<Paso>({ id: "elegir" });
  const ocupado = useRef(false);

  const enviar = useCallback(
    async (tipo: TipoMarcaKiosko, codigo: string, foto: Blob | null) => {
      setPaso({ id: "enviando", tipo });
      const fd = new FormData();
      fd.set("token", token);
      fd.set("codigo", codigo);
      fd.set("tipo", tipo);
      if (foto) fd.set("file", foto, "marca.jpg");
      let r: RespuestaKiosko;
      try {
        const res = await fetch("/api/kiosko/asistencia", { method: "POST", body: fd, headers: csrfHeaders() });
        const data = (await res.json().catch((err: unknown) => {
          logger.warn("[kiosko] respuesta sin JSON", { status: res.status, error: String(err) });
          return null;
        })) as RespuestaKiosko | null;
        r =
          data && typeof data === "object" && "ok" in data
            ? data
            : { ok: false, error: `http_${res.status}`, message: res.status === 429 ? "Muchas marcas seguidas: espera un minuto." : "No se pudo marcar. Intenta de nuevo." };
      } catch (err) {
        logger.warn("[kiosko] no se pudo enviar la marca", { error: String(err) });
        r = { ok: false, error: "red", message: "Sin conexión. Revisa el internet de la tablet e intenta de nuevo." };
      }
      setPaso({ id: "resultado", r });
      ocupado.current = false;
    },
    [token],
  );

  const tipoActual = paso.id === "escanear" ? paso.tipo : null;
  const { videoRef, estado, leeQr, capturar } = useCamaraKiosko(tipoActual != null, (texto) => {
    if (!tipoActual || ocupado.current) return;
    ocupado.current = true;
    const tipo = tipoActual;
    setPaso({ id: "enviando", tipo });
    setTimeout(() => {
      void capturar().then((foto) => enviar(tipo, texto, foto));
    }, PAUSA_FOTO_MS);
  });

  const conTeclado = (codigo: string) => {
    if (!tipoActual || ocupado.current) return;
    ocupado.current = true;
    void capturar().then((foto) => enviar(tipoActual, codigo, foto));
  };

  // Volver solo al inicio: tras el resultado, o si nadie marcó.
  useEffect(() => {
    if (paso.id !== "resultado" && paso.id !== "escanear") return;
    const id = setTimeout(() => setPaso({ id: "elegir" }), paso.id === "resultado" ? RESULTADO_MS : VUELVE_SOLO_MS);
    return () => clearTimeout(id);
  }, [paso]);

  // Que la tablet no apague la pantalla.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request("screen")
      .then((l) => {
        lock = l;
      })
      .catch((err: unknown) => logger.warn("[kiosko] sin wake lock", { error: String(err) }));
    return () => {
      lock?.release().catch((err: unknown) => logger.warn("[kiosko] wake lock", { error: String(err) }));
    };
  }, []);

  /* Sin foto no hay marca, salvo que el dueño lo permita: el aviso no promete el DNI si no va a servir. */
  const avisoCamara =
    (estado === "sin_permiso" || estado === "sin_camara") && fotoObligatoria
      ? `${estado === "sin_permiso" ? "La cámara está bloqueada: dale permiso en el navegador." : "Esta tablet no tiene cámara disponible."} Sin foto no se puede marcar: avísale al encargado.`
      : estado === "sin_permiso"
        ? "La cámara está bloqueada: dale permiso en el navegador. Mientras tanto, marca con tu DNI."
        : estado === "sin_camara"
          ? "Esta tablet no tiene cámara disponible: marca con tu DNI."
          : !leeQr
            ? "Este navegador no lee QR: marca con tu DNI (la foto se toma igual)."
            : null;


  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-[var(--surface-canvas)] px-6 py-8">
      <header className="flex w-full max-w-5xl items-center justify-between gap-4">
        <PageTitle className="text-3xl">Marca tu asistencia</PageTitle>
        <RelojKiosko />
      </header>

      <div className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8">
        {/* El video siempre montado: la cámara queda prendida entre marcas. */}
        <div
          className={cn(
            "relative aspect-video w-full max-w-2xl overflow-hidden rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]",
            paso.id === "escanear" || paso.id === "enviando" ? "" : "hidden",
          )}
        >
          <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Cámara del kiosko" />
          {paso.id === "escanear" && estado === "lista" && leeQr && (
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-dashed border-[var(--accent)]" aria-hidden />
          )}
        </div>
        {/* Ley 29733, deber de informar: la marca guarda una foto de la cara. */}
        {(paso.id === "escanear" || paso.id === "enviando") && (
          <p className="text-base text-[var(--text-secondary)]">
            Al marcar se toma una foto para tu registro de asistencia; solo la ve el encargado.
          </p>
        )}

        {paso.id === "elegir" && (
          <>
            <p className="text-2xl text-[var(--text-secondary)]">¿Llegas o te vas?</p>
            <BotonesTipo onElegir={(tipo) => setPaso({ id: "escanear", tipo })} />
          </>
        )}

        {paso.id === "escanear" && (
          <>
            <p className="flex items-center gap-3 text-3xl font-semibold text-[var(--text-primary)]">
              <QrCode className="h-9 w-9" aria-hidden />
              {paso.tipo === "ENTRADA" ? "Entrada" : "Salida"}: muestra el QR de tu fotocheck
            </p>
            <FormCodigo onEnviar={conTeclado} deshabilitado={false} />
            {avisoCamara && <p className="max-w-2xl text-center text-lg text-[var(--data-warning-700)]">{avisoCamara}</p>}
            <button type="button" onClick={() => setPaso({ id: "elegir" })} className="text-xl text-[var(--text-tertiary)] underline">
              Volver
            </button>
          </>
        )}

        {paso.id === "enviando" && (
          <p className="flex items-center gap-3 text-3xl text-[var(--text-secondary)]" role="status">
            <Loader2 className="h-9 w-9 animate-spin" aria-hidden /> Mira a la cámara…
          </p>
        )}

        {paso.id === "resultado" && <ResultadoKiosko r={paso.r} />}
      </div>

      <p className="text-center text-base text-[var(--text-tertiary)]">Cada marca guarda una foto para el encargado.</p>
    </main>
  );
}
