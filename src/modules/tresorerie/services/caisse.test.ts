import { describe, expect, it } from "vitest";
import {
  comptePourMode,
  feuilleDeCompte,
  soldesMensuels,
  soldesParCompte,
  soldeBancaireRetenu,
  type FluxPourCaisse,
  type MouvementInterne,
} from "./caisse";

const flux = (
  type: "ENCAISSEMENT" | "DECAISSEMENT",
  compte: "CAISSE" | "BANQUE",
  montant: number,
  date: Date,
  justificatifRef?: string
): FluxPourCaisse => ({
  type,
  compte,
  montant,
  date,
  tiers: "Tiers",
  categorie: "Divers",
  justificatifRef,
});

const INITIAUX = { caisse: 100, banque: 1000 };

describe("comptePourMode", () => {
  it("range les espèces en caisse et le reste en banque", () => {
    expect(comptePourMode("ESPECES")).toBe("CAISSE");
    expect(comptePourMode("VIREMENT")).toBe("BANQUE");
    expect(comptePourMode("CHEQUE")).toBe("BANQUE");
    expect(comptePourMode(undefined)).toBe("BANQUE");
  });
});

describe("soldesParCompte", () => {
  it("ventile les flux sur le bon compte", () => {
    const s = soldesParCompte(INITIAUX, [
      flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 5)),
      flux("DECAISSEMENT", "BANQUE", 200, new Date(2026, 0, 6)),
    ]);
    expect(s).toEqual({ caisse: 130, banque: 800, total: 930 });
  });

  it("un mouvement interne déplace sans créer d'argent", () => {
    // C'est l'invariant qui distingue un virement d'une recette.
    const mouvements: MouvementInterne[] = [
      { sens: "RETRAIT", montant: 500, date: new Date(2026, 0, 10) },
    ];
    const s = soldesParCompte(INITIAUX, [], mouvements);
    expect(s.caisse).toBe(600);
    expect(s.banque).toBe(500);
    expect(s.total).toBe(INITIAUX.caisse + INITIAUX.banque);
  });

  it("le versement joue en sens inverse du retrait", () => {
    const s = soldesParCompte(INITIAUX, [], [
      { sens: "VERSEMENT", montant: 60, date: new Date(2026, 0, 10) },
    ]);
    expect(s.caisse).toBe(40);
    expect(s.banque).toBe(1060);
    expect(s.total).toBe(1100);
  });

  it("arrête le calcul à une date donnée", () => {
    const s = soldesParCompte(
      INITIAUX,
      [
        flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 5)),
        flux("ENCAISSEMENT", "CAISSE", 70, new Date(2026, 1, 5)),
      ],
      [],
      new Date(2026, 0, 31, 23, 59, 59)
    );
    expect(s.caisse).toBe(130);
  });
});

describe("feuilleDeCompte", () => {
  it("dresse la chronologie avec le solde après chaque opération", () => {
    const { lignes, soldeFinal } = feuilleDeCompte("CAISSE", 100, [
      flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 5), "RC001"),
      flux("DECAISSEMENT", "CAISSE", 20, new Date(2026, 0, 8), "F12"),
    ]);
    expect(lignes.map((l) => l.soldeCourant)).toEqual([130, 110]);
    expect(soldeFinal).toBe(110);
    expect(lignes[0].credit).toBe(30);
    expect(lignes[1].debit).toBe(20);
  });

  it("ignore les opérations de l'autre compte", () => {
    const { lignes } = feuilleDeCompte("CAISSE", 100, [
      flux("ENCAISSEMENT", "BANQUE", 500, new Date(2026, 0, 5)),
    ]);
    expect(lignes).toHaveLength(0);
  });

  it("fait apparaître un retrait en entrée de caisse et en sortie de banque", () => {
    const m: MouvementInterne[] = [
      { sens: "RETRAIT", montant: 200, date: new Date(2026, 0, 3), reference: "R01" },
    ];
    const caisse = feuilleDeCompte("CAISSE", 0, [], m);
    const banque = feuilleDeCompte("BANQUE", 1000, [], m);
    expect(caisse.lignes[0].credit).toBe(200);
    expect(banque.lignes[0].debit).toBe(200);
    expect(caisse.soldeFinal).toBe(200);
    expect(banque.soldeFinal).toBe(800);
  });

  it("remet les opérations en ordre chronologique", () => {
    const { lignes } = feuilleDeCompte("CAISSE", 0, [
      flux("ENCAISSEMENT", "CAISSE", 10, new Date(2026, 0, 20)),
      flux("ENCAISSEMENT", "CAISSE", 5, new Date(2026, 0, 2)),
    ]);
    expect(lignes.map((l) => l.credit)).toEqual([5, 10]);
  });

  it("garde l'ordre de saisie à date égale", () => {
    // Sans tri stable, le solde courant changerait d'un affichage à l'autre.
    const meme = new Date(2026, 0, 7);
    const { lignes } = feuilleDeCompte("CAISSE", 0, [
      flux("ENCAISSEMENT", "CAISSE", 1, meme),
      flux("ENCAISSEMENT", "CAISSE", 2, meme),
      flux("ENCAISSEMENT", "CAISSE", 3, meme),
    ]);
    expect(lignes.map((l) => l.credit)).toEqual([1, 2, 3]);
  });

  it("signale une opération sans justificatif", () => {
    const { lignes } = feuilleDeCompte("CAISSE", 0, [
      flux("DECAISSEMENT", "CAISSE", 10, new Date(2026, 0, 4)),
      flux("DECAISSEMENT", "CAISSE", 10, new Date(2026, 0, 5), "  "),
      flux("DECAISSEMENT", "CAISSE", 10, new Date(2026, 0, 6), "F1"),
    ]);
    expect(lignes.map((l) => l.sansJustificatif)).toEqual([true, true, false]);
  });

  it("ne réclame pas de justificatif pour un virement interne", () => {
    const { lignes } = feuilleDeCompte("CAISSE", 0, [], [
      { sens: "RETRAIT", montant: 50, date: new Date(2026, 0, 4) },
    ]);
    expect(lignes[0].sansJustificatif).toBe(false);
  });
});

