# -*- coding: utf-8 -*-
"""Extrait classes (schemas Mongoose) et cas d'usage (server actions) du depot."""
import io, json, os, re, sys

RACINE = sys.argv[1]
MODULES = os.path.join(RACINE, "src", "modules")


def lire(p):
    return io.open(p, encoding="utf-8").read()


def bloc_apres(texte, i):
    """Rend le litteral objet qui commence a l'accolade a l'index i."""
    assert texte[i] == "{"
    prof, j = 0, i
    while j < len(texte):
        if texte[j] == "{":
            prof += 1
        elif texte[j] == "}":
            prof -= 1
            if prof == 0:
                return texte[i + 1 : j], j
        j += 1
    return "", i


def champs_de(corps):
    """Decoupe les cles de premier niveau d'un litteral objet."""
    champs, prof, courant, dans_chaine, delim = [], 0, "", False, ""
    k = 0
    while k < len(corps):
        c = corps[k]
        if dans_chaine:
            courant += c
            if c == delim and corps[k - 1] != "\\":
                dans_chaine = False
        elif c in "\"'`":
            dans_chaine, delim = True, c
            courant += c
        elif c in "{[(":
            prof += 1
            courant += c
        elif c in "}])":
            prof -= 1
            courant += c
        elif c == "," and prof == 0:
            champs.append(courant)
            courant = ""
        else:
            courant += c
        k += 1
    if courant.strip():
        champs.append(courant)
    return champs


def sans_commentaires(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"//[^\n]*", "", t)
    return t


def type_lisible(definition):
    d = sans_commentaires(definition)
    m = re.search(r"\bref:\s*\"([^\"]+)\"", d)
    ref = m.group(1) if m else None
    tableau = bool(re.search(r"type:\s*\[", d)) or bool(re.match(r"\s*\[", d))
    m = re.search(r"type:\s*\[?\s*([A-Za-z_][A-Za-z0-9_.]*)", d)
    brut = m.group(1) if m else None
    if brut is None:
        m = re.match(r"\s*\[?\s*([A-Za-z_][A-Za-z0-9_.]*)", d)
        brut = m.group(1) if m else "any"
    correspondance = {
        "String": "string",
        "Number": "number",
        "Boolean": "boolean",
        "Date": "Date",
        "Schema.Types.ObjectId": "ObjectId",
        "Schema.Types.Mixed": "any",
    }
    nom = correspondance.get(brut, brut)
    if brut.endswith("Schema"):
        nom = brut[:-6]
    if ref:
        nom = "ObjectId→" + ref
    if tableau:
        nom += "[]"
    requis = bool(re.search(r"required:\s*true", d))
    return nom, ref, requis, tableau


def extraire_schema(texte, nom_schema):
    m = re.search(r"const\s+" + nom_schema + r"\s*=\s*new\s+Schema\s*\(\s*", texte)
    if not m:
        return []
    i = texte.index("{", m.end())
    corps, _ = bloc_apres(texte, i)
    # Les commentaires d'abord : une apostrophe dans « l'offre » ferait croire
    # au decoupeur qu'une chaine commence, et il avalerait les champs suivants.
    corps = sans_commentaires(corps)
    sortie = []
    for champ in champs_de(corps):
        c = sans_commentaires(champ).strip()
        if not c:
            continue
        m2 = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)", c, flags=re.S)
        if not m2:
            continue
        nom, definition = m2.group(1), m2.group(2)
        t, ref, requis, _ = type_lisible(definition)
        sortie.append({"nom": nom, "type": t, "ref": ref, "requis": requis})
    return sortie


resultat = {"modules": {}}
for module in sorted(os.listdir(MODULES)):
    rep_modeles = os.path.join(MODULES, module, "models")
    classes = []
    if os.path.isdir(rep_modeles):
        for f in sorted(os.listdir(rep_modeles)):
            if not f.endswith(".ts") or f == "index.ts" or f.endswith(".test.ts"):
                continue
            texte = lire(os.path.join(rep_modeles, f))
            for m in re.finditer(r"mongoose\.model<[^>]*>\(\s*\"([^\"]+)\"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)", texte):
                nom_classe, nom_schema = m.group(1), m.group(2)
                col = re.search(r"collection:\s*\"([^\"]+)\"", texte)
                classes.append({
                    "nom": nom_classe,
                    "fichier": f,
                    "collection": col.group(1) if col else "",
                    "champs": extraire_schema(texte, nom_schema),
                })
            # sous-schemas embarques, pour la composition
            for m in re.finditer(r"const\s+([A-Za-z_][A-Za-z0-9_]*Schema)\s*=\s*new\s+Schema", texte):
                ns = m.group(1)
                if re.search(r"mongoose\.model<[^>]*>\(\s*\"[^\"]+\"\s*,\s*" + ns + r"\s*\)", texte):
                    continue
                classes.append({
                    "nom": ns[:-6],
                    "fichier": f,
                    "collection": "",
                    "embarque": True,
                    "champs": extraire_schema(texte, ns),
                })

    rep_actions = os.path.join(MODULES, module, "actions")
    actions = []
    if os.path.isdir(rep_actions):
        for f in sorted(os.listdir(rep_actions)):
            if not f.endswith(".ts") or f.endswith(".test.ts"):
                continue
            texte = lire(os.path.join(rep_actions, f))
            for m in re.finditer(r"export\s+async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)", texte):
                actions.append({"nom": m.group(1), "fichier": f})

    if classes or actions:
        resultat["modules"][module] = {"classes": classes, "actions": actions}

io.open(sys.argv[2], "w", encoding="utf-8").write(
    json.dumps(resultat, ensure_ascii=False, indent=1)
)
print("modules :", len(resultat["modules"]))
print("classes :", sum(len(m["classes"]) for m in resultat["modules"].values()))
print("actions :", sum(len(m["actions"]) for m in resultat["modules"].values()))
