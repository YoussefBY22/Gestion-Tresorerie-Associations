import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import {
  ObligationFiscaleModel,
  DeclarationFiscaleModel,
  TYPES_IMPOT,
  PERIODICITES,
} from "@/modules/tresorerie/models";
import {
  creerObligation,
  deposerDeclaration,
} from "@/modules/tresorerie/actions/tresorerie";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const JOUR_MS = 86_400_000;

export default async function FiscalitePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let obligations: {
    _id: unknown;
    type: string;
    libelle: string;
    periodicite: string;
    prochaineEcheance: Date;
  }[] = [];
  let declarations: {
    _id: unknown;
    periode: string;
    montant?: number | null;
    depotLe?: Date | null;
    preuveRef?: string | null;
    obligation: { libelle: string } | null;
  }[] = [];

  try {
    await connectDb();
    obligations = (await ObligationFiscaleModel.find({ active: true })
      .sort({ prochaineEcheance: 1 })
      .lean()) as unknown as typeof obligations;
    const mandatActif: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();
    if (mandatActif) {
      declarations = (await DeclarationFiscaleModel.find({ mandat: mandatActif._id })
        .sort({ depotLe: -1 })
        .limit(30)
        .populate("obligation", "libelle")
        .lean()) as unknown as typeof declarations;
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const maintenant = new Date().getTime();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fiscalité"
        description="Échéancier fiscal (TVA, IS, RAS…) avec alertes J-7 · preuves de dépôt conservées 10 ans (EX-TRS-08)."
      />
      <NavTresorerie actif="/tresorerie/fiscalite" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Échéancier ({obligations.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {obligations.map((o) => {
                  const delta =
                    new Date(o.prochaineEcheance).getTime() - maintenant;
                  return (
                    <div key={String(o._id)} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            <Badge variant="outline" className="mr-2">
                              {o.type}
                            </Badge>
                            {o.libelle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o.periodicite.toLowerCase()} · prochaine échéance :{" "}
                            {df.format(new Date(o.prochaineEcheance))}
                          </p>
                        </div>
                        {delta < 0 ? (
                          <Badge variant="danger">Échue</Badge>
                        ) : delta <= 7 * JOUR_MS ? (
                          <Badge variant="warning">≤ 7 jours</Badge>
                        ) : (
                          <Badge variant="muted">À venir</Badge>
                        )}
                      </div>
                      {peutEcrire ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            Déposer la déclaration
                          </summary>
                          <form
                            action={deposerDeclaration.bind(null, String(o._id))}
                            className="mt-1 flex flex-wrap gap-2"
                          >
                            <Input
                              name="periode"
                              required
                              placeholder="Période (2026-06) *"
                              className="h-8 w-32 text-xs"
                            />
                            <Input
                              name="montant"
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Montant DT"
                              className="h-8 w-28 text-xs"
                            />
                            <Input
                              name="preuveRef"
                              required
                              placeholder="Preuve de dépôt (lien/réf) *"
                              className="h-8 w-44 text-xs"
                            />
                            <Button size="sm" type="submit">
                              Déposer
                            </Button>
                          </form>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            L&apos;échéancier avance automatiquement selon la périodicité.
                          </p>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Déclarations déposées ({declarations.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Obligation</th>
                      <th className="py-2 pr-3 font-medium">Période</th>
                      <th className="py-2 pr-3 font-medium">Montant</th>
                      <th className="py-2 pr-3 font-medium">Dépôt</th>
                      <th className="py-2 font-medium">Preuve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declarations.map((d) => (
                      <tr key={String(d._id)} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-medium">{d.obligation?.libelle}</td>
                        <td className="py-2 pr-3">{d.periode}</td>
                        <td className="py-2 pr-3">
                          {d.montant ? `${d.montant.toLocaleString("fr-FR")} DT` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {d.depotLe ? df.format(new Date(d.depotLe)) : "—"}
                        </td>
                        <td className="py-2">
                          {d.preuveRef ? (
                            <Badge variant="success" title={d.preuveRef}>
                              Archivée
                            </Badge>
                          ) : (
                            <Badge variant="warning">Manquante</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Nouvelle obligation</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={creerObligation} className="space-y-3">
                  <select
                    name="type"
                    className="flex h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {TYPES_IMPOT.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Input name="libelle" required placeholder="Libellé (ex. Déclaration TVA) *" />
                  <select
                    name="periodicite"
                    className="flex h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {PERIODICITES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <label className="block text-sm">
                    Prochaine échéance
                    <Input name="prochaineEcheance" type="date" required className="mt-1" />
                  </label>
                  <Button type="submit" className="w-full">
                    Ajouter à l&apos;échéancier
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Alerte automatique (+ e-mail) au Trésorier à J-7.
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
