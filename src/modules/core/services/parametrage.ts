import { cache } from "react";
import { COULEUR_PRIMAIRE_DEFAUT } from "@/modules/core/apparence";
import { connectDb } from "@/lib/db";
import { ParametreModel } from "@/modules/core/models/Parametre";
import {
  MODULES_REGISTRE,
  cleActivation,
  type DefinitionModule,
} from "@/modules/core/modules-registry";
import type { ModuleCode } from "@/modules/core/rbac";

/**
 * Service de paramétrage — ADR-007.
 *
 * Règle de résolution d'une valeur :
 *   valeur en base  →  sinon défaut du catalogue  →  sinon `undefined`.
 *
 * Conséquence voulue : ajouter un paramètre = ajouter une ligne au catalogue
 * ci-dessous, sans script de migration. Et si MongoDB est injoignable, on
 * retombe sur les défauts : l'application reste navigable (convention du projet).
 */

export type TypeParametre = "BOOLEEN" | "TEXTE" | "NOMBRE" | "JSON";
export type CategorieParametre =
  | "MODULES"
  | "GENERAL"
  | "APPARENCE"
  | "INTEGRATIONS"
  | "METIER";

export type DefinitionParametre = {
  cle: string;
  libelle: string;
  description?: string;
  type: TypeParametre;
  categorie: CategorieParametre;
  defaut: unknown;
  /** Valeurs autorisées pour les paramètres à choix fermé. */
  options?: { valeur: string; libelle: string }[];
};

/* ------------------------------------------------------------------ */
/* Catalogue des paramètres                                            */
/* ------------------------------------------------------------------ */

const PARAMETRES_METIER: DefinitionParametre[] = [
  {
    cle: "general.nomStructure",
    libelle: "Nom de la structure",
    description: "Affiché dans l'en-tête, les exports et les documents générés.",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "Mon association",
  },
  {
    cle: "general.sloganStructure",
    libelle: "Slogan",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "general.adresseStructure",
    libelle: "Adresse de la structure",
    description:
      "Figure sur les documents émis (factures, reçus, certificats) via le jeton {{adresseJE}}.",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "general.matriculeFiscal",
    libelle: "Matricule fiscal",
    description:
      "Obligatoire sur une facture tunisienne. Figure via le jeton {{matriculeFiscal}}.",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "general.emailContact",
    libelle: "E-mail de contact",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "general.telephoneContact",
    libelle: "Téléphone de contact",
    description:
      "Format international sans espaces (ex. +21612345678) — utilisé par les liens WhatsApp.",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "general.urlPublique",
    libelle: "Adresse publique de l'application",
    description:
      "Base des liens partagés à l'extérieur (enquêtes, appels à candidatures). Sans elle, un lien copié pointerait vers localhost.",
    type: "TEXTE",
    categorie: "GENERAL",
    defaut: "",
  },
  {
    cle: "apparence.couleurPrimaire",
    libelle: "Couleur principale",
    description:
      "Couleur de la structure, en hexadécimal (ex. #2c4a7c). Elle habille les boutons, les liens et la barre latérale, et sert de couleur par défaut aux documents émis. Le thème sombre l'éclaircit automatiquement.",
    type: "TEXTE",
    categorie: "APPARENCE",
    defaut: COULEUR_PRIMAIRE_DEFAUT,
  },
  {
    cle: "apparence.themeDefaut",
    libelle: "Thème par défaut",
    description:
      "Thème appliqué aux personnes qui n'ont pas encore fait de choix.",
    type: "TEXTE",
    categorie: "APPARENCE",
    defaut: "systeme",
    options: [
      { valeur: "clair", libelle: "Clair" },
      { valeur: "sombre", libelle: "Sombre" },
      { valeur: "systeme", libelle: "Selon le système" },
    ],
  },
  {
    cle: "apparence.themeVerrouille",
    libelle: "Verrouiller le thème",
    description:
      "Empêche les membres de changer de thème ; le thème par défaut s'impose.",
    type: "BOOLEEN",
    categorie: "APPARENCE",
    defaut: false,
  },
  {
    cle: "integrations.whatsapp.actif",
    libelle: "Raccourcis WhatsApp",
    description:
      "Affiche un bouton « Contacter sur WhatsApp » sur les fiches client, partenaire et cible internationale.",
    type: "BOOLEEN",
    categorie: "INTEGRATIONS",
    defaut: true,
  },
  {
    cle: "integrations.whatsapp.modeleMessage",
    libelle: "Message WhatsApp pré-rempli",
    description:
      "Variables disponibles : {contact}, {organisation}, {structure}, {expediteur}.",
    type: "TEXTE",
    categorie: "INTEGRATIONS",
    defaut:
      "Bonjour {contact}, je suis {expediteur} de {structure}. Je me permets de vous contacter au sujet de notre collaboration.",
  },
  {
    cle: "integrations.mailto.actif",
    libelle: "Raccourcis e-mail",
    description:
      "Affiche un bouton « Écrire un e-mail » avec objet et corps pré-remplis.",
    type: "BOOLEEN",
    categorie: "INTEGRATIONS",
    defaut: true,
  },
  {
    cle: "metier.relanceProspectJours",
    libelle: "Délai de relance d'un prospect (jours)",
    description:
      "Au-delà de ce délai sans interaction, le prospect est signalé comme à relancer.",
    type: "NOMBRE",
    categorie: "METIER",
    defaut: 14,
  },
  {
    cle: "metier.capaciteHebdoJH",
    libelle: "Capacité hebdomadaire d'un membre (jours/homme)",
    description:
      "Base du calcul de charge des projets. Un membre de JE est un étudiant bénévole : une journée et demie de travail effectif par semaine est l'ordre de grandeur retenu.",
    type: "NOMBRE",
    categorie: "METIER",
    defaut: 1.5,
  },
  {
    cle: "metier.seuilSatisfactionClient",
    libelle: "Seuil de satisfaction client (%)",
    description:
      "En dessous de ce seuil, la satisfaction est signalée en alerte (objectif du mandat : 93 %).",
    type: "NOMBRE",
    categorie: "METIER",
    defaut: 93,
  },
  {
    cle: "metier.frequenceRapportFinancier",
    libelle: "Fréquence des rapports financiers",
    description:
      "Recommandation de l'audit financier 2025-2026 (§7.5) : adapter la périodicité au niveau réel d'activité.",
    type: "TEXTE",
    categorie: "METIER",
    defaut: "TRIMESTRIELLE",
    options: [
      { valeur: "MENSUELLE", libelle: "Mensuelle" },
      { valeur: "TRIMESTRIELLE", libelle: "Trimestrielle" },
      { valeur: "SEMESTRIELLE", libelle: "Semestrielle" },
    ],
  },
];

