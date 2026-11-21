"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { notifier } from "@/modules/core/services/notifications";
import { MandatModel } from "@/modules/core/models";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import {
  AvoirModel,
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  FactureModel,
  ObligationFiscaleModel,
  DeclarationFiscaleModel,
  TYPES_FLUX,
  MODES_PAIEMENT,
  TYPES_IMPOT,
  PERIODICITES,
} from "@/modules/tresorerie/models";
import { ProjetModel } from "@/modules/base/models";
import {
  calculerSolde,
  numeroFacture,
} from "@/modules/tresorerie/services/finances";
import { COMPTES, comptePourMode } from "@/modules/tresorerie/services/caisse";
import { alerteEspeces } from "@/modules/tresorerie/services/conformite-especes";
import {
  avertissementDepassement,
  etatFacturationProjet,
} from "@/modules/tresorerie/services/facturation-projet";
import { retirerCotisationsDuFlux } from "@/modules/tresorerie/services/suppression-cotisation";

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

/* ------------------------------------------------------------------ */
/* Flux — story 06.3 (EX-TRS-03/04)                                    */
/* ------------------------------------------------------------------ */
// Le budget prévisionnel (création, lignes, verrouillage, versions) vit
// désormais dans actions/budget-previsionnel.ts — un chantier assez dense
// (mensualisation, verrouillage post-AG, demandes au Président) pour
// mériter son propre fichier.

export async function saisirFlux(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = lireFlux(formData);

  /*
   * Plafond légal des espèces : signalé, jamais bloquant. Refuser la saisie
   * ne défaisait pas le paiement déjà fait en liquide — cela le sortait
   * seulement des comptes. L'opération entre au journal et y reste en rouge
   * tant qu'elle n'est pas régularisée (voir services/conformite-especes).
   */
  const alerte = alerteEspeces(donnees);

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget?.lignes.some((l) => l.libelle === donnees.categorie)) {
    throw new Error("Catégorie budgétaire inconnue : ajoutez-la d'abord au budget.");
  }

  // Sans choix explicite, l'avoir se déduit du mode de paiement : les
  // espèces passent par la caisse, tout le reste par la banque.
  await FluxTresorerieModel.create({
    mandat: mandat._id,
    ...donnees,
    compte: donnees.compte ?? comptePourMode(donnees.modePaiement),
  });

  // Alerte de seuil (EX-TRS-04) recalculée immédiatement.
  const tousFlux = await FluxTresorerieModel.find({ mandat: mandat._id })
    .select("type montant categorie justificatifRef")
    .lean();
  const solde = calculerSolde(budget.soldeInitial, tousFlux);
  if (solde < budget.seuilTresorerieMin) {
    await notifier(
      { roles: ["TRESORIER", "PRESIDENT", "SUPER_ADMIN"] },
      {
        titre: `Trésorerie sous le seuil : ${solde.toLocaleString("fr-FR")} DT`,
        message: `Le solde est passé sous le seuil d'alerte (${budget.seuilTresorerieMin} DT). Anticipez les tensions (EX-TRS-04).`,
        lien: "/tresorerie",
        type: "alerte",
        critique: true,
        cle: `tresorerie-seuil:${new Date().toISOString().slice(0, 10)}`,
      }
    );
  }

  await journaliser(session, {
    action: "tresorerie.saisirFlux",
    entite: "FluxTresorerie",
    details: `${donnees.type} ${donnees.montant} DT — ${donnees.tiers} (${donnees.categorie})${donnees.justificatifRef ? "" : " ⚠ sans justificatif"}${alerte ? " ⚠ espèces au-delà du plafond légal" : ""}`,
  });
  revalidatePath("/tresorerie");
  revalidatePath("/tresorerie/flux");
}

