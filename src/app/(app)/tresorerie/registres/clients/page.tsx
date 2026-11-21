import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, Users } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { ClientModel } from "@/modules/base/models";
import { ProjetModel } from "@/modules/base/models";
import { DocumentModel } from "@/modules/documents/models";
import { FactureModel, FicheClientModel } from "@/modules/tresorerie/models";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import {
  TableauClients,
  type LigneClient,
} from "@/modules/tresorerie/components/tableau-clients";
import {
  NouvelleAffaire,
  type ClientConnu,
} from "@/modules/tresorerie/components/nouvelle-affaire";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/**
 * Registre des clients — vue trésorerie.
 *
 * Ne remontent ici que le contrat de projet et le bon de livraison d'un
 * projet client — jamais le cahier des charges ni l'enquête de satisfaction,
 * qui restent du ressort des Projets et de la RH. Ce n'est pas un filtre
 * appliqué après coup : la requête ne va chercher que `CONTRAT_PROJET` et
 * `BON_LIVRAISON` (liste blanche), rien d'autre.
 *
 * Les colonnes du Trésorier (contact de facturation, tranches, pièces de
 * paiement) vivent à part, dans `FicheClient` : elles n'existent nulle part
 * ailleurs et n'ont aucune raison de remonter dans le CRM.
 */
export default async function RegistreClientsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  type PiecesProjet = {
    projetId: string;
    contrat: { id: string; reference: string } | null;
    livrable: { id: string; reference: string } | null;
  };

  let erreurDb: string | undefined;
  let lignes: LigneClient[] = [];
  let dossiers: PiecesProjet[] = [];
  let clientsConnus: ClientConnu[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      const [clients, projets] = await Promise.all([
        ClientModel.find({ mandat: mandat._id })
          .select("_id organisation")
          .lean(),
        ProjetModel.find({ mandat: mandat._id })
          .select("_id nom statut caSigne client")
          .lean(),
      ]);

      const projetIds = projets.map((p) => p._id);
      const [documents, factures, fiches] = await Promise.all([
        DocumentModel.find({
          objetType: "Projet",
          objetId: { $in: projetIds },
          modele: { $in: ["CONTRAT_PROJET", "BON_LIVRAISON"] },
          statut: { $ne: "ANNULE" },
        })
          .select("_id reference modele objetId")
          .lean(),
        FactureModel.find({ projet: { $in: projetIds } })
          .select("projet montantHT tauxTVA statut")
          .lean(),
        FicheClientModel.find({ projet: { $in: projetIds } }).lean(),
      ]);

      const nomClient = new Map(
        clients.map((c) => [String(c._id), c.organisation])
      );
      clientsConnus = clients
        .map((c) => ({ id: String(c._id), organisation: c.organisation }))
        .sort((a, b) => a.organisation.localeCompare(b.organisation, "fr"));
      const ficheParProjet = new Map(
        fiches.map((f) => [String(f.projet), f])
      );

      lignes = projets.map((p) => {
        const fiche = ficheParProjet.get(String(p._id));
        // La créance est ce qui reste dû : les factures émises et non encore
        // encaissées, TTC. Elle se déduit, elle ne se saisit pas — sans quoi
        // elle contredirait le journal au premier encaissement.
        const impayees = factures.filter(
          (f) => String(f.projet) === String(p._id) && f.statut === "EMISE"
        );
        const creance = impayees.length
          ? Math.round(
              impayees.reduce(
                (s, f) => s + f.montantHT * (1 + (f.tauxTVA ?? 0) / 100),
                0
              ) * 1000
            ) / 1000
          : 0;

        return {
          projetId: String(p._id),
          client: nomClient.get(String(p.client)) ?? "Client inconnu",
          projet: p.nom,
          statut: p.statut,
          caSigne: p.caSigne ?? null,
          creance,
          contact: fiche?.contact ?? "",
          email: fiche?.email ?? "",
          telephone: fiche?.telephone ?? "",
          adresse: fiche?.adresse ?? "",
          matriculeFiscal: fiche?.matriculeFiscal ?? "",
          tranche1: fiche?.tranche1 ?? null,
          tranche2: fiche?.tranche2 ?? null,
          notes: fiche?.notes ?? "",
          aFiche: Boolean(fiche),
          pieces: (fiche?.justificatifs ?? []).map((j) => ({
            id: String(j._id),
            nom: j.nomFichier ?? "Pièce",
            libelle: j.libelle ?? "",
          })),
        };
      });

      dossiers = projets.map((p) => {
        const docs = documents.filter(
          (d) => String(d.objetId) === String(p._id)
        );
        const contrat = docs.find((d) => d.modele === "CONTRAT_PROJET");
        const livrable = docs.find((d) => d.modele === "BON_LIVRAISON");
        return {
          projetId: String(p._id),
          contrat: contrat
            ? { id: String(contrat._id), reference: contrat.reference }
            : null,
          livrable: livrable
            ? { id: String(livrable._id), reference: livrable.reference }
            : null,
        };
      });
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const parProjet = new Map(lignes.map((l) => [l.projetId, l]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Registre des clients"
        description="Une affaire par ligne : son client, son montant convenu, ce qui reste dû. Tout se saisit ici — la trésorerie ne dépend d'aucun autre module pour ouvrir un dossier."
        actions={
          <Link href="/tresorerie/registres">
            <Button size="sm" variant="outline">
              <ArrowLeft size={14} /> Registres
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/registres" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : lignes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <EmptyState
            icon={<Users size={28} />}
            title="Aucune affaire sur cet exercice"
            description="Une affaire, c'est un client et un projet. Créez-la ici : le client entre au registre et le projet devient facturable."
          />
          {peutEcrire ? (
            <NouvelleAffaire
              clients={clientsConnus}
              libelleBouton="Créer la première affaire"
            />
          ) : null}
        </div>
      ) : (
        <>
          {peutEcrire ? (
            <div className="mb-4">
              <NouvelleAffaire clients={clientsConnus} />
            </div>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <TableauClients lignes={lignes} peutEcrire={peutEcrire} />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Pièces contractuelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {dossiers.map((d) => (
                <div
                  key={d.projetId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2"
                >
                  <span className="min-w-40 font-medium">
                    {parProjet.get(d.projetId)?.projet ?? "Projet"}
                  </span>
                  {d.contrat ? (
                    <a
                      href={`/api/documents/${d.contrat.id}/fichier`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs underline"
                    >
                      <FileText size={12} /> Contrat {d.contrat.reference}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Contrat non émis
                    </span>
                  )}
                  {d.livrable ? (
                    <a
                      href={`/api/documents/${d.livrable.id}/fichier`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs underline"
                    >
                      <FileText size={12} /> Livrable {d.livrable.reference}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Livrable non émis
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
