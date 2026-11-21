/**
 * Compte de test local — pour vérifier les écrans dans un navigateur.
 *
 * Usage : TEST_EMAIL=… TEST_PASSWORD=… npm run compte:test
 *
 * **Aucun secret n'est écrit ici.** Le mot de passe vient de
 * l'environnement : un mot de passe en clair dans le dépôt finirait par
 * suivre le projet jusqu'en production, et un compte de test est justement
 * ce qu'on oublie de retirer.
 *
 * Le compte créé se connecte comme n'importe quel autre : e-mail et mot de
 * passe. Il n'a rien de particulier sinon qu'on sait qu'il peut être
 * supprimé — c'est justement ce qu'on oublie de faire.
 *
 * Pour le retirer : `npm run compte:test -- --supprimer`, ou depuis
 * l'administration des utilisateurs.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UtilisateurModel } from "../src/modules/core/models";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI manquant (renseignez .env.local).");
    process.exit(1);
  }

  const email = (process.env.TEST_EMAIL ?? "").toLowerCase().trim();
  if (!email) {
    console.error("❌ TEST_EMAIL manquant.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  if (process.argv.includes("--supprimer")) {
    const utilisateur = await UtilisateurModel.findOne({ email });
    if (utilisateur) {
      await UtilisateurModel.deleteOne({ _id: utilisateur._id });
      console.log(`🗑️  ${email} supprimé.`);
    } else {
      console.log(`ℹ️  ${email} n'existait pas.`);
    }
    await mongoose.disconnect();
    return;
  }

  const motDePasse = process.env.TEST_PASSWORD;
  if (!motDePasse || motDePasse.length < 12) {
    console.error("❌ TEST_PASSWORD manquant ou trop court (12 caractères).");
    process.exit(1);
  }

  const utilisateur = await UtilisateurModel.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        nom: process.env.TEST_NOM ?? "Compte de test",
        actif: true,
      },
      $addToSet: { roles: { $each: ["ADMIN", "TRESORIER"] } },
      $set: { motDePasseHash: await bcrypt.hash(motDePasse, 12) },
    },
    { upsert: true, new: true }
  );

  console.log(
    `✅ ${utilisateur.email} — rôles [${utilisateur.roles.join(", ")}]\n` +
      `   Connexion sur /login.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
