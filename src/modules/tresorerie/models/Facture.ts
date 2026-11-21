import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Facture projet — story 06.7. Numérotation continue par mandat
 * (ex. F-2526-003). Une facture EMISE dont l'échéance est passée est
 * « en retard » (alerte cron). L'encaissement crée le flux lié et passe
 * la facture à PAYEE.
 */
const FactureSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    projet: {
      type: Schema.Types.ObjectId,
      ref: "Projet",
      required: true,
      index: true,
    },
    numero: { type: String, required: true, unique: true },
    montantHT: { type: Number, required: true, min: 0 },
    tauxTVA: { type: Number, default: 19, min: 0 },
    /** Timbre fiscal dû par facture (1 DT) — repris dans la déclaration. */
    timbreFiscal: { type: Number, default: 1, min: 0 },
    emission: { type: Date, required: true, default: Date.now },
    echeance: { type: Date, required: true },
    statut: { type: String, enum: ["EMISE", "PAYEE"], default: "EMISE" },
    payeeLe: { type: Date },
  },
  { timestamps: true, collection: "factures" }
);

export type Facture = InferSchemaType<typeof FactureSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FactureModel: Model<Facture> =
  (mongoose.models.Facture as Model<Facture>) ??
  mongoose.model<Facture>("Facture", FactureSchema);
