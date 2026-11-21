/**
 * Budget prévisionnel du mandat — logique pure.
 *
 * Reprend la structure d'un classeur de budget prévisionnel associatif :
 * un poste par ligne, une colonne par mois du mandat, des sous-totaux par
 * section, un bilan mensuel et un solde de trésorerie budgétaire cumulé.
 *
 * Le verrouillage du budget n'est **jamais stocké** : il se déduit de
 * l'existence d'une AG d'ouverture tenue (ADR-010, comme le reste des
 * indicateurs de l'application). Un drapeau « verrouillé » stocké finirait par
 * mentir dès qu'une AG est corrigée après coup.
 */

export const SECTIONS_BUDGET = [
  { code: "CHARGES_FIXES", libelle: "Charges fixes", sens: "DEPENSE" },
  { code: "CHARGES_VARIABLES", libelle: "Charges variables", sens: "DEPENSE" },
  { code: "AUTRES_DEPENSES", libelle: "Autres dépenses", sens: "DEPENSE" },
  { code: "DECLARATION_TVA", libelle: "Déclaration (TVA)", sens: "DEPENSE" },
  {
    code: "RECETTES_HORS_EXPLOITATION",
    libelle: "Recettes hors exploitation",
    sens: "RECETTE",
  },
  {
    code: "RECETTES_EXPLOITATION",
    libelle: "Recettes d'exploitation",
    sens: "RECETTE",
  },
] as const;

export type CodeSectionBudget = (typeof SECTIONS_BUDGET)[number]["code"];
export type SensSection = "DEPENSE" | "RECETTE";

export const LIBELLES_SECTION_BUDGET: Record<CodeSectionBudget, string> =
  Object.fromEntries(SECTIONS_BUDGET.map((s) => [s.code, s.libelle])) as Record<
    CodeSectionBudget,
    string
  >;

export const SENS_SECTION_BUDGET: Record<CodeSectionBudget, SensSection> =
  Object.fromEntries(SECTIONS_BUDGET.map((s) => [s.code, s.sens])) as Record<
    CodeSectionBudget,
    SensSection
  >;

/** Nombre maximal de colonnes générées : un mandat mal saisi ne doit pas figer la page. */
const NB_MOIS_MAX = 36;

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export type PeriodeBudget = { cle: string; libelle: string };

/**
 * Une colonne par mois calendaire entre `debut` et `fin`, inclus.
 *
 * Le drive fusionnait « Juin-Juillet » en une seule colonne parce que le
 * mandat 2025-2026 démarrait fin juin — un artefact de ce mandat précis, pas
 * une règle générale. Ici chaque mois calendaire du mandat a sa colonne ;
 * rien n'est fusionné.
 */
export function moisDuMandat(debut: Date, fin: Date): PeriodeBudget[] {
  if (fin.getTime() < debut.getTime()) return [];

  const periodes: PeriodeBudget[] = [];
  let annee = debut.getFullYear();
  let mois = debut.getMonth();
  const anneeFin = fin.getFullYear();
  const moisFin = fin.getMonth();

  while (
    (annee < anneeFin || (annee === anneeFin && mois <= moisFin)) &&
    periodes.length < NB_MOIS_MAX
  ) {
    periodes.push({
      cle: `${annee}-${String(mois + 1).padStart(2, "0")}`,
      libelle: `${MOIS_FR[mois]} ${annee}`,
    });
    mois += 1;
    if (mois > 11) {
      mois = 0;
      annee += 1;
    }
  }
  return periodes;
}

