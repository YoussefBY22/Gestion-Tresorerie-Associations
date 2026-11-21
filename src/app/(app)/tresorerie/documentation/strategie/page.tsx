import Link from "next/link";
import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { ArrowLeft, Lock } from "lucide-react";
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
  sousTotalSection,
} from "@/modules/tresorerie/services/budget-previsionnel";
import {
  QUOTA_CA_JE_DT,
  couvertureFondsDeRoulement,
  fondsDeRoulementCible,
  objectifEnVigueur,
  statutQuota,
  type StatutObjectifFinancier,
} from "@/modules/tresorerie/services/strategie-financiere";
import {
  ajouterObjectifFinancier,
  creerStrategieFinanciere,
  majNombreMoisChargesFixes,
} from "@/modules/tresorerie/actions/tableau-bord";
import {
  ObjectifsFinanciers,
  type ObjectifVue,
} from "@/modules/tresorerie/components/objectifs-financiers";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function formaterDT(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} DT`;
}

export default async function StrategieFinancierePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");
  const peutValider = can(session.user.roles, "tresorerie", "valider");

  let erreurDb: string | undefined;
  let annee = "";
  let objectifs: ObjectifVue[] = [];
  let existe = false;
  let nombreMois = 12;
  let cible = 0;
  let couverture: number | null = null;
  let quota = { quota: QUOTA_CA_JE_DT, caReel: 0, ecart: 0, atteint: false };

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId; annee: string; debut: Date; fin: Date } | null =
      await MandatModel.findOne({ statut: "ACTIF" }).lean();

    if (mandat) {
      annee = mandat.annee;
      const [strategie, budget, flux] = await Promise.all([
        StrategieFinanciereModel.findOne({ mandat: mandat._id }).lean(),
        BudgetPrevisionnelModel.findOne({ mandat: mandat._id }).lean(),
        FluxTresorerieModel.find({ mandat: mandat._id }).select("type montant").lean(),
      ]);

      existe = Boolean(strategie);
      nombreMois = strategie?.nombreMoisChargesFixes ?? 12;

      const recettes = flux
        .filter((f) => f.type === "ENCAISSEMENT")
        .reduce((s, f) => s + f.montant, 0);
      const depenses = flux
        .filter((f) => f.type === "DECAISSEMENT")
        .reduce((s, f) => s + f.montant, 0);
      quota = statutQuota(recettes, QUOTA_CA_JE_DT);

      if (budget) {
        const periodes = moisDuMandat(new Date(mandat.debut), new Date(mandat.fin));
        const section = SECTIONS_BUDGET.find((s) => s.code === "CHARGES_FIXES")!;
        const sousTotal = sousTotalSection(
          {
            sens: "DEPENSE",
            lignes: budget.lignes.filter((l) => l.section === section.code),
          },
          periodes.length
        );
        const moyenne =
          periodes.length === 0
            ? 0
            : sousTotal.reduce((s, v) => s + v, 0) / periodes.length;
        cible = fondsDeRoulementCible(nombreMois, moyenne);
        couverture = couvertureFondsDeRoulement(
          budget.soldeInitial + recettes - depenses,
          cible
        );
      }

      objectifs = (strategie?.objectifs ?? []).map((o) => {
        const validation =
          (o.validation?.statut as ObjectifVue["validation"]) ?? null;
        return {
          id: String(o._id),
          libelle: o.libelle,
          kpiAssocie: o.kpiAssocie ?? "",
          cible: o.cible ?? "",
          echeance: o.echeance ? df.format(new Date(o.echeance)) : "",
          statut: o.statut as StatutObjectifFinancier,
          verrouille: Boolean(o.verrouille),
          validation,
          enVigueur: objectifEnVigueur(
            Boolean(o.verrouille),
            validation ? { statut: validation } : null
          ),
          suppressionDemandee:
            (o.demandeSuppression?.statut as ObjectifVue["suppressionDemandee"]) ??
            null,
          motifSuppression: o.demandeSuppression?.motif ?? "",
        };
      });
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const graves = objectifs.filter((o) => o.verrouille && o.enVigueur);
  const libres = objectifs.filter((o) => !(o.verrouille && o.enVigueur));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Stratégie financière"
        description={`${annee} — les objectifs que le mandat s'engage à tenir. Ceux de la Norme JE s'imposent ; les autres se posent, et se gravent si le Président l'accepte.`}
        actions={
          <Link href="/tresorerie/documentation">
            <Button size="sm" variant="outline">
              <ArrowLeft size={14} /> Documentation
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/documentation" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : !existe ? (
        <Card>
          <CardHeader>
            <CardTitle>Créer la stratégie financière du mandat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Elle naît avec les deux objectifs imposés par la Norme JE : zéro
              dette en fin de mandat, et un chiffre d&apos;affaires signé
              au-dessus du quota.
            </p>
            {peutEcrire ? (
              <form action={creerStrategieFinanciere} className="flex items-end gap-2">
                <label className="text-sm">
                  Mois de charges fixes à couvrir
                  <Input
                    name="nombreMoisChargesFixes"
                    type="number"
                    min={1}
                    defaultValue={12}
                    className="mt-1 h-9 w-32"
                  />
                </label>
                <Button size="sm" type="submit">
                  Créer
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Quota Norme JE"
              value={`${formaterDT(quota.caReel)} / ${formaterDT(quota.quota)}`}
              hint={quota.atteint ? "Atteint" : `Reste ${formaterDT(-quota.ecart)}`}
              className={quota.atteint ? "border-success" : "border-warning"}
            />
            <StatCard
              label={`Fonds de roulement cible (${nombreMois} mois)`}
              value={formaterDT(cible)}
            />
            <StatCard
              label="Couverture du fonds de roulement"
              value={couverture === null ? "—" : `${Math.round(couverture * 100)} %`}
              hint={
                couverture === null
                  ? "Aucune charge fixe budgétée : la cible vaut zéro"
                  : undefined
              }
              className={
                couverture !== null && couverture < 1 ? "border-warning" : ""
              }
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock size={16} /> Objectifs gravés ({graves.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ObjectifsFinanciers
                objectifs={graves}
                peutEcrire={peutEcrire}
                peutValider={peutValider}
              />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Objectifs du plan d&apos;action ({libres.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ObjectifsFinanciers
                objectifs={libres}
                peutEcrire={peutEcrire}
                peutValider={peutValider}
              />

              {peutEcrire ? (
                <form
                  action={ajouterObjectifFinancier}
                  className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
                >
                  <Input
                    name="libelle"
                    required
                    minLength={3}
                    placeholder="Nouvel objectif *"
                    className="h-9 min-w-52 flex-1"
                  />
                  <Input
                    name="kpiAssocie"
                    placeholder="KPI associé"
                    className="h-9 w-44"
                  />
                  <Input name="cible" placeholder="Cible" className="h-9 w-32" />
                  <Input name="echeance" type="date" className="h-9 w-40" />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="verrouille" className="h-4 w-4" />
                    <span title="Un objectif gravé ne se modifie ni ne se supprime sans l'accord du Président.">
                      Graver
                    </span>
                  </label>
                  <Button size="sm" type="submit">
                    Ajouter
                  </Button>
                </form>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Cocher « Graver » soumet l&apos;objectif au Président : une fois
                accepté, ni son libellé ni sa cible ne bougent plus, et son
                retrait demandera une nouvelle décision. Tant qu&apos;il
                n&apos;a pas tranché, l&apos;objectif reste visible mais ne
                compte pas.
              </p>
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Marge de sécurité</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={majNombreMoisChargesFixes}
                  className="flex flex-wrap items-end gap-2"
                >
                  <label className="text-sm">
                    Mois de charges fixes que la réserve doit couvrir
                    <Input
                      name="nombreMoisChargesFixes"
                      type="number"
                      min={1}
                      defaultValue={nombreMois}
                      className="mt-1 h-9 w-32"
                    />
                  </label>
                  <Button size="sm" type="submit">
                    Mettre à jour
                  </Button>
                  <Badge variant="muted">
                    12 mois = un an de sécurité · 6 = plus souple, plus risqué
                  </Badge>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
