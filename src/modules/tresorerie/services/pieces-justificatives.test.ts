import { describe, expect, it } from "vitest";
import {
  ATTENDU_PAR_REGISTRE,
  REGISTRES_AVEC_PIECES,
  TAILLE_MAX_PIECE,
  nomDePiece,
  verifierPiece,
} from "./pieces-justificatives";

const pdf = { nom: "recu.pdf", type: "application/pdf", taille: 120_000 };

describe("verifierPiece", () => {
  it("accepte un PDF de taille raisonnable", () => {
    expect(verifierPiece(pdf).possible).toBe(true);
  });

  it("refuse un fichier vide", () => {
    const v = verifierPiece({ ...pdf, taille: 0 });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/vide/);
  });

  it("refuse tout ce qui n'est pas un PDF, en disant quoi faire", () => {
    // Un .docx se réouvre modifié, un .heic ne s'ouvre pas partout.
    for (const type of [
      "image/jpeg",
      "image/heic",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      undefined,
    ]) {
      const v = verifierPiece({ ...pdf, type });
      expect(v.possible).toBe(false);
      expect(v.raison).toMatch(/PDF/);
    }
  });

  it("accepte exactement la taille maximale", () => {
    expect(verifierPiece({ ...pdf, taille: TAILLE_MAX_PIECE }).possible).toBe(
      true
    );
  });

  it("refuse au-delà, en nommant la taille et le remède", () => {
    const v = verifierPiece({ ...pdf, taille: TAILLE_MAX_PIECE + 1 });
    expect(v.possible).toBe(false);
    expect(v.raison).toMatch(/5 Mo maximum/);
    expect(v.raison).toMatch(/200 ppp/);
  });
});

describe("nomDePiece", () => {
  it("garde le nom transmis par le navigateur", () => {
    expect(nomDePiece("dons", "Convention Fondation.pdf")).toBe(
      "Convention Fondation.pdf"
    );
  });

  it("retombe sur un nom parlant quand il n'y en a pas", () => {
    expect(nomDePiece("cheques-dettes")).toBe("justificatif-cheques-dettes.pdf");
    expect(nomDePiece("dons", "   ")).toBe("justificatif-dons.pdf");
  });
});

describe("ATTENDU_PAR_REGISTRE", () => {
  it("dit à chaque registre ce qu'on y attend", () => {
    // Un champ « pièce jointe » sans exemple ne reçoit jamais rien.
    for (const registre of REGISTRES_AVEC_PIECES) {
      expect(ATTENDU_PAR_REGISTRE[registre].length).toBeGreaterThan(10);
    }
  });
});
