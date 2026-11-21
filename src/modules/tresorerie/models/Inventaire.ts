import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const CATEGORIES_BIEN = [
  "INFORMATIQUE",
  "MOBILIER",
  "GOODIES",
  "MATERIEL_EVENEMENT",
  "LOGICIEL",
  "AUTRE",
] as const;

export const LIBELLES_CATEGORIE_BIEN: Record<
  (typeof CATEGORIES_BIEN)[number],
  string
> = {
  INFORMATIQUE: "Informatique",
  MOBILIER: "Mobilier",
  GOODIES: "Goodies / communication",
  MATERIEL_EVENEMENT: "Matériel événementiel",
  LOGICIEL: "Licences logicielles",
  AUTRE: "Autre",
};

export const ETATS_BIEN = ["NEUF", "BON", "USAGE", "HORS_SERVICE", "CEDE"] as const;

export const MOTIFS_MOUVEMENT = [
  "ENTREE",
  "SORTIE_PROJET",
  "SORTIE_EVENEMENT",
  "PERTE",
  "CASSE",
  "CESSION",
  "REGULARISATION",
] as const;

export const LIBELLES_MOTIF: Record<(typeof MOTIFS_MOUVEMENT)[number], string> = {
  ENTREE: "Entrée en stock",
  SORTIE_PROJET: "Sortie — projet",
  SORTIE_EVENEMENT: "Sortie — événement",
  PERTE: "Perte",
  CASSE: "Casse",
  CESSION: "Cession / don",
  REGULARISATION: "Régularisation d'inventaire",
};

/**
 * Fiche de prélèvement — recommandation §7.2 de l'audit financier final
 * 2025-2026 : « mettre en place une fiche de prélèvement du stock afin de
 * justifier les mouvements, d'assurer la traçabilité des sorties et de
 * fiabiliser la mise à jour de l'inventaire ».
 *
 * Chaque mouvement est daté, motivé et nominatif : la quantité en stock
 * n'est jamais éditée à la main, elle se déduit des mouvements.
 */
const MouvementStockSchema = new Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    motif: { type: String, enum: MOTIFS_MOUVEMENT, required: true },
    /** Positif = entrée, négatif = sortie. */
    quantite: { type: Number, required: true },
    /** Personne qui prélève ou restitue — traçabilité demandée par l'audit. */
    beneficiaire: { type: String, trim: true },
    /** Rattachement facultatif à un projet ou un événement. */
    reference: { type: String, trim: true },
    commentaire: { type: String, trim: true },
    enregistrePar: { type: Schema.Types.ObjectId, ref: "Utilisateur" },
  },
  { _id: true }
);

/**
 * Bien de l'inventaire physique — exigence CTJE « conserver, mettre à jour
 * et archiver son inventaire physique ».
 *
 * L'audit financier saluait l'exhaustivité de l'inventaire (références,
 * désignations, quantités, valeurs) mais demandait d'« intégrer correctement
 * la notion d'amortissement en distinguant clairement la durée
 * d'amortissement du taux appliqué ». D'où deux champs distincts :
 * `dureeAmortissementAnnees` (saisie) et un taux **calculé**, jamais saisi —
 * on ne peut donc plus les confondre.
 */
const BienInventaireSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    reference: { type: String, required: true, trim: true, index: true },
    designation: { type: String, required: true, trim: true },
    categorie: { type: String, enum: CATEGORIES_BIEN, default: "AUTRE" },
    etat: { type: String, enum: ETATS_BIEN, default: "BON" },
    /** Quantité initiale ; le stock courant se recalcule via les mouvements. */
    quantiteInitiale: { type: Number, required: true, min: 0, default: 0 },
    valeurUnitaire: { type: Number, required: true, min: 0, default: 0 },
    dateAcquisition: { type: Date, required: true, default: Date.now },
    /**
     * Durée d'utilisation réelle attendue, en années. Le taux d'amortissement
     * linéaire (100 / durée) en est DÉDUIT — il n'est jamais saisi, ce qui
     * supprime l'ambiguïté durée/taux relevée par l'auditeur.
     * `0` ou absent = bien non amortissable (goodies, consommables).
     */
    dureeAmortissementAnnees: { type: Number, min: 0, default: 0 },
    localisation: { type: String, trim: true },
    mouvements: { type: [MouvementStockSchema], default: [] },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "biensInventaire" }
);

BienInventaireSchema.index({ designation: "text", reference: "text" });

export type BienInventaire = InferSchemaType<typeof BienInventaireSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type MouvementStock = InferSchemaType<typeof MouvementStockSchema>;

export const BienInventaireModel: Model<BienInventaire> =
  (mongoose.models.BienInventaire as Model<BienInventaire>) ??
  mongoose.model<BienInventaire>("BienInventaire", BienInventaireSchema);
