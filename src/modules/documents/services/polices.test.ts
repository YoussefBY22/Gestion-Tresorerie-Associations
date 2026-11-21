import { beforeAll, describe, expect, it } from "vitest";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { embarquerPolices } from "./polices";
import { rendrePdf } from "./rendu";
import { structureDApercu } from "./apercu-charte";

/**
 * La police de la charte doit vraiment se retrouver dans le fichier produit.
 *
 * Le repli sur Helvetica est silencieux par conception — mieux vaut une pièce
 * dans la mauvaise police qu'une pièce absente — mais c'est précisément ce qui
 * le rend dangereux : tous les documents de la JE pourraient sortir en
 * Helvetica pendant des mois sans que personne ne le remarque. D'où ce test.
 */

/**
 * Noms des polices déclarées dans le PDF.
 *
 * pdf-lib range les dictionnaires dans des flux compressés : chercher
 * « Montserrat » en clair dans le fichier ne donne rien, il faut décompresser
 * ce qui peut l'être avant de regarder.
 */
function nomsDePolices(pdf: Uint8Array): string[] {
  const buf = Buffer.from(pdf);
  const texte = buf.toString("latin1");
  const noms = new Set<string>();

  const ajouter = (contenu: string) => {
    for (const trouve of contenu.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g)) {
      // Le sous-ensemble préfixe le nom : « ABCDEF+Montserrat-Regular ».
      noms.add(trouve[1].replace(/^[A-Z]{6}\+/, "").split("-")[0]);
    }
  };

  ajouter(texte);
  let curseur = texte.indexOf("stream");
  while (curseur >= 0) {
    const depart = texte.indexOf("\n", curseur) + 1;
    const fin = texte.indexOf("endstream", depart);
    if (depart > 0 && fin > depart) {
      try {
        ajouter(zlib.inflateSync(buf.subarray(depart, fin)).toString("latin1"));
      } catch {
        // Flux non compressé, ou données binaires : rien à y lire.
      }
    }
    curseur = texte.indexOf("stream", curseur + 6);
  }
  return [...noms];
}

describe("polices des documents", () => {
  let pdfRecu: Uint8Array;

  beforeAll(async () => {
    pdfRecu = await rendrePdf(structureDApercu("RECU_COTISATION"));
  });

  it("embarque Montserrat et non le repli Helvetica", async () => {
    const pdf = await PDFDocument.create();
    const polices = await embarquerPolices(pdf);

    expect(polices.montserrat).toBe(true);
    expect(polices.normale.name).toContain("Montserrat");
    expect(polices.grasse.name).toContain("Montserrat");
    expect(polices.italique.name).toContain("Montserrat");
  });

  it("déclare Montserrat dans le PDF produit, et pas Helvetica", () => {
    const noms = nomsDePolices(pdfRecu);
    expect(noms).toContain("Montserrat");
    expect(noms).not.toContain("Helvetica");
  });

  it("ne garde que les glyphes utilisés : le fichier reste léger", () => {
    // Les trois graisses pèsent ~1 Mo sur le disque. Sans sous-ensemble, le
    // moindre reçu les embarquerait en entier.
    expect(pdfRecu.length).toBeLessThan(300_000);
    // Et assez lourd quand même pour qu'une police y soit : un PDF en
    // Helvetica seule, qui n'embarque rien, tient en quelques kilo-octets.
    expect(pdfRecu.length).toBeGreaterThan(15_000);
  });

  it("écrit les accents français sans les escamoter", async () => {
    const octets = await rendrePdf({
      titre: "Reçu de cotisation",
      reference: "RC001-COT-2627",
      date: "09/08/2026",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Éàèùçôî — les accents, l'apostrophe et le tiret cadratin doivent passer.",
        },
      ],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe("%PDF-");
    expect(octets.length).toBeGreaterThan(1000);
  });
});
