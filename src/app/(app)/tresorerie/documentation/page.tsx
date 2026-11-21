import Link from "next/link";
import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { FileText, FolderOpen, ListChecks, Palette, Target } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { DocumentModel } from "@/modules/documents/models";
import { CATALOGUE_DOCUMENTS } from "@/modules/documents/catalogue";
import { LIBELLES_CATEGORIE_DOCUMENT } from "@/modules/documents/constantes";
import { moisDuMandat } from "@/modules/tresorerie/services/budget-previsionnel";
import {
  compterParCategorie,
  modelesJamaisEmis,
  rapportsParMois,
  type DocumentEmis,
} from "@/modules/tresorerie/services/documentation";
import { genererRapportSynthese } from "@/modules/tresorerie/actions/tableau-bord";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** Modèles du catalogue portés par la trésorerie et réellement disponibles. */
const CATALOGUE_TRESORERIE = CATALOGUE_DOCUMENTS.filter(
  (m) => m.module === "tresorerie" && m.disponible
).map((m) => ({ code: m.code, libelle: m.libelle }));

export default async function DocumentationTresoreriePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let annee = "";
  let periodes: { cle: string; libelle: string }[] = [];
  let documents: DocumentEmis[] = [];
  let rapports: { id: string; reference: string; emisLe: Date }[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId; annee: string; debut: Date; fin: Date } | null =
      await MandatModel.findOne({ statut: "ACTIF" }).lean();

    if (mandat) {
      annee = mandat.annee;
      periodes = moisDuMandat(new Date(mandat.debut), new Date(mandat.fin));

      const codes = CATALOGUE_TRESORERIE.map((m) => m.code);
      const emis = await DocumentModel.find({
        mandat: mandat._id,
        modele: { $in: codes },
        statut: { $ne: "ANNULE" },
      })
        .select("_id reference modele categorie emisLe")
        .sort({ emisLe: -1 })
        .lean();

      documents = emis.map((d) => ({
        modele: d.modele,
        categorie: d.categorie,
        emisLe: new Date(d.emisLe),
      }));
      rapports = emis
        .filter((d) => d.modele === "RAPPORT_SYNTHESE_TRESORERIE")
        .slice(0, 8)
        .map((d) => ({
          id: String(d._id),
          reference: d.reference,
          emisLe: new Date(d.emisLe),
        }));

    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const parCategorie = compterParCategorie(documents);
  const serieRapports = rapportsParMois(
    documents.filter((d) => d.categorie === "RAPPORT"),
    periodes
  );
  const manquants = modelesJamaisEmis(CATALOGUE_TRESORERIE, documents);
  const moisAvecRapport = serieRapports.filter((m) => m.total > 0).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Documentation financière"
        description={`${annee} — ce que la trésorerie a produit, ce qu'elle n'a pas encore produit, et de quoi le produire.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/tresorerie/documentation/modeles">
              <Button size="sm">
                <Palette size={14} /> Modèles de documents
              </Button>
            </Link>
            <Link href="/tresorerie/documentation/strategie">
              <Button size="sm">
                <Target size={14} /> Stratégie financière
              </Button>
            </Link>
            <Link href="/tresorerie/documentation/mandats">
              <Button size="sm">Comparaison des mandats</Button>
            </Link>
          </div>
        }
      />
      <NavTresorerie actif="/tresorerie/documentation" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pièces émises"
              value={documents.length}
              hint="Sur le mandat, hors pièces annulées"
              icon={<FolderOpen size={20} />}
            />
            <StatCard
              label="Mois couverts par un rapport"
              value={`${moisAvecRapport} / ${periodes.length}`}
              hint={
                moisAvecRapport < periodes.length
                  ? "Les mois sans rapport sont listés ci-dessous"
                  : "Aucun mois sans rapport"
              }
              icon={<FileText size={20} />}
              className={moisAvecRapport === 0 ? "border-warning" : ""}
            />
            <StatCard
              label="Modèles jamais utilisés"
              value={manquants.length}
              hint={`Sur ${CATALOGUE_TRESORERIE.length} du catalogue`}
              icon={<ListChecks size={20} />}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pièces par catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune pièce émise pour l&apos;instant.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {Object.entries(parCategorie)
                      .sort((a, b) => b[1] - a[1])
                      .map(([categorie, total]) => (
                        <li
                          key={categorie}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            {LIBELLES_CATEGORIE_DOCUMENT[
                              categorie as keyof typeof LIBELLES_CATEGORIE_DOCUMENT
                            ] ?? categorie}
                          </span>
                          <span className="font-medium tabular-nums">{total}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rapports mois par mois</CardTitle>
              </CardHeader>
              <CardContent>
                {periodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun mandat actif.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {serieRapports.map((m) => (
                      <li key={m.mois} className="flex items-center gap-2">
                        <span className="w-32 shrink-0 text-muted-foreground">
                          {m.libelle}
                        </span>
                        <span
                          className={`h-1.5 rounded-full ${
                            m.total > 0 ? "bg-success" : "bg-muted"
                          }`}
                          style={{ width: `${Math.max(8, m.total * 24)}px` }}
                          aria-hidden
                        />
                        <span className="tabular-nums text-muted-foreground">
                          {m.total || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Modèles jamais utilisés ({manquants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {manquants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tous les modèles du catalogue ont servi au moins une fois sur
                  ce mandat.
                </p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {manquants.map((m) => (
                      <li key={m.code}>
                        <Badge variant="outline">{m.libelle}</Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Un modèle jamais émis n&apos;est pas forcément un oubli — on
                    ne reçoit pas de don tous les ans. C&apos;est une liste à
                    regarder, pas une liste de fautes.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Générateur de rapport — déplacé depuis les statistiques : on y
              vient pour produire un document, pas pour lire un indicateur. */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Générateur de rapport</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choisissez une période — un seul mois, plusieurs mois
                consécutifs, ou le mandat entier pour un rapport annuel. Les
                chiffres et les constats se calculent automatiquement.
              </p>
              {peutEcrire && periodes.length > 0 ? (
                <form
                  action={genererRapportSynthese}
                  className="flex flex-wrap items-end gap-2"
                >
                  <label className="text-sm">
                    Du mois
                    <select
                      name="moisDebut"
                      required
                      className="mt-1 flex h-9 rounded-md border border-border bg-card px-2 text-sm"
                    >
                      {periodes.map((p) => (
                        <option key={p.cle} value={p.cle}>
                          {p.libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Au mois
                    <select
                      name="moisFin"
                      required
                      defaultValue={periodes[periodes.length - 1]?.cle}
                      className="mt-1 flex h-9 rounded-md border border-border bg-card px-2 text-sm"
                    >
                      {periodes.map((p) => (
                        <option key={p.cle} value={p.cle}>
                          {p.libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" type="submit">
                    Générer le rapport
                  </Button>
                </form>
              ) : null}

              {rapports.length > 0 ? (
                <ul className="space-y-1 border-t border-border pt-3 text-sm">
                  {rapports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <a
                        href={`/api/documents/${r.id}/fichier`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {r.reference}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {df.format(r.emisLe)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  );
}
