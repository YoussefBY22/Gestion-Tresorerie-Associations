/**
 * Diagnostic en lecture seule de la base.
 *
 * Usage : npm run etat
 *
 * N'écrit rien. Sert à savoir, avant une session de test, si l'ERP a de quoi
 * fonctionner : un mandat actif, un compte capable de se connecter, et les
 * référentiels de base.
 */
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI absent de .env.local");
    process.exit(1);
  }

  // On n'affiche jamais l'URI : elle contient les identifiants. Seul l'hôte
  // visé est utile au diagnostic.
  const hote = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split("/")[0];

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch {
    console.error(`❌ Impossible de joindre MongoDB sur « ${hote} ».\n`);
    console.error("   L'application ne peut pas fonctionner sans base : toutes");
    console.error("   les pages afficheront un bandeau « erreur base de données ».\n");
    if (/^(localhost|127\.0\.0\.1)/.test(hote)) {
      console.error("   La base visée est locale. Deux façons de la démarrer :\n");
      console.error("   • Sans rien installer, dans une autre fenêtre :");
      console.error("       npm run base:locale\n");
      console.error("   • Avec Docker, si Docker Desktop tourne :");
      console.error("       docker compose up -d\n");
      console.error("   Sinon, pointer MONGODB_URI de .env.local vers un cluster");
      console.error("   MongoDB Atlas.");
    } else {
      console.error("   Vérifier que le cluster est démarré, que l'adresse IP de");
      console.error("   cette machine est autorisée, et que les identifiants de");
      console.error("   MONGODB_URI sont toujours valides.");
    }
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) throw new Error("Connexion indisponible.");
  console.log(`✅ Connexion à MongoDB établie (${hote})\n`);

  const mandats = await db
    .collection("mandats")
    .find({}, { projection: { annee: 1, statut: 1 } })
    .toArray();
  const actif = mandats.find((m) => m.statut === "ACTIF");
  console.log(
    actif
      ? `✅ Mandat actif : ${actif.annee}`
      : `❌ Aucun mandat ACTIF (${mandats.length} mandat(s) en base) — les pages qui filtrent par mandat resteront vides`
  );

  const utilisateurs = await db
    .collection("utilisateurs")
    .find({}, { projection: { email: 1, nom: 1, roles: 1, motDePasseHash: 1, actif: 1 } })
    .toArray();
  console.log(`\n👤 ${utilisateurs.length} compte(s) :`);
  for (const u of utilisateurs) {
    const peutSeConnecter = Boolean(u.motDePasseHash) && u.actif !== false;
    console.log(
      `   ${peutSeConnecter ? "✅" : "⚠️ "} ${u.email} — ${(u.roles ?? []).join(", ") || "aucun rôle"}` +
        (u.motDePasseHash ? "" : "  (SANS MOT DE PASSE : connexion impossible)") +
        (u.actif === false ? "  (COMPTE DÉSACTIVÉ)" : "")
    );
  }

  const collections = [
    ["membres", "Membres"],
    ["departements", "Départements"],
    ["postes", "Postes"],
    ["cotisations", "Cotisations"],
    ["documents", "Documents émis"],
    ["sequences", "Compteurs de référence"],
    ["reunions", "Réunions"],
    ["prospects", "Prospects / clients"],
    ["projets", "Projets"],
    ["fichesProcessus", "Fiches de processus"],
  ] as const;

  console.log("\n📊 Volumétrie :");
  for (const [nom, libelle] of collections) {
    const n = await db.collection(nom).countDocuments();
    console.log(`   ${String(n).padStart(5)}  ${libelle}`);
  }

  await mongoose.disconnect();
  console.log("\nDiagnostic terminé — aucune écriture effectuée.");
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
