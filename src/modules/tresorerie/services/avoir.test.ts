import { describe, expect, it } from "vitest";
import {
  annuleEntierement,
  resteACrediter,
  totaliserAvoirs,
  totauxAvoir,
  verifierAvoir,
} from "./avoir";

const facture = { montantHT: 1000, tauxTVA: 19 };

describe("resteACrediter", () => {
  it("rend le HT entier quand aucun avoir n'a été émis", () => {
    expect(resteACrediter(facture)).toBe(1000);
  });

  it("retire les avoirs déjà émis", () => {
    expect(resteACrediter({ ...facture, dejaCredite: 300 })).toBe(700);
  });

  it("ne descend jamais sous zéro", () => {
    // Une incohérence en base ne doit pas produire un reste négatif, qui
    // ferait passer un avoir pour possible.
    expect(resteACrediter({ ...facture, dejaCredite: 1200 })).toBe(0);
  });
});

describe("verifierAvoir", () => {
  it("accepte un avoir partiel", () => {
    expect(verifierAvoir(facture, 400).possible).toBe(true);
  });

  it("accepte un avoir qui solde exactement la facture", () => {
    expect(verifierAvoir(facture, 1000).possible).toBe(true);
  });

  it("refuse de rendre plus que facturé", () => {
    // Sans ce garde-fou, on inscrirait une recette négative sans opération.
    const { possible, raison } = verifierAvoir(facture, 1200);
    expect(possible).toBe(false);
    expect(raison).toContain("1000,000 DT");
  });

  it("compte les avoirs déjà émis dans le plafond", () => {
    // Deux avoirs partiels ne doivent pas, ensemble, excéder la facture.
    const dejaVu = { ...facture, dejaCredite: 700 };
    expect(verifierAvoir(dejaVu, 300).possible).toBe(true);
    const { possible, raison } = verifierAvoir(dejaVu, 400);
    expect(possible).toBe(false);
    expect(raison).toContain("300,000 DT");
  });

  it("refuse une facture déjà entièrement créditée", () => {
    const { possible, raison } = verifierAvoir(
      { ...facture, dejaCredite: 1000 },
      10
    );
    expect(possible).toBe(false);
    expect(raison).toContain("entièrement créditée");
  });

  it("refuse un montant nul ou négatif", () => {
    expect(verifierAvoir(facture, 0).possible).toBe(false);
    expect(verifierAvoir(facture, -50).possible).toBe(false);
  });

  it("tolère un millime d'arrondi sans laisser passer un dépassement", () => {
    expect(verifierAvoir(facture, 1000.0004).possible).toBe(true);
    expect(verifierAvoir(facture, 1000.01).possible).toBe(false);
  });
});

describe("totauxAvoir", () => {
  it("reprend le taux de TVA de la facture d'origine", () => {
    // Un avoir corrige une opération précise : au taux courant, une facture
    // émise sous un ancien taux se corrigerait de travers.
    expect(totauxAvoir({ montantHT: 1000, tauxTVA: 7 }, 1000).tva).toBe(70);
    expect(totauxAvoir(facture, 1000).tva).toBe(190);
  });

  it("ne rend pas le timbre fiscal", () => {
    // Le droit de timbre est acquitté à l'émission ; l'annulation ne le
    // restitue pas. D'où un TTC qui vaut HT + TVA, sans le 1 DT.
    const t = totauxAvoir(facture, 1000);
    expect(t.timbreFiscal).toBe(0);
    expect(t.montantTTC).toBe(1190);
  });

  it("arrondit au millime", () => {
    const t = totauxAvoir({ montantHT: 333.333, tauxTVA: 19 }, 333.333);
    expect(t.tva).toBe(63.333);
    expect(t.montantTTC).toBe(396.666);
  });
});

describe("annuleEntierement", () => {
  it("reconnaît l'avoir qui solde la facture", () => {
    expect(annuleEntierement(facture, 1000)).toBe(true);
    expect(annuleEntierement(facture, 999)).toBe(false);
  });

  it("tient compte de ce qui a déjà été crédité", () => {
    expect(annuleEntierement({ ...facture, dejaCredite: 600 }, 400)).toBe(true);
  });
});

describe("totaliserAvoirs", () => {
  it("additionne HT et TVA de tous les avoirs du mois", () => {
    const t = totaliserAvoirs([
      { montantHT: 1000, tauxTVA: 19 },
      { montantHT: 500, tauxTVA: 7 },
    ]);
    expect(t.totalHT).toBe(1500);
    expect(t.totalTVA).toBe(225);
    expect(t.nombre).toBe(2);
  });

  it("rend des totaux nuls sans avoir", () => {
    expect(totaliserAvoirs([])).toEqual({
      totalHT: 0,
      totalTVA: 0,
      nombre: 0,
    });
  });
});
