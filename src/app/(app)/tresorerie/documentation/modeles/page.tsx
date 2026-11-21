import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LayoutTemplate, Palette, Plus } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { CharteDocumentModel } from "@/modules/documents/models/CharteDocument";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import { CANEVAS_LIVRES } from "@/modules/documents/services/modeles-livres";
import { creerModeleCanevas } from "@/modules/tresorerie/actions/modeles-canevas";
import { ImportClasseur } from "@/modules/tresorerie/components/import-classeur";
import { CHARTE_DEFAUT } from "@/modules/documents/services/charte";
import { creerCharte } from "@/modules/tresorerie/actions/chartes";
import {
  MODELES_TRESORERIE,
  modelesParCategorie,
} from "@/modules/tresorerie/services/modeles-tresorerie";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import {
  EditeurCharte,
  type CharteVue,
} from "@/modules/tresorerie/components/editeur-charte";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/**
 * Modèles de documents de la trésorerie.
 *
 * L'identité visuelle des pièces vivait dans le code : bordeaux en dur, nom
 * de la JE en dur. Une refonte de charte demandait un développeur, et le
 * mandat suivant héritait de choix qu'il ne pouvait pas reprendre.
 *
 * Elle se règle ici, avec l'aperçu du vrai PDF à côté. Deux choses restent
 * volontairement hors de portée : la **référence** et sa numérotation, qui
 * sont la piste d'audit, et le **contenu** de la pièce, qui dit ce qu'elle
 * atteste — une charte habille un document, elle ne le réécrit pas.
 */
