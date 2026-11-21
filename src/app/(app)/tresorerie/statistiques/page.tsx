import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  StrategieFinanciereModel,
} from "@/modules/tresorerie/models";
import {
  SECTIONS_BUDGET,
  moisDuMandat,
  soldeCumule,
  sousTotalSection,
  totalParSens,
  type CodeSectionBudget,
} from "@/modules/tresorerie/services/budget-previsionnel";
import {
  indicateursExercice,
  pointsFaibles,
  pointsForts,
  repartitionParCategorie,
  type PointMensuel,
} from "@/modules/tresorerie/services/tableau-bord";
import {
  QUOTA_CA_JE_DT,
  couvertureFondsDeRoulement,
  fondsDeRoulementCible,
  statutQuota,
} from "@/modules/tresorerie/services/strategie-financiere";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";
import { BarresHorizontales, Sparkline } from "@/components/ui/graphiques";

export const dynamic = "force-dynamic";

function moisDe(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formaterDT(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} DT`;
}

function formaterTaux(t: number | null): string {
  return t === null ? "—" : `${Math.round(t * 1000) / 10} %`;
}

export default async function StatistiquesTresoreriePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");

  type MandatVue = { _id: Types.ObjectId; annee: string; debut: Date; fin: Date };
  type BudgetVue = {
    soldeInitial: number;
    lignes: { section: CodeSectionBudget; valeursMensuelles: number[] }[];
  };
  type StrategieVue = {
    nombreMoisChargesFixes: number;
    objectifs: {
      _id: Types.ObjectId;
      libelle: string;
      kpiAssocie?: string | null;
      cible?: string | null;
      echeance?: Date | null;
      statut: string;
      verrouille?: boolean | null;
      demandeSuppression?: {
        motif: string;
        statut: string;
        motifDecision?: string | null;
      } | null;
    }[];
  };

  let erreurDb: string | undefined;
  let mandat: MandatVue | null = null;
  let budget: BudgetVue | null = null;
  let strategie: StrategieVue | null = null;
  let flux: { type: "ENCAISSEMENT" | "DECAISSEMENT"; montant: number; date: Date; categorie: string }[] = [];

  try {
    await connectDb();
    const mandatDoc = await MandatModel.findOne({ statut: "ACTIF" }).lean();
    if (mandatDoc) {
      mandat = {
        _id: mandatDoc._id,
        annee: mandatDoc.annee,
        debut: new Date(mandatDoc.debut),
        fin: new Date(mandatDoc.fin),
      };

      budget = (await BudgetPrevisionnelModel.findOne({ mandat: mandat._id })
        .select("soldeInitial lignes.section lignes.valeursMensuelles")
        .lean()) as unknown as BudgetVue | null;

      strategie = (await StrategieFinanciereModel.findOne({
        mandat: mandat._id,
      }).lean()) as unknown as StrategieVue | null;

      flux = (
        await FluxTresorerieModel.find({ mandat: mandat._id })
          .select("type montant date categorie")
          .lean()
      ).map((f) => ({
        type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
        montant: f.montant,
        date: new Date(f.date),
        categorie: f.categorie,
      }));



    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  if (erreurDb) {
    return (
      <div className="mx-auto max-w-6xl">
        <AlerteDb erreur={erreurDb} />
      </div>
    );
  }
  if (!mandat) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Statistiques" />
        <NavTresorerie actif="/tresorerie/statistiques" />
        <EmptyState icon={<Gauge size={28} />} title="Aucun mandat actif" />
      </div>
    );
  }
  if (!budget) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Statistiques" />
        <NavTresorerie actif="/tresorerie/statistiques" />
        <EmptyState
          icon={<Gauge size={28} />}
          title="Aucun budget prévisionnel"
          description="Les statistiques comparent le réel au budget : créez d'abord le budget prévisionnel du mandat."
        />
      </div>
    );
  }

  const periodesMandat = moisDuMandat(mandat.debut, mandat.fin);
  const sectionsCalc = SECTIONS_BUDGET.map((s) => ({
    sens: s.sens,
    lignes: budget!.lignes.filter((l) => l.section === s.code),
  }));
  const recettesBudgetMois = totalParSens(sectionsCalc, "RECETTE", periodesMandat.length);
  const depensesBudgetMois = totalParSens(sectionsCalc, "DEPENSE", periodesMandat.length);
  const recettesReellesMois = periodesMandat.map((p) =>
    Math.round(
      flux.filter((f) => f.type === "ENCAISSEMENT" && moisDe(f.date) === p.cle).reduce((s, f) => s + f.montant, 0) * 1000
    ) / 1000
  );
  const depensesReellesMois = periodesMandat.map((p) =>
    Math.round(
      flux.filter((f) => f.type === "DECAISSEMENT" && moisDe(f.date) === p.cle).reduce((s, f) => s + f.montant, 0) * 1000
    ) / 1000
  );
  const bilanReelMois = recettesReellesMois.map((r, i) => Math.round((r - depensesReellesMois[i]) * 1000) / 1000);
  const soldeReelCumule = soldeCumule(budget.soldeInitial, bilanReelMois);
  const pointsMandat: PointMensuel[] = periodesMandat.map((p, i) => ({
    periode: p.libelle,
    soldeOuverture: i === 0 ? budget!.soldeInitial : soldeReelCumule[i - 1],
    soldeCloture: soldeReelCumule[i],
    recettesReelles: recettesReellesMois[i],
    depensesReelles: depensesReellesMois[i],
    recettesBudget: recettesBudgetMois[i],
    depensesBudget: depensesBudgetMois[i],
  }));
  const ind = indicateursExercice(pointsMandat);
  const repartitionRecettes = repartitionParCategorie(flux, "ENCAISSEMENT");
  const repartitionDepenses = repartitionParCategorie(flux, "DECAISSEMENT");
  const quota = statutQuota(ind.totalRecettesReelles, QUOTA_CA_JE_DT);

  const chargesFixesSection = SECTIONS_BUDGET.find((s) => s.code === "CHARGES_FIXES")!;
  const lignesChargesFixes = budget.lignes.filter((l) => l.section === chargesFixesSection.code);
  const sousTotalChargesFixes = sousTotalSection(
    { sens: "DEPENSE", lignes: lignesChargesFixes },
    periodesMandat.length
  );
  const chargesFixesMoyennesMensuelles =
    periodesMandat.length === 0
      ? 0
      : Math.round(
          (sousTotalChargesFixes.reduce((s, v) => s + v, 0) / periodesMandat.length) * 1000
        ) / 1000;

  const nombreMoisChargesFixes = strategie?.nombreMoisChargesFixes ?? 12;
  const cible = fondsDeRoulementCible(nombreMoisChargesFixes, chargesFixesMoyennesMensuelles);
  const couverture = couvertureFondsDeRoulement(ind.soldeCloture, cible);

  const forts = pointsForts(ind, null);
  const faibles = pointsFaibles(ind);


  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Statistiques"
        description={`${mandat.annee} — indicateurs calculés à partir du journal des flux et du budget prévisionnel. Rien n'est saisi ici.`}
      />
      <NavTresorerie actif="/tresorerie/statistiques" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Solde actuel" value={formaterDT(ind.soldeCloture)} icon={<Wallet size={20} />} />
        <StatCard
          label="Valeur ajoutée de l'exercice"
          value={formaterDT(ind.valeurAjoutee)}
          className={ind.valeurAjoutee < 0 ? "border-danger" : "border-success"}
        />
        <StatCard label="Taux de réalisation recettes" value={formaterTaux(ind.tauxRealisationRecettes)} />
        <StatCard
          label="Taux de charges"
          value={formaterTaux(ind.tauxDeCharges)}
          hint={
            ind.tauxDeCharges !== null && ind.tauxDeCharges >= 0.85
              ? "Proche du seuil critique de 100 %"
              : undefined
          }
          className={ind.tauxDeCharges !== null && ind.tauxDeCharges >= 0.85 ? "border-warning" : ""}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Évolution du solde de trésorerie</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline points={soldeReelCumule} largeur={480} hauteur={80} />
            <p className="mt-2 text-xs text-muted-foreground">
              Point bas : {formaterDT(ind.soldeMinimum)} · {ind.periodesDeficitaires} période(s)
              déficitaire(s) sur {periodesMandat.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quota Norme JE et fonds de roulement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Chiffre d&apos;affaires réel</span>
              <Badge variant={quota.atteint ? "success" : "warning"}>
                {formaterDT(quota.caReel)} / {formaterDT(quota.quota)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Fonds de roulement cible ({nombreMoisChargesFixes} mois)</span>
              <span className="font-medium">{formaterDT(cible)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Couverture du fonds de roulement</span>
              <Badge variant={couverture !== null && couverture >= 1 ? "success" : "warning"}>
                {couverture === null ? "—" : `${Math.round(couverture * 100) / 100}×`}
              </Badge>
            </div>
            {/* Le réglage de la marge de sécurité vit avec les objectifs,
                sur la Stratégie financière. */}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des recettes réelles</CardTitle>
          </CardHeader>
          <CardContent>
            <BarresHorizontales
              donnees={repartitionRecettes.map((r) => ({ label: r.categorie, valeur: r.montant }))}
              couleur="var(--success)"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition des dépenses réelles</CardTitle>
          </CardHeader>
          <CardContent>
            <BarresHorizontales
              donnees={repartitionDepenses.map((d) => ({ label: d.categorie, valeur: d.montant }))}
              couleur="var(--danger)"
            />
          </CardContent>
        </Card>
      </div>

      {forts.length > 0 || faibles.length > 0 ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {forts.length > 0 ? (
            <Card className="border-success">
              <CardHeader>
                <CardTitle>Points forts</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {forts.map((f) => (
                    <li key={f.texte}>{f.texte}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {faibles.length > 0 ? (
            <Card className="border-warning">
              <CardHeader>
                <CardTitle>Points de vigilance</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {faibles.map((f) => (
                    <li key={f.texte}>{f.texte}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/*
        Le générateur de rapport, la comparaison des mandats, les objectifs
        et les recommandations ont rejoint la Documentation financière : on
        vient ici lire des indicateurs, on va là-bas produire et suivre des
        documents. Les mêler faisait une page qu'on parcourait sans savoir
        ce qu'on y cherchait.
      */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href="/tresorerie/documentation">
          <Button size="sm">Documentation financière</Button>
        </Link>
        <Link href="/tresorerie/documentation/strategie">
          <Button size="sm" variant="outline">Stratégie financière</Button>
        </Link>
        <Link href="/tresorerie/documentation/mandats">
          <Button size="sm" variant="outline">Comparaison des mandats</Button>
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp size={14} />
        <span>
          {ind.totalRecettesReelles === 0 && ind.totalDepensesReelles === 0
            ? "Aucun flux enregistré pour l'instant : les indicateurs se peupleront au fil des saisies."
            : `${flux.length} flux pris en compte sur l'exercice.`}
        </span>
        <PiggyBank size={14} className="ml-4" />
      </div>
    </div>
  );
}
