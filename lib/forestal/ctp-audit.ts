/**
 * ctp-audit — trazabilidad de QUIÉN hizo QUÉ en el Libro de Operaciones CTP.
 *
 * POR QUÉ EXISTE:
 * el Libro CTP es un registro que fiscaliza SERFOR y que cae bajo Ley 29733.
 * Hasta 2026-07-15 las 3 DB classes del módulo (`wood-entries`, `forest-ctp`,
 * `forest-ctp-consumo`) no escribían NI UNA entrada de auditoría: se podía
 * validar un ingreso, reatribuir el origen de una corrida o congelar un costo
 * sin dejar rastro de quién ni cuándo. A diferencia de casi todo lo demás, esto
 * NO se puede reconstruir después — el evento que no se registró se perdió.
 *
 * Este módulo centraliza el vocabulario (acciones + entidades) para que las 3
 * clases registren igual y el Security Center pueda filtrar por `entity`.
 *
 * Fire-and-forget: auditar nunca puede tumbar la operación de negocio, pero el
 * fallo SIEMPRE se loguea — un catch vacío acá dejaría el libro sin trazas y sin
 * que nadie se entere (regla 4 de code-quality).
 */
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/** Entidades del libro — coinciden con los modelos Prisma para poder cruzarlas.
 * `ForestCtpFicha` no es un modelo Prisma: la ficha legal del CTP vive en el KV
 * `PlatformSetting` (key `ctp-ficha:{tenantId}`), pero se audita igual porque es
 * la identidad legal que encabeza cada certificado, GTF y export ante SERFOR. */
export type CtpAuditEntity =
  /** El libro entero, cuando la acción no es sobre una fila sino sobre todo. */
  | "ForestCtpLibro"
  /** Una troza de la lista de la GTF, o un pedazo suyo tras retrozar (ADR-313). */
  | "WoodEntryTroza"
  | "WoodEntry"
  | "ForestCtpEntry"
  | "ForestCtpConsumo"
  | "ForestProdLote"
  /** Lote de ASERRÍO (ADR-334): la materia prima agrupada antes de la sierra. */
  | "ForestLoteAserrio"
  | "ForestCtpFicha"
  // KV (como ForestCtpFicha): la foto de referencia de una especie. No es una
  // prueba documental, pero orienta a quien recibe la troza — y quien la pone
  // tiene que quedar registrado.
  | "ForestEspecieFoto"
  // No es modelo Prisma (como ForestCtpFicha): un evento de importación LO-CTP es
  // un lote, no una fila. Se audita porque un fiscalizador quiere saber CÓMO
  // entraron los datos al libro (qué archivo, cuántas filas, quién) — ADR-138.
  | "ForestCtpImport"
  // KV (como ForestCtpFicha): el cierre de período fiscal del libro (ADR-139).
  | "ForestCtpCierre"
  // KV: geolocalización de orígenes para el dossier EUDR (ADR-140).
  | "ForestOrigenGeo"
  // KV: zonas físicas del aserradero para el Mapa de Planta (ADR-142).
  | "ForestPlantaZona"
  // KV: cubicaciones guardadas del cubicador — la medición del lote, previa al
  // libro (al libro entra después como producción, con su propio registro).
  | "ForestCubicacion"
  /** Trámite/oficio presentado a la autoridad (ADR-308). */
  | "ForestTramite"
  /** Parte del directorio forestal: proveedor/destinatario/transportista/conductor (ADR-317). */
  | "ForestParty"
  /** Vehículo del directorio forestal (ADR-317). */
  | "ForestVehiculo"
  /** Viaje que trajo materia prima o se llevó producto (ADR-318). */
  | "ForestFlete"
  /** Movimiento de cuenta corriente con una parte del directorio (ADR-322). */
  | "ForestCuentaMov"
  // KV: ANEXO N° 04 emitido (lista de productos transformados de la GTF). No es
  // modelo Prisma: es el PAPEL que se entregó, guardado para poder re-imprimir
  // el mismo documento ante una fiscalización.
  | "ForestAnexo04";

