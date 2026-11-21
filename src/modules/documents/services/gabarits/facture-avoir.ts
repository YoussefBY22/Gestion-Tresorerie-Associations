import type { StructureDocument } from "../structure";
import { totauxAvoir } from "@/modules/tresorerie/services/avoir";

/**
 * Facture d'avoir — la pièce qui corrige une facture déjà émise.
 *
 * Elle se lit à côté de la facture d'origine, jamais à sa place : son numéro
 * et celui de la facture figurent tous deux en évidence, et le motif est
 * imprimé. Un avoir sans motif est inexploitable à la relecture — c'est
 * pourtant ce qu'on produit quand on se contente d'inverser des montants.
 *
 * Les montants sont écrits **en positif**, avec la mention qui dit leur sens
 * (« à déduire de la facture »). Un PDF rempli de nombres négatifs se lit mal
 * et invite aux erreurs de recopie ; la convention comptable, elle, vit dans
 * le calcul, pas dans la présentation.
 */

export type DonneesFactureAvoir = {
  reference: string;
  /** Numéro de l'avoir, s'il diffère de la référence documentaire. */
  numero?: string;
  /** Numéro de la facture corrigée. */
  factureNumero: string;
  factureDate: Date;
  factureMontantHT: number;
  client: string;
  clientMatriculeFiscal?: string;
  montantHT: number;
  tauxTVA: number;
  motif: string;
  dateEmission: Date;
  /** Vrai quand l'avoir solde la facture entièrement. */
  annulationTotale: boolean;
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

export function construireFactureAvoir(
  d: DonneesFactureAvoir
): StructureDocument {
  const totaux = totauxAvoir(
    { montantHT: d.factureMontantHT, tauxTVA: d.tauxTVA },
    d.montantHT
  );
  const numero = d.numero?.trim() || d.reference;

  return {
    titre: "Facture d'avoir",
    sousTitre: `Mandat ${d.mandat}`,
    reference: numero,
    date: formaterDate(d.dateEmission),
    filigrane: d.filigrane,
    mentionPied:
      "Association à but non lucratif régie par le décret-loi n° 2011-88.",
    blocs: [
      { type: "section", titre: "Client" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Raison sociale", valeur: d.client },
          ...(d.clientMatriculeFiscal?.trim()
            ? [
                {
                  label: "Matricule fiscal",
                  valeur: d.clientMatriculeFiscal.trim(),
                },
              ]
            : []),
        ],
      },
      { type: "section", titre: "Avoir" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Numéro d'avoir", valeur: numero },
          { label: "Date d'émission", valeur: formaterDate(d.dateEmission) },
          { label: "Facture corrigée", valeur: d.factureNumero },
          { label: "Date de la facture", valeur: formaterDate(d.factureDate) },
          {
            label: "Portée",
            valeur: d.annulationTotale
              ? "Annulation totale de la facture"
              : "Réduction partielle de la facture",
          },
          {
            label: "Montant initial de la facture",
            valeur: dt(d.factureMontantHT),
          },
        ],
      },
      { type: "section", titre: "Motif" },
      { type: "paragraphe", texte: d.motif },
      { type: "section", titre: "Montants à déduire" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Désignation", largeur: 6 },
          { libelle: "Montant", largeur: 2, alignement: "droite" as const },
        ],
        lignes: [
          [
            d.annulationTotale
              ? `Annulation de la facture ${d.factureNumero}`
              : `Réduction sur la facture ${d.factureNumero}`,
            dt(totaux.montantHT),
          ],
          [`TVA ${d.tauxTVA} %`, dt(totaux.tva)],
        ],
      },
      {
        type: "total",
        items: [
          { label: "Total HT à déduire", valeur: dt(totaux.montantHT) },
          { label: `TVA ${d.tauxTVA} %`, valeur: dt(totaux.tva) },
          {
            label: "Total TTC à déduire",
            valeur: dt(totaux.montantTTC),
            fort: true,
          },
        ],
      },
      {
        type: "paragraphe",
        texte:
          "Le droit de timbre acquitté sur la facture d'origine n'est pas restitué : " +
          "il reste dû au titre de l'émission de cette facture.",
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
