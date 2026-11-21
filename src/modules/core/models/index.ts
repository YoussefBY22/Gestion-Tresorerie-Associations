/**
 * Modèles d'infrastructure, communs à toute l'application.
 *
 * Les entités métier (mandat, utilisateur, membre, client, projet…) vivent
 * dans `modules/base` : elles sont ré-exportées ici pour que le reste du code
 * n'ait pas à savoir où elles ont été rangées.
 */
export {
  MandatModel,
  type Mandat,
  STATUTS_MANDAT,
  UtilisateurModel,
  type Utilisateur,
  MembreModel,
  type Membre,
  STATUTS_MEMBRE,
  ClientModel,
  type Client,
  ProjetModel,
  type Projet,
  CotisationModel,
  type Cotisation,
  AssembleeGeneraleModel,
  type AssembleeGenerale,
  KPIHistoriqueModel,
  type KPIHistorique,
  ROLES,
  type Role,
  LIBELLES_ROLE,
} from "@/modules/base/models";

/** Les 13 processus de la norme — conservés pour la codification des pièces. */
export const PROCESSUS_JE = [
  "MG", "PASS", "SJP", "PAC", "TRS", "DC", "PRJ",
  "MKT", "GRH", "INT", "EVN", "RSE", "ITJE",
] as const;

export const LIBELLES_PROCESSUS: Record<string, string> = {
  MG: "Management général", PASS: "Passation", SJP: "Secrétariat & juridique",
  PAC: "Pilotage & amélioration continue", TRS: "Trésorerie",
  DC: "Développement commercial", PRJ: "Projets", MKT: "Marketing",
  GRH: "Ressources humaines", INT: "International", EVN: "Événementiel",
  RSE: "Responsabilité sociétale", ITJE: "Inter-JE",
};

export { JournalActiviteModel, type JournalActivite } from "./JournalActivite";
export {
  NotificationModel,
  type Notification,
  TYPES_NOTIFICATION,
} from "./Notification";
export {
  ParametreModel,
  type Parametre,
  TYPES_PARAMETRE,
  CATEGORIES_PARAMETRE,
} from "./Parametre";
export {
  ElementCorbeilleModel,
  type ElementCorbeille,
  TYPES_ELEMENT_CORBEILLE,
  LIBELLES_TYPE_CORBEILLE,
  type TypeElementCorbeille,
} from "./ElementCorbeille";
