/**
 * Amorçage d'une installation neuve.
 *
 * Usage : `npm run seed` (lit `.env.local` via `--env-file`).
 *
 * Deux choses, et pas une de plus : l'**exercice en cours**, et le **premier
 * compte administrateur**. Tout le reste — budget, registres, modèles de
 * documents — se saisit depuis l'application, par les personnes qui en
 * répondent. Un jeu de données inventé par un script finit toujours par être
 * pris pour de vraies écritures.
 *
 * Idempotent : relancé, il ne crée pas de doublon et n'écrase pas un mot de
 * passe déjà en place.
 *
 * **Aucun secret n'est écrit dans ce fichier.** L'e-mail et le mot de passe
 * du premier compte viennent de l'environnement ; un mot de passe en clair
 * dans le dépôt finit par suivre le projet jusque chez l'utilisateur final.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MandatModel, UtilisateurModel } from "../src/modules/core/models";
import { mandatCourant } from "../src/modules/core/services/mandat";

const MDP_MINIMUM = 12;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "❌ MONGODB_URI manquant. Renseignez-le dans .env.local (voir .env.example)."
    );
    process.exit(1);
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const nom = process.env.SEED_ADMIN_NOM?.trim();
  const motDePasse = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !nom) {
    console.error(
      "❌ SEED_ADMIN_EMAIL et SEED_ADMIN_NOM sont requis : sans eux, personne ne peut ouvrir l'application."
    );
    process.exit(1);
  }
  /*
   * L'authentification se fait par mot de passe : un compte créé sans mot de
   * passe serait inutilisable, et l'installation paraîtrait cassée alors
   * qu'il ne manque qu'une variable. Mieux vaut refuser maintenant.
   */
  if (motDePasse.length < MDP_MINIMUM) {
    console.error(
      `❌ SEED_ADMIN_PASSWORD doit faire au moins ${MDP_MINIMUM} caractères : c'est le compte qui donne accès aux comptes de la structure.`
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connecté à MongoDB");

  /*
   * Exercice en cours, calculé depuis la date du jour — jamais une année
   * écrite en dur, qui deviendrait fausse dès l'exercice suivant. Les dates
   * proposées restent modifiables dans Administration › Exercices.
   */
  const { annee, debut, fin } = mandatCourant();
  const mandat = await MandatModel.findOneAndUpdate(
    { annee },
    { $setOnInsert: { annee, debut, fin, statut: "ACTIF" } },
    { upsert: true, new: true }
  );
  console.log(
    `✅ Exercice ${mandat.annee} (${mandat.statut}) — ${debut.toLocaleDateString("fr-FR")} → ${fin.toLocaleDateString("fr-FR")}`
  );

  const existant = await UtilisateurModel.findOne({ email }).select("_id");
  const utilisateur = await UtilisateurModel.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        nom,
        actif: true,
        // Le premier compte est administrateur **et** trésorier : il doit
        // pouvoir ouvrir les comptes et commencer à saisir, sans passer par
        // un second compte qui n'existe pas encore.
        roles: ["ADMIN", "TRESORIER"],
        motDePasseHash: await bcrypt.hash(motDePasse, 12),
      },
    },
    { upsert: true, new: true }
  );

  if (existant) {
    console.log(
      `ℹ️  Le compte ${utilisateur.email} existait déjà : ni ses rôles ni son mot de passe n'ont été touchés.`
    );
    console.log(
      "   Pour en redéfinir le mot de passe : Administration › Comptes › Redéfinir le mot de passe."
    );
  } else {
    console.log(
      `✅ Compte administrateur : ${utilisateur.email} — rôles [${utilisateur.roles.join(", ")}]`
    );
    console.log(
      "   Connectez-vous sur /login, puis changez ce mot de passe provisoire."
    );
  }

  await mongoose.disconnect();
  console.log("🌱 Amorçage terminé.");
}

main().catch((err) => {
  console.error("❌ Amorçage échoué :", err);
  process.exit(1);
});
