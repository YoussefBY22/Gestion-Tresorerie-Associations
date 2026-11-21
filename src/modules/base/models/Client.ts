import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Client — le tiers qu'on facture
 */

/**
 * Remplace le « prospect » du CRM.
 *
 * L'adresse et le matricule fiscal sont ici, et non sur une fiche annexe :
 * une facture tunisienne doit les porter, et les chercher ailleurs était la
 * cause d'un champ vide sur les pièces émises par l'ERP d'origine.
 */
const ClientSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    organisation: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    telephone: { type: String, trim: true },
    adresse: { type: String, trim: true },
    matriculeFiscal: { type: String, trim: true },
    secteur: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "clients" }
);

export type Client = InferSchemaType<typeof ClientSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ClientModel: Model<Client> =
  (mongoose.models.Client as Model<Client>) ??
  mongoose.model<Client>("Client", ClientSchema);
