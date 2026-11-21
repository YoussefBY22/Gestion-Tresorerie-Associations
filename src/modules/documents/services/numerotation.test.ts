import { describe, expect, it } from "vitest";
import {
  ReferenceInvalide,
  cleSequence,
  formaterReference,
  mandatCourt,
} from "./numerotation";

describe("mandatCourt", () => {
  it("réduit un mandat long à sa forme courte", () => {
    expect(mandatCourt("2025-2026")).toBe("2526");
    expect(mandatCourt("2024 - 2025")).toBe("2425");
  });

  it("accepte les formes déjà courtes", () => {
    expect(mandatCourt("25-26")).toBe("2526");
    expect(mandatCourt("2526")).toBe("2526");
  });

  it("refuse un mandat non reconnu plutôt que d'inventer un numéro", () => {
    expect(() => mandatCourt("mandat en cours")).toThrow(ReferenceInvalide);
  });
});

describe("formaterReference", () => {
  const ctx = { sequence: 7, mandat: "2025-2026", date: new Date(2026, 1, 9) };

  it("reproduit la nomenclature des reçus de cotisation", () => {
    expect(formaterReference("RC{seq:3}-COT-{mandat}", ctx)).toBe(
      "RC007-COT-2526"
    );
  });

  it("gère les autres gabarits du catalogue", () => {
    expect(formaterReference("BL{seq:2}-{mandat}", ctx)).toBe("BL07-2526");
    expect(formaterReference("RAPM-{mois}-{mandat}", ctx)).toBe("RAPM-02-2526");
    expect(formaterReference("NC-{mandat}-{seq:3}", ctx)).toBe("NC-2526-007");
  });

  it("laisse la séquence brute sans largeur imposée", () => {
    expect(formaterReference("REF-{seq}", ctx)).toBe("REF-7");
  });

  it("ne tronque pas une séquence plus longue que la largeur demandée", () => {
    expect(
      formaterReference("RC{seq:3}-COT-{mandat}", { ...ctx, sequence: 1234 })
    ).toBe("RC1234-COT-2526");
  });

  it("substitue l'année civile et le code du modèle", () => {
    expect(
      formaterReference("{code}-{annee}-{seq:2}", { ...ctx, code: "STR" })
    ).toBe("STR-2026-07");
  });

  it("refuse un jeton inconnu au lieu de produire un trou dans la référence", () => {
    expect(() => formaterReference("X-{inconnu}-{seq}", ctx)).toThrow(
      /inconnu/i
    );
  });
});

describe("cleSequence", () => {
  it("isole les compteurs par modèle et par mandat", () => {
    expect(cleSequence("RECU_COTISATION", "2025-2026")).toBe(
      "RECU_COTISATION:2526"
    );
    // Deux mandats ne partagent pas leur numérotation : chacun repart à 1.
    expect(cleSequence("RECU_COTISATION", "2024-2025")).not.toBe(
      cleSequence("RECU_COTISATION", "2025-2026")
    );
    // Deux modèles non plus.
    expect(cleSequence("RECU_DON", "2025-2026")).not.toBe(
      cleSequence("RECU_COTISATION", "2025-2026")
    );
  });
});
