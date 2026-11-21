import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Facture d'avoir — la pièce qui corrige une facture déjà émise.
 *
 * Elle ne remplace pas la facture : les deux restent au registre, et c'est
 * leur somme qui donne le chiffre d'affaires réel. Une facture émise porte un
 * numéro d'une série continue ; la modifier ou l'effacer ouvrirait un trou
 * que personne ne peut plus justifier devant un auditeur.
 *
 * `mois` est celui de l'émission de l'avoir, pas celui de la facture
 * d'origine : la TVA se rectifie sur la déclaration en cours, jamais sur une
 * déclaration déjà déposée. Il est dénormalisé pour que la déclaration
 * mensuelle interroge les avoirs comme elle interroge les factures.
 */
const AvoirSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    /** Facture corrigée. Un avoir sans facture n'a pas de sens. */
    facture: {
      type: Schema.Types.ObjectId,
      ref: "Facture",
      required: true,
      index: true,
    },
    numero: { type: String, required: true, unique: true },
    /** Mois d'émission, au format AAAA-MM. */
    mois: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
    montantHT: { type: Number, required: true, min: 0 },
    /** Repris de la facture d'origine, jamais du taux courant. */
    tauxTVA: { type: Number, required: true, min: 0 },
    /** Pourquoi la facture est corrigée — exigé, c'est la justification. */
    motif: { type: String, required: true, trim: true },
    emission: { type: Date, required: true, default: Date.now },
    emisParNom: { type: String, trim: true },
    /** Document PDF émis avec l'avoir. */
    document: { type: Schema.Types.ObjectId, ref: "Document" },
  },
  { timestamps: true, collection: "avoirs" }
);

AvoirSchema.index({ mandat: 1, mois: 1 });

export type Avoir = InferSchemaType<typeof AvoirSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AvoirModel: Model<Avoir> =
  (mongoose.models.Avoir as Model<Avoir>) ??
  mongoose.model<Avoir>("Avoir", AvoirSchema);
