"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { DocumentModel } from "@/modules/documents/models";
import { modeleRequis } from "@/modules/documents/catalogue";
import {
  refusDeSuppression,
  supprimerRecuEtRenumeroter,
} from "@/modules/tresorerie/services/suppression-recu";
import { FluxTresorerieModel } from "@/modules/tresorerie/models";
import { lireFichier } from "@/modules/documents/services/stockage";
import { gabaritEmail, tenterEnvoi } from "@/modules/core/services/email";
import { identiteVisuelle } from "@/modules/core/services/identite-visuelle";
import {
  messageEnHtml,
  messagePropose,
} from "@/modules/tresorerie/services/message-recu";

/**
 * Cycle de vie d'un reçu : brouillon, envoyé, annulé.
 *
 * C'est **l'envoi** qui grave la référence, pas l'émission du PDF. Un reçu
 * qui n'a pas quitté l'application n'a été remis à personne : le supprimer rend son
 * numéro, et les reçus non envoyés qui le suivent redescendent d'un cran, PDF
 * refabriqué. Une fois parti, plus rien ne bouge — on annule, la référence
 * reste consommée et un nouveau reçu prend le numéro suivant.
 *
 * Le calcul lui-même (qui décale, jusqu'où, où en est le compteur) vit dans
 * `services/renumerotation-recus.ts`, en fonctions pures testées.
 */

const CHEMINS = [
  "/tresorerie/recus",
  "/tresorerie/flux",
  "/tresorerie/registres/cotisations",
  "/documents",
];

function revalider() {
  for (const chemin of CHEMINS) revalidatePath(chemin);
}

/**
 * Charge un reçu de la trésorerie, en refusant tout ce qui n'en est pas un.
 *
 * Le refus est **rendu**, pas levé : une exception d'action serveur est
 * masquée en production, or c'est son texte qui dit ce qui ne va pas.
 */
async function chargerRecuTresorerie(documentId: string) {
  const document = await DocumentModel.findById(documentId);
  if (!document) {
    return { ok: false as const, message: "Reçu introuvable." };
  }

  const modele = modeleRequis(document.modele);
  if (modele.categorie !== "RECU" || modele.module !== "tresorerie") {
    return {
      ok: false as const,
      message: `« ${document.reference} » n'est pas un reçu de la trésorerie.`,
    };
  }
  return { ok: true as const, document };
}

/**
 * Même chargement, pour les **lectures** dont l'appelant attend la donnée
 * elle-même et rattrape déjà l'exception à l'écran.
 */
async function recuTresorerie(documentId: string) {
  const charge = await chargerRecuTresorerie(documentId);
  if (!charge.ok) throw new Error(charge.message);
  return charge.document;
}

/**
 * Marque un reçu comme remis à son destinataire.
 *
 * C'est le geste qui grave la référence. Tant qu'il n'a pas eu lieu, le reçu
 * reste un brouillon corrigeable ; après, il ne se supprime plus.
 *
 * Cette porte reste celle de la remise hors application — en main propre, ou par la
 * messagerie du Trésorier. L'envoi depuis l'application (`envoyerRecuParEmail`)
 * actionne la même bascule, mais seulement après un envoi réussi.
 */
export async function marquerRecuEnvoye(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      documentId: z.string().min(1),
      destinataire: z.string().max(200).optional(),
    })
    .parse({
      documentId: formData.get("documentId"),
      destinataire: formData.get("destinataire") || undefined,
    });

  await connectDb();
  const charge = await chargerRecuTresorerie(donnees.documentId);
  if (!charge.ok) return { ok: false, message: charge.message };
  const document = charge.document;

  if (document.statut === "ANNULE") {
    return {
      ok: false,
      message: `« ${document.reference} » est annulé : il ne s'envoie plus. Établissez un nouveau reçu.`,
    };
  }
  if (document.envoyeLe) {
    return {
      ok: false,
      message: `« ${document.reference} » est déjà marqué remis le ${new Date(document.envoyeLe).toLocaleDateString("fr-FR")} (${document.envoyeA ?? "destinataire non noté"}).`,
    };
  }

  document.envoyeLe = new Date();
  document.envoyeA = donnees.destinataire?.trim() || "Remis en main propre";
  await document.save();

  await journaliser(session, {
    action: "tresorerie.recu.envoyer",
    entite: "Document",
    entiteId: donnees.documentId,
    details: `${document.reference} — ${document.envoyeA}`,
  });
  revalider();

  return {
    ok: true,
    message: `${document.reference} marqué remis à ${document.envoyeA}. Sa référence est désormais gravée : il ne se supprime plus, il s'annule.`,
  };
}

