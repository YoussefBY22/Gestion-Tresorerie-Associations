"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { ROLES } from "@/modules/core/rbac";
import { UtilisateurModel, MandatModel } from "@/modules/base/models";

/**
 * Administration — comptes et exercices.
 *
 * Volontairement court. Une association n'a pas besoin d'un annuaire : elle a
 * besoin de savoir **qui peut écrire dans ses comptes**, et de pouvoir le
 * retirer le jour où la personne s'en va.
 *
 * Trois principes tenus ici :
 *
 * - **On désactive, on ne supprime pas.** Le journal d'activité doit continuer
 *   de nommer l'auteur d'une écriture des années plus tard ; supprimer le
 *   compte rendrait la piste d'audit anonyme.
 * - **Le mot de passe n'est jamais lu, seulement remplacé.** Il n'apparaît
 *   dans aucun journal : un journal se relit, parfois par quelqu'un d'autre.
 * - **Un compte sans rôle n'existe pas.** Au moins un rôle est exigé, sinon
 *   le compte entrerait sans rien pouvoir faire — une panne silencieuse.
 */

const rolesValides = Object.keys(ROLES);
const SchemaRoles = z.array(z.enum(rolesValides as [string, ...string[]])).min(1);

export type ResultatAdmin = { ok: boolean; message: string };

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

export async function creerUtilisateur(
  formData: FormData
): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");

  const donnees = z
    .object({
      email: z.string().email().toLowerCase(),
      nom: z.string().min(2).max(120),
      motDePasse: z.string().min(12).max(200),
      roles: SchemaRoles,
    })
    .safeParse({
      email: formData.get("email"),
      nom: formData.get("nom"),
      motDePasse: formData.get("motDePasse"),
      roles: formData.getAll("roles").map(String),
    });

  if (!donnees.success) {
    return {
      ok: false,
      message:
        "Vérifiez la saisie : une adresse valide, un nom, un mot de passe d'au moins 12 caractères et au moins un rôle.",
    };
  }

  await connectDb();
  if (await UtilisateurModel.exists({ email: donnees.data.email })) {
    return {
      ok: false,
      message: `Un compte existe déjà pour ${donnees.data.email}.`,
    };
  }

  const utilisateur = await UtilisateurModel.create({
    email: donnees.data.email,
    nom: donnees.data.nom.trim(),
    roles: donnees.data.roles,
    motDePasseHash: await bcrypt.hash(donnees.data.motDePasse, 12),
    actif: true,
  });

  await journaliser(session, {
    action: "admin.utilisateur.creer",
    entite: "Utilisateur",
    entiteId: String(utilisateur._id),
    details: `${donnees.data.email} — ${donnees.data.roles.join(", ")}`,
  });
  revalidatePath("/admin/utilisateurs");

  return {
    ok: true,
    message: `Compte créé pour ${donnees.data.email}. Communiquez-lui son mot de passe par un autre canal que l'application.`,
  };
}

export async function basculerActifUtilisateur(
  formData: FormData
): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");
  const id = z.string().min(1).parse(formData.get("id"));

  await connectDb();
  const utilisateur = await UtilisateurModel.findById(id);
  if (!utilisateur) return { ok: false, message: "Compte introuvable." };

  // Se couper soi-même l'accès laisserait l'application sans administrateur.
  if (String(utilisateur._id) === session.user?.id && utilisateur.actif) {
    return {
      ok: false,
      message:
        "Vous ne pouvez pas désactiver votre propre compte : plus personne ne pourrait administrer l'application.",
    };
  }

  utilisateur.actif = !utilisateur.actif;
  await utilisateur.save();

  await journaliser(session, {
    action: "admin.utilisateur.activation",
    entite: "Utilisateur",
    entiteId: id,
    details: `${utilisateur.email} — ${utilisateur.actif ? "réactivé" : "désactivé"}`,
  });
  revalidatePath("/admin/utilisateurs");

  return {
    ok: true,
    message: utilisateur.actif
      ? `${utilisateur.email} peut de nouveau se connecter.`
      : `${utilisateur.email} ne peut plus se connecter. Ses écritures restent au journal.`,
  };
}

