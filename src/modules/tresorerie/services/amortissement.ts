/**
 * Amortissement linéaire et valorisation de l'inventaire physique.
 *
 * Répond au §7.2 de l'audit financier final : « intégrer correctement la
 * notion d'amortissement en distinguant clairement la durée d'amortissement
 * du taux appliqué et en retenant des durées cohérentes avec la nature et la
 * durée réelle d'utilisation des biens ».
 *
 * Parti pris : la **durée** est la seule donnée saisie ; le **taux** est
 * toujours calculé. Deux grandeurs ne peuvent plus se contredire.
 *
 * Logique pure → testable sans base.
 */

export type MouvementLite = {
  quantite: number;
  date?: Date | string | null;
};

export type BienLite = {
  quantiteInitiale?: number | null;
  valeurUnitaire?: number | null;
  dateAcquisition?: Date | string | null;
  dureeAmortissementAnnees?: number | null;
  mouvements?: MouvementLite[];
};

const MS_PAR_AN = 365.25 * 24 * 60 * 60 * 1000;

function versDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Taux d'amortissement linéaire annuel, en pourcentage.
 * Une durée de 3 ans donne 33,33 % — jamais l'inverse.
 */
export function tauxAmortissement(
  dureeAnnees: number | null | undefined
): number | null {
  if (!dureeAnnees || dureeAnnees <= 0) return null;
  return Math.round((100 / dureeAnnees) * 100) / 100;
}

/** Ancienneté du bien en années décimales. */
export function anciennete(
  dateAcquisition: Date | string | null | undefined,
  maintenant: Date = new Date()
): number {
  const d = versDate(dateAcquisition);
  if (!d) return 0;
  const ecart = maintenant.getTime() - d.getTime();
  return ecart <= 0 ? 0 : ecart / MS_PAR_AN;
}

/** Stock courant = quantité initiale + somme algébrique des mouvements. */
export function stockCourant(bien: BienLite): number {
  const initial = bien.quantiteInitiale ?? 0;
  const delta = (bien.mouvements ?? []).reduce((s, m) => s + (m.quantite ?? 0), 0);
  return initial + delta;
}

/** Valeur brute d'acquisition du stock encore détenu. */
export function valeurBrute(bien: BienLite): number {
  return Math.max(0, stockCourant(bien)) * (bien.valeurUnitaire ?? 0);
}

/**
 * Amortissement cumulé, plafonné à la valeur brute : un bien totalement
 * amorti vaut 0, jamais une valeur négative.
 */
export function amortissementCumule(
  bien: BienLite,
  maintenant: Date = new Date()
): number {
  const duree = bien.dureeAmortissementAnnees ?? 0;
  const brute = valeurBrute(bien);
  if (!duree || duree <= 0 || brute === 0) return 0;

  const part = Math.min(1, anciennete(bien.dateAcquisition, maintenant) / duree);
  return Math.round(brute * part * 1000) / 1000;
}

/** Valeur nette comptable = valeur brute − amortissement cumulé. */
export function valeurNetteComptable(
  bien: BienLite,
  maintenant: Date = new Date()
): number {
  return Math.round((valeurBrute(bien) - amortissementCumule(bien, maintenant)) * 1000) / 1000;
}

/** Un bien totalement amorti reste inventorié mais ne vaut plus rien. */
export function estTotalementAmorti(
  bien: BienLite,
  maintenant: Date = new Date()
): boolean {
  const duree = bien.dureeAmortissementAnnees ?? 0;
  if (!duree || duree <= 0) return false;
  return anciennete(bien.dateAcquisition, maintenant) >= duree;
}

export type SyntheseInventaire = {
  nbBiens: number;
  nbReferencesEnRupture: number;
  valeurBruteTotale: number;
  amortissementCumuleTotal: number;
  valeurNetteTotale: number;
  nbTotalementAmortis: number;
  /** Biens amortissables sans durée renseignée — écart de conformité §7.2. */
  nbSansDuree: number;
};

export function synthetiserInventaire(
  biens: BienLite[],
  maintenant: Date = new Date()
): SyntheseInventaire {
  let brute = 0;
  let amorti = 0;
  let totalementAmortis = 0;
  let sansDuree = 0;
  let ruptures = 0;

  for (const b of biens) {
    brute += valeurBrute(b);
    amorti += amortissementCumule(b, maintenant);
    if (estTotalementAmorti(b, maintenant)) totalementAmortis += 1;
    if (!b.dureeAmortissementAnnees) sansDuree += 1;
    if (stockCourant(b) <= 0) ruptures += 1;
  }

  return {
    nbBiens: biens.length,
    nbReferencesEnRupture: ruptures,
    valeurBruteTotale: Math.round(brute * 1000) / 1000,
    amortissementCumuleTotal: Math.round(amorti * 1000) / 1000,
    valeurNetteTotale: Math.round((brute - amorti) * 1000) / 1000,
    nbTotalementAmortis: totalementAmortis,
    nbSansDuree: sansDuree,
  };
}
