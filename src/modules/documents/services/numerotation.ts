/**
 * Numérotation des documents — logique pure, testée.
 *
 * On reproduit la nomenclature CTJE observée sur le drive de la JE :
 *   `RC047-INT-2526`, `FE008-2526`, `RAS-004-2526`, `NC-2526-001`…
 * Chaque modèle porte son propre gabarit de référence ; ici on ne fait que
 * substituer les jetons et garantir l'unicité par (modèle, mandat).
 *
 * Jetons reconnus :
 *   {seq}    numéro d'ordre brut
 *   {seq:N}  numéro d'ordre complété à N chiffres  (ex. {seq:3} → 007)
 *   {mandat} mandat court                          (« 2025-2026 » → 2526)
 *   {annee}  année civile sur 4 chiffres
 *   {mois}   mois sur 2 chiffres
 *   {code}   code du modèle
 */

export class ReferenceInvalide extends Error {}

/** « 2025-2026 » → « 2526 ». Tolère déjà-court (« 2526 ») et « 25-26 ». */
export function mandatCourt(annee: string): string {
  const propre = annee.trim();
  const long = propre.match(/^(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})$/);
  if (long) return `${long[2]}${long[4]}`;
  const court = propre.match(/^(\d{2})\s*-\s*(\d{2})$/);
  if (court) return `${court[1]}${court[2]}`;
  if (/^\d{4}$/.test(propre)) return propre;
  throw new ReferenceInvalide(
    `Mandat « ${annee} » non reconnu : attendu « 2025-2026 », « 25-26 » ou « 2526 ».`
  );
}

export type ContexteReference = {
  sequence: number;
  /** Année du mandat telle que stockée (« 2025-2026 »). */
  mandat: string;
  /** Date de référence du document ; par défaut maintenant. */
  date?: Date;
  /** Code du modèle, pour les gabarits qui l'incorporent. */
  code?: string;
};

/** Substitue les jetons d'un gabarit de référence. */
export function formaterReference(
  format: string,
  ctx: ContexteReference
): string {
  const date = ctx.date ?? new Date();
  const inconnus: string[] = [];

  const reference = format.replace(
    /\{(\w+)(?::(\d+))?\}/g,
    (_tout, jeton: string, largeur?: string) => {
      switch (jeton) {
        case "seq":
          return largeur
            ? String(ctx.sequence).padStart(Number(largeur), "0")
            : String(ctx.sequence);
        case "mandat":
          return mandatCourt(ctx.mandat);
        case "annee":
          return String(date.getFullYear());
        case "mois":
          return String(date.getMonth() + 1).padStart(2, "0");
        case "code":
          return ctx.code ?? "";
        default:
          inconnus.push(jeton);
          return "";
      }
    }
  );

  if (inconnus.length > 0) {
    throw new ReferenceInvalide(
      `Jeton${inconnus.length > 1 ? "s" : ""} inconnu${
        inconnus.length > 1 ? "s" : ""
      } dans « ${format} » : ${inconnus.map((j) => `{${j}}`).join(", ")}.`
    );
  }
  return reference;
}

/**
 * Clé du compteur atomique. Un compteur par modèle **et par mandat** : les
 * numéros repartent à 1 à chaque mandat, comme sur le drive.
 */
export function cleSequence(codeModele: string, mandat: string): string {
  return `${codeModele}:${mandatCourt(mandat)}`;
}
