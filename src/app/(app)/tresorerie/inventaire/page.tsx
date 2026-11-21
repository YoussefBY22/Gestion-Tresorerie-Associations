import { redirect } from "next/navigation";
import { Boxes, Coins, TrendingDown, AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import {
  BienInventaireModel,
  CATEGORIES_BIEN,
  LIBELLES_CATEGORIE_BIEN,
  ETATS_BIEN,
  MOTIFS_MOUVEMENT,
  LIBELLES_MOTIF,
  type BienInventaire,
} from "@/modules/tresorerie/models";
import {
  amortissementCumule,
  estTotalementAmorti,
  stockCourant,
  synthetiserInventaire,
  tauxAmortissement,
  valeurNetteComptable,
} from "@/modules/tresorerie/services/amortissement";
import {
  creerBien,
  enregistrerMouvement,
} from "@/modules/tresorerie/actions/inventaire";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inventaire physique" };

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const nf = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 3,
});

export default async function InventairePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let biens: (BienInventaire & { _id: unknown })[] = [];
  try {
    await connectDb();
    biens = await BienInventaireModel.find()
      .sort({ categorie: 1, reference: 1 })
      .lean<(BienInventaire & { _id: unknown })[]>();
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const synthese = synthetiserInventaire(biens);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventaire physique"
        description="Suivi patrimonial, amortissement linéaire et fiches de prélèvement — recommandation §7.2 de l'audit financier final 2025-2026."
      />
      <NavTresorerie actif="/tresorerie/inventaire" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Références"
              value={synthese.nbBiens}
              hint={`${synthese.nbReferencesEnRupture} en rupture de stock`}
              icon={<Boxes size={18} />}
            />
            <StatCard
              label="Valeur brute"
              value={nf.format(synthese.valeurBruteTotale)}
              hint="Prix d'acquisition du stock détenu"
              icon={<Coins size={18} />}
            />
            <StatCard
              label="Valeur nette comptable"
              value={nf.format(synthese.valeurNetteTotale)}
              hint={`${nf.format(synthese.amortissementCumuleTotal)} amortis`}
              icon={<TrendingDown size={18} />}
            />
            <StatCard
              label="Durées manquantes"
              value={synthese.nbSansDuree}
              hint={`${synthese.nbTotalementAmortis} bien(s) totalement amorti(s)`}
              icon={<AlertTriangle size={18} />}
            />
          </div>

          {synthese.nbSansDuree > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
              <p className="font-medium text-warning">
                {synthese.nbSansDuree} bien(s) sans durée d&apos;amortissement
              </p>
              <p className="mt-1 text-muted-foreground">
                L&apos;audit financier demande des durées « cohérentes avec la
                nature et la durée réelle d&apos;utilisation des biens ».
                Renseignez une durée pour tout bien durable ; laissez 0
                uniquement pour les consommables et goodies.
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Biens inventoriés</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Le taux d&apos;amortissement est <strong>calculé</strong> à
                  partir de la durée (100 / durée) : les deux notions ne peuvent
                  plus être confondues.
                </p>
              </CardHeader>
              <CardContent>
                {biens.length === 0 ? (
                  <EmptyState
                    title="Inventaire vide"
                    description="Enregistrez le premier bien pour démarrer le suivi patrimonial et sa valorisation."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Référence</th>
                          <th className="py-2 pr-3 font-medium">Désignation</th>
                          <th className="py-2 pr-3 text-right font-medium">Stock</th>
                          <th className="py-2 pr-3 text-right font-medium">
                            Valeur unit.
                          </th>
                          <th className="py-2 pr-3 font-medium">Amortissement</th>
                          <th className="py-2 text-right font-medium">VNC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {biens.map((b) => {
                          const stock = stockCourant(b);
                          const taux = tauxAmortissement(b.dureeAmortissementAnnees);
                          const amorti = estTotalementAmorti(b);
                          return (
                            <tr
                              key={String(b._id)}
                              className="border-b border-border/60 align-top"
                            >
                              <td className="py-2 pr-3">
                                <span className="font-medium">{b.reference}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {
                                    LIBELLES_CATEGORIE_BIEN[
                                      b.categorie as keyof typeof LIBELLES_CATEGORIE_BIEN
                                    ]
                                  }
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                {b.designation}
                                <span className="block text-xs text-muted-foreground">
                                  acquis le {df.format(new Date(b.dateAcquisition))}
                                  {b.localisation ? ` · ${b.localisation}` : ""}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {stock <= 0 ? (
                                  <Badge variant="muted">0</Badge>
                                ) : (
                                  stock
                                )}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {nf.format(b.valeurUnitaire ?? 0)}
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                {taux === null ? (
                                  <span className="text-muted-foreground">
                                    non amortissable
                                  </span>
                                ) : (
                                  <>
                                    <span>
                                      {b.dureeAmortissementAnnees} an(s) → {taux} %/an
                                    </span>
                                    <span className="block text-muted-foreground">
                                      cumulé {nf.format(amortissementCumule(b))}
                                      {amorti ? " · totalement amorti" : ""}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="py-2 text-right font-medium">
                                {nf.format(valeurNetteComptable(b))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              {peutEcrire ? (
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle>Nouveau bien</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form action={creerBien} className="space-y-3">
                      <Input name="reference" required placeholder="Référence *" />
                      <Input
                        name="designation"
                        required
                        placeholder="Désignation *"
                      />
                      <label className="block text-sm">
                        Catégorie
                        <select
                          name="categorie"
                          defaultValue="AUTRE"
                          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                        >
                          {CATEGORIES_BIEN.map((c) => (
                            <option key={c} value={c}>
                              {LIBELLES_CATEGORIE_BIEN[c]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        État
                        <select
                          name="etat"
                          defaultValue="BON"
                          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                        >
                          {ETATS_BIEN.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                          Quantité *
                          <Input
                            name="quantiteInitiale"
                            type="number"
                            min={0}
                            required
                            defaultValue={1}
                            className="mt-1"
                          />
                        </label>
                        <label className="block text-sm">
                          Valeur unit. *
                          <Input
                            name="valeurUnitaire"
                            type="number"
                            min={0}
                            step="0.001"
                            required
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <label className="block text-sm">
                        Date d&apos;acquisition *
                        <Input
                          name="dateAcquisition"
                          type="date"
                          required
                          className="mt-1"
                        />
                      </label>
                      <label className="block text-sm">
                        Durée d&apos;amortissement (années)
                        <Input
                          name="dureeAmortissementAnnees"
                          type="number"
                          min={0}
                          max={50}
                          defaultValue={0}
                          className="mt-1"
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">
                          0 = non amortissable. Le taux annuel est calculé
                          automatiquement.
                        </span>
                      </label>
                      <Input name="localisation" placeholder="Localisation" />
                      <Button type="submit" className="w-full">
                        Ajouter à l&apos;inventaire
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ) : null}

              {peutEcrire && biens.length > 0 ? (
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle>Fiche de prélèvement</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Chaque sortie est datée, motivée et nominative (§7.2). Le
                      stock se déduit des mouvements — il ne se saisit jamais à
                      la main.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <MouvementForm biens={biens} />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          {/* Derniers mouvements, tous biens confondus */}
          {biens.some((b) => b.mouvements?.length) ? (
            <Card>
              <CardHeader>
                <CardTitle>Derniers mouvements</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Bien</th>
                      <th className="py-2 pr-3 font-medium">Motif</th>
                      <th className="py-2 pr-3 text-right font-medium">Qté</th>
                      <th className="py-2 font-medium">Bénéficiaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {biens
                      .flatMap((b) =>
                        (b.mouvements ?? []).map((m) => ({
                          bien: b.reference,
                          designation: b.designation,
                          ...m,
                        }))
                      )
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() - new Date(a.date).getTime()
                      )
                      .slice(0, 20)
                      .map((m, i) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="py-2 pr-3 text-muted-foreground">
                            {df.format(new Date(m.date))}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">{m.bien}</span>
                            <span className="block text-xs text-muted-foreground">
                              {m.designation}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {LIBELLES_MOTIF[m.motif as keyof typeof LIBELLES_MOTIF]}
                            {m.reference ? (
                              <span className="block text-xs text-muted-foreground">
                                {m.reference}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={`py-2 pr-3 text-right font-medium ${
                              m.quantite < 0 ? "text-danger" : "text-success"
                            }`}
                          >
                            {m.quantite > 0 ? "+" : ""}
                            {m.quantite}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {m.beneficiaire ?? "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Formulaire de mouvement — extrait pour garder la page lisible. */
function MouvementForm({
  biens,
}: {
  biens: (BienInventaire & { _id: unknown })[];
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const id = String(formData.get("bienId"));
        await enregistrerMouvement(id, formData);
      }}
      className="space-y-2"
    >
      <label className="block text-sm">
        Bien concerné *
        <select
          name="bienId"
          required
          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
        >
          {biens.map((b) => (
            <option key={String(b._id)} value={String(b._id)}>
              {b.reference} — {b.designation} ({stockCourant(b)} u.)
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Motif *
        <select
          name="motif"
          required
          defaultValue="SORTIE_PROJET"
          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
        >
          {MOTIFS_MOUVEMENT.map((m) => (
            <option key={m} value={m}>
              {LIBELLES_MOTIF[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Quantité *
        <Input name="quantite" type="number" required defaultValue={1} className="mt-1" />
        <span className="mt-1 block text-xs text-muted-foreground">
          Le sens est déduit du motif (une sortie décrémente le stock).
          Pour une régularisation, saisissez un nombre négatif si besoin.
        </span>
      </label>

      <Input name="beneficiaire" placeholder="Bénéficiaire / preneur" />
      <Input name="reference" placeholder="Projet ou événement lié" />
      <Input name="commentaire" placeholder="Commentaire" />
      <Button type="submit" className="w-full">
        Enregistrer le mouvement
      </Button>
    </form>
  );
}