/** Champs modifiables d'une opération — mêmes règles qu'à la saisie. */
const SchemaFlux = z.object({
  type: z.enum(TYPES_FLUX),
  montant: z.coerce.number().min(0.01),
  date: z.coerce.date(),
  tiers: z.string().min(2).max(200),
  modePaiement: z.enum(MODES_PAIEMENT),
  categorie: z.string().min(1),
  compte: z.enum(COMPTES).optional(),
  justificatifRef: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

function lireFlux(formData: FormData) {
  return SchemaFlux.parse({
    type: formData.get("type"),
    montant: formData.get("montant"),
    date: formData.get("date") || new Date(),
    tiers: formData.get("tiers"),
    modePaiement: formData.get("modePaiement"),
    categorie: formData.get("categorie"),
    compte: formData.get("compte") || undefined,
    justificatifRef: formData.get("justificatifRef") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

/**
 * Corrige une opération déjà saisie.
 *
 * Une erreur de frappe sur un montant ou un compte fausse tous les soldes en
 * aval ; sans correction possible, la seule issue était de saisir une
 * contre-écriture, ce qui salit le journal. Le journal d'activité garde la
 * trace de la valeur remplacée.
 */
export async function modifierFlux(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const fluxId = z.string().min(1).parse(formData.get("fluxId"));
  const donnees = lireFlux(formData);
  // Même règle qu'à la saisie : on corrige ce qui s'est passé, l'alerte
  // suit l'opération corrigée plutôt que d'interdire la correction.
  const alerte = alerteEspeces(donnees);

  await connectDb();
  const mandat = await mandatActifRequis();
  const flux = await FluxTresorerieModel.findOne({
    _id: fluxId,
    mandat: mandat._id,
  });
  if (!flux) throw new Error("Opération introuvable.");

  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget?.lignes.some((l) => l.libelle === donnees.categorie)) {
    throw new Error("Catégorie budgétaire inconnue : ajoutez-la d'abord au budget.");
  }

  const avant = `${flux.type} ${flux.montant} DT — ${flux.tiers} (${flux.categorie})`;
  flux.set({
    ...donnees,
    compte: donnees.compte ?? comptePourMode(donnees.modePaiement),
  });
  await flux.save();

  await journaliser(session, {
    action: "tresorerie.modifierFlux",
    entite: "FluxTresorerie",
    entiteId: fluxId,
    details: `${avant} → ${donnees.type} ${donnees.montant} DT — ${donnees.tiers} (${donnees.categorie})${alerte ? " ⚠ espèces au-delà du plafond légal" : ""}`,
  });
  revalidatePath("/tresorerie/flux");
  revalidatePath("/tresorerie/caisse");
  revalidatePath("/tresorerie/recus");
  revalidatePath("/tresorerie");
}

/**
 * Retire une opération du journal — vers la corbeille, jamais directement.
 * Une écriture supprimée par erreur déséquilibrerait les soldes sans laisser
 * de quoi comprendre ce qui manque.
 */
export async function supprimerFlux(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const fluxId = z.string().min(1).parse(formData.get("fluxId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const flux = await FluxTresorerieModel.findOne({
    _id: fluxId,
    mandat: mandat._id,
  }).lean();
  if (!flux) throw new Error("Opération introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "FLUX",
    titre: `${flux.tiers} — ${flux.montant} DT`,
    description: `${flux.type === "ENCAISSEMENT" ? "Encaissement" : "Décaissement"} du ${new Date(flux.date).toLocaleDateString("fr-FR")} · ${flux.categorie}`,
    donnees: flux,
    session,
  });
  await FluxTresorerieModel.deleteOne({ _id: flux._id });

  /*
   * Une cotisation encaissée par cette opération part avec elle, son reçu
   * compris. Sans cela, effacer l'encaissement laissait le cotisant inscrit
   * comme ayant payé et son reçu revenait dans « à émettre » : le journal
   * disait une chose, le registre des cotisations une autre.
   */
  const cotisations = await retirerCotisationsDuFlux(flux._id, session);

  await journaliser(session, {
    action: "tresorerie.supprimerFlux",
    entite: "FluxTresorerie",
    entiteId: fluxId,
    details: `${flux.type} ${flux.montant} DT — ${flux.tiers} — mis à la corbeille${cotisations.length ? ` (avec la cotisation de ${cotisations.join(", ")})` : ""}`,
  });
  revalidatePath("/tresorerie/flux");
  revalidatePath("/tresorerie/caisse");
  revalidatePath("/tresorerie/recus");
  revalidatePath("/tresorerie/registres/cotisations");
  revalidatePath("/tresorerie");
  revalidatePath("/documents");
  revalidatePath("/corbeille");
}

export async function lierJustificatif(fluxId: string, formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const ref = z.string().min(3).max(500).parse(formData.get("justificatifRef"));

  await connectDb();
  const flux = await FluxTresorerieModel.findById(fluxId);
  if (!flux) throw new Error("Flux introuvable.");
  flux.justificatifRef = ref;
  await flux.save();

  await journaliser(session, {
    action: "tresorerie.lierJustificatif",
    entite: "FluxTresorerie",
    entiteId: fluxId,
    details: `Justificatif rattaché (EX-TRS-08) : ${ref.slice(0, 80)}`,
  });
  revalidatePath("/tresorerie/flux");
  revalidatePath("/tresorerie");
}

/* ------------------------------------------------------------------ */
/* Factures — story 06.7                                               */
/* ------------------------------------------------------------------ */

/**
 * Émet une facture sur un projet.
 *
 * Le montant n'est plus à retrouver : le projet porte son CA signé, recopié
 * de l'opportunité que le devis a signée. L'écran propose donc le reste à
 * facturer, et cette action redit ce qu'elle a fait — y compris quand la
 * facture dépasse le signé, cas réel qu'on avertit sans l'interdire.
 *
 * Le refus est rendu, pas levé : c'est son texte qui dit quoi corriger.
 */
export async function creerFacture(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      projetId: z.string().min(1),
      montantHT: z.coerce.number().min(0.01),
      tauxTVA: z.coerce.number().min(0).max(100),
      echeance: z.coerce.date(),
    })
    .parse({
      projetId: formData.get("projetId"),
      montantHT: formData.get("montantHT"),
      tauxTVA: formData.get("tauxTVA") || 19,
      echeance: formData.get("echeance"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const projet = await ProjetModel.findById(donnees.projetId);
  if (!projet) return { ok: false, message: "Projet introuvable." };

  // L'état de facturation du projet, pour dire la vérité dans le compte rendu
  // et dans le journal : la même source que l'écran, pas un calcul parallèle.
  const facturesDuProjet = await FactureModel.find({ projet: projet._id })
    .select("_id montantHT")
    .lean();
  const avoirsDuProjet = await AvoirModel.find({
    facture: { $in: facturesDuProjet.map((f) => f._id) },
  })
    .select("montantHT")
    .lean();
  const etat = etatFacturationProjet({
    caSigne: projet.caSigne,
    facturesHT: facturesDuProjet.map((f) => f.montantHT),
    avoirsHT: avoirsDuProjet.map((a) => a.montantHT),
  });
  const depassement = avertissementDepassement(etat, donnees.montantHT);

  const sequence = (await FactureModel.countDocuments({ mandat: mandat._id })) + 1;
  const facture = await FactureModel.create({
    mandat: mandat._id,
    projet: projet._id,
    numero: numeroFacture(mandat.annee, sequence),
    montantHT: donnees.montantHT,
    tauxTVA: donnees.tauxTVA,
    echeance: donnees.echeance,
  });

  await journaliser(session, {
    action: "tresorerie.creerFacture",
    entite: "Facture",
    entiteId: facture._id.toString(),
    details: `${facture.numero} — ${projet.nom} — ${donnees.montantHT} DT HT${
      depassement ? " (au-delà du CA signé)" : ""
    }`,
  });
  revalidatePath("/tresorerie/factures");
  revalidatePath("/tresorerie/registres/clients");
  revalidatePath("/tresorerie/registres/creances");

  const reste = etatFacturationProjet({
    caSigne: projet.caSigne,
    facturesHT: [...facturesDuProjet.map((f) => f.montantHT), donnees.montantHT],
    avoirsHT: avoirsDuProjet.map((a) => a.montantHT),
  }).resteAFacturer;

  return {
    ok: true,
    message: [
      `${facture.numero} émise — ${projet.nom}, ${donnees.montantHT
        .toFixed(3)
        .replace(".", ",")} DT HT.`,
      depassement,
      reste !== null && reste > 0
        ? `Reste à facturer sur ce projet : ${reste
            .toFixed(3)
            .replace(".", ",")} DT HT.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Corrige une facture tant qu'elle n'est pas réglée.
 *
 * Une facture payée ne se retouche plus : le flux d'encaissement lui répond
 * au centime, et les deux divergeraient. Il faut alors passer par un avoir,
 * ce que l'application ne sait pas encore faire.
 */
export async function modifierFacture(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      factureId: z.string().min(1),
      montantHT: z.coerce.number().min(0.01),
      tauxTVA: z.coerce.number().min(0).max(100),
      timbreFiscal: z.coerce.number().min(0),
      echeance: z.coerce.date(),
    })
    .parse({
      factureId: formData.get("factureId"),
      montantHT: formData.get("montantHT"),
      tauxTVA: formData.get("tauxTVA") || 19,
      timbreFiscal: formData.get("timbreFiscal") || 1,
      echeance: formData.get("echeance"),
    });

  await connectDb();
  const facture = await FactureModel.findById(donnees.factureId);
  if (!facture) throw new Error("Facture introuvable.");
  if (facture.statut === "PAYEE") {
    throw new Error(
      `La facture ${facture.numero} est réglée : son encaissement est déjà au journal. Corrigez d'abord le flux, ou émettez un avoir.`
    );
  }

  const avant = `${facture.montantHT} DT HT à ${facture.tauxTVA} %`;
  facture.montantHT = donnees.montantHT;
  facture.tauxTVA = donnees.tauxTVA;
  facture.timbreFiscal = donnees.timbreFiscal;
  facture.echeance = donnees.echeance;
  await facture.save();

  await journaliser(session, {
    action: "tresorerie.modifierFacture",
    entite: "Facture",
    entiteId: donnees.factureId,
    details: `${facture.numero} : ${avant} → ${donnees.montantHT} DT HT à ${donnees.tauxTVA} %`,
  });
  revalidatePath("/tresorerie/factures");
}

/** Retire une facture non réglée — vers la corbeille. */
export async function supprimerFacture(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const factureId = z.string().min(1).parse(formData.get("factureId"));

  await connectDb();
  const facture = await FactureModel.findById(factureId).lean();
  if (!facture) throw new Error("Facture introuvable.");
  if (facture.statut === "PAYEE") {
    throw new Error(
      `La facture ${facture.numero} est réglée : supprimez d'abord son encaissement au journal des flux.`
    );
  }

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "FACTURE",
    titre: facture.numero,
    description: `${facture.montantHT} DT HT · échéance du ${new Date(facture.echeance).toLocaleDateString("fr-FR")}`,
    donnees: facture,
    session,
  });
  await FactureModel.deleteOne({ _id: facture._id });

  await journaliser(session, {
    action: "tresorerie.supprimerFacture",
    entite: "Facture",
    entiteId: factureId,
    details: `${facture.numero} — mise à la corbeille`,
  });
  revalidatePath("/tresorerie/factures");
  revalidatePath("/corbeille");
}

export async function encaisserFacture(factureId: string, formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      date: z.coerce.date(),
      modePaiement: z.enum(MODES_PAIEMENT),
      justificatifRef: z.string().max(500).optional(),
    })
    .parse({
      date: formData.get("date") || new Date(),
      modePaiement: formData.get("modePaiement"),
      justificatifRef: formData.get("justificatifRef") || undefined,
    });

  await connectDb();
  const facture = await FactureModel.findById(factureId).populate<{
    projet: { nom: string };
  }>("projet", "nom");
  if (!facture) throw new Error("Facture introuvable.");
  if (facture.statut === "PAYEE") throw new Error("Facture déjà encaissée.");

  const montantTTC =
    Math.round(facture.montantHT * (1 + facture.tauxTVA / 100) * 100) / 100;

  // Un client qui règle en liquide au-delà du plafond a déjà réglé : le
  // refus n'aurait fait qu'écarter l'encaissement des comptes. L'opération
  // entre au journal et son dépassement s'y voit (voir saisirFlux).

  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  const categorie =
    budget?.lignes.find((l) => l.section === "RECETTES_EXPLOITATION")?.libelle ??
    "Projets";

  await FluxTresorerieModel.create({
    mandat: mandat._id,
    type: "ENCAISSEMENT",
    montant: montantTTC,
    date: donnees.date,
    tiers: facture.projet?.nom ?? "Client",
    modePaiement: donnees.modePaiement,
    categorie,
    justificatifRef: donnees.justificatifRef ?? facture.numero,
    facture: facture._id,
  });

  facture.statut = "PAYEE";
  facture.payeeLe = donnees.date;
  await facture.save();

  await journaliser(session, {
    action: "tresorerie.encaisserFacture",
    entite: "Facture",
    entiteId: factureId,
    details: `${facture.numero} encaissée — ${montantTTC} DT TTC`,
  });
  revalidatePath("/tresorerie/factures");
  revalidatePath("/tresorerie");
}

