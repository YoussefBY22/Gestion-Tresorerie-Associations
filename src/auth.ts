import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { UtilisateurModel } from "@/modules/base/models";

/**
 * Authentification — comptes locaux, et rien d'autre.
 *
 * L'ERP dont cette application est issue s'authentifiait par le Workspace
 * Google de la structure. Ce choix ne tient plus ici : une association ou un
 * club n'a pas forcément de domaine, et faire dépendre l'accès aux comptes
 * d'un fournisseur externe est un risque inutile pour un outil qui doit
 * rester disponible le soir d'une assemblée générale.
 *
 * Donc : e-mail et mot de passe, hachés en base (bcrypt), gérés depuis
 * l'application par un administrateur.
 *
 * Deux règles tenues ici :
 *
 * 1. **Le refus ne distingue jamais** « compte inconnu » de « mot de passe
 *    faux ». Les distinguer dirait à un inconnu quelles adresses existent.
 * 2. **Un compte désactivé est refusé sans être supprimé** : le journal doit
 *    continuer de nommer qui a écrit quoi, même après un départ.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [
    Credentials({
      id: "credentials",
      name: "Compte",
      credentials: { email: {}, motDePasse: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const motDePasse = String(credentials?.motDePasse ?? "");
        if (!email || !motDePasse) return null;

        try {
          await connectDb();
          const utilisateur = await UtilisateurModel.findOne({ email }).select(
            "+motDePasseHash"
          );
          if (!utilisateur?.motDePasseHash || !utilisateur.actif) {
            console.warn("[auth] Refus — compte inconnu ou désactivé :", email);
            return null;
          }

          const correspond = await bcrypt.compare(
            motDePasse,
            utilisateur.motDePasseHash
          );
          if (!correspond) {
            console.warn("[auth] Refus — mot de passe erroné :", email);
            return null;
          }

          utilisateur.dernierAcces = new Date();
          await utilisateur.save();

          return {
            id: String(utilisateur._id),
            email: utilisateur.email,
            name: utilisateur.nom,
            /*
             * Recopie en primitives : `utilisateur.roles` est un tableau
             * Mongoose, et Auth.js sérialise le jeton par `structuredClone`,
             * qui lève DataCloneError sur ce type. Sans cette copie, AUCUNE
             * connexion n'aboutit — le symptôme est un CallbackRouteError
             * opaque, qui coûte des heures à diagnostiquer.
             */
            roles: Array.from(utilisateur.roles ?? [], String),
          };
        } catch (err) {
          // Une base injoignable ne doit pas ressembler à un mauvais mot de
          // passe : on le distingue dans les journaux du serveur.
          console.error("[auth] Base injoignable :", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.utilisateurId = (user as { id: string }).id;
        token.roles = (user as { roles?: string[] }).roles ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.utilisateurId as string) ?? "";
        session.user.roles = (token.roles as string[]) ?? [];
      }
      return session;
    },
  },
});
