import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import { creerMandat, activerMandat } from "@/modules/core/actions/admin";
import { dateISO, mandatCourant, mandatSuivant } from "@/modules/core/services/mandat";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { FormulaireAction } from "@/components/ui/formulaire-action";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function MandatsPage() {
  let mandats:
    | { _id: unknown; annee: string; debut: Date; fin: Date; statut: string }[]
    | undefined = undefined;
  let erreurDb: string | undefined;
  try {
    await connectDb();
    mandats = await MandatModel.find().sort({ debut: -1 }).lean();
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  // Suggestion du prochain mandat, calculée — jamais à retenir ni à
  // retaper chaque année. L'exercice proposé suit la convention définie
   // par MOIS_DEBUT_EXERCICE (par défaut : 1er juillet → 30 juin).
  const dernier = mandats?.[0];
  const suggestion = dernier ? mandatSuivant(dernier.annee) : null;
  const propose = suggestion ?? mandatCourant();

  return (
    <div>
      <PageHeader
        title="Mandats"
        description="Exercices annuels — story 01.4. Un seul mandat actif ; l'archivage ne supprime rien (continuité EX-GRH-14/15/16)."
      />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{mandats?.length ?? 0} mandat(s)</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Année</th>
                    <th className="py-2 pr-3 font-medium">Période</th>
                    <th className="py-2 pr-3 font-medium">Statut</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mandats?.map((m) => (
                    <tr key={String(m._id)} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{m.annee}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {df.format(new Date(m.debut))} → {df.format(new Date(m.fin))}
                      </td>
                      <td className="py-2 pr-3">
                        {m.statut === "ACTIF" ? (
                          <Badge variant="success">Actif</Badge>
                        ) : (
                          <Badge variant="muted">Archivé (lecture seule)</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        {m.statut !== "ACTIF" ? (
                          <FormulaireAction
                            action={activerMandat}
                            confirmation={`Rendre l'exercice ${m.annee} actif ? Les nouvelles écritures lui seront rattachées, et l'exercice actuellement actif passera en lecture seule.`}
                          >
                            <input type="hidden" name="id" value={String(m._id)} />
                            <Button variant="outline" size="sm" type="submit">
                              Activer (bascule d&apos;exercice)
                            </Button>
                          </FormulaireAction>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Nouveau mandat</CardTitle>
            </CardHeader>
            <CardContent>
              <FormulaireAction action={creerMandat} className="space-y-3">
                <Input
                  name="annee"
                  required
                  pattern="\d{4}-\d{4}"
                  defaultValue={propose.annee}
                  placeholder="2026-2027"
                />
                <label className="block text-sm">
                  Début
                  <Input
                    name="debut"
                    type="date"
                    required
                    defaultValue={dateISO(propose.debut)}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm">
                  Fin
                  <Input
                    name="fin"
                    type="date"
                    required
                    defaultValue={dateISO(propose.fin)}
                    className="mt-1"
                  />
                </label>
                <Button type="submit" className="w-full">
                  Créer (archivé — à activer explicitement)
                </Button>
                <p className="text-xs text-muted-foreground">
                  Dates suggérées selon la convention de la structure
                  (1er juillet → 30 juin) — modifiables si cet exercice fait
                  exception.
                </p>
              </FormulaireAction>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
