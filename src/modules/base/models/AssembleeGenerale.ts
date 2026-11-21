import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Assemblée générale — ce qui verrouille le budget
 */

export const ROLES_AG = ["OUVERTURE", "CLOTURE", "EXTRAORDINAIRE"] as const;
export const STATUTS_AG = ["PLANIFIEE", "TENUE", "ANNULEE"] as const;

/**
 * L'AG n'est ici que pour une chose : **verrouiller le budget prévisionnel**.
 *
 * Un budget voté n'est plus modifiable librement — il se corrige par une
 * demande de modification tracée. L'application a donc besoin de savoir si
 * l'assemblée d'ouverture a été tenue. Tout le reste de la vie associative
 * (convocations, quorum, PV, motions) ne la regarde pas.
 */
const AssembleeGeneraleSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    role: { type: String, enum: ROLES_AG, required: true, index: true },
    titre: { type: String, trim: true },
    date: { type: Date, required: true },
    statut: { type: String, enum: STATUTS_AG, default: "PLANIFIEE", index: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "assembleesGenerales" }
);

export type AssembleeGenerale = InferSchemaType<
  typeof AssembleeGeneraleSchema
> & { _id: mongoose.Types.ObjectId };
export const AssembleeGeneraleModel: Model<AssembleeGenerale> =
  (mongoose.models.AssembleeGenerale as Model<AssembleeGenerale>) ??
  mongoose.model<AssembleeGenerale>(
    "AssembleeGenerale",
    AssembleeGeneraleSchema
  );
