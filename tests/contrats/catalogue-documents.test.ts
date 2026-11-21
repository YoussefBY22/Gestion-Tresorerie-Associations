import { describe, expect, it } from "vitest";
import {
  CATALOGUE_DOCUMENTS as CATALOGUE,
  MODELES_DISPONIBLES,
} from "@/modules/documents/catalogue";
import {
  champsDisponibles,
  donneesExemple,
} from "@/modules/documents/services/modeles-livres";

/**
 * Cohérence du catalogue des pièces.
 *
 * Le catalogue est le contrat du moteur de documents : il nomme les familles,
 * leur numérotation et leur module. Une incohérence ici ne se voit pas à
 * l'écran — elle se voit sur la pièce remise au client, des semaines plus
 * tard, quand il est trop tard pour la reprendre.
 *
 * Ces tests gardent trois propriétés que le code seul ne garantit pas :
 * l'unicité des codes et des séries, la validité des formats de référence, et
 * le fait qu'une palette de champs corresponde à une famille réelle.
 */

describe("catalogue des familles de documents", () => {
  it("n'a aucun code en double", () => {
    // Deux familles de même code, et c'est le compteur de l'une qui numérote
    // les pièces de l'autre.
    const codes = CATALOGUE.map((m) => m.code);
    const doublons = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(doublons).toEqual([]);
  });

  it("n'a aucun format de référence en double", () => {
    // Deux familles partageant un format partagent une série : les numéros
    // s'entremêlent et la piste d'audit se rompt.
    const formats = CATALOGUE.map((m) => m.formatReference);
    const doublons = formats.filter((f, i) => formats.indexOf(f) !== i);
    expect(doublons).toEqual([]);
  });

  it("donne à chaque famille un format de référence exploitable", () => {
    for (const modele of CATALOGUE) {
      // Il faut un discriminant, sans quoi deux pièces porteraient le même
      // numéro : une séquence le plus souvent, le mois pour les pièces dont
      // il n'en existe qu'une par mois (la déclaration fiscale).
      expect(modele.formatReference, modele.code).toMatch(
        /\{seq(:\d+)?\}|\{mois\}/
      );
      // Sans le mandat, une série repartirait de zéro par-dessus l'ancienne.
      expect(modele.formatReference, modele.code).toContain("{mandat}");
    }
  });

  it("rattache chaque famille à un module et à une catégorie", () => {
    // Sans module, la famille échappe au contrôle de permission ; sans
    // catégorie, elle disparaît du catalogue affiché, qui range par
    // catégorie — introuvable, donc jamais émise.
    for (const modele of CATALOGUE) {
      expect(modele.module, modele.code).toBeTruthy();
      expect(modele.categorie, modele.code).toBeTruthy();
    }
  });

  it("décrit chaque famille, pour que le Trésorier la reconnaisse", () => {
    for (const modele of CATALOGUE) {
      expect(modele.libelle.length, modele.code).toBeGreaterThan(3);
    }
  });
});

describe("palette de champs et contrat d'émission", () => {
  /**
   * Le jeu d'exemple **est** le contrat d'émission : il nourrit l'aperçu et
   * la palette de l'éditeur. Un champ qui y figure sans être fourni par
   * l'action produit un aperçu complet et une pièce réelle trouée — le défaut
   * le plus coûteux de ce moteur, parce qu'il ne se voit qu'après l'envoi.
   */
  const DISPONIBLES = MODELES_DISPONIBLES;

  it("propose une palette non vide à chaque famille disponible", () => {
    for (const modele of DISPONIBLES) {
      const champs = champsDisponibles(modele.code);
      expect(champs.length, `${modele.code} n'a aucun champ`).toBeGreaterThan(3);
    }
  });

  it("donne à toute pièce la référence, le mandat et son émetteur", () => {
    for (const modele of DISPONIBLES) {
      const jetons = champsDisponibles(modele.code).map((c) => c.jeton);
      for (const attendu of ["reference", "mandat", "emetteur"]) {
        expect(jetons, `${modele.code} sans {{${attendu}}}`).toContain(attendu);
      }
    }
  });

  it("offre l'identité de la JE à toute famille", () => {
    // Elle est injectée centralement à l'émission : toute pièce peut donc la
    // poser, quel que soit le module qui l'émet.
    for (const modele of DISPONIBLES) {
      const jetons = champsDisponibles(modele.code).map((c) => c.jeton);
      for (const attendu of ["emetteurJE", "adresseJE", "matriculeFiscal"]) {
        expect(jetons, `${modele.code} sans {{${attendu}}}`).toContain(attendu);
      }
    }
  });

  it("n'expose jamais les lignes comme un champ à glisser", () => {
    // Il y en a une par prestation : elles se branchent en colonnes de
    // tableau, pas en jeton unique.
    for (const modele of DISPONIBLES) {
      const jetons = champsDisponibles(modele.code).map((c) => c.jeton);
      expect(jetons, modele.code).not.toContain("lignes");
    }
  });

  it("ne propose ni TVA ni timbre sur un reçu", () => {
    // Les poser sur un reçu produirait un jeton qui reste vide à l'émission.
    for (const modele of DISPONIBLES.filter((m) => m.categorie === "RECU")) {
      const jetons = champsDisponibles(modele.code).map((c) => c.jeton);
      expect(jetons, modele.code).not.toContain("tauxTVA");
      expect(jetons, modele.code).not.toContain("timbreFiscal");
    }
  });

  it("donne des valeurs d'exemple reconnaissables comme fausses", () => {
    // Un aperçu ne doit jamais pouvoir être pris pour une pièce émise.
    const exemple = donneesExemple("FACTURE_CLIENT");
    expect(String(exemple.client)).toMatch(/exemple/i);
  });
});
