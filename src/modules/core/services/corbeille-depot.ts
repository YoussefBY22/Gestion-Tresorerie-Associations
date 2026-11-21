import { Types } from "mongoose";
import type { Session } from "next-auth";
import { connectDb } from "@/lib/db";
import { supprimerFichier } from "@/modules/documents/services/stockage";
import {
  ElementCorbeilleModel,
  type TypeElementCorbeille,
} from "../models/ElementCorbeille";
import type { ModuleCode } from "../rbac";
import { calculerDatePurge, estExpire } from "./corbeille";

/**
 * Corbeille — accès à la base.
 *
 * La corbeille est volontairement générique : elle ne connaît pas la forme de
 * ce qu'elle contient, seulement une photo (`donnees`) suffisante pour le
 * recréer, et la liste des fichiers GridFS qui l'accompagnent. Elle est
 * cloisonnée par module — un Trésorier ne voit jamais la corbeille du
 * secrétariat — ce qui reprend exactement le découpage du RBAC.
 */

export type ElementCorbeilleVue = {
  id: string;
  module: ModuleCode;
  type: TypeElementCorbeille;
  titre: string;
  description?: string;
  supprimeParNom?: string;
  supprimeLe: Date;
  purgeLe: Date;
};

export async function mettreALaCorbeille(params: {
  module: ModuleCode;
  type: TypeElementCorbeille;
  titre: string;
  description?: string;
  donnees: unknown;
  fichiers?: (Types.ObjectId | undefined | null)[];
  session: Session;
}): Promise<string> {
  await connectDb();
  const supprimeLe = new Date();
  const element = await ElementCorbeilleModel.create({
    module: params.module,
    type: params.type,
    titre: params.titre,
    description: params.description,
    donnees: params.donnees,
    fichiers: (params.fichiers ?? []).filter(
      (f): f is Types.ObjectId => Boolean(f)
    ),
    supprimePar: params.session.user?.id
      ? new Types.ObjectId(params.session.user.id)
      : undefined,
    supprimeParNom: params.session.user?.name ?? undefined,
    supprimeLe,
    purgeLe: calculerDatePurge(supprimeLe),
  });
  return String(element._id);
}

/**
 * Corbeille d'une personne : ce qu'*elle* a supprimé, tous modules confondus.
 *
 * Le cloisonnement s'est déplacé du module vers l'auteur de la suppression.
 * Une corbeille partagée par module obligeait chacun à trier les rebuts des
 * autres, et exposait ce qu'un collègue venait de jeter ; on ne récupère en
 * pratique que ce qu'on a soi-même supprimé par erreur.
 */
export async function listerCorbeilleDe(
  utilisateurId: string,
  type?: TypeElementCorbeille
): Promise<ElementCorbeilleVue[]> {
  await connectDb();
  if (!Types.ObjectId.isValid(utilisateurId)) return [];
  const elements = await ElementCorbeilleModel.find({
    supprimePar: utilisateurId,
    ...(type ? { type } : {}),
  })
    .select("_id module type titre description supprimeParNom supprimeLe purgeLe")
    .sort({ supprimeLe: -1 })
    .lean();
  return elements.map((e) => ({
    id: String(e._id),
    module: e.module as ModuleCode,
    type: e.type as TypeElementCorbeille,
    titre: e.titre,
    description: e.description ?? undefined,
    supprimeParNom: e.supprimeParNom ?? undefined,
    supprimeLe: new Date(e.supprimeLe),
    purgeLe: new Date(e.purgeLe),
  }));
}

/** Répartition par type, pour proposer un filtre qui reflète le contenu réel. */
export async function compterParTypeDe(
  utilisateurId: string
): Promise<Record<string, number>> {
  await connectDb();
  if (!Types.ObjectId.isValid(utilisateurId)) return {};
  const lignes = await ElementCorbeilleModel.aggregate<{
    _id: string;
    total: number;
  }>([
    { $match: { supprimePar: new Types.ObjectId(utilisateurId) } },
    { $group: { _id: "$type", total: { $sum: 1 } } },
  ]);
  return Object.fromEntries(lignes.map((l) => [l._id, l.total]));
}

/**
 * Lit un élément en vérifiant qu'il a bien été supprimé par cette personne.
 * Le cloisonnement se joue ici : un identifiant deviné dans la corbeille de
 * quelqu'un d'autre ne donne rien.
 */
export async function lireElementDe(id: string, utilisateurId: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(utilisateurId)) {
    return null;
  }
  return ElementCorbeilleModel.findOne({ _id: id, supprimePar: utilisateurId });
}

/**
 * Sortie de corbeille après restauration réussie : la ligne disparaît, mais
 * pas les fichiers — ils appartiennent désormais à l'élément remis en place.
 */
export async function retirerDeLaCorbeille(id: Types.ObjectId): Promise<void> {
  await ElementCorbeilleModel.deleteOne({ _id: id });
}

/** Suppression définitive : les fichiers GridFS partent avec l'élément. */
export async function purgerElement(element: {
  _id: Types.ObjectId;
  fichiers?: Types.ObjectId[];
}): Promise<void> {
  for (const fichierId of element.fichiers ?? []) {
    await supprimerFichier(fichierId);
  }
  await ElementCorbeilleModel.deleteOne({ _id: element._id });
}

export async function viderCorbeilleDe(utilisateurId: string): Promise<number> {
  await connectDb();
  if (!Types.ObjectId.isValid(utilisateurId)) return 0;
  const elements = await ElementCorbeilleModel.find({
    supprimePar: utilisateurId,
  }).select("_id fichiers");
  for (const element of elements) await purgerElement(element);
  return elements.length;
}

/**
 * Purge des éléments arrivés au terme des 30 jours (cron quotidien).
 * On refiltre en mémoire avec `estExpire` plutôt que de se fier uniquement à
 * la requête : la règle d'expiration n'a qu'une seule définition, testée.
 */
export async function purgerElementsExpires(
  maintenant: Date = new Date()
): Promise<number> {
  await connectDb();
  const candidats = await ElementCorbeilleModel.find({
    purgeLe: { $lte: maintenant },
  }).select("_id fichiers purgeLe");
  let purges = 0;
  for (const element of candidats) {
    if (!estExpire(new Date(element.purgeLe), maintenant)) continue;
    await purgerElement(element);
    purges += 1;
  }
  return purges;
}
