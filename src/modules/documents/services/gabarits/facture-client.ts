import {
  formaterDate,
  formaterMontantDT,
  montantEnLettres,
  type StructureDocument,
} from "../structure";

function majusculeInitiale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Facture client.
 *
 * Le classeur `FE0xx-<client>.xlsx` du drive : un onglet par facture, les
 * totaux recalculés à la main et le numéro repris de la facture précédente.
 * Ici les montants découlent tous du HT et du taux, et le numéro vient du
 * compteur du mandat.
 *
 * Le **timbre fiscal** figure sur sa propre ligne, après le TTC : c'est un
 * droit d'enregistrement dû par facture, pas une taxe sur le montant. Le
 * confondre avec la TVA fausserait la déclaration mensuelle.
 */

export type LigneFacture = {
  designation: string;
  quantite?: number;
  prixUnitaireHT?: number;
  montantHT: number;
};

export type DonneesFactureClient = {
  reference: string;
  /** Numéro interne de la facture, s'il diffère de la référence documentaire. */
  numero?: string;
  client: string;
  clientAdresse?: string;
  clientMatriculeFiscal?: string;
  objet: string;
  lignes: LigneFacture[];
  tauxTVA: number;
  timbreFiscal: number;
  dateEmission: Date;
  echeance: Date;
  /** Renseignée seulement une fois la facture encaissée. */
  payeeLe?: Date | null;
  mandat: string;
  emetteur?: string;
  notes?: string;
  filigrane?: string;
};

function arrondir(montant: number): number {
  return Math.round(montant * 1000) / 1000;
}

/** Totaux d'une facture — dérivés, jamais saisis. */
export function totauxFacture(d: {
  lignes: LigneFacture[];
  tauxTVA: number;
  timbreFiscal: number;
}): { totalHT: number; tva: number; totalTTC: number; netAPayer: number } {
  const totalHT = arrondir(d.lignes.reduce((s, l) => s + l.montantHT, 0));
  const tva = arrondir(totalHT * (d.tauxTVA / 100));
  const totalTTC = arrondir(totalHT + tva);
  return {
    totalHT,
    tva,
    totalTTC,
    netAPayer: arrondir(totalTTC + d.timbreFiscal),
  };
}

export function construireFactureClient(
  d: DonneesFactureClient
): StructureDocument {
  const totaux = totauxFacture(d);
  const avecDetail = d.lignes.some(
    (l) => l.quantite !== undefined || l.prixUnitaireHT !== undefined
  );

  return {
    titre: "Facture",
    sousTitre: `Mandat ${d.mandat}`,
    reference: d.numero?.trim() || d.reference,
    date: formaterDate(d.dateEmission),
    filigrane: d.filigrane ?? (d.payeeLe ? undefined : undefined),
    mentionPied:
      "Association à but non lucratif régie par le décret-loi n° 2011-88.",
    blocs: [
      { type: "section", titre: "Client" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Raison sociale", valeur: d.client },
          ...(d.clientAdresse?.trim()
            ? [{ label: "Adresse", valeur: d.clientAdresse.trim() }]
            : []),
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
      { type: "section", titre: "Facture" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Numéro", valeur: d.numero?.trim() || d.reference },
          { label: "Date d'émission", valeur: formaterDate(d.dateEmission) },
          { label: "Échéance de règlement", valeur: formaterDate(d.echeance) },
          {
            label: "État",
            valeur: d.payeeLe
              ? `Réglée le ${formaterDate(d.payeeLe)}`
              : "En attente de règlement",
          },
        ],
      },
      { type: "section", titre: "Prestations" },
      {
        type: "tableau",
        colonnes: avecDetail
          ? [
              { libelle: "Désignation", largeur: 5 },
              { libelle: "Qté", largeur: 1, alignement: "droite" as const },
              { libelle: "P.U. HT", largeur: 2, alignement: "droite" as const },
              { libelle: "Montant HT", largeur: 2, alignement: "droite" as const },
            ]
          : [
              { libelle: "Désignation", largeur: 6 },
              { libelle: "Montant HT", largeur: 2, alignement: "droite" as const },
            ],
        lignes: d.lignes.map((l) =>
          avecDetail
            ? [
                l.designation,
                l.quantite !== undefined ? String(l.quantite) : "",
                l.prixUnitaireHT !== undefined
                  ? formaterMontantDT(l.prixUnitaireHT)
                  : "",
                formaterMontantDT(l.montantHT),
              ]
            : [l.designation, formaterMontantDT(l.montantHT)]
        ),
      },
      {
        type: "total",
        items: [
          { label: "Total HT", valeur: formaterMontantDT(totaux.totalHT) },
          {
            label: `TVA ${d.tauxTVA} %`,
            valeur: formaterMontantDT(totaux.tva),
          },
          { label: "Total TTC", valeur: formaterMontantDT(totaux.totalTTC) },
          {
            label: "Timbre fiscal",
            valeur: formaterMontantDT(d.timbreFiscal),
          },
          {
            label: "Net à payer",
            valeur: formaterMontantDT(totaux.netAPayer),
            fort: true,
          },
        ],
      },
      {
        type: "encadre",
        titre: "Arrêtée la présente facture à la somme de",
        texte: `${majusculeInitiale(montantEnLettres(totaux.netAPayer))}.`,
      },
      ...(d.objet.trim()
        ? [{ type: "paragraphe" as const, texte: `Objet : ${d.objet.trim()}` }]
        : []),
      ...(d.notes?.trim()
        ? [{ type: "paragraphe" as const, texte: d.notes.trim(), italique: true }]
        : []),
      { type: "espace", hauteur: 10 },
      {
        type: "signatures",
        cases: [{ role: "Le Trésorier", nom: d.emetteur }],
      },
    ],
  };
}
