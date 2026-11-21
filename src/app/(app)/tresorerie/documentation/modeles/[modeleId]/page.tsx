import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import {
  champsDisponibles,
  CANEVAS_LIVRES,
} from "@/modules/documents/services/modeles-livres";
import type { Canevas } from "@/modules/documents/services/canevas";
import {
  majReglagesModele,
  reinitialiserCanevas,
  supprimerModeleCanevas,
} from "@/modules/tresorerie/actions/modeles-canevas";
import { modelesParCategorie } from "@/modules/tresorerie/services/modeles-tresorerie";
import { CanevasEditeur } from "@/modules/tresorerie/components/canevas-editeur";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormulaireConfirme } from "@/components/ui/formulaire-confirme";

export const dynamic = "force-dynamic";

/**
 * Édition d'un modèle de document sur son canevas.
 *
 * Tout ce qui touche à la page elle-même se fait à la souris dans l'éditeur ;
 * ce qui reste ici est ce qui n'a pas de place sur une page : le nom du
 * modèle, les familles qu'il rend, et les gestes qui engagent (remise à la
 * mise en page livrée, suppression).
 */
export default async function EditionModelePage({
  params,
}: {
  params: Promise<{ modeleId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  const { modeleId } = await params;
  await connectDb();
  const modele = await ModeleDocumentModel.findById(modeleId).lean().catch(() => null);
  if (!modele) notFound();

  const canevas: Canevas = {
    largeur: modele.largeur,
    hauteur: modele.hauteur,
    blocs: (modele.blocs ?? []) as unknown as Canevas["blocs"],
  };
  /*
   * La famille décide de tout : la palette de champs proposée ici, et surtout
   * le fait que ce modèle soit retenu ou non à l'émission. Sans elle, l'écran
   * retombait en silence sur le reçu de cotisation — on dessinait une facture
   * en se voyant proposer « cotisant » et « montant », et le modèle terminé
   * n'aurait servi pour aucune pièce. Le repli demeure, pour que l'écran
   * ouvre, mais il se dit.
   */
  const familleRattachee = modele.modeles?.[0] ?? null;
  const famille = familleRattachee ?? "RECU_COTISATION";
  const paquets = modelesParCategorie();

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={modele.nom}
        description="Posez les blocs à la souris. Les champs entre accolades se remplissent à l'émission ; la référence et sa numérotation, elles, restent à l'application."
        actions={
          <Link href="/tresorerie/documentation/modeles">
            <Button size="sm">
              <ArrowLeft size={14} /> Modèles
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/documentation" />

      {familleRattachee ? null : (
        <p
          role="status"
          className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <span className="font-medium">
            Ce modèle n&apos;est rattaché à aucune famille de document.
          </span>{" "}
          Il ne sera employé par aucune pièce émise, et les champs proposés
          ci-dessous sont ceux du reçu de cotisation, faute de mieux.
          Choisissez la famille dans « Réglages du modèle », plus bas :
          la palette s&apos;ajustera et le modèle prendra effet.
        </p>
      )}

      <CanevasEditeur
        modeleId={modeleId}
        famille={famille}
        canevasInitial={canevas}
        images={(modele.images ?? []).map((i) => ({
          fichierId: String(i.fichierId),
          nom: i.nom ?? "image",
          type: i.type as "png" | "jpeg",
        }))}
        champs={champsDisponibles(famille)}
        peutEcrire={peutEcrire}
      />

      {peutEcrire ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Réglages du modèle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <form action={majReglagesModele} className="space-y-3">
              <input type="hidden" name="modeleId" value={modeleId} />
              <label className="block text-xs text-muted-foreground">
                Nom du modèle
                <Input
                  name="nom"
                  defaultValue={modele.nom}
                  required
                  minLength={2}
                  className="mt-1"
                />
              </label>

              <fieldset>
                <legend className="text-xs text-muted-foreground">
                  Familles rendues par ce modèle
                </legend>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">
                  Une famille cochée ici est émise avec cette mise en page.
                  Décochée partout, elle revient au gabarit livré avec
                  l&apos;application. Une même famille ne peut appartenir qu&apos;à un
                  seul modèle.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paquets.map((paquet) => (
                    <div key={paquet.categorie}>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {paquet.libelle}
                      </p>
                      {paquet.modeles.map((m) => (
                        <label key={m.code} className="mt-1 flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="modeles"
                            value={m.code}
                            defaultChecked={modele.modeles?.includes(m.code)}
                            className="mt-0.5 accent-primary"
                          />
                          <span>
                            {m.libelle}
                            {!m.disponible ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (gabarit à venir)
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>

              <Button type="submit" size="sm">
                Enregistrer les réglages
              </Button>
            </form>

            <div className="space-y-3">
              <form action={reinitialiserCanevas} className="space-y-2">
                <input type="hidden" name="modeleId" value={modeleId} />
                <label className="block text-xs text-muted-foreground">
                  Repartir d&apos;une mise en page livrée
                  <select
                    name="depuis"
                    defaultValue={famille}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {Object.keys(CANEVAS_LIVRES).map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" size="sm" variant="ghost" className="w-full text-xs">
                  <RotateCcw className="h-4 w-4" /> Remettre la mise en page livrée
                </Button>
                <p className="text-xs text-muted-foreground">
                  Remplace tous les blocs de la page. Le nom, les familles et
                  les images déposées ne bougent pas.
                </p>
              </form>

              <FormulaireConfirme
                action={supprimerModeleCanevas}
                message={`Supprimer le modèle « ${modele.nom} » ?\n\nIl part à la corbeille et reste restaurable 30 jours. Les documents déjà émis ne changent pas ; les suivants reprendront le gabarit livré avec l'application.`}
              >
                <input type="hidden" name="modeleId" value={modeleId} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger/40 px-3 py-2 text-xs text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" /> Supprimer ce modèle
                </button>
              </FormulaireConfirme>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
