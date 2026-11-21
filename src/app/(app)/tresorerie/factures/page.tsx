import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import {
  AvoirModel,
  FactureModel,
  MODES_PAIEMENT,
} from "@/modules/tresorerie/models";
import { ClientModel, ProjetModel } from "@/modules/base/models";
import { DocumentModel } from "@/modules/documents/models";
import {
  AvoirsFacture,
  type FacturePourAvoir,
} from "@/modules/tresorerie/components/avoirs-facture";
import {
  FormulaireFacture,
  type ProjetAFacturer,
} from "@/modules/tresorerie/components/formulaire-facture";
import {
  NouvelleAffaire,
  type ClientConnu,
} from "@/modules/tresorerie/components/nouvelle-affaire";
import { etatFacturationProjet } from "@/modules/tresorerie/services/facturation-projet";
import { encaisserFacture } from "@/modules/tresorerie/actions/tresorerie";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import {
  TableFactures,
  type FactureLigne,
} from "@/modules/tresorerie/components/table-factures";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function FacturesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let factures: {
    _id: Types.ObjectId;
    numero: string;
    montantHT: number;
    tauxTVA: number;
    timbreFiscal?: number;
    emission: Date;
    echeance: Date;
    statut: string;
    projet: { nom: string } | null;
  }[] = [];
  let projets: { _id: unknown; nom: string; caSigne?: number | null }[] = [];
  let projetsAFacturer: ProjetAFacturer[] = [];
  let clientsConnus: ClientConnu[] = [];
  let pdfParFacture = new Map<string, string>();
  const avoirsParFacture = new Map<string, FacturePourAvoir["avoirs"]>();

  try {
    await connectDb();
    const mandatActif: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();
    if (mandatActif) {
      factures = (await FactureModel.find({ mandat: mandatActif._id })
        .sort({ emission: -1 })
        .populate("projet", "nom")
        .lean()) as unknown as typeof factures;
      clientsConnus = (
        await ClientModel.find({ mandat: mandatActif._id })
          .select("_id organisation")
          .sort({ organisation: 1 })
          .lean()
      ).map((c) => ({ id: String(c._id), organisation: c.organisation }));
      projets = (await ProjetModel.find({ mandat: mandatActif._id })
        .select("nom caSigne")
        .sort({ nom: 1 })
        .lean()) as unknown as typeof projets;

      const pdfs = await DocumentModel.find({
        modele: "FACTURE_CLIENT",
        objetType: "Facture",
        objetId: { $in: factures.map((f) => f._id) },
        statut: { $ne: "ANNULE" },
      })
        .select("_id objetId")
        .lean();
      pdfParFacture = new Map(
        pdfs.map((d) => [String(d.objetId), String(d._id)])
      );

      // Les avoirs de chaque facture : c'est leur somme, retranchée du
      // montant facturé, qui dit ce qu'il reste à créditer.
      const avoirs = await AvoirModel.find({
        facture: { $in: factures.map((f) => f._id) },
      })
        .sort({ emission: 1 })
        .lean();
      for (const a of avoirs) {
        const cle = String(a.facture);
        const liste = avoirsParFacture.get(cle) ?? [];
        liste.push({
          id: String(a._id),
          numero: a.numero,
          montantHT: a.montantHT,
          motif: a.motif,
          documentId: a.document ? String(a.document) : null,
        });
        avoirsParFacture.set(cle, liste);
      }

      // Ce qu'il reste à facturer, projet par projet. Le montant d'une
      // facture est déjà connu de l'application — le devis l'a chiffré, l'opportunité
      // signée l'a porté, le projet l'a recopié dans son CA signé : le
      // formulaire le propose au lieu de le faire retrouver.
      const lignesFactures = await FactureModel.find({
        mandat: mandatActif._id,
      })
        .select("_id projet montantHT")
        .lean();
      projetsAFacturer = projets.map((p) => {
        const sesFactures = lignesFactures.filter(
          (f) => String(f.projet) === String(p._id)
        );
        const sesIds = new Set(sesFactures.map((f) => String(f._id)));
        return {
          id: String(p._id),
          nom: p.nom,
          etat: etatFacturationProjet({
            caSigne: p.caSigne,
            facturesHT: sesFactures.map((f) => f.montantHT),
            avoirsHT: avoirs
              .filter((a) => sesIds.has(String(a.facture)))
              .map((a) => a.montantHT),
          }),
        };
      });
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const maintenant = new Date();
  const lignes: FactureLigne[] = factures.map((f) => {
    const ttc = Math.round(f.montantHT * (1 + f.tauxTVA / 100) * 100) / 100;
    const echeance = new Date(f.echeance);
    return {
      id: String(f._id),
      numero: f.numero,
      projet: f.projet?.nom ?? "—",
      montantHT: f.montantHT,
      tauxTVA: f.tauxTVA,
      timbreFiscal: f.timbreFiscal ?? 1,
      ttc,
      emission: df.format(new Date(f.emission)),
      echeance: df.format(echeance),
      echeanceISO: echeance.toISOString(),
      statut: f.statut,
      enRetard: f.statut === "EMISE" && echeance < maintenant,
      documentId: pdfParFacture.get(String(f._id)) ?? null,
    };
  });

  const pourAvoirs: FacturePourAvoir[] = factures.map((f) => {
    const avoirs = avoirsParFacture.get(String(f._id)) ?? [];
    const credite = avoirs.reduce((s, a) => s + a.montantHT, 0);
    return {
      id: String(f._id),
      numero: f.numero,
      projet: f.projet?.nom ?? "—",
      montantHT: f.montantHT,
      reste: Math.round(Math.max(0, f.montantHT - credite) * 1000) / 1000,
      avoirs,
    };
  });

  const enAttente = lignes.filter((f) => f.statut === "EMISE");
  const totalEnAttente = enAttente.reduce((s, f) => s + f.ttc, 0);
  const totalEncaisse = lignes
    .filter((f) => f.statut === "PAYEE")
    .reduce((s, f) => s + f.ttc, 0);
  const retards = lignes.filter((f) => f.enRetard).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Factures"
        description="Numérotation continue par mandat · l'encaissement crée automatiquement le flux de trésorerie lié."
      />
      <NavTresorerie actif="/tresorerie/factures" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Factures émises" value={lignes.length} />
            <StatCard
              label="Encaissé"
              value={`${totalEncaisse.toLocaleString("fr-FR")} DT`}
              hint="TTC"
            />
            <StatCard
              label="En attente"
              value={`${totalEnAttente.toLocaleString("fr-FR")} DT`}
              hint={`${enAttente.length} facture(s)`}
            />
            <StatCard
              label="En retard"
              value={retards}
              className={retards > 0 ? "border-danger" : ""}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{factures.length} facture(s)</CardTitle>
            </CardHeader>
            <CardContent>
              <TableFactures factures={lignes} peutEcrire={peutEcrire} />

              {peutEcrire && enAttente.length > 0 ? (
                <div className="mt-6 space-y-2 border-t border-border pt-4">
                  <p className="text-sm font-medium">Encaisser une facture</p>
                  {enAttente.map((f) => (
                    <form
                      key={f.id}
                      action={encaisserFacture.bind(null, f.id)}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
                    >
                      <span className="min-w-32 text-sm font-medium">{f.numero}</span>
                      <span className="text-xs text-muted-foreground">{f.projet}</span>
                      {f.enRetard ? <Badge variant="danger">En retard</Badge> : null}
                      <Input name="date" type="date" className="h-8 w-36 text-xs" />
                      <select
                        name="modePaiement"
                        className="flex h-8 rounded-md border border-border bg-card px-2 text-xs"
                      >
                        {MODES_PAIEMENT.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <Input
                        name="justificatifRef"
                        placeholder="Réf. justificatif"
                        className="h-8 w-40 text-xs"
                      />
                      <Button size="sm" type="submit">
                        Encaisser
                      </Button>
                    </form>
                  ))}
                </div>
              ) : null}

              {/*
                Corriger une facture émise : la seule voie correcte est la
                pièce inverse. Sans elle, une facture fausse restait fausse,
                et la supprimer aurait troué une série numérotée.
              */}
              {pourAvoirs.length > 0 ? (
                <div className="mt-6 space-y-2 border-t border-border pt-4">
                  <p className="text-sm font-medium">
                    Corriger une facture par un avoir
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Une facture émise ne se modifie pas : on émet un avoir qui
                    la réduit ou l&apos;annule, et les deux pièces restent au
                    registre. L&apos;avoir diminue la TVA collectée du mois où
                    il est émis ; le droit de timbre, lui, reste acquis.
                  </p>
                  {pourAvoirs.map((f) => (
                    <AvoirsFacture
                      key={f.id}
                      facture={f}
                      peutEcrire={peutEcrire}
                    />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Nouvelle facture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {projetsAFacturer.length === 0 ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Une facture se rattache à une affaire. Il n&apos;y en a
                    aucune sur cet exercice : créez-la ici, son client entrera
                    au registre du même coup.
                  </p>
                ) : null}
                <FormulaireFacture projets={projetsAFacturer} />
                <div className="border-t border-border pt-4">
                  <NouvelleAffaire
                    clients={clientsConnus}
                    libelleBouton={
                      projetsAFacturer.length === 0
                        ? "Créer la première affaire"
                        : "Nouvelle affaire à facturer"
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
          </div>
        </>
      )}
    </div>
  );
}
