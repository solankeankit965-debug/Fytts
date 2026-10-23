# Clothing brand suggestions

Brand fields in the wardrobe editor and new-product comparison use the same local catalogue (`apps/web/lib/brands.ts`). It contains a curated set of real clothing brands, not an exhaustive directory or a live retailer feed. No queries or user-entered brand names are sent to third parties. Users may keep any custom brand name up to 80 characters.

Matching ignores case, punctuation, accents and apostrophe style. Aliases include HM / H and M, M&S, Levi's, US Polo, and Ralph Lauren. Exact matches rank first, then prefixes, then other substring matches. The dropdown supports arrows, Enter, Escape, Tab, and pointer selection.

Reference sources checked October 22, 2026:

- H&M Group: https://hmgroup.com/brands/
- Fast Retailing: https://www.fastretailing.com/eng/group/

Maintain canonical display names and aliases in the catalogue. Suggestions do not fetch product lists, size charts or brand logos and do not imply endorsement or integration.
