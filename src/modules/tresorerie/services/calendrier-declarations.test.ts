import { describe, expect, it } from "vitest";
import {
  blocageDeLaCloture,
  calendrierDeclarations,
  moisEnRetard,
  moisSuivant,
} from "./calendrier-declarations";

const exercice = [
  { cle: "2026-07", libelle: "Juillet 2026" },
  { cle: "2026-08", libelle: "Août 2026" },
  { cle: "2026-09", libelle: "Septembre 2026" },
  { cle: "2026-10", libelle: "Octobre 2026" },
  { cle: "2026-11", libelle: "Novembre 2026" },
];

describe("calendrierDeclarations", () => {
  it("reprend l'état de ce que la base connaît", () => {
    const frise = calendrierDeclarations(
      exercice,
      [
        { mois: "2026-07", statut: "DEPOSEE" },
        { mois: "2026-08", statut: "CLOTUREE" },
      ],
      "2026-10"
    );
    expect(frise.map((m) => m.etat)).toEqual([
      "DEPOSEE",
      "CLOTUREE",
      // Septembre est échu et n'a jamais été ouvert : c'est un retard.
      "EN_RETARD",
      "EN_COURS",
      "A_VENIR",
    ]);
  });

  it("compte un mois échu laissé en brouillon comme un retard", () => {
    // Avoir ouvert la déclaration ne vaut pas l'avoir faite.
    const frise = calendrierDeclarations(
      exercice,
      [{ mois: "2026-09", statut: "BROUILLON" }],
      "2026-10"
    );
    expect(frise.find((m) => m.cle === "2026-09")!.etat).toBe("EN_RETARD");
  });

  it("ne reproche rien au mois en cours ni aux suivants", () => {
    const frise = calendrierDeclarations(
      exercice,
      [{ mois: "2026-10", statut: "BROUILLON" }],
      "2026-10"
    );
    expect(frise.find((m) => m.cle === "2026-10")!.etat).toBe("EN_COURS");
    expect(frise.find((m) => m.cle === "2026-11")!.etat).toBe("A_VENIR");
  });

  it("garde l'ordre et les libellés de l'exercice", () => {
    const frise = calendrierDeclarations(exercice, [], "2026-10");
    expect(frise.map((m) => m.cle)).toEqual(exercice.map((m) => m.cle));
    expect(frise[0].libelle).toBe("Juillet 2026");
  });

  it("rend une frise vide pour un exercice vide", () => {
    expect(calendrierDeclarations([], [], "2026-10")).toEqual([]);
  });
});

describe("moisEnRetard", () => {
  it("ne retient que les mois échus non clôturés", () => {
    const frise = calendrierDeclarations(
      exercice,
      [{ mois: "2026-07", statut: "DEPOSEE" }],
      "2026-10"
    );
    expect(moisEnRetard(frise).map((m) => m.cle)).toEqual([
      "2026-08",
      "2026-09",
    ]);
  });
});

describe("blocageDeLaCloture", () => {
  it("bloque quand le mois précédent est resté en brouillon", () => {
    const { bloque, raison } = blocageDeLaCloture("2026-09", [
      { mois: "2026-09", statut: "BROUILLON" },
    ]);
    expect(bloque).toBe(true);
    expect(raison).toContain("report");
  });

  it("ne bloque pas quand le mois précédent n'a jamais été ouvert", () => {
    // L'écran affirmait le contraire : il annonçait qu'il fallait clôturer
    // un mois qui n'existait pas, décourageant une action qui aurait marché.
    expect(blocageDeLaCloture("2026-09", []).bloque).toBe(false);
  });

  it("ne bloque pas quand le mois précédent est clôturé ou déposé", () => {
    for (const statut of ["CLOTUREE", "DEPOSEE"]) {
      expect(
        blocageDeLaCloture("2026-09", [{ mois: "2026-09", statut }]).bloque
      ).toBe(false);
    }
  });
});

describe("moisSuivant", () => {
  it("avance d'un mois", () => {
    expect(moisSuivant("2026-10")).toBe("2026-11");
  });

  it("passe à l'année suivante en décembre", () => {
    expect(moisSuivant("2026-12")).toBe("2027-01");
  });

  it("refuse un mois invalide", () => {
    expect(() => moisSuivant("2026-13")).toThrow();
    expect(() => moisSuivant("n'importe quoi")).toThrow();
  });
});
