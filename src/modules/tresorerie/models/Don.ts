import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PieceJustificativeSchema } from "./piece-justificative";

/**
 * Registre des aides, dons, donations et legs — décret-loi 2011-88 : le
 * reçu de don doit porter le CIN du donateur (constat d'audit : CIN
 * manquant). Distingue nature (numéraire/nature), origine (publique/privée)
 * et provenance (nationale/étrangère) — trois classifications légales
 * exigées par la réglementation associative, absentes du simple journal des
 * flux.
 */
export const NATURES_DON = ["NUMERAIRE", "NATURE"] as const;
export const ORIGINES_DON = ["PUBLIQUE", "PRIVEE"] as const;
export const PROVENANCES_DON = ["NATIONALE", "ETRANGERE"] as const;

export const LIBELLES_NATURE_DON: Record<(typeof NATURES_DON)[number], string> = {
  NUMERAIRE: "En numéraire",
  NATURE: "En nature",
};
export const LIBELLES_ORIGINE_DON: Record<(typeof ORIGINES_DON)[number], string> = {
  PUBLIQUE: "Origine publique",
  PRIVEE: "Origine privée",
};
export const LIBELLES_PROVENANCE_DON: Record<(typeof PROVENANCES_DON)[number], string> = {
  NATIONALE: "Nationale",
  ETRANGERE: "Étrangère",
};

const DonSchema = new Schema(
  {
    mandat: { type: Schema.Types.ObjectId, ref: "Mandat", required: true, index: true },
    donateur: { type: String, required: true, trim: true },
    /** Obligatoire pour un don numéraire d'une personne physique (décret-loi 2011-88). */
    cin: { type: String, trim: true },
    nature: { type: String, enum: NATURES_DON, required: true },
    /** Montant en DT pour un don numéraire ; estimation pour un don en nature. */
    montant: { type: Number, min: 0 },
    /** Description du bien pour un don en nature (matériel, mobilier…). */
    descriptionNature: { type: String, trim: true },
    origine: { type: String, enum: ORIGINES_DON, required: true },
    provenance: { type: String, enum: PROVENANCES_DON, required: true },
    date: { type: Date, required: true, default: Date.now },
    objet: { type: String, trim: true },
    /** L'encaissement réel, pour un don numéraire — le reçu s'émet depuis lui. */
    flux: { type: Schema.Types.ObjectId, ref: "FluxTresorerie" },
    /** Référence du reçu émis depuis le moteur de documents (RECU_DON). */
    document: { type: Schema.Types.ObjectId, ref: "Document" },

    /**
     * Pièces justificatives — c'est la preuve qu'on demande en audit, pas la
     * ligne du registre. Voir `services/pieces-justificatives.ts`.
     */
    justificatifs: { type: [PieceJustificativeSchema], default: [] },
  },
  { timestamps: true, collection: "dons" }
);

export type Don = InferSchemaType<typeof DonSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DonModel: Model<Don> =
  (mongoose.models.Don as Model<Don>) ?? mongoose.model<Don>("Don", DonSchema);
