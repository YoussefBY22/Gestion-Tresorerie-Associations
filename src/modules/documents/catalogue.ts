/**
 * Catalogue des modèles de documents — ADR-011.
 *
 * Même principe que le registre des modules (ADR-007) et que la matrice RBAC
 * (ADR-002) : le **catalogue** vit en code (versionné, typé, revu) ; seules les
 * **instances émises** vivent en base. Un modèle n'est donc jamais « créé » par
 * un utilisateur, ce qui garantit qu'une référence `RC001-COT-2526` a la même
 * signification d'un mandat à l'autre.
 *
 * Le contenu de ce catalogue est repris du registre des templates du drive de
 * la JE (`S1-REGS-[Registre des templates].xlsx`, ~110 modèles classés par
 * processus). Les modèles non encore implémentés y figurent avec
 * `disponible: false` : le catalogue est aussi la feuille de route de la
 * sortie du drive, visible dans l'application.
 */

import type { ModuleCode } from "@/modules/core/rbac";
import type { CategorieDocument } from "./constantes";

export type DefinitionModeleDocument = {
  /** Identifiant stable, utilisé comme discriminant du gabarit. */
  code: string;
  libelle: string;
  description: string;
  categorie: CategorieDocument;
  /** Module porteur : c'est lui qui donne la permission d'émettre (RBAC). */
  module: ModuleCode;
  /** Gabarit de référence — voir `services/numerotation.ts`. */
  formatReference: string;
  /** Processus CTJE couverts, pour la traçabilité d'audit. */
  /** Faux tant que le gabarit n'est pas écrit : le modèle est alors annoncé. */
  disponible: boolean;
  /** Ce que le modèle remplace concrètement sur le drive. */
  remplace?: string;
};

