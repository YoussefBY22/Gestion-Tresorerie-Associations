import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PieceJustificativeSchema } from "./piece-justificative";

/**
 * Registre des fournisseurs — reprend la feuille « Registre Fournisseurs »
 * du classeur : répond au constat d'audit sur la vérification de la
 * matricule fiscale non formalisée avant tout engagement (EX-TRS registres
 * financiers).
 *
 * Distinct de `FactureFournisseur` (une ligne par facture reçue) : ceci est
 * l'annuaire des fournisseurs eux-mêmes, une ligne par tiers. La « dernière
 * collaboration » se déduit des factures reçues plutôt que d'être ressaisie
 * (ADR-010).
 */
const FournisseurSchema = new Schema(
  {
    nom: { type: String, required: true, trim: true },
    adresse: { type: String, trim: true },
    matriculeFiscal: { type: String, trim: true },
    /** Vérification effectuée avant tout engagement, comme l'exige la reco d'audit. */
    verifie: { type: Boolean, default: false },
    naturePrestation: { type: String, trim: true },
    evaluation: { type: Number, min: 0, max: 5 },
    notes: { type: String, trim: true },

    /**
     * Pièces justificatives — c'est la preuve qu'on demande en audit, pas la
     * ligne du registre. Voir `services/pieces-justificatives.ts`.
     */
    justificatifs: { type: [PieceJustificativeSchema], default: [] },
  },
  { timestamps: true, collection: "fournisseurs" }
);

FournisseurSchema.index({ nom: 1 }, { unique: true });

export type Fournisseur = InferSchemaType<typeof FournisseurSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FournisseurModel: Model<Fournisseur> =
  (mongoose.models.Fournisseur as Model<Fournisseur>) ??
  mongoose.model<Fournisseur>("Fournisseur", FournisseurSchema);
