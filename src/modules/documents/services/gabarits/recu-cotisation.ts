import {
  formaterDate,
  formaterMontantDT,
  montantEnLettres,
  type StructureDocument,
} from "../structure";

/**
 * Gabarit du reçu de cotisation — le modèle du drive (`RC0xx-COT-24-25.pptx`),
 * rejoué comme une fonction pure : mêmes mentions, mêmes rubriques, mais
 * alimenté par la cotisation enregistrée dans l'application.
 */

export type DonneesRecuCotisation = {
  reference: string;
  /** Nom du membre tel qu'au moment de l'émission (instantané). */
  membre: string;
  /**
   * Numéro de CIN du cotisant. L'audit le relevait comme manquant sur les
   * reçus : c'est ce qui rattache le paiement à une personne identifiée
   * plutôt qu'à un homonyme.
   */
  cin?: string;
  email?: string;
  /** Qualité du cotisant : Membre, Sénior, Bureau exécutif, Alumni… */
  qualite?: string;
  departement?: string;
  poste?: string;
  montant: number;
  /** Espèces, virement, chèque… */
  modePaiement?: string;
  datePaiement: Date;
  /** Année du mandat telle que stockée (« 2025-2026 »). */
  mandat: string;
  /** Nom du trésorier ou de l'émetteur, pour la case de signature. */
  emetteur?: string;
  /** Reçu réédité ou annulé : on le marque en filigrane. */
  filigrane?: string;
};

export function construireRecuCotisation(
  d: DonneesRecuCotisation
): StructureDocument {
  return {
    titre: "Reçu de cotisation",
    sousTitre: `Mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.datePaiement),
    filigrane: d.filigrane,
    mentionPied:
      "Reçu non soumis à la TVA — cotisation associative (décret-loi n° 2011-88)",
    blocs: [
      {
        type: "paragraphe",
        texte:
          "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous au titre de la cotisation annuelle du membre désigné.",
      },
      { type: "section", titre: "Cotisant" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Nom et prénom", valeur: d.membre },
          ...(d.cin ? [{ label: "CIN", valeur: d.cin }] : []),
          { label: "Qualité", valeur: d.qualite ?? "Membre" },
          ...(d.departement
            ? [{ label: "Département", valeur: d.departement }]
            : []),
          ...(d.poste ? [{ label: "Poste", valeur: d.poste }] : []),
          ...(d.email ? [{ label: "Adresse e-mail", valeur: d.email }] : []),
        ],
      },
      { type: "section", titre: "Paiement" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Date de paiement", valeur: formaterDate(d.datePaiement) },
          { label: "Mode de paiement", valeur: d.modePaiement ?? "Espèces" },
          { label: "Objet", valeur: `Cotisation annuelle ${d.mandat}` },
          { label: "Référence du reçu", valeur: d.reference },
        ],
      },
      {
        type: "total",
        items: [{ label: "Montant reçu", valeur: formaterMontantDT(d.montant), fort: true }],
      },
      {
        type: "encadre",
        titre: "Somme arrêtée à",
        texte: `${majusculeInitiale(montantEnLettres(d.montant))}.`,
      },
      { type: "espace", hauteur: 10 },
      {
        type: "signatures",
        cases: [
          { role: "Le cotisant", nom: d.membre },
          { role: "Le Trésorier", nom: d.emetteur },
        ],
      },
    ],
  };
}

function majusculeInitiale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
