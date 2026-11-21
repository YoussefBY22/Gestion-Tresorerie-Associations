import { describe, expect, it } from "vitest";
import { config } from "./proxy";

/**
 * Le matcher du proxy décide de ce qui est protégé. Une virgule mal placée y
 * a deux conséquences opposées et toutes deux graves : exposer l'application entier,
 * ou bloquer une page publique derrière un écran de connexion. Il mérite donc
 * ses propres tests.
 */

const motif = config.matcher[0];
// Next compile le matcher comme un chemin complet : on ancre pour reproduire.
const regex = new RegExp(`^${motif}$`);

const protege = (chemin: string) => regex.test(chemin);

describe("matcher du proxy", () => {
  it("protège les pages de l'application", () => {
    for (const chemin of [
      "/",
      "/documents",
      "/documents/abc123",
      "/tresorerie/recus",
      "/admin/utilisateurs",
      "/formulaires",
      "/formulaires/abc123",
    ]) {
      expect(protege(chemin), `${chemin} devrait être protégé`).toBe(true);
    }
  });

  it("protège les routes d'API métier", () => {
    expect(protege("/api/documents/abc/fichier")).toBe(true);
  });

  it("laisse passer le flux de connexion et les sondes", () => {
    for (const chemin of [
      "/login",
      "/api/auth/session",
      "/api/health",
      "/api/cron/rappels",
      "/api/webhooks/wordpress",
    ]) {
      expect(protege(chemin), `${chemin} devrait être public`).toBe(false);
    }
  });

  it("laisse passer les formulaires publics", () => {
    // Un client ou un candidat n'a pas de compte : sans cette exclusion, le
    // lien d'enquête renverrait vers /login et personne ne répondrait.
    expect(protege("/f/0123456789abcdef0123456789abcdef")).toBe(false);
    expect(protege("/f/abc")).toBe(false);
  });

  it("ne rend pas public tout ce qui commence par « f »", () => {
    // L'exclusion porte sur le segment « f/ », pas sur la lettre : une
    // exclusion trop large ouvrirait /factures ou /formulaires.
    expect(protege("/formulaires")).toBe(true);
    expect(protege("/factures")).toBe(true);
    expect(protege("/f")).toBe(true);
  });

  it("laisse passer les assets", () => {
    expect(protege("/_next/static/chunk.js")).toBe(false);
    expect(protege("/favicon.ico")).toBe(false);
    expect(protege("/logo.png")).toBe(false);
  });
});
