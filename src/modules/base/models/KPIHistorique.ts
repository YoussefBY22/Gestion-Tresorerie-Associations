import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Indicateurs historiques — comparaison entre exercices
 */

/**
 * Le mandat est ici une **chaîne**, pas une référence : ces lignes servent à
 * comparer l'exercice courant à des exercices antérieurs, y compris ceux qui
 * ont précédé l'application et n'ont donc aucun mandat en base.
 */
const KPIHistoriqueSchema = new Schema(
  {
    annee: { type: String, required: true, trim: true }, // ex. « 2024-2025 »
    indicateur: { type: String, required: true, trim: true },
    /*
     * Valeur en texte, et non en nombre : un indicateur d'exercice se lit
     * « 2420 », « 92 % » ou « NA ». Forcer un nombre obligerait à inventer
     * une valeur là où la réponse honnête est « non mesuré ».
     */
    valeur: { type: String, required: true, trim: true },
    commentaire: { type: String, trim: true },
  },
  { timestamps: true, collection: "kpisHistoriques" }
);
KPIHistoriqueSchema.index({ annee: 1, indicateur: 1 }, { unique: true });

export type KPIHistorique = InferSchemaType<typeof KPIHistoriqueSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const KPIHistoriqueModel: Model<KPIHistorique> =
  (mongoose.models.KPIHistorique as Model<KPIHistorique>) ??
  mongoose.model<KPIHistorique>("KPIHistorique", KPIHistoriqueSchema);
