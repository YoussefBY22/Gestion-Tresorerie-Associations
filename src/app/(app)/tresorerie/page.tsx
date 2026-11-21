import Link from "next/link";
import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { Wallet, Lock, LockOpen, FileWarning } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import { AssembleeGeneraleModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  MouvementInterneModel,
  ReleveBancaireModel,
} from "@/modules/tresorerie/models";
import {
  realiseParLigne,
  fluxSansJustificatif,
} from "@/modules/tresorerie/services/finances";
import {
  comptePourMode,
  soldeBancaireRetenu,
  soldesParCompte,
  type Compte,
} from "@/modules/tresorerie/services/caisse";
import {
  SENS_SECTION_BUDGET,
  budgetVerrouille,
  type CodeSectionBudget,
} from "@/modules/tresorerie/services/budget-previsionnel";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { SuiviBudgetaire } from "@/modules/tresorerie/components/suivi-budgetaire";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function TresoreriePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");

  type BudgetVue = {
    soldeInitial: number;
    soldeInitialCaisse: number;
    seuilTresorerieMin: number;
    lignes: {
      section: CodeSectionBudget;
      libelle: string;
      valeursMensuelles: number[];
    }[];
  };

  let erreurDb: string | undefined;
  let budget: BudgetVue | null = null;
  let verrouille = false;
  let flux: {
    type: "ENCAISSEMENT" | "DECAISSEMENT";
    montant: number;
    categorie: string;
    justificatifRef?: string | null;
  }[] = [];
  let solde = 0;
  let soldeBancaireDeclare = false;

  try {
    await connectDb();
    const mandatActif: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();
    if (mandatActif) {
      budget = (await BudgetPrevisionnelModel.findOne({
        mandat: mandatActif._id,
      }).lean()) as unknown as BudgetVue | null;
      flux = (await FluxTresorerieModel.find({ mandat: mandatActif._id })
        .select("type montant categorie justificatifRef")
        .lean()) as unknown as typeof flux;

      // Le solde affiché doit être celui des deux avoirs, banque comprise —
      // et la banque, c'est le relevé dès qu'il y en a un. Sans cela, cette
      // page et l'onglet Caisse annonceraient deux chiffres différents.
      if (budget) {
        const [fluxComptes, mouvements, releve] = await Promise.all([
          FluxTresorerieModel.find({ mandat: mandatActif._id })
            .select("type montant date compte modePaiement tiers categorie")
            .lean(),
          MouvementInterneModel.find({ mandat: mandatActif._id })
            .select("sens montant date")
            .lean(),
          ReleveBancaireModel.findOne({ mandat: mandatActif._id })
            .sort({ date: -1, createdAt: -1 })
            .select("solde")
            .lean(),
        ]);
        const caisseInitiale = budget.soldeInitialCaisse ?? 0;
        const comptes = soldesParCompte(
          {
            caisse: caisseInitiale,
            banque: budget.soldeInitial - caisseInitiale,
          },
          fluxComptes.map((f) => ({
            type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
            compte: (f.compte as Compte) ?? comptePourMode(f.modePaiement),
            montant: f.montant,
            date: new Date(f.date),
            tiers: f.tiers,
            categorie: f.categorie,
          })),
          mouvements.map((m) => ({
            sens: m.sens as "RETRAIT" | "VERSEMENT",
            montant: m.montant,
            date: new Date(m.date),
          }))
        );
        const banque = soldeBancaireRetenu(comptes.banque, releve);
        soldeBancaireDeclare = banque.source === "RELEVE";
        solde = Math.round((comptes.caisse + banque.valeur) * 1000) / 1000;
      }

      const ouverte = Boolean(
        await AssembleeGeneraleModel.exists({
          mandat: mandatActif._id,
          role: "OUVERTURE",
          statut: "TENUE",
        })
      );
      // Vue d'ensemble : la fenêtre de déverrouillage exceptionnel n'est pas
      // recalculée ici (elle exige de retrouver la demande active) — c'est
      // le rôle de la page budget. Ici, verrouillé = AG d'ouverture tenue.
      verrouille = budgetVerrouille(ouverte, false);
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const sousLeSeuil = budget ? solde < budget.seuilTresorerieMin : false;
  const sansJustif = fluxSansJustificatif(flux);
  // Vue annuelle : le « prévu » est la somme des douze mois du poste — pour
  // le détail mois par mois, voir /tresorerie/budget.
  // Défensif sur `valeursMensuelles`/`section` : un budget créé avant la
  // refonte mensualisée peut encore porter l'ancienne forme plate en base.
  const lignesBudget = (budget?.lignes ?? [])
    .filter((l) => l.section in SENS_SECTION_BUDGET)
    .map((l) => ({
      categorie: l.libelle,
      type:
        SENS_SECTION_BUDGET[l.section] === "RECETTE"
          ? ("PRODUIT" as const)
          : ("CHARGE" as const),
      prevu: (l.valeursMensuelles ?? []).reduce((s, v) => s + v, 0),
    }));
  const lignes = realiseParLigne(lignesBudget, flux);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard financier"
        description="Gestion financière complète — EX-TRS-01 → 08. Le solde et les alertes sont recalculés à chaque flux."
        actions={
          <div className="flex flex-wrap gap-2">
            {/*
              Les trois espaces de travail de la trésorerie s'ouvrent d'ici et
              non depuis la barre d'onglets : on y entre pour une séance de
              travail, on n'y passe pas en naviguant.
            */}
            <Link href="/tresorerie/budget">
              <Button size="sm">Budget prévisionnel</Button>
            </Link>
            <Link href="/tresorerie/statistiques">
              <Button size="sm">Statistiques</Button>
            </Link>
            <Link href="/tresorerie/registres">
              <Button size="sm">Registres financiers</Button>
            </Link>
            <Link href="/tresorerie/documentation">
              <Button size="sm">Documentation</Button>
            </Link>
          </div>
        }
      />
      <NavTresorerie actif="/tresorerie" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : !budget ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="Aucun budget pour cet exercice"
          description="Le budget prévisionnel du mandat se crée et se chiffre mois par mois sur l'onglet dédié."
          action={
            <Link href="/tresorerie/budget">
              <Button size="sm">Créer le budget prévisionnel</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Solde de trésorerie réel"
              value={`${solde.toLocaleString("fr-FR")} DT`}
              hint={`Caisse + banque · ${
                soldeBancaireDeclare
                  ? "banque d'après le dernier relevé"
                  : "banque calculée, faute de relevé"
              } · seuil d'alerte ${budget.seuilTresorerieMin.toLocaleString("fr-FR")} DT`}
              icon={<Wallet size={20} />}
              className={sousLeSeuil ? "border-danger" : "border-success"}
            />
            <StatCard
              label="Flux sans justificatif"
              value={sansJustif}
              hint="Bloquant pour la clôture mensuelle (EX-TRS-03)"
              icon={<FileWarning size={20} />}
              className={sansJustif ? "border-warning" : ""}
            />
            <StatCard
              label="Budget prévisionnel"
              value={verrouille ? "Verrouillé" : "Modifiable"}
              hint={
                verrouille
                  ? "AG d'ouverture tenue"
                  : "Se chiffre mois par mois sur l'onglet Budget"
              }
              icon={verrouille ? <Lock size={20} /> : <LockOpen size={20} />}
              className={verrouille ? "border-warning" : ""}
            />
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold">Recettes et charges</h2>

          {lignes.length === 0 ? (
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Aucun poste budgétaire — ajoutez des postes depuis
                  l&apos;onglet Budget prévisionnel.
                </p>
              </CardContent>
            </Card>
          ) : (
            <SuiviBudgetaire lignes={lignes} />
          )}
        </>
      )}
    </div>
  );
}
