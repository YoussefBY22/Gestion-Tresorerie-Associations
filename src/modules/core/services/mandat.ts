/**
 * Exercices — logique pure.
 *
 * Un exercice est la période comptable sur laquelle une association tient ses
 * comptes et rend compte à son assemblée générale. Beaucoup d'associations et
 * de clubs étudiants suivent l'année scolaire plutôt que l'année civile :
 * c'est la convention retenue par défaut ici, du **1er juillet** au
 * **30 juin** suivant.
 *
 * Le mois de bascule est écrit **une seule fois**, dans la constante
 * ci-dessous. Rien ailleurs ne doit recoder « juillet » ou « juin » en dur :
 * c'est exactement ce qui avait produit un exercice de départ mal daté
 * (1er septembre → 31 août). Une structure qui suit l'année civile change ce
 * seul chiffre pour `0` (janvier), et tout le reste suit.
 *
 * Les exercices déjà saisis ne sont pas recalculés : cette convention ne sert
 * qu'à **proposer** des dates, qui restent modifiables à l'écran.
 */

/** Mois de début d'exercice, à la façon de `Date` : 0 = janvier, 6 = juillet. */
export const MOIS_DEBUT_EXERCICE: number = 6;

export type PeriodeMandat = { annee: string; debut: Date; fin: Date };

/**
 * L'exercice qui commence en `anneeDebut` et finit la veille du même jour,
 * un an plus tard. Le libellé reste « AAAA-AAAA » tant que l'exercice
 * chevauche deux années civiles.
 */
export function mandatJuilletJuin(anneeDebut: number): PeriodeMandat {
  const debut = new Date(anneeDebut, MOIS_DEBUT_EXERCICE, 1);
  // Veille du premier jour de l'exercice suivant : le jour 0 du mois suivant
  // est le dernier jour du mois courant, ce qui évite d'écrire « 30 » ou
  // « 31 » et de se tromper sur février.
  const fin = new Date(anneeDebut + 1, MOIS_DEBUT_EXERCICE, 0);
  const annee =
    MOIS_DEBUT_EXERCICE === 0
      ? String(anneeDebut)
      : `${anneeDebut}-${anneeDebut + 1}`;
  return { annee, debut, fin };
}

/**
 * L'exercice en cours à une date donnée. Avant le mois de bascule, on est
 * encore dans l'exercice entamé l'année civile précédente.
 */
export function mandatCourant(aujourdhui: Date = new Date()): PeriodeMandat {
  const anneeDebut =
    aujourdhui.getMonth() >= MOIS_DEBUT_EXERCICE
      ? aujourdhui.getFullYear()
      : aujourdhui.getFullYear() - 1;
  return mandatJuilletJuin(anneeDebut);
}

/**
 * L'exercice qui suit celui dont l'année est `anneePrecedente`
 * (« 2026-2027 » → « 2027-2028 », ou « 2026 » → « 2027 »). `null` si le
 * format ne peut pas être lu — jamais une date devinée.
 */
export function mandatSuivant(anneePrecedente: string): PeriodeMandat | null {
  const chevauchant = anneePrecedente.match(/^(\d{4})-(\d{4})$/);
  if (chevauchant) return mandatJuilletJuin(Number(chevauchant[2]));
  const civil = anneePrecedente.match(/^(\d{4})$/);
  if (civil) return mandatJuilletJuin(Number(civil[1]) + 1);
  return null;
}

/** Format `AAAA-MM-DD` attendu par un `<input type="date">`. */
export function dateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Le mois d'une date au format `AAAA-MM`, tel que le portent les
 * déclarations mensuelles et les rapports de période.
 */
export function moisCourant(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
