import { describe, expect, it } from "vitest";
import {
  avertissementDepassement,
  etatFacturationProjet,
  montantProposeFacture,
} from "./facturation-projet";

describe("etatFacturationProjet", () => {
  it("rend le CA signé entier quand rien n'est facturé", () => {
    const e = etatFacturationProjet({ caSigne: 4500, facturesHT: [] });
    expect(e.resteAFacturer).toBe(4500);
    expect(e.dejaFacture).toBe(0);
    expect(e.solde).toBe(false);
  });

  it("retranche les factures déjà émises", () => {
    const e = etatFacturationProjet({
      caSigne: 4500,
      facturesHT: [1200, 800],
    });
    expect(e.dejaFacture).toBe(2000);
    expect(e.resteAFacturer).toBe(2500);
  });

  it("rend à facturer ce qu'un avoir a crédité", () => {
    // Une facture annulée par un avoir n'a pas consommé le CA : sans cette
    // déduction, la facture de remplacement paraîtrait dépasser le signé.
    const e = etatFacturationProjet({
      caSigne: 4500,
      facturesHT: [1200, 800],
      avoirsHT: [800],
    });
    expect(e.credite).toBe(800);
    expect(e.netFacture).toBe(1200);
    expect(e.resteAFacturer).toBe(3300);
  });

  it("marque le projet soldé quand le CA signé est atteint", () => {
    const e = etatFacturationProjet({ caSigne: 4500, facturesHT: [4500] });
    expect(e.solde).toBe(true);
    expect(e.resteAFacturer).toBe(0);
    expect(e.depassement).toBe(0);
  });

  it("ne rend jamais un reste négatif, et nomme le dépassement", () => {
    const e = etatFacturationProjet({ caSigne: 4000, facturesHT: [4500] });
    expect(e.resteAFacturer).toBe(0);
    expect(e.depassement).toBe(500);
    expect(e.solde).toBe(false);
  });

  it("compte à la millime", () => {
    const e = etatFacturationProjet({
      caSigne: 1000,
      facturesHT: [333.333, 333.333],
    });
    expect(e.dejaFacture).toBe(666.666);
    expect(e.resteAFacturer).toBe(333.334);
  });

  it("rend null, et non zéro, sans CA signé de référence", () => {
    // Un projet signé avant l'application n'a pas de référence : « reste 0 DT »
    // serait un chiffre inventé.
    for (const caSigne of [null, undefined, 0]) {
      const e = etatFacturationProjet({ caSigne, facturesHT: [1200] });
      expect(e.resteAFacturer).toBeNull();
      expect(e.caSigne).toBeNull();
      // Le facturé reste connu, lui.
      expect(e.netFacture).toBe(1200);
    }
  });
});

describe("montantProposeFacture", () => {
  it("propose le reste à facturer", () => {
    const e = etatFacturationProjet({ caSigne: 4500, facturesHT: [1200] });
    expect(montantProposeFacture(e)).toBe(3300);
  });

  it("ne propose rien sur un projet soldé", () => {
    const e = etatFacturationProjet({ caSigne: 4500, facturesHT: [4500] });
    expect(montantProposeFacture(e)).toBeNull();
  });

  it("ne propose rien sans CA signé", () => {
    const e = etatFacturationProjet({ caSigne: null, facturesHT: [] });
    expect(montantProposeFacture(e)).toBeNull();
  });
});

describe("avertissementDepassement", () => {
  const etat = etatFacturationProjet({ caSigne: 4500, facturesHT: [1200] });

  it("se tait pour un montant dans le reste", () => {
    expect(avertissementDepassement(etat, 3300)).toBeNull();
    expect(avertissementDepassement(etat, 1000)).toBeNull();
  });

  it("nomme le reste et le CA signé au-delà", () => {
    const a = avertissementDepassement(etat, 3500);
    expect(a).toMatch(/3300,000 DT/);
    expect(a).toMatch(/4500,000 DT/);
    expect(a).toMatch(/avenant/);
  });

  it("dit autrement qu'un projet soldé est déjà entièrement facturé", () => {
    const solde = etatFacturationProjet({ caSigne: 4500, facturesHT: [4500] });
    expect(avertissementDepassement(solde, 100)).toMatch(
      /déjà entièrement facturé/
    );
  });

  it("se tait sans CA signé : il n'y a rien à dépasser", () => {
    const sans = etatFacturationProjet({ caSigne: null, facturesHT: [] });
    expect(avertissementDepassement(sans, 10000)).toBeNull();
  });

  it("tolère un millime d'arrondi de saisie", () => {
    expect(avertissementDepassement(etat, 3300.0004)).toBeNull();
  });
});
