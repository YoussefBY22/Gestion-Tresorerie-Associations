"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { CharteDocumentModel } from "@/modules/documents/models/CharteDocument";
import {
  enregistrerFichier,
  supprimerFichier,
} from "@/modules/documents/services/stockage";
import { HAUTEUR_BANDEAU } from "@/modules/documents/services/charte";
import { MODELES_TRESORERIE } from "@/modules/tresorerie/services/modeles-tresorerie";

/**
 * Modèles de documents de la trésorerie — la charte graphique appliquée aux
 * pièces émises.
 *
 * Ce qui se règle ici : couleurs, logo, bandeaux, identité de l'émetteur,
 * mentions de pied, intitulé. Ce qui ne s'y règle pas, et n'a pas à s'y
 * régler : la **référence** et sa numérotation, qui sont la piste d'audit, et
 * le contenu de la pièce, qui dit ce qu'elle atteste.
 */

const TAILLE_LOGO_MAX = 1_000_000; // 1 Mo — un logo de bandeau, pas une photo.
const TYPES_LOGO: Record<string, "png" | "jpeg"> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
};

const CODES_TRESORERIE = MODELES_TRESORERIE.map((m) => m.code);

const SchemaCharte = z.object({
  nom: z.string().min(2).max(80),
  nomEmetteur: z.string().min(2).max(120),
  slogan: z.string().max(120).optional(),
  titre: z.string().max(120).optional(),
  mentions: z.string().max(600).optional(),
  couleurPrimaire: z.string().max(9),
  couleurTexte: z.string().max(9),
  couleurSecondaire: z.string().max(9),
  couleurSurPrimaire: z.string().max(9).optional(),
  hauteurBandeau: z.coerce
    .number()
    .min(HAUTEUR_BANDEAU.min)
    .max(HAUTEUR_BANDEAU.max),
  afficherSlogan: z.boolean(),
  bandeauPied: z.boolean(),
  afficherMentionErp: z.boolean(),
  modeles: z.array(z.string()),
  parDefaut: z.boolean(),
});

function lireCharte(formData: FormData) {
  const coche = (nom: string) => formData.get(nom) === "on";
  return SchemaCharte.parse({
    nom: formData.get("nom"),
    nomEmetteur: formData.get("nomEmetteur"),
    slogan: formData.get("slogan") || undefined,
    titre: formData.get("titre") || undefined,
    mentions: formData.get("mentions") || undefined,
    couleurPrimaire: formData.get("couleurPrimaire"),
    couleurTexte: formData.get("couleurTexte"),
    couleurSecondaire: formData.get("couleurSecondaire"),
    // Absente quand la case « s'ajuster au fond » est cochée : l'entrée est
    // alors désactivée et n'est pas envoyée. Le rendu déduit la couleur.
    couleurSurPrimaire: formData.get("couleurSurPrimaire") || undefined,
    hauteurBandeau: formData.get("hauteurBandeau"),
    afficherSlogan: coche("afficherSlogan"),
    bandeauPied: coche("bandeauPied"),
    afficherMentionErp: coche("afficherMentionErp"),
    // Les cases décochées n'arrivent pas : on lit ce qui est là, et on
    // n'accepte que des familles de la trésorerie.
    modeles: formData
      .getAll("modeles")
      .map(String)
      .filter((code) => CODES_TRESORERIE.includes(code)),
    parDefaut: coche("parDefaut"),
  });
}

/** Une seule charte par défaut : la nouvelle destitue l'ancienne. */
async function assurerUniciteDefaut(id: Types.ObjectId) {
  await CharteDocumentModel.updateMany(
    { _id: { $ne: id }, parDefaut: true },
    { $set: { parDefaut: false } }
  );
}

