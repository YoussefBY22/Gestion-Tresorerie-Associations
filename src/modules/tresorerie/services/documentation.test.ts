import { describe, expect, it } from "vitest";
import {
  compterParCategorie,
  modelesJamaisEmis,
  rapportsParMois,
  type DocumentEmis,
} from "./documentation";

const doc = (modele: string, categorie: string, iso: string): DocumentEmis => ({
  modele,
  categorie,
  emisLe: new Date(iso),
});

describe("compter par catégorie", () => {
  it("additionne les pièces de chaque famille", () => {
    expect(
      compterParCategorie([
        doc("RECU_COTISATION", "RECU", "2026-07-10"),
        doc("RECU_DON", "RECU", "2026-08-02"),
        doc("BUDGET_PREVISIONNEL", "RAPPORT", "2026-07-15"),
      ])
    ).toEqual({ RECU: 2, RAPPORT: 1 });
  });

  it("ne rend rien quand rien n'a été émis", () => {
    expect(compterParCategorie([])).toEqual({});
  });
});

describe("rapports par mois", () => {
  const periodes = [
    { cle: "2026-07", libelle: "Juillet 2026" },
    { cle: "2026-08", libelle: "Août 2026" },
    { cle: "2026-09", libelle: "Septembre 2026" },
  ];

  it("conserve les mois sans rapport, à zéro", () => {
    const serie = rapportsParMois(
      [doc("RAPPORT", "RAPPORT", "2026-07-31"), doc("RAPPORT", "RAPPORT", "2026-09-05")],
      periodes
    );
    expect(serie.map((s) => s.total)).toEqual([1, 0, 1]);
  });

  it("ignore ce qui tombe hors de la période du mandat", () => {
    const serie = rapportsParMois([doc("RAPPORT", "RAPPORT", "2025-01-05")], periodes);
    expect(serie.every((s) => s.total === 0)).toBe(true);
  });
});

describe("modèles jamais émis", () => {
  const catalogue = [
    { code: "RECU_COTISATION", libelle: "Reçu de cotisation" },
    { code: "RECU_DON", libelle: "Reçu de don" },
    { code: "FACTURE_CLIENT", libelle: "Facture client" },
  ];

  it("liste ce qu'aucune pièce n'a encore utilisé", () => {
    expect(
      modelesJamaisEmis(catalogue, [doc("RECU_COTISATION", "RECU", "2026-07-10")])
    ).toEqual([
      { code: "RECU_DON", libelle: "Reçu de don" },
      { code: "FACTURE_CLIENT", libelle: "Facture client" },
    ]);
  });

  it("ne liste rien quand tout le catalogue a servi", () => {
    const tous = catalogue.map((m) => doc(m.code, "RECU", "2026-07-10"));
    expect(modelesJamaisEmis(catalogue, tous)).toEqual([]);
  });
});
