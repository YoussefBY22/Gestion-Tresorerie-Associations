import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { STATUTS_DOCUMENT, CATEGORIES_DOCUMENT } from "../constantes";

/**
 * Document émis par l'application.
 *
 * Le PDF lui-même est stocké dans GridFS (`fichierId`) : le stockage est
 * **interne à l'application**, sans dépendance Google Drive (décision du 10/08/2026).
 *
 * `donnees` conserve un **instantané** des valeurs au moment de l'émission :
 * un reçu déjà remis ne doit pas changer parce qu'on a corrigé le nom du
 * membre trois mois plus tard. C'est l'exigence de base d'une pièce
 * justificative — et ce que garantissait, par accident, le PPTX figé.
 */
const DocumentSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    /** Code du modèle au catalogue (`CATALOGUE_DOCUMENTS`). */
    modele: { type: String, required: true, index: true },
    categorie: { type: String, enum: CATEGORIES_DOCUMENT, required: true },
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    titre: { type: String, required: true, trim: true },
    /** Objet métier d'origine (cotisation, projet, réunion…). */
    objetType: { type: String, trim: true },
    objetId: { type: Schema.Types.ObjectId },
    /** Instantané des données ayant servi au rendu. */
    donnees: { type: Schema.Types.Mixed, default: {} },

    statut: { type: String, enum: STATUTS_DOCUMENT, default: "EMIS", index: true },
    emisPar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    emisParNom: { type: String, trim: true },
    emisLe: { type: Date, default: Date.now },
    /*
     * Remise au tiers — c'est elle qui grave la référence.
     *
     * Tant qu'une pièce numérotée n'est pas partie, elle n'a été remise à
     * personne : la supprimer rend son numéro, et les pièces non envoyées qui
     * la suivent redescendent d'un cran (voir
     * `tresorerie/services/renumerotation-recus`). Une fois `envoyeLe`
     * renseigné, plus rien ne bouge : on annule, et la référence reste
     * consommée.
     */
    envoyeLe: { type: Date, index: true },
    /** Adresse du destinataire, ou la mention d'une remise en main propre. */
    envoyeA: { type: String, trim: true },
    validePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    valideParNom: { type: String, trim: true },
    valideLe: { type: Date },
    motifAnnulation: { type: String, trim: true },

    /** Identifiant GridFS du PDF. */
    fichierId: { type: Schema.Types.ObjectId },
    tailleOctets: { type: Number, default: 0 },
    /** Incrémentée à chaque régénération du PDF. */
    version: { type: Number, default: 1 },
  },
  { timestamps: true, collection: "documents" }
);

// Un objet métier ne doit pas se retrouver avec deux reçus valides : on
// interdit le doublon (modèle, objet) hors documents annulés.
DocumentSchema.index(
  { modele: 1, objetType: 1, objetId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      objetId: { $exists: true },
      statut: { $ne: "ANNULE" },
    },
  }
);
DocumentSchema.index({ mandat: 1, emisLe: -1 });

export type Document = InferSchemaType<typeof DocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DocumentModel: Model<Document> =
  (mongoose.models.Document as Model<Document>) ??
  mongoose.model<Document>("Document", DocumentSchema);
