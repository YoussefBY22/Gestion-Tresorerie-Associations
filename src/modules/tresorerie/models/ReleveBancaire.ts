import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Solde du compte bancaire tel qu'il figure sur le relevé de la banque.
 *
 * L'ERP savait calculer un solde bancaire — solde d'ouverture, plus les
 * encaissements dont le mode de paiement n'était pas « espèces ». Ce calcul
 * répond à une autre question que celle qu'on pose : il dit ce qu'il
 * *devrait* y avoir si tout ce qui a été saisi est arrivé. Un virement
 * annoncé mais pas encore crédité y figurait déjà, et le compte affichait de
 * l'argent que la banque n'avait pas.
 *
 * Le solde qui fait foi est donc celui que le Trésorier relève sur son
 * compte. Le calcul reste affiché à côté : l'écart entre les deux, c'est le
 * rapprochement bancaire — ce qui est saisi mais pas encore crédité, ou
 * crédité mais pas encore saisi.
 */
const ReleveBancaireSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    /** Date du relevé — c'est elle qui décide lequel fait foi. */
    date: { type: Date, required: true, default: Date.now, index: true },
    /** Solde lu sur le relevé. Peut être négatif : un compte se découvre. */
    solde: { type: Number, required: true },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    saisiPar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    saisiParNom: { type: String, trim: true },
  },
  { timestamps: true, collection: "relevesBancaires" }
);

export type ReleveBancaire = InferSchemaType<typeof ReleveBancaireSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReleveBancaireModel: Model<ReleveBancaire> =
  (mongoose.models.ReleveBancaire as Model<ReleveBancaire>) ??
  mongoose.model<ReleveBancaire>("ReleveBancaire", ReleveBancaireSchema);
