/**
 * Énumérations et libellés du socle — **sans Mongoose**.
 *
 * Pourquoi un fichier à part plutôt que les laisser dans les modèles : un
 * composant client qui importe un fichier de modèle tire Mongoose entier
 * dans le bundle du navigateur, et la page tombe sur
 * `Can't resolve 'async_hooks'`. L'erreur est franche, mais elle n'arrive
 * qu'à l'exécution de cette page-là — autant ne pas pouvoir la commettre.
 *
 * Les modèles importent ces valeurs ; les écrans aussi. Il n'y a donc qu'une
 * liste, et un statut ajouté sans son libellé se verrait tout de suite.
 */

export const TYPES_PROJET = ["PRESTATION", "EVENEMENT", "INTERNE"] as const;
export type TypeProjet = (typeof TYPES_PROJET)[number];

export const STATUTS_PROJET = [
  "EN_COURS",
  "LIVRE",
  "CLOS",
  "ANNULE",
] as const;
export type StatutProjet = (typeof STATUTS_PROJET)[number];

export const LIBELLES_TYPE_PROJET: Record<string, string> = {
  PRESTATION: "Prestation",
  EVENEMENT: "Événement",
  INTERNE: "Interne",
};

export const LIBELLES_STATUT_PROJET: Record<string, string> = {
  EN_COURS: "En cours",
  LIVRE: "Livré",
  CLOS: "Clos",
  ANNULE: "Annulé",
};
