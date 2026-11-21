import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Compteur atomique de numérotation documentaire.
 *
 * Un compteur par (modèle, mandat) — voir `cleSequence()`. C'est la garantie
 * que le drive n'offrait pas : deux émissions simultanées ne peuvent pas
 * produire deux fois `RC007-COT-2526`. Voir `prochaineSequence()` pour les
 * précautions que cela demande réellement.
 */
const SequenceSchema = new Schema(
  {
    cle: { type: String, required: true, unique: true, trim: true },
    valeur: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "sequences" }
);

export type Sequence = InferSchemaType<typeof SequenceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SequenceModel: Model<Sequence> =
  (mongoose.models.Sequence as Model<Sequence>) ??
  mongoose.model<Sequence>("Sequence", SequenceSchema);

/** Erreur MongoDB « clé dupliquée ». */
function estCleDupliquee(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

/**
 * Réserve et renvoie le prochain numéro de la séquence.
 *
 * `$inc` est atomique, mais **pas la création du compteur**. Deux appels
 * simultanés sur une clé qui n'existe pas encore font chacun un upsert : sans
 * index unique en place, MongoDB crée alors *deux* documents qui s'incrémentent
 * séparément — et l'on émet deux pièces portant le même numéro. Le cas se
 * produit sur une base neuve, car Mongoose construit ses index en tâche de
 * fond : c'est précisément au premier reçu d'un mandat que le risque est le
 * plus élevé.
 *
 * D'où deux précautions : on s'assure que l'index unique existe avant de
 * toucher au compteur, et on réessaie sur collision — l'index transforme alors
 * la course en erreur E11000 récupérable plutôt qu'en doublon silencieux.
 */
export async function prochaineSequence(cle: string): Promise<number> {
  await SequenceModel.init(); // idempotent et mis en cache par Mongoose

  for (let tentative = 0; tentative < 3; tentative += 1) {
    try {
      const doc = await SequenceModel.findOneAndUpdate(
        { cle },
        { $inc: { valeur: 1 } },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
      ).lean();
      return doc!.valeur;
    } catch (err) {
      // Un concurrent vient de créer le compteur : il existe désormais, le
      // prochain tour tombera sur une simple mise à jour.
      if (!estCleDupliquee(err)) throw err;
    }
  }

  throw new Error(
    `Impossible de réserver un numéro pour « ${cle} » après 3 tentatives.`
  );
}
