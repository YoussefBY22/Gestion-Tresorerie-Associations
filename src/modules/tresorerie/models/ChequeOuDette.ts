import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PieceJustificativeSchema } from "./piece-justificative";

/**
 * Registre des chèques et des dettes/pénalités — deux suivis distincts que
 * le classeur regroupe dans une seule feuille : les chèques émis ou reçus
 * en circulation (pas encore encaissés/débités), et les dettes ou pénalités
 * en cours qui ne transitent pas forcément par un chèque.
 */
export const TYPES_CHEQUE_DETTE = [
  "CHEQUE_EMIS",
  "CHEQUE_RECU",
  "DETTE",
  "PENALITE",
] as const;

export const LIBELLES_TYPE_CHEQUE_DETTE: Record<
  (typeof TYPES_CHEQUE_DETTE)[number],
  string
> = {
  CHEQUE_EMIS: "Chèque émis",
  CHEQUE_RECU: "Chèque reçu",
  DETTE: "Dette",
  PENALITE: "Pénalité",
};

export const STATUTS_CHEQUE_DETTE = ["EN_COURS", "SOLDE", "ANNULE"] as const;

export const LIBELLES_STATUT_CHEQUE_DETTE: Record<
  (typeof STATUTS_CHEQUE_DETTE)[number],
  string
> = {
  EN_COURS: "En cours",
  SOLDE: "Soldé",
  ANNULE: "Annulé",
};

const ChequeOuDetteSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    type: { type: String, enum: TYPES_CHEQUE_DETTE, required: true },
    tiers: { type: String, required: true, trim: true },
    montant: { type: Number, required: true, min: 0 },
    dateEmission: { type: Date, required: true, default: Date.now },
    dateEcheance: { type: Date },
    statut: { type: String, enum: STATUTS_CHEQUE_DETTE, default: "EN_COURS" },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },

    /**
     * Pièces justificatives — c'est la preuve qu'on demande en audit, pas la
     * ligne du registre. Voir `services/pieces-justificatives.ts`.
     */
    justificatifs: { type: [PieceJustificativeSchema], default: [] },
  },
  { timestamps: true, collection: "chequesEtDettes" }
);

export type ChequeOuDette = InferSchemaType<typeof ChequeOuDetteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ChequeOuDetteModel: Model<ChequeOuDette> =
  (mongoose.models.ChequeOuDette as Model<ChequeOuDette>) ??
  mongoose.model<ChequeOuDette>("ChequeOuDette", ChequeOuDetteSchema);
