/**
 * Tableau de bord de pilotage trésorerie — logique pure.
 *
 * Reprend les indicateurs d'un classeur de pilotage de trésorerie (feuille
 * « Tableau de bord KPI ») : rien n'y est saisi, tout se recalcule à partir
 * du journal des opérations et du budget prévisionnel
 * — exactement le principe déjà appliqué au reste de l'application (ADR-010).
 */

/**
 * Comparaison des mandats : ces six indicateurs sont écrits dans le registre
 * `KPIHistorique` partagé avec l'alignement stratégique (module
 * management), sous ces noms exacts — la même donnée sert les deux vues.
 */
export const INDICATEURS_COMPARAISON_MANDATS = [
  "Trésorerie — Solde ouverture (DT)",
  "Trésorerie — Total recettes (DT)",
  "Trésorerie — Total dépenses (DT)",
  "Trésorerie — Valeur ajoutée (DT)",
  "Trésorerie — Solde clôture (DT)",
  "Trésorerie — Taux de charges (%)",
] as const;

export type FluxPourRepartition = {
  type: "ENCAISSEMENT" | "DECAISSEMENT";
  montant: number;
  categorie: string;
};

export type RepartitionCategorie = { categorie: string; montant: number };

/** Répartition des flux réels d'un sens donné, par catégorie, triée du plus gros au plus petit. */
export function repartitionParCategorie(
  flux: FluxPourRepartition[],
  sens: "ENCAISSEMENT" | "DECAISSEMENT"
): RepartitionCategorie[] {
  const totaux = new Map<string, number>();
  for (const f of flux.filter((x) => x.type === sens)) {
    totaux.set(f.categorie, (totaux.get(f.categorie) ?? 0) + f.montant);
  }
  return [...totaux.entries()]
    .map(([categorie, montant]) => ({ categorie, montant: Math.round(montant * 1000) / 1000 }))
    .sort((a, b) => b.montant - a.montant);
}

export type PointMensuel = {
  periode: string;
  soldeOuverture: number;
  soldeCloture: number;
  recettesReelles: number;
  depensesReelles: number;
  recettesBudget: number;
  depensesBudget: number;
};

export type IndicateursExercice = {
  totalRecettesReelles: number;
  totalDepensesReelles: number;
  totalRecettesBudget: number;
  totalDepensesBudget: number;
  valeurAjoutee: number;
  soldeCloture: number;
  soldeMinimum: number;
  periodesDeficitaires: number;
  /** `null` sans budget à comparer — pas un taux de 0 %. */
  tauxRealisationRecettes: number | null;
  tauxRealisationDepenses: number | null;
  /** `null` sans recette réelle — un taux de charges n'existe pas sans base. */
  tauxDeCharges: number | null;
};

