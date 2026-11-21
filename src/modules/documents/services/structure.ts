/**
 * Représentation **déclarative** d'un document, indépendante du rendu.
 *
 * C'est la pièce centrale de la brique « moteur de documents » : un gabarit ne
 * dessine pas, il décrit. Le rendu PDF (`rendu.ts`) est le seul à connaître les
 * coordonnées, les polices et la charte. Conséquences :
 *   - un gabarit est une fonction **pure** donc testable sans PDF ;
 *   - changer la charte se fait à un seul endroit, pour les ~110 modèles ;
 *   - on pourra ajouter un autre moteur de sortie (HTML d'aperçu, DOCX pour un
 *     tiers) sans réécrire un seul gabarit.
 */

export type AlignementColonne = "gauche" | "droite" | "centre";

export type ColonneTableau = {
  libelle: string;
  /** Part de la largeur utile (les parts sont normalisées au rendu). */
  largeur: number;
  alignement?: AlignementColonne;
};

export type BlocDocument =
  /** Texte courant, replié automatiquement sur la largeur utile. */
  | { type: "paragraphe"; texte: string; italique?: boolean }
  /** Titre de section. */
  | { type: "section"; titre: string }
  /** Couples libellé / valeur, sur une à trois colonnes. */
  | {
      type: "champs";
      colonnes?: 1 | 2 | 3;
      items: { label: string; valeur: string }[];
    }
  /** Tableau à en-tête, avec zébrage. */
  | { type: "tableau"; colonnes: ColonneTableau[]; lignes: string[][] }
  /** Bloc de totaux aligné à droite. */
  | { type: "total"; items: { label: string; valeur: string; fort?: boolean }[] }
  /** Encadré de mise en avant (mention légale, avertissement…). */
  | { type: "encadre"; titre?: string; texte: string }
  /** Cases de signature côte à côte. */
  | { type: "signatures"; cases: { role: string; nom?: string }[] }
  /** Respiration verticale explicite, en points. */
  | { type: "espace"; hauteur: number };

export type StructureDocument = {
  titre: string;
  sousTitre?: string;
  /** Référence normalisée (ex. `RC001-COT-2526`) — reprise en pied de page. */
  reference: string;
  /** Date déjà formatée pour l'affichage. */
  date: string;
  blocs: BlocDocument[];
  /** Mention répétée en pied de page (mentions légales, matricule fiscal…). */
  mentionPied?: string;
  /** Filigrane diagonal — utilisé pour les brouillons et les annulations. */
  filigrane?: string;
  /**
   * `paysage` pour les tableaux à beaucoup de colonnes (budget mensuel,
   * export multi-mois) : au-delà de 6-7 colonnes, le portrait A4 ne laisse
   * plus assez de place pour des montants lisibles. Par défaut `portrait`.
   */
  orientation?: "portrait" | "paysage";
};

/** Formate un montant en dinars tunisiens : `30,000 DT` (3 décimales, usage TN). */
export function formaterMontantDT(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

/** Formate une date en `JJ/MM/AAAA`. */
export function formaterDate(date: Date): string {
  const jj = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${date.getFullYear()}`;
}

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante",
  "quatre-vingt", "quatre-vingt",
];

/**
 * Montant en toutes lettres — un reçu tunisien doit porter la somme écrite
 * (« la somme de trente dinars »), c'est ce que fait le modèle du drive.
 */
export function montantEnLettres(montant: number): string {
  const entiers = Math.floor(Math.abs(montant));
  const millimes = Math.round((Math.abs(montant) - entiers) * 1000);
  const parts = [`${nombreEnLettres(entiers)} dinar${entiers > 1 ? "s" : ""}`];
  if (millimes > 0) {
    parts.push(`${nombreEnLettres(millimes)} millime${millimes > 1 ? "s" : ""}`);
  }
  return parts.join(" et ");
}

function nombreEnLettres(n: number): string {
  if (n < 20) return UNITES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    // 70-79 et 90-99 se disent « soixante-dix » / « quatre-vingt-dix » :
    // la dizaine reste 60/80 et l'unité passe de 10 à 19.
    if (d === 7 || d === 9) {
      // « soixante et onze » prend le « et », « quatre-vingt-onze » non.
      const liant = d === 7 && u === 1 ? " et " : "-";
      return `${DIZAINES[d]}${liant}${UNITES[10 + u]}`;
    }
    if (u === 0) return d === 8 ? "quatre-vingts" : DIZAINES[d];
    // « vingt et un » … « soixante et un », mais « quatre-vingt-un ».
    const liant = u === 1 && d !== 8 ? " et " : "-";
    return `${DIZAINES[d]}${liant}${UNITES[u]}`;
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const reste = n % 100;
    const tete = c === 1 ? "cent" : `${UNITES[c]} cent${reste === 0 ? "s" : ""}`;
    return reste === 0 ? tete : `${tete} ${nombreEnLettres(reste)}`;
  }
  const milliers = Math.floor(n / 1000);
  const reste = n % 1000;
  const tete = milliers === 1 ? "mille" : `${nombreEnLettres(milliers)} mille`;
  return reste === 0 ? tete : `${tete} ${nombreEnLettres(reste)}`;
}
