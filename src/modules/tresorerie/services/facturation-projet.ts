/**
 * Ce qu'il reste à facturer sur un projet — logique pure, testée.
 *
 * Le montant d'une facture était saisi à la main alors qu'il était déjà connu
 * de l'application. La chaîne est pourtant complète en base : le devis chiffre les
 * prestations, son acceptation porte le total HT sur l'opportunité, la
 * création du projet le recopie dans `caSigne`. Arrivé à la facture, ce
 * nombre était retapé — troisième saisie du même chiffre, et la seule des
 * trois qu'aucun calcul ne vérifiait.
 *
 * Ce service répond à la question que le Trésorier se pose devant le
 * formulaire : **combien reste-t-il à facturer sur ce projet ?**
 *
 * Le calcul retranche du CA signé ce qui est déjà facturé, **avoirs
 * déduits** : une facture corrigée par un avoir n'a pas consommé le montant
 * qu'elle annonce. Sans cela, un avoir de régularisation fermerait la porte à
 * la facture qui doit le remplacer.
 *
 * Un projet sans CA signé — saisi hors CRM, ou signé avant que l'application ne
 * serve — n'a aucune référence : le service rend `null` plutôt que zéro, et
 * l'écran ne propose alors rien. Proposer « reste 0 DT » serait un chiffre
 * inventé, pire qu'un champ vide.
 */

import { arrondirMillime } from "./fiscal";

export type EntreeFacturationProjet = {
  /** CA signé HT du projet, recopié de l'opportunité gagnée. */
  caSigne?: number | null;
  /** Montants HT des factures déjà émises sur ce projet. */
  facturesHT: number[];
  /** Montants HT des avoirs émis sur ces factures. */
  avoirsHT?: number[];
};

export type EtatFacturationProjet = {
  caSigne: number | null;
  /** Total HT facturé, avant déduction des avoirs. */
  dejaFacture: number;
  /** Total HT crédité par avoirs. */
  credite: number;
  /** Ce que le client doit réellement : facturé moins crédité. */
  netFacture: number;
  /** Ce qui reste à facturer, ou `null` faute de CA signé de référence. */
  resteAFacturer: number | null;
  /** Ce qui a été facturé au-delà du CA signé, le cas échéant. */
  depassement: number;
  /** Vrai quand le CA signé est entièrement facturé, à la millime près. */
  solde: boolean;
};

const TOLERANCE = 0.0005;

export function etatFacturationProjet(
  entree: EntreeFacturationProjet
): EtatFacturationProjet {
  const dejaFacture = arrondirMillime(
    entree.facturesHT.reduce((s, m) => s + m, 0)
  );
  const credite = arrondirMillime(
    (entree.avoirsHT ?? []).reduce((s, m) => s + m, 0)
  );
  const netFacture = arrondirMillime(dejaFacture - credite);

  const caSigne =
    typeof entree.caSigne === "number" && entree.caSigne > 0
      ? arrondirMillime(entree.caSigne)
      : null;

  if (caSigne === null) {
    return {
      caSigne: null,
      dejaFacture,
      credite,
      netFacture,
      resteAFacturer: null,
      depassement: 0,
      solde: false,
    };
  }

  const ecart = arrondirMillime(caSigne - netFacture);
  return {
    caSigne,
    dejaFacture,
    credite,
    netFacture,
    resteAFacturer: Math.max(0, ecart),
    depassement: Math.max(0, arrondirMillime(-ecart)),
    solde: Math.abs(ecart) < TOLERANCE,
  };
}

/**
 * Ce que le formulaire doit proposer comme montant HT.
 *
 * Le reste à facturer, et rien quand il n'y a pas de référence ou qu'il ne
 * reste rien : un zéro pré-rempli se transforme en facture à zéro dinar au
 * premier clic distrait.
 */
export function montantProposeFacture(
  etat: EtatFacturationProjet
): number | null {
  if (etat.resteAFacturer === null || etat.resteAFacturer <= 0) return null;
  return etat.resteAFacturer;
}

/**
 * Signale une facture qui dépasse ce que le projet a vendu.
 *
 * Avertissement, jamais refus : un avenant signé hors ERP, un CA recopié
 * avant négociation, une prestation ajoutée en cours de route sont des cas
 * réels. Bloquer obligerait à mentir sur le montant pour pouvoir facturer —
 * l'application préfère laisser passer et le dire.
 */
export function avertissementDepassement(
  etat: EtatFacturationProjet,
  montantHT: number
): string | null {
  if (etat.resteAFacturer === null) return null;
  if (montantHT <= etat.resteAFacturer + TOLERANCE) return null;

  const dt = (m: number) => `${m.toFixed(3).replace(".", ",")} DT`;
  if (etat.resteAFacturer <= 0) {
    return `Le CA signé de ce projet (${dt(
      etat.caSigne ?? 0
    )} HT) est déjà entièrement facturé. Cette facture le dépassera : vérifiez qu'un avenant le justifie.`;
  }
  return `Il ne reste que ${dt(
    etat.resteAFacturer
  )} HT à facturer sur ce projet (CA signé ${dt(
    etat.caSigne ?? 0
  )}). Cette facture le dépassera : vérifiez qu'un avenant le justifie.`;
}
