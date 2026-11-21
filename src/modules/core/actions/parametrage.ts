"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { ParametreModel } from "@/modules/core/models/Parametre";
import {
  MODULES_PAR_CODE,
  cleActivation,
} from "@/modules/core/modules-registry";
import { PARAMETRES_PAR_DEFAUT } from "@/modules/core/services/parametrage";
import type { ModuleCode } from "@/modules/core/rbac";

const CATALOGUE = new Map(PARAMETRES_PAR_DEFAUT.map((p) => [p.cle, p]));

/**
 * Écrit une valeur de paramètre. `upsert` : la base ne contient que les
 * valeurs surchargées, les autres restent portées par le catalogue.
 */
async function ecrire(
  cle: string,
  valeur: unknown,
  utilisateurId?: string
): Promise<void> {
  const def = CATALOGUE.get(cle);
  if (!def) throw new Error(`Paramètre inconnu : ${cle}.`);
  await connectDb();
  await ParametreModel.findOneAndUpdate(
    { cle },
    {
      cle,
      valeur,
      type: def.type,
      categorie: def.categorie,
      ...(utilisateurId ? { modifiePar: utilisateurId } : {}),
    },
    { upsert: true, new: true }
  );
}

/** Rafraîchit toute l'application : la navigation dépend du paramétrage. */
function revaliderApplication(): void {
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/* Activation des modules                                              */
/* ------------------------------------------------------------------ */

export async function basculerModule(code: string, actif: boolean) {
  const session = await exigerPermission("administration", "ecrire");

  const def = MODULES_PAR_CODE[code];
  if (!def) throw new Error(`Module inconnu : ${code}.`);
  if (!def.desactivable) {
    throw new Error(
      `Le module « ${def.libelle} » est un module socle : il ne peut pas être désactivé.`
    );
  }
  if (actif && !def.href) {
    throw new Error(
      `Le module « ${def.libelle} » n'est pas encore livré (${def.sprint ?? "à venir"}).`
    );
  }

  await ecrire(cleActivation(code as ModuleCode), actif, session.user.id);
  await journaliser(session, {
    action: actif ? "parametrage.module.activer" : "parametrage.module.desactiver",
    entite: "Parametre",
    entiteId: cleActivation(code as ModuleCode),
    details: `Module « ${def.libelle} » ${actif ? "activé" : "désactivé"}.`,
  });
  revaliderApplication();
}

/* ------------------------------------------------------------------ */
/* Paramètres généraux                                                 */
/* ------------------------------------------------------------------ */

const SchemaValeur = z.object({
  cle: z.string().min(1),
  valeur: z.string(),
});

/**
 * Enregistre un paramètre saisi depuis le formulaire d'administration.
 * La valeur arrive en texte (FormData) : on la convertit selon le type
 * déclaré au catalogue avant stockage, pour que les lecteurs typés
 * (`getParametre<number>`) reçoivent bien un nombre et non "14".
 */
export async function enregistrerParametre(formData: FormData) {
  const session = await exigerPermission("administration", "ecrire");
  const { cle, valeur } = SchemaValeur.parse({
    cle: formData.get("cle"),
    valeur: formData.get("valeur") ?? "",
  });

  const def = CATALOGUE.get(cle);
  if (!def) throw new Error(`Paramètre inconnu : ${cle}.`);

  let valeurTypee: unknown = valeur;
  if (def.type === "BOOLEEN") {
    valeurTypee = valeur === "true" || valeur === "on" || valeur === "1";
  } else if (def.type === "NOMBRE") {
    const n = Number(valeur);
    if (!Number.isFinite(n)) {
      throw new Error(`« ${def.libelle} » attend une valeur numérique.`);
    }
    valeurTypee = n;
  } else if (def.type === "JSON") {
    try {
      valeurTypee = JSON.parse(valeur);
    } catch {
      throw new Error(`« ${def.libelle} » attend du JSON valide.`);
    }
  }

  if (def.options && !def.options.some((o) => o.valeur === valeurTypee)) {
    throw new Error(
      `Valeur non autorisée pour « ${def.libelle} » : ${String(valeurTypee)}.`
    );
  }

  await ecrire(cle, valeurTypee, session.user.id);
  await journaliser(session, {
    action: "parametrage.modifier",
    entite: "Parametre",
    entiteId: cle,
    details: `${def.libelle} = ${String(valeurTypee)}`,
  });
  revaliderApplication();
}

/** Supprime la surcharge : le paramètre repart sur son défaut catalogue. */
export async function reinitialiserParametre(cle: string) {
  const session = await exigerPermission("administration", "ecrire");
  const def = CATALOGUE.get(cle);
  if (!def) throw new Error(`Paramètre inconnu : ${cle}.`);

  await connectDb();
  await ParametreModel.deleteOne({ cle });
  await journaliser(session, {
    action: "parametrage.reinitialiser",
    entite: "Parametre",
    entiteId: cle,
    details: `${def.libelle} réinitialisé (défaut : ${String(def.defaut)}).`,
  });
  revaliderApplication();
}
