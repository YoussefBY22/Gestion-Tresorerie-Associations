import type { Types } from "mongoose";
import type { Session } from "next-auth";
import { connectDb } from "@/lib/db";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { CotisationModel } from "@/modules/base/models";
import { DocumentModel } from "@/modules/documents/models";
import { MembreModel } from "@/modules/core/models";
import {
  refusDeSuppression,
  supprimerRecuEtRenumeroter,
} from "./suppression-recu";

/**
 * Retrait d'une cotisation, avec son reçu.
 *
 * Deux chemins mènent ici — le Trésorier retire la cotisation depuis son
 * registre, ou il supprime au journal l'opération qui l'avait encaissée — et
 * tous deux doivent laisser le même état derrière eux. Sans cela, effacer
 * l'encaissement laissait la cotisation orpheline : l'argent disparaissait du
 * journal, mais le cotisant restait inscrit comme ayant payé et son reçu
 * revenait indéfiniment dans « à émettre ».
 *
 * Le cotisant, lui, ne bouge pas : retirer un paiement n'est pas radier un
 * adhérent du registre légal.
 */
export async function envoyerCotisationALaCorbeille(
  cotisationId: Types.ObjectId | string,
  session: Session
): Promise<string> {
  await connectDb();
  const cotisation = await CotisationModel.findById(cotisationId).lean();
  if (!cotisation) throw new Error("Cotisation introuvable.");

  const nom = await nomDuCotisant(cotisation.membre);

  /*
   * Le reçu part d'abord — il n'a plus d'objet une fois la cotisation
   * retirée — et par le même chemin que depuis l'écran des reçus : son
   * numéro est rendu et la série se referme derrière lui.
   *
   * Sauf s'il est déjà parti chez le cotisant. Là, on refuse franchement :
   * effacer la cotisation laisserait dans la nature une pièce que plus rien
   * n'explique. Il faut annuler le reçu d'abord, ce qui conserve sa
   * référence et dit pourquoi.
   */
  const recus = await DocumentModel.find({
    objetType: "Cotisation",
    objetId: cotisation._id,
  })
    .select("_id reference envoyeLe statut")
    .lean();

  for (const recu of recus) {
    const refus = refusDeSuppression(recu);
    if (refus) {
      throw new Error(
        `${refus}\n\nLa cotisation de ${nom} ne peut pas être supprimée tant que son reçu tient debout.`
      );
    }
  }
  for (const recu of recus) {
    await supprimerRecuEtRenumeroter(String(recu._id));
  }

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "COTISATION",
    titre: `${nom} — ${cotisation.montant} DT`,
    description: cotisation.datePaiement
      ? `Cotisation payée le ${new Date(cotisation.datePaiement).toLocaleDateString("fr-FR")}${recus.length ? ` · reçu ${recus[0].reference} supprimé avec elle` : ""}`
      : "Cotisation non payée",
    donnees: cotisation,
    session,
  });
  await CotisationModel.deleteOne({ _id: cotisation._id });

  return `${nom} — ${cotisation.montant} DT${recus.length ? ` (+ ${recus.length} reçu(s) supprimé(s))` : ""}`;
}

/**
 * Retire les cotisations encaissées par une opération du journal.
 * Rend leurs libellés, pour que le journal d'activité dise ce qui est parti
 * avec l'opération plutôt que de laisser deviner.
 */
export async function retirerCotisationsDuFlux(
  fluxId: Types.ObjectId | string,
  session: Session
): Promise<string[]> {
  await connectDb();
  const liees = await CotisationModel.find({ flux: fluxId }).select("_id").lean();
  const retirees: string[] = [];
  for (const cotisation of liees) {
    retirees.push(await envoyerCotisationALaCorbeille(cotisation._id, session));
  }
  return retirees;
}

/** Nom lisible du cotisant, pour l'étiquette de la corbeille. */
async function nomDuCotisant(membreId: Types.ObjectId): Promise<string> {
  const membre = await MembreModel.findById(membreId).select("nom").lean();
  return membre?.nom ?? "Membre inconnu";
}
