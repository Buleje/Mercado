# ADR-380 — Registro de Plantación Forestal (RNPF)

**Status:** Accepted
**Fecha:** 2026-08-21
**Autor:** Brandon (Buleje) + Claude Code

## 1. Contexto

`forestal-tramites` ya cubre los oficios/cartas que el CTP presenta a la autoridad
(`tramites-catalogo.ts` — un catálogo KV de formatos Ley 27444: destinatario,
cuerpo redactado, base legal, anexos). Ese motor sirve para SOLICITUDES en
prosa; no sirve para el **Formato Único para la Inscripción/Actualización de
Plantaciones en el Registro Nacional de Plantaciones Forestales (RNPF)** que
exige SERFOR, porque ese formato es una FICHA ESTRUCTURADA (titular, predio,
bloques con vértices UTM, especies por bloque) y no una carta.

Verificado contra fuente primaria (Lineamientos RNPF-SERFOR + D.S.
N°020-2015-MINAGRI, Reglamento para la Gestión de las Plantaciones Forestales y
los Sistemas Agroforestales, arts. 47-71 + Anexo N°1 ítems 6-7; y un ejemplar
real filtrado del "Formato Nº 01"): el formato real trae ~50 campos
estructurados en tres bloques (1. información del solicitante — titular +
representante legal; 2. del área — predio + titularidad + título habilitante;
3. de la plantación — bloques × {vértices UTM, especies}) más una declaración
jurada (Ley 27444 art. 34) y checklist de documentos. Guardar esto como un JSON
gigante en el patrón KV existente (`ForestTramitesDB`) rompería la relación real
1 trámite → N bloques → N vértices/especies por bloque que exige el propio
formato oficial.

## 2. Decisión

Módulo nuevo, relacional, DENTRO de `forestal-tramites` (misma pantalla, tercera
vista junto a "Formatos"/"Expediente"), pero con su propio motor — NO se agrega
como una entrada más de `FORMATOS_TRAMITE`:

- **Prisma**: `ForestPlantacionTramite` (titular + representante + predio +
  titularidad + título habilitante + declaración jurada + documentos como JSON
  de punteros al Drive) → `ForestPlantacionBloque` (1:N) → `ForestPlantacionVertice`
  y `ForestPlantacionEspecie` (1:N cada uno, por bloque). Sigue el patrón ya
  usado por `ForestPlan`/`ForestPlanSpecies`/`ForestCensusTree`.
- **`codigoInterno`** (`RPF-2026-0001`, correlativo por tenant/año) es
  SIEMPRE distinto de **`codigoPlantacionSerfor`** (el que emite la ARFFS al
  inscribir, Anexo N°02) — el sistema nunca inventa el segundo.
- **DB class** `lib/db/forest-plantaciones.db.ts`, lógica pura en
  `lib/forestal/plantacion-tramite.ts` (construir/validar/avance),
  `plantacion-catalogo.ts` (especies/finalidades/tipos, sin inventar valores
  regulatorios), `plantacion-cartografia.ts` (reusa `loth-utm.ts` para
  UTM↔lat/lng — cero reinvención), `plantacion-print.ts` (documento imprimible,
  reusa `ctp-print-shared.ts`).
- CITES nunca bloquea ni resta — mismo criterio que el CTP (`serfor-osinfor-compliance` §6).

## 3. Consecuencias

### Positivas
- Un trámite reconstruye su formulario completo (para "Continuar" o "Duplicar")
  con queries relacionales simples, no parseando un JSON de campos sueltos.
- El mapa de vértices y el cálculo de área/perímetro reusan matemática ya
  probada (`loth-utm.ts`), sin una segunda implementación UTM en el repo.

### Negativas
- 4 modelos nuevos (~50 columnas en el trámite) — schema más ancho, aceptado
  porque el formato oficial real tiene esa densidad (no es sobre-modelado).

### Migraciones requeridas
- `prisma/migrations/adr-380-registro-plantacion-forestal.sql` — 4 `CREATE
  TABLE IF NOT EXISTS` + índices. Aplicada vía `scripts/apply-380-migration.mjs`
  (pooler, DDL simple sin `CONCURRENTLY`) — `DIRECT_URL` no resolvía DNS desde
  esta red al momento de aplicar (gotcha ya conocido), pooler sí.

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| Sumarlo a `tramites-catalogo.ts` como un `FormatoTramite` más | Cero modelos nuevos, reusa 100% el motor existente | `DatosTramite` es `Record<string,string>` plano — no modela bloques×vértices×especies (relación N:M:M real) | El propio formato oficial exige esa relación; forzarla a texto plano pierde estructura y rompe "Continuar"/"Duplicar" por bloque |
| KV (`PlatformSettingsDB`), igual que `ForestTramitesDB` | Sin migración | Mismo problema: bloques/vértices/especies como arrays anidados en un JSON — sin índices, sin queries por especie/CITES | El volumen y la necesidad de listar/filtrar por especie o bloque superan lo que un KV justifica (criterio de `tramites-catalogo.ts` §"POR QUÉ KV") |

## 5. Verificación

- [x] Tests actualizados (`__tests__/forestal-plantacion-tramite.test.ts`,
      `__tests__/forestal-plantacion-cartografia.test.ts`)
- [x] Docs actualizadas (este ADR)
- [ ] Memoria actualizada (pendiente al cierre de la sesión)
- [x] Rollback plan: `DROP TABLE IF EXISTS "ForestPlantacion..."` — tablas
      nuevas y vacías, sin dependientes; reversible sin pérdida de datos de
      otros módulos.

## 6. Referencias

- Skill `serfor-osinfor-compliance` §6 (CITES no resta).
- Lineamientos para la inscripción de plantaciones en el RNPF y su
  actualización (SERFOR) — Anexo N°01 "Formato Único…".
- D.S. N°020-2015-MINAGRI, Reglamento para la Gestión de las Plantaciones
  Forestales y los Sistemas Agroforestales, arts. 47-71 + Anexo N°1.
- Ley N°29763, Ley N°27444 (art. 34, declaración jurada), D.L. N°1283.
- `lib/forestal/loth-utm.ts` (matemática UTM reusada sin cambios).
