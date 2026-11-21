import type { StructureDocument } from "../structure";
import { detailRetenue } from "@/modules/tresorerie/services/certificat-ras";

/**
 * Certificat de retenue à la source.
 *
 * ⚠️ **Modèle provisoire.** Il est écrit ici faute d'avoir le formulaire
 * officiel sous la main ; il en reprend les rubriques telles que les exige la
 * pratique tunisienne — identité des deux parties avec leurs matricules,
 * nature et date de l'opération, assiette, taux, retenue, net versé — mais il
 * n'a pas été recopié sur un exemplaire de l'administration. Il est fait pour
 * être remplacé : une fois le vrai formulaire disponible, il suffit de
 * composer la mise en page de la famille `CERTIFICAT_RAS` dans l'éditeur de
 * canevas, ou d'y importer le document réel — `modelePourFamille` la prendra
 * alors à la place de ce gabarit, sans toucher au code.
 *
 * Deux partis pris.
 *
 * **Le détail du calcul est imprimé**, pas seulement son résultat. Un
 * prestataire qui reçoit « retenu : 35,700 DT » sans l'assiette ni le taux ne
 * peut rien vérifier ; or c'est cette pièce qu'il présentera à son tour.
 *
 * **Le net versé figure en évidence.** C'est le seul chiffre qu'il
 * reconnaîtra — celui qu'il a vu arriver sur son compte — et c'est par là
 * qu'il rapprochera le certificat de son encaissement.
 */

export type DonneesCertificatRAS = {
  reference: string;
  /** La JE, qui opère la retenue. */
  retenteur: string;
  retenteurMatriculeFiscal?: string;
  retenteurAdresse?: string;
  /** Le prestataire, pour qui la retenue est versée. */
  beneficiaire: string;
  beneficiaireMatriculeFiscal?: string;
  beneficiaireAdresse?: string;
  /** La facture reçue. */
  factureReference: string;
  factureDate: Date;
  natureOperation?: string;
  montantTTC: number;
  typePrestataire: string;
  /** Date de règlement, qui est le fait générateur de la retenue. */
  dateReglement: Date;
  modeReglement?: string;
  dateEmission: Date;
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

export function construireCertificatRAS(
  d: DonneesCertificatRAS
): StructureDocument {
  const detail = detailRetenue({
    montantTTC: d.montantTTC,
    typePrestataire: d.typePrestataire,
  });

  return {
    titre: "Certificat de retenue à la source",
    sousTitre: `Mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.dateEmission),
    filigrane: d.filigrane,
    mentionPied:
      "Association à but non lucratif régie par le décret-loi n° 2011-88.",
    blocs: [
      {
        type: "paragraphe",
        texte:
          "Le présent certificat atteste qu'une retenue à la source a été opérée sur le règlement " +
          "ci-dessous et versée au Trésor pour le compte du bénéficiaire, qui peut l'imputer sur " +
          "son propre impôt.",
      },
      { type: "section", titre: "Partie versante" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Dénomination", valeur: d.retenteur },
          ...(d.retenteurMatriculeFiscal?.trim()
            ? [
                {
                  label: "Matricule fiscal",
                  valeur: d.retenteurMatriculeFiscal.trim(),
                },
              ]
            : []),
          ...(d.retenteurAdresse?.trim()
            ? [{ label: "Adresse", valeur: d.retenteurAdresse.trim() }]
            : []),
        ],
      },
      { type: "section", titre: "Bénéficiaire" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Dénomination", valeur: d.beneficiaire },
          ...(d.beneficiaireMatriculeFiscal?.trim()
            ? [
                {
                  label: "Matricule fiscal",
                  valeur: d.beneficiaireMatriculeFiscal.trim(),
                },
              ]
            : [
                {
                  label: "Matricule fiscal",
                  valeur: "— à compléter par le bénéficiaire —",
                },
              ]),
          ...(d.beneficiaireAdresse?.trim()
            ? [{ label: "Adresse", valeur: d.beneficiaireAdresse.trim() }]
            : []),
          { label: "Régime", valeur: detail.regime },
        ],
      },
      { type: "section", titre: "Opération" },
      {
        type: "champs",
        colonnes: 2,
        items: [
          { label: "Facture", valeur: d.factureReference },
          { label: "Date de la facture", valeur: formaterDate(d.factureDate) },
          {
            label: "Date du règlement",
            valeur: formaterDate(d.dateReglement),
          },
          ...(d.modeReglement
            ? [{ label: "Mode de règlement", valeur: d.modeReglement }]
            : []),
          ...(d.natureOperation?.trim()
            ? [{ label: "Nature", valeur: d.natureOperation.trim() }]
            : []),
        ],
      },
      { type: "section", titre: "Calcul de la retenue" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Désignation", largeur: 6 },
          { libelle: "Montant", largeur: 2, alignement: "droite" as const },
        ],
        lignes: [
          ["Montant de la facture, toutes taxes comprises", dt(d.montantTTC)],
          ["Droit de timbre, hors assiette de la retenue", dt(1)],
          ["Assiette de la retenue", dt(detail.assiette)],
          [
            `Taux applicable — ${detail.regime}`,
            `${String(detail.tauxPourcent).replace(".", ",")} %`,
          ],
        ],
      },
      {
        type: "total",
        items: [
          { label: "Retenue opérée et versée au Trésor", valeur: dt(detail.retenue) },
          { label: "Net versé au bénéficiaire", valeur: dt(detail.netVerse), fort: true },
        ],
      },
      {
        type: "encadre",
        titre: "À conserver",
        texte:
          "Ce certificat justifie l'imputation de la retenue sur l'impôt dû par le bénéficiaire. " +
          "Il doit être conservé et joint à sa déclaration.",
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
