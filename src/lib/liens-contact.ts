/**
 * Construction des liens de contact sortants (WhatsApp, e-mail).
 *
 * Choix d'architecture : ce sont des **liens**, pas des appels d'API.
 * `wa.me` et `mailto:` ouvrent l'application du membre avec un message
 * pré-rempli — aucune clé API, aucun compte tiers, aucune donnée de la structure
 * qui transite par un serveur externe, et rien à maintenir quand l'API
 * WhatsApp Business change. C'est le meilleur rapport valeur/risque pour une
 * Junior Entreprise.
 *
 * Logique pure et isomorphe → testable sans base ni navigateur.
 */

/** Variables substituables dans les modèles de message. */
export type VariablesMessage = {
  contact?: string;
  organisation?: string;
  structure?: string;
  expediteur?: string;
};

/**
 * Remplace `{variable}` par sa valeur. Une variable sans valeur est retirée
 * proprement (et les espaces doubles résorbés) : on n'envoie jamais
 * « Bonjour {contact}, » à un client.
 */
export function appliquerModele(
  modele: string,
  variables: VariablesMessage
): string {
  return modele
    .replace(/\{(\w+)\}/g, (_, cle: string) => {
      const v = variables[cle as keyof VariablesMessage];
      return v ? String(v) : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Normalise un numéro au format attendu par wa.me : chiffres uniquement,
 * indicatif pays inclus, sans `+` ni séparateurs.
 *
 * `indicatifDefaut` sert aux numéros locaux saisis sans indicatif (216 =
 * Tunisie) : un « 12 345 678 » devient « 21612345678 ».
 */
export function normaliserNumeroWhatsApp(
  telephone: string | undefined | null,
  indicatifDefaut = "216"
): string | null {
  if (!telephone) return null;

  const commenceParPlus = telephone.trim().startsWith("+");
  let chiffres = telephone.replace(/\D/g, "");
  if (!chiffres) return null;

  // 00 33 … → 33 … (préfixe international à l'ancienne)
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  else if (!commenceParPlus && chiffres.length <= 9) {
    // Numéro local : on préfixe l'indicatif par défaut.
    chiffres = `${indicatifDefaut}${chiffres.replace(/^0+/, "")}`;
  }

  // Garde-fou : un numéro international plausible fait 8 à 15 chiffres (E.164).
  if (chiffres.length < 8 || chiffres.length > 15) return null;
  return chiffres;
}

/** Lien `wa.me` avec message pré-rempli, ou `null` si le numéro est inexploitable. */
export function lienWhatsApp(
  telephone: string | undefined | null,
  message: string,
  indicatifDefaut = "216"
): string | null {
  const numero = normaliserNumeroWhatsApp(telephone, indicatifDefaut);
  if (!numero) return null;
  const texte = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${numero}${texte}`;
}

/** Lien `mailto:` avec objet et corps pré-remplis. */
export function lienEmail(
  email: string | undefined | null,
  objet: string,
  corps: string
): string | null {
  if (!email?.includes("@")) return null;
  const params = new URLSearchParams();
  if (objet) params.set("subject", objet);
  if (corps) params.set("body", corps);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${email}${q ? `?${q}` : ""}`;
}
