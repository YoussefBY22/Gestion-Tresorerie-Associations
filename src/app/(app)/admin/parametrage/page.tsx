import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigerPermission } from "@/lib/autorisation";
import {
  listerModulesAvecEtat,
  listerParametres,
} from "@/modules/core/services/parametrage";
import {
  basculerModule,
  enregistrerParametre,
  reinitialiserParametre,
} from "@/modules/core/actions/parametrage";
import { LIBELLES_SECTION } from "@/modules/core/modules-registry";

export const dynamic = "force-dynamic";

export const metadata = { title: "Paramétrage" };

const LIBELLES_CATEGORIE: Record<string, string> = {
  GENERAL: "Identité de la structure",
  APPARENCE: "Apparence",
  INTEGRATIONS: "Intégrations externes",
  METIER: "Règles métier",
};

const DESCRIPTIONS_CATEGORIE: Record<string, string> = {
  GENERAL:
    "Repris dans l'en-tête de l'application, les exports et les documents générés.",
  APPARENCE:
    "Thème appliqué par défaut. Chaque membre peut choisir le sien depuis la barre du haut, sauf si vous verrouillez.",
  INTEGRATIONS:
    "Raccourcis vers des services externes. Aucun ne nécessite de clé API ni n'expose de données : ce sont des liens construits côté client.",
  METIER:
    "Seuils et règles utilisés par les modules — modifiables sans redéploiement.",
};

export default async function ParametragePage() {
  await exigerPermission("administration", "lire");

  const [modules, parametres] = await Promise.all([
    listerModulesAvecEtat(),
    listerParametres(),
  ]);

  const modulesDesactivables = modules.filter((m) => m.desactivable);
  const modulesSocles = modules.filter((m) => !m.desactivable);
  const nbActifs = modulesDesactivables.filter((m) => m.actif).length;

  const parCategorie = ["GENERAL", "APPARENCE", "INTEGRATIONS", "METIER"].map(
    (cat) => ({
      cat,
      items: parametres.filter((p) => p.categorie === cat),
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramétrage de l'application"
        description="Active ou désactive les modules et ajuste les règles de l'application sans redéploiement (ADR-007). Un module désactivé disparaît de la navigation et devient inaccessible, même par URL directe."
      />

      {/* ---------------------------------------------------------------- */}
      {/* Modules                                                           */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Modules
            <Badge variant="muted">
              {nbActifs}/{modulesDesactivables.length} actifs
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Désactiver un module conserve toutes ses données : c&apos;est un
            masquage réversible, jamais une suppression.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {modulesDesactivables.map((m) => {
              const livre = Boolean(m.href);
              return (
                <li
                  key={m.code}
                  className="flex flex-wrap items-start gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.libelle}
                      <Badge variant="outline">
                        {LIBELLES_SECTION[m.section]}
                      </Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {m.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {m.actif ? (
                      <Badge variant="success">Actif</Badge>
                    ) : (
                      <Badge variant="muted">Inactif</Badge>
                    )}
                    {livre ? (
                      <form action={basculerModule.bind(null, m.code, !m.actif)}>
                        <Button
                          type="submit"
                          size="sm"
                          variant={m.actif ? "outline" : "default"}
                        >
                          {m.actif ? "Désactiver" : "Activer"}
                        </Button>
                      </form>
                    ) : (
                      <Badge variant="outline">
                        Non livré{m.sprint ? ` · ${m.sprint}` : ""}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Modules socles, toujours actifs :{" "}
            {modulesSocles.map((m) => m.libelle).join(", ")} — les désactiver
            reviendrait à se verrouiller hors de l&apos;application.
          </p>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Paramètres par catégorie                                          */}
      {/* ---------------------------------------------------------------- */}
      {parCategorie.map(({ cat, items }) =>
        items.length === 0 ? null : (
          <Card key={cat}>
            <CardHeader>
              <CardTitle>{LIBELLES_CATEGORIE[cat] ?? cat}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {DESCRIPTIONS_CATEGORIE[cat]}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {items.map((p) => (
                  <li key={p.cle} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {p.libelle}
                          {p.surcharge ? (
                            <Badge variant="outline">personnalisé</Badge>
                          ) : (
                            <Badge variant="muted">valeur par défaut</Badge>
                          )}
                        </p>
                        {p.description ? (
                          <p className="text-sm text-muted-foreground">
                            {p.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <form
                          action={enregistrerParametre}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="cle" value={p.cle} />

                          {p.type === "BOOLEEN" ? (
                            <>
                              <input
                                type="hidden"
                                name="valeur"
                                value={p.valeur === true ? "false" : "true"}
                              />
                              <Button type="submit" size="sm" variant="outline">
                                {p.valeur === true
                                  ? "Désactiver"
                                  : "Activer"}
                              </Button>
                            </>
                          ) : p.options ? (
                            <>
                              <select
                                name="valeur"
                                defaultValue={String(p.valeur ?? "")}
                                className="h-8 rounded-md border border-border bg-card px-2 text-sm"
                                aria-label={p.libelle}
                              >
                                {p.options.map((o) => (
                                  <option key={o.valeur} value={o.valeur}>
                                    {o.libelle}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" size="sm" variant="outline">
                                Enregistrer
                              </Button>
                            </>
                          ) : (
                            <>
                              <Input
                                name="valeur"
                                type={p.type === "NOMBRE" ? "number" : "text"}
                                defaultValue={String(p.valeur ?? "")}
                                className="h-8 w-64"
                                aria-label={p.libelle}
                              />
                              <Button type="submit" size="sm" variant="outline">
                                Enregistrer
                              </Button>
                            </>
                          )}
                        </form>

                        {p.surcharge ? (
                          <form action={reinitialiserParametre.bind(null, p.cle)}>
                            <Button type="submit" size="sm" variant="ghost">
                              Réinitialiser
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    {p.type === "BOOLEEN" ? (
                      <p className="mt-1 text-sm">
                        État actuel :{" "}
                        {p.valeur === true ? (
                          <span className="text-success">activé</span>
                        ) : (
                          <span className="text-muted-foreground">désactivé</span>
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
