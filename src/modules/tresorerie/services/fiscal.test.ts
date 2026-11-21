import { describe, expect, it } from "vitest";
import {
  SEUIL_RAS_GENERAL_DT,
  TIMBRE_FISCAL_DT,
  calculerDeclaration,
  estSoumisRAS,
  libelleMois,
  moisPrecedent,
  montantRAS,
  tauxRAS,
  totaliserEmises,
  totaliserRecues,
  ttcDe,
  tvaDe,
} from "./fiscal";

describe("TVA et TTC", () => {
  it("calcule la TVA au millime", () => {
    expect(tvaDe(1000, 19)).toBe(190);
    expect(tvaDe(1423.5, 19)).toBe(270.465);
  });

  it("ajoute le timbre fiscal au TTC", () => {
    expect(ttcDe(1000, 19)).toBe(1191); // 1000 + 190 + 1
    expect(ttcDe(1000, 19, 0)).toBe(1190);
  });
});

describe("tauxRAS", () => {
  it("applique le taux du type de prestataire", () => {
    expect(tauxRAS("HONORAIRES_REEL", 500)).toBe(0.03);
    expect(tauxRAS("HONORAIRES_FORFAIT", 500)).toBe(0.1);
    expect(tauxRAS("LOYERS_IMMEUBLES", 800)).toBe(0.1);
  });

  it("n'applique un taux à seuil qu'au-dessus strictement du seuil", () => {
    expect(tauxRAS("MARCHE_15", 1000)).toBe(0); // égal au seuil : pas de retenue
    expect(tauxRAS("MARCHE_15", 1000.001)).toBe(0.01);
    expect(tauxRAS("MARCHE_35", 2000)).toBe(0.015);
  });

  it("retombe sur 0 plutôt que d'échouer sur un type inconnu", () => {
    expect(tauxRAS("TYPE_FANTOME", 5000)).toBe(0);
    expect(tauxRAS(null, 5000)).toBe(0);
    expect(tauxRAS(undefined, 5000)).toBe(0);
  });
});

describe("estSoumisRAS", () => {
  it("retient toute facture au-delà du seuil général", () => {
    expect(estSoumisRAS({ montantTTC: SEUIL_RAS_GENERAL_DT })).toBe(true);
    expect(estSoumisRAS({ montantTTC: 999 })).toBe(false);
  });

  it("retient un prestataire configuré même sous le seuil", () => {
    // Un honoraire de 200 DT reste soumis : c'est le type qui déclenche.
    expect(
      estSoumisRAS({ montantTTC: 200, typePrestataire: "HONORAIRES_REEL" })
    ).toBe(true);
  });
});

describe("montantRAS", () => {
  it("retranche le timbre fiscal de l'assiette", () => {
    // (501 − 1) × 3 % = 15. Le timbre n'est pas une contrepartie du service,
    // il ne supporte pas la retenue.
    expect(montantRAS({ montantTTC: 501, typePrestataire: "HONORAIRES_REEL" })).toBe(15);
  });

  it("ne retient rien sous le seuil du type", () => {
    expect(montantRAS({ montantTTC: 900, typePrestataire: "MARCHE_15" })).toBe(0);
  });

  it("ne retient rien sur une facture ni typée ni au-dessus du seuil", () => {
    expect(montantRAS({ montantTTC: 500 })).toBe(0);
  });

  it("arrondit au millime", () => {
    const r = montantRAS({ montantTTC: 1234.567, typePrestataire: "MARCHE_35" });
    expect(r).toBe(Number(r.toFixed(3)));
  });
});

describe("totaux", () => {
  it("totalise les factures émises avec un timbre par facture", () => {
    const t = totaliserEmises([
      { montantHT: 1000, tauxTVA: 19 },
      { montantHT: 500, tauxTVA: 19 },
    ]);
    expect(t.totalHT).toBe(1500);
    expect(t.totalTVA).toBe(285);
    expect(t.totalTimbres).toBe(2 * TIMBRE_FISCAL_DT);
    expect(t.totalTTC).toBe(1787);
  });

  it("exclut de la déduction une TVA non récupérable", () => {
    const t = totaliserRecues([
      { montantHT: 1000, tauxTVA: 19, montantTTC: 1191 },
      {
        montantHT: 1000,
        tauxTVA: 19,
        montantTTC: 1191,
        tvaDeductible: false,
      },
    ]);
    // Les deux factures sont payées, mais une seule ouvre droit à déduction.
    expect(t.totalHT).toBe(2000);
    expect(t.totalTVA).toBe(190);
  });
});

