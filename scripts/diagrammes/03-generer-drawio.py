# -*- coding: utf-8 -*-
"""Genere un .drawio multi-pages : classes et cas d'utilisation, global et par module."""
import io, json, math, re, sys, html

modele = json.load(io.open(sys.argv[1], encoding="utf-8"))
rbac = json.load(io.open(sys.argv[2], encoding="utf-8"))
SORTIE = sys.argv[3]

LIBELLE_MODULE = {
    "base": "Socle métier",
    "core": "Socle technique",
    "documents": "Moteur de documents",
    "tresorerie": "Trésorerie",
}
# À quel module du RBAC rattacher les actions d'un dossier de code.
# `base` n'a pas de module de droits : ses entités sont écrites depuis la
# trésorerie et l'administration, jamais depuis un écran qui lui serait propre.
RBAC_DE = {
    "core": "administration",
    "documents": "documents",
    "tresorerie": "tresorerie",
}
COULEURS = ["#dae8fc", "#d5e8d4", "#ffe6cc", "#f8cecc", "#e1d5e7", "#fff2cc",
            "#d0cee2", "#fad9d5", "#b1ddf0", "#d4e1f5", "#ffe599", "#cdeb8b",
            "#eeeeee", "#bac8d3", "#e6d0de", "#d9ead3"]
BORDS = ["#6c8ebf", "#82b366", "#d79b00", "#b85450", "#9673a6", "#d6b656",
         "#56517e", "#ae4132", "#10739e", "#6c8ebf", "#d79b00", "#36393d",
         "#666666", "#23445d", "#996185", "#6aa84f"]


def esc(t):
    """Echappe pour un attribut XML, et rend les sauts de ligne visibles.

    Un retour chariot place tel quel dans un attribut est normalise en espace
    par tout parseur XML : les notes multi-lignes s'affichaient en un seul
    pave. Les etiquettes drawio etant en HTML (html=1), on passe par <br>.
    """
    return html.escape(str(t), quote=True).replace(chr(10), "&lt;br&gt;")


NOMS_CAS = {
    "admin": "Administrer les comptes et les rôles",
    "alignement": "Suivre l'alignement stratégique",
    "avoirs": "Corriger une facture par un avoir",
    "backlog": "Tenir le backlog d'un projet",
    "bons-commande": "Engager une dépense par bon de commande",
    "budget-evenement": "Budgéter un événement",
    "budget-previsionnel": "Bâtir et suivre le budget prévisionnel",
    "caisse": "Tenir la caisse et la banque",
    "candidatures": "Traiter les candidatures",
    "certificats-ras": "Délivrer un certificat de retenue à la source",
    "chartes": "Définir la charte graphique des documents",
    "competences-projet": "Affecter les compétences à un projet",
    "competences": "Tenir le référentiel de compétences",
    "conformite": "Conduire la conformité",
    "corbeille": "Restaurer ou purger la corbeille",
    "cotisations": "Encaisser les cotisations",
    "crm": "Suivre prospects et opportunités",
    "cycle-recus": "Remettre, annuler ou envoyer un reçu",
    "devis": "Chiffrer et faire signer un devis",
    "documents-projet": "Joindre les pièces d'un projet",
    "documents-rh": "Joindre les pièces RH",
    "documents": "Émettre et classer les documents",
    "editorial": "Tenir le calendrier éditorial",
    "elections": "Organiser les élections",
    "equipe": "Suivre l'équipe au quotidien",
    "fiche-processus": "Décrire les processus",
    "fiscal": "Déclarer et liquider l'impôt",
    "formations": "Organiser les formations",
    "formulaires": "Publier des formulaires et enquêtes",
    "gratifications": "Gratifier ou sanctionner",
    "import-modele": "Importer un modèle de document",
    "international": "Piloter les relations internationales",
    "inventaire": "Tenir l'inventaire physique",
    "management": "Piloter le mandat",
    "marketing": "Conduire les actions marketing",
    "modeles-canevas": "Composer les modèles de documents",
    "notifications": "Notifier les membres",
    "okr": "Fixer et suivre les OKR",
    "parametrage": "Paramétrer l'ERP",
    "partenaires": "Gérer partenaires et sponsors",
    "passation": "Préparer la passation de mandat",
    "pieces-registres": "Joindre les pièces aux registres",
    "planning": "Tenir le planning",
    "profils": "Tenir les profils des membres",
    "progression": "Suivre la progression",
    "projets": "Conduire les projets",
    "pv-ag": "Rédiger les PV d'assemblée générale",
    "pv": "Rédiger les procès-verbaux",
    "qualite": "Animer le système qualité",
    "rapport-canal": "Traiter les signalements du canal",
    "recrutement": "Recruter les membres",
    "recus": "Émettre les reçus et factures",
    "referentiel": "Tenir le référentiel qualité",
    "registres-clients": "Tenir le registre des clients",
    "registres": "Tenir les registres financiers",
    "reglementation": "Suivre la réglementation",
    "releves": "Rapprocher les relevés bancaires",
    "ressources": "Affecter les ressources",
    "rh": "Administrer les ressources humaines",
    "satisfaction": "Mesurer la satisfaction client",
    "scoring": "Scorer les prospects",
    "secretariat": "Tenir le secrétariat général",
    "tableau-bord": "Consulter le tableau de bord",
    "taches": "Suivre les tâches",
    "theme": "Régler l'apparence",
    "tresorerie": "Tenir la trésorerie",
    "vp": "Piloter l'événementiel et la VP",
}


