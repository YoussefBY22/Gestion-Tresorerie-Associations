/**
 * Fiscalité mensuelle — logique pure, testée.
 *
 * Reprend l'outil « OTMT » (Optima Tax Management Tool) du drive : un classeur
 * par mois, sept feuilles, des formules recopiées à la main. Les règles
 * ci-dessous reproduisent **exactement** ses formules, y compris ses
 * particularités — notamment le timbre fiscal retranché de l'assiette de la
 * retenue à la source (`(TTC − 1) × taux`).
 *
 * ⚠️ Les taux et seuils sont ceux saisis dans l'outil de la JE. Ils relèvent
 * de la législation tunisienne et changent par loi de finances : ils sont
 * regroupés ici, en un seul endroit, pour que le Trésorier puisse les vérifier
 * et les faire évoluer sans toucher au reste.
 */

/** Timbre fiscal par facture, en dinars. */
export const TIMBRE_FISCAL_DT = 1;

/** Taux de TVA de droit commun, en pourcentage. */
export const TAUX_TVA_DEFAUT = 19;

/**
 * Seuil général au-delà duquel une facture fournisseur est soumise à retenue
 * à la source, quel que soit le type de prestataire.
 */
export const SEUIL_RAS_GENERAL_DT = 1000;

export type TypePrestataire = {
  code: string;
  libelle: string;
  /** Taux appliqué, en fraction (0.03 = 3 %). */
  taux: number;
  /** Le taux ne s'applique qu'au-dessus **strictement** de ce montant TTC. */
  seuil: number;
};

/** Table des taux, reprise de la feuille « Configuration » de l'OTMT. */
export const TYPES_PRESTATAIRE: TypePrestataire[] = [
  {
    code: "HONORAIRES_REEL",
    libelle: "Honoraires (personne physique au régime réel)",
    taux: 0.03,
    seuil: 0,
  },
  { code: "LOCATION_HOTEL", libelle: "Location hôtel", taux: 0.05, seuil: 0 },
  {
    code: "MARCHE_15",
    libelle: "Au titre de marché 15 %",
    taux: 0.01,
    seuil: 1000,
  },
  {
    code: "MARCHE_35",
    libelle: "Au titre de marché 35 % ou personne physique au barème",
    taux: 0.015,
    seuil: 1000,
  },
  {
    code: "MARCHE_10",
    libelle: "Au titre de marché 10 %",
    taux: 0.005,
    seuil: 1000,
  },
  {
    code: "HONORAIRES_FORFAIT",
    libelle: "Honoraires (personne physique au régime forfaitaire)",
    taux: 0.1,
    seuil: 0,
  },
  {
    code: "LOYERS_IMMEUBLES",
    libelle: "Loyers d'immeubles bâtis et non bâtis",
    taux: 0.1,
    seuil: 0,
  },
];

export const TYPES_PRESTATAIRE_PAR_CODE = Object.fromEntries(
  TYPES_PRESTATAIRE.map((t) => [t.code, t])
);

/** Arrondi au millime — l'unité de compte en Tunisie. */
export function arrondirMillime(montant: number): number {
  return Math.round(montant * 1000) / 1000;
}

/**
 * Taux de retenue applicable. Renvoie 0 quand le type est inconnu ou quand le
 * montant TTC ne dépasse pas le seuil du type — c'est le comportement de la
 * formule d'origine, qui retombait sur 0 plutôt que d'échouer.
 */
export function tauxRAS(codeType: string | null | undefined, ttc: number): number {
  if (!codeType) return 0;
  const type = TYPES_PRESTATAIRE_PAR_CODE[codeType];
  if (!type) return 0;
  return ttc > type.seuil ? type.taux : 0;
}

/**
 * Une facture fournisseur est soumise à retenue si elle dépasse le seuil
 * général **ou** si son prestataire relève d'un type configuré.
 */