export const CATALOGUE_DOCUMENTS: DefinitionModeleDocument[] = [
  /* ---------------------------------------------------------------- */
  /* Trésorerie                                                        */
  /* ---------------------------------------------------------------- */
  {
    code: "RECU_COTISATION",
    libelle: "Reçu de cotisation",
    description:
      "Reçu remis à un membre, un sénior ou un alumni pour sa cotisation du mandat.",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-COT-{mandat}",
    disponible: true,
    remplace: "~70 fichiers RC0xx-COT-24-25.pptx par mandat",
  },
  {
    code: "RECU_DON",
    libelle: "Reçu de don",
    description:
      "Reçu de don, pièce du registre des dons exigé par le décret-loi 2011-88.",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-DON-{mandat}",
    disponible: true,
    remplace: "RC0xx-DON-24-25.pptx",
  },
  {
    code: "RECU_PRODUIT",
    libelle: "Reçu de vente de produit",
    description: "Reçu de vente des produits dérivés (collections hiver / été).",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-PR-{mandat}",
    disponible: true,
    remplace: "~73 fichiers RC0xx-PR-24-25.pptx",
  },
  {
    code: "RECU_JOB",
    libelle: "Reçu de participation job",
    description: "Reçu de participation à un job étudiant encadré par la JE.",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-JOBS-{mandat}",
    disponible: true,
    remplace: "~54 fichiers RC0xx-JOBS-24-25.pptx",
  },
  {
    code: "RECU_INTEGRATION",
    libelle: "Reçu d'intégration",
    description: "Reçu de participation à une journée d'intégration.",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-INT-{mandat}",
    disponible: true,
    remplace: "~52 fichiers RC0xx-INT-24-25.pptx",
  },
  {
    code: "RECU_DIVERS",
    libelle: "Reçu d'encaissement divers",
    description:
      "Reçu pour tout encaissement ne relevant pas d'une famille dédiée (JeBex, remboursement, participation ponctuelle).",
    categorie: "RECU",
    module: "tresorerie",
    formatReference: "RC{seq:3}-DIV-{mandat}",
    disponible: true,
    remplace: "RC0xx-JEBEX-24-25.pptx et reçus manuscrits",
  },
  {
    code: "BUDGET_PREVISIONNEL",
    libelle: "Budget prévisionnel du mandat",
    description:
      "Postes de charges et de recettes chiffrés mois par mois, sous-totaux, bilan mensuel et solde de trésorerie budgétaire cumulé.",
    categorie: "RAPPORT",
    module: "tresorerie",
    formatReference: "BUDG-{seq:2}-{mandat}",
    disponible: true,
    remplace: "Budget Previsionnel.pdf",
  },
  {
    code: "RAPPORT_SYNTHESE_TRESORERIE",
    libelle: "Rapport de synthèse trésorerie",
    description:
      "Synthèse sur une ou plusieurs périodes choisies (jusqu'au mandat entier) : réalisé contre budget, répartitions, comparaison au mandat précédent, points forts et de vigilance.",
    categorie: "RAPPORT",
    module: "tresorerie",
    formatReference: "RAPS-{seq:2}-{mandat}",
    disponible: true,
    remplace: "Feuilles Generateur Rapport Mensuel et Generateur Rapport Annuel",
  },
  {
    code: "FACTURE_CLIENT",
    libelle: "Facture client",
    description: "Facture émise à un client, avec TVA, timbre fiscal et RAS.",
    categorie: "FACTURE",
    module: "tresorerie",
    formatReference: "FE{seq:3}-{mandat}",
    disponible: true,
    remplace: "FE0xx-<client>.xlsx",
  },
  {
    code: "DEVIS_CLIENT",
    libelle: "Devis client",
    description:
      "Chiffrage remis au client avant engagement, valable un temps donné et transformable en facture.",
    categorie: "FACTURE",
    module: "tresorerie",
    formatReference: "DV{seq:3}-{mandat}",
    disponible: true,
    remplace: "Devis Word repris d'un mandat à l'autre",
  },
  {
    code: "BON_COMMANDE",
    libelle: "Bon de commande",
    description:
      "Commande passée à un fournisseur, pièce d'engagement de la dépense avant réception.",
    categorie: "FACTURE",
    module: "tresorerie",
    formatReference: "BC{seq:3}-{mandat}",
    disponible: true,
  },
  {
    code: "FACTURE_AVOIR",
    libelle: "Facture d'avoir",
    description:
      "Annule ou réduit une facture déjà émise ; la facture d'origine reste, l'avoir la corrige.",
    categorie: "FACTURE",
    module: "tresorerie",
    formatReference: "AV{seq:3}-{mandat}",
    disponible: true,
  },
  {
    code: "CERTIFICAT_RAS",
    libelle: "Certificat de retenue à la source",
    description:
      "Certificat de RAS remis au prestataire, avec le taux applicable à son régime.",
    categorie: "ATTESTATION",
    module: "tresorerie",
    formatReference: "RAS-{seq:3}-{mandat}",
    disponible: true,
    remplace: "RAS-0xx-24-25.pptx",
  },
  {
    code: "DECLARATION_MENSUELLE",
    libelle: "Déclaration fiscale mensuelle",
    description:
      "TVA collectée et déductible, timbres, retenue à la source et report du mois précédent.",
    categorie: "ATTESTATION",
    module: "tresorerie",
    formatReference: "DECL-{mois}-{mandat}",
    disponible: true,
    remplace: "12 classeurs OTMT-xx-24-25.xlsx par mandat",
  },
  {
    code: "RAPPORT_FINANCIER_MENSUEL",
    libelle: "Rapport financier mensuel",
    description:
      "Transactions du mois, suivi budgétaire et récapitulatif caisse / compte.",
    categorie: "RAPPORT",
    module: "tresorerie",
    formatReference: "RAPM-{mois}-{mandat}",
    disponible: true,
    remplace: "S2-RAPM-0x-24-25.xlsx",
  },

  /* ---------------------------------------------------------------- */
  /* Projets                                                           */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /* Développement commercial                                          */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /* Secrétariat général                                               */
  /* ---------------------------------------------------------------- */
  {
    code: "ATTESTATION_MEMBRE",
    libelle: "Attestation d'appartenance",
    description:
      "Attestation qu'un membre appartient à la JE pour le mandat en cours.",
    categorie: "ATTESTATION",
    module: "tresorerie",
    formatReference: "ATT-{seq:3}-{mandat}",
    disponible: false,
  },

  /* ---------------------------------------------------------------- */
  /* Ressources humaines                                               */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /* Qualité & management                                              */
  /* ---------------------------------------------------------------- */
];

export const MODELES_PAR_CODE: Record<string, DefinitionModeleDocument> =
  Object.fromEntries(CATALOGUE_DOCUMENTS.map((m) => [m.code, m]));

/** Modèles réellement émettables aujourd'hui. */
export const MODELES_DISPONIBLES = CATALOGUE_DOCUMENTS.filter(
  (m) => m.disponible
);

export function modeleRequis(code: string): DefinitionModeleDocument {
  const modele = MODELES_PAR_CODE[code];
  if (!modele) throw new Error(`Modèle de document inconnu : « ${code} ».`);
  return modele;
}