/**
 * Acciones auditables. Prefijo `ctp_` para aislarlas del resto del ActivityLog
 * (que es compartido por todo el ERP) y poder greppear el libro entero.
 */
export type CtpAuditAction =
  // Vaciado total del libro. Va primero porque es el asiento que un fiscalizador
  // busca antes que ninguno: un libro que aparece vacío sin este registro es un
  // libro que alguien borró sin dejar rastro.
  | "ctp_libro_purga"
  // ── Lote de aserrío (ADR-334): armar la materia prima antes de la corrida ──
  | "ctp_lote_aserrio_create"
  | "ctp_lote_aserrio_update"
  | "ctp_lote_aserrio_delete"
  | "ctp_lote_aserrio_trozas_add"
  | "ctp_lote_aserrio_trozas_remove"
  | "ctp_lote_aserrio_consumir"
  // Piezas sumadas a una corrida que todavía no declaró (ADR-364). Va aparte de
  // `consumir` porque no abre un asiento: le CAMBIA la materia prima a uno que
  // ya existe, y eso mueve su rendimiento — es justo lo que un fiscalizador
  // querría poder reconstruir.
  | "ctp_corrida_sumar_piezas"
  // Y el reverso: piezas mal tildadas que salen de una corrida abierta. Va
  // aparte de `annul` porque la corrida sobrevive — es una corrección, no un
  // asiento muerto.
  | "ctp_corrida_quitar_piezas"
  // Un lote parcial que no va a terminar de aserrarse: se cierra con motivo y su
  // madera libre vuelve al patio. No es `delete` — el lote y sus corridas siguen
  // siendo parte del libro.
  | "ctp_lote_aserrio_cerrar"
  // Ingresos de materia prima
  | "ctp_ingreso_create"
  // Corrección de un ingreso pendiente (typo de GTF, volumen mal tipeado): el
  // detalle narra campo por campo qué cambió — un libro fiscalizable tiene que
  // poder responder "¿esto siempre dijo 5.20 m³?".
  | "ctp_ingreso_update"
  // Piezas agregadas a la lista de trozas de un ingreso ya registrado (ADR-320).
  // Va aparte de `update` porque no corrige un campo: suma madera al detalle que
  // ampara el ingreso, y el fiscalizador pregunta cuándo apareció cada pieza.
  | "ctp_ingreso_trozas_add"
  /* Cuadre de una guía que se contradice a sí misma (ADR-353): la cabecera por
     especie (37) y la lista de trozas (35) declaran volúmenes distintos y el
     operador dijo cuál vale. Va aparte de `update` porque no es corregir un
     tipeo: es dejar asentado qué parte del documento se tomó por buena. */
  | "ctp_ingreso_cuadre"
  | "ctp_ingreso_validate"
  /** Recepción de la guía en el patio: fecha + piezas + validación (ADR-339). */
  | "ctp_ingreso_recepcion"
  | "ctp_ingreso_reject"
  | "ctp_ingreso_annul"
  | "ctp_ingreso_delete"
  /** Recepción física de las trozas de una guía (ADR-325): qué llegó y qué no. */
  | "ctp_troza_recepcion"
  // Líneas de producción / despacho
  | "ctp_linea_create"
  /** Cerró una corrida abierta en el patio declarando qué salió (ADR-340). */
  | "ctp_linea_produccion_declarada"
  | "ctp_linea_annul"
  | "ctp_linea_delete"
  // Atribución de origen y costeo — lo más sensible del módulo
  | "ctp_consumos_set"
  /** Qué PIEZAS entraron a la sierra en una corrida (ADR-326). */
  | "ctp_trozas_consumidas"
  /** Qué PIEZAS salieron sin aserrar en un despacho (ADR-363). */
  | "ctp_trozas_despachadas"
  | "ctp_origenes_set"
  /** Qué corridas alimentan un reproceso (ADR-316). Espeja `ctp_origenes_set`:
   *  también descuenta stock, así que también deja rastro. */
  | "ctp_reproceso_set"
  | "ctp_costo_congelar"
  // Lotes de producción / comercialización (ADR-136)
  | "ctp_lote_create"
  | "ctp_lote_miembros_set"
  | "ctp_lote_status"
  | "ctp_lote_delete"
  // Ficha legal del CTP (identidad SERFOR — Código de CTP, registro ARFFS, TH)
  | "ctp_ficha_update"
  /** Foto de referencia de una especie: la pone alguien y tiene que saberse quién. */
  | "ctp_especie_foto"
  // GTF de salida formal (serie autorizada ARFFS + correlativo auto)
  | "ctp_gtf_emitir"
  /** Se completaron los datos de la guía (propietario/destinatario/transportista). */
  | "ctp_gtf_datos"
  // Importación del libro desde el Excel LO-CTP (ADR-138) — evento por lote
  | "ctp_import"
  // Cierre de período fiscal del libro (ADR-139) — congela + bloquea el mes
  | "ctp_periodo_cerrar"
  | "ctp_periodo_reabrir"
  // Geolocalización de origen para el dossier EUDR (ADR-140)
  | "ctp_origen_geo_set"
  // Valor de venta del despacho para el P&L (ADR-141)
  | "ctp_venta_set"
  // Zonas físicas del aserradero para el Mapa de Planta (ADR-142)
  | "ctp_planta_zona_set"
  | "ctp_planta_zona_delete"
  // Ubicación de una troza/ingreso en una zona de la planta (ADR-142 follow-up)
  | "ctp_planta_asignar"
  // Cubicaciones guardadas del cubicador (la medición del lote, previa al libro)
  | "ctp_cubicacion_create"
  // Trámites y oficios ante la autoridad (ADR-308): qué se presentó y cuándo es
  // parte del expediente, no metadata — va al mismo rastro que el libro.
  | "ctp_tramite_create"
  | "ctp_tramite_update"
  | "ctp_tramite_delete"
  // Directorio forestal (ADR-317): quién le compra, quién le vende y quién
  // transporta es parte del expediente — un fiscalizador cruza esas identidades
  // contra las guías, así que cambiarlas deja rastro.
  | "ctp_parte_upsert"
  | "ctp_parte_delete"
  | "ctp_vehiculo_upsert"
  | "ctp_vehiculo_delete"
  // Fletes (ADR-318): es plata que sale de la caja y deuda con un tercero —
  // quién la anotó y quién la dio por pagada deja rastro.
  | "ctp_flete_create"
  | "ctp_flete_update"
  | "ctp_flete_pago"
  | "ctp_flete_delete"
  // Cuenta corriente con terceros (ADR-322): es plata de otro, así que cada
  // movimiento y cada corrección quedan con nombre y fecha.
  | "ctp_cuenta_create"
  | "ctp_cuenta_update"
  | "ctp_cuenta_delete"
  | "ctp_cubicacion_update"
  | "ctp_cubicacion_delete"
  // ANEXO N° 04 emitido con la GTF (lista de productos transformados)
  | "ctp_anexo04_emit"
  | "ctp_anexo04_update"
  | "ctp_anexo04_delete";

/**
 * Registra un evento del libro. No se await-ea a propósito: la auditoría no
 * debe agregar latencia ni romper el write si el log falla.
 */
export function auditCtp(params: {
  tenantId: string;
  action: CtpAuditAction;
  entity: CtpAuditEntity;
  entityId: string;
  /** Qué pasó, en español y legible por un humano (o un fiscalizador). */
  detail: string;
  /** Username del admin. Nunca inventes uno: si no se sabe, "unknown". */
  user: string;
}): void {
  void logActivity(
    params.action,
    params.entity,
    params.detail,
    params.entityId,
    params.user || "unknown",
    undefined,
    params.tenantId,
  ).catch((err) =>
    // Si esto falla, el libro pierde trazabilidad: es un error, no un detalle.
    logger.error("[ctp-audit] no se pudo registrar el evento", {
      error: String(err),
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      tenantId: params.tenantId,
    }),
  );
}

/** m³ con la precisión forestal del módulo, para los detalles del log. */
export const m3 = (v: number | string | null | undefined): string =>
  v == null ? "—" : `${Number(v).toFixed(4)} m³`;
