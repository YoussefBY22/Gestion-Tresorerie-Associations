/**
 * Facture d'avoir — logique pure, testée.
 *
 * Une facture émise ne se modifie pas et ne se supprime pas : elle porte un
 * numéro d'une série continue, et la faire disparaître ouvrirait un trou que
 * personne ne peut plus expliquer. Pour corriger, on émet une **pièce
 * inverse** qui la réduit ou l'annule, et les deux restent au registre. C'est
 * ce que le module ne savait pas faire : une facture fausse y restait fausse.
 *
 * Trois règles de fond, posées ici une fois pour toutes.
 *
 * **L'avoir ne peut pas dépasser ce qui reste.** Rendre plus que facturé
 * ferait une recette négative sans opération derrière. Les avoirs déjà émis
 * sur la même facture comptent dans le calcul : deux avoirs partiels ne
 * doivent pas, ensemble, excéder la facture.
 *
 * **Il reprend le taux de TVA de la facture d'origine.** Un avoir corrige une
 * opération précise, pas une opération d'aujourd'hui : s'il prenait le taux
 * courant, une facture émise sous un ancien taux se corrigerait de travers.
 *
 * **Il ne rend pas le timbre fiscal.** Le droit de timbre est acquitté à
 * l'émission de la facture ; l'annuler ne le restitue pas. L'avoir porte donc
 * un timbre nul — à l'inverse d'une facture, où il vaut 1 DT.
 */

import { arrondirMillime, tvaDe } from "./fiscal";

/** Ce qu'il faut savoir de la facture qu'on corrige. */
export type FactureACorriger = {
  montantHT: number;
  tauxTVA: number;
  /** Total HT des avoirs déjà émis sur cette facture. */
  dejaCredite?: number;
};

export type TotauxAvoir = {
  montantHT: number;
  tva: number;
  /** Toujours nul : voir l'en-tête du module. */
  timbreFiscal: number;
  montantTTC: number;
};

/** Ce qui reste créditable sur une facture, en HT. */
export function resteACrediter(facture: FactureACorriger): number {
  return arrondirMillime(
    Math.max(0, facture.montantHT - (facture.dejaCredite ?? 0))
  );
}

/**
 * Vérifie qu'un avoir de ce montant est émissible, et dit pourquoi non.
 *
 * Le message est destiné au Trésorier : il nomme le montant disponible, qui
 * est l'information dont il a besoin pour corriger sa saisie.
 */
export function verifierAvoir(
  facture: FactureACorriger,
  montantHT: number
): { possible: boolean; raison: string | null } {
  if (!(montantHT > 0)) {
    return {
      possible: false,
      raison: "Le montant d'un avoir est strictement positif.",
    };
  }

  const reste = resteACrediter(facture);
  if (reste <= 0) {
    return {
      possible: false,
      raison:
        "Cette facture est déjà entièrement créditée : il n'y a plus rien à annuler.",
    };
  }
  // La tolérance d'un millime absorbe les arrondis de saisie, sans laisser
  // passer un dépassement réel.
  if (montantHT > reste + 0.0005) {
    return {
      possible: false,
      raison: `Un avoir ne peut pas dépasser ce qui reste à créditer : ${reste
        .toFixed(3)
        .replace(".", ",")} DT HT.`,
    };
  }
  return { possible: true, raison: null };
}

/** Totaux d'un avoir : le taux vient de la facture, le timbre est nul. */
export function totauxAvoir(
  facture: FactureACorriger,
  montantHT: number
): TotauxAvoir {
  const tva = tvaDe(montantHT, facture.tauxTVA);
  return {
    montantHT: arrondirMillime(montantHT),
    tva,
    timbreFiscal: 0,
    montantTTC: arrondirMillime(montantHT + tva),
  };
}

/** Un avoir qui solde la facture entièrement l'annule. */
export function annuleEntierement(
  facture: FactureACorriger,
  montantHT: number
): boolean {
  return Math.abs(resteACrediter(facture) - montantHT) < 0.0005;
}

/**
 * Totaux des avoirs d'un mois, pour la déclaration.
 *
 * Ils viennent en **diminution** de la TVA collectée du mois où l'avoir est
 * émis — jamais en rectification du mois de la facture d'origine, qui est
 * clos et déposé. C'est la règle qui permet à une déclaration déposée de
 * rester vraie.
 */
export function totaliserAvoirs(
  avoirs: { montantHT: number; tauxTVA: number }[]
): { totalHT: number; totalTVA: number; nombre: number } {
  let totalHT = 0;
  let totalTVA = 0;
  for (const a of avoirs) {
    totalHT += a.montantHT;
    totalTVA += tvaDe(a.montantHT, a.tauxTVA);
  }
  return {
    totalHT: arrondirMillime(totalHT),
    totalTVA: arrondirMillime(totalTVA),
    nombre: avoirs.length,
  };
}
