import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { A4, STYLE_TEXTE_DEFAUT, type Canevas } from "./canevas";
import { canevasFacture, canevasLivre, canevasRecu } from "./modeles-livres";
import { imagesRequises, rendreCanevas } from "./rendu-canevas";

const DONNEES_RECU = {
  emetteurJE: "Amicale des anciens",
  sigleJE: "AMICALE",
  reference: "REC-COT-001-2627",
  date: "09/08/2026",
  adresseJE: "19 Rue Essammani, Borj Louzir, Soukra, Ariana, 2073",
  matriculeFiscal: "1993386M/P/N/000",
  telephoneJE: "92 224 315",
  emailJE: "contact@exemple.org",
  cotisant: "Youssef Ben Youssef",
  cin: "14329041",
  adresse: "19 Rue Essammani, Borj Louzir",
  email: "youssefben.youssef159@gmail.com",
  telephone: "55 600 579",
  emetteur: "Mohamed Khalil Sedghiani",
  qualiteEmetteur: "Trésorier du mandat 26-27",
  lignes: [
    {
      designation: "Paiement de la cotisation d'Amicale des anciens pour le mandat 26-27",
      quantite: 1,
      total: "30 DT",
    },
  ],
};

/** PNG 1×1 valide — suffit à prouver qu'un bloc image est bien dessiné. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const estPdf = (o: Uint8Array) => Buffer.from(o.slice(0, 5)).toString() === "%PDF-";

describe("rendu du canevas", () => {
  it("rend le reçu de la JE en PDF", async () => {
    const pdf = await rendreCanevas(canevasRecu(), { donnees: DONNEES_RECU });
    expect(estPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(15_000);
  });

  it("rend la facture de la JE en PDF", async () => {
    const pdf = await rendreCanevas(canevasFacture(), {
      donnees: {
        ...DONNEES_RECU,
        client: "Société exemple",
        lignes: [
          { designation: "Étude", quantite: 1, prixUnitaire: "1 500,000", totalHT: "1 500,000", tauxTVA: "19 %", totalTVA: "285,000", total: "1 785,000" },
        ],
      },
    });
    expect(estPdf(pdf)).toBe(true);
  });

  it("produit une page A4 exacte", async () => {
    // Le dictionnaire de page est rangé dans un flux compressé : on relit le
    // PDF plutôt que d'y chercher « MediaBox » en clair.
    const pdf = await rendreCanevas(canevasRecu(), { donnees: DONNEES_RECU });
    const { width, height } = (await PDFDocument.load(pdf)).getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it("change de contenu quand les données changent", async () => {
    // Deux rendus identiques signaleraient des jetons jamais remplacés.
    const a = await rendreCanevas(canevasRecu(), { donnees: DONNEES_RECU });
    const b = await rendreCanevas(canevasRecu(), {
      donnees: { ...DONNEES_RECU, cotisant: "Quelqu'un d'autre" },
    });
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  it("laisse un blanc plutôt que d'imprimer un jeton non fourni", async () => {
    const pdf = await rendreCanevas(canevasRecu(), { donnees: {} });
    expect(estPdf(pdf)).toBe(true);
    // Le texte des PDF est encodé, mais les accolades ne doivent nulle part
    // subsister en clair dans les flux de contenu.
    expect(Buffer.from(pdf).toString("latin1")).not.toContain("{{");
  });

  it("dessine les blocs image et ignore ceux dont le fichier manque", async () => {
    const canevas: Canevas = {
      largeur: A4.largeur,
      hauteur: A4.hauteur,
      blocs: [
        {
          id: "img-1",
          type: "IMAGE",
          x: 20,
          y: 20,
          largeur: 30,
          hauteur: 30,
          plan: 0,
          fichierId: "present",
          nomFichier: "cachet.png",
          ajustement: "contenir",
          opacite: 1,
        },
        {
          id: "img-2",
          type: "IMAGE",
          x: 60,
          y: 20,
          largeur: 30,
          hauteur: 30,
          plan: 1,
          fichierId: "absent",
          nomFichier: "perdu.png",
          ajustement: "contenir",
          opacite: 1,
        },
      ],
    };
    const images = new Map([["present", { octets: new Uint8Array(PNG), type: "png" as const }]]);

    const pdf = await rendreCanevas(canevas, { images });
    expect(estPdf(pdf)).toBe(true);
    expect(imagesRequises(canevas).map((i) => i.id)).toEqual(["present", "absent"]);
  });

  it("respecte l'ordre d'empilement", async () => {
    const dessus: Canevas = {
      largeur: A4.largeur,
      hauteur: A4.hauteur,
      blocs: [
        { id: "a", type: "RECTANGLE", x: 10, y: 10, largeur: 50, hauteur: 50, plan: 0, encadrement: { fond: "#ff0000", bordure: "", epaisseurBordure: 0 } },
        { id: "b", type: "RECTANGLE", x: 10, y: 10, largeur: 50, hauteur: 50, plan: 1, encadrement: { fond: "#0000ff", bordure: "", epaisseurBordure: 0 } },
      ],
    };
    const dessous: Canevas = {
      ...dessus,
      blocs: [
        { ...dessus.blocs[0], plan: 1 },
        { ...dessus.blocs[1], plan: 0 },
      ],
    };
    const a = await rendreCanevas(dessus);
    const b = await rendreCanevas(dessous);
    // L'ordre des opérations de dessin diffère : les fichiers aussi.
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  it("saute un bloc masqué", async () => {
    const visible: Canevas = {
      largeur: A4.largeur,
      hauteur: A4.hauteur,
      blocs: [
        { id: "a", type: "RECTANGLE", x: 10, y: 10, largeur: 50, hauteur: 50, plan: 0, encadrement: { fond: "#ff0000", bordure: "", epaisseurBordure: 0 } },
      ],
    };
    const masque: Canevas = {
      ...visible,
      blocs: [{ ...visible.blocs[0], masque: true }],
    };
    expect((await rendreCanevas(masque)).length).toBeLessThan(
      (await rendreCanevas(visible)).length
    );
  });

  it("donne un canevas vide pour une famille inconnue, sans lever", async () => {
    const canevas = canevasLivre("MODELE_QUI_N_EXISTE_PAS");
    expect(canevas.blocs).toEqual([]);
    expect(estPdf(await rendreCanevas(canevas))).toBe(true);
  });

  it("déroule autant de lignes que le tableau en reçoit", async () => {
    const une = await rendreCanevas(canevasFacture(), {
      donnees: { lignes: [{ designation: "A", quantite: 1 }] },
    });
    const trois = await rendreCanevas(canevasFacture(), {
      donnees: {
        lignes: [
          { designation: "A", quantite: 1 },
          { designation: "B", quantite: 2 },
          { designation: "C", quantite: 3 },
        ],
      },
    });
    expect(trois.length).toBeGreaterThan(une.length);
  });
});

describe("traits et tableaux manuels", () => {
  const page = (blocs: Canevas["blocs"]): Canevas => ({
    largeur: A4.largeur,
    hauteur: A4.hauteur,
    blocs,
  });

  it("dessine un trait horizontal et un trait vertical", async () => {
    const horizontal = await rendreCanevas(
      page([
        {
          id: "l1",
          type: "LIGNE",
          x: 10,
          y: 10,
          largeur: 100,
          hauteur: 5,
          plan: 0,
          orientation: "horizontale",
          couleur: "#2c4a7c",
          epaisseur: 0.5,
        },
      ])
    );
    const vertical = await rendreCanevas(
      page([
        {
          id: "l1",
          type: "LIGNE",
          x: 10,
          y: 10,
          largeur: 5,
          hauteur: 100,
          plan: 0,
          orientation: "verticale",
          couleur: "#2c4a7c",
          epaisseur: 0.5,
        },
      ])
    );
    expect(estPdf(horizontal)).toBe(true);
    // Deux orientations, deux géométries : les fichiers diffèrent.
    expect(Buffer.compare(Buffer.from(horizontal), Buffer.from(vertical))).not.toBe(0);
  });

  it("remplit un tableau depuis ses cellules saisies à la main", async () => {
    const grille = (lignes: string[][]) =>
      page([
        {
          id: "t",
          type: "TABLEAU",
          x: 10,
          y: 10,
          largeur: 120,
          hauteur: 40,
          plan: 0,
          colonnes: [
            { entete: "A", part: 1, alignement: "gauche", champ: "" },
            { entete: "B", part: 1, alignement: "gauche", champ: "" },
          ],
          source: "",
          lignesManuelles: lignes,
          hauteurEntete: 8,
          hauteurLigne: 7,
          styleEntete: { ...STYLE_TEXTE_DEFAUT, couleur: "#ffffff" },
          encadrementEntete: { fond: "#15181d", bordure: "", epaisseurBordure: 0 },
          styleCorps: STYLE_TEXTE_DEFAUT,
          encadrementCorps: { fond: "", bordure: "", epaisseurBordure: 0 },
          zebrure: "",
          bordure: "#d9d9d9",
          epaisseurBordure: 0.25,
        },
      ]);

    const une = await rendreCanevas(grille([["a1", "b1"]]));
    const deux = await rendreCanevas(grille([["a1", "b1"], ["a2", "b2"]]));
    expect(estPdf(une)).toBe(true);
    // Une ligne de plus, donc du contenu de plus : sans cela, les cellules
    // manuelles seraient ignorées en silence.
    expect(deux.length).toBeGreaterThan(une.length);
  });
});

describe("bloc en flux", () => {
  const blocFlux = (elements: unknown[], hauteur = 120): Canevas => ({
    largeur: A4.largeur,
    hauteur: A4.hauteur,
    blocs: [
      {
        id: "flux",
        type: "FLUX",
        x: 15,
        y: 20,
        largeur: 180,
        hauteur,
        plan: 0,
        elements,
        style: { ...STYLE_TEXTE_DEFAUT, taille: 10, interligne: 1.3 },
        encadrement: { fond: "", bordure: "", epaisseurBordure: 0 },
        marge: 3,
        couleurTitre: "#2c4a7c",
        fondEntete: "#15181d",
        couleurEntete: "#ffffff",
        bordureTableau: "#d9d9d9",
      },
    ],
  });

  const PV = [
    { type: "TITRE", niveau: 1, texte: "Procès-verbal de réunion" },
    { type: "PARAGRAPHE", texte: "Séance tenue le {{date}} au siège de {{emetteurJE}}." },
    { type: "TITRE", niveau: 2, texte: "Présents" },
    { type: "LISTE", ordonnee: false, items: ["La présidente", "Le trésorier", "Le secrétaire général"] },
    { type: "FILET" },
    { type: "TABLEAU", entetes: ["Point", "Décision"], lignes: [["Budget", "Adopté"], ["Cotisation", "Maintenue à 30 DT"]] },
    { type: "ESPACE", hauteur: 6 },
    { type: "PARAGRAPHE", texte: "Séance levée à 19 h." },
  ];

  it("rend un procès-verbal en PDF", async () => {
    const pdf = await rendreCanevas(blocFlux(PV), {
      donnees: { date: "08/10/2026", emetteurJE: "Amicale des anciens" },
    });
    expect(estPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(15_000);
  });

  it("remplit les jetons enfouis dans les éléments", async () => {
    const avec = await rendreCanevas(blocFlux(PV), {
      donnees: { date: "08/10/2026", emetteurJE: "Amicale des anciens" },
    });
    const autre = await rendreCanevas(blocFlux(PV), {
      donnees: { date: "01/01/2027", emetteurJE: "Une autre JE" },
    });
    // Deux rendus identiques signaleraient des jetons jamais remplacés au
    // fond des éléments.
    expect(Buffer.compare(Buffer.from(avec), Buffer.from(autre))).not.toBe(0);
  });

  it("produit moins de contenu dans un cadre plus court", async () => {
    const grand = await rendreCanevas(blocFlux(PV, 160));
    const petit = await rendreCanevas(blocFlux(PV, 30));
    expect(petit.length).toBeLessThan(grand.length);
  });

  it("rend un flux vide sans échouer", async () => {
    expect(estPdf(await rendreCanevas(blocFlux([])))).toBe(true);
  });
});