export function estSoumisRAS(facture: {
  montantTTC: number;
  typePrestataire?: string | null;
}): boolean {
  return (
    facture.montantTTC >= SEUIL_RAS_GENERAL_DT ||
    Boolean(
      facture.typePrestataire &&
        TYPES_PRESTATAIRE_PAR_CODE[facture.typePrestataire]
    )
  );
}

/**
 * Montant de la retenue à la source.
 *
 * L'assiette est le TTC **diminué du timbre fiscal** : le timbre n'est pas une
 * contrepartie du service, il ne doit pas supporter la retenue. C'est la
 * formule `(TTC − 1) × taux` de l'outil d'origine.
 */
export function montantRAS(facture: {
  montantTTC: number;
  typePrestataire?: string | null;
}): number {
  if (!estSoumisRAS(facture)) return 0;
  const taux = tauxRAS(facture.typePrestataire, facture.montantTTC);
  if (taux === 0) return 0;
  return arrondirMillime((facture.montantTTC - TIMBRE_FISCAL_DT) * taux);
}

/* ------------------------------------------------------------------ */
/* Totaux d'un côté et de l'autre                                      */
/* ------------------------------------------------------------------ */

export type FactureEmisePourDeclaration = {
  montantHT: number;
  tauxTVA: number;
  timbreFiscal?: number;
};

export type FactureRecuePourDeclaration = {
  montantHT: number;
  tauxTVA: number;
  timbreFiscal?: number;
  autresTaxes?: number;
  /** Une TVA non récupérable ne vient pas en déduction. */
  tvaDeductible?: boolean;
  montantTTC: number;
  typePrestataire?: string | null;
};

export type LigneAgios = { montantHT: number; tauxTVA?: number };

export function tvaDe(montantHT: number, tauxTVA: number): number {
  return arrondirMillime((montantHT * tauxTVA) / 100);
}

export function ttcDe(
  montantHT: number,
  tauxTVA: number,
  timbre = TIMBRE_FISCAL_DT
): number {
  return arrondirMillime(montantHT + tvaDe(montantHT, tauxTVA) + timbre);
}

export type TotauxCote = {
  totalHT: number;
  totalTVA: number;
  totalTimbres: number;
  totalTTC: number;
  nombre: number;
};

export function totaliserEmises(
  factures: FactureEmisePourDeclaration[]
): TotauxCote {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTimbres = 0;
  for (const f of factures) {
    totalHT += f.montantHT;
    totalTVA += tvaDe(f.montantHT, f.tauxTVA);
    totalTimbres += f.timbreFiscal ?? TIMBRE_FISCAL_DT;
  }
  return {
    totalHT: arrondirMillime(totalHT),
    totalTVA: arrondirMillime(totalTVA),
    totalTimbres: arrondirMillime(totalTimbres),
    totalTTC: arrondirMillime(totalHT + totalTVA + totalTimbres),
    nombre: factures.length,
  };
}

export function totaliserRecues(
  factures: FactureRecuePourDeclaration[]
): TotauxCote & { totalRAS: number } {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTimbres = 0;
  let totalTTC = 0;
  let totalRAS = 0;
  for (const f of factures) {
    totalHT += f.montantHT;
    // Une TVA non récupérable est bien payée au fournisseur mais ne vient pas
    // en déduction de la TVA collectée.
    if (f.tvaDeductible !== false) totalTVA += tvaDe(f.montantHT, f.tauxTVA);
    totalTimbres += f.timbreFiscal ?? TIMBRE_FISCAL_DT;
    totalTTC += f.montantTTC;
    totalRAS += montantRAS(f);
  }
  return {
    totalHT: arrondirMillime(totalHT),
    totalTVA: arrondirMillime(totalTVA),
    totalTimbres: arrondirMillime(totalTimbres),
    totalTTC: arrondirMillime(totalTTC),
    totalRAS: arrondirMillime(totalRAS),
    nombre: factures.length,
  };
}