/**
 * Supprime un reçu qui n'est jamais parti, et referme la série derrière lui.
 * Toute la mécanique vit dans `services/suppression-recu.ts` : la suppression
 * d'une cotisation emprunte le même chemin.
 */
export async function supprimerRecuNonEnvoye(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const documentId = z.string().min(1).parse(formData.get("documentId"));

  await connectDb();
  const charge = await chargerRecuTresorerie(documentId);
  if (!charge.ok) return { ok: false, message: charge.message };

  // Le refus de suppression est une règle métier pure, déjà testée : un reçu
  // parti ne se supprime plus, un reçu annulé garde sa référence exprès.
  const refus = refusDeSuppression({
    reference: charge.document.reference,
    envoyeLe: charge.document.envoyeLe,
    statut: charge.document.statut,
  });
  if (refus) return { ok: false, message: refus };

  const resultat = await supprimerRecuEtRenumeroter(documentId);

  await journaliser(session, {
    action: "tresorerie.recu.supprimer",
    entite: "Document",
    entiteId: documentId,
    details: `${resultat.reference} supprimé (non envoyé)${
      resultat.renumerotes ? ` — ${resultat.renumerotes} reçu(s) renuméroté(s)` : ""
    }${resultat.trouSubsiste ? " — trou conservé, un reçu suivant est déjà parti" : ""}`,
  });
  revalider();

  return {
    ok: true,
    message: `${resultat.reference} supprimé : son numéro est rendu${
      resultat.renumerotes
        ? `, ${resultat.renumerotes} reçu(s) renuméroté(s)`
        : ""
    }${
      resultat.trouSubsiste
        ? ". Un trou subsiste dans la série : un reçu suivant est déjà parti et son numéro ne bouge plus."
        : "."
    }`,
  };
}

/**
 * Annule un reçu remis à son destinataire.
 *
 * La référence reste consommée et la pièce reste consultable, marquée
 * « Annulé » : c'est ce qu'exige une piste d'audit sur des pièces numérotées,
 * et c'est ce qui explique le trou dans la série à qui la relit. L'opération
 * qu'elle justifiait redevient « à émettre », pour qu'un reçu correct parte
 * au numéro suivant.
 */
export async function annulerRecuTresorerie(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ documentId: z.string().min(1), motif: z.string().min(3).max(300) })
    .parse({
      documentId: formData.get("documentId"),
      motif: formData.get("motif"),
    });

  await connectDb();
  const charge = await chargerRecuTresorerie(donnees.documentId);
  if (!charge.ok) return { ok: false, message: charge.message };
  const document = charge.document;

  if (document.statut === "ANNULE") {
    return {
      ok: false,
      message: `« ${document.reference} » est déjà annulé : ${document.motifAnnulation ?? "sans motif noté"}.`,
    };
  }

  document.statut = "ANNULE";
  document.motifAnnulation = donnees.motif;
  await document.save();

  // Une pièce annulée ne justifie plus rien : le flux repasse en attente.
  await FluxTresorerieModel.updateMany(
    { justificatifRef: document.reference },
    { $unset: { justificatifRef: "" } }
  );

  await journaliser(session, {
    action: "tresorerie.recu.annuler",
    entite: "Document",
    entiteId: donnees.documentId,
    details: `${document.reference} — ${donnees.motif}`,
  });
  revalider();

  return {
    ok: true,
    message: `${document.reference} annulé. La pièce reste consultable avec son motif, et l'opération qu'elle justifiait repasse « à émettre ».`,
  };
}

/* ------------------------------------------------------------------ */
/* Envoi par e-mail depuis l'application                                       */
/* ------------------------------------------------------------------ */

/**
 * Le message proposé pour un reçu, et l'adresse qu'on connaît de son
 * destinataire.
 *
 * La formule dépend de la famille — on ne remercie pas un donateur comme on
 * accuse réception d'une cotisation due — et le Trésorier la relit avant
 * d'envoyer. Voir `services/message-recu.ts`.
 */
