import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TAUX_TVA_DEFAUT } from "../services/fiscal";

const LigneBonCommandeSchema = new Schema(
  {
    designation: { type: String, required: true, trim: true },
    quantite: { type: Number, required: true, min: 0 },
    prixUnitaire: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

export const STATUTS_BON_COMMANDE = [
  "EMIS",
  "RECEPTIONNE",
  "ANNULE",
] as const;

/**
 * Bon de commande — l'engagement d'une dépense, avant qu'elle n'arrive.
 *
 * C'était le trou du module : la dépense n'entrait dans les comptes qu'à la
 * **réception de la facture**, c'est-à-dire une fois due. Entre la commande
 * passée au fournisseur et cette facture, l'argent était engagé sans que rien
 * ne le dise — le budget paraissait disponible alors qu'il ne l'était plus, et
 * deux responsables pouvaient engager la même enveloppe.
 *
 * Le bon porte donc une **section budgétaire** : c'est ce qui permet de
 * totaliser ce qui est promis mais pas encore payé, en face de ce qui reste.
 *
 * Son cycle est court et sans retour en arrière : `EMIS` à la signature,
 * puis `RECEPTIONNE` quand la commande arrive, ou `ANNULE` si elle ne vient
 * pas. Un bon ne se modifie pas après émission — il porte un numéro d'une
 * série continue et il a été envoyé au fournisseur ; on l'annule et on en
 * refait un, comme pour une facture.
 */
const BonCommandeSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    numero: { type: String, required: true, unique: true },
    fournisseur: { type: String, required: true, trim: true },
    objet: { type: String, required: true, trim: true },
    lignes: { type: [LigneBonCommandeSchema], default: [] },
    tauxTVA: { type: Number, default: TAUX_TVA_DEFAUT, min: 0 },

    /** Section du budget prévisionnel engagée par cette commande. */
    sectionBudget: { type: String, trim: true },

    emission: { type: Date, required: true, default: Date.now },
    /** Date de livraison attendue, telle qu'annoncée au fournisseur. */
    livraisonPrevue: { type: Date },

    statut: { type: String, enum: STATUTS_BON_COMMANDE, default: "EMIS", index: true },
    receptionLe: { type: Date },
    annuleLe: { type: Date },
    motifAnnulation: { type: String, trim: true },

    /** Pièce PDF émise, dans la bibliothèque documentaire. */
    document: { type: Schema.Types.ObjectId, ref: "Document" },
    emisParNom: { type: String, trim: true },
  },
  { timestamps: true, collection: "bonsCommande" }
);

BonCommandeSchema.index({ mandat: 1, statut: 1 });

export type LigneBonCommandeDoc = InferSchemaType<
  typeof LigneBonCommandeSchema
>;
export type BonCommande = InferSchemaType<typeof BonCommandeSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BonCommandeModel: Model<BonCommande> =
  (mongoose.models.BonCommande as Model<BonCommande>) ??
  mongoose.model<BonCommande>("BonCommande", BonCommandeSchema);
