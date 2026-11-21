import { describe, expect, it } from "vitest";
import {
  composerFlux,
  deplacerElement,
  elementVide,
  itemsVersLignes,
  libelleElement,
  lignesVersItems,
  mesureApprochee,
  remplacerElement,
  replierEnLignes,
  retirerElement,
  tableauVersTexte,
  texteVersTableau,
  type ElementFlux,
  type MesureTexte,
  type OperationFlux,
  type OptionsFlux,
} from "./flux-document";
import { STYLE_TEXTE_DEFAUT } from "./canevas";

/**
 * Mesureur feint : **1 mm par caractère**, quelle que soit la taille. C'est
 * faux typographiquement, et c'est exactement ce qu'on veut dans un test —
 * les largeurs attendues se comptent alors à la main.
 */
const mesurer: MesureTexte = (texte) => texte.length;

const options = (ajouts: Partial<OptionsFlux> = {}): OptionsFlux => ({
  largeur: 20,
  hauteur: 1000,
  mesurer,
  style: {
    corps: { ...STYLE_TEXTE_DEFAUT, taille: 10, interligne: 1.2 },
    couleurTitre: "#2c4a7c",
    fondEntete: "#15181d",
    couleurEntete: "#ffffff",
    bordureTableau: "#d9d9d9",
  },
  ...ajouts,
});

/**
 * Les seules opérations de texte d'un flux.
 *
 * Le paramètre doit porter l'union `OperationFlux`. Avec un simple
 * `{ type: string }`, `Extract<…, { type: "TEXTE" }>` ne retient aucun membre
 * — `string` n'est pas assignable à `"TEXTE"` — et vaut donc `never` : toutes
 * les assertions ci-dessous portaient sur `never[]`, sans rien vérifier. Rien
 * ne le signalait, ni vitest qui ne type-checke pas, ni `next build` qui
 * exclut les tests ; seul `npm run typecheck` le voyait.
 */
const textes = (operations: OperationFlux[]) =>
  operations.filter(
    (o): o is Extract<OperationFlux, { type: "TEXTE" }> => o.type === "TEXTE"
  );

describe("replierEnLignes", () => {
  it("coupe au mot, jamais au milieu", () => {
    expect(replierEnLignes("un deux trois", 9, 10, false, mesurer)).toEqual([
      "un deux",
      "trois",
    ]);
  });

  it("respecte les sauts de ligne voulus", () => {
    expect(replierEnLignes("a\nb", 50, 10, false, mesurer)).toEqual(["a", "b"]);
  });

  it("laisse un mot trop long occuper sa ligne seul", () => {
    // Sinon la découpe bouclerait : cela arrive sur une URL ou une référence.
    expect(replierEnLignes("court motinterminablement", 5, 10, false, mesurer)).toEqual(
      ["court", "motinterminablement"]
    );
  });
});

