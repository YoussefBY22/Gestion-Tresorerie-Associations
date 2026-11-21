import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { STATUTS_PROJET, TYPES_PROJET } from "../constantes";

/**
 * Projet — l'affaire qu'on facture
 */

/*
 * Les énumérations et leurs libellés vivent dans `modules/base/constantes`,
 * sans Mongoose : les écrans en ont besoin et ne doivent pas importer un
 * fichier de modèle pour les obtenir. Réexportés ici pour que le modèle
 * reste lisible d'un seul tenant.
 */
export {
  TYPES_PROJET,
  STATUTS_PROJET,
  LIBELLES_TYPE_PROJET,
  LIBELLES_STATUT_PROJET,
  type TypeProjet,
  type StatutProjet,
} from "../constantes";

/**
 * Dans l'ERP d'origine, un projet naissait d'une opportunité commerciale
 * gagnée : impossible d'en créer un sans passer par le CRM. Ici il se crée
 * directement, parce que c'est l'objet qu'on facture et que la trésorerie
 * doit pouvoir l'ouvrir elle-même.
 *
 * `caSigne` est le montant convenu avec le client. C'est lui qui donne le
 * « reste à facturer » : sans cette référence, l'écran de facturation ne
 * saurait rien proposer.
 */
const ProjetSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    nom: { type: String, required: true, trim: true },
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    type: { type: String, enum: TYPES_PROJET, default: "PRESTATION" },
    statut: { type: String, enum: STATUTS_PROJET, default: "EN_COURS", index: true },
    /** Montant HT convenu : référence du reste à facturer. */
    caSigne: { type: Number, min: 0 },
    description: { type: String, trim: true },
    debut: { type: Date, default: Date.now },
    finPrevue: { type: Date },
  },
  { timestamps: true, collection: "projets" }
);

export type Projet = InferSchemaType<typeof ProjetSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ProjetModel: Model<Projet> =
  (mongoose.models.Projet as Model<Projet>) ??
  mongoose.model<Projet>("Projet", ProjetSchema);
