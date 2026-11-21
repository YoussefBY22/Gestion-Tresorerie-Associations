import { describe, expect, it } from "vitest";
import {
  composerFamilles,
  familleDeLaCle,
  numerosParFamille,
  prefixeCompteur,
  segmentReference,
  type ModeleCatalogueRecu,
  type PersonnalisationFamille,
} from "./familles-recus";

const catalogue: ModeleCatalogueRecu[] = [
  {
    code: "RECU_COTISATION",
    libelle: "Reçu de cotisation",
    formatReference: "RC{seq:3}-COT-{mandat}",
  },
  {
    code: "RECU_DON",
    libelle: "Reçu de don",
    formatReference: "RC{seq:3}-DON-{mandat}",
  },
  {
    code: "RECU_DIVERS",
    libelle: "Reçu d'encaissement divers",
    formatReference: "RC{seq:3}-DIV-{mandat}",
  },
];

const perso = (
  p: Partial<PersonnalisationFamille> & { id: string }
): PersonnalisationFamille => ({
  libelle: "Tombola",
  code: "TOMBOLA",
  actif: true,
  ...p,
});

describe("segmentReference", () => {
  it("extrait le segment entre les jetons", () => {
    expect(segmentReference("RC{seq:3}-COT-{mandat}")).toBe("COT");
    expect(segmentReference("RC{seq:3}-JOBS-{mandat}")).toBe("JOBS");
  });

  it("se rabat sur le repli quand le format ne suit pas cette forme", () => {
    expect(segmentReference("FE{seq:3}-{mandat}", "FACTURE")).toBe("FACTURE");
  });
});

describe("familleDeLaCle", () => {
  it("retire le mandat d'une clé du catalogue", () => {
    expect(familleDeLaCle("RECU_COTISATION:2526")).toBe("RECU_COTISATION");
  });

  it("garde le code de variante d'une famille de la JE", () => {
    expect(familleDeLaCle("RECU_DIVERS:TOMBOLA:2526")).toBe(
      "RECU_DIVERS:TOMBOLA"
    );
  });

  it("ne confond pas les reçus divers du catalogue et leurs variantes", () => {
    const numeros = numerosParFamille([
      { cle: "RECU_DIVERS:2526", valeur: 3 },
      { cle: "RECU_DIVERS:TOMBOLA:2526", valeur: 8 },
    ]);
    expect(numeros.get("RECU_DIVERS")).toBe(3);
    expect(numeros.get("RECU_DIVERS:TOMBOLA")).toBe(8);
  });

  it("ignore une clé qui ne ressemble à rien", () => {
    expect(familleDeLaCle("nimportequoi")).toBeNull();
    expect(numerosParFamille([{ cle: "nimportequoi", valeur: 4 }]).size).toBe(0);
  });
});

describe("numerosParFamille", () => {
  it("additionne les compteurs d'une même famille sur plusieurs mandats", () => {
    const numeros = numerosParFamille([
      { cle: "RECU_COTISATION:2526", valeur: 12 },
      { cle: "RECU_COTISATION:2627", valeur: 7 },
    ]);
    expect(numeros.get("RECU_COTISATION")).toBe(19);
  });
});

describe("prefixeCompteur", () => {
  it("numérote le catalogue sous son propre code", () => {
    expect(
      prefixeCompteur({
        origine: "CATALOGUE",
        code: "COT",
        valeur: "RECU_COTISATION",
      })
    ).toBe("RECU_COTISATION");
  });

  it("numérote une famille de la JE dans sa propre série", () => {
    expect(
      prefixeCompteur({ origine: "JE", code: "TOMBOLA", valeur: "perso:x" })
    ).toBe("RECU_DIVERS:TOMBOLA");
  });
});

