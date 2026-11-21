import { describe, expect, it } from "vitest";
import { dateISO, mandatCourant, mandatJuilletJuin, mandatSuivant } from "./mandat";

describe("mandat juillet-juin", () => {
  it("commence le 1er juillet et finit le 30 juin suivant", () => {
    const m = mandatJuilletJuin(2026);
    expect(m.annee).toBe("2026-2027");
    expect(m.debut).toEqual(new Date(2026, 6, 1));
    expect(m.fin).toEqual(new Date(2027, 5, 30));
  });
});

describe("mandat courant", () => {
  it("reste dans le mandat entamé l'année civile précédente avant juillet", () => {
    // Mars 2027 est dans le mandat 2026-2027, pas 2027-2028.
    expect(mandatCourant(new Date(2027, 2, 15)).annee).toBe("2026-2027");
  });

  it("bascule sur le nouveau mandat dès juillet", () => {
    expect(mandatCourant(new Date(2027, 6, 1)).annee).toBe("2027-2028");
  });

  it("reste dans le mandat en cours en juin, dernier mois", () => {
    expect(mandatCourant(new Date(2027, 5, 30)).annee).toBe("2026-2027");
  });
});

describe("mandat suivant", () => {
  it("enchaîne sur l'année civile de fin du mandat précédent", () => {
    const suivant = mandatSuivant("2026-2027");
    expect(suivant?.annee).toBe("2027-2028");
    expect(suivant?.debut).toEqual(new Date(2027, 6, 1));
  });

  it("ne devine rien sur un format illisible", () => {
    expect(mandatSuivant("mandat 26")).toBeNull();
    expect(mandatSuivant("")).toBeNull();
  });
});

describe("format de date pour un input HTML", () => {
  it("rend AAAA-MM-DD avec les zéros de tête", () => {
    expect(dateISO(new Date(2026, 6, 1))).toBe("2026-07-01");
    expect(dateISO(new Date(2027, 0, 5))).toBe("2027-01-05");
  });
});
