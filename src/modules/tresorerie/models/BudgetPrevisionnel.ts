import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SECTIONS_BUDGET } from "../services/budget-previsionnel";

const CODES_SECTION = SECTIONS_BUDGET.map((s) => s.code);

/**
 * Justificatif d'une ligne budgétaire — un seul fichier PDF, comme la
 * colonne « Justificatif / Lien » du classeur de référence (un lien par poste).
 */
const JustificatifBudgetSchema = new Schema(
  {
    fichierId: { type: Schema.Types.ObjectId },
    nomFichier: { type: String, trim: true },
    tailleOctets: { type: Number, min: 0 },
    deposeLe: { type: Date },
    deposePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { _id: false }
);

const LigneBudgetPrevisionnelSchema = new Schema(
  {
    section: { type: String, enum: CODES_SECTION, required: true },
    /**
     * Peut rester vide : la grille se remplit comme un tableur, on crée la
     * ligne d'abord et on la nomme ensuite.
     */
    libelle: { type: String, trim: true, default: "" },
    /** Une valeur par mois du mandat, dans l'ordre de `moisDuMandat()`. */
    valeursMensuelles: { type: [Number], default: [] },
    justificatif: { type: JustificatifBudgetSchema, default: undefined },
  },
  { _id: true, timestamps: true }
);

/**
 * Photo du budget au moment où il cesse de faire foi — la version votée à
 * l'AG d'ouverture, ou l'état juste avant une modification approuvée par le
 * Président. `motif` est absent sur la version 1 : elle n'a pas été
 * "modifiée", elle a été votée.
 */
const VersionBudgetSchema = new Schema(
  {
    numero: { type: Number, required: true, min: 1 },
    figeeLe: { type: Date, required: true },
    figeePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    motif: { type: String, trim: true },
    demande: { type: Schema.Types.ObjectId, ref: "DemandeModificationBudget" },
    soldeInitial: { type: Number, required: true },
    soldeInitialCaisse: { type: Number, required: true },
    seuilTresorerieMin: { type: Number, required: true },
    lignes: { type: [LigneBudgetPrevisionnelSchema], default: [] },
  },
  { _id: true }
);

/**
 * Budget prévisionnel du mandat — story 06.2 (EX-TRS-02), refonte complète.
 *
 * Reprend le classeur de référence : des postes (lignes) répartis en sections,
 * chiffrés mois par mois. Un budget par mandat.
 *
 * Le verrouillage ne vit pas ici : il se déduit, à la lecture, de
 * l'existence d'une AG d'ouverture tenue pour ce mandat
 * (`budgetVerrouille()` dans le service). Stocker un drapeau « verrouillé »
 * finirait par diverger de la réalité de l'AG.
 */
const BudgetPrevisionnelSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      unique: true,
    },
    /** Part du solde initial détenue en espèces ; le solde bancaire s'en déduit. */
    soldeInitialCaisse: { type: Number, default: 0, min: 0 },
    soldeInitial: { type: Number, default: 0 },
    seuilTresorerieMin: { type: Number, default: 500 },
    lignes: { type: [LigneBudgetPrevisionnelSchema], default: [] },
    versions: { type: [VersionBudgetSchema], default: [] },
    /** Demande de modification actuellement acceptée — déverrouille l'édition. */
    demandeActive: {
      type: Schema.Types.ObjectId,
      ref: "DemandeModificationBudget",
    },
  },
  { timestamps: true, collection: "budgets" }
);

export type BudgetPrevisionnel = InferSchemaType<typeof BudgetPrevisionnelSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type LigneBudgetPrevisionnel = InferSchemaType<
  typeof LigneBudgetPrevisionnelSchema
>;
export type VersionBudget = InferSchemaType<typeof VersionBudgetSchema>;

export const BudgetPrevisionnelModel: Model<BudgetPrevisionnel> =
  (mongoose.models.BudgetPrevisionnel as Model<BudgetPrevisionnel>) ??
  mongoose.model<BudgetPrevisionnel>(
    "BudgetPrevisionnel",
    BudgetPrevisionnelSchema
  );