describe("composerFamilles", () => {
  it("présente le catalogue puis les familles de la JE", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [
        perso({ id: "a", libelle: "Tombola", code: "TOMBOLA" }),
        perso({ id: "b", libelle: "JeBex", code: "JEBEX" }),
      ],
      compteurs: [],
    });
    expect(familles.map((f) => f.libelle)).toEqual([
      "Reçu de cotisation",
      "Reçu de don",
      "Reçu d'encaissement divers",
      "JeBex",
      "Tombola",
    ]);
    expect(familles.slice(0, 3).every((f) => f.origine === "CATALOGUE")).toBe(true);
  });

  it("propose tout le catalogue tant que rien n'a été supprimé", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [],
      compteurs: [],
    });
    expect(familles.map((f) => f.valeur)).toEqual([
      "RECU_COTISATION",
      "RECU_DON",
      "RECU_DIVERS",
    ]);
  });

  it("laisse une personnalisation renommer une famille du catalogue", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [
        perso({
          id: "c",
          modele: "RECU_DIVERS",
          libelle: "Encaissement ponctuel",
          code: "DIV",
        }),
      ],
      compteurs: [],
    });
    const divers = familles.find((f) => f.valeur === "RECU_DIVERS");
    expect(divers?.libelle).toBe("Encaissement ponctuel");
    expect(divers?.typeRecuId).toBe("c");
  });

  it("sort de la liste une famille du catalogue supprimée", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [
        perso({ id: "c", modele: "RECU_DIVERS", code: "DIV", actif: false }),
      ],
      compteurs: [],
    });
    expect(familles.some((f) => f.valeur === "RECU_DIVERS")).toBe(false);
    expect(familles.some((f) => f.valeur === "RECU_COTISATION")).toBe(true);
  });

  it("garde le segment du catalogue même renommée", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [
        perso({ id: "d", modele: "RECU_COTISATION", libelle: "Adhésion", code: "COT" }),
      ],
      compteurs: [],
    });
    const cotisation = familles.find((f) => f.valeur === "RECU_COTISATION");
    expect(cotisation?.libelle).toBe("Adhésion");
    expect(cotisation?.code).toBe("COT");
    expect(cotisation?.codeModifiable).toBe(false);
  });

  it("verrouille le code d'une famille de la JE dès le premier numéro attribué", () => {
    const [libre, entamee] = [
      composerFamilles({
        catalogue,
        personnalisations: [perso({ id: "a" })],
        compteurs: [],
      }),
      composerFamilles({
        catalogue,
        personnalisations: [perso({ id: "a" })],
        compteurs: [{ cle: "RECU_DIVERS:TOMBOLA:2526", valeur: 2 }],
      }),
    ].map((familles) => familles.find((f) => f.valeur === "perso:a"));

    expect(libre?.codeModifiable).toBe(true);
    expect(libre?.numerosAttribues).toBe(0);
    expect(entamee?.codeModifiable).toBe(false);
    expect(entamee?.numerosAttribues).toBe(2);
  });

  it("compte les numéros d'une famille du catalogue", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [],
      compteurs: [{ cle: "RECU_COTISATION:2526", valeur: 5 }],
    });
    expect(
      familles.find((f) => f.valeur === "RECU_COTISATION")?.numerosAttribues
    ).toBe(5);
    expect(familles.find((f) => f.valeur === "RECU_DON")?.numerosAttribues).toBe(
      0
    );
  });

  /*
   * Le cas qui a dérouté Youssef : tous les reçus supprimés, corbeille vidée,
   * et le compteur qui tient bon. C'est voulu — sans lui, RC001-COT-2627
   * serait réémis — mais l'écran ne doit surtout pas en conclure « des reçus
   * existent ».
   */
  it("garde les numéros attribués même quand plus aucun reçu n'existe", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [],
      compteurs: [{ cle: "RECU_COTISATION:2627", valeur: 7 }],
    });
    expect(
      familles.find((f) => f.valeur === "RECU_COTISATION")?.numerosAttribues
    ).toBe(7);
  });

  it("sort de la liste une famille de la JE supprimée", () => {
    const familles = composerFamilles({
      catalogue,
      personnalisations: [perso({ id: "a", actif: false })],
      compteurs: [],
    });
    expect(familles.some((f) => f.valeur === "perso:a")).toBe(false);
  });
});
