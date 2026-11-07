"use client";

/** Un modelo ya guardado: estado de la última prueba, principal, prender/apagar, probar, borrar. */
import { useState } from "react";
import { Loader2, Star, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { Interruptor } from "@/components/ui-system/Interruptor";
import type { EstadoProveedorIa, ProveedorConfigurado } from "@/lib/ia-proveedores/tipos";
import { leeFotos, type BulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";
import { TEXTO_ERROR_IA } from "./campos";
import { fechaCorta } from "./formato";

const FRASE_ESTADO: Record<EstadoProveedorIa, string> = {
  ok: "Funciona",
  clave_invalida: "La clave no es válida",
  sin_credito: "Se acabó el saldo",
  modelo_no_disponible: "Ese modelo ya no existe",
  limite_ia: "Llegó al límite: espera un rato",
  sin_conexion: "No se pudo conectar",
  sin_permiso: "La clave no tiene permiso",
  error: "Falló la última vez",
};

export const PILDORA = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
const BIEN = `${PILDORA} bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]`;
const MAL = `${PILDORA} bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]`;
const NEUTRA = `${PILDORA} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`;

export function TarjetaModelo({
  p,
  modelos,
  onBorrar,
}: {
  p: ProveedorConfigurado;
  modelos: BulejeIaModelos;
  onBorrar: (p: ProveedorConfigurado) => void;
}) {
  const [ocupado, setOcupado] = useState<null | "probar" | "principal" | "activo">(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const empresa = modelos.catalogo.find((c) => c.id === p.proveedor)?.empresa ?? p.proveedor;
  const fotos = leeFotos(p, modelos.catalogo);

  const probar = async () => {
    setOcupado("probar");
    const r = await modelos.probar({ proveedor: p.proveedor, configId: p.id });
    setOcupado(null);
    setMensaje(r.ok ? { ok: r.data.ok, texto: r.data.mensaje } : { ok: false, texto: r.error });
    if (r.ok) modelos.recargar();
  };
  const cambiar = async (campo: "principal" | "activo", valor: boolean) => {
    setOcupado(campo);
    const r = await modelos.actualizar(p.id, { [campo]: valor });
    setOcupado(null);
    if (!r.ok) setMensaje({ ok: false, texto: r.error });
  };

  return (
    <li className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-1.5">
            {p.principal && <Star className="h-4 w-4 fill-current text-[var(--accent)]" aria-label="Principal" />}
            {p.nombre}
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            {empresa} · {p.modelo} · clave …{p.claveFinal}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.principal && <span className={BIEN}>Contesta este</span>}
            {p.ultimoEstado && <span className={p.ultimoEstado === "ok" ? BIEN : MAL}>{FRASE_ESTADO[p.ultimoEstado]}</span>}
            <span className={NEUTRA}>{fotos ? "Lee fotos" : fotos === false ? "No lee fotos" : "Fotos: sin saber"}</span>
            {p.ultimaPrueba && <span className={NEUTRA}>Probado {fechaCorta(p.ultimaPrueba)}</span>}
          </div>
        </div>
        <Interruptor
          variante="solo"
          label={`${p.nombre} prendido`}
          enabled={p.activo}
          disabled={ocupado !== null}
          onChange={(v) => void cambiar("activo", v)}
        />
      </div>
      {mensaje && (
        <p role="status" className={`mt-2 ${mensaje.ok ? "text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : TEXTO_ERROR_IA}`}>
          {mensaje.texto}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!p.principal && (
          <Button variant="secondary" disabled={ocupado !== null || !p.activo} onClick={() => void cambiar("principal", true)}>
            <Star className="h-4 w-4" aria-hidden /> Que conteste este
          </Button>
        )}
        <Button variant="secondary" disabled={ocupado !== null} onClick={() => void probar()}>
          {ocupado === "probar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Probar
        </Button>
        <Button variant="ghost" disabled={ocupado !== null} onClick={() => onBorrar(p)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Borrar
        </Button>
      </div>
    </li>
  );
}
