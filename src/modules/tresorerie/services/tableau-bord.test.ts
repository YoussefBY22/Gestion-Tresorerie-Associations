import { describe, expect, it } from "vitest";
import {
  SEUIL_ALERTE_TAUX_CHARGES,
  indicateursExercice,
  pointsFaibles,
  pointsForts,
  repartitionParCategorie,
  syntheseMensuelle,
  variation,
  type PointMensuel,
} from "./tableau-bord";

describe("répartition par catégorie", () => {
  it("additionne les flux d'un même sens par catégorie, triés du plus gros au plus petit", () => {
    const r = repartitionParCategorie(
      [
        { type: "DECAISSEMENT", montant: 100, categorie: "Charge Variable" },
        { type: "DECAISSEMENT", montant: 50, categorie: "Charge Fixe" },
        { type: "DECAISSEMENT", montant: 30, categorie: "Charge Variable" },
        { type: "ENCAISSEMENT", montant: 999, categorie: "Projet" },
      ],
      "DECAISSEMENT"
    );
    expect(r).toEqual([
      { categorie: "Charge Variable", montant: 130 },
      { categorie: "Charge Fixe", montant: 50 },
    ]);
  });

  it("rend un tableau vide plutôt qu'une catégorie à zéro inventée", () => {
    expect(repartitionParCategorie([], "ENCAISSEMENT")).toEqual([]);
  });
});

const mois = (p: Partial<PointMensuel>): PointMensuel => ({
  periode: "Test",
  soldeOuverture: 0,
  soldeCloture: 0,
  recettesReelles: 0,
  depensesReelles: 0,
  recettesBudget: 0,
  depensesBudget: 0,
  ...p,
});

describe("indicateurs de l'exercice", () => {
  const points: PointMensuel[] = [
    mois({ periode: "Août", soldeCloture: 4757, recettesReelles: 475, depensesReelles: 0, recettesBudget: 475, depensesBudget: 0 }),
    mois({ periode: "Septembre", soldeCloture: 4637, recettesReelles: 0, depensesReelles: 120, recettesBudget: 200, depensesBudget: 0 }),
    mois({ periode: "Octobre", soldeCloture: 3982.5, recettesReelles: 0, depensesReelles: 654.5, recettesBudget: 2570, depensesBudget: 800 }),
  ];

  it("cumule recettes et dépenses réelles sur l'exercice", () => {
    const ind = indicateursExercice(points);
    expect(ind.totalRecettesReelles).toBe(475);
    expect(ind.totalDepensesReelles).toBe(774.5);
    expect(ind.valeurAjoutee).toBe(475 - 774.5);
  });

  it("retient le solde du dernier point comme clôture et le plus bas comme minimum", () => {
    const ind = indicateursExercice(points);
    expect(ind.soldeCloture).toBe(3982.5);
    expect(ind.soldeMinimum).toBe(3982.5);
  });

  it("compte les mois où les dépenses dépassent les recettes", () => {
    // Septembre (120 > 0) et Octobre (654.5 > 0) sont déficitaires, pas Août.
    expect(indicateursExercice(points).periodesDeficitaires).toBe(2);
  });

  it("ne calcule pas de taux sans budget à comparer", () => {
    const ind = indicateursExercice([mois({ recettesReelles: 100, recettesBudget: 0 })]);
    expect(ind.tauxRealisationRecettes).toBeNull();
  });

  it("ne calcule pas de taux de charges sans recette réelle", () => {
    const ind = indicateursExercice([mois({ depensesReelles: 50, recettesReelles: 0 })]);
    expect(ind.tauxDeCharges).toBeNull();
  });

  it("rend des indicateurs neutres sur un exercice sans aucun point", () => {
    const ind = indicateursExercice([]);
    expect(ind.soldeCloture).toBe(0);
    expect(ind.soldeMinimum).toBe(0);
    expect(ind.periodesDeficitaires).toBe(0);
  });
});

describe("synthèse mensuelle", () => {
  it("reprend la phrase du classeur, écarts inclus", () => {
    const texte = syntheseMensuelle(
      mois({
        periode: "Juin-Juillet 2025",
        soldeOuverture: 4282,
        recettesReelles: 0,
        recettesBudget: 0,
        depensesReelles: 0,
        depensesBudget: 0,
        soldeCloture: 4282,
      })
    );
    expect(texte).toBe(
      "Le tableau ci-dessous compare le budget prévisionnel à la période Juin-Juillet 2025. " +
        "Solde d'ouverture : 4282 DT. " +
        "Recettes réelles : 0 DT (budget : 0 DT, écart de +0 DT). " +
        "Dépenses réelles : 0 DT (budget : 0 DT, écart de +0 DT). " +
        "Solde de clôture : 4282 DT."
    );
  });

  it("signe les écarts négatifs", () => {
    const texte = syntheseMensuelle(
      mois({ periode: "Test", recettesReelles: 100, recettesBudget: 150 })
    );
    expect(texte).toContain("écart de -50 DT");
  });
});

describe("points forts et points faibles", () => {
  const sain = indicateursExercice([
    mois({ recettesReelles: 1000, depensesReelles: 500, recettesBudget: 1000, depensesBudget: 500, soldeCloture: 500 }),
  ]);
  const tendu = indicateursExercice([
    mois({ recettesReelles: 1000, depensesReelles: 950, recettesBudget: 660, depensesBudget: 60, soldeCloture: -10 }),
  ]);

  it("salue une trésorerie qui n'est jamais devenue négative", () => {
    expect(
      pointsForts(sain, null).some((c) => c.texte.includes("jamais devenu négatif"))
    ).toBe(true);
  });

  it("ne cite pas de croissance sans mandat précédent connu", () => {
    expect(pointsForts(sain, null).some((c) => c.texte.includes("Croissance"))).toBe(false);
  });

  it("cite le taux de croissance quand le mandat précédent est connu", () => {
    const forts = pointsForts(sain, 0.5);
    expect(forts.some((c) => c.texte.includes("50 %"))).toBe(true);
  });

  it("signale un taux de charges proche du seuil critique", () => {
    expect(tendu.tauxDeCharges).toBeGreaterThanOrEqual(SEUIL_ALERTE_TAUX_CHARGES);
    expect(pointsFaibles(tendu).some((c) => c.texte.includes("seuil critique"))).toBe(true);
  });

  it("signale un dépassement budgétaire sur les dépenses", () => {
    expect(pointsFaibles(tendu).some((c) => c.texte.includes("Dépassement budgétaire"))).toBe(
      true
    );
  });

  it("ne signale rien de faux sur un exercice sain", () => {
    expect(pointsFaibles(sain)).toEqual([]);
  });
});

describe("variation relative", () => {
  it("calcule la variation entre deux montants", () => {
    expect(variation(150, 100)).toBe(0.5);
    expect(variation(50, 100)).toBe(-0.5);
  });

  it("ne calcule rien depuis une base nulle ou inconnue", () => {
    expect(variation(100, 0)).toBeNull();
    expect(variation(100, null)).toBeNull();
  });
});
