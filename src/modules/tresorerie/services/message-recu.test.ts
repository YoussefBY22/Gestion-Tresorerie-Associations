import { describe, expect, it } from "vitest";
import {
  messageEnHtml,
  messagePropose,
  remplirMessage,
} from "./message-recu";

describe("remplirMessage", () => {
  it("remplace les jetons par leurs valeurs", () => {
    expect(
      remplirMessage("Reçu {{reference}} de {{montant}}", {
        reference: "RC001-COT-2627",
        montant: "30,000 DT",
      })
    ).toBe("Reçu RC001-COT-2627 de 30,000 DT");
  });

  it("n'imprime jamais les accolades d'un jeton sans valeur", () => {
    // Voir « {{montant}} » dans un courriel reçu serait humiliant pour la JE,
    // là où un blanc passe pour une maladresse de frappe.
    expect(remplirMessage("Somme : {{montant}}.", { reference: "R" })).toBe(
      "Somme : ."
    );
    expect(remplirMessage("{{inconnu}}", { reference: "R" })).toBe("");
  });

  it("remplace un destinataire sans nom par une formule qui se lit", () => {
    expect(remplirMessage("Bonjour {{destinataire}},", { reference: "R" })).toBe(
      "Bonjour Madame, Monsieur,"
    );
    expect(
      remplirMessage("Bonjour {{destinataire}},", { reference: "R", destinataire: "  " })
    ).toBe("Bonjour Madame, Monsieur,");
  });

  it("se rabat sur une formule qui se lit quand l'identité manque", () => {
    expect(
      remplirMessage("{{emetteurJE}} / {{emetteur}}", { reference: "R" })
    ).toBe("l'association / Le Trésorier");
  });

  it("élide « de » devant une voyelle", () => {
    // « auprès de Amicale » dans un courriel qui part à un cotisant : la
    // faute se voit, et c'est l'association qui la signe.
    expect(
      remplirMessage("auprès {{de:emetteurJE}}", {
        reference: "R",
        emetteurJE: "Amicale des anciens",
      })
    ).toBe("auprès d'Amicale des anciens");
    expect(
      remplirMessage("auprès {{de:emetteurJE}}", {
        reference: "R",
        emetteurJE: "Club des amis",
      })
    ).toBe("auprès de Club des amis");
  });

  it("garde « de » devant un h, qu'on ne sait pas trancher sans dictionnaire", () => {
    // « d'Hammamet » mais « de Hollande » : aucune règle ne les sépare.
    expect(
      remplirMessage("{{de:emetteurJE}}", { reference: "R", emetteurJE: "Hammamet" })
    ).toBe("de Hammamet");
  });

  it("n'écrit pas la préposition d'un jeton vide", () => {
    expect(
      remplirMessage("auprès {{de:inconnu}}.", { reference: "R" })
    ).toBe("auprès .");
  });

  it("tolère les espaces dans les accolades", () => {
    expect(remplirMessage("{{ reference }}", { reference: "R" })).toBe("R");
  });
});

describe("messagePropose", () => {
  const donnees = {
    reference: "RC001-COT-2627",
    destinataire: "Youssef Ben Youssef",
    montant: "30,000 DT",
    emetteurJE: "Amicale des anciens",
    emetteur: "Le Trésorier du mandat",
  };

  it("parle de cotisation pour un reçu de cotisation", () => {
    const message = messagePropose("RECU_COTISATION", donnees);
    expect(message.sujet).toContain("cotisation");
    expect(message.corps).toContain("votre cotisation");
    expect(message.corps).toContain("RC001-COT-2627");
  });

  it("remercie un donateur autrement qu'un cotisant", () => {
    // On n'accuse pas réception d'un don comme d'une cotisation due.
    const don = messagePropose("RECU_DON", donnees);
    const cotisation = messagePropose("RECU_COTISATION", donnees);
    expect(don.corps).not.toBe(cotisation.corps);
    expect(don.corps).toContain("remercions");
    expect(don.corps).toContain("registre des dons");
  });

  it("a une formule propre à chaque famille du catalogue", () => {
    const familles = [
      "RECU_COTISATION",
      "RECU_DON",
      "RECU_PRODUIT",
      "RECU_JOB",
      "RECU_INTEGRATION",
    ];
    const corps = new Set(familles.map((f) => messagePropose(f, donnees).corps));
    expect(corps.size).toBe(familles.length);
  });

  it("se rabat sur une formule vraie pour tout encaissement", () => {
    const message = messagePropose("RECU_TOMBOLA_MAISON", donnees);
    expect(message.sujet).toContain("RC001-COT-2627");
    expect(message.corps).toContain("Bonjour Youssef Ben Youssef");
    expect(message.corps).not.toContain("{{");
  });

  it("ne laisse aucun jeton dans le message proposé", () => {
    for (const famille of ["RECU_COTISATION", "RECU_DON", "RECU_DIVERS"]) {
      const message = messagePropose(famille, { reference: "R" });
      expect(message.sujet).not.toContain("{{");
      expect(message.corps).not.toContain("{{");
    }
  });
});

describe("messageEnHtml", () => {
  it("fait un paragraphe de chaque bloc séparé par une ligne vide", () => {
    const html = messageEnHtml("Bonjour,\n\nVoici le reçu.");
    expect(html).toContain("Bonjour,");
    expect(html).toContain("Voici le reçu.");
    expect((html.match(/<p /g) ?? []).length).toBe(2);
  });

  it("fait un saut de ligne d'un retour simple", () => {
    expect(messageEnHtml("Cordialement,\nLe Trésorier")).toContain("<br/>");
  });

  it("échappe les caractères réservés", () => {
    // Un « & » dans un nom d'entreprise casserait sinon le rendu.
    const html = messageEnHtml("Durand & Fils <société>");
    expect(html).toContain("Durand &amp; Fils");
    expect(html).toContain("&lt;société&gt;");
    expect(html).not.toContain("<société>");
  });

  it("rend une chaîne vide sans balise orpheline", () => {
    expect(messageEnHtml("")).toBe("<p style=\"margin:0 0 12px\"></p>");
  });
});
