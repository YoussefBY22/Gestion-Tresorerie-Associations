import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  TAUX_TVA_DEFAUT,
  TIMBRE_FISCAL_DT,
  TYPES_PRESTATAIRE,
} from "../services/fiscal";

export const MODES_REGLEMENT = [
  "VIREMENT",
  "CHEQUE",
  "ESPECES",
  "CARTE",
  "AUTRE",
] as const;

/**
 * Facture reçue d'un fournisseur — la « feuille Factures réceptionées » de
 * l'outil OTMT du drive.
 *
 * Elle porte deux informations que la facture émise n'a pas : le **type de
 * prestataire**, qui détermine la retenue à la source, et le caractère
 * **déductible** de la TVA (toute TVA payée n'ouvre pas droit à déduction).
 *
 * `mois` est dénormalisé au format AAAA-MM : c'est la maille de la
 * déclaration, et cela évite une agrégation par plage de dates à chaque
 * ouverture de l'écran.
 */
const FactureFournisseurSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    mois: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
    date: { type: Date, required: true, default: Date.now },
    reference: { type: String, required: true, trim: true },
    fournisseur: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    montantHT: { type: Number, required: true, min: 0 },
    tauxTVA: { type: Number, default: TAUX_TVA_DEFAUT, min: 0 },
    timbreFiscal: { type: Number, default: TIMBRE_FISCAL_DT, min: 0 },
    autresTaxes: { type: Number, default: 0, min: 0 },
    /** Faux quand la TVA payée n'ouvre pas droit à déduction. */
    tvaDeductible: { type: Boolean, default: true },
    /** Dénormalisé : c'est le montant qui figure sur la pièce reçue. */
    montantTTC: { type: Number, required: true, min: 0 },

    typePrestataire: {
      type: String,
      enum: [...TYPES_PRESTATAIRE.map((t) => t.code), null],
      default: null,
    },
    modeReglement: { type: String, enum: MODES_REGLEMENT, default: "VIREMENT" },
    justificatifRef: { type: String, trim: true },
  },
  { timestamps: true, collection: "facturesFournisseurs" }
);

FactureFournisseurSchema.index({ mandat: 1, mois: 1 });

export type FactureFournisseur = InferSchemaType<
  typeof FactureFournisseurSchema
> & { _id: mongoose.Types.ObjectId };

export const FactureFournisseurModel: Model<FactureFournisseur> =
  (mongoose.models.FactureFournisseur as Model<FactureFournisseur>) ??
  mongoose.model<FactureFournisseur>(
    "FactureFournisseur",
    FactureFournisseurSchema
  );
