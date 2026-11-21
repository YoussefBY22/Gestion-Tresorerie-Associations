import { describe, expect, it } from "vitest";
import { calculerDatePurge, estExpire, joursAvantPurge } from "./corbeille";

describe("date de purge", () => {
  it("fixe la purge 30 jours après la suppression", () => {
    const supprimeLe = new Date(2026, 7, 1);
    expect(calculerDatePurge(supprimeLe)).toEqual(new Date(2026, 7, 31));
  });

  it("accepte une durée de rétention personnalisée", () => {
    expect(calculerDatePurge(new Date(2026, 7, 1), 7)).toEqual(new Date(2026, 7, 8));
  });
});

describe("expiration", () => {
  it("n'est pas expiré avant la date de purge", () => {
    expect(estExpire(new Date(2026, 7, 31), new Date(2026, 7, 15))).toBe(false);
  });

  it("est expiré à la date de purge ou après", () => {
    expect(estExpire(new Date(2026, 7, 31), new Date(2026, 7, 31))).toBe(true);
    expect(estExpire(new Date(2026, 7, 31), new Date(2026, 8, 1))).toBe(true);
  });
});

describe("jours restants avant purge", () => {
  it("compte les jours entiers restants", () => {
    expect(joursAvantPurge(new Date(2026, 7, 31), new Date(2026, 7, 1))).toBe(30);
  });

  it("ne rend jamais un nombre négatif pour un élément déjà expiré", () => {
    expect(joursAvantPurge(new Date(2026, 7, 1), new Date(2026, 7, 15))).toBe(0);
  });
});
