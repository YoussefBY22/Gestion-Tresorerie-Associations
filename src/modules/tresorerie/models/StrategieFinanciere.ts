import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { STATUTS_OBJECTIF_FINANCIER } from "../services/strategie-financiere";

const DemandeSuppressionObjectifSchema = new Schema(
  {
    motif: { type: String, required: true, trim: true },
    demandeLe: { type: Date, required: true },
    demandePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    statut: {
      type: String,
      enum: ["EN_ATTENTE", "ACCEPTEE", "REFUSEE"],
      default: "EN_ATTENTE",
    },
    decidePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    decideLe: { type: Date },
    motifDecision: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * Accord du Président pour qu'un objectif naisse verrouillé.
 *
 * Un objectif verrouillé engage le mandat : il ne se modifie ni ne se
 * supprime plus sans nouvelle décision. Le poser est donc aussi lourd que
 * le retirer, et demande la même signature.
 */
const ValidationObjectifSchema = new Schema(
  {
    statut: {
      type: String,
      enum: ["EN_ATTENTE", "ACCEPTEE", "REFUSEE"],
      default: "EN_ATTENTE",
    },
    motif: { type: String, trim: true },
    demandeLe: { type: Date },
    demandePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    decidePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    decideLe: { type: Date },
    motifDecision: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * Objectif financier SMART du mandat.
 *
 * Deux objectifs sont imposés par la Norme JE (0 dette en fin de mandat,
 * quota de chiffre d'affaires) : ils naissent verrouillés et ne se
 * suppriment que si le Président accepte une demande motivée — même
 * principe que le déverrouillage du budget prévisionnel. Le Trésorier peut
 * en poser d'autres au même régime, mais pas seul : `validation` porte
 * l'accord du Président, et l'objectif ne compte qu'une fois accepté.
 */
const ObjectifFinancierSchema = new Schema(
  {
    libelle: { type: String, required: true, trim: true },
    kpiAssocie: { type: String, trim: true },
    cible: { type: String, trim: true },
    echeance: { type: Date },
    statut: {
      type: String,
      enum: STATUTS_OBJECTIF_FINANCIER,
      default: "A_FAIRE",
    },
    verrouille: { type: Boolean, default: false },
    /** Absente sur les objectifs de la Norme JE : ils ne se discutent pas. */
    validation: { type: ValidationObjectifSchema, default: undefined },
    demandeSuppression: { type: DemandeSuppressionObjectifSchema, default: undefined },
  },
  { _id: true, timestamps: true }
);

/**
 * Stratégie financière du mandat — feuille « Strategie Financiere » du
 * classeur. Répond au constat d'audit sur l'absence de marge de sécurité
 * formalisée (EX-TRS-01) : fonds de roulement cible et objectifs déclarés
 * une fois, suivis mandat après mandat.
 */
const StrategieFinanciereSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      unique: true,
    },
    /** Nombre de mois de charges fixes que la réserve doit couvrir — choix du Trésorier. */
    nombreMoisChargesFixes: { type: Number, default: 12, min: 1 },
    objectifs: { type: [ObjectifFinancierSchema], default: [] },
  },
  { timestamps: true, collection: "strategiesFinancieres" }
);

export type StrategieFinanciere = InferSchemaType<typeof StrategieFinanciereSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type ObjectifFinancier = InferSchemaType<typeof ObjectifFinancierSchema>;

export const StrategieFinanciereModel: Model<StrategieFinanciere> =
  (mongoose.models.StrategieFinanciere as Model<StrategieFinanciere>) ??
  mongoose.model<StrategieFinanciere>(
    "StrategieFinanciere",
    StrategieFinanciereSchema
  );
