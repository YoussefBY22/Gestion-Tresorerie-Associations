import { describe, it, expect } from "vitest";
import {
  calculerSolde,
  realiseParLigne,
  fluxSansJustificatif,
  numeroFacture,
  construireRappelsFinanciers,
  type FluxPourCalcul,
} from "./finances";

const flux: FluxPourCalcul[] = [
  { type: "ENCAISSEMENT", montant: 2000, categorie: "Projets", justificatifRef: "F-2526-001" },
  { type: "DECAISSEMENT", montant: 350.5, categorie: "Événementiel", justificatifRef: "recu-01" },
  { type: "DECAISSEMENT", montant: 100, categorie: "Événementiel" },
];

describe("Finances — solde et budget", () => {
  it("solde = initial + encaissements − décaissements", () => {
    expect(calculerSolde(500, flux)).toBe(2049.5);
    expect(calculerSolde(0, [])).toBe(0);
  });

  it("réalisé par ligne : produits ← encaissements, charges ← décaissements", () => {
    const lignes = realiseParLigne(
      [
        { categorie: "Projets", type: "PRODUIT", prevu: 4000 },
        { categorie: "Événementiel", type: "CHARGE", prevu: 400 },
      ],
      flux
    );
    expect(lignes[0]).toMatchObject({ realise: 2000, ecart: -2000, depassement: false });
    // 350.5 + 100 = 450.5 > 400 → dépassement de charge
    expect(lignes[1]).toMatchObject({ realise: 450.5, ecart: 50.5, depassement: true });
  });

  it("compte les flux sans justificatif (bloquant clôture mensuelle)", () => {
    expect(fluxSansJustificatif(flux)).toBe(1);
  });

  it("numérotation continue des factures par mandat", () => {
    expect(numeroFacture("2025-2026", 1)).toBe("F-2526-001");
    expect(numeroFacture("2025-2026", 42)).toBe("F-2526-042");
  });
});

describe("Finances — rappels cron", () => {
  const maintenant = new Date("2026-07-11");
  const j = (n: number) => new Date(maintenant.getTime() + n * 86_400_000);

  it("échéance fiscale à J-7 → rappel critique avec clé datée", () => {
    const rappels = construireRappelsFinanciers(
      [{ id: "tva", libelle: "TVA juin", prochaineEcheance: j(5) }],
      [],
      maintenant
    );
    expect(rappels).toHaveLength(1);
    expect(rappels[0].cle).toBe(`fiscal-j7:tva:${j(5).toISOString().slice(0, 10)}`);
    expect(rappels[0].critique).toBe(true);
  });

  it("échéance fiscale lointaine ou passée → pas de rappel J-7", () => {
    expect(
      construireRappelsFinanciers(
        [
          { id: "a", libelle: "IS", prochaineEcheance: j(20) },
          { id: "b", libelle: "TVA", prochaineEcheance: j(-1) },
        ],
        [],
        maintenant
      )
    ).toHaveLength(0);
  });

  it("facture émise échue → alerte ; payée ou non échue → rien", () => {
    const rappels = construireRappelsFinanciers(
      [],
      [
        { id: "f1", numero: "F-2526-001", statut: "EMISE", echeance: j(-3) },
        { id: "f2", numero: "F-2526-002", statut: "PAYEE", echeance: j(-3) },
        { id: "f3", numero: "F-2526-003", statut: "EMISE", echeance: j(3) },
      ],
      maintenant
    );
    expect(rappels).toHaveLength(1);
    expect(rappels[0].cle).toBe("facture-retard:f1");
  });
});
