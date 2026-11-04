# Contrato — Planificación y organización de la empresa (ADR-497), 16-10

Pedido literal de Brandon: «Vamos a panel admin del negocio y vamos a realizar tipo una página o sección que ahí será tipo planificaciones y organización y ahí pondré información del negocio o empresa como datos como nombre, razón social, inversión inicial, socios, croquis, tipo de negocio, estrategias, FODAs, planificaciones, organización de campos, y en general todo tipo de datos para organizar, estructurarme y tener información de mi empresa, políticas, atención y demás cosas de planificación efectiva; realiza eso de forma mejorada, aplica mejoras de alto nivel y construye todo eso».

## Qué existe ya (NO duplicar)

- Nombre, RUC, logo, teléfono y dirección del negocio = **membrete** (`lib/db/membrete.db.ts`, `lib/admin/membrete.ts`, sale de `Settings` + `Tenant`). El plan los MUESTRA (sólo lectura) con un enlace «Cambiar en Configuración» (`?tab=config`); no los vuelve a pedir.
- Metas numéricas medidas con datos = `?tab=metas-logros` (ADR-488). Los objetivos del plan son cualitativos; pueden enlazar a Metas.
- Tareas del equipo = `AdminTask` (Equipo › Tareas).
- Subida de imágenes = `POST /api/upload` (multipart `file` + `folder`), carpeta nueva `planificacion` (la agrega el backend).

## Contrato compartido (YA ESCRITO por el hilo principal — no reescribir; si falta algo, agregarlo sin romper)

- `lib/planificacion/secciones.ts` — 12 secciones (`ficha`, `identidad`, `lienzo`, `licencias`, `socios`, `inversion`, `foda`, `estrategias`, `objetivos`, `organizacion`, `espacios`, `politicas`), Zod por sección (`SCHEMAS_SECCION`), `SECCIONES_SENSIBLES` (socios, inversion), `leerSeccion`, `vacia`, tipos de la API (`PlanEmpresaRespuesta`, `SeccionGuardada`, `ConflictoSeccion`, `VersionSeccion`, `guardarSeccionSchema`).
- `lib/planificacion/calculos.ts` — participación de socios, totales de inversión, meses de recupero, estado de licencias, avance/atraso de objetivos, trimestre, llenado por sección.
- `hooks/use-plan-empresa.tsx` — `PlanEmpresaProvider` (un GET), `usePlanEmpresa()`, `useSeccionPlan(seccion)` → `{ datos, cambiar, estado, … }` con autoguardado a 1,2 s y conflicto por versión; `nuevoId()`.
- `components/admin/planificacion/comun/CabeceraSeccion.tsx` — fila del título de cada bloque: `CardTitle` + ⓘ + estado de guardado + «⋯» (acciones propias + «Versiones anteriores»). **Toda sección editable arranca con `<CabeceraSeccion seccion=… titulo=… ayuda=…>`.**
- `components/admin/planificacion/comun/IndicadorGuardado.tsx`, `HistorialSeccion.tsx`.

## API (carril BACKEND)

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| GET | `/api/admin/planificacion` | leer: `admin, owner, manager, cajero, almacenero, analista` | `PlanEmpresaRespuesta`: TODAS las secciones visibles para el rol (las nunca guardadas con `version: 0` y `datos: vacia(s)`), `ocultas` = sensibles si el rol no es admin/owner, `puedeEditar` = admin/owner/manager, `membrete` |
| PUT | `/api/admin/planificacion/[seccion]` | `admin, owner, manager`; sensibles sólo `admin, owner` | body `guardarSeccionSchema`; `datos` se valida con `SCHEMAS_SECCION[seccion].safeParse`; versión distinta a la guardada → **409** `ConflictoSeccion` con `actual`; ok → `SeccionGuardada` (version+1) |
| GET | `/api/admin/planificacion/[seccion]/historial` | los de leer (sensibles: admin/owner) | `{ versiones: VersionSeccion[] }` (más nueva primero, máx 30) |
| POST | `/api/admin/planificacion/[seccion]/historial` | los de escribir | body `{ version }` → copia esa versión como nueva (version+1) → `SeccionGuardada` |

Sección desconocida → 404. CSRF (`assertCsrf`) + rate limit en escrituras. `tenantId` de la sesión, nunca del body.

## Schema (carril BACKEND, zona de peligro: migración aditiva, sólo tablas nuevas)

```prisma
/// Plan de la empresa (ADR-497): una fila por sección, `datos` validado por SCHEMAS_SECCION.
model PlanEmpresaSeccion {
  id        String   @id @default(cuid())
  tenantId  String
  seccion   String
  datos     Json
  version   Int      @default(1)
  updatedBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([tenantId, seccion])
  @@index([tenantId])
}
/// Cada guardado deja su copia (máx 30 por sección): «Versiones anteriores».
model PlanEmpresaVersion {
  id        String   @id @default(cuid())
  tenantId  String
  seccion   String
  version   Int
  datos     Json
  autor     String
  createdAt DateTime @default(now())
  @@unique([tenantId, seccion, version])
  @@index([tenantId, seccion, createdAt])
}
```

## Pantalla (carriles FRONT-A y FRONT-B)

Pestaña `?tab=planificacion` «Planificación» (grupo Gestión). 7 vistas `?vista=`, cada una con `BarraDeSecciones` (`?sub=`) cuando tiene más de un bloque:

| vista | Rótulo | Bloques (`?sub=`) | Carril | Archivo (export con nombre) |
|---|---|---|---|---|
| `resumen` | Resumen | — | A | `resumen/ResumenPlan.tsx` → `ResumenPlan` |
| `empresa` | Empresa | `ficha` · `identidad` · `lienzo` · `licencias` | A | `empresa/EmpresaVista.tsx` → `EmpresaVista` |
| `socios` | Socios e inversión | `socios` · `inversion` | A | `socios/SociosInversionVista.tsx` → `SociosInversionVista` |
| `foda` | FODA y estrategias | `foda` · `estrategias` | B | `foda/FodaEstrategiasVista.tsx` → `FodaEstrategiasVista` |
| `objetivos` | Objetivos y plan | `lista` · `linea` (línea de tiempo por trimestre) | B | `objetivos/ObjetivosVista.tsx` → `ObjetivosVista` |
| `organizacion` | Organización | `organigrama` · `espacios` | B | `organizacion/OrganizacionVista.tsx` → `OrganizacionVista` |
| `politicas` | Políticas y atención | `politicas` · `protocolo` · `preguntas` | B | `politicas/PoliticasVista.tsx` → `PoliticasVista` |

Rutas relativas a `components/admin/planificacion/`. El shell `components/admin/unified/PlanificacionModule.tsx` (carril A) envuelve todo en `PlanEmpresaProvider` y monta cada vista con `next/dynamic` desde esas rutas y nombres EXACTOS.
