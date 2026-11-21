import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { AlertTriangle, Banknote, Coins, Trash2, Wallet } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  MouvementInterneModel,
  ReleveBancaireModel,
} from "@/modules/tresorerie/models";
import {
  LIBELLES_COMPTE,
  LIBELLES_SENS,
  SENS_MOUVEMENT,
  comptePourMode,
  feuilleDeCompte,
  soldeBancaireRetenu,
  soldesMensuels,
  type Compte,
  type FluxPourCaisse,
  type MouvementInterne,
  type SoldeBancaire,
} from "@/modules/tresorerie/services/caisse";
import {
  enregistrerMouvementInterne,
  genererRapportMensuel,
} from "@/modules/tresorerie/actions/fiscal";
import {
  enregistrerReleveBancaire,
  supprimerMouvementInterne,
  supprimerReleveBancaire,
} from "@/modules/tresorerie/actions/caisse";
import { FormulaireConfirme } from "@/components/ui/formulaire-confirme";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

function dt(montant: number): string {
  return montant.toFixed(3).replace(".", ",");
}

export default async function CaissePage({
  searchParams,
}: {
  searchParams: Promise<{ compte?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  const { compte: compteDemande } = await searchParams;
  const compte: Compte = compteDemande === "BANQUE" ? "BANQUE" : "CAISSE";

  let erreurDb: string | undefined;
  let lignes: ReturnType<typeof feuilleDeCompte>["lignes"] = [];
  let soldes = { caisse: 0, banque: 0, total: 0 };
  let mensuels: ReturnType<typeof soldesMensuels> = [];
  let initialCompte = 0;
  let banque: SoldeBancaire = { valeur: 0, source: "CALCULE", ecart: null };
  let dernierReleve: {
    id: string;
    date: string;
    solde: number;
    reference: string;
    saisiParNom: string;
  } | null = null;
  let virements: {
    id: string;
    date: string;
    sens: string;
    montant: number;
    reference: string;
  }[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      const [budget, fluxBruts, mouvementsBruts, releve] = await Promise.all([
        BudgetPrevisionnelModel.findOne({ mandat: mandat._id })
          .select("soldeInitial soldeInitialCaisse")
          .lean(),
        FluxTresorerieModel.find({ mandat: mandat._id })
          .sort({ date: 1, createdAt: 1 })
          .lean(),
        MouvementInterneModel.find({ mandat: mandat._id })
          .sort({ date: 1, createdAt: 1 })
          .lean(),
        ReleveBancaireModel.findOne({ mandat: mandat._id })
          .sort({ date: -1, createdAt: -1 })
          .lean(),
      ]);

      if (releve) {
        dernierReleve = {
          id: String(releve._id),
          date: df.format(new Date(releve.date)),
          solde: releve.solde,
          reference: releve.reference ?? "",
          saisiParNom: releve.saisiParNom ?? "",
        };
      }
      virements = [...mouvementsBruts].reverse().map((m) => ({
        id: String(m._id),
        date: df.format(new Date(m.date)),
        sens: m.sens,
        montant: m.montant,
        reference: m.reference ?? "",
      }));

      const caisseInitiale = budget?.soldeInitialCaisse ?? 0;
      const initiaux = {
        caisse: caisseInitiale,
        banque: (budget?.soldeInitial ?? 0) - caisseInitiale,
      };
      initialCompte = compte === "CAISSE" ? initiaux.caisse : initiaux.banque;

      // Les flux antérieurs à l'ajout du champ `compte` n'en ont pas : on le
      // déduit alors du mode de paiement plutôt que de les ranger tous en banque.
      const flux: FluxPourCaisse[] = fluxBruts.map((f) => ({
        type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
        compte: (f.compte as Compte) ?? comptePourMode(f.modePaiement),
        montant: f.montant,
        date: new Date(f.date),
        tiers: f.tiers,
        categorie: f.categorie,
        justificatifRef: f.justificatifRef,
      }));
      const mouvements: MouvementInterne[] = mouvementsBruts.map((m) => ({
        sens: m.sens as MouvementInterne["sens"],
        montant: m.montant,
        date: new Date(m.date),
        reference: m.reference,
      }));

      lignes = feuilleDeCompte(compte, initialCompte, flux, mouvements).lignes;
      mensuels = soldesMensuels(initiaux, flux, mouvements);
      const dernier = mensuels.at(-1);
      const calcules = dernier
        ? { caisse: dernier.caisse, banque: dernier.banque }
        : initiaux;

      // Le solde bancaire retenu est celui du relevé dès qu'il en existe un ;
      // le total des avoirs suit, sinon il annoncerait de l'argent absent.
      banque = soldeBancaireRetenu(calcules.banque, releve);
      soldes = {
        caisse: calcules.caisse,
        banque: banque.valeur,
        total: Math.round((calcules.caisse + banque.valeur) * 1000) / 1000,
      };
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const sansJustificatif = lignes.filter((l) => l.sansJustificatif).length;

  return (
    <div>
      <PageHeader
        title="Caisse et banque"
        description="Feuille chronologique par avoir, avec solde après chaque opération — le PV de caisse attendu à l'audit. Un virement entre la caisse et le compte n'est ni une recette ni une dépense."
      />
      <NavTresorerie actif="/tresorerie/caisse" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Solde caisse"
              value={`${dt(soldes.caisse)} DT`}
              icon={<Coins className="h-5 w-5" />}
            />
            <StatCard
              label="Solde bancaire"
              value={`${dt(soldes.banque)} DT`}
              hint={
                banque.source === "RELEVE"
                  ? `Relevé du ${dernierReleve?.date}${
                      banque.ecart
                        ? ` · écart de ${dt(banque.ecart)} DT avec les écritures`
                        : " · concorde avec les écritures"
                    }`
                  : "Calculé faute de relevé — saisissez le solde réel du compte"
              }
              icon={<Banknote className="h-5 w-5" />}
              className={
                banque.source === "CALCULE"
                  ? "border-warning"
                  : banque.ecart
                    ? "border-warning"
                    : "border-success"
              }
            />
            <StatCard
              label="Total des avoirs"
              value={`${dt(soldes.total)} DT`}
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Sans justificatif"
              value={sansJustificatif}
              hint={
                sansJustificatif
                  ? "Bloque la clôture mensuelle"
                  : "Toutes les pièces sont là"
              }
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-3">
                    <span>Feuille — {LIBELLES_COMPTE[compte]}</span>
                    <span className="flex gap-1">
                      {(["CAISSE", "BANQUE"] as Compte[]).map((c) => (
                        <a
                          key={c}
                          href={`/tresorerie/caisse?compte=${c}`}
                          className={`rounded-md px-3 py-1 text-xs font-medium ${
                            c === compte
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {LIBELLES_COMPTE[c]}
                        </a>
                      ))}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lignes.length === 0 ? (
                    <EmptyState
                      title="Aucune opération"
                      description="Les encaissements et décaissements de ce compte apparaîtront ici, dans l'ordre chronologique."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2">Date</th>
                            <th className="py-2">Libellé</th>
                            <th className="py-2">Réf.</th>
                            <th className="py-2 text-right">Débit</th>
                            <th className="py-2 text-right">Crédit</th>
                            <th className="py-2 text-right">Solde</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border text-muted-foreground">
                            <td className="py-2" colSpan={5}>
                              Solde initial
                            </td>
                            <td className="py-2 text-right font-medium">
                              {dt(initialCompte)}
                            </td>
                          </tr>
                          {lignes.map((l, i) => (
                            <tr
                              key={i}
                              className="border-b border-border last:border-0"
                            >
                              <td className="py-2 whitespace-nowrap">
                                {df.format(l.date)}
                              </td>
                              <td className="py-2">
                                {l.libelle}
                                {l.sansJustificatif ? (
                                  <Badge variant="warning" className="ml-2">
                                    sans pièce
                                  </Badge>
                                ) : null}
                              </td>
                              <td className="py-2 text-xs text-muted-foreground">
                                {l.reference || "—"}
                              </td>
                              <td className="py-2 text-right">
                                {l.debit ? dt(l.debit) : ""}
                              </td>
                              <td className="py-2 text-right">
                                {l.credit ? dt(l.credit) : ""}
                              </td>
                              <td className="py-2 text-right font-medium">
                                {dt(l.soldeCourant)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Soldes mensuels</CardTitle>
                </CardHeader>
                <CardContent>
                  {mensuels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun mouvement enregistré sur le mandat.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2">Mois</th>
                            <th className="py-2 text-right">Entrées</th>
                            <th className="py-2 text-right">Sorties</th>
                            <th className="py-2 text-right">Caisse</th>
                            <th className="py-2 text-right">Banque</th>
                            <th className="py-2 text-right">Total</th>
                            {peutEcrire ? <th className="py-2" /> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {mensuels.map((m) => (
                            <tr
                              key={m.mois}
                              className="border-b border-border last:border-0"
                            >
                              <td className="py-2">{m.mois}</td>
                              <td className="py-2 text-right text-success">
                                {m.entrees ? dt(m.entrees) : "—"}
                              </td>
                              <td className="py-2 text-right text-danger">
                                {m.sorties ? dt(m.sorties) : "—"}
                              </td>
                              <td className="py-2 text-right">{dt(m.caisse)}</td>
                              <td className="py-2 text-right">{dt(m.banque)}</td>
                              <td className="py-2 text-right font-medium">
                                {dt(m.total)}
                              </td>
                              {peutEcrire ? (
                                <td className="py-2 pl-3 text-right">
                                  <form action={genererRapportMensuel}>
                                    <input
                                      type="hidden"
                                      name="mois"
                                      value={m.mois}
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      type="submit"
                                    >
                                      Rapport
                                    </Button>
                                  </form>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {peutEcrire ? (
              <div className="space-y-6">
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle>Solde relevé du compte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form action={enregistrerReleveBancaire} className="space-y-3">
                      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        Les écritures saisies donnent{" "}
                        <span className="font-medium text-foreground">
                          {dt(
                            banque.ecart === null
                              ? soldes.banque
                              : soldes.banque - banque.ecart
                          )}{" "}
                          DT
                        </span>
                        . Portez ici ce que dit réellement le relevé de la
                        banque : c&apos;est lui qui fera foi, et l&apos;écart
                        entre les deux devient le rapprochement à expliquer.
                      </p>
                      <label className="block text-sm">
                        Solde du relevé (DT)
                        <Input
                          name="solde"
                          type="number"
                          step="0.001"
                          required
                          defaultValue={
                            banque.ecart === null
                              ? soldes.banque
                              : soldes.banque - banque.ecart
                          }
                          className="mt-1"
                        />
                      </label>
                      <label className="block text-sm">
                        Date du relevé
                        <Input name="date" type="date" required className="mt-1" />
                      </label>
                      <label className="block text-sm">
                        Référence
                        <Input
                          name="reference"
                          placeholder="N° de relevé"
                          className="mt-1"
                        />
                      </label>
                      <Button type="submit" size="sm" className="w-full">
                        Enregistrer le relevé
                      </Button>
                    </form>

                    {dernierReleve ? (
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                        <span className="text-muted-foreground">
                          Dernier relevé : {dt(dernierReleve.solde)} DT au{" "}
                          {dernierReleve.date}
                          {dernierReleve.reference
                            ? ` · ${dernierReleve.reference}`
                            : ""}
                        </span>
                        <FormulaireConfirme
                          action={supprimerReleveBancaire}
                          message={`Supprimer le relevé du ${dernierReleve.date} (${dt(dernierReleve.solde)} DT) ?\n\nLe relevé précédent reprendra la main, ou le calcul s'il n'y en a pas.`}
                        >
                          <input
                            type="hidden"
                            name="releveId"
                            value={dernierReleve.id}
                          />
                          <button
                            type="submit"
                            title="Supprimer ce relevé"
                            aria-label="Supprimer le dernier relevé"
                            className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </FormulaireConfirme>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle>Retrait / versement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form
                      action={enregistrerMouvementInterne}
                      className="space-y-3"
                    >
                      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        Disponible en caisse :{" "}
                        <span className="font-medium text-foreground">
                          {dt(soldes.caisse)} DT
                        </span>
                        . Un versement au-delà est refusé — une caisse
                        négative n&apos;existe pas.
                      </p>
                      <label className="block text-sm">
                        Sens
                        <select
                          name="sens"
                          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                        >
                          {SENS_MOUVEMENT.map((s) => (
                            <option key={s} value={s}>
                              {LIBELLES_SENS[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        Montant
                        <Input
                          name="montant"
                          type="number"
                          step="0.001"
                          min="0.001"
                          max={soldes.caisse > 0 ? soldes.caisse : undefined}
                          required
                          className="mt-1"
                        />
                      </label>
                      <label className="block text-sm">
                        Date
                        <Input name="date" type="date" required className="mt-1" />
                      </label>
                      <label className="block text-sm">
                        Référence
                        <Input
                          name="reference"
                          placeholder="N° de bordereau"
                          className="mt-1"
                        />
                      </label>
                      <Button type="submit" className="w-full">
                        Enregistrer
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Un virement interne ne modifie pas le total des avoirs :
                        il n&apos;apparaît ni en recette ni en dépense au budget.
                      </p>
                    </form>

                    {virements.length > 0 ? (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                        {virements.slice(0, 6).map((v) => (
                          <li
                            key={v.id}
                            className="group flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-muted-foreground">
                              {v.date} · {v.sens === "RETRAIT" ? "Retrait" : "Versement"}{" "}
                              {dt(v.montant)} DT
                            </span>
                            <FormulaireConfirme
                              action={supprimerMouvementInterne}
                              message={`Supprimer ce virement (${dt(v.montant)} DT du ${v.date}) ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`}
                            >
                              <input
                                type="hidden"
                                name="mouvementId"
                                value={v.id}
                              />
                              <button
                                type="submit"
                                title="Supprimer ce virement"
                                aria-label={`Supprimer le virement du ${v.date}`}
                                className="rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </FormulaireConfirme>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
