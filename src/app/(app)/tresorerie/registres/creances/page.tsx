import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Landmark, Lock, Pencil } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { ProjetModel } from "@/modules/base/models";
import { ClientModel } from "@/modules/base/models";
import { FactureModel } from "@/modules/tresorerie/models";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Registre des créances — sommes facturées non encore encaissées.
 *
 * Le classeur en faisait un registre à ressaisir à la main (« Solde restant
 * identifié en fin d'exercice » — une estimation, pas un calcul). Ici, une
 * créance EST une facture émise non payée : rien à tenir à part (ADR-010).
 */
export default async function RegistreCreancesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");

  type LigneCreance = {
    id: string;
    client: string;
    projet: string;
    numero: string;
    montantTTC: number;
    echeance: Date;
    enRetard: boolean;
  };

  let erreurDb: string | undefined;
  let lignes: LigneCreance[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      const factures = await FactureModel.find({
        mandat: mandat._id,
        statut: "EMISE",
      })
        .select("_id projet numero montantHT tauxTVA echeance")
        .lean();

      const projetIds = [...new Set(factures.map((f) => String(f.projet)))];
      const projets = await ProjetModel.find({ _id: { $in: projetIds } })
        .select("_id nom client")
        .lean();
      const clientIds = [...new Set(projets.map((p) => String(p.client)))];
      const clients = await ClientModel.find({ _id: { $in: clientIds } })
        .select("_id organisation")
        .lean();
      const nomClient = new Map(clients.map((c) => [String(c._id), c.organisation]));
      const projetParId = new Map(projets.map((p) => [String(p._id), p]));

      const maintenant = new Date();
      lignes = factures.map((f) => {
        const projet = projetParId.get(String(f.projet));
        const montantTTC =
          Math.round(f.montantHT * (1 + f.tauxTVA / 100) * 1000) / 1000;
        return {
          id: String(f._id),
          client: projet ? (nomClient.get(String(projet.client)) ?? "Client inconnu") : "Client inconnu",
          projet: projet?.nom ?? "Projet inconnu",
          numero: f.numero,
          montantTTC,
          echeance: new Date(f.echeance),
          enRetard: new Date(f.echeance).getTime() < maintenant.getTime(),
        };
      });
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const total = lignes.reduce((s, l) => s + l.montantTTC, 0);
  const enRetard = lignes.filter((l) => l.enRetard).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Registre des créances"
        description="Factures émises, non encore encaissées — calculées depuis le module Projets."
        actions={
          <Link href="/tresorerie/registres">
            <Button size="sm">
              <ArrowLeft size={14} /> Registres
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/registres" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Créances en cours" value={lignes.length} icon={<Landmark size={20} />} />
            <StatCard label="Montant total" value={`${total.toLocaleString("fr-FR")} DT`} />
            <StatCard
              label="En retard"
              value={enRetard}
              className={enRetard > 0 ? "border-danger" : ""}
            />
          </div>

          {/*
            Ce registre ne se saisit pas : une créance EST une facture émise
            non payée (ADR-010). La corriger ici ferait une seconde vérité qui
            divergerait de la facture dès le premier avenant — on renvoie donc
            à la pièce d'origine, qui est modifiable tant qu'elle n'est pas
            réglée.
          */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Détail
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
                  <Lock size={11} aria-hidden /> Déduit des factures
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <p className="mb-3 text-xs text-muted-foreground">
                Rien ne se saisit ici : chaque ligne est une facture émise non
                encore encaissée. Corrigez-la, supprimez-la ou encaissez-la
                depuis{" "}
                <Link href="/tresorerie/factures" className="text-primary hover:underline">
                  les factures clients
                </Link>{" "}
                — elle sort du registre d&apos;elle-même une fois réglée.
              </p>
              {lignes.length === 0 ? (
                <EmptyState icon={<Landmark size={28} />} title="Aucune créance" description="Toutes les factures émises sont soldées." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Client</th>
                      <th className="py-2 pr-3 font-medium">Projet</th>
                      <th className="py-2 pr-3 font-medium">Facture</th>
                      <th className="py-2 pr-3 font-medium">Montant TTC</th>
                      <th className="py-2 pr-3 font-medium">Échéance</th>
                      <th className="py-2 pr-3 font-medium">État</th>
                      <th className="w-12 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-medium">{l.client}</td>
                        <td className="py-2 pr-3">{l.projet}</td>
                        <td className="py-2 pr-3">{l.numero}</td>
                        <td className="py-2 pr-3">{l.montantTTC.toLocaleString("fr-FR")} DT</td>
                        <td className="py-2 pr-3">{df.format(l.echeance)}</td>
                        <td className="py-2 pr-3">
                          {l.enRetard ? (
                            <Badge variant="danger">En retard</Badge>
                          ) : (
                            <Badge variant="muted">Dans les délais</Badge>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Link
                            href="/tresorerie/factures"
                            title={`Corriger la facture ${l.numero}`}
                            aria-label={`Corriger la facture ${l.numero}`}
                            className="inline-flex rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
