# ADR-497 — Plan de la empresa: un documento JSON por sección, con versión e historial

- **Estado:** aceptado (2026-10-16).
- **Pedido por:** Brandon (16-10): «una página o sección de planificaciones y organización… nombre, razón social, inversión inicial, socios, croquis, tipo de negocio, estrategias, FODAs, planificaciones, organización de campos… políticas, atención».
- **Contrato:** `.claude/autonomo/contratos-2026-10-16/planificacion.md` · tipos y Zod: `lib/planificacion/secciones.ts` · cuentas: `lib/planificacion/calculos.ts`.
- **Schema:** dos tablas nuevas, `PlanEmpresaSeccion` y `PlanEmpresaVersion` (migración `20261016_plan_empresa`, aditiva).

## Contexto

El plan tiene 12 secciones (ficha, identidad, lienzo, licencias, socios, inversión, FODA, estrategias, objetivos, organización, espacios, políticas). Cada una es una lista o un formulario que se edita entero en una pantalla, con autoguardado a 1,2 s. Nadie consulta «todas las fortalezas de todos los negocios» ni cruza una política con una venta: el plan se lee y se escribe por sección.

Ya existen y no se duplican: nombre, RUC, logo, teléfono y dirección (membrete, en Configuración), metas medidas (ADR-488) y tareas del equipo (`AdminTask`).

Socios (DNI, teléfono, aportes) e inversión son sensibles: sólo admin y dueño. `requireAdmin` deja pasar siempre a admin/owner/manager, así que esas dos se cierran en la ruta (`lib/admin/planificacion-acceso.ts`), no sólo con `allowedRoles`.

## Decisión

1. **Una fila por (negocio, sección)** en `PlanEmpresaSeccion`, con `datos Json` validado por `SCHEMAS_SECCION[seccion].safeParse` al escribir y leído con `leerSeccion` (un campo nuevo toma su default; un documento roto se lee vacío, nunca tira). Sección nunca guardada = no hay fila: se responde `version: 0` y `vacia(s)`.
2. **Concurrencia optimista real**: el cliente manda la `version` que editó. En una sola transacción: `version 0` → `INSERT … ON CONFLICT DO NOTHING`; si no → `UPDATE … WHERE version = editada`. Cuenta 0 → 409 `cambio_en_paralelo` con lo que hay ahora, sin escribir nada. Dos guardados a la vez: el segundo espera el candado de la fila, re-evalúa el WHERE y cuenta 0.
3. **Historial en la misma transacción**: cada guardado inserta su copia en `PlanEmpresaVersion` y poda a las 30 más nuevas por sección (las versiones son correlativas: se borran las `≤ nueva − 30`). «Volver a una versión» copia esa versión como una nueva (la de ahora + 1): lo de ahora queda en el historial.
4. **API**: `GET /api/admin/planificacion` (todo lo visible + `ocultas` + `puedeEditar` + membrete), `PUT /[seccion]`, `GET|POST /[seccion]/historial`. Leer: admin, owner, manager, cajero, almacenero, analista. Escribir: admin, owner, manager. Socios e inversión: sólo admin y owner para leer y escribir. CSRF en escrituras; el PUT con rate limit GENEROUS porque el autoguardado haría saltar MODERATE (20 cada 5 min) a los pocos minutos de escribir.
5. **Sin caché de servidor**: se lee una vez al abrir la pestaña; una copia vieja en otra instancia haría chocar el próximo autoguardado con un 409 falso.
6. Los dos modelos entran en `TENANT_MODELS` (`lib/tenant.ts`). Imágenes (croquis, fotos de licencias) por `POST /api/upload` con la carpeta `planificacion`.

## Consecuencias

- Agregar un campo o una sección es tocar el Zod de `secciones.ts`: sin migración. Lo guardado antes se lee con el default del campo nuevo.
- Un guardado son 3 idas a la base dentro de la transacción (4 a partir de la versión 31). Desde localhost (~119 ms por ida) ≈ 0,4-0,5 s; en Vercel, milisegundos.
- No se puede consultar por SQL dentro del documento sin operadores JSON. Aceptado: nada del sistema lo necesita hoy. Si un día los objetivos alimentan reportes cruzados, esa sección se saca a su tabla.
- Si un documento guardado deja de validar (un enum que se achica), se lee vacío y el siguiente autoguardado lo pisa; la copia sigue en el historial para volver.
- El borrado o la exportación por negocio (Ley 29733) ven las dos tablas como cualquier modelo con `tenantId`.

## Alternativas descartadas

- **12 tablas (o una por lista: socios, licencias, objetivos…)**: ~25 modelos y sus migraciones para datos que nunca se consultan sueltos; cada campo nuevo pediría DDL por el pooler (aplicar a mano + resolve); la versión y el historial tendrían que vivir en cada tabla o en una tabla de cabecera con joins. Un documento por sección guarda y versiona igual en las 12.
- **`PlatformSetting` (clave-valor `plan:<tenantId>:<seccion>`)**: no tiene `version` ni historial, y la clave KV no es un modelo con `tenantId`: el aislamiento por negocio (`TENANT_MODELS`) y el export/borrado por negocio de la Ley 29733 no la ven. Socios lleva DNI: tiene que estar donde esos procesos miran.
- **Un solo documento con todo el plan**: dos personas editando secciones distintas chocarían siempre (una versión para todo) y cada autoguardado reescribiría el plan entero.
- **Último que guarda gana (sin versión)**: con autoguardado en dos pestañas o dos personas, se pierde texto sin aviso.
