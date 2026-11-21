import { redirect } from "next/navigation";
import { FileDown, Lock, LockOpen, Trash2, Wallet } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { AssembleeGeneraleModel } from "@/modules/base/models";
import { DocumentModel } from "@/modules/documents/models";
import {
  BudgetPrevisionnelModel,
  DemandeModificationBudgetModel,
  FluxTresorerieModel,
} from "@/modules/tresorerie/models";
import {
  LIBELLES_SECTION_BUDGET,
  LIBELLES_STATUT_DEMANDE_BUDGET,
  SECTIONS_BUDGET,
  bilanMensuel,
  budgetVerrouille,
  moisDuMandat,
  partEcoulee,
  respectBudget,
  soldeCumule,
  totalParSens,
  type CodeSectionBudget,
} from "@/modules/tresorerie/services/budget-previsionnel";
import {
  creerBudgetPrevisionnel,
  deciderDemandeModificationBudget,
  demanderModificationBudget,
  emettreBudgetPdf,
  majParametresBudget,
  terminerModificationBudget,
} from "@/modules/tresorerie/actions/budget-previsionnel";
import { supprimerDocumentTresorerie } from "@/modules/tresorerie/actions/recus";
import { GrilleBudget } from "@/modules/tresorerie/components/grille-budget";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { FormulaireConfirme } from "@/components/ui/formulaire-confirme";
import { BlocRepliable } from "@/components/ui/bloc-repliable";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function formaterDT(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} DT`;
}

/** « Août 2025 » → « Août 25 » : la grille manque déjà de place. */
function libelleCourt(libelle: string): string {
  return libelle.replace(/\b(\d{4})$/, (a) => a.slice(2));
}

export default async function BudgetPrevisionnelPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");
  const peutValider = can(session.user.roles, "tresorerie", "valider");

  type MandatVue = { _id: Types.ObjectId; annee: string; debut: Date; fin: Date };
  type LigneVue = {
    _id: Types.ObjectId;
    section: CodeSectionBudget;
    libelle: string;
    valeursMensuelles: number[];
    justificatif?: { nomFichier?: string | null; tailleOctets?: number | null } | null;
  };
  type BudgetVue = {
    _id: Types.ObjectId;
    soldeInitial: number;
    soldeInitialCaisse: number;
    seuilTresorerieMin: number;
    demandeActive?: Types.ObjectId | null;
    versions: { numero: number; figeeLe: Date; motif?: string | null }[];
    lignes: LigneVue[];
  };
  type DemandeVue = {
    _id: Types.ObjectId;
    motif: string;
    statut: string;
    motifDecision?: string | null;
    demandePar?: Types.ObjectId | null;
  };

  let erreurDb: string | undefined;
  let mandat: MandatVue | null = null;
  let budget: BudgetVue | null = null;
  let ouverte = false;
  let demande: DemandeVue | null = null;
  let exports: { id: string; reference: string; emisLe: Date }[] = [];
  let realiseRecettes = 0;
  let realiseCharges = 0;

  try {
    await connectDb();
    const mandatDoc = await MandatModel.findOne({ statut: "ACTIF" }).lean();
    if (mandatDoc) {
      mandat = {
        _id: mandatDoc._id,
        annee: mandatDoc.annee,
        debut: new Date(mandatDoc.debut),
        fin: new Date(mandatDoc.fin),
      };

      budget = (await BudgetPrevisionnelModel.findOne({
        mandat: mandat._id,
      }).lean()) as unknown as BudgetVue | null;

      ouverte = Boolean(
        await AssembleeGeneraleModel.exists({
          mandat: mandat._id,
          role: "OUVERTURE",
          statut: "TENUE",
        })
      );

      if (budget?.demandeActive) {
        demande = (await DemandeModificationBudgetModel.findById(
          budget.demandeActive
        ).lean()) as unknown as DemandeVue | null;
      } else if (budget) {
        // Sans demande active, on affiche quand même la dernière décidée —
        // pour que le Trésorier voie le refus qu'il vient d'essuyer.
        demande = (await DemandeModificationBudgetModel.findOne({
          budget: budget._id,
        })
          .sort({ createdAt: -1 })
          .lean()) as unknown as DemandeVue | null;
      }

      if (budget) {
        // Le réalisé vient du journal des flux : c'est lui qui dit si le
        // budget est tenu, le budget seul ne dit que l'intention.
        const flux = await FluxTresorerieModel.find({ mandat: mandat._id })
          .select("type montant")
          .lean();
        for (const f of flux) {
          if (f.type === "ENCAISSEMENT") realiseRecettes += f.montant;
          else realiseCharges += f.montant;
        }

        exports = (
          await DocumentModel.find({
            modele: "BUDGET_PREVISIONNEL",
            mandat: mandat._id,
          })
            .select("_id reference emisLe")
            .sort({ emisLe: -1 })
            .limit(5)
            .lean()
        ).map((d) => ({
          id: String(d._id),
          reference: d.reference,
          emisLe: new Date(d.emisLe),
        }));
      }
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
  if (!mandat) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Budget prévisionnel" />
        <NavTresorerie actif="/tresorerie/budget" />
        <EmptyState
          icon={<Wallet size={28} />}
          title="Aucun mandat actif"
          description="Le budget prévisionnel se rattache au mandat en cours."
        />
      </div>
    );
  }

  const periodes = moisDuMandat(mandat.debut, mandat.fin);
  const demandeAcceptee = demande?.statut === "ACCEPTEE";
  const verrouille = budget ? budgetVerrouille(ouverte, demandeAcceptee) : false;
  const version = budget ? budget.versions.length + 1 : 1;
  const peutEditer = peutEcrire && !verrouille;

  const sections = SECTIONS_BUDGET.map((s) => ({
    code: s.code,
    libelle: s.libelle,
    sens: s.sens,
    lignes: (budget?.lignes ?? []).filter((l) => l.section === s.code),
  }));
  const sectionsCalc = sections.map((s) => ({ sens: s.sens, lignes: s.lignes }));
  const totalDepenses = totalParSens(sectionsCalc, "DEPENSE", periodes.length);
  const totalRecettes = totalParSens(sectionsCalc, "RECETTE", periodes.length);
  const bilan = bilanMensuel(totalRecettes, totalDepenses);
  const solde = soldeCumule(budget?.soldeInitial ?? 0, bilan);

  const prevuRecettes = totalRecettes.reduce((s, v) => s + v, 0);
  const prevuCharges = totalDepenses.reduce((s, v) => s + v, 0);
  const respect = respectBudget({
    prevuRecettes,
    prevuCharges,
    realiseRecettes,
    realiseCharges,
    partEcoulee: partEcoulee(mandat.debut, mandat.fin, new Date()),
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Budget prévisionnel"
        description={`${mandat.annee} — postes de charges et de recettes, chiffrés mois par mois.`}
        actions={
          budget ? (
            <form action={emettreBudgetPdf}>
              <Button size="sm" type="submit">
                <FileDown size={14} /> Exporter en PDF
              </Button>
            </form>
          ) : undefined
        }
      />
      <NavTresorerie actif="/tresorerie/budget" />

      {!budget ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyState
            icon={<Wallet size={28} />}
            title="Aucun budget pour cet exercice"
            description="Créez le budget prévisionnel du mandat : solde d'ouverture et seuil d'alerte. Les postes se saisissent ensuite, mois par mois."
          />
          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Créer le budget de l&apos;exercice</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={creerBudgetPrevisionnel} className="space-y-3">
                  <label className="block text-sm">
                    Solde de trésorerie à l&apos;ouverture du mandat (DT)
                    <Input
                      name="soldeInitial"
                      type="number"
                      step="0.001"
                      defaultValue={0}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-sm">
                    Dont en caisse (DT)
                    <Input
                      name="soldeInitialCaisse"
                      type="number"
                      min={0}
                      step="0.001"
                      defaultValue={0}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-sm">
                    Seuil d&apos;alerte trésorerie (DT)
                    <Input
                      name="seuilTresorerieMin"
                      type="number"
                      min={0}
                      step="0.001"
                      defaultValue={500}
                      className="mt-1"
                    />
                  </label>
                  <Button type="submit" className="w-full">
                    Créer le budget
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Statut du budget"
              value={verrouille ? "Verrouillé" : "Modifiable"}
              icon={verrouille ? <Lock size={20} /> : <LockOpen size={20} />}
              hint={
                verrouille
                  ? "AG d'ouverture tenue — passez par une demande pour le modifier"
                  : "L'AG d'ouverture n'a pas encore été tenue"
              }
              className={verrouille ? "border-warning" : "border-success"}
            />
            <StatCard
              label="Solde de trésorerie à l'ouverture"
              value={formaterDT(budget.soldeInitial)}
            />
            <StatCard
              label="Total recettes prévues"
              value={formaterDT(prevuRecettes)}
              hint={`${formaterDT(realiseRecettes)} encaissés à ce jour`}
              className="border-success"
            />
            <StatCard
              label="Total charges prévues"
              value={formaterDT(prevuCharges)}
              hint={`${formaterDT(realiseCharges)} dépensés à ce jour`}
              className="border-danger"
            />
            <StatCard
              label="Respect du budget prévisionnel"
              value={respect ? `${respect.global} %` : "—"}
              hint={
                respect
                  ? `Recettes ${respect.recettes ?? "—"} % · charges ${respect.charges ?? "—"} % — rapporté au temps écoulé`
                  : "Rien de budgété ni de réalisé pour l'instant"
              }
              className={
                !respect
                  ? ""
                  : respect.global >= 80
                    ? "border-success"
                    : respect.global >= 60
                      ? "border-warning"
                      : "border-danger"
              }
            />
          </div>

          {/* Verrouillage et demandes de modification */}
          {verrouille && !demandeAcceptee ? (
            <Card className="mt-6 border-warning">
              <CardHeader>
                <CardTitle>Budget verrouillé</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  L&apos;AG d&apos;ouverture a été tenue : le budget voté ne se
                  modifie plus directement. Une modification exceptionnelle
                  passe par l&apos;accord du Président.
                </p>

                {demande && demande.statut === "EN_ATTENTE" ? (
                  <div className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium">
                      Demande en attente —{" "}
                      {LIBELLES_STATUT_DEMANDE_BUDGET[
                        demande.statut as keyof typeof LIBELLES_STATUT_DEMANDE_BUDGET
                      ]}
                    </p>
                    <p className="mt-1 text-muted-foreground">{demande.motif}</p>
                    {peutValider ? (
                      <form
                        action={deciderDemandeModificationBudget}
                        className="mt-3 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="demandeId" value={String(demande._id)} />
                        <Input
                          name="motifDecision"
                          placeholder="Commentaire (optionnel)"
                          className="h-9 flex-1 min-w-40"
                        />
                        <select
                          name="decision"
                          aria-label="Décision"
                          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                        >
                          <option value="ACCEPTEE">Accepter</option>
                          <option value="REFUSEE">Refuser</option>
                        </select>
                        <Button size="sm" type="submit">
                          Valider la décision
                        </Button>
                      </form>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        En attente de la décision du Président.
                      </p>
                    )}
                  </div>
                ) : demande && demande.statut === "REFUSEE" ? (
                  <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
                    Dernière demande refusée
                    {demande.motifDecision ? ` — ${demande.motifDecision}` : ""}.
                  </p>
                ) : null}

                {peutEcrire && (!demande || demande.statut !== "EN_ATTENTE") ? (
                  <form action={demanderModificationBudget} className="space-y-2 border-t border-border pt-3">
                    <textarea
                      name="motif"
                      required
                      minLength={10}
                      rows={2}
                      placeholder="Motif de la demande de modification (obligatoire)"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    />
                    <Button size="sm" type="submit">
                      Demander une modification au Président
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {demandeAcceptee ? (
            <Card className="mt-6 border-success">
              <CardHeader>
                <CardTitle>Modification exceptionnelle en cours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Le Président a accepté : motif « {demande?.motif} ». Le
                  budget est temporairement modifiable. L&apos;état actuel a
                  été conservé en historique (version {budget.versions.length}
                  ).
                </p>
                {peutEcrire ? (
                  <form action={terminerModificationBudget}>
                    <Button size="sm" type="submit">
                      Terminer la modification et reverrouiller
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Paramètres du budget — repliés par défaut : on les règle une
              fois, on les consulte rarement, mais ils restent à portée. */}
          <div className="mt-6">
            <BlocRepliable
              titre="Paramètres"
              resume={`Ouverture ${formaterDT(budget.soldeInitial)} · dont ${formaterDT(budget.soldeInitialCaisse)} en caisse · seuil ${formaterDT(budget.seuilTresorerieMin)}`}
            >
              {peutEditer ? (
                <form
                  action={majParametresBudget}
                  className="flex flex-wrap items-end gap-3"
                >
                  <label className="text-sm">
                    Solde à l&apos;ouverture (DT)
                    <Input
                      name="soldeInitial"
                      type="number"
                      step="0.001"
                      defaultValue={budget.soldeInitial}
                      className="mt-1 h-9 w-40"
                    />
                  </label>
                  <label className="text-sm">
                    Dont en caisse (DT)
                    <Input
                      name="soldeInitialCaisse"
                      type="number"
                      min={0}
                      step="0.001"
                      defaultValue={budget.soldeInitialCaisse}
                      className="mt-1 h-9 w-40"
                    />
                  </label>
                  <label className="text-sm">
                    Seuil d&apos;alerte (DT)
                    <Input
                      name="seuilTresorerieMin"
                      type="number"
                      min={0}
                      step="0.001"
                      defaultValue={budget.seuilTresorerieMin}
                      className="mt-1 h-9 w-40"
                    />
                  </label>
                  <Button size="sm" type="submit">
                    Mettre à jour
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Solde à l&apos;ouverture {formaterDT(budget.soldeInitial)}{" "}
                  (dont {formaterDT(budget.soldeInitialCaisse)} en caisse) ·
                  seuil d&apos;alerte {formaterDT(budget.seuilTresorerieMin)}
                </p>
              )}
            </BlocRepliable>
          </div>

          <h2 className="mt-8 mb-4 text-center text-lg font-semibold">
            Modification du budget prévisionnel
          </h2>

          {/* Grille mensuelle, section par section */}
          <div className="space-y-6">
            {sections.map((section) => {
              const depense = section.sens === "DEPENSE";
              return (
                <Card key={section.code} className="overflow-hidden">
                  {/*
                    Rouge « dépense » et vert « recette », posés en dur et
                    **indépendants de la couleur de la structure** : ils
                    disent un sens comptable, pas une marque. Changer la
                    couleur principale ne doit pas faire passer les dépenses
                    pour des recettes.

                    En dur plutôt que par les jetons `danger` / `success` :
                    ce sont des bandeaux pleins portant du texte blanc, ils
                    doivent garder la même densité en clair comme en sombre,
                    alors que ces jetons s'éclaircissent en thème sombre pour
                    rester lisibles en *texte* — ce qui délaverait le bandeau.
                  */}
                  <div
                    className="px-4 py-2.5 text-center text-sm font-bold text-white"
                    style={{ backgroundColor: depense ? "#9b2c2c" : "#1f7a3d" }}
                  >
                    {LIBELLES_SECTION_BUDGET[section.code]}
                    <span className="ml-2 font-medium opacity-80">
                      {"· "}
                      {depense ? "Dépense" : "Recette"}
                    </span>
                  </div>
                  <CardContent className="pt-4">
                    <GrilleBudget
                      section={section.code}
                      sens={section.sens}
                      periodes={periodes}
                      peutEditer={peutEditer}
                      lignes={section.lignes.map((l) => ({
                        id: String(l._id),
                        libelle: l.libelle ?? "",
                        valeurs: periodes.map(
                          (_, i) => l.valeursMensuelles?.[i] ?? 0
                        ),
                        justificatif: l.justificatif?.nomFichier
                          ? { nomFichier: l.justificatif.nomFichier }
                          : null,
                      }))}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Totaux et bilan */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Bilan mensuel et solde budgétaire</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-max space-y-1 text-sm">
                  <div className="flex gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
                    <div className="w-56 shrink-0">Poste</div>
                    {periodes.map((p) => (
                      <div key={p.cle} className="w-20 shrink-0 text-right">
                        {libelleCourt(p.libelle)}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="w-56 shrink-0">Total dépenses</div>
                    {totalDepenses.map((v, i) => (
                      <div key={periodes[i]?.cle ?? i} className="w-20 shrink-0 text-right">
                        {v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="w-56 shrink-0">Total recettes</div>
                    {totalRecettes.map((v, i) => (
                      <div key={periodes[i]?.cle ?? i} className="w-20 shrink-0 text-right">
                        {v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 font-medium">
                    <div className="w-56 shrink-0">Bilan mensuel</div>
                    {bilan.map((v, i) => (
                      <div
                        key={periodes[i]?.cle ?? i}
                        className={`w-20 shrink-0 text-right ${v < 0 ? "text-danger" : ""}`}
                      >
                        {v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 font-medium text-primary">
                    <div className="w-56 shrink-0">Solde de trésorerie budgétaire</div>
                    {solde.map((v, i) => (
                      <div key={periodes[i]?.cle ?? i} className="w-20 shrink-0 text-right">
                        {v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exports et versions */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Exports PDF ({exports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {exports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun export pour l&apos;instant.
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {exports.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2">
                        <a
                          href={`/api/documents/${e.id}/fichier`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {e.reference}
                        </a>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {df.format(e.emisLe)}
                        </span>
                        {peutEcrire ? (
                          <FormulaireConfirme
                            action={supprimerDocumentTresorerie}
                            message={`Supprimer l'export « ${e.reference} » ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`}
                          >
                            <input type="hidden" name="documentId" value={e.id} />
                            <button
                              type="submit"
                              title="Supprimer cet export"
                              aria-label={`Supprimer l'export ${e.reference}`}
                              className="rounded p-1 text-danger hover:bg-danger/10"
                            >
                              <Trash2 size={14} />
                            </button>
                          </FormulaireConfirme>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historique des versions ({budget.versions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {budget.versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune modification post-verrouillage pour l&apos;instant —
                    l&apos;état actuel est la version {version}.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {[...budget.versions].reverse().map((v) => (
                      <li key={v.numero} className="rounded-md border border-border p-2">
                        <p className="font-medium">
                          Version {v.numero} — figée le {df.format(new Date(v.figeeLe))}
                        </p>
                        {v.motif ? (
                          <p className="text-xs text-muted-foreground">{v.motif}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
