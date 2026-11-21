/**
 * Socle de l'application de trésorerie.
 *
 * L'ERP dont cette application est issue répartissait ces entités entre six
 * modules : le mandat et l'utilisateur au socle, le client au CRM, le projet
 * au module Projets, la cotisation aux RH, l'assemblée générale au
 * secrétariat. Ici la trésorerie est seule : elle porte donc le strict
 * minimum dont elle a besoin, et rien de plus.
 *
 * **Règle de cadrage.** Chaque entité n'existe que parce que la trésorerie la
 * lit. On ne réimporte pas un module entier pour un champ : un projet n'a ici
 * ni sprint ni jalon, un membre ni compétence ni évaluation. Si l'application
 * doit un jour gérer les projets ou les ressources humaines, ce sera une
 * décision à prendre, pas un héritage subi.
 *
 * Un fichier par modèle, comme partout ailleurs dans le dépôt : les contrats
 * de `tests/contrats` n'inspectent pas les fichiers d'index, et des modèles
 * qu'aucun contrat ne vérifie dérivent en silence.
 */

export * from "./Mandat";
export * from "./Utilisateur";
export * from "./Membre";
export * from "./Client";
export * from "./Projet";
export * from "./Cotisation";
export * from "./AssembleeGenerale";
export * from "./KPIHistorique";
