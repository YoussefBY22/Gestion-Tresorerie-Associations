import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const TYPES_PARAMETRE = [
  "BOOLEEN",
  "TEXTE",
  "NOMBRE",
  "JSON",
] as const;

export const CATEGORIES_PARAMETRE = [
  "MODULES", // activation/désactivation des modules
  "GENERAL", // identité de la structure, mandat, langue
  "APPARENCE", // thème par défaut, densité
  "INTEGRATIONS", // API externes (WhatsApp, Drive, webhooks…)
  "METIER", // seuils et règles métier paramétrables
] as const;

/**
 * Paramètre applicatif — ADR-007.
 *
 * Store clé/valeur typé qui porte tout ce qui doit pouvoir changer SANS
 * redéploiement : activation des modules, identité de la structure, thème
 * par défaut, seuils métier, activation des intégrations externes.
 *
 * Le **catalogue** des paramètres attendus est décrit en code
 * (`services/parametrage.ts` → `PARAMETRES_PAR_DEFAUT`) ; la base ne stocke
 * que les valeurs effectivement surchargées. Un paramètre absent en base
 * retombe donc automatiquement sur son défaut : pas de migration à écrire
 * quand on ajoute un paramètre.
 */
const ParametreSchema = new Schema(
  {
    cle: { type: String, required: true, unique: true, trim: true, index: true },
    valeur: { type: Schema.Types.Mixed },
    type: { type: String, enum: TYPES_PARAMETRE, default: "TEXTE" },
    categorie: { type: String, enum: CATEGORIES_PARAMETRE, default: "GENERAL" },
    /** Dernier utilisateur ayant modifié la valeur (traçabilité). */
    modifiePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { timestamps: true, collection: "parametres" }
);

export type Parametre = InferSchemaType<typeof ParametreSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ParametreModel: Model<Parametre> =
  (mongoose.models.Parametre as Model<Parametre>) ??
  mongoose.model<Parametre>("Parametre", ParametreSchema);
