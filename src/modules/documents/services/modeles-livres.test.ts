import { describe, expect, it } from "vitest";
import { champsDisponibles, donneesExemple } from "./modeles-livres";

const jetons = (famille: string) =>
  champsDisponibles(famille).map((c) => c.jeton);

describe("champsDisponibles — chaque famille ne montre que ses champs", () => {
  it("ne propose ni TVA ni timbre sur un reçu", () => {
    // Les poser sur un reçu produirait un jeton qui reste vide à l'émission.
    for (const recu of [
      "RECU_COTISATION",
      "RECU_DON",
      "RECU_PRODUIT",
      "RECU_JOB",
      "RECU_INTEGRATION",
      "RECU_DIVERS",
    ]) {
      const liste = jetons(recu);
      expect(liste).not.toContain("tauxTVA");
      expect(liste).not.toContain("timbreFiscal");
      expect(liste).not.toContain("totalTTC");
    }
  });

  it("propose les totaux et le client sur une facture", () => {
    const liste = jetons("FACTURE_CLIENT");
    for (const attendu of [
      "totalHT",
      "tauxTVA",
      "totalTVA",
      "timbreFiscal",
      "totalTTC",
      "adresseClient",
      "matriculeClient",
      "mentionFiscale",
      "numero",
    ]) {
      expect(liste).toContain(attendu);
    }
  });

  it("ne propose pas les champs d'un reçu sur une facture", () => {
    const liste = jetons("FACTURE_CLIENT");
    expect(liste).not.toContain("cotisant");
    expect(liste).not.toContain("membre");
    expect(liste).not.toContain("cin");
  });

  it("donne au certificat de retenue ses propres champs", () => {
    // Auparavant, tout ce qui n'était pas une facture recevait le contrat du
    // reçu de cotisation — y compris ce certificat.
    const liste = jetons("CERTIFICAT_RAS");
    expect(liste).toContain("beneficiaire");
    expect(liste).toContain("montantTTC");
    expect(liste).toContain("dateReglement");
    expect(liste).not.toContain("membre");
  });

  it("distingue le devis, le bon de commande et l'avoir", () => {
    expect(jetons("DEVIS_CLIENT")).toContain("finValidite");
    expect(jetons("BON_COMMANDE")).toContain("fournisseur");
    expect(jetons("BON_COMMANDE")).not.toContain("finValidite");
    expect(jetons("FACTURE_AVOIR")).toContain("factureNumero");
    expect(jetons("FACTURE_AVOIR")).toContain("motif");
  });

  it("rend une palette courte, et non trompeuse, pour une famille sans contrat", () => {
    const liste = jetons("ATTESTATION_MEMBRE");
    expect(liste).toContain("reference");
    expect(liste).toContain("mandat");
    expect(liste).not.toContain("montant");
    expect(liste).not.toContain("tauxTVA");
  });
});

describe("identité de la JE", () => {
  it("est offerte à toutes les familles", () => {
    // Elle est injectée centralement à l'émission : toute pièce peut la poser.
    for (const famille of [
      "RECU_COTISATION",
      "FACTURE_CLIENT",
      "CERTIFICAT_RAS",
      "BON_COMMANDE",
      "RAPPORT_SYNTHESE_TRESORERIE",
    ]) {
      const liste = jetons(famille);
      expect(liste).toContain("emetteurJE");
      expect(liste).toContain("matriculeFiscal");
      expect(liste).toContain("adresseJE");
    }
  });
});

describe("donneesExemple", () => {
  it("garde les lignes hors de la palette : il y en a une par prestation", () => {
    expect(donneesExemple("FACTURE_CLIENT").lignes).toBeDefined();
    expect(jetons("FACTURE_CLIENT")).not.toContain("lignes");
    expect(jetons("FACTURE_CLIENT")).not.toContain("designation");
  });

  it("écrit les montants d'une facture à trois décimales", () => {
    // Le moteur rend un entier « 1 500 » et un décimal « 1500,500 » : sur une
    // facture, le total rond et la TVA ne s'écriraient pas pareil.
    const exemple = donneesExemple("FACTURE_CLIENT");
    expect(exemple.totalHT).toBe("1500,000");
    expect(exemple.totalTVA).toBe("285,000");
    expect(exemple.totalTTC).toBe("1786,000");
  });

  it("emploie des valeurs reconnaissables comme fausses", () => {
    // Un aperçu ne doit jamais pouvoir être pris pour une pièce émise.
    const exemple = donneesExemple("FACTURE_CLIENT");
    expect(String(exemple.client)).toMatch(/exemple/i);
    expect(String(exemple.matriculeClient)).toMatch(/0000000/);
  });
});
