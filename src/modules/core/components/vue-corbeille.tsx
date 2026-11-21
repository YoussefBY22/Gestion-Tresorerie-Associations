import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  LIBELLES_TYPE_CORBEILLE,
  TYPES_ELEMENT_CORBEILLE,
  type TypeElementCorbeille,
} from "@/modules/core/models";
import { LIBELLES_MODULE } from "@/modules/core/rbac";
import {
  restaurerElementCorbeille,
  supprimerDefinitivementElement,
  viderCorbeille,
} from "@/modules/core/actions/corbeille";
import {
  DUREE_RETENTION_JOURS,
  joursAvantPurge,
} from "@/modules/core/services/corbeille";
import type { ElementCorbeilleVue } from "@/modules/core/services/corbeille-depot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormulaireConfirme } from "@/components/ui/formulaire-confirme";

/**
 * Corbeille personnelle : ce que j'ai supprimé, où que ce soit dans l'application.
 *
 * Rien n'y entre autrement que par une suppression de ma part, rien n'en sort
 * seul avant trente jours, et personne d'autre n'y voit ce que j'ai jeté.
 */

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function VueCorbeille({
  base,
  elements,
  compteurs,
  typeActif,
}: {
  /** Chemin de la page, pour construire les liens de filtre. */
  base: string;
  elements: ElementCorbeilleVue[];
  compteurs: Record<string, number>;
  typeActif?: TypeElementCorbeille;
}) {
  const total = Object.values(compteurs).reduce((a, b) => a + b, 0);
  const typesPresents = TYPES_ELEMENT_CORBEILLE.filter((t) => compteurs[t]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={base}
          className={`rounded-full border px-3 py-1 text-xs ${
            typeActif
              ? "border-border text-muted-foreground hover:bg-muted"
              : "border-primary bg-primary/10 text-primary"
          }`}
        >
          Tous ({total})
        </Link>
        {typesPresents.map((t) => (
          <Link
            key={t}
            href={`${base}?type=${t}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              typeActif === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {LIBELLES_TYPE_CORBEILLE[t]} ({compteurs[t]})
          </Link>
        ))}

        {total > 0 ? (
          <FormulaireConfirme
            action={viderCorbeille}
            className="ml-auto"
            message={`Vider votre corbeille ?\n\n${total} élément(s) seront supprimés définitivement de la base de données. Cette action est irréversible.`}
          >
            <Button size="sm" variant="danger" type="submit">
              <Trash2 size={14} /> Vider la corbeille
            </Button>
          </FormulaireConfirme>
        ) : null}
      </div>

      {elements.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={28} />}
          title="Corbeille vide"
          description={`Ce que vous supprimez dans l'application atterrit ici et y reste ${DUREE_RETENTION_JOURS} jours, le temps de changer d'avis. Vous seul voyez cette corbeille.`}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{elements.length} élément(s)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {elements.map((e) => {
              const restants = joursAvantPurge(e.purgeLe);
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-52 flex-1">
                    <p className="text-sm font-medium">{e.titre}</p>
                    <p className="text-xs text-muted-foreground">
                      {LIBELLES_TYPE_CORBEILLE[e.type]} ·{" "}
                      {LIBELLES_MODULE[e.module] ?? e.module}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Supprimé le {df.format(e.supprimeLe)}
                    </p>
                  </div>

                  <Badge variant={restants <= 3 ? "danger" : "muted"}>
                    {restants === 0
                      ? "Purge imminente"
                      : `${restants} j avant purge`}
                  </Badge>

                  <div className="flex items-center gap-1">
                    <FormulaireConfirme
                      action={restaurerElementCorbeille}
                      message={`Restaurer « ${e.titre} » à sa place d'origine ?`}
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <Button size="sm" variant="outline" type="submit">
                        <RotateCcw size={14} /> Restaurer
                      </Button>
                    </FormulaireConfirme>
                    <FormulaireConfirme
                      action={supprimerDefinitivementElement}
                      message={`Supprimer définitivement « ${e.titre} » ?\n\nL'élément et son fichier seront effacés de la base de données. Cette action est irréversible.`}
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        title="Supprimer définitivement"
                        aria-label={`Supprimer définitivement ${e.titre}`}
                        className="rounded p-2 text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </FormulaireConfirme>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
