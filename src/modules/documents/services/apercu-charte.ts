import type { StructureDocument } from "./structure";
import { construireRecuCotisation } from "./gabarits/recu-cotisation";
import { construireRecuEncaissement } from "./gabarits/recu-encaissement";
import { construireFactureClient } from "./gabarits/facture-client";

/**
 * Document d'exemple pour prévisualiser une charte.
 *
 * L'aperçu passe par les **vrais gabarits** et le vrai moteur de rendu, avec
 * des données inventées. Une maquette dessinée à part finirait par mentir :
 * elle vieillirait à la première retouche du gabarit, et le Trésorier
 * validerait une allure que ses pièces n'auraient pas.
 *
 * La référence affichée est volontairement factice et le document porte un
 * filigrane : un aperçu ne doit jamais pouvoir passer pour une pièce émise.
 */

const LE_MOIS_DERNIER = new Date(Date.now() - 30 * 24 * 3600 * 1000);

export function structureDApercu(modele: string): StructureDocument {
  const commun = { mandat: "2026-2027", emetteur: "Trésorier" };

  if (modele === "RECU_COTISATION") {
    return {
      ...construireRecuCotisation({
        reference: "RC001-COT-2627",
        membre: "Exemple de cotisant",
        cin: "01234567",
        email: "cotisant@exemple.org",
        qualite: "Membre",
        montant: 30,
        modePaiement: "Espèces",
        datePaiement: LE_MOIS_DERNIER,
        ...commun,
      }),
      filigrane: "Aperçu",
    };
  }

  if (modele === "FACTURE_CLIENT") {
    return {
      ...construireFactureClient({
        reference: "FE001-2627",
        numero: "FE001-2627",
        client: "Société exemple",
        objet: "Prestation de démonstration",
        lignes: [
          { designation: "Étude et conception", montantHT: 1200 },
          { designation: "Accompagnement", montantHT: 450 },
        ],
        tauxTVA: 19,
        timbreFiscal: 1,
        dateEmission: LE_MOIS_DERNIER,
        echeance: new Date(),
        payeeLe: null,
        ...commun,
      }),
      filigrane: "Aperçu",
    };
  }

  // Toutes les autres familles empruntent le reçu d'encaissement : c'est la
  // mise en page la plus représentative (bandeau, champs, total, signatures),
  // et la charte se juge sur elle aussi bien que sur une autre.
  return {
    ...construireRecuEncaissement({
      reference: "RC001-DIV-2627",
      nature: "RECU_DIVERS",
      tiers: "Exemple de tiers",
      montant: 250,
      date: LE_MOIS_DERNIER,
      objet: "Aperçu du modèle",
      modePaiement: "Virement",
      ...commun,
    }),
    filigrane: "Aperçu",
  };
}