export function totaliserAgios(lignes: LigneAgios[]): {
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
} {
  let totalHT = 0;
  let totalTVA = 0;
  for (const l of lignes) {
    totalHT += l.montantHT;
    totalTVA += tvaDe(l.montantHT, l.tauxTVA ?? TAUX_TVA_DEFAUT);
  }
  return {
    totalHT: arrondirMillime(totalHT),
    totalTVA: arrondirMillime(totalTVA),
    totalTTC: arrondirMillime(totalHT + totalTVA),
  };
}

/* ------------------------------------------------------------------ */
/* Déclaration mensuelle                                               */
/* ------------------------------------------------------------------ */

export type NatureTVA = "A_PAYER" | "A_REPORTER" | "NEANT";

export const LIBELLES_NATURE_TVA: Record<NatureTVA, string> = {
  A_PAYER: "TVA à payer",
  A_REPORTER: "TVA à reporter",
  NEANT: "Déclaration néant",
};

export type Declaration = {
  emises: TotauxCote;
  recues: TotauxCote & { totalRAS: number };
  agios: { totalHT: number; totalTVA: number; totalTTC: number };
  /** TVA collectée − TVA déductible (factures + agios), avant report. */
  soldeTVA: number;
  /** Crédit reporté du mois précédent, négatif quand c'est un crédit. */
  reportPrecedent: number;
  /** Solde après imputation du report. */
  soldeApresReport: number;
  nature: NatureTVA;
  tvaAPayer: number;
  /** Crédit à reporter sur le mois suivant (valeur négative ou nulle). */
  tvaAReporter: number;
  /** Total effectivement dû au Trésor : TVA + timbres + retenues. */
  montantAPayer: number;
};

/**
 * Calcule la déclaration du mois.
 *
 * Convention de signe, reprise de l'outil : `reportPrecedent` est le crédit
 * de TVA du mois précédent, donc **négatif**. Le solde après report décide
 * de la nature — positif on paie, négatif on reporte, nul déclaration néant.
 */
export function calculerDeclaration(entrees: {
  facturesEmises: FactureEmisePourDeclaration[];
  facturesRecues: FactureRecuePourDeclaration[];
  agios?: LigneAgios[];
  reportPrecedent?: number;
}): Declaration {
  const emises = totaliserEmises(entrees.facturesEmises);
  const recues = totaliserRecues(entrees.facturesRecues);
  const agios = totaliserAgios(entrees.agios ?? []);
  const reportPrecedent = arrondirMillime(entrees.reportPrecedent ?? 0);

  const soldeTVA = arrondirMillime(
    emises.totalTVA - (recues.totalTVA + agios.totalTVA)
  );
  const soldeApresReport = arrondirMillime(soldeTVA + reportPrecedent);

  const nature: NatureTVA =
    soldeApresReport > 0 ? "A_PAYER" : soldeApresReport < 0 ? "A_REPORTER" : "NEANT";

  const tvaAPayer = nature === "A_PAYER" ? soldeApresReport : 0;
  const tvaAReporter = nature === "A_REPORTER" ? soldeApresReport : 0;

  return {
    emises,
    recues,
    agios,
    soldeTVA,
    reportPrecedent,
    soldeApresReport,
    nature,
    tvaAPayer,
    tvaAReporter,
    // Le timbre est dû sur les factures émises ; la retenue opérée sur les
    // fournisseurs est reversée par la JE, elle s'ajoute donc au versement.
    montantAPayer: arrondirMillime(
      tvaAPayer + emises.totalTimbres + recues.totalRAS
    ),
  };
}

/** Mois précédent au format AAAA-MM. */
export function moisPrecedent(mois: string): string {
  const [annee, m] = mois.split("-").map(Number);
  if (!annee || !m) throw new Error(`Mois invalide : « ${mois} ».`);
  return m === 1
    ? `${annee - 1}-12`
    : `${annee}-${String(m - 1).padStart(2, "0")}`;
}

const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2026-02 » → « février 2026 ». */
export function libelleMois(mois: string): string {
  const [annee, m] = mois.split("-").map(Number);
  if (!annee || !m || m < 1 || m > 12) return mois;
  return `${NOMS_MOIS[m - 1]} ${annee}`;
}
