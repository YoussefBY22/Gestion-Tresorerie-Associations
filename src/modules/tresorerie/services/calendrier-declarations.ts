/**
 * Où en sont les déclarations du mandat — logique pure, testée.
 *
 * La question qu'un Trésorier se pose d'abord n'est pas « combien dois-je ce
 * mois-ci », c'est **« suis-je à jour ? »**. L'écran ne savait pas y
 * répondre : il montrait un mois à la fois, sans dire si les précédents
 * avaient été faits. On changeait de mois en tapant une date puis en
 * cliquant « Afficher », ce qui transforme une vérification de dix secondes
 * en une fouille.
 *
 * Ce service dresse la frise des mois de l'exercice avec l'état de chacun.
 * Il ne connaît ni la base ni l'écran : on lui donne les mois, les
 * déclarations trouvées et le mois d'aujourd'hui.
 */

export type EtatMois =
  | "DEPOSEE"
  | "CLOTUREE"
  /** Mois échu, pas encore clôturé : c'est le retard. */
  | "EN_RETARD"
  /** Mois en cours, en préparation. */
  | "EN_COURS"
  /** Mois pas encore commencé. */
  | "A_VENIR";

export type MoisDeclaration = {
  cle: string;
  libelle: string;
  etat: EtatMois;
};

/** Ce que la base sait d'un mois ; absent = jamais ouvert. */
export type StatutEnBase = { mois: string; statut: string };

/**
 * Frise des mois de l'exercice, chacun avec son état.
 *
 * Un mois sans ligne en base n'est pas une anomalie : la déclaration se crée
 * à la première saisie. S'il est échu, il compte quand même comme un retard
 * — l'absence de déclaration pour un mois passé en est précisément un.
 */
export function calendrierDeclarations(
  moisDuMandat: { cle: string; libelle: string }[],
  enBase: StatutEnBase[],
  moisAujourdhui: string
): MoisDeclaration[] {
  const parMois = new Map(enBase.map((d) => [d.mois, d.statut]));

  return moisDuMandat.map(({ cle, libelle }) => {
    const statut = parMois.get(cle);
    if (statut === "DEPOSEE") return { cle, libelle, etat: "DEPOSEE" as const };
    if (statut === "CLOTUREE") return { cle, libelle, etat: "CLOTUREE" as const };

    if (cle > moisAujourdhui) return { cle, libelle, etat: "A_VENIR" as const };
    if (cle === moisAujourdhui) return { cle, libelle, etat: "EN_COURS" as const };
    return { cle, libelle, etat: "EN_RETARD" as const };
  });
}

/** Mois échus que personne n'a clôturés. */
export function moisEnRetard(calendrier: MoisDeclaration[]): MoisDeclaration[] {
  return calendrier.filter((m) => m.etat === "EN_RETARD");
}

/**
 * Le mois précédent bloque-t-il la clôture de celui-ci ?
 *
 * Seule une déclaration **ouverte et laissée en brouillon** bloque : son
 * crédit de TVA se reporte sur le mois suivant, le figer dans le désordre
 * ferait perdre ce report. Un mois jamais ouvert ne bloque rien — l'action
 * `cloturerDeclaration` en juge pareil, et l'écran doit dire la même chose
 * qu'elle plutôt que d'avertir à tort.
 */
export function blocageDeLaCloture(
  moisPrecedent: string,
  enBase: StatutEnBase[]
): { bloque: boolean; raison: string | null } {
  const precedente = enBase.find((d) => d.mois === moisPrecedent);
  if (precedente && precedente.statut === "BROUILLON") {
    return {
      bloque: true,
      raison: "son crédit de TVA se reporte sur ce mois",
    };
  }
  return { bloque: false, raison: null };
}

/** Mois suivant au format AAAA-MM. */
export function moisSuivant(mois: string): string {
  const [annee, m] = mois.split("-").map(Number);
  if (!annee || !m || m < 1 || m > 12) throw new Error(`Mois invalide : « ${mois} ».`);
  return m === 12
    ? `${annee + 1}-01`
    : `${annee}-${String(m + 1).padStart(2, "0")}`;
}
