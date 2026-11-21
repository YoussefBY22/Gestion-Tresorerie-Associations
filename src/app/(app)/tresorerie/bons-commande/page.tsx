import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import {
  BonCommandeModel,
  BudgetPrevisionnelModel,
  FournisseurModel,
} from "@/modules/tresorerie/models";
import {
  engagementsParSection,
  totalEngage,
} from "@/modules/tresorerie/services/bon-commande";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { FormulaireBonCommande } from "@/modules/tresorerie/components/formulaire-bon-commande";
import {
  LigneBonCommande,
  type BonCommandeLigne,
} from "@/modules/tresorerie/components/ligne-bon-commande";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

/**
 * Bons de commande — ce qui est promis mais pas encore payé.
 *
 * La dépense n'entrait dans les comptes qu'à la réception de la facture, donc une
 * fois due. Entre la commande et cette facture, l'enveloppe paraissait
 * disponible : c'est ainsi qu'on l'engage deux fois.
 *
 * L'écran met donc l'engagement en tête, par section budgétaire, avant la
 * liste des bons. C'est la question que se pose le Trésorier avant de
 * signer : qu'ai-je déjà promis sur cette enveloppe ?
 */
export default async function BonsCommandePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let bons: BonCommandeLigne[] = [];
  let engagements: ReturnType<typeof engagementsParSection> = [];
  let engage = 0;
  let fournisseurs: string[] = [];
  let sections: string[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      const enBase = await BonCommandeModel.find({ mandat: mandat._id })
        .sort({ emission: -1 })
        .lean();

      const maintenant = new Date();
      bons = enBase.map((b) => ({
        id: String(b._id),
        numero: b.numero,
        fournisseur: b.fournisseur,
        objet: b.objet,
        lignes: b.lignes.map((l) => ({
          designation: l.designation,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
        })),
        tauxTVA: b.tauxTVA ?? 19,
        sectionBudget: b.sectionBudget,
        statut: b.statut,
        emission: df.format(new Date(b.emission)),
        livraisonPrevue: b.livraisonPrevue
          ? df.format(new Date(b.livraisonPrevue))
          : null,
        motifAnnulation: b.motifAnnulation,
        documentId: b.document ? String(b.document) : null,
        // Une livraison attendue et dépassée, sur un bon encore engagé : rien
        // ne le signalait, et une commande perdue ne se constate jamais seule.
        enRetard:
          b.statut === "EMIS" &&
          Boolean(b.livraisonPrevue) &&
          new Date(b.livraisonPrevue as Date) < maintenant,
      }));

      engagements = engagementsParSection(
        enBase.map((b) => ({
          sectionBudget: b.sectionBudget,
          statut: b.statut,
          lignes: b.lignes,
          tauxTVA: b.tauxTVA ?? 19,
        }))
      );
      engage = totalEngage(
        enBase.map((b) => ({
          statut: b.statut,
          lignes: b.lignes,
          tauxTVA: b.tauxTVA ?? 19,
        }))
      );

      const connus = await FournisseurModel.find()
        .select("nom")
        .sort({ nom: 1 })
        .lean();
      fournisseurs = connus.map((f) => f.nom);

      // Les sections du budget en cours : proposer les intitulés existants
      // évite d'imputer la même enveloppe sous trois orthographes.
      const budget = await BudgetPrevisionnelModel.findOne({
        mandat: mandat._id,
      })
        .select("lignes")
        .lean();
      sections = [
        ...new Set(
          ((budget?.lignes ?? []) as { section?: string }[])
            .map((l) => l.section)
            .filter((s): s is string => Boolean(s))
        ),
      ].sort();
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

  const enRetard = bons.filter((b) => b.enRetard).length;
  const ouverts = bons.filter((b) => b.statut === "EMIS").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Bons de commande"
        description="L'engagement d'une dépense, avant la facture. Numérotation continue par mandat."
      />
      <NavTresorerie actif="/tresorerie/bons-commande" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Engagé, non réceptionné" value={dt(engage)} />
        <StatCard
          label="Bons ouverts"
          value={String(ouverts)}
          hint={`${bons.length} au total sur le mandat`}
        />
        <StatCard
          label="Livraisons en retard"
          value={String(enRetard)}
          hint="Date attendue dépassée"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {engagements.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Engagements par section</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="mb-2 text-xs text-muted-foreground">
                  Ce qui est promis sur chaque enveloppe et pas encore
                  réceptionné. Un bon réceptionné n&apos;y figure plus : c&apos;est
                  sa facture qui porte alors la dépense.
                </p>
                {engagements.map((e) => (
                  <div
                    key={e.section}
                    className="flex items-baseline justify-between gap-2 border-b border-border py-1 text-sm last:border-0"
                  >
                    <span className="min-w-0 truncate">{e.section}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.nombre} bon{e.nombre > 1 ? "s" : ""}
                    </span>
                    <span className="font-medium">{dt(e.engage)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Registre ({bons.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bons.length === 0 ? (
                <EmptyState
                  title="Aucun bon de commande"
                  description="Émettez un bon avant de commander : son montant sera retenu comme engagé jusqu'à la réception."
                />
              ) : (
                bons.map((b) => (
                  <LigneBonCommande
                    key={b.id}
                    bon={b}
                    peutEcrire={peutEcrire}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {peutEcrire ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Nouveau bon</CardTitle>
            </CardHeader>
            <CardContent>
              <FormulaireBonCommande
                fournisseurs={fournisseurs}
                sections={sections}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