def nom_cas(fichier):
    base = re.sub(r"\.ts$", "", fichier)
    return NOMS_CAS.get(base, "Gérer " + base.replace("-", " "))


class Page:
    def __init__(self, nom):
        self.nom, self.cells, self.n = nom, [], 0

    def id(self, prefixe="c"):
        self.n += 1
        return prefixe + str(self.n)

    def boite(self, ident, titre, lignes, x, y, w, fill, stroke):
        h = 26 + 22 * len(lignes)
        self.cells.append(
            '<mxCell id="%s" value="%s" style="swimlane;fontStyle=1;align=center;'
            'verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;'
            'horizontalStack=0;resizeParent=1;resizeParentMax=0;html=1;fillColor=%s;'
            'strokeColor=%s;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (ident, esc(titre), fill, stroke, x, y, w, h))
        for k, l in enumerate(lignes):
            self.cells.append(
                '<mxCell id="%s_f%d" value="%s" style="text;strokeColor=none;fillColor=none;'
                'align=left;verticalAlign=middle;spacingLeft=6;overflow=hidden;html=1;" '
                'vertex="1" parent="%s">'
                '<mxGeometry y="%d" width="%d" height="22" as="geometry"/></mxCell>'
                % (ident, k, esc(l), ident, 26 + 22 * k, w))
        return h

    def arete(self, src, dst, label="", style="endArrow=open;endSize=10;html=1;rounded=0;"):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="%s" edge="1" parent="1" source="%s" target="%s">'
            '<mxGeometry relative="1" as="geometry"/></mxCell>'
            % (self.id("e"), esc(label), style, src, dst))

    def note(self, texte, x, y, w, h, fill="#ffffff"):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="shape=note;whiteSpace=wrap;html=1;size=14;'
            'verticalAlign=top;align=left;spacingLeft=6;fillColor=%s;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (self.id("n"), esc(texte).replace("&#10;", "&#10;"), fill, x, y, w, h))

    def titre(self, texte, x, y, w=1000):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="text;html=1;align=left;fontSize=20;fontStyle=1;" '
            'vertex="1" parent="1"><mxGeometry x="%d" y="%d" width="%d" height="30" as="geometry"/>'
            '</mxCell>' % (self.id("t"), esc(texte), x, y, w))

    def acteur(self, ident, nom, x, y):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="shape=umlActor;verticalLabelPosition=bottom;'
            'verticalAlign=top;html=1;outlineConnect=0;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="30" height="60" as="geometry"/></mxCell>'
            % (ident, esc(nom), x, y))

    def cas(self, ident, nom, x, y, w=210, h=50, fill="#ffffff", stroke="#666666"):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="ellipse;whiteSpace=wrap;html=1;fillColor=%s;'
            'strokeColor=%s;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (ident, esc(nom), fill, stroke, x, y, w, h))

    def frontiere(self, ident, nom, x, y, w, h):
        self.cells.append(
            '<mxCell id="%s" value="%s" style="rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;'
            'fontStyle=1;fillColor=none;strokeColor=#666666;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (ident, esc(nom), x, y, w, h))

    def xml(self):
        return ('<diagram id="p%d" name="%s"><mxGraphModel dx="1400" dy="900" grid="1" '
                'gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" '
                'pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0"><root>'
                '<mxCell id="0"/><mxCell id="1" parent="0"/>%s</root></mxGraphModel></diagram>'
                % (abs(hash(self.nom)) % 10 ** 9, esc(self.nom), "".join(self.cells)))


def droits(perms, mod):
    out = set()
    for perm in perms:
        if perm == "*":
            return {"lire", "ecrire", "valider"}
        if ":" not in perm:
            continue
        cible, act = perm.split(":", 1)
        if cible not in (mod, "*"):
            continue
        out |= {"lire", "ecrire", "valider"} if act == "*" else {act}
    return out


pages = []
mods = sorted(modele["modules"].keys())
couleur = {m: COULEURS[i % len(COULEURS)] for i, m in enumerate(mods)}
bord = {m: BORDS[i % len(BORDS)] for i, m in enumerate(mods)}

racines = {}
for m in mods:
    for c in modele["modules"][m]["classes"]:
        if not c.get("embarque"):
            racines[c["nom"]] = m

# --- 1. Classes, vue d'ensemble ------------------------------------ #
p = Page("1. Classes — vue d'ensemble")
p.titre("Trésorerie — cartographie des classes et des dépendances", 20, 10)
p.note("Une boîte = un modèle Mongoose, donc une collection. Les sous-documents "
       "embarqués sont au diagramme de leur module.\n"
       "Les flèches relient les MODULES, pas les classes : une flèche « A → B, n réf. » "
       "signifie que n champs du module A pointent vers des classes de B.\n"
       "Le détail classe par classe est sur la page du module : tracer ici les %d "
       "références rendrait la page illisible.\n"
       "%d classes racines réparties sur %d modules."
       % (sum(1 for m in mods for c in modele["modules"][m]["classes"]
              if not c.get("embarque")
              for ch in c["champs"] if ch.get("ref")),
          len(racines), len(mods)),
       20, 50, 700, 120)

ids = {}
groupes = {}
x_mod, y_mod, haut_rangee = 20, 220, 0
for m in mods:
    classes = [c for c in modele["modules"][m]["classes"] if not c.get("embarque")]
    if not classes:
        continue
    cols = max(1, min(3, int(math.ceil(math.sqrt(len(classes))))))
    rows = int(math.ceil(len(classes) / float(cols)))
    larg, haut = cols * 240 + 30, rows * 56 + 70
    if x_mod + larg > 3600:
        x_mod, y_mod, haut_rangee = 20, y_mod + haut_rangee + 80, 0
    gid = p.id("g")
    groupes[m] = gid
    p.cells.append(
        '<mxCell id="%s" value="%s" style="rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;'
        'fontStyle=1;fontSize=14;fillColor=%s;strokeColor=%s;opacity=50;arcSize=0;" '
        'vertex="1" parent="1">'
        '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
        % (gid, esc(LIBELLE_MODULE.get(m, m)), couleur[m], bord[m], x_mod, y_mod, larg, haut))
    for k, c in enumerate(classes):
        cid = p.id("k")
        ids[c["nom"]] = cid
        p.cells.append(
            '<mxCell id="%s" value="%s" style="rounded=0;whiteSpace=wrap;html=1;fillColor=%s;'
            'strokeColor=%s;fontStyle=1;fontSize=11;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="220" height="36" as="geometry"/></mxCell>'
            % (cid, esc(c["nom"]), couleur[m], bord[m],
               x_mod + 15 + (k % cols) * 240, y_mod + 50 + (k // cols) * 56))
    haut_rangee = max(haut_rangee, haut)
    x_mod += larg + 60

# Dependances agregees : un trait par couple de modules, pas par champ.
dependances = {}
for m in mods:
    for c in modele["modules"][m]["classes"]:
        for ch in c["champs"]:
            cible = ch.get("ref")
            if not cible:
                continue
            mod_cible = racines.get(cible)
            if mod_cible and mod_cible != m:
                dependances[(m, mod_cible)] = dependances.get((m, mod_cible), 0) + 1

for (source, cible), n in sorted(dependances.items(), key=lambda kv: -kv[1]):
    if source in groupes and cible in groupes:
        epaisseur = 1 if n < 5 else (2 if n < 15 else 3)
        p.arete(groupes[source], groupes[cible], "%d réf." % n,
                "endArrow=block;endFill=1;html=1;rounded=0;"
                "edgeStyle=orthogonalEdgeStyle;strokeColor=#7a7a7a;"
                "strokeWidth=%d;fontSize=10;fontColor=#555555;" % epaisseur)
pages.append(p)

# --- 2. Classes par module ----------------------------------------- #
for m in mods:
    classes = modele["modules"][m]["classes"]
    if not classes:
        continue
    p = Page("%d. Classes — %s" % (len(pages) + 1, LIBELLE_MODULE.get(m, m)))
    p.titre("Classes du module « %s »" % LIBELLE_MODULE.get(m, m), 20, 10)

    locaux_noms = {c["nom"] for c in classes}
    externes = sorted({ch["ref"] for c in classes for ch in c["champs"]
                       if ch.get("ref") and ch["ref"] not in locaux_noms})

    p.note("%d classes, dont %d sous-documents embarqués.\n"
           "« <> » en tête de nom marque un sous-document : pas de collection propre.\n"
           "Losange plein = composition (tableau de sous-documents). Flèche = référence ObjectId.\n"
           "Les boîtes grisées en pointillés sont des classes d\'AUTRES modules, rappelées ici "
           "pour qu\'aucune référence ne paraisse pendante.\n"
           "Deux classes peuvent partager un code (ex. « processus ») sans qu\'il y ait de "
           "référence : ce n\'est pas une relation, rien n\'est donc tracé."
           % (len(classes), sum(1 for c in classes if c.get("embarque"))),
           20, 50, 700, 130)

    # Mise en page en colonnes equilibrees : une seule colonne rendait la page
    # interminable et laissait les aretes traverser tout le document.
    hauteurs = [26 + 22 * len(c["champs"]) for c in classes]
    total = sum(h + 36 for h in hauteurs)
    colonnes = max(1, min(5, int(math.ceil(total / 1500.0))))
    cible_colonne = total / float(colonnes)

    locaux, x, y, accumule = {}, 20, 230, 0
    for c, h in zip(classes, hauteurs):
        if accumule > cible_colonne and x < 20 + 320 * (colonnes - 1):
            x, y, accumule = x + 320, 230, 0
        lignes = [("+ " if ch["requis"] else "- ") + ch["nom"] + " : " + ch["type"]
                  for ch in c["champs"]]
        titre = ("<> " if c.get("embarque") else "") + c["nom"]
        if c["collection"]:
            titre += "  [" + c["collection"] + "]"
        cid = p.id("k")
        locaux[c["nom"]] = cid
        p.boite(cid, titre, lignes, x, y, 290,
                "#ffffff" if c.get("embarque") else couleur[m], bord[m])
        y += h + 36
        accumule += h + 36

    # Rappels des classes externes, dans une colonne a part.
    x_ext = 20 + 320 * colonnes + 40
    y_ext = 230
    for nom in externes:
        cid = p.id("x")
        locaux[nom] = cid
        mod_source = racines.get(nom, "?")
        p.cells.append(
            '<mxCell id="%s" value="%s" style="rounded=0;whiteSpace=wrap;html=1;'
            'fillColor=#f5f5f5;strokeColor=#9e9e9e;dashed=1;fontStyle=2;fontSize=11;'
            'fontColor=#555555;" vertex="1" parent="1">'
            '<mxGeometry x="%d" y="%d" width="230" height="46" as="geometry"/></mxCell>'
            % (cid, esc(nom + "\n(" + LIBELLE_MODULE.get(mod_source, mod_source) + ")"),
               x_ext, y_ext))
        y_ext += 66

    ORTHO = "html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;fontSize=10;"
    for c in classes:
        for ch in c["champs"]:
            cible = ch.get("ref")
            if cible and cible in locaux:
                p.arete(locaux[c["nom"]], locaux[cible], ch["nom"],
                        "endArrow=block;endFill=1;endSize=8;strokeColor=#6a6a6a;" + ORTHO)
            base = ch["type"].replace("[]", "")
            if not cible and base in locaux and base != c["nom"]:
                p.arete(locaux[c["nom"]], locaux[base], ch["nom"],
                        "endArrow=diamondThin;endFill=1;endSize=12;strokeColor=#6a6a6a;" + ORTHO)
    pages.append(p)

# --- 3. Cas d'utilisation global ----------------------------------- #
p = Page("%d. Cas d'utilisation — vue d'ensemble" % (len(pages) + 1))
p.titre("Trésorerie — cas d'utilisation global (acteurs × modules)", 20, 10)
p.note("Acteurs = les 14 rôles du RBAC. Cas d'utilisation = les 18 modules fonctionnels.\n"
       "Un trait n'est tracé que pour un droit d'ÉCRITURE ou de VALIDATION : sans cela\n"
       "tout rôle serait relié à tout module, la lecture étant transversale (*:lire).\n"
       "Le Super Admin détient *, il couvre donc tout : laissé sans trait pour rester lisible.",
       20, 50, 640, 110)
rbac_mods = rbac["modules"]
p.frontiere(p.id("f"), "Trésorerie", 560, 190,
            420, max(len(rbac["roles"]), len(rbac_mods)) * 95 + 100)
id_cas = {}
for k, mod in enumerate(rbac_mods):
    cid = p.id("u")
    id_cas[mod] = cid
    p.cas(cid, rbac["libelles"].get(mod, mod), 640, 230 + k * 95, 260, 60)
id_act = {}
for k, item in enumerate(rbac["roles"].items()):
    code, r = item
    aid = p.id("a")
    id_act[code] = aid
    p.acteur(aid, r["libelle"], 120, 230 + k * 95)
for code, r in rbac["roles"].items():
    if code == "SUPER_ADMIN":
        continue
    for mod in rbac_mods:
        d = droits(r["permissions"], mod)
        if d & {"ecrire", "valider"}:
            p.arete(id_act[code], id_cas[mod],
                    "valide" if d == {"valider"} else "",
                    "endArrow=none;html=1;rounded=0;strokeColor=#999999;")
pages.append(p)

# --- 4. Cas d'utilisation par module ------------------------------- #
for m in mods:
    actions = modele["modules"][m]["actions"]
    if not actions:
        continue
    par_fichier = {}
    for a in actions:
        par_fichier.setdefault(a["fichier"], []).append(a["nom"])
    rmod = RBAC_DE.get(m, m)
    acteurs = [(c, r) for c, r in rbac["roles"].items()
               if droits(r["permissions"], rmod) & {"ecrire", "valider"} and c != "SUPER_ADMIN"]
    lecteurs = [r["libelle"] for c, r in rbac["roles"].items()
                if droits(r["permissions"], rmod) == {"lire"}]

    p = Page("%d. Cas d'usage — %s" % (len(pages) + 1, LIBELLE_MODULE.get(m, m)))
    p.titre("Cas d'utilisation du module « %s »" % LIBELLE_MODULE.get(m, m), 20, 10)
    detail = "\n".join("- %s : %s" % (nom_cas(f), ", ".join(sorted(noms)))
                       for f, noms in sorted(par_fichier.items()))
    p.note("%d opérations serveur, regroupées en %d cas d'utilisation.\n"
           "Un cas d'utilisation est un but, pas une fonction : les opérations réelles\n"
           "d'un même but sont listées dans l'encadré de droite.\n"
           "%s" % (len(actions), len(par_fichier),
                   ("Lecture seule, transversale : " + ", ".join(lecteurs)) if lecteurs else ""),
           20, 50, 640, 110)
    p.frontiere(p.id("f"), LIBELLE_MODULE.get(m, m), 520, 190,
                400, max(len(acteurs), len(par_fichier)) * 90 + 100)
    ids_u = []
    for k, item in enumerate(sorted(par_fichier.items())):
        f, noms = item
        uid = p.id("u")
        ids_u.append(uid)
        p.cas(uid, "%s%s(%d opérations)" % (nom_cas(f), chr(10), len(noms)),
              580, 230 + k * 90, 280, 60, couleur[m], bord[m])
    for k, item in enumerate(acteurs):
        code, r = item
        aid = p.id("a")
        p.acteur(aid, r["libelle"], 120, 230 + k * 90)
        for uid in ids_u:
            p.arete(aid, uid, "", "endArrow=none;html=1;rounded=0;strokeColor=#999999;")
    lignes = detail.count("\n") + 1
    p.note("Opérations par cas d'utilisation\n\n" + detail, 980, 190, 640,
           max(220, 60 + 15 * lignes), "#f9f7ed")
    pages.append(p)

io.open(SORTIE, "w", encoding="utf-8").write(
    '<mxfile host="app.diagrams.net" agent="Tresorerie" type="device">'
    + "".join(pg.xml() for pg in pages) + "</mxfile>")
print("pages :", len(pages))
