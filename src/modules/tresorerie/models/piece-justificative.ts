import { Schema, type InferSchemaType } from "mongoose";

/**
 * Pièce justificative attachée à une ligne de registre.
 *
 * Le registre clients portait déjà ce sous-schéma, défini chez lui. Les
 * autres registres n'acceptaient rien : la ligne existait sans sa preuve.
 * Comme les quatre doivent stocker la même chose et refuser de la même
 * façon, le schéma vit ici, et les règles d'acceptation dans
 * `services/pieces-justificatives.ts`.
 *
 * Le fichier lui-même est dans GridFS, comme les PDF émis : `fichierId` y
 * renvoie. Le nom d'origine est conservé — c'est souvent lui qui dit de quoi
 * il s'agit, quand le libellé a été laissé vide.
 */
export const PieceJustificativeSchema = new Schema(
  {
    fichierId: { type: Schema.Types.ObjectId, required: true },
    nomFichier: { type: String, trim: true },
    libelle: { type: String, trim: true },
    tailleOctets: { type: Number, min: 0 },
    deposeLe: { type: Date, default: Date.now },
  },
  { _id: true }
);

export type PieceJustificativeDoc = InferSchemaType<
  typeof PieceJustificativeSchema
>;
