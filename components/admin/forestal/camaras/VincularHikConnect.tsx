"use client";

/**
 * «Hik-Connect» en la vista Cámaras (ADR-471): vincular la cuenta de
 * Hik-Connect for Teams con su AppKey/SecretKey y enlazar cada cámara de
 * Hikvision con una del sistema. Con eso, «En vivo» abre el video acá adentro
 * en vez de mandar a la app.
 *
 * Escribir es de admin y dueño (el servidor lo exige con `soloAdminODueno`);
 * el resto ve el estado y nada más. Las claves no vuelven nunca: la pantalla
 * sólo sabe «vinculada, región y últimos 4».
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, KeyRound, Link2, Loader2, Trash2, Video } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { MensajeAccion } from "./AvisosCamaras";
import { BLOQUE, BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";
import type { RegionElegida } from "./use-hik-connect";
import { useVisorNubeContexto } from "./VisorNubeContexto";
import VincularHikConnectLista from "./VincularHikConnectLista";
import QuienMiro from "./QuienMiro";
import VincularHikConnectPasos from "./VincularHikConnectPasos";

const CAMPO =
  "mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

const REGIONES: { value: RegionElegida; label: string }[] = [
  { value: "auto", label: "Automática (recomendado)" },
  { value: "sa", label: "América del Sur" },
  { value: "us", label: "Norteamérica" },
  { value: "eu", label: "Europa" },
  { value: "sgp", label: "Asia" },
];

export default function VincularHikConnect({
  camaras,
  onCrear,
}: {
  camaras: { id: string; nombre: string }[];
  /** Crea una cámara del sistema y devuelve su id (para enlazar en un toque). */
  onCrear?: (nombre: string) => Promise<string | null>;
}) {
  const ctx = useVisorNubeContexto();
  const rol = useMiRol();
  /* `null` = todavía no se sabe: se muestra; el servidor decide igual. */
  const puedeEscribir = rol === null || rol === "admin" || rol === "owner";
  const [verPasos, setVerPasos] = useState(false);
  const [appKey, setAppKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState<RegionElegida>("auto");
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  /* Ya vinculada, las claves se cambian poco: el formulario se abre a pedido. */
  const [verForm, setVerForm] = useState(false);
  if (!ctx) return null;
  const { hik } = ctx;
  const e = hik.estado;
  const vinculado = !!e?.vinculado;
  const pasosAbiertos = verPasos || (!vinculado && puedeEscribir);

  const vincular = async () => {
    if (await hik.vincular(appKey, secretKey, region)) {
      setAppKey("");
      setSecretKey("");
      setVerForm(false);
      void hik.listar();
    }
  };

  return (
    <>
      <section className={BLOQUE} aria-labelledby="camaras-hik-titulo">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-auto flex items-center gap-1.5">
            <Video className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
            <CardTitle as="h3" id="camaras-hik-titulo" className="text-base font-bold">
              Video de Hik-Connect
            </CardTitle>
            <InfoTip
              title="Video de Hik-Connect en el panel"
              what="Con la cuenta de Hik-Connect for Teams vinculada, «En vivo» muestra el video acá, sin abrir la app."
              affects="Sirve para cámaras sin RTSP, como la solar 4G. Las claves se guardan cifradas y no se vuelven a mostrar."
              example="Portón → «En vivo» → el video del portón en esta pantalla, en HD o SD, o lo que grabó a las 22:00."
            />
          </span>
          <span className={`${CHIP_BASE} ${CHIP_TONO[vinculado ? "ok" : "neutro"]}`}>
            {vinculado ? `Vinculada · ${e?.regionNombre} · •••• ${e?.ultimos4}` : "Sin vincular"}
          </span>
        </div>

        <MensajeAccion error={hik.error} aviso={hik.aviso} />

        {vinculado && (
          <button
            type="button"
            onClick={() => setVerPasos((v) => !v)}
            aria-expanded={pasosAbiertos}
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)]"
          >
            <ChevronDown
              className={`h-4 w-4 transition ${pasosAbiertos ? "rotate-180" : ""}`}
              aria-hidden
            />
            Cómo sacar las claves
          </button>
        )}
        {pasosAbiertos && (
          <div className="mt-2">
            <VincularHikConnectPasos />
          </div>
        )}

        {!puedeEscribir && !vinculado && (
          <p className="mt-3 text-sm text-[var(--text-tertiary)]">
            Solo el administrador o el dueño vincula la cuenta.
          </p>
        )}

        {puedeEscribir && (!vinculado || verForm) && (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void vincular();
            }}
          >
            <label className="block">
              <span className="text-sm font-bold text-[var(--text-secondary)]">
                AppKey (API Key)
              </span>
              <input
                value={appKey}
                onChange={(ev) => setAppKey(ev.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${CAMPO} font-mono`}
                placeholder={vinculado ? "Otra AppKey para cambiar la cuenta" : "Pega la AppKey"}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[var(--text-secondary)]">
                SecretKey (API Secret)
              </span>
              <input
                type="password"
                value={secretKey}
                onChange={(ev) => setSecretKey(ev.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                className={`${CAMPO} font-mono`}
                placeholder="Pega la SecretKey"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[var(--text-secondary)]">
                Región de la cuenta
              </span>
              <select
                value={region}
                onChange={(ev) => setRegion(ev.target.value as RegionElegida)}
                className={CAMPO}
              >
                {REGIONES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={
                  hik.trabajando === "vincular" ||
                  appKey.trim().length < 8 ||
                  secretKey.trim().length < 8
                }
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {hik.trabajando === "vincular" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden />
                )}
                {hik.trabajando === "vincular"
                  ? "Probando con Hikvision…"
                  : vinculado
                    ? "Cambiar cuenta"
                    : "Vincular"}
              </button>
            </div>
          </form>
        )}

        {vinculado && puedeEscribir && (
          <div className="mt-4 space-y-3 border-t border-[var(--rule-base)] pt-3">
            <VincularHikConnectLista hik={hik} camaras={camaras} onCrear={onCrear} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {confirmarQuitar ? (
                <>
                  <span className="mr-auto text-sm text-[var(--text-secondary)]">
                    ¿Desvincular? Se borran las claves y los enlaces.
                  </span>
                  <button type="button" onClick={() => setConfirmarQuitar(false)} className={BTN}>
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => void hik.desvincular().then(() => setConfirmarQuitar(false))}
                    disabled={hik.trabajando === "desvincular"}
                    className={`${BTN} border-[var(--data-error-500)]/60 text-[var(--data-error-ink)]`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Sí, desvincular
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVerForm((v) => !v)}
                    aria-expanded={verForm}
                    className={BTN}
                  >
                    <KeyRound className="h-4 w-4" aria-hidden />{" "}
                    <span className="max-sm:hidden">Cambiar claves</span>
                    <span className="sm:hidden">Claves</span>
                  </button>
                  <button type="button" onClick={() => setConfirmarQuitar(true)} className={BTN}>
                    <Link2 className="h-4 w-4" aria-hidden /> Desvincular
                    <span className="max-sm:hidden"> cuenta</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>
      <QuienMiro camaras={camaras} />
    </>
  );
}
