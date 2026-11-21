import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const TYPES_IMPOT = ["TVA", "IS", "RAS", "TCL", "TIMBRE", "AUTRE"] as const;
export const PERIODICITES = ["MENSUELLE", "TRIMESTRIELLE", "ANNUELLE"] as const;

/**
 * Échéancier fiscal — story 06.8 (décision CDC §8 Q4 : gérer toute la
 * fiscalité dans l'application). Chaque obligation porte sa prochaine échéance ;
 * le cron alerte le Trésorier à J-7 (critique + e-mail).
 */
const ObligationFiscaleSchema = new Schema(
  {
    type: { type: String, enum: TYPES_IMPOT, required: true },
    libelle: { type: String, required: true, trim: true },
    periodicite: { type: String, enum: PERIODICITES, required: true },
    prochaineEcheance: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "obligationsFiscales" }
);

/**
 * Déclaration fiscale : préparation, dépôt et preuve (rétention 10 ans —
 * la preuve rejoindra la GED au sprint 3, référence libre en attendant).
 */
const DeclarationFiscaleSchema = new Schema(
  {
    obligation: {
      type: Schema.Types.ObjectId,
      ref: "ObligationFiscale",
      required: true,
      index: true,
    },
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true },
    periode: { type: String, required: true, trim: true }, // ex. « 2026-06 »
    montant: { type: Number, min: 0 },
    statut: { type: String, enum: ["A_PREPARER", "DEPOSEE"], default: "A_PREPARER" },
    depotLe: { type: Date },
    preuveRef: { type: String, trim: true },
  },
  { timestamps: true, collection: "declarationsFiscales" }
);

export type ObligationFiscale = InferSchemaType<typeof ObligationFiscaleSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type DeclarationFiscale = InferSchemaType<
  typeof DeclarationFiscaleSchema
> & { _id: mongoose.Types.ObjectId };

export const ObligationFiscaleModel: Model<ObligationFiscale> =
  (mongoose.models.ObligationFiscale as Model<ObligationFiscale>) ??
  mongoose.model<ObligationFiscale>("ObligationFiscale", ObligationFiscaleSchema);

export const DeclarationFiscaleModel: Model<DeclarationFiscale> =
  (mongoose.models.DeclarationFiscale as Model<DeclarationFiscale>) ??
  mongoose.model<DeclarationFiscale>(
    "DeclarationFiscale",
    DeclarationFiscaleSchema
  );