export default async function ModelesDocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let chartes: CharteVue[] = [];
  let canevas: { id: string; nom: string; modeles: string[]; blocs: number }[] = [];

  try {
    await connectDb();
    chartes = (
      await CharteDocumentModel.find().sort({ parDefaut: -1, nom: 1 }).lean()
    ).map((c) => ({
      id: String(c._id),
      nom: c.nom,
      nomEmetteur: c.nomEmetteur,
      slogan: c.slogan ?? "",
      titre: c.titre ?? "",
      mentions: (c.mentions ?? []).join("\n"),
      couleurPrimaire: c.couleurPrimaire,
      couleurTexte: c.couleurTexte,
      couleurSecondaire: c.couleurSecondaire,
      couleurSurPrimaire: c.couleurSurPrimaire ?? "",
      hauteurBandeau: c.hauteurBandeau,
      afficherSlogan: c.afficherSlogan,
      bandeauPied: c.bandeauPied,
      afficherMentionErp: c.afficherMentionErp,
      parDefaut: Boolean(c.parDefaut),
      modeles: c.modeles ?? [],
      logoNom: c.logoNom ?? "",
    }));
    canevas = (
      await ModeleDocumentModel.find().sort({ nom: 1 }).select("nom modeles blocs").lean()
    ).map((m) => ({
      id: String(m._id),
      nom: m.nom,
      modeles: m.modeles ?? [],
      blocs: (m.blocs ?? []).length,
    }));
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const paquets = modelesParCategorie();
  const habilles = new Set(chartes.flatMap((c) => c.modeles));
  const avecDefaut = chartes.some((c) => c.parDefaut);
  const orphelins = MODELES_TRESORERIE.filter((m) => !habilles.has(m.code));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Modèles de documents"
        description="Couleurs, logo, bandeaux et mentions des pièces émises par la trésorerie. L'aperçu est un vrai PDF : ce que vous validez ici est ce que vos documents auront."
        actions={
          <Link href="/tresorerie/documentation">
            <Button size="sm">
              <ArrowLeft size={14} /> Documentation
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/documentation" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Modèles définis"
              value={chartes.length}
              icon={<Palette size={20} />}
            />
            <StatCard
              label="Familles habillées"
              value={`${habilles.size} / ${MODELES_TRESORERIE.length}`}
              hint={
                avecDefaut
                  ? "Le reste suit le modèle par défaut"
                  : "Le reste suit la charte livrée avec l'application"
              }
            />
            <StatCard
              label="Modèle par défaut"
              value={avecDefaut ? "Défini" : "Aucun"}
              className={avecDefaut ? "" : "border-warning"}
            />
          </div>

          {/*
            Deux familles d'outils cohabitent, et c'est voulu. Une **mise en
            page** place chaque bloc au millimètre : c'est ce qu'exigent les
            reçus et les factures, dont la forme est imposée. Une **charte**
            habille les documents qui coulent (rapports, procès-verbaux) et
            dont la mise en page se déduit du contenu.
          */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <LayoutTemplate size={18} /> Mises en page ({canevas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pour les pièces dont la forme est imposée — reçus, factures,
                devis, bons de commande. Chaque bloc se pose à la souris, et
                les champs entre accolades se remplissent à l&apos;émission.
              </p>

              {canevas.length === 0 ? (
                <EmptyState
                  icon={<LayoutTemplate size={28} />}
                  title="Aucune mise en page"
                  description="Créez-en une : elle démarre sur le modèle du classeur de la JE, que vous retouchez ensuite à la souris."
                />
              ) : (
                canevas.map((modele) => (
                  <Link
                    key={modele.id}
                    href={`/tresorerie/documentation/modeles/${modele.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 hover:border-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{modele.nom}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {modele.blocs} bloc(s) ·{" "}
                        {modele.modeles.length
                          ? `${modele.modeles.length} famille(s) rendue(s)`
                          : "aucune famille — ce modèle ne sert encore à rien"}
                      </span>
                    </span>
                    <span className="text-xs text-primary">Ouvrir l&apos;éditeur →</span>
                  </Link>
                ))
              )}

              {peutEcrire ? (
                <div className="space-y-4 border-t border-border pt-3">
                  {/*
                    Deux façons de démarrer un modèle : partir d'une mise en
                    page livrée, ou reprendre un classeur que la JE possède
                    déjà. La seconde évite de recopier à la main ce qu'un
                    fichier décrit déjà au millimètre.
                  */}
                  <ImportClasseur />
                </div>
              ) : null}

              {peutEcrire ? (
                <form
                  action={creerModeleCanevas}
                  className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    name="nom"
                    required
                    minLength={2}
                    placeholder="Nom (ex. Reçu de cotisation)"
                  />
                  <select
                    name="depuis"
                    defaultValue="RECU_COTISATION"
                    aria-label="Mise en page de départ"
                    className="h-10 rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {Object.keys(CANEVAS_LIVRES).map((code) => (
                      <option key={code} value={code}>
                        Partir du modèle « {code} »
                      </option>
                    ))}
                  </select>
                  <Button type="submit">
                    <Plus className="h-4 w-4" /> Créer
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Palette size={18} /> Chartes des documents en flux ({chartes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pour les documents dont la mise en page se déduit du contenu —
                rapports, procès-verbaux, attestations. On y règle les
                couleurs, le logo et les mentions, pas la place des blocs.
              </p>
              {chartes.length === 0 ? (
                <EmptyState
                  icon={<Palette size={28} />}
                  title="Aucune charte personnalisée"
                  description="Vos documents sortent avec la charte livrée avec l'application. Créez un modèle pour poser vos couleurs, votre logo et vos mentions."
                />
              ) : (
                chartes.map((charte) => (
                  <EditeurCharte
                    key={charte.id}
                    charte={charte}
                    paquets={paquets}
                    peutEcrire={peutEcrire}
                  />
                ))
              )}

              {orphelins.length > 0 && chartes.length > 0 && !avecDefaut ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  {orphelins.length} famille(s) ne sont habillées par aucun
                  modèle : {orphelins.map((m) => m.libelle).join(", ")}. Elles
                  sortiront avec la charte livrée avec l&apos;application. Cochez-les
                  dans un modèle, ou marquez-en un « par défaut ».
                </p>
              ) : null}
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Nouveau modèle</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={creerCharte}
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    name="nom"
                    required
                    minLength={2}
                    placeholder="Nom du modèle (ex. Charte 2026-2027)"
                  />
                  <Input
                    name="nomEmetteur"
                    required
                    defaultValue={CHARTE_DEFAUT.nomEmetteur}
                    placeholder="Raison sociale"
                  />
                  <Button type="submit">
                    <Plus className="h-4 w-4" /> Créer
                  </Button>

                  {/*
                    Le modèle naît sur la charte livrée avec l'application : on part de
                    quelque chose de présentable, qu'on retouche ensuite avec
                    l'aperçu sous les yeux, plutôt que d'un formulaire vide.
                  */}
                  <input type="hidden" name="slogan" value={CHARTE_DEFAUT.slogan ?? ""} />
                  <input
                    type="hidden"
                    name="couleurPrimaire"
                    value={CHARTE_DEFAUT.couleurPrimaire}
                  />
                  <input
                    type="hidden"
                    name="couleurTexte"
                    value={CHARTE_DEFAUT.couleurTexte}
                  />
                  <input
                    type="hidden"
                    name="couleurSecondaire"
                    value={CHARTE_DEFAUT.couleurSecondaire}
                  />
                  <input
                    type="hidden"
                    name="hauteurBandeau"
                    value={CHARTE_DEFAUT.hauteurBandeau}
                  />
                  <input type="hidden" name="afficherSlogan" value="on" />
                  <input type="hidden" name="afficherMentionErp" value="on" />
                  {!avecDefaut ? (
                    <input type="hidden" name="parDefaut" value="on" />
                  ) : null}

                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    Le modèle démarre sur la charte livrée avec l&apos;application.
                    Ouvrez-le ensuite pour poser vos couleurs, votre logo et
                    choisir les familles qu&apos;il habille.
                    {!avecDefaut
                      ? " Le premier modèle créé devient le modèle par défaut."
                      : ""}
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
