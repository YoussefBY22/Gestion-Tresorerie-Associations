import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Membre — pour les cotisations et leurs reçus
 */

export const STATUTS_MEMBRE = ["ACTIF", "INACTIF", "SORTI"] as const;

/**
 * Le membre n'existe ici que pour une raison : un reçu de cotisation doit
 * nommer son cotisant, et le décret-loi 2011-88 exige la CIN sur un reçu en
 * numéraire. D'où l'identité civile, et rien d'autre.
 */
const MembreSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    nom: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    telephone: { type: String, trim: true },
    cin: { type: String, trim: true },
    adresse: { type: String, trim: true },
    nationalite: { type: String, trim: true },
    dateNaissance: { type: Date },
    profession: { type: String, trim: true },
    statut: { type: String, enum: STATUTS_MEMBRE, default: "ACTIF", index: true },
    dateAdhesion: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "membres" }
);

export type Membre = InferSchemaType<typeof MembreSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const MembreModel: Model<Membre> =
  (mongoose.models.Membre as Model<Membre>) ??
  mongoose.model<Membre>("Membre", MembreSchema);
