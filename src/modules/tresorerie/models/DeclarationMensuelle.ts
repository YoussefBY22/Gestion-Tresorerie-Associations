import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TAUX_TVA_DEFAUT } from "../services/fiscal";

export const STATUTS_DECLARATION = ["BROUILLON", "CLOTUREE", "DEPOSEE"] as const;

const LigneAgiosSchema = new Schema(
  {
    libelle: { type: String, trim: true },
    date: { type: Date },
    montantHT: { type: Number, required: true, min: 0 },
    tauxTVA: { type: Number, default: TAUX_TVA_DEFAUT, min: 0 },
  },
  { _id: true }
);

/**
 * Déclaration fiscale mensuelle — le classeur « OTMT » du drive, un par mois.
 *
 * Tant qu'elle est en BROUILLON, les totaux sont **recalculés** à chaque
 * affichage depuis les factures du mois (ADR-010 : un indicateur stocké
 * devient faux dès qu'une facture est corrigée).
 *
 * À la clôture, ils sont **figés** dans `resultat` : une déclaration déposée
 * doit rester conforme à ce qui a été déclaré, même si une facture est
 * corrigée après coup. C'est cette photo qui sert de report au mois suivant.
 */
const DeclarationMensuelleSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    mois: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    statut: {
      type: String,
      enum: STATUTS_DECLARATION,
      default: "BROUILLON",
      index: true,
    },
    agios: { type: [LigneAgiosSchema], default: [] },
    /** Instantané du calcul au moment de la clôture. */
    resultat: { type: Schema.Types.Mixed },
    clotureeLe: { type: Date },
    clotureeParNom: { type: String, trim: true },
    depotLe: { type: Date },
    preuveRef: { type: String, trim: true },
    /** Document PDF généré à la clôture. */
    document: { type: Schema.Types.ObjectId, ref: "Document" },
  },
  { timestamps: true, collection: "declarationsMensuelles" }
);

// Une seule déclaration par mois et par mandat : deux déclarations pour le
// même mois produiraient deux reports contradictoires.
DeclarationMensuelleSchema.index({ mandat: 1, mois: 1 }, { unique: true });

export type DeclarationMensuelle = InferSchemaType<
  typeof DeclarationMensuelleSchema
> & { _id: mongoose.Types.ObjectId };

export const DeclarationMensuelleModel: Model<DeclarationMensuelle> =
  (mongoose.models.DeclarationMensuelle as Model<DeclarationMensuelle>) ??
  mongoose.model<DeclarationMensuelle>(
    "DeclarationMensuelle",
    DeclarationMensuelleSchema
  );
