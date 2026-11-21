import { describe, expect, it } from "vitest";
import {
  bordsColonnes,
  bordsLignes,
  feuilleVersCanevas,
  hauteurEnMm,
  largeurEnMm,
  pixelsEnMm,
  rapporterImport,
  type FeuilleTableur,
} from "./import-tableur";
import { A4, type BlocImage, type BlocTexte } from "./canevas";

const feuille = (ajouts: Partial<FeuilleTableur> = {}): FeuilleTableur => ({
  nom: "Template Reçu",
  largeursColonnes: [20, 16, 18],
  hauteursLignes: [21, 58.5, 27],
  cellules: [],
  fusions: [],
  images: [],
  ...ajouts,
});

const textes = (blocs: { type: string }[]) =>
  blocs.filter((b): b is BlocTexte => b.type === "TEXTE");

describe("unités du tableur", () => {
  it("convertit une largeur de colonne en millimètres", () => {
    // 8,43 caractères ≈ 64 px ≈ 17 mm — la colonne par défaut d'Excel.
    expect(largeurEnMm(8.43)).toBeCloseTo(17.0, 0);
    expect(largeurEnMm(0)).toBe(0);
  });

  it("convertit une hauteur de ligne en millimètres", () => {
    // 15 pt, la ligne par défaut, vaut un peu plus de 5 mm.
    expect(hauteurEnMm(15)).toBeCloseTo(5.29, 1);
    expect(hauteurEnMm(72)).toBeCloseTo(25.4, 5);
  });

  it("convertit des pixels d'image en millimètres", () => {
    expect(pixelsEnMm(96)).toBeCloseTo(25.4, 5);
  });
});

describe("bords cumulés", () => {
  it("rend un bord de plus que de colonnes : le dernier est le bord droit", () => {
    const bords = bordsColonnes([10, 10]);
    expect(bords).toHaveLength(3);
    expect(bords[0]).toBe(0);
    expect(bords[2]).toBeCloseTo(bords[1] * 2);
  });

  it("donne la largeur par défaut à une colonne non déclarée", () => {
    // Excel ne stocke pas les colonnes laissées telles quelles : à zéro, on
    // prend sa largeur par défaut plutôt que d'écraser tout à gauche.
    expect(bordsColonnes([0])[1]).toBeCloseTo(largeurEnMm(8.43), 5);
    expect(bordsLignes([0])[1]).toBeCloseTo(hauteurEnMm(15), 5);
  });
});

