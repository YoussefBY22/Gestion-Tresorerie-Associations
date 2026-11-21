import { COULEUR_PRIMAIRE_DEFAUT } from "@/modules/core/apparence";
import {
  A4,
  ENCADREMENT_DEFAUT,
  STYLE_TEXTE_DEFAUT,
  type Bloc,
  type Canevas,
  type Encadrement,
  type StyleTexte,
} from "./canevas";

/**
 * Les modèles de la JE, repris du classeur
 * « Template Reçu et facture.xlsx » du drive.
 *
 * Ils sont écrits ici en **données**, pas en code de dessin : ce sont des
 * canevas ordinaires, que le Trésorier ouvre et retouche à la souris comme
 * n'importe quel autre. Le jour où la JE change sa mise en page, personne n'a
 * besoin d'un développeur — et ces définitions ne servent plus qu'à repeupler
 * un modèle effacé par erreur.
 *
 * Les valeurs variables sont des jetons `{{champ}}`, posés aux emplacements
 * qu'occupaient les exemples du classeur.
 */

/*
 * Couleurs des modèles livrés.
 *
 * `MARQUE` reprend la couleur par défaut de l'application. Ce n'est qu'un
 * point de départ : ces modèles se dupliquent et se recolorent dans
 * l'éditeur de canevas, et la charte d'une famille de documents l'emporte
 * sur eux. On ne cherche donc pas à y brancher le paramétrage — un modèle
 * est une donnée qu'on modifie, pas un thème qu'on suit.
 */
const ENCRE = "#15181d";
const MARQUE = COULEUR_PRIMAIRE_DEFAUT;
const GRIS_LIGNE = "#f2f2f2";
const BLANC = "#ffffff";

/** Marge latérale commune aux deux modèles, en millimètres. */
const MARGE = 12;
const LARGEUR = A4.largeur - MARGE * 2;