/** Un paramètre d'activation par module désactivable, généré depuis le registre. */
const PARAMETRES_MODULES: DefinitionParametre[] = MODULES_REGISTRE.filter(
  (m) => m.desactivable
).map((m) => ({
  cle: cleActivation(m.code),
  libelle: m.libelle,
  description: m.description,
  type: "BOOLEEN" as const,
  categorie: "MODULES" as const,
  // Un module pas encore livré est catalogué mais inactif par défaut.
  defaut: Boolean(m.href),
}));

export const PARAMETRES_PAR_DEFAUT: DefinitionParametre[] = [
  ...PARAMETRES_MODULES,
  ...PARAMETRES_METIER,
];

const CATALOGUE_PAR_CLE = new Map(
  PARAMETRES_PAR_DEFAUT.map((p) => [p.cle, p])
);

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

/**
 * Toutes les valeurs surchargées en base, mémoïsées le temps d'une requête
 * (`cache` de React) : la sidebar, le layout et les gardes partagent une
 * seule lecture Mongo.
 */
const chargerSurcharges = cache(async (): Promise<Map<string, unknown>> => {
  try {
    await connectDb();
    const lignes = await ParametreModel.find({}, { cle: 1, valeur: 1 }).lean();
    return new Map(lignes.map((l) => [l.cle, l.valeur]));
  } catch {
    // Base injoignable → on tourne sur les défauts du catalogue.
    return new Map();
  }
});

/** Valeur effective d'un paramètre (base, sinon défaut du catalogue). */
export async function getParametre<T = unknown>(cle: string): Promise<T> {
  const surcharges = await chargerSurcharges();
  if (surcharges.has(cle)) return surcharges.get(cle) as T;
  return CATALOGUE_PAR_CLE.get(cle)?.defaut as T;
}

/** Variante booléenne, tolérante aux valeurs stockées en texte. */
export async function getParametreBooleen(cle: string): Promise<boolean> {
  const v = await getParametre(cle);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return Boolean(v);
}

/** Catalogue complet enrichi de la valeur effective — pour l'écran d'admin. */
export async function listerParametres(): Promise<
  (DefinitionParametre & { valeur: unknown; surcharge: boolean })[]
> {
  const surcharges = await chargerSurcharges();
  return PARAMETRES_PAR_DEFAUT.map((p) => ({
    ...p,
    valeur: surcharges.has(p.cle) ? surcharges.get(p.cle) : p.defaut,
    surcharge: surcharges.has(p.cle),
  }));
}

/* ------------------------------------------------------------------ */
/* Activation des modules                                              */
/* ------------------------------------------------------------------ */

/** Un module socle (`desactivable: false`) est toujours actif. */
export async function estModuleActif(code: ModuleCode): Promise<boolean> {
  const def = MODULES_REGISTRE.find((m) => m.code === code);
  if (!def) return false;
  if (!def.desactivable) return true;
  return getParametreBooleen(cleActivation(code));
}

/** Codes des modules actuellement actifs. */
export async function listerModulesActifs(): Promise<ModuleCode[]> {
  const surcharges = await chargerSurcharges();
  return MODULES_REGISTRE.filter((m) => {
    if (!m.desactivable) return true;
    const cle = cleActivation(m.code);
    const v = surcharges.has(cle)
      ? surcharges.get(cle)
      : CATALOGUE_PAR_CLE.get(cle)?.defaut;
    return v === true || v === "true";
  }).map((m) => m.code);
}

/** Registre enrichi de l'état d'activation — pour la sidebar et l'admin. */
export async function listerModulesAvecEtat(): Promise<
  (DefinitionModule & { actif: boolean })[]
> {
  const actifs = new Set(await listerModulesActifs());
  return MODULES_REGISTRE.map((m) => ({ ...m, actif: actifs.has(m.code) }));
}
