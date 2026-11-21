import {
  formaterDate,
  formaterMontantDT,
  montantEnLettres,
  type StructureDocument,
} from "../structure";

/**
 * Reçu d'encaissement — gabarit commun aux familles de reçus du drive
 * (dons, produits dérivés, jobs étudiants, intégrations, JeBex).
 *
 * Sur le drive, chaque famille avait son propre PPTX et sa propre
 * numérotation (`RC0xx-DON`, `RC0xx-PR`, `RC0xx-JOBS`…) alors que le contenu
 * était identique à l'intitulé près. Ici : un seul gabarit, et c'est le
 * **modèle du catalogue** qui porte le libellé et la série de numérotation.
 */

export type NatureRecu =
  | "RECU_COTISATION"
  | "RECU_DON"
  | "RECU_PRODUIT"
  | "RECU_JOB"
  | "RECU_INTEGRATION"
  | "RECU_DIVERS";

type Libelles = {
  titre: string;
  /** Phrase d'attestation, adaptée à la nature de l'encaissement. */
  attestation: string;
  /** Intitulé par défaut de l'objet quand la catégorie du flux est vide. */
  objet: string;
  mention?: string;
};

export const LIBELLES_RECU: Record<NatureRecu, Libelles> = {
  RECU_COTISATION: {
    titre: "Reçu de cotisation",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous au titre de la cotisation du mandat.",
    objet: "Cotisation",
  },
  RECU_DON: {
    titre: "Reçu de don",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu à titre de don la somme indiquée ci-dessous, portée au registre des dons de l'association.",
    objet: "Don",
    mention:
      "Don inscrit au registre des dons — décret-loi n° 2011-88 relatif aux associations",
  },
  RECU_PRODUIT: {
    titre: "Reçu de vente",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous au titre de la vente désignée.",
    objet: "Vente de produit",
  },
  RECU_JOB: {
    titre: "Reçu de participation",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous au titre de la participation désignée.",
    objet: "Participation à un job étudiant",
  },
  RECU_INTEGRATION: {
    titre: "Reçu d'intégration",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous au titre de la participation à la journée d'intégration.",
    objet: "Journée d'intégration",
  },
  RECU_DIVERS: {
    titre: "Reçu d'encaissement",
    attestation:
      "Je soussigné, le Trésorier de l'association, reconnais avoir reçu la somme indiquée ci-dessous.",
    objet: "Encaissement",
  },
};

export type DonneesRecuEncaissement = {
  reference: string;
  nature: NatureRecu;
  /**
   * Titre d'une famille déclarée par la JE (« Reçu de tombola »). Le gabarit
   * et l'attestation restent ceux du reçu générique : seul l'intitulé change.
   */
  titrePersonnalise?: string;
  /** Payeur : membre, client, donateur, acheteur… */
  tiers: string;
  montant: number;
  date: Date;
  /** Libellé de l'opération (catégorie budgétaire ou intitulé libre). */
  objet?: string;
  modePaiement?: string;
  notes?: string;
  mandat: string;
  emetteur?: string;
  filigrane?: string;
};

export function construireRecuEncaissement(
  d: DonneesRecuEncaissement
): StructureDocument {
  const libelles = LIBELLES_RECU[d.nature] ?? LIBELLES_RECU.RECU_DIVERS;
  return {
    titre: d.titrePersonnalise?.trim() || libelles.titre,
    sousTitre: `Mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.date),
    filigrane: d.filigrane,
    mentionPied: libelles.mention,
    blocs: [
      { type: "paragraphe", texte: libelles.attestation },
      { type: "section", titre: "Versant" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Nom / raison sociale", valeur: d.tiers },
          { label: "Date d'encaissement", valeur: formaterDate(d.date) },
        ],
      },
      { type: "section", titre: "Encaissement" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Objet", valeur: d.objet?.trim() || libelles.objet },
          { label: "Mode de paiement", valeur: d.modePaiement ?? "Espèces" },
          { label: "Référence du reçu", valeur: d.reference },
          ...(d.notes?.trim()
            ? [{ label: "Observations", valeur: d.notes.trim() }]
            : []),
        ],
      },
      {
        type: "total",
        items: [
          { label: "Montant reçu", valeur: formaterMontantDT(d.montant), fort: true },
        ],
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
          { role: "Le versant", nom: d.tiers },
          { role: "Le Trésorier", nom: d.emetteur },
        ],
      },
    ],
  };
}

function majusculeInitiale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