describe("soldesMensuels", () => {
  it("donne le solde de clôture de chaque mois", () => {
    const s = soldesMensuels(INITIAUX, [
      flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 15)),
      flux("ENCAISSEMENT", "BANQUE", 500, new Date(2026, 1, 10)),
    ]);
    expect(s.map((x) => x.mois)).toEqual(["2026-01", "2026-02"]);
    expect(s[0]).toMatchObject({ caisse: 130, banque: 1000, entrees: 30 });
    expect(s[1]).toMatchObject({ caisse: 130, banque: 1500, entrees: 500 });
  });

  it("inclut le dernier jour du mois dans sa clôture", () => {
    // Une opération du 31 à 20 h doit compter dans le mois, pas dans le suivant.
    const s = soldesMensuels(INITIAUX, [
      flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 31, 20, 0)),
    ]);
    expect(s[0].caisse).toBe(130);
  });

  it("conserve les mois sans mouvement pour ne pas trouer la série", () => {
    const s = soldesMensuels(INITIAUX, [
      flux("ENCAISSEMENT", "CAISSE", 30, new Date(2026, 0, 15)),
      flux("ENCAISSEMENT", "CAISSE", 10, new Date(2026, 3, 15)),
    ]);
    expect(s.map((x) => x.mois)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(s[1].entrees).toBe(0);
    expect(s[1].caisse).toBe(130); // le solde se reporte
  });

  it("franchit le changement d'année", () => {
    const s = soldesMensuels(INITIAUX, [
      flux("ENCAISSEMENT", "CAISSE", 10, new Date(2025, 11, 15)),
      flux("ENCAISSEMENT", "CAISSE", 10, new Date(2026, 0, 15)),
    ]);
    expect(s.map((x) => x.mois)).toEqual(["2025-12", "2026-01"]);
  });

  it("renvoie une série vide sans aucun mouvement", () => {
    expect(soldesMensuels(INITIAUX, [])).toEqual([]);
  });
});

describe("solde bancaire retenu", () => {
  it("retient le calcul tant qu'aucun relevé n'a été saisi", () => {
    expect(soldeBancaireRetenu(1458, null)).toEqual({
      valeur: 1458,
      source: "CALCULE",
      ecart: null,
    });
  });

  it("retient le relevé dès qu'il existe, et mesure l'écart", () => {
    expect(soldeBancaireRetenu(1458, { solde: 0 })).toEqual({
      valeur: 0,
      source: "RELEVE",
      ecart: -1458,
    });
  });

  it("accepte un relevé supérieur au calcul — un encaissement non saisi", () => {
    expect(soldeBancaireRetenu(100, { solde: 250 }).ecart).toBe(150);
  });

  it("accepte un compte à découvert", () => {
    expect(soldeBancaireRetenu(50, { solde: -30 }).valeur).toBe(-30);
  });
});
