import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { PDFDocument } from "pdf-lib";

/**
 * Test d'intégration de la chaîne d'émission — le seul endroit où l'on
 * vérifie ce qui ne peut pas l'être en logique pure : l'atomicité du compteur,
 * le garde-fou anti-doublon et l'aller-retour GridFS.
 *
 * Il tourne sur une base en mémoire : aucune dépendance à Atlas, aucun secret.
 */

let serveur: MongoMemoryServer;
// Modules importés après avoir renseigné MONGODB_URI, car `connectDb()` lit
// la variable d'environnement au moment de l'appel.
let mongoose: typeof import("mongoose");
let emettreDocument: typeof import("./emission").emettreDocument;
let DocumentDejaEmis: typeof import("./emission").DocumentDejaEmis;
let prochaineSequence: typeof import("../models").prochaineSequence;
let lireFichier: typeof import("./stockage").lireFichier;
let construireRecuCotisation: typeof import("./gabarits/recu-cotisation").construireRecuCotisation;

const mandat = {
  _id: null as unknown as import("mongoose").Types.ObjectId,
  annee: "2025-2026",
};

beforeAll(async () => {
  serveur = await MongoMemoryServer.create();
  process.env.MONGODB_URI = serveur.getUri("erp-test");

  mongoose = await import("mongoose");
  ({ emettreDocument, DocumentDejaEmis } = await import("./emission"));
  ({ prochaineSequence } = await import("../models"));
  ({ lireFichier } = await import("./stockage"));
  ({ construireRecuCotisation } = await import("./gabarits/recu-cotisation"));

  mandat._id = new mongoose.Types.ObjectId();
}, 120_000);

afterAll(async () => {
  await mongoose?.disconnect();
  await serveur?.stop();
});

function demande(objetId: import("mongoose").Types.ObjectId) {
  return {
    modele: "RECU_COTISATION",
    mandat,
    objetType: "Cotisation",
    objetId,
    session: null,
    donnees: {
      reference: "",
      membre: "Youssef Ben Youssef",
      montant: 30,
      datePaiement: new Date(2026, 1, 9),
      mandat: mandat.annee,
    },
    gabarit: (
      donnees: Parameters<typeof construireRecuCotisation>[0],
      reference: string
    ) => construireRecuCotisation({ ...donnees, reference }),
  };
}

describe("prochaineSequence", () => {
  it("est atomique : 20 appels concurrents donnent 20 numéros distincts", async () => {
    await import("@/lib/db").then((m) => m.connectDb());
    const numeros = await Promise.all(
      Array.from({ length: 20 }, () => prochaineSequence("TEST:2526"))
    );
    expect(new Set(numeros).size).toBe(20);
    expect(Math.max(...numeros)).toBe(20);
  });
});

describe("emettreDocument", () => {
  it("émet un reçu numéroté, stocké et relisible", async () => {
    const objetId = new mongoose.Types.ObjectId();
    const { id, reference } = await emettreDocument(demande(objetId));

    expect(reference).toMatch(/^RC\d{3}-COT-2526$/);

    const { DocumentModel } = await import("../models");
    const enregistre = await DocumentModel.findById(id).lean();
    expect(enregistre?.statut).toBe("EMIS");
    expect(enregistre?.categorie).toBe("RECU");
    expect(enregistre?.tailleOctets).toBeGreaterThan(0);
    // Instantané : le nom est figé dans le document, pas recalculé.
    expect(enregistre?.donnees).toMatchObject({ membre: "Youssef Ben Youssef" });

    const pdf = await lireFichier(enregistre!.fichierId!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const relu = await PDFDocument.load(pdf);
    expect(relu.getTitle()).toContain(reference);
  });

  it("incrémente la référence d'un reçu à l'autre", async () => {
    const a = await emettreDocument(demande(new mongoose.Types.ObjectId()));
    const b = await emettreDocument(demande(new mongoose.Types.ObjectId()));
    const numero = (r: string) => Number(r.slice(2, 5));
    expect(numero(b.reference)).toBe(numero(a.reference) + 1);
  });

  it("refuse un second reçu pour la même cotisation", async () => {
    const objetId = new mongoose.Types.ObjectId();
    await emettreDocument(demande(objetId));
    await expect(emettreDocument(demande(objetId))).rejects.toBeInstanceOf(
      DocumentDejaEmis
    );
  });

  it("autorise un nouveau reçu si le précédent a été annulé", async () => {
    const objetId = new mongoose.Types.ObjectId();
    const premier = await emettreDocument(demande(objetId));

    const { DocumentModel } = await import("../models");
    await DocumentModel.updateOne(
      { _id: new mongoose.Types.ObjectId(premier.id) },
      { statut: "ANNULE", motifAnnulation: "Erreur de saisie" }
    );

    const second = await emettreDocument(demande(objetId));
    expect(second.reference).not.toBe(premier.reference);
    // La référence annulée reste consommée : on ne réutilise jamais un numéro.
    expect(Number(second.reference.slice(2, 5))).toBeGreaterThan(
      Number(premier.reference.slice(2, 5))
    );
  });

  it("refuse un modèle catalogué mais pas encore disponible", async () => {
    // Choisi dynamiquement : activer un modèle ne doit pas casser ce test.
    const { CATALOGUE_DOCUMENTS } = await import("../catalogue");
    const annonce = CATALOGUE_DOCUMENTS.find((m) => !m.disponible);
    expect(annonce, "le catalogue n'annonce plus aucun modèle à venir").toBeDefined();

    await expect(
      emettreDocument({
        ...demande(new mongoose.Types.ObjectId()),
        modele: annonce!.code,
      })
    ).rejects.toThrow(/pas encore disponible/);
  });

  it("refuse un modèle inconnu", async () => {
    await expect(
      emettreDocument({
        ...demande(new mongoose.Types.ObjectId()),
        modele: "MODELE_FANTOME",
      })
    ).rejects.toThrow(/inconnu/i);
  });
});
