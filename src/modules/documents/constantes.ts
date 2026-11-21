/**
 * Constantes du module Documents — sans Mongoose, donc importables depuis un
 * composant client (ADR-009 : les tables clientes ne doivent jamais tirer un
 * barrel de modèles, sinon `mongodb` finit dans le bundle navigateur).
 */

export const STATUTS_DOCUMENT = [
  "BROUILLON",
  "EMIS",
  "A_SIGNER",
  "SIGNE",
  "ANNULE",
] as const;
export type StatutDocument = (typeof STATUTS_DOCUMENT)[number];

export const LIBELLES_STATUT_DOCUMENT: Record<StatutDocument, string> = {
  BROUILLON: "Brouillon",
  EMIS: "Émis",
  A_SIGNER: "À signer",
  SIGNE: "Signé",
  ANNULE: "Annulé",
};

/**
 * Familles documentaires observées sur le drive de la JE (registre des
 * templates, ~110 modèles répartis par processus).
 */
export const CATEGORIES_DOCUMENT = [
  "RECU",
  "FACTURE",
  "CONTRAT",
  "PV",
  "FICHE",
  "RAPPORT",
  "ATTESTATION",
  "COURRIER",
  "ENQUETE",
] as const;
export type CategorieDocument = (typeof CATEGORIES_DOCUMENT)[number];

export const LIBELLES_CATEGORIE_DOCUMENT: Record<CategorieDocument, string> = {
  RECU: "Reçu",
  FACTURE: "Facture & devis",
  CONTRAT: "Contrat & convention",
  PV: "Procès-verbal",
  FICHE: "Fiche",
  RAPPORT: "Rapport",
  ATTESTATION: "Attestation & certificat",
  COURRIER: "Courrier",
  ENQUETE: "Enquête",
};
