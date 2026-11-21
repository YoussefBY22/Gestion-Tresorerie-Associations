import { describe, expect, it } from "vitest";
import {
  decouperReference,
  planifierSuppression,
  referencePourSequence,
  sequenceDeLaReference,
  type RecuDeLaSerie,
} from "./renumerotation-recus";

const brouillon = (id: string, sequence: number): RecuDeLaSerie => ({
  id,
  sequence,
  envoye: false,
  annule: false,
});
const envoye = (id: string, sequence: number): RecuDeLaSerie => ({
  id,
  sequence,
  envoye: true,
  annule: false,
});
const annule = (id: string, sequence: number): RecuDeLaSerie => ({
  id,
  sequence,
  envoye: false,
  annule: true,
});

describe("sequenceDeLaReference", () => {
  it("lit le numéro d'ordre d'une référence de reçu", () => {
    expect(sequenceDeLaReference("RC007-COT-2627")).toBe(7);
    expect(sequenceDeLaReference("RC001-TOMBOLA-2526")).toBe(1);
  });

  it("lit un numéro à plus de trois chiffres", () => {
    expect(sequenceDeLaReference("RC1024-COT-2627")).toBe(1024);
  });

  it("rend null sur une référence qui ne suit pas la nomenclature", () => {
    expect(sequenceDeLaReference("BUDG-04-2627")).toBeNull();
    expect(sequenceDeLaReference("")).toBeNull();
  });
});

describe("decouperReference", () => {
  it("sépare le préfixe, le rang et la série", () => {
    expect(decouperReference("RC007-COT-2627")).toEqual({
      prefixe: "RC",
      sequence: 7,
      suffixe: "-COT-2627",
    });
  });

  it("distingue deux séries qui partagent le même rang", () => {
    const cot = decouperReference("RC007-COT-2627");
    const tombola = decouperReference("RC007-TOMBOLA-2627");
    expect(cot?.suffixe).not.toBe(tombola?.suffixe);
  });

  it("rend null hors nomenclature", () => {
    expect(decouperReference("BUDG-04-2627")).toBeNull();
  });
});

describe("referencePourSequence", () => {
  it("garde la largeur du numéro", () => {
    expect(referencePourSequence("RC007-COT-2627", 2)).toBe("RC002-COT-2627");
    expect(referencePourSequence("RC012-COT-2627", 9)).toBe("RC009-COT-2627");
  });

  it("ne tronque pas un numéro plus long que la largeur d'origine", () => {
    expect(referencePourSequence("RC007-COT-2627", 1024)).toBe(
      "RC1024-COT-2627"
    );
  });

  it("refuse une référence hors nomenclature", () => {
    expect(() => referencePourSequence("BUDG-04-2627", 1)).toThrow();
  });
});

describe("planifierSuppression", () => {
  it("rend son numéro au dernier reçu de la série", () => {
    // RC001 envoyé, RC002 brouillon supprimé : le compteur redescend à 1.
    const plan = planifierSuppression([envoye("a", 1)], 2);
    expect(plan.decalages).toEqual([]);
    expect(plan.compteur).toBe(1);
    expect(plan.trouSubsiste).toBe(false);
  });

  it("fait redescendre les brouillons qui suivent", () => {
    // RC001 envoyé, RC002 supprimé, RC003 et RC004 encore brouillons.
    const plan = planifierSuppression(
      [envoye("a", 1), brouillon("c", 3), brouillon("d", 4)],
      2
    );
    expect(plan.decalages).toEqual([
      { id: "c", ancienneSequence: 3, nouvelleSequence: 2 },
      { id: "d", ancienneSequence: 4, nouvelleSequence: 3 },
    ]);
    expect(plan.compteur).toBe(3);
    expect(plan.trouSubsiste).toBe(false);
  });

  it("décale dans l'ordre croissant, pour ne pas heurter l'unicité", () => {
    const plan = planifierSuppression(
      [brouillon("d", 4), brouillon("b", 2), brouillon("c", 3)],
      1
    );
    expect(plan.decalages.map((d) => d.ancienneSequence)).toEqual([2, 3, 4]);
  });

  it("ne touche à rien quand un reçu envoyé suit : le trou reste", () => {
    // RC003 est parti chez le cotisant, il ne peut pas devenir RC002.
    const plan = planifierSuppression(
      [envoye("a", 1), envoye("c", 3), brouillon("d", 4)],
      2
    );
    expect(plan.decalages).toEqual([]);
    expect(plan.compteur).toBe(4);
    expect(plan.trouSubsiste).toBe(true);
  });

  it("traite un reçu annulé comme un point fixe", () => {
    // Une annulation vaut précisément par sa référence conservée.
    const plan = planifierSuppression([annule("c", 3)], 2);
    expect(plan.decalages).toEqual([]);
    expect(plan.trouSubsiste).toBe(true);
    expect(plan.compteur).toBe(3);
  });

  it("remet le compteur à zéro quand la série se vide", () => {
    const plan = planifierSuppression([], 1);
    expect(plan.compteur).toBe(0);
    expect(plan.trouSubsiste).toBe(false);
  });

  it("ne réattribue pas un numéro laissé libre plus bas", () => {
    // Trou déjà présent en 2 (reçu envoyé puis série bloquée) : supprimer le
    // dernier ne doit pas ramener le compteur sous le plus haut numéro pris.
    const plan = planifierSuppression([envoye("a", 1), envoye("c", 3)], 4);
    expect(plan.compteur).toBe(3);
  });
});
