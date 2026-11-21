"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import type { ModuleCode } from "../rbac";
import { journaliser } from "../services/journal";
import {
  lireElementDe,
  purgerElement,
  retirerDeLaCorbeille,
  viderCorbeilleDe,
} from "../services/corbeille-depot";
import {
  cheminApresRestauration,
  restaurerElement,
} from "../services/corbeille-restauration";
import type { TypeElementCorbeille } from "../models/ElementCorbeille";

/**
 * Actions de la corbeille — communes à tout l'application.
 *
 * Deux gardes, et pas une seule : l'élément doit avoir été supprimé par la
 * personne qui agit, *et* celle-ci doit toujours avoir le droit d'écrire dans
 * le module d'origine. Le second point compte : on change de poste en cours
 * de mandat, et remettre en place une écriture dont on n'a plus la charge ne
 * va pas de soi.
 */

async function utilisateurRequis(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Session expirée : reconnectez-vous.");
  return id;
}

async function elementDeLUtilisateur(id: string) {
  const utilisateurId = await utilisateurRequis();
  const element = await lireElementDe(id, utilisateurId);
  if (!element) throw new Error("Élément introuvable dans votre corbeille.");
  const session = await exigerModuleEtPermission(
    element.module as ModuleCode,
    "ecrire"
  );
  return { element, session };
}

const schemaId = z.object({ id: z.string().min(1) });

export async function restaurerElementCorbeille(formData: FormData) {
  const { id } = schemaId.parse({ id: formData.get("id") });
  const { element, session } = await elementDeLUtilisateur(id);

  await restaurerElement(element.type as TypeElementCorbeille, element.donnees);
  // L'élément ne quitte la corbeille qu'une fois réellement remis en place :
  // si la restauration échoue, il reste consultable et retentable.
  await retirerDeLaCorbeille(element._id);

  await journaliser(session, {
    action: "corbeille.restaurer",
    entite: "ElementCorbeille",
    entiteId: id,
    details: `${element.type} — ${element.titre}`,
  });
  for (const chemin of cheminApresRestauration(
    element.type as TypeElementCorbeille
  )) {
    revalidatePath(chemin);
  }
  revalidatePath("/corbeille");
}

export async function supprimerDefinitivementElement(formData: FormData) {
  const { id } = schemaId.parse({ id: formData.get("id") });
  const { element, session } = await elementDeLUtilisateur(id);
  await purgerElement(element);

  await journaliser(session, {
    action: "corbeille.purger",
    entite: "ElementCorbeille",
    entiteId: id,
    details: `${element.type} — ${element.titre}`,
  });
  revalidatePath("/corbeille");
}

export async function viderCorbeille() {
  const utilisateurId = await utilisateurRequis();
  const session = await auth();

  const purges = await viderCorbeilleDe(utilisateurId);
  await journaliser(session, {
    action: "corbeille.vider",
    entite: "ElementCorbeille",
    details: `${purges} élément(s) supprimé(s) définitivement`,
  });
  revalidatePath("/corbeille");
}
