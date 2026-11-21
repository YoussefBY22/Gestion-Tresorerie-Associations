/**
 * Familles de reçus — logique pure, testée.
 *
 * Deux sources cohabitaient sans jamais se croiser à l'écran : les familles
 * du catalogue documentaire, qui vivent en code (ADR-011 — une référence doit
 * dire la même chose d'un mandat à l'autre), et celles que la JE déclare
 * elle-même. Le Trésorier voyait les premières dans un menu déroulant et les
 * secondes dans une liste, sans pouvoir toucher aux premières.
 *
 * Elles sont désormais présentées ensemble, et toutes se modifient et se
 * suppriment. Ce qui est du catalogue garde son segment de référence — le
 * renommer casserait la numérotation déjà émise — mais son libellé se
 * change : c'est le mot que la JE emploie, pas le nôtre. Une famille déjà
 * utilisée garde aussi son code, quelle que soit son origine : les reçus
 * émis le portent.
 *
 * Une famille supprimée part à la corbeille comme le reste de l'application. Pour une
 * famille de la JE, sa ligne disparaît vraiment ; pour une famille du
 * catalogue, qui vit en code et ne peut pas être effacée du disque, la ligne
 * qui la porte est marquée inactive — dans les deux cas elle sort de la liste
 * et des choix, et se retrouve dans la corbeille pendant trente jours.
 */

import { CATALOGUE_DOCUMENTS } from "@/modules/documents/catalogue";

/**
 * Familles livrées avec l'application, dans l'ordre du catalogue documentaire.
 * Lire le catalogue ici plutôt que de recopier une liste dans la page évite
 * qu'un modèle ajouté au catalogue reste invisible du Trésorier.
 */
export const CATALOGUE_RECUS = CATALOGUE_DOCUMENTS.filter(
  (m) => m.categorie === "RECU" && m.module === "tresorerie" && m.disponible
).map((m) => ({
  code: m.code,
  libelle: m.libelle,
  formatReference: m.formatReference,
  description: m.description,
}));

/** Ce qui distingue une famille livrée avec l'application d'une famille de la JE. */
export type OrigineFamille = "CATALOGUE" | "JE";

export type ModeleCatalogueRecu = {
  code: string;
  libelle: string;
  formatReference: string;
  description?: string;
};

/** Ligne `TypeRecu` : soit une famille de la JE, soit la personnalisation
 *  d'une famille du catalogue (`modele` renseigné). */
export type PersonnalisationFamille = {
  id: string;
  libelle: string;
  code: string;
  actif: boolean;
  /** Code du modèle du catalogue personnalisé ; absent pour une famille JE. */
  modele?: string | null;
};

export type FamilleRecu = {
  /** Valeur passée au sélecteur de nature : code catalogue ou « perso:<id> ». */
  valeur: string;
  libelle: string;
  /** Segment porté par la référence : `RC001-`**`COT`**`-2526`. */
  code: string;
  origine: OrigineFamille;
  /** Ligne `TypeRecu` correspondante, si elle existe déjà. */
  typeRecuId?: string;
  /** Faux dès qu'un numéro a été attribué dans cette famille. */
  codeModifiable: boolean;
  /**
   * Numéros déjà attribués dans cette série, tous mandats confondus.
   *
   * C'est un compteur, pas un inventaire : il ne redescend jamais, même quand
   * les reçus correspondants ont été supprimés et la corbeille vidée. C'est
   * précisément ce qui garantit qu'un `RC001-COT-2627` ne sera jamais émis
   * deux fois — mais il ne faut donc pas le lire comme « des reçus existent ».
   */
  numerosAttribues: number;
  /** Ce que la famille numérote, pour l'expliquer sans ouvrir le catalogue. */
  description?: string;
};

/**
 * Segment de référence d'un modèle : `RC{seq:3}-COT-{mandat}` → `COT`.
 * `repli` sert aux formats qui ne suivent pas cette forme.
 */