let compteur = 0;
function id(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${compteur}`;
}

function style(ajouts: Partial<StyleTexte> = {}): StyleTexte {
  return { ...STYLE_TEXTE_DEFAUT, alignementVertical: "milieu", ...ajouts };
}

function cadre(ajouts: Partial<Encadrement> = {}): Encadrement {
  return { ...ENCADREMENT_DEFAUT, ...ajouts };
}

type Pose = { x: number; y: number; largeur: number; hauteur: number };

function texte(
  pose: Pose,
  contenu: string,
  plan: number,
  options: { style?: Partial<StyleTexte>; encadrement?: Partial<Encadrement>; marge?: number; nom?: string } = {}
): Bloc {
  return {
    id: id("txt"),
    type: "TEXTE",
    ...pose,
    plan,
    nom: options.nom,
    contenu,
    style: style(options.style),
    encadrement: cadre(options.encadrement),
    marge: options.marge ?? 1.5,
  };
}

function aplat(pose: Pose, fond: string, plan: number, nom?: string): Bloc {
  return {
    id: id("apl"),
    type: "RECTANGLE",
    ...pose,
    plan,
    nom,
    encadrement: cadre({ fond }),
  };
}

/* ------------------------------------------------------------------ */
/* Reçu — feuille « Template Reçu »                                    */
/* ------------------------------------------------------------------ */

export function canevasRecu(): Canevas {
  const blocs: Bloc[] = [];
  let plan = 0;
  const suivant = () => plan++;

  // Bandeau de titre, logo à gauche.
  blocs.push(aplat({ x: MARGE, y: 12, largeur: LARGEUR, hauteur: 15 }, ENCRE, suivant(), "Bandeau de titre"));
  blocs.push(
    texte(
      { x: MARGE + 28, y: 12, largeur: LARGEUR - 30, hauteur: 15 },
      "{{emetteurJE}} — REÇU DE PAIEMENT DE COTISATION",
      suivant(),
      { style: { couleur: BLANC, gras: true, taille: 11, alignement: "centre", majuscules: true }, nom: "Titre" }
    )
  );
  blocs.push(aplat({ x: MARGE, y: 27, largeur: LARGEUR, hauteur: 2.5 }, MARQUE, suivant(), "Filet bordeaux"));

  // Référence et date, deux cases encadrées.
  const demi = (LARGEUR - 4) / 2;
  blocs.push(
    texte({ x: MARGE, y: 34, largeur: demi, hauteur: 13 }, "RÉFÉRENCE DU REÇU : {{reference}}", suivant(), {
      style: { gras: true, taille: 9, alignement: "centre" },
      encadrement: { bordure: MARQUE, epaisseurBordure: 0.5 },
      nom: "Référence",
    })
  );
  blocs.push(
    texte({ x: MARGE + demi + 4, y: 34, largeur: demi, hauteur: 13 }, "DATE : {{date}}", suivant(), {
      style: { gras: true, taille: 9, alignement: "centre" },
      encadrement: { bordure: MARQUE, epaisseurBordure: 0.5 },
      nom: "Date",
    })
  );

  // Coordonnées de la JE : bandeau vertical + quatre lignes.
  const hautJE = 52;
  const hLigne = 8.5;
  blocs.push(aplat({ x: MARGE, y: hautJE, largeur: 13, hauteur: hLigne * 4 }, MARQUE, suivant(), "Onglet JE"));
  blocs.push(
    texte({ x: MARGE, y: hautJE, largeur: 13, hauteur: hLigne * 4 }, "{{sigleJE}}", suivant(), {
      style: { couleur: BLANC, gras: true, taille: 6.5, alignement: "centre" },
      marge: 0.5,
      nom: "Sigle",
    })
  );
  const lignesJE: [string, string][] = [
    ["Adresse", "{{adresseJE}}"],
    ["Matricule Fiscal", "{{matriculeFiscal}}"],
    ["Téléphone", "{{telephoneJE}}"],
    ["E-mail", "{{emailJE}}"],
  ];
  lignesJE.forEach(([libelle, jeton], i) => {
    const y = hautJE + i * hLigne;
    blocs.push(
      texte({ x: MARGE + 13, y, largeur: 42, hauteur: hLigne }, libelle, suivant(), {
        style: { gras: true, taille: 8.5, alignement: "centre" },
        encadrement: { bordure: MARQUE, epaisseurBordure: 0.4 },
      })
    );
    blocs.push(
      texte({ x: MARGE + 55, y, largeur: LARGEUR - 55, hauteur: hLigne }, jeton, suivant(), {
        style: { taille: 8.5, alignement: "centre" },
        encadrement: { bordure: MARQUE, epaisseurBordure: 0.4 },
      })
    );
  });

  // Identité du cotisant.
  const hautPour = 90;
  const hPour = 7.5;
  blocs.push(
    texte({ x: MARGE, y: hautPour, largeur: 24, hauteur: hPour * 5 }, "Pour", suivant(), {
      style: { gras: true, taille: 13, couleur: MARQUE, alignement: "centre" },
      encadrement: { bordure: MARQUE, epaisseurBordure: 0.4 },
      nom: "Pour",
    })
  );
  const lignesCotisant = [
    "Nom : {{cotisant}}",
    "CIN : {{cin}}",
    "Adresse complète : {{adresse}}",
    "Adresse E-mail : {{email}}",
    "Téléphone : {{telephone}}",
  ];
  lignesCotisant.forEach((contenu, i) => {
    blocs.push(
      texte(
        { x: MARGE + 24, y: hautPour + i * hPour, largeur: LARGEUR - 24, hauteur: hPour },
        contenu,
        suivant(),
        {
          style: { gras: true, taille: 8.5, alignement: "centre" },
          encadrement: { bordure: MARQUE, epaisseurBordure: 0.4 },
        }
      )
    );
  });

  // Détail de l'encaissement.
  blocs.push({
    id: id("tab"),
    type: "TABLEAU",
    x: MARGE,
    y: 133,
    largeur: LARGEUR,
    hauteur: 38,
    plan: suivant(),
    nom: "Détail",
    source: "lignes",
    lignesManuelles: [],
    bordure: "#d9d9d9",
    epaisseurBordure: 0.3,
    colonnes: [
      { entete: "DESCRIPTION", part: 5, alignement: "centre", champ: "designation" },
      { entete: "QUANTITÉ", part: 1.2, alignement: "centre", champ: "quantite" },
      { entete: "PRIX TOTAL", part: 1.6, alignement: "centre", champ: "total" },
    ],
    hauteurEntete: 9,
    hauteurLigne: 14,
    styleEntete: style({ couleur: BLANC, gras: true, taille: 8.5, alignement: "centre", majuscules: true }),
    encadrementEntete: cadre({ fond: ENCRE }),
    styleCorps: style({ taille: 9.5, alignement: "centre" }),
    encadrementCorps: cadre({ fond: GRIS_LIGNE, bordure: "#d9d9d9", epaisseurBordure: 0.3 }),
    zebrure: "",
  });

  // Remerciement et signature.
  blocs.push(aplat({ x: MARGE, y: 173, largeur: LARGEUR, hauteur: 10 }, ENCRE, suivant(), "Bandeau remerciement"));
  blocs.push(
    texte({ x: MARGE, y: 173, largeur: LARGEUR, hauteur: 10 }, "Nous vous remercions de votre confiance !", suivant(), {
      style: { couleur: BLANC, gras: true, taille: 10, alignement: "centre", majuscules: true },
      nom: "Remerciement",
    })
  );
  blocs.push(
    texte({ x: MARGE, y: 192, largeur: 95, hauteur: 18 }, "Signature : {{emetteur}},\n{{qualiteEmetteur}}", suivant(), {
      style: { gras: true, taille: 10, couleur: MARQUE, alignementVertical: "haut" },
      nom: "Signature",
    })
  );

  return { largeur: A4.largeur, hauteur: A4.hauteur, blocs };
}

/* ------------------------------------------------------------------ */
/* Facture — feuille « Template Facture »                              */
/* ------------------------------------------------------------------ */

export function canevasFacture(): Canevas {
  const blocs: Bloc[] = [];
  let plan = 0;
  const suivant = () => plan++;

  // En-tête : identité à gauche, coordonnées à droite.
  blocs.push(
    texte({ x: MARGE, y: 14, largeur: 95, hauteur: 9 }, "ASSOCIATION {{emetteurJE}}", suivant(), {
      style: { gras: true, taille: 12 },
      nom: "Raison sociale",
    })
  );
  const coordonnees: [string, string][] = [
    ["Adresse :", "{{adresseJE}}"],
    ["MF :", "{{matriculeFiscal}}"],
    ["E-mail :", "{{emailJE}}"],
    ["Contact :", "{{telephoneJE}}"],
  ];
  coordonnees.forEach(([libelle, jeton], i) => {
    const y = 26 + i * 6;
    blocs.push(
      texte({ x: MARGE, y, largeur: 24, hauteur: 6 }, libelle, suivant(), {
        style: { gras: true, taille: 8, alignement: "droite" },
      })
    );
    blocs.push(
      texte({ x: MARGE + 25, y, largeur: LARGEUR - 25, hauteur: 6 }, jeton, suivant(), {
        style: { taille: 8 },
      })
    );
  });

  // Numéro de facture et bloc client.
  blocs.push(
    texte({ x: MARGE, y: 58, largeur: 85, hauteur: 11 }, "{{reference}}", suivant(), {
      style: { gras: true, taille: 16, alignement: "centre", couleur: MARQUE },
      nom: "Numéro",
    })
  );
  blocs.push(
    texte({ x: MARGE + 101, y: 58, largeur: 85, hauteur: 11 }, "CLIENT", suivant(), {
      style: { gras: true, taille: 16, alignement: "centre", couleur: MARQUE },
      nom: "Titre client",
    })
  );

  const gauche: [string, string][] = [
    ["Date de la facture :", "{{dateEmission}}"],
    ["Référence :", "{{reference}}"],
    ["Échéance :", "{{echeance}}"],
  ];
  gauche.forEach(([libelle, jeton], i) => {
    const y = 73 + i * 7;
    blocs.push(
      texte({ x: MARGE, y, largeur: 40, hauteur: 7 }, libelle, suivant(), {
        style: { gras: true, taille: 9, alignement: "droite" },
      })
    );
    blocs.push(
      texte({ x: MARGE + 42, y, largeur: 43, hauteur: 7 }, jeton, suivant(), {
        style: { taille: 9 },
      })
    );
  });

  const droite = [
    "Raison sociale : {{client}}",
    "Adresse : {{adresseClient}}",
    "MF : {{matriculeClient}}",
  ];
  droite.forEach((contenu, i) => {
    blocs.push(
      texte({ x: MARGE + 101, y: 73 + i * 7, largeur: 85, hauteur: 7 }, contenu, suivant(), {
        style: { gras: true, taille: 9 },
      })
    );
  });

  // Détail des prestations.
  blocs.push({
    id: id("tab"),
    type: "TABLEAU",
    x: MARGE,
    y: 100,
    largeur: LARGEUR,
    hauteur: 46,
    plan: suivant(),
    nom: "Prestations",
    source: "lignes",
    lignesManuelles: [],
    bordure: "#d9d9d9",
    epaisseurBordure: 0.3,
    colonnes: [
      { entete: "Description", part: 3.2, alignement: "centre", champ: "designation" },
      { entete: "Quantité", part: 1, alignement: "centre", champ: "quantite" },
      { entete: "Prix unitaire HT", part: 1.4, alignement: "centre", champ: "prixUnitaire" },
      { entete: "Total HT", part: 1.2, alignement: "centre", champ: "totalHT" },
      { entete: "Taux de TVA", part: 1, alignement: "centre", champ: "tauxTVA" },
      { entete: "Total TVA", part: 1.2, alignement: "centre", champ: "totalTVA" },
      { entete: "Total", part: 1.2, alignement: "centre", champ: "total" },
    ],
    hauteurEntete: 10,
    hauteurLigne: 9,
    styleEntete: style({ couleur: BLANC, gras: true, taille: 8, alignement: "centre" }),
    encadrementEntete: cadre({ fond: MARQUE }),
    styleCorps: style({ taille: 8.5, alignement: "centre" }),
    encadrementCorps: cadre({ bordure: "#d9d9d9", epaisseurBordure: 0.3 }),
    zebrure: GRIS_LIGNE,
  });

  // Totaux, alignés à droite comme au classeur.
  const totaux: [string, string][] = [
    ["Total HT", "{{totalHT}}"],
    ["Total TVA ({{tauxTVA}})", "{{totalTVA}}"],
    ["Timbre fiscal", "{{timbreFiscal}}"],
    ["Total TTC", "{{totalTTC}}"],
  ];
  totaux.forEach(([libelle, jeton], i) => {
    const y = 152 + i * 8;
    const dernier = i === totaux.length - 1;
    blocs.push(
      texte({ x: MARGE + 96, y, largeur: 50, hauteur: 8 }, libelle, suivant(), {
        style: { gras: true, taille: 9.5, alignement: "droite", couleur: dernier ? MARQUE : ENCRE },
      })
    );
    blocs.push(
      texte({ x: MARGE + 148, y, largeur: 38, hauteur: 8 }, jeton, suivant(), {
        style: { gras: dernier, taille: 9.5, alignement: "droite", couleur: dernier ? MARQUE : ENCRE },
        encadrement: dernier ? { bordure: MARQUE, epaisseurBordure: 0.5 } : {},
      })
    );
  });

  // Mentions de bas de facture.
  blocs.push(
    texte({ x: MARGE, y: 196, largeur: LARGEUR, hauteur: 6 }, "Informations additionnelles", suivant(), {
      style: { gras: true, taille: 9.5 },
    })
  );
  blocs.push(
    texte({ x: MARGE, y: 202, largeur: LARGEUR, hauteur: 12 }, "{{mentionFiscale}}", suivant(), {
      style: { taille: 8.5, alignementVertical: "haut" },
      nom: "Mention fiscale",
    })
  );
  blocs.push(
    texte({ x: MARGE, y: 218, largeur: LARGEUR, hauteur: 7 }, "Merci d'avoir choisi notre organisation pour nos services !", suivant(), {
      style: { gras: true, taille: 10, couleur: MARQUE },
      nom: "Remerciement",
    })
  );

  blocs.push(
    texte({ x: MARGE, y: 234, largeur: 85, hauteur: 6 }, "Coordonnées", suivant(), {
      style: { gras: true, taille: 9.5 },
    })
  );
  blocs.push(
    texte({ x: MARGE, y: 240, largeur: 85, hauteur: 20 }, "Téléphone : {{telephoneJE}}\nE-mail : {{emailJE}}\nSite web : {{siteJE}}", suivant(), {
      style: { taille: 8.5, alignementVertical: "haut" },
    })
  );
  blocs.push(
    texte({ x: MARGE + 101, y: 234, largeur: 85, hauteur: 6 }, "Détails bancaires", suivant(), {
      style: { gras: true, taille: 9.5 },
    })
  );
  blocs.push(
    texte({ x: MARGE + 101, y: 240, largeur: 85, hauteur: 20 }, "Banque : {{banque}}\nN° du compte : {{compteBancaire}}", suivant(), {
      style: { taille: 8.5, alignementVertical: "haut" },
    })
  );

  return { largeur: A4.largeur, hauteur: A4.hauteur, blocs };
}

/** Les modèles livrés avec l'application, par famille du catalogue. */
export const CANEVAS_LIVRES: Record<string, () => Canevas> = {
  RECU_COTISATION: canevasRecu,
  RECU_DON: canevasRecu,
  RECU_PRODUIT: canevasRecu,
  RECU_JOB: canevasRecu,
  RECU_INTEGRATION: canevasRecu,
  RECU_DIVERS: canevasRecu,
  FACTURE_CLIENT: canevasFacture,
  DEVIS_CLIENT: canevasFacture,
  FACTURE_AVOIR: canevasFacture,
  BON_COMMANDE: canevasFacture,
};

/** Canevas de départ pour une famille, ou une page vide si elle est inconnue. */
export function canevasLivre(modele: string): Canevas {
  const fabrique = CANEVAS_LIVRES[modele];
  return fabrique
    ? fabrique()
    : { largeur: A4.largeur, hauteur: A4.hauteur, blocs: [] };
}

/* ------------------------------------------------------------------ */
/* Jeux d'exemple                                                      */
/* ------------------------------------------------------------------ */

/**
 * Jeux d'exemple, **par famille de document**.
 *
 * Deux règles, et elles ont coûté cher avant d'être écrites.
 *
 * **Chaque famille ne montre que ses propres champs.** Un reçu de cotisation
 * n'a ni taux de TVA ni droit de timbre ; les lui proposer revient à inviter
 * à poser sur la pièce un jeton qui restera vide. Auparavant, tout ce qui
 * n'était pas une facture recevait le contrat du reçu de cotisation —
 * y compris un certificat de retenue à la source.
 *
 * **Le jeu d'exemple est le contrat d'émission, pas un décor.** C'est lui que
 * l'aperçu emploie et lui dont se déduit la palette de l'éditeur : un champ
 * qui figure ici et que l'action d'émission ne remet pas au moteur produit un
 * aperçu complet et une pièce réelle trouée. Toute valeur ajoutée ici doit
 * donc l'être d'abord dans l'action qui émet la famille.
 *
 * Les valeurs sont volontairement reconnaissables comme fausses : un aperçu
 * ne doit jamais pouvoir être pris pour une pièce émise.
 */

/**
 * Identité de la JE, commune à toutes les familles.
 *
 * Injectée à l'émission depuis le paramétrage — voir
 * `services/identite-je.ts`. Elle n'est donc plus un décor d'aperçu.
 */
const IDENTITE: Record<string, unknown> = {
  emetteurJE: "Mon association",
  sigleJE: "ASSOCIATION",
  adresseJE: "12 rue de l'Exemple, 1000 Ville",
  matriculeFiscal: "0000000X/X/X/000",
  telephoneJE: "+216 00 000 000",
  emailJE: "contact@exemple.org",
  siteJE: "exemple.org",
};

/** Ce que porte toute pièce émise, quelle que soit sa famille. */
const PIECE: Record<string, unknown> = {
  ...IDENTITE,
  reference: "XXX-000-2627",
  mandat: "2026-2027",
  emetteur: "Trésorier du mandat",
};

const EXEMPLES: Record<string, Record<string, unknown>> = {
  /* Reçu de cotisation — `actions/cotisations.ts`. */
  RECU_COTISATION: {
    ...PIECE,
    reference: "RC001-COT-2627",
    membre: "Exemple de membre",
    email: "membre@exemple.tn",
    cin: "00000000",
    qualite: "Membre",
    montant: 30,
    modePaiement: "Espèces",
    datePaiement: "09/08/2026",
  },

  /* Facture client — `actions/recus.ts`, `emettreFacturePdf`. */
  FACTURE_CLIENT: {
    ...PIECE,
    reference: "FAE-001-2627",
    numero: "F-2627-001",
    client: "Société exemple",
    adresseClient: "Adresse complète du client",
    matriculeClient: "0000000/X/X/X/000",
    objet: "Objet de la prestation",
    totalHT: "1500,000",
    tauxTVA: "19 %",
    totalTVA: "285,000",
    timbreFiscal: "1,000",
    totalTTC: "1786,000",
    mentionFiscale:
      "L'association, en tant que telle, est exonérée de la retenue à la source.",
    dateEmission: "08/09/2026",
    echeance: "08/10/2026",
    payeeLe: "",
    // Colonnes d'un tableau dont la source est `lignes` — elles ne figurent
    // pas dans la palette, puisqu'il y en a une par prestation.
    lignes: [
      {
        designation: "Prestation d'exemple",
        quantite: 1,
        prixUnitaire: "1500,000",
        totalHT: "1500,000",
        tauxTVA: "19 %",
        totalTVA: "285,000",
        total: "1785,000",
      },
    ],
  },

  /* Facture d'avoir — `actions/avoirs.ts`. */
  FACTURE_AVOIR: {
    ...PIECE,
    reference: "AV001-2627",
    numero: "AV001-2627",
    factureNumero: "F-2627-001",
    factureDate: "08/09/2026",
    factureMontantHT: 1500,
    client: "Société exemple",
    clientMatriculeFiscal: "0000000/X/X/X/000",
    montantHT: 500,
    tauxTVA: 19,
    motif: "Motif de la correction",
    dateEmission: "16/10/2026",
    annulationTotale: false,
  },

  /* Devis client — `crm/actions/devis.ts`, `genererDevis`. */
  DEVIS_CLIENT: {
    ...PIECE,
    reference: "DV001-2627",
    client: "Société exemple",
    clientMatriculeFiscal: "0000000/X/X/X/000",
    contact: "Nom du contact",
    objet: "Objet du devis",
    remisePourcent: 0,
    tauxTVA: 19,
    dateEmission: "16/10/2026",
    finValidite: "15/11/2026",
    delaiRealisation: "6 semaines",
    conditionsPaiement: "50 % à la commande, 50 % à la livraison.",
    lignes: [
      {
        designation: "Prestation d'exemple",
        quantite: 4,
        uniteLibelle: "jour/homme",
        prixUnitaire: 500,
      },
    ],
  },

  /* Bon de commande — `actions/bons-commande.ts`. */
  BON_COMMANDE: {
    ...PIECE,
    reference: "BC001-2627",
    numero: "BC001-2627",
    fournisseur: "Fournisseur exemple",
    fournisseurAdresse: "Adresse du fournisseur",
    fournisseurMatriculeFiscal: "0000000/X/X/X/000",
    objet: "Objet de la commande",
    tauxTVA: 19,
    sectionBudget: "Section budgétaire",
    dateEmission: "16/10/2026",
    livraisonPrevue: "02/11/2026",
    lignes: [
      { designation: "Article d'exemple", quantite: 4, prixUnitaire: 120 },
    ],
  },

  /* Certificat de retenue à la source — `actions/certificats-ras.ts`. */
  CERTIFICAT_RAS: {
    ...PIECE,
    reference: "RAS-001-2627",
    retenteur: "Mon association",
    retenteurMatriculeFiscal: "1993386M/P/N/000",
    beneficiaire: "Prestataire exemple",
    beneficiaireMatriculeFiscal: "0000000/X/X/X/000",
    beneficiaireAdresse: "Adresse du prestataire",
    factureReference: "F-2026-000",
    factureDate: "20/09/2026",
    natureOperation: "Nature de la prestation",
    montantTTC: 1191,
    typePrestataire: "HONORAIRES_REEL",
    dateReglement: "05/10/2026",
    modeReglement: "VIREMENT",
    dateEmission: "06/10/2026",
  },
};

/** Reçu d'encaissement — `documents/actions/documents.ts`. */
const RECU_ENCAISSEMENT: Record<string, unknown> = {
  ...PIECE,
  reference: "RC001-DON-2627",
  nature: "RECU_DON",
  titrePersonnalise: "",
  tiers: "Nom du tiers",
  montant: 250,
  date: "09/08/2026",
  objet: "Objet de l'encaissement",
  modePaiement: "Espèces",
  notes: "",
  lignes: [{ designation: "Désignation d'exemple", quantite: 1 }],
};

export function donneesExemple(modele: string): Record<string, unknown> {
  const connu = EXEMPLES[modele];
  if (connu) return connu;
  // Les autres reçus de la trésorerie partagent le contrat de l'encaissement.
  if (modele.startsWith("RECU_")) return RECU_ENCAISSEMENT;
  // Famille sans contrat déclaré : seulement ce que porte toute pièce. Mieux
  // vaut une palette courte qu'une palette qui promet ce qui ne viendra pas.
  return PIECE;
}

/**
 * Champs qu'un modèle peut poser, par famille — la palette de l'éditeur.
 * Elle se déduit du jeu d'exemple : un champ affichable est un champ qu'on
 * sait remplir, et les deux listes ne peuvent donc pas diverger.
 */
export function champsDisponibles(
  modele: string
): { jeton: string; exemple: string }[] {
  const exemple = donneesExemple(modele);
  return Object.entries(exemple)
    .filter(([, v]) => !Array.isArray(v))
    .map(([jeton, v]) => ({ jeton, exemple: String(v) }))
    .sort((a, b) => a.jeton.localeCompare(b.jeton, "fr"));
}
