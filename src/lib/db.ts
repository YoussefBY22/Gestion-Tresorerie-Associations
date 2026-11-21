import mongoose from "mongoose";

/**
 * Connexion Mongoose avec cache global — indispensable en serverless (Vercel) :
 * chaque invocation de fonction réutilise la connexion existante au lieu d'en
 * ouvrir une nouvelle.
 */

declare global {
  var _mongoose:
    | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined;
}

const cached = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cached;

export async function connectDb(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI manquant : renseignez-le dans .env.local (voir .env.example)."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

/**
 * Vérifie que la base est joignable, sans jamais lever d'exception.
 *
 * Sert aux écrans qui doivent *prévenir* plutôt que planter — la page de
 * connexion en premier lieu : sans base, l'authentification échoue avec un
 * « identifiants invalides » trompeur, alors que le mot de passe est bon.
 *
 * Le message ne contient jamais l'URI, qui porte les identifiants.
 */
export async function verifierBase(): Promise<{ ok: boolean; hote?: string }> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { ok: false };
  const hote = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split("/")[0];
  try {
    await connectDb();
    return { ok: true, hote };
  } catch {
    return { ok: false, hote };
  }
}

/** État de la connexion sans forcer une connexion (pour /api/health). */
export function dbState(): "connected" | "connecting" | "disconnected" | "unconfigured" {
  if (!process.env.MONGODB_URI) return "unconfigured";
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    default:
      return "disconnected";
  }
}
