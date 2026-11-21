import { connectDb } from "@/lib/db";
import { ModeleDocumentModel } from "../models/ModeleDocument";
import { lireFichier } from "./stockage";
import { imagesRequises, type ImagesDisponibles } from "./rendu-canevas";
import type { Canevas } from "./canevas";

/**
 * Chargement d'un modèle de canevas et de ses images.
 *
 * Rien ici ne lève : une famille sans modèle rend `null`, et l'émission
 * retombe alors sur son gabarit en flux. Un fichier image perdu laisse son
 * bloc vide plutôt que d'empêcher d'émettre la pièce.
 */

export type ModeleCharge = {
  id: string;
  nom: string;
  canevas: Canevas;
  images: ImagesDisponibles;
};

/** Le modèle qui rend cette famille, ou `null` si elle n'en a pas. */
export async function modelePourFamille(
  modele: string
): Promise<ModeleCharge | null> {
  try {
    await connectDb();
    const trouve = await ModeleDocumentModel.findOne({
      modeles: modele,
      actif: true,
    }).lean();
    if (!trouve || !(trouve.blocs ?? []).length) return null;

    const canevas: Canevas = {
      largeur: trouve.largeur,
      hauteur: trouve.hauteur,
      blocs: trouve.blocs as unknown as Canevas["blocs"],
    };

    return {
      id: String(trouve._id),
      nom: trouve.nom,
      canevas,
      images: await chargerImages(canevas, trouve.images ?? []),
    };
  } catch {
    return null;
  }
}

export type ImageDeposee = {
  fichierId: unknown;
  nom?: string | null;
  type: "png" | "jpeg";
};

/**
 * Lit depuis GridFS les seuls fichiers que le canevas utilise réellement.
 *
 * Un modèle peut porter des images déposées puis retirées de la page : les
 * charger toutes alourdirait chaque rendu pour rien.
 */
export async function chargerImages(
  canevas: Canevas,
  deposees: ImageDeposee[]
): Promise<ImagesDisponibles> {
  const parId = new Map(deposees.map((i) => [String(i.fichierId), i]));
  const images: ImagesDisponibles = new Map();

  for (const { id } of imagesRequises(canevas)) {
    const deposee = parId.get(id);
    if (!deposee) continue;
    try {
      images.set(id, {
        octets: await lireFichier(deposee.fichierId as never),
        type: deposee.type,
      });
    } catch {
      // Fichier disparu : le bloc reste vide, le document sort quand même.
    }
  }
  return images;
}
