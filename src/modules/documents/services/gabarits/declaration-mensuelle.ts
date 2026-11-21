import {
  formaterDate,
  formaterMontantDT,
  type StructureDocument,
} from "../structure";

/**
 * Déclaration fiscale mensuelle — remplace le classeur OTMT du drive, dont on
 * ne pouvait rien tirer d'imprimable ni d'archivable.
 *
 * Le document est une **photo** : il reprend les totaux figés à la clôture,
 * pas un recalcul. Une facture corrigée après le dépôt ne doit pas modifier
 * rétroactivement une déclaration déjà remise à l'administration.
 */

export type DonneesDeclarationMensuelle = {
  reference: string;
  /** « février 2026 » */
  libelleMois: string;
  mandat: string;
  arreteeLe: Date;
  emises: {
    nombre: number;
    totalHT: number;
    totalTVA: number;
    totalTimbres: number;
    totalTTC: number;
  };
  recues: {
    nombre: number;
    totalHT: number;
    totalTVA: number;
    totalTTC: number;
    totalRAS: number;
  };
  agios: { totalHT: number; totalTVA: number };
  soldeTVA: number;
  reportPrecedent: number;
  soldeApresReport: number;
  natureLibelle: string;
  tvaAPayer: number;
  tvaAReporter: number;
  montantAPayer: number;
  emetteur?: string;
  filigrane?: string;
};

export function construireDeclarationMensuelle(
  d: DonneesDeclarationMensuelle
): StructureDocument {
  return {
    titre: "Déclaration fiscale mensuelle",
    sousTitre: `${d.libelleMois} — mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.arreteeLe),
    filigrane: d.filigrane,
    mentionPied:
      "Établie à partir des factures enregistrées dans l'application",
    blocs: [
      {
        type: "paragraphe",
        texte: `Récapitulatif des opérations soumises à la taxe sur la valeur ajoutée et à la retenue à la source pour le mois de ${d.libelleMois}.`,
      },

      { type: "section", titre: "Chiffre d'affaires — factures émises" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Rubrique", largeur: 3 },
          { libelle: "Montant", largeur: 2, alignement: "droite" },
        ],
        lignes: [
          ["Nombre de factures", String(d.emises.nombre)],
          ["Total hors taxes", formaterMontantDT(d.emises.totalHT)],
          ["TVA collectée", formaterMontantDT(d.emises.totalTVA)],
          ["Timbres fiscaux", formaterMontantDT(d.emises.totalTimbres)],
          ["Total toutes taxes comprises", formaterMontantDT(d.emises.totalTTC)],
        ],
      },

      { type: "section", titre: "Achats — factures reçues" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Rubrique", largeur: 3 },
          { libelle: "Montant", largeur: 2, alignement: "droite" },
        ],
        lignes: [
          ["Nombre de factures", String(d.recues.nombre)],
          ["Total hors taxes", formaterMontantDT(d.recues.totalHT)],
          ["TVA déductible", formaterMontantDT(d.recues.totalTVA)],
          ["Total toutes taxes comprises", formaterMontantDT(d.recues.totalTTC)],
          ["Retenue à la source opérée", formaterMontantDT(d.recues.totalRAS)],
        ],
      },

      { type: "section", titre: "Liquidation de la TVA" },
      {
        // Les agios sont une composante de la TVA déductible : les isoler dans
        // une section à eux poussait la signature sur une seconde page pour
        // deux chiffres.
        type: "tableau",
        colonnes: [
          { libelle: "Élément", largeur: 3 },
          { libelle: "Montant", largeur: 2, alignement: "droite" },
        ],
        lignes: [
          [
            "Agios bancaires (HT / TVA déductible)",
            `${formaterMontantDT(d.agios.totalHT)}  ·  ${formaterMontantDT(d.agios.totalTVA)}`,
          ],
          [
            "Solde du mois (TVA collectée − TVA déductible)",
            formaterMontantDT(d.soldeTVA),
          ],
          ["Crédit reporté du mois précédent", formaterMontantDT(d.reportPrecedent)],
          ["Solde après report", formaterMontantDT(d.soldeApresReport)],
          ["Nature", d.natureLibelle],
        ],
      },
      {
        type: "total",
        items: [
          { label: "TVA à payer", valeur: formaterMontantDT(d.tvaAPayer) },
          { label: "Timbres fiscaux", valeur: formaterMontantDT(d.emises.totalTimbres) },
          { label: "Retenue à la source", valeur: formaterMontantDT(d.recues.totalRAS) },
          {
            label: "Montant total à verser",
            valeur: formaterMontantDT(d.montantAPayer),
            fort: true,
          },
        ],
      },
      ...(d.tvaAReporter < 0
        ? ([
            {
              type: "encadre" as const,
              titre: "Crédit de TVA",
              texte: `Un crédit de ${formaterMontantDT(Math.abs(d.tvaAReporter))} est reporté sur la déclaration du mois suivant.`,
            },
          ])
        : []),
      {
        type: "signatures",
        cases: [
          { role: "Le Trésorier", nom: d.emetteur },
          { role: "Le Président" },
        ],
      },
    ],
  };
}
