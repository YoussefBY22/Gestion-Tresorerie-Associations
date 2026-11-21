/**
 * Renumérotation d'une série de reçus — logique pure, testée.
 *
 * Un reçu papier était irréversible parce qu'il était physique : une fois la
 * souche remplie, le numéro était pris, gâché ou non. Un PDF qui n'a jamais
 * quitté l'application n'a été remis à personne — il n'y a rien à justifier auprès de
 * qui que ce soit, et son numéro n'a aucune raison d'être perdu.
 *
 * D'où la règle : **c'est l'envoi qui grave la référence**. Tant qu'un reçu
 * n'est pas parti, le supprimer rend son numéro, et les reçus non envoyés qui
 * le suivent redescendent d'un cran. Une fois parti, plus rien ne bouge : on
 * annule, et la référence reste consommée.
 *
 * Un reçu envoyé ou annulé est donc un **point fixe** dans la série. S'il s'en
 * trouve un après le reçu supprimé, aucun décalage n'est possible sans créer
 * une collision de références : le trou reste, et l'appelant le dit.
 */

export type RecuDeLaSerie = {
  id: string;
  sequence: number;
  /** Remis au tiers : la référence est gravée. */
  envoye: boolean;
  /** Annulé : la référence reste consommée, c'est tout son intérêt. */
  annule: boolean;
};

export type Decalage = {
  id: string;
  ancienneSequence: number;
  nouvelleSequence: number;
};

export type PlanSuppression = {
  /**
   * Reçus à renuméroter, **dans l'ordre croissant** : chaque numéro libéré
   * par le précédent accueille le suivant. Traiter dans le désordre ferait
   * buter sur l'unicité de la référence.
   */
  decalages: Decalage[];
  /** Plus haut numéro occupé une fois l'opération faite ; 0 si la série se vide. */
  compteur: number;
  /** Un reçu déjà envoyé (ou annulé) empêche de refermer la série. */
  trouSubsiste: boolean;
};

/** `RC007-COT-2627` → 7. `null` si la référence ne suit pas la nomenclature. */
export function sequenceDeLaReference(reference: string): number | null {
  const trouve = reference.match(/^[A-Za-z]+(\d+)-/);
  if (!trouve) return null;
  const sequence = Number(trouve[1]);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

/**
 * Découpe une référence en ce qui identifie sa série et son rang.
 * `RC007-COT-2627` → `{ prefixe: "RC", sequence: 7, suffixe: "-COT-2627" }`.
 *
 * Deux reçus appartiennent à la même série s'ils ont le même préfixe et le
 * même suffixe : c'est ce qui distingue `RC007-COT-2627` de
 * `RC007-TOMBOLA-2627`, deux séries qui comptent chacune pour soi.
 */
export function decouperReference(
  reference: string
): { prefixe: string; sequence: number; suffixe: string } | null {
  const trouve = reference.match(/^([A-Za-z]+)(\d+)(-.+)$/);
  if (!trouve) return null;
  const sequence = Number(trouve[2]);
  if (!Number.isFinite(sequence) || sequence <= 0) return null;
  return { prefixe: trouve[1], sequence, suffixe: trouve[3] };
}

/** Recompose une référence pour un nouveau rang, largeur de numéro conservée. */
export function referencePourSequence(
  reference: string,
  sequence: number
): string {
  const morceaux = decouperReference(reference);
  if (!morceaux) {
    throw new Error(`Référence « ${reference} » hors nomenclature.`);
  }
  const largeur = reference.slice(morceaux.prefixe.length).split("-")[0].length;
  return `${morceaux.prefixe}${String(sequence).padStart(largeur, "0")}${morceaux.suffixe}`;
}

/** Un reçu envoyé ou annulé ne se renumérote pas : sa référence est gravée. */
function estFige(recu: RecuDeLaSerie): boolean {
  return recu.envoye || recu.annule;
}

/**
 * Que devient la série quand on supprime le reçu portant `sequenceSupprimee` ?
 *
 * `serie` contient toute la série **sauf** le reçu supprimé — c'est à
 * l'appelant de l'exclure, il sait lequel il retire.
 */
export function planifierSuppression(
  serie: RecuDeLaSerie[],
  sequenceSupprimee: number
): PlanSuppression {
  const apres = serie
    .filter((r) => r.sequence > sequenceSupprimee)
    .sort((a, b) => a.sequence - b.sequence);

  const bloque = apres.some(estFige);

  const decalages: Decalage[] = bloque
    ? []
    : apres.map((r) => ({
        id: r.id,
        ancienneSequence: r.sequence,
        nouvelleSequence: r.sequence - 1,
      }));

  // Le compteur suit l'état final : il vaut le plus haut numéro qui reste
  // occupé. Le laisser plus haut gaspillerait des numéros, le descendre plus
  // bas rouvrirait une référence déjà prise.
  const sequencesFinales = [
    ...serie
      .filter((r) => r.sequence < sequenceSupprimee)
      .map((r) => r.sequence),
    ...(bloque
      ? apres.map((r) => r.sequence)
      : decalages.map((d) => d.nouvelleSequence)),
  ];
  const compteur = sequencesFinales.length ? Math.max(...sequencesFinales) : 0;

  return { decalages, compteur, trouSubsiste: bloque };
}
