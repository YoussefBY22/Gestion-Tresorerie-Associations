import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  construireBudgetPrevisionnel,
  type DonneesBudgetPrevisionnel,
} from "./budget-previsionnel";
import { rendrePdf } from "../rendu";

const periodes = [
  { cle: "2025-08", libelle: "Août 2025" },
  { cle: "2025-09", libelle: "Septembre 2025" },
  { cle: "2025-10", libelle: "Octobre 2025" },
];

const base: DonneesBudgetPrevisionnel = {
  reference: "BUDG-2526",
  mandat: "2025-2026",
  periodes,
  soldeInitial: 4282,
  version: 1,
  verrouille: true,
  etabliLe: new Date(2025, 7, 1),
  emetteur: "Salim Brahem",
  sections: [
    {
      libelle: "Charges fixes",
      sens: "DEPENSE",
      lignes: [
        { libelle: "Comptable", valeursMensuelles: [0, 500, 0], aJustificatif: true },
        { libelle: "Domiciliation", valeursMensuelles: [0, 600, 0], aJustificatif: false },
      ],
    },
    {
      libelle: "Recettes d'exploitation",
      sens: "RECETTE",
      lignes: [
        { libelle: "Projet Site Web", valeursMensuelles: [475, 200, 600], aJustificatif: false },
      ],
    },
  ],
};

function tableaux(d: DonneesBudgetPrevisionnel) {
  return construireBudgetPrevisionnel(d).blocs.filter((b) => b.type === "tableau");
}

describe("budget prévisionnel — structure", () => {
  it("se rend en paysage : la place manque en portrait pour douze colonnes", () => {
    expect(construireBudgetPrevisionnel(base).orientation).toBe("paysage");
  });

  it("calcule le sous-total de chaque section", () => {
    const t = tableaux(base);
    // Premier tableau = charges fixes (2 lignes + 1 sous-total).
    const chargesFixes = t[0];
    const lignes = "lignes" in chargesFixes ? chargesFixes.lignes : [];
    expect(lignes[2]).toEqual(["Sous-total charges fixes", "0", "1 100", "0", ""]);
  });

  it("calcule le total dépenses et le total recettes", () => {
    const t = tableaux(base);
    const totalDepenses = t.find((x) =>
      "lignes" in x ? x.lignes[0]?.[0] === "TOTAL DÉPENSES BUDGET" : false
    );
    const totalRecettes = t.find((x) =>
      "lignes" in x ? x.lignes[0]?.[0] === "TOTAL RECETTES BUDGET" : false
    );
    expect(totalDepenses && "lignes" in totalDepenses ? totalDepenses.lignes[0] : []).toEqual([
      "TOTAL DÉPENSES BUDGET", "0", "1 100", "0", "",
    ]);
    expect(totalRecettes && "lignes" in totalRecettes ? totalRecettes.lignes[0] : []).toEqual([
      "TOTAL RECETTES BUDGET", "475", "200", "600", "",
    ]);
  });

  it("cumule le solde de trésorerie budgétaire à partir du solde d'ouverture", () => {
    const t = tableaux(base);
    const bilanEtSolde = t[t.length - 1];
    const lignes = "lignes" in bilanEtSolde ? bilanEtSolde.lignes : [];
    // Bilan : 475, -900, 600. Solde cumulé : 4282+475=4757, -900=3857, +600=4457.
    expect(lignes[0]).toEqual(["Bilan mensuel (Recettes − Dépenses)", "475", "-900", "600", ""]);
    expect(lignes[1]).toEqual(["Solde de trésorerie budgétaire", "4 757", "3 857", "4 457", ""]);
  });

  it("marque les postes qui ont un justificatif", () => {
    const t = tableaux(base);
    const chargesFixes = t[0];
    const lignes = "lignes" in chargesFixes ? chargesFixes.lignes : [];
    expect(lignes[0]).toEqual(["Comptable", "0", "500", "0", "Oui"]);
    expect(lignes[1]).toEqual(["Domiciliation", "0", "600", "0", "—"]);
  });

  it("filigrane un budget non encore verrouillé comme brouillon", () => {
    expect(construireBudgetPrevisionnel({ ...base, verrouille: false }).filigrane).toBe(
      "BROUILLON"
    );
    expect(construireBudgetPrevisionnel(base).filigrane).toBeUndefined();
  });

  it("se rend en PDF sans échouer, y compris en paysage", async () => {
    const octets = await rendrePdf(construireBudgetPrevisionnel(base));
    const relu = await PDFDocument.load(octets);
    expect(relu.getTitle()).toContain("BUDG-2526");
    const page = relu.getPage(0);
    // Paysage : la largeur dépasse la hauteur.
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });
});