describe("feuilleVersCanevas", () => {
  it("place une cellule à sa position et à sa taille", () => {
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [{ ligne: 2, colonne: 2, texte: "Référence" }],
      })
    );
    const bloc = textes(canevas.blocs)[0];
    expect(bloc.contenu).toBe("Référence");
    expect(bloc.x).toBeCloseTo(largeurEnMm(20), 5);
    expect(bloc.y).toBeCloseTo(hauteurEnMm(21), 5);
    expect(bloc.largeur).toBeCloseTo(largeurEnMm(16), 5);
    expect(bloc.hauteur).toBeCloseTo(hauteurEnMm(58.5), 5);
  });

  it("transpose la mise en forme", () => {
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [
          {
            ligne: 1,
            colonne: 1,
            texte: "TITRE",
            gras: true,
            italique: true,
            taille: 12,
            couleur: "#ffffff",
            fond: "#15181d",
            alignement: "centre",
            alignementVertical: "milieu",
            bordure: "#2c4a7c",
          },
        ],
      })
    );
    const bloc = textes(canevas.blocs)[0];
    expect(bloc.style).toMatchObject({
      gras: true,
      italique: true,
      taille: 12,
      couleur: "#ffffff",
      alignement: "centre",
    });
    expect(bloc.encadrement.fond).toBe("#15181d");
    expect(bloc.encadrement.bordure).toBe("#2c4a7c");
    expect(bloc.encadrement.epaisseurBordure).toBeGreaterThan(0);
  });

  it("fait d'une plage fusionnée un seul bloc, pas un par cellule", () => {
    // Un titre centré sur trois colonnes doit rester un titre.
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [
          { ligne: 1, colonne: 1, texte: "AMICALE DES ANCIENS — REÇU" },
          { ligne: 1, colonne: 2, texte: "" },
          { ligne: 1, colonne: 3, texte: "" },
        ],
        fusions: [{ ligne: 1, colonne: 1, jusquLigne: 1, jusquColonne: 3 }],
      })
    );
    const blocs = textes(canevas.blocs);
    expect(blocs).toHaveLength(1);
    expect(blocs[0].largeur).toBeCloseTo(
      largeurEnMm(20) + largeurEnMm(16) + largeurEnMm(18),
      5
    );
  });

  it("écarte les cellules qui ne portent rien", () => {
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [
          { ligne: 1, colonne: 1, texte: "   " },
          { ligne: 1, colonne: 2, texte: "" },
          { ligne: 2, colonne: 1, texte: "Gardée" },
        ],
      })
    );
    expect(textes(canevas.blocs).map((b) => b.contenu)).toEqual(["Gardée"]);
  });

  it("garde une cellule vide qui porte un fond ou un filet", () => {
    // Un aplat de couleur sans texte fait partie de la mise en page.
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [
          { ligne: 1, colonne: 1, texte: "", fond: "#2c4a7c" },
          { ligne: 2, colonne: 1, texte: "", bordure: "#15181d" },
        ],
      })
    );
    expect(textes(canevas.blocs)).toHaveLength(2);
  });

  it("n'importe pas le résultat d'une formule", () => {
    // Le total d'une facture vient de l'application, pas du tableur : recopier le
    // calcul ferait une seconde vérité qui divergerait au premier avenant.
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [
          { ligne: 1, colonne: 1, texte: "1785", formule: true, fond: "#f2f2f2" },
        ],
      })
    );
    expect(textes(canevas.blocs)[0].contenu).toBe("");
  });

  it("pose les images par-dessus les textes", () => {
    const canevas = feuilleVersCanevas(
      feuille({
        cellules: [{ ligne: 1, colonne: 1, texte: "Fond" }],
        images: [
          {
            ligne: 1,
            colonne: 1,
            largeurPx: 96,
            hauteurPx: 48,
            fichierId: "abc",
            nomFichier: "cachet.png",
          },
        ],
      })
    );
    const image = canevas.blocs.find(
      (b): b is BlocImage => b.type === "IMAGE"
    );
    const texte = textes(canevas.blocs)[0];
    // Un cachet sous le texte ne se verrait pas : c'est sa raison d'être.
    expect(image!.plan).toBeGreaterThan(texte.plan);
    expect(image!.largeur).toBeCloseTo(25.4, 1);
    expect(image!.hauteur).toBeCloseTo(12.7, 1);
  });

  it("décale tout le contenu de la marge demandée", () => {
    const canevas = feuilleVersCanevas(
      feuille({ cellules: [{ ligne: 1, colonne: 1, texte: "A" }] }),
      { marge: 12 }
    );
    const bloc = textes(canevas.blocs)[0];
    expect(bloc.x).toBeCloseTo(12, 5);
    expect(bloc.y).toBeCloseTo(12, 5);
  });

  it("produit une page A4 par défaut", () => {
    const canevas = feuilleVersCanevas(feuille());
    expect(canevas.largeur).toBe(A4.largeur);
    expect(canevas.hauteur).toBe(A4.hauteur);
  });
});

describe("rapporterImport", () => {
  it("compte ce qui est entré et ce qui a été laissé de côté", () => {
    const source = feuille({
      cellules: [
        { ligne: 1, colonne: 1, texte: "A" },
        { ligne: 2, colonne: 1, texte: "=SUM(A1)", formule: true },
      ],
      images: [
        {
          ligne: 1,
          colonne: 1,
          largeurPx: 50,
          hauteurPx: 50,
          fichierId: "x",
          nomFichier: "logo.png",
        },
      ],
    });
    const rapport = rapporterImport(source, feuilleVersCanevas(source));
    expect(rapport.images).toBe(1);
    expect(rapport.formulesIgnorees).toBe(1);
    expect(rapport.horsPage).toBe(0);
  });

  it("signale ce qui déborde de la page", () => {
    // Une feuille large déborde d'un A4 portrait : mieux vaut le dire que
    // laisser découvrir un document tronqué.
    const source = feuille({
      largeursColonnes: [60, 60, 60, 60],
      cellules: [{ ligne: 1, colonne: 4, texte: "Trop à droite" }],
    });
    const rapport = rapporterImport(source, feuilleVersCanevas(source));
    expect(rapport.horsPage).toBe(1);
  });
});
