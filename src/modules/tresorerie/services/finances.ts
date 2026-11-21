/**
 * Logique financière pure — testée sans base de données.
 * Solde (EX-TRS-04), réalisé vs prévu par ligne budgétaire (EX-TRS-02),
 * alertes et rappels automatiques (story 06.9).
 */

export type FluxPourCalcul = {
  type: "ENCAISSEMENT" | "DECAISSEMENT";
  montant: number;
  categorie: string;
  justificatifRef?: string | null;
};

export type LignePourCalcul = {
  categorie: string;
  type: "PRODUIT" | "CHARGE";
  prevu: number;
};

/** Solde courant = solde initial + encaissements − décaissements. */
export function calculerSolde(soldeInitial: number, flux: FluxPourCalcul[]): number {
  const total = flux.reduce(
    (s, f) => s + (f.type === "ENCAISSEMENT" ? f.montant : -f.montant),
    soldeInitial
  );
  return Math.round(total * 100) / 100;
}

/** Réalisé par ligne budgétaire + écart (dépassement pour les charges). */
export function realiseParLigne(
  lignes: LignePourCalcul[],
  flux: FluxPourCalcul[]
): {
  categorie: string;
  type: "PRODUIT" | "CHARGE";
  prevu: number;
  realise: number;
  ecart: number;
  depassement: boolean;
}[] {
  return lignes.map((ligne) => {
    const realise =
      Math.round(
        flux
          .filter(
            (f) =>
              f.categorie === ligne.categorie &&
              (ligne.type === "PRODUIT"
                ? f.type === "ENCAISSEMENT"
                : f.type === "DECAISSEMENT")
          )
          .reduce((s, f) => s + f.montant, 0) * 100
      ) / 100;
    return {
      ...ligne,
      realise,
      ecart: Math.round((realise - ligne.prevu) * 100) / 100,
      depassement: ligne.type === "CHARGE" && realise > ligne.prevu,
    };
  });
}

/** Nombre de flux sans justificatif (bloquant pour la clôture mensuelle). */
export function fluxSansJustificatif(flux: FluxPourCalcul[]): number {
  return flux.filter((f) => !f.justificatifRef?.trim()).length;
}

/** Numérotation continue des factures : F-2526-001 pour « 2025-2026 ». */
export function numeroFacture(anneeMandat: string, sequence: number): string {
  const court = anneeMandat.replace(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/, "$2$4");
  return `F-${court}-${String(sequence).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Rappels financiers (cron) — idempotents par clé                     */
/* ------------------------------------------------------------------ */

export type ObligationPourRappel = {
  id: string;
  libelle: string;
  prochaineEcheance: Date;
};
export type FacturePourRappel = {
  id: string;
  numero: string;
  statut: "EMISE" | "PAYEE";
  echeance: Date;
};

export type RappelFinancier = {
  cle: string;
  titre: string;
  message: string;
  type: "echeance" | "alerte";
  critique: boolean;
};

const JOUR_MS = 86_400_000;
const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function construireRappelsFinanciers(
  obligations: ObligationPourRappel[],
  factures: FacturePourRappel[],
  maintenant: Date
): RappelFinancier[] {
  const rappels: RappelFinancier[] = [];

  for (const o of obligations) {
    const delta = o.prochaineEcheance.getTime() - maintenant.getTime();
    if (delta >= 0 && delta <= 7 * JOUR_MS) {
      // Clé datée sur l'échéance : ré-alerte à chaque nouvelle période.
      rappels.push({
        cle: `fiscal-j7:${o.id}:${o.prochaineEcheance.toISOString().slice(0, 10)}`,
        titre: `Échéance fiscale ≤ 7 jours : ${o.libelle}`,
        message: `À déposer avant le ${df.format(o.prochaineEcheance)} (rétention des preuves : 10 ans).`,
        type: "echeance",
        critique: true,
      });
    }
  }

  for (const f of factures) {
    if (f.statut === "EMISE" && f.echeance.getTime() < maintenant.getTime()) {
      rappels.push({
        cle: `facture-retard:${f.id}`,
        titre: `Facture en retard : ${f.numero}`,
        message: `Échéance dépassée depuis le ${df.format(f.echeance)} — relancez le client.`,
        type: "alerte",
        critique: true,
      });
    }
  }
  return rappels;
}
