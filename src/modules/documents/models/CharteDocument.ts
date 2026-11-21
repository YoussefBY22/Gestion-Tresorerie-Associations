import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { CHARTE_DEFAUT } from "../services/charte";

/**
 * Charte graphique appliquée aux documents émis.
 *
 * Elle vivait en dur dans le moteur de rendu : bordeaux, nom de la JE,
 * slogan. Changer une couleur voulait dire modifier le code, ce qu'une Junior
 * Entreprise ne peut pas faire à chaque refonte de son identité — et ce que
 * le mandat suivant ne saura pas faire du tout.
 *
 * `modeles` liste les familles de pièces que cette charte habille ; celle
 * marquée `parDefaut` ramasse le reste. Le contenu des pièces, lui, ne se
 * personnalise pas ici : les gabarits décrivent ce qu'une pièce atteste, la
 * charte seulement comment elle se présente. La **référence** en particulier
 * reste hors de portée — c'est la piste d'audit.
 */
const CharteDocumentSchema = new Schema(
  {
    nom: { type: String, required: true, trim: true },
    /** Familles du catalogue habillées par cette charte. */
    modeles: { type: [String], default: [] },
    /** Charte de repli pour les familles qu'aucune autre ne revendique. */
    parDefaut: { type: Boolean, default: false, index: true },

    nomEmetteur: { type: String, required: true, trim: true, default: CHARTE_DEFAUT.nomEmetteur },
    slogan: { type: String, trim: true, default: CHARTE_DEFAUT.slogan },
    /** Lignes du pied de page : adresse, matricule fiscal, contact… */
    mentions: { type: [String], default: [] },
    /** Remplace le titre du gabarit quand la JE emploie un autre mot. */
    titre: { type: String, trim: true },

    couleurPrimaire: { type: String, trim: true, default: CHARTE_DEFAUT.couleurPrimaire },
    couleurTexte: { type: String, trim: true, default: CHARTE_DEFAUT.couleurTexte },
    couleurSecondaire: {
      type: String,
      trim: true,
      default: CHARTE_DEFAUT.couleurSecondaire,
    },
    /**
     * Texte posé sur l'aplat du bandeau. Vide, il se déduit de la couleur
     * primaire — un bandeau clair avec du texte blanc est illisible et
     * personne ne pense à le corriger.
     */
    couleurSurPrimaire: { type: String, trim: true, default: "" },

    hauteurBandeau: { type: Number, default: CHARTE_DEFAUT.hauteurBandeau },
    afficherSlogan: { type: Boolean, default: true },
    bandeauPied: { type: Boolean, default: false },
    afficherMentionErp: { type: Boolean, default: true },

    /** Logo du bandeau, stocké dans GridFS comme les PDF. */
    logoFichierId: { type: Schema.Types.ObjectId },
    logoType: { type: String, enum: ["png", "jpeg"] },
    logoNom: { type: String, trim: true },

    creePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { timestamps: true, collection: "chartes_documents" }
);

export type CharteDocument = InferSchemaType<typeof CharteDocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CharteDocumentModel: Model<CharteDocument> =
  (mongoose.models.CharteDocument as Model<CharteDocument>) ??
  mongoose.model<CharteDocument>("CharteDocument", CharteDocumentSchema);
