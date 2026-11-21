"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { notifier } from "@/modules/core/services/notifications";
import { MandatModel } from "@/modules/core/models";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { AssembleeGeneraleModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  DemandeModificationBudgetModel,
  type BudgetPrevisionnel,
} from "@/modules/tresorerie/models";
import {
  LIBELLES_SECTION_BUDGET,
  SECTIONS_BUDGET,
  budgetVerrouille,
  moisDuMandat,
  validerTransitionDemandeBudget,
  type CodeSectionBudget,
} from "@/modules/tresorerie/services/budget-previsionnel";
import { enregistrerFichier } from "@/modules/documents/services/stockage";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireBudgetPrevisionnel } from "@/modules/documents/services/gabarits/budget-previsionnel";

/**
 * Budget prévisionnel du mandat.
 *
 * Le verrouillage ne se commande jamais directement ici : il se déduit de
 * l'existence d'une AG d'ouverture tenue (module secrétariat). Toute action
 * d'édition directe vérifie donc l'état réel de l'AG à chaque appel — pas un
 * drapeau qu'on aurait pu oublier de lever.
 */

const CODES_SECTION = SECTIONS_BUDGET.map((s) => s.code);
/** Un justificatif de poste budgétaire est une facture ou un devis : quelques centaines de Ko. */
const TAILLE_MAX_JUSTIFICATIF = 10 * 1024 * 1024;

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

async function agOuvertureTenue(mandatId: Types.ObjectId): Promise<boolean> {
  const ag = await AssembleeGeneraleModel.exists({
    mandat: mandatId,
    role: "OUVERTURE",
    statut: "TENUE",
  });
  return Boolean(ag);
}

/**
 * Garde commune à toute modification directe du budget : lève une erreur
 * explicite plutôt que de laisser une écriture silencieusement incohérente.
 */
async function exigerBudgetModifiable(
  mandatId: Types.ObjectId,
  budget: Pick<BudgetPrevisionnel, "demandeActive">
): Promise<void> {
  const ouverte = await agOuvertureTenue(mandatId);
  const verrouille = budgetVerrouille(ouverte, Boolean(budget.demandeActive));
  if (verrouille) {
    throw new Error(
      "Le budget est verrouillé depuis l'AG d'ouverture : demandez une modification exceptionnelle au Président."
    );
  }
}

export async function creerBudgetPrevisionnel(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      soldeInitial: z.coerce.number(),
      soldeInitialCaisse: z.coerce.number().min(0),
      seuilTresorerieMin: z.coerce.number().min(0),
    })
    .parse({
      soldeInitial: formData.get("soldeInitial") || 0,
      soldeInitialCaisse: formData.get("soldeInitialCaisse") || 0,
      seuilTresorerieMin: formData.get("seuilTresorerieMin") || 500,
    });

  if (donnees.soldeInitialCaisse > donnees.soldeInitial) {
    throw new Error(
      "La part en caisse ne peut pas dépasser le solde initial total."
    );
  }

  await connectDb();
  const mandat = await mandatActifRequis();
  const existant = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (existant) throw new Error("Un budget existe déjà pour ce mandat.");

  await BudgetPrevisionnelModel.create({ mandat: mandat._id, ...donnees });
  await journaliser(session, {
    action: "tresorerie.budget.creer",
    entite: "BudgetPrevisionnel",
    details: `Exercice ${mandat.annee} — solde initial ${donnees.soldeInitial} DT`,
  });
  revalidatePath("/tresorerie/budget");
  revalidatePath("/tresorerie");
}

export async function majParametresBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      soldeInitial: z.coerce.number(),
      soldeInitialCaisse: z.coerce.number().min(0),
      seuilTresorerieMin: z.coerce.number().min(0),
    })
    .parse({
      soldeInitial: formData.get("soldeInitial"),
      soldeInitialCaisse: formData.get("soldeInitialCaisse"),
      seuilTresorerieMin: formData.get("seuilTresorerieMin"),
    });
  if (donnees.soldeInitialCaisse > donnees.soldeInitial) {
    throw new Error(
      "La part en caisse ne peut pas dépasser le solde initial total."
    );
  }

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Créez d'abord le budget de l'exercice.");
  await exigerBudgetModifiable(mandat._id, budget);

  budget.soldeInitial = donnees.soldeInitial;
  budget.soldeInitialCaisse = donnees.soldeInitialCaisse;
  budget.seuilTresorerieMin = donnees.seuilTresorerieMin;
  await budget.save();

  await journaliser(session, {
    action: "tresorerie.budget.parametres",
    entite: "BudgetPrevisionnel",
    details: `Solde initial ${donnees.soldeInitial} DT, seuil ${donnees.seuilTresorerieMin} DT`,
  });
  revalidatePath("/tresorerie/budget");
  revalidatePath("/tresorerie");
}

