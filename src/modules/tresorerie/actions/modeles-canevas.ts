"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import {
  enregistrerFichier,
  supprimerFichier,
} from "@/modules/documents/services/stockage";
import { canevasLivre } from "@/modules/documents/services/modeles-livres";
import { A4 } from "@/modules/documents/services/canevas";
import { MODELES_TRESORERIE } from "@/modules/tresorerie/services/modeles-tresorerie";

/**
 * Modèles de documents posés sur un canevas.
 *
 * Le canevas arrive du navigateur en un seul bloc : l'éditeur enregistre
 * l'état complet de la page, pas des gestes individuels. C'est ce qui rend le
 * déplacement à la souris possible sans un aller-retour serveur par pixel.
 *
 * Le contenu des blocs n'est pas validé champ par champ ici — leur forme est
 * décrite et testée dans `documents/services/canevas.ts`. On vérifie ce qui
 * protège : la taille, pour qu'un canevas ne devienne pas un vecteur de
 * saturation, et l'appartenance des familles à la trésorerie.
 */

const TAILLE_IMAGE_MAX = 3_000_000; // 3 Mo — un cachet, pas une photo d'album.
const MAX_BLOCS = 400;
const TYPES_IMAGE: Record<string, "png" | "jpeg"> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
};

const CODES_TRESORERIE = MODELES_TRESORERIE.map((m) => m.code);

function familles(formData: FormData): string[] {
  return formData
    .getAll("modeles")
    .map(String)
    .filter((code) => CODES_TRESORERIE.includes(code));
}

export async function creerModeleCanevas(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ nom: z.string().min(2).max(80), depuis: z.string().max(60).optional() })
    .parse({
      nom: formData.get("nom"),
      depuis: formData.get("depuis") || undefined,
    });

  await connectDb();
  // Un modèle naît sur la mise en page livrée avec l'application plutôt que sur une
  // page blanche : on part de quelque chose de présentable, qu'on retouche.
  const depart = canevasLivre(donnees.depuis ?? "");

  const modele = await ModeleDocumentModel.create({
    nom: donnees.nom,
    modeles: familles(formData),
    largeur: depart.largeur,
    hauteur: depart.hauteur,
    blocs: depart.blocs,
    creePar: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
  });

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.creer",
    entite: "ModeleDocument",
    entiteId: String(modele._id),
    details: `${donnees.nom} — ${depart.blocs.length} bloc(s)`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
}

/** Enregistre la page entière telle que l'éditeur la montre. */
export async function enregistrerCanevas(
  modeleId: string,
  canevas: { largeur: number; hauteur: number; blocs: unknown[] }
) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const id = z.string().min(1).parse(modeleId);

  if (!Array.isArray(canevas.blocs) || canevas.blocs.length > MAX_BLOCS) {
    throw new Error(
      `Un modèle ne peut pas dépasser ${MAX_BLOCS} blocs — au-delà, c'est qu'il faudrait le découper.`
    );
  }

  await connectDb();
  const modele = await ModeleDocumentModel.findById(id);
  if (!modele) throw new Error("Modèle introuvable.");

  modele.largeur = Math.min(Math.max(50, canevas.largeur), 1000);
  modele.hauteur = Math.min(Math.max(50, canevas.hauteur), 1000);
  modele.blocs = canevas.blocs as never;
  modele.modifiePar = session.user?.id
    ? new Types.ObjectId(session.user.id)
    : undefined;
  await modele.save();

  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

/** Nom et familles habillées — ce qui ne se règle pas sur le canevas. */
export async function majReglagesModele(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ modeleId: z.string().min(1), nom: z.string().min(2).max(80) })
    .parse({ modeleId: formData.get("modeleId"), nom: formData.get("nom") });

  await connectDb();
  const modele = await ModeleDocumentModel.findById(donnees.modeleId);
  if (!modele) throw new Error("Modèle introuvable.");

  const choisies = familles(formData);
  // Deux modèles ne peuvent pas revendiquer la même famille : le second
  // gagnerait au hasard de l'ordre de lecture en base.
  await ModeleDocumentModel.updateMany(
    { _id: { $ne: modele._id }, modeles: { $in: choisies } },
    { $pull: { modeles: { $in: choisies } } }
  );

  modele.nom = donnees.nom;
  modele.modeles = choisies;
  await modele.save();

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.reglages",
    entite: "ModeleDocument",
    entiteId: donnees.modeleId,
    details: `${donnees.nom} — ${choisies.length} famille(s)`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

/**
 * Dépose une image utilisable par les blocs du modèle.
 * Rend l'identifiant du fichier, que l'éditeur pose sur un nouveau bloc.
 */
