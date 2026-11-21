import { describe, expect, it } from "vitest";
import {
  QUOTA_CA_JE_DT,
  couvertureFondsDeRoulement,
  fondsDeRoulementCible,
  objectifEnVigueur,
  objectifModifiable,
  objectifSupprimable,
  statutQuota,
} from "./strategie-financiere";

describe("quota de chiffre d'affaires", () => {
  it("constate le quota atteint ou non avec l'écart signé", () => {
    expect(statutQuota(8075, QUOTA_CA_JE_DT)).toMatchObject({
      ecart: 4075,
      atteint: true,
    });
    expect(statutQuota(1000, QUOTA_CA_JE_DT)).toMatchObject({
      ecart: -3000,
      atteint: false,
    });
  });

  it("compte l'égalité stricte comme quota atteint", () => {
    expect(statutQuota(QUOTA_CA_JE_DT, QUOTA_CA_JE_DT).atteint).toBe(true);
  });
});

describe("fonds de roulement", () => {
  it("multiplie le nombre de mois par les charges fixes moyennes", () => {
    expect(fondsDeRoulementCible(12, 223.636)).toBeCloseTo(2683.632, 2);
  });

  it("calcule la couverture du fonds de roulement", () => {
    expect(couvertureFondsDeRoulement(4945.7, 2683.636)).toBeCloseTo(1.843, 2);
  });

  it("ne calcule pas de couverture sans cible définie", () => {
    // Une cible nulle rendrait une couverture infinie, pas informative.
    expect(couvertureFondsDeRoulement(1000, 0)).toBeNull();
  });
});

describe("suppression d'un objectif verrouillé", () => {
  it("se supprime librement quand il n'est pas verrouillé", () => {
    expect(objectifSupprimable(false)).toBe(true);
  });

  it("exige une demande acceptée quand il est verrouillé", () => {
    expect(objectifSupprimable(true)).toBe(false);
    expect(objectifSupprimable(true, { statut: "EN_ATTENTE" })).toBe(false);
    expect(objectifSupprimable(true, { statut: "REFUSEE" })).toBe(false);
    expect(objectifSupprimable(true, { statut: "ACCEPTEE" })).toBe(true);
  });
});

describe("objectif en vigueur", () => {
  it("compte tout de suite quand il n'est pas verrouillé", () => {
    expect(objectifEnVigueur(false, null)).toBe(true);
    expect(objectifEnVigueur(false, { statut: "EN_ATTENTE" })).toBe(true);
  });

  it("compte de lui-même quand il vient de la Norme JE", () => {
    expect(objectifEnVigueur(true, null)).toBe(true);
  });

  it("attend l'accord du Président quand le Trésorier le propose", () => {
    expect(objectifEnVigueur(true, { statut: "EN_ATTENTE" })).toBe(false);
    expect(objectifEnVigueur(true, { statut: "REFUSEE" })).toBe(false);
    expect(objectifEnVigueur(true, { statut: "ACCEPTEE" })).toBe(true);
  });
});

describe("objectif modifiable", () => {
  it("laisse retoucher un objectif libre", () => {
    expect(objectifModifiable(false, null)).toBe(true);
  });

  it("laisse retoucher une proposition tant qu'elle n'est pas acceptée", () => {
    expect(objectifModifiable(true, { statut: "EN_ATTENTE" })).toBe(true);
  });

  it("grave un objectif verrouillé et en vigueur", () => {
    expect(objectifModifiable(true, null)).toBe(false);
    expect(objectifModifiable(true, { statut: "ACCEPTEE" })).toBe(false);
  });
});
