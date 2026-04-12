# ADR-035 — Disaster Recovery Drills (Simulacros Mensuales)

**Status:** Accepted
**Fecha:** 2026-04-09
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-033 (Level 5 Autonomy), db-restore skill, pre-deploy-db-snapshot hook

---

## 1. Contexto

Buleje tiene backups automatizados (pre-deploy, pre-migrate, weekly) generados por el hook `pre-deploy-db-snapshot`. Sin embargo, **un backup que nunca se ha restaurado es ficcion**. No hay forma de saber si los backups son validos, completos, o si el proceso de restauracion funciona correctamente hasta que se prueba.

Riesgos identificados:
- Backup corrupto por disco lleno o interrupcion durante pg_dump
- Schema drift entre el backup y las migraciones aplicadas despues
- Datos referecialmente rotos (FK huerfanos) que no se detectan hasta el restore
- Tiempo de restore desconocido (RTO sin medir)
- Falsa confianza: "tenemos backups" sin evidencia de que funcionan

## 2. Decision

Implementar un **drill mensual automatizado de disaster recovery** con las siguientes caracteristicas:

### Workflow automatizado (GitHub Actions)
- **Cron:** dia 1 de cada mes a las 11:00 UTC (6:00 AM Lima)
- **Manual:** `workflow_dispatch` con input opcional `backup_date`
- **Timeout:** 30 minutos

### Proceso del drill
1. Encontrar el backup mas reciente (o el de la fecha especificada)
2. Crear una base de datos temporal (`bodega_dr_test_YYYYMMDD`)
3. Restaurar el backup en la DB temporal
4. Ejecutar 10 validaciones automatizadas
5. Generar reporte en `reports/dr-drills/YYYY-MM-DD.md`
6. Si falla: crear issue automatico con labels `dr-failed`, `claude-auto`
7. Siempre: limpiar la DB temporal

### 10 validaciones

| # | Validacion | Que detecta |
|---|---|---|
| 1 | Tenants > 0 | Backup vacio |
| 2 | Productos por tenant > 0 | Catalogo perdido |
| 3 | Ventas coherentes (sum >= 0) | Datos de ordenes corruptos |
| 4 | Aislamiento multi-tenant | FK huerfanos en tenantId |
| 5 | Integridad referencial OrderItems | FK rotos order->items |
| 6 | Boletas formato SUNAT valido | Compliance roto |
| 7 | Saldos fiado coherentes | Pagos perdidos en backup |
| 8 | Stock no negativo | Inventario corrupto |
| 9 | Cadena audit log integra | Cadena de hash rota |
| 10 | Tiempo < 10 minutos | RTO dentro de presupuesto |

## 3. Consecuencias

### Positivas
- **Confianza real** en los backups, no asumida
- **RTO medido** cada mes — sabemos cuanto tarda restaurar
- **Deteccion temprana** de backups corruptos o incompletos
- **Evidencia auditable** con reportes mensuales en el repo
- **Metrica operativa clara:** "dias desde ultimo DR drill exitoso"

### Negativas
- **Costo de DB temporal** cada mes (minimo, se destruye inmediatamente)
- **Requiere DIRECT_URL** en secrets de GitHub Actions
- **Consume minutos de CI** (~10-15 min/mes)

### Neutras
- Los reportes se acumulan en `reports/dr-drills/` (limpieza manual si crece mucho)
- El drill no prueba la restauracion de archivos/assets (solo DB)

## 4. Metricas

| Metrica | Umbral | Alerta |
|---|---|---|
| Dias desde ultimo DR drill exitoso | <= 35 | Issue automatico si falla |
| Tiempo de restore | < 10 min | Test #10 falla si excede |
| Validaciones pasadas | 10/10 | Issue si cualquiera falla |

## 5. Archivos creados

| Archivo | Proposito |
|---|---|
| `.github/workflows/dr-drill.yml` | Workflow de GitHub Actions |
| `evals/dr/restore-validation.ts` | 10 tests de validacion |
| `.claude/skills/dr-drill/SKILL.md` | Skill para ejecucion manual |
| `reports/dr-drills/.gitkeep` | Directorio para reportes |
| `docs/adr/035-disaster-recovery-drills.md` | Este ADR |

---

> Un backup sin restore probado es una promesa sin evidencia. Este drill convierte esa promesa en un hecho verificado cada mes.