/**
 * Crée ou met à jour une ligne budgétaire selon la présence de `ligneId` —
 * un seul formulaire par poste dans la grille, comme un tableur.
 */
export async function enregistrerLigneBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      ligneId: z.string().optional(),
      section: z.enum(CODES_SECTION as [string, ...string[]]),
      // Un libellé vide est permis : la ligne naît vierge et se nomme
      // ensuite, au fil de la frappe.
      libelle: z.string().max(150),
      valeurs: z.array(z.coerce.number()),
    })
    .parse({
      ligneId: formData.get("ligneId") || undefined,
      section: formData.get("section"),
      libelle: formData.get("libelle") ?? "",
      valeurs: formData.getAll("valeur"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Créez d'abord le budget de l'exercice.");
  await exigerBudgetModifiable(mandat._id, budget);

  const nbMois = moisDuMandat(mandat.debut, mandat.fin).length;
  if (donnees.valeurs.length !== nbMois) {
    throw new Error(
      `${donnees.valeurs.length} valeur(s) reçue(s) pour ${nbMois} mois attendus.`
    );
  }

  if (donnees.ligneId) {
    const ligne = budget.lignes.id(donnees.ligneId);
    if (!ligne) throw new Error("Ligne budgétaire introuvable.");
    ligne.section = donnees.section as typeof ligne.section;
    ligne.libelle = donnees.libelle;
    ligne.valeursMensuelles = donnees.valeurs;
  } else {
    budget.lignes.push({
      section: donnees.section,
      libelle: donnees.libelle,
      valeursMensuelles: donnees.valeurs,
    } as (typeof budget.lignes)[number]);
  }
  await budget.save();

  await journaliser(session, {
    action: donnees.ligneId ? "tresorerie.budget.ligne.modifier" : "tresorerie.budget.ligne.ajouter",
    entite: "BudgetPrevisionnel",
    entiteId: donnees.ligneId,
    details: `${donnees.section} — ${donnees.libelle}`,
  });
  revalidatePath("/tresorerie/budget");
}

/**
 * Ajoute un poste vierge à une section — la ligne se remplit ensuite dans la
 * grille, comme dans un tableur. Aucune saisie préalable n'est demandée : le
 * nombre de mois est connu du serveur, pas de l'écran.
 */
export async function ajouterLigneBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const section = z
    .enum(CODES_SECTION as [string, ...string[]])
    .parse(formData.get("section"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Créez d'abord le budget de l'exercice.");
  await exigerBudgetModifiable(mandat._id, budget);

  const nbMois = moisDuMandat(mandat.debut, mandat.fin).length;
  budget.lignes.push({
    section,
    libelle: "",
    valeursMensuelles: Array.from({ length: nbMois }, () => 0),
  } as (typeof budget.lignes)[number]);
  await budget.save();

  await journaliser(session, {
    action: "tresorerie.budget.ligne.ajouter",
    entite: "BudgetPrevisionnel",
    details: `${section} — poste vierge`,
  });
  revalidatePath("/tresorerie/budget");
}

/**
 * Suppression d'un poste — vers la corbeille, jamais directement en base.
 * Le justificatif éventuel suit le poste : il n'est détruit qu'à la purge,
 * sans quoi une restauration rendrait un poste amputé de sa pièce.
 */
export async function supprimerLigneBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const ligneId = z.string().min(1).parse(formData.get("ligneId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Budget introuvable.");
  await exigerBudgetModifiable(mandat._id, budget);

  const ligne = budget.lignes.id(ligneId);
  if (!ligne) throw new Error("Ligne budgétaire introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "LIGNE_BUDGET",
    titre: ligne.libelle || "Poste sans libellé",
    description: `${LIBELLES_SECTION_BUDGET[ligne.section as CodeSectionBudget]} — budget ${mandat.annee}`,
    donnees: { budgetId: String(budget._id), ligne: ligne.toObject() },
    fichiers: [ligne.justificatif?.fichierId],
    session,
  });

  budget.lignes.pull(ligneId);
  await budget.save();

  await journaliser(session, {
    action: "tresorerie.budget.ligne.supprimer",
    entite: "BudgetPrevisionnel",
    entiteId: ligneId,
    details: `${ligne.libelle} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/budget");
  revalidatePath("/corbeille");
}

export async function deposerJustificatifLigne(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const ligneId = z.string().min(1).parse(formData.get("ligneId"));

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Le fichier justificatif est requis.");
  }
  if (fichier.type !== "application/pdf") {
    throw new Error("Le justificatif doit être un fichier PDF.");
  }
  if (fichier.size > TAILLE_MAX_JUSTIFICATIF) {
    throw new Error(
      `Fichier trop volumineux (${Math.round(fichier.size / 1024)} Ko pour ${TAILLE_MAX_JUSTIFICATIF / 1024 / 1024} Mo maximum).`
    );
  }

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Budget introuvable.");
  await exigerBudgetModifiable(mandat._id, budget);

  const ligne = budget.lignes.id(ligneId);
  if (!ligne) throw new Error("Ligne budgétaire introuvable.");

  // Un justificatif remplacé n'est pas un justificatif de trop : il part à la
  // corbeille comme n'importe quelle suppression, récupérable 30 jours.
  const ancien = ligne.justificatif?.fichierId
    ? {
        fichierId: ligne.justificatif.fichierId,
        nomFichier: ligne.justificatif.nomFichier,
        tailleOctets: ligne.justificatif.tailleOctets,
        deposeLe: ligne.justificatif.deposeLe,
        deposePar: ligne.justificatif.deposePar,
      }
    : null;
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  const { fichierId, tailleOctets } = await enregistrerFichier(
    fichier.name || `justificatif-${ligne.libelle}.pdf`,
    contenu,
    { contentType: "application/pdf", ligne: String(ligne._id) }
  );

  // La corbeille prend l'ancien justificatif *avant* que la ligne ne le
  // lâche : si l'écriture échoue ensuite, le fichier a toujours un
  // propriétaire. Dans l'ordre inverse, un échec l'abandonnerait dans GridFS
  // sans que personne ne sache plus qu'il existe.
  if (ancien) {
    await mettreALaCorbeille({
      module: "tresorerie",
      type: "JUSTIFICATIF_BUDGET",
      titre: ancien.nomFichier || `Justificatif remplacé — ${ligne.libelle}`,
      description: `Remplacé le ${new Date().toLocaleDateString("fr-FR")} sur le poste « ${ligne.libelle} »`,
      donnees: {
        budgetId: String(budget._id),
        ligneId: String(ligne._id),
        justificatif: ancien,
      },
      fichiers: [ancien.fichierId],
      session,
    });
  }

  ligne.justificatif = {
    fichierId,
    nomFichier: fichier.name || undefined,
    tailleOctets,
    deposeLe: new Date(),
    deposePar: session.user.id || undefined,
  } as (typeof ligne)["justificatif"];
  await budget.save();

  await journaliser(session, {
    action: "tresorerie.budget.justificatif",
    entite: "BudgetPrevisionnel",
    entiteId: ligneId,
    details: fichier.name,
  });
  revalidatePath("/tresorerie/budget");
}

export async function supprimerJustificatifLigne(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const ligneId = z.string().min(1).parse(formData.get("ligneId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Budget introuvable.");
  await exigerBudgetModifiable(mandat._id, budget);

  const ligne = budget.lignes.id(ligneId);
  if (!ligne?.justificatif?.fichierId) return;

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "JUSTIFICATIF_BUDGET",
    titre: ligne.justificatif.nomFichier || `Justificatif — ${ligne.libelle}`,
    description: `Poste « ${ligne.libelle} » — budget ${mandat.annee}`,
    donnees: {
      budgetId: String(budget._id),
      ligneId: String(ligne._id),
      justificatif: ligne.justificatif,
    },
    fichiers: [ligne.justificatif.fichierId],
    session,
  });

  ligne.justificatif = undefined;
  await budget.save();

  await journaliser(session, {
    action: "tresorerie.budget.justificatif.retrait",
    entite: "BudgetPrevisionnel",
    entiteId: ligneId,
  });
  revalidatePath("/tresorerie/budget");
  revalidatePath("/corbeille");
}

/* ------------------------------------------------------------------ */
/* Demande de modification post-verrouillage                          */
/* ------------------------------------------------------------------ */

export async function demanderModificationBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const motif = z.string().min(10).max(2000).parse(formData.get("motif"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Budget introuvable.");

  const ouverte = await agOuvertureTenue(mandat._id);
  if (!ouverte) {
    throw new Error(
      "Le budget n'est pas encore verrouillé : modifiez-le directement, aucune demande n'est nécessaire."
    );
  }
  if (budget.demandeActive) {
    throw new Error("Une demande est déjà en cours pour ce budget.");
  }
  const enAttente = await DemandeModificationBudgetModel.exists({
    budget: budget._id,
    statut: "EN_ATTENTE",
  });
  if (enAttente) {
    throw new Error("Une demande est déjà en attente de décision du Président.");
  }

  const demande = await DemandeModificationBudgetModel.create({
    mandat: mandat._id,
    budget: budget._id,
    motif,
    demandePar: session.user.id,
    statut: "EN_ATTENTE",
  });

  await notifier(
    { roles: ["PRESIDENT", "SUPER_ADMIN"] },
    {
      titre: "Demande de modification du budget prévisionnel",
      message: `${session.user.name ?? "Le Trésorier"} demande à rouvrir le budget ${mandat.annee} — motif : ${motif}`,
      lien: "/tresorerie/budget",
      type: "validation",
      critique: true,
      cle: `budget-demande:${demande._id}`,
    }
  );

  await journaliser(session, {
    action: "tresorerie.budget.demande.creer",
    entite: "DemandeModificationBudget",
    entiteId: demande._id.toString(),
    details: motif.slice(0, 160),
  });
  revalidatePath("/tresorerie/budget");
}

/**
 * Décision du Président — la seule porte de sortie du verrouillage.
 *
 * Une acceptation fige l'état actuel du budget en version d'historique
 * *avant* d'ouvrir l'édition : c'est la trace de ce que le budget disait
 * juste avant que cette modification ne soit autorisée.
 */
export async function deciderDemandeModificationBudget(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const donnees = z
    .object({
      demandeId: z.string().min(1),
      decision: z.enum(["ACCEPTEE", "REFUSEE"]),
      motifDecision: z.string().max(2000).optional(),
    })
    .parse({
      demandeId: formData.get("demandeId"),
      decision: formData.get("decision"),
      motifDecision: formData.get("motifDecision") || undefined,
    });

  await connectDb();
  const demande = await DemandeModificationBudgetModel.findById(donnees.demandeId);
  if (!demande) throw new Error("Demande introuvable.");

  const refus = validerTransitionDemandeBudget(
    demande.statut as "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE" | "APPLIQUEE",
    donnees.decision
  );
  if (refus) throw new Error(refus);

  const budget = await BudgetPrevisionnelModel.findById(demande.budget);
  if (!budget) throw new Error("Budget introuvable.");

  demande.statut = donnees.decision;
  demande.decidePar = new Types.ObjectId(session.user.id);
  demande.decideLe = new Date();
  demande.motifDecision = donnees.motifDecision;
  await demande.save();

  if (donnees.decision === "ACCEPTEE") {
    budget.versions.push({
      numero: budget.versions.length + 1,
      figeeLe: new Date(),
      figeePar: session.user.id,
      motif: demande.motif,
      demande: demande._id,
      soldeInitial: budget.soldeInitial,
      soldeInitialCaisse: budget.soldeInitialCaisse,
      seuilTresorerieMin: budget.seuilTresorerieMin,
      // Copie figée en objets simples : la version doit rester une photo
      // indépendante, pas une référence vivante vers les mêmes sous-documents.
      lignes: budget.lignes.map((l) => ({
        section: l.section,
        libelle: l.libelle,
        valeursMensuelles: [...l.valeursMensuelles],
        justificatif: l.justificatif
          ? {
              fichierId: l.justificatif.fichierId,
              nomFichier: l.justificatif.nomFichier,
              tailleOctets: l.justificatif.tailleOctets,
              deposeLe: l.justificatif.deposeLe,
              deposePar: l.justificatif.deposePar,
            }
          : undefined,
      })),
    } as unknown as (typeof budget.versions)[number]);
    budget.demandeActive = demande._id;
    await budget.save();
  }

  await notifier(
    { utilisateurIds: [String(demande.demandePar)] },
    {
      titre:
        donnees.decision === "ACCEPTEE"
          ? "Modification du budget acceptée"
          : "Modification du budget refusée",
      message:
        donnees.decision === "ACCEPTEE"
          ? "Le Président a accepté votre demande : le budget est temporairement déverrouillé."
          : `Le Président a refusé votre demande.${donnees.motifDecision ? ` Motif : ${donnees.motifDecision}` : ""}`,
      lien: "/tresorerie/budget",
      type: "validation",
      critique: true,
      cle: `budget-decision:${demande._id}`,
    }
  );

  await journaliser(session, {
    action: "tresorerie.budget.demande.decider",
    entite: "DemandeModificationBudget",
    entiteId: donnees.demandeId,
    details: donnees.decision,
  });
  revalidatePath("/tresorerie/budget");
}

/** Le Trésorier signale la fin de sa modification : le budget se reverrouille. */
export async function terminerModificationBudget() {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget?.demandeActive) {
    throw new Error("Aucune modification en cours à clôturer.");
  }

  const demande = await DemandeModificationBudgetModel.findById(budget.demandeActive);
  if (demande) {
    const refus = validerTransitionDemandeBudget(
      demande.statut as "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE" | "APPLIQUEE",
      "APPLIQUEE"
    );
    if (refus) throw new Error(refus);
    demande.statut = "APPLIQUEE";
    demande.appliqueeLe = new Date();
    await demande.save();
  }

  budget.demandeActive = undefined;
  await budget.save();

  await notifier(
    { roles: ["PRESIDENT", "SUPER_ADMIN"] },
    {
      titre: "Budget reverrouillé",
      message: "Le Trésorier a clôturé sa modification exceptionnelle du budget.",
      lien: "/tresorerie/budget",
      type: "info",
      cle: `budget-terminee:${budget.demandeActive}`,
    }
  );

  await journaliser(session, {
    action: "tresorerie.budget.demande.terminer",
    entite: "BudgetPrevisionnel",
  });
  revalidatePath("/tresorerie/budget");
}

/* ------------------------------------------------------------------ */
/* Export PDF                                                          */
/* ------------------------------------------------------------------ */

/**
 * Émet un PDF du budget dans son état courant.
 *
 * Sans `objetId` : chaque export prend son propre numéro plutôt que de se
 * heurter à la règle « un document actif par objet ». Un budget évolue
 * (verrouillage, modifications approuvées) et chaque étape mérite sa trace,
 * comme le rapport financier mensuel qui le précède dans le catalogue.
 */
export async function emettreBudgetPdf() {
  const session = await exigerModuleEtPermission("tresorerie", "lire");

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Aucun budget à exporter pour ce mandat.");

  const periodes = moisDuMandat(mandat.debut, mandat.fin);
  const ouverte = await agOuvertureTenue(mandat._id);
  const verrouille = budgetVerrouille(ouverte, Boolean(budget.demandeActive));

  const sections = SECTIONS_BUDGET.map((s) => ({
    libelle: s.libelle,
    sens: s.sens,
    lignes: budget.lignes
      .filter((l) => l.section === s.code)
      .map((l) => ({
        libelle: l.libelle || "(poste sans libellé)",
        valeursMensuelles: l.valeursMensuelles,
        aJustificatif: Boolean(l.justificatif?.fichierId),
      })),
  }));

  const { reference } = await emettreDocument({
    modele: "BUDGET_PREVISIONNEL",
    mandat: { _id: mandat._id, annee: mandat.annee },
    objetType: "BudgetPrevisionnel",
    titre: `Budget prévisionnel — ${mandat.annee}`,
    session,
    donnees: {
      reference: "",
      mandat: mandat.annee,
      periodes,
      sections,
      soldeInitial: budget.soldeInitial,
      version: budget.versions.length + 1,
      verrouille,
      etabliLe: new Date(),
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (d, ref) => construireBudgetPrevisionnel({ ...d, reference: ref }),
  });

  await journaliser(session, {
    action: "tresorerie.budget.export",
    entite: "BudgetPrevisionnel",
    details: reference,
  });
  revalidatePath("/documents");
  revalidatePath("/tresorerie/budget");
}
