import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { JournalActiviteModel } from "@/modules/core/models";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

export default async function JournalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "journal", "lire")) redirect("/");

  let entrees:
    | {
        _id: unknown;
        horodatage: Date;
        email: string;
        action: string;
        entite: string;
        details?: string | null;
      }[]
    | undefined = undefined;
  let erreurDb: string | undefined;
  try {
    await connectDb();
    entrees = await JournalActiviteModel.find()
      .sort({ horodatage: -1 })
      .limit(200)
      .lean();
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Journal d'activité"
        description="Trace inviolable (append-only) de toutes les actions — story 01.7. 200 dernières entrées."
      />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : !entrees?.length ? (
        <EmptyState
          icon={<ScrollText size={28} />}
          title="Journal vide"
          description="Les actions apparaissent ici dès la première mutation."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{entrees.length} entrée(s)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Horodatage</th>
                  <th className="py-2 pr-3 font-medium">Qui</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Entité</th>
                  <th className="py-2 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {entrees.map((e) => (
                  <tr key={String(e._id)} className="border-b border-border/60">
                    <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                      {df.format(new Date(e.horodatage))}
                    </td>
                    <td className="py-2 pr-3">{e.email}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{e.action}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {e.entite}
                    </td>
                    <td className="max-w-md truncate py-2 text-muted-foreground">
                      {e.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
