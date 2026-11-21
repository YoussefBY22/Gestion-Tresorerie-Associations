import { describe, expect, it } from "vitest";
import { formaterDate, formaterMontantDT, montantEnLettres } from "./structure";

describe("formaterMontantDT", () => {
  it("utilise les 3 décimales et la virgule de l'usage tunisien", () => {
    expect(formaterMontantDT(30)).toBe("30,000 DT");
    expect(formaterMontantDT(1423.5)).toBe("1423,500 DT");
    expect(formaterMontantDT(0.75)).toBe("0,750 DT");
  });
});

describe("formaterDate", () => {
  it("formate en JJ/MM/AAAA avec les zéros de tête", () => {
    expect(formaterDate(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formaterDate(new Date(2026, 11, 31))).toBe("31/12/2026");
  });
});

describe("montantEnLettres", () => {
  it("écrit la cotisation de référence", () => {
    // 30 DT = une cotisation courante : le cas qui sera imprimé des dizaines
    // de fois par mandat.
    expect(montantEnLettres(30)).toBe("trente dinars");
  });

  it("accorde le singulier", () => {
    expect(montantEnLettres(1)).toBe("un dinar");
  });

  it("gère les liaisons irrégulières du français", () => {
    expect(montantEnLettres(21)).toBe("vingt et un dinars");
    expect(montantEnLettres(22)).toBe("vingt-deux dinars");
    expect(montantEnLettres(71)).toBe("soixante et onze dinars");
    expect(montantEnLettres(80)).toBe("quatre-vingts dinars");
    expect(montantEnLettres(81)).toBe("quatre-vingt-un dinars");
    expect(montantEnLettres(91)).toBe("quatre-vingt-onze dinars");
  });

  it("gère les centaines et les milliers", () => {
    expect(montantEnLettres(100)).toBe("cent dinars");
    expect(montantEnLettres(200)).toBe("deux cents dinars");
    expect(montantEnLettres(201)).toBe("deux cent un dinars");
    expect(montantEnLettres(1000)).toBe("mille dinars");
    expect(montantEnLettres(4500)).toBe("quatre mille cinq cents dinars");
  });

  it("ajoute les millimes quand il y en a", () => {
    expect(montantEnLettres(30.5)).toBe("trente dinars et cinq cents millimes");
    expect(montantEnLettres(1.25)).toBe(
      "un dinar et deux cent cinquante millimes"
    );
  });

  it("n'ajoute pas de millimes pour un montant rond", () => {
    expect(montantEnLettres(30)).not.toMatch(/millime/);
  });
});
