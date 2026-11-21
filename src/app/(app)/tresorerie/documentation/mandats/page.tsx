import Link from "next/link";
import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { KPIHistoriqueModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
} from "@/modules/tresorerie/models";
import { INDICATEURS_COMPARAISON_MANDATS } from "@/modules/tresorerie/services/tableau-bord";
import { enregistrerComparaisonMandat } from "@/modules/tresorerie/actions/tableau-bord";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

function formaterTaux(t: number | null): string {
  return t === null ? "—" : `${Math.round(t * 1000) / 10} %`;
}

export default async function ComparaisonMandatsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let annee = "";
  let mandatActuel: Record<string, string> = {};
  let anneesHistorique: string[] = [];
  let valeurs = new Map<string, string>();

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId; annee: string; debut: Date; fin: Date } | null =
      await MandatModel.findOne({ statut: "ACTIF" }).lean();

    if (mandat) {
      annee = mandat.annee;
      const [budget, flux, comparaisons] = await Promise.all([
        BudgetPrevisionnelModel.findOne({ mandat: mandat._id }).lean(),
        FluxTresorerieModel.find({ mandat: mandat._id })
          .select("type montant date categorie")
          .lean(),
        KPIHistoriqueModel.find({
          indicateur: { $in: INDICATEURS_COMPARAISON_MANDATS },
        })
          .select("annee indicateur valeur")
          .lean(),
      ]);

      anneesHistorique = [...new Set(comparaisons.map((c) => c.annee))].sort();
      valeurs = new Map(
        comparaisons.map((c) => [`${c.indicateur}|${c.annee}`, c.valeur])
      );

      if (budget) {
        // Le mandat en cours ne se saisit pas : il se calcule, sinon les deux
        // colonnes finiraient par se contredire.
        const recettes = flux
          .filter((f) => f.type === "ENCAISSEMENT")
          .reduce((s, f) => s + f.montant, 0);
        const depenses = flux
          .filter((f) => f.type === "DECAISSEMENT")
          .reduce((s, f) => s + f.montant, 0);
        const valeurAjoutee = recettes - depenses;
        const tauxDeCharges = recettes === 0 ? null : depenses / recettes;
        mandatActuel = {
          "Trésorerie — Solde ouverture (DT)": budget.soldeInitial.toFixed(3),
          "Trésorerie — Total recettes (DT)": recettes.toFixed(3),
          "Trésorerie — Total dépenses (DT)": depenses.toFixed(3),
          "Trésorerie — Valeur ajoutée (DT)": valeurAjoutee.toFixed(3),
          "Trésorerie — Solde clôture (DT)": (
            budget.soldeInitial + valeurAjoutee
          ).toFixed(3),
          "Trésorerie — Taux de charges (%)": formaterTaux(tauxDeCharges),
        };
      }
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Comparaison des mandats"
        description="Le mandat en cours se calcule seul ; les mandats antérieurs à l'application se saisissent à la main, une fois."
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Indicateurs comparés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Indicateur</th>
                    <th className="py-2 pr-3 font-medium">{annee} (en cours)</th>
                    {anneesHistorique.map((a) => (
                      <th key={a} className="py-2 pr-3 font-medium">
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INDICATEURS_COMPARAISON_MANDATS.map((i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{i}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {mandatActuel[i] ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {anneesHistorique.map((a) => (
                        <td key={a} className="py-2 pr-3 tabular-nums">
                          {valeurs.get(`${i}|${a}`) ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {peutEcrire ? (
              <form
                action={enregistrerComparaisonMandat}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <label className="text-sm">
                  Mandat
                  <Input
                    name="annee"
                    required
                    placeholder="2023-2024"
                    pattern="\d{4}-\d{4}"
                    className="mt-1 h-9 w-32"
                  />
                </label>
                <label className="text-sm">
                  Indicateur
                  <select
                    name="indicateur"
                    required
                    className="mt-1 flex h-9 rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {INDICATEURS_COMPARAISON_MANDATS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Valeur
                  <Input
                    name="valeur"
                    required
                    placeholder="2420"
                    className="mt-1 h-9 w-32"
                  />
                </label>
                <Button size="sm" type="submit">
                  Enregistrer
                </Button>
              </form>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Ce registre est partagé avec l&apos;analyse d&apos;alignement
              stratégique du module Management : une même donnée, deux vues,
              plutôt que deux copies qui finiraient par diverger.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
