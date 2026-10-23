// A curated clothing-brand catalogue. Suggestions do not imply a product-feed integration.
// Sources and maintenance notes: docs/brand-suggestions.md.
export const clothingBrands = [
  "& Other Stories",
  "Abercrombie & Fitch",
  "Adidas",
  "Aeropostale",
  "Allen Solly",
  "American Eagle",
  "Armani Exchange",
  "ARKET",
  "ASICS",
  "ASOS",
  "Banana Republic",
  "Benetton",
  "Bershka",
  "Bewakoof",
  "Biba",
  "BOSS",
  "Brooks Brothers",
  "Calvin Klein",
  "Carhartt",
  "Celio",
  "Champion",
  "Cheap Monday",
  "Columbia",
  "Converse",
  "COS",
  "Decathlon",
  "Diesel",
  "Fabindia",
  "Forever 21",
  "GANT",
  "Gap",
  "GU",
  "Gucci",
  "Guess",
  "H&M",
  "Hollister",
  "Jack & Jones",
  "Jockey",
  "Jordan",
  "Kappa",
  "Lacoste",
  "Lee",
  "Levi’s",
  "Louis Philippe",
  "Lululemon",
  "Marks & Spencer",
  "Massimo Dutti",
  "Mango",
  "Monki",
  "Muji",
  "New Balance",
  "New Look",
  "Nike",
  "ONLY",
  "Old Navy",
  "Oysho",
  "Patagonia",
  "Pepe Jeans",
  "Peter England",
  "PLST",
  "Polo Ralph Lauren",
  "Prada",
  "Pull&Bear",
  "Puma",
  "Rare Rabbit",
  "Reebok",
  "Roadster",
  "Skechers",
  "Snitch",
  "Spykar",
  "Stradivarius",
  "Superdry",
  "The North Face",
  "The Souled Store",
  "Theory",
  "Tommy Hilfiger",
  "U.S. Polo Assn.",
  "Under Armour",
  "UNIQLO",
  "Urbanic",
  "Van Heusen",
  "Vans",
  "Vero Moda",
  "Weekday",
  "Westside",
  "Wrangler",
  "Zara",
  "Zudio",
] as const;
const aliases: Record<string, string[]> = {
  "H&M": ["hm", "h and m", "hennes mauritz"],
  "Marks & Spencer": ["m&s", "marks and spencer"],
  "Levi’s": ["levis", "levi's"],
  "U.S. Polo Assn.": ["us polo", "uspolo", "uspa"],
  "Polo Ralph Lauren": ["ralph lauren"],
  "Jack & Jones": ["jack and jones"],
  "Pull&Bear": ["pull and bear"],
  "The North Face": ["north face"],
  "The Souled Store": ["souled store"],
};
function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function suggestBrands(value: string): string[] {
  const query = normalize(value);
  if (!query) return [];
  return clothingBrands
    .map((name) => {
      const terms = [name, ...(aliases[name] || [])].map(normalize);
      const rank = terms.some((t) => t === query)
        ? 0
        : terms.some((t) => t.startsWith(query))
          ? 1
          : terms.some((t) => t.includes(query))
            ? 2
            : 3;
      return { name, rank };
    })
    .filter((b) => b.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 7)
    .map((b) => b.name);
}
