import { describe, expect, it } from "vitest";
import {
  ajouterColonne,
  ajouterLigne,
  blocsDansLeCadre,
  cadreEntre,
  largeursColonnes,
  majCellule,
  STYLE_TEXTE_DEFAUT,
  seChevauchent,
  supprimerColonne,
  supprimerLigne,
  type BlocTableau,
} from "./canevas";
import {
  A4,
  avecFormat,
  blocsHorsPage,
  contraindre,
  formatDuCanevas,
  deplacerDansLaPile,
  formaterValeur,
  jetonsDe,
  jetonsDuCanevas,
  mmEnPoints,
  nomDuBloc,
  ordonneePdf,
  parPlan,
  planSuivant,
  remplirJetons,
  valeurDuChemin,
  type Bloc,
  type Canevas,
} from "./canevas";

const bloc = (id: string, plan: number, reste: Partial<Bloc> = {}): Bloc =>
  ({
    id,
    type: "RECTANGLE",
    x: 10,
    y: 10,
    largeur: 50,
    hauteur: 20,
    plan,
    encadrement: { fond: "#000000", bordure: "", epaisseurBordure: 0 },
    ...reste,
  }) as Bloc;

describe("unités", () => {
  it("convertit les millimètres en points PostScript", () => {
    expect(mmEnPoints(25.4)).toBeCloseTo(72, 5);
    expect(mmEnPoints(A4.largeur)).toBeCloseTo(595.28, 1);
    expect(mmEnPoints(A4.hauteur)).toBeCloseTo(841.89, 1);
  });

  it("retourne l'axe vertical pour le PDF", () => {
    // Un bloc de 20 mm collé en haut de la page a son bas à 297−20 = 277 mm.
    expect(ordonneePdf(0, 20)).toBeCloseTo(mmEnPoints(277), 5);
    // Collé en bas, son ordonnée PDF est nulle.
    expect(ordonneePdf(277, 20)).toBeCloseTo(0, 5);
  });
});

describe("jetons", () => {
  it("relève les champs d'un texte, sans doublon", () => {
    expect(jetonsDe("Nom : {{cotisant}} — CIN {{cin}} ({{cotisant}})")).toEqual([
      "cotisant",
      "cin",
    ]);
  });

  it("tolère les espaces dans les accolades", () => {
    expect(jetonsDe("{{ reference }}")).toEqual(["reference"]);
  });

  it("ignore ce qui n'est pas un jeton", () => {
    expect(jetonsDe("{pas un jeton} et {{ }}")).toEqual([]);
  });

  it("lit un champ imbriqué", () => {
    expect(valeurDuChemin({ client: { nom: "Acme" } }, "client.nom")).toBe("Acme");
  });

  it("rend undefined sur un chemin absent plutôt que de lever", () => {
    expect(valeurDuChemin({}, "client.nom")).toBeUndefined();
    expect(valeurDuChemin({ client: null }, "client.nom")).toBeUndefined();
  });

  it("remplace les jetons par leurs valeurs", () => {
    expect(
      remplirJetons("Reçu de {{cotisant}} — {{montant}} DT", {
        cotisant: "Youssef Ben Youssef",
        montant: 30,
      })
    ).toBe("Reçu de Youssef Ben Youssef — 30 DT");
  });

  it("efface un jeton inconnu au lieu de l'imprimer", () => {
    // Voir « {{cotisant}} » sur une pièce remise à un tiers serait pire qu'un
    // blanc, qui se remarque et se corrige.
    expect(remplirJetons("Nom : {{inconnu}}.", {})).toBe("Nom : .");
  });

  it("recense les jetons de tout un canevas, source des tableaux comprise", () => {
    const canevas: Canevas = {
      largeur: A4.largeur,
      hauteur: A4.hauteur,
      blocs: [
        bloc("a", 0, {
          type: "TEXTE",
          contenu: "{{reference}}",
          marge: 1,
        } as Partial<Bloc>),
        bloc("b", 1, {
          type: "TABLEAU",
          source: "lignes",
          colonnes: [{ entete: "{{entete}}", part: 1, alignement: "gauche", champ: "designation" }],
        } as Partial<Bloc>),
      ],
    };
    expect(jetonsDuCanevas(canevas).sort()).toEqual(
      ["entete", "lignes", "reference"].sort()
    );
  });
});

describe("formaterValeur", () => {
  it("écrit les dates à la française", () => {
    expect(formaterValeur(new Date(2026, 7, 9))).toBe("09/08/2026");
  });

  it("garde les entiers entiers et donne trois décimales au reste", () => {
    expect(formaterValeur(30)).toBe("30");
    expect(formaterValeur(1234)).toBe("1 234".replace(" ", " "));
    expect(formaterValeur(30.5)).toBe("30,500");
  });

  it("rend une chaîne vide sur l'absence", () => {
    expect(formaterValeur(null)).toBe("");
    expect(formaterValeur(undefined)).toBe("");
  });
});

