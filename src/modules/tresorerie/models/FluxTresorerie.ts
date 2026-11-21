import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { COMPTES } from "../services/caisse";
import { PLAFOND_ESPECES_DT } from "../services/conformite-especes";

export const TYPES_FLUX = ["ENCAISSEMENT", "DECAISSEMENT"] as const;
export const MODES_PAIEMENT = [
  "VIREMENT",
  "CHEQUE",
  "ESPECES",
  "CARTE",
  "AUTRE",
] as const;

/**
 * Plafond légal des paiements en espèces. Le seuil et la règle de lecture
 * vivent dans `services/conformite-especes` (fonction pure, testée) ; on le
 * réexporte ici pour ne pas casser les imports existants.
 */
export { PLAFOND_ESPECES_DT };

/**
 * Flux de trésorerie — story 06.3 (EX-TRS-03 : traçabilité de toutes les
 * opérations). `justificatifRef` : référence de la pièce (lien Drive manuel
 * pour l'instant, remplacé par la GED au sprint 3) — un flux sans
 * justificatif est marqué « en attente » et bloque la clôture mensuelle.
 */
const FluxTresorerieSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    type: { type: String, enum: TYPES_FLUX, required: true },
    montant: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now, index: true },
    tiers: { type: String, required: true, trim: true },
    modePaiement: { type: String, enum: MODES_PAIEMENT, default: "VIREMENT" },
    /**
     * Avoir mouvementé : la caisse ou le compte bancaire. Déduit du mode de
     * paiement à la saisie, mais corrigeable — on peut encaisser un chèque
     * et le garder en caisse avant de le deposer.
     */
    compte: { type: String, enum: COMPTES, default: "BANQUE", index: true },
    categorie: { type: String, required: true, trim: true }, // ligne budgétaire
    justificatifRef: { type: String, trim: true },
    facture: { type: Schema.Types.ObjectId, ref: "Facture" },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "flux" }
);

export type FluxTresorerie = InferSchemaType<typeof FluxTresorerieSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FluxTresorerieModel: Model<FluxTresorerie> =
  (mongoose.models.FluxTresorerie as Model<FluxTresorerie>) ??
  mongoose.model<FluxTresorerie>("FluxTresorerie", FluxTresorerieSchema);
