"use client";

/**
 * FotochecksVista — la lista de personas vista como fotochecks (ADR-416).
 *
 * Brandon (2026-09-15): «al poner fotocheck quiero que la tabla cambie a un
 * formato de fotocheck y luego aparezca el botón para descargar en PDF». Así
 * que el botón ya no descarga a ciegas: primero se ve la tarjeta de cada uno
 * —con los mismos datos que va a dibujar el PDF— y recién ahí se descarga.
 *
 * Lo que el preview hace visible antes de gastar papel: hoy ninguna de las 11
 * personas cargadas tiene foto (SELECT del 2026-09-15), así que los fotochecks
 * salen con las iniciales. Eso se ve acá y se avisa arriba, en vez de
 * descubrirse en la impresora.
 *
 * Los filtros de la pantalla siguen mandando: se imprime a quien quedó en la
 * lista, menos los que se destilden acá.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Camera, Check } from "@buleje/design-system/icons";
import { leerMembrete } from "@/lib/admin/membrete-cliente";
import type { Membrete } from "@/lib/admin/membrete";
import { sinDato } from "@/lib/errores/sin-dato";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";
import { cn } from "@/lib/utils";
import { BOTON, claseChipFiltro } from "../rrhh-form";
import BotonFotocheck from "./BotonFotocheck";
import TarjetaFotocheck from "./TarjetaFotocheck";
import { personaParaFotocheck } from "./fotocheck";

/** `POR_HOJA` de fotocheck-pdf.ts: tres tarjetas por hoja A4. */
const POR_HOJA = 3;

export default function FotochecksVista({
  colaboradores,
  cesadosOmitidos = 0,
  onVolver,
}: {
  colaboradores: ColaboradorDTO[];
  /** Cuántos de la lista filtrada quedaron fuera por estar cesados. */
  cesadosOmitidos?: number;
  onVolver: () => void;
}) {
  const [cara, setCara] = useState<"frente" | "dorso">("frente");
  // Se guardan los EXCLUIDOS, no los incluidos: si un filtro trae gente nueva,
  // entra marcada sola (con `seleccionados` habría que re-sincronizar en cada cambio).
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [membrete, setMembrete] = useState<Membrete | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    leerMembrete().then(setMembrete).catch(sinDato("membrete del negocio"));
  }, []);

  const personas = useMemo(
    () => colaboradores.map((c) => ({ id: c.id, datos: personaParaFotocheck(c, window.location.origin) })),
    [colaboradores],
  );

  // El QR se arma una vez por persona y queda cacheado mientras dure la vista.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const QR = (await import("qrcode")).default;
      const faltan = personas.filter((p) => !qrs[p.id]);
      if (faltan.length === 0) return;
      const armados = await Promise.all(
        faltan.map(async (p) => [p.id, await QR.toDataURL(p.datos.urlFicha, { margin: 0, width: 240, errorCorrectionLevel: "M" })] as const),
      );
      if (vivo) setQrs((previos) => ({ ...previos, ...Object.fromEntries(armados) }));
    })().catch(sinDato("QR del fotocheck"));
    return () => {
      vivo = false;
    };
  }, [personas, qrs]);

  const elegidos = colaboradores.filter((c) => !excluidos.has(c.id));
  const hojas = Math.ceil(elegidos.length / POR_HOJA);
  const sinFoto = elegidos.filter((c) => !c.fotoUrl).length;
  const sinDocumento = elegidos.filter((c) => !c.documento).length;
  // Sin nombre configurado la banda del PDF sale «FOTOCHECK» a secas (memoria del
  // membrete vacío): mejor decirlo acá que descubrirlo con las tarjetas impresas.
  const sinNegocio = membrete !== null && !membrete.nombre;

  const alternar = (id: string) =>
    setExcluidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2.5">
        <button type="button" onClick={onVolver} className={BOTON.chico}>
          <ArrowLeft className="h-4 w-4" /> Volver a la tabla
        </button>

        <div role="group" aria-label="Cara de la tarjeta" className="flex gap-1.5">
          {(["frente", "dorso"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cara === c} onClick={() => setCara(c)} className={claseChipFiltro(cara === c)}>
              {c === "frente" ? "Frente" : "Dorso"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setExcluidos(new Set())} className={BOTON.chicoFantasma} disabled={excluidos.size === 0}>
            <Check className="h-4 w-4" /> Todas
          </button>
          <button
            type="button"
            onClick={() => setExcluidos(new Set(colaboradores.map((c) => c.id)))}
            className={BOTON.chicoFantasma}
            disabled={elegidos.length === 0}
          >
            Ninguna
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="tabular-nums text-[var(--text-primary)]">{elegidos.length}</strong> de {colaboradores.length}
          {elegidos.length > 0 && <span className="text-[var(--text-tertiary)]"> · {hojas} hoja{hojas === 1 ? "" : "s"} A4</span>}
          {cesadosOmitidos > 0 && (
            <span className="text-[var(--text-tertiary)]"> · {cesadosOmitidos} cesado{cesadosOmitidos === 1 ? "" : "s"} fuera</span>
          )}
        </p>

        <BotonFotocheck
          colaboradores={elegidos}
          etiqueta={`Descargar PDF (${elegidos.length})`}
          className={cn(BOTON.chicoPrimario, "ml-auto")}
        />
      </div>

      {(sinFoto > 0 || sinDocumento > 0 || sinNegocio) && (
        <p className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 px-3 py-2 text-sm text-[var(--text-secondary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
          <span>
            {sinFoto > 0 && (
              <>
                <strong className="text-[var(--text-primary)]">{sinFoto}</strong> sin foto: el fotocheck sale con las iniciales. Se sube desde la ficha de
                cada persona.
              </>
            )}
            {sinFoto > 0 && sinDocumento > 0 && " "}
            {sinDocumento > 0 && (
              <>
                <strong className="text-[var(--text-primary)]">{sinDocumento}</strong> sin documento: esa línea queda vacía en la tarjeta.
              </>
            )}
            {sinNegocio && (
              <>
                {" "}
                Sin nombre del negocio configurado la banda sale <strong className="text-[var(--text-primary)]">«Fotocheck»</strong>: se pone en Ajustes.
              </>
            )}
          </span>
        </p>
      )}

      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
        {personas.map(({ id, datos }) => {
          const elegido = !excluidos.has(id);
          return (
            <li key={id}>
              <label
                className={cn(
                  "group flex cursor-pointer flex-col gap-2 rounded-xl border p-2 transition-colors",
                  elegido ? "border-primary bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)] opacity-60 hover:opacity-100",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={elegido}
                    onChange={() => alternar(id)}
                    aria-label={`Incluir a ${datos.nombre} en el PDF`}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]"
                  />
                  <span className="truncate">{datos.nombre}</span>
                  {!datos.fotoUrl && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--text-tertiary)]">
                      <Camera className="h-3.5 w-3.5" /> sin foto
                    </span>
                  )}
                </span>
                <TarjetaFotocheck
                  persona={datos}
                  qr={qrs[id] ?? null}
                  negocio={membrete?.nombre ?? null}
                  contacto={membrete?.telefono ?? membrete?.direccion ?? null}
                  logoUrl={membrete?.logoUrl ?? null}
                  cara={cara}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
