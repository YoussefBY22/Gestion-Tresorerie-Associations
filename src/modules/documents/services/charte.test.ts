import { describe, expect, it } from "vitest";
import {
  charteApplicable,
  CHARTE_DEFAUT,
  completerCharte,
  estCouleurValide,
  hexVersRvb,
  HAUTEUR_BANDEAU,
  luminance,
  texteLisibleSur,
} from "./charte";

describe("hexVersRvb", () => {
  it("convertit une couleur à six chiffres", () => {
    expect(hexVersRvb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexVersRvb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("accepte la forme courte et l'absence de dièse", () => {
    expect(hexVersRvb("#fff")).toEqual(hexVersRvb("#ffffff"));
    expect(hexVersRvb("2c4a7c")).toEqual(hexVersRvb("#2c4a7c"));
  });

  it("retombe sur le repli plutôt que de rendre NaN", () => {
    expect(hexVersRvb("mauve", "#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexVersRvb("")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("rend la couleur de la charte en composantes 0–1", () => {
    // #2c4a7c = (44, 74, 124) sur 255.
    const { r, g, b } = hexVersRvb("#2c4a7c");
    expect(r).toBeCloseTo(44 / 255, 3);
    expect(g).toBeCloseTo(74 / 255, 3);
    expect(b).toBeCloseTo(124 / 255, 3);
  });
});

describe("estCouleurValide", () => {
  it("distingue une couleur d'un mot", () => {
    expect(estCouleurValide("#2c4a7c")).toBe(true);
    expect(estCouleurValide("#abc")).toBe(true);
    expect(estCouleurValide("rouge")).toBe(false);
    expect(estCouleurValide("#12345")).toBe(false);
  });
});

describe("texteLisibleSur", () => {
  it("pose du blanc sur un aplat foncé", () => {
    expect(texteLisibleSur("#2c4a7c")).toBe("#ffffff");
    expect(texteLisibleSur("#000000")).toBe("#ffffff");
  });

  it("pose du sombre sur un aplat clair", () => {
    // Un bandeau jaune avec du texte blanc est illisible, et personne ne
    // pense à corriger la couleur du texte à la main.
    expect(texteLisibleSur("#ffe14d")).toBe("#1a1a1a");
    expect(texteLisibleSur("#ffffff")).toBe("#1a1a1a");
  });

  it("classe les luminances dans le bon ordre", () => {
    expect(luminance("#ffffff")).toBeGreaterThan(luminance("#2c4a7c"));
  });
});

describe("completerCharte", () => {
  it("rend la charte livrée quand rien n'est fourni", () => {
    expect(completerCharte(null).couleurPrimaire).toBe(
      CHARTE_DEFAUT.couleurPrimaire
    );
    expect(completerCharte(undefined).nomEmetteur).toBe(
      CHARTE_DEFAUT.nomEmetteur
    );
  });

  it("ignore une couleur invalide au lieu de casser le rendu", () => {
    const charte = completerCharte({ couleurPrimaire: "pas une couleur" });
    expect(charte.couleurPrimaire).toBe(CHARTE_DEFAUT.couleurPrimaire);
  });

  it("déduit la couleur du texte du bandeau quand elle manque", () => {
    const clair = completerCharte({
      couleurPrimaire: "#ffe14d",
      couleurSurPrimaire: "",
    });
    expect(clair.couleurSurPrimaire).toBe("#1a1a1a");
  });

  it("respecte une couleur de texte de bandeau choisie exprès", () => {
    const charte = completerCharte({
      couleurPrimaire: "#ffe14d",
      couleurSurPrimaire: "#ffffff",
    });
    expect(charte.couleurSurPrimaire).toBe("#ffffff");
  });

  it("borne la hauteur du bandeau", () => {
    expect(completerCharte({ hauteurBandeau: 5 }).hauteurBandeau).toBe(
      HAUTEUR_BANDEAU.min
    );
    expect(completerCharte({ hauteurBandeau: 400 }).hauteurBandeau).toBe(
      HAUTEUR_BANDEAU.max
    );
  });

  it("écarte les mentions de pied vides", () => {
    const charte = completerCharte({
      mentions: ["MF 1234567/A", "   ", ""],
    });
    expect(charte.mentions).toEqual(["MF 1234567/A"]);
  });
});

describe("charteApplicable", () => {
  const chartes = [
    { nom: "Factures", modeles: ["FACTURE_CLIENT"], parDefaut: false },
    { nom: "Maison", modeles: [], parDefaut: true },
  ];

  it("préfère la charte qui vise explicitement le modèle", () => {
    expect(charteApplicable(chartes, "FACTURE_CLIENT")?.nom).toBe("Factures");
  });

  it("retombe sur la charte par défaut pour le reste", () => {
    expect(charteApplicable(chartes, "RECU_COTISATION")?.nom).toBe("Maison");
  });

  it("rend null quand aucune charte ne s'applique", () => {
    expect(
      charteApplicable(
        [{ nom: "Factures", modeles: ["FACTURE_CLIENT"], parDefaut: false }],
        "RECU_DON"
      )
    ).toBeNull();
  });
});
