import {
  COULEUR_PRIMAIRE_DEFAUT,
  couleurValide,
} from "@/modules/core/apparence";
/**
 * Envoi d'e-mails — story 03.2.
 *
 * Transport Resend (REST, sans SDK) activé par `RESEND_API_KEY` ; sinon les
 * e-mails sont consignés en console (développement, ou clé absente).
 *
 * Deux portes, et la distinction compte :
 *
 * - `envoyerEmail` **ne lève jamais** et ne rend rien. C'est ce qu'il faut
 *   pour une notification : un rappel qui n'est pas parti ne doit pas faire
 *   échouer l'action métier qui l'a déclenché.
 * - `tenterEnvoi` **rend un compte rendu**. C'est ce qu'il faut quand l'envoi
 *   est l'action elle-même : remettre un reçu à un cotisant grave sa
 *   référence, et on ne peut pas graver sur la foi d'un envoi dont on ignore
 *   s'il a eu lieu.
 */

/*
 * La couleur de la structure est passée par l'appelant plutôt que lue ici :
 * ce fichier doit rester sans accès base, pour qu'un envoi reste possible
 * même quand le paramétrage est injoignable. Sans valeur, on retombe sur le
 * défaut de l'application — un e-mail sobre vaut mieux qu'un e-mail sans
 * en-tête.
 */

/**
 * Gabarit d'e-mail.
 *
 * `structure` est le nom paramétré ; il n'est pas lu ici pour que ce fichier
 * reste sans accès base — l'appelant le passe, et un envoi reste possible
 * même sans paramétrage.
 */
export function gabaritEmail(
  titre: string,
  corps: string,
  lien?: string,
  structure = "Trésorerie",
  couleur: string = COULEUR_PRIMAIRE_DEFAUT
) {
  const COULEUR_PRIMAIRE = couleurValide(couleur) ?? COULEUR_PRIMAIRE_DEFAUT;
  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f4f2f2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e0e1">
    <div style="background:${COULEUR_PRIMAIRE};padding:16px 24px">
      <p style="margin:0;color:#ffffff;font-size:16px;font-weight:bold">${structure}</p>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:18px;color:#15181d">${titre}</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#444;line-height:1.5">${corps}</p>
      ${lien ? `<a href="${lien}" style="display:inline-block;background:${COULEUR_PRIMAIRE};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Ouvrir l'application</a>` : ""}
    </div>
    <div style="padding:12px 24px;border-top:1px solid #e5e0e1">
      <p style="margin:0;font-size:11px;color:#8d8687">${structure} — message automatique, ne pas répondre</p>
    </div>
  </div>
</body></html>`;
}

/** Fichier joint à un e-mail. */
export type PieceJointe = {
  nom: string;
  contenu: Uint8Array;
};

export type DemandeEmail = {
  a: string;
  sujet: string;
  html: string;
  pieces?: PieceJointe[];
};

export type ResultatEnvoi =
  | { envoye: true }
  | { envoye: false; raison: string; transportAbsent?: boolean };

/** Taille maximale d'un envoi. Resend refuse au-delà de 40 Mo. */
const TAILLE_PIECES_MAX = 20_000_000;

/**
 * Tente l'envoi et dit ce qu'il en est.
 *
 * Sans clé API, rien ne part : on le signale au lieu de le taire. Un appelant
 * qui graverait une référence sur un envoi silencieusement perdu ferait
 * croire à une pièce remise qui ne l'est pas.
 */
export async function tenterEnvoi(
  demande: DemandeEmail
): Promise<ResultatEnvoi> {
  const cle = process.env.RESEND_API_KEY;
  const de = process.env.EMAIL_FROM ?? "Trésorerie <tresorerie@exemple.org>";

  if (!cle) {
    console.info(
      `[email] (transport désactivé) À: ${demande.a} — ${demande.sujet}` +
        (demande.pieces?.length ? ` + ${demande.pieces.length} pièce(s)` : "")
    );
    return {
      envoye: false,
      transportAbsent: true,
      raison:
        "Aucun transport d'e-mail configuré (RESEND_API_KEY absente) : rien n'a été envoyé.",
    };
  }

  const poids = (demande.pieces ?? []).reduce((s, p) => s + p.contenu.length, 0);
  if (poids > TAILLE_PIECES_MAX) {
    return {
      envoye: false,
      raison: `Pièces jointes trop lourdes (${Math.round(poids / 1024 / 1024)} Mo) : 20 Mo au maximum.`,
    };
  }

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: de,
        to: [demande.a],
        subject: demande.sujet,
        html: demande.html,
        // Resend attend le contenu encodé en base64.
        ...(demande.pieces?.length
          ? {
              attachments: demande.pieces.map((piece) => ({
                filename: piece.nom,
                content: Buffer.from(piece.contenu).toString("base64"),
              })),
            }
          : {}),
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      console.error(`[email] Échec Resend (${reponse.status}) :`, detail);
      return {
        envoye: false,
        raison: `Le service d'envoi a refusé le message (${reponse.status}).`,
      };
    }
    return { envoye: true };
  } catch (err) {
    console.error("[email] Erreur d'envoi :", err);
    return {
      envoye: false,
      raison:
        err instanceof Error ? err.message : "Erreur réseau à l'envoi du message.",
    };
  }
}

/**
 * Envoi sans retour, pour les notifications : un rappel qui n'est pas parti
 * ne doit pas faire échouer l'action métier qui l'a déclenché.
 */
export async function envoyerEmail(options: DemandeEmail): Promise<void> {
  await tenterEnvoi(options);
}
