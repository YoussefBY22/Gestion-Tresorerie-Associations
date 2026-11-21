import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { MODULES } from "@/modules/core/rbac";

/**
 * Type d'élément supprimé. La liste s'étend au fil des besoins ; chaque
 * valeur porte sa propre logique de restauration et de purge (voir
 * `services/corbeille-service.ts`), il n'y a pas de mécanisme « générique »
 * de restauration possible tant que les formes des données diffèrent.
 */
export const TYPES_ELEMENT_CORBEILLE = [
  "LIGNE_BUDGET",
  "JUSTIFICATIF_BUDGET",
  "FLUX",
  "MOUVEMENT_INTERNE",
  "FACTURE",
  "FICHE_CLIENT",
  "PIECE_CLIENT",
  "COTISATION",
  "DON",
  "FOURNISSEUR",
  "CHEQUE_DETTE",
  "FAMILLE_RECU",
  "CHARTE_DOCUMENT",
  "MODELE_DOCUMENT",
  "DOCUMENT",
] as const;
export type TypeElementCorbeille = (typeof TYPES_ELEMENT_CORBEILLE)[number];

export const LIBELLES_TYPE_CORBEILLE: Record<TypeElementCorbeille, string> = {
  LIGNE_BUDGET: "Poste du budget prévisionnel",
  JUSTIFICATIF_BUDGET: "Justificatif de poste (PDF)",
  FLUX: "Opération du journal",
  MOUVEMENT_INTERNE: "Virement interne",
  FACTURE: "Facture client",
  FICHE_CLIENT: "Fiche du registre clients",
  PIECE_CLIENT: "Pièce de paiement client (PDF)",
  COTISATION: "Cotisation du registre",
  DON: "Don du registre",
  FOURNISSEUR: "Fournisseur du registre",
  CHEQUE_DETTE: "Chèque ou dette du registre",
  FAMILLE_RECU: "Famille de reçus",
  CHARTE_DOCUMENT: "Modèle de document (charte)",
  MODELE_DOCUMENT: "Modèle de document (mise en page)",
  DOCUMENT: "Document émis (PDF)",
};

/**
 * Élément supprimé, en attente de purge — corbeille de l'application (ADR à venir).
 *
 * Générique par construction : `donnees` est la photo complète de l'élément
 * juste avant suppression, suffisante pour le recréer à l'identique. La
 * corbeille elle-même ne connaît pas la forme de ce qu'elle contient ; c'est
 * le service appelant (propre à chaque module) qui sait comment restaurer.
 *
 * `module` porte le RBAC : un Trésorier ne voit que les éléments supprimés
 * depuis la trésorerie, jamais ceux d'un autre module.
 */
const ElementCorbeilleSchema = new Schema(
  {
    module: { type: String, enum: MODULES, required: true, index: true },
    type: { type: String, enum: TYPES_ELEMENT_CORBEILLE, required: true, index: true },
    titre: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    donnees: { type: Schema.Types.Mixed, required: true },
    /**
     * Fichiers GridFS attachés à l'élément. Ils survivent à la mise à la
     * corbeille — sans quoi « restaurable » ne voudrait rien dire — et ne
     * sont détruits qu'à la purge définitive.
     */
    fichiers: { type: [Schema.Types.ObjectId], default: [] },
    supprimePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    supprimeParNom: { type: String, trim: true },
    supprimeLe: { type: Date, required: true, default: Date.now },
    /** Calculée une fois à la suppression — jamais recalculée à la lecture. */
    purgeLe: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: "corbeille" }
);

export type ElementCorbeille = InferSchemaType<typeof ElementCorbeilleSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ElementCorbeilleModel: Model<ElementCorbeille> =
  (mongoose.models["ElementCorbeille"] as Model<ElementCorbeille>) ??
  mongoose.model<ElementCorbeille>("ElementCorbeille", ElementCorbeilleSchema);
