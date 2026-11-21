"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { MandatModel } from "@/modules/core/models";
import {
  MouvementInterneModel,
  ReleveBancaireModel,
} from "@/modules/tresorerie/models";
import { LIBELLES_SENS } from "@/modules/tresorerie/services/caisse";

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

function rafraichir() {
  revalidatePath("/tresorerie/caisse");
  revalidatePath("/tresorerie");
}

/**
 * Enregistre le solde lu sur le relevé de la banque. C'est lui qui fait foi
 * ensuite ; l'écart avec le calcul devient le rapprochement à expliquer.
 */
export async function enregistrerReleveBancaire(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      date: z.coerce.date(),
      solde: z.coerce.number(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
    })
    .parse({
      date: formData.get("date") || new Date(),
      solde: formData.get("solde"),
      reference: formData.get("reference") || undefined,
      notes: formData.get("notes") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  await ReleveBancaireModel.create({
    mandat: mandat._id,
    ...donnees,
    saisiPar: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
    saisiParNom: session.user?.name ?? undefined,
  });

  await journaliser(session, {
    action: "tresorerie.releveBancaire",
    entite: "ReleveBancaire",
    details: `Solde ${donnees.solde} DT au ${donnees.date.toLocaleDateString("fr-FR")}`,
  });
  rafraichir();
}

/**
 * Retire un relevé saisi. Pas de corbeille ici : un relevé n'est pas une
 * pièce, c'est une lecture, et la précédente reprend simplement la main.
 */
export async function supprimerReleveBancaire(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const id = z.string().min(1).parse(formData.get("releveId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const releve = await ReleveBancaireModel.findOneAndDelete({
    _id: id,
    mandat: mandat._id,
  });
  if (!releve) throw new Error("Relevé introuvable.");

  await journaliser(session, {
    action: "tresorerie.releveBancaire.supprimer",
    entite: "ReleveBancaire",
    entiteId: id,
    details: `Solde ${releve.solde} DT au ${new Date(releve.date).toLocaleDateString("fr-FR")}`,
  });
  rafraichir();
}

/** Retire un virement interne — vers la corbeille, comme toute opération. */
export async function supprimerMouvementInterne(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const id = z.string().min(1).parse(formData.get("mouvementId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const mouvement = await MouvementInterneModel.findOne({
    _id: id,
    mandat: mandat._id,
  }).lean();
  if (!mouvement) throw new Error("Virement introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "MOUVEMENT_INTERNE",
    titre: `${LIBELLES_SENS[mouvement.sens as "RETRAIT"]} — ${mouvement.montant} DT`,
    description: `Du ${new Date(mouvement.date).toLocaleDateString("fr-FR")}${mouvement.reference ? ` · ${mouvement.reference}` : ""}`,
    donnees: mouvement,
    session,
  });
  await MouvementInterneModel.deleteOne({ _id: mouvement._id });

  await journaliser(session, {
    action: "tresorerie.mouvementInterne.supprimer",
    entite: "MouvementInterne",
    entiteId: id,
    details: `${mouvement.sens} ${mouvement.montant} DT — mis à la corbeille`,
  });
  rafraichir();
  revalidatePath("/corbeille");
}
