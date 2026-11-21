import { describe, expect, it } from "vitest";
import {
  engagementsParSection,
  montantLigne,
  peutChangerStatut,
  totalEngage,
  totauxBonCommande,
  verifierBonCommande,
} from "./bon-commande";

const ligne = (prixUnitaire: number, quantite = 1) => ({
  designation: "Article",
  quantite,
  prixUnitaire,
});

describe("totauxBonCommande", () => {
  it("additionne les lignes et applique la TVA", () => {
    const t = totauxBonCommande([ligne(100, 3), ligne(50)], 19);
    expect(t.totalHT).toBe(350);
    expect(t.tva).toBe(66.5);
    expect(t.totalTTC).toBe(416.5);
  });

  it("n'ajoute aucun droit de timbre", () => {
    // Le timbre est dû par l'émetteur d'une facture ; un bon n'en est pas une.
    const t = totauxBonCommande([ligne(100)], 0);
    expect(t.totalTTC).toBe(100);
  });

  it("compte à la millime", () => {
    expect(montantLigne(ligne(33.333, 3))).toBe(99.999);
    expect(totauxBonCommande([ligne(33.333, 3)], 0).totalHT).toBe(99.999);
  });

  it("ignore une quantité ou un prix négatif plutôt que de soustraire", () => {
    expect(montantLigne(ligne(-100, 2))).toBe(0);
    expect(montantLigne(ligne(100, -2))).toBe(0);
  });
});

describe("verifierBonCommande", () => {
  const bon = {
    fournisseur: "Imprimerie du Lac",
    objet: "Impression des kakémonos",
    lignes: [ligne(120, 2)],
  };

  it("accepte un bon complet", () => {
    expect(verifierBonCommande(bon).possible).toBe(true);
  });

  it("refuse un engagement sans fournisseur", () => {
    const v = verifierBonCommande({ ...bon, fournisseur: "   " });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/fournisseur/);
  });

  it("refuse un objet trop court pour justifier la dépense", () => {
    const v = verifierBonCommande({ ...bon, objet: "x" });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/objet/);
  });

  it("refuse un bon sans ligne", () => {
    const v = verifierBonCommande({ ...bon, lignes: [] });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/n'engage rien/);
  });

  it("refuse un total nul, qui trahit des prix oubliés", () => {
    const v = verifierBonCommande({ ...bon, lignes: [ligne(0, 5)] });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/nul/);
  });

  it("refuse un taux de TVA négatif", () => {
    expect(verifierBonCommande({ ...bon, tauxTVA: -1 }).possible).toBe(false);
  });
});

describe("peutChangerStatut", () => {
  it("laisse réceptionner ou annuler un bon émis", () => {
    expect(peutChangerStatut("EMIS", "RECEPTIONNE").possible).toBe(true);
    expect(peutChangerStatut("EMIS", "ANNULE").possible).toBe(true);
  });

  it("refuse de réceptionner deux fois", () => {
    const v = peutChangerStatut("RECEPTIONNE", "RECEPTIONNE");
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/déjà réceptionné/);
  });

  it("refuse d'annuler un bon réceptionné, et dit quoi faire", () => {
    const v = peutChangerStatut("RECEPTIONNE", "ANNULE");
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/Émettez-en un nouveau/);
  });

  it("refuse de revenir sur une annulation", () => {
    expect(peutChangerStatut("ANNULE", "RECEPTIONNE").possible).toBe(false);
    expect(peutChangerStatut("ANNULE", "ANNULE").possible).toBe(false);
  });
});

describe("engagementsParSection", () => {
  const bons = [
    {
      sectionBudget: "Communication",
      statut: "EMIS",
      lignes: [ligne(100)],
      tauxTVA: 0,
    },
    {
      sectionBudget: "Communication",
      statut: "EMIS",
      lignes: [ligne(250)],
      tauxTVA: 0,
    },
    {
      sectionBudget: "Événementiel",
      statut: "EMIS",
      lignes: [ligne(500)],
      tauxTVA: 0,
    },
    // Réceptionné : sa facture porte désormais la dépense.
    {
      sectionBudget: "Communication",
      statut: "RECEPTIONNE",
      lignes: [ligne(9000)],
      tauxTVA: 0,
    },
    { sectionBudget: "Communication", statut: "ANNULE", lignes: [ligne(7000)] },
  ];

  it("totalise par section, du plus engagé au moins engagé", () => {
    const e = engagementsParSection(bons);
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({ section: "Événementiel", engage: 500, nombre: 1 });
    expect(e[1]).toEqual({ section: "Communication", engage: 350, nombre: 2 });
  });

  it("ne compte ni les bons réceptionnés ni les annulés", () => {
    // Les compter ferait apparaître la dépense deux fois.
    expect(totalEngage(bons)).toBe(850);
  });

  it("range sous « Sans section » ce qui n'en porte pas", () => {
    const e = engagementsParSection([
      { sectionBudget: null, statut: "EMIS", lignes: [ligne(40)], tauxTVA: 0 },
      { sectionBudget: "  ", statut: "EMIS", lignes: [ligne(60)], tauxTVA: 0 },
    ]);
    expect(e).toEqual([{ section: "Sans section", engage: 100, nombre: 2 }]);
  });

  it("rend une liste vide quand rien n'est engagé", () => {
    expect(engagementsParSection([])).toEqual([]);
    expect(totalEngage([])).toBe(0);
  });
});