function arrondir(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function indicateursExercice(points: PointMensuel[]): IndicateursExercice {
  const totalRecettesReelles = arrondir(points.reduce((s, p) => s + p.recettesReelles, 0));
  const totalDepensesReelles = arrondir(points.reduce((s, p) => s + p.depensesReelles, 0));
  const totalRecettesBudget = arrondir(points.reduce((s, p) => s + p.recettesBudget, 0));
  const totalDepensesBudget = arrondir(points.reduce((s, p) => s + p.depensesBudget, 0));
  const soldes = points.map((p) => p.soldeCloture);

  return {
    totalRecettesReelles,
    totalDepensesReelles,
    totalRecettesBudget,
    totalDepensesBudget,
    valeurAjoutee: arrondir(totalRecettesReelles - totalDepensesReelles),
    soldeCloture: soldes.length > 0 ? soldes[soldes.length - 1] : 0,
    soldeMinimum: soldes.length > 0 ? Math.min(...soldes) : 0,
    periodesDeficitaires: points.filter((p) => p.depensesReelles > p.recettesReelles).length,
    tauxRealisationRecettes:
      totalRecettesBudget === 0 ? null : arrondir(totalRecettesReelles / totalRecettesBudget),
    tauxRealisationDepenses:
      totalDepensesBudget === 0 ? null : arrondir(totalDepensesReelles / totalDepensesBudget),
    tauxDeCharges:
      totalRecettesReelles === 0 ? null : arrondir(totalDepensesReelles / totalRecettesReelles),
  };
}

/**
 * Phrase d'analyse d'un rapport mensuel — reprend mot pour mot le gabarit du
 * classeur : « Le tableau ci-dessous compare le budget prévisionnel à la
 * période {mois}. Solde d'ouverture : {x} TND. […] »
 */
export function syntheseMensuelle(p: PointMensuel): string {
  const ecartRecettes = arrondir(p.recettesReelles - p.recettesBudget);
  const ecartDepenses = arrondir(p.depensesReelles - p.depensesBudget);
  const signe = (n: number) => (n >= 0 ? "+" : "");
  return (
    `Le tableau ci-dessous compare le budget prévisionnel à la période ${p.periode}. ` +
    `Solde d'ouverture : ${p.soldeOuverture} DT. ` +
    `Recettes réelles : ${p.recettesReelles} DT (budget : ${p.recettesBudget} DT, écart de ${signe(ecartRecettes)}${ecartRecettes} DT). ` +
    `Dépenses réelles : ${p.depensesReelles} DT (budget : ${p.depensesBudget} DT, écart de ${signe(ecartDepenses)}${ecartDepenses} DT). ` +
    `Solde de clôture : ${p.soldeCloture} DT.`
  );
}

/**
 * Seuil au-delà duquel le taux de charges est signalé comme un point
 * faible. Le classeur ne fixe pas de valeur explicite ; 85 % reprend l'ordre
 * de grandeur du seul cas qu'il documente (91,8 % qualifié de « proche du
 * seuil critique » de 100 %) — un choix, pas une règle importée telle quelle.
 */
export const SEUIL_ALERTE_TAUX_CHARGES = 0.85;

export type ConstatSynthese = { texte: string };

/**
 * Points forts / points faibles détectés selon les mêmes règles que la
 * feuille « Generateur Rapport Annuel » : chaque constat cite le chiffre qui
 * le justifie, jamais une appréciation sans base.
 */
export function pointsForts(
  ind: IndicateursExercice,
  variationRecettesVsMandatPrecedent: number | null
): ConstatSynthese[] {
  const constats: ConstatSynthese[] = [];
  if (ind.soldeMinimum >= 0) {
    constats.push({
      texte:
        "Trésorerie positive tout au long de l'exercice : le solde de clôture n'est jamais devenu négatif.",
    });
  }
  if (variationRecettesVsMandatPrecedent !== null && variationRecettesVsMandatPrecedent > 0) {
    constats.push({
      texte: `Croissance des recettes réelles de ${Math.round(variationRecettesVsMandatPrecedent * 1000) / 10} % par rapport au mandat précédent.`,
    });
  }
  return constats;
}

export function pointsFaibles(ind: IndicateursExercice): ConstatSynthese[] {
  const constats: ConstatSynthese[] = [];
  if (ind.tauxDeCharges !== null && ind.tauxDeCharges >= SEUIL_ALERTE_TAUX_CHARGES) {
    constats.push({
      texte: `Marge de trésorerie réduite : le taux de charges atteint ${Math.round(ind.tauxDeCharges * 1000) / 10} %, proche du seuil critique de 100 %.`,
    });
  }
  if (ind.tauxRealisationDepenses !== null && ind.tauxRealisationDepenses > 1) {
    constats.push({
      texte: `Dépassement budgétaire sur les dépenses : taux de réalisation de ${Math.round(ind.tauxRealisationDepenses * 1000) / 10} % du budget prévisionnel.`,
    });
  }
  if (ind.tauxRealisationRecettes !== null && ind.tauxRealisationRecettes < 1) {
    constats.push({
      texte: `Recettes en retard sur le budget prévisionnel : taux de réalisation de seulement ${Math.round(ind.tauxRealisationRecettes * 1000) / 10} %.`,
    });
  }
  return constats;
}

/** Variation relative entre deux montants ; `null` depuis une base nulle ou absente. */
export function variation(actuel: number, precedent: number | null): number | null {
  if (precedent === null || precedent === 0) return null;
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 1000) / 1000;
}
