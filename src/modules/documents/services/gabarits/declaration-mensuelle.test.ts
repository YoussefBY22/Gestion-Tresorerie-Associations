import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { construireDeclarationMensuelle } from "./declaration-mensuelle";
import { rendrePdf } from "../rendu";
import {
  LIBELLES_NATURE_TVA,
  calculerDeclaration,
  ttcDe,
} from "@/modules/tresorerie/services/fiscal";

/** Passe le résultat du calcul fiscal au gabarit, comme le fait la clôture. */
function depuisCalcul(entrees: Parameters<typeof calculerDeclaration>[0]) {
  const d = calculerDeclaration(entrees);
  return construireDeclarationMensuelle({
    reference: "DECL-02-2526",
    libelleMois: "février 2026",
    mandat: "2025-2026",
    arreteeLe: new Date(2026, 2, 5),
    emises: d.emises,
    recues: d.recues,
    agios: d.agios,
    soldeTVA: d.soldeTVA,
    reportPrecedent: d.reportPrecedent,
    soldeApresReport: d.soldeApresReport,
    natureLibelle: LIBELLES_NATURE_TVA[d.nature],
    tvaAPayer: d.tvaAPayer,
    tvaAReporter: d.tvaAReporter,
    montantAPayer: d.montantAPayer,
    emetteur: "Mariem Cherif",
  });
}

const aPayer = {
  facturesEmises: [{ montantHT: 10000, tauxTVA: 19 }],
  facturesRecues: [
    {
      montantHT: 2000,
      tauxTVA: 19,
      montantTTC: ttcDe(2000, 19),
      typePrestataire: "HONORAIRES_REEL",
    },
  ],
};

describe("gabarit de déclaration mensuelle", () => {
  it("porte le mois, le mandat et la référence", () => {
    const s = depuisCalcul(aPayer);
    expect(s.reference).toBe("DECL-02-2526");
    expect(s.sousTitre).toContain("février 2026");
    expect(s.sousTitre).toContain("2025-2026");
  });

  it("détaille les deux côtés et la liquidation", () => {
    const tableaux = depuisCalcul(aPayer).blocs.filter(
      (b) => b.type === "tableau"
    );
    // Factures émises, factures reçues, liquidation.
    expect(tableaux).toHaveLength(3);
  });

  it("met le montant à verser en avant", () => {
    const total = depuisCalcul(aPayer).blocs.find((b) => b.type === "total");
    const fort =
      total && "items" in total ? total.items.find((i) => i.fort) : undefined;
    expect(fort?.label).toBe("Montant total à verser");
  });

  it("ajoute l'encadré de crédit seulement quand il y a un report", () => {
    const avecCredit = depuisCalcul({
      facturesEmises: [{ montantHT: 100, tauxTVA: 19 }],
      facturesRecues: [
        { montantHT: 5000, tauxTVA: 19, montantTTC: ttcDe(5000, 19) },
      ],
    });
    const encadre = avecCredit.blocs.find((b) => b.type === "encadre");
    expect(encadre && "texte" in encadre && encadre.texte).toMatch(/reporté/);

    // Un mois à payer n'affiche pas d'encadré de crédit.
    expect(depuisCalcul(aPayer).blocs.some((b) => b.type === "encadre")).toBe(
      false
    );
  });

  it("se rend en PDF d'une page", async () => {
    const octets = await rendrePdf(depuisCalcul(aPayer));
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBe(1);
    expect(relu.getTitle()).toContain("DECL-02-2526");
  });

  it("se rend aussi sur un mois sans mouvement", async () => {
    const octets = await rendrePdf(
      depuisCalcul({ facturesEmises: [], facturesRecues: [] })
    );
    expect(octets.byteLength).toBeGreaterThan(1000);
  });
});
