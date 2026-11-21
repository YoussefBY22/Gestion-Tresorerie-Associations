import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { STATUTS_DEMANDE_BUDGET } from "../services/budget-previsionnel";

/**
 * Demande d'ouverture exceptionnelle du budget prévisionnel après l'AG
 * d'ouverture — un budget verrouillé ne se modifie que par cette voie.
 *
 * Le motif est obligatoire à la demande (le Trésorier justifie), et
 * conservé même en cas de refus : c'est la trace de ce qui a été envisagé,
 * pas seulement de ce qui a été fait.
 */
const DemandeModificationBudgetSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    budget: {
      type: Schema.Types.ObjectId,
      ref: "BudgetPrevisionnel",
      required: true,
      index: true,
    },
    motif: { type: String, required: true, trim: true },
    demandePar: { type: Schema.Types.ObjectId, ref: "Utilisateur", required: true },
    statut: {
      type: String,
      enum: STATUTS_DEMANDE_BUDGET,
      default: "EN_ATTENTE",
      index: true,
    },
    decidePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    decideLe: { type: Date },
    motifDecision: { type: String, trim: true },
    appliqueeLe: { type: Date },
  },
  { timestamps: true, collection: "demandesModificationBudget" }
);

export type DemandeModificationBudget = InferSchemaType<
  typeof DemandeModificationBudgetSchema
> & { _id: mongoose.Types.ObjectId };

export const DemandeModificationBudgetModel: Model<DemandeModificationBudget> =
  (mongoose.models.DemandeModificationBudget as Model<DemandeModificationBudget>) ??
  mongoose.model<DemandeModificationBudget>(
    "DemandeModificationBudget",
    DemandeModificationBudgetSchema
  );
