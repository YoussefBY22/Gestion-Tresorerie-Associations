import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Famille de reçu créée par la JE elle-même.
 *
 * Le catalogue des documents vit en code, et c'est voulu : une référence doit
 * garder le même sens d'un mandat à l'autre. Mais une JE encaisse des choses
 * qu'aucun catalogue ne prévoit — un JeBex, une tombola, une participation
 * ponctuelle. Plutôt que de tout ranger dans « divers », le Trésorier déclare
 * la famille une fois ; elle prend alors son propre segment de référence et
 * son propre compteur (`RC001-TOMBOLA-2627`).
 *
 * On ne supprime pas une famille déjà utilisée : ses reçus resteraient
 * orphelins de leur libellé. On la désactive, elle disparaît des choix.
 */
const TypeRecuSchema = new Schema(
  {
    libelle: { type: String, required: true, trim: true },
    /** Segment de la référence — lettres majuscules, comme « INT » ou « JOBS ». */
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    /**
     * Code du modèle du catalogue que cette ligne personnalise
     * (`RECU_COTISATION`…). Vide pour une famille propre à la JE.
     *
     * Le catalogue vit en code et n'est pas modifiable ; cette ligne porte ce
     * que la JE en fait — son libellé à elle, et le fait de la proposer ou
     * non. Le segment de référence, lui, ne bouge jamais : les reçus déjà
     * émis le portent.
     */
    modele: { type: String, trim: true, index: true },
    actif: { type: Boolean, default: true, index: true },
    creePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { timestamps: true, collection: "types_recus" }
);

export type TypeRecu = InferSchemaType<typeof TypeRecuSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TypeRecuModel: Model<TypeRecu> =
  (mongoose.models.TypeRecu as Model<TypeRecu>) ??
  mongoose.model<TypeRecu>("TypeRecu", TypeRecuSchema);
