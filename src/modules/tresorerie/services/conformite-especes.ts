/**
 * Plafond légal des opérations en espèces — logique pure, testée.
 *
 * Le décret-loi n° 2011-88 du 24 septembre 2011 portant organisation des
 * associations impose le chèque ou le virement bancaire au-delà de 500 DT,
 * pour les recettes comme pour les dépenses.
 *
 * L'ERP refusait purement et simplement la saisie au-delà du plafond. C'était
 * une erreur de conception : le journal enregistre ce qui s'est passé, pas ce
 * qui aurait dû se passer. Quand le Trésorier a réellement payé 800 DT en
 * espèces, lui interdire de le saisir ne défait pas le paiement — cela sort
 * simplement l'opération des comptes, et le vrai problème disparaît de
 * l'écran au lieu d'être traité.
 *
 * On enregistre donc, et on signale : la ligne reste en rouge au journal
 * jusqu'à régularisation, et le tableau de bord en tient le compte.
 */

/** Plafond légal des paiements en espèces (décret-loi n° 2011-88). */
export const PLAFOND_ESPECES_DT = 500;

export const REFERENCE_LEGALE_ESPECES =
  "décret-loi n° 2011-88 du 24 septembre 2011";

export type OperationEspeces = {
  type: "ENCAISSEMENT" | "DECAISSEMENT";
  modePaiement?: string | null;
  montant: number;
};

export type AlerteEspeces = {
  /** Ce qui ne va pas, en une phrase affichable telle quelle. */
  motif: string;
  /** Ce qu'il reste à faire — une alerte sans issue n'aide personne. */
  consigne: string;
};

/**
 * `null` quand l'opération est régulière. Le dépassement se déduit de
 * l'opération elle-même plutôt que d'être stocké : une correction du montant
 * ou du mode de paiement change le verdict sur-le-champ, et les opérations
 * déjà en base sont jugées sur les mêmes règles que les nouvelles.
 */
export function alerteEspeces(op: OperationEspeces): AlerteEspeces | null {
  if ((op.modePaiement ?? "") !== "ESPECES") return null;
  if (op.montant <= PLAFOND_ESPECES_DT) return null;

  const montant = op.montant.toLocaleString("fr-FR");
  return op.type === "DECAISSEMENT"
    ? {
        motif: `Règlement de ${montant} DT en espèces : au-delà de ${PLAFOND_ESPECES_DT} DT, le ${REFERENCE_LEGALE_ESPECES} impose le chèque ou le virement.`,
        consigne:
          "Récupérez la pièce du bénéficiaire, ou rectifiez le mode de paiement si le règlement est finalement passé par la banque. À défaut, le dépassement doit être expliqué au rapport financier et à l'AG.",
      }
    : {
        motif: `Encaissement de ${montant} DT en espèces : au-delà de ${PLAFOND_ESPECES_DT} DT, le ${REFERENCE_LEGALE_ESPECES} impose le chèque ou le virement.`,
        consigne:
          "Déposez la somme en banque sans attendre et joignez le bordereau de versement en justificatif : c'est ce qui rattache l'espèce au compte.",
      };
}

/** Vrai dès que l'opération dépasse le plafond — raccourci d'affichage. */
export function depasseLePlafondEspeces(op: OperationEspeces): boolean {
  return alerteEspeces(op) !== null;
}

/** Nombre d'opérations hors plafond, pour le bandeau du journal. */
export function compterDepassementsEspeces(
  operations: OperationEspeces[]
): number {
  return operations.filter(depasseLePlafondEspeces).length;
}
