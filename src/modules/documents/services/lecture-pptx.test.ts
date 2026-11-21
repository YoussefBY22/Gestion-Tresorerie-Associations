import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  diapositivesDisponibles,
  lireDiapositive,
  ouvrirPresentation,
} from "./lecture-pptx";
import { diapositiveVersCanevas } from "./import-presentation";
import { rendreCanevas } from "./rendu-canevas";
import type {
  BlocImage,
  BlocRectangle,
  BlocTableau,
  BlocTexte,
} from "./canevas";

/**
 * Le lecteur est éprouvé sur un `.pptx` **fabriqué ici**, plutôt que sur un
 * fichier d'exemple qu'il faudrait transporter. Les balises posées sont
 * celles qu'écrivent PowerPoint et Google Slides : position en EMU, taille de
 * police en centièmes de point, couleur en `srgbClr`, image par relation.
 */

/** PNG 1×1 valide — suffit à prouver qu'une image est reliée et embarquée. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const encoder = new TextEncoder();

/** 914 400 EMU = 25,4 mm. */
const MM = 914400 / 25.4;
const emu = (mm: number) => Math.round(mm * MM);

function diapositiveXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>

    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Bandeau de titre"/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(12)}" y="${emu(10)}"/><a:ext cx="${emu(186)}" cy="${emu(15)}"/></a:xfrm>
        <a:solidFill><a:srgbClr val="15181D"/></a:solidFill>
        <a:ln w="${emu(0.4)}"><a:solidFill><a:srgbClr val="2C4A7C"/></a:solidFill></a:ln>
      </p:spPr>
      <p:txBody>
        <a:bodyPr anchor="ctr"/>
        <a:p>
          <a:pPr algn="ctr"/>
          <a:r><a:rPr sz="1400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>CERTIFICAT DE FORMATION</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>

    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Mention"/></p:nvSpPr>
      <p:spPr>
        <a:xfrm rot="2700000"><a:off x="${emu(20)}" y="${emu(40)}"/><a:ext cx="${emu(90)}" cy="${emu(8)}"/></a:xfrm>
      </p:spPr>
      <p:txBody>
        <a:bodyPr/>
        <a:p>
          <a:r><a:rPr b="1"><a:solidFill><a:srgbClr val="2C4A7C"/></a:solidFill></a:rPr><a:t>Nom : </a:t></a:r>
          <a:r><a:rPr sz="1100"/><a:t>Exemple d'apprenant</a:t></a:r>
        </a:p>
        <a:p><a:r><a:rPr sz="900"/><a:t>Deuxième ligne</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>

    <p:sp>
      <p:nvSpPr><p:cNvPr id="4" name="Aplat sans texte"/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(12)}" y="${emu(28)}"/><a:ext cx="${emu(186)}" cy="${emu(2)}"/></a:xfrm>
        <a:solidFill><a:srgbClr val="2C4A7C"/></a:solidFill>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:p/></p:txBody>
    </p:sp>

    <p:sp>
      <p:nvSpPr><p:cNvPr id="5" name="Posée par le gabarit"/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:p><a:r><a:rPr/><a:t>Sans géométrie</a:t></a:r></a:p></p:txBody>
    </p:sp>

    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="7" name="Détail"/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="${emu(12)}" y="${emu(60)}"/><a:ext cx="${emu(186)}" cy="${emu(30)}"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid>
            <a:gridCol w="${emu(93)}"/><a:gridCol w="${emu(46.5)}"/><a:gridCol w="${emu(46.5)}"/>
          </a:tblGrid>
          <a:tr h="${emu(10)}">
            <a:tc><a:txBody><a:p><a:r><a:t>Désignation</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>Quantité</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>Prix</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
          <a:tr h="${emu(10)}">
            <a:tc><a:txBody><a:p><a:r><a:t>Cotisation </a:t></a:r><a:r><a:t>annuelle</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>

    <p:pic>
      <p:nvPicPr><p:cNvPr id="6" name="Cachet"/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
      <p:spPr>
        <a:xfrm><a:off x="${emu(150)}" y="${emu(100)}"/><a:ext cx="${emu(35)}" cy="${emu(25)}"/></a:xfrm>
      </p:spPr>
    </p:pic>

  </p:spTree></p:cSld>
