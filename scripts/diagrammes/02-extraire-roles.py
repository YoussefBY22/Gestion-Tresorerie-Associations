# -*- coding: utf-8 -*-
"""Extrait roles, permissions et libelles de modules depuis rbac.ts."""
import io, json, re, sys

s = io.open(sys.argv[1], encoding="utf-8").read()

modules = re.findall(r'\n  "([a-z]+)",', s[s.index("export const MODULES"):s.index("export type ModuleCode")])
libelles = dict(re.findall(r'\n  ([a-z]+): "([^"]+)"', s[s.index("LIBELLES_MODULE"):s.index("export const ACTIONS")]))

roles = {}
bloc = s[s.index("export const ROLES"):]
for m in re.finditer(r'\n  ([A-Z_]+): \{\n    libelle: "([^"]+)",(.*?)\n  \},', bloc, flags=re.S):
    code, libelle, corps = m.group(1), m.group(2), m.group(3)
    perms = re.findall(r'"([^"]+)"', corps[corps.index("permissions"):]) if "permissions" in corps else []
    desc = re.search(r'description:\s*\n?\s*"([^"]+)"', corps)
    roles[code] = {
        "libelle": libelle,
        "description": desc.group(1) if desc else "",
        "permissions": perms,
    }

io.open(sys.argv[2], "w", encoding="utf-8").write(
    json.dumps({"modules": modules, "libelles": libelles, "roles": roles}, ensure_ascii=False, indent=1)
)
print("modules:", len(modules), "roles:", len(roles))
