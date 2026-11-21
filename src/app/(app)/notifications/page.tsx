import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
import { NotificationModel } from "@/modules/core/models";
import {
  marquerNotificationLue,
  toutMarquerLu,
} from "@/modules/core/actions/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const varianteParType: Record<string, "muted" | "warning" | "danger" | "success"> = {
  info: "muted",
  echeance: "warning",
  alerte: "danger",
  validation: "success",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let erreurDb: string | undefined;
  let notifications:
    | {
        _id: unknown;
        titre: string;
        message?: string | null;
        lien?: string | null;
        type: string;
        lue: boolean;
        createdAt: Date;
      }[]
    | undefined = undefined;

  try {
    await connectDb();
    notifications = await NotificationModel.find({
      destinataire: session.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const nonLues = notifications?.filter((n) => !n.lue).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Échéances, validations en attente, alertes — story 03.1."
        actions={
          nonLues > 0 ? (
            <form action={toutMarquerLu}>
              <Button variant="outline" size="sm" type="submit">
                Tout marquer lu ({nonLues})
              </Button>
            </form>
          ) : undefined
        }
      />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : !notifications?.length ? (
        <EmptyState
          icon={<Bell size={28} />}
          title="Aucune notification"
          description="Vous serez notifié ici (et par e-mail pour les alertes critiques)."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={String(n._id)}
              className={`rounded-lg border border-border p-4 ${n.lue ? "opacity-60" : "bg-card"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <Badge
                      variant={varianteParType[n.type] ?? "muted"}
                      className="mr-2"
                    >
                      {n.type}
                    </Badge>
                    {n.titre}
                  </p>
                  {n.message ? (
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {df.format(new Date(n.createdAt))}
                    {n.lien ? (
                      <>
                        {" · "}
                        <Link href={n.lien} className="text-primary underline">
                          Ouvrir
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {!n.lue ? (
                  <form action={marquerNotificationLue.bind(null, String(n._id))}>
                    <Button variant="ghost" size="sm" type="submit">
                      Marquer lu
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
