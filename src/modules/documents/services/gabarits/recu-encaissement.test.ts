import { describe, expect, it } from "vitest";
import {
  LIBELLES_RECU,
  construireRecuEncaissement,
  type NatureRecu,
} from "./recu-encaissement";
import { CATALOGUE_DOCUMENTS } from "../../catalogue";
import { rendrePdf } from "../rendu";

const base = {
  reference: "RC001-DON-2526",
  nature: "RECU_DON" as NatureRecu,
  tiers: "Fondation Tunisie Numérique",
  montant: 500,
  date: new Date(2026, 4, 12),
  objet: "Don de soutien",
  modePaiement: "Virement",
  mandat: "2025-2026",
  emetteur: "Mariem Cherif",
};

describe("construireRecuEncaissement", () => {
  it("adapte le titre et l'attestation à la nature du reçu", () => {
    expect(construireRecuEncaissement(base).titre).toBe("Reçu de don");
    expect(
      construireRecuEncaissement({ ...base, nature: "RECU_PRODUIT" }).titre
    ).toBe("Reçu de vente");
    expect(
      construireRecuEncaissement({ ...base, nature: "RECU_INTEGRATION" }).titre
    ).toBe("Reçu d'intégration");
  });

  it("porte la mention légale du registre des dons", () => {
    // Le registre des dons est une obligation du décret-loi 2011-88 : la
    // mention doit apparaître sur la pièce, pas seulement dans le registre.
    expect(construireRecuEncaissement(base).mentionPied).toMatch(/2011-88/);
    expect(
      construireRecuEncaissement({ ...base, nature: "RECU_PRODUIT" })
        .mentionPied
    ).toBeUndefined();
  });

  it("retombe sur l'objet par défaut de la nature si la catégorie est vide", () => {
    const sansObjet = construireRecuEncaissement({ ...base, objet: "   " });
    const champs = sansObjet.blocs.filter((b) => b.type === "champs");
    const objet = champs
      .flatMap((b) => ("items" in b ? b.items : []))
      .find((i) => i.label === "Objet");
    expect(objet?.valeur).toBe("Don");
  });

  it("n'affiche le bloc observations que s'il y a des notes", () => {
    const labels = (notes?: string) =>
      construireRecuEncaissement({ ...base, notes })
        .blocs.filter((b) => b.type === "champs")
        .flatMap((b) => ("items" in b ? b.items.map((i) => i.label) : []));
    expect(labels()).not.toContain("Observations");
    expect(labels("   ")).not.toContain("Observations");
    expect(labels("Chèque n° 4412")).toContain("Observations");
  });

  it("écrit le montant en toutes lettres", () => {
    const encadre = construireRecuEncaissement(base).blocs.find(
      (b) => b.type === "encadre"
    );
    expect(encadre && "texte" in encadre && encadre.texte).toBe(
      "Cinq cents dinars."
    );
  });

  it("se rend en PDF pour chaque nature", async () => {
    for (const nature of Object.keys(LIBELLES_RECU) as NatureRecu[]) {
      const pdf = await rendrePdf(
        construireRecuEncaissement({ ...base, nature })
      );
      expect(pdf.byteLength).toBeGreaterThan(1000);
    }
  });
});

describe("cohérence catalogue ↔ gabarit", () => {
  it("chaque nature de reçu a son entrée disponible au catalogue", () => {
    for (const nature of Object.keys(LIBELLES_RECU)) {
      const modele = CATALOGUE_DOCUMENTS.find((m) => m.code === nature);
      expect(modele, `modèle ${nature} absent du catalogue`).toBeDefined();
      expect(modele!.disponible, `modèle ${nature} non disponible`).toBe(true);
    }
  });

  it("les séries de numérotation des reçus sont distinctes", () => {
    const formats = CATALOGUE_DOCUMENTS.filter(
      (m) => m.categorie === "RECU"
    ).map((m) => m.formatReference);
    // Deux familles qui partageraient un format partageraient un compteur :
    // on se retrouverait avec deux pièces différentes portant le même numéro.
    expect(new Set(formats).size).toBe(formats.length);
  });
});
