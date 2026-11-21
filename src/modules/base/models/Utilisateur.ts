import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Utilisateur — gestion des comptes, volontairement simple
 */

/**
 * Trois rôles suffisent ici, là où l'application en comptait quatorze.
 *
 * `ADMIN` administre les comptes et le paramétrage ; `TRESORIER` tient les
 * comptes ; `LECTEUR` consulte sans rien écrire — c'est le rôle du président
 * ou du commissaire aux comptes, qui doit tout voir et ne rien modifier.
 */
export const ROLES = ["ADMIN", "TRESORIER", "LECTEUR"] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLE: Record<Role, string> = {
  ADMIN: "Administrateur",
  TRESORIER: "Trésorier",
  LECTEUR: "Lecteur",
};

const UtilisateurSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    nom: { type: String, required: true, trim: true },
    /** Jamais renvoyé par défaut : il faut le demander explicitement. */
    motDePasseHash: { type: String, select: false },
    /*
     * Pas de contrainte d'énumération au niveau du schéma : elle ferait
     * inférer à Mongoose un type littéral, et toute affectation depuis une
     * saisie validée par Zod deviendrait un combat de types sans rien
     * garantir de plus. La validation se fait à l'écriture (Zod) et à la
     * lecture (le RBAC ignore tout rôle inconnu : on ferme, on n'ouvre pas).
     */
    roles: { type: [String], default: ["LECTEUR"] },
    actif: { type: Boolean, default: true },
    dernierAcces: { type: Date },
  },
  { timestamps: true, collection: "utilisateurs" }
);

export type Utilisateur = InferSchemaType<typeof UtilisateurSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const UtilisateurModel: Model<Utilisateur> =
  (mongoose.models.Utilisateur as Model<Utilisateur>) ??
  mongoose.model<Utilisateur>("Utilisateur", UtilisateurSchema);