export async function deposerImageModele(
  formData: FormData
): Promise<{ fichierId: string; nom: string; type: "png" | "jpeg" }> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const modeleId = z.string().min(1).parse(formData.get("modeleId"));
  const fichier = formData.get("image");

  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Choisissez une image à déposer.");
  }
  const type = TYPES_IMAGE[fichier.type];
  if (!type) {
    throw new Error(
      `Format « ${fichier.type || "inconnu"} » non pris en charge : déposez un PNG ou un JPEG.`
    );
  }
  if (fichier.size > TAILLE_IMAGE_MAX) {
    throw new Error(
      `Image trop lourde (${Math.round(fichier.size / 1024)} Ko) : 3 Mo au maximum.`
    );
  }

  await connectDb();
  const modele = await ModeleDocumentModel.findById(modeleId);
  if (!modele) throw new Error("Modèle introuvable.");

  const { fichierId } = await enregistrerFichier(
    fichier.name,
    new Uint8Array(await fichier.arrayBuffer()),
    { usage: "image-modele", contentType: fichier.type }
  );
  modele.images.push({ fichierId, nom: fichier.name, type } as never);
  await modele.save();

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.image",
    entite: "ModeleDocument",
    entiteId: modeleId,
    details: `${modele.nom} — ${fichier.name}`,
  });
  revalidatePath("/tresorerie/documentation/modeles");

  return { fichierId: String(fichierId), nom: fichier.name, type };
}

/**
 * Retire une image déposée. Les blocs qui la montraient sont retirés avec
 * elle : laisser un cadre qui pointe un fichier détruit ferait un trou muet
 * dans le document.
 */
export async function retirerImageModele(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ modeleId: z.string().min(1), fichierId: z.string().min(1) })
    .parse({
      modeleId: formData.get("modeleId"),
      fichierId: formData.get("fichierId"),
    });

  await connectDb();
  const modele = await ModeleDocumentModel.findById(donnees.modeleId);
  if (!modele) throw new Error("Modèle introuvable.");

  const image = modele.images.find(
    (i) => String(i.fichierId) === donnees.fichierId
  );
  modele.images = modele.images.filter(
    (i) => String(i.fichierId) !== donnees.fichierId
  ) as never;
  modele.blocs = (modele.blocs as unknown as { type: string; fichierId?: string }[]).filter(
    (b) => !(b.type === "IMAGE" && b.fichierId === donnees.fichierId)
  ) as never;
  await modele.save();
  if (image) await supprimerFichier(image.fichierId);

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.image.retirer",
    entite: "ModeleDocument",
    entiteId: donnees.modeleId,
    details: `${modele.nom} — ${image?.nom ?? donnees.fichierId}`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

/** Supprime un modèle — vers la corbeille, comme le reste de l'application. */
export async function supprimerModeleCanevas(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const modeleId = z.string().min(1).parse(formData.get("modeleId"));

  await connectDb();
  const modele = await ModeleDocumentModel.findById(modeleId).lean();
  if (!modele) throw new Error("Modèle introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "MODELE_DOCUMENT",
    titre: modele.nom,
    description: `${(modele.blocs ?? []).length} bloc(s) · ${(modele.modeles ?? []).length} famille(s)`,
    donnees: modele,
    fichiers: modele.images?.map((i) => i.fichierId) ?? [],
    session,
  });
  await ModeleDocumentModel.deleteOne({ _id: modele._id });

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.supprimer",
    entite: "ModeleDocument",
    entiteId: modeleId,
    details: `${modele.nom} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/corbeille");
  revalidatePath("/documents");

  // On supprime depuis la page du modèle : y rester affichait une 404, alors
  // que la suppression avait parfaitement eu lieu.
  redirect("/tresorerie/documentation/modeles");
}

/** Remet la mise en page livrée avec l'application, en gardant nom et familles. */
export async function reinitialiserCanevas(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ modeleId: z.string().min(1), depuis: z.string().min(1).max(60) })
    .parse({
      modeleId: formData.get("modeleId"),
      depuis: formData.get("depuis"),
    });

  await connectDb();
  const modele = await ModeleDocumentModel.findById(donnees.modeleId);
  if (!modele) throw new Error("Modèle introuvable.");

  const depart = canevasLivre(donnees.depuis);
  modele.largeur = depart.largeur || A4.largeur;
  modele.hauteur = depart.hauteur || A4.hauteur;
  modele.blocs = depart.blocs as never;
  await modele.save();

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.reinitialiser",
    entite: "ModeleDocument",
    entiteId: donnees.modeleId,
    details: `${modele.nom} ← mise en page livrée (${donnees.depuis})`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
}