export function segmentReference(formatReference: string, repli = ""): string {
  const trouve = formatReference.match(/\}-([A-Za-z]+)-\{/);
  return trouve ? trouve[1].toUpperCase() : repli;
}

/**
 * Clé de compteur d'une famille, sans le mandat.
 * Le catalogue numérote sous son propre code ; une famille de la JE emprunte
 * le gabarit du reçu divers mais garde sa série (`RECU_DIVERS:TOMBOLA`).
 */
export function prefixeCompteur(famille: {
  origine: OrigineFamille;
  code: string;
  valeur: string;
}): string {
  return famille.origine === "CATALOGUE"
    ? famille.valeur
    : `RECU_DIVERS:${famille.code}`;
}

/**
 * Famille à laquelle appartient une clé de compteur, mandat retiré.
 * `RECU_COTISATION:2526` → `RECU_COTISATION` ;
 * `RECU_DIVERS:TOMBOLA:2526` → `RECU_DIVERS:TOMBOLA`.
 */
export function familleDeLaCle(cle: string): string | null {
  const morceaux = cle.split(":");
  if (morceaux.length === 2) return morceaux[0];
  if (morceaux.length === 3) return `${morceaux[0]}:${morceaux[1]}`;
  return null;
}

export type CompteurSerie = { cle: string; valeur: number };

/**
 * Numéros attribués par famille, tous mandats additionnés.
 *
 * Les compteurs sont tenus par (modèle, mandat) : une même famille en a un
 * par mandat, et c'est leur somme qui dit combien de numéros la série a
 * consommés depuis toujours.
 */
export function numerosParFamille(
  compteurs: CompteurSerie[]
): Map<string, number> {
  const parFamille = new Map<string, number>();
  for (const compteur of compteurs) {
    const famille = familleDeLaCle(compteur.cle);
    if (!famille) continue;
    parFamille.set(famille, (parFamille.get(famille) ?? 0) + compteur.valeur);
  }
  return parFamille;
}

/**
 * Compose la liste unique présentée au Trésorier : le catalogue d'abord, dans
 * son ordre, puis les familles de la JE par ordre alphabétique.
 *
 * Les familles supprimées n'y figurent pas — elles sont dans la corbeille.
 */
export function composerFamilles(params: {
  catalogue: ModeleCatalogueRecu[];
  personnalisations: PersonnalisationFamille[];
  compteurs: CompteurSerie[];
}): FamilleRecu[] {
  const numeros = numerosParFamille(params.compteurs);
  const parModele = new Map(
    params.personnalisations
      .filter((p) => p.modele)
      .map((p) => [p.modele as string, p])
  );

  const duCatalogue: FamilleRecu[] = params.catalogue
    // Une famille du catalogue supprimée garde sa ligne — on ne peut pas
    // effacer du code — mais elle est sortie de la liste.
    .filter((modele) => parModele.get(modele.code)?.actif !== false)
    .map((modele) => {
      const perso = parModele.get(modele.code);
      return {
        valeur: modele.code,
        libelle: perso?.libelle ?? modele.libelle,
        code: segmentReference(modele.formatReference, modele.code),
        origine: "CATALOGUE",
        typeRecuId: perso?.id,
        // Le catalogue vit en code : son segment ne se renomme jamais.
        codeModifiable: false,
        numerosAttribues: numeros.get(modele.code) ?? 0,
        description: modele.description,
      };
    });

  const deLaJe: FamilleRecu[] = params.personnalisations
    .filter((p) => !p.modele && p.actif)
    .map((p) => {
      const attribues = numeros.get(`RECU_DIVERS:${p.code}`) ?? 0;
      return {
        valeur: `perso:${p.id}`,
        libelle: p.libelle,
        code: p.code,
        origine: "JE" as const,
        typeRecuId: p.id,
        // Le code entre dans la référence : dès qu'un numéro est attribué, le
        // changer ferait deux séries qui prétendent être la même.
        codeModifiable: attribues === 0,
        numerosAttribues: attribues,
      };
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));

  return [...duCatalogue, ...deLaJe];
}
