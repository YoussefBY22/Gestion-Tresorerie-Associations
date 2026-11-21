import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Types } from "mongoose";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MODELES_PAR_CODE } from "@/modules/documents/catalogue";
import { DocumentModel } from "@/modules/documents/models";
import {
  LIBELLES_CATEGORIE_DOCUMENT,
  LIBELLES_STATUT_DOCUMENT,
  type CategorieDocument,
  type StatutDocument,
} from "@/modules/documents/constantes";
import {
  annulerDocument,
  validerDocument,
} from "@/modules/documents/actions/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const badgeStatut: Record<
  StatutDocument,
  "success" | "muted" | "warning" | "danger" | "outline"
> = {
  BROUILLON: "muted",
  EMIS: "outline",
  A_SIGNER: "warning",
  SIGNE: "success",
  ANNULE: "danger",
};

export default async function FicheDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "documents", "lire")) redirect("/");
  await exigerModuleActif("documents");
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const document = await DocumentModel.findById(id).lean();
  if (!document) notFound();

  const modele = MODELES_PAR_CODE[document.modele];
  const peutValider = can(session.user.roles, modele?.module ?? "documents", "valider");
  const statut = document.statut as StatutDocument;

  return (
    <div>
      <PageHeader
        title={document.titre}
        description={`${modele?.libelle ?? document.modele} — référence ${document.reference}`}
        actions={
          <>
            <Link href="/documents">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Bibliothèque
              </Button>
            </Link>
            <a
              href={`/api/documents/${id}/fichier`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm">
                <ExternalLink className="h-4 w-4" />
                Ouvrir le PDF
              </Button>
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Aperçu direct : le PDF est servi par une route protégée, pas par
            une URL publique — l'iframe passe par la session de l'utilisateur. */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Aperçu</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              src={`/api/documents/${id}/fichier#toolbar=0`}
              title={`Aperçu de ${document.reference}`}
              className="h-[720px] w-full rounded-lg border border-border bg-muted"
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Identité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Ligne label="Référence">
                <span className="font-mono font-semibold text-primary">
                  {document.reference}
                </span>
              </Ligne>
              <Ligne label="Statut">
                <Badge variant={badgeStatut[statut]}>
                  {LIBELLES_STATUT_DOCUMENT[statut]}
                </Badge>
              </Ligne>
              <Ligne label="Catégorie">
                {LIBELLES_CATEGORIE_DOCUMENT[document.categorie as CategorieDocument]}
              </Ligne>
              <Ligne label="Version">{document.version ?? 1}</Ligne>
              {document.motifAnnulation ? (
                <Ligne label="Motif d'annulation">{document.motifAnnulation}</Ligne>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Circuit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Ligne label="Émis par">{document.emisParNom ?? "—"}</Ligne>
              <Ligne label="Émis le">
                {document.emisLe
                  ? new Date(document.emisLe).toLocaleString("fr-FR")
                  : "—"}
              </Ligne>
              <Ligne label="Validé par">{document.valideParNom ?? "—"}</Ligne>
              <Ligne label="Validé le">
                {document.valideLe
                  ? new Date(document.valideLe).toLocaleString("fr-FR")
                  : "—"}
              </Ligne>
            </CardContent>
          </Card>

          {peutValider && statut !== "ANNULE" ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {statut !== "SIGNE" ? (
                  <form action={validerDocument}>
                    <input type="hidden" name="id" value={id} />
                    <Button type="submit" className="w-full">
                      Marquer comme signé
                    </Button>
                  </form>
                ) : null}
                <form action={annulerDocument} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <Input
                    name="motif"
                    required
                    minLength={3}
                    placeholder="Motif d'annulation"
                  />
                  <Button type="submit" variant="outline" className="w-full">
                    Annuler le document
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Le document reste consultable et sa référence reste
                    consommée : c&apos;est ce qu&apos;exige une piste
                    d&apos;audit sur des pièces numérotées.
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Ligne({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
