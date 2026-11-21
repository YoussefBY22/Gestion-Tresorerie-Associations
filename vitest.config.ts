import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // `.tsx` inclus depuis l'organigramme : certains composants de rendu (un
    // arbre récursif, un gabarit) méritent d'être vérifiés en HTML statique.
    // Les tests unitaires vivent à côté du code qu'ils vérifient ; les
    // suites transverses (contrats, sécurité, intégration) vivent dans
    // `tests/`, car elles ne relèvent d'aucun module en particulier.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
    ],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
