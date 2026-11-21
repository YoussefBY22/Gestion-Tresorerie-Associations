import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SENS_MOUVEMENT } from "../services/caisse";

/**
 * Virement entre la caisse et le compte bancaire — la feuille « Retraits /
 * Versements » du journal du drive.
 *
 * Ce n'est **ni une recette ni une dépense** : le total des avoirs ne bouge
 * pas. C'est pour cela qu'il ne s'agit pas d'un `FluxTresorerie` — l'y mettre
 * gonflerait artificiellement les encaissements et fausserait le réalisé
 * budgétaire.
 */
const MouvementInterneSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    sens: { type: String, enum: SENS_MOUVEMENT, required: true },
    montant: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now, index: true },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "mouvementsInternes" }
);

export type MouvementInterneDoc = InferSchemaType<
  typeof MouvementInterneSchema
> & { _id: mongoose.Types.ObjectId };

export const MouvementInterneModel: Model<MouvementInterneDoc> =
  (mongoose.models.MouvementInterne as Model<MouvementInterneDoc>) ??
  mongoose.model<MouvementInterneDoc>(
    "MouvementInterne",
    MouvementInterneSchema
  );
