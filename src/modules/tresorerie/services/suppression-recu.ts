import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import { DocumentModel, SequenceModel } from "@/modules/documents/models";
import { modeleRequis } from "@/modules/documents/catalogue";
import { mandatCourt } from "@/modules/documents/services/numerotation";
import { reediterPdf } from "@/modules/documents/services/reedition";
import { supprimerFichier } from "@/modules/documents/services/stockage";
import { FluxTresorerieModel } from "@/modules/tresorerie/models";
import {
  decouperReference,
  planifierSuppression,
  referencePourSequence,
  type RecuDeLaSerie,
} from "./renumerotation-recus";

/**
 * Suppression d'un reçu jamais parti, et fermeture de la série derrière lui.
 *
 * Deux chemins y mènent — le Trésorier supprime le reçu depuis l'écran des
 * reçus, ou il supprime la cotisation qui l'avait produit — et tous deux
 * doivent laisser le même état : numéro rendu, reçus suivants redescendus
 * d'un cran, PDF refabriqués.
 *
 * Pas de corbeille, et c'est délibéré : restaurer `RC002` alors que l'ancien
 * `RC003` porte désormais ce numéro créerait deux pièces homonymes. Un
 * brouillon n'a rien attesté à personne — il n'a pas eu de vie hors de
 * l'écran.
 */

export type ResultatSuppressionRecu = {
  reference: string;
  /** Nombre de reçus qui ont changé de numéro. */
  renumerotes: number;
  /** Un reçu déjà parti empêchait de refermer la série. */
  trouSubsiste: boolean;
};

/** Clé du compteur de la série ; une famille de la JE a la sienne. */
function cleCompteur(modele: string, suffixe: string, annee: string): string {
  const segment = suffixe.split("-")[1] ?? "";
  const segmentCatalogue =
    modeleRequis(modele).formatReference.match(/\}-([A-Za-z]+)-\{/)?.[1] ?? "";
  const code =
    segment && segment !== segmentCatalogue ? `${modele}:${segment}` : modele;
  return `${code}:${mandatCourt(annee)}`;
}

/**
 * Motif de refus quand le reçu ne peut pas être supprimé, `null` sinon.
 * Rendu en clair pour que l'appelant l'affiche tel quel.
 */
export function refusDeSuppression(recu: {
  reference: string;
  envoyeLe?: Date | null;
  statut?: string | null;
}): string | null {
  if (recu.envoyeLe) {
    return `« ${recu.reference} » a été remis le ${new Date(recu.envoyeLe).toLocaleDateString("fr-FR")} : il ne se supprime plus. Annulez-le — sa référence restera consommée, et un nouveau reçu prendra le numéro suivant.`;
  }
  if (recu.statut === "ANNULE") {
    return `« ${recu.reference} » est annulé : sa référence est conservée exprès, elle ne se libère pas.`;
  }
  return null;
}

export async function supprimerRecuEtRenumeroter(
  documentId: string
): Promise<ResultatSuppressionRecu> {
  await connectDb();
  const document = await DocumentModel.findById(documentId);
  if (!document) throw new Error("Reçu introuvable.");

  const refus = refusDeSuppression({
    reference: document.reference,
    envoyeLe: document.envoyeLe,
    statut: document.statut,
  });
  if (refus) throw new Error(refus);

  const morceaux = decouperReference(document.reference);
  if (!morceaux) {
    throw new Error(
      `La référence « ${document.reference} » ne suit pas la nomenclature : renumérotation impossible.`
    );
  }

  const mandat = await MandatModel.findById(document.mandat)
    .select("annee")
    .lean();
  if (!mandat) throw new Error("Mandat du reçu introuvable.");

  // La série, c'est le même préfixe et le même suffixe : `RC…-COT-2627` ne
  // compte pas dans la même suite que `RC…-TOMBOLA-2627`.
  const memeSerie = (
    await DocumentModel.find({
      mandat: document.mandat,
      modele: document.modele,
      _id: { $ne: document._id },
    })
      .select("_id reference statut envoyeLe")
      .lean()
  ).flatMap((d) => {
    const parts = decouperReference(d.reference);
    if (!parts || parts.suffixe !== morceaux.suffixe) return [];
    return [
      {
        id: String(d._id),
        sequence: parts.sequence,
        envoye: Boolean(d.envoyeLe),
        annule: d.statut === "ANNULE",
      } satisfies RecuDeLaSerie,
    ];
  });

  const plan = planifierSuppression(memeSerie, morceaux.sequence);

  // Le reçu part, et l'encaissement qu'il justifiait redevient en attente.
  if (document.fichierId) await supprimerFichier(document.fichierId);
  await DocumentModel.deleteOne({ _id: document._id });
  await FluxTresorerieModel.updateMany(
    { justificatifRef: document.reference },
    { $unset: { justificatifRef: "" } }
  );

  // Ordre croissant obligatoire : chaque numéro libéré accueille le suivant.
  for (const decalage of plan.decalages) {
    const suivant = await DocumentModel.findById(decalage.id);
    if (!suivant) continue;
    const ancienneReference = suivant.reference;
    const nouvelleReference = referencePourSequence(
      ancienneReference,
      decalage.nouvelleSequence
    );

    const { fichierId, tailleOctets } = await reediterPdf(
      {
        modele: suivant.modele,
        donnees: suivant.donnees,
        fichierId: suivant.fichierId,
      },
      nouvelleReference
    );

    suivant.reference = nouvelleReference;
    suivant.fichierId = fichierId;
    suivant.tailleOctets = tailleOctets;
    suivant.version = (suivant.version ?? 1) + 1;
    // L'instantané porte lui aussi la référence : la laisser périmée ferait
    // un PDF et une donnée qui se contredisent.
    if (suivant.donnees && typeof suivant.donnees === "object") {
      (suivant.donnees as Record<string, unknown>).reference = nouvelleReference;
      suivant.markModified("donnees");
    }
    await suivant.save();

    await FluxTresorerieModel.updateMany(
      { justificatifRef: ancienneReference },
      { $set: { justificatifRef: nouvelleReference } }
    );
  }

  // Le compteur suit l'état final de la série : ni numéro gaspillé, ni
  // référence déjà prise qui serait réattribuée.
  await SequenceModel.updateOne(
    { cle: cleCompteur(document.modele, morceaux.suffixe, mandat.annee) },
    { $set: { valeur: plan.compteur } }
  );

  return {
    reference: document.reference,
    renumerotes: plan.decalages.length,
    trouSubsiste: plan.trouSubsiste,
  };
}
