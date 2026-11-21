import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { rendrePdf, replier, tronquer } from "./rendu";
import type { BlocDocument, StructureDocument } from "./structure";
import { construireRecuCotisation } from "./gabarits/recu-cotisation";

async function police() {
  const pdf = await PDFDocument.create();
  return pdf.embedFont(StandardFonts.Helvetica);
}

describe("replier", () => {
  it("ne coupe pas un texte qui tient sur une ligne", async () => {
    expect(replier("Cotisation annuelle", await police(), 10, 500)).toEqual([
      "Cotisation annuelle",
    ]);
  });

  it("replie sur plusieurs lignes sans perdre de mot", async () => {
    const texte =
      "Je soussigné, le Trésorier d'Amicale des anciens, reconnais avoir reçu la somme indiquée ci-dessous au titre de la cotisation annuelle.";
    const lignes = replier(texte, await police(), 10, 200);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.join(" ")).toBe(texte);
  });

  it("respecte les retours à la ligne explicites", async () => {
    expect(replier("Ligne A\nLigne B", await police(), 10, 500)).toEqual([
      "Ligne A",
      "Ligne B",
    ]);
  });
});

describe("tronquer", () => {
  it("laisse intact un texte qui tient", async () => {
    expect(tronquer("30,000 DT", await police(), 10, 200)).toBe("30,000 DT");
  });

  it("ajoute une ellipse et tient dans la largeur imposée", async () => {
    const f = await police();
    const coupe = tronquer("Développement d'une application mobile", f, 10, 60);
    expect(coupe.endsWith("…")).toBe(true);
    expect(f.widthOfTextAtSize(coupe, 10)).toBeLessThanOrEqual(60);
  });
});

describe("rendrePdf", () => {
  const base: StructureDocument = {
    titre: "Reçu de cotisation",
    reference: "RC001-COT-2526",
    date: "09/02/2026",
    blocs: [{ type: "paragraphe", texte: "Contenu de test." }],
  };

  it("produit un PDF valide d'une page", async () => {
    const octets = await rendrePdf(base);
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe("%PDF-");
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBe(1);
    expect(relu.getTitle()).toContain("RC001-COT-2526");
  });

  it("pagine automatiquement quand le contenu déborde", async () => {
    const lignes = Array.from({ length: 120 }, (_, i) => [
      String(i + 1),
      `Membre ${i + 1}`,
      "30,000 DT",
    ]);
    const octets = await rendrePdf({
      ...base,
      blocs: [
        {
          type: "tableau",
          colonnes: [
            { libelle: "N°", largeur: 1 },
            { libelle: "Membre", largeur: 4 },
            { libelle: "Montant", largeur: 2, alignement: "droite" },
          ],
          lignes,
        },
      ],
    });
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBeGreaterThan(1);
  });

  it("rend tous les types de blocs sans échouer", async () => {
    const blocs: BlocDocument[] = [
      { type: "section", titre: "Cotisant" },
      { type: "paragraphe", texte: "Paragraphe.", italique: true },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Nom", valeur: "Youssef Ben Youssef" },
          { label: "Qualité", valeur: "Président" },
        ],
      },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Libellé", largeur: 3 },
          { libelle: "Montant", largeur: 1, alignement: "droite" },
        ],
        lignes: [["Cotisation", "30,000 DT"]],
      },
      { type: "total", items: [{ label: "Total", valeur: "30,000 DT", fort: true }] },
      { type: "encadre", titre: "Somme arrêtée à", texte: "Trente dinars." },
      { type: "espace", hauteur: 12 },
      { type: "signatures", cases: [{ role: "Le cotisant" }, { role: "Le Trésorier" }] },
    ];
    const octets = await rendrePdf({ ...base, blocs, filigrane: "Duplicata" });
    expect(octets.byteLength).toBeGreaterThan(1000);
  });

  it("ne casse pas sur un caractère hors table WinAnsi", async () => {
    // Les polices standard PDF sont encodées en WinAnsi : un émoji ou un
    // caractère arabe collé depuis le drive ferait échouer drawText.
    const octets = await rendrePdf({
      ...base,
      blocs: [{ type: "paragraphe", texte: "Cotisation ✅ المتحدي — « test »" }],
    });
    expect(octets.byteLength).toBeGreaterThan(500);
  });
});

describe("gabarit du reçu de cotisation", () => {
  const donnees = {
    reference: "RC001-COT-2526",
    membre: "Youssef Ben Youssef",
    email: "president@exemple.org",
    qualite: "Bureau exécutif",
    poste: "Président",
    montant: 30,
    modePaiement: "Espèces",
    datePaiement: new Date(2026, 1, 9),
    mandat: "2025-2026",
    emetteur: "Le Trésorier",
  };

  it("porte la référence, le mandat et la date de paiement", () => {
    const s = construireRecuCotisation(donnees);
    expect(s.reference).toBe("RC001-COT-2526");
    expect(s.sousTitre).toContain("2025-2026");
    expect(s.date).toBe("09/02/2026");
  });

  it("affiche le montant en chiffres et en toutes lettres", () => {
    const s = construireRecuCotisation(donnees);
    const total = s.blocs.find((b) => b.type === "total");
    expect(total).toMatchObject({
      items: [{ valeur: "30,000 DT", fort: true }],
    });
    const encadre = s.blocs.find((b) => b.type === "encadre");
    expect(encadre && "texte" in encadre && encadre.texte).toBe(
      "Trente dinars."
    );
  });

  it("omet les champs optionnels non renseignés", () => {
    const s = construireRecuCotisation({
      ...donnees,
      email: undefined,
      poste: undefined,
      departement: undefined,
    });
    const champs = s.blocs.filter((b) => b.type === "champs");
    const labels = champs.flatMap((b) =>
      "items" in b ? b.items.map((i) => i.label) : []
    );
    expect(labels).not.toContain("Adresse e-mail");
    expect(labels).not.toContain("Poste");
    expect(labels).toContain("Nom et prénom");
  });

  it("se rend en PDF de bout en bout", async () => {
    const octets = await rendrePdf(construireRecuCotisation(donnees));
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBe(1);
  });
});
