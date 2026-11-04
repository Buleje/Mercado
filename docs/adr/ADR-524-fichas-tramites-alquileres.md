# ADR-524 — Fichas de persona, trámites generales y alquileres en Administración

- **Estado:** aceptado (2026-10-30). Schema: `prisma/migrations/20261030a_fichas_tramites_alquileres` (aditivo: 10 columnas en `ForestParty` + 4 tablas).
- **Pedido por:** Brandon (30-10): «guarda la información de cada trámite o documento, p. ej. lo que se envía a Agrobanco (DNI nuevo, lo de SUNAT, datos completos), en Blas en su información, porque más adelante pedirán datos y quiero consultarlos de ahí».
- **Relacionados:** ADR-518 (el directorio es la entidad), ADR-424 (cómo se le paga a una parte), ADR-523 (MCP `buleje`: ventana de OK, tope de 20 pedidos por propuesta). Contrato detallado: `.claude/autonomo/blas-fichas/contrato.md`.

## Contexto
Los papeles de un trámite (Agrobanco por el local de Drucila, reactivar el RUC en SUNAT, DNI nuevo) vivían solo en carpetas de Windows. En el panel faltaba dónde ponerlos:
- El directorio forestal no separa DNI y RUC de la misma persona natural ni guarda las fechas del DNI, el estado del RUC, nacimiento o estado civil; no tiene roles para socio/familia ni para el dueño de un local.
- Los trámites del CTP son cartas a la autoridad (ARFFS/SERFOR/OSINFOR) en un KV JSON con tope de 400 filas, sin requisitos ni vencimientos que la agenda pueda leer.
- No había registro de alquileres de inmuebles (Activos es maquinaria por hora).
- `parte_guardar` del MCP pisaba con vacío lo que no viajaba, y `doc_subir` pedía un OK por archivo y no creaba carpetas.

## Decisión
1. **Ficha de persona:** `ForestParty` + 10 columnas nullable (`dniEmitidoEl`, `dniVenceEl`, `ruc`, `rucEstado`, `rucEstadoDesde`, `rucCondicion`, `nacimientoEl`, `nacimientoLugar`, `estadoCivil`, `parentesco`). Roles `socio` y `arrendador` solo en TS (la columna `roles` es `text[]`, no enum). Guardar una ficha existente = `PATCH /api/admin/forestal/directorio/[id]` parcial: lo ausente no se toca, `null` borra. Al almacenero los datos personales le llegan vacíos (Ley 29733).
2. **Trámites generales:** modelos `Tramite` + `TramiteRequisito` (cada requisito hay / falta / no aplica, con su `documentId`), en Administración, para cualquier negocio. Plantillas estáticas de requisitos (alquiler a un banco, reactivar RUC, renovar DNI, predial municipal).
3. **Alquileres:** `Alquiler` + `AlquilerPago` con único `(alquilerId, periodo)`; un pago repetido idéntico responde 200 `duplicado`, uno distinto para el mismo mes 409 `periodo_ya_pagado`. Totales, atrasos y alertas los calcula el backend en céntimos. Es un registro: no mueve caja ni tesorería (el local es de la socia, no de Blas).
4. **Avisos:** vencimientos de trámites, próximo paso, fin de contrato, aviso de no renovar, pago atrasado y DNI que vence entran a la agenda existente (UNION ALL), sin proceso programado nuevo.
5. **Documentos:** se cuelgan por tag de máquina (`parte:`/`tramiteadm:`/`alquiler:`) vía `enlaces-entidad`; `POST /api/admin/documents` acepta `carpetaRuta` (el servidor crea la carpeta), categoría, etiquetas, vencimiento, `vinculoTipo/vinculoId` y `siExiste`. MCP `docs_subir_lote` = 1 OK para ≤20 archivos de una carpeta de Windows.
6. **Claves nunca:** los campos de texto rechazan con 422 `parece_clave` lo que tenga forma de clave (`clave: …`, `contraseña = …`); se permite la nota «la Clave SOL la tiene Brandon».

## Alternativas descartadas
- Extender el KV `ctp-tramites:`: lista JSON con tope de 400, sin JOIN para la agenda ni índice por documento.
- Modelo `Persona` aparte del directorio: duplicaría adjuntos, bitácora, carpeta y autocompletar DNI/RUC.
- Reusar `Asset`/`AssetIncome` para alquileres: horómetro y tarifa por hora, sin plazo, garantía ni partes; mezclaría la rentabilidad de Blas.
- Requisitos como Json dentro del trámite: no se indexa el documento ni se edita uno sin reescribir todos.
- Endpoint de subida multi-archivo: un cuerpo de N × 25 MB y sin fallo parcial; un pedido por archivo bajo una sola propuesta ya da 1 OK.

## Consecuencias
- 4 tablas + 10 columnas aditivas; el Prisma viejo de producción no se entera (sin enums nuevos).
- 6 orígenes nuevos en la agenda; la lista blanca del MCP suma `tramites|alquileres`.
- Un pago de alquiler NO aparece en caja: si algún día Blas cobra o paga un alquiler propio, va como movimiento de tesorería aparte.
- El filtro de claves es una red, no un cofre: una clave suelta sin rótulo pasa. La Clave SOL sigue fuera del panel.
