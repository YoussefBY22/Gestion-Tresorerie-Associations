/**
 * Message d'accompagnement d'un reçu — logique pure, testée.
 *
 * Le Trésorier envoie une pièce comptable à un tiers : le courriel qui la
 * porte fait partie de la pièce. Le laisser taper à chaque fois produirait
 * autant de formulations que d'envois, dont certaines maladroites, et ferait
 * perdre du temps sur les deux cent cinquante reçus d'un mandat.
 *
 * Le message est donc **proposé selon la famille du reçu** — on ne remercie
 * pas un donateur comme on accuse réception d'une cotisation — et reste
 * **modifiable avant l'envoi**. Proposer sans imposer : la formule couvre le
 * cas courant, le Trésorier garde la main sur le cas particulier.
 */

export type ModeleMessage = { sujet: string; corps: string };

/**
 * Formules par famille du catalogue. Le tutoiement est écarté : un reçu peut
 * partir à un partenaire ou à une administration.
 */
const PAR_FAMILLE: Record<string, ModeleMessage> = {
  RECU_COTISATION: {
    sujet: "Votre reçu de cotisation — {{reference}}",
    corps:
      "Bonjour {{destinataire}},\n\n" +
      "Nous vous confirmons la réception de votre cotisation d'un montant de {{montant}}, " +
      "et vous remercions de votre engagement auprès {{de:emetteurJE}}.\n\n" +
      "Vous trouverez votre reçu en pièce jointe, sous la référence {{reference}}.\n\n" +
      "Bien cordialement,\n{{emetteur}}",
  },
  RECU_DON: {
    sujet: "Votre reçu de don — {{reference}}",
    corps:
      "Bonjour {{destinataire}},\n\n" +
      "Nous vous remercions très sincèrement pour votre don de {{montant}}, " +
      "qui soutient directement les activités {{de:emetteurJE}}.\n\n" +
      "Vous trouverez le reçu correspondant en pièce jointe, sous la référence " +
      "{{reference}}. Il est inscrit à notre registre des dons.\n\n" +
      "Bien cordialement,\n{{emetteur}}",
  },
  RECU_PRODUIT: {
    sujet: "Votre reçu d'achat — {{reference}}",
    corps:
      "Bonjour {{destinataire}},\n\n" +
      "Nous vous confirmons votre achat d'un montant de {{montant}} et vous " +
      "remercions de votre confiance.\n\n" +
      "Vous trouverez votre reçu en pièce jointe, sous la référence {{reference}}.\n\n" +
      "Bien cordialement,\n{{emetteur}}",
  },
  RECU_JOB: {
    sujet: "Votre reçu de participation — {{reference}}",
    corps:
      "Bonjour {{destinataire}},\n\n" +
      "Nous vous confirmons la réception de votre participation de {{montant}} " +
      "et vous remercions de votre inscription.\n\n" +
      "Vous trouverez votre reçu en pièce jointe, sous la référence {{reference}}.\n\n" +
      "Bien cordialement,\n{{emetteur}}",
  },
  RECU_INTEGRATION: {
    sujet: "Votre reçu d'intégration — {{reference}}",
    corps:
      "Bonjour {{destinataire}},\n\n" +
      "Nous vous confirmons la réception de votre participation de {{montant}} " +
      "à la journée d'intégration, et nous nous réjouissons de vous y accueillir.\n\n" +
      "Vous trouverez votre reçu en pièce jointe, sous la référence {{reference}}.\n\n" +
      "Bien cordialement,\n{{emetteur}}",
  },
};

/** Formule de repli : vraie pour n'importe quel encaissement. */
const DEFAUT: ModeleMessage = {
  sujet: "Votre reçu — {{reference}}",
  corps:
    "Bonjour {{destinataire}},\n\n" +
    "Nous vous confirmons la réception de la somme de {{montant}} et vous " +
    "remercions de votre confiance.\n\n" +
    "Vous trouverez votre reçu en pièce jointe, sous la référence {{reference}}.\n\n" +
    "Bien cordialement,\n{{emetteur}}",
};

export type DonneesMessage = {
  reference: string;
  destinataire?: string;
  montant?: string;
  emetteurJE?: string;
  emetteur?: string;
};

/**
 * Élide « de » devant une voyelle : « de Amicale » ne s'écrit pas.
 *
 * Le h muet français n'est pas décidable sans dictionnaire (« d'Hammamet »
 * mais « de Hollande ») ; devant un h on garde donc « de », qui n'est faux
 * que sur une minorité de noms, là où l'élider serait faux sur l'autre.
 */
function elider(valeur: string): string {
  const mot = valeur.trim();
  if (!mot) return "";
  return /^[aàâeéèêiîoôuùûyAÀÂEÉÈÊIÎOÔUÙÛY]/.test(mot)
    ? `d'${mot}`
    : `de ${mot}`;
}

/**
 * Remplace les jetons du message.
 *
 * Un jeton sans valeur laisse un **blanc**, jamais ses accolades : voir
 * « {{destinataire}} » dans un courriel reçu serait humiliant pour la JE, là
 * où un blanc passe pour une maladresse de frappe. Le destinataire sans nom
 * devient « Madame, Monsieur », qui se lit normalement.
 *
 * Le préfixe `de:` rend le jeton précédé de sa préposition, élidée s'il le
 * faut : `{{de:emetteurJE}}` donne « d'Amicale des anciens ».
 */
export function remplirMessage(
  texte: string,
  donnees: DonneesMessage
): string {
  const valeurs: Record<string, string> = {
    reference: donnees.reference,
    destinataire: donnees.destinataire?.trim() || "Madame, Monsieur",
    montant: donnees.montant?.trim() || "",
    emetteurJE: donnees.emetteurJE?.trim() || "l'association",
    emetteur: donnees.emetteur?.trim() || "Le Trésorier",
  };
  return texte.replace(
    /\{\{\s*(?:(de):)?([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, prefixe: string | undefined, cle: string) => {
      const valeur = valeurs[cle] ?? "";
      if (!prefixe) return valeur;
      return elider(valeur);
    }
  );
}

/** Message proposé pour une famille, jetons déjà remplis. */
export function messagePropose(
  modele: string,
  donnees: DonneesMessage
): ModeleMessage {
  const gabarit = PAR_FAMILLE[modele] ?? DEFAUT;
  return {
    sujet: remplirMessage(gabarit.sujet, donnees),
    corps: remplirMessage(gabarit.corps, donnees),
  };
}

/**
 * Passe un message en HTML, pour le corps du courriel.
 *
 * Le Trésorier écrit du texte, pas du balisage : les retours à la ligne
 * deviennent des sauts, et tout caractère réservé est échappé — un « & » dans
 * un nom d'entreprise casserait sinon le rendu.
 */
export function messageEnHtml(corps: string): string {
  const echappe = corps
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return echappe
    .split(/\n{2,}/)
    .map((paragraphe) => paragraphe.replace(/\n/g, "<br/>"))
    .map((paragraphe) => `<p style="margin:0 0 12px">${paragraphe}</p>`)
    .join("");
}
