"use client";

/**
 * AlquileresVista — Administración › Alquileres (ADR-524): los locales
 * alquilados con su renta, su próximo pago y lo que pide atención (pago
 * atrasado, fin de contrato, aviso de no renovar, garantía). Es un registro:
 * no mueve caja ni entra al cierre. La ficha abre con `?id=`.
 */
import { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { DataTable, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { button } from "@/components/ui-system/button-variants";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import type { AlquilerDto } from "@/lib/admin/fichas-tramites-alquileres";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { fechaRelativa } from "../comun/fechas";
import { Insignia } from "../comun/Insignia";
import { monto } from "../comun/monto";
import { AlquilerModal } from "./AlquilerModal";
import { borrarAlquiler } from "./alquileres-api";
import { ALERTA_TONO, ESTADO_ALQUILER_UI, inquilinoDe, textoPeriodo } from "./alquileres-ui";
import { COLUMNAS_ALQUILERES, ORDEN_ALQUILERES } from "./columnas-filtro-alquileres";
import { useAlquileres } from "./use-alquileres";

const AYUDA = {
  what: "Los locales que alquilas o que gestionas: el contrato, la renta, la garantía y los pagos mes a mes.",
  affects: "Es un registro, no mueve caja: no entra a Caja, a Tesorería ni al cierre. Los pagos que tocan y el fin del contrato salen en Hoy y en el calendario.",
  example: "El local de Constitución alquilado a Agrobanco: S/ 1,200 al mes, se paga el día 5, garantía de dos meses.",
};

export default function AlquileresVista() {
  const lista = useAlquileres();
  const ficha = useFichaEnUrl("id");
  const [nuevo, setNuevo] = useState(false);
  const f = useFiltrosTabla(lista.filas, COLUMNAS_ALQUILERES);
  const ord = useOrdenColumna(ORDEN_ALQUILERES);
  const filas = ord.ordenar(f.filtradas);
  const { confirm } = useConfirm();

  const abierto = ficha.id ? lista.filas.find((a) => a.id === ficha.id) ?? null : null;
  const { id: idPedido, cerrar } = ficha;
  useEffect(() => {
    if (!idPedido || lista.cargando || lista.error) return;
    if (!lista.filas.some((a) => a.id === idPedido)) {
      toast.error("Ese alquiler ya no existe o no es de este negocio.");
      cerrar();
    }
  }, [idPedido, lista.cargando, lista.error, lista.filas, cerrar]);

  const borrar = async (a: AlquilerDto) => {
    const ok = await confirm({
      title: `¿Borrar «${a.nombre}»?`,
      description: "Deja de salir en Hoy y en el calendario. Con pagos registrados no se puede: pásalo a «Terminado».",
      intent: "danger",
      confirmLabel: "Borrar",
    });
    if (!ok) return;
    const r = await borrarAlquiler(a.id);
    if (!r.ok) return void toast.error(r.error);
    lista.quitar(a.id);
    toast.success(`«${a.nombre}» se borró`);
  };

  const guardado = (a: AlquilerDto, eraNuevo: boolean) => {
    lista.poner(a);
    if (eraNuevo) {
      setNuevo(false);
      ficha.abrir(a.id);
    }
  };

  return (
    <div className="space-y-4">
      <EncabezadoAgenda
        titulo="Alquileres"
        ayuda={AYUDA}
        acciones={
          <button type="button" className={button({ variant: "primary", className: "max-sm:w-12 max-sm:px-0" })} onClick={() => setNuevo(true)} title="Nuevo alquiler">
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Nuevo alquiler</span>
          </button>
        }
        menu={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: lista.refrescar, busy: lista.recargando }]}
      />
      <p className="text-sm text-[var(--text-tertiary)]">Registro, no mueve caja.</p>

      {lista.error && (
        <ErrorAlert
          title="No se pudieron traer los alquileres"
          description={lista.error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={lista.refrescar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}

      {lista.cargando ? (
        <LoadingState message="Trayendo los alquileres…" />
      ) : lista.filas.length === 0 ? (
        !lista.error && <EmptyState title="Todavía no hay alquileres" description="Registra el primer local con «Nuevo alquiler»." />
      ) : (
        <>
          <BarraFiltrosTabla excel="Alquileres" vistas="alquileres" f={f} />
          <DataTable zebra aria-busy={lista.recargando}>
            <thead>
              <tr>
                <ThColumna label="Local" ids={["local"]} f={f} orden={ord} ordenId="local" />
                <ThColumna label="Inquilino" ids={["inquilino"]} f={f} orden={ord} ordenId="inquilino" />
                <ThColumna label="Renta" f={f} orden={ord} ordenId="renta" derecha />
                <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
                <ThColumna label="Próximo pago" f={f} orden={ord} ordenId="proximo" />
                <ThColumna label="Alertas" ids={["alertas"]} f={f} orden={ord} ordenId="alertas" />
                <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
              {filas.map((a) => (
                <FilaAlquiler key={a.id} a={a} onAbrir={() => ficha.abrir(a.id)} onBorrar={() => void borrar(a)} />
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      {(nuevo || abierto) && (
        <AlquilerModal key={abierto?.id ?? "nuevo"} alquiler={abierto} onGuardado={guardado} onCerrar={() => (abierto ? cerrar() : setNuevo(false))} />
      )}
    </div>
  );
}

function FilaAlquiler({ a, onAbrir, onBorrar }: { a: AlquilerDto; onAbrir: () => void; onBorrar: () => void }) {
  const estado = ESTADO_ALQUILER_UI[a.estado];
  const { resumen } = a;
  return (
    <tr>
      <td>
        <button type="button" className={button({ variant: "link", className: "h-auto min-h-12 flex-col items-start px-0 text-left" })} onClick={onAbrir}>
          <span className="font-semibold text-[var(--text-primary)]">{a.nombre}</span>
          {a.direccion && <span className="text-sm font-normal text-[var(--text-tertiary)]">{a.direccion}</span>}
        </button>
      </td>
      <td>{inquilinoDe(a) || <span className="text-[var(--text-tertiary)]">—</span>}</td>
      <td className="text-right tabular-nums">{monto(a.rentaMensual, a.moneda)}</td>
      <td>
        <Insignia tono={estado.tono} texto={estado.texto} />
      </td>
      <td>
        {resumen.proximoPeriodo && resumen.proximoVenceEl ? (
          <span className="block">
            <span className="block">{fechaRelativa(resumen.proximoVenceEl)}</span>
            <span className="block text-sm text-[var(--text-tertiary)]">{textoPeriodo(resumen.proximoPeriodo)}</span>
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      <td>
        {resumen.alertas.length === 0 ? (
          <span className="text-[var(--text-tertiary)]">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {resumen.alertas.map((al) => (
              <Insignia key={`${al.tipo}-${al.fecha}`} tono={ALERTA_TONO[al.tipo]} texto={al.texto} />
            ))}
          </span>
        )}
      </td>
      <td className="text-right">
        <ActionMenu
          label="Más"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title={`Más de «${a.nombre}»`}
          actions={[
            { id: "abrir", label: "Abrir", icon: Pencil, onSelect: onAbrir },
            { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: onBorrar },
          ]}
        />
      </td>
    </tr>
  );
}