export async function majRolesUtilisateur(
  formData: FormData
): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");
  const donnees = z
    .object({ id: z.string().min(1), roles: SchemaRoles })
    .safeParse({
      id: formData.get("id"),
      roles: formData.getAll("roles").map(String),
    });

  if (!donnees.success) {
    return {
      ok: false,
      message:
        "Choisissez au moins un rôle : un compte sans rôle ne peut rien faire.",
    };
  }

  await connectDb();
  const utilisateur = await UtilisateurModel.findById(donnees.data.id);
  if (!utilisateur) return { ok: false, message: "Compte introuvable." };

  // Retirer son propre rôle d'administrateur ferme la porte derrière soi.
  if (
    String(utilisateur._id) === session.user?.id &&
    !donnees.data.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      message:
        "Vous ne pouvez pas retirer votre propre rôle d'administrateur : vous perdriez l'accès à cet écran.",
    };
  }

  utilisateur.roles = donnees.data.roles;
  await utilisateur.save();

  await journaliser(session, {
    action: "admin.utilisateur.roles",
    entite: "Utilisateur",
    entiteId: donnees.data.id,
    details: `${utilisateur.email} → ${donnees.data.roles.join(", ")}`,
  });
  revalidatePath("/admin/utilisateurs");

  return { ok: true, message: `Rôles mis à jour pour ${utilisateur.email}.` };
}

export async function definirMotDePasse(
  formData: FormData
): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");
  const donnees = z
    .object({ id: z.string().min(1), motDePasse: z.string().min(12).max(200) })
    .safeParse({
      id: formData.get("id"),
      motDePasse: formData.get("motDePasse"),
    });

  if (!donnees.success) {
    return {
      ok: false,
      message: "Le mot de passe doit faire au moins 12 caractères.",
    };
  }

  await connectDb();
  const utilisateur = await UtilisateurModel.findById(donnees.data.id);
  if (!utilisateur) return { ok: false, message: "Compte introuvable." };

  utilisateur.motDePasseHash = await bcrypt.hash(donnees.data.motDePasse, 12);
  await utilisateur.save();

  await journaliser(session, {
    action: "admin.utilisateur.motDePasse",
    entite: "Utilisateur",
    entiteId: donnees.data.id,
    details: utilisateur.email,
  });
  revalidatePath("/admin/utilisateurs");

  return {
    ok: true,
    message: `Mot de passe redéfini pour ${utilisateur.email}. Transmettez-le par un autre canal.`,
  };
}

/* ------------------------------------------------------------------ */
/* Exercices                                                           */
/* ------------------------------------------------------------------ */

export async function creerMandat(formData: FormData): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");
  const donnees = z
    .object({
      annee: z.string().min(4).max(20),
      libelle: z.string().max(120).optional(),
      debut: z.coerce.date(),
      fin: z.coerce.date(),
    })
    .safeParse({
      annee: formData.get("annee"),
      libelle: formData.get("libelle") || undefined,
      debut: formData.get("debut"),
      fin: formData.get("fin"),
    });

  if (!donnees.success) {
    return { ok: false, message: "Renseignez l'exercice et ses deux dates." };
  }
  if (donnees.data.fin <= donnees.data.debut) {
    return {
      ok: false,
      message: "La date de fin doit suivre la date de début.",
    };
  }

  await connectDb();
  if (await MandatModel.exists({ annee: donnees.data.annee })) {
    return {
      ok: false,
      message: `L'exercice ${donnees.data.annee} existe déjà.`,
    };
  }

  const mandat = await MandatModel.create({ ...donnees.data, statut: "CLOS" });

  await journaliser(session, {
    action: "admin.mandat.creer",
    entite: "Mandat",
    entiteId: String(mandat._id),
    details: donnees.data.annee,
  });
  revalidatePath("/admin/mandats");

  return {
    ok: true,
    message: `Exercice ${donnees.data.annee} créé. Activez-le pour y saisir les écritures.`,
  };
}

export async function activerMandat(
  formData: FormData
): Promise<ResultatAdmin> {
  const session = await exigerPermission("administration", "ecrire");
  const id = z.string().min(1).parse(formData.get("id"));

  await connectDb();
  const mandat = await MandatModel.findById(id);
  if (!mandat) return { ok: false, message: "Exercice introuvable." };

  /*
   * Un seul exercice actif à la fois : c'est lui qui reçoit toute écriture
   * nouvelle. Deux exercices actifs produiraient des comptes répartis entre
   * deux périodes, sans qu'on sache lesquels.
   */
  await MandatModel.updateMany(
    { statut: "ACTIF" },
    { $set: { statut: "CLOS" } }
  );
  mandat.statut = "ACTIF";
  await mandat.save();

  await journaliser(session, {
    action: "admin.mandat.activer",
    entite: "Mandat",
    entiteId: id,
    details: mandat.annee,
  });
  revalidatePath("/admin/mandats");
  revalidatePath("/tresorerie");

  return {
    ok: true,
    message: `Exercice ${mandat.annee} actif : les nouvelles écritures lui seront rattachées.`,
  };
}
