/**
 * Base de données **locale**, sur ce PC, sans rien installer.
 *
 * Usage : `npm run base:locale` — laissez la fenêtre ouverte, puis lancez
 * `npm run dev` dans une seconde fenêtre.
 *
 * Pourquoi ce script existe : une trésorière d'association n'a pas à monter
 * un serveur de base de données pour tenir ses comptes. Au premier
 * lancement, un vrai binaire MongoDB est téléchargé (une fois, ~100 Mo) puis
 * démarré sur le port choisi, avec les données écrites dans un dossier du
 * projet. Aucun compte en ligne, aucun conteneur, aucune donnée qui sort du
 * poste.
 *
 * **Les données persistent** d'un lancement à l'autre : elles vivent dans
 * `DONNEES_LOCALES` (par défaut `.donnees/mongo`), qui est exclu du dépôt.
 * Arrêter le script n'efface rien ; supprimer ce dossier, si.
 *
 * Ce n'est pas la seule option. Voir `.env.example` : Docker pour une
 * installation locale plus classique, MongoDB Atlas pour un stockage en
 * ligne partagé entre plusieurs postes.
 */
import { mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = Number(process.env.PORT_MONGO ?? 27018);
const BASE = process.env.NOM_BASE ?? "tresorerie";
const CHEMIN = resolve(process.env.DONNEES_LOCALES ?? ".donnees/mongo");

/**
 * Quelqu'un écoute-t-il déjà sur ce port ?
 *
 * Sans cette question, un second lancement démarre un mongod qui ne peut pas
 * se lier au port, s'arrête aussitôt, et la bibliothèque rapporte l'incident
 * sous la forme d'une erreur d'analyse JSON — illisible, et qui ne dit
 * surtout pas la seule chose utile : la base tourne déjà.
 */
function portOccupe(port: number): Promise<boolean> {
  return new Promise((resoudre) => {
    const sonde = createConnection({ host: "127.0.0.1", port })
      .on("connect", () => {
        sonde.destroy();
        resoudre(true);
      })
      .on("error", () => resoudre(false));
    sonde.setTimeout(700, () => {
      sonde.destroy();
      resoudre(false);
    });
  });
}

async function main() {
  if (await portOccupe(PORT)) {
    const uri = `mongodb://127.0.0.1:${PORT}/${BASE}`;
    console.log(`ℹ️  Une base écoute déjà sur le port ${PORT}.`);
    console.log("\n   Rien à faire : utilisez-la telle quelle.");
    console.log(`   MONGODB_URI="${uri}"`);
    console.log(
      "\n   Si ce n'est pas la bonne, arrêtez-la, ou choisissez un autre port :"
    );
    console.log("   PORT_MONGO=27019 npm run base:locale");
    return;
  }

  mkdirSync(CHEMIN, { recursive: true });

  console.log("⏳ Démarrage de MongoDB en local…");
  console.log("   Données : " + CHEMIN);

  const serveur = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbName: BASE,
      dbPath: CHEMIN,
      // Sans ce moteur, les données ne survivraient pas à l'arrêt : c'est
      // tout l'intérêt par rapport à une base de test jetable.
      storageEngine: "wiredTiger",
    },
  });

  const uri = `mongodb://127.0.0.1:${PORT}/${BASE}`;
  console.log("\n✅ MongoDB écoute sur " + uri);
  console.log("\n   Reportez cette ligne dans .env.local :");
  console.log(`   MONGODB_URI="${uri}"`);
  console.log(
    "\n   Laissez cette fenêtre ouverte. Ctrl+C arrête la base (sans rien effacer)."
  );

  const arreter = async () => {
    console.log("\n⏹  Arrêt de MongoDB — les données restent dans " + CHEMIN);
    // `false` : on arrête l'instance **sans** supprimer le dossier de
    // données. Le défaut de la bibliothèque est de nettoyer ; ici, nettoyer
    // reviendrait à effacer la comptabilité de l'association.
    await serveur.stop({ doCleanup: false, force: false });
    process.exit(0);
  };

  process.on("SIGINT", arreter);
  process.on("SIGTERM", arreter);
}

main().catch((err) => {
  console.error("❌ Impossible de démarrer MongoDB en local :", err);
  console.error(
    "\n   Si le port est déjà pris, relancez avec un autre : PORT_MONGO=27019 npm run base:locale"
  );
  process.exit(1);
});
