/** Warhammer Legends datasheets: the data marks them "Name [Legends]"; we show the plain name and a tag. */
export const isLegends = (name: string) => /\[legends\]/i.test(name);
export const legendsName = (name: string) => name.replace(/\s*\[legends\]\s*/i, ' ').trim();

export function LegendsTag() {
  return (
    <span className="tag legends-tag" title="Warhammer Legends: not for matched play unless your group agrees">
      LEGENDS
    </span>
  );
}
