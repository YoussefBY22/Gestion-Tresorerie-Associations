import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Cotisation — adhésion d'un membre, pour l'exercice
 */

const CotisationSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    membre: { type: Schema.Types.ObjectId, ref: "Membre", required: true, index: true },
    montant: { type: Number, required: true, min: 0 },
    payee: { type: Boolean, default: false, index: true },
    datePaiement: { type: Date },
    modePaiement: { type: String, trim: true },
    /**
     * Opération du journal qui a encaissé cette cotisation. Sans ce lien,
     * effacer l'opération laisse la cotisation derrière elle : l'argent
     * disparaît du journal mais le cotisant reste inscrit comme ayant payé,
     * et son reçu revient indéfiniment dans « à émettre ».
     */
    flux: { type: Schema.Types.ObjectId, ref: "FluxTresorerie", index: true },
  },
  { timestamps: true, collection: "cotisations" }
);
CotisationSchema.index({ mandat: 1, membre: 1 }, { unique: true });

export type Cotisation = InferSchemaType<typeof CotisationSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const CotisationModel: Model<Cotisation> =
  (mongoose.models.Cotisation as Model<Cotisation>) ??
  mongoose.model<Cotisation>("Cotisation", CotisationSchema);
