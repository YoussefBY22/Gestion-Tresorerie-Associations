import { describe, expect, it } from "vitest";
import { construireFactureAvoir } from "./facture-avoir";
import { rendrePdf } from "../rendu";

const base = {
  reference: "AV001-2627",
  factureNumero: "F-2627-001",
  factureDate: new Date(2026, 7, 21),
  factureMontantHT: 1200,
  client: "Société Alpha",
  montantHT: 200,
  tauxTVA: 19,
  motif: "Prestation de formation finalement non réalisée",
  dateEmission: new Date(2026, 9, 8),
  annulationTotale: false,
  mandat: "2026-2027",
  emetteur: "Youssef Ben Youssef",
};

/** Texte de tous les blocs, pour chercher dedans sans dépendre de la forme. */
function texteDe(structure: ReturnType<typeof construireFactureAvoir>): string {
  return JSON.stringify(structure);
}

describe("construireFactureAvoir", () => {
  it("nomme la facture corrigée, pas seulement l'avoir", () => {
    // Un avoir se lit à côté de sa facture : sans son numéro, la pièce est
    // inexploitable à la relecture.
    const texte = texteDe(construireFactureAvoir(base));
    expect(texte).toContain("F-2627-001");
    expect(texte).toContain("AV001-2627");
  });

  it("imprime le motif", () => {
    expect(texteDe(construireFactureAvoir(base))).toContain(
      "Prestation de formation finalement non réalisée"
    );
  });

  it("distingue l'annulation totale de la réduction partielle", () => {
    expect(texteDe(construireFactureAvoir(base))).toContain(
      "Réduction partielle"
    );
    expect(
      texteDe(
        construireFactureAvoir({
          ...base,
          montantHT: 1200,
          annulationTotale: true,
        })
      )
    ).toContain("Annulation totale");
  });

  it("écrit les montants en positif, le sens étant porté par le libellé", () => {
    // Un PDF rempli de nombres négatifs se lit mal et invite aux erreurs de
    // recopie ; la convention de signe vit dans le calcul.
    const texte = texteDe(construireFactureAvoir(base));
    expect(texte).toContain("200,000 DT");
    expect(texte).not.toContain("-200,000");
    expect(texte).toContain("à déduire");
  });

  it("applique le taux de TVA de la facture d'origine", () => {
    expect(texteDe(construireFactureAvoir({ ...base, tauxTVA: 7 }))).toContain(
      "14,000 DT"
    );
  });

  it("dit que le droit de timbre n'est pas restitué", () => {
    // Le timbre est acquitté à l'émission de la facture ; l'annuler ne le
    // rend pas. Le taire exposerait à une erreur de déclaration.
    expect(texteDe(construireFactureAvoir(base))).toMatch(/timbre.*n'est pas restitué/i);
  });

  it("produit un PDF valide", async () => {
    const pdf = await rendrePdf(construireFactureAvoir(base));
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  }, 60_000);
});