describe("composerFlux", () => {
  it("empile les paragraphes de haut en bas", () => {
    const { operations, hauteurUtilisee } = composerFlux(
      [
        { type: "PARAGRAPHE", texte: "premier" },
        { type: "PARAGRAPHE", texte: "second" },
      ],
      options()
    );
    const lignes = textes(operations);
    expect(lignes.map((l) => l.texte)).toEqual(["premier", "second"]);
    expect(lignes[1].y).toBeGreaterThan(lignes[0].y);
    expect(hauteurUtilisee).toBeGreaterThan(0);
  });

  it("donne aux titres une taille et une couleur propres", () => {
    const { operations } = composerFlux(
      [
        { type: "TITRE", niveau: 1, texte: "Titre" },
        { type: "PARAGRAPHE", texte: "corps" },
      ],
      options()
    );
    const [titre, corps] = textes(operations);
    expect(titre.taille).toBeGreaterThan(corps.taille);
    expect(titre.gras).toBe(true);
    expect(
      operations.find((o) => o.type === "TEXTE" && o.texte === "Titre")
    ).toMatchObject({ couleur: "#2c4a7c" });
  });

  it("ne commence pas le bloc par un blanc", () => {
    // L'air au-dessus d'un titre sépare du contenu précédent ; en tête de
    // bloc, il ne séparerait de rien.
    const { operations } = composerFlux(
      [{ type: "TITRE", niveau: 1, texte: "Titre" }],
      options()
    );
    expect(textes(operations)[0].y).toBe(0);
  });

  it("pose la puce à part du texte de l'item", () => {
    const { operations } = composerFlux(
      [{ type: "LISTE", ordonnee: false, items: ["un deux trois quatre"] }],
      options({ largeur: 12 })
    );
    const lignes = textes(operations);
    expect(lignes[0].texte).toBe("•");
    expect(lignes[0].x).toBe(0);
    // Les lignes de l'item sont toutes en retrait, y compris la seconde :
    // sans puce séparée, elle serait revenue sous le point.
    const suite = lignes.slice(1);
    expect(suite.length).toBeGreaterThan(1);
    expect(suite.every((l) => l.x > 0)).toBe(true);
  });

  it("numérote une liste ordonnée", () => {
    const { operations } = composerFlux(
      [{ type: "LISTE", ordonnee: true, items: ["a", "b"] }],
      options()
    );
    const puces = textes(operations).filter((l) => /^\d+\.$/.test(l.texte));
    expect(puces.map((p) => p.texte)).toEqual(["1.", "2."]);
  });

  it("répartit les colonnes d'un tableau à égalité", () => {
    const { operations } = composerFlux(
      [{ type: "TABLEAU", entetes: ["A", "B"], lignes: [["1", "2"]] }],
      options({ largeur: 20 })
    );
    const cellules = operations.filter((o) => o.type === "CELLULE");
    expect(cellules).toHaveLength(4);
    expect(cellules.every((c) => c.type === "CELLULE" && c.largeur === 10)).toBe(true);
  });

  it("distingue la rangée d'en-tête", () => {
    const { operations } = composerFlux(
      [{ type: "TABLEAU", entetes: ["A"], lignes: [["1"]] }],
      options()
    );
    const cellules = operations.filter(
      (o): o is Extract<typeof o, { type: "CELLULE" }> => o.type === "CELLULE"
    );
    expect(cellules[0]).toMatchObject({ gras: true, fond: "#15181d" });
    expect(cellules[1]).toMatchObject({ gras: false, fond: "" });
  });

  it("donne à une rangée la hauteur de sa cellule la plus bavarde", () => {
    const { operations } = composerFlux(
      [
        {
          type: "TABLEAU",
          entetes: [],
          lignes: [["court", "un texte bien plus long qui se replie"]],
        },
      ],
      options({ largeur: 20 })
    );
    const cellules = operations.filter(
      (o): o is Extract<typeof o, { type: "CELLULE" }> => o.type === "CELLULE"
    );
    // Les deux cellules d'une même rangée ont la même hauteur, celle du
    // contenu le plus long : sinon la grille se désaligne.
    expect(cellules[0].hauteur).toBe(cellules[1].hauteur);
    expect(cellules[0].hauteur).toBeGreaterThan(5);
  });

  it("insère un espace et un filet", () => {
    const { operations, hauteurUtilisee } = composerFlux(
      [{ type: "ESPACE", hauteur: 8 }, { type: "FILET" }],
      options()
    );
    expect(operations.filter((o) => o.type === "FILET")).toHaveLength(1);
    expect(hauteurUtilisee).toBeGreaterThan(8);
  });

  it("s'arrête au bord du cadre plutôt que de déborder", () => {
    const { operations, hauteurUtilisee, elementsCoupes } = composerFlux(
      Array.from({ length: 50 }, (): ElementFlux => ({
        type: "PARAGRAPHE",
        texte: "ligne",
      })),
      options({ hauteur: 20 })
    );
    expect(hauteurUtilisee).toBeLessThanOrEqual(20.001);
    expect(elementsCoupes).toBeGreaterThan(0);
    expect(operations.length).toBeGreaterThan(0);
  });

  it("compte ce qui n'a pas trouvé sa place", () => {
    // Un contrat tronqué en silence serait pire qu'un contrat qui déborde.
    const { elementsCoupes } = composerFlux(
      [
        { type: "PARAGRAPHE", texte: "tient" },
        { type: "TITRE", niveau: 1, texte: "ne tient pas" },
      ],
      // 10 mm : le paragraphe (4,2 mm) passe, le titre (11,5 mm avec son air)
      // ne passe pas.
      options({ hauteur: 10 })
    );
    expect(elementsCoupes).toBe(1);
  });

  it("ne laisse rien derrière quand un titre ne tient pas", () => {
    // Le curseur doit revenir à sa place : sinon l'air réservé au titre
    // resterait en blanc au bas du bloc.
    const { hauteurUtilisee } = composerFlux(
      [
        { type: "PARAGRAPHE", texte: "a" },
        { type: "TITRE", niveau: 1, texte: "trop tard" },
      ],
      options({ hauteur: 4.3 })
    );
    expect(hauteurUtilisee).toBeLessThanOrEqual(4.301);
  });

  it("rend un flux vide sans rien poser", () => {
    const { operations, hauteurUtilisee, elementsCoupes } = composerFlux([], options());
    expect(operations).toEqual([]);
    expect(hauteurUtilisee).toBe(0);
    expect(elementsCoupes).toBe(0);
  });
});