function arrondir(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Aligne un tableau de valeurs mensuelles sur le nombre de colonnes actuel. */
export function normaliserValeurs(
  valeurs: number[] | undefined | null,
  nbMois: number
): number[] {
  const source = valeurs ?? [];
  const sortie = new Array<number>(nbMois).fill(0);
  for (let i = 0; i < Math.min(source.length, nbMois); i++) {
    sortie[i] = source[i] ?? 0;
  }
  return sortie;
}

export type LigneBudgetCalc = { valeursMensuelles: number[] };
export type SectionBudgetCalc = { sens: SensSection; lignes: LigneBudgetCalc[] };

/** Sous-total d'une section, mois par mois. */
export function sousTotalSection(
  section: SectionBudgetCalc,
  nbMois: number
): number[] {
  const totaux = new Array<number>(nbMois).fill(0);
  for (const ligne of section.lignes) {
    const valeurs = normaliserValeurs(ligne.valeursMensuelles, nbMois);
    for (let i = 0; i < nbMois; i++) totaux[i] += valeurs[i];
  }
  return totaux.map(arrondir);
}

/** Total dépenses ou recettes, toutes sections de ce sens confondues. */
export function totalParSens(
  sections: SectionBudgetCalc[],
  sens: SensSection,
  nbMois: number
): number[] {
  const totaux = new Array<number>(nbMois).fill(0);
  for (const section of sections.filter((s) => s.sens === sens)) {
    const sousTotal = sousTotalSection(section, nbMois);
    for (let i = 0; i < nbMois; i++) totaux[i] += sousTotal[i];
  }
  return totaux.map(arrondir);
}

/** Recettes moins dépenses, mois par mois — peut être négatif. */
export function bilanMensuel(
  totalRecettes: number[],
  totalDepenses: number[]
): number[] {
  return totalRecettes.map((r, i) => arrondir(r - (totalDepenses[i] ?? 0)));
}

/** Solde de trésorerie budgétaire cumulé, mois après mois. */
export function soldeCumule(soldeInitial: number, bilan: number[]): number[] {
  let solde = soldeInitial;
  return bilan.map((b) => {
    solde = arrondir(solde + b);
    return solde;
  });
}

/* ------------------------------------------------------------------ */
/* Verrouillage                                                        */
/* ------------------------------------------------------------------ */

/**
 * Le budget est verrouillé dès qu'une AG d'ouverture a été tenue pour le
 * mandat, sauf pendant la fenêtre ouverte par une demande de modification
 * acceptée par le Président.
 */
export function budgetVerrouille(
  agOuvertureTenue: boolean,
  demandeActiveAcceptee: boolean
): boolean {
  if (!agOuvertureTenue) return false;
  return !demandeActiveAcceptee;
}

/* ------------------------------------------------------------------ */
/* Demandes de modification post-verrouillage                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Respect du budget                                                   */
/* ------------------------------------------------------------------ */

/**
 * Part du mandat déjà écoulée, entre 0 et 1.
 *
 * C'est ce qui rend l'indicateur lisible en cours d'exercice : avoir dépensé
 * 40 % du budget n'a pas le même sens en septembre qu'en mai.
 */
export function partEcoulee(debut: Date, fin: Date, maintenant: Date): number {
  const total = fin.getTime() - debut.getTime();
  if (total <= 0) return 1;
  const ecoule = maintenant.getTime() - debut.getTime();
  return Math.min(1, Math.max(0, ecoule / total));
}

/**
 * Respect du budget, en pourcentage.
 *
 * **Convention retenue** — ce n'est pas une norme comptable, c'est un choix
 * de lecture, à discuter avec le Trésorier :
 *
 *  - on compare le réalisé non pas au budget annuel, mais à la part de ce
 *    budget correspondant au temps écoulé ;
 *  - côté charges, dépenser moins que prévu n'est pas un manquement : le
 *    respect vaut 100 tant qu'on est sous la trajectoire, et se dégrade
 *    proportionnellement au dépassement ;
 *  - côté recettes, c'est l'inverse : encaisser moins que prévu dégrade le
 *    respect, encaisser plus est plafonné à 100 pour qu'une bonne surprise
 *    ne masque pas un dérapage de dépenses.
 *
 * Rend `null` quand rien n'est budgété : un pourcentage inventé sur une base
 * nulle serait pire que pas de chiffre du tout.
 */
export function respectBudget(params: {
  prevuRecettes: number;
  realiseRecettes: number;
  prevuCharges: number;
  realiseCharges: number;
  partEcoulee: number;
}): { global: number; recettes: number | null; charges: number | null } | null {
  const part = Math.min(1, Math.max(0, params.partEcoulee));

  const attenduCharges = params.prevuCharges * part;
  const charges =
    params.prevuCharges <= 0
      ? params.realiseCharges > 0
        ? 0 // dépensé hors de tout budget
        : null
      : params.realiseCharges <= attenduCharges
        ? 100
        : attenduCharges <= 0
          ? 0
          : Math.round((attenduCharges / params.realiseCharges) * 100);

  const attenduRecettes = params.prevuRecettes * part;
  const recettes =
    params.prevuRecettes <= 0
      ? null
      : attenduRecettes <= 0
        ? 100 // le mandat commence : rien n'est encore attendu
        : Math.min(
            100,
            Math.round((params.realiseRecettes / attenduRecettes) * 100)
          );

  const retenus = [charges, recettes].filter((v): v is number => v !== null);
  if (retenus.length === 0) return null;
  return {
    global: Math.round(retenus.reduce((s, v) => s + v, 0) / retenus.length),
    recettes,
    charges,
  };
}

export const STATUTS_DEMANDE_BUDGET = [
  "EN_ATTENTE",
  "ACCEPTEE",
  "REFUSEE",
  "APPLIQUEE",
] as const;

export type StatutDemandeBudget = (typeof STATUTS_DEMANDE_BUDGET)[number];

export const LIBELLES_STATUT_DEMANDE_BUDGET: Record<StatutDemandeBudget, string> = {
  EN_ATTENTE: "En attente du Président",
  ACCEPTEE: "Acceptée — modification en cours",
  REFUSEE: "Refusée",
  APPLIQUEE: "Appliquée",
};

/**
 * Une demande ne peut se clore (APPLIQUEE) qu'après être passée par
 * l'acceptation du Président : impossible de modifier le budget verrouillé
 * sans cette étape, quelle que soit la voie empruntée dans l'écran.
 */
const TRANSITIONS_DEMANDE_BUDGET: Record<StatutDemandeBudget, StatutDemandeBudget[]> = {
  EN_ATTENTE: ["ACCEPTEE", "REFUSEE"],
  ACCEPTEE: ["APPLIQUEE"],
  REFUSEE: [],
  APPLIQUEE: [],
};

export function transitionsDemandeBudgetPossibles(
  depuis: StatutDemandeBudget
): StatutDemandeBudget[] {
  return TRANSITIONS_DEMANDE_BUDGET[depuis];
}

/** Retourne un message d'erreur, ou `null` si la transition est permise. */
export function validerTransitionDemandeBudget(
  depuis: StatutDemandeBudget,
  vers: StatutDemandeBudget
): string | null {
  if (depuis === vers) return null;
  if (TRANSITIONS_DEMANDE_BUDGET[depuis].includes(vers)) return null;
  if (depuis === "REFUSEE" || depuis === "APPLIQUEE") {
    return `La demande est déjà ${LIBELLES_STATUT_DEMANDE_BUDGET[depuis].toLowerCase()} : son sort ne se rejoue pas.`;
  }
  if (depuis === "EN_ATTENTE" && vers === "APPLIQUEE") {
    return "La demande doit d'abord être acceptée par le Président avant toute modification.";
  }
  return `Passage de « ${LIBELLES_STATUT_DEMANDE_BUDGET[depuis]} » à « ${LIBELLES_STATUT_DEMANDE_BUDGET[vers]} » non prévu.`;
}