</p:sld>`;
}

function presentationPptx(): Uint8Array {
  return zipSync({
    "ppt/presentation.xml": encoder.encode(
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="${emu(210)}" cy="${emu(297)}"/></p:presentation>`
    ),
    "ppt/slides/slide1.xml": encoder.encode(diapositiveXml()),
    "ppt/slides/_rels/slide1.xml.rels": encoder.encode(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`
    ),
    "ppt/media/image1.png": new Uint8Array(PNG),
  });
}

describe("lecture d'un .pptx", () => {
  const archive = ouvrirPresentation(presentationPptx());
  const { diapositive, images } = lireDiapositive(archive, 1);
  const parNom = (nom: string) =>
    diapositive.formes.find((f) => f.nom === nom);

  it("refuse un fichier qui n'est pas une archive", () => {
    expect(() => ouvrirPresentation(encoder.encode("ceci n'est pas un zip"))).toThrow(
      /\.pptx/
    );
  });

  it("recense les diapositives et leurs formes", () => {
    // Quatre `p:sp`, une image, un tableau : le tableau compte aussi, sans
    // quoi le décompte annoncé avant l'import ne correspond pas au contenu.
    expect(diapositivesDisponibles(archive)).toEqual([{ numero: 1, formes: 6 }]);
  });

  it("lit la taille de la diapositive", () => {
    expect(diapositive.largeur).toBeCloseTo(210, 1);
    expect(diapositive.hauteur).toBeCloseTo(297, 1);
  });

  it("convertit les EMU en millimètres", () => {
    const bandeau = parNom("Bandeau de titre")!;
    expect(bandeau.x).toBeCloseTo(12, 1);
    expect(bandeau.y).toBeCloseTo(10, 1);
    expect(bandeau.largeur).toBeCloseTo(186, 1);
    expect(bandeau.hauteur).toBeCloseTo(15, 1);
  });

  it("lit le texte, la taille en centièmes de point, la graisse et les couleurs", () => {
    const bandeau = parNom("Bandeau de titre")!;
    expect(bandeau.passages[0]).toMatchObject({
      texte: "CERTIFICAT DE FORMATION",
      gras: true,
      taille: 14,
      couleur: "#ffffff",
    });
    expect(bandeau.fond).toBe("#15181d");
    expect(bandeau.contour).toBe("#2c4a7c");
  });

  it("lit les alignements horizontal et vertical", () => {
    const bandeau = parNom("Bandeau de titre")!;
    expect(bandeau.alignement).toBe("centre");
    expect(bandeau.alignementVertical).toBe("milieu");
  });

  it("garde les passages séparés et sépare les paragraphes", () => {
    const mention = parNom("Mention")!;
    expect(mention.passages.map((p) => p.texte)).toEqual([
      "Nom : ",
      "Exemple d'apprenant",
      "\n",
      "Deuxième ligne",
    ]);
    expect(mention.passages[0].gras).toBe(true);
    expect(mention.passages[1].gras).toBe(false);
  });

  it("relève la rotation en degrés", () => {
    // OOXML compte en 60 000e de degré : 2 700 000 valent 45°.
    expect(parNom("Mention")!.rotation).toBeCloseTo(45, 5);
  });

  it("écarte une forme sans géométrie propre", () => {
    // Posée par le gabarit de la diapositive : sans coordonnées, on ne peut
    // pas la placer, et inventer une position serait pire que l'omettre.
    expect(parNom("Posée par le gabarit")).toBeUndefined();
  });

  it("relie une image à son fichier par la relation", () => {
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ nom: "image1.png", type: "png", relation: "rId2" });
    expect(images[0].octets.length).toBeGreaterThan(0);
    expect(parNom("Cachet")!.fichierId).toBe("rId2");
  });

  it("ignore une couleur de thème au lieu d'en inventer une", () => {
    const archiveTheme = ouvrirPresentation(
      zipSync({
        "ppt/presentation.xml": encoder.encode(
          `<?xml version="1.0"?><p:presentation xmlns:p="x"><p:sldSz cx="${emu(210)}" cy="${emu(297)}"/></p:presentation>`
        ),
        "ppt/slides/slide1.xml": encoder.encode(
          `<?xml version="1.0"?><p:sld xmlns:p="x" xmlns:a="y"><p:cSld><p:spTree><p:sp>
             <p:nvSpPr><p:cNvPr id="2" name="Thème"/></p:nvSpPr>
             <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(50)}" cy="${emu(10)}"/></a:xfrm>
             <a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr>
             <p:txBody><a:bodyPr/><a:p><a:r><a:rPr/><a:t>Texte</a:t></a:r></a:p></p:txBody>
           </p:sp></p:spTree></p:cSld></p:sld>`
        ),
      })
    );
    expect(lireDiapositive(archiveTheme, 1).diapositive.formes[0].fond).toBeUndefined();
  });
});

describe("de la diapositive au PDF", () => {
  it("produit un canevas puis un PDF valide", async () => {
    const archive = ouvrirPresentation(presentationPptx());
    const { diapositive, images } = lireDiapositive(archive, 1);

    const canevas = diapositiveVersCanevas(diapositive);
    const types = canevas.blocs.map((b) => b.type);
    expect(types).toContain("TEXTE");
    expect(types).toContain("RECTANGLE");
    expect(types).toContain("IMAGE");

    const aplat = canevas.blocs.find(
      (b): b is BlocRectangle => b.type === "RECTANGLE"
    );
    expect(aplat!.encadrement.fond).toBe("#2c4a7c");

    const titre = canevas.blocs.find(
      (b): b is BlocTexte => b.type === "TEXTE" && b.contenu.startsWith("CERTIFICAT")
    );
    expect(titre!.style.taille).toBe(14);

    const image = canevas.blocs.find((b): b is BlocImage => b.type === "IMAGE");
    expect(image!.plan).toBeGreaterThan(titre!.plan);

    // Un tableau PowerPoint n'est ni une forme ni une image : sans sa
    // lecture, la grille d'un reçu disparaissait de l'import en silence.
    const tableau = canevas.blocs.find(
      (b): b is BlocTableau => b.type === "TABLEAU"
    );
    expect(tableau).toBeDefined();
    expect(tableau!.nom).toBe("Détail");
    // Largeurs rapportées à la colonne la plus étroite, pas en EMU bruts.
    expect(tableau!.colonnes.map((c) => c.part)).toEqual([2, 1, 1]);
    expect(tableau!.colonnes.map((c) => c.entete)).toEqual([
      "Désignation",
      "Quantité",
      "Prix",
    ]);
    // Les passages d'une cellule sont recollés, et la rangée courte est
    // complétée : le bloc attend une grille régulière.
    expect(tableau!.lignesManuelles).toEqual([
      ["Cotisation annuelle", "1", ""],
    ]);

    const pdf = await rendreCanevas(canevas, {
      images: new Map(
        images.map((i) => [i.relation, { octets: i.octets, type: i.type }])
      ),
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  }, 60_000);
});