describe("mesureApprochee", () => {
  it("croît avec la longueur et la taille", () => {
    expect(mesureApprochee("aa", 10, false)).toBeGreaterThan(
      mesureApprochee("a", 10, false)
    );
    expect(mesureApprochee("a", 20, false)).toBeGreaterThan(
      mesureApprochee("a", 10, false)
    );
  });
});


describe("manipulation des éléments", () => {
  const liste: ElementFlux[] = [
    { type: "TITRE", niveau: 1, texte: "A" },
    { type: "PARAGRAPHE", texte: "B" },
    { type: "FILET" },
  ];

  it("déplace un élément vers le haut et vers le bas", () => {
    expect(deplacerElement(liste, 1, "haut").map((e) => e.type)).toEqual([
      "PARAGRAPHE",
      "TITRE",
      "FILET",
    ]);
    expect(deplacerElement(liste, 1, "bas").map((e) => e.type)).toEqual([
      "TITRE",
      "FILET",
      "PARAGRAPHE",
    ]);
  });

  it("ne fait rien aux extrémités ni hors liste", () => {
    expect(deplacerElement(liste, 0, "haut")).toEqual(liste);
    expect(deplacerElement(liste, 2, "bas")).toEqual(liste);
    expect(deplacerElement(liste, 9, "haut")).toEqual(liste);
  });

  it("retire et remplace un élément", () => {
    expect(retirerElement(liste, 1).map((e) => e.type)).toEqual([
      "TITRE",
      "FILET",
    ]);
    expect(remplacerElement(liste, 0, { type: "ESPACE", hauteur: 4 })[0]).toEqual({
      type: "ESPACE",
      hauteur: 4,
    });
  });

  it("fabrique un élément neuf de chaque type", () => {
    for (const type of [
      "TITRE",
      "PARAGRAPHE",
      "LISTE",
      "TABLEAU",
      "ESPACE",
      "FILET",
    ] as const) {
      expect(elementVide(type).type).toBe(type);
    }
  });

  it("nomme chaque élément pour la liste de l'éditeur", () => {
    expect(libelleElement({ type: "TITRE", niveau: 2, texte: "x" })).toBe("Titre 2");
    expect(libelleElement({ type: "LISTE", ordonnee: true, items: [] })).toBe(
      "Liste numérotée"
    );
    expect(
      libelleElement({ type: "TABLEAU", entetes: [], lignes: [["a"], ["b"]] })
    ).toBe("Tableau (2 ligne(s))");
  });
});

describe("saisie au clavier", () => {
  it("lit une liste saisie une ligne par item", () => {
    expect(lignesVersItems("un\n  deux  \n\ntrois")).toEqual([
      "un",
      "deux",
      "trois",
    ]);
  });

  it("garde une entrée vide sur une liste entièrement vidée", () => {
    // Sinon la liste disparaîtrait de l'écran et on ne pourrait plus y taper.
    expect(lignesVersItems("")).toEqual([""]);
    expect(lignesVersItems("\n  \n")).toEqual([""]);
  });

  it("fait l'aller-retour sur les items", () => {
    expect(lignesVersItems(itemsVersLignes(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("lit un tableau séparé par des barres, première rangée en en-tête", () => {
    expect(texteVersTableau("Point | Décision\nBudget | Adopté")).toEqual({
      entetes: ["Point", "Décision"],
      lignes: [["Budget", "Adopté"]],
    });
  });

  it("écarte les rangées vides", () => {
    expect(texteVersTableau("A | B\n\n |  \nC | D").lignes).toEqual([["C", "D"]]);
  });

  it("rend un tableau vide sur une saisie vide", () => {
    expect(texteVersTableau("")).toEqual({ entetes: [], lignes: [] });
  });

  it("fait l'aller-retour sur un tableau", () => {
    const tableau = { entetes: ["A", "B"], lignes: [["1", "2"]] };
    expect(texteVersTableau(tableauVersTexte(tableau))).toEqual(tableau);
  });
});