/* ------------------------------------------------------------------ */
/* Fiscalité — story 06.8                                              */
/* ------------------------------------------------------------------ */

export async function creerObligation(formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      type: z.enum(TYPES_IMPOT),
      libelle: z.string().min(2).max(200),
      periodicite: z.enum(PERIODICITES),
      prochaineEcheance: z.coerce.date(),
    })
    .parse({
      type: formData.get("type"),
      libelle: formData.get("libelle"),
      periodicite: formData.get("periodicite"),
      prochaineEcheance: formData.get("prochaineEcheance"),
    });

  await connectDb();
  await ObligationFiscaleModel.create(donnees);
  await journaliser(session, {
    action: "tresorerie.creerObligation",
    entite: "ObligationFiscale",
    details: `${donnees.libelle} (${donnees.type}, ${donnees.periodicite})`,
  });
  revalidatePath("/tresorerie/fiscalite");
}

const MOIS_PAR_PERIODICITE = { MENSUELLE: 1, TRIMESTRIELLE: 3, ANNUELLE: 12 } as const;

export async function deposerDeclaration(obligationId: string, formData: FormData) {
  const session = await exigerPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      periode: z.string().min(4).max(20),
      montant: z.coerce.number().min(0).optional(),
      preuveRef: z.string().min(2).max(500),
    })
    .parse({
      periode: formData.get("periode"),
      montant: formData.get("montant") || undefined,
      preuveRef: formData.get("preuveRef"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const obligation = await ObligationFiscaleModel.findById(obligationId);
  if (!obligation) throw new Error("Obligation introuvable.");

  await DeclarationFiscaleModel.create({
    obligation: obligation._id,
    mandat: mandat._id,
    periode: donnees.periode,
    montant: donnees.montant,
    statut: "DEPOSEE",
    depotLe: new Date(),
    preuveRef: donnees.preuveRef,
  });

  // L'échéancier avance automatiquement selon la périodicité.
  const prochaine = new Date(obligation.prochaineEcheance);
  prochaine.setMonth(
    prochaine.getMonth() + MOIS_PAR_PERIODICITE[obligation.periodicite]
  );
  obligation.prochaineEcheance = prochaine;
  await obligation.save();

  await journaliser(session, {
    action: "tresorerie.deposerDeclaration",
    entite: "DeclarationFiscale",
    details: `${obligation.libelle} — période ${donnees.periode}, preuve archivée (rétention 10 ans)`,
  });
  revalidatePath("/tresorerie/fiscalite");
}
