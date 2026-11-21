import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  construireRapportSynthese,
  type DonneesRapportSynthese,
} from "./rapport-synthese-periode";
import { rendrePdf } from "../rendu";

const base: DonneesRapportSynthese = {
  reference: "RAPS-01-2526",
  intitulePeriode: "Juillet à Octobre 2025",
  mandat: "2025-2026",
  arreteLe: new Date(2025, 10, 1),
  soldeOuverture: 4282,
  soldeCloture: 3982.5,
  totalRecettesReelles: 475,
  totalDepensesReelles: 774.5,
  totalRecettesBudget: 3245,
  totalDepensesBudget: 800,
  tauxRealisationRecettes: 0.1464,
  tauxRealisationDepenses: 0.9681,
  tauxDeCharges: 1.630,
  soldeMinimum: 3982.5,
  periodesDeficitaires: 2,
  repartitionRecettes: [{ categorie: "Projet/Prestation", montant: 475 }],
  repartitionDepenses: [{ categorie: "Charge Variable", montant: 774.5 }],
  pointsForts: [],
  pointsFaibles: ["Marge de trésorerie réduite : le taux de charges atteint 163 %."],
  comparaisonMandatPrecedent: { annee: "2024-2025", variationRecettes: 0.5 },
  emetteur: "Salim Brahem",
};

describe("rapport de synthèse trésorerie", () => {
  it("affiche le taux de réalisation en pourcentage", () => {
    const s = construireRapportSynthese(base);
    const tableau = s.blocs.find((b) => b.type === "tableau" && "lignes" in b && b.lignes[0]?.[0] === "Recettes");
    const lignes = tableau && "lignes" in tableau ? tableau.lignes : [];
    expect(lignes[0]?.[3]).toBe("14.6 %");
  });

  it("cite la variation par rapport au mandat précédent", () => {
    const p = construireRapportSynthese(base).blocs.find(
      (b) => b.type === "paragraphe" && "texte" in b && b.texte.includes("mandat 2024-2025")
    );
    expect(p && "texte" in p ? p.texte : "").toContain("+50 %");
  });

  it("ne prétend pas comparer sans mandat précédent connu", () => {
    const s = construireRapportSynthese({ ...base, comparaisonMandatPrecedent: undefined });
    expect(s.blocs.some((b) => b.type === "section" && "titre" in b && b.titre === "Comparaison au mandat précédent")).toBe(false);
  });

  it("omet l'encadré des points forts quand il n'y en a aucun", () => {
    const s = construireRapportSynthese(base);
    const encadres = s.blocs.filter((b) => b.type === "encadre");
    expect(encadres.some((b) => "titre" in b && b.titre === "Points forts")).toBe(false);
    expect(encadres.some((b) => "titre" in b && b.titre === "Points de vigilance")).toBe(true);
  });

  it("se rend en PDF", async () => {
    const octets = await rendrePdf(construireRapportSynthese(base));
    const relu = await PDFDocument.load(octets);
    expect(relu.getTitle()).toContain("RAPS-01-2526");
  });
});