describe("contraindre", () => {
  it("ramène un bloc poussé hors de la page", () => {
    const sorti = contraindre(bloc("a", 0, { x: 500, y: -40 }));
    expect(sorti.x).toBeCloseTo(A4.largeur - 50);
    expect(sorti.y).toBe(0);
  });

  it("refuse une taille nulle ou plus grande que la page", () => {
    const minuscule = contraindre(bloc("a", 0, { largeur: 0, hauteur: -5 }));
    expect(minuscule.largeur).toBe(2);
    expect(minuscule.hauteur).toBe(2);

    const enorme = contraindre(bloc("a", 0, { largeur: 900, hauteur: 900 }));
    expect(enorme.largeur).toBe(A4.largeur);
    expect(enorme.hauteur).toBe(A4.hauteur);
  });
});

describe("pile des blocs", () => {
  it("dessine du plan le plus lointain au plus proche", () => {
    expect(parPlan([bloc("a", 5), bloc("b", 1), bloc("c", 3)]).map((b) => b.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("fait passer un bloc devant son voisin", () => {
    const apres = deplacerDansLaPile([bloc("a", 0), bloc("b", 1)], "a", "avancer");
    expect(parPlan(apres).map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("fait passer un bloc derrière son voisin", () => {
    const apres = deplacerDansLaPile([bloc("a", 0), bloc("b", 1)], "b", "reculer");
    expect(parPlan(apres).map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("ne fait rien au bloc déjà tout devant ou tout derrière", () => {
    const blocs = [bloc("a", 0), bloc("b", 1)];
    expect(deplacerDansLaPile(blocs, "b", "avancer")).toEqual(blocs);
    expect(deplacerDansLaPile(blocs, "a", "reculer")).toEqual(blocs);
  });

  it("départage deux blocs posés au même plan", () => {
    // Sans écart forcé, l'échange serait sans effet et l'ordre dépendrait de
    // la position dans le tableau, donc du hasard.
    const apres = deplacerDansLaPile([bloc("a", 2), bloc("b", 2)], "a", "avancer");
    const rangs = parPlan(apres).map((b) => b.id);
    expect(rangs[rangs.length - 1]).toBe("a");
  });

  it("pose un nouveau bloc devant tous les autres", () => {
    expect(planSuivant([bloc("a", 0), bloc("b", 7)])).toBe(8);
    expect(planSuivant([])).toBe(0);
  });
});

describe("nomDuBloc", () => {
  it("préfère le nom donné par la personne", () => {
    expect(nomDuBloc(bloc("a", 0, { nom: "Cachet" }))).toBe("Cachet");
  });

  it("se rabat sur le début du texte", () => {
    expect(
      nomDuBloc(bloc("a", 0, { type: "TEXTE", contenu: "  Reçu   de cotisation " } as Partial<Bloc>))
    ).toBe("Reçu de cotisation");
  });

  it("nomme un aplat sans contenu", () => {
    expect(nomDuBloc(bloc("a", 0))).toBe("Aplat");
  });
});

/* ------------------------------------------------------------------ */
/* Tableaux et sélection — ajoutés avec l'éditeur complet              */
/* ------------------------------------------------------------------ */


const tableau = (): BlocTableau => ({
  id: "t",
  type: "TABLEAU",
  x: 10,
  y: 10,
  largeur: 120,
  hauteur: 40,
  plan: 0,
  colonnes: [
    { entete: "A", part: 2, alignement: "gauche", champ: "a" },
    { entete: "B", part: 1, alignement: "centre", champ: "b" },
  ],
  source: "",
  lignesManuelles: [
    ["a1", "b1"],
    ["a2", "b2"],
  ],
  hauteurEntete: 8,
  hauteurLigne: 7,
  styleEntete: STYLE_TEXTE_DEFAUT,
  encadrementEntete: { fond: "#15181d", bordure: "", epaisseurBordure: 0 },
  styleCorps: STYLE_TEXTE_DEFAUT,
  encadrementCorps: { fond: "", bordure: "", epaisseurBordure: 0 },
  zebrure: "",
  bordure: "#d9d9d9",
  epaisseurBordure: 0.25,
});

describe("colonnes d'un tableau", () => {
  it("ajoute une colonne à droite, et sa cellule à chaque ligne", () => {
    const apres = ajouterColonne(tableau(), 0, "droite");
    expect(apres.colonnes.map((c) => c.entete)).toEqual(["A", "Colonne", "B"]);
    // Sans cellule ajoutée partout, le décalage ne se verrait qu'au rendu.
    expect(apres.lignesManuelles).toEqual([
      ["a1", "", "b1"],
      ["a2", "", "b2"],
    ]);
  });

  it("ajoute une colonne à gauche", () => {
    const apres = ajouterColonne(tableau(), 0, "gauche");
    expect(apres.colonnes[0].entete).toBe("Colonne");
    expect(apres.lignesManuelles[0]).toEqual(["", "a1", "b1"]);
  });

  it("supprime une colonne et ses cellules", () => {
    const apres = supprimerColonne(tableau(), 0);
    expect(apres.colonnes.map((c) => c.entete)).toEqual(["B"]);
    expect(apres.lignesManuelles).toEqual([["b1"], ["b2"]]);
  });

  it("refuse de supprimer la dernière colonne", () => {
    const seule = supprimerColonne(tableau(), 0);
    expect(supprimerColonne(seule, 0)).toEqual(seule);
  });

  it("répartit les largeurs selon les parts", () => {
    const largeurs = largeursColonnes(tableau());
    expect(largeurs[0]).toBeCloseTo(80);
    expect(largeurs[1]).toBeCloseTo(40);
    expect(largeurs[0] + largeurs[1]).toBeCloseTo(120);
  });
});

describe("lignes d'un tableau", () => {
  it("insère une ligne au-dessus et au-dessous", () => {
    expect(ajouterLigne(tableau(), 0, "dessus").lignesManuelles[0]).toEqual(["", ""]);
    expect(ajouterLigne(tableau(), 0, "dessous").lignesManuelles[1]).toEqual(["", ""]);
  });

  it("supprime une ligne", () => {
    expect(supprimerLigne(tableau(), 0).lignesManuelles).toEqual([["a2", "b2"]]);
  });

  it("modifie une seule cellule", () => {
    const apres = majCellule(tableau(), 1, 0, "corrigé");
    expect(apres.lignesManuelles).toEqual([
      ["a1", "b1"],
      ["corrigé", "b2"],
    ]);
  });
});

describe("sélection au lasso", () => {
  it("dit si deux cadres se touchent", () => {
    const a = { x: 0, y: 0, largeur: 10, hauteur: 10 };
    expect(seChevauchent(a, { x: 5, y: 5, largeur: 10, hauteur: 10 })).toBe(true);
    expect(seChevauchent(a, { x: 20, y: 0, largeur: 5, hauteur: 5 })).toBe(false);
  });

  it("normalise un cadre tracé dans n'importe quel sens", () => {
    expect(cadreEntre({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      largeur: 40,
      hauteur: 40,
    });
  });

  it("retient les blocs touchés, sauf les masqués", () => {
    const blocs = [
      bloc("a", 0, { x: 0, y: 0, largeur: 20, hauteur: 20 }),
      bloc("b", 1, { x: 100, y: 100, largeur: 20, hauteur: 20 }),
      bloc("c", 2, { x: 5, y: 5, largeur: 10, hauteur: 10, masque: true }),
    ];
    expect(
      blocsDansLeCadre(blocs, { x: 0, y: 0, largeur: 50, hauteur: 50 })
    ).toEqual(["a"]);
  });
});

describe("format de page", () => {
  const large: Canevas = {
    largeur: A4.largeur,
    hauteur: A4.hauteur,
    blocs: [bloc("dedans", 0), bloc("deborde", 1, { x: 180, largeur: 80 })],
  };

  it("reconnaît le format d'après les dimensions", () => {
    expect(formatDuCanevas(large)).toBe("A4_PORTRAIT");
    expect(formatDuCanevas({ ...large, largeur: 297, hauteur: 210 })).toBe(
      "A4_PAYSAGE"
    );
  });

  it("passe en paysage sans déplacer les blocs qui tenaient déjà", () => {
    // Faire tourner le contenu déplacerait tout : ce qu'on veut, c'est une
    // feuille plus large sous des blocs qui ne bougent pas.
    const paysage = avecFormat(large, "A4_PAYSAGE");
    expect(paysage.largeur).toBe(297);
    expect(paysage.hauteur).toBe(210);
    const dedans = paysage.blocs.find((b) => b.id === "dedans")!;
    expect({ x: dedans.x, y: dedans.y }).toEqual({ x: 10, y: 10 });
    // Et le bloc qui débordait de 50 mm tient désormais dans la page.
    const deborde = paysage.blocs.find((b) => b.id === "deborde")!;
    expect(deborde.x + deborde.largeur).toBeLessThanOrEqual(297);
  });

  it("ramène dans la page ce qui ne tient plus après rétrécissement", () => {
    const paysage = avecFormat(large, "A4_PAYSAGE");
    const retour = avecFormat(paysage, "A4_PORTRAIT");
    for (const b of retour.blocs) {
      expect(b.x + b.largeur).toBeLessThanOrEqual(A4.largeur + 0.001);
      expect(b.y + b.hauteur).toBeLessThanOrEqual(A4.hauteur + 0.001);
    }
  });

  it("compte ce qui déborderait, pour le dire avant d'y passer", () => {
    expect(blocsHorsPage(large, "A4_PORTRAIT")).toBe(1);
    expect(blocsHorsPage(large, "A4_PAYSAGE")).toBe(0);
  });
});
