import type { StructureDocument } from "../structure";
import {
  montantLigne,
  totauxBonCommande,
  type LigneBonCommande,
} from "@/modules/tresorerie/services/bon-commande";

/**
 * Bon de commande — la pièce qui engage une dépense avant qu'elle n'arrive.
 *
 * ⚠️ **Modèle provisoire**, écrit faute d'avoir un modèle réel sous la
 * main. Il porte ce qu'un bon de commande doit porter pour être opposable —
 * les deux parties, un numéro d'une série continue, le détail chiffré, la
 * date de livraison attendue et la signature de l'engageant — mais la JE
 * voudra sûrement sa propre formulation. Il se remplace sans toucher au
 * code : composer la mise en page de la famille `BON_COMMANDE` dans
 * l'éditeur de canevas, ou y importer le document réel.
 *
 * Deux choses y figurent qu'on oublie souvent.
 *
 * **La date de livraison attendue.** Sans elle, un retard ne se constate
 * pas : on ne sait plus si la commande est en route ou perdue.
 *
 * **La mention que le bon ne vaut pas facture.** Un fournisseur qui le
 * confond réclame le paiement d'une pièce qui n'en est pas une, et une JE
 * qui le classe au même endroit que ses factures fausse sa comptabilité.
 */

export type DonneesBonCommande = {
  reference: string;
  /** Numéro du bon, s'il diffère de la référence documentaire. */
  numero?: string;
  fournisseur: string;
  fournisseurAdresse?: string;
  fournisseurMatriculeFiscal?: string;
  objet: string;
  lignes: LigneBonCommande[];
  tauxTVA: number;
  sectionBudget?: string;
  dateEmission: Date;
  livraisonPrevue?: Date;
  mandat: string;
  emetteur?: string;
  filigrane?: string;
};

function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function construireBonCommande(
  d: DonneesBonCommande
): StructureDocument {
  const totaux = totauxBonCommande(d.lignes, d.tauxTVA);
  const numero = d.numero?.trim() || d.reference;

  return {
    titre: "Bon de commande",
    sousTitre: `Mandat ${d.mandat}`,
    reference: numero,
    date: formaterDate(d.dateEmission),
    filigrane: d.filigrane,
    mentionPied:
      "Association à but non lucratif régie par le décret-loi n° 2011-88.",
    blocs: [
      { type: "section", titre: "Fournisseur" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Raison sociale", valeur: d.fournisseur },
          ...(d.fournisseurMatriculeFiscal?.trim()
            ? [
                {
                  label: "Matricule fiscal",
                  valeur: d.fournisseurMatriculeFiscal.trim(),
                },
              ]
            : []),
          ...(d.fournisseurAdresse?.trim()
            ? [{ label: "Adresse", valeur: d.fournisseurAdresse.trim() }]
            : []),
        ],
      },
      { type: "section", titre: "Commande" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Numéro", valeur: numero },
          { label: "Date", valeur: formaterDate(d.dateEmission) },
          { label: "Objet", valeur: d.objet },
          ...(d.livraisonPrevue
            ? [
                {
                  label: "Livraison attendue",
                  valeur: formaterDate(d.livraisonPrevue),
                },
              ]
            : []),
          ...(d.sectionBudget?.trim()
            ? [{ label: "Imputation", valeur: d.sectionBudget.trim() }]
            : []),
        ],
      },
      { type: "section", titre: "Détail" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Désignation", largeur: 5 },
          { libelle: "Qté", largeur: 1, alignement: "droite" as const },
          { libelle: "P.U. HT", largeur: 2, alignement: "droite" as const },
          { libelle: "Montant HT", largeur: 2, alignement: "droite" as const },
        ],
        lignes: d.lignes.map((l) => [
          l.designation,
          String(l.quantite).replace(".", ","),
          dt(l.prixUnitaire),
          dt(montantLigne(l)),
        ]),
      },
      {
        type: "total",
        items: [
          { label: "Total HT", valeur: dt(totaux.totalHT) },
          {
            label: `TVA ${String(d.tauxTVA).replace(".", ",")} %`,
            valeur: dt(totaux.tva),
          },
          { label: "Total TTC engagé", valeur: dt(totaux.totalTTC), fort: true },
        ],
      },
      {
        type: "encadre",
        titre: "Portée de ce bon",
        texte:
          "Ce bon vaut engagement de commande : il n'est ni une facture, ni une demande de paiement. " +
          "Le règlement interviendra sur présentation de votre facture, après réception conforme.",
      },
      ...(d.emetteur
        ? [
            {
              type: "signatures" as const,
              cases: [{ role: "Le Trésorier", nom: d.emetteur }],
            },
          ]
        : []),
    ],
  };
}
