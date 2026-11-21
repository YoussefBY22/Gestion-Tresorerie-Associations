import { describe, expect, it } from "vitest";
import {
  centiemesEnPoints,
  diapositiveVersCanevas,
  emuEnMm,
  rapporterPresentation,
  styleDominant,
  texteDeLaForme,
  type DiapositivePresentation,
  type FormePresentation,
} from "./import-presentation";
import type { BlocImage, BlocTexte } from "./canevas";

const forme = (ajouts: Partial<FormePresentation> = {}): FormePresentation => ({
  x: 10,
  y: 20,
  largeur: 50,
  hauteur: 15,
  rang: 0,
  passages: [],
  ...ajouts,
});

const diapo = (
  formes: FormePresentation[],
  ajouts: Partial<DiapositivePresentation> = {}
): DiapositivePresentation => ({
  nom: "Diapositive 1",
  largeur: 254,
  hauteur: 142.9,
  formes,
  ...ajouts,
});

const textes = (blocs: { type: string }[]) =>
  blocs.filter((b): b is BlocTexte => b.type === "TEXTE");

describe("unités d'OOXML", () => {
  it("convertit les EMU en millimètres sans arrondi", () => {
    // 914 400 EMU valent un pouce, soit exactement 25,4 mm.
    expect(emuEnMm(914400)).toBeCloseTo(25.4, 10);
    expect(emuEnMm(0)).toBe(0);
  });

  it("convertit les centièmes de point en points", () => {
    expect(centiemesEnPoints(1200)).toBe(12);
  });
});

describe("texteDeLaForme", () => {
  it("met les passages bout à bout", () => {
    expect(
      texteDeLaForme(
        forme({ passages: [{ texte: "Nom : " }, { texte: "Amicale" }] })
      )
    ).toBe("Nom : Amicale");
  });

  it("ramène les espaces insécables à des espaces ordinaires", () => {
    expect(texteDeLaForme(forme({ passages: [{ texte: "30 DT" }] }))).toBe(
      "30 DT"
    );
  });
});

describe("styleDominant", () => {
  it("retient le style du passage le plus long", () => {
    // « Nom : » en gras suivi d'une longue valeur en maigre : c'est la valeur
    // qui donne son allure à la ligne.
    const choisi = styleDominant([
      { texte: "Nom : ", gras: true },
      { texte: "Amicale des anciens", gras: false },
    ]);
    expect(choisi?.gras).toBe(false);
  });

  it("ignore les passages vides", () => {
    expect(styleDominant([{ texte: "   " }, { texte: "A", gras: true }])?.gras).toBe(
      true
    );
  });

  it("rend null quand rien n'est écrit", () => {
    expect(styleDominant([{ texte: "" }])).toBeNull();
  });
});

describe("diapositiveVersCanevas", () => {
  it("garde les coordonnées telles quelles", () => {
    const canevas = diapositiveVersCanevas(
      diapo([forme({ passages: [{ texte: "Titre" }] })])
    );
    const bloc = textes(canevas.blocs)[0];
    expect(bloc.x).toBe(10);
    expect(bloc.y).toBe(20);
    expect(bloc.largeur).toBe(50);
  });

  it("prend la taille de la diapositive comme taille de page", () => {
    const canevas = diapositiveVersCanevas(diapo([]));
    expect(canevas.largeur).toBe(254);
    expect(canevas.hauteur).toBeCloseTo(142.9);
  });

  it("respecte l'ordre d'empilement de la diapositive", () => {
    const canevas = diapositiveVersCanevas(
      diapo([
        forme({ rang: 2, passages: [{ texte: "Devant" }] }),
        forme({ rang: 0, passages: [{ texte: "Derrière" }] }),
      ])
    );
    const ordonnes = [...canevas.blocs].sort((a, b) => a.plan - b.plan);
    expect((ordonnes[0] as BlocTexte).contenu).toBe("Derrière");
    expect((ordonnes[1] as BlocTexte).contenu).toBe("Devant");
  });

  it("fait un aplat d'une forme colorée sans texte", () => {
    const canevas = diapositiveVersCanevas(diapo([forme({ fond: "#2c4a7c" })]));
    expect(canevas.blocs[0].type).toBe("RECTANGLE");
  });

  it("écarte une forme qui ne porte rien", () => {
    expect(diapositiveVersCanevas(diapo([forme()])).blocs).toHaveLength(0);
  });

  it("fait une image d'une forme qui en porte une", () => {
    const canevas = diapositiveVersCanevas(
      diapo([forme({ fichierId: "abc", nomFichier: "cachet.png" })])
    );
    const image = canevas.blocs[0] as BlocImage;
    expect(image.type).toBe("IMAGE");
    expect(image.fichierId).toBe("abc");
    expect(image.ajustement).toBe("contenir");
  });

  it("met la diapositive à l'échelle sans la déformer", () => {
    // 254 × 142,9 posés sur un A4 portrait : le facteur suit la largeur, et
    // le même s'applique en hauteur pour ne pas écraser les logos.
    const canevas = diapositiveVersCanevas(
      diapo([forme({ x: 127, y: 71.45, largeur: 127, hauteur: 71.45, passages: [{ texte: "A" }] })]),
      { page: { largeur: 210, hauteur: 297 }, ajusterALaPage: true }
    );
    const bloc = textes(canevas.blocs)[0];
    const facteur = 210 / 254;
    expect(bloc.x).toBeCloseTo(127 * facteur, 5);
    expect(bloc.y).toBeCloseTo(71.45 * facteur, 5);
    expect(bloc.largeur / bloc.hauteur).toBeCloseTo(127 / 71.45, 5);
  });

  it("met aussi la taille du texte à l'échelle", () => {
    const canevas = diapositiveVersCanevas(
      diapo([forme({ passages: [{ texte: "A", taille: 20 }] })]),
      { page: { largeur: 127, hauteur: 297 }, ajusterALaPage: true }
    );
    // Réduire la page de moitié sans réduire le texte le ferait déborder.
    expect(textes(canevas.blocs)[0].style.taille).toBeCloseTo(10, 5);
  });
});

describe("rapporterPresentation", () => {
  it("signale les rotations, non reprises", () => {
    const source = diapo([
      forme({ rotation: 45, passages: [{ texte: "Oblique" }] }),
      forme({ rotation: 0, passages: [{ texte: "Droit" }] }),
    ]);
    expect(
      rapporterPresentation(source, diapositiveVersCanevas(source)).rotationsIgnorees
    ).toBe(1);
  });

  it("signale les formes à plusieurs mises en forme", () => {
    const source = diapo([
      forme({
        passages: [
          { texte: "Nom : ", gras: true },
          { texte: "valeur", gras: false },
        ],
      }),
      forme({ passages: [{ texte: "Homogène", gras: true }] }),
    ]);
    expect(
      rapporterPresentation(source, diapositiveVersCanevas(source)).stylesMelanges
    ).toBe(1);
  });

  it("compte ce qui déborde de la page", () => {
    const source = diapo([forme({ x: 240, largeur: 50, passages: [{ texte: "A" }] })]);
    const canevas = diapositiveVersCanevas(source, {
      page: { largeur: 210, hauteur: 297 },
    });
    expect(rapporterPresentation(source, canevas).horsPage).toBe(1);
  });
});
