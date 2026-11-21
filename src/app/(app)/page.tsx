import Link from "next/link";
import type { Types } from "mongoose";
import {
  Bell,
  FileWarning,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
import { MandatModel, NotificationModel } from "@/modules/core/models";
import {
  FactureModel,
  FluxTresorerieModel,
} from "@/modules/tresorerie/models";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Accueil.
 *
 * Volontairement une page de constat, pas de calcul : elle dit ce qui bouge
 * et ce qui traîne, puis renvoie vers l'écran qui fait foi.
 *
 * Le **solde** n'est pas affiché ici. Il dépend du relevé bancaire, des
 * mouvements internes et des soldes d'ouverture ; deux endroits qui le
 * calculent, c'est tôt ou tard deux chiffres différents sur le même argent.
 * Il reste donc sur « Trésorerie », qui en est la seule source.
 */

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const dt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export default async function AccueilPage() {
  const session = await auth();
  const prenom = session?.user?.name?.split(" ")[0] ?? "";

  let mandat: { annee: string; debut: Date; fin: Date } | null = null;
  let encaisse = 0;
  let decaisse = 0;
  let nbOperations = 0;
  let sansJustificatif = 0;
  let impayees: { nombre: number; total: number } = { nombre: 0, total: 0 };
  let notifications: {
    _id: unknown;
    titre: string;
    type: string;
    createdAt: Date;
  }[] = [];

  try {
    await connectDb();
    const mandatActif: {
      _id: Types.ObjectId;
      annee: string;
      debut: Date;
      fin: Date;
    } | null = await MandatModel.findOne({ statut: "ACTIF" })
      .select("_id annee debut fin")
      .lean();

    if (mandatActif) {
      mandat = {
        annee: mandatActif.annee,
        debut: mandatActif.debut,
        fin: mandatActif.fin,
      };

      const [flux, factures] = await Promise.all([
        FluxTresorerieModel.find({ mandat: mandatActif._id })
          .select("type montant justificatifRef")
          .lean(),
        FactureModel.find({ mandat: mandatActif._id })
          .select("statut montantHT tauxTVA")
          .lean(),
      ]);

      nbOperations = flux.length;
      for (const f of flux) {
        if (f.type === "ENCAISSEMENT") encaisse += f.montant ?? 0;
        else decaisse += f.montant ?? 0;
        // Une opération sans pièce est une opération que l'audit ne pourra
        // pas vérifier : c'est le retard le plus coûteux à laisser traîner.
        if (!f.justificatifRef?.trim()) sansJustificatif += 1;
      }

      // Le TTC se calcule comme sur l'écran Factures — même formule, sinon
      // l'accueil et la liste annonceraient deux montants pour une facture.
      const dues = factures.filter((f) => f.statut === "EMISE");
      impayees = {
        nombre: dues.length,
        total:
          Math.round(
            dues.reduce(
              (s, f) => s + f.montantHT * (1 + (f.tauxTVA ?? 0) / 100),
              0
            ) * 100
          ) / 100,
      };
    }

    if (session?.user?.id) {
      notifications = await NotificationModel.find({
        destinataire: session.user.id,
        lue: false,
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("titre type createdAt")
        .lean();
    }
  } catch {
    // Base injoignable : la page reste affichable avec ses états vides,
    // plutôt qu'un écran d'erreur à l'ouverture de l'application.
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={prenom ? "Bonjour " + prenom : "Bonjour"}
        description={
          mandat
            ? "Exercice " +
              mandat.annee +
              " · du " +
              df.format(new Date(mandat.debut)) +
              " au " +
              df.format(new Date(mandat.fin))
            : "Aucun exercice actif : créez-en un dans Administration pour commencer à saisir."
        }
        actions={
          <Link href="/tresorerie">
            <Button>Ouvrir la trésorerie</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Encaissements de l'exercice"
          value={dt(encaisse) + " DT"}
          hint={nbOperations + " opération(s) au journal"}
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Décaissements de l'exercice"
          value={dt(decaisse) + " DT"}
          hint="Dépenses enregistrées, toutes catégories"
          icon={<TrendingDown size={20} />}
        />
        <StatCard
          label="Factures à encaisser"
          value={impayees.nombre}
          hint={dt(impayees.total) + " DT en attente de règlement"}
          icon={<ReceiptText size={20} />}
        />
        <StatCard
          label="Opérations sans pièce"
          value={sansJustificatif}
          hint="À justifier avant la revue des comptes"
          icon={<FileWarning size={20} />}
          className={sansJustificatif > 0 ? "border-destructive/50" : ""}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/notifications" className="hover:underline">
                Mes notifications
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <EmptyState
                icon={<Bell size={28} />}
                title="Rien de non lu"
                description="Échéances, validations en attente et alertes apparaîtront ici."
              />
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li
                    key={String(n._id)}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Badge variant={n.type === "alerte" ? "danger" : "muted"}>
                      {n.type}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">{n.titre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {df.format(new Date(n.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Par où commencer</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[
                {
                  href: "/tresorerie/budget",
                  titre: "Budget prévisionnel",
                  quoi: "Les postes de l'exercice, puis le suivi réel contre prévu.",
                },
                {
                  href: "/tresorerie/flux",
                  titre: "Journal des opérations",
                  quoi: "Chaque encaissement et chaque dépense, avec sa pièce.",
                },
                {
                  href: "/tresorerie/factures",
                  titre: "Factures et devis",
                  quoi: "Du devis signé à l'encaissement, numérotation suivie.",
                },
                {
                  href: "/tresorerie/registres/clients",
                  titre: "Registres",
                  quoi: "Clients, adhérents, donateurs, fournisseurs.",
                },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="group flex items-start gap-3 rounded-md p-2 hover:bg-muted"
                  >
                    <Wallet
                      size={16}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <span>
                      <span className="font-medium group-hover:underline">
                        {l.titre}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {l.quoi}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
