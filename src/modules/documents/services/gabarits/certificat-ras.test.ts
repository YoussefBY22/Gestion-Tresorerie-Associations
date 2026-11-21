import { describe, expect, it } from "vitest";
import {
  construireCertificatRAS,
  type DonneesCertificatRAS,
} from "./certificat-ras";

const base: DonneesCertificatRAS = {
  reference: "RAS-001-2627",
  retenteur: "Amicale des anciens",
  retenteurMatriculeFiscal: "1993386M/P/N/000",
  beneficiaire: "Cabinet Ben Salah",
  factureReference: "F-2026-114",
  factureDate: new Date("2026-09-20"),
  montantTTC: 1191,
  typePrestataire: "HONORAIRES_REEL",
  dateReglement: new Date("2026-10-05"),
  dateEmission: new Date("2026-10-06"),
  mandat: "2026-2027",
};

/** Tout le texte de la structure, pour chercher dedans. */
function texte(d: DonneesCertificatRAS): string {
  return JSON.stringify(construireCertificatRAS(d));
}

describe("construireCertificatRAS", () => {
  it("porte la référence et le titre attendus", () => {
    const s = construireCertificatRAS(base);
    expect(s.reference).toBe("RAS-001-2627");
    expect(s.titre).toMatch(/retenue à la source/i);
  });

  it("imprime le détail du calcul, pas seulement le résultat", () => {
    // Sans assiette ni taux, le bénéficiaire ne peut rien vérifier.
    const t = texte(base);
    expect(t).toContain("1190,000 DT");
    expect(t).toContain("3 %");
    expect(t).toContain("35,700 DT");
  });

  it("met le net versé en évidence : c'est le chiffre qu'il reconnaît", () => {
    const s = construireCertificatRAS(base);
    const total = s.blocs.find((b) => b.type === "total");
    expect(total).toBeDefined();
    const net = (total as { items: { label: string; valeur: string; fort?: boolean }[] }).items.find(
      (i) => i.label.includes("Net versé")
    );
    expect(net?.valeur).toBe("1155,300 DT");
    expect(net?.fort).toBe(true);
  });

  it("nomme les deux parties et le régime", () => {
    const t = texte(base);
    expect(t).toContain("Amicale des anciens");
    expect(t).toContain("Cabinet Ben Salah");
    expect(t).toContain("régime réel");
  });

  it("appelle le matricule du bénéficiaire quand il manque", () => {
    // Laisser le champ vide donnerait une pièce qu'on croit complète.
    expect(texte(base)).toContain("à compléter par le bénéficiaire");
    expect(
      texte({ ...base, beneficiaireMatriculeFiscal: "1234567A/B/C/000" })
    ).toContain("1234567A/B/C/000");
  });

  it("distingue la date de la facture de celle du règlement", () => {
    // C'est le règlement qui déclenche la retenue, pas la facture.
    const t = texte(base);
    expect(t).toContain("20/09/2026");
    expect(t).toContain("05/10/2026");
  });

  it("omet les rubriques facultatives absentes plutôt que de les vider", () => {
    const t = texte({
      ...base,
      retenteurAdresse: undefined,
      modeReglement: undefined,
      natureOperation: undefined,
    });
    expect(t).not.toContain('"Adresse"');
    expect(t).not.toContain("Mode de règlement");
  });

  it("suit le taux du régime : 10 % au forfait", () => {
    const t = texte({
      ...base,
      montantTTC: 2001,
      typePrestataire: "HONORAIRES_FORFAIT",
    });
    expect(t).toContain("10 %");
    expect(t).toContain("200,000 DT");
  });

  it("n'ajoute la signature que si un émetteur est connu", () => {
    expect(
      construireCertificatRAS(base).blocs.some((b) => b.type === "signatures")
    ).toBe(false);
    expect(
      construireCertificatRAS({ ...base, emetteur: "Youssef" }).blocs.some(
        (b) => b.type === "signatures"
      )
    ).toBe(true);
  });
});
