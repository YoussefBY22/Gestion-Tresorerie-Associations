import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Modèle de document posé sur un canevas.
 *
 * Pendant de `CharteDocument`, qui habille les documents **en flux** (rapports,
 * procès-verbaux, attestations) : ici, la mise en page est choisie bloc par
 * bloc. C'est la forme des reçus, factures, devis et bons de commande — et
 * celle des fichiers que la JE possède déjà dans son drive, qu'on pourra donc
 * traduire en blocs plutôt que de les réinterpréter.
 *
 * `blocs` est stocké en `Mixed` à dessein : la forme d'un bloc est décrite et
 * validée par `services/canevas.ts` (union typée, testée), pas par Mongoose.
 * Dupliquer le schéma ici ferait deux vérités qui divergeraient au premier
 * type de bloc ajouté.
 *
 * Une famille du catalogue qui a un modèle ici est rendue par le moteur de
 * canevas ; sans modèle, elle reste rendue par son gabarit en flux. Les deux
 * cohabitent, et c'est voulu : un procès-verbal n'a pas à être positionné au
 * millimètre.
 */
const ModeleDocumentSchema = new Schema(
  {
    nom: { type: String, required: true, trim: true },
    /** Familles du catalogue rendues par ce modèle. */
    modeles: { type: [String], default: [], index: true },

    largeur: { type: Number, default: 210 },
    hauteur: { type: Number, default: 297 },
    /** Blocs du canevas — voir `services/canevas.ts` pour leur forme. */
    blocs: { type: [Schema.Types.Mixed], default: [] },

    /**
     * Fichiers déposés pour les blocs image (logo, signature, cachet…).
     * Gardés ici plutôt que sur le bloc : un même fichier peut servir à
     * plusieurs blocs, et retirer un bloc ne doit pas détruire l'image.
     */
    images: {
      type: [
        {
          _id: false,
          fichierId: { type: Schema.Types.ObjectId, required: true },
          nom: { type: String, trim: true },
          type: { type: String, enum: ["png", "jpeg"], required: true },
        },
      ],
      default: [],
    },

    actif: { type: Boolean, default: true, index: true },
    creePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
    modifiePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { timestamps: true, collection: "modeles_documents" }
);

export type ModeleDocument = InferSchemaType<typeof ModeleDocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ModeleDocumentModel: Model<ModeleDocument> =
  (mongoose.models.ModeleDocument as Model<ModeleDocument>) ??
  mongoose.model<ModeleDocument>("ModeleDocument", ModeleDocumentSchema);
