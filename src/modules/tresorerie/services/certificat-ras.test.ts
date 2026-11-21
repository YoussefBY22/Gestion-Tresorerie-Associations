import { describe, expect, it } from "vitest";
import { detailRetenue, verifierCertificat } from "./certificat-ras";

/** Honoraires au régime réel : 3 %, sans seuil. */
const honoraires = { montantTTC: 1191, typePrestataire: "HONORAIRES_REEL" };

describe("verifierCertificat — refus", () => {
  it("refuse une facture sans montant", () => {
    const v = verifierCertificat({ ...honoraires, montantTTC: 0 });
    expect(v.possible).toBe(false);
  });

  it("refuse quand le type de prestataire manque", () => {
    // Sans lui aucun taux ne s'applique : c'est la facture qu'il faut
    // compléter, et le message doit le dire.
    const v = verifierCertificat({ montantTTC: 1191, typePrestataire: null });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/type de prestataire n'est pas renseigné/);
  });

  it("refuse un type absent de la table des taux", () => {
    const v = verifierCertificat({
      montantTTC: 1191,
      typePrestataire: "INVENTE",
    });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/ne figure pas dans la table/);
  });

  it("refuse sous le seuil du type, en nommant le seuil", () => {
    // MARCHE_15 : 1 % au-delà de 1 000 DT TTC seulement.
    const v = verifierCertificat({
      montantTTC: 800,
      typePrestataire: "MARCHE_15",
    });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/1000,000 DT TTC/);
  });
});

describe("verifierCertificat — acceptation", () => {
  it("accepte des honoraires au régime réel", () => {
    expect(verifierCertificat(honoraires).possible).toBe(true);
  });

  it("accepte un marché au-dessus de son seuil", () => {
    expect(
      verifierCertificat({ montantTTC: 1500, typePrestataire: "MARCHE_15" })
        .possible
    ).toBe(true);
  });
});

describe("detailRetenue", () => {
  it("retranche le timbre de l'assiette", () => {
    // Le timbre n'est pas la contrepartie d'un service : (1191 − 1) × 3 %.
    const d = detailRetenue(honoraires);
    expect(d.assiette).toBe(1190);
    expect(d.tauxPourcent).toBe(3);
    expect(d.retenue).toBe(35.7);
  });

  it("rend le net effectivement versé au prestataire", () => {
    const d = detailRetenue(honoraires);
    expect(d.netVerse).toBe(1155.3);
    expect(d.retenue + d.netVerse).toBe(honoraires.montantTTC);
  });

  it("imprime l'assiette qu'a employée le calcul, pas une autre", () => {
    // L'assiette × taux doit redonner la retenue affichée, sinon la pièce ne
    // s'additionne pas. Le timbre figé à 1 DT vient de `montantRAS`, donc de
    // la déclaration : le certificat annonce ce qui a été réellement versé.
    const d = detailRetenue(honoraires);
    expect(Math.round(d.assiette * (d.tauxPourcent / 100) * 1000) / 1000).toBe(
      d.retenue
    );
  });

  it("nomme le régime tel qu'il doit figurer sur la pièce", () => {
    expect(detailRetenue(honoraires).regime).toMatch(/régime réel/);
  });

  it("applique 10 % aux honoraires au forfait", () => {
    const d = detailRetenue({
      montantTTC: 2001,
      typePrestataire: "HONORAIRES_FORFAIT",
    });
    expect(d.tauxPourcent).toBe(10);
    expect(d.retenue).toBe(200);
  });

  it("rend des zéros sans lever sur une facture non soumise", () => {
    // Un registre qui affiche une ligne incomplète ne doit pas tomber.
    const d = detailRetenue({ montantTTC: 500, typePrestataire: null });
    expect(d.retenue).toBe(0);
    expect(d.tauxPourcent).toBe(0);
    expect(d.netVerse).toBe(500);
    expect(d.regime).toMatch(/non renseigné/);
  });

  it("ne rend jamais une assiette négative", () => {
    const d = detailRetenue({ montantTTC: 0.5, typePrestataire: null });
    expect(d.assiette).toBe(0);
  });
});