export async function messagePourRecu(documentId: string): Promise<{
  reference: string;
  destinataire: string;
  sujet: string;
  corps: string;
}> {
  await exigerModuleEtPermission("tresorerie", "lire");
  await connectDb();

  const document = await recuTresorerie(documentId);
  const donnees = (document.donnees ?? {}) as Record<string, unknown>;
  const montant = donnees.montant;

  const message = messagePropose(document.modele, {
    reference: document.reference,
    // Les reçus de cotisation nomment un membre, les autres un tiers.
    destinataire: String(donnees.membre ?? donnees.tiers ?? ""),
    montant:
      typeof montant === "number"
        ? `${montant.toFixed(3).replace(".", ",")} DT`
        : String(montant ?? ""),
    emetteur: String(donnees.emetteur ?? document.emisParNom ?? ""),
  });

  return {
    reference: document.reference,
    // L'adresse recueillie à l'encaissement, quand il y en avait une.
    destinataire: String(donnees.email ?? ""),
    ...message,
  };
}

/**
 * Envoie le reçu à son destinataire, PDF joint, et grave sa référence.
 *
 * **La bascule n'a lieu que si l'envoi a réussi.** C'est tout l'enjeu : un
 * reçu marqué remis ne se supprime plus et son numéro est consommé. Le
 * marquer sur la foi d'un envoi perdu ferait croire à une pièce remise qui ne
 * l'est pas — et interdirait de la corriger.
 *
 * Sans transport configuré, on refuse franchement plutôt que de faire
 * semblant : le reçu reste un brouillon, et le Trésorier qui le transmet par
 * ses propres moyens le déclare avec « marquer comme envoyé ».
 *
 * Les refus sont **rendus**, pas levés : une exception d'action serveur est
 * masquée en production (« An error occurred… »), et c'est précisément le
 * texte du refus qui dit au Trésorier quoi faire ensuite.
 */
export type ResultatEnvoiRecu = { ok: boolean; message: string };

export async function envoyerRecuParEmail(
  formData: FormData
): Promise<ResultatEnvoiRecu> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donneesSaisies = z
    .object({
      documentId: z.string().min(1),
      destinataire: z.string().email("Adresse électronique invalide."),
      sujet: z.string().min(3).max(200),
      corps: z.string().min(10).max(5000),
    })
    .parse({
      documentId: formData.get("documentId"),
      destinataire: String(formData.get("destinataire") ?? "").trim(),
      sujet: formData.get("sujet"),
      corps: formData.get("corps"),
    });

  await connectDb();
  const document = await recuTresorerie(donneesSaisies.documentId);

  if (document.statut === "ANNULE") {
    return {
      ok: false,
      message: `« ${document.reference} » est annulé : il ne s'envoie plus. Établissez un nouveau reçu.`,
    };
  }
  if (document.envoyeLe) {
    return {
      ok: false,
      message: `« ${document.reference} » est déjà parti le ${new Date(document.envoyeLe).toLocaleDateString("fr-FR")} (${document.envoyeA ?? "destinataire non noté"}). Pour le transmettre à nouveau, téléchargez le PDF et envoyez-le vous-même : la pièce ne change plus.`,
    };
  }
  if (!document.fichierId) {
    return {
      ok: false,
      message: `Le PDF de « ${document.reference} » est introuvable : il ne peut pas être joint. Réémettez la pièce.`,
    };
  }

  const pdf = await lireFichier(document.fichierId);
  const { structure, couleur } = await identiteVisuelle();
  const resultat = await tenterEnvoi({
    a: donneesSaisies.destinataire,
    sujet: donneesSaisies.sujet,
    html: gabaritEmail(
      donneesSaisies.sujet,
      messageEnHtml(donneesSaisies.corps),
      undefined,
      structure,
      couleur
    ),
    pieces: [{ nom: `${document.reference}.pdf`, contenu: pdf }],
  });

  if (!resultat.envoye) {
    // Rien n'est gravé : le reçu reste un brouillon, donc corrigeable.
    return {
      ok: false,
      message: resultat.transportAbsent
        ? `${resultat.raison}\n« ${document.reference} » reste un brouillon : téléchargez le PDF, transmettez-le vous-même, puis employez « déclarer remis ».`
        : `L'envoi a échoué : ${resultat.raison}\n« ${document.reference} » reste un brouillon et peut être renvoyé.`,
    };
  }

  document.envoyeLe = new Date();
  document.envoyeA = donneesSaisies.destinataire;
  await document.save();

  await journaliser(session, {
    action: "tresorerie.recu.envoyer",
    entite: "Document",
    entiteId: donneesSaisies.documentId,
    details: `${document.reference} → ${donneesSaisies.destinataire} (envoi depuis l'application, référence gravée)`,
  });
  revalider();

  return {
    ok: true,
    message: `${document.reference} envoyé à ${donneesSaisies.destinataire}. Sa référence est désormais gravée.`,
  };
}
