import { describe, expect, it } from "vitest";
import { htmlVersFlux, texteBrut } from "./import-texte";

describe("texteBrut", () => {
  it("retire les balises et garde le texte", () => {
    expect(texteBrut("<p>Un <strong>mot</strong> en gras</p>")).toBe(
      "Un mot en gras"
    );
  });

  it("fait d'un saut forcé un vrai saut de ligne", () => {
    expect(texteBrut("a<br/>b")).toBe("a\nb");
  });

  it("décode les entités, nommées comme numériques", () => {
    expect(texteBrut("S&eacute;ance &amp; d&#233;bat &laquo;&nbsp;ici&nbsp;&raquo;")).toBe(
      "Séance & débat « ici »"
    );
  });

  it("réduit les espaces en trop sans manger les sauts de ligne", () => {
    expect(texteBrut("  a     b  <br/>   c  ")).toBe("a b\nc");
  });
});

describe("htmlVersFlux", () => {
  it("garde l'ordre du document", () => {
    // Un titre suivi d'une liste puis d'un tableau doit rester dans cet
    // ordre, sinon un procès-verbal devient illisible.
    const { elements } = htmlVersFlux(
      `<h1>Titre</h1><p>Texte</p><ul><li>a</li></ul><table><tr><td>x</td></tr></table>`
    );
    expect(elements.map((e) => e.type)).toEqual([
      "TITRE",
      "PARAGRAPHE",
      "LISTE",
      "TABLEAU",
    ]);
  });

  it("ramène les titres à trois niveaux", () => {
    // Word va jusqu'à h6 ; au-delà de trois niveaux la hiérarchie ne se voit
    // plus à l'œil.
    const { elements } = htmlVersFlux("<h1>A</h1><h3>B</h3><h5>C</h5>");
    expect(elements.map((e) => (e.type === "TITRE" ? e.niveau : null))).toEqual([
      1, 3, 3,
    ]);
  });

  it("fait un espace d'un paragraphe vide", () => {
    // Word sème des paragraphes vides en guise d'aération : les jeter
    // tasserait le document.
    const { elements } = htmlVersFlux("<p>a</p><p></p><p>b</p>");
    expect(elements.map((e) => e.type)).toEqual([
      "PARAGRAPHE",
      "ESPACE",
      "PARAGRAPHE",
    ]);
  });

  it("distingue liste à puces et liste numérotée", () => {
    const { elements } = htmlVersFlux(
      "<ul><li>a</li></ul><ol><li>b</li><li>c</li></ol>"
    );
    expect(elements).toEqual([
      { type: "LISTE", ordonnee: false, items: ["a"] },
      { type: "LISTE", ordonnee: true, items: ["b", "c"] },
    ]);
  });

  it("écarte une liste sans contenu", () => {
    expect(htmlVersFlux("<ul><li></li></ul>").elements).toEqual([]);
  });

  it("reconnaît l'en-tête d'un tableau", () => {
    const { elements } = htmlVersFlux(
      "<table><tr><th>Point</th><th>Décision</th></tr><tr><td>Budget</td><td>Adopté</td></tr></table>"
    );
    expect(elements[0]).toEqual({
      type: "TABLEAU",
      entetes: ["Point", "Décision"],
      lignes: [["Budget", "Adopté"]],
    });
  });

  it("ne prend pas la seule rangée d'un tableau pour son en-tête", () => {
    // Word emploie un tableau d'une rangée comme encadré — une clause
    // d'engagement à signer, un cartouche. La prendre pour un en-tête vidait
    // le tableau de son corps : le texte se retrouvait en titre de colonne,
    // sous un tableau sans aucune ligne.
    const { elements } = htmlVersFlux(
      "<table><thead><tr><th>Je soussigné…</th><th>Signature :</th></tr></thead></table>"
    );
    expect(elements[0]).toEqual({
      type: "TABLEAU",
      entetes: [],
      lignes: [["Je soussigné…", "Signature :"]],
    });
  });

  it("garde toutes les rangées quand il n'y a pas d'en-tête", () => {
    const { elements } = htmlVersFlux(
      "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"
    );
    expect(elements[0]).toEqual({
      type: "TABLEAU",
      entetes: [],
      lignes: [["a"], ["b"]],
    });
  });

  it("compte les images au lieu de les faire disparaître", () => {
    // Un bloc en flux ne place pas d'illustration : on le dit.
    const { elements, rapport } = htmlVersFlux(
      '<p>Avant</p><img src="x.png"/><p>Après</p>'
    );
    expect(rapport.imagesIgnorees).toBe(1);
    expect(elements).toHaveLength(2);
  });

  it("rend un compte rendu de ce qui est entré", () => {
    const { rapport } = htmlVersFlux(
      "<h1>T</h1><p>p</p><ul><li>i</li></ul><table><tr><td>c</td></tr></table>"
    );
    expect(rapport).toMatchObject({
      elements: 4,
      titres: 1,
      listes: 1,
      tableaux: 1,
      imagesIgnorees: 0,
    });
  });

  it("ne bute pas sur du HTML vide ou sans bloc reconnu", () => {
    expect(htmlVersFlux("").elements).toEqual([]);
    expect(htmlVersFlux("<div><span>nu</span></div>").elements).toEqual([]);
  });

  it("conserve les jetons posés dans le document Word", () => {
    // Le modèle peut déjà contenir « {{cotisant}} » : l'import ne doit pas
    // l'abîmer, c'est le lien avec les données.
    const { elements } = htmlVersFlux("<p>Nom : {{cotisant}}</p>");
    expect(elements[0]).toEqual({
      type: "PARAGRAPHE",
      texte: "Nom : {{cotisant}}",
    });
  });
});
