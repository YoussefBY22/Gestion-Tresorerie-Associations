import { describe, expect, it } from "vitest";
import {
  amortissementCumule,
  anciennete,
  estTotalementAmorti,
  stockCourant,
  synthetiserInventaire,
  tauxAmortissement,
  valeurBrute,
  valeurNetteComptable,
} from "./amortissement";

const MAINTENANT = new Date("2026-05-31T00:00:00Z");
/** Deux ans jour pour jour avant `MAINTENANT`. */
const IL_Y_A_2_ANS = new Date("2024-05-31T00:00:00Z");
const IL_Y_A_5_ANS = new Date("2021-05-31T00:00:00Z");

describe("tauxAmortissement", () => {
  it("déduit le taux de la durée — jamais l'inverse (§7.2)", () => {
    expect(tauxAmortissement(4)).toBe(25);
    expect(tauxAmortissement(3)).toBe(33.33);
    expect(tauxAmortissement(1)).toBe(100);
  });

  it("renvoie null pour un bien non amortissable", () => {
    expect(tauxAmortissement(0)).toBeNull();
    expect(tauxAmortissement(null)).toBeNull();
    expect(tauxAmortissement(undefined)).toBeNull();
  });
});

describe("anciennete", () => {
  it("mesure l'ancienneté en années", () => {
    expect(anciennete(IL_Y_A_2_ANS, MAINTENANT)).toBeCloseTo(2, 1);
  });

  it("ne compte pas d'ancienneté négative pour une acquisition future", () => {
    expect(anciennete(new Date("2027-01-01"), MAINTENANT)).toBe(0);
  });
});

describe("stockCourant", () => {
  it("applique les mouvements à la quantité initiale", () => {
    expect(
      stockCourant({
        quantiteInitiale: 10,
        mouvements: [{ quantite: -3 }, { quantite: -2 }, { quantite: 5 }],
      })
    ).toBe(10);
  });

  it("vaut la quantité initiale sans mouvement", () => {
    expect(stockCourant({ quantiteInitiale: 4 })).toBe(4);
  });
});

describe("amortissement d'un bien", () => {
  const laptop = {
    quantiteInitiale: 1,
    valeurUnitaire: 2000,
    dateAcquisition: IL_Y_A_2_ANS,
    dureeAmortissementAnnees: 4,
  };

  it("amortit linéairement au prorata de l'ancienneté", () => {
    // 2 ans sur 4 → ~la moitié de 2000. L'année de référence vaut 365,25 j
    // (bissextiles), donc 730 jours ≈ 1,9986 an : ~999,3 et non 1000 pile.
    expect(amortissementCumule(laptop, MAINTENANT)).toBeCloseTo(1000, -1);
    expect(valeurNetteComptable(laptop, MAINTENANT)).toBeCloseTo(1000, -1);
  });

  it("plafonne l'amortissement à la valeur brute", () => {
    const vieux = { ...laptop, dateAcquisition: IL_Y_A_5_ANS };
    expect(amortissementCumule(vieux, MAINTENANT)).toBe(2000);
    // Une VNC négative n'aurait aucun sens comptable.
    expect(valeurNetteComptable(vieux, MAINTENANT)).toBe(0);
    expect(estTotalementAmorti(vieux, MAINTENANT)).toBe(true);
  });

  it("n'amortit pas un bien sans durée (goodies, consommables)", () => {
    const goodies = {
      quantiteInitiale: 100,
      valeurUnitaire: 5,
      dateAcquisition: IL_Y_A_5_ANS,
      dureeAmortissementAnnees: 0,
    };
    expect(amortissementCumule(goodies, MAINTENANT)).toBe(0);
    expect(valeurNetteComptable(goodies, MAINTENANT)).toBe(500);
    expect(estTotalementAmorti(goodies, MAINTENANT)).toBe(false);
  });

  it("valorise le stock restant, pas le stock d'origine", () => {
    const avecSorties = {
      ...laptop,
      quantiteInitiale: 3,
      mouvements: [{ quantite: -1 }],
    };
    expect(valeurBrute(avecSorties)).toBe(4000); // 2 restants × 2000
  });
});

describe("synthetiserInventaire", () => {
  it("agrège valeurs, amortissements et écarts de conformité", () => {
    const synthese = synthetiserInventaire(
      [
        {
          quantiteInitiale: 1,
          valeurUnitaire: 2000,
          dateAcquisition: IL_Y_A_2_ANS,
          dureeAmortissementAnnees: 4,
        },
        // Sans durée d'amortissement → signalé comme écart §7.2.
        { quantiteInitiale: 10, valeurUnitaire: 10, dateAcquisition: IL_Y_A_2_ANS },
        // Stock épuisé.
        {
          quantiteInitiale: 2,
          valeurUnitaire: 50,
          dateAcquisition: IL_Y_A_2_ANS,
          dureeAmortissementAnnees: 2,
          mouvements: [{ quantite: -2 }],
        },
      ],
      MAINTENANT
    );

    expect(synthese.nbBiens).toBe(3);
    expect(synthese.valeurBruteTotale).toBeCloseTo(2100, 0);
    expect(synthese.amortissementCumuleTotal).toBeCloseTo(1000, -1);
    expect(synthese.valeurNetteTotale).toBeCloseTo(1100, -1);
    expect(synthese.nbSansDuree).toBe(1);
    expect(synthese.nbReferencesEnRupture).toBe(1);
  });

  it("reste neutre sur un inventaire vide", () => {
    const s = synthetiserInventaire([], MAINTENANT);
    expect(s.nbBiens).toBe(0);
    expect(s.valeurNetteTotale).toBe(0);
  });
});
