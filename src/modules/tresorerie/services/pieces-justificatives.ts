/**
 * Pièces justificatives des registres — logique pure, testée.
 *
 * Seul le registre clients acceptait des justificatifs. Partout ailleurs —
 * dons, fournisseurs, chèques et dettes — la ligne existait sans sa preuve :
 * un don de 500 DT sans reçu de l'association, une dette sans la
 * reconnaissance signée. En audit CTJE, c'est la pièce qu'on demande, pas la
 * ligne du tableur.
 *
 * Les règles d'acceptation vivaient en trois exemplaires dans l'action du
 * registre clients ; elles vivent ici, en un seul, pour que les quatre
 * registres refusent de la même façon.
 *
 * **Pourquoi le PDF seul.** Une pièce justificative est destinée à être
 * relue des années plus tard, par quelqu'un d'autre, et à être imprimée pour
 * un contrôleur. Un .docx se réouvre modifié, une photo se perd en
 * résolution, un .heic ne s'ouvre pas sur la moitié des postes. Le PDF est le
 * seul format dont on est sûr qu'il s'ouvrira et qu'il n'aura pas bougé.
 */

/** Au-delà, un justificatif est un scan mal réglé, pas une pièce. */
export const TAILLE_MAX_PIECE = 5 * 1024 * 1024;

export const REGISTRES_AVEC_PIECES = [
  "dons",
  "fournisseurs",
  "cheques-dettes",
] as const;
export type RegistreAvecPieces = (typeof REGISTRES_AVEC_PIECES)[number];

/** Ce que chaque registre attend comme pièce, dit à l'écran. */
export const ATTENDU_PAR_REGISTRE: Record<RegistreAvecPieces, string> = {
  dons: "Reçu du donateur, convention de don, courrier d'engagement",
  fournisseurs: "Devis, bon de livraison, contrat-cadre",
  "cheques-dettes": "Reconnaissance de dette, talon du chèque, échéancier signé",
};

function ko(octets: number): string {
  return `${Math.round(octets / 1024)} Ko`;
}

/**
 * Vérifie qu'un fichier déposé peut servir de justificatif.
 *
 * Les messages nomment la correction à faire : c'est le Trésorier qui les
 * lit, un fichier déjà choisi dans les mains.
 */
export function verifierPiece(fichier: {
  nom?: string;
  type?: string;
  taille: number;
}): { possible: boolean; raison: string | null } {
  if (!(fichier.taille > 0)) {
    return {
      possible: false,
      raison: "Le fichier est vide : rien n'a été déposé.",
    };
  }
  if (fichier.type !== "application/pdf") {
    return {
      possible: false,
      raison:
        "La pièce doit être un PDF — c'est le seul format dont on soit sûr qu'il s'ouvrira intact dans trois ans. Exportez ou scannez le document en PDF.",
    };
  }
  if (fichier.taille > TAILLE_MAX_PIECE) {
    return {
      possible: false,
      raison: `Fichier trop volumineux (${ko(fichier.taille)} pour ${
        TAILLE_MAX_PIECE / 1024 / 1024
      } Mo maximum). Un scan en noir et blanc à 200 ppp suffit largement.`,
    };
  }
  return { possible: true, raison: null };
}

/** Nom de fichier de repli, quand le navigateur n'en transmet pas. */
export function nomDePiece(
  registre: RegistreAvecPieces,
  nomFourni?: string
): string {
  const propre = nomFourni?.trim();
  if (propre) return propre;
  return `justificatif-${registre}.pdf`;
}
