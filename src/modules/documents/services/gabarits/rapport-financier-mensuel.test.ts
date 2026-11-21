import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  construireRapportFinancierMensuel,
  type DonneesRapportMensuel,
} from "./rapport-financier-mensuel";
import { rendrePdf } from "../rendu";

const base: DonneesRapportMensuel = {
  reference: "RAPM-02-2526",
  libelleMois: "février 2026",
  mandat: "2025-2026",
  arreteLe: new Date(2026, 2, 3),
  soldes: {
    caisseDebut: 120,
    banqueDebut: 4300,
    caisseFin: 95,
    banqueFin: 5200,
  },
  entrees: 1500,
  sorties: 625,
  sansJustificatif: 0,
  produits: [
    { categorie: "Projets IT", prevu: 4000, realise: 1500, ecart: -2500, depassement: false },
  ],
  charges: [
    { categorie: "Événementiel", prevu: 500, realise: 625, ecart: 125, depassement: true },
  ],
  emetteur: "Mariem Cherif",
};

describe("gabarit de rapport financier mensuel", () => {
  it("porte le mois et le mandat", () => {
    const s = construireRapportFinancierMensuel(base);
    expect(s.reference).toBe("RAPM-02-2526");
    expect(s.sousTitre).toContain("février 2026");
  });

  it("met en avant la variation de trésorerie", () => {
    const total = construireRapportFinancierMensuel(base).blocs.find(
      (b) => b.type === "total"
    );
    const fort =
      total && "items" in total ? total.items.find((i) => i.fort) : undefined;
    expect(fort?.label).toBe("Variation de trésorerie");
    // 5295 − 4420 = 875
    expect(fort?.valeur).toBe("875,000 DT");
  });

  it("signale un dépassement dans le texte de la ligne", () => {
    // Un tableau imprimé n'a pas de couleur pour le dire.
    const tableaux = construireRapportFinancierMensuel(base).blocs.filter(
      (b) => b.type === "tableau"
    );
    const charges = tableaux.at(-1);
    const cellule =
      charges && "lignes" in charges ? charges.lignes[0][0] : "";
    expect(cellule).toContain("dépassement");
  });

  it("n'affiche pas de section vide quand il n'y a aucune charge", () => {
    const s = construireRapportFinancierMensuel({ ...base, charges: [] });
    const sections = s.blocs.filter((b) => b.type === "section");
    expect(sections.map((b) => ("titre" in b ? b.titre : ""))).not.toContain(
      "Charges"
    );
  });

  it("avertit des pièces manquantes seulement s'il y en a", () => {
    expect(
      construireRapportFinancierMensuel(base).blocs.some(
        (b) => b.type === "encadre"
      )
    ).toBe(false);
    const avec = construireRapportFinancierMensuel({
      ...base,
      sansJustificatif: 3,
    });
    const encadre = avec.blocs.find((b) => b.type === "encadre");
    expect(encadre && "texte" in encadre && encadre.texte).toContain("3 ");
  });

  it("se rend en PDF", async () => {
    const octets = await rendrePdf(construireRapportFinancierMensuel(base));
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBe(1);
    expect(relu.getTitle()).toContain("RAPM-02-2526");
  });
});
