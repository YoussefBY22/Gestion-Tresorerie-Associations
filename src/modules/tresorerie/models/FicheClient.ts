import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PieceJustificativeSchema = new Schema(
  {
    fichierId: { type: Schema.Types.ObjectId, required: true },
    nomFichier: { type: String, trim: true },
    libelle: { type: String, trim: true },
    tailleOctets: { type: Number, min: 0 },
    deposeLe: { type: Date, default: Date.now },
  },
  { _id: true }
);

/**
 * Colonnes du registre des clients qui appartiennent au Trésorier.
 *
 * Le registre croise deux natures de données. Le nom du projet, le client, le
 * chiffre d'affaires signé viennent du CRM et des Projets : les recopier ici
 * créerait deux vérités qui divergeraient au premier avenant, donc ils
 * restent en lecture seule. Le reste — contact de facturation, découpage en
 * tranches, pièces de paiement — n'existe nulle part ailleurs et n'a aucune
 * raison de remonter dans le CRM. C'est ce que porte cette fiche.
 *
 * Une fiche par projet : c'est le projet qu'on facture, pas le client, et un
 * même client peut être facturé sur deux projets à des conditions
 * différentes.
 */
const FicheClientSchema = new Schema(
  {
    mandat: {
      type: Schema.Types.ObjectId,
      ref: "Mandat",
      required: true,
      index: true,
    },
    projet: {
      type: Schema.Types.ObjectId,
      ref: "Projet",
      required: true,
      unique: true,
    },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    telephone: { type: String, trim: true },
    /**
     * Adresse et matricule fiscal **du client**, tels qu'ils doivent figurer
     * sur la facture. Ils n'existaient nulle part : ni le prospect du CRM ni
     * le projet ne les portent, et une facture tunisienne ne s'en passe pas.
     * Ils vivent ici parce que c'est le projet qu'on facture, et qu'un même
     * client peut être facturé à deux adresses sur deux affaires.
     */
    adresse: { type: String, trim: true },
    matriculeFiscal: { type: String, trim: true },
    /** Découpage convenu du règlement ; la somme n'est pas contrainte au CA. */
    tranche1: { type: Number, min: 0 },
    tranche2: { type: Number, min: 0 },
    notes: { type: String, trim: true },
    justificatifs: { type: [PieceJustificativeSchema], default: [] },
  },
  { timestamps: true, collection: "fichesClients" }
);

export type FicheClient = InferSchemaType<typeof FicheClientSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FicheClientModel: Model<FicheClient> =
  (mongoose.models.FicheClient as Model<FicheClient>) ??
  mongoose.model<FicheClient>("FicheClient", FicheClientSchema);
