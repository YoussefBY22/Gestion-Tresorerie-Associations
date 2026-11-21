/**
 * Droits d'accès — trois rôles, cinq espaces.
 *
 * L'ERP d'origine comptait quatorze rôles et dix-huit modules, parce qu'il
 * couvrait toute une Junior Entreprise. Ici l'application ne fait qu'une
 * chose, et la distribution des droits doit rester compréhensible par un
 * bureau associatif qui change tous les ans.
 *
 * La règle de fond est conservée : **la lecture est large, l'écriture est
 * cloisonnée.** Un président doit pouvoir tout consulter sans rien pouvoir
 * modifier — c'est exactement le rôle « Lecteur ».
 *
 * La matrice est définie **en code**, et non en base : versionnée, relue, et
 * hors de portée d'une modification accidentelle en production. Les comptes
 * reçoivent des rôles ; les permissions d'un rôle ne changent qu'ici.
 *
 * Logique pure, donc testable sans base de données.
 */

export const MODULES = [
  "tresorerie",
  "documents",
  "administration",
  "journal",
  "corbeille",
] as const;
export type ModuleCode = (typeof MODULES)[number];

export const LIBELLES_MODULE: Record<ModuleCode, string> = {
  tresorerie: "Trésorerie",
  documents: "Documents",
  administration: "Administration",
  journal: "Journal d'activité",
  corbeille: "Corbeille",
};

export const ACTIONS = ["lire", "ecrire", "valider"] as const;
export type ActionCode = (typeof ACTIONS)[number];

export type Permission =
  | "*"
  | `*:${ActionCode}`
  | `${ModuleCode}:*`
  | `${ModuleCode}:${ActionCode}`;

export type DefinitionRole = {
  libelle: string;
  description: string;
  permissions: Permission[];
};

export const ROLES: Record<string, DefinitionRole> = {
  ADMIN: {
    libelle: "Administrateur",
    description:
      "Gère les comptes, le paramétrage et l'ensemble de la trésorerie.",
    permissions: ["*"],
  },
  TRESORIER: {
    libelle: "Trésorier",
    description:
      "Tient les comptes : encaissements, dépenses, pièces, registres et déclarations.",
    permissions: ["tresorerie:*", "documents:*", "corbeille:*", "journal:lire"],
  },
  LECTEUR: {
    libelle: "Lecteur",
    description:
      "Consulte sans rien modifier — président, commissaire aux comptes, vérificateur.",
    permissions: ["*:lire"],
  },
};

/**
 * Module qu'une permission large « tout lire » n'ouvre **pas**.
 *
 * Sans cette réserve, un lecteur verrait l'administration des comptes : la
 * simple lecture y est déjà une information sensible.
 */
const MODULES_SENSIBLES: readonly ModuleCode[] = ["administration"];

/** Vérifie qu'un ensemble de rôles accorde `module:action`. */
export function can(
  roles: string[] | undefined,
  module: ModuleCode,
  action: ActionCode
): boolean {
  if (!roles?.length) return false;
  const sensible = MODULES_SENSIBLES.includes(module);
  for (const role of roles) {
    const def = ROLES[role];
    if (!def) continue; // rôle inconnu → ignoré : on ferme, on n'ouvre pas
    for (const perm of def.permissions) {
      if (
        perm === "*" ||
        perm === `${module}:*` ||
        perm === `${module}:${action}` ||
        (perm === `*:${action}` && !sensible)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Rôles proposés dans l'écran d'administration des comptes. */
export function rolesAttribuables(): {
  code: string;
  libelle: string;
  description: string;
}[] {
  return Object.entries(ROLES).map(([code, def]) => ({
    code,
    libelle: def.libelle,
    description: def.description,
  }));
}