describe("calculerDeclaration", () => {
  const emise = (ht: number) => ({ montantHT: ht, tauxTVA: 19 });
  const recue = (ht: number, extra = {}) => ({
    montantHT: ht,
    tauxTVA: 19,
    montantTTC: ttcDe(ht, 19),
    ...extra,
  });

  it("solde positif : TVA à payer", () => {
    const d = calculerDeclaration({
      facturesEmises: [emise(10000)],
      facturesRecues: [recue(1000)],
    });
    expect(d.soldeTVA).toBe(1900 - 190);
    expect(d.nature).toBe("A_PAYER");
    expect(d.tvaAPayer).toBe(1710);
    expect(d.tvaAReporter).toBe(0);
  });

  it("solde négatif : crédit à reporter, rien à payer au titre de la TVA", () => {
    const d = calculerDeclaration({
      facturesEmises: [emise(1000)],
      facturesRecues: [recue(5000)],
    });
    expect(d.nature).toBe("A_REPORTER");
    expect(d.tvaAPayer).toBe(0);
    expect(d.tvaAReporter).toBeLessThan(0);
  });

  it("impute le crédit du mois précédent", () => {
    // 1900 de TVA collectée, 500 de crédit reporté → 1400 à payer.
    const d = calculerDeclaration({
      facturesEmises: [emise(10000)],
      facturesRecues: [],
      reportPrecedent: -500,
    });
    expect(d.soldeApresReport).toBe(1400);
    expect(d.tvaAPayer).toBe(1400);
  });

  it("bascule en report quand le crédit dépasse la TVA du mois", () => {
    const d = calculerDeclaration({
      facturesEmises: [emise(1000)],
      facturesRecues: [],
      reportPrecedent: -500,
    });
    expect(d.nature).toBe("A_REPORTER");
    expect(d.tvaAReporter).toBe(-310); // 190 − 500
  });

  it("déduit la TVA sur agios bancaires", () => {
    const sans = calculerDeclaration({
      facturesEmises: [emise(1000)],
      facturesRecues: [],
    });
    const avec = calculerDeclaration({
      facturesEmises: [emise(1000)],
      facturesRecues: [],
      agios: [{ montantHT: 100 }],
    });
    expect(sans.soldeTVA - avec.soldeTVA).toBe(19);
  });

  it("qualifie de néant un solde exactement nul", () => {
    const d = calculerDeclaration({
      facturesEmises: [emise(1000)],
      facturesRecues: [],
      reportPrecedent: -190,
    });
    expect(d.nature).toBe("NEANT");
    expect(d.tvaAPayer).toBe(0);
    expect(d.tvaAReporter).toBe(0);
  });

  it("ajoute timbres et retenues au montant versé au Trésor", () => {
    // La retenue opérée sur le fournisseur est reversée par la JE : elle
    // s'ajoute au versement, elle ne le diminue pas.
    const d = calculerDeclaration({
      facturesEmises: [emise(10000)],
      facturesRecues: [recue(2000, { typePrestataire: "HONORAIRES_REEL" })],
    });
    const ras = montantRAS({
      montantTTC: ttcDe(2000, 19),
      typePrestataire: "HONORAIRES_REEL",
    });
    expect(d.recues.totalRAS).toBe(ras);
    expect(d.montantAPayer).toBe(
      Number((d.tvaAPayer + d.emises.totalTimbres + ras).toFixed(3))
    );
  });

  it("produit une déclaration néant sur un mois sans mouvement", () => {
    const d = calculerDeclaration({ facturesEmises: [], facturesRecues: [] });
    expect(d.nature).toBe("NEANT");
    expect(d.montantAPayer).toBe(0);
  });
});

describe("moisPrecedent", () => {
  it("recule d'un mois", () => {
    expect(moisPrecedent("2026-03")).toBe("2026-02");
  });

  it("passe l'année en janvier", () => {
    expect(moisPrecedent("2026-01")).toBe("2025-12");
  });

  it("refuse un mois illisible", () => {
    expect(() => moisPrecedent("mars")).toThrow();
  });
});

describe("libelleMois", () => {
  it("écrit le mois en toutes lettres", () => {
    expect(libelleMois("2026-02")).toBe("février 2026");
    expect(libelleMois("2026-12")).toBe("décembre 2026");
  });

  it("laisse passer une valeur inattendue sans planter", () => {
    expect(libelleMois("2026-13")).toBe("2026-13");
  });
});
