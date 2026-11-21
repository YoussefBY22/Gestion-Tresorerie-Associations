import { describe, expect, it } from "vitest";
import {
  construireBonCommande,
  type DonneesBonCommande,
} from "./bon-commande";

const base: DonneesBonCommande = {
  reference: "BC001-2627",
  fournisseur: "Imprimerie du Lac",
  objet: "Impression des kakémonos du forum",
  lignes: [
    { designation: "Kakémono 80 × 200", quantite: 4, prixUnitaire: 120 },
    { designation: "Transport", quantite: 1, prixUnitaire: 40 },
  ],
  tauxTVA: 19,
  dateEmission: new Date("2026-10-16"),
  mandat: "2026-2027",
};

function texte(d: DonneesBonCommande): string {
  return JSON.stringify(construireBonCommande(d));
}

describe("construireBonCommande", () => {
  it("porte le titre et la référence", () => {
    const s = construireBonCommande(base);
    expect(s.titre).toBe("Bon de commande");
    expect(s.reference).toBe("BC001-2627");
  });

  it("détaille chaque ligne avec sa quantité et son montant", () => {
    const t = texte(base);
    expect(t).toContain("Kakémono 80 × 200");
    expect(t).toContain("480,000 DT");
    expect(t).toContain("Transport");
  });

  it("totalise HT, TVA et TTC engagé", () => {
    const s = construireBonCommande(base);
    const total = s.blocs.find((b) => b.type === "total");
    const items = (total as { items: { label: string; valeur: string; fort?: boolean }[] }).items;
    expect(items[0].valeur).toBe("520,000 DT");
    expect(items[1].valeur).toBe("98,800 DT");
    expect(items[2].valeur).toBe("618,800 DT");
    expect(items[2].fort).toBe(true);
  });

  it("dit que le bon n'est pas une facture", () => {
    // Un fournisseur qui confond réclame le paiement d'une pièce qui n'en
    // est pas une.
    expect(texte(base)).toMatch(/ni une facture/);
  });

  it("imprime la livraison attendue quand elle est connue", () => {
    expect(texte(base)).not.toContain("Livraison attendue");
    expect(
      texte({ ...base, livraisonPrevue: new Date("2026-11-02") })
    ).toContain("02/11/2026");
  });

  it("imprime l'imputation budgétaire quand elle est donnée", () => {
    expect(texte({ ...base, sectionBudget: "Communication" })).toContain(
      "Communication"
    );
  });

  it("omet les rubriques fournisseur absentes plutôt que de les vider", () => {
    const t = texte(base);
    expect(t).not.toContain("Matricule fiscal");
    expect(
      texte({ ...base, fournisseurMatriculeFiscal: "1234567A/B/C/000" })
    ).toContain("1234567A/B/C/000");
  });

  it("n'ajoute la signature que si un émetteur est connu", () => {
    expect(
      construireBonCommande(base).blocs.some((b) => b.type === "signatures")
    ).toBe(false);
    expect(
      construireBonCommande({ ...base, emetteur: "Youssef" }).blocs.some(
        (b) => b.type === "signatures"
      )
    ).toBe(true);
  });
});
