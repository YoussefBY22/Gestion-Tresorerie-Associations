import { describe, expect, it } from "vitest";
import {
  appliquerModele,
  lienEmail,
  lienWhatsApp,
  normaliserNumeroWhatsApp,
} from "./liens-contact";

describe("appliquerModele", () => {
  it("substitue les variables fournies", () => {
    expect(
      appliquerModele("Bonjour {contact} de {organisation}", {
        contact: "Sarah",
        organisation: "Camel Studio",
      })
    ).toBe("Bonjour Sarah de Camel Studio");
  });

  it("retire proprement une variable sans valeur", () => {
    // Le client ne doit jamais recevoir « Bonjour , » ni « {contact} ».
    expect(appliquerModele("Bonjour {contact}, ravi", {})).toBe("Bonjour, ravi");
  });

  it("laisse intact un modèle sans variable", () => {
    expect(appliquerModele("Bonjour", { contact: "X" })).toBe("Bonjour");
  });
});

describe("normaliserNumeroWhatsApp", () => {
  it("nettoie les séparateurs d'un numéro international", () => {
    expect(normaliserNumeroWhatsApp("+216 22 333 444")).toBe("21622333444");
  });

  it("convertit le préfixe 00 en indicatif direct", () => {
    expect(normaliserNumeroWhatsApp("0033612345678")).toBe("33612345678");
  });

  it("préfixe l'indicatif par défaut sur un numéro local", () => {
    expect(normaliserNumeroWhatsApp("22333444")).toBe("21622333444");
    expect(normaliserNumeroWhatsApp("022333444")).toBe("21622333444");
  });

  it("respecte un indicatif par défaut personnalisé", () => {
    expect(normaliserNumeroWhatsApp("612345678", "33")).toBe("33612345678");
  });

  it("rejette les entrées inexploitables", () => {
    expect(normaliserNumeroWhatsApp(undefined)).toBeNull();
    expect(normaliserNumeroWhatsApp("")).toBeNull();
    expect(normaliserNumeroWhatsApp("téléphone")).toBeNull();
    expect(normaliserNumeroWhatsApp("+1234567890123456789")).toBeNull();
  });
});

describe("lienWhatsApp", () => {
  it("construit un lien wa.me avec message encodé", () => {
    const lien = lienWhatsApp("+216 22 333 444", "Bonjour Sarah & équipe");
    expect(lien).toBe(
      "https://wa.me/21622333444?text=Bonjour%20Sarah%20%26%20%C3%A9quipe"
    );
  });

  it("renvoie null si le numéro est inexploitable", () => {
    expect(lienWhatsApp(null, "Bonjour")).toBeNull();
  });
});

describe("lienEmail", () => {
  it("construit un mailto avec objet et corps", () => {
    expect(lienEmail("a@b.tn", "Suivi", "Bonjour,\nMerci")).toBe(
      "mailto:a@b.tn?subject=Suivi&body=Bonjour%2C%0AMerci"
    );
  });

  it("renvoie null sur une adresse invalide", () => {
    expect(lienEmail("pas-un-email", "x", "y")).toBeNull();
    expect(lienEmail(undefined, "x", "y")).toBeNull();
  });
});
