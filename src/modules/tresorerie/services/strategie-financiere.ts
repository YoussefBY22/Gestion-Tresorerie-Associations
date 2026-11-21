/**
 * Stratégie financière — logique pure.
 *
 * Reprend la feuille « Strategie Financiere » du classeur : quota de chiffre
 * d'affaires imposé par la Norme JE, fonds de roulement cible et sa
 * couverture. Répond au constat d'audit sur l'absence de marge de sécurité
 * formalisée (EX-TRS-01).
 */

/** Seuils imposés par la Confédération — valeurs fixes, pas calculées. */
export const QUOTA_CA_JE_DT = 4000;
export const QUOTA_CA_JEC_DT = 2000;

export type StatutQuota = {
  quota: number;
  caReel: number;
  ecart: number;
  atteint: boolean;
};

export function statutQuota(caReel: number, quota: number): StatutQuota {
  const ecart = Math.round((caReel - quota) * 1000) / 1000;
  return { quota, caReel, ecart, atteint: caReel >= quota };
}

/**
 * Fonds de roulement cible = nombre de mois de charges fixes à couvrir ×
 * charges fixes moyennes mensuelles. Le nombre de mois est un choix du
 * Trésorier (12 = un an de sécurité, 6 = plus souple mais plus risqué).
 */
export function fondsDeRoulementCible(
  nombreMoisACouvrir: number,
  chargesFixesMoyennesMensuelles: number
): number {
  return Math.round(nombreMoisACouvrir * chargesFixesMoyennesMensuelles * 1000) / 1000;
}

/**
 * Couverture du fonds de roulement cible : 1,0 = objectif exactement
 * atteint. `null` sans cible définie — pas une couverture « infinie ».
 */
export function couvertureFondsDeRoulement(
  soldeActuel: number,
  cible: number
): number | null {
  if (cible === 0) return null;
  return Math.round((soldeActuel / cible) * 1000) / 1000;
}

export const STATUTS_OBJECTIF_FINANCIER = ["A_FAIRE", "EN_COURS", "REALISE"] as const;
export type StatutObjectifFinancier = (typeof STATUTS_OBJECTIF_FINANCIER)[number];

export const LIBELLES_STATUT_OBJECTIF: Record<StatutObjectifFinancier, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  REALISE: "Réalisé",
};

/**
 * Les deux objectifs que la Norme JE rend non négociables. Verrouillés à la
 * création de la stratégie financière du mandat ; leur suppression exige
 * l'accord du Président (voir `services/budget-previsionnel.ts` pour le
 * même principe appliqué au budget).
 */
export const OBJECTIFS_OBLIGATOIRES: {
  libelle: string;
  kpiAssocie: string;
  cible: string;
}[] = [
  {
    libelle: "0 dette en fin de mandat",
    kpiAssocie: "Dettes fournisseurs en cours",
    cible: "0 DT",
  },
  {
    libelle: "Chiffre d'affaires signé supérieur au quota Norme JE",
    kpiAssocie: "CA signé TTC / 12 mois",
    cible: "4 760 DT TTC",
  },
];

export type DemandeSuppressionObjectif = {
  statut: "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE";
};

/**
 * Un objectif verrouillé ne se supprime que si le Président a accepté une
 * demande de suppression. Un objectif non verrouillé se supprime librement.
 */
export function objectifSupprimable(
  verrouille: boolean,
  demande?: DemandeSuppressionObjectif | null
): boolean {
  if (!verrouille) return true;
  return demande?.statut === "ACCEPTEE";
}

export type ValidationObjectif = {
  statut: "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE";
};

/**
 * Un objectif verrouillé proposé par le Trésorier ne compte qu'une fois le
 * Président d'accord. Sans `validation`, l'objectif vient de la Norme JE :
 * il s'impose de lui-même et n'a personne à convaincre.
 */
export function objectifEnVigueur(
  verrouille: boolean,
  validation?: ValidationObjectif | null
): boolean {
  if (!verrouille || !validation) return true;
  return validation.statut === "ACCEPTEE";
}

/**
 * Un objectif verrouillé et validé est gravé : ni son libellé, ni sa cible,
 * ni son échéance ne bougent plus. Seul son avancement reste modifiable —
 * c'est bien l'intérêt d'un objectif que de pouvoir le cocher.
 */
export function objectifModifiable(
  verrouille: boolean,
  validation?: ValidationObjectif | null
): boolean {
  return !objectifEnVigueur(verrouille, validation) || !verrouille;
}
