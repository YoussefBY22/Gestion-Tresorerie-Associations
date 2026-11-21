import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Journal d'activité — story 01.7.
 * Append-only : aucune API de modification/suppression n'existe dans l'application ;
 * les hooks ci-dessous bloquent aussi toute tentative via Mongoose.
 */
const JournalActiviteSchema = new Schema(
  {
    horodatage: { type: Date, default: Date.now, index: true },
    utilisateurId: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    email: { type: String, required: true },
    action: { type: String, required: true }, // ex. "utilisateur.creer"
    entite: { type: String, required: true, index: true }, // ex. "Utilisateur"
    entiteId: { type: String },
    details: { type: String },
  },
  { collection: "journalActivites", versionKey: false }
);

const interdit = () => {
  throw new Error("Le journal d'activité est en append-only (inviolable).");
};
JournalActiviteSchema.pre("updateOne", interdit);
JournalActiviteSchema.pre("findOneAndUpdate", interdit);
JournalActiviteSchema.pre("deleteOne", interdit);
JournalActiviteSchema.pre("deleteMany", interdit);
JournalActiviteSchema.pre("findOneAndDelete", interdit);

export type JournalActivite = InferSchemaType<typeof JournalActiviteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const JournalActiviteModel: Model<JournalActivite> =
  (mongoose.models.JournalActivite as Model<JournalActivite>) ??
  mongoose.model<JournalActivite>("JournalActivite", JournalActiviteSchema);
