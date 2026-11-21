/**
 * CSV minimal (RFC 4180) sans dépendance externe — juste assez pour
 * l'export/import des listes de l'application (prospects, cibles, membres…).
 */

export function versCsv(entetes: string[], lignes: (string | number | null | undefined)[][]): string {
  const echapper = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const rangs = [entetes, ...lignes].map((r) => r.map(echapper).join(","));
  return "﻿" + rangs.join("\r\n");
}

export function parserCsv(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, "");
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let dansGuillemets = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
      continue;
    }
    if (c === '"') {
      dansGuillemets = true;
    } else if (c === "," || c === ";") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      champ = "";
      lignes.push(ligne);
      ligne = [];
    } else if (c === "\r") {
      // ignoré, géré par \n
    } else {
      champ += c;
    }
  }
  if (champ.length > 0 || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((c) => c.trim().length > 0));
}

/** Transforme les lignes CSV (avec en-tête) en objets clé→valeur, en-têtes normalisés (minuscule, sans accents). */
export function csvVersObjets(texte: string): Record<string, string>[] {
  const lignes = parserCsv(texte);
  if (lignes.length === 0) return [];
  const normaliser = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const entetes = lignes[0].map(normaliser);
  return lignes.slice(1).map((ligne) => {
    const obj: Record<string, string> = {};
    entetes.forEach((e, i) => (obj[e] = (ligne[i] ?? "").trim()));
    return obj;
  });
}

export function telechargerCsv(nomFichier: string, contenu: string) {
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier.endsWith(".csv") ? nomFichier : `${nomFichier}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
