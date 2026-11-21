import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Mandat — l'exercice comptable de l'association
 */

export const STATUTS_MANDAT = ["ACTIF", "CLOS"] as const;

/**
 * Un mandat = un exercice. Toute écriture lui est rattachée, et rien n'est
 * supprimé au passage au suivant : c'est ce qui permet de consulter les
 * comptes d'un exercice clos sans les mélanger à ceux en cours.
 */
const MandatSchema = new Schema(
  {
    annee: { type: String, required: true, unique: true, trim: true },
    libelle: { type: String, trim: true },
    debut: { type: Date, required: true },
    fin: { type: Date, required: true },
    statut: { type: String, enum: STATUTS_MANDAT, default: "ACTIF", index: true },
  },
  { timestamps: true, collection: "mandats" }
);

export type Mandat = InferSchemaType<typeof MandatSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const MandatModel: Model<Mandat> =
  (mongoose.models.Mandat as Model<Mandat>) ??
  mongoose.model<Mandat>("Mandat", MandatSchema);
