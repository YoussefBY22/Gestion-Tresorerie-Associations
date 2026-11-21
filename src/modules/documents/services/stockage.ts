import mongoose from "mongoose";
import { GridFSBucket, type ObjectId } from "mongodb";
import { connectDb } from "@/lib/db";

/**
 * Stockage interne des fichiers — décision du 10/08/2026 : l'application ne dépend
 * plus de Google Drive. On utilise GridFS, c'est-à-dire la base elle-même :
 *   - aucune infrastructure supplémentaire à provisionner ;
 *   - la sauvegarde de la base sauvegarde les pièces justificatives ;
 *   - les permissions restent celles du RBAC de l'application.
 *
 * Adapté au volume réel d'une JE (PDF de 20 à 300 Ko, quelques milliers par
 * mandat). Si un jour on stocke des vidéos, on remplacera l'implémentation de
 * ce module par un stockage objet — la signature ne bougera pas.
 */

const BUCKET = "fichiers";

async function bucket(): Promise<GridFSBucket> {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Connexion à la base indisponible.");
  return new GridFSBucket(db, { bucketName: BUCKET });
}

export async function enregistrerFichier(
  nom: string,
  contenu: Uint8Array,
  metadonnees: Record<string, unknown> = {}
): Promise<{ fichierId: ObjectId; tailleOctets: number }> {
  const b = await bucket();
  const flux = b.openUploadStream(nom, {
    // Le type MIME vit dans les métadonnées : le pilote MongoDB récent ne
    // l'expose plus comme option de premier niveau, et c'est de toute façon
    // le handler de téléchargement qui pose l'en-tête.
    metadata: { contentType: "application/pdf", ...metadonnees },
  });
  await new Promise<void>((resolve, reject) => {
    flux.on("error", reject);
    flux.on("finish", () => resolve());
    flux.end(Buffer.from(contenu));
  });
  return { fichierId: flux.id, tailleOctets: contenu.byteLength };
}

export async function lireFichier(id: ObjectId): Promise<Buffer> {
  const b = await bucket();
  const morceaux: Buffer[] = [];
  const flux = b.openDownloadStream(id);
  return new Promise<Buffer>((resolve, reject) => {
    flux.on("data", (m: Buffer) => morceaux.push(m));
    flux.on("error", reject);
    flux.on("end", () => resolve(Buffer.concat(morceaux)));
  });
}

/** Suppression physique — réservée au remplacement d'une version obsolète. */
export async function supprimerFichier(id: ObjectId): Promise<void> {
  const b = await bucket();
  try {
    await b.delete(id);
  } catch {
    // Fichier déjà absent : la suppression reste idempotente.
  }
}
