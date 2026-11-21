"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import { AvoirModel, FactureModel } from "@/modules/tresorerie/models";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireFactureAvoir } from "@/modules/documents/services/gabarits/facture-avoir";
import {
  annuleEntierement,
  resteACrediter,
  verifierAvoir,
} from "@/modules/tresorerie/services/avoir";

/**
 * Émission d'une facture d'avoir.
 *
 * C'est la seule façon de corriger une facture déjà émise. Jusqu'ici il n'y
 * en avait aucune : une facture fausse restait fausse, et la seule issue
 * était de la supprimer — ce qui ouvre un trou dans une série numérotée.
 *
 * L'avoir ne touche pas à la facture d'origine. Les deux pièces cohabitent au
 * registre, et c'est leur somme qui donne le chiffre d'affaires réel. Les
 * règles de montant, de taux et de timbre vivent dans
 * `services/avoir.ts`, en fonctions pures testées.
 */

const CHEMINS = [
  "/tresorerie/factures",
  "/tresorerie/declaration",
  "/tresorerie",
  "/documents",
];

function revalider() {
  for (const chemin of CHEMINS) revalidatePath(chemin);
}

/** Mois d'une date, au format AAAA-MM. */
function moisDe(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export type ResultatAvoir = { ok: boolean; message: string };

export async function emettreAvoir(formData: FormData): Promise<ResultatAvoir> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      factureId: z.string().min(1),
      montantHT: z.coerce.number().positive(),
      motif: z.string().min(5).max(500),
    })
    .parse({
      factureId: formData.get("factureId"),
      montantHT: formData.get("montantHT"),
      motif: formData.get("motif"),
    });

  await connectDb();

  const facture = await FactureModel.findById(donnees.factureId)
    .populate<{ projet: { nom: string; client?: { organisation?: string } } }>({
      path: "projet",
      select: "nom client",
      populate: { path: "client", select: "organisation" },
    })
    .lean();
  if (!facture) return { ok: false, message: "Facture introuvable." };

  const mandat = await MandatModel.findOne({ statut: "ACTIF" })
    .select("_id annee")
    .lean();
  if (!mandat) return { ok: false, message: "Aucun mandat actif." };

  // Ce qui a déjà été crédité : deux avoirs partiels ne doivent pas, à eux
  // deux, dépasser la facture.
  const anterieurs = await AvoirModel.find({ facture: facture._id })
    .select("montantHT")
    .lean();
  const dejaCredite = anterieurs.reduce((s, a) => s + a.montantHT, 0);

  const aCorriger = {
    montantHT: facture.montantHT,
    tauxTVA: facture.tauxTVA ?? 19,
    dejaCredite,
  };

  const controle = verifierAvoir(aCorriger, donnees.montantHT);
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Avoir impossible." };
  }

  const emission = new Date();
  const total = annuleEntierement(aCorriger, donnees.montantHT);
  const client =
    facture.projet?.client?.organisation ?? facture.projet?.nom ?? "Client";

  const { id: documentId, reference } = await emettreDocument({
    modele: "FACTURE_AVOIR",
    mandat,
    objetType: "Avoir",
    titre: `Avoir sur ${facture.numero} — ${client}`,
    session,
    donnees: {
      reference: "",
      factureNumero: facture.numero,
      factureDate: new Date(facture.emission),
      factureMontantHT: facture.montantHT,
      client,
      montantHT: donnees.montantHT,
      tauxTVA: aCorriger.tauxTVA,
      motif: donnees.motif,
      dateEmission: emission,
      annulationTotale: total,
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (d, ref) => construireFactureAvoir({ ...d, reference: ref }),
  });

  const avoir = await AvoirModel.create({
    mandat: mandat._id,
    facture: facture._id,
    numero: reference,
    // Le mois d'émission de l'avoir, jamais celui de la facture : on ne
    // rectifie pas une déclaration déjà déposée.
    mois: moisDe(emission),
    montantHT: donnees.montantHT,
    tauxTVA: aCorriger.tauxTVA,
    motif: donnees.motif,
    emission,
    emisParNom: session.user?.name ?? undefined,
    document: documentId,
  });

  await journaliser(session, {
    action: "tresorerie.avoir.emettre",
    entite: "Avoir",
    entiteId: String(avoir._id),
    details: `${reference} sur ${facture.numero} — ${donnees.montantHT} DT HT${
      total ? " (annulation totale)" : " (réduction partielle)"
    }`,
  });
  revalider();

  return {
    ok: true,
    message: total
      ? `${reference} émis : la facture ${facture.numero} est entièrement annulée.`
      : `${reference} émis : ${donnees.montantHT} DT HT déduits de ${facture.numero}.`,
  };
}

/** Avoirs d'une facture, et ce qu'il reste à créditer. */
export async function avoirsDeLaFacture(factureId: string) {
  await exigerModuleEtPermission("tresorerie", "lire");
  await connectDb();

  const facture = await FactureModel.findById(factureId)
    .select("montantHT tauxTVA numero")
    .lean();
  if (!facture) throw new Error("Facture introuvable.");

  const avoirs = await AvoirModel.find({ facture: factureId })
    .sort({ emission: 1 })
    .lean();
  const dejaCredite = avoirs.reduce((s, a) => s + a.montantHT, 0);

  return {
    reste: resteACrediter({
      montantHT: facture.montantHT,
      tauxTVA: facture.tauxTVA ?? 19,
      dejaCredite,
    }),
    avoirs: avoirs.map((a) => ({
      id: String(a._id),
      numero: a.numero,
      montantHT: a.montantHT,
      motif: a.motif,
      emission: a.emission,
      documentId: a.document ? String(a.document) : null,
    })),
  };
}
