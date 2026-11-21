import { describe, expect, it } from "vitest";
import {
  alerteEspeces,
  compterDepassementsEspeces,
  depasseLePlafondEspeces,
  PLAFOND_ESPECES_DT,
} from "./conformite-especes";

describe("alerteEspeces", () => {
  it("laisse passer un règlement en espèces sous le plafond", () => {
    expect(
      alerteEspeces({ type: "DECAISSEMENT", modePaiement: "ESPECES", montant: 499 })
    ).toBeNull();
  });

  it("laisse passer le plafond lui-même : la loi vise le dépassement", () => {
    expect(
      alerteEspeces({
        type: "DECAISSEMENT",
        modePaiement: "ESPECES",
        montant: PLAFOND_ESPECES_DT,
      })
    ).toBeNull();
  });

  it("ne dit rien d'un gros montant payé par virement ou par chèque", () => {
    for (const modePaiement of ["VIREMENT", "CHEQUE", "CARTE", "AUTRE"]) {
      expect(
        alerteEspeces({ type: "DECAISSEMENT", modePaiement, montant: 5000 })
      ).toBeNull();
    }
  });

  it("signale un décaissement en espèces au-delà du plafond, avec la consigne", () => {
    const alerte = alerteEspeces({
      type: "DECAISSEMENT",
      modePaiement: "ESPECES",
      montant: 800,
    });
    expect(alerte?.motif).toContain("800");
    expect(alerte?.motif).toContain("2011-88");
    expect(alerte?.consigne).not.toBe("");
  });

  it("signale aussi un encaissement en espèces, mais la consigne diffère", () => {
    const encaissement = alerteEspeces({
      type: "ENCAISSEMENT",
      modePaiement: "ESPECES",
      montant: 800,
    });
    const decaissement = alerteEspeces({
      type: "DECAISSEMENT",
      modePaiement: "ESPECES",
      montant: 800,
    });
    expect(encaissement).not.toBeNull();
    expect(encaissement?.consigne).not.toBe(decaissement?.consigne);
  });

  it("ne s'émeut pas d'un mode de paiement absent", () => {
    expect(
      depasseLePlafondEspeces({ type: "DECAISSEMENT", montant: 5000 })
    ).toBe(false);
  });
});

describe("compterDepassementsEspeces", () => {
  it("compte les opérations hors plafond, tous sens confondus", () => {
    expect(
      compterDepassementsEspeces([
        { type: "DECAISSEMENT", modePaiement: "ESPECES", montant: 800 },
        { type: "DECAISSEMENT", modePaiement: "ESPECES", montant: 120 },
        { type: "ENCAISSEMENT", modePaiement: "ESPECES", montant: 1200 },
        { type: "DECAISSEMENT", modePaiement: "CHEQUE", montant: 9000 },
      ])
    ).toBe(2);
  });

  it("rend zéro sur un journal vide", () => {
    expect(compterDepassementsEspeces([])).toBe(0);
  });
});
