/**
 * Couleur de la structure — valeur par défaut et validation.
 *
 * Fichier **pur** : aucun accès base, aucune API Next. C'est voulu, parce
 * que quatre endroits très différents en ont besoin — la feuille de style
 * de l'interface, le rendu des PDF (logique pure et testée), le gabarit
 * d'e-mail et le layout racine. Une constante recopiée dans quatre fichiers
 * finit par diverger, et une pièce sort alors d'une autre couleur que
 * l'écran qui l'a produite.
 *
 * La valeur paramétrée vit sous la clé `apparence.couleurPrimaire` ; ce
 * module ne fait que donner le repli et dire ce qui est lisible.
 */

/**
 * Bleu d'encre. Neutre, lisible sur blanc comme sur noir, et assez éloigné
 * du vert « encaissé », de l'ambre « à surveiller » et du rouge « en
 * retard » pour ne jamais se confondre avec un état de la comptabilité.
 *
 * La même valeur est écrite une fois dans `globals.css` (`--primary-base`),
 * comme repli de la feuille de style si la page est servie sans paramétrage.
 */
export const COULEUR_PRIMAIRE_DEFAUT = "#2c4a7c";

/** Une couleur hexadécimale `#rgb` ou `#rrggbb`, et rien d'autre. */
const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Normalise une couleur saisie, ou rend `null`.
 *
 * Une valeur fantaisiste injectée telle quelle dans une variable CSS ne
 * casserait pas la page : elle la rendrait **sans couleur de marque**, ce
 * qui est difficile à diagnostiquer — rien n'est en erreur, tout est juste
 * terne. On préfère refuser et retomber sur le défaut.
 */
export function couleurValide(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const t = brut.trim();
  if (!HEX.test(t)) return null;
  return t.startsWith("#") ? t.toLowerCase() : `#${t.toLowerCase()}`;
}
