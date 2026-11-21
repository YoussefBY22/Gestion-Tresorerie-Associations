import { describe, expect, it } from "vitest";
import {
  bilanMensuel,
  budgetVerrouille,
  moisDuMandat,
  normaliserValeurs,
  soldeCumule,
  sousTotalSection,
  totalParSens,
  transitionsDemandeBudgetPossibles,
  validerTransitionDemandeBudget,
  type SectionBudgetCalc,  partEcoulee,
  respectBudget,
} from "./budget-previsionnel";

describe("mois du mandat", () => {
  it("génère une colonne par mois, sans fusion arbitraire", () => {
    const periodes = moisDuMandat(new Date(2025, 5, 25), new Date(2025, 7, 5));
    expect(periodes.map((p) => p.libelle)).toEqual([
      "Juin 2025",
      "Juillet 2025",
      "Août 2025",
    ]);
  });

  it("franchit le passage d'année", () => {
    const periodes = moisDuMandat(new Date(2025, 11, 15), new Date(2026, 1, 3));
    expect(periodes.map((p) => p.cle)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("rend un tableau vide plutôt que planter sur une fin antérieure au début", () => {
    expect(moisDuMandat(new Date(2026, 0, 1), new Date(2025, 0, 1))).toEqual([]);
  });

  it("plafonne un mandat mal saisi plutôt que de figer la page", () => {
    const periodes = moisDuMandat(new Date(2000, 0, 1), new Date(2100, 0, 1));
    expect(periodes.length).toBe(36);
  });
});

describe("normalisation des valeurs mensuelles", () => {
  it("complète les valeurs manquantes par zéro", () => {
    expect(normaliserValeurs([10, 20], 4)).toEqual([10, 20, 0, 0]);
  });

  it("tronque un tableau plus long que le nombre de mois actuel", () => {
    expect(normaliserValeurs([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });

  it("gère l'absence totale de valeurs", () => {
    expect(normaliserValeurs(undefined, 3)).toEqual([0, 0, 0]);
    expect(normaliserValeurs(null, 3)).toEqual([0, 0, 0]);
  });
});

describe("sous-totaux et totaux", () => {
  const chargesFixes: SectionBudgetCalc = {
    sens: "DEPENSE",
    lignes: [
      { valeursMensuelles: [100, 0, 0] },
      { valeursMensuelles: [0, 50, 0] },
    ],
  };
  const chargesVariables: SectionBudgetCalc = {
    sens: "DEPENSE",
    lignes: [{ valeursMensuelles: [0, 0, 30] }],
  };
  const recettes: SectionBudgetCalc = {
    sens: "RECETTE",
    lignes: [{ valeursMensuelles: [200, 200, 200] }],
  };

  it("additionne les lignes d'une section mois par mois", () => {
    expect(sousTotalSection(chargesFixes, 3)).toEqual([100, 50, 0]);
  });

  it("additionne toutes les sections du même sens", () => {
    expect(totalParSens([chargesFixes, chargesVariables, recettes], "DEPENSE", 3)).toEqual([
      100, 50, 30,
    ]);
  });

  it("ne mélange pas dépenses et recettes", () => {
    expect(totalParSens([chargesFixes, recettes], "RECETTE", 3)).toEqual([200, 200, 200]);
  });

  it("calcule un bilan mensuel négatif quand les dépenses dépassent les recettes", () => {
    expect(bilanMensuel([100], [150])).toEqual([-50]);
  });

  it("cumule le solde de trésorerie budgétaire mois après mois", () => {
    expect(soldeCumule(1000, [100, -50, 30])).toEqual([1100, 1050, 1080]);
  });

  it("arrondit aux millimes malgré les imprécisions flottantes", () => {
    const section: SectionBudgetCalc = {
      sens: "DEPENSE",
      lignes: [{ valeursMensuelles: [0.1] }, { valeursMensuelles: [0.2] }],
    };
    expect(sousTotalSection(section, 1)).toEqual([0.3]);
  });
});

describe("verrouillage du budget", () => {
  it("reste modifiable tant qu'aucune AG d'ouverture n'a été tenue", () => {
    expect(budgetVerrouille(false, false)).toBe(false);
  });

  it("se verrouille dès l'AG d'ouverture tenue", () => {
    expect(budgetVerrouille(true, false)).toBe(true);
  });

  it("se déverrouille le temps d'une demande acceptée par le Président", () => {
    expect(budgetVerrouille(true, true)).toBe(false);
  });

  it("reste ouvert avant l'AG même si une demande traîne (cas impossible mais non destructeur)", () => {
    expect(budgetVerrouille(false, true)).toBe(false);
  });
});

describe("cycle de vie d'une demande de modification", () => {
  it("exige l'acceptation du Président avant toute application", () => {
    expect(validerTransitionDemandeBudget("EN_ATTENTE", "APPLIQUEE")).toContain(
      "acceptée par le Président"
    );
    expect(validerTransitionDemandeBudget("ACCEPTEE", "APPLIQUEE")).toBeNull();
  });

  it("ne rejoue pas le sort d'une demande déjà tranchée", () => {
    expect(validerTransitionDemandeBudget("REFUSEE", "ACCEPTEE")).toContain(
      "ne se rejoue pas"
    );
    expect(transitionsDemandeBudgetPossibles("APPLIQUEE")).toEqual([]);
  });

  it("accepte une transition vers le même statut", () => {
    expect(validerTransitionDemandeBudget("EN_ATTENTE", "EN_ATTENTE")).toBeNull();
  });
});

describe("part du mandat écoulée", () => {
  const debut = new Date(2026, 6, 1);
  const fin = new Date(2027, 5, 30);

  it("vaut 0 avant le début et 1 après la fin", () => {
    expect(partEcoulee(debut, fin, new Date(2026, 0, 1))).toBe(0);
    expect(partEcoulee(debut, fin, new Date(2028, 0, 1))).toBe(1);
  });

  it("vaut environ la moitié à mi-mandat", () => {
    const milieu = new Date((debut.getTime() + fin.getTime()) / 2);
    expect(partEcoulee(debut, fin, milieu)).toBeCloseTo(0.5, 5);
  });
});

describe("respect du budget", () => {
  it("est parfait tant que les charges suivent la trajectoire", () => {
    const r = respectBudget({
      prevuRecettes: 1000,
      realiseRecettes: 500,
      prevuCharges: 1000,
      realiseCharges: 400,
      partEcoulee: 0.5,
    });
    expect(r).toEqual({ global: 100, recettes: 100, charges: 100 });
  });

  it("se dégrade proportionnellement au dépassement de charges", () => {
    // À mi-mandat on attend 500 ; on a dépensé 1000 → deux fois trop.
    const r = respectBudget({
      prevuRecettes: 1000,
      realiseRecettes: 500,
      prevuCharges: 1000,
      realiseCharges: 1000,
      partEcoulee: 0.5,
    });
    expect(r?.charges).toBe(50);
    expect(r?.global).toBe(75);
  });

  it("se dégrade quand les recettes sont en retard", () => {
    const r = respectBudget({
      prevuRecettes: 1000,
      realiseRecettes: 100,
      prevuCharges: 1000,
      realiseCharges: 200,
      partEcoulee: 0.5,
    });
    expect(r?.recettes).toBe(20);
    expect(r?.charges).toBe(100);
    expect(r?.global).toBe(60);
  });

  it("plafonne les recettes à 100 : une bonne surprise ne masque pas un dérapage", () => {
    const r = respectBudget({
      prevuRecettes: 1000,
      realiseRecettes: 5000,
      prevuCharges: 1000,
      realiseCharges: 1000,
      partEcoulee: 0.5,
    });
    expect(r?.recettes).toBe(100);
    expect(r?.global).toBe(75);
  });

  it("sanctionne une dépense hors de tout budget", () => {
    const r = respectBudget({
      prevuRecettes: 0,
      realiseRecettes: 0,
      prevuCharges: 0,
      realiseCharges: 300,
      partEcoulee: 0.5,
    });
    expect(r).toEqual({ global: 0, recettes: null, charges: 0 });
  });

  it("ne rend aucun chiffre quand rien n'est budgété ni réalisé", () => {
    expect(
      respectBudget({
        prevuRecettes: 0,
        realiseRecettes: 0,
        prevuCharges: 0,
        realiseCharges: 0,
        partEcoulee: 0.5,
      })
    ).toBeNull();
  });
});
