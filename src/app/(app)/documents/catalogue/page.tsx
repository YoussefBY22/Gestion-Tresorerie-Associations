import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { exigerModuleActif } from "@/lib/autorisation";
import {
  CATALOGUE_DOCUMENTS,
  MODELES_DISPONIBLES,
} from "@/modules/documents/catalogue";
import {
  LIBELLES_CATEGORIE_DOCUMENT,
  type CategorieDocument,
} from "@/modules/documents/constantes";
import { MODULES_PAR_CODE } from "@/modules/core/modules-registry";
import { NavDocuments } from "@/modules/documents/components/nav-documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Le catalogue est aussi la feuille de route de la sortie du drive : chaque
 * modèle annoncé indique ce qu'il remplacera concrètement.
 */
export default async function CatalogueDocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "documents", "lire")) redirect("/");
  await exigerModuleActif("documents");

  const parCategorie = new Map<CategorieDocument, typeof CATALOGUE_DOCUMENTS>();
  for (const modele of CATALOGUE_DOCUMENTS) {
    const liste = parCategorie.get(modele.categorie) ?? [];
    liste.push(modele);
    parCategorie.set(modele.categorie, liste);
  }

  const restants = CATALOGUE_DOCUMENTS.length - MODELES_DISPONIBLES.length;

  return (
    <div>
      <PageHeader
        title="Catalogue des modèles"
        description={`${MODELES_DISPONIBLES.length} modèle(s) émettable(s) aujourd'hui, ${restants} annoncé(s). Un modèle définit sa mise en page, sa numérotation et le module qui a le droit de l'émettre.`}
      />
      <NavDocuments actif="/documents/catalogue" />

      <div className="space-y-6">
        {Array.from(parCategorie.entries()).map(([categorie, modeles]) => (
          <Card key={categorie}>
            <CardHeader>
              <CardTitle>
                {LIBELLES_CATEGORIE_DOCUMENT[categorie]}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({modeles.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {modeles.map((m) => (
                <div
                  key={m.code}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{m.libelle}</p>
                      {m.disponible ? (
                        <Badge variant="success">Disponible</Badge>
                      ) : (
                        <Badge variant="muted">À venir</Badge>
                      )}
                      <Badge variant="outline">
                        {MODULES_PAR_CODE[m.module]?.libelle ?? m.module}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {m.description}
                    </p>
                    {m.remplace ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Remplace&nbsp;: {m.remplace}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs font-semibold text-primary">
                      {m.formatReference}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