function champs(donnees: z.infer<typeof SchemaCharte>) {
  return {
    ...donnees,
    mentions: (donnees.mentions ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    couleurSurPrimaire: donnees.couleurSurPrimaire ?? "",
  };
}

export async function creerCharte(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = lireCharte(formData);

  await connectDb();
  const charte = await CharteDocumentModel.create({
    ...champs(donnees),
    creePar: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
  });
  if (donnees.parDefaut) await assurerUniciteDefaut(charte._id);

  await journaliser(session, {
    action: "tresorerie.charte.creer",
    entite: "CharteDocument",
    entiteId: String(charte._id),
    details: donnees.nom,
  });
  revalidatePath("/tresorerie/documentation/modeles");
}

export async function modifierCharte(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const charteId = z.string().min(1).parse(formData.get("charteId"));
  const donnees = lireCharte(formData);

  await connectDb();
  const charte = await CharteDocumentModel.findById(charteId);
  if (!charte) throw new Error("Modèle introuvable.");

  charte.set(champs(donnees));
  await charte.save();
  if (donnees.parDefaut) await assurerUniciteDefaut(charte._id);

  await journaliser(session, {
    action: "tresorerie.charte.modifier",
    entite: "CharteDocument",
    entiteId: charteId,
    details: `${donnees.nom} — ${donnees.modeles.length} famille(s)`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

/**
 * Dépose le logo du bandeau. Il remplace le précédent, qui est détruit :
 * garder les anciens ne servirait qu'à gonfler le stockage.
 */
export async function deposerLogoCharte(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const charteId = z.string().min(1).parse(formData.get("charteId"));
  const fichier = formData.get("logo");

  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Choisissez une image à déposer.");
  }
  const type = TYPES_LOGO[fichier.type];
  if (!type) {
    throw new Error(
      `Format « ${fichier.type || "inconnu"} » non pris en charge : déposez un PNG ou un JPEG.`
    );
  }
  if (fichier.size > TAILLE_LOGO_MAX) {
    throw new Error(
      `Logo trop lourd (${Math.round(fichier.size / 1024)} Ko) : 1 Mo au maximum. C'est un logo de bandeau, quelques centaines de pixels suffisent.`
    );
  }

  await connectDb();
  const charte = await CharteDocumentModel.findById(charteId);
  if (!charte) throw new Error("Modèle introuvable.");

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const { fichierId } = await enregistrerFichier(fichier.name, octets, {
    usage: "logo-charte",
    contentType: fichier.type,
  });

  const ancien = charte.logoFichierId;
  charte.logoFichierId = fichierId;
  charte.logoType = type;
  charte.logoNom = fichier.name;
  await charte.save();
  if (ancien) await supprimerFichier(ancien);

  await journaliser(session, {
    action: "tresorerie.charte.logo",
    entite: "CharteDocument",
    entiteId: charteId,
    details: `${charte.nom} — ${fichier.name}`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

export async function retirerLogoCharte(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const charteId = z.string().min(1).parse(formData.get("charteId"));

  await connectDb();
  const charte = await CharteDocumentModel.findById(charteId);
  if (!charte) throw new Error("Modèle introuvable.");
  const ancien = charte.logoFichierId;

  charte.logoFichierId = undefined;
  charte.logoType = undefined;
  charte.logoNom = undefined;
  await charte.save();
  if (ancien) await supprimerFichier(ancien);

  await journaliser(session, {
    action: "tresorerie.charte.logo.retirer",
    entite: "CharteDocument",
    entiteId: charteId,
    details: charte.nom,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/documents");
}

/**
 * Supprime un modèle — vers la corbeille, comme le reste de l'application.
 * Les pièces déjà émises ne bougent pas : leur PDF est figé depuis leur
 * émission. Seules les suivantes changent d'allure.
 */
export async function supprimerCharte(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const charteId = z.string().min(1).parse(formData.get("charteId"));

  await connectDb();
  const charte = await CharteDocumentModel.findById(charteId).lean();
  if (!charte) throw new Error("Modèle introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "CHARTE_DOCUMENT",
    titre: charte.nom,
    description: charte.parDefaut
      ? "Modèle par défaut"
      : `${(charte.modeles ?? []).length} famille(s) de documents`,
    donnees: charte,
    fichiers: [charte.logoFichierId ?? undefined],
    session,
  });
  await CharteDocumentModel.deleteOne({ _id: charte._id });

  await journaliser(session, {
    action: "tresorerie.charte.supprimer",
    entite: "CharteDocument",
    entiteId: charteId,
    details: `${charte.nom} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/documentation/modeles");
  revalidatePath("/corbeille");
  revalidatePath("/documents");
}
