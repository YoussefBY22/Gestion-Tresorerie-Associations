/**
 * Registre des modules de l'application — ADR-007.
 *
 * Le **catalogue** de ce qui existe est défini ici, en code (versionné, revu
 * en PR, typé) ; l'**état d'activation** de chaque module, lui, vit en base
 * (collection `parametres`) et se pilote depuis `/admin/parametrage` sans
 * redéploiement — principe des ERP type Odoo.
 *
 * Un module désactivé disparaît de la navigation ET devient inaccessible en
 * direct (garde `exigerModuleActif()` côté serveur) : la désactivation n'est
 * pas cosmétique.
 *
 * Logique pure et isomorphe (pas d'import serveur) : utilisable dans la
 * sidebar client comme dans les gardes serveur, testable sans base.
 */

import type { ModuleCode } from "./rbac";

/** Regroupement dans la navigation. */
export type SectionNav = "general" | "metier" | "administration" | "developpement";

export type DefinitionModule = {
  code: ModuleCode;
  libelle: string;
  description: string;
  /** Racine de navigation ; absent = module catalogué mais pas encore livré. */
  href?: string;
  /** Nom d'icône lucide-react, résolu par la sidebar (client). */
  icone: string;
  section: SectionNav;
  /**
   * Modules socles : l'application n'a plus de sens sans eux (on ne peut pas se
   * verrouiller dehors en coupant l'administration).
   */
  desactivable: boolean;
  /** Sprint de livraison prévu, pour les modules pas encore développés. */
  sprint?: string;
};

export const MODULES_REGISTRE: DefinitionModule[] = [
  /* ---------------------------------------------------------------- */
  /* Général                                                           */
  /* ---------------------------------------------------------------- */
  {
    code: "documents",
    libelle: "Documents",
    description:
      "Génération, numérotation et archivage des pièces — stockage interne, aucun service de fichiers externe.",
    href: "/documents",
    icone: "FolderOpen",
    section: "general",
    desactivable: true,
  },


  /* ---------------------------------------------------------------- */
  /* Métier                                                            */
  /* ---------------------------------------------------------------- */
  {
    code: "tresorerie",
    libelle: "Trésorerie",
    description:
      "Flux, factures, fiscalité, inventaire physique et pilotage financier.",
    href: "/tresorerie",
    icone: "Wallet",
    section: "metier",
    desactivable: true,
  },

  /* ---------------------------------------------------------------- */
  /* Administration — socle non désactivable                           */
  /* ---------------------------------------------------------------- */
  {
    code: "administration",
    libelle: "Administration",
    description:
      "Comptes, rôles, exercices et paramétrage de l'application.",
    href: "/admin/utilisateurs",
    icone: "Settings",
    section: "administration",
    desactivable: false,
  },
  {
    code: "journal",
    libelle: "Journal d'activité",
    description: "Piste d'audit append-only de toutes les mutations (ADR-003).",
    href: "/journal",
    icone: "ScrollText",
    section: "administration",
    desactivable: false,
  },
];

/** Accès indexé par code. */
export const MODULES_PAR_CODE: Record<string, DefinitionModule> =
  Object.fromEntries(MODULES_REGISTRE.map((m) => [m.code, m]));

/** Modules que l'on a le droit de couper depuis le paramétrage. */
export const MODULES_DESACTIVABLES = MODULES_REGISTRE.filter(
  (m) => m.desactivable
);

/** Libellés des sections de navigation. */
export const LIBELLES_SECTION: Record<SectionNav, string> = {
  general: "Général",
  metier: "Modules",
  administration: "Administration",
  developpement: "Développement",
};

/** Clé de paramètre portant l'activation d'un module. */
export function cleActivation(code: ModuleCode): string {
  return `module.${code}.actif`;
}
