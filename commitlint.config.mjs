export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // Nueva funcionalidad
        "fix",      // Corrección de bug
        "docs",     // Cambio en documentación
        "style",    // Formato (no afecta lógica)
        "refactor", // Refactorización (no es feat ni fix)
        "perf",     // Mejora de rendimiento
        "test",     // Agregar o corregir tests
        "chore",    // Tareas de mantenimiento
        "ci",       // Cambios en CI/CD
        "build",    // Cambios en build system
        "revert",   // Revertir un commit anterior
      ],
    ],
    "subject-max-length": [2, "always", 100],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};
